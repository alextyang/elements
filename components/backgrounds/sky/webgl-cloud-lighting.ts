/**
 * Direct celestial transport for the WebGL cloud volume.
 *
 * This is the same spherical medium and parameterization as the physical sky.
 * The lookup stores optical depth, independently of Sun/Moon radiometry and
 * direction, so clock/camera changes do not repeat the CPU integration. All
 * incoming light is top-of-atmosphere irradiance in the existing scene units;
 * this module supplies a dimensionless RGB transfer coefficient exactly once.
 */
import {
    atmosphereOpticalDepthBetween,
    atmosphereTransmittanceLutParameters,
    atmosphereTransmittanceLutUv,
    physicalAtmosphereOpticalKey,
    type AtmosphereVec3,
    type PhysicalAtmosphereState,
} from "./physical-atmosphere.ts";

export const WEBGL_CLOUD_TRANSMITTANCE_LAYOUT = Object.freeze({
    width: 128,
    height: 64,
    integrationSamples: 256,
});

export interface WebGlCloudTransmittanceLut {
    width: number;
    height: number;
    /** RGBA32F optical depth; RGB are dimensionless and alpha is unused. */
    opticalDepth: Float32Array;
}

/** Original midpoint integration uses the shared physical medium verbatim. */
export const buildWebGlCloudTransmittanceLut = (
    state: PhysicalAtmosphereState,
): WebGlCloudTransmittanceLut => {
    const { width, height, integrationSamples } =
        WEBGL_CLOUD_TRANSMITTANCE_LAYOUT;
    const opticalDepth = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const { radiusKm, zenithCosine } =
                atmosphereTransmittanceLutParameters(
                    state, [x / (width - 1), y / (height - 1)],
                );
            const distanceKm = Math.max(0, -radiusKm * zenithCosine +
                Math.sqrt(Math.max(0, state.topRadiusKm ** 2 -
                    radiusKm ** 2 * (1 - zenithCosine ** 2))));
            const tangent = Math.sqrt(Math.max(0, 1 - zenithCosine ** 2));
            // Every lookup ray is in the non-ground-intersecting hemisphere.
            // Integrating the segment directly preserves the limiting tangent
            // value. Baking a zero-transmission shadow into the last column
            // would smear Earth's hard visibility boundary into nearby rays.
            const depth = atmosphereOpticalDepthBetween(
                state,
                [0, 0, radiusKm],
                [tangent * distanceKm, 0,
                    radiusKm + zenithCosine * distanceKm],
                integrationSamples,
            );
            opticalDepth.set(depth, (y * width + x) * 4);
        }
    }
    return { width, height, opticalDepth };
};

/** CPU mirror of shader lookup, including exact spherical Earth visibility. */
export const sampleWebGlCloudTransmittance = (
    state: PhysicalAtmosphereState,
    lut: WebGlCloudTransmittanceLut,
    altitudeKm: number,
    zenithCosine: number,
): AtmosphereVec3 => {
    const radius = state.bottomRadiusKm + Math.max(0, altitudeKm);
    const mu = Math.max(-1, Math.min(1, zenithCosine));
    const horizonCosine = -Math.sqrt(Math.max(0,
        (radius - state.bottomRadiusKm) *
        (radius + state.bottomRadiusKm))) / radius;
    if (mu < 0 && mu <= horizonCosine) return [0, 0, 0];
    const uv = atmosphereTransmittanceLutUv(state, radius, mu);
    const x = uv[0] * (lut.width - 1);
    const y = uv[1] * (lut.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, lut.width - 1);
    const y1 = Math.min(y0 + 1, lut.height - 1);
    const fx = x - x0;
    const fy = y - y0;
    const channelTransmittance = (channel: number) => {
        const at = (ix: number, iy: number) =>
            lut.opticalDepth[(iy * lut.width + ix) * 4 + channel];
        const low = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
        const high = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
        return Math.exp(-(low * (1 - fy) + high * fy));
    };
    return [channelTransmittance(0), channelTransmittance(1),
        channelTransmittance(2)];
};

/**
 * The WebGL palette renderer has no physical sky adaptation pass. Retain its
 * existing full-Moon-relative scene units (0.95 at full Moon in darkness),
 * while taking phase/distance from unattenuated photometry. Observer T and
 * lunar horizon visibility must never enter this source; the lookup supplies
 * both at the actual cloud point. Physical WebGPU irradiance stays unchanged.
 */
export const webGlCloudMoonSourceIrradiance = (
    relativeLunarIrradiance: number,
    solarAltitudeDegrees: number,
    moonVisibility: number,
): [number, number, number] => {
    const darkness = Math.max(0, Math.min(1,
        (-solarAltitudeDegrees + 1) / 11));
    const strength = 0.95 * Math.max(0, relativeLunarIrradiance) * darkness *
        Math.max(0, Math.min(2, moonVisibility));
    return [strength, strength, strength];
};

export const CLOUD_LIGHTING_UNIFORMS = `
uniform sampler2D u_cloud_atmosphere_depth;
uniform vec3 u_cloud_atmosphere; // physical bottom/top radius (km), enabled
`;

export const CLOUD_LIGHTING_FUNCTIONS = `
// The cloud geometry uses metres and its own planet radius. Preserve its true
// altitude while evaluating the exact shared physical atmosphere in km.
vec3 cloud_source_transmittance(
    vec3 point_meters,
    vec3 source_direction,
    float cloud_planet_radius_meters
) {
    if (u_cloud_atmosphere.z < 0.5) return vec3(1.0);
    float point_radius_meters = max(length(point_meters), 1.0);
    float bottom = u_cloud_atmosphere.x;
    float top = u_cloud_atmosphere.y;
    float radius = bottom + max(0.0,
        (point_radius_meters - cloud_planet_radius_meters) * 0.001);
    float mu = clamp(dot(point_meters / point_radius_meters,
        normalize(source_direction)), -1.0, 1.0);
    float rho = sqrt(max(0.0, (radius - bottom) * (radius + bottom)));
    // Visibility is analytic at the sample's spherical horizon. It is neither
    // an observer-altitude gate nor interpolated from zero-valued LUT texels.
    if (mu < 0.0 && mu <= -rho / radius) return vec3(0.0);
    radius = min(radius, top);
    rho = sqrt(max(0.0, (radius - bottom) * (radius + bottom)));
    float H = sqrt(max(0.0, (top - bottom) * (top + bottom)));
    float distance_to_top = max(0.0, -radius * mu + sqrt(max(0.0,
        (top - radius) * (top + radius) + radius * radius * mu * mu)));
    float minimum_distance = top - radius;
    vec2 uv = clamp(vec2(
        (distance_to_top - minimum_distance) /
            max(rho + H - minimum_distance, 0.000001),
        rho / max(H, 0.000001)
    ), 0.0, 1.0);
    // Manual bilinear interpolation works on baseline WebGL2 RGBA32F without
    // OES_texture_float_linear, in both live and floating-point plate passes.
    ivec2 last = textureSize(u_cloud_atmosphere_depth, 0) - ivec2(1);
    vec2 texel = uv * vec2(last);
    ivec2 low = ivec2(floor(texel));
    ivec2 high = min(low + ivec2(1), last);
    vec2 f = fract(texel);
    vec3 a = texelFetch(u_cloud_atmosphere_depth, low, 0).rgb;
    vec3 b = texelFetch(u_cloud_atmosphere_depth,
        ivec2(high.x, low.y), 0).rgb;
    vec3 c = texelFetch(u_cloud_atmosphere_depth,
        ivec2(low.x, high.y), 0).rgb;
    vec3 d = texelFetch(u_cloud_atmosphere_depth, high, 0).rgb;
    return exp(-mix(mix(a, b, f.x), mix(c, d, f.x), f.y));
}
`;

/** One retained texture; rebuild only when the shared optical state changes. */
export const createWebGlCloudLighting = (
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    textureUnit = 4,
) => {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate cloud atmosphere lookup");
    const samplerUniform = gl.getUniformLocation(program, "u_cloud_atmosphere_depth");
    const atmosphereUniform = gl.getUniformLocation(program, "u_cloud_atmosphere");
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0,
        gl.RGBA, gl.FLOAT, new Float32Array(4));
    let opticalKey: string | undefined;
    return {
        updateAndBind(state: PhysicalAtmosphereState | undefined) {
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            if (state) {
                const key = physicalAtmosphereOpticalKey(state);
                if (key !== opticalKey) {
                    const lut = buildWebGlCloudTransmittanceLut(state);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F,
                        lut.width, lut.height, 0, gl.RGBA, gl.FLOAT,
                        lut.opticalDepth);
                    opticalKey = key;
                }
            }
            gl.uniform1i(samplerUniform, textureUnit);
            gl.uniform3f(atmosphereUniform,
                state?.bottomRadiusKm ?? 0, state?.topRadiusKm ?? 0,
                state ? 1 : 0);
        },
        dispose() {
            gl.deleteTexture(texture);
        },
    };
};

/**
 * Volumetric cloud raymarching module.
 *
 * This GLSL is injected into the atmosphere fragment shader after its utility
 * functions, so it reuses `saturate`, `smoother`, `hash21` and
 * `henyey_greenstein` from the host program rather than redefining them.
 *
 * The density function, altitude shaping, Worley erosion, edge sharpening,
 * phase functions, powder term and the eight-octave multiple-scattering loop
 * are ported from Photon Shaders by Benjamin Stott ("SixthSurge"), whose
 * license permits redistribution of portions provided the license document
 * accompanies them. See PHOTON-LICENSE.txt in this directory.
 *
 * https://github.com/sixthsurge/photon
 *
 * Adaptations for Elements:
 * - Sampling is rebased to the planet surface. Photon works in Minecraft world
 *   coordinates; here positions are relative to the planet centre and a raw
 *   radius destroys sampler precision.
 * - Wind advection is wrapped on the CPU for the same reason.
 * - Photon's two volumetric layers plus planar cirrus are generalised into
 *   three parameterised layers covering all ten WMO genera, with convective
 *   tower, anvil, ice-fraction and precipitation terms added to the shaping.
 *
 * Photon in turn builds on the published lineage:
 * - Schneider & Vos, "The Real-time Volumetric Cloudscapes of Horizon Zero Dawn"
 * - Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"
 */

import { CLOUD_GENUS_LEVEL, type CloudScene } from "./cloud-scene";

export interface PackedCloudLayers {
    geometry: Float32Array;
    shape: Float32Array;
    motion: Float32Array;
    phase: Float32Array;
    scale: Float32Array;
    drift: Float32Array;
    /** True when at least one layer contributes. */
    active: boolean;
}

/**
 * Packs a `CloudScene` into the flat vec4 arrays the shader expects.
 *
 * Noise scale is derived per layer rather than fixed: convective cells are
 * roughly as wide as the layer is deep, whereas cirrus filaments span tens of
 * kilometres. Using one scale for both is what makes procedural skies read as
 * a single repeating texture.
 */
export function packCloudLayers(
    scene: CloudScene,
    timeSeconds: number,
): PackedCloudLayers {
    const geometry = new Float32Array(12);
    const shape = new Float32Array(12);
    const motion = new Float32Array(12);
    const phase = new Float32Array(12);
    const scale = new Float32Array(12);
    const drift = new Float32Array(12);
    let active = false;

    scene.layers.forEach((layer, index) => {
        const offset = index * 4;
        const present = layer.present && layer.coverage > 0.001;
        if (present) active = true;

        // Coverage is a range, not a scalar: the low-frequency weather noise
        // picks a value within it, so a single scene holds both denser and
        // thinner regions rather than one uniform amount of sky cover.
        const coverage = present ? layer.coverage : 0;
        geometry[offset] = layer.baseAltitude;
        geometry[offset + 1] = Math.max(1, layer.thickness);
        geometry[offset + 2] = Math.max(0, Math.min(1, coverage - 0.02));
        geometry[offset + 3] = layer.opticalDepth;

        shape[offset] = layer.stratusBlend;
        shape[offset + 1] = layer.towerAmount;
        shape[offset + 2] = layer.anvilAmount;
        shape[offset + 3] = layer.detailStrength;

        motion[offset] = Math.cos(layer.windDirection) * layer.windSpeed;
        motion[offset + 1] = Math.sin(layer.windDirection) * layer.windSpeed;
        motion[offset + 2] = layer.shear;
        motion[offset + 3] = layer.turbulence;

        phase[offset] = layer.iceFraction;
        phase[offset + 1] = layer.precipitation;
        phase[offset + 2] = present ? 1 : 0;
        phase[offset + 3] = Math.max(0, Math.min(1, coverage + 0.16));

        const level = CLOUD_GENUS_LEVEL[layer.genus];

        // Feature size. Photon erodes cumulus with Worley at roughly 1.1 km and
        // 200 m periods; middle and high cloud carry proportionally larger
        // structure, so the same functions serve every genus.
        const sizeFactor = level === "high" ? 3.2 : level === "middle" ? 1.7 : 1;
        const basePeriod = 1200 * sizeFactor;
        const detailPeriod = 200 * sizeFactor;

        // Ice cloud is drawn out along the shear vector into fibres; water
        // cloud stays close to isotropic.
        const stretch = layer.genus === "cirrus" || layer.genus === "cirrostratus"
            ? 0.78
            : layer.genus === "cirrocumulus"
                ? 0.34
                : layer.genus === "altostratus"
                    ? 0.22
                    : 0;

        scale[offset] = 1 / basePeriod;
        scale[offset + 1] = 1 / detailPeriod;
        scale[offset + 2] = stretch;
        scale[offset + 3] = layer.turbulence * 0.8;

        // Wind advection, wrapped here rather than in the shader.
        //
        // A Unix timestamp times a wind speed is on the order of 1e10 metres.
        // Passing that to the shader would push every texture coordinate into
        // the hundreds of thousands, where a float32 sampler has no fractional
        // precision left, and the volumes would return a near-constant value.
        //
        // The wrap period is the coarsest coverage period. Every other period
        // divides it exactly — detail 200, base 1200, coverage 36 000 and
        // 504 000, all times the size factor — so the wrap is invisible in all
        // four lookups because each texture tiles. JavaScript numbers are
        // doubles, so the modulo itself stays exact.
        const period = basePeriod * 420;
        const wrap = (value: number) => ((value % period) + period) % period;
        drift[offset] = wrap(motion[offset] * timeSeconds);
        drift[offset + 1] = wrap(motion[offset + 1] * timeSeconds);
    });

    return { geometry, shape, motion, phase, scale, drift, active };
}

export const CLOUD_UNIFORMS = `
// GLSL ES 3.00 predeclares a default precision for sampler2D and samplerCube
// but not for sampler3D, so the 3D volumes must be qualified explicitly or the
// fragment shader fails to compile.
precision highp sampler3D;

uniform sampler3D u_cloud_base;
uniform sampler3D u_cloud_detail;
uniform sampler2D u_cloud_weather;
uniform sampler2D u_cloud_curl;

// Per layer, ordered low, middle, high.
uniform vec4 u_layer_geometry[3];  // baseAltitude, thickness, coverage, opticalDepth
uniform vec4 u_layer_shape[3];     // stratusBlend, towerAmount, anvilAmount, detailStrength
uniform vec4 u_layer_motion[3];    // windX, windZ, shear, turbulence
uniform vec4 u_layer_phase[3];     // iceFraction, precipitation, present, unused
uniform vec4 u_layer_scale[3];     // baseScale, detailScale, windStretch, curlStrength
uniform vec4 u_layer_drift[3];     // driftX, driftZ, unused, unused

uniform vec3 u_cloud_sun_radiance;
uniform vec3 u_cloud_moon_radiance;
uniform vec3 u_cloud_ambient;
uniform vec3 u_cloud_ground_light;
uniform vec4 u_cloud_quality;      // viewSteps, lightSteps, aerialScale, enabled
uniform float u_cloud_time;
uniform float u_cloud_fog;
uniform float u_cloud_noctilucent;
`;

export const CLOUD_FUNCTIONS = `
const float PLANET_RADIUS = 6371000.0;
const float CLOUD_MAX_DISTANCE = 140000.0;
const float ISOTROPIC_PHASE = 0.25 / PI;

// ---- Photon helpers, ported verbatim ----

float sqr(float x) { return x * x; }
float max0(float x) { return max(x, 0.0); }
float pow1d5(float x) { return x * sqrt(x); }

float linear_step(float edge0, float edge1, float x) {
    return saturate((x - edge0) / (edge1 - edge0));
}

/** Shapes a 0-1 signal similarly to sqrt() without the transcendental. */
float dampen(float x) {
    x = saturate(x);
    return x * (2.0 - x);
}

/**
 * Shapes a signal like pow(), where amount = 0 is identity, amount < 0 raises
 * contrast and amount > 0 lowers it. Used for cloud edge sharpening.
 */
float lift(float x, float amount) {
    return (x + x * amount) / (1.0 + x * amount);
}

float cubic_smooth(float x) { return sqr(x) * (3.0 - 2.0 * x); }

float hg_phase(float nu, float g) {
    float gg = g * g;
    return (ISOTROPIC_PHASE - ISOTROPIC_PHASE * gg) /
        pow1d5(max(1e-4, 1.0 + gg - 2.0 * g * nu));
}

/** Closer to a real aerosol phase function than Henyey-Greenstein. */
float klein_nishina_phase(float nu, float e) {
    return e / (2.0 * PI * (e - e * nu + 1.0) * log(2.0 * e + 1.0));
}

/**
 * Single-scattering phase. The forward lobe takes the maximum of a very sharp
 * Klein-Nishina term, which supplies the tight glow close to the Sun, and a
 * broad Henyey-Greenstein lobe. Photon notes the max() is not physical but
 * reads well, and the result is the silver lining on a backlit cloud edge.
 */
float clouds_phase_single(float cos_theta) {
    float forwards_a = klein_nishina_phase(cos_theta, 2600.0);
    float forwards_b = hg_phase(cos_theta, 0.8);
    return 0.8 * max(forwards_a, forwards_b) +
        0.2 * hg_phase(cos_theta, -0.2);
}

/** Multiple-scattering phase: forward lobe, forward peak, backward lobe. */
float clouds_phase_multi(float cos_theta, vec3 g) {
    return 0.65 * hg_phase(cos_theta, g.x) +
        0.10 * hg_phase(cos_theta, g.y) +
        0.25 * hg_phase(cos_theta, -g.z);
}

float clouds_powder_effect(float density, float cos_theta) {
    float powder = PI * density / (density + 0.15);
    powder = mix(powder, 1.0, 0.8 * sqr(cos_theta * 0.5 + 0.5));
    return powder;
}

// ---- Layer description ----

struct CloudLayer {
    float baseAltitude;
    float thickness;
    float coverageLow;
    float coverageHigh;
    float stratusBlend;
    float towerAmount;
    float anvilAmount;
    float detailStrength;
    vec2 wind;
    float shear;
    float turbulence;
    float iceFraction;
    float precipitation;
    float present;
    float baseScale;
    float detailScale;
    float windStretch;
    float curlStrength;
    vec2 drift;
    float extinction;
};

struct CloudResult {
    vec3 scattering;
    float transmittance;
    float distance;
};

/** Returns (near, far) parametric hits, or (-1, -1) when the ray misses. */
vec2 cloud_ray_sphere(vec3 origin, vec3 direction, float radius) {
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float discriminant = b * b - c;
    if (discriminant < 0.0) return vec2(-1.0, -1.0);
    float root = sqrt(discriminant);
    return vec2(-b - root, -b + root);
}

/**
 * Interleaved gradient noise, a pure function of the pixel coordinate. Being
 * fixed in physical pixels it cannot shimmer between frames, so the march needs
 * no temporal history to stay stable.
 */
float cloud_dither(vec2 coordinate) {
    return fract(52.9829189 *
        fract(dot(coordinate, vec2(0.06711056, 0.00583715))));
}

/**
 * Vertical shaping, following Photon's cumulus altitude shaping and extended
 * with convective tower and anvil terms so the same function serves all ten
 * genera. altitude_fraction is 0 at cloud base and 1 at cloud top.
 */
float cloud_altitude_shaping(
    float density,
    float altitude_fraction,
    CloudLayer layer
) {
    // Stratiform shaping: a slab with soft faces.
    if (layer.stratusBlend > 0.001) {
        density = mix(
            density,
            saturate(density * dampen(
                saturate(2.0 * altitude_fraction) *
                linear_step(0.0, 0.1, altitude_fraction) *
                linear_step(0.0, 0.6, 1.0 - altitude_fraction)
            )),
            layer.stratusBlend
        );
    }

    // Carve the egg shape that gives cumulus its rounded top and narrow base.
    density -= smoothstep(0.2, 1.0, altitude_fraction) *
        (0.6 - 0.3 * layer.stratusBlend) * (1.0 - layer.towerAmount * 0.75);

    // Convective towers hold density much higher up before cutting off.
    density += layer.towerAmount * 0.28 *
        linear_step(0.1, 0.5, altitude_fraction) *
        (1.0 - linear_step(0.85, 1.0, altitude_fraction));

    // The anvil is ice spreading along the tropopause once the tower can rise
    // no further, so it flares outward and then stops abruptly.
    density += layer.anvilAmount * 0.5 *
        linear_step(0.55, 0.78, altitude_fraction) *
        (1.0 - linear_step(0.88, 1.0, altitude_fraction));

    // Reduce density at the base of the cloud.
    density *= smoothstep(0.0, 0.2, altitude_fraction);

    return density;
}

/**
 * Local coverage from the weather field.
 *
 * Photon samples two very low frequencies here: coverage varies over hundreds
 * of kilometres and shape over tens. The kilometre-scale structure that reads
 * as individual clouds does not come from this function at all, it comes from
 * the Worley erosion in cloud_density. Trying to get cell structure from the
 * coverage map instead produces large smooth blobs.
 */
float cloud_local_coverage(vec3 position3, CloudLayer layer) {
    vec2 position = position3.xz;
    // Coverage frequencies, raised from Photon's 500 km / 37 km.
    //
    // Those values suit a first-person game view. Elements renders the whole
    // dome, and near the zenith a ray covers almost no horizontal distance, so
    // a 500 km period leaves the entire zenith inside a single texel and the
    // deck resolves into one uniform slab with a hard arc at its edge. At 72 km
    // At 168 km and 42 km the field still reads as weather systems rather than
    // individual clouds, but it varies across the top of the sky. Pushing the
    // shape term much finer than this is worse than the band: coverage then
    // varies faster along a ray than the layer is deep, and the deck fragments
    // into vertical columns.
    //
    // Both remain integer divisors of the 420x drift wrap period, which is what
    // lets one CPU-wrapped drift value serve every texture without a seam.
    vec2 p1 = position * (layer.baseScale / 140.0);
    vec2 p2 = position * (layer.baseScale / 35.0);
    vec2 noise = vec2(
        texture(u_cloud_weather, p1).x,
        texture(u_cloud_weather, p2).w
    );

    // Three-dimensional cell structure.
    //
    // The two lookups above are purely horizontal, and near the zenith a ray
    // covers almost no horizontal distance: every sample along it reads the
    // same texel, so the whole zenith takes one coverage value and resolves
    // into a solid slab. Erosion cannot rescue it either, because the detail
    // subtraction is scaled by dampen(1 - density) and so approaches zero
    // exactly where coverage is high.
    //
    // Sampling the base volume supplies a genuinely 3D cell field, which varies
    // both across neighbouring rays and as a single ray climbs through the
    // layer. This is the role the 3D base volume plays in the Horizon/Nubis
    // formulation; Photon can lean harder on its 2D map because a first-person
    // camera never looks straight up through the deck.
    float cells = texture(
        u_cloud_base,
        position3 * (layer.baseScale * 0.25)
    ).r;
    noise.y = noise.y * 0.62 + cells * 0.38;

    float coverage_cu = 0.0;
    float coverage_st = 0.0;

    if (layer.stratusBlend < 0.999) {
        coverage_cu = mix(layer.coverageLow, layer.coverageHigh, noise.x);
        coverage_cu = linear_step(1.0 - coverage_cu, 1.0, noise.y);
    }

    if (layer.stratusBlend > 0.001) {
        coverage_st = cubic_smooth(linear_step(
            0.9 - layer.coverageLow,
            1.0,
            2.0 * noise.x * layer.coverageHigh
        ));
        coverage_st = 0.5 * coverage_st +
            1.0 * coverage_st * linear_step(0.3, 0.6, noise.y);
        coverage_st = coverage_st / (coverage_st + 1.0);
    }

    return mix(coverage_cu, coverage_st, layer.stratusBlend);
}

/**
 * Density at a world position inside a layer.
 *
 * Positions arrive relative to the planet centre, with y near 6,372,000 m.
 * Everything here works relative to the surface instead: scaling an absolute
 * radius for a volume that tiles every kilometre gives texture coordinates in
 * the thousands, where a float32 sampler has no fractional precision left and
 * the volume returns a near-constant value.
 */
float cloud_density(vec3 position, CloudLayer layer, float altitude_fraction) {
    vec3 sample_position =
        vec3(position.x, position.y - PLANET_RADIUS, position.z);

    // Bulk advection is pre-wrapped on the CPU into the tile period; only the
    // small shear offset, which tilts the layer downwind with height, is added
    // here.
    vec2 drift = layer.drift +
        layer.wind * layer.shear * altitude_fraction * 90.0;
    sample_position.xz += drift;

    // Wind-stretching turns isotropic noise into the shear-aligned fibres of
    // cirrus without needing a separate density function per genus.
    if (layer.windStretch > 0.001) {
        vec2 axis = normalize(layer.wind + vec2(1e-4, 1e-4));
        vec2 across = vec2(-axis.y, axis.x);
        float along_wind = dot(sample_position.xz, axis);
        float across_wind = dot(sample_position.xz, across);
        sample_position.xz =
            axis * (along_wind * (1.0 - layer.windStretch * 0.86)) +
            across * across_wind;
    }

    float density = cloud_local_coverage(sample_position, layer);
    density = cloud_altitude_shaping(density, altitude_fraction, layer);
    if (density < 1e-4) return 0.0;

    // Worley erosion. This is where cloud-scale structure is created: the two
    // frequencies carve the coverage field into billows and then into wisps.
    float worley_0 = texture(
        u_cloud_base,
        sample_position * layer.baseScale
    ).g;
    float worley_1 = texture(
        u_cloud_detail,
        sample_position * layer.detailScale
    ).r;

    // Curl deformation, concentrated near edges where turbulent mixing acts.
    if (layer.curlStrength > 0.001) {
        vec2 curl = texture(
            u_cloud_curl,
            sample_position.xz * layer.baseScale * 0.35
        ).xy * 2.0 - 1.0;
        worley_1 = mix(
            worley_1,
            texture(
                u_cloud_detail,
                (sample_position + vec3(curl.x, 0.0, curl.y) * 120.0) *
                    layer.detailScale
            ).r,
            layer.curlStrength * 0.6
        );
    }

    float detail_fade =
        0.20 * smoothstep(0.85, 1.0, 1.0 - altitude_fraction) -
        0.35 * smoothstep(0.05, 0.5, altitude_fraction) + 0.6;

    vec2 detail_weights = mix(
        vec2(0.33, 0.40),
        vec2(0.07, 0.10),
        vec2(sqr(layer.stratusBlend), layer.stratusBlend)
    ) * layer.detailStrength;

    density -= detail_weights.x * sqr(worley_0) * dampen(saturate(1.0 - density));
    density -= detail_weights.y * sqr(worley_1) * dampen(saturate(1.0 - density)) *
        detail_fade;

    // Wispy at the bottom, hard-edged at the top.
    density = max0(density);
    vec2 edge_sharpening = mix(
        vec2(3.0, 12.0),
        vec2(2.0, 7.0),
        vec2(sqr(layer.stratusBlend))
    );
    density = lift(density, mix(edge_sharpening.x, edge_sharpening.y, altitude_fraction));
    density *= 0.1 + 0.9 * smoothstep(0.2, 0.7, altitude_fraction);

    return density;
}

/** Optical depth from a sample toward a light source, with growing steps. */
float cloud_optical_depth(
    vec3 ray_origin,
    vec3 ray_direction,
    CloudLayer layer,
    float base_radius,
    float top_radius,
    float dither,
    int step_count
) {
    const float step_growth = 2.0;
    float step_length = 0.1 * layer.thickness / float(max(step_count, 1));

    vec3 ray_position = ray_origin;
    vec3 step_vector = ray_direction * step_length;
    float optical_depth = 0.0;

    for (int i = 0; i < 8; i++) {
        if (i >= step_count) break;
        step_vector *= step_growth;
        step_length *= step_growth;
        vec3 point = ray_position + step_vector * dither;
        float radius = length(point);
        float altitude_fraction =
            (radius - base_radius) / max(1.0, top_radius - base_radius);
        if (altitude_fraction >= 0.0 && altitude_fraction <= 1.0) {
            optical_depth +=
                cloud_density(point, layer, altitude_fraction) * step_length;
        }
        ray_position += step_vector;
    }

    return optical_depth;
}

/**
 * Multiple-scattering approximation, following Photon's octave loop.
 *
 * Each octave scatters less, extinguishes less and is more isotropic than the
 * last. This is what lets light bleed into an optically thick interior instead
 * of leaving it uniformly black, and it is why a cumulus tower reads as a solid
 * lit body rather than a silhouette.
 */
vec3 cloud_scattering(
    CloudLayer layer,
    float density,
    float light_optical_depth,
    float sky_optical_depth,
    float ground_optical_depth,
    float step_transmittance,
    float cos_theta,
    vec3 light_radiance,
    vec3 sky_radiance,
    vec3 ground_radiance
) {
    vec3 scattering = vec3(0.0);

    float scatter_amount = layer.extinction;
    float extinct_amount = layer.extinction;

    float scattering_integral_times_density =
        (1.0 - step_transmittance) / layer.extinction;

    float powder_effect = clouds_powder_effect(
        density + density * layer.stratusBlend,
        cos_theta
    );
    float scattering_falloff = 0.55 * mix(
        lift(saturate(layer.extinction / 0.1), 0.33),
        1.0,
        cos_theta * 0.5 + 0.5
    );

    float phase = clouds_phase_single(cos_theta);
    vec3 phase_g = pow(vec3(0.6, 0.9, 0.3), vec3(1.0 + light_optical_depth));

    for (int i = 0; i < 8; i++) {
        scattering += light_radiance * scatter_amount *
            exp(-extinct_amount * light_optical_depth) * phase;
        scattering += ground_radiance * scatter_amount *
            exp(-extinct_amount * ground_optical_depth) * ISOTROPIC_PHASE;
        scattering += sky_radiance * scatter_amount *
            exp(-extinct_amount * sky_optical_depth) * ISOTROPIC_PHASE;

        scatter_amount *= scattering_falloff * powder_effect;
        extinct_amount *= 0.4;
        phase_g *= 0.8;

        powder_effect = mix(powder_effect, sqrt(powder_effect), 0.5);
        phase = clouds_phase_multi(cos_theta, phase_g);
    }

    return scattering * scattering_integral_times_density;
}

/** Marches one spherical cloud shell. */
CloudResult cloud_march_layer(
    CloudLayer layer,
    vec3 origin,
    vec3 direction,
    vec3 sun_direction,
    vec3 moon_direction,
    float sun_cosine,
    float moon_cosine,
    float dither
) {
    CloudResult result = CloudResult(vec3(0.0), 1.0, CLOUD_MAX_DISTANCE);
    if (layer.present < 0.5) return result;

    float base_radius = PLANET_RADIUS + layer.baseAltitude;
    float top_radius = base_radius + layer.thickness;

    // The planet occludes any shell hit beyond the horizon.
    vec2 planet = cloud_ray_sphere(origin, direction, PLANET_RADIUS);
    if (planet.x > 0.0) return result;

    vec2 inner = cloud_ray_sphere(origin, direction, base_radius);
    vec2 outer = cloud_ray_sphere(origin, direction, top_radius);
    if (outer.y < 0.0) return result;

    float near = inner.y > 0.0 ? inner.y : max(0.0, outer.x);
    float far = min(outer.y, CLOUD_MAX_DISTANCE);
    if (far <= near) return result;

    // More steps toward the horizon, where the ray crosses far more cloud.
    int steps = int(mix(
        u_cloud_quality.x,
        u_cloud_quality.x * 0.5,
        abs(direction.y)
    ));
    steps = clamp(steps, 8, 64);
    int light_steps = int(u_cloud_quality.y);

    float span = far - near;

    // Cap the step against layer depth.
    //
    // The per-pixel dither offsets each ray by up to one full step, which is
    // what prevents banding. Where a step is large that offset becomes a large
    // depth difference between neighbouring pixels, and the march resolves into
    // visible crosshatch. Near the horizon an uncapped span/steps reaches well
    // over a kilometre through a layer only a few hundred metres deep, which is
    // exactly where the artifact is worst. Capping keeps the near field
    // properly sampled; rays that then run out of steps are truncated far away,
    // where aerial perspective has already removed most of the contrast.
    float step_length = min(span / float(steps), layer.thickness * 0.16);
    float travelled = near + step_length * dither;

    float first_hit = -1.0;
    float weighted_distance = 0.0;
    float weight_sum = 0.0;

    // Sun and Moon share one transport path; whichever is up dominates.
    bool moon_dominant = dot(u_cloud_moon_radiance, vec3(1.0)) >
        dot(u_cloud_sun_radiance, vec3(1.0));
    vec3 light_direction = moon_dominant ? moon_direction : sun_direction;
    vec3 light_radiance = moon_dominant
        ? u_cloud_moon_radiance
        : u_cloud_sun_radiance;
    float cos_theta = moon_dominant ? moon_cosine : sun_cosine;

    for (int index = 0; index < 64; index++) {
        if (index >= steps) break;
        if (result.transmittance < 0.005) break;

        vec3 point = origin + direction * travelled;
        float radius = length(point);
        float altitude_fraction =
            (radius - base_radius) / max(1.0, top_radius - base_radius);

        if (altitude_fraction < 0.0 || altitude_fraction > 1.0) {
            travelled += step_length;
            continue;
        }

        float density = cloud_density(point, layer, altitude_fraction);
        if (density < 1e-4) {
            travelled += step_length;
            continue;
        }

        if (first_hit < 0.0) first_hit = travelled;
        weighted_distance += travelled * density;
        weight_sum += density;

        float step_optical_depth = density * layer.extinction * step_length;
        float step_transmittance = exp(-step_optical_depth);

        // The light marches use a fixed offset, not the per-pixel dither.
        //
        // Jittering the view march is necessary: without it the march bands in
        // depth. Jittering the light march is a different matter, because it
        // makes the shading of a given point in space depend on which pixel is
        // looking at it, and with only a handful of geometric steps that lands
        // as heavy per-pixel crosshatch across smooth surfaces like an overcast
        // base. Photon absorbs this in temporal upscaling; with a single-shot
        // pass the deterministic offset is far cleaner, and the slight banding
        // it trades for is invisible because lighting varies smoothly.
        const float LIGHT_OFFSET = 0.5;
        float light_depth = cloud_optical_depth(
            point, light_direction, layer, base_radius, top_radius,
            LIGHT_OFFSET, light_steps
        );
        float sky_depth = cloud_optical_depth(
            point, vec3(0.0, 1.0, 0.0), layer, base_radius, top_radius,
            LIGHT_OFFSET, 2
        );
        float ground_depth = cloud_optical_depth(
            point, vec3(0.0, -1.0, 0.0), layer, base_radius, top_radius,
            LIGHT_OFFSET, 2
        );

        vec3 luminance = cloud_scattering(
            layer, density, light_depth, sky_depth, ground_depth,
            step_transmittance, cos_theta,
            light_radiance, u_cloud_ambient, u_cloud_ground_light
        );

        // Precipitation removes light: rain shafts and virga read as darker,
        // softer columns hanging below the cloud base.
        luminance *= 1.0 - layer.precipitation * 0.55 *
            (1.0 - smoothstep(0.0, 0.4, altitude_fraction));

        result.scattering += result.transmittance * luminance;
        result.transmittance *= step_transmittance;

        travelled += step_length;
    }

    result.transmittance = saturate(result.transmittance);
    result.distance = weight_sum > 0.0
        ? weighted_distance / weight_sum
        : (first_hit > 0.0 ? first_hit : CLOUD_MAX_DISTANCE);

    return result;
}

CloudLayer cloud_layer_from_uniforms(int index) {
    vec4 geometry = u_layer_geometry[index];
    vec4 shape = u_layer_shape[index];
    vec4 motion = u_layer_motion[index];
    vec4 phase = u_layer_phase[index];
    vec4 scale = u_layer_scale[index];
    vec4 drift = u_layer_drift[index];

    // Photon's cumulus extinction sits between 0.05 and 0.1 per metre. Optical
    // depth scales within that band so cirrus stays translucent and a
    // cumulonimbus core goes fully opaque.
    float extinction = mix(0.012, 0.105, geometry.w);

    return CloudLayer(
        geometry.x, geometry.y, geometry.z, phase.w,
        shape.x, shape.y, shape.z, shape.w,
        motion.xy, motion.z, motion.w,
        phase.x, phase.y, phase.z,
        scale.x, scale.y, scale.z, scale.w,
        drift.xy,
        extinction
    );
}

/**
 * Composites the three layers. For a ground observer the shells are strictly
 * ordered by altitude, so front-to-back compositing needs no depth sort.
 */
CloudResult cloud_render(
    vec3 direction,
    vec3 sun_direction,
    vec3 moon_direction,
    float sun_cosine,
    float moon_cosine,
    float observer_height
) {
    CloudResult total = CloudResult(vec3(0.0), 1.0, CLOUD_MAX_DISTANCE);
    if (u_cloud_quality.w < 0.5) return total;

    vec3 origin = vec3(0.0, PLANET_RADIUS + observer_height, 0.0);
    float dither = cloud_dither(gl_FragCoord.xy);

    for (int index = 0; index < 3; index++) {
        CloudLayer layer = cloud_layer_from_uniforms(index);
        CloudResult layer_result = cloud_march_layer(
            layer, origin, direction,
            sun_direction, moon_direction,
            sun_cosine, moon_cosine, dither
        );

        total.scattering += total.transmittance * layer_result.scattering;
        total.transmittance *= layer_result.transmittance;
        total.distance = min(total.distance, layer_result.distance);
    }

    return total;
}

/**
 * Noctilucent cloud: mesospheric ice at ~82 km, lit by a Sun already well below
 * the observer's horizon. Rendered as a thin wind-rippled sheet rather than a
 * volume, because at that optical depth there is no internal transport worth
 * integrating.
 */
vec3 cloud_noctilucent(vec3 direction, vec3 sun_direction) {
    if (u_cloud_noctilucent < 0.01 || direction.y < 0.0) return vec3(0.0);

    vec3 origin = vec3(0.0, PLANET_RADIUS + 2.0, 0.0);
    vec2 hit = cloud_ray_sphere(origin, direction, PLANET_RADIUS + 82000.0);
    if (hit.y < 0.0) return vec3(0.0);

    vec3 point = origin + direction * hit.y;
    vec2 uv = point.xz * 2.4e-6 + vec2(u_cloud_time * 4.0e-6, 0.0);

    float wave = texture(u_cloud_weather, uv).x;
    float ripple = texture(u_cloud_weather, uv * vec2(9.0, 2.2) + 0.37).w;
    float sheet = saturate(linear_step(0.42, 0.78, wave)) *
        (0.55 + 0.45 * ripple);

    float lit = smoother(-0.06, 0.02, dot(normalize(point), sun_direction));
    vec3 electric_blue = srgb_to_linear(vec3(0.62, 0.82, 1.0));

    return electric_blue * sheet * lit * u_cloud_noctilucent * 0.055;
}
`;

/** Injected at the composition point inside `main()`. */
export const CLOUD_COMPOSITE = `
    // Volumetric cloud transport. Radiance already holds the clear-sky and
    // celestial contribution for this direction, so the clouds extinguish it
    // and add their own in-scatter in the same scene-linear space.
    CloudResult clouds = cloud_render(
        view, sun_direction, moon_direction, sun_cosine, moon_cosine,
        observer_altitude * 2500.0
    );

    // Aerial perspective. Distant cloud loses contrast toward the sky radiance
    // between it and the viewer, which is what makes a horizon deck recede.
    float cloud_fade = 1.0 - exp(-clouds.distance * u_cloud_quality.z);
    vec3 cloud_scattering = mix(
        clouds.scattering,
        radiance * (1.0 - clouds.transmittance),
        cloud_fade * 0.82
    );

    radiance = radiance * clouds.transmittance + cloud_scattering;
    radiance += cloud_noctilucent(view, sun_direction);

    // Boundary-layer fog is a ground-level extinction that lifts and
    // desaturates the horizon rather than a discrete cloud layer.
    if (u_cloud_fog > 0.01) {
        float fog_depth = u_cloud_fog * 2.4 *
            exp(-max(0.0, view.y) * 7.0);
        float fog_transmittance = exp(-fog_depth);
        vec3 fog_color = mix(u_cloud_ambient, u_cloud_ground_light, 0.45) *
            (0.6 + 0.4 * smoother(-0.2, 0.6, sun_cosine));
        radiance = radiance * fog_transmittance +
            fog_color * (1.0 - fog_transmittance);
    }
`;

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

import {
    CLOUD_GENUS_LEVEL,
    CLOUD_SPECIES_CODE,
    type CloudOrganization,
    type CloudScene,
} from "./cloud-scene";

const CLOUD_ORGANIZATION_CODE: Record<CloudOrganization, number> = {
    unorganized: 0,
    isolated: 1,
    streets: 2,
    "open-cell": 3,
    "closed-cell": 4,
    frontal: 5,
    banded: 6,
};

export interface PackedCloudLayers {
    geometry: Float32Array;
    shape: Float32Array;
    motion: Float32Array;
    phase: Float32Array;
    scale: Float32Array;
    drift: Float32Array;
    morphology: Float32Array;
    scene: Float32Array;
    seed: Float32Array;
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
    const morphology = new Float32Array(12);
    let active = false;

    scene.layers.forEach((layer, index) => {
        const offset = index * 4;
        const present = layer.present && layer.coverage > 0.001;
        if (present) active = true;

        // Coverage is a range, not a scalar: the low-frequency weather noise
        // picks a value within it, so a single scene holds both denser and
        // thinner regions rather than one uniform amount of sky cover.
        const coverage = present ? layer.coverage : 0;
        const thickness = Math.max(1, layer.thickness);
        geometry[offset] = layer.baseAltitude;
        geometry[offset + 1] = thickness;
        geometry[offset + 2] = Math.max(0, Math.min(1, coverage - 0.02));

        // Extinction per metre, derived from a target optical depth across the
        // layer rather than mapped straight from the optical-depth control.
        // Extinction is only meaningful relative to how far light travels
        // through the cloud, so a fixed coefficient makes a 900 m cirrus sheet
        // as opaque as a cumulus: cirrus came out solid white at tau ~14 when
        // it should sit near 2 and stay translucent. Squaring separates thin
        // ice from convective water cloud across the control's range.
        geometry[offset + 3] = Math.max(
            0.0004,
            Math.min(0.12, (layer.opticalDepth ** 2 * 110) / thickness),
        );

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
        // Coverage periods, held near a fixed world scale.
        //
        // Deriving these from the feature size scaled them with sizeFactor,
        // which gave the high layer a 134 km fine period. Cirrus sits at ~9 km,
        // where the whole upper sky spans barely 25 km horizontally, so its
        // coverage came out uniform and the layer rendered as a flat white
        // sheet. Weather systems are the same size regardless of which deck
        // they belong to, so these stay near 160 km and 40 km for every layer.
        // Both multipliers divide 420, keeping the drift wrap exact.
        const coarseMultiple = level === "high" ? 42 : level === "middle" ? 70 : 140;
        const fineMultiple = level === "high" ? 10 : level === "middle" ? 20 : 35;

        const period = basePeriod * 420;
        const wrap = (value: number) => ((value % period) + period) % period;
        drift[offset] = wrap(motion[offset] * timeSeconds);
        drift[offset + 1] = wrap(motion[offset + 1] * timeSeconds);
        drift[offset + 2] = 1 / (basePeriod * coarseMultiple);
        drift[offset + 3] = 1 / (basePeriod * fineMultiple);

        morphology[offset] = CLOUD_SPECIES_CODE[layer.species];
        morphology[offset + 1] = CLOUD_ORGANIZATION_CODE[layer.organization];
        morphology[offset + 2] = layer.lifecycle;
        morphology[offset + 3] = layer.organizationStrength;
    });

    return {
        geometry,
        shape,
        motion,
        phase,
        scale,
        drift,
        morphology,
        scene: new Float32Array([
            scene.convection,
            scene.instability,
            scene.humidity,
            scene.totalOktas / 8,
        ]),
        seed: new Float32Array(scene.seed),
        active,
    };
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
uniform vec4 u_layer_morphology[3];// species, organization, lifecycle, organization strength
uniform vec4 u_cloud_scene;        // convection, instability, humidity, total coverage
uniform vec4 u_cloud_seed;

uniform vec3 u_cloud_sun_radiance;
uniform vec3 u_cloud_moon_radiance;
uniform vec3 u_cloud_ambient;
uniform vec3 u_cloud_ground_light;
uniform vec4 u_cloud_quality;      // viewSteps, lightSteps, aerialScale, enabled
uniform float u_cloud_output_mode; // 0 final, 1 raw radiance/depth, 2 transmittance/depth
uniform vec3 u_cloud_offline_sample;// subpixel x/y and depth phase
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

/**
 * Powder term, normalised below one.
 *
 * Photon scales this by PI, so it peaks near 3 and the octave loop's
 * scatter_amount *= falloff * powder grows by about 1.3x per octave, roughly
 * 5.6x over eight. Photon's exposure pipeline absorbs that; here it blew out
 * optically thin cloud, because cirrus lets the light march through almost
 * unattenuated and so leans on the early octaves where the gain is largest.
 * Powder physically describes darkening near an illuminated boundary, so
 * bounding it at one both conserves energy and makes the loop strictly
 * decaying.
 */
float clouds_powder_effect(float density, float cos_theta) {
    float powder = density / (density + 0.15);
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
    float species;
    float organization;
    float lifecycle;
    float organizationStrength;
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
    float coverageCoarse;
    float coverageFine;
    float extinction;
};

struct CloudResult {
    vec3 scattering;
    float transmittance;
    float distance;
    float firstDistance;
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
 * Vertical shaping, following Photon's cumulus altitude shaping and extended
 * with convective tower and anvil terms so the same function serves all ten
 * genera. altitude_fraction is 0 at cloud base and 1 at cloud top.
 */
float cloud_altitude_shaping(
    float density,
    float altitude_fraction,
    CloudLayer layer
) {
    // Morphology may redistribute condensate that already belongs to this
    // weather system, but it must never create density in clear air. The old
    // unconditional tower/anvil additions filled the entire spherical shell
    // whenever a convective layer was present, producing the dark radial slab
    // seen in fixed-camera captures.
    float local_support = smoother(0.015, 0.28, saturate(density));

    if (abs(layer.species - 19.0) < 0.5) {
        float vertical_gate = smoothstep(0.0, 0.012, altitude_fraction) *
            (1.0 - smoothstep(0.955, 1.0, altitude_fraction));
        return max0(density) * vertical_gate;
    }

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
    density += local_support * layer.towerAmount * 0.28 *
        linear_step(0.1, 0.5, altitude_fraction) *
        (1.0 - linear_step(0.85, 1.0, altitude_fraction));

    // The anvil is ice spreading along the tropopause once the tower can rise
    // no further, so it flares outward and then stops abruptly.
    density += local_support * layer.anvilAmount * 0.5 *
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
vec2 cloud_rotate2(vec2 point, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return vec2(
        point.x * cosine - point.y * sine,
        point.x * sine + point.y * cosine
    );
}

/**
 * One finite, connected congestus group built from a scalar thermal field.
 *
 * The broad owner is an irregular corridor in Earth-local metres, not a union
 * of cloud primitives. Low altitude keeps that corridor connected. With
 * height, a rising threshold retains only persistent maxima in rotated,
 * domain-warped noise, creating parented turrets. A spatially varying vertical
 * pulse widens and narrows those maxima into successive cauliflower crowns.
 */
float cloud_congestus_coverage(
    vec3 world_position,
    CloudLayer layer,
    float altitude_fraction
) {
    float h = saturate(altitude_fraction);

    // Production has one physical camera. The group remains world-space, but
    // its stable authored owner is placed relative to that one heading so the
    // fixed photograph camera sees the whole base-to-crown development.
    vec2 forward = vec2(sin(u_camera.w), cos(u_camera.w));
    vec2 across = vec2(forward.y, -forward.x);
    float group_range = mix(7900.0, 8500.0, u_cloud_seed.y);
    vec2 group_center = forward * group_range +
        across * ((u_cloud_seed.x - 0.5) * 620.0);
    vec2 owner = world_position.xz - group_center;

    // One low-frequency, non-radial warp breaks the domain boundary and bends
    // the connected updraft family without stamping independent lobes.
    vec2 warp_coordinate = cloud_rotate2(owner, 0.41);
    vec2 warp = texture(
        u_cloud_base,
        vec3(
            warp_coordinate.x / 9200.0 + u_cloud_seed.z * 3.7,
            world_position.y / 9200.0 + u_cloud_seed.w * 2.9,
            warp_coordinate.y / 9200.0 + u_cloud_seed.x * 4.3
        )
    ).ba * 2.0 - 1.0;
    owner += across * warp.x * (260.0 + layer.turbulence * 210.0) +
        forward * warp.y * (180.0 + layer.turbulence * 140.0);

    float along = dot(owner, across);
    float normal = dot(owner, forward);
    float half_length = mix(3000.0, 3400.0, layer.organizationStrength);
    float half_width = mix(800.0, 1050.0, u_cloud_scene.x);
    float edge = 350.0;
    float centerline = half_width * (
        0.075 * sin(along / max(1.0, half_length) * PI * 1.17 +
            u_cloud_seed.z * 6.0) +
        0.040 * sin(along / max(1.0, half_length) * PI * 2.63 +
            u_cloud_seed.w * 8.0)
    );
    float width_variation = 0.82 +
        0.10 * sin(along / max(1.0, half_length) * PI * 1.71 +
            u_cloud_seed.x * 5.0) +
        0.08 * texture(
            u_cloud_weather,
            vec2(along / 17000.0 + u_cloud_seed.y, u_cloud_seed.z)
        ).r;
    float height_taper = smoother(0.16, 0.94, h);
    float crown_expansion = smoother(0.48, 0.76, h) *
        (1.0 - smoother(0.91, 1.0, h));
    float height_length = half_length * mix(1.0, 0.82, height_taper) *
        (1.0 + crown_expansion * 0.10);
    float height_width = half_width * mix(1.0, 0.70, height_taper) *
        (1.0 + crown_expansion * 0.06);
    float along_envelope = 1.0 - smoothstep(
        height_length - edge,
        height_length + edge,
        abs(along)
    );
    float normal_envelope = 1.0 - smoothstep(
        height_width * width_variation - edge,
        height_width * width_variation + edge,
        abs(normal - centerline)
    );
    float group_envelope = along_envelope * normal_envelope;
    if (group_envelope < 1e-4) return 0.0;

    vec2 owner_a = cloud_rotate2(owner, 0.73);
    vec2 owner_b = cloud_rotate2(owner, -0.46);
    vec3 thermal_a = vec3(
        owner_a.x / 7600.0 + u_cloud_seed.x * 2.1,
        world_position.y / 7600.0 + u_cloud_seed.z * 1.7,
        owner_a.y / 7600.0 + u_cloud_seed.w * 2.6
    );
    vec3 thermal_b = vec3(
        owner_b.x / 3900.0 + u_cloud_seed.w * 3.2,
        world_position.y / 5200.0 + u_cloud_seed.x * 2.4,
        owner_b.y / 3900.0 + u_cloud_seed.y * 2.8
    );
    vec3 crown_coordinate = vec3(
        owner_a.x / 2050.0 + u_cloud_seed.y * 4.1,
        world_position.y / 2550.0 + u_cloud_seed.w * 3.3,
        owner_a.y / 2050.0 + u_cloud_seed.z * 3.9
    );
    float macro = texture(u_cloud_base, thermal_a).r;
    float ancestry = texture(u_cloud_base, thermal_b).r;
    float cells = texture(u_cloud_base, crown_coordinate).g;
    float clefts = texture(
        u_cloud_detail,
        crown_coordinate * 0.57 + vec3(0.31, 0.17, 0.43)
    ).r;

    // A height-invariant slice is the thermal ancestry. It protects a few
    // roots as the altitude threshold rises; 3D noise still moves and erodes
    // their surfaces, but the crowns remain visibly parented to the base.
    float lineage_coarse = texture(
        u_cloud_base,
        vec3(
            owner_a.x / 5200.0 + u_cloud_seed.y * 2.2,
            u_cloud_seed.z * 4.7 + 0.19,
            owner_a.y / 5200.0 + u_cloud_seed.x * 2.9
        )
    ).r;
    float lineage_fine = texture(
        u_cloud_base,
        vec3(
            owner_b.x / 2450.0 + u_cloud_seed.w * 3.8,
            u_cloud_seed.x * 5.1 + 0.37,
            owner_b.y / 2450.0 + u_cloud_seed.z * 3.3
        )
    ).g;
    float lineage = lineage_coarse * 0.67 + lineage_fine * 0.33;

    // A separable world-space bias selects a dominant updraft while retaining
    // the same connected field. It is deliberately not a radial distance.
    float dominant =
        (1.0 - smoothstep(0.18, 0.82, abs(along) / half_length)) *
        (1.0 - smoothstep(0.10, 0.78,
            abs(normal - centerline) / half_width));
    float cross_focus = 1.0 - smoothstep(
        0.20,
        0.78,
        abs(normal - centerline) / half_width
    );
    float rising_along = along / max(1.0, half_length) +
        (macro - 0.5) * mix(0.04, 0.18, h) +
        (cells - 0.5) * 0.09 * smoother(0.35, 0.90, h);
    float family_expansion = smoother(0.30, 0.84, h);
    float family_a = 1.0 - smoothstep(
        mix(0.035, 0.12, family_expansion),
        mix(0.13, 0.31, family_expansion),
        abs(rising_along + 0.31)
    );
    float family_b = 1.0 - smoothstep(
        mix(0.045, 0.14, family_expansion),
        mix(0.14, 0.35, family_expansion),
        abs(rising_along - 0.27)
    );
    float family = max(family_a, 0.92 * family_b) * cross_focus;
    float lower_group = dominant *
        (1.0 - smoother(0.34, 0.66, h));
    float potential =
        macro * 0.22 + ancestry * 0.18 +
        cells * mix(0.16, 0.24, crown_expansion) +
        lineage * 0.30 + clefts * 0.05 +
        dominant * 0.05 + lower_group * 0.08;

    // World-space buoyancy cells replace a synchronized sine over height. The
    // old global phase made every updraft widen at the same altitude and read
    // as horizontal geological strata. These rotated 3D samples keep roughly
    // three successive growth stages, but phase them independently by plume.
    vec3 pulse_coordinate_a = vec3(
        owner_b.x / 3100.0 + u_cloud_seed.z * 3.1,
        world_position.y / 1450.0 + layer.lifecycle * 1.7,
        owner_b.y / 3100.0 + u_cloud_seed.x * 2.7
    );
    vec3 pulse_coordinate_b = vec3(
        owner_a.x / 1750.0 + u_cloud_seed.w * 4.0,
        world_position.y / 980.0 + u_cloud_seed.y * 3.4,
        owner_a.y / 1750.0 + u_cloud_seed.z * 3.6
    );
    float buoyant_pulse =
        texture(u_cloud_base, pulse_coordinate_a).b * 0.68 +
        texture(u_cloud_base, pulse_coordinate_b).g * 0.32;
    float rising_threshold = mix(0.56, 0.68, pow(h, 0.76));
    rising_threshold -= (buoyant_pulse - 0.5) * mix(0.07, 0.13, h);
    rising_threshold -= dominant * mix(0.010, 0.050, h);
    rising_threshold -= (layer.coverageLow - 0.45) * 0.16;
    float crown_focus = smoother(0.24, 0.76, h);
    rising_threshold += (1.0 - family) *
        mix(0.02, 0.130, crown_focus);
    rising_threshold -= family * mix(0.005, 0.115, crown_focus);
    float turrets = smoothstep(
        rising_threshold - 0.085,
        rising_threshold + 0.075,
        potential
    );

    // The condensation base is a shared connected owner. It hands off to the
    // ancestry field through the lower third of the volume, so every surviving
    // crown remains attached rather than becoming a row of floating blobs.
    float base_noise = macro * 0.58 + ancestry * 0.30 + cells * 0.12;
    float connected_base = smoothstep(0.46, 0.68, base_noise) *
        (1.0 - smoothstep(0.035, 0.075, h));
    float base_bridge = 0.025 *
        (1.0 - smoothstep(0.018, 0.045, h));
    float top_persistence = smoother(
        0.38,
        0.76,
        lineage * 0.74 + family * 0.26
    );
    float local_top = mix(
        0.84,
        mix(0.955, 0.99, u_cloud_scene.y),
        top_persistence
    );
    float top_gate = 1.0 - smoothstep(
        local_top - 0.035,
        local_top + 0.012,
        h
    );
    return saturate(
        max(max(base_bridge, connected_base), turrets * top_gate) *
            group_envelope
    );
}

float cloud_local_coverage(
    vec3 world_position3,
    vec3 sample_position3,
    CloudLayer layer,
    float altitude_fraction
) {
    if (abs(layer.species - 19.0) < 0.5) {
        return cloud_congestus_coverage(
            world_position3,
            layer,
            altitude_fraction
        );
    }

    vec2 position = sample_position3.xz;
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
    vec2 p1 = position * layer.coverageCoarse;
    vec2 p2 = position * layer.coverageFine;
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
        sample_position3 * (layer.baseScale * 0.25)
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
    vec3 world_position =
        vec3(position.x, position.y - PLANET_RADIUS, position.z);
    vec3 sample_position = world_position;

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

    float density = cloud_local_coverage(
        world_position,
        sample_position,
        layer,
        altitude_fraction
    );
    density = cloud_altitude_shaping(density, altitude_fraction, layer);
    if (density < 1e-4) return 0.0;

    // Worley erosion. This is where cloud-scale structure is created: the two
    // frequencies carve the coverage field into billows and then into wisps.
    float morphology_base_scale = abs(layer.species - 19.0) < 0.5
        ? 1.0 / 3000.0
        : layer.baseScale;
    float morphology_detail_scale = abs(layer.species - 19.0) < 0.5
        ? 1.0 / 520.0
        : layer.detailScale;
    vec4 morphology_base = texture(
        u_cloud_base,
        sample_position * morphology_base_scale
    );
    vec3 morphology_detail = texture(
        u_cloud_detail,
        sample_position * morphology_detail_scale
    ).rgb;
    float worley_0 = morphology_base.g;
    float worley_1 = morphology_detail.r;

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
                    morphology_detail_scale
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

    if (abs(layer.species - 19.0) < 0.5) {
        vec3 rotated_base_coordinate = vec3(
            sample_position.z * 0.79 + sample_position.x * 0.32,
            sample_position.y * 1.13,
            -sample_position.x * 0.79 + sample_position.z * 0.32
        ) * (morphology_base_scale * 1.29) +
            vec3(u_cloud_seed.z, u_cloud_seed.x, u_cloud_seed.w) * 3.1;
        vec3 rotated_detail_coordinate = vec3(
            sample_position.z * 0.61 - sample_position.x * 0.74,
            sample_position.y * 0.91,
            sample_position.x * 0.61 + sample_position.z * 0.74
        ) * (morphology_detail_scale * 1.37) +
            vec3(u_cloud_seed.w, u_cloud_seed.y, u_cloud_seed.x) * 4.3;
        vec3 rotated_base = texture(
            u_cloud_base,
            rotated_base_coordinate
        ).gba;
        vec3 rotated_detail = texture(
            u_cloud_detail,
            rotated_detail_coordinate
        ).rgb;
        float base_fbm = dot(
            morphology_base.gba,
            vec3(0.625, 0.25, 0.125)
        );
        float detail_fbm = dot(
            morphology_detail,
            vec3(0.625, 0.25, 0.125)
        );
        base_fbm = mix(
            base_fbm,
            dot(rotated_base, vec3(0.625, 0.25, 0.125)),
            0.38
        );
        detail_fbm = mix(
            detail_fbm,
            dot(rotated_detail, vec3(0.625, 0.25, 0.125)),
            0.44
        );
        float boundary = 1.0 - smoothstep(0.38, 0.90, density);
        density -= boundary * layer.detailStrength * (
            0.22 * (1.0 - base_fbm) +
            0.14 * (1.0 - detail_fbm) * mix(0.72, 1.18, altitude_fraction)
        );
    } else {
        density -= detail_weights.x * sqr(worley_0) *
            dampen(saturate(1.0 - density));
        density -= detail_weights.y * sqr(worley_1) *
            dampen(saturate(1.0 - density)) * detail_fade;
    }

    // Wispy at the bottom, hard-edged at the top.
    density = max0(density);
    vec2 edge_sharpening = mix(
        vec2(3.0, 12.0),
        vec2(2.0, 7.0),
        vec2(sqr(layer.stratusBlend))
    );
    float edge_amount = abs(layer.species - 19.0) < 0.5
        ? mix(-0.08, -0.24, smoother(0.12, 0.84, altitude_fraction))
        : mix(edge_sharpening.x, edge_sharpening.y, altitude_fraction);
    density = lift(density, edge_amount);
    density *= abs(layer.species - 19.0) < 0.5
        ? 0.52 + 0.48 * smoothstep(0.08, 0.72, altitude_fraction)
        : 0.1 + 0.9 * smoothstep(0.2, 0.7, altitude_fraction);

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
    vec2 outer = cloud_ray_sphere(ray_origin, ray_direction, top_radius);
    vec2 inner = cloud_ray_sphere(ray_origin, ray_direction, base_radius);
    float exit_distance = outer.y;
    if (inner.x > 1.0) exit_distance = min(exit_distance, inner.x);
    if (inner.y > 1.0) exit_distance = min(exit_distance, inner.y);
    exit_distance = min(exit_distance, layer.thickness * 8.0);
    float step_length = exit_distance / float(max(step_count, 1));
    float optical_depth = 0.0;

    for (int i = 0; i < 12; i++) {
        if (i >= step_count) break;
        vec3 point = ray_origin + ray_direction *
            ((float(i) + dither) * step_length);
        float radius = length(point);
        float altitude_fraction =
            (radius - base_radius) / max(1.0, top_radius - base_radius);
        if (altitude_fraction >= 0.0 && altitude_fraction <= 1.0) {
            optical_depth +=
                cloud_density(point, layer, altitude_fraction) * step_length;
        }
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
    float altitude_fraction,
    float cos_theta,
    vec3 light_radiance,
    vec3 sky_radiance,
    vec3 ground_radiance
) {
    float light_tau = layer.extinction * light_optical_depth;
    float sky_tau = layer.extinction * sky_optical_depth;
    float ground_tau = layer.extinction * ground_optical_depth;
    float direct_visibility = exp(-light_tau);
    float multiple_visibility = exp(-light_tau * 0.34);
    float sky_visibility = exp(-sky_tau * 0.62);
    float ground_visibility = exp(-ground_tau * 0.55);

    // Normalize the directional lobe against isotropic scattering before it
    // controls display energy. The phase still supplies a tight forward peak,
    // while side-lit liquid cloud retains the broad bright response created by
    // higher orders rather than collapsing into blue ambient shadow.
    float phase_response = clamp(
        clouds_phase_single(cos_theta) / ISOTROPIC_PHASE,
        0.04,
        4.0
    );
    float directional_gain = mix(
        0.24,
        1.0,
        smoother(0.04, 1.35, phase_response)
    );
    float powder = clouds_powder_effect(
        density + density * layer.stratusBlend,
        cos_theta
    );

    float sky_luminance = dot(
        sky_radiance,
        vec3(0.2126, 0.7152, 0.0722)
    );
    float ground_luminance = dot(
        ground_radiance,
        vec3(0.2126, 0.7152, 0.0722)
    );
    vec3 neutral_sky = mix(
        sky_radiance,
        vec3(sky_luminance),
        0.62
    );
    vec3 neutral_ground = mix(
        ground_radiance,
        vec3(ground_luminance),
        0.48
    );

    float height_light = smoother(0.08, 0.86, altitude_fraction);
    vec3 incident =
        light_radiance * direct_visibility * directional_gain *
            mix(0.34, 0.46, powder) * mix(0.76, 1.08, height_light) +
        light_radiance * multiple_visibility *
            mix(0.040, 0.076, height_light) +
        neutral_sky * sky_visibility * mix(0.11, 0.18, height_light) +
        neutral_ground * ground_visibility * 0.035;

    // This is the exact homogeneous-segment integral for unit single-scatter
    // albedo after the incident field above has been bounded into named,
    // non-overlapping contributions.
    return max(incident, vec3(0.0)) * (1.0 - step_transmittance);
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
    CloudResult result = CloudResult(
        vec3(0.0), 1.0, CLOUD_MAX_DISTANCE, CLOUD_MAX_DISTANCE
    );
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
    steps = clamp(steps, 8, 384);
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
    float step_length = abs(layer.species - 19.0) < 0.5
        ? min(span / float(steps), 25.0)
        : min(span / float(steps), layer.thickness * 0.16);
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

    for (int index = 0; index < 384; index++) {
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
            step_transmittance, altitude_fraction, cos_theta,
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
    result.firstDistance = first_hit > 0.0
        ? first_hit
        : CLOUD_MAX_DISTANCE;

    return result;
}

CloudLayer cloud_layer_from_uniforms(int index) {
    vec4 geometry = u_layer_geometry[index];
    vec4 shape = u_layer_shape[index];
    vec4 motion = u_layer_motion[index];
    vec4 phase = u_layer_phase[index];
    vec4 scale = u_layer_scale[index];
    vec4 drift = u_layer_drift[index];
    vec4 morphology = u_layer_morphology[index];

    // Extinction per metre, resolved on the CPU against layer thickness.
    float extinction = geometry.w;

    return CloudLayer(
        geometry.x, geometry.y, geometry.z, phase.w,
        shape.x, shape.y, shape.z, shape.w,
        morphology.x, morphology.y, morphology.z, morphology.w,
        motion.xy, motion.z, motion.w,
        phase.x, phase.y, phase.z,
        scale.x, scale.y, scale.z, scale.w,
        drift.xy, drift.z, drift.w,
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
    CloudResult total = CloudResult(
        vec3(0.0), 1.0, CLOUD_MAX_DISTANCE, CLOUD_MAX_DISTANCE
    );
    if (u_cloud_quality.w < 0.5) return total;

    vec3 origin = vec3(0.0, PLANET_RADIUS + observer_height, 0.0);
    // This renderer resolves a static full-resolution frame and does not have
    // temporal reconstruction to integrate per-pixel jitter. A screen-space
    // random offset therefore survives as visible crosshatch and radial bands.
    // Midpoint quadrature is deterministic in world space; the higher sample
    // count below resolves the resulting depth intervals without that noise.
    float dither = u_cloud_output_mode > 0.5
        ? fract(u_cloud_offline_sample.z)
        : 0.5;
    float weighted_distance = 0.0;
    float distance_weight = 0.0;

    for (int index = 0; index < 3; index++) {
        CloudLayer layer = cloud_layer_from_uniforms(index);
        CloudResult layer_result = cloud_march_layer(
            layer, origin, direction,
            sun_direction, moon_direction,
            sun_cosine, moon_cosine, dither
        );

        float layer_contribution = total.transmittance *
            (1.0 - layer_result.transmittance);
        total.scattering += total.transmittance * layer_result.scattering;
        total.transmittance *= layer_result.transmittance;
        total.firstDistance = min(
            total.firstDistance,
            layer_result.firstDistance
        );
        if (layer_contribution > 1e-6 &&
            layer_result.distance < CLOUD_MAX_DISTANCE) {
            weighted_distance += layer_result.distance * layer_contribution;
            distance_weight += layer_contribution;
        }
    }

    total.distance = distance_weight > 1e-6
        ? weighted_distance / distance_weight
        : CLOUD_MAX_DISTANCE;

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

    // Offline plate export preserves the cloud as an affine scene-linear
    // transport operator. Depth is stored in kilometres to match the WebGPU
    // packet ABI and remain exactly representable in rgba16float. Empty pixels
    // use the same 140 km finite sentinel as the live transport path.
    if (u_cloud_output_mode > 0.5) {
        float first_depth_km = min(
            CLOUD_MAX_DISTANCE,
            clouds.firstDistance
        ) * 0.001;
        float mean_depth_km = min(
            CLOUD_MAX_DISTANCE,
            clouds.distance
        ) * 0.001;
        out_color = u_cloud_output_mode < 1.5
            ? vec4(max(clouds.scattering, vec3(0.0)), first_depth_km)
            : vec4(vec3(saturate(clouds.transmittance)), mean_depth_km);
        return;
    }

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

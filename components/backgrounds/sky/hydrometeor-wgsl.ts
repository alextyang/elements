import {
    HYDROMETEOR_MAX_FIELDS,
    HYDROMETEOR_VEC4_STRIDE,
} from "./hydrometeor-system";

/**
 * WGSL declarations are emitted separately so the WebGPU renderer can choose
 * a free binding without this subsystem imposing a new bind-group layout.
 */
export const createHydrometeorBufferDeclaration = (
    group: number,
    binding: number,
    variableName = "hydrometeor_fields",
) => `
struct HydrometeorRecord {
    identity: vec4<f32>,
    source_center_extent: vec4<f32>,
    source_geometry: vec4<f32>,
    distribution: vec4<f32>,
    kinematics: vec4<f32>,
    extinction: vec4<f32>,
    scattering: vec4<f32>,
    phase_transition: vec4<f32>,
    evaporation: vec4<f32>,
    particle_rendering: vec4<f32>,
    source_boundary: vec4<f32>,
    energy_and_importance: vec4<f32>,
    morphology: vec4<f32>,
    particle_shape: vec4<f32>,
    lighting_response: vec4<f32>,
    phase_path: vec4<f32>,
};

struct HydrometeorFieldBuffer {
    header: vec4<f32>,
    records: array<HydrometeorRecord>,
};

@group(${Math.max(0, Math.floor(group))}) @binding(${Math.max(0, Math.floor(binding))})
var<storage, read> ${variableName}: HydrometeorFieldBuffer;
`;

/**
 * Renderer-independent field evaluation. Positions and distances are km.
 * Extinction is km^-1. Radiance integration remains the responsibility of the
 * atmosphere/cloud transport pass, so this code cannot double-apply sky light.
 */
export const HYDROMETEOR_FIELD_WGSL = /* wgsl */ `
const HYDROMETEOR_MAX_FIELDS: u32 = ${HYDROMETEOR_MAX_FIELDS}u;
const HYDROMETEOR_RECORD_VEC4_STRIDE: u32 = ${HYDROMETEOR_VEC4_STRIDE}u;
const HYDROMETEOR_PI: f32 = 3.141592653589793;

struct HydrometeorSample {
    extinction_rgb_km: vec3<f32>,
    scattering_albedo_rgb: vec3<f32>,
    asymmetry: f32,
    liquid_fraction: f32,
    volumetric_energy_fraction: f32,
    sparse_particle_energy_fraction: f32,
    source_weight: f32,
    direct_irradiance_weight: f32,
    diffuse_irradiance_weight: f32,
    source_glint_strength: f32,
    multiple_scattering_boost: f32,
    parent_system_index: f32,
    parent_layer_index: f32,
};

struct HydrometeorPassiveRgbTransfer {
    transmittance_rgb: vec3<f32>,
    scattered_toward_receiver_rgb: vec3<f32>,
};

// Every irradiance member is evaluated at the sample after atmospheric
// transport. Supplying TOA source irradiance here would skip atmosphere
// filtering; filtering these values again would double attenuation.
struct HydrometeorLocalIrradianceAtSample {
    atmosphere_attenuated_sun_irradiance_rgb: vec3<f32>,
    atmosphere_attenuated_moon_irradiance_rgb: vec3<f32>,
    diffuse_sky_hemisphere_irradiance_rgb: vec3<f32>,
    ground_hemisphere_irradiance_rgb: vec3<f32>,
};

// The host resolves this transfer for the exact record owner. Direct
// transmittance and redirected energy are mutually exclusive outcomes.
struct HydrometeorParentLightCoupling {
    parent_system_index: f32,
    parent_layer_index: f32,
    sun: HydrometeorPassiveRgbTransfer,
    moon: HydrometeorPassiveRgbTransfer,
    diffuse_sky: HydrometeorPassiveRgbTransfer,
    ground: HydrometeorPassiveRgbTransfer,
    // Exact owner light-volume result after phase convolution. When supplied,
    // Sun/Moon scattered-transfer lanes remain zero to avoid duplicate paths.
    phase_convolved_scattering_radiance_rgb: vec3<f32>,
};

struct HydrometeorPassiveSourceCoefficient {
    extinction_rgb_km: vec3<f32>,
    source_coefficient_rgb_km: vec3<f32>,
};

struct HydrometeorPassiveOverlap {
    extinction_rgb_km: vec3<f32>,
    source_coefficient_rgb_km: vec3<f32>,
};

struct HydrometeorPassiveSegment {
    radiance_rgb: vec3<f32>,
    transmittance_rgb: vec3<f32>,
};

struct HydrometeorNearParticleAppearance {
    visible: f32,
    habit_code: f32,
    diameter_mm: f32,
    exposure_track_length_m: f32,
    orientation_radians: f32,
    optical_energy: f32,
    source_glint_weight: f32,
    padding: f32,
    velocity_east_altitude_north_mps: vec3<f32>,
};

fn hydrometeor_empty_sample() -> HydrometeorSample {
    var result: HydrometeorSample;
    result.extinction_rgb_km = vec3<f32>(0.0);
    result.scattering_albedo_rgb = vec3<f32>(0.0);
    result.asymmetry = 0.0;
    result.liquid_fraction = 0.0;
    result.volumetric_energy_fraction = 0.0;
    result.sparse_particle_energy_fraction = 0.0;
    result.source_weight = 0.0;
    result.direct_irradiance_weight = 0.0;
    result.diffuse_irradiance_weight = 0.0;
    result.source_glint_strength = 0.0;
    result.multiple_scattering_boost = 0.0;
    result.parent_system_index = -2.0;
    result.parent_layer_index = -2.0;
    return result;
}

fn hydrometeor_saturate(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn hydrometeor_passive_rgb_transfer(
    transmittance_rgb: vec3<f32>,
    scattered_toward_receiver_rgb: vec3<f32>,
) -> HydrometeorPassiveRgbTransfer {
    let direct = max(vec3<f32>(0.0), transmittance_rgb);
    let redirected = max(vec3<f32>(0.0), scattered_toward_receiver_rgb);
    let normalization = vec3<f32>(1.0) /
        max(vec3<f32>(1.0), direct + redirected);
    return HydrometeorPassiveRgbTransfer(
        direct * normalization,
        redirected * normalization,
    );
}

fn hydrometeor_passive_transfer_total(
    transfer: HydrometeorPassiveRgbTransfer,
) -> vec3<f32> {
    let passive = hydrometeor_passive_rgb_transfer(
        transfer.transmittance_rgb,
        transfer.scattered_toward_receiver_rgb,
    );
    return passive.transmittance_rgb + passive.scattered_toward_receiver_rgb;
}

fn hydrometeor_passive_hg(cosine: f32, asymmetry: f32) -> f32 {
    let bounded_cosine = clamp(cosine, -1.0, 1.0);
    let g = clamp(asymmetry, -0.98, 0.98);
    let denominator = 4.0 * HYDROMETEOR_PI * pow(
        max(1e-8, 1.0 + g * g - 2.0 * g * bounded_cosine), 1.5);
    return (1.0 - g * g) / max(1e-8, denominator);
}

fn hydrometeor_passive_spherical_gaussian(
    cosine: f32,
    concentration: f32,
) -> f32 {
    let kappa = clamp(concentration, 1e-4, 28000.0);
    let normalization = kappa / (
        2.0 * HYDROMETEOR_PI * max(1e-8, 1.0 - exp(-2.0 * kappa)));
    return normalization * exp(
        kappa * (clamp(cosine, -1.0, 1.0) - 1.0));
}

// Convex mixtures preserve the unit integral of HG, spherical Gaussian, and
// the broadened HG closure. Glint and multiple scattering redistribute an
// extinction event; neither is an additive light source.
fn hydrometeor_passive_directional_phase(
    cosine: f32,
    asymmetry: f32,
    glint_energy_fraction: f32,
    glint_concentration: f32,
    multiple_scattering_fraction: f32,
) -> f32 {
    let base = hydrometeor_passive_hg(cosine, asymmetry);
    let glint = hydrometeor_passive_spherical_gaussian(
        cosine, glint_concentration);
    let first_order = mix(base, glint,
        hydrometeor_saturate(glint_energy_fraction));
    let broad_order = hydrometeor_passive_hg(
        cosine,
        sign(asymmetry) * pow(abs(clamp(asymmetry, -0.98, 0.98)), 2.0),
    );
    return mix(first_order, broad_order,
        hydrometeor_saturate(multiple_scattering_fraction));
}

fn hydrometeor_parent_coupling_matches(
    record: HydrometeorRecord,
    coupling: HydrometeorParentLightCoupling,
) -> bool {
    return abs(record.identity.z - coupling.parent_system_index) < 0.25 &&
        abs(record.energy_and_importance.w - coupling.parent_layer_index) < 0.25;
}

// Returns sigma_t and sigma_s * angular-incident-radiance. Keeping the source
// coefficient per record is essential: records with different parents cannot
// borrow one another's source visibility before an overlap is integrated.
fn hydrometeor_resolve_passive_source_coefficient(
    record: HydrometeorRecord,
    sample: HydrometeorSample,
    incident: HydrometeorLocalIrradianceAtSample,
    parent: HydrometeorParentLightCoupling,
    sun_cosine: f32,
    moon_cosine: f32,
    glint_concentration: f32,
    upper_hemisphere_phase_integral: f32,
    lower_hemisphere_phase_integral: f32,
) -> HydrometeorPassiveSourceCoefficient {
    let extinction = max(vec3<f32>(0.0), sample.extinction_rgb_km);
    var result = HydrometeorPassiveSourceCoefficient(
        extinction, vec3<f32>(0.0));
    if (!hydrometeor_parent_coupling_matches(record, parent)) {
        // Ownership failure may not make the medium disappear: it still
        // attenuates, but receives no light from the unrelated parent.
        return result;
    }
    let sun_transfer = hydrometeor_passive_rgb_transfer(
        parent.sun.transmittance_rgb,
        parent.sun.scattered_toward_receiver_rgb);
    let moon_transfer = hydrometeor_passive_rgb_transfer(
        parent.moon.transmittance_rgb,
        parent.moon.scattered_toward_receiver_rgb);
    let direct_response = hydrometeor_saturate(
        sample.direct_irradiance_weight);
    let diffuse_response = hydrometeor_saturate(
        sample.diffuse_irradiance_weight);
    let requested_upper_integral = hydrometeor_saturate(
        upper_hemisphere_phase_integral);
    let requested_lower_integral = hydrometeor_saturate(
        lower_hemisphere_phase_integral);
    let phase_integral_normalization = 1.0 / max(
        1.0, requested_upper_integral + requested_lower_integral);
    let upper_integral = requested_upper_integral *
        phase_integral_normalization;
    let lower_integral = requested_lower_integral *
        phase_integral_normalization;
    let sun_phase = hydrometeor_passive_directional_phase(
        sun_cosine,
        sample.asymmetry,
        sample.source_glint_strength,
        glint_concentration,
        sample.multiple_scattering_boost);
    let moon_phase = hydrometeor_passive_directional_phase(
        moon_cosine,
        sample.asymmetry,
        sample.source_glint_strength,
        glint_concentration,
        sample.multiple_scattering_boost);
    let local_sun = max(vec3<f32>(0.0),
        incident.atmosphere_attenuated_sun_irradiance_rgb);
    let local_moon = max(vec3<f32>(0.0),
        incident.atmosphere_attenuated_moon_irradiance_rgb);
    let direct = direct_response * (
        local_sun * sun_transfer.transmittance_rgb * sun_phase +
        local_moon * moon_transfer.transmittance_rgb * moon_phase);
    let redirected_sources = (
        local_sun * sun_transfer.scattered_toward_receiver_rgb +
        local_moon * moon_transfer.scattered_toward_receiver_rgb) *
        (upper_integral / HYDROMETEOR_PI);
    let diffuse_sky = max(vec3<f32>(0.0),
        incident.diffuse_sky_hemisphere_irradiance_rgb) *
        hydrometeor_passive_transfer_total(parent.diffuse_sky) *
        (upper_integral / HYDROMETEOR_PI);
    let ground = max(vec3<f32>(0.0),
        incident.ground_hemisphere_irradiance_rgb) *
        hydrometeor_passive_transfer_total(parent.ground) *
        (lower_integral / HYDROMETEOR_PI);
    let parent_scattering = max(vec3<f32>(0.0),
        parent.phase_convolved_scattering_radiance_rgb) * diffuse_response;
    let source_radiance = direct + diffuse_response * (
        redirected_sources + diffuse_sky + ground) + parent_scattering;
    let albedo = clamp(sample.scattering_albedo_rgb,
        vec3<f32>(0.0), vec3<f32>(1.0));
    result.source_coefficient_rgb_km = extinction * albedo * source_radiance;
    return result;
}

fn hydrometeor_empty_passive_overlap() -> HydrometeorPassiveOverlap {
    return HydrometeorPassiveOverlap(vec3<f32>(0.0), vec3<f32>(0.0));
}

fn hydrometeor_accumulate_passive_overlap(
    accumulated: HydrometeorPassiveOverlap,
    source: HydrometeorPassiveSourceCoefficient,
) -> HydrometeorPassiveOverlap {
    return HydrometeorPassiveOverlap(
        accumulated.extinction_rgb_km + source.extinction_rgb_km,
        accumulated.source_coefficient_rgb_km +
            source.source_coefficient_rgb_km,
    );
}

// Exact analytic homogeneous-segment solution. The central marcher adds
// camera_T * radiance_rgb, then multiplies camera_T by transmittance_rgb.
fn hydrometeor_integrate_passive_overlap(
    overlap: HydrometeorPassiveOverlap,
    distance_km: f32,
) -> HydrometeorPassiveSegment {
    let extinction = max(vec3<f32>(0.0), overlap.extinction_rgb_km);
    let segment_transmittance = exp(-extinction * max(0.0, distance_km));
    let source_function = overlap.source_coefficient_rgb_km /
        max(vec3<f32>(1e-8), extinction);
    return HydrometeorPassiveSegment(
        source_function * (vec3<f32>(1.0) - segment_transmittance),
        segment_transmittance,
    );
}

fn hydrometeor_smooth_edge(radius: f32, transition: f32) -> f32 {
    let width = max(0.01, transition);
    return 1.0 - smoothstep(1.0 - width, 1.0 + width, radius);
}

// Compact C2 radial basis: finite support with zero value and slope at its
// boundary. This gives fallstreak groups natural closed boundaries without a
// rectangular clip or a full-field alpha mask.
fn hydrometeor_compact_c2(distance: f32) -> f32 {
    let remainder = hydrometeor_saturate(1.0 - distance);
    return remainder * remainder * remainder * remainder *
        (1.0 + 4.0 * max(0.0, distance));
}

fn hydrometeor_channel_hash(seed: f32, lane: f32) -> f32 {
    return fract(sin(seed * 113.17 + lane * 71.43) * 43758.5453123);
}

// World-space reconstruction of a finite group of independently curved
// precipitation trails. The main wind/terminal-velocity displacement is
// applied to the field center before this function; these small offsets model
// differential size sorting and turbulent deformation within that slanted
// shaft. Every channel starts beneath the parent extraction patch, narrows as
// it evaporates, and terminates with a compact boundary aloft.
fn hydrometeor_fallstreak_channel_weight(
    record: HydrometeorRecord,
    local: vec2<f32>,
    vertical: f32,
) -> f32 {
    let descent = 1.0 - vertical;
    var strongest = 0.0;
    var accumulated = 0.0;
    for (var lane = 0u; lane < 7u; lane += 1u) {
        let lane_number = f32(lane + 1u);
        let random_a = hydrometeor_channel_hash(
            record.source_boundary.w, lane_number * 3.0 + 1.0);
        let random_b = hydrometeor_channel_hash(
            record.source_boundary.w, lane_number * 3.0 + 2.0);
        let random_c = hydrometeor_channel_hash(
            record.source_boundary.w, lane_number * 3.0 + 3.0);
        let enabled = select(
            0.0,
            1.0,
            random_c < mix(0.38, 0.92, record.morphology.w),
        );
        let source_angle = random_a * HYDROMETEOR_PI * 2.0;
        let source_radius = sqrt(random_b) * 0.52;
        let source = vec2<f32>(cos(source_angle), sin(source_angle)) *
            source_radius;
        let differential_shear = (random_c - 0.5) *
            mix(0.12, 0.34, record.morphology.y);
        let curvature = sin(
            descent * HYDROMETEOR_PI * mix(0.65, 1.35, random_b) +
            random_a * HYDROMETEOR_PI * 2.0,
        ) * differential_shear * pow(descent, 1.35);
        let channel_center = source + vec2<f32>(
            differential_shear * 0.36 * pow(descent, 1.6),
            curvature,
        );
        let width = mix(0.075, 0.16, random_b) *
            mix(1.0, 0.48, descent);
        let aspect = mix(0.7, 1.22, random_a);
        let channel_distance = length(
            (local - channel_center) /
            max(vec2<f32>(0.025), vec2<f32>(width, width * aspect)),
        );
        let channel = hydrometeor_compact_c2(channel_distance) *
            mix(0.48, 1.0, random_c) * enabled;
        strongest = max(strongest, channel);
        accumulated += channel;
    }
    let connected_channels = strongest + 0.24 *
        clamp(accumulated - strongest, 0.0, 1.0);
    let source_emergence = smoothstep(0.0, 0.075, descent);
    let terminal_taper = smoothstep(0.0, 0.24, vertical);
    return hydrometeor_saturate(
        connected_channels * source_emergence * terminal_taper
    );
}

struct HydrometeorPrecipitationTopology {
    lanes: u32,
    along_width: vec2<f32>,
    cross_width: vec2<f32>,
    source_radius: f32,
    curvature: f32,
    overlap: f32,
    activation: f32,
};

fn hydrometeor_precipitation_topology(kind: u32) -> HydrometeorPrecipitationTopology {
    // Kind codes are packed by hydrometeor-system.ts. Widths are normalized to
    // each finite generating-cell ellipse, not camera or screen coordinates.
    if (kind == 0u) { return HydrometeorPrecipitationTopology(
        12u, vec2<f32>(0.34, 0.62), vec2<f32>(0.09, 0.19),
        0.6, 0.08, 0.52, 0.92); } // drizzle: many close fine veils
    if (kind == 1u) { return HydrometeorPrecipitationTopology(
        9u, vec2<f32>(0.3, 0.58), vec2<f32>(0.08, 0.17),
        0.6, 0.13, 0.34, 0.82); } // stratiform rain bands
    if (kind == 2u) { return HydrometeorPrecipitationTopology(
        6u, vec2<f32>(0.15, 0.3), vec2<f32>(0.13, 0.27),
        0.42, 0.22, 0.3, 0.76); } // convective shower cores
    if (kind == 9u) { return HydrometeorPrecipitationTopology(
        10u, vec2<f32>(0.09, 0.22), vec2<f32>(0.055, 0.13),
        0.68, 0.3, 0.18, 0.72); } // individual snow crystals
    if (kind == 3u) { return HydrometeorPrecipitationTopology(
        8u, vec2<f32>(0.14, 0.31), vec2<f32>(0.12, 0.26),
        0.7, 0.42, 0.25, 0.76); } // fluttering aggregates
    if (kind == 4u) { return HydrometeorPrecipitationTopology(
        4u, vec2<f32>(0.11, 0.24), vec2<f32>(0.1, 0.22),
        0.34, 0.08, 0.12, 0.72); } // compact hail cores
    if (kind == 10u) { return HydrometeorPrecipitationTopology(
        7u, vec2<f32>(0.2, 0.4), vec2<f32>(0.07, 0.16),
        0.58, 0.16, 0.26, 0.78); } // refrozen pellet bands
    if (kind == 11u) { return HydrometeorPrecipitationTopology(
        11u, vec2<f32>(0.24, 0.48), vec2<f32>(0.07, 0.15),
        0.62, 0.12, 0.4, 0.86); } // drizzle-like snow grains
    if (kind == 12u) { return HydrometeorPrecipitationTopology(
        5u, vec2<f32>(0.13, 0.28), vec2<f32>(0.11, 0.25),
        0.46, 0.24, 0.2, 0.76); } // snow-pellet showers
    return HydrometeorPrecipitationTopology(
        7u, vec2<f32>(0.16, 0.34), vec2<f32>(0.1, 0.22),
        0.56, 0.2, 0.25, 0.75);
}

fn hydrometeor_precipitation_topology_weight(
    record: HydrometeorRecord,
    local: vec2<f32>,
    vertical: f32,
    time_seconds: f32,
) -> f32 {
    let topology = hydrometeor_precipitation_topology(
        u32(record.identity.y + 0.5));
    let descent = 1.0 - vertical;
    let shower = u32(record.identity.w + 0.5) == 3u;
    // identity.x == 2 marks a storm-owned source graph while preserving the
    // existing active-record ABI (all positive values remain active). Only
    // those records let resolved shear/clustering alter internal channels;
    // every non-Cb precipitation byte and evaluation path stays unchanged.
    let storm_owned = record.identity.x > 1.5;
    let storm_curvature_scale = select(
        1.0,
        mix(0.72, 1.58, hydrometeor_saturate(record.morphology.y)),
        storm_owned,
    );
    let storm_activation = select(
        topology.activation,
        clamp(topology.activation * mix(
            0.82, 1.12, hydrometeor_saturate(record.morphology.w)), 0.42, 0.98),
        storm_owned,
    );
    var strongest = 0.0;
    var accumulated = 0.0;
    for (var lane = 0u; lane < 12u; lane += 1u) {
        if (lane >= topology.lanes) { continue; }
        let lane_number = f32(lane + 1u);
        let random_a = hydrometeor_channel_hash(
            record.source_boundary.w + 0.137, lane_number * 5.0 + 1.0);
        let random_b = hydrometeor_channel_hash(
            record.source_boundary.w + 0.137, lane_number * 5.0 + 2.0);
        let random_c = hydrometeor_channel_hash(
            record.source_boundary.w + 0.137, lane_number * 5.0 + 3.0);
        let random_d = hydrometeor_channel_hash(
            record.source_boundary.w + 0.137, lane_number * 5.0 + 4.0);
        if (random_d > storm_activation) { continue; }
        let source_angle = random_a * HYDROMETEOR_PI * 2.0;
        let source_radius = sqrt(random_b) * topology.source_radius;
        let source = vec2<f32>(cos(source_angle), sin(source_angle)) *
            source_radius;
        let size_sorting = (random_c - 0.5) * topology.curvature *
            storm_curvature_scale;
        let flutter = sin(
            descent * HYDROMETEOR_PI * mix(0.7, 1.8, random_b) +
            random_a * HYDROMETEOR_PI * 2.0,
        ) * size_sorting * pow(descent, 1.25);
        let storm_shear = select(
            0.0,
            (random_b - 0.5) * record.morphology.y * 0.22 *
                pow(descent, 1.65),
            storm_owned,
        );
        let channel_center = source + vec2<f32>(
            size_sorting * 0.28 * pow(descent, 1.4) + storm_shear,
            flutter - storm_shear * 0.37);
        let along_width = mix(
            topology.along_width.x, topology.along_width.y, random_c);
        let cross_width = mix(
            topology.cross_width.x, topology.cross_width.y, random_b);
        let width_scale = select(
            mix(1.0, 0.82, descent),
            mix(0.86, 1.18, descent),
            shower,
        );
        let distance = length(
            (local - channel_center) / max(
                vec2<f32>(0.03, 0.025),
                vec2<f32>(along_width, cross_width) * width_scale));
        let temporal = mix(
            1.0,
            0.72 + 0.28 * (0.5 + 0.5 * sin(
                time_seconds * mix(0.025, 0.11, random_c) +
                descent * mix(2.4, 7.5, random_b) +
                random_a * HYDROMETEOR_PI * 2.0)),
            record.morphology.z,
        );
        let lane_weight = hydrometeor_compact_c2(distance) *
            mix(0.55, 1.0, random_d) * temporal;
        strongest = max(strongest, lane_weight);
        accumulated += lane_weight;
    }
    let source_emergence = smoothstep(0.0, 0.045, descent);
    let storm_overlap = select(
        topology.overlap,
        topology.overlap * mix(0.72, 1.06,
            hydrometeor_saturate(record.morphology.w)),
        storm_owned,
    );
    return hydrometeor_saturate((strongest + storm_overlap *
        clamp(accumulated - strongest, 0.0, 1.0)) * source_emergence);
}

struct HydrometeorSurfaceTopology {
    lobes: u32,
    horizontal_width: vec2<f32>,
    vertical_width: vec2<f32>,
    activation: f32,
    overlap: f32,
};

fn hydrometeor_surface_topology(kind: u32) -> HydrometeorSurfaceTopology {
    if (kind == 7u) { return HydrometeorSurfaceTopology(
        10u, vec2<f32>(0.34, 0.68), vec2<f32>(0.3, 0.62), 0.96, 0.58); }
    if (kind == 8u) { return HydrometeorSurfaceTopology(
        9u, vec2<f32>(0.2, 0.48), vec2<f32>(0.2, 0.48), 0.82, 0.34); }
    if (kind == 13u) { return HydrometeorSurfaceTopology(
        9u, vec2<f32>(0.28, 0.56), vec2<f32>(0.24, 0.5), 0.9, 0.48); }
    return HydrometeorSurfaceTopology(
        11u, vec2<f32>(0.1, 0.28), vec2<f32>(0.1, 0.3), 0.68, 0.12);
}

fn hydrometeor_surface_topology_weight(
    record: HydrometeorRecord,
    local: vec2<f32>,
    vertical: f32,
    time_seconds: f32,
) -> f32 {
    let topology = hydrometeor_surface_topology(u32(record.identity.y + 0.5));
    var strongest = 0.0;
    var accumulated = 0.0;
    for (var lobe = 0u; lobe < 11u; lobe += 1u) {
        if (lobe >= topology.lobes) { continue; }
        let lobe_number = f32(lobe + 1u);
        let random_a = hydrometeor_channel_hash(
            record.source_boundary.w + 0.419, lobe_number * 5.0 + 1.0);
        let random_b = hydrometeor_channel_hash(
            record.source_boundary.w + 0.419, lobe_number * 5.0 + 2.0);
        let random_c = hydrometeor_channel_hash(
            record.source_boundary.w + 0.419, lobe_number * 5.0 + 3.0);
        let random_d = hydrometeor_channel_hash(
            record.source_boundary.w + 0.419, lobe_number * 5.0 + 4.0);
        if (random_d > topology.activation) { continue; }
        let angle = random_a * HYDROMETEOR_PI * 2.0;
        let radius = sqrt(random_b) * 0.58;
        let center = vec2<f32>(cos(angle), sin(angle)) * radius;
        let center_vertical = select(
            mix(0.12, 0.58, random_c), 0.0, lobe < 2u);
        let horizontal_width = mix(
            topology.horizontal_width.x, topology.horizontal_width.y, random_c);
        let vertical_width = mix(
            topology.vertical_width.x, topology.vertical_width.y, random_b);
        let drift = sin(
            time_seconds * mix(0.008, 0.026, random_c) +
            random_a * HYDROMETEOR_PI * 2.0,
        ) * record.morphology.y * 0.08;
        let horizontal_distance = vec2<f32>(
            (local.x - center.x - drift) / horizontal_width,
            (local.y - center.y + drift * 0.7) /
                (horizontal_width * mix(0.72, 1.18, random_a)),
        );
        let distance = length(vec3<f32>(
            horizontal_distance,
            (vertical - center_vertical) / vertical_width));
        let cell = hydrometeor_compact_c2(distance) *
            mix(0.58, 1.0, random_d);
        strongest = max(strongest, cell);
        accumulated += cell;
    }
    return hydrometeor_saturate(strongest + topology.overlap *
        clamp(accumulated - strongest, 0.0, 1.0));
}

fn hydrometeor_sample_record(
    record: HydrometeorRecord,
    position_east_altitude_north_km: vec3<f32>,
    view_distance_km: f32,
    time_seconds: f32,
) -> HydrometeorSample {
    var result = hydrometeor_empty_sample();
    if (record.identity.x < 0.5) { return result; }

    let render_class = u32(record.identity.w + 0.5);
    let top_km = record.source_geometry.y;
    let bottom_km = record.source_geometry.z;
    let altitude_km = position_east_altitude_north_km.y;
    if (altitude_km < bottom_km || altitude_km > top_km) { return result; }
    let vertical = hydrometeor_saturate(
        (altitude_km - bottom_km) / max(0.001, top_km - bottom_km),
    );

    let terminal_velocity = max(0.05, record.kinematics.z);
    let fall_time = select(
        (top_km - altitude_km) * 1000.0 / terminal_velocity,
        0.0,
        render_class == 2u,
    );
    // kinematics.xy is already an Earth-local [east,north] vector produced
    // from the cloud east-angle wind ABI; do not reinterpret it as a compass
    // bearing here.
    let wind_displacement_km = record.kinematics.xy * fall_time / 1000.0;
    // This low-amplitude displacement de-correlates a moving curtain without
    // translating the source away from its parent cloud. It is not a generic
    // full-screen noise field.
    let turbulence_phase = time_seconds * (0.07 + record.source_boundary.z * 0.13) +
        record.source_boundary.w * 41.0;
    let turbulent_displacement_km = vec2<f32>(
        sin(turbulence_phase),
        cos(turbulence_phase * 0.73),
    ) * record.kinematics.w * 0.0008;
    let center = record.source_center_extent.xy + wind_displacement_km +
        turbulent_displacement_km;
    let delta = position_east_altitude_north_km.xz - center;
    // Cloud horizontal-angle ABI: zero points +east and positive angles turn
    // toward +north. Use the same major/cross basis as cloud shaders and the
    // CPU evaluator: major=[cos(theta),sin(theta)], cross=[-sin(theta),cos(theta)].
    let orientation_sine = sin(record.source_geometry.x);
    let orientation_cosine = cos(record.source_geometry.x);
    let vertical_radius_scale = mix(max(0.2, record.morphology.x), 1.0, vertical);
    let local = vec2<f32>(
        dot(delta, vec2<f32>(orientation_cosine, orientation_sine)),
        dot(delta, vec2<f32>(-orientation_sine, orientation_cosine)),
    ) / max(record.source_center_extent.zw * vertical_radius_scale, vec2<f32>(0.001));
    let theta = atan2(local.y, local.x);
    let boundary = 1.0 +
        record.source_boundary.x * cos(theta * 3.0 + record.source_boundary.w * 6.28) +
        record.source_boundary.y * sin(theta * 5.0 - record.source_boundary.w * 3.14);
    let radial = length(local) / max(0.7, boundary);
    var horizontal_weight = hydrometeor_smooth_edge(
        radial,
        record.source_geometry.w,
    );
    if (render_class == 0u) {
        horizontal_weight *= hydrometeor_fallstreak_channel_weight(
            record,
            local,
            vertical,
        );
    } else if (render_class == 2u) {
        horizontal_weight *= hydrometeor_surface_topology_weight(
            record, local, vertical, time_seconds);
    } else {
        horizontal_weight *= hydrometeor_precipitation_topology_weight(
            record, local, vertical, time_seconds);
    }
    if (horizontal_weight <= 0.0001) { return result; }

    var profile = mix(
        record.evaporation.w,
        1.0,
        pow(vertical, max(0.1, record.evaporation.z)),
    );
    if (render_class == 2u) {
        // Fog remains attached to the surface and loses condensate through a
        // broad entraining cap instead of forming a horizontally uniform slab.
        let cap = hydrometeor_saturate((vertical - 0.68) / 0.32);
        profile = 1.0 - cap * cap;
    }
    // Species topology carries independently phased vertical evolution.
    // A record-wide altitude wave would reintroduce horizontal bands.
    let vertical_structure = 1.0;
    let intermittency_wave = 0.5 + 0.5 * sin(
        time_seconds * (0.035 + record.morphology.z * 0.08) +
        record.source_boundary.w * 53.0 + vertical * 4.7,
    );
    let temporal_structure = mix(1.0, mix(0.58, 1.0, intermittency_wave),
        record.morphology.z);
    profile *= max(0.2, vertical_structure) * temporal_structure;
    let source_weight = horizontal_weight * profile * record.extinction.w;

    let maximum_resolvable_distance_km = record.particle_rendering.x;
    var sparse_mix = 0.0;
    if (maximum_resolvable_distance_km > 0.0) {
        sparse_mix = hydrometeor_saturate(
            (maximum_resolvable_distance_km * 1.25 - view_distance_km) /
            max(0.001, maximum_resolvable_distance_km * 0.65),
        );
    }
    let sparse_energy = record.energy_and_importance.y * sparse_mix;
    let volume_energy = 1.0 - sparse_energy;
    // Until a sparse draw pass is bound, retain the full participating-medium
    // energy. The partition remains available so that pass can replace (not
    // add to) this fraction when enabled by the renderer.
    result.extinction_rgb_km = record.extinction.xyz * source_weight;
    result.scattering_albedo_rgb = record.scattering.xyz;
    result.asymmetry = record.scattering.w;
    result.liquid_fraction = mix(
        record.phase_transition.y,
        record.phase_transition.x,
        vertical,
    );
    if (u32(record.phase_path.w + 0.5) == 3u) {
        let warm_bottom = record.phase_path.x;
        let warm_top = max(warm_bottom + 0.001, record.phase_path.y);
        let warm_melt = 1.0 - smoothstep(warm_bottom, warm_top, altitude_km);
        let refreeze = 1.0 - smoothstep(
            max(bottom_km, warm_bottom - max(0.001, record.phase_path.z)),
            warm_bottom,
            altitude_km,
        );
        result.liquid_fraction = hydrometeor_saturate(warm_melt * (1.0 - refreeze));
    }
    result.volumetric_energy_fraction = volume_energy;
    result.sparse_particle_energy_fraction = sparse_energy;
    result.source_weight = source_weight;
    result.direct_irradiance_weight = hydrometeor_saturate(
        record.lighting_response.x);
    result.diffuse_irradiance_weight = hydrometeor_saturate(
        record.lighting_response.y);
    result.source_glint_strength = hydrometeor_saturate(
        record.lighting_response.z);
    result.multiple_scattering_boost = hydrometeor_saturate(
        record.lighting_response.w);
    result.parent_system_index = record.identity.z;
    result.parent_layer_index = record.energy_and_importance.w;
    return result;
}

fn hydrometeor_particle_hash(value: u32) -> f32 {
    var state = value;
    state ^= state >> 16u;
    state *= 0x7feb352du;
    state ^= state >> 15u;
    state *= 0x846ca68bu;
    state ^= state >> 16u;
    return f32(state) / 4294967296.0;
}

// This remains camera-local but not screen-space: the caller identifies a
// deterministic particle and supplies physical source/view alignment.
fn hydrometeor_near_particle_appearance(
    record: HydrometeorRecord,
    particle_index: u32,
    view_distance_km: f32,
    source_alignment: f32,
) -> HydrometeorNearParticleAppearance {
    var result: HydrometeorNearParticleAppearance;
    let seed = u32(record.source_boundary.w * 4294967295.0) ^
        (particle_index * 747796405u);
    let random_a = hydrometeor_particle_hash(seed);
    let random_b = hydrometeor_particle_hash(seed ^ 0x9e3779b9u);
    let random_c = hydrometeor_particle_hash(seed ^ 0x85ebca6bu);
    let spectrum_coordinate = (random_a + random_b + random_c) / 3.0;
    result.diameter_mm = exp(mix(
        log(max(0.001, record.distribution.z)),
        log(max(record.distribution.z, record.distribution.w)),
        spectrum_coordinate,
    ));
    let resolve_distance = record.particle_rendering.x;
    result.visible = select(0.0, 1.0,
        resolve_distance > 0.0 && view_distance_km <= resolve_distance * 1.25);
    result.habit_code = record.particle_shape.x;
    result.exposure_track_length_m = max(
        result.diameter_mm * 0.001,
        record.particle_rendering.y,
    );
    result.orientation_radians = (random_b - 0.5) * HYDROMETEOR_PI *
        record.particle_shape.z;
    result.optical_energy = result.visible * record.energy_and_importance.y;
    let glint_width = max(0.015, record.particle_shape.z * 0.35);
    let aligned = hydrometeor_saturate((source_alignment + 1.0) * 0.5);
    result.source_glint_weight = result.visible * record.lighting_response.z *
        exp(-pow((1.0 - aligned) / glint_width, 2.0));
    result.padding = 0.0;
    result.velocity_east_altitude_north_mps = vec3<f32>(
        record.kinematics.x,
        -record.kinematics.z,
        record.kinematics.y,
    );
    return result;
}

fn hydrometeor_accumulate_sample(
    accumulated: HydrometeorSample,
    sample: HydrometeorSample,
) -> HydrometeorSample {
    var result = accumulated;
    let previous_scattering = accumulated.extinction_rgb_km *
        accumulated.scattering_albedo_rgb;
    let added_scattering = sample.extinction_rgb_km * sample.scattering_albedo_rgb;
    let total_scattering = previous_scattering + added_scattering;
    let total_scattering_scalar = max(1e-6,
        dot(total_scattering, vec3<f32>(0.2126, 0.7152, 0.0722)));
    let previous_weight = dot(previous_scattering,
        vec3<f32>(0.2126, 0.7152, 0.0722));
    let added_weight = dot(added_scattering,
        vec3<f32>(0.2126, 0.7152, 0.0722));
    result.extinction_rgb_km += sample.extinction_rgb_km;
    result.scattering_albedo_rgb = total_scattering /
        max(result.extinction_rgb_km, vec3<f32>(1e-6));
    result.asymmetry = (accumulated.asymmetry * previous_weight +
        sample.asymmetry * added_weight) / total_scattering_scalar;
    result.liquid_fraction = (accumulated.liquid_fraction * previous_weight +
        sample.liquid_fraction * added_weight) / total_scattering_scalar;
    result.volumetric_energy_fraction = max(
        accumulated.volumetric_energy_fraction,
        sample.volumetric_energy_fraction,
    );
    result.sparse_particle_energy_fraction = max(
        accumulated.sparse_particle_energy_fraction,
        sample.sparse_particle_energy_fraction,
    );
    result.source_weight += sample.source_weight;
    result.direct_irradiance_weight = max(
        accumulated.direct_irradiance_weight,
        sample.direct_irradiance_weight,
    );
    result.diffuse_irradiance_weight = max(
        accumulated.diffuse_irradiance_weight,
        sample.diffuse_irradiance_weight,
    );
    result.source_glint_strength = max(
        accumulated.source_glint_strength,
        sample.source_glint_strength,
    );
    result.multiple_scattering_boost = max(
        accumulated.multiple_scattering_boost,
        sample.multiple_scattering_boost,
    );
    if (accumulated.source_weight <= 0.0) {
        result.parent_system_index = sample.parent_system_index;
        result.parent_layer_index = sample.parent_layer_index;
    } else if (abs(accumulated.parent_system_index -
            sample.parent_system_index) >= 0.25 ||
        abs(accumulated.parent_layer_index - sample.parent_layer_index) >= 0.25) {
        // -2 explicitly means that an aggregate spans owners. Radiometry must
        // then use the record-local passive source hook rather than inheriting
        // a single dominant parent's light.
        result.parent_system_index = -2.0;
        result.parent_layer_index = -2.0;
    }
    return result;
}
`;

/**
 * Emit the bounded loop separately because the storage variable name is chosen
 * by the host renderer. The result supplies optical coefficients, not color.
 */
export const createHydrometeorAccumulatorWgsl = (
    variableName = "hydrometeor_fields",
) => /* wgsl */ `
fn hydrometeor_sample_all(
    position_east_altitude_north_km: vec3<f32>,
    view_distance_km: f32,
    time_seconds: f32,
) -> HydrometeorSample {
    var result = hydrometeor_empty_sample();
    let count = min(u32(${variableName}.header.x + 0.5), HYDROMETEOR_MAX_FIELDS);
    for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
        if (index >= count) { break; }
        let sample = hydrometeor_sample_record(
            ${variableName}.records[index],
            position_east_altitude_north_km,
            view_distance_km,
            time_seconds,
        );
        result = hydrometeor_accumulate_sample(result, sample);
    }
    return result;
}
`;

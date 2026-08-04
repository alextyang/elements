import {
    DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA,
    DIRECTIONAL_SKY_ALTITUDE_NODES_KM,
    DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT,
    DIRECTIONAL_SKY_MAX_ALTITUDE_NODES,
    DIRECTIONAL_SKY_MAX_SOURCE_LOBES,
} from "./directional-atmosphere-cloud-lighting.ts";

/**
 * Binding-free reference evaluators for directional atmosphere/cloud coupling.
 * CPU validation and prefiltering remain authoritative; consumers supply the
 * packed lobes, passive transfer, and atmosphere-transported TOA irradiance.
 */
export const DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL = /* wgsl */ `
const COUPLING_SCHEMA: u32 = ${DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA}u;
const COUPLING_PI: f32 = 3.141592653589793;
const COUPLING_TAU: f32 = 6.283185307179586;
const COUPLING_DIFFUSE_LOBE_COUNT: u32 = ${DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT}u;
const COUPLING_MAX_SOURCE_LOBES: u32 = ${DIRECTIONAL_SKY_MAX_SOURCE_LOBES}u;
const COUPLING_MAX_ALTITUDE_NODES: u32 = ${DIRECTIONAL_SKY_MAX_ALTITUDE_NODES}u;
const COUPLING_ALTITUDE_NODE_COUNT: u32 = ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.length}u;
const COUPLING_ALTITUDE_NODES_KM = array<f32, ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.length}>(
    ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.map((altitude) => `${altitude.toFixed(2)}`).join(", ")}
);

// Two RGBA texels. axis_shape.w >= 0 is spherical-Gaussian sharpness;
// axis_shape.w < 0 stores minus the horizon elevation sigma in radians.
struct CouplingSkyLobe {
    axis_shape: vec4<f32>,
    integrated_radiance_normalization: vec4<f32>,
};

struct CouplingHemisphereIrradiance {
    upper_rgb: vec3<f32>,
    lower_rgb: vec3<f32>,
};

struct CouplingPassiveCloudTransfer {
    transmittance_rgb: vec3<f32>,
    scattered_toward_receiver_rgb: vec3<f32>,
};

struct CouplingGroundDirectSource {
    atmosphere_transported_irradiance_rgb: vec3<f32>,
    cloud_transfer: CouplingPassiveCloudTransfer,
};

struct CouplingGroundBounceSample {
    incident_ground_irradiance_rgb: vec3<f32>,
    reflected_ground_flux_rgb: vec3<f32>,
    lambertian_ground_radiance_rgb: vec3<f32>,
    lower_hemisphere_irradiance_at_sample_rgb: vec3<f32>,
};

struct CouplingAerialMedium {
    extinction_rgb_per_km: vec3<f32>,
    scattering_rgb_per_km: vec3<f32>,
};

struct CouplingAerialDirectSource {
    atmosphere_transported_irradiance_rgb: vec3<f32>,
    phase_rgb_per_steradian: vec3<f32>,
    cloud_transfer: CouplingPassiveCloudTransfer,
};

struct CouplingAerialSourceSample {
    extinction_rgb_per_km: vec3<f32>,
    source_radiance_coefficient_rgb_per_km: vec3<f32>,
    unshadowed_source_radiance_coefficient_rgb_per_km: vec3<f32>,
    removed_by_cloud_rgb_per_km: vec3<f32>,
};

struct CouplingAerialStep {
    radiance_rgb: vec3<f32>,
    transmittance_rgb: vec3<f32>,
};

fn coupling_safe_normalize(value: vec3<f32>) -> vec3<f32> {
    let magnitude = length(value);
    if (magnitude > 1e-12) { return value / magnitude; }
    return vec3<f32>(0.0, 1.0, 0.0);
}

// Fractional row coordinate in the nonlinear physical-altitude profile.  The
// returned value is in node-index space; texture owners convert it to texel
// coordinates for their packed layout.
fn coupling_altitude_node_coordinate(altitude_km_input: f32) -> f32 {
    let altitude_km = max(0.0, altitude_km_input);
    var lower_index = 0u;
    for (var index = 1u; index < COUPLING_ALTITUDE_NODE_COUNT; index += 1u) {
        if (altitude_km < COUPLING_ALTITUDE_NODES_KM[index]) { break; }
        lower_index = index;
    }
    let upper_index = min(COUPLING_ALTITUDE_NODE_COUNT - 1u, lower_index + 1u);
    if (upper_index == lower_index) { return f32(lower_index); }
    let lower_altitude = COUPLING_ALTITUDE_NODES_KM[lower_index];
    let upper_altitude = COUPLING_ALTITUDE_NODES_KM[upper_index];
    let fraction = clamp(
        (altitude_km - lower_altitude) /
            max(1e-6, upper_altitude - lower_altitude),
        0.0,
        1.0,
    );
    return f32(lower_index) + fraction;
}

fn coupling_spherical_gaussian(
    axis: vec3<f32>, direction: vec3<f32>, sharpness_input: f32,
) -> f32 {
    let sharpness = clamp(sharpness_input, 0.0, 128.0);
    let cosine = clamp(dot(coupling_safe_normalize(axis),
        coupling_safe_normalize(direction)), -1.0, 1.0);
    return exp(sharpness * (cosine - 1.0));
}

fn coupling_horizon_kernel(
    local_up: vec3<f32>, direction: vec3<f32>, width_radians_input: f32,
) -> f32 {
    let width_radians = clamp(width_radians_input,
        COUPLING_PI / 360.0, COUPLING_PI * 0.45);
    let elevation = asin(clamp(dot(coupling_safe_normalize(local_up),
        coupling_safe_normalize(direction)), -1.0, 1.0));
    return exp(-0.5 * pow(elevation / width_radians, 2.0));
}

fn coupling_directional_sky_lobe_radiance(
    lobe: CouplingSkyLobe,
    direction: vec3<f32>,
) -> vec3<f32> {
    let encoded_shape = lobe.axis_shape.w;
    var kernel = 0.0;
    if (encoded_shape < 0.0) {
        kernel = coupling_horizon_kernel(
            lobe.axis_shape.xyz, direction, -encoded_shape);
    } else {
        kernel = coupling_spherical_gaussian(
            lobe.axis_shape.xyz, direction, encoded_shape);
    }
    return max(vec3<f32>(0.0),
        lobe.integrated_radiance_normalization.xyz * kernel /
        max(1e-12, lobe.integrated_radiance_normalization.w));
}

fn coupling_interpolate_hemisphere_irradiance(
    lower: CouplingHemisphereIrradiance,
    upper: CouplingHemisphereIrradiance,
    altitude_fraction: f32,
) -> CouplingHemisphereIrradiance {
    let amount = clamp(altitude_fraction, 0.0, 1.0);
    return CouplingHemisphereIrradiance(
        mix(lower.upper_rgb, upper.upper_rgb, amount),
        mix(lower.lower_rgb, upper.lower_rgb, amount));
}

fn coupling_effective_passive_transfer(
    transfer: CouplingPassiveCloudTransfer,
) -> vec3<f32> {
    return min(vec3<f32>(1.0),
        clamp(transfer.transmittance_rgb, vec3<f32>(0.0), vec3<f32>(1.0)) +
        clamp(transfer.scattered_toward_receiver_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)));
}

fn coupling_ground_diffuse_arrival(
    upper_sky_irradiance_rgb: vec3<f32>,
    cloud_transfer: CouplingPassiveCloudTransfer,
) -> vec3<f32> {
    return max(vec3<f32>(0.0), upper_sky_irradiance_rgb) *
        coupling_effective_passive_transfer(cloud_transfer);
}

fn coupling_ground_direct_arrival(
    source: CouplingGroundDirectSource,
) -> vec3<f32> {
    return max(vec3<f32>(0.0),
        source.atmosphere_transported_irradiance_rgb) *
        clamp(source.cloud_transfer.transmittance_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0));
}

fn coupling_cloud_shadowed_ground_bounce(
    upper_sky_irradiance_rgb: vec3<f32>,
    diffuse_cloud_transfer: CouplingPassiveCloudTransfer,
    direct_source_0: CouplingGroundDirectSource,
    direct_source_1: CouplingGroundDirectSource,
    ground_albedo_rgb: vec3<f32>,
    ground_to_sample_atmosphere_transmittance_rgb: vec3<f32>,
    ground_view_factor: f32,
) -> CouplingGroundBounceSample {
    let incident = coupling_ground_diffuse_arrival(
        upper_sky_irradiance_rgb, diffuse_cloud_transfer) +
        coupling_ground_direct_arrival(direct_source_0) +
        coupling_ground_direct_arrival(direct_source_1);
    let reflected_flux = incident * clamp(
        ground_albedo_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let ground_radiance = reflected_flux / COUPLING_PI;
    let lower_at_sample = reflected_flux * clamp(
        ground_to_sample_atmosphere_transmittance_rgb,
        vec3<f32>(0.0), vec3<f32>(1.0)) *
        clamp(ground_view_factor, 0.0, 1.0);
    return CouplingGroundBounceSample(
        incident, reflected_flux, ground_radiance, lower_at_sample);
}

fn coupling_aerial_direct_incident(
    source: CouplingAerialDirectSource,
) -> vec3<f32> {
    return max(vec3<f32>(0.0),
        source.atmosphere_transported_irradiance_rgb) *
        max(vec3<f32>(0.0), source.phase_rgb_per_steradian) *
        clamp(source.cloud_transfer.transmittance_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0));
}

fn coupling_aerial_unshadowed_direct_incident(
    source: CouplingAerialDirectSource,
) -> vec3<f32> {
    return max(vec3<f32>(0.0),
        source.atmosphere_transported_irradiance_rgb) *
        max(vec3<f32>(0.0), source.phase_rgb_per_steradian);
}

fn coupling_aerial_source(
    medium: CouplingAerialMedium,
    phase_integrated_diffuse_radiance_rgb: vec3<f32>,
    diffuse_cloud_transfer: CouplingPassiveCloudTransfer,
    direct_source_0: CouplingAerialDirectSource,
    direct_source_1: CouplingAerialDirectSource,
) -> CouplingAerialSourceSample {
    let diffuse = max(vec3<f32>(0.0),
        phase_integrated_diffuse_radiance_rgb);
    let unshadowed_incident = diffuse +
        coupling_aerial_unshadowed_direct_incident(direct_source_0) +
        coupling_aerial_unshadowed_direct_incident(direct_source_1);
    let coupled_incident = diffuse *
        coupling_effective_passive_transfer(diffuse_cloud_transfer) +
        coupling_aerial_direct_incident(direct_source_0) +
        coupling_aerial_direct_incident(direct_source_1);
    let extinction = max(vec3<f32>(0.0), medium.extinction_rgb_per_km);
    let scattering = min(extinction,
        max(vec3<f32>(0.0), medium.scattering_rgb_per_km));
    let coupled_coefficient = scattering * coupled_incident;
    let unshadowed_coefficient = scattering * unshadowed_incident;
    return CouplingAerialSourceSample(
        extinction,
        coupled_coefficient,
        unshadowed_coefficient,
        max(vec3<f32>(0.0), unshadowed_coefficient - coupled_coefficient));
}

fn coupling_integrate_aerial_step(
    source: CouplingAerialSourceSample,
    distance_km_input: f32,
) -> CouplingAerialStep {
    let distance_km = max(0.0, distance_km_input);
    let transmittance = exp(-source.extinction_rgb_per_km * distance_km);
    var radiance = vec3<f32>(0.0);
    for (var channel = 0u; channel < 3u; channel += 1u) {
        let extinction = source.extinction_rgb_per_km[channel];
        if (extinction <= 1e-10) {
            radiance[channel] =
                source.source_radiance_coefficient_rgb_per_km[channel] * distance_km;
        } else {
            radiance[channel] =
                source.source_radiance_coefficient_rgb_per_km[channel] *
                (1.0 - transmittance[channel]) / extinction;
        }
    }
    return CouplingAerialStep(radiance, transmittance);
}
`;

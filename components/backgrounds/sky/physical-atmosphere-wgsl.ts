/**
 * WGSL implementation of the LUT decomposition described by Hillaire 2020.
 * This is original code informed by the MIT reference implementation at
 * https://github.com/sebh/UnrealEngineSkyAtmosphere (Epic Games, 2020).
 * See PHYSICAL-ATMOSPHERE-NOTICE.txt for attribution and license text.
 */

import {
    DIRECTIONAL_SKY_ALTITUDE_NODES_KM,
    DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT,
} from "./directional-atmosphere-cloud-lighting.ts";

const PHYSICAL_ATMOSPHERE_WGSL_CORE = /* wgsl */ `
const ATMO_PI: f32 = 3.141592653589793;
const ATMO_EPSILON: f32 = 0.0001;
const ATMO_SOURCE_COUNT: u32 = 2u;

struct PhysicalAtmosphereUniforms {
    radii_scales: vec4f,
    rayleigh_scattering_mie_g: vec4f,
    mie_scattering_observer_altitude: vec4f,
    mie_absorption_ozone_center: vec4f,
    ozone_absorption_half_width: vec4f,
    ground_albedo_multiple_scattering: vec4f,
    source0_direction_enabled: vec4f,
    source0_radiance_radius: vec4f,
    source1_direction_enabled: vec4f,
    source1_radiance_radius: vec4f,
    grade_exposure_chroma: vec4f,
    grade_strength_quality: vec4f,
    observer_world: vec4f,
    stratospheric_mie_scattering_center: vec4f,
    stratospheric_mie_absorption_width: vec4f,
    aerosol_boundary_profile_stratospheric_g: vec4f,
};

struct AtmosphereMedium {
    scattering: vec3f,
    extinction: vec3f,
    rayleigh: vec3f,
    mie: vec3f,
    mie_tropospheric: vec3f,
    mie_stratospheric: vec3f,
};

struct AtmosphereRayResult {
    radiance: vec3f,
    transmittance: vec3f,
};

struct AtmosphereSegmentTransport {
    radiance: vec3f,
    transmittance: vec3f,
};

fn atmo_saturate(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn atmo_safe_div(numerator: vec3f, denominator: vec3f) -> vec3f {
    return numerator / max(denominator, vec3f(1e-7));
}

fn atmo_from_unit_to_sub_uv(value: f32, resolution: f32) -> f32 {
    return (value + 0.5 / resolution) * resolution / (resolution + 1.0);
}

fn atmo_from_sub_to_unit_uv(value: f32, resolution: f32) -> f32 {
    return (value - 0.5 / resolution) * resolution / (resolution - 1.0);
}

fn atmo_ray_sphere_nearest(origin: vec3f, direction: vec3f, radius: f32) -> f32 {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;
    let discriminant = b * b - c;
    if (discriminant < 0.0) {
        return -1.0;
    }
    let root = sqrt(discriminant);
    let near_distance = -b - root;
    let far_distance = -b + root;
    if (near_distance >= 0.0) {
        return near_distance;
    }
    if (far_distance >= 0.0) {
        return far_distance;
    }
    return -1.0;
}

fn atmo_ray_limit(origin: vec3f, direction: vec3f) -> vec2f {
    let top_distance = atmo_ray_sphere_nearest(
        origin,
        direction,
        physical_atmosphere.radii_scales.y,
    );
    let ground_distance = atmo_ray_sphere_nearest(
        origin,
        direction,
        physical_atmosphere.radii_scales.x + ATMO_EPSILON,
    );
    if (ground_distance >= 0.0 && (top_distance < 0.0 || ground_distance < top_distance)) {
        return vec2f(ground_distance, 1.0);
    }
    return vec2f(max(0.0, top_distance), 0.0);
}

fn atmo_ozone_density(altitude: f32) -> f32 {
    let center = physical_atmosphere.mie_absorption_ozone_center.w;
    let half_width = physical_atmosphere.ozone_absorption_half_width.w;
    let offset = abs(altitude - center) / max(half_width, 0.01);
    if (offset >= 1.0) { return 0.0; }
    // Equal-column raised cosine: unlike a triangle, its density and first
    // derivative both meet continuously at the peak and support boundary.
    return 0.5 * (1.0 + cos(ATMO_PI * offset));
}

fn atmo_boundary_layer_density(altitude: f32) -> f32 {
    let height = physical_atmosphere.aerosol_boundary_profile_stratospheric_g.y;
    let transition = max(
        0.01,
        physical_atmosphere.aerosol_boundary_profile_stratospheric_g.z,
    );
    return 1.0 / (1.0 + exp(clamp((altitude - height) / transition, -60.0, 60.0)));
}

fn atmo_tropospheric_mie_density(altitude: f32) -> f32 {
    let boundary_strength = clamp(
        physical_atmosphere.aerosol_boundary_profile_stratospheric_g.x,
        0.0,
        0.92,
    );
    let exponential = exp(-altitude / physical_atmosphere.radii_scales.w);
    return mix(exponential, atmo_boundary_layer_density(altitude), boundary_strength);
}

fn atmo_stratospheric_mie_density(altitude: f32) -> f32 {
    let center = physical_atmosphere.stratospheric_mie_scattering_center.w;
    let width = max(0.05, physical_atmosphere.stratospheric_mie_absorption_width.w);
    let normalized = (altitude - center) / width;
    return exp(-0.5 * normalized * normalized);
}

fn atmo_sample_medium(world_position: vec3f) -> AtmosphereMedium {
    let altitude = max(0.0, length(world_position) - physical_atmosphere.radii_scales.x);
    let rayleigh_density = exp(-altitude / physical_atmosphere.radii_scales.z);
    let mie_density = atmo_tropospheric_mie_density(altitude);
    let stratospheric_mie_density = atmo_stratospheric_mie_density(altitude);
    let rayleigh = physical_atmosphere.rayleigh_scattering_mie_g.xyz * rayleigh_density;
    let mie_tropospheric = physical_atmosphere.mie_scattering_observer_altitude.xyz *
        mie_density;
    let mie_stratospheric = physical_atmosphere.stratospheric_mie_scattering_center.xyz *
        stratospheric_mie_density;
    let mie = mie_tropospheric + mie_stratospheric;
    let absorption = physical_atmosphere.mie_absorption_ozone_center.xyz * mie_density +
        physical_atmosphere.stratospheric_mie_absorption_width.xyz *
            stratospheric_mie_density +
        physical_atmosphere.ozone_absorption_half_width.xyz * atmo_ozone_density(altitude);
    var medium: AtmosphereMedium;
    medium.rayleigh = rayleigh;
    medium.mie = mie;
    medium.mie_tropospheric = mie_tropospheric;
    medium.mie_stratospheric = mie_stratospheric;
    medium.scattering = rayleigh + mie;
    medium.extinction = medium.scattering + absorption;
    return medium;
}

fn atmo_rayleigh_phase(cos_theta: f32) -> f32 {
    let mu = clamp(cos_theta, -1.0, 1.0);
    return 3.0 / (16.0 * ATMO_PI) * (1.0 + mu * mu);
}

fn atmo_cornette_shanks_phase_g(cos_theta: f32, asymmetry: f32) -> f32 {
    let g = clamp(asymmetry, -0.98, 0.98);
    let mu = clamp(cos_theta, -1.0, 1.0);
    let normalization = 3.0 / (8.0 * ATMO_PI) * (1.0 - g * g) / (2.0 + g * g);
    return normalization * (1.0 + mu * mu) /
        pow(max(1e-6, 1.0 + g * g - 2.0 * g * mu), 1.5);
}

// Stable consumer ABI for callers that intentionally use the bulk aerosol
// phase. Atmosphere integration itself resolves the two aerosol populations.
fn atmo_cornette_shanks_phase(cos_theta: f32) -> f32 {
    return atmo_cornette_shanks_phase_g(
        cos_theta,
        physical_atmosphere.rayleigh_scattering_mie_g.w,
    );
}

fn atmo_mie_phase_scattering(medium: AtmosphereMedium, cos_theta: f32) -> vec3f {
    return medium.mie_tropospheric * atmo_cornette_shanks_phase_g(
        cos_theta,
        physical_atmosphere.rayleigh_scattering_mie_g.w,
    ) + medium.mie_stratospheric * atmo_cornette_shanks_phase_g(
        cos_theta,
        physical_atmosphere.aerosol_boundary_profile_stratospheric_g.w,
    );
}

fn atmo_transmittance_params_from_uv(uv: vec2f) -> vec2f {
    let bottom_radius = physical_atmosphere.radii_scales.x;
    let top_radius = physical_atmosphere.radii_scales.y;
    let H = sqrt(max(0.0, top_radius * top_radius - bottom_radius * bottom_radius));
    let rho = H * clamp(uv.y, 0.0, 1.0);
    let radius = sqrt(rho * rho + bottom_radius * bottom_radius);
    let d_min = top_radius - radius;
    let d_max = rho + H;
    let distance = d_min + clamp(uv.x, 0.0, 1.0) * (d_max - d_min);
    var mu = 1.0;
    if (distance > 1e-6) {
        mu = (H * H - rho * rho - distance * distance) /
            (2.0 * radius * distance);
    }
    return vec2f(radius, clamp(mu, -1.0, 1.0));
}

fn atmo_transmittance_uv(radius: f32, zenith_cosine: f32) -> vec2f {
    let bottom_radius = physical_atmosphere.radii_scales.x;
    let top_radius = physical_atmosphere.radii_scales.y;
    let safe_radius = clamp(radius, bottom_radius, top_radius);
    let mu = clamp(zenith_cosine, -1.0, 1.0);
    let H = sqrt(max(0.0, top_radius * top_radius - bottom_radius * bottom_radius));
    let rho = sqrt(max(0.0, safe_radius * safe_radius - bottom_radius * bottom_radius));
    let discriminant = max(0.0,
        safe_radius * safe_radius * (mu * mu - 1.0) + top_radius * top_radius);
    let distance = max(0.0, -safe_radius * mu + sqrt(discriminant));
    let d_min = top_radius - safe_radius;
    let d_max = rho + H;
    let x_mu = select(0.0, (distance - d_min) / max(d_max - d_min, 1e-6), d_max > d_min);
    return clamp(vec2f(x_mu, rho / max(H, 1e-6)), vec2f(0.0), vec2f(1.0));
}

fn atmo_multiscattering_uv(world_position: vec3f, source_direction: vec3f) -> vec2f {
    let radius = length(world_position);
    let up = world_position / max(radius, 1e-6);
    let mu_source = dot(up, source_direction);
    let altitude_fraction = (radius - physical_atmosphere.radii_scales.x) /
        (physical_atmosphere.radii_scales.y - physical_atmosphere.radii_scales.x);
    return vec2f(
        atmo_from_unit_to_sub_uv(mu_source * 0.5 + 0.5, 32.0),
        atmo_from_unit_to_sub_uv(atmo_saturate(altitude_fraction), 32.0),
    );
}

fn atmo_integrate_optical_depth(origin: vec3f, direction: vec3f, distance: f32) -> vec3f {
    var optical_depth = vec3f(0.0);
    let step_count = 48u;
    let dt = distance / f32(step_count);
    for (var index = 0u; index < step_count; index += 1u) {
        let unit = (f32(index) + 0.5) / f32(step_count);
        // Source rays start at the densest point they can reach without
        // crossing ground. Quadratic stratification resolves mixing-layer
        // caps while its Jacobian retains the complete geometric path.
        let warped = unit * unit;
        let derivative = 2.0 * unit;
        let point = origin + direction * (warped * distance);
        optical_depth += atmo_sample_medium(point).extinction * (dt * derivative);
    }
    return optical_depth;
}

fn atmo_source_direction(index: u32) -> vec3f {
    if (index == 0u) {
        return normalize(physical_atmosphere.source0_direction_enabled.xyz);
    }
    return normalize(physical_atmosphere.source1_direction_enabled.xyz);
}

fn atmo_source_enabled(index: u32) -> bool {
    if (index == 0u) {
        return physical_atmosphere.source0_direction_enabled.w > 0.5;
    }
    return physical_atmosphere.source1_direction_enabled.w > 0.5;
}

fn atmo_source_radiance_radius(index: u32) -> vec4f {
    if (index == 0u) {
        return physical_atmosphere.source0_radiance_radius;
    }
    return physical_atmosphere.source1_radiance_radius;
}

fn atmo_source_solid_angle(angular_radius: f32) -> f32 {
    return 2.0 * ATMO_PI * (1.0 - cos(max(0.0, angular_radius)));
}

fn atmo_sky_view_params_from_uv(radius: f32, uv_input: vec2f) -> vec2f {
    let uv = vec2f(
        atmo_from_sub_to_unit_uv(uv_input.x, 192.0),
        atmo_from_sub_to_unit_uv(uv_input.y, 108.0),
    );
    let bottom_radius = physical_atmosphere.radii_scales.x;
    let horizon_distance = sqrt(max(0.0, radius * radius - bottom_radius * bottom_radius));
    let horizon_cosine = horizon_distance / max(radius, 1e-6);
    let beta = acos(clamp(horizon_cosine, -1.0, 1.0));
    let zenith_horizon_angle = ATMO_PI - beta;
    var view_zenith_cosine = 1.0;
    if (uv.y < 0.5) {
        var coordinate = 1.0 - 2.0 * uv.y;
        coordinate = coordinate * coordinate;
        coordinate = 1.0 - coordinate;
        view_zenith_cosine = cos(zenith_horizon_angle * coordinate);
    } else {
        var coordinate = uv.y * 2.0 - 1.0;
        coordinate = coordinate * coordinate;
        view_zenith_cosine = cos(zenith_horizon_angle + beta * coordinate);
    }
    let azimuth_coordinate = uv.x * uv.x;
    let light_view_cosine = -(azimuth_coordinate * 2.0 - 1.0);
    return vec2f(view_zenith_cosine, clamp(light_view_cosine, -1.0, 1.0));
}

fn atmo_sky_view_uv(world_position: vec3f, view_direction: vec3f, source_direction: vec3f) -> vec2f {
    let radius = length(world_position);
    let up = world_position / max(radius, 1e-6);
    let view_zenith_cosine = clamp(dot(view_direction, up), -1.0, 1.0);
    let view_horizontal = view_direction - up * view_zenith_cosine;
    let source_horizontal = source_direction - up * dot(source_direction, up);
    var light_view_cosine = 1.0;
    if (dot(view_horizontal, view_horizontal) > 1e-8 &&
        dot(source_horizontal, source_horizontal) > 1e-8) {
        light_view_cosine = dot(normalize(view_horizontal), normalize(source_horizontal));
    }
    let bottom_radius = physical_atmosphere.radii_scales.x;
    let horizon_distance = sqrt(max(0.0, radius * radius - bottom_radius * bottom_radius));
    let horizon_cosine = horizon_distance / max(radius, 1e-6);
    let beta = acos(clamp(horizon_cosine, -1.0, 1.0));
    let zenith_horizon_angle = ATMO_PI - beta;
    let intersects_ground = atmo_ray_sphere_nearest(
        world_position,
        view_direction,
        bottom_radius + ATMO_EPSILON,
    ) >= 0.0;
    var v = 0.0;
    if (!intersects_ground) {
        var coordinate = 1.0 - acos(view_zenith_cosine) / max(zenith_horizon_angle, 1e-6);
        coordinate = sqrt(max(0.0, coordinate));
        v = (1.0 - coordinate) * 0.5;
    } else {
        var coordinate = (acos(view_zenith_cosine) - zenith_horizon_angle) /
            max(beta, 1e-6);
        coordinate = sqrt(max(0.0, coordinate));
        v = coordinate * 0.5 + 0.5;
    }
    let u = sqrt(atmo_saturate(-light_view_cosine * 0.5 + 0.5));
    return vec2f(
        atmo_from_unit_to_sub_uv(u, 192.0),
        atmo_from_unit_to_sub_uv(v, 108.0),
    );
}
`;

const PHYSICAL_ATMOSPHERE_WGSL_TRANSFER = /* wgsl */ `
fn atmo_transmittance_to_space(world_position: vec3f, source_direction: vec3f) -> vec3f {
    let ground_distance = atmo_ray_sphere_nearest(
        world_position,
        source_direction,
        physical_atmosphere.radii_scales.x + ATMO_EPSILON,
    );
    if (ground_distance >= 0.0) {
        return vec3f(0.0);
    }
    let radius = length(world_position);
    let mu = dot(world_position / max(radius, 1e-6), source_direction);
    return textureSampleLevel(
        atmosphere_transmittance_texture,
        atmosphere_sampler,
        atmo_transmittance_uv(radius, mu),
        0.0,
    ).rgb;
}

fn atmo_multiple_scattering(world_position: vec3f, source_direction: vec3f) -> vec3f {
    return textureSampleLevel(
        atmosphere_multiple_scattering_texture,
        atmosphere_sampler,
        atmo_multiscattering_uv(world_position, source_direction),
        0.0,
    ).rgb;
}

fn atmo_integrate_ray_transfer(
    origin: vec3f,
    direction: vec3f,
    source_direction: vec3f,
    sample_count: u32,
) -> AtmosphereRayResult {
    let limit = atmo_ray_limit(origin, direction);
    let distance = limit.x;
    let hit_ground = limit.y > 0.5;
    let count = max(1u, sample_count);
    var throughput = vec3f(1.0);
    var radiance = vec3f(0.0);
    var previous_distance = 0.0;
    for (var index = 0u; index < 64u; index += 1u) {
        if (index >= count) { break; }
        let unit0 = f32(index) / f32(count);
        let unit1 = f32(index + 1u) / f32(count);
        let t0 = distance * unit0 * unit0;
        let t1 = distance * unit1 * unit1;
        let t = mix(t0, t1, 0.35);
        let dt = t1 - t0;
        let point = origin + direction * t;
        let medium = atmo_sample_medium(point);
        let step_transmittance = exp(-medium.extinction * dt);
        let direct_transfer = atmo_transmittance_to_space(point, source_direction);
        // direction is camera-to-sample and source_direction is
        // sample-to-source. Equal directions describe photons continuing
        // toward the camera with zero deflection, i.e. forward scattering.
        let cos_theta = dot(direction, source_direction);
        let phase_scattering = medium.rayleigh * atmo_rayleigh_phase(cos_theta) +
            atmo_mie_phase_scattering(medium, cos_theta);
        let multiple_transfer = atmo_multiple_scattering(point, source_direction) *
            medium.scattering;
        let source = direct_transfer * phase_scattering + multiple_transfer;
        let integrated = atmo_safe_div(source * (vec3f(1.0) - step_transmittance),
            medium.extinction);
        radiance += throughput * integrated;
        throughput *= step_transmittance;
        previous_distance = t1;
        if (max(throughput.r, max(throughput.g, throughput.b)) < 1e-5) { break; }
    }
    if (hit_ground) {
        let ground_point = origin + direction * distance;
        let up = normalize(ground_point);
        let direct_transfer = atmo_transmittance_to_space(
            ground_point + up * (ATMO_EPSILON * 2.0),
            source_direction,
        );
        let n_dot_l = max(0.0, dot(up, source_direction));
        radiance += throughput * direct_transfer * n_dot_l *
            physical_atmosphere.ground_albedo_multiple_scattering.xyz / ATMO_PI;
    }
    var result: AtmosphereRayResult;
    result.radiance = max(radiance, vec3f(0.0));
    result.transmittance = clamp(throughput, vec3f(0.0), vec3f(1.0));
    return result;
}

fn atmo_integrate_finite_segment_source(
    start_world: vec3f,
    end_world: vec3f,
    source_direction: vec3f,
    source_irradiance: vec3f,
) -> AtmosphereSegmentTransport {
    let delta = end_world - start_world;
    let distance = length(delta);
    var result: AtmosphereSegmentTransport;
    result.radiance = vec3f(0.0);
    result.transmittance = vec3f(1.0);
    if (distance <= 1e-6) {
        return result;
    }
    let direction = delta / distance;
    let count = 16u;
    let dt = distance / f32(count);
    var throughput = vec3f(1.0);
    for (var index = 0u; index < count; index += 1u) {
        let point = start_world + direction * ((f32(index) + 0.5) * dt);
        let radius = length(point);
        if (radius < physical_atmosphere.radii_scales.x ||
            radius > physical_atmosphere.radii_scales.y) {
            continue;
        }
        let medium = atmo_sample_medium(point);
        let step_transmittance = exp(-medium.extinction * dt);
        let direct_transfer = atmo_transmittance_to_space(point, source_direction);
        let cos_theta = dot(direction, source_direction);
        let phase_scattering = medium.rayleigh * atmo_rayleigh_phase(cos_theta) +
            atmo_mie_phase_scattering(medium, cos_theta);
        let multiple_transfer = atmo_multiple_scattering(point, source_direction) *
            medium.scattering;
        let source = source_irradiance *
            (direct_transfer * phase_scattering + multiple_transfer);
        let integrated = atmo_safe_div(source * (vec3f(1.0) - step_transmittance),
            medium.extinction);
        result.radiance += throughput * integrated;
        throughput *= step_transmittance;
    }
    result.radiance = max(result.radiance, vec3f(0.0));
    result.transmittance = clamp(throughput, vec3f(0.0), vec3f(1.0));
    return result;
}
`;

export const PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL = /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(0) @binding(0) var<uniform> physical_atmosphere: PhysicalAtmosphereUniforms;
@group(0) @binding(1) var atmosphere_transmittance_output:
    texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn transmittance_compute(@builtin(global_invocation_id) invocation: vec3u) {
    if (invocation.x >= 256u || invocation.y >= 64u) { return; }
    let uv = (vec2f(invocation.xy) + vec2f(0.5)) / vec2f(256.0, 64.0);
    let parameters = atmo_transmittance_params_from_uv(uv);
    let radius = parameters.x;
    let mu = parameters.y;
    let origin = vec3f(0.0, 0.0, radius);
    let direction = vec3f(sqrt(max(0.0, 1.0 - mu * mu)), 0.0, mu);
    let distance = atmo_ray_sphere_nearest(
        origin,
        direction,
        physical_atmosphere.radii_scales.y,
    );
    let transmittance = exp(-atmo_integrate_optical_depth(origin, direction, max(0.0, distance)));
    textureStore(atmosphere_transmittance_output, vec2i(invocation.xy),
        vec4f(clamp(transmittance, vec3f(0.0), vec3f(1.0)), 1.0));
}
`;

export const PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL = /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(0) @binding(0) var<uniform> physical_atmosphere: PhysicalAtmosphereUniforms;
@group(0) @binding(1) var atmosphere_transmittance_texture: texture_2d<f32>;
@group(0) @binding(2) var atmosphere_sampler: sampler;
@group(0) @binding(3) var atmosphere_multiple_scattering_output:
    texture_storage_2d<rgba16float, write>;

fn multiscatter_transmittance_to_space(point: vec3f, source_direction: vec3f) -> vec3f {
    let ground_distance = atmo_ray_sphere_nearest(
        point,
        source_direction,
        physical_atmosphere.radii_scales.x + ATMO_EPSILON,
    );
    if (ground_distance >= 0.0) { return vec3f(0.0); }
    let radius = length(point);
    let mu = dot(point / max(radius, 1e-6), source_direction);
    return textureSampleLevel(atmosphere_transmittance_texture, atmosphere_sampler,
        atmo_transmittance_uv(radius, mu), 0.0).rgb;
}

@compute @workgroup_size(8, 8, 1)
fn multiple_scattering_compute(@builtin(global_invocation_id) invocation: vec3u) {
    if (invocation.x >= 32u || invocation.y >= 32u) { return; }
    let unit_uv = vec2f(
        atmo_from_sub_to_unit_uv((f32(invocation.x) + 0.5) / 32.0, 32.0),
        atmo_from_sub_to_unit_uv((f32(invocation.y) + 0.5) / 32.0, 32.0),
    );
    let mu_source = clamp(unit_uv.x * 2.0 - 1.0, -1.0, 1.0);
    let source_direction = vec3f(sqrt(max(0.0, 1.0 - mu_source * mu_source)), 0.0, mu_source);
    let atmosphere_height = physical_atmosphere.radii_scales.y -
        physical_atmosphere.radii_scales.x;
    let radius = physical_atmosphere.radii_scales.x +
        clamp(unit_uv.y + ATMO_EPSILON, 0.0, 1.0) * (atmosphere_height - ATMO_EPSILON);
    let origin = vec3f(0.0, 0.0, radius);
    var mean_single_scattering = vec3f(0.0);
    var mean_scattering_ratio = vec3f(0.0);
    let direction_count = 16u;
    for (var direction_index = 0u; direction_index < direction_count; direction_index += 1u) {
        let sample_unit = (f32(direction_index) + 0.5) / f32(direction_count);
        let z = 1.0 - 2.0 * sample_unit;
        let phi = 2.39996323 * f32(direction_index);
        let radial = sqrt(max(0.0, 1.0 - z * z));
        let direction = vec3f(radial * cos(phi), radial * sin(phi), z);
        let limit = atmo_ray_limit(origin, direction);
        let distance = limit.x;
        let hit_ground = limit.y > 0.5;
        let step_count = 20u;
        var throughput = vec3f(1.0);
        var single_scattering = vec3f(0.0);
        var scattering_ratio = vec3f(0.0);
        for (var step = 0u; step < step_count; step += 1u) {
            let t0 = distance * f32(step) / f32(step_count);
            let t1 = distance * f32(step + 1u) / f32(step_count);
            let point = origin + direction * mix(t0, t1, 0.35);
            let medium = atmo_sample_medium(point);
            let step_transmittance = exp(-medium.extinction * (t1 - t0));
            let source_transfer = multiscatter_transmittance_to_space(point, source_direction);
            let isotropic_source = source_transfer * medium.scattering / (4.0 * ATMO_PI);
            single_scattering += throughput * atmo_safe_div(
                isotropic_source * (vec3f(1.0) - step_transmittance),
                medium.extinction,
            );
            scattering_ratio += throughput * atmo_safe_div(
                medium.scattering * (vec3f(1.0) - step_transmittance),
                medium.extinction,
            );
            throughput *= step_transmittance;
        }
        if (hit_ground) {
            let ground_point = origin + direction * distance;
            let up = normalize(ground_point);
            let transfer = multiscatter_transmittance_to_space(
                ground_point + up * (ATMO_EPSILON * 2.0), source_direction);
            single_scattering += throughput * transfer * max(0.0, dot(up, source_direction)) *
                physical_atmosphere.ground_albedo_multiple_scattering.xyz / ATMO_PI;
        }
        mean_single_scattering += single_scattering / f32(direction_count);
        mean_scattering_ratio += scattering_ratio / f32(direction_count);
    }
    // Hillaire's isotropic geometric series, bounded before its singularity.
    let ratio = min(mean_scattering_ratio, vec3f(0.98));
    let transfer = physical_atmosphere.ground_albedo_multiple_scattering.w *
        mean_single_scattering / max(vec3f(0.02), vec3f(1.0) - ratio);
    textureStore(atmosphere_multiple_scattering_output, vec2i(invocation.xy),
        vec4f(max(transfer, vec3f(0.0)), 1.0));
}
`;

export const PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL = /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(0) @binding(0) var<uniform> physical_atmosphere: PhysicalAtmosphereUniforms;
@group(0) @binding(1) var atmosphere_transmittance_texture: texture_2d<f32>;
@group(0) @binding(2) var atmosphere_multiple_scattering_texture: texture_2d<f32>;
@group(0) @binding(3) var atmosphere_sampler: sampler;
@group(0) @binding(4) var atmosphere_irradiance_output:
    texture_storage_2d<rgba16float, write>;

${PHYSICAL_ATMOSPHERE_WGSL_TRANSFER}

@compute @workgroup_size(8, 8, 1)
fn irradiance_compute(@builtin(global_invocation_id) invocation: vec3u) {
    if (invocation.x >= 64u || invocation.y >= 32u) { return; }
    let mu_source = atmo_from_sub_to_unit_uv(
        (f32(invocation.x) + 0.5) / 64.0,
        64.0,
    ) * 2.0 - 1.0;
    let altitude_fraction = atmo_from_sub_to_unit_uv(
        (f32(invocation.y) + 0.5) / 32.0,
        32.0,
    );
    let radius = mix(
        physical_atmosphere.radii_scales.x + ATMO_EPSILON,
        physical_atmosphere.radii_scales.y - ATMO_EPSILON,
        altitude_fraction,
    );
    let origin = vec3f(0.0, 0.0, radius);
    let source_direction = vec3f(sqrt(max(0.0, 1.0 - mu_source * mu_source)), 0.0, mu_source);
    var irradiance = atmo_transmittance_to_space(origin, source_direction) * max(0.0, mu_source);
    let direction_count = 16u;
    for (var index = 0u; index < direction_count; index += 1u) {
        let unit = (f32(index) + 0.5) / f32(direction_count);
        let cosine = unit;
        let sine = sqrt(max(0.0, 1.0 - cosine * cosine));
        let phi = 2.39996323 * f32(index);
        let sky_direction = vec3f(sine * cos(phi), sine * sin(phi), cosine);
        let transfer = atmo_integrate_ray_transfer(origin, sky_direction, source_direction, 20u);
        irradiance += transfer.radiance * cosine *
            (2.0 * ATMO_PI / f32(direction_count));
    }
    textureStore(atmosphere_irradiance_output, vec2i(invocation.xy),
        vec4f(max(irradiance, vec3f(0.0)), 1.0));
}
`;

export const PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL = /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(0) @binding(0) var<uniform> physical_atmosphere: PhysicalAtmosphereUniforms;
@group(0) @binding(1) var atmosphere_transmittance_texture: texture_2d<f32>;
@group(0) @binding(2) var atmosphere_multiple_scattering_texture: texture_2d<f32>;
@group(0) @binding(3) var atmosphere_sampler: sampler;
@group(0) @binding(4) var atmosphere_sky_view_output:
    texture_storage_2d_array<rgba16float, write>;

${PHYSICAL_ATMOSPHERE_WGSL_TRANSFER}

@compute @workgroup_size(8, 8, 1)
fn sky_view_compute(@builtin(global_invocation_id) invocation: vec3u) {
    if (invocation.x >= 192u || invocation.y >= 108u || invocation.z >= 2u) { return; }
    if (!atmo_source_enabled(invocation.z)) {
        textureStore(atmosphere_sky_view_output, vec2i(invocation.xy), i32(invocation.z),
            vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }
    let observer_radius = physical_atmosphere.radii_scales.x +
        physical_atmosphere.mie_scattering_observer_altitude.w;
    let origin = vec3f(0.0, 0.0, observer_radius);
    let source_input = atmo_source_direction(invocation.z);
    let mu_source = clamp(source_input.z, -1.0, 1.0);
    let source_direction = vec3f(sqrt(max(0.0, 1.0 - mu_source * mu_source)), 0.0, mu_source);
    let uv = (vec2f(invocation.xy) + vec2f(0.5)) / vec2f(192.0, 108.0);
    let parameters = atmo_sky_view_params_from_uv(observer_radius, uv);
    let view_zenith_cosine = parameters.x;
    let light_view_cosine = parameters.y;
    let view_zenith_sine = sqrt(max(0.0, 1.0 - view_zenith_cosine * view_zenith_cosine));
    let view_direction = vec3f(
        view_zenith_sine * light_view_cosine,
        view_zenith_sine * sqrt(max(0.0, 1.0 - light_view_cosine * light_view_cosine)),
        view_zenith_cosine,
    );
    let transfer = atmo_integrate_ray_transfer(origin, view_direction, source_direction, 32u);
    textureStore(atmosphere_sky_view_output, vec2i(invocation.xy), i32(invocation.z),
        vec4f(transfer.radiance, 1.0));
}
`;

/**
 * Positive, source-disc-free atmosphere radiance prefilter. One invocation
 * owns one altitude row, so its 64-sample quadrature can partition energy
 * among every lobe without atomics or cross-workgroup reductions. Layer zero
 * of the shared coupling atlas stores 17 two-texel lobes followed by exact
 * upper/lower irradiance. The six cloud-shadow cascades own their 32 receiver-
 * depth visibility knots in layers one through 192.
 */
export const PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL = /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(0) @binding(0) var<uniform> physical_atmosphere: PhysicalAtmosphereUniforms;
@group(0) @binding(1) var atmosphere_transmittance_texture: texture_2d<f32>;
@group(0) @binding(2) var atmosphere_multiple_scattering_texture: texture_2d<f32>;
@group(0) @binding(3) var atmosphere_sampler: sampler;
@group(0) @binding(4) var directional_coupling_output:
    texture_storage_2d_array<rgba16float, write>;

${PHYSICAL_ATMOSPHERE_WGSL_TRANSFER}

const DIRECTIONAL_SAMPLE_COUNT: u32 = 64u;
const DIRECTIONAL_DIFFUSE_LOBE_COUNT: u32 = ${DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT}u;
const DIRECTIONAL_LOBE_COUNT: u32 = 17u;
const DIRECTIONAL_NODE_COUNT: u32 = ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.length}u;
const DIRECTIONAL_GOLDEN_ANGLE: f32 = 2.399963229728653;
const DIRECTIONAL_DIFFUSE_SHARPNESS: f32 = 3.25;
const DIRECTIONAL_HORIZON_WIDTH: f32 = 0.2243994753;
const DIRECTIONAL_ALTITUDE_NODES_KM = array<f32, ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.length}>(
    ${DIRECTIONAL_SKY_ALTITUDE_NODES_KM.map((altitude) => `${altitude.toFixed(2)}`).join(", ")}
);

fn directional_luminance(value: vec3f) -> f32 {
    return dot(max(value, vec3f(0.0)), vec3f(0.2126, 0.7152, 0.0722));
}

fn directional_sample_direction(index: u32, count: u32) -> vec3f {
    let vertical = 1.0 - 2.0 * (f32(index) + 0.5) / f32(count);
    let horizontal = sqrt(max(0.0, 1.0 - vertical * vertical));
    let azimuth = DIRECTIONAL_GOLDEN_ANGLE * f32(index);
    return vec3f(horizontal * cos(azimuth), horizontal * sin(azimuth), vertical);
}

fn directional_diffuse_axis(index: u32) -> vec3f {
    return directional_sample_direction(index, DIRECTIONAL_DIFFUSE_LOBE_COUNT);
}

fn directional_spherical_gaussian(
    axis: vec3f, direction: vec3f, sharpness: f32,
) -> f32 {
    return exp(clamp(sharpness, 0.0, 128.0) *
        (clamp(dot(normalize(axis), normalize(direction)), -1.0, 1.0) - 1.0));
}

fn directional_spherical_gaussian_integral(sharpness_input: f32) -> f32 {
    let sharpness = clamp(sharpness_input, 0.0, 128.0);
    if (sharpness < 1e-6) { return 4.0 * ATMO_PI; }
    return 2.0 * ATMO_PI * (1.0 - exp(-2.0 * sharpness)) / sharpness;
}

fn directional_horizon_kernel(direction: vec3f) -> f32 {
    let elevation = asin(clamp(direction.z, -1.0, 1.0));
    return exp(-0.5 * pow(elevation / DIRECTIONAL_HORIZON_WIDTH, 2.0));
}

// The directional cache deliberately excludes the resolved surface term and
// source discs. Ground reflection is evaluated later through the cloud shadow
// field, and direct Sun/Moon remain separate TOA sources.
fn directional_integrate_atmosphere_only(
    origin: vec3f, direction: vec3f, source_direction: vec3f,
) -> vec3f {
    let limit = atmo_ray_limit(origin, direction);
    let distance = max(0.0, limit.x);
    let count = 12u;
    var throughput = vec3f(1.0);
    var radiance = vec3f(0.0);
    for (var index = 0u; index < count; index += 1u) {
        let unit0 = f32(index) / f32(count);
        let unit1 = f32(index + 1u) / f32(count);
        let t0 = distance * unit0 * unit0;
        let t1 = distance * unit1 * unit1;
        let point = origin + direction * mix(t0, t1, 0.35);
        let medium = atmo_sample_medium(point);
        let step_transmittance = exp(-medium.extinction * (t1 - t0));
        let direct_transfer = atmo_transmittance_to_space(point, source_direction);
        let cosine = dot(direction, source_direction);
        let phase_scattering = medium.rayleigh * atmo_rayleigh_phase(cosine) +
            atmo_mie_phase_scattering(medium, cosine);
        let multiple_transfer = atmo_multiple_scattering(
            point, source_direction) * medium.scattering;
        let source = direct_transfer * phase_scattering + multiple_transfer;
        radiance += throughput * atmo_safe_div(
            source * (vec3f(1.0) - step_transmittance), medium.extinction);
        throughput *= step_transmittance;
        if (max(throughput.r, max(throughput.g, throughput.b)) < 1e-5) { break; }
    }
    return max(vec3f(0.0), radiance);
}

fn directional_sky_sample(origin: vec3f, direction: vec3f) -> vec3f {
    var radiance = vec3f(0.0);
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        if (!atmo_source_enabled(source_index)) { continue; }
        let source = atmo_source_radiance_radius(source_index);
        let irradiance = source.rgb * atmo_source_solid_angle(source.w);
        radiance += irradiance * directional_integrate_atmosphere_only(
            origin, direction, atmo_source_direction(source_index));
    }
    return max(vec3f(0.0), radiance);
}

fn directional_source_sharpness(source_index: u32) -> f32 {
    return select(26.0, 18.0, source_index == 1u);
}

@compute @workgroup_size(1, 1, 1)
fn directional_lighting_compute(@builtin(global_invocation_id) invocation: vec3u) {
    let node_index = invocation.x;
    if (node_index >= DIRECTIONAL_NODE_COUNT) { return; }
    let altitude_km = min(
        DIRECTIONAL_ALTITUDE_NODES_KM[node_index],
        physical_atmosphere.radii_scales.y -
            physical_atmosphere.radii_scales.x - ATMO_EPSILON);
    let origin = vec3f(
        0.0, 0.0, physical_atmosphere.radii_scales.x + altitude_km);
    let solid_angle = 4.0 * ATMO_PI / f32(DIRECTIONAL_SAMPLE_COUNT);
    var radiance_samples: array<vec3f, 64>;
    var lobe_energy: array<vec3f, 17>;
    var source_near_luminance: array<f32, 2>;
    var source_near_weight: array<f32, 2>;
    var source_outer_luminance: array<f32, 2>;
    var source_outer_weight: array<f32, 2>;
    var global_luminance = 0.0;
    var horizon_luminance = 0.0;
    var horizon_weight = 0.0;
    var horizon_normalization = 0.0;
    var upper_irradiance = vec3f(0.0);
    var lower_irradiance = vec3f(0.0);

    for (var sample_index = 0u; sample_index < DIRECTIONAL_SAMPLE_COUNT;
        sample_index += 1u) {
        let direction = directional_sample_direction(
            sample_index, DIRECTIONAL_SAMPLE_COUNT);
        let radiance = directional_sky_sample(origin, direction);
        radiance_samples[sample_index] = radiance;
        let sample_luminance = directional_luminance(radiance);
        global_luminance += sample_luminance;
        let ring = directional_horizon_kernel(direction);
        horizon_luminance += sample_luminance * ring;
        horizon_weight += ring;
        horizon_normalization += ring * solid_angle;
        if (direction.z >= 0.0) {
            upper_irradiance += radiance * direction.z * solid_angle;
        } else {
            lower_irradiance += radiance * -direction.z * solid_angle;
        }
        for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
            source_index += 1u) {
            if (!atmo_source_enabled(source_index)) { continue; }
            let source_direction = atmo_source_direction(source_index);
            let sharpness = directional_source_sharpness(source_index);
            let near_weight = directional_spherical_gaussian(
                source_direction, direction, sharpness * 0.42);
            let outer_weight = directional_spherical_gaussian(
                source_direction, direction, sharpness * 0.08);
            source_near_luminance[source_index] += sample_luminance * near_weight;
            source_near_weight[source_index] += near_weight;
            source_outer_luminance[source_index] += sample_luminance * outer_weight;
            source_outer_weight[source_index] += outer_weight;
        }
    }

    global_luminance /= f32(DIRECTIONAL_SAMPLE_COUNT);
    let horizon_average = horizon_luminance / max(1e-8, horizon_weight);
    let horizon_contrast = clamp(
        (horizon_average - global_luminance) / max(1e-8, horizon_average),
        0.0, 1.0);
    var source_contrast: array<f32, 2>;
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        if (!atmo_source_enabled(source_index)) { continue; }
        let near = source_near_luminance[source_index] /
            max(1e-8, source_near_weight[source_index]);
        let outer = source_outer_luminance[source_index] /
            max(1e-8, source_outer_weight[source_index]);
        source_contrast[source_index] = clamp(
            (near - outer) / max(1e-8, near), 0.0, 1.0);
    }

    for (var sample_index = 0u; sample_index < DIRECTIONAL_SAMPLE_COUNT;
        sample_index += 1u) {
        let direction = directional_sample_direction(
            sample_index, DIRECTIONAL_SAMPLE_COUNT);
        let energy = radiance_samples[sample_index] * solid_angle;
        var source_partition: array<f32, 2>;
        var source_partition_sum = 0.0;
        for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
            source_index += 1u) {
            if (atmo_source_enabled(source_index)) {
                source_partition[source_index] = 0.72 * source_contrast[source_index] *
                    directional_spherical_gaussian(
                        atmo_source_direction(source_index), direction,
                        directional_source_sharpness(source_index) * 0.42);
                source_partition_sum += source_partition[source_index];
            }
        }
        let horizon_partition = 0.46 * horizon_contrast *
            directional_horizon_kernel(direction);
        let category_total = 1.0 + horizon_partition + source_partition_sum;
        var diffuse_sum = 0.0;
        var diffuse_kernel: array<f32, 14>;
        for (var lobe_index = 0u; lobe_index < DIRECTIONAL_DIFFUSE_LOBE_COUNT;
            lobe_index += 1u) {
            diffuse_kernel[lobe_index] = directional_spherical_gaussian(
                directional_diffuse_axis(lobe_index), direction,
                DIRECTIONAL_DIFFUSE_SHARPNESS);
            diffuse_sum += diffuse_kernel[lobe_index];
        }
        for (var lobe_index = 0u; lobe_index < DIRECTIONAL_DIFFUSE_LOBE_COUNT;
            lobe_index += 1u) {
            lobe_energy[lobe_index] += energy * diffuse_kernel[lobe_index] /
                max(1e-8, diffuse_sum) / category_total;
        }
        lobe_energy[14u] += energy * horizon_partition / category_total;
        lobe_energy[15u] += energy * source_partition[0u] / category_total;
        lobe_energy[16u] += energy * source_partition[1u] / category_total;
    }

    for (var lobe_index = 0u; lobe_index < DIRECTIONAL_LOBE_COUNT;
        lobe_index += 1u) {
        var axis = vec3f(0.0, 0.0, 1.0);
        var encoded_shape = DIRECTIONAL_DIFFUSE_SHARPNESS;
        var normalization = directional_spherical_gaussian_integral(
            DIRECTIONAL_DIFFUSE_SHARPNESS);
        if (lobe_index < DIRECTIONAL_DIFFUSE_LOBE_COUNT) {
            axis = directional_diffuse_axis(lobe_index);
        } else if (lobe_index == 14u) {
            encoded_shape = -DIRECTIONAL_HORIZON_WIDTH;
            normalization = max(1e-8, horizon_normalization);
        } else {
            let source_index = lobe_index - 15u;
            axis = atmo_source_direction(source_index);
            encoded_shape = directional_source_sharpness(source_index);
            normalization = directional_spherical_gaussian_integral(encoded_shape);
        }
        textureStore(directional_coupling_output,
            vec2i(i32(lobe_index * 2u), i32(node_index)), 0,
            vec4f(axis, encoded_shape));
        textureStore(directional_coupling_output,
            vec2i(i32(lobe_index * 2u + 1u), i32(node_index)), 0,
            vec4f(max(vec3f(0.0), lobe_energy[lobe_index]), normalization));
    }
    textureStore(directional_coupling_output,
        vec2i(34, i32(node_index)), 0,
        vec4f(max(vec3f(0.0), upper_irradiance), altitude_km));
    textureStore(directional_coupling_output,
        vec2i(35, i32(node_index)), 0,
        vec4f(max(vec3f(0.0), lower_irradiance), altitude_km));
}
`;

export interface PhysicalAtmosphereConsumerWgslBindings {
    group?: number;
    uniformBinding?: number;
    transmittanceBinding?: number;
    multipleScatteringBinding?: number;
    skyViewBinding?: number;
    irradianceBinding?: number;
    samplerBinding?: number;
}

/**
 * Bindings plus stable cloud/sky/celestial consumer functions. Concatenate the
 * returned source once into a consuming WGSL module.
 */
export const physicalAtmosphereConsumerWgsl = ({
    group = 0,
    uniformBinding = 0,
    transmittanceBinding = 1,
    multipleScatteringBinding = 2,
    skyViewBinding = 3,
    irradianceBinding = 4,
    samplerBinding = 5,
}: PhysicalAtmosphereConsumerWgslBindings = {}) => /* wgsl */ `
${PHYSICAL_ATMOSPHERE_WGSL_CORE}

@group(${group}) @binding(${uniformBinding}) var<uniform> physical_atmosphere:
    PhysicalAtmosphereUniforms;
@group(${group}) @binding(${transmittanceBinding}) var atmosphere_transmittance_texture:
    texture_2d<f32>;
@group(${group}) @binding(${multipleScatteringBinding}) var atmosphere_multiple_scattering_texture:
    texture_2d<f32>;
@group(${group}) @binding(${skyViewBinding}) var atmosphere_sky_view_texture:
    texture_2d_array<f32>;
@group(${group}) @binding(${irradianceBinding}) var atmosphere_irradiance_texture:
    texture_2d<f32>;
@group(${group}) @binding(${samplerBinding}) var atmosphere_sampler: sampler;

${PHYSICAL_ATMOSPHERE_WGSL_TRANSFER}

fn physical_atmosphere_source_transmittance(
    source_index: u32,
    world_position: vec3f,
) -> vec3f {
    if (!atmo_source_enabled(source_index)) { return vec3f(0.0); }
    let source = atmo_source_radiance_radius(source_index);
    return source.rgb * atmo_transmittance_to_space(
        world_position,
        atmo_source_direction(source_index),
    );
}

fn physical_atmosphere_sky_radiance(view_direction: vec3f) -> vec3f {
    let world_position = physical_atmosphere.observer_world.xyz;
    var radiance = vec3f(0.0);
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT; source_index += 1u) {
        if (!atmo_source_enabled(source_index)) { continue; }
        let source_direction = atmo_source_direction(source_index);
        let source = atmo_source_radiance_radius(source_index);
        let uv = atmo_sky_view_uv(world_position, normalize(view_direction), source_direction);
        let transfer = textureSampleLevel(
            atmosphere_sky_view_texture,
            atmosphere_sampler,
            uv,
            i32(source_index),
            0.0,
        ).rgb;
        let irradiance = source.rgb * atmo_source_solid_angle(source.w);
        radiance += transfer * irradiance;
    }
    return max(radiance, vec3f(0.0));
}

fn physical_atmosphere_world_irradiance(
    altitude_km: f32,
    source_index: u32,
) -> vec3f {
    if (!atmo_source_enabled(source_index)) { return vec3f(0.0); }
    let source_direction = atmo_source_direction(source_index);
    let mu_source = source_direction.z;
    let altitude_fraction = atmo_saturate(altitude_km /
        (physical_atmosphere.radii_scales.y - physical_atmosphere.radii_scales.x));
    let transfer = textureSampleLevel(
        atmosphere_irradiance_texture,
        atmosphere_sampler,
        vec2f(
            atmo_from_unit_to_sub_uv(mu_source * 0.5 + 0.5, 64.0),
            atmo_from_unit_to_sub_uv(altitude_fraction, 32.0),
        ),
        0.0,
    ).rgb;
    let source = atmo_source_radiance_radius(source_index);
    return max(vec3f(0.0), transfer * source.rgb * atmo_source_solid_angle(source.w));
}

fn physical_atmosphere_segment(
    start_world: vec3f,
    end_world: vec3f,
) -> AtmosphereSegmentTransport {
    var combined: AtmosphereSegmentTransport;
    combined.radiance = vec3f(0.0);
    combined.transmittance = vec3f(1.0);
    // Transmittance is medium-only and therefore evaluated once. Radiance is
    // linear in each independent TOA source.
    var has_source = false;
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT; source_index += 1u) {
        if (!atmo_source_enabled(source_index)) { continue; }
        let source = atmo_source_radiance_radius(source_index);
        let irradiance = source.rgb * atmo_source_solid_angle(source.w);
        let transport = atmo_integrate_finite_segment_source(
            start_world,
            end_world,
            atmo_source_direction(source_index),
            irradiance,
        );
        combined.radiance += transport.radiance;
        if (!has_source) {
            combined.transmittance = transport.transmittance;
            has_source = true;
        }
    }
    if (!has_source) {
        let delta = end_world - start_world;
        let distance = length(delta);
        if (distance > 1e-6) {
            combined.transmittance = exp(-atmo_integrate_optical_depth(
                start_world,
                delta / distance,
                distance,
            ));
        }
    }
    return combined;
}

fn physical_atmosphere_compose_segment(
    background_radiance: vec3f,
    segment: AtmosphereSegmentTransport,
) -> vec3f {
    return segment.radiance + segment.transmittance * background_radiance;
}

fn physical_atmosphere_apply_grade(radiance: vec3f) -> vec3f {
    let exposure = exp2(clamp(physical_atmosphere.grade_exposure_chroma.x, -1.5, 1.5));
    let residual = clamp(physical_atmosphere.grade_exposure_chroma.yzw, vec3f(-0.12), vec3f(0.12));
    let strength = clamp(physical_atmosphere.grade_strength_quality.x, 0.0, 0.35);
    return max(vec3f(0.0), radiance * exposure * (vec3f(1.0) + residual * strength));
}
`;

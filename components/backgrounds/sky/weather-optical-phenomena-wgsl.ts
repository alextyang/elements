import {
    WEATHER_PHENOMENA_SCHEMA,
    WEATHER_RGB_WAVELENGTHS_MICRONS,
} from "./weather-optical-phenomena.ts";

/**
 * Binding-free parity evaluators for `weather-optical-phenomena.ts`.
 * CPU-created states provide all numerical normalizations and finite owners.
 */
export const WEATHER_OPTICAL_PHENOMENA_WGSL = /* wgsl */ `
const WEATHER_PHENOMENA_SCHEMA: u32 = ${WEATHER_PHENOMENA_SCHEMA}u;
const WEATHER_PI: f32 = 3.141592653589793;
const WEATHER_TAU: f32 = 6.283185307179586;
const WEATHER_RGB_WAVELENGTHS_MICRONS: vec3<f32> = vec3<f32>(
    ${WEATHER_RGB_WAVELENGTHS_MICRONS[0]},
    ${WEATHER_RGB_WAVELENGTHS_MICRONS[1]},
    ${WEATHER_RGB_WAVELENGTHS_MICRONS[2]});

struct WeatherSpectralAngularLobe {
    center_radians_rgb: vec3<f32>,
    sigma_radians_rgb: vec3<f32>,
    energy_rgb: vec3<f32>,
    normalization_rgb: vec3<f32>,
};

struct WeatherCoronaState {
    // x effective radius µm, y effective variance
    distribution: vec2<f32>,
    energy_rgb: vec3<f32>,
    normalization_rgb: vec3<f32>,
};

struct WeatherIceFeature {
    // 0 halo22, 1 halo46, 2 sundogs, 3 CZA, 4 pillar, 5 diamond glint
    kind: u32,
    energy_rgb: vec3<f32>,
    normalization_rgb: vec3<f32>,
    spectral_angle_radians_rgb: vec3<f32>,
    // x angular width, y secondary width
    width_radians: vec2<f32>,
};

struct WeatherLightningSegment {
    start_east_altitude_north_km: vec3<f32>,
    radius_metres: f32,
    end_east_altitude_north_km: vec3<f32>,
    emissive_weight: f32,
};

struct WeatherLightningPulse {
    // x start, y duration, z rise, w decay, seconds
    timing: vec4<f32>,
    // x peak current kA, y radiant energy J, z temporal integral, w peak raw
    energy: vec4<f32>,
    spectrum_rgb: vec3<f32>,
};

struct WeatherLightningEmission {
    emitted_power_rgb: vec3<f32>,
    current_kiloamps: f32,
    normalized_temporal_profile_per_second: f32,
};

struct WeatherLightningVolumeInjection {
    emissivity_rgb_per_km3: vec3<f32>,
    channel_weight: f32,
};

struct WeatherOrderedDirectionalScatteringSource {
    incident_radiance_at_sample_rgb: vec3<f32>,
    retained_base_phase_rgb_per_sr: vec3<f32>,
    replacement_phase_rgb_per_sr: vec3<f32>,
    combined_phase_rgb_per_sr: vec3<f32>,
    source_coefficient_rgb_per_km_per_sr: vec3<f32>,
    enabled: f32,
};

struct WeatherLightningCloudSource {
    phase_convolved_incident_radiance_rgb: vec3<f32>,
    source_coefficient_rgb_per_km: vec3<f32>,
    enabled: f32,
};

struct WeatherAuroraCurtain {
    // x east, y north, z orientation, w length, km/radians
    center_orientation_length: vec4<f32>,
    // x sheet width, y bottom altitude, z top altitude, w fold amplitude, km
    geometry: vec4<f32>,
    // x wavelength km, y octave count, z emission scale, w seed [0,1]
    folding: vec4<f32>,
    // x east, y north km/s
    drift_east_north_km_s: vec2<f32>,
    magnetic_field_direction: vec3<f32>,
    altitude_profile_normalization_rgb: vec3<f32>,
    column_emission_rgb: vec3<f32>,
};

struct WeatherAuroraSample {
    emissivity_rgb_per_km: vec3<f32>,
    sheet_density: f32,
    representative_altitude_km: f32,
};

struct WeatherAuroraOrderedEmission {
    emission_coefficient_rgb_per_km: vec3<f32>,
    extinction_contribution_rgb_per_km: vec3<f32>,
    scattering_contribution_rgb_per_km: vec3<f32>,
};

struct WeatherBlowingBoundaryState {
    // x east, y north, z major radius, w minor radius, km
    center_extent: vec4<f32>,
    // x orientation, y top altitude km, z transition fraction,
    // w kind (0 snow, 1 dust, 2 resuspended volcanic ash)
    geometry: vec4<f32>,
    // x east, y north m/s, z friction velocity m/s, w seed [0,1]
    motion: vec4<f32>,
    extinction_rgb_km: vec3<f32>,
    scattering_albedo_asymmetry: vec4<f32>,
};

struct WeatherBlowingSample {
    extinction_rgb_km: vec3<f32>,
    single_scattering_albedo_rgb: vec3<f32>,
    asymmetry: f32,
    source_weight: f32,
    velocity_east_altitude_north_mps: vec3<f32>,
};

struct WeatherBlowingPassiveSource {
    extinction_rgb_km: vec3<f32>,
    scattering_rgb_km: vec3<f32>,
    source_coefficient_rgb_km: vec3<f32>,
};

fn weather_saturate(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn weather_safe_normalize(value: vec3<f32>) -> vec3<f32> {
    let magnitude = length(value);
    if (magnitude > 1e-12) { return value / magnitude; }
    return vec3<f32>(0.0, 1.0, 0.0);
}

fn weather_angular_gaussian(theta: f32, center: f32, sigma: f32) -> f32 {
    let coordinate = (theta - center) / max(1e-7, sigma);
    return exp(-0.5 * coordinate * coordinate);
}

fn weather_spectral_angular_lobe(
    lobe: WeatherSpectralAngularLobe,
    scattering_angle_radians: f32,
) -> vec3<f32> {
    let coordinate = (vec3<f32>(scattering_angle_radians) -
        lobe.center_radians_rgb) / max(lobe.sigma_radians_rgb, vec3<f32>(1e-7));
    let kernel = exp(-0.5 * coordinate * coordinate);
    return lobe.energy_rgb * kernel / max(lobe.normalization_rgb, vec3<f32>(1e-12));
}

fn weather_bessel_j1(input_value: f32) -> f32 {
    let sign_value = select(1.0, -1.0, input_value < 0.0);
    let x = abs(input_value);
    if (x < 10.0) {
        let half = x * 0.5;
        var term = half;
        var result = term;
        for (var order = 1u; order < 18u; order += 1u) {
            let scalar_order = f32(order);
            term *= -(half * half) / (scalar_order * (scalar_order + 1.0));
            result += term;
        }
        return result * sign_value;
    }
    return sign_value * sqrt(2.0 / (WEATHER_PI * x)) *
        (cos(x - WEATHER_PI * 0.75) -
            3.0 / (8.0 * x) * sin(x - WEATHER_PI * 0.75));
}

fn weather_corona_kernel(
    theta: f32,
    effective_radius_microns: f32,
    effective_variance: f32,
    wavelength_microns: f32,
) -> f32 {
    let x = 2.0 * WEATHER_TAU * effective_radius_microns /
        wavelength_microns * sin(theta * 0.5);
    var airy = 1.0;
    if (abs(x) >= 1e-5) {
        airy = pow(2.0 * weather_bessel_j1(x) / x, 2.0);
    }
    let damping = exp(-clamp(effective_variance, 0.01, 0.35) * x * 0.16);
    return airy * damping;
}

fn weather_corona_phase(
    corona: WeatherCoronaState,
    scattering_angle_radians: f32,
) -> vec3<f32> {
    var result = vec3<f32>(0.0);
    for (var channel = 0u; channel < 3u; channel += 1u) {
        result[channel] = corona.energy_rgb[channel] * weather_corona_kernel(
            scattering_angle_radians,
            corona.distribution.x,
            corona.distribution.y,
            WEATHER_RGB_WAVELENGTHS_MICRONS[channel]) /
            max(1e-12, corona.normalization_rgb[channel]);
    }
    return result;
}

fn weather_droplet_scattering_angle(
    source_direction: vec3<f32>,
    view_direction: vec3<f32>,
) -> f32 {
    return acos(clamp(dot(weather_safe_normalize(source_direction),
        weather_safe_normalize(view_direction)), -1.0, 1.0));
}

// Conservative broad-phase replacement used inside one finite-owner march.
// Incident atmosphere/shadow attenuation is applied here; camera-path
// transmittance and bloom are deliberately downstream.
fn weather_ordered_phase_replacement_source(
    scattering_coefficient_rgb_per_km: vec3<f32>,
    base_phase_rgb_per_sr: vec3<f32>,
    replacement_phase_rgb_per_sr: vec3<f32>,
    replacement_energy_rgb: vec3<f32>,
    owner_sample_weight: f32,
    owner_match: f32,
    radiance_before_atmosphere_rgb: vec3<f32>,
    atmosphere_transmittance_to_sample_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> WeatherOrderedDirectionalScatteringSource {
    let membership = clamp(owner_sample_weight, 0.0, 1.0) *
        select(0.0, 1.0, owner_match > 0.5);
    if (membership <= 0.0 || all(scattering_coefficient_rgb_per_km <=
        vec3<f32>(0.0))) {
        return WeatherOrderedDirectionalScatteringSource(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0),
            vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let incident = max(radiance_before_atmosphere_rgb, vec3<f32>(0.0)) *
        clamp(atmosphere_transmittance_to_sample_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)) *
        clamp(source_visibility_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let effective_energy = clamp(replacement_energy_rgb,
        vec3<f32>(0.0), vec3<f32>(1.0)) * membership;
    let retained_base = max(base_phase_rgb_per_sr, vec3<f32>(0.0)) *
        (vec3<f32>(1.0) - effective_energy);
    let replacement = max(replacement_phase_rgb_per_sr,
        vec3<f32>(0.0)) * membership;
    let combined = retained_base + replacement;
    return WeatherOrderedDirectionalScatteringSource(
        incident,
        retained_base,
        replacement,
        combined,
        max(scattering_coefficient_rgb_per_km, vec3<f32>(0.0)) *
            incident * combined,
        1.0);
}

fn weather_droplet_ordered_source(
    scattering_coefficient_rgb_per_km: vec3<f32>,
    base_phase_rgb_per_sr: vec3<f32>,
    replacement_phase_rgb_per_sr: vec3<f32>,
    replacement_energy_rgb: vec3<f32>,
    owner_sample_weight: f32,
    owner_match: f32,
    radiance_before_atmosphere_rgb: vec3<f32>,
    atmosphere_transmittance_to_sample_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> WeatherOrderedDirectionalScatteringSource {
    return weather_ordered_phase_replacement_source(
        scattering_coefficient_rgb_per_km,
        base_phase_rgb_per_sr,
        replacement_phase_rgb_per_sr,
        replacement_energy_rgb,
        owner_sample_weight,
        owner_match,
        radiance_before_atmosphere_rgb,
        atmosphere_transmittance_to_sample_rgb,
        source_visibility_rgb);
}

fn weather_direction_azimuth_elevation(
    direction_input: vec3<f32>,
    up_input: vec3<f32>,
) -> vec2<f32> {
    let direction = weather_safe_normalize(direction_input);
    let up = weather_safe_normalize(up_input);
    let elevation = asin(clamp(dot(direction, up), -1.0, 1.0));
    let horizontal = weather_safe_normalize(direction - up * sin(elevation));
    return vec2<f32>(atan2(horizontal.x, horizontal.z), elevation);
}

fn weather_wrap_radians(value: f32) -> f32 {
    let shifted = value + WEATHER_PI;
    return shifted - floor(shifted / WEATHER_TAU) * WEATHER_TAU - WEATHER_PI;
}

fn weather_ice_feature_raw(
    feature: WeatherIceFeature,
    channel: u32,
    source_direction: vec3<f32>,
    view_direction: vec3<f32>,
    local_up: vec3<f32>,
    source_elevation_radians: f32,
    tilt_sigma_radians: f32,
) -> f32 {
    let source = weather_direction_azimuth_elevation(source_direction, local_up);
    let view = weather_direction_azimuth_elevation(view_direction, local_up);
    let separation = weather_droplet_scattering_angle(source_direction, view_direction);
    let azimuth_delta = weather_wrap_radians(view.x - source.x);
    let spectral_angle = feature.spectral_angle_radians_rgb[channel];
    if (feature.kind <= 1u) {
        return weather_angular_gaussian(
            separation, spectral_angle, feature.width_radians.x);
    }
    if (feature.kind == 2u) {
        let target_azimuth = spectral_angle /
            max(0.34, cos(source_elevation_radians));
        let azimuth_error = abs(abs(azimuth_delta) - target_azimuth);
        return exp(-0.5 * pow(azimuth_error / feature.width_radians.x, 2.0) -
            0.5 * pow((view.y - source_elevation_radians) /
                feature.width_radians.y, 2.0));
    }
    if (feature.kind == 3u) {
        let refractive_indices = vec3<f32>(1.306, 1.311, 1.317);
        let target_sine = sqrt(max(0.0,
            refractive_indices[channel] * refractive_indices[channel] -
            pow(cos(source_elevation_radians), 2.0)));
        if (target_sine > 1.0 || source_elevation_radians < 0.0 ||
            source_elevation_radians > 0.563741) { return 0.0; }
        let target_elevation = asin(target_sine);
        return exp(-0.5 * pow((view.y - target_elevation) /
                feature.width_radians.x, 2.0) -
            0.5 * pow(azimuth_delta / feature.width_radians.y, 2.0));
    }
    if (feature.kind == 4u) {
        return exp(-abs(view.y - source_elevation_radians) /
                feature.width_radians.y) *
            exp(-0.5 * pow(azimuth_delta / feature.width_radians.x, 2.0));
    }
    let half_sum = weather_safe_normalize(source_direction) +
        weather_safe_normalize(view_direction);
    if (length(half_sum) < 1e-6) { return 0.0; }
    let half_vector = weather_safe_normalize(half_sum);
    let cosine = max(1e-5, dot(half_vector, weather_safe_normalize(local_up)));
    let tangent_squared = max(0.0, 1.0 - cosine * cosine) / (cosine * cosine);
    let alpha = clamp(max(tilt_sigma_radians, 0.0020944), 0.0020944, 0.20944);
    return exp(-tangent_squared / (alpha * alpha)) /
        (WEATHER_PI * alpha * alpha * pow(cosine, 4.0));
}

fn weather_oriented_ice_phase_replacement(
    feature: WeatherIceFeature,
    source_direction: vec3<f32>,
    view_direction: vec3<f32>,
    local_up: vec3<f32>,
    source_elevation_radians: f32,
    tilt_sigma_radians: f32,
    owner_sample_weight: f32,
) -> vec3<f32> {
    var result = vec3<f32>(0.0);
    for (var channel = 0u; channel < 3u; channel += 1u) {
        result[channel] = feature.energy_rgb[channel] * weather_ice_feature_raw(
            feature, channel, source_direction, view_direction, local_up,
            source_elevation_radians, tilt_sigma_radians) /
            max(1e-12, feature.normalization_rgb[channel]);
    }
    return result * clamp(owner_sample_weight, 0.0, 1.0);
}

fn weather_oriented_ice_ordered_source(
    scattering_coefficient_rgb_per_km: vec3<f32>,
    base_phase_rgb_per_sr: vec3<f32>,
    replacement_phase_rgb_per_sr: vec3<f32>,
    replacement_energy_rgb: vec3<f32>,
    owner_sample_weight: f32,
    owner_match: f32,
    state_source_direction: vec3<f32>,
    current_source_direction: vec3<f32>,
    radiance_before_atmosphere_rgb: vec3<f32>,
    atmosphere_transmittance_to_sample_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> WeatherOrderedDirectionalScatteringSource {
    let source_match = select(0.0, 1.0,
        dot(weather_safe_normalize(state_source_direction),
            weather_safe_normalize(current_source_direction)) >= 0.9999996);
    return weather_ordered_phase_replacement_source(
        scattering_coefficient_rgb_per_km,
        base_phase_rgb_per_sr,
        replacement_phase_rgb_per_sr,
        replacement_energy_rgb,
        owner_sample_weight,
        owner_match * source_match,
        radiance_before_atmosphere_rgb,
        atmosphere_transmittance_to_sample_rgb,
        source_visibility_rgb);
}

fn weather_lightning_raw_pulse(elapsed: f32, rise: f32, decay: f32) -> f32 {
    if (elapsed < 0.0) { return 0.0; }
    let ratio = elapsed / max(1e-7, rise);
    let leader = pow(ratio, 3.0) / (1.0 + pow(ratio, 3.0));
    return leader * exp(-elapsed / max(rise, decay));
}

fn weather_lightning_pulse(
    pulse: WeatherLightningPulse,
    event_time_seconds: f32,
) -> WeatherLightningEmission {
    let elapsed = event_time_seconds - pulse.timing.x;
    if (elapsed < 0.0 || elapsed > pulse.timing.y) {
        return WeatherLightningEmission(vec3<f32>(0.0), 0.0, 0.0);
    }
    let raw = weather_lightning_raw_pulse(elapsed, pulse.timing.z, pulse.timing.w);
    let profile = raw / max(1e-12, pulse.energy.z);
    return WeatherLightningEmission(
        pulse.spectrum_rgb * pulse.energy.y * profile,
        pulse.energy.x * clamp(raw / max(1e-12, pulse.energy.w), 0.0, 1.0),
        profile);
}

fn weather_distance_to_lightning_segment_km(
    position: vec3<f32>,
    segment: WeatherLightningSegment,
) -> f32 {
    let direction = segment.end_east_altitude_north_km -
        segment.start_east_altitude_north_km;
    let relative = position - segment.start_east_altitude_north_km;
    let progress = clamp(dot(relative, direction) /
        max(1e-12, dot(direction, direction)), 0.0, 1.0);
    return length(position -
        (segment.start_east_altitude_north_km + direction * progress));
}

// The event power is divided over weighted channel length and a normalized
// radial Gaussian. Integrate this as an in-world cloud/air emissive source.
fn weather_lightning_segment_injection(
    position: vec3<f32>,
    segment: WeatherLightningSegment,
    event_power_rgb: vec3<f32>,
    weighted_channel_length_km: f32,
) -> WeatherLightningVolumeInjection {
    let sigma_km = max(2e-5, segment.radius_metres * 0.001 * 1.6);
    let radius_km = weather_distance_to_lightning_segment_km(position, segment);
    let support_sigmas = 4.5;
    if (radius_km > support_sigmas * sigma_km) {
        return WeatherLightningVolumeInjection(vec3<f32>(0.0), 0.0);
    }
    let captured_energy = 1.0 - exp(-0.5 * support_sigmas * support_sigmas);
    let radial = exp(-0.5 * pow(radius_km / sigma_km, 2.0)) /
        (WEATHER_TAU * sigma_km * sigma_km * captured_energy);
    let channel_weight = segment.emissive_weight * radial /
        max(1e-6, weighted_channel_length_km);
    return WeatherLightningVolumeInjection(event_power_rgb * channel_weight,
        channel_weight);
}

// Channel light reaching a cloud sample is scattered once. This is not a
// second volume emitter and does not contain camera bloom.
fn weather_lightning_cloud_scattering_source(
    cloud_scattering_coefficient_rgb_per_km: vec3<f32>,
    owner_sample_weight: f32,
    owner_match: f32,
    event_active: f32,
    unattenuated_phase_convolved_channel_radiance_rgb: vec3<f32>,
    channel_to_sample_transmittance_rgb: vec3<f32>,
) -> WeatherLightningCloudSource {
    let membership = clamp(owner_sample_weight, 0.0, 1.0) *
        select(0.0, 1.0, owner_match > 0.5) *
        select(0.0, 1.0, event_active > 0.5);
    if (membership <= 0.0) {
        return WeatherLightningCloudSource(vec3<f32>(0.0),
            vec3<f32>(0.0), 0.0);
    }
    let incident = max(unattenuated_phase_convolved_channel_radiance_rgb,
        vec3<f32>(0.0)) * clamp(channel_to_sample_transmittance_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0));
    return WeatherLightningCloudSource(
        incident,
        max(cloud_scattering_coefficient_rgb_per_km, vec3<f32>(0.0)) *
            incident * membership,
        1.0);
}

fn weather_hash11(value: f32) -> f32 {
    return fract(sin(value * 127.1) * 43758.5453123);
}

fn weather_gaussian(value: f32, center: f32, sigma: f32) -> f32 {
    return exp(-0.5 * pow((value - center) / max(1e-6, sigma), 2.0));
}

fn weather_aurora_curtain_emission(
    curtain: WeatherAuroraCurtain,
    position_east_altitude_north_km: vec3<f32>,
    time_seconds: f32,
) -> WeatherAuroraSample {
    let moved_center = curtain.center_orientation_length.xy +
        curtain.drift_east_north_km_s * time_seconds;
    let magnetic_field = weather_safe_normalize(curtain.magnetic_field_direction);
    let field_altitude_scale = (position_east_altitude_north_km.y - 113.8) /
        max(0.08, abs(magnetic_field.y));
    let delta = position_east_altitude_north_km.xz - moved_center -
        magnetic_field.xz * field_altitude_scale;
    let orientation = curtain.center_orientation_length.z;
    let along_direction = vec2<f32>(cos(orientation), sin(orientation));
    let across_direction = vec2<f32>(-along_direction.y, along_direction.x);
    let along = dot(delta, along_direction);
    var fold = 0.0;
    var amplitude = curtain.geometry.w;
    var frequency = WEATHER_TAU / max(1.0, curtain.folding.x);
    let octave_count = u32(clamp(curtain.folding.y, 1.0, 4.0));
    for (var octave = 0u; octave < 4u; octave += 1u) {
        if (octave >= octave_count) { break; }
        fold += sin(along * frequency + time_seconds * (0.11 + f32(octave) * 0.07) +
            weather_hash11(curtain.folding.w * 4096.0 + f32(octave) * 17.0) *
                WEATHER_TAU) * amplitude;
        amplitude *= 0.42;
        frequency *= 2.07;
    }
    let across = dot(delta, across_direction) - fold;
    let length_km = curtain.center_orientation_length.w;
    let along_window = 1.0 - smoothstep(length_km * 0.43,
        length_km * 0.5, abs(along));
    let sheet_width = max(0.05, curtain.geometry.x);
    let absolute_across = abs(across);
    var across_window = 1.0 - smoothstep(sheet_width * 3.5,
        sheet_width * 4.0, absolute_across);
    if (absolute_across >= sheet_width * 4.0) { across_window = 0.0; }
    let sheet_density = exp(-0.5 * pow(across / sheet_width, 2.0)) *
        along_window * across_window;
    let altitude = position_east_altitude_north_km.y;
    if (altitude < curtain.geometry.y || altitude > curtain.geometry.z ||
        sheet_density <= 1e-8) {
        return WeatherAuroraSample(vec3<f32>(0.0), 0.0, 110.0);
    }
    let red = weather_gaussian(altitude, 225.0, 48.0) * 0.34 +
        weather_gaussian(altitude, 155.0, 28.0) * 0.08;
    let green = weather_gaussian(altitude, 113.8, 17.0);
    let blue = weather_gaussian(altitude, 113.5, 14.0) * 0.36 +
        weather_gaussian(altitude, 136.0, 20.0) * 0.08;
    let electron_precipitation = 0.84 + 0.16 * sin(
        along / max(2.0, curtain.folding.x) * 11.7 + time_seconds * 1.9 +
        weather_hash11(curtain.folding.w * 8192.0 + 77.0) * WEATHER_TAU);
    let altitude_profile = vec3<f32>(red, green, blue) /
        max(curtain.altitude_profile_normalization_rgb, vec3<f32>(1e-12));
    let scale = sheet_density * clamp(electron_precipitation, 0.6, 1.05);
    var representative_altitude = 113.8;
    if (red > green && red > blue) { representative_altitude = 225.0; }
    if (blue > green && blue > red) { representative_altitude = 113.5; }
    return WeatherAuroraSample(curtain.column_emission_rgb *
        altitude_profile * scale,
        sheet_density, representative_altitude);
}

fn weather_aurora_ordered_emission_source(
    sample: WeatherAuroraSample,
) -> WeatherAuroraOrderedEmission {
    return WeatherAuroraOrderedEmission(
        max(sample.emissivity_rgb_per_km, vec3<f32>(0.0)),
        vec3<f32>(0.0),
        vec3<f32>(0.0));
}

fn weather_blowing_boundary_sample(
    state: WeatherBlowingBoundaryState,
    position_east_altitude_north_km: vec3<f32>,
    time_seconds: f32,
) -> WeatherBlowingSample {
    let altitude = position_east_altitude_north_km.y;
    if (altitude < 0.0 || altitude > state.geometry.y) {
        return WeatherBlowingSample(vec3<f32>(0.0), vec3<f32>(0.0),
            state.scattering_albedo_asymmetry.w, 0.0, vec3<f32>(0.0));
    }
    let advected_center = state.center_extent.xy + state.motion.xy *
        time_seconds / 1000.0;
    let delta = position_east_altitude_north_km.xz - advected_center;
    let sine = sin(state.geometry.x);
    let cosine = cos(state.geometry.x);
    let local = vec2<f32>(
        dot(delta, vec2<f32>(sine, cosine)) / max(0.001, state.center_extent.z),
        dot(delta, vec2<f32>(cosine, -sine)) / max(0.001, state.center_extent.w));
    let angle = atan2(local.y, local.x);
    let boundary = 1.0 + 0.08 * sin(angle * 3.0 +
            weather_hash11(state.motion.w * 4096.0 + 11.0) * WEATHER_TAU) +
        0.045 * sin(angle * 7.0 -
            weather_hash11(state.motion.w * 4096.0 + 12.0) * WEATHER_TAU);
    let radius = length(local) / max(0.75, boundary);
    let horizontal = 1.0 - smoothstep(
        1.0 - state.geometry.z,
        1.0 + state.geometry.z,
        radius);
    let normalized_altitude = altitude / max(0.001, state.geometry.y);
    var vertical_scale = 0.16;
    if (state.geometry.w > 1.5) {
        vertical_scale = 0.36;
    } else if (state.geometry.w > 0.5) {
        vertical_scale = 0.28;
    }
    let vertical = exp(-normalized_altitude / vertical_scale) *
        (1.0 - smoothstep(0.76, 1.0, normalized_altitude));
    let streak = 0.78 + 0.22 * sin(delta.x * 5.1 + delta.y * 2.7 +
        time_seconds * 2.2 + weather_hash11(state.motion.w * 4096.0 + 19.0) *
            WEATHER_TAU);
    let source_weight = clamp(horizontal * vertical * streak, 0.0, 1.0);
    return WeatherBlowingSample(
        state.extinction_rgb_km * source_weight,
        state.scattering_albedo_asymmetry.xyz,
        state.scattering_albedo_asymmetry.w,
        source_weight,
        vec3<f32>(state.motion.x, state.motion.z * 0.16, state.motion.y));
}

fn weather_blowing_passive_source_coefficient(
    sample: WeatherBlowingSample,
    phase_weighted_incident_radiance_rgb: vec3<f32>,
) -> WeatherBlowingPassiveSource {
    let extinction = max(sample.extinction_rgb_km, vec3<f32>(0.0));
    let scattering = extinction * clamp(
        sample.single_scattering_albedo_rgb,
        vec3<f32>(0.0),
        vec3<f32>(1.0));
    return WeatherBlowingPassiveSource(
        extinction,
        scattering,
        scattering * max(phase_weighted_incident_radiance_rgb, vec3<f32>(0.0)));
}
`;

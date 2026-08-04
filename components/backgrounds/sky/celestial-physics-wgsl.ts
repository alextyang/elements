import { CELESTIAL_PHYSICS_CONSTANTS } from "./celestial-physics.ts";

const wgslFloat = (value: number) => Number.isInteger(value)
    ? `${value.toFixed(1)}`
    : `${value}`;

const C = CELESTIAL_PHYSICS_CONSTANTS;

/**
 * Binding-free WGSL evaluators matching `celestial-physics.ts`.
 *
 * The caller owns buffers/textures and transport order. In particular, these
 * functions never apply display exposure, never sample the atmosphere twice,
 * and never alpha-blend an unlit lunar disc over foreground sky radiance.
 */
export const CELESTIAL_PHYSICS_WGSL = /* wgsl */ `
const CELESTIAL_PI: f32 = ${wgslFloat(C.pi)};
const CELESTIAL_SUN_VISUAL_MAGNITUDE: f32 = ${wgslFloat(C.sunVisualMagnitude)};
const CELESTIAL_SOLAR_ANGULAR_RADIUS: f32 = ${wgslFloat(C.solarAngularRadiusRadians)};
const CELESTIAL_MIN_MOFFAT_BETA: f32 = ${wgslFloat(C.minMoffatBeta)};
const CELESTIAL_MAX_EARTHSHINE_RATIO: f32 = ${wgslFloat(C.maxEarthshineRatio)};
const CELESTIAL_EARTH_RADIUS_KM: f32 = ${wgslFloat(C.earthRadiusKm)};
const CELESTIAL_RGB_LUMINANCE: vec3<f32> = vec3<f32>(
    ${wgslFloat(C.linearRgbLuminance[0])},
    ${wgslFloat(C.linearRgbLuminance[1])},
    ${wgslFloat(C.linearRgbLuminance[2])});
const CELESTIAL_RGB_WAVELENGTHS_NM: vec3<f32> = vec3<f32>(
    ${wgslFloat(C.rgbWavelengthsNm[0])},
    ${wgslFloat(C.rgbWavelengthsNm[1])},
    ${wgslFloat(C.rgbWavelengthsNm[2])});

struct CelestialStellarTurbulence {
    rgb_gain: vec3<f32>,
    common_intensity_gain: f32,
    tip_tilt_arcseconds: vec2<f32>,
    intensity_rms: f32,
    seeing_fwhm_arcseconds: f32,
};

struct CelestialLunarPhotometry {
    // x single-scattering albedo, y backscatter asymmetry,
    // z secondary-lobe weight, w opposition amplitude
    scattering: vec4<f32>,
    // x opposition width radians, y macroscopic roughness radians,
    // z reference linear albedo, w reserved (write zero)
    surface: vec4<f32>,
};

struct CelestialLunarSurfaceSample {
    toa_radiance: vec3<f32>,
    direct_solar_radiance: vec3<f32>,
    earthshine_radiance: vec3<f32>,
    incidence_cosine: f32,
    emission_cosine: f32,
    phase_angle_radians: f32,
    bidirectional_reflectance: f32,
    earthshine_ratio: f32,
};

struct CelestialLunarDiscGeometry {
    surface_normal: vec3<f32>,
    limb_coverage: f32,
    radial_distance: f32,
};

struct CelestialLunarTextureCoordinateSample {
    surface_normal: vec3<f32>,
    limb_coverage: f32,
    radial_distance: f32,
    texture_uv: vec2<f32>,
    moon_fixed_direction: vec3<f32>,
    texture_footprint_radians: f32,
    terrain_normal_reliability: f32,
};

struct CelestialLunarAureoleSample {
    observed_radiance: vec3<f32>,
    rayleigh_radiance: vec3<f32>,
    aerosol_radiance: vec3<f32>,
    effective_scattering_angle_radians: f32,
};

struct CelestialLayerContribution {
    additive_observed_radiance: vec3<f32>,
    extra_atmospheric_background_transmission: f32,
    stellar_occultation_coverage: f32,
};

struct CelestialAirglowSample {
    emission_radiance: vec3<f32>,
    relative_path_length: f32,
    representative_altitude_km: f32,
};

struct CelestialSunDiscSample {
    toa_radiance: vec3<f32>,
    coverage: f32,
    angular_separation_radians: f32,
};

// Exact six-vec4 layout returned by packLunarDiscRadianceContract.
struct CelestialLunarDiscRadiometry {
    toa_irradiance_angular_radius: vec4<f32>,
    observer_transmittance_solid_angle: vec4<f32>,
    observed_irradiance_common_exposure: vec4<f32>,
    mean_toa_radiance_profile_kind: vec4<f32>,
    relative_irradiance_fraction_distance_phase_count: vec4<f32>,
    rolo_calibration_phase_angle: vec4<f32>,
};

// Exact seven-vec4 layout returned by packPhysicalSunDiscAtmosphereState.
struct CelestialSunDiscRadiometry {
    direction_angular_radius: vec4<f32>,
    toa_irradiance_solid_angle: vec4<f32>,
    center_toa_radiance_distance_au: vec4<f32>,
    observer_transmittance_common_exposure: vec4<f32>,
    observed_irradiance_glare_owner: vec4<f32>,
    limb_darkening_psf_core: vec4<f32>,
    psf_wing_reserved: vec4<f32>,
};

struct CelestialAtmosphereOrderSample {
    toa_boundary_radiance: vec3<f32>,
    observed_radiance_before_clouds: vec3<f32>,
    extra_atmospheric_background_transmission: f32,
};

struct CelestialNaturalNightTransportSample {
    observed_extra_atmospheric_radiance: vec3<f32>,
    observed_airglow_radiance: vec3<f32>,
    observed_diffuse_radiance_before_clouds: vec3<f32>,
    ground_upward_radiance: vec3<f32>,
};

fn celestial_safe_normalize(value: vec3<f32>) -> vec3<f32> {
    let magnitude = length(value);
    if (magnitude <= 1e-12) { return vec3<f32>(0.0, 1.0, 0.0); }
    return value / magnitude;
}

fn celestial_stellar_flux_relative_to_sun(visual_magnitude: f32) -> f32 {
    return pow(10.0, -0.4 * (visual_magnitude - CELESTIAL_SUN_VISUAL_MAGNITUDE));
}

fn celestial_stellar_temperature_from_bv(bv: f32) -> f32 {
    let bounded = clamp(bv, -0.4, 2.4);
    return clamp(4600.0 * (
        1.0 / (0.92 * bounded + 1.7) +
        1.0 / (0.92 * bounded + 0.62)), 2400.0, 40000.0);
}

fn celestial_stellar_linear_rgb_from_bv(bv: f32) -> vec3<f32> {
    let temperature = celestial_stellar_temperature_from_bv(bv);
    let inverse = 1.0 / clamp(temperature, 1667.0, 25000.0);
    let inverse2 = inverse * inverse;
    let inverse3 = inverse2 * inverse;
    var x: f32;
    if (temperature <= 4000.0) {
        x = -0.2661239e9 * inverse3 - 0.2343580e6 * inverse2 +
            0.8776956e3 * inverse + 0.179910;
    } else {
        x = -3.0258469e9 * inverse3 + 2.1070379e6 * inverse2 +
            0.2226347e3 * inverse + 0.240390;
    }
    var y: f32;
    if (temperature <= 2222.0) {
        y = -1.1063814 * x * x * x - 1.34811020 * x * x +
            2.18555832 * x - 0.20219683;
    } else if (temperature <= 4000.0) {
        y = -0.9549476 * x * x * x - 1.37418593 * x * x +
            2.09137015 * x - 0.16748867;
    } else {
        y = 3.0817580 * x * x * x - 5.8733867 * x * x +
            3.75112997 * x - 0.37001483;
    }
    let xyz = vec3<f32>(
        x / max(1e-6, y),
        1.0,
        max(0.0, (1.0 - x - y) / max(1e-6, y)));
    let linear_rgb = max(vec3<f32>(0.0), vec3<f32>(
        3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z,
        -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z,
        0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z));
    return linear_rgb / max(1e-8, dot(linear_rgb, CELESTIAL_RGB_LUMINANCE));
}

fn celestial_stellar_toa_flux_rgb(visual_magnitude: f32, bv: f32) -> vec3<f32> {
    return celestial_stellar_linear_rgb_from_bv(bv) *
        celestial_stellar_flux_relative_to_sun(visual_magnitude);
}

fn celestial_moffat_alpha(fwhm: f32, beta: f32) -> f32 {
    return max(1e-12, fwhm) /
        (2.0 * sqrt(max(1e-12, pow(2.0, 1.0 / max(1.001, beta)) - 1.0)));
}

// Energy density per square coordinate unit; its infinite-plane integral is 1.
fn celestial_normalized_moffat(radius: f32, fwhm: f32, beta: f32) -> f32 {
    let bounded_beta = max(CELESTIAL_MIN_MOFFAT_BETA, beta);
    let alpha = celestial_moffat_alpha(fwhm, bounded_beta);
    let radius_squared = max(0.0, radius) * max(0.0, radius);
    return (bounded_beta - 1.0) / (CELESTIAL_PI * alpha * alpha) *
        pow(1.0 + radius_squared / (alpha * alpha), -bounded_beta);
}

fn celestial_stellar_psf(
    radius: f32,
    fwhm: f32,
    beta: f32,
    wing_fraction: f32,
    wing_scale: f32,
) -> f32 {
    let bounded_wing = clamp(wing_fraction, 0.0, 0.35);
    let core = celestial_normalized_moffat(radius, fwhm, beta);
    let wing = celestial_normalized_moffat(
        radius, fwhm * max(1.001, wing_scale), max(1.08, beta - 0.8));
    return mix(core, wing, bounded_wing);
}

fn celestial_moffat_encircled_energy(radius: f32, fwhm: f32, beta: f32) -> f32 {
    let bounded_beta = max(CELESTIAL_MIN_MOFFAT_BETA, beta);
    let alpha = celestial_moffat_alpha(fwhm, bounded_beta);
    return clamp(1.0 - pow(
        1.0 + max(0.0, radius) * max(0.0, radius) / (alpha * alpha),
        1.0 - bounded_beta), 0.0, 1.0);
}

fn celestial_hash11(value: f32) -> f32 {
    return fract(sin(value * 127.1) * 43758.5453123);
}

fn celestial_noise1(value: f32) -> f32 {
    let cell = floor(value);
    let local = fract(value);
    let eased = local * local * (3.0 - 2.0 * local);
    return mix(celestial_hash11(cell), celestial_hash11(cell + 1.0), eased) * 2.0 - 1.0;
}

fn celestial_turbulence_noise(time: f32, seed: f32) -> f32 {
    return celestial_noise1(time * 0.43 + seed * 113.0) * 0.28 +
        celestial_noise1(time * 1.73 + seed * 271.0) * 0.46 +
        celestial_noise1(time * 4.21 + seed * 619.0) * 0.26;
}

fn celestial_stellar_turbulence(
    time_seconds: f32,
    seed: f32,
    relative_air_mass: f32,
    aperture_diameter_mm: f32,
    exposure_seconds: f32,
    observer_altitude_metres: f32,
    seeing_fwhm_arcseconds: f32,
    chromatic_strength: f32,
    turbulence_frequency_hz: f32,
) -> CelestialStellarTurbulence {
    let air_mass = clamp(relative_air_mass, 1.0, 40.0);
    let aperture_cm = clamp(aperture_diameter_mm / 10.0, 0.2, 1000.0);
    let temporal_average = sqrt(max(1.0, 2.0 * exposure_seconds * 60.0));
    let intensity_rms = clamp(
        0.09 * pow(aperture_cm, -2.0 / 3.0) * pow(air_mass, 1.75) *
            exp(-max(0.0, observer_altitude_metres) / 8000.0) /
            temporal_average,
        0.0, 0.42);
    let log_sigma = sqrt(log(1.0 + intensity_rms * intensity_rms));
    let time = time_seconds * clamp(turbulence_frequency_hz, 0.05, 12.0);
    let common_noise = celestial_turbulence_noise(time, seed);
    let common_gain = exp(common_noise * log_sigma - 0.5 * log_sigma * log_sigma);
    let dispersion = clamp((air_mass - 1.0) / 15.0, 0.0, 1.0) *
        clamp(chromatic_strength, 0.0, 2.0) * log_sigma * 0.32;
    let chromatic_a = celestial_turbulence_noise(time * 1.19 + 17.3, seed + 7.17);
    let chromatic_b = celestial_turbulence_noise(time * 0.91 + 41.9, seed + 19.31);
    let raw_chromatic = exp(dispersion * vec3<f32>(
        0.7071 * chromatic_a + 0.4082 * chromatic_b,
        -0.8165 * chromatic_b,
        -0.7071 * chromatic_a + 0.4082 * chromatic_b));
    let rgb_gain = raw_chromatic * common_gain /
        max(1e-6, dot(raw_chromatic, CELESTIAL_RGB_LUMINANCE));
    let tip_tilt_rms = clamp(max(0.1, seeing_fwhm_arcseconds) *
        (0.055 + 0.16 * clamp((air_mass - 1.0) / 8.0, 0.0, 1.0)) *
        clamp(pow(25.0 / max(2.0, aperture_diameter_mm), 0.16), 0.65, 1.8),
        0.005, 1.5);
    let tip_tilt = vec2<f32>(
        celestial_turbulence_noise(time * 0.67 + 83.1, seed + 31.7),
        celestial_turbulence_noise(time * 0.59 + 129.7, seed + 53.9)) * tip_tilt_rms;
    return CelestialStellarTurbulence(
        rgb_gain, common_gain, tip_tilt, intensity_rms,
        clamp(seeing_fwhm_arcseconds, 0.15, 12.0));
}

fn celestial_hapke_h(cosine: f32, single_scattering_albedo: f32) -> f32 {
    let mu = max(0.0, cosine);
    return (1.0 + 2.0 * mu) /
        (1.0 + 2.0 * mu * sqrt(max(1e-5, 1.0 - single_scattering_albedo)));
}

fn celestial_unnormalized_hg(cosine: f32, asymmetry: f32) -> f32 {
    let g = clamp(asymmetry, -0.95, 0.95);
    return (1.0 - g * g) /
        pow(max(1e-7, 1.0 + g * g - 2.0 * g * cosine), 1.5);
}

fn celestial_lunar_earthshine_ratio(
    illuminated_fraction: f32,
    earth_albedo_factor: f32,
) -> f32 {
    return CELESTIAL_MAX_EARTHSHINE_RATIO *
        pow(1.0 - clamp(illuminated_fraction, 0.0, 1.0), 1.65) *
        clamp(earth_albedo_factor, 0.55, 1.45);
}

fn celestial_lunar_disk_relative_irradiance(
    phase_angle_radians: f32,
    distance_km: f32,
) -> f32 {
    let phase = clamp(phase_angle_radians, 0.0, CELESTIAL_PI);
    let phase_degrees = phase * 180.0 / CELESTIAL_PI;
    let phase_magnitude = 0.026 * phase_degrees +
        4e-9 * pow(phase_degrees, 4.0);
    let opposition_progress = clamp((7.0 - phase_degrees) / 7.0, 0.0, 1.0);
    let opposition_surge = 1.0 + opposition_progress * opposition_progress * 0.24;
    let phase_relative = clamp(
        pow(10.0, -0.4 * phase_magnitude) * opposition_surge / 1.24,
        0.0,
        1.0);
    let distance_scale = clamp(384400.0 / max(340000.0, distance_km), 0.88, 1.14);
    return phase_relative * distance_scale * distance_scale;
}

fn celestial_lunar_rolo_calibration_rgb(phase_angle_radians: f32) -> vec3<f32> {
    let phase = clamp(phase_angle_radians, 0.0, CELESTIAL_PI);
    let reddening = smoothstep(
        18.0 * CELESTIAL_PI / 180.0,
        145.0 * CELESTIAL_PI / 180.0,
        phase);
    let raw = vec3<f32>(
        1.0 + reddening * 0.035,
        1.0,
        1.0 - reddening * 0.052);
    return raw / max(1e-8, dot(raw, CELESTIAL_RGB_LUMINANCE));
}

// elevation_normal_tangent is a decoded signed SLDEM/LOLA-derived normal:
// +x east, +y north, +z outward. Albedo and normal textures must be registered.
fn celestial_lunar_surface_normal(
    geometric_normal_input: vec3<f32>,
    tangent_direction_input: vec3<f32>,
    bitangent_direction_input: vec3<f32>,
    elevation_normal_tangent: vec3<f32>,
    normal_strength: f32,
) -> vec3<f32> {
    let geometric_normal = celestial_safe_normalize(geometric_normal_input);
    let projected_tangent = tangent_direction_input -
        geometric_normal * dot(tangent_direction_input, geometric_normal);
    var tangent: vec3<f32>;
    if (length(projected_tangent) > 1e-8) {
        tangent = normalize(projected_tangent);
    } else {
        let reference_axis = select(vec3<f32>(1.0, 0.0, 0.0),
            vec3<f32>(0.0, 1.0, 0.0), abs(geometric_normal.y) < 0.9);
        tangent = celestial_safe_normalize(cross(reference_axis, geometric_normal));
    }
    var bitangent = celestial_safe_normalize(cross(geometric_normal, tangent));
    if (dot(bitangent, bitangent_direction_input) < 0.0) {
        bitangent = -bitangent;
    }
    let local_input = vec3<f32>(
        elevation_normal_tangent.xy * clamp(normal_strength, 0.0, 4.0),
        max(0.0, elevation_normal_tangent.z));
    var local = vec3<f32>(0.0, 0.0, 1.0);
    if (length(local_input) > 1e-8) {
        local = normalize(local_input);
    }
    return celestial_safe_normalize(
        tangent * local.x + bitangent * local.y + geometric_normal * local.z);
}

fn celestial_lunar_surface(
    surface_normal_input: vec3<f32>,
    sun_direction_input: vec3<f32>,
    observer_direction_input: vec3<f32>,
    albedo_rgb: vec3<f32>,
    solar_toa_irradiance_rgb: vec3<f32>,
    illuminated_fraction: f32,
    earth_albedo_factor: f32,
    rolo_calibration_rgb: vec3<f32>,
    photometry: CelestialLunarPhotometry,
) -> CelestialLunarSurfaceSample {
    let normal = celestial_safe_normalize(surface_normal_input);
    let sun = celestial_safe_normalize(sun_direction_input);
    let observer = celestial_safe_normalize(observer_direction_input);
    let signed_incidence = dot(normal, sun);
    let mu0 = max(0.0, signed_incidence);
    let mu = max(0.0, dot(normal, observer));
    let phase_cosine = clamp(dot(sun, observer), -1.0, 1.0);
    let phase_angle = acos(phase_cosine);
    let secondary_weight = clamp(photometry.scattering.z, 0.0, 1.0);
    let phase_function = mix(
        celestial_unnormalized_hg(phase_cosine,
            clamp(photometry.scattering.y, 0.0, 0.9)),
        celestial_unnormalized_hg(phase_cosine,
            -clamp(photometry.scattering.y * 0.45, 0.0, 0.9)),
        secondary_weight);
    let opposition = photometry.scattering.w /
        (1.0 + tan(phase_angle * 0.5) / max(1e-4, photometry.surface.x));
    let single_scattering_albedo = clamp(photometry.scattering.x, 0.01, 0.99);
    let multiple_scattering = celestial_hapke_h(mu0, single_scattering_albedo) *
        celestial_hapke_h(mu, single_scattering_albedo) - 1.0;
    let slope_penalty = pow(tan(clamp(photometry.surface.y, 0.0, 1.2)), 2.0);
    let roughness_shadow = exp(-slope_penalty *
        (pow(1.0 - mu0, 2.0) + pow(1.0 - mu, 2.0)) * 0.42);
    var reflectance = 0.0;
    if (mu0 > 0.0 && mu > 0.0) {
        reflectance = single_scattering_albedo / (4.0 * CELESTIAL_PI) *
            mu0 / max(1e-5, mu0 + mu) *
            ((1.0 + opposition) * phase_function + multiple_scattering) *
            roughness_shadow;
    }
    // Hapke establishes the reference material; LROC albedo modulates it.
    // Keeping those roles separate avoids applying absolute albedo twice.
    let reference_albedo = clamp(photometry.surface.z, 0.01, 0.95);
    let albedo_modulation = clamp(
        max(albedo_rgb, vec3<f32>(0.0)) / reference_albedo,
        vec3<f32>(0.0), vec3<f32>(4.0));
    let direct = solar_toa_irradiance_rgb * albedo_modulation * reflectance *
        max(rolo_calibration_rgb, vec3<f32>(0.0));
    let earthshine_ratio = celestial_lunar_earthshine_ratio(
        illuminated_fraction, earth_albedo_factor);
    let earthshine = solar_toa_irradiance_rgb * albedo_rgb *
        (earthshine_ratio * mu / CELESTIAL_PI);
    return CelestialLunarSurfaceSample(
        direct + earthshine, direct, earthshine, signed_incidence, mu, phase_angle,
        reflectance, earthshine_ratio);
}

fn celestial_lunar_disc_geometry(
    disc_uv: vec2<f32>,
    radial_pixel_footprint: f32,
) -> CelestialLunarDiscGeometry {
    let radial_distance = length(disc_uv);
    let footprint = clamp(radial_pixel_footprint, 1e-6, 0.25);
    let limb_coverage = 1.0 - smoothstep(
        1.0 - footprint, 1.0 + footprint, radial_distance);
    let clamped_radius = min(0.999999, radial_distance);
    var radial_scale = 0.0;
    if (radial_distance > 1e-12) {
        radial_scale = clamped_radius / radial_distance;
    }
    let point = disc_uv * radial_scale;
    let normal = celestial_safe_normalize(vec3<f32>(
        point, sqrt(max(0.0, 1.0 - dot(point, point)))));
    return CelestialLunarDiscGeometry(normal, limb_coverage, radial_distance);
}

// Registered LROC/LOLA coordinates. U must use repeat addressing and V clamp.
// Explicit texture LOD should be derived from texture_footprint_radians.
fn celestial_lunar_texture_coordinates(
    disc_uv: vec2<f32>,
    radial_pixel_footprint: f32,
    sub_earth_longitude_radians: f32,
    sub_earth_latitude_radians: f32,
    north_pole_angle_radians: f32,
) -> CelestialLunarTextureCoordinateSample {
    let geometry = celestial_lunar_disc_geometry(disc_uv, radial_pixel_footprint);
    let c = cos(north_pole_angle_radians);
    let s = sin(north_pole_angle_radians);
    let east_coordinate = disc_uv.x * c - disc_uv.y * s;
    let north_coordinate = disc_uv.x * s + disc_uv.y * c;
    let radial = length(vec2<f32>(east_coordinate, north_coordinate));
    let bounded_radial = min(0.999999, radial);
    var radial_scale = 0.0;
    if (radial > 1e-12) { radial_scale = bounded_radial / radial; }
    let local_east = east_coordinate * radial_scale;
    let local_north = north_coordinate * radial_scale;
    let local_observer = sqrt(max(
        0.0, 1.0 - local_east * local_east - local_north * local_north));
    let longitude = sub_earth_longitude_radians;
    let latitude = clamp(sub_earth_latitude_radians,
        -CELESTIAL_PI * 0.5, CELESTIAL_PI * 0.5);
    let center = vec3<f32>(
        cos(latitude) * cos(longitude),
        cos(latitude) * sin(longitude),
        sin(latitude));
    let east = vec3<f32>(-sin(longitude), cos(longitude), 0.0);
    let north = vec3<f32>(
        -sin(latitude) * cos(longitude),
        -sin(latitude) * sin(longitude),
        cos(latitude));
    let moon_fixed = celestial_safe_normalize(
        east * local_east + north * local_north + center * local_observer);
    let surface_longitude = atan2(moon_fixed.y, moon_fixed.x);
    let surface_latitude = asin(clamp(moon_fixed.z, -1.0, 1.0));
    let footprint = clamp(radial_pixel_footprint, 1e-7, 0.25);
    let foreshortening = max(local_observer, footprint * 1.5);
    let texture_footprint = clamp(
        footprint / foreshortening, footprint, 0.35);
    let normal_reliability = smoothstep(
        footprint * 2.5, footprint * 9.0, local_observer);
    return CelestialLunarTextureCoordinateSample(
        geometry.surface_normal,
        geometry.limb_coverage,
        geometry.radial_distance,
        vec2<f32>(
            fract(surface_longitude / (2.0 * CELESTIAL_PI) + 0.5),
            clamp(0.5 - surface_latitude / CELESTIAL_PI, 0.0, 1.0)),
        moon_fixed,
        texture_footprint,
        normal_reliability);
}

// Coverage of illumination only. It must not become the alpha of the Moon.
fn celestial_lunar_terminator_coverage(
    incidence_cosine: f32,
    normal_pixel_footprint: f32,
) -> f32 {
    let width = max(1e-6, normal_pixel_footprint);
    return smoothstep(-width, width, incidence_cosine);
}

// Both NASA SVS and analytic Hapke inputs are relative, phase-resolved spatial
// profiles. Their solid-angle integral is normalized to the one ROLO-calibrated
// disk target here; callers must not multiply a phase law again afterwards.
fn celestial_calibrated_lunar_profile_radiance(
    relative_profile_radiance_rgb: vec3<f32>,
    profile_solid_angle_integral_rgb: vec3<f32>,
    disk_toa_irradiance_target_rgb: vec3<f32>,
) -> vec3<f32> {
    let valid = profile_solid_angle_integral_rgb > vec3<f32>(1e-20);
    let scale = max(disk_toa_irradiance_target_rgb, vec3<f32>(0.0)) /
        max(profile_solid_angle_integral_rgb, vec3<f32>(1e-20));
    return max(relative_profile_radiance_rgb, vec3<f32>(0.0)) *
        select(vec3<f32>(0.0), scale, valid);
}

fn celestial_rayleigh_phase_normalized(cosine: f32) -> f32 {
    return 3.0 / (16.0 * CELESTIAL_PI) * (1.0 + cosine * cosine);
}

fn celestial_cornette_shanks_phase_normalized(
    cosine: f32,
    asymmetry: f32,
) -> f32 {
    let g = clamp(asymmetry, -0.94, 0.94);
    let denominator = pow(max(1e-7, 1.0 + g * g - 2.0 * g * cosine), 1.5);
    return 3.0 / (8.0 * CELESTIAL_PI) * (1.0 - g * g) /
        (2.0 + g * g) * (1.0 + cosine * cosine) / denominator;
}

// Atmosphere-coupled lunar aureole. Optical depth and transmittance are owned
// by physical atmosphere transport; this function adds no display-space glow.
fn celestial_lunar_atmospheric_aureole(
    angular_separation_radians: f32,
    lunar_angular_radius_radians: f32,
    moon_toa_irradiance_rgb: vec3<f32>,
    source_to_scatter_transmittance_rgb: vec3<f32>,
    rayleigh_scattering_optical_depth_rgb: vec3<f32>,
    aerosol_scattering_optical_depth_rgb: vec3<f32>,
    aerosol_asymmetry: f32,
    scatter_to_observer_transmittance_rgb: vec3<f32>,
    multiple_scattering_rgb: vec3<f32>,
) -> CelestialLunarAureoleSample {
    let separation = max(0.0, angular_separation_radians);
    let moon_radius = clamp(lunar_angular_radius_radians, 1e-5, 0.02);
    let effective_angle = sqrt(
        separation * separation + moon_radius * moon_radius * 0.32);
    let cosine = cos(effective_angle);
    let source_at_scatter = moon_toa_irradiance_rgb *
        source_to_scatter_transmittance_rgb;
    let rayleigh = source_at_scatter * rayleigh_scattering_optical_depth_rgb *
        scatter_to_observer_transmittance_rgb *
        celestial_rayleigh_phase_normalized(cosine);
    let aerosol = source_at_scatter * aerosol_scattering_optical_depth_rgb *
        scatter_to_observer_transmittance_rgb *
        celestial_cornette_shanks_phase_normalized(cosine, aerosol_asymmetry);
    let multiple = source_at_scatter * multiple_scattering_rgb;
    return CelestialLunarAureoleSample(
        rayleigh + aerosol + multiple,
        rayleigh,
        aerosol,
        effective_angle);
}

fn celestial_layer_contribution(
    source_toa_radiance: vec3<f32>,
    limb_coverage: f32,
    foreground_transmittance: vec3<f32>,
) -> CelestialLayerContribution {
    let coverage = clamp(limb_coverage, 0.0, 1.0);
    return CelestialLayerContribution(
        source_toa_radiance * foreground_transmittance * coverage,
        1.0 - coverage,
        coverage);
}

fn celestial_compose_ray(
    foreground_radiance: vec3<f32>,
    foreground_transmittance: vec3<f32>,
    source_toa_radiance: vec3<f32>,
    behind_source_toa_radiance: vec3<f32>,
    limb_coverage: f32,
) -> vec3<f32> {
    let behind_layer = mix(behind_source_toa_radiance, source_toa_radiance,
        clamp(limb_coverage, 0.0, 1.0));
    return foreground_radiance + foreground_transmittance * behind_layer;
}

// Canonical order: Galactic/zodiacal + rasterized stars, then Sun, then the
// nearer Moon, then atmosphere/airglow. Clouds consume the returned observed
// radiance as a later affine layer. Exposure/output transforms remain later.
fn celestial_compose_atmosphere_order(
    extra_atmospheric_diffuse_radiance: vec3<f32>,
    stellar_radiance: vec3<f32>,
    sun_toa_radiance: vec3<f32>,
    sun_coverage_input: f32,
    moon_toa_radiance: vec3<f32>,
    moon_limb_coverage_input: f32,
    atmosphere_transmittance: vec3<f32>,
    atmosphere_inscattered_radiance: vec3<f32>,
    observed_airglow_radiance: vec3<f32>,
) -> CelestialAtmosphereOrderSample {
    let sun_coverage = clamp(sun_coverage_input, 0.0, 1.0);
    let moon_coverage = clamp(moon_limb_coverage_input, 0.0, 1.0);
    let distant = extra_atmospheric_diffuse_radiance + stellar_radiance;
    let with_sun = mix(distant, sun_toa_radiance, sun_coverage);
    let boundary = mix(with_sun, moon_toa_radiance, moon_coverage);
    let observed = atmosphere_inscattered_radiance + observed_airglow_radiance +
        atmosphere_transmittance * boundary;
    return CelestialAtmosphereOrderSample(
        boundary,
        observed,
        (1.0 - sun_coverage) * (1.0 - moon_coverage));
}

fn celestial_sphere_forward_intersection(
    observer_radius_km: f32,
    view_zenith_cosine: f32,
    sphere_radius_km: f32,
) -> f32 {
    let discriminant = observer_radius_km * observer_radius_km *
        (view_zenith_cosine * view_zenith_cosine - 1.0) +
        sphere_radius_km * sphere_radius_km;
    if (discriminant <= 0.0) { return 0.0; }
    return max(0.0, -observer_radius_km * view_zenith_cosine + sqrt(discriminant));
}

fn celestial_airglow_radiance(
    view_direction_input: vec3<f32>,
    zenith_radiance_rgb: vec3<f32>,
    observer_altitude_km: f32,
    layer_bottom_km: f32,
    layer_top_km: f32,
    gravity_wave_amplitude: f32,
    gravity_wave_horizontal_scale_km: f32,
    gravity_wave_direction_input: vec2<f32>,
    gravity_wave_phase: f32,
) -> CelestialAirglowSample {
    let view = celestial_safe_normalize(view_direction_input);
    let representative_altitude = (layer_bottom_km + layer_top_km) * 0.5;
    if (view.y <= -0.01) {
        return CelestialAirglowSample(vec3<f32>(0.0), 0.0, representative_altitude);
    }
    let observer_radius = CELESTIAL_EARTH_RADIUS_KM + observer_altitude_km;
    let distance_bottom = celestial_sphere_forward_intersection(
        observer_radius, view.y, CELESTIAL_EARTH_RADIUS_KM + layer_bottom_km);
    let distance_top = celestial_sphere_forward_intersection(
        observer_radius, view.y, CELESTIAL_EARTH_RADIUS_KM + layer_top_km);
    let path_length = max(0.0, distance_top - distance_bottom);
    let relative_path = path_length / max(1e-4, layer_top_km - layer_bottom_km);
    let middle_distance = (distance_bottom + distance_top) * 0.5;
    let horizontal_position = view.xz * middle_distance;
    let wave_length = length(gravity_wave_direction_input);
    var wave_direction = vec2<f32>(1.0, 0.0);
    if (wave_length > 1e-8) {
        wave_direction = gravity_wave_direction_input / wave_length;
    }
    let wave_coordinate = dot(horizontal_position, wave_direction) /
        max(2.0, gravity_wave_horizontal_scale_km);
    let wave = 1.0 + clamp(gravity_wave_amplitude, 0.0, 0.3) * (
        sin(wave_coordinate * CELESTIAL_PI * 2.0 + gravity_wave_phase) * 0.68 +
        sin(wave_coordinate * CELESTIAL_PI * 0.73 - gravity_wave_phase * 0.41) * 0.32);
    return CelestialAirglowSample(
        zenith_radiance_rgb * max(0.0, relative_path * wave),
        relative_path,
        representative_altitude);
}

fn celestial_zodiacal_radiance(
    view_direction_input: vec3<f32>,
    sun_direction_input: vec3<f32>,
    ecliptic_north_input: vec3<f32>,
    radiance_scale: f32,
    solar_spectrum_rgb: vec3<f32>,
) -> vec3<f32> {
    let view = celestial_safe_normalize(view_direction_input);
    if (view.y <= 0.0) { return vec3<f32>(0.0); }
    let sun = celestial_safe_normalize(sun_direction_input);
    let ecliptic_north = celestial_safe_normalize(ecliptic_north_input);
    let elongation = acos(clamp(dot(view, sun), -1.0, 1.0));
    let latitude = abs(asin(clamp(dot(view, ecliptic_north), -1.0, 1.0)));
    let plane = exp(-pow(latitude / 0.19, 1.18));
    let solar_lobe = clamp(0.10 + 0.62 / pow(0.11 + elongation, 0.82), 0.0, 9.0);
    let gegenschein = 0.42 * exp(-pow((CELESTIAL_PI - elongation) / 0.20, 2.0)) *
        exp(-pow(latitude / 0.12, 2.0));
    return solar_spectrum_rgb * vec3<f32>(1.08, 1.0, 0.88) *
        max(0.0, radiance_scale) * plane * (solar_lobe + gegenschein);
}

fn celestial_galactic_radiance(
    view_direction_input: vec3<f32>,
    galactic_north_input: vec3<f32>,
    galactic_center_input: vec3<f32>,
    radiance_scale: f32,
    calibrated_map_weight: f32,
    calibrated_map_radiance: vec3<f32>,
    cool_plane_spectrum: vec3<f32>,
    warm_bulge_spectrum: vec3<f32>,
) -> vec3<f32> {
    let view = celestial_safe_normalize(view_direction_input);
    if (view.y <= 0.0) { return vec3<f32>(0.0); }
    let north = celestial_safe_normalize(galactic_north_input);
    let center = celestial_safe_normalize(galactic_center_input);
    let latitude_sine = clamp(dot(view, north), -1.0, 1.0);
    let latitude = asin(latitude_sine);
    let center_separation = acos(clamp(dot(view, center), -1.0, 1.0));
    let view_on_plane = celestial_safe_normalize(view - north * latitude_sine);
    let center_on_plane = celestial_safe_normalize(center - north * dot(center, north));
    let longitude = acos(clamp(dot(view_on_plane, center_on_plane), -1.0, 1.0));
    let plane = exp(-pow(abs(latitude) / 0.105, 1.28));
    let bulge = exp(-pow(center_separation / 0.31, 1.35));
    let dust_lane = 1.0 - 0.58 * exp(-pow(latitude / 0.026, 2.0)) *
        exp(-pow(center_separation / 0.72, 2.0));
    let structure = 0.88 + 0.075 * sin(longitude * 7.1 + 0.4) +
        0.045 * sin(longitude * 19.7 - 1.2);
    let analytic = (cool_plane_spectrum * plane * dust_lane * max(0.6, structure) +
        warm_bulge_spectrum * bulge * 1.25) * max(0.0, radiance_scale);
    return mix(analytic, calibrated_map_radiance, clamp(calibrated_map_weight, 0.0, 1.0));
}

// Broad integrated starlight after individually rasterized catalogue stars are
// removed. This is intentionally smoother than the structured Milky Way map.
fn celestial_integrated_starlight_radiance(
    view_direction_input: vec3<f32>,
    galactic_north_input: vec3<f32>,
    galactic_center_input: vec3<f32>,
    radiance_scale: f32,
    stellar_population_spectrum: vec3<f32>,
) -> vec3<f32> {
    let view = celestial_safe_normalize(view_direction_input);
    if (view.y <= 0.0) { return vec3<f32>(0.0); }
    let north = celestial_safe_normalize(galactic_north_input);
    let center = celestial_safe_normalize(galactic_center_input);
    let sin_latitude = clamp(dot(view, north), -1.0, 1.0);
    let broad_disc = exp(-abs(sin_latitude) / 0.31);
    let center_separation = acos(clamp(dot(view, center), -1.0, 1.0));
    let inner_galaxy = exp(-pow(center_separation / 0.72, 1.45));
    return stellar_population_spectrum * max(0.0, radiance_scale) *
        (0.16 + broad_disc * 0.72 + inner_galaxy * 0.54);
}

// Evaluate at the ground boundary and feed the result into atmosphere/cloud
// transport. This is intentionally not a directly additive screen-space dome.
fn celestial_artificial_ground_emission(
    source_center_ground_km: vec2<f32>,
    source_radius_km: f32,
    upward_radiance_rgb: vec3<f32>,
    upward_anisotropy: f32,
    ground_position_km: vec2<f32>,
    upward_direction_input: vec3<f32>,
) -> vec3<f32> {
    let normalized_radius = length(ground_position_km - source_center_ground_km) /
        max(0.05, source_radius_km);
    let spatial = exp(-0.5 * normalized_radius * normalized_radius);
    let zenith_cosine = max(0.0, celestial_safe_normalize(upward_direction_input).y);
    let angular = pow(0.08 + 0.92 * zenith_cosine,
        clamp(1.0 + upward_anisotropy, 0.25, 8.0));
    return upward_radiance_rgb * spatial * angular;
}

// Unlike sources keep their own path. The upward ground boundary is forwarded
// for atmosphere/cloud scattering and is never added directly to this result.
fn celestial_transport_natural_night_sources(
    extra_atmospheric_radiance: vec3<f32>,
    atmospheric_emission_radiance: vec3<f32>,
    ground_upward_radiance: vec3<f32>,
    extra_atmospheric_transmittance: vec3<f32>,
    airglow_to_observer_transmittance: vec3<f32>,
) -> CelestialNaturalNightTransportSample {
    let observed_extra = extra_atmospheric_radiance *
        extra_atmospheric_transmittance;
    let observed_airglow = atmospheric_emission_radiance *
        airglow_to_observer_transmittance;
    return CelestialNaturalNightTransportSample(
        observed_extra,
        observed_airglow,
        observed_extra + observed_airglow,
        ground_upward_radiance);
}

fn celestial_sun_disc_radiance(
    view_direction_input: vec3<f32>,
    sun_direction_input: vec3<f32>,
    angular_radius_radians: f32,
    angular_pixel_footprint_radians: f32,
    toa_irradiance_rgb: vec3<f32>,
    limb_darkening: vec2<f32>,
) -> CelestialSunDiscSample {
    let view = celestial_safe_normalize(view_direction_input);
    let sun = celestial_safe_normalize(sun_direction_input);
    let separation = acos(clamp(dot(view, sun), -1.0, 1.0));
    let radius = clamp(angular_radius_radians, 0.001, 0.02);
    let footprint = clamp(angular_pixel_footprint_radians, 1e-8, radius * 0.5);
    let coverage = 1.0 - smoothstep(radius - footprint, radius + footprint, separation);
    let normalized_radius = min(1.0, separation / max(1e-8, radius));
    let mu = sqrt(max(0.0, 1.0 - normalized_radius * normalized_radius));
    let u1 = clamp(limb_darkening.x, 0.0, 1.0);
    let u2 = clamp(limb_darkening.y, 0.0, 1.0);
    let limb_radiance = max(0.0, 1.0 - u1 * (1.0 - mu) - u2 * pow(1.0 - mu, 2.0));
    let mean_limb_radiance = max(0.05, 1.0 - u1 / 3.0 - u2 / 6.0);
    let solid_angle = 2.0 * CELESTIAL_PI * (1.0 - cos(radius));
    let center_radiance = toa_irradiance_rgb /
        max(1e-12, solid_angle * mean_limb_radiance);
    return CelestialSunDiscSample(
        center_radiance * limb_radiance * coverage,
        coverage,
        separation);
}
`;

export interface CelestialPhysicsShaderSourceOptions {
    /** Bindings, resource declarations, and at least one WGSL entry point. */
    entryPointWgsl: string;
    /** Debug-only module label emitted as a comment. */
    label?: string;
}

/**
 * Production entrypoint for consumers: returns one complete shader module,
 * with the binding-free physical library before caller-owned resources and
 * entry points. This prevents every renderer pass from hand-splicing a subtly
 * different copy of the equations.
 */
export const createCelestialPhysicsShaderSource = ({
    entryPointWgsl,
    label = "celestial-consumer",
}: CelestialPhysicsShaderSourceOptions) => {
    const consumer = entryPointWgsl.trim();
    if (!consumer) {
        throw new Error("Celestial WGSL requires non-empty consumer source.");
    }
    if (!/@(?:vertex|fragment|compute)\b/.test(consumer)) {
        throw new Error("Celestial WGSL consumer must declare an entry point.");
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9_. -]/g, "_");
    return `${CELESTIAL_PHYSICS_WGSL}\n// consumer: ${safeLabel}\n${consumer}\n`;
};

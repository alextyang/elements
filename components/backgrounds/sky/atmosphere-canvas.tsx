"use client";

import { useEffect, useRef } from "react";

import type { SkyPalette } from "./sky-palettes";
import styles from "./sky.module.css";

export interface SkyRadianceScene {
    palette: SkyPalette;
    sun: [number, number];
    moon: [number, number];
    solarAltitude: number;
    nightDepth: number;
    moonlight: number;
    moonTransmittance: [number, number, number];
    moonLightColor: string;
    aerosol: number;
    humidity: number;
    aerosolSize: number;
    aerosolAbsorption: number;
    ozone: number;
    observerAltitude: number;
    inversion: number;
    stratosphericAerosol: number;
    groundAlbedo: number;
    aerosolTint: [number, number, number];
    cloudiness: number;
    edgeStrength: number;
    horizonStrength: number;
    airglowStrength: number;
    seed: [number, number, number, number];
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_color;

uniform vec2 u_resolution;
uniform vec2 u_sun;
uniform vec2 u_moon;
uniform vec4 u_optics;
uniform vec4 u_light;
uniform vec4 u_composition;
uniform vec3 u_layers;
uniform vec3 u_aerosol_tint;
uniform vec4 u_seed;
uniform float u_airglow;
uniform vec3 u_moon_tint;
uniform vec3 u_moon_transmittance;
uniform vec3 u_top;
uniform vec3 u_upper;
uniform vec3 u_middle;
uniform vec3 u_horizon;
uniform vec3 u_low;
uniform vec3 u_left;
uniform vec3 u_right;
uniform vec3 u_glow;
uniform vec3 u_haze;

const float PI = 3.141592653589793;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float smoother(float edge0, float edge1, float value) {
    float t = saturate((value - edge0) / max(0.0001, edge1 - edge0));
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash21(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float value_noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
    float sum = 0.0;
    float weight = 0.56;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 4; octave++) {
        sum += value_noise(point) * weight;
        point = turn * point * 2.03 + 7.17;
        weight *= 0.48;
    }
    return sum / 1.02;
}

vec3 srgb_to_linear(vec3 color) {
    vec3 low = color / 12.92;
    vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
    return mix(low, high, step(vec3(0.04045), color));
}

vec3 linear_to_srgb(vec3 color) {
    color = max(color, vec3(0.0));
    vec3 low = color * 12.92;
    vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), color));
}

vec3 sky_spline(float y) {
    // Five broad, zero-slope transitions form a continuous vertical radiance
    // profile. Unlike CSS color stops, no palette key owns a visible band.
    vec3 color = u_top;
    color = mix(color, u_upper, smoother(0.02, 0.39, y));
    color = mix(color, u_middle, smoother(0.20, 0.68, y));
    color = mix(color, u_horizon, smoother(0.47, 0.91, y));
    color = mix(color, u_low, smoother(0.73, 1.08, y));
    return color;
}

vec3 view_direction(vec2 uv) {
    float azimuth = (uv.x - 0.5) * PI * 1.34;
    float elevation = mix(PI * 0.51, -0.035, pow(uv.y, 0.91));
    float cos_elevation = cos(elevation);
    return normalize(vec3(
        sin(azimuth) * cos_elevation,
        sin(elevation),
        cos(azimuth) * cos_elevation
    ));
}

vec3 source_direction(vec2 point) {
    float azimuth = (point.x - 0.5) * PI * 1.34;
    float elevation = mix(PI * 0.51, -0.035, pow(clamp(point.y, 0.0, 1.15), 0.91));
    float cos_elevation = cos(elevation);
    return normalize(vec3(
        sin(azimuth) * cos_elevation,
        sin(elevation),
        cos(azimuth) * cos_elevation
    ));
}

float henyey_greenstein(float cosine, float g) {
    float g2 = g * g;
    return (1.0 - g2) /
        max(0.12, 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosine, 1.5));
}

void main() {
    // WebGL has a bottom-left texture origin; convert to the screen's top-left.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    float y = uv.y;
    float night = u_optics.x;
    float aerosol = u_optics.y;
    float humidity = u_optics.z;
    float cloudiness = u_optics.w;
    float solar_altitude = u_light.x;
    float moonlight = u_light.y;
    float edge_strength = u_light.z;
    float horizon_strength = u_light.w;
    float aerosol_size = u_composition.x;
    float aerosol_absorption = u_composition.y;
    float ozone = u_composition.z;
    float observer_altitude = u_composition.w;
    float inversion = u_layers.x;
    float stratospheric_aerosol = u_layers.y;
    float ground_albedo = u_layers.z;

    vec3 base_srgb = sky_spline(y);
    vec3 radiance = srgb_to_linear(base_srgb);
    vec3 view = view_direction(uv);
    vec3 sun_direction = source_direction(u_sun);
    vec3 moon_direction = source_direction(u_moon);
    float sun_cosine = dot(view, sun_direction);
    float moon_cosine = dot(view, moon_direction);

    // Kasten-Young-inspired optical path length. It steepens naturally close
    // to the horizon without introducing a horizontal color-stop boundary.
    float elevation_sine = max(0.018, view.y);
    float air_mass = 1.0 / (elevation_sine + 0.115 * pow(elevation_sine + 0.035, -0.55));
    float effective_air_mass = air_mass * (1.0 - observer_altitude * 0.12);
    float normalized_path = saturate((effective_air_mass - 0.88) / 4.6);
    float molecular = pow(normalized_path, 1.18);
    float aerosol_path = pow(
        normalized_path,
        mix(1.72, 0.62, aerosol * 0.72 + aerosol_size * 0.28)
    );

    // Rayleigh is broad; Mie is strongly forward-scattering. A weaker reverse
    // lobe supplies the observed antisolar / Belt-of-Venus volume at twilight.
    float rayleigh_phase = 0.0597 * (1.0 + sun_cosine * sun_cosine);
    float mie_phase = henyey_greenstein(
        sun_cosine,
        mix(0.6, 0.86, aerosol_size * 0.7 + aerosol * 0.3)
    );
    float reverse_phase = henyey_greenstein(-sun_cosine, 0.38);
    float sun_available = smoother(-15.0, 6.0, solar_altitude);
    float twilight = 1.0 - smoother(-5.0, 11.0, abs(solar_altitude + 2.0));
    float low_sun_path = 1.0 - smoother(-3.0, 18.0, solar_altitude);
    float ozone_path = twilight * ozone * (1.0 - humidity * 0.28);
    float forward_scatter = sun_available * mie_phase *
        (0.026 + aerosol * 0.085) * (0.35 + aerosol_path * 0.92);
    float molecular_fill = sun_available * rayleigh_phase *
        (0.014 + molecular * 0.038) * (1.0 - cloudiness * 0.22);
    float antisolar = twilight * reverse_phase * molecular *
        (0.012 + (1.0 - humidity) * 0.018);

    vec3 glow_linear = srgb_to_linear(u_glow);
    vec3 haze_linear = srgb_to_linear(u_haze);
    vec3 rayleigh_blue = srgb_to_linear(vec3(0.30, 0.56, 0.94));
    vec3 ozone_violet = srgb_to_linear(vec3(0.48, 0.40, 0.76));
    vec3 molecular_color = mix(rayleigh_blue, ozone_violet, ozone_path * 0.28);
    vec3 aerosol_white = srgb_to_linear(mix(
        u_aerosol_tint,
        vec3(0.92, 0.91, 0.87),
        humidity * 0.42
    ));
    vec3 sunset_red = srgb_to_linear(vec3(0.96, 0.31, 0.12));
    vec3 absorbing_sunset = mix(
        sunset_red,
        srgb_to_linear(vec3(0.72, 0.19, 0.075)),
        aerosol_absorption * 0.58
    );
    vec3 solar_scatter = mix(
        aerosol_white,
        absorbing_sunset,
        low_sun_path * (0.42 + aerosol * 0.34 + aerosol_absorption * 0.16)
    );
    solar_scatter = mix(solar_scatter, glow_linear, 0.18);
    vec3 venus_rose = srgb_to_linear(vec3(0.79, 0.43, 0.55));
    vec3 humid_neutral = srgb_to_linear(vec3(0.66, 0.65, 0.66));
    vec3 antisolar_color = mix(venus_rose, humid_neutral, humidity * 0.62 + aerosol * 0.14);

    // Scattering tint is spectral and geometry-dependent. Palette colors only
    // provide a restrained local grade, preventing green/purple theme colors
    // from becoming physically impossible illumination across the whole dome.
    radiance += solar_scatter * forward_scatter * (1.0 - night * 0.84);
    radiance += mix(molecular_color, haze_linear, 0.16) * molecular_fill * (1.0 - night * 0.72);
    radiance += antisolar_color * antisolar;

    // The clear dome is not azimuthally uniform. Rayleigh's 1+cos² phase
    // response leaves a broad, subtle minimum roughly 90° from the Sun.
    // This low-amplitude modulation supplies real dome depth without drawing
    // a visible lobe into hazy or overcast skies.
    float rayleigh_azimuth = sun_cosine * sun_cosine - 0.36;
    float angular_contrast = sun_available * (1.0 - night) *
        (1.0 - aerosol * 0.72) * (1.0 - humidity * 0.48) *
        (1.0 - cloudiness * 0.6) * (0.018 + observer_altitude * 0.014);
    radiance *= 1.0 + rayleigh_azimuth * angular_contrast;

    // Horizontal anisotropy wraps around the screen edges as atmospheric
    // illumination, not as a pair of recognizable radial stamps.
    float left_field = exp(-pow((uv.x + 0.07) / 0.48, 2.0)) *
        smoother(0.18, 0.94, y);
    float right_field = exp(-pow((1.07 - uv.x) / 0.49, 2.0)) *
        smoother(0.16, 0.93, y);
    float edge_fade = (1.0 - night * 0.58) * edge_strength *
        mix(0.72, 1.0, twilight);
    radiance = mix(radiance, srgb_to_linear(u_left), left_field * edge_fade * 0.105);
    radiance = mix(radiance, srgb_to_linear(u_right), right_field * edge_fade * 0.105);

    // The rising Earth shadow and the Belt of Venus are coupled structures,
    // not a generic pink gradient. Their elevation follows solar depression
    // and their azimuth is restricted to the antisolar hemisphere.
    float view_elevation = asin(clamp(view.y, -1.0, 1.0));
    float shadow_active = smoother(-12.0, -5.0, solar_altitude) *
        (1.0 - smoother(1.5, 5.0, solar_altitude)) * (1.0 - night * 0.7);
    float antisolar_alignment = mix(
        0.28,
        1.0,
        smoother(0.18, 0.9, -sun_cosine)
    );
    float shadow_top = radians(clamp(1.1 - solar_altitude * 1.18, 0.2, 15.0));
    float below_shadow = 1.0 - smoother(
        shadow_top - radians(1.5),
        shadow_top + radians(2.4),
        view_elevation
    );
    float earth_shadow = shadow_active * antisolar_alignment * below_shadow;
    vec3 shadow_chromaticity = vec3(0.68, 0.77, 0.94);
    radiance = mix(radiance, radiance * shadow_chromaticity, earth_shadow * 0.34);

    float belt_center = shadow_top + radians(3.2 + humidity * 1.8);
    float belt_width = radians(3.1 + aerosol * 2.2 + humidity * 1.5);
    float venus_belt = shadow_active * antisolar_alignment *
        exp(-pow((view_elevation - belt_center) / belt_width, 2.0)) *
        (1.0 - aerosol * 0.42) * (1.0 - humidity * 0.38);
    radiance += antisolar_color * venus_belt * (0.018 + ozone * 0.012);

    // Elevated sulfate produces a distinct post-sunset arch above the normal
    // boundary-layer glow. It remains rare because the production families
    // assign significant stratospheric aerosol only to volcanic conditions.
    float strato_center = radians(10.0 + (1.0 - low_sun_path) * 7.0);
    float strato_band = twilight * stratospheric_aerosol *
        exp(-pow((view_elevation - strato_center) / radians(9.0), 2.0)) *
        (0.58 + 0.42 * smoother(-0.65, 0.72, sun_cosine));
    vec3 strato_color = mix(
        srgb_to_linear(vec3(0.58, 0.32, 0.66)),
        srgb_to_linear(vec3(0.96, 0.47, 0.22)),
        smoother(-8.0, 1.0, solar_altitude)
    );
    radiance += strato_color * strato_band * 0.035;

    // Correlated low-frequency density variation gives clean skies depth and
    // makes aerosol fields non-uniform. The amplitude stays below cloud form.
    vec2 density_point = vec2(
        uv.x * (2.15 + u_seed.x * 1.2) + u_seed.z * 11.0,
        uv.y * (3.2 + u_seed.y * 1.4) + u_seed.w * 9.0
    );
    float density = fbm(density_point) - 0.50;
    float density_envelope = smoother(0.08, 0.87, y) * (1.0 - smoother(0.88, 1.02, y));
    float density_amount = (0.006 + aerosol * 0.012 + humidity * 0.008) * density_envelope;
    radiance *= 1.0 + density * density_amount * (1.0 - cloudiness * 0.38);

    // Boundary-layer inversions have a finite height and irregular optical
    // depth. They compress distant contrast close to the horizon rather than
    // tinting the full dome.
    float inversion_center = radians(2.2 + inversion * 1.8);
    float inversion_width = radians(2.6 + aerosol * 3.8 + humidity * 1.8);
    float inversion_band = inversion *
        exp(-pow((view_elevation - inversion_center) / inversion_width, 2.0)) *
        (0.78 + density * 0.44);
    float inversion_opacity = inversion_band * aerosol *
        (0.075 + aerosol_absorption * 0.045) * (1.0 - night * 0.28);
    vec3 inversion_color = mix(aerosol_white, haze_linear, 0.34);
    radiance = mix(radiance, inversion_color, saturate(inversion_opacity));

    // Multiple-scattering fill is wide and lowest-frequency. It prevents a
    // clear sky from reading as a flat ramp while retaining twilight contrast.
    float horizon_volume = exp(-pow((y - mix(0.77, 0.87, aerosol)) /
        mix(0.31, 0.20, aerosol), 2.0));
    float multi_scatter = horizon_volume * horizon_strength *
        (0.015 + aerosol * 0.024 + humidity * 0.018) * (1.0 - night * 0.72);
    vec3 multi_scatter_color = mix(
        mix(haze_linear, aerosol_white, 0.42),
        solar_scatter,
        twilight * 0.34
    );
    radiance += multi_scatter_color * multi_scatter;

    // Surface reflectance returns a small fraction of daylight to the lowest
    // atmosphere. Snow, water, vegetation, and desert therefore produce
    // different horizon depth without being used as arbitrary color grades.
    float ground_bounce = horizon_volume * ground_albedo * sun_available *
        (1.0 - night) * (0.004 + humidity * 0.005 + cloudiness * 0.006);
    vec3 ground_bounce_color = mix(aerosol_white, solar_scatter, low_sun_path * 0.36);
    radiance += ground_bounce_color * ground_bounce;

    // A single static, band-limited optical-depth field integrates very thin
    // cloud and moisture into the radiance solution. Animated CSS layers still
    // provide slow movement, while this pass supplies extinction, directional
    // light, and depth without a permanent full-screen animation loop.
    vec2 veil_point = vec2(
        uv.x * (3.4 + u_seed.y * 1.6) + u_seed.w * 17.0,
        uv.y * (8.0 + u_seed.x * 2.4) + u_seed.z * 13.0
    );
    float veil_noise = fbm(veil_point + vec2(uv.y * 1.7, 0.0));
    float veil_density = cloudiness *
        pow(smoother(0.46, 0.78, veil_noise), 1.65) *
        smoother(0.02, 0.24, y) * (1.0 - smoother(0.9, 1.04, y));
    float veil_extinction = veil_density * (0.032 + humidity * 0.062);
    vec3 veil_light = mix(
        srgb_to_linear(vec3(0.72, 0.77, 0.82)),
        solar_scatter,
        smoother(-5.0, 12.0, solar_altitude) * 0.36
    );
    radiance = radiance * exp(-veil_extinction) +
        veil_light * veil_density * (0.01 + humidity * 0.02) * (1.0 - night * 0.58);

    // Natural night is layered rather than uniformly blue: weak airglow,
    // integrated celestial radiance, moon aureole, and near-horizon extinction.
    float nocturnal_airglow = night * u_airglow *
        exp(-pow((y - (0.68 + u_seed.y * 0.13)) / (0.19 + u_seed.x * 0.08), 2.0));
    float airglow_ripple = 0.74 + 0.26 * fbm(vec2(uv.x * 2.5 + u_seed.z * 13.0, uv.y * 1.4));
    vec3 oxygen_airglow = mix(
        haze_linear,
        srgb_to_linear(vec3(0.20, 0.42, 0.34)),
        0.13 + (1.0 - aerosol) * 0.10
    );
    radiance += oxygen_airglow * nocturnal_airglow * airglow_ripple * (0.006 + 0.018 * u_seed.x);

    float red_airglow = night * u_airglow * (1.0 - aerosol * 0.58) *
        exp(-pow((y - (0.42 + u_seed.w * 0.1)) / 0.24, 2.0)) *
        (0.58 + 0.42 * fbm(vec2(uv.x * 1.7 + 21.0, uv.y * 1.2 + u_seed.z * 8.0)));
    radiance += srgb_to_linear(vec3(0.53, 0.17, 0.14)) *
        red_airglow * (0.001 + u_seed.y * 0.0032);

    float zodiacal_axis = abs((uv.x - (0.25 + u_seed.z * 0.5)) + (y - 0.76) * (u_seed.y - 0.5));
    float zodiacal = night * (1.0 - moonlight) * (1.0 - aerosol) *
        exp(-zodiacal_axis * 8.5) * smoother(0.36, 0.86, y) * (0.002 + u_seed.x * 0.003);
    radiance += srgb_to_linear(vec3(0.48, 0.45, 0.39)) * zodiacal;

    // Scattered moonlight is evaluated as a transported source, not a radial
    // overlay. The path term is the stable limit of the single-scattering
    // integral when source and view airmasses converge. A narrow and a broad
    // aerosol lobe reproduce the measured forward aureole; Rayleigh supplies
    // the much wider, slightly bluer sky illumination.
    float moon_elevation_sine = max(0.018, moon_direction.y);
    float moon_air_mass = 1.0 /
        (moon_elevation_sine + 0.115 * pow(moon_elevation_sine + 0.035, -0.55));
    float optical_depth = 0.052 +
        aerosol * (0.09 + aerosol_absorption * 0.045) +
        humidity * 0.028;
    float view_transmission = exp(-optical_depth * air_mass);
    float source_transmission = exp(-optical_depth * moon_air_mass);
    float mass_difference = moon_air_mass - air_mass;
    float scatter_transport = abs(mass_difference) < 0.045
        ? air_mass * optical_depth * view_transmission
        : air_mass * (view_transmission - source_transmission) / mass_difference;
    scatter_transport = max(0.0, scatter_transport);
    float lunar_separation = acos(clamp(moon_cosine, -1.0, 1.0));
    float source_scatter_transport =
        moon_air_mass * optical_depth * source_transmission;
    // Aerosol aureoles are source-local angular fields. Hold their transport
    // at the Moon's airmass across the forward lobe; its phase function already
    // supplies the angular falloff. Letting every nearby pixel use its own
    // airmass stretched a round aureole into a false source-centred column.
    float aureole_transport = source_scatter_transport;

    float lunar_rayleigh = 0.0597 * (1.0 + moon_cosine * moon_cosine);
    // Empirical two-scale aerosol aureole. A Moffat/King profile better matches
    // the smooth power-law shoulders seen in lunar photography than a strongly
    // forward HG peak, while retaining the correct monotonic, source-centred
    // energy falloff. Particle state changes angular scale rather than peak
    // energy, preventing the familiar circular stamp as conditions vary.
    float fine_scale = mix(
        0.008,
        0.026,
        aerosol_size * 0.50 + aerosol * 0.16 + humidity * 0.34
    );
    float coarse_scale = mix(
        0.055,
        0.16,
        aerosol_size * 0.34 + aerosol * 0.24 + humidity * 0.42
    );
    float fine_mie = pow(
        1.0 + (lunar_separation / fine_scale) *
            (lunar_separation / fine_scale),
        -1.08
    );
    float coarse_mie = pow(
        1.0 + (lunar_separation / coarse_scale) *
            (lunar_separation / coarse_scale),
        -1.32
    );
    float lunar_mie = mix(fine_mie, coarse_mie, 0.20 + humidity * 0.24);
    float aureole_texture = mix(
        0.985,
        1.015,
        fbm(density_point * (1.18 + humidity * 0.42) + vec2(4.1, 8.7))
    );
    lunar_mie *= aureole_texture;

    float transmission_luminance = max(
        dot(u_moon_transmittance, vec3(0.2126, 0.7152, 0.0722)),
        0.025
    );
    vec3 normalized_transmission = clamp(
        u_moon_transmittance / transmission_luminance,
        vec3(0.42),
        vec3(1.55)
    );
    vec3 lunar_spectrum = srgb_to_linear(u_moon_tint) *
        mix(vec3(1.0), normalized_transmission, 0.72);
    vec3 molecular_spectrum = lunar_spectrum * vec3(0.58, 0.78, 1.12);
    vec3 aerosol_spectrum = mix(
        lunar_spectrum,
        mix(aerosol_white, haze_linear, 0.28),
        0.08 + humidity * 0.08 + aerosol_absorption * 0.12
    );

    float rayleigh_scatter = moonlight * scatter_transport * lunar_rayleigh *
        (0.003 + molecular * 0.0045);
    float aerosol_scatter = moonlight * aureole_transport * lunar_mie *
        (0.026 + aerosol * 0.07 + humidity * 0.032);
    radiance += molecular_spectrum * rayleigh_scatter;
    radiance += aerosol_spectrum * aerosol_scatter;

    // Thin cloud and mist do not create a second halo radius. They modulate
    // the same angular field with correlated density, producing the broken,
    // softly luminous veils seen around the Moon in real humid skies.
    float cloud_structure = smoother(
        0.34,
        0.78,
        fbm(density_point * (1.62 + humidity * 0.74) + vec2(9.7, 3.1))
    );
    float cloud_forward = exp(-lunar_separation * mix(5.2, 3.1, humidity));
    float cloud_scatter = moonlight * cloudiness * cloud_structure * cloud_forward *
        (0.0035 + humidity * 0.011 + aerosol * 0.006);
    radiance += mix(lunar_spectrum, haze_linear, 0.22) * cloud_scatter;

    // Weak multiple-scattering fill connects the aureole to the raised
    // moonlit sky floor without flattening the pristine zenith.
    float lunar_multiple = moonlight * (1.0 - view_transmission) *
        (0.00045 + aerosol * 0.0011 + humidity * 0.0009) *
        (0.42 + normalized_path * 0.58);
    radiance += mix(molecular_spectrum, haze_linear, 0.38) * lunar_multiple;

    // Deeper clear-night zeniths preserve the range between pristine,
    // moonlit, humid, smoky, and cloud-amplified night instead of lifting all
    // families toward the same gray-purple floor.
    float zenith_depth = night * (1.0 - aerosol * 0.34) * (1.0 - humidity * 0.22) *
        (1.0 - smoother(0.42, 0.96, y));
    radiance *= 1.0 - zenith_depth * (0.20 - moonlight * 0.09);

    // A gentle shoulder contains additive scattering in scene-linear space.
    radiance = radiance / (vec3(1.0) + max(radiance - vec3(0.72), vec3(0.0)) * 0.72);
    vec3 display = linear_to_srgb(radiance);

    // Decorrelated triangular RGB dither removes low-luminance contouring
    // without turning the Moon's aureole into monochrome rings. Dark gradients
    // receive slightly more than one code value; the pattern is fixed in
    // physical pixels, so this static pass never shimmers.
    float display_luminance = dot(display, vec3(0.2126, 0.7152, 0.0722));
    float dither_strength = mix(
        1.18,
        0.68,
        smoother(0.025, 0.42, display_luminance)
    ) / 255.0;
    vec3 dither = vec3(
        hash21(gl_FragCoord.xy + vec2(17.0, 61.0)) +
            hash21(gl_FragCoord.yx + vec2(83.0, 11.0)) - 1.0,
        hash21(gl_FragCoord.xy + vec2(109.0, 29.0)) +
            hash21(gl_FragCoord.yx + vec2(47.0, 137.0)) - 1.0,
        hash21(gl_FragCoord.xy + vec2(71.0, 151.0)) +
            hash21(gl_FragCoord.yx + vec2(193.0, 43.0)) - 1.0
    ) * dither_strength;
    display = clamp(display + dither, 0.0, 1.0);
    out_color = vec4(display, 1.0);
}`;

const createShader = (
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create atmospheric shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(message);
    }
    return shader;
};

const createProgram = (gl: WebGL2RenderingContext) => {
    const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create atmospheric program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) ?? "Unknown program error";
        gl.deleteProgram(program);
        throw new Error(message);
    }
    return program;
};

const parseColor = (value: string): [number, number, number] => {
    const rgb = value.match(/[\d.]+/g)?.map(Number);
    if (value.startsWith("rgb") && rgb && rgb.length >= 3) {
        return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
    }
    const hex = value.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [
            Number.parseInt(hex.slice(0, 2), 16) / 255,
            Number.parseInt(hex.slice(2, 4), 16) / 255,
            Number.parseInt(hex.slice(4, 6), 16) / 255,
        ];
    }
    return [0, 0, 0];
};

interface AtmosphereCanvasProps {
    scene: SkyRadianceScene;
}

export function AtmosphereCanvas({ scene }: AtmosphereCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef(scene);
    const drawRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        sceneRef.current = scene;
        drawRef.current?.();
    }, [scene]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            powerPreference: "low-power",
            premultipliedAlpha: false,
        });
        if (!gl) return undefined;

        let program: WebGLProgram;
        try {
            program = createProgram(gl);
        } catch (error) {
            console.warn("Atmospheric shader unavailable", error);
            return undefined;
        }

        const buffer = gl.createBuffer();
        if (!buffer) return undefined;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW,
        );

        const position = gl.getAttribLocation(program, "a_position");
        const uniform = (name: string) => gl.getUniformLocation(program, name);
        const colorUniforms = [
            ["u_top", "top"],
            ["u_upper", "upper"],
            ["u_middle", "middle"],
            ["u_horizon", "horizon"],
            ["u_low", "low"],
            ["u_left", "left"],
            ["u_right", "right"],
            ["u_glow", "glow"],
            ["u_haze", "haze"],
        ] as const;

        const draw = () => {
            if (document.hidden) return;
            const current = sceneRef.current;
            const bounds = canvas.getBoundingClientRect();
            // Match Retina density on ordinary displays so faint lunar
            // gradients and fixed-pixel dither survive compositing. A pixel
            // budget keeps 4K/5K canvases from turning a static quality gain
            // into a large allocation or sustained thermal cost.
            const nativePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            const pixelBudgetRatio = Math.sqrt(
                8_500_000 / Math.max(1, bounds.width * bounds.height),
            );
            const pixelRatio = Math.min(nativePixelRatio, pixelBudgetRatio);
            const width = Math.max(1, Math.round(bounds.width * pixelRatio));
            const height = Math.max(1, Math.round(bounds.height * pixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            gl.viewport(0, 0, width, height);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(uniform("u_resolution"), width, height);
            gl.uniform2f(uniform("u_sun"), current.sun[0], current.sun[1]);
            gl.uniform2f(uniform("u_moon"), current.moon[0], current.moon[1]);
            gl.uniform4f(
                uniform("u_optics"),
                current.nightDepth,
                current.aerosol,
                current.humidity,
                current.cloudiness,
            );
            gl.uniform4f(
                uniform("u_light"),
                current.solarAltitude,
                current.moonlight,
                current.edgeStrength,
                current.horizonStrength,
            );
            gl.uniform4f(
                uniform("u_composition"),
                current.aerosolSize,
                current.aerosolAbsorption,
                current.ozone,
                current.observerAltitude,
            );
            gl.uniform3f(
                uniform("u_layers"),
                current.inversion,
                current.stratosphericAerosol,
                current.groundAlbedo,
            );
            gl.uniform3fv(uniform("u_aerosol_tint"), current.aerosolTint);
            gl.uniform4fv(uniform("u_seed"), current.seed);
            gl.uniform1f(uniform("u_airglow"), current.airglowStrength);
            gl.uniform3fv(
                uniform("u_moon_tint"),
                parseColor(current.moonLightColor),
            );
            gl.uniform3fv(
                uniform("u_moon_transmittance"),
                current.moonTransmittance,
            );
            colorUniforms.forEach(([uniformName, paletteKey]) => {
                gl.uniform3fv(uniform(uniformName), parseColor(current.palette[paletteKey]));
            });
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };

        drawRef.current = draw;
        draw();
        const resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(canvas);
        const visibilityHandler = () => {
            if (!document.hidden) draw();
        };
        document.addEventListener("visibilitychange", visibilityHandler);

        return () => {
            drawRef.current = null;
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", visibilityHandler);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.radianceCanvas} />;
}

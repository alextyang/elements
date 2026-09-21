"use client";

import { useEffect, useRef } from "react";

import {
    CLOUD_COMPOSITE,
    CLOUD_FUNCTIONS,
    CLOUD_UNIFORMS,
    packCloudLayers,
} from "./webgl-cloud-shader";
import { createCloudNoise } from "./webgl-cloud-noise";
import { createWebGlCloudLighting } from "./webgl-cloud-lighting";
import { cloudSourceFloat16Bits } from "./cloud-fibratus-source-field";
import type { CloudScene } from "./cloud-scene";
import { CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION } from "./cloud-plate-scene";
import type { HydrometeorSceneOverrides } from "./hydrometeor-system";
import type { GroundAlbedoRgb } from "./atmospheric-composition";
import type { SkyPalette } from "./sky-palettes";
import type { ProductionWeatherSceneAuthoring } from "./weather-scene";
import type { PhysicalAtmosphereState } from "./physical-atmosphere";
import {
    cameraYawRadiansFromViewAzimuth,
    resolveSkyCamera,
    rotateDirectionByCameraYaw,
} from "./camera-contract";
import styles from "./sky.module.css";

export interface SkyRadianceScene {
    palette: SkyPalette;
    sun: [number, number];
    moon: [number, number];
    solarAltitude: number;
    nightDepth: number;
    nightBlackout: number;
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
    /** Optional physical linear RGB reflectance; legacy scalar stays valid. */
    groundAlbedoRgb?: GroundAlbedoRgb;
    aerosolTint: [number, number, number];
    /** Public compass heading; 180° is the legacy unrotated GPU reference. */
    viewAzimuth?: number;
    horizontalFov: number;
    cameraProjection: boolean;
    viewElevation: number;
    verticalFov: number;
    cloudiness: number;
    /** Full meteorological cloud state driving the volumetric renderer. */
    cloudScene: CloudScene;
    /** Optional exact precipitation/surface-meteor authoring state. */
    hydrometeors?: HydrometeorSceneOverrides;
    /** Optional finite world-space optical/electrical weather phenomena. */
    weather?: ProductionWeatherSceneAuthoring;
    /** Unattenuated solar irradiance at TOA in the renderer's scene domain. */
    solarTopOfAtmosphereIrradiance: [number, number, number];
    /** Unattenuated lunar irradiance at TOA; phase and distance are included. */
    moonTopOfAtmosphereIrradiance: [number, number, number];
    /** Exact shared medium used by the WebGL cloud transmittance lookup. */
    physicalAtmosphereState?: PhysicalAtmosphereState;
    /**
     * Unattenuated Moon source in the legacy WebGL full-Moon-relative domain.
     * Physical WebGPU consumers continue to use moonTopOfAtmosphereIrradiance.
     */
    webGlCloudMoonTopOfAtmosphereIrradiance?: [number, number, number];
    /** Common post-transport photographic exposure multiplier (not EV). */
    adaptationExposure: number;
    /** @deprecated Legacy cloud-lighting field; use solarTopOfAtmosphereIrradiance. */
    sunRadiance: [number, number, number];
    /** Real solar direction in the renderer's local east/up/view frame. */
    sunDirection: [number, number, number];
    /** @deprecated Observer-attenuated legacy field; use moonTopOfAtmosphereIrradiance. */
    moonRadiance: [number, number, number];
    /** Real lunar direction in the renderer's local east/up/view frame. */
    moonDirection: [number, number, number];
    /** Hemispheric skylight reaching cloud tops. */
    cloudAmbient: [number, number, number];
    /** Light returned from the surface to cloud bases. */
    cloudGroundLight: [number, number, number];
    /** Seconds of advection applied to the cloud fields. */
    cloudTime: number;
    /** Laboratory-only offset applied without interrupting the live clock. */
    cloudTimeOffset: number;
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
// x=horizontal FOV, y=pitch, z=vertical FOV, w=world yaw; all radians.
uniform vec4 u_camera;
uniform vec2 u_sun;
uniform vec2 u_moon;
uniform vec3 u_sun_direction;
uniform vec3 u_moon_direction;
uniform vec4 u_optics;
uniform vec4 u_light;
uniform vec4 u_composition;
uniform vec3 u_layers;
uniform vec3 u_aerosol_tint;
uniform vec4 u_seed;
uniform float u_airglow;
uniform float u_blackout;
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
${CLOUD_UNIFORMS}

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
    // One flat image plane, shared with the physical renderer and CPU
    // celestial projection. Angular panoramas bend straight cloud structures
    // and collapse all azimuths at the zenith; a bounded rectilinear view
    // retains near/far scale without that wrapped-dome singularity.
    vec2 ndc = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    vec3 camera_ray = normalize(vec3(
        ndc.x * tan(u_camera.x * 0.5),
        ndc.y * tan(u_camera.z * 0.5),
        1.0
    ));
    float pitch_cosine = cos(u_camera.y);
    float pitch_sine = sin(u_camera.y);
    vec3 local = vec3(
        camera_ray.x,
        camera_ray.y * pitch_cosine + camera_ray.z * pitch_sine,
        -camera_ray.y * pitch_sine + camera_ray.z * pitch_cosine
    );
    float cosine = cos(u_camera.w);
    float sine = sin(u_camera.w);
    return normalize(vec3(
        local.x * cosine + local.z * sine,
        local.y,
        -local.x * sine + local.z * cosine
    ));
}

float henyey_greenstein(float cosine, float g) {
    float g2 = g * g;
    return (1.0 - g2) /
        max(0.12, 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosine, 1.5));
}
${CLOUD_FUNCTIONS}

void main() {
    // WebGL has a bottom-left texture origin; convert to the screen's top-left.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y) +
        u_cloud_offline_sample.xy / u_resolution;
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
    vec3 sun_direction = normalize(u_sun_direction);
    vec3 moon_direction = normalize(u_moon_direction);
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

${CLOUD_COMPOSITE}

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
        (1.0 - u_blackout * 0.86) *
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
    float coarse_g = mix(
        0.48,
        0.74,
        aerosol_size * 0.62 + aerosol * 0.22 + humidity * 0.16
    );
    float fine_g = mix(
        0.68,
        0.83,
        aerosol_size * 0.52 + aerosol * 0.2 + humidity * 0.28
    );
    // Normalise the phase functions at the source direction before applying
    // a display-space scattering energy. The prior raw HG peak jumped by an
    // order of magnitude with particle size, so fixing the Moon projection
    // exposed a huge artificial blob/column. Particle size should control the
    // aureole's angular falloff, not create energy from nowhere.
    float coarse_mie = henyey_greenstein(moon_cosine, coarse_g) /
        max(henyey_greenstein(1.0, coarse_g), 0.0001);
    float fine_mie = henyey_greenstein(moon_cosine, fine_g) /
        max(henyey_greenstein(1.0, fine_g), 0.0001);
    float lunar_mie = mix(coarse_mie, fine_mie, 0.24 + humidity * 0.20);

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
    radiance *= 1.0 - zenith_depth *
        (0.20 + u_blackout * 0.34 - moonlight * 0.09);

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
    sceneKey?: string;
}

interface WebGlCloudPlateCaptureRequest {
    sceneId: string;
    frame: number;
    samples?: number;
    token: string;
    endpoint?: string;
}

interface WebGlCloudPlateCaptureResult {
    width: number;
    height: number;
    responseConvention: typeof CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION;
    planes: readonly {
        channel: "radiance" | "transmittance" |
            "direct-response" | "sky-response" | "ground-response";
        sha256: string;
        byteLength: number;
        stagingPath: string;
    }[];
}

type WebGlCloudPlateCaptureCanvas = HTMLCanvasElement & {
    __elementsWebGlFrameComplete?: () => Promise<void>;
    __elementsCloudPlateCapture?: (
        request: WebGlCloudPlateCaptureRequest,
    ) => Promise<WebGlCloudPlateCaptureResult>;
};

const packFloat32PlaneAsLittleEndianFloat16 = (
    values: Float32Array,
    width: number,
    height: number,
) => {
    const buffer = new ArrayBuffer(values.length * 2);
    const view = new DataView(buffer);
    const rowValues = width * 4;
    for (let y = 0; y < height; y += 1) {
        const sourceRow = (height - 1 - y) * rowValues;
        const targetRow = y * rowValues;
        for (let x = 0; x < rowValues; x += 1) {
            view.setUint16(
                (targetRow + x) * 2,
                cloudSourceFloat16Bits(values[sourceRow + x]),
                true,
            );
        }
    }
    return buffer;
};

const radicalInverse = (indexInput: number, base: number) => {
    let index = indexInput;
    let inverse = 1 / base;
    let result = 0;
    while (index > 0) {
        result += (index % base) * inverse;
        index = Math.floor(index / base);
        inverse /= base;
    }
    return result;
};

const webGlOfflineSample = (index: number) => [
    radicalInverse(index + 1, 2) - 0.5,
    radicalInverse(index + 1, 3) - 0.5,
    radicalInverse(index + 1, 5),
] as const;

export function AtmosphereCanvas({ scene, sceneKey }: AtmosphereCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef(scene);
    const sceneKeyRef = useRef(sceneKey);
    const drawRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        sceneRef.current = scene;
        sceneKeyRef.current = sceneKey;
        drawRef.current?.();
    }, [scene, sceneKey]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const captureCanvas = canvas as WebGlCloudPlateCaptureCanvas;
        const diagnostic = captureCanvas.dataset;
        diagnostic.cloudWebglFrameState = "initializing";
        diagnostic.cloudWebglProgramState = "compiling";
        diagnostic.cloudWebglFrameFailure = "none";
        diagnostic.cloudWebglCompletedFrames = "0";
        diagnostic.cloudWebglContextLost = "false";
        diagnostic.cloudWebglError = "0";
        const failFrame = (message: string) => {
            diagnostic.cloudWebglFrameState = "failed";
            diagnostic.cloudWebglFrameFailure = message;
        };
        const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            powerPreference: "high-performance",
            premultipliedAlpha: false,
        });
        if (!gl) {
            failFrame("WebGL2 context unavailable");
            return undefined;
        }
        const rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
        diagnostic.cloudWebglVendor = String(gl.getParameter(
            rendererInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR));
        diagnostic.cloudWebglRenderer = String(gl.getParameter(
            rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER));

        let program: WebGLProgram;
        try {
            program = createProgram(gl);
            diagnostic.cloudWebglProgramState = "linked";
        } catch (error) {
            diagnostic.cloudWebglProgramState = "failed";
            failFrame(String(error));
            console.warn("Atmospheric shader unavailable", error);
            return undefined;
        }

        // The restored WebGL volume path generates one continuous Perlin/
        // Worley density basis on this context. Species state shapes that
        // field during the world-space march; no sprite, atlas lobe, or CSS
        // cloud participates in this backend.
        let cloudNoise: ReturnType<typeof createCloudNoise> = null;
        let cloudLighting: ReturnType<typeof createWebGlCloudLighting>;
        try {
            cloudNoise = createCloudNoise(gl);
            cloudLighting = createWebGlCloudLighting(gl, program, 4);
        } catch (error) {
            failFrame(String(error));
            cloudNoise?.dispose();
            gl.deleteProgram(program);
            console.warn("WebGL cloud resources unavailable", error);
            return undefined;
        }
        if (!cloudNoise) {
            console.warn("WebGL cloud noise unavailable; rendering clear sky");
        }
        // Noise uses units 0–3. A separate nearest-filtered float lookup on 4
        // is valid for both the live frame and every offline response plane.

        const buffer = gl.createBuffer();
        if (!buffer) {
            failFrame("WebGL vertex buffer unavailable");
            cloudLighting.dispose();
            cloudNoise?.dispose();
            gl.deleteProgram(program);
            return undefined;
        }
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
        let drawSerial = 0;
        let disposed = false;
        const captureAbort = new AbortController();
        const releases = new Set<() => void>();
        const fences = new Set<WebGLSync>();
        let gpuWork: Promise<unknown> = Promise.resolve();
        const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
            const result = gpuWork.then(operation);
            gpuWork = result.catch(() => undefined);
            return result;
        };
        const assertCaptureActive = () => {
            if (disposed || captureAbort.signal.aborted || gl.isContextLost()) {
                throw new Error(
                    "WebGL cloud plate capture canceled: renderer disposed or context lost.",
                );
            }
        };

        let viewportSerial = 0;
        let requestedWidth = 0;
        let requestedHeight = 0;
        const snapshotDraw = () => {
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
            const width = Math.max(
                1,
                Math.round(bounds.width * pixelRatio),
            );
            const height = Math.max(
                1,
                Math.round(bounds.height * pixelRatio),
            );
            if (width !== requestedWidth || height !== requestedHeight) {
                requestedWidth = width;
                requestedHeight = height;
                viewportSerial += 1;
            }
            return { current: sceneRef.current, sceneKey: sceneKeyRef.current ?? "",
                width, height, viewportSerial };
        };
        type DrawSnapshot = ReturnType<typeof snapshotDraw>;
        const assertDrawActive = (snapshot: DrawSnapshot) => {
            assertCaptureActive();
            if (document.hidden) {
                throw new Error("WebGL cloud draw canceled: presentation unavailable while hidden.");
            }
            if (snapshot.viewportSerial !== viewportSerial) {
                throw new Error("WebGL cloud draw canceled: viewport resized.");
            }
        };
        const bindDraw = (
            { current, width, height }: DrawSnapshot,
            outputMode: number,
            framebuffer: WebGLFramebuffer,
            offlineSample: readonly [number, number, number],
        ) => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.viewport(0, 0, width, height);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(uniform("u_resolution"), width, height);
            const camera = resolveSkyCamera(current);
            const cameraYaw = cameraYawRadiansFromViewAzimuth(
                camera.viewAzimuth,
            );
            gl.uniform4f(
                uniform("u_camera"),
                (camera.horizontalFov * Math.PI) / 180,
                (camera.viewElevation * Math.PI) / 180,
                (camera.verticalFov * Math.PI) / 180,
                cameraYaw,
            );
            gl.uniform2f(uniform("u_sun"), current.sun[0], current.sun[1]);
            gl.uniform2f(uniform("u_moon"), current.moon[0], current.moon[1]);
            gl.uniform3fv(
                uniform("u_sun_direction"),
                rotateDirectionByCameraYaw(current.sunDirection, cameraYaw),
            );
            gl.uniform3fv(
                uniform("u_moon_direction"),
                rotateDirectionByCameraYaw(current.moonDirection, cameraYaw),
            );
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

            const packedClouds = packCloudLayers(
                current.cloudScene,
                current.cloudTime + current.cloudTimeOffset,
            );
            gl.uniform4fv(uniform("u_layer_geometry"), packedClouds.geometry);
            gl.uniform4fv(uniform("u_layer_shape"), packedClouds.shape);
            gl.uniform4fv(uniform("u_layer_motion"), packedClouds.motion);
            gl.uniform4fv(uniform("u_layer_phase"), packedClouds.phase);
            gl.uniform4fv(uniform("u_layer_scale"), packedClouds.scale);
            gl.uniform4fv(uniform("u_layer_drift"), packedClouds.drift);
            gl.uniform4fv(
                uniform("u_layer_morphology"),
                packedClouds.morphology,
            );
            gl.uniform4fv(uniform("u_layer_topology"), packedClouds.topology);
            gl.uniform4fv(uniform("u_layer_anatomy"), packedClouds.anatomy);
            gl.uniform4fv(uniform("u_layer_dynamics"), packedClouds.dynamics);
            gl.uniform4fv(uniform("u_layer_formation"), packedClouds.formation);
            gl.uniform4fv(
                uniform("u_layer_microstructure"),
                packedClouds.microstructure,
            );
            gl.uniform4fv(uniform("u_layer_optics"), packedClouds.optics);
            gl.uniform4fv(uniform("u_layer_lighting"), packedClouds.lighting);
            gl.uniform4fv(uniform("u_cloud_scene"), packedClouds.scene);
            gl.uniform4fv(uniform("u_cloud_seed"), packedClouds.seed);
            gl.uniform3fv(
                uniform("u_cloud_sun_radiance"),
                current.solarTopOfAtmosphereIrradiance,
            );
            gl.uniform3fv(
                uniform("u_cloud_moon_radiance"),
                current.webGlCloudMoonTopOfAtmosphereIrradiance ??
                    current.moonTopOfAtmosphereIrradiance,
            );
            cloudLighting.updateAndBind(current.physicalAtmosphereState);
            gl.uniform3fv(uniform("u_cloud_ambient"), current.cloudAmbient);
            gl.uniform3fv(
                uniform("u_cloud_ground_light"), current.cloudGroundLight,
            );
            // Reference-quality deterministic integration. A 384-step budget
            // aliases opaque storm fronts into horizontal bands; 768 reduces
            // them but 1536 resolves the fixed production view.
            gl.uniform4f(
                uniform("u_cloud_quality"),
                1536,
                24,
                1 / 70000,
                cloudNoise && packedClouds.active ? 1 : 0,
            );
            gl.uniform1f(uniform("u_cloud_output_mode"), outputMode);
            gl.uniform3f(
                uniform("u_cloud_offline_sample"),
                offlineSample[0],
                offlineSample[1],
                offlineSample[2],
            );
            gl.uniform1f(
                uniform("u_cloud_time"),
                (current.cloudTime + current.cloudTimeOffset) % 100000,
            );
            gl.uniform1f(uniform("u_cloud_fog"), current.cloudScene.fog);
            gl.uniform1f(
                uniform("u_cloud_noctilucent"),
                current.cloudScene.noctilucent,
            );

            if (cloudNoise) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_3D, cloudNoise.base);
                gl.uniform1i(uniform("u_cloud_base"), 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_3D, cloudNoise.detail);
                gl.uniform1i(uniform("u_cloud_detail"), 1);
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, cloudNoise.weather);
                gl.uniform1i(uniform("u_cloud_weather"), 2);
                gl.activeTexture(gl.TEXTURE3);
                gl.bindTexture(gl.TEXTURE_2D, cloudNoise.curl);
                gl.uniform1i(uniform("u_cloud_curl"), 3);
            }

            gl.uniform1f(uniform("u_airglow"), current.airglowStrength);
            gl.uniform1f(uniform("u_blackout"), current.nightBlackout);
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
        };

        const waitForGpu = async (snapshot: DrawSnapshot) => {
            assertDrawActive(snapshot);
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            if (!fence) throw new Error("WebGL completion fence unavailable");
            fences.add(fence);
            try {
                gl.flush();
                const deadline = performance.now() + 15_000;
                while (true) {
                    assertDrawActive(snapshot);
                    const status = gl.clientWaitSync(fence, 0, 0);
                    if (status === gl.WAIT_FAILED) {
                        throw new Error("WebGL completion fence failed");
                    }
                    if (status === gl.ALREADY_SIGNALED ||
                        status === gl.CONDITION_SATISFIED) break;
                    if (performance.now() >= deadline) {
                        throw new Error("WebGL completion fence timed out");
                    }
                    await new Promise<void>((resolve) => setTimeout(resolve, 16));
                }
            } finally {
                if (fences.delete(fence)) gl.deleteSync(fence);
            }
        };
        const yieldFrame = () => new Promise<void>((resolve, reject) => {
            assertCaptureActive();
            const finish = (error?: Error) => {
                cancelAnimationFrame(frame);
                clearTimeout(timeout);
                captureAbort.signal.removeEventListener("abort", cancel);
                document.removeEventListener("visibilitychange", visibility);
                if (error) reject(error);
                else resolve();
            };
            const cancel = () => finish(new Error(
                "WebGL cloud plate capture canceled: renderer disposed or context lost."));
            const visibility = () => {
                if (document.hidden) finish(new Error(
                    "WebGL cloud draw canceled: presentation unavailable while hidden."));
            };
            const frame = requestAnimationFrame(() => finish());
            // This timeout only cancels; it must not submit more tiles without
            // a real presentation boundary when a browser suspends rAF.
            const timeout = setTimeout(() => finish(new Error(
                "WebGL cloud draw canceled: presentation boundary timed out.")), 5_000);
            captureAbort.signal.addEventListener("abort", cancel, { once: true });
            document.addEventListener("visibilitychange", visibility);
            visibility();
        });

        // Metal can discard a costly command buffer while ANGLE still signals
        // its fence and reports NO_ERROR. Bound rasterized geometry (not only
        // the scissor) without changing the global UVs, resolution or samples.
        // A presentation boundary between submissions keeps these small draws
        // separate. The retained target is presented only after full coverage.
        const drawTiles = async (
            snapshot: DrawSnapshot,
            framebuffer: WebGLFramebuffer,
            outputMode: number,
            offlineSample: readonly [number, number, number] = [0, 0, 0.5],
        ) => {
            assertDrawActive(snapshot);
            bindDraw(snapshot, outputMode, framebuffer, offlineSample);
            gl.disable(gl.SCISSOR_TEST);
            gl.clearBufferfv(gl.COLOR, 0, new Float32Array(
                [0, 0, 0, outputMode === 0 ? 0 : -1]));
            const { width, height } = snapshot;
            const tileSize = 16;
            for (let y = 0; y < height; y += tileSize) {
                for (let x = 0; x < width; x += tileSize) {
                    assertDrawActive(snapshot);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                    const left = x / width * 2 - 1;
                    const right = Math.min(width, x + tileSize) / width * 2 - 1;
                    const bottom = y / height * 2 - 1;
                    const top = Math.min(height, y + tileSize) / height * 2 - 1;
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                        left, bottom, right, bottom, left, top,
                        left, top, right, bottom, right, top,
                    ]), gl.STATIC_DRAW);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                    await waitForGpu(snapshot);
                    assertDrawActive(snapshot);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    await yieldFrame();
                }
            }
            assertDrawActive(snapshot);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        };

        const assertCurrentScene = (snapshot: DrawSnapshot) => {
            if (snapshot.current !== sceneRef.current ||
                snapshot.sceneKey !== (sceneKeyRef.current ?? "")) {
                throw new Error("WebGL frame capture canceled: scene was superseded.");
            }
        };
        const renderLive = async (snapshot: DrawSnapshot, exactScene = false) => {
            assertDrawActive(snapshot);
            if (!cloudNoise && packCloudLayers(snapshot.current.cloudScene,
                snapshot.current.cloudTime + snapshot.current.cloudTimeOffset).active) {
                throw new Error("WebGL cloud noise unavailable");
            }
            const framebuffer = gl.createFramebuffer();
            const color = gl.createRenderbuffer();
            if (!framebuffer || !color) {
                if (framebuffer) gl.deleteFramebuffer(framebuffer);
                if (color) gl.deleteRenderbuffer(color);
                throw new Error("Unable to allocate WebGL retained frame.");
            }
            const release = () => {
                if (!releases.delete(release)) return;
                gl.deleteFramebuffer(framebuffer);
                gl.deleteRenderbuffer(color);
            };
            releases.add(release);
            const { width, height } = snapshot;
            try {
                gl.bindRenderbuffer(gl.RENDERBUFFER, color);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                    gl.RENDERBUFFER, color);
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                    throw new Error("WebGL retained frame is incomplete.");
                }
                diagnostic.cloudWebglFrameState = "submitted";
                diagnostic.cloudWebglFrameFailure = "none";
                await drawTiles(snapshot, framebuffer, 0);
                assertDrawActive(snapshot);
                const pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                const error = gl.getError();
                diagnostic.cloudWebglError = String(error);
                if (error !== gl.NO_ERROR) throw new Error(`WebGL draw failed with ${error}`);
                let missing = 0;
                for (let offset = 3; offset < pixels.length; offset += 4) {
                    if (pixels[offset] !== 255) missing += 1;
                }
                if (missing) throw new Error(`WebGL frame incomplete: ${missing} pixels were not rendered.`);
                assertDrawActive(snapshot);
                // A live job may finish its frozen image before the coalesced
                // next state. A capture-only job has no such display ownership:
                // never replace the last good frame with a superseded request.
                if (exactScene) assertCurrentScene(snapshot);
                // Resizing earlier would erase the last complete visible frame.
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height,
                    gl.COLOR_BUFFER_BIT, gl.NEAREST);
                await waitForGpu(snapshot);
                assertDrawActive(snapshot);
                drawSerial += 1;
                return { snapshot, serial: drawSerial };
            } finally {
                release();
            }
        };
        type LiveFrame = Awaited<ReturnType<typeof renderLive>>;
        let lastFrame: LiveFrame | null = null;
        let activeLive: { snapshot: DrawSnapshot; promise: Promise<LiveFrame> } | null = null;
        let pendingLive: DrawSnapshot | null = null;
        const sameDraw = (a: DrawSnapshot, b: DrawSnapshot) =>
            a.current === b.current && a.sceneKey === b.sceneKey &&
            a.viewportSerial === b.viewportSerial;
        const ownsReadiness = (snapshot: DrawSnapshot) => !disposed &&
            !document.hidden &&
            snapshot.current === sceneRef.current &&
            snapshot.sceneKey === (sceneKeyRef.current ?? "") &&
            snapshot.viewportSerial === viewportSerial;
        const renderOrReuse = async (snapshot: DrawSnapshot, exactScene = false) => {
            assertDrawActive(snapshot);
            // Drop a queued state that changed before any of its work began.
            // This does not interrupt a running live frame on every clock tick.
            assertCurrentScene(snapshot);
            // Captures and coalesced live updates share one queue. Recheck at
            // execution time: an earlier queued capture may have rendered this
            // exact immutable snapshot while this request was waiting.
            if (lastFrame && sameDraw(lastFrame.snapshot, snapshot)) return lastFrame;
            const frame = await renderLive(snapshot, exactScene);
            lastFrame = frame;
            return frame;
        };
        const requestLive = () => {
            if (disposed || gl.isContextLost() || document.hidden) return;
            const snapshot = snapshotDraw();
            if (!lastFrame || !sameDraw(lastFrame.snapshot, snapshot)) {
                diagnostic.cloudWebglFrameState = "submitted";
                diagnostic.cloudWebglFrameFailure = "none";
            }
            if (activeLive) {
                // Let this frozen frame finish; retain only the newest next
                // state, so a live clock cannot starve a slow complete frame.
                pendingLive = sameDraw(activeLive.snapshot, snapshot) ? null : snapshot;
                return;
            }
            if (lastFrame && sameDraw(lastFrame.snapshot, snapshot)) return;
            const promise = enqueue(() => renderOrReuse(snapshot));
            activeLive = { snapshot, promise };
            void promise.then((frame) => { lastFrame = frame; }).catch((error) => {
                if (ownsReadiness(snapshot)) failFrame(String(error));
            }).finally(() => {
                activeLive = null;
                if (pendingLive) {
                    pendingLive = null;
                    requestLive();
                }
            });
        };

        captureCanvas.__elementsWebGlFrameComplete = async () => {
            const snapshot = snapshotDraw();
            try {
                assertDrawActive(snapshot);
                const frame = activeLive && sameDraw(activeLive.snapshot, snapshot)
                    ? await activeLive.promise
                    : lastFrame && sameDraw(lastFrame.snapshot, snapshot)
                        ? lastFrame
                        : await enqueue(() => renderOrReuse(snapshot, true));
                assertDrawActive(snapshot);
                lastFrame = frame;
                const shaderDigest = await crypto.subtle.digest("SHA-256",
                    new TextEncoder().encode(VERTEX_SHADER + "\0" + FRAGMENT_SHADER));
                assertDrawActive(snapshot);
                const { width, height } = snapshot;
                if (!ownsReadiness(snapshot) || frame.serial !== drawSerial ||
                    width !== canvas.width || height !== canvas.height) {
                    // A newer draw owns the canvas; the caller may request a
                    // fresh fence, but must never accept this stale completion.
                    return;
                }
                diagnostic.cloudWebglFrameSceneKey = snapshot.sceneKey;
                diagnostic.cloudWebglShaderSourceHash = [...new Uint8Array(shaderDigest)]
                    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
                diagnostic.cloudWebglFrameWidth = String(width);
                diagnostic.cloudWebglFrameHeight = String(height);
                diagnostic.cloudWebglCompletedFrames = String(
                    Number(diagnostic.cloudWebglCompletedFrames) + 1);
                diagnostic.cloudWebglFrameState = "complete";
            } catch (error) {
                if (ownsReadiness(snapshot)) failFrame(String(error));
                throw error;
            }
        };

        const createCloudPlateReadback = (snapshot: DrawSnapshot) => {
            assertDrawActive(snapshot);
            if (!gl.getExtension("EXT_color_buffer_float")) {
                throw new Error(
                    "WebGL cloud plate export requires EXT_color_buffer_float.",
                );
            }
            const { width, height } = snapshot;
            const texture = gl.createTexture();
            const framebuffer = gl.createFramebuffer();
            if (!texture || !framebuffer) {
                if (texture) gl.deleteTexture(texture);
                if (framebuffer) gl.deleteFramebuffer(framebuffer);
                throw new Error("Unable to allocate WebGL cloud plate target.");
            }
            let released = false;
            const dispose = () => {
                if (released) return;
                released = true;
                releases.delete(dispose);
                gl.deleteFramebuffer(framebuffer);
                gl.deleteTexture(texture);
            };
            releases.add(dispose);
            try {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA32F,
                    width,
                    height,
                    0,
                    gl.RGBA,
                    gl.FLOAT,
                    null,
                );
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    texture,
                    0,
                );
                if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
                    gl.FRAMEBUFFER_COMPLETE) {
                    throw new Error("WebGL cloud plate framebuffer is incomplete.");
                }
                const values = new Float32Array(width * height * 4);
                return {
                    dispose,
                    read: async (
                        outputMode: 1 | 2 | 3 | 4 | 5,
                        offlineSample: readonly [number, number, number],
                    ) => {
                        await drawTiles(
                            snapshot,
                            framebuffer,
                            outputMode,
                            offlineSample,
                        );
                        assertDrawActive(snapshot);
                        gl.readPixels(
                            0,
                            0,
                            width,
                            height,
                            gl.RGBA,
                            gl.FLOAT,
                            values,
                        );
                        const error = gl.getError();
                        if (error !== gl.NO_ERROR) {
                            throw new Error(
                                `WebGL cloud plate readback failed with ${error}.`,
                            );
                        }
                        for (let offset = 3; offset < values.length; offset += 4) {
                            if (!(values[offset] >= 0)) {
                                throw new Error("WebGL cloud plate incomplete: an output pixel was not rendered.");
                            }
                        }
                        return values;
                    },
                };
            } catch (error) {
                dispose();
                throw error;
            }
        };

        captureCanvas.__elementsCloudPlateCapture = async (request) => {
            assertCaptureActive();
            const snapshot = snapshotDraw();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(request.sceneId) ||
                !Number.isInteger(request.frame) || request.frame < 0 ||
                !Number.isSafeInteger(request.samples ?? 1) ||
                (request.samples ?? 1) < 1 ||
                !request.token) {
                throw new Error("Invalid WebGL cloud plate capture request.");
            }
            if (!cloudNoise) {
                throw new Error(
                    "WebGL cloud plate capture has no volumetric noise basis.",
                );
            }
            const endpoint = request.endpoint ??
                "/api/cloud-plates/capture-plane";
            const { width, height } = snapshot;
            const sampleCount = request.samples ?? 1;
            const pixelCount = width * height;
            const radianceSum = new Float64Array(pixelCount * 3);
            const transmittanceSum = new Float64Array(pixelCount * 3);
            const directResponseSum = new Float64Array(pixelCount * 3);
            const skyResponseSum = new Float64Array(pixelCount * 3);
            const groundResponseSum = new Float64Array(pixelCount * 3);
            const firstDepth = new Float32Array(pixelCount);
            firstDepth.fill(140);
            const meanDepthSum = new Float64Array(pixelCount);
            const meanDepthWeight = new Float64Array(pixelCount);
            const planeResults:
                WebGlCloudPlateCaptureResult["planes"][number][] = [];
            try {
                const accumulateRgb = (
                    values: Float32Array,
                    target: Float64Array,
                ) => {
                    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                        const source = pixel * 4;
                        const destination = pixel * 3;
                        target[destination] += values[source];
                        target[destination + 1] += values[source + 1];
                        target[destination + 2] += values[source + 2];
                    }
                };
                await enqueue(async () => {
                    const readback = createCloudPlateReadback(snapshot);
                    try {
                        for (let sampleIndex = 0;
                            sampleIndex < sampleCount;
                            sampleIndex += 1) {
                            const sample = webGlOfflineSample(sampleIndex);
                            let values = await readback.read(1, sample);
                            accumulateRgb(values, radianceSum);
                            for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                                const source = pixel * 4;
                                firstDepth[pixel] = Math.min(
                                    firstDepth[pixel], values[source + 3]);
                            }
                            values = await readback.read(2, sample);
                            for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                                const source = pixel * 4;
                                const target = pixel * 3;
                                transmittanceSum[target] += values[source];
                                transmittanceSum[target + 1] += values[source + 1];
                                transmittanceSum[target + 2] += values[source + 2];
                                const meanTransmittance = Math.max(0, Math.min(1,
                                    (values[source] + values[source + 1] +
                                        values[source + 2]) / 3,
                                ));
                                const opacity = 1 - meanTransmittance;
                                meanDepthSum[pixel] += values[source + 3] * opacity;
                                meanDepthWeight[pixel] += opacity;
                            }
                            accumulateRgb(await readback.read(3, sample), directResponseSum);
                            accumulateRgb(await readback.read(4, sample), skyResponseSum);
                            accumulateRgb(await readback.read(5, sample), groundResponseSum);
                        }
                    } finally {
                        readback.dispose();
                    }
                });
                assertDrawActive(snapshot);

                const radiance = new Float32Array(pixelCount * 4);
                const transmittance = new Float32Array(pixelCount * 4);
                const directResponse = new Float32Array(pixelCount * 4);
                const skyResponse = new Float32Array(pixelCount * 4);
                const groundResponse = new Float32Array(pixelCount * 4);
                for (let pixel = 0; pixel < pixelCount; pixel += 1) {
                    const source = pixel * 3;
                    const target = pixel * 4;
                    radiance[target] = radianceSum[source] / sampleCount;
                    radiance[target + 1] = radianceSum[source + 1] / sampleCount;
                    radiance[target + 2] = radianceSum[source + 2] / sampleCount;
                    radiance[target + 3] = firstDepth[pixel];
                    transmittance[target] =
                        transmittanceSum[source] / sampleCount;
                    transmittance[target + 1] =
                        transmittanceSum[source + 1] / sampleCount;
                    transmittance[target + 2] =
                        transmittanceSum[source + 2] / sampleCount;
                    transmittance[target + 3] = meanDepthWeight[pixel] > 1e-8
                        ? meanDepthSum[pixel] / meanDepthWeight[pixel]
                        : 140;
                    for (const [sum, response] of [
                        [directResponseSum, directResponse],
                        [skyResponseSum, skyResponse],
                        [groundResponseSum, groundResponse],
                    ] as const) {
                        response[target] = sum[source] / sampleCount;
                        response[target + 1] = sum[source + 1] / sampleCount;
                        response[target + 2] = sum[source + 2] / sampleCount;
                        response[target + 3] = firstDepth[pixel];
                    }
                }

                for (const [channel, values] of [
                    ["radiance", radiance],
                    ["transmittance", transmittance],
                    ["direct-response", directResponse],
                    ["sky-response", skyResponse],
                    ["ground-response", groundResponse],
                ] as const) {
                    const payload = packFloat32PlaneAsLittleEndianFloat16(
                        values,
                        width,
                        height,
                    );
                    const query = new URLSearchParams({
                        scene: request.sceneId,
                        frame: String(request.frame),
                        channel,
                        width: String(width),
                        height: String(height),
                    });
                    const response = await fetch(`${endpoint}?${query}`, {
                        method: "POST",
                        signal: captureAbort.signal,
                        headers: {
                            "content-type": "application/octet-stream",
                            "x-cloud-plate-capture-token": request.token,
                        },
                        body: payload,
                    });
                    assertCaptureActive();
                    if (!response.ok) {
                        const message = await response.text();
                        assertCaptureActive();
                        throw new Error(
                            `WebGL cloud plate ${channel} upload failed: ` +
                            `${response.status} ${message}`,
                        );
                    }
                    const plane = await response.json() as
                        WebGlCloudPlateCaptureResult["planes"][number];
                    assertCaptureActive();
                    planeResults.push(plane);
                }
            } catch (error) {
                assertCaptureActive();
                throw error;
            } finally {
                requestLive();
            }
            return {
                width, height, planes: planeResults,
                responseConvention: CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION,
            };
        };
        captureCanvas.dataset.cloudPlateExport = "available";

        drawRef.current = requestLive;
        requestLive();
        const resizeObserver = new ResizeObserver(requestLive);
        resizeObserver.observe(canvas);
        const visibilityHandler = () => {
            if (!document.hidden) requestLive();
        };
        const contextLostHandler = () => {
            captureAbort.abort();
            diagnostic.cloudWebglContextLost = "true";
            failFrame("WebGL context lost");
        };
        document.addEventListener("visibilitychange", visibilityHandler);
        canvas.addEventListener("webglcontextlost", contextLostHandler);

        return () => {
            disposed = true;
            captureAbort.abort();
            diagnostic.cloudWebglFrameState = "disposed";
            drawRef.current = null;
            delete captureCanvas.__elementsWebGlFrameComplete;
            delete captureCanvas.__elementsCloudPlateCapture;
            delete captureCanvas.dataset.cloudPlateExport;
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", visibilityHandler);
            canvas.removeEventListener("webglcontextlost", contextLostHandler);
            for (const fence of fences) gl.deleteSync(fence);
            fences.clear();
            for (const release of releases) release();
            cloudNoise?.dispose();
            cloudLighting.dispose();
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={styles.radianceCanvas}
            data-sky-renderer="webgl2"
            data-cloud-scene-key={sceneKey}
        />
    );
}

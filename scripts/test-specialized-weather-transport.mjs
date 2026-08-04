import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const shaderSource = readFileSync(new URL(
    "../components/backgrounds/sky/specialized-weather-transport-wgsl.ts",
    import.meta.url,
), "utf8");

const hydrometeorSource = shaderSource.match(
    /export const SPECIALIZED_HYDROMETEOR_TRANSPORT_WGSL[\s\S]*?export const SPECIALIZED_UPPER_ATMOSPHERE_TRANSPORT_WGSL/,
)?.[0] ?? "";
const upperSource = shaderSource.match(
    /export const SPECIALIZED_UPPER_ATMOSPHERE_TRANSPORT_WGSL[\s\S]*$/,
)?.[0] ?? "";

const rgbAdd = (a, b) => a.map((value, channel) => value + b[channel]);
const rgbMultiply = (a, b) => a.map((value, channel) => value * b[channel]);
const integrate = (extinction, source, distance) => {
    const transmittance = extinction.map((value) => Math.exp(-value * distance));
    const radiance = source.map((value, channel) => extinction[channel] <= 1e-12
        ? value * distance
        : value * (1 - transmittance[channel]) / extinction[channel]);
    return { radiance, transmittance };
};
const compose = (front, back) => ({
    radiance: rgbAdd(front.radiance,
        rgbMultiply(front.transmittance, back.radiance)),
    transmittance: rgbMultiply(front.transmittance, back.transmittance),
});

test("specialized hydrometeor transport retains record-local RGB source ownership", () => {
    assert.match(hydrometeorSource,
        /let record = hydrometeor_fields\.records\[index\]/);
    assert.match(hydrometeorSource,
        /cloud_owned = record\.identity\.z >= -0\.25/);
    assert.match(hydrometeorSource,
        /cloud_lv_sample_owner_direct_transmittance\([\s\S]*?parent_owner, 0u/);
    assert.match(hydrometeorSource,
        /HydrometeorParentLightCoupling\([\s\S]*?record\.identity\.z,[\s\S]*?record\.energy_and_importance\.w/);
    assert.match(hydrometeorSource,
        /hydrometeor_resolve_passive_source_coefficient\(/);
    assert.match(hydrometeorSource,
        /hydrometeor_accumulate_passive_overlap\(/);
    assert.doesNotMatch(hydrometeorSource,
        /hydrometeor_multiple_scattering\(/);
});

test("bounded support-event scans replace private record interval tables", () => {
    assert.match(hydrometeorSource,
        /for \(var iteration = 0u; iteration < 768u/);
    assert.match(hydrometeorSource,
        /hydrometeor_record_interval\(/);
    assert.match(hydrometeorSource,
        /hydrometeor_record_step_km\(/);
    assert.doesNotMatch(hydrometeorSource,
        /array<vec2<f32>,\s*96>/);
    assert.doesNotMatch(hydrometeorSource,
        /array<Hydrometeor/);
});

test("lightning uses a finite line source, radiometric PSF ranking, and exact owner attenuation", () => {
    assert.match(shaderSource, /fn specialized_lightning_direct_packet\(/);
    assert.match(shaderSource,
        /bounds_min[\s\S]*?bounds_max[\s\S]*?bounds_far <= bounds_near/);
    assert.match(shaderSource,
        /for \(var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS/);
    assert.match(shaderSource, /var strongest_scores = array<f32, 2>/);
    assert.match(shaderSource,
        /edge_length \* segment\.emissive_weight \* psf \/[\s\S]*?ray_distance \* ray_distance/);
    assert.match(shaderSource,
        /0\.88 \* exp\([\s\S]*?0\.12 \* pow\(1\.0 \+ wing_coordinate/);
    assert.match(shaderSource,
        /for \(var selected = 0u; selected < 2u; selected \+= 1u\)[\s\S]*?weather_parent_owner_segment_transmittance/);
    assert.match(shaderSource, /specialized_merge_lightning_packet\(/);
    assert.doesNotMatch(hydrometeorSource,
        /weather_production_lightning_channel_emission\(/);
});

test("weather and local air share one RGB coefficient integration event", () => {
    assert.match(shaderSource,
        /air\.extinction_rgb_per_km \+[\s\S]*?weather\.extinction_rgb_per_km/);
    assert.match(shaderSource,
        /air\.source_radiance_coefficient_rgb_per_km \+[\s\S]*?weather\.source_coefficient_rgb_per_km/);
    assert.match(shaderSource,
        /integrate_camera_transport_coefficients\([\s\S]*?combined_extinction[\s\S]*?combined_source/);
    assert.match(shaderSource,
        /relative_weather_transport\([\s\S]*?combined,[\s\S]*?clear/);

    const airExtinction = [0.08, 0.11, 0.19];
    const weatherExtinction = [0.53, 0.49, 0.44];
    const airSource = [0.016, 0.025, 0.051];
    const weatherSource = [0.19, 0.21, 0.24];
    const distance = 0.72;
    const combined = integrate(
        rgbAdd(airExtinction, weatherExtinction),
        rgbAdd(airSource, weatherSource),
        distance,
    );
    const reversed = integrate(
        rgbAdd(weatherExtinction, airExtinction),
        rgbAdd(weatherSource, airSource),
        distance,
    );
    assert.deepEqual(combined, reversed,
        "co-located media must be order independent before the Beer event");
});

test("clear gaps use the exact atmosphere segment while occupied spans use local air", () => {
    assert.match(shaderSource,
        /fn specialized_clear_atmosphere_segment\([\s\S]*?return cloud_background_atmosphere_segment\(/);
    assert.match(shaderSource, /specialized_atmosphere_source_sample\(/);
    assert.match(shaderSource,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km/);
    assert.doesNotMatch(shaderSource,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.unshadowed_source_radiance_coefficient_rgb_per_km/);
    assert.match(shaderSource, /maximum_tau <= 0\.2/);
});

test("upper media use curved finite supports and physical source paths", () => {
    assert.match(upperSource, /upper_record_interval\(/);
    assert.match(upperSource, /upper_record_step_km\(/);
    assert.match(upperSource, /cloud_morphology_evaluate_owner\(/);
    assert.match(upperSource, /upper_material_extinction_km\(/);
    assert.match(upperSource, /upper_material_source\(/);
    assert.match(upperSource,
        /var first_depth = UPPER_ATMOSPHERE_FAR_LIMIT/);
    assert.match(upperSource,
        /evaluated_steps,[\s\S]*?UPPER_ATMOSPHERE_FAR_LIMIT\)/);
    assert.doesNotMatch(upperSource, /array<vec2<f32>,\s*36>/);
});

test("an empty weather packet is an exact affine identity", () => {
    const cloud = {
        radiance: [0.19, 0.27, 0.41],
        transmittance: [0.36, 0.44, 0.57],
    };
    const identity = { radiance: [0, 0, 0], transmittance: [1, 1, 1] };
    assert.deepEqual(compose(cloud, identity), cloud);
    assert.deepEqual(compose(identity, cloud), cloud);
    assert.match(shaderSource,
        /camera_transport_identity\(\), FAR_LIMIT, FAR_LIMIT/);
});

test("five-packet depth order preserves the old three-cloud result and orders weather", () => {
    const identity = { radiance: [0, 0, 0], transmittance: [1, 1, 1] };
    const packets = [
        { depth: 8, sort: 0, transport: {
            radiance: [0.08, 0.11, 0.16], transmittance: [0.78, 0.75, 0.72],
        } },
        { depth: 21, sort: 1, transport: {
            radiance: [0.14, 0.12, 0.1], transmittance: [0.64, 0.68, 0.71],
        } },
        { depth: 44, sort: 2, transport: {
            radiance: [0.04, 0.06, 0.09], transmittance: [0.87, 0.83, 0.79],
        } },
    ];
    const oldResult = packets.reduce(
        (result, packet) => compose(result, packet.transport), identity);
    const noWeather = [...packets,
        { depth: 140, sort: 3, transport: identity },
        { depth: 140, sort: 4, transport: identity }]
        .sort((a, b) => a.depth - b.depth || a.sort - b.sort)
        .reduce((result, packet) => compose(result, packet.transport), identity);
    assert.deepEqual(noWeather, oldResult);

    const rain = { depth: 13, sort: 3, transport: {
        radiance: [0.025, 0.03, 0.035], transmittance: [0.55, 0.58, 0.61],
    } };
    const ordered = [...packets, rain]
        .sort((a, b) => a.depth - b.depth || a.sort - b.sort)
        .reduce((result, packet) => compose(result, packet.transport), identity);
    const rainBehindAllClouds = packets.reduce(
        (result, packet) => compose(result, packet.transport), identity);
    const wrong = compose(rainBehindAllClouds, rain.transport);
    assert.notDeepEqual(ordered.radiance, wrong.radiance,
        "radiance-bearing affine packets do not commute across depth");
});

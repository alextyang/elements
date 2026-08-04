import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modules = new Map();
const compileCommonJs = (input) => {
    let url = input instanceof URL ? input : new URL(input, import.meta.url);
    if (!extname(fileURLToPath(url))) url = new URL(`${url.href}.ts`);
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const source = readFileSync(url, "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: fileURLToPath(url),
    }).outputText;
    const moduleObject = { exports: {} };
    modules.set(url.href, moduleObject);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (!specifier.startsWith(".")) {
                throw new Error(`Unexpected import ${specifier}`);
            }
            return compileCommonJs(new URL(specifier, url));
        },
    );
    return moduleObject.exports;
};

const sceneModule = compileCommonJs(
    "../components/backgrounds/sky/weather-scene.ts");
const production = compileCommonJs(
    "../components/backgrounds/sky/weather-phenomena-production.ts");
const phenomena = compileCommonJs(
    "../components/backgrounds/sky/weather-optical-phenomena.ts");
const productionWgsl = compileCommonJs(
    "../components/backgrounds/sky/weather-phenomena-production-wgsl.ts");

const owner = (overrides = {}) => ({
    id: "owner",
    kind: "liquid-cloud",
    finite: true,
    bottomAltitudeKm: 1,
    topAltitudeKm: 2,
    opticalDepth: 0.8,
    temperatureKelvin: 278,
    ...overrides,
});

const direction = (azimuthDegrees, elevationDegrees) => {
    const azimuth = azimuthDegrees * Math.PI / 180;
    const elevation = elevationDegrees * Math.PI / 180;
    const horizontal = Math.cos(elevation);
    return [Math.sin(azimuth) * horizontal, Math.sin(elevation),
        Math.cos(azimuth) * horizontal];
};

const lightningInput = () => ({
    id: "qualified-storm-flash",
    owner: owner({ id: "storm", kind: "convective-cloud",
        bottomAltitudeKm: 0.8, topAltitudeKm: 13, opticalDepth: 45,
        temperatureKelvin: 235 }),
    topology: "cloud-to-ground",
    negativeCharge: {
        centerEastAltitudeNorthKm: [0, 5.5, 0], radiusKm: 2.5, polarity: -1,
    },
    positiveCharge: {
        centerEastAltitudeNorthKm: [1.2, 10.5, 0.6], radiusKm: 2, polarity: 1,
    },
    groundAltitudeKm: 0,
    peakCurrentKiloamps: 48,
    radiantEnergyJoules: 2.5e6,
    seed: 71,
});

const fullScene = () => sceneModule.resolveProductionWeatherScene({
    schema: 1,
    clock: { snapshotTimeSeconds: 1_000, sceneTimeSeconds: 25,
        deterministicSeed: 0x1234_5678 },
    dropletOpticalOwners: [{ ownerIndex: 4, input: {
        owner: owner({ id: "rain", kind: "rain-shaft", opticalDepth: 0.55 }),
        effectiveRadiusMicrons: 620,
        effectiveVariance: 0.08,
        seed: 17,
    } }],
    orientedIceOpticalOwners: [{ ownerIndex: 9, input: {
        owner: owner({ id: "ice", kind: "ice-cloud", bottomAltitudeKm: 7,
            topAltitudeKm: 10, opticalDepth: 0.62, temperatureKelvin: 228 }),
        sourceDirection: direction(0, 10),
        plateFraction: 0.7,
        columnFraction: 0.2,
        aggregateFraction: 0.1,
        randomOrientationFraction: 0.3,
        horizontalPlateFraction: 0.52,
        horizontalColumnFraction: 0.08,
        tiltStandardDeviationDegrees: 0.7,
        surfaceRoughness: 0.08,
        effectiveRadiusMicrons: 45,
        requestedFeatures: ["halo-22", "halo-46", "sundogs",
            "circumzenithal-arc", "light-pillar"],
        seed: 41,
    } }],
    lightning: { kind: "direct", ownerIndex: 19,
        eventStartSceneTimeSeconds: 24.9, input: lightningInput() },
    auroraCurtains: [{
        owner: owner({ id: "auroral-oval", kind: "magnetospheric-sheet",
            bottomAltitudeKm: 80, topAltitudeKm: 500, opticalDepth: 0,
            temperatureKelvin: 800 }),
        centerEastNorthKm: [0, 0], orientationRadians: 0,
        lengthKm: 650, sheetWidthKm: 1.4,
        bottomAltitudeKm: 88, topAltitudeKm: 320,
        foldAmplitudeKm: 14, foldWavelengthKm: 58,
        driftEastNorthKmPerSecond: [0.005, 0.001],
        magneticFieldDirection: [0.28, -0.95, 0.12],
        geomagneticLatitudeDegrees: 67, kpIndex: 4,
        solarAltitudeDegrees: -18, emissionScale: 0.75, seed: 101,
    }],
    blowingBoundaryMedia: [{
        owner: owner({ id: "dust", kind: "boundary-layer-region",
            bottomAltitudeKm: 0, topAltitudeKm: 0.8, opticalDepth: 2,
            temperatureKelvin: 300 }),
        kind: "blowing-dust", centerEastNorthKm: [3, -2],
        majorRadiusKm: 18, minorRadiusKm: 5, orientationRadians: 0.4,
        topAltitudeKm: 0.6, windSpeedMps: 13, windDirectionRadians: 0.4,
        frictionVelocityMps: 0.7, visibilityKm: 0.8,
        surfaceTemperatureKelvin: 302, surfaceRelativeHumidity: 0.25,
        snowCoverFraction: 0, soilMoistureFraction: 0.08,
        particleMedianDiameterMicrons: 22, seed: 131,
    }],
});

test("valid packed weather expands into exact bounded production stages", () => {
    const state = production.createWeatherPhenomenaProductionState(fullScene());
    assert.equal(state.productionDispatchReady, true);
    assert.equal(state.rendererHostWiringComplete, true);
    assert.equal(state.packedScene.byteLength, state.uniformByteLength);
    assert.deepEqual(state.passes.map(({ stage }) => stage), [
        "droplet-owner-scattering",
        "oriented-ice-owner-scattering",
        "lightning-channel-emission",
        "lightning-cloud-illumination",
        "auroral-volume-emission",
        "blowing-boundary-volume",
    ]);
    for (const pass of state.passes) {
        assert.equal(pass.finiteSupport, true);
        assert.equal(pass.cameraPathTransmittanceAppliedByPass, false);
        assert.equal(pass.postProcessBloomAppliedByPass, false);
        assert.equal(pass.atmosphereOrdering,
            "source-to-sample-then-sample-to-camera");
    }
    for (const family of Object.values(state.reachability)) {
        assert.equal(family.state, "production-integrated");
        assert.equal(family.transportKernelAvailable, true);
        assert.equal(family.hostWired, true);
        assert.equal(family.photographicQualificationRequired, true);
    }
    assert.equal(state.phenomenonReachability["primary-rainbow"].reachable, true);
    assert.equal(state.phenomenonReachability["secondary-rainbow"].reachable, true);
    assert.equal(state.phenomenonReachability["halo-22"].reachable, true);
    assert.equal(state.phenomenonReachability["lightning-cloud-to-ground"].reachable,
        true);
    assert.equal(state.phenomenonReachability["lightning-intracloud"].reachable,
        false);
    assert.equal(state.phenomenonReachability["blowing-dust"].reachable, true);
    assert.equal(state.phenomenonReachability["blowing-snow"].reachable, false);
});

test("lightning cloud illumination is finite, parent-owned and source-attenuated", () => {
    const event = phenomena.createLightningEventState(lightningInput());
    assert.equal(event.validity.valid, true, event.validity.reasons.join(","));
    const pulse = event.pulses[0];
    const eventTime = pulse.startSeconds + pulse.riseSeconds * 2;
    const common = {
        event,
        eventTimeSeconds: eventTime,
        ownerId: event.owner.id,
        ownerSampleWeight: 0.6,
        positionEastAltitudeNorthKm: [0.2, 5.7, 0.1],
        cloudScatteringCoefficientRgbPerKm: [8, 7, 6],
        cloudPhaseRgbPerSteradian: () => [0.08, 0.08, 0.08],
    };
    const full = production.evaluateLightningCloudVolumeSample({
        ...common,
        sourceToSampleTransmittanceRgb: () => [1, 1, 1],
    });
    const attenuated = production.evaluateLightningCloudVolumeSample({
        ...common,
        sourceToSampleTransmittanceRgb: () => [0.25, 0.5, 0.75],
    });
    assert.equal(full.enabled, true);
    assert.equal(full.evaluatedSegmentQuadraturePoints,
        event.channelSegments.length * 4);
    assert.equal(full.duplicatesChannelEmission, false);
    assert.equal(full.cameraPathTransmittanceApplied, false);
    for (let channel = 0; channel < 3; channel += 1) {
        const expectedRatio = [0.25, 0.5, 0.75][channel];
        assert.ok(Math.abs(attenuated.incidentChannelRadianceRgb[channel] /
            full.incidentChannelRadianceRgb[channel] - expectedRatio) < 1e-11);
        assert.ok(Math.abs(full.cloudSourceCoefficientRgbPerKm[channel] -
            full.incidentChannelRadianceRgb[channel] *
                common.cloudScatteringCoefficientRgbPerKm[channel] * 0.6) <
            Math.max(1e-10, full.cloudSourceCoefficientRgbPerKm[channel] * 1e-12));
    }
    const foreign = production.evaluateLightningCloudVolumeSample({
        ...common, ownerId: "neighbour-storm",
        sourceToSampleTransmittanceRgb: () => [1, 1, 1],
    });
    assert.equal(foreign.enabled, false);
    assert.equal(foreign.evaluatedSegmentQuadraturePoints, 0);
});

test("ice production states retain a finite polydisperse size population", () => {
    const resolved = fullScene();
    const distribution = resolved.orientedIceOpticalOwners[0].state.distribution;
    assert.ok(distribution.effectiveVariance >= 0.015 &&
        distribution.effectiveVariance <= 0.35);
    assert.ok(distribution.minimumRadiusMicrons > 0);
    assert.ok(distribution.minimumRadiusMicrons <
        distribution.effectiveRadiusMicrons);
    assert.ok(distribution.maximumRadiusMicrons >
        distribution.effectiveRadiusMicrons);
    const features = resolved.orientedIceOpticalOwners[0].state.features;
    assert.ok(features.every((feature) => feature.angularWidthRadians > 0 &&
        feature.normalizationRgb.every((channel) => channel > 0)));
});

test("oriented finite boundary support uses a true world-space ray interval", () => {
    const interval = production.intersectFiniteOrientedEllipticalCylinder(
        [-10, 1, 0], [1, 0, 0], [0, 0], 5, 2, 0, 0, 2);
    assert.ok(interval);
    assert.ok(Math.abs(interval.nearKm - 8) < 1e-12);
    assert.ok(Math.abs(interval.farKm - 12) < 1e-12);
    assert.equal(production.intersectFiniteOrientedEllipticalCylinder(
        [-10, 3, 0], [1, 0, 0], [0, 0], 5, 2, 0, 0, 2), null);
    assert.equal(production.intersectFiniteOrientedEllipticalCylinder(
        [-10, 1, 8], [1, 0, 0], [0, 0], 5, 2, 0, 0, 2), null);
});

test("WGSL production layer is owner-local, passive and statically bounded", () => {
    const common = productionWgsl.WEATHER_PHENOMENA_PRODUCTION_WGSL;
    const passes = productionWgsl
        .WEATHER_PHENOMENA_PRODUCTION_SPECIALIZED_PASSES_WGSL;
    assert.match(common, /u32\(round\(identity\.z\)\) != owner_index/);
    assert.match(common, /weather_droplet_ordered_source\(/);
    assert.match(common, /weather_oriented_ice_ordered_source\(/);
    assert.match(common, /weather_parent_owner_segment_transmittance\(/);
    assert.match(common, /physical_atmosphere_segment\(/);
    assert.match(common, /for \(var quadrature = 0u; quadrature < 4u/);
    assert.match(common, /fn weather_production_lightning_transfer_bounded\(/);
    assert.match(common, /var strongest_scores = array<f32, 2>/);
    assert.match(common,
        /weighted_segment_length \/[\s\S]*?distance_squared \+ core_radius_km \* core_radius_km/);
    assert.match(common,
        /for \(var selected = 0u; selected < 2u; selected \+= 1u\)[\s\S]*?for \(var quadrature = 0u; quadrature < 2u/);
    assert.match(common,
        /weather_production_intersect_oriented_elliptical_cylinder\(/);
    assert.match(common, /weather_aurora_curtain_emission\(/);
    assert.match(common, /weather_blowing_passive_source_coefficient\(/);
    assert.match(passes, /iteration = 0u; iteration < 1024u/);
    assert.match(passes, /iteration = 0u; iteration < 1536u/);
    assert.match(passes, /combined_extinction/);
    assert.match(passes, /relative_weather_transport\(/);
    assert.doesNotMatch(common + passes, /screen_uv|screen_position|full.?screen/i);
    assert.doesNotMatch(common + passes, /textureSample|textureLoad/);
});

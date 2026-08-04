import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const compileCommonJs = (relativePath, dependency = {}) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const moduleObject = { exports: {} };
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (Object.hasOwn(dependency, specifier)) return dependency[specifier];
            throw new Error(`Unexpected test import ${specifier}`);
        },
    );
    return moduleObject.exports;
};

const phenomena = compileCommonJs(
    "../components/backgrounds/sky/weather-optical-phenomena.ts",
);
const wgslModule = compileCommonJs(
    "../components/backgrounds/sky/weather-optical-phenomena-wgsl.ts",
    { "./weather-optical-phenomena.ts": phenomena },
);
const qualification = compileCommonJs(
    "../components/backgrounds/sky/weather-phenomena-qualification.ts",
);
const wgsl = wgslModule.WEATHER_OPTICAL_PHENOMENA_WGSL;

const radians = (degrees) => degrees * Math.PI / 180;
const direction = (azimuthDegrees, elevationDegrees) => {
    const azimuth = radians(azimuthDegrees);
    const elevation = radians(elevationDegrees);
    const horizontal = Math.cos(elevation);
    return [
        Math.sin(azimuth) * horizontal,
        Math.sin(elevation),
        Math.cos(azimuth) * horizontal,
    ];
};
const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
const luminance = (rgb) =>
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const integrateAxisymmetric = (evaluator, samples = 60_000) => {
    const total = [0, 0, 0];
    for (let index = 0; index < samples; index += 1) {
        const theta = Math.PI * (index + 0.5) / samples;
        const value = evaluator(theta);
        const weight = Math.sin(theta) * Math.PI / samples * Math.PI * 2;
        for (let channel = 0; channel < 3; channel += 1) {
            total[channel] += value[channel] * weight;
        }
    }
    return total;
};
const integrateSphere = (evaluator, samples = 120_000) => {
    const total = [0, 0, 0];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < samples; index += 1) {
        const up = 1 - 2 * (index + 0.5) / samples;
        const radial = Math.sqrt(Math.max(0, 1 - up * up));
        const azimuth = goldenAngle * index;
        const value = evaluator([
            Math.sin(azimuth) * radial,
            up,
            Math.cos(azimuth) * radial,
        ]);
        for (let channel = 0; channel < 3; channel += 1) {
            total[channel] += value[channel] * Math.PI * 4 / samples;
        }
    }
    return total;
};

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

test("standalone qualification manifest spans every required phenomenon family", () => {
    const targets = qualification.WEATHER_PHENOMENA_QUALIFICATION_TARGETS;
    assert.equal(new Set(targets.map(({ id }) => id)).size, targets.length);
    assert.deepEqual(
        [...new Set(targets.map(({ family }) => family))].sort(),
        ["aurora", "blowing-medium", "droplet-optics", "lightning", "oriented-ice"],
    );
    for (const phenomenon of [
        "primary-rainbow", "secondary-rainbow", "fogbow", "glory", "corona",
        "22-degree halo", "46-degree halo", "parhelia", "circumzenithal arc",
        "light pillar", "diamond-dust glints", "intra-cloud lightning",
        "cloud-to-ground return stroke", "green auroral curtain",
        "red auroral upper curtain", "blue-violet lower border",
        "blowing snow", "blowing dust",
    ]) {
        assert.ok(targets.some((target) => target.phenomenon === phenomenon), phenomenon);
    }
    assert.ok(targets.every((target) => target.requiredCues.length >= 3 &&
        target.forbiddenFailures.length >= 3));
});

test("rainbow, fogbow and glory are finite-owner, size-distribution states", () => {
    const rain = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "rain-shaft", opticalDepth: 0.55 }),
        effectiveRadiusMicrons: 620,
        effectiveVariance: 0.08,
        seed: 17,
    });
    assert.equal(rain.validity.valid, true);
    assert.deepEqual(rain.enabledFeatures, ["primary-rainbow", "secondary-rainbow"]);
    assert.ok(rain.replacementEnergyRgb.every((energy) => energy > 0 && energy < 0.12));
    for (const lobe of rain.lobes) {
        const integrated = integrateAxisymmetric((theta) =>
            phenomena.evaluateSpectralAngularLobe(lobe, theta));
        integrated.forEach((energy, channel) => assert.ok(
            Math.abs(energy - lobe.energyRgb[channel]) < 2e-6,
            `${lobe.id} channel ${channel} energy ${energy}`,
        ));
    }
    const primary = rain.lobes.find(({ id }) => id === "primary-rainbow");
    const secondary = rain.lobes.find(({ id }) => id === "secondary-rainbow");
    assert.ok(primary.centerRadiansRgb[0] < primary.centerRadiansRgb[2]);
    assert.ok(secondary.centerRadiansRgb[0] > secondary.centerRadiansRgb[2],
        "secondary rainbow reverses spectral order");
    assert.deepEqual(
        phenomena.evaluateDropletPhaseReplacement(rain, [0, 0, 1], [0, 0, -1], 0),
        [0, 0, 0],
        "no authoritative owner sample means no bow",
    );

    const fog = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "fog-bank", bottomAltitudeKm: 0, topAltitudeKm: 0.2 }),
        effectiveRadiusMicrons: 10,
        effectiveVariance: 0.12,
        seed: 18,
    });
    assert.equal(fog.validity.valid, true);
    assert.deepEqual(fog.enabledFeatures, ["fogbow", "glory"]);
    const fogbow = fog.lobes.find(({ id }) => id === "fogbow");
    assert.ok(fogbow.sigmaRadiansRgb[1] > radians(4));

    const invalid = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "fog-bank" }),
        effectiveRadiusMicrons: 8,
        effectiveVariance: 0.1,
        requestedFeatures: ["primary-rainbow"],
        seed: 19,
    });
    assert.equal(invalid.validity.valid, false);
    assert.ok(invalid.validity.reasons.some((reason) => reason.includes("large-drops")));
    const impossibleGlory = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "liquid-cloud" }),
        effectiveRadiusMicrons: 180,
        effectiveVariance: 0.1,
        requestedFeatures: ["glory"],
        seed: 20,
    });
    assert.equal(impossibleGlory.validity.valid, false);
    assert.ok(impossibleGlory.validity.reasons.includes(
        "glory-requires-small-liquid-droplets"));
});

test("polydisperse corona replacement conserves its allocated spectral energy", () => {
    const corona = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "liquid-cloud", opticalDepth: 0.45 }),
        effectiveRadiusMicrons: 11,
        effectiveVariance: 0.09,
        requestedFeatures: ["corona"],
        seed: 29,
    });
    assert.equal(corona.validity.valid, true);
    const integrated = integrateAxisymmetric((theta) =>
        phenomena.evaluateDropletPhaseReplacement(
            corona,
            [0, 0, 1],
            [Math.sin(theta), 0, Math.cos(theta)],
            1,
        ), 80_000);
    integrated.forEach((energy, channel) => assert.ok(
        Math.abs(energy - corona.corona.energyRgb[channel]) < 3e-5,
        `corona channel ${channel} energy ${energy}`,
    ));
    const centre = phenomena.evaluateDropletPhaseReplacement(
        corona, [0, 0, 1], [0, 0, 1], 1);
    const away = phenomena.evaluateDropletPhaseReplacement(
        corona, [0, 0, 1], direction(0, 10), 1);
    assert.ok(luminance(centre) > luminance(away));
});

test("droplet ordered source conserves phase energy and applies source atmosphere once", () => {
    const rain = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ id: "finite-rain", kind: "rain-shaft", opticalDepth: 0.7 }),
        effectiveRadiusMicrons: 700,
        effectiveVariance: 0.07,
        requestedFeatures: ["primary-rainbow"],
        seed: 31,
    });
    const source = {
        id: "sun",
        kind: "sun",
        directionToSource: [0, 0, 1],
        radianceBeforeAtmosphereRgb: [10, 8, 6],
        atmosphereTransmittanceToSampleRgb: [0.8, 0.6, 0.4],
        sourceVisibilityRgb: [0.5, 0.75, 1],
    };
    const sample = {
        ownerId: rain.owner.id,
        positionEastAltitudeNorthKm: [0, 1.5, 0],
        ownerSampleWeight: 0.37,
        scatteringCoefficientRgbPerKm: [2, 1, 0.5],
        basePhaseRgbPerSteradian: [1 / (4 * Math.PI),
            1 / (4 * Math.PI), 1 / (4 * Math.PI)],
    };
    const integrated = integrateSphere((viewDirectionToCamera) =>
        phenomena.evaluateDropletOrderedScatteringSource(rain, {
            source, sample, viewDirectionToCamera,
        }).combinedPhaseRgbPerSteradian, 100_000);
    integrated.forEach((value) => assert.ok(Math.abs(value - 1) < 1e-4, value));

    const peak = phenomena.evaluateDropletOrderedScatteringSource(rain, {
        source,
        sample,
        viewDirectionToCamera: direction(0, 138.5),
    });
    assert.equal(peak.enabled, true);
    peak.incidentRadianceAtSampleRgb.forEach((value, channel) => assert.ok(
        Math.abs(value - [4, 3.6, 2.4][channel]) < 1e-12));
    peak.sourceCoefficientRgbPerKmPerSteradian.forEach((value, channel) =>
        assert.ok(Math.abs(value - sample.scatteringCoefficientRgbPerKm[channel] *
            peak.incidentRadianceAtSampleRgb[channel] *
            peak.combinedPhaseRgbPerSteradian[channel]) < 1e-12));
    assert.equal(peak.cameraPathTransmittanceApplied, false);
    assert.equal(peak.bloomApplied, false);

    const wrongOwner = phenomena.evaluateDropletOrderedScatteringSource(rain, {
        source,
        sample: { ...sample, ownerId: "another-rain-shaft" },
        viewDirectionToCamera: direction(0, 138.5),
    });
    assert.equal(wrongOwner.enabled, false);
    assert.equal(wrongOwner.inactiveReason, "owner-mismatch");
    assert.deepEqual(wrongOwner.sourceCoefficientRgbPerKmPerSteradian, [0, 0, 0]);
});

test("oriented crystals create source-relative rings, arcs, pillars and glints", () => {
    const source = direction(0, 10);
    const ice = phenomena.createOrientedIcePhenomenonState({
        owner: owner({ kind: "ice-cloud", bottomAltitudeKm: 7, topAltitudeKm: 10,
            opticalDepth: 0.62, temperatureKelvin: 228 }),
        sourceDirection: source,
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
    });
    assert.equal(ice.validity.valid, true, ice.validity.reasons.join(","));
    assert.equal(ice.features.length, 5);
    assert.ok(ice.features.every((feature) =>
        feature.normalizationRgb.every((value) => Number.isFinite(value) && value > 0)));
    assert.ok(ice.replacementEnergyRgb.every((value) => value > 0 && value < 0.28));

    const haloPeak = phenomena.evaluateOrientedIcePhaseReplacement(
        { ...ice, features: ice.features.filter(({ kind }) => kind === "halo-22") },
        direction(22.35, 10), 1);
    const haloAway = phenomena.evaluateOrientedIcePhaseReplacement(
        { ...ice, features: ice.features.filter(({ kind }) => kind === "halo-22") },
        direction(36, 10), 1);
    assert.ok(luminance(haloPeak) > luminance(haloAway) * 100);

    const sundogState = {
        ...ice,
        features: ice.features.filter(({ kind }) => kind === "sundogs"),
    };
    const sundog = phenomena.evaluateOrientedIcePhaseReplacement(
        sundogState, direction(22.4 / Math.cos(radians(10)), 10), 1);
    const displaced = phenomena.evaluateOrientedIcePhaseReplacement(
        sundogState, direction(22.4 / Math.cos(radians(10)), 17), 1);
    assert.ok(luminance(sundog) > luminance(displaced) * 10);

    const czaState = {
        ...ice,
        features: ice.features.filter(({ kind }) => kind === "circumzenithal-arc"),
    };
    const targetElevation = Math.asin(Math.sqrt(1.311 ** 2 -
        Math.cos(radians(10)) ** 2)) * 180 / Math.PI;
    const cza = phenomena.evaluateOrientedIcePhaseReplacement(
        czaState, direction(0, targetElevation), 1);
    const czaAway = phenomena.evaluateOrientedIcePhaseReplacement(
        czaState, direction(50, targetElevation), 1);
    assert.ok(luminance(cza) > luminance(czaAway) * 10);

    const invalidCza = phenomena.createOrientedIcePhenomenonState({
        owner: ice.owner,
        sourceDirection: direction(0, 45),
        plateFraction: 0.8,
        columnFraction: 0.1,
        randomOrientationFraction: 0.2,
        horizontalPlateFraction: 0.7,
        tiltStandardDeviationDegrees: 0.5,
        surfaceRoughness: 0.05,
        effectiveRadiusMicrons: 40,
        requestedFeatures: ["circumzenithal-arc"],
        seed: 42,
    });
    assert.equal(invalidCza.validity.valid, false);

    const impossiblePopulation = phenomena.createOrientedIcePhenomenonState({
        ...ice,
        owner: ice.owner,
        plateFraction: 0.8,
        columnFraction: 0.4,
        aggregateFraction: 0.2,
        randomOrientationFraction: 0.7,
        horizontalPlateFraction: 0.6,
        horizontalColumnFraction: 0.2,
        tiltStandardDeviationDegrees: 0.5,
        surfaceRoughness: 0.05,
        effectiveRadiusMicrons: 40,
        requestedFeatures: ["halo-22"],
        seed: 42,
    });
    assert.equal(impossiblePopulation.validity.valid, false);
    assert.ok(impossiblePopulation.validity.reasons.includes(
        "ice-habit-fractions-exceed-population"));
    assert.ok(impossiblePopulation.validity.reasons.includes(
        "ice-orientation-fractions-exceed-population"));

    const diamond = phenomena.createOrientedIcePhenomenonState({
        owner: owner({ kind: "diamond-dust-region", bottomAltitudeKm: 0,
            topAltitudeKm: 0.15, opticalDepth: 0.12, temperatureKelvin: 250 }),
        sourceDirection: direction(0, 6),
        plateFraction: 0.75,
        columnFraction: 0.2,
        randomOrientationFraction: 0.08,
        horizontalPlateFraction: 0.64,
        horizontalColumnFraction: 0.12,
        tiltStandardDeviationDegrees: 0.4,
        surfaceRoughness: 0.03,
        effectiveRadiusMicrons: 80,
        requestedFeatures: ["diamond-dust-glints"],
        seed: 43,
    });
    assert.equal(diamond.validity.valid, true);
    const glint = phenomena.evaluateOrientedIcePhaseReplacement(
        diamond, direction(180, 6), 1);
    const noGlint = phenomena.evaluateOrientedIcePhaseReplacement(
        diamond, direction(90, 25), 1);
    assert.ok(luminance(glint) > luminance(noGlint));
});

test("oriented-ice ordered source is normalized and rejects stale ephemeris state", () => {
    const sourceDirection = direction(12, 14);
    const ice = phenomena.createOrientedIcePhenomenonState({
        owner: owner({ id: "finite-cirrostratus", kind: "ice-cloud",
            bottomAltitudeKm: 7, topAltitudeKm: 11,
            opticalDepth: 0.7, temperatureKelvin: 226 }),
        sourceDirection,
        plateFraction: 0.65,
        columnFraction: 0.25,
        aggregateFraction: 0.1,
        randomOrientationFraction: 0.34,
        horizontalPlateFraction: 0.5,
        horizontalColumnFraction: 0.08,
        tiltStandardDeviationDegrees: 0.8,
        surfaceRoughness: 0.1,
        effectiveRadiusMicrons: 55,
        requestedFeatures: ["halo-22", "sundogs", "circumzenithal-arc"],
        seed: 47,
    });
    assert.equal(ice.validity.valid, true, ice.validity.reasons.join(","));
    const source = {
        id: "physical-sun",
        kind: "sun",
        directionToSource: sourceDirection,
        radianceBeforeAtmosphereRgb: [7, 6, 5],
        atmosphereTransmittanceToSampleRgb: [0.9, 0.8, 0.7],
        sourceVisibilityRgb: [1, 1, 1],
    };
    const sample = {
        ownerId: ice.owner.id,
        positionEastAltitudeNorthKm: [0, 9, 0],
        ownerSampleWeight: 0.62,
        scatteringCoefficientRgbPerKm: [0.8, 0.82, 0.85],
        basePhaseRgbPerSteradian: [1 / (4 * Math.PI),
            1 / (4 * Math.PI), 1 / (4 * Math.PI)],
    };
    const integrated = integrateSphere((viewDirectionToCamera) =>
        phenomena.evaluateOrientedIceOrderedScatteringSource(ice, {
            source, sample, viewDirectionToCamera,
        }).combinedPhaseRgbPerSteradian, 200_000);
    integrated.forEach((value) => assert.ok(Math.abs(value - 1) < 8e-4, value));

    const stale = phenomena.evaluateOrientedIceOrderedScatteringSource(ice, {
        source: { ...source, directionToSource: direction(12.2, 14) },
        sample,
        viewDirectionToCamera: direction(34, 14),
    });
    assert.equal(stale.enabled, false);
    assert.equal(stale.inactiveReason, "source-direction-mismatch");
    assert.equal(stale.bloomApplied, false);
});

const lightningInput = (topology = "cloud-to-ground") => ({
    id: `storm-${topology}`,
    owner: owner({ kind: "convective-cloud", bottomAltitudeKm: 0.8,
        topAltitudeKm: 13, opticalDepth: 45, temperatureKelvin: 235 }),
    topology,
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

test("lightning channels are deterministic finite trees with normalized pulse energy", () => {
    const first = phenomena.createLightningEventState(lightningInput());
    const second = phenomena.createLightningEventState(lightningInput());
    assert.deepEqual(first, second);
    assert.equal(first.validity.valid, true);
    assert.ok(first.channelSegments.length > 15);
    first.channelSegments.forEach((segment, index) => {
        assert.ok(segment.parentSegmentIndex < index);
        assert.ok(segment.radiusMetres > 0 && segment.radiusMetres < 0.12);
    });
    const energyPerMetre = lightningInput().radiantEnergyJoules /
        (first.totalChannelLengthKm * 1_000);
    assert.ok(energyPerMetre >= 0.5 && energyPerMetre <= 5_000);
    const lastMainGround = first.channelSegments.some((segment) =>
        Math.abs(segment.endEastAltitudeNorthKm[1]) < 1e-12);
    assert.ok(lastMainGround);

    for (const pulse of first.pulses) {
        assert.ok(pulse.riseSeconds >= 12e-6 && pulse.riseSeconds <= 70e-6);
        assert.ok(pulse.decaySeconds >= 70e-6 && pulse.decaySeconds <= 280e-6);
        assert.ok(pulse.durationSeconds <= 0.00224 + 1e-12);
        const steps = 40_000;
        let integratedEnergy = 0;
        let maximumCurrent = 0;
        for (let index = 0; index < steps; index += 1) {
            const time = pulse.startSeconds + pulse.durationSeconds *
                (index + 0.5) / steps;
            const sample = phenomena.evaluateLightningPulse(pulse, time);
            integratedEnergy += luminance(sample.emittedPowerRgb) *
                pulse.durationSeconds / steps;
            maximumCurrent = Math.max(maximumCurrent, sample.currentKiloamps);
        }
        assert.ok(Math.abs(integratedEnergy / pulse.radiantEnergyJoules - 1) < 2e-5);
        assert.ok(Math.abs(maximumCurrent / pulse.peakCurrentKiloamps - 1) < 3e-4);
    }
    const midpoint = first.channelSegments[0].startEastAltitudeNorthKm.map(
        (value, index) => (value + first.channelSegments[0].endEastAltitudeNorthKm[index]) * 0.5,
    );
    const near = phenomena.evaluateLightningChannelInjection(first, 0.0005, midpoint);
    const far = phenomena.evaluateLightningChannelInjection(first, 0.0005, [100, 100, 100]);
    assert.ok(luminance(near.emissivityRgbPerKm3) > 0);
    assert.equal(luminance(far.emissivityRgbPerKm3), 0);
    assert.equal(near.finiteSupport, true);
    assert.equal(near.cameraPathTransmittanceApplied, false);
    assert.equal(near.bloomApplied, false);

    const activeTime = first.pulses[0].startSeconds + first.pulses[0].riseSeconds;
    const cloudSource = phenomena.evaluateLightningCloudScatteringSource(
        first,
        activeTime,
        {
            eventId: first.id,
            ownerId: first.owner.id,
            positionEastAltitudeNorthKm: [0, 5.5, 0],
            ownerSampleWeight: 0.6,
            cloudScatteringCoefficientRgbPerKm: [2, 1, 0.5],
            unattenuatedPhaseConvolvedChannelRadianceRgb: [10, 8, 6],
            channelToSampleTransmittanceRgb: [0.8, 0.6, 0.4],
        },
    );
    assert.equal(cloudSource.enabled, true);
    cloudSource.phaseConvolvedIncidentRadianceRgb.forEach((value, channel) =>
        assert.ok(Math.abs(value - [8, 4.8, 2.4][channel]) < 1e-12));
    cloudSource.sourceCoefficientRgbPerKm.forEach((value, channel) =>
        assert.ok(Math.abs(value - [9.6, 2.88, 0.72][channel]) < 1e-12));
    assert.equal(cloudSource.duplicatesChannelEmission, false);
    assert.equal(cloudSource.bloomApplied, false);
    const wrongEvent = phenomena.evaluateLightningCloudScatteringSource(
        first,
        activeTime,
        {
            eventId: "another-event",
            ownerId: first.owner.id,
            positionEastAltitudeNorthKm: [0, 5.5, 0],
            ownerSampleWeight: 1,
            cloudScatteringCoefficientRgbPerKm: [1, 1, 1],
            unattenuatedPhaseConvolvedChannelRadianceRgb: [1, 1, 1],
            channelToSampleTransmittanceRgb: [1, 1, 1],
        },
    );
    assert.equal(wrongEvent.enabled, false);
    assert.equal(wrongEvent.inactiveReason, "event-mismatch");

    const invalid = phenomena.createLightningEventState({
        ...lightningInput("intra-cloud"),
        owner: owner({ kind: "liquid-cloud", bottomAltitudeKm: 1,
            topAltitudeKm: 2, opticalDepth: 3 }),
    });
    assert.equal(invalid.validity.valid, false);
});

const auroraInput = (solarAltitudeDegrees = -18) => ({
    owner: owner({ id: "auroral-oval", kind: "magnetospheric-sheet",
        bottomAltitudeKm: 80, topAltitudeKm: 500, opticalDepth: 0,
        temperatureKelvin: 800 }),
    centerEastNorthKm: [0, 0],
    orientationRadians: 0,
    lengthKm: 650,
    sheetWidthKm: 1.4,
    bottomAltitudeKm: 88,
    topAltitudeKm: 320,
    foldAmplitudeKm: 14,
    foldWavelengthKm: 58,
    driftEastNorthKmPerSecond: [0.005, 0.001],
    magneticFieldDirection: [0.28, -0.95, 0.12],
    geomagneticLatitudeDegrees: 67,
    kpIndex: 4,
    solarAltitudeDegrees,
    emissionScale: 0.75,
    seed: 101,
});

test("auroral curtains are field-aligned, altitude-spectral in-world emission", () => {
    const aurora = phenomena.createAuroralCurtainState(auroraInput());
    assert.equal(aurora.validity.valid, true, aurora.validity.reasons.join(","));
    const sampleCurtainCenter = (altitudeKm) => {
        const fieldScale = (altitudeKm - 113.8) /
            Math.max(0.08, Math.abs(aurora.magneticFieldDirection[1]));
        const fieldEast = aurora.magneticFieldDirection[0] * fieldScale;
        let position = [fieldEast, altitudeKm, 0];
        let strongest = phenomena.evaluateAuroralCurtainEmission(aurora, position, 0);
        for (let north = -40; north <= 40; north += 0.1) {
            const candidatePosition = [fieldEast, altitudeKm, north];
            const sample = phenomena.evaluateAuroralCurtainEmission(
                aurora, candidatePosition, 0);
            if (sample.sheetDensity > strongest.sheetDensity) {
                strongest = sample;
                position = candidatePosition;
            }
        }
        return { position, sample: strongest };
    };
    const greenCenter = sampleCurtainCenter(112);
    const redCenter = sampleCurtainCenter(225);
    const green = greenCenter.sample;
    const red = redCenter.sample;
    assert.ok(green.emissivityRgbPerKm[1] > green.emissivityRgbPerKm[0]);
    assert.ok(red.emissivityRgbPerKm[0] > red.emissivityRgbPerKm[1]);
    const outside = phenomena.evaluateAuroralCurtainEmission(aurora, [500, 112, 500], 0);
    assert.equal(outside.sheetDensity, 0);
    assert.ok(Math.max(...green.emissivityRgbPerKm) < 2e-8);

    const daylight = phenomena.createAuroralCurtainState(auroraInput(15));
    assert.equal(daylight.validity.valid, true,
        "daylight overwhelms aurora through shared transport/exposure; it does not stop emission");
    assert.deepEqual(
        phenomena.evaluateAuroralCurtainEmission(daylight, greenCenter.position, 0),
        green,
    );
    const invalidField = phenomena.createAuroralCurtainState({
        ...auroraInput(),
        magneticFieldDirection: [1, 0, 0],
    });
    assert.equal(invalidField.validity.valid, false);
    assert.ok(invalidField.validity.reasons.includes(
        "auroral-sheet-requires-field-with-vertical-component"));
});

test("auroral volume has finite support and normalized spectral column emission", () => {
    const aurora = phenomena.createAuroralCurtainState({
        ...auroraInput(),
        magneticFieldDirection: [0, -1, 0],
        foldAmplitudeKm: 0,
        sheetWidthKm: 1,
    });
    const samples = 24_000;
    const stepKm = (aurora.topAltitudeKm - aurora.bottomAltitudeKm) / samples;
    const integral = [0, 0, 0];
    for (let index = 0; index < samples; index += 1) {
        const altitude = aurora.bottomAltitudeKm + (index + 0.5) * stepKm;
        const value = phenomena.evaluateAuroralCurtainEmission(
            aurora, [0, altitude, 0], 0).emissivityRgbPerKm;
        for (let channel = 0; channel < 3; channel += 1) {
            integral[channel] += value[channel] * stepKm;
        }
    }
    const modulation = integral.map((value, channel) =>
        value / aurora.columnEmissionRgb[channel]);
    assert.ok(modulation.every((value) => value >= 0.6 && value <= 1.05));
    assert.ok(Math.max(...modulation) - Math.min(...modulation) < 2e-5,
        modulation.join(","));

    const outside = phenomena.evaluateAuroralCurtainEmission(
        aurora, [0, 112, 5], 0);
    assert.equal(outside.sheetDensity, 0);
    assert.deepEqual(outside.emissivityRgbPerKm, [0, 0, 0]);
    assert.equal(outside.finiteSupport, true);
    assert.equal(outside.bloomApplied, false);
    const ordered = phenomena.evaluateAuroralOrderedEmissionSource(
        aurora, [0, 112, 0], 0);
    assert.deepEqual(ordered.extinctionContributionRgbPerKm, [0, 0, 0]);
    assert.deepEqual(ordered.scatteringContributionRgbPerKm, [0, 0, 0]);
    assert.equal(ordered.cameraPathTransmittanceApplied, false);
    assert.equal(ordered.bloomApplied, false);
});

const blowingInput = (kind) => ({
    owner: owner({ id: kind, kind: "boundary-layer-region", bottomAltitudeKm: 0,
        topAltitudeKm: 0.5, opticalDepth: 2, temperatureKelvin: 265 }),
    kind,
    centerEastNorthKm: [0, 0],
    majorRadiusKm: 18,
    minorRadiusKm: 5,
    orientationRadians: 0.4,
    topAltitudeKm: 0.35,
    windSpeedMps: kind === "blowing-snow" ? 9 : kind === "blowing-dust" ? 13 : 11,
    windDirectionRadians: 0.4,
    frictionVelocityMps: 0.7,
    visibilityKm: 0.8,
    surfaceTemperatureKelvin: kind === "blowing-snow" ? 265 : 302,
    surfaceRelativeHumidity: kind === "blowing-snow" ? 0.8 : 0.25,
    snowCoverFraction: kind === "blowing-snow" ? 0.9 : 0,
    soilMoistureFraction: kind === "blowing-snow" ? 0.3 : 0.08,
    particleMedianDiameterMicrons: kind === "blowing-snow" ? 180
        : kind === "blowing-dust" ? 22 : 18,
    volcanicAshSource: kind === "volcanic-ash" ? "resuspended-deposit" : undefined,
    volcanicAshCoverFraction: kind === "volcanic-ash" ? 0.7 : undefined,
    volcanicAshOpticalClass: kind === "volcanic-ash"
        ? "moderately-absorbing" : undefined,
    seed: 131,
});

test("wind-raised snow, dust and ash remain finite boundary-layer media", () => {
    const snow = phenomena.createBlowingBoundaryLayerState(blowingInput("blowing-snow"));
    const dust = phenomena.createBlowingBoundaryLayerState(blowingInput("blowing-dust"));
    const ash = phenomena.createBlowingBoundaryLayerState(blowingInput("volcanic-ash"));
    assert.equal(snow.validity.valid, true);
    assert.equal(dust.validity.valid, true);
    assert.equal(ash.validity.valid, true);
    assert.ok(Math.max(...snow.extinctionRgbKm) / Math.min(...snow.extinctionRgbKm) < 1.04);
    assert.ok(dust.extinctionRgbKm[2] > dust.extinctionRgbKm[0]);
    assert.ok(dust.singleScatteringAlbedoRgb[0] > dust.singleScatteringAlbedoRgb[2]);
    assert.equal(ash.provenance, "resuspended-volcanic-deposit");
    assert.deepEqual(ash.particleDiameterRangeMicrons, [0.5, 500]);
    assert.equal(ash.particleDensityKgM3, 2300);
    assert.ok(ash.extinctionRgbKm[2] > ash.extinctionRgbKm[0]);
    assert.ok(ash.singleScatteringAlbedoRgb[0] > ash.singleScatteringAlbedoRgb[2]);
    const weakAsh = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("volcanic-ash"),
        volcanicAshOpticalClass: "weakly-absorbing",
    });
    const strongAsh = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("volcanic-ash"),
        volcanicAshOpticalClass: "strongly-absorbing",
    });
    assert.ok(weakAsh.singleScatteringAlbedoRgb.every((value, channel) =>
        value > strongAsh.singleScatteringAlbedoRgb[channel]));
    const snowCenter = phenomena.evaluateBlowingBoundaryLayer(snow, [0, 0.02, 0], 0);
    const snowOutside = phenomena.evaluateBlowingBoundaryLayer(snow, [200, 0.02, 200], 0);
    assert.ok(snowCenter.sourceWeight > 0);
    assert.equal(snowOutside.sourceWeight, 0);
    assert.ok(snowCenter.velocityEastAltitudeNorthMps[1] > 0);
    const ashCenter = phenomena.evaluateBlowingBoundaryLayer(ash, [0, 0.02, 0], 0);
    assert.ok(ashCenter.sourceWeight > 0);

    const orderedAsh = phenomena.evaluateBlowingBoundaryOrderedMedium(
        ash, [0, 0.02, 0], 0, [2.5, 1.5, 0.8]);
    assert.equal(orderedAsh.ownerId, ash.owner.id);
    assert.equal(orderedAsh.mediumKind, "volcanic-ash");
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(orderedAsh.scatteringPerKm[channel] <=
            orderedAsh.extinctionPerKm[channel]);
        assert.ok(Math.abs(orderedAsh.sourceCoefficientPerKm[channel] -
            orderedAsh.scatteringPerKm[channel] * [2.5, 1.5, 0.8][channel]) < 1e-12);
    }

    const invalidDust = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("blowing-dust"),
        soilMoistureFraction: 0.8,
        surfaceRelativeHumidity: 0.95,
    });
    assert.equal(invalidDust.validity.valid, false);
    const outsideOwner = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("blowing-snow"),
        topAltitudeKm: 0.8,
    });
    assert.equal(outsideOwner.validity.valid, false);
    assert.ok(outsideOwner.validity.reasons.includes(
        "blowing-medium-exceeds-boundary-layer-owner"));
    const invalidSupport = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("blowing-dust"),
        majorRadiusKm: 0,
    });
    assert.equal(invalidSupport.validity.valid, false);
    assert.ok(invalidSupport.validity.reasons.includes(
        "blowing-medium-horizontal-support-is-invalid"));

    const activePlume = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("volcanic-ash"),
        volcanicAshSource: "active-eruption-plume",
    });
    assert.equal(activePlume.validity.valid, false);
    assert.ok(activePlume.validity.reasons.includes(
        "volcanic-ash-boundary-medium-requires-resuspended-deposit"));
    const wetAsh = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("volcanic-ash"),
        soilMoistureFraction: 0.8,
    });
    assert.equal(wetAsh.validity.valid, false);
    assert.ok(wetAsh.validity.reasons.includes(
        "volcanic-ash-deposit-is-not-readily-remobilized"));
    const coarseAsh = phenomena.createBlowingBoundaryLayerState({
        ...blowingInput("volcanic-ash"),
        particleMedianDiameterMicrons: 900,
    });
    assert.equal(coarseAsh.validity.valid, false);
    assert.ok(coarseAsh.validity.reasons.includes(
        "volcanic-ash-particle-size-outside-resuspension-regime"));
});

test("CPU fixtures and binding-free WGSL evaluators retain formula parity", () => {
    const fixture = phenomena.WEATHER_PHENOMENA_PARITY_FIXTURES;
    const shaderHash = (value) => {
        const raw = Math.sin(value * 127.1) * 43_758.5453123;
        return ((raw % 1) + 1) % 1;
    };
    const gaussianMirror = (value, center, sigma) =>
        Math.exp(-0.5 * ((value - center) / Math.max(1e-6, sigma)) ** 2);
    const gaussianReference = Math.exp(-0.5 * (
        (fixture.angularGaussian.theta - fixture.angularGaussian.center) /
            fixture.angularGaussian.sigma
    ) ** 2);
    const gaussianWgslEquation = (theta, center, sigma) => {
        const coordinate = (theta - center) / Math.max(1e-7, sigma);
        return Math.exp(-0.5 * coordinate * coordinate);
    };
    assert.equal(gaussianReference, gaussianWgslEquation(
        fixture.angularGaussian.theta,
        fixture.angularGaussian.center,
        fixture.angularGaussian.sigma,
    ));
    const rawPulseWgslEquation = (elapsed, rise, decay) => {
        const ratio = elapsed / Math.max(1e-7, rise);
        return ratio ** 3 / (1 + ratio ** 3) *
            Math.exp(-elapsed / Math.max(rise, decay));
    };
    const parityPulse = {
        startSeconds: 0,
        durationSeconds: 1,
        riseSeconds: fixture.lightningPulse.rise,
        decaySeconds: fixture.lightningPulse.decay,
        peakCurrentKiloamps: 1,
        radiantEnergyJoules: 1,
        spectrumRgb: [1, 1, 1],
        temporalNormalization: 1,
        peakNormalization: 1,
    };
    assert.equal(
        phenomena.evaluateLightningPulse(
            parityPulse,
            fixture.lightningPulse.elapsed,
        ).normalizedTemporalProfilePerSecond,
        rawPulseWgslEquation(
            fixture.lightningPulse.elapsed,
            fixture.lightningPulse.rise,
            fixture.lightningPulse.decay,
        ),
    );

    const besselJ1Mirror = (input) => {
        const sign = input < 0 ? -1 : 1;
        const x = Math.abs(input);
        if (x < 10) {
            const half = x * 0.5;
            let term = half;
            let result = term;
            for (let order = 1; order < 18; order += 1) {
                term *= -(half * half) / (order * (order + 1));
                result += term;
            }
            return result * sign;
        }
        return sign * Math.sqrt(2 / (Math.PI * x)) *
            (Math.cos(x - Math.PI * 0.75) - 3 / (8 * x) *
                Math.sin(x - Math.PI * 0.75));
    };
    const coronaState = phenomena.createDropletOpticalPhenomenonState({
        owner: owner({ kind: "liquid-cloud", opticalDepth: 0.4 }),
        effectiveRadiusMicrons: fixture.corona.radius,
        effectiveVariance: fixture.corona.variance,
        requestedFeatures: ["corona"],
        seed: 902,
    });
    const coronaView = [Math.sin(fixture.corona.theta), 0,
        Math.cos(fixture.corona.theta)];
    const coronaSample = phenomena.evaluateDropletPhaseReplacement(
        coronaState, [0, 0, 1], coronaView, 1);
    const coronaX = 2 * Math.PI * 2 * fixture.corona.radius /
        fixture.corona.wavelength * Math.sin(fixture.corona.theta * 0.5);
    const coronaAiry = (2 * besselJ1Mirror(coronaX) / coronaX) ** 2;
    const coronaRawMirror = coronaAiry * Math.exp(
        -fixture.corona.variance * coronaX * 0.16);
    const coronaChannel = 1;
    const coronaRawCpu = coronaSample[coronaChannel] *
        coronaState.corona.normalizationRgb[coronaChannel] /
        coronaState.corona.energyRgb[coronaChannel];
    assert.ok(Math.abs(coronaRawCpu - coronaRawMirror) < 1e-14);

    const parityAurora = phenomena.createAuroralCurtainState({
        ...auroraInput(),
        foldAmplitudeKm: 0,
        magneticFieldDirection: [0, -1, 0],
        seed: fixture.shaderSeed,
    });
    const auroraSample = phenomena.evaluateAuroralCurtainEmission(
        parityAurora, [0, fixture.auroraAltitudeKm, 0], 0);
    const packedSeed = phenomena.weatherPhenomenonShaderSeed(fixture.shaderSeed);
    const precipitation = 0.84 + 0.16 * Math.sin(
        shaderHash(packedSeed * 8_192 + 77) * Math.PI * 2);
    const auroraScale = Math.min(1.05, Math.max(0.6, precipitation));
    const altitude = fixture.auroraAltitudeKm;
    const auroraSpectrumMirror = [
        gaussianMirror(altitude, 225, 48) * 0.34 +
            gaussianMirror(altitude, 155, 28) * 0.08,
        gaussianMirror(altitude, 113.8, 17),
        gaussianMirror(altitude, 113.5, 14) * 0.36 +
            gaussianMirror(altitude, 136, 20) * 0.08,
    ];
    auroraSample.emissivityRgbPerKm.forEach((value, channel) => assert.ok(
        Math.abs(value - parityAurora.columnEmissionRgb[channel] *
            auroraSpectrumMirror[channel] /
            parityAurora.altitudeProfileNormalizationRgb[channel] *
            auroraScale) < 1e-22,
    ));

    const parityBoundary = phenomena.createBlowingBoundaryLayerState(
        blowingInput("blowing-snow"));
    const boundaryAltitude = 0.02;
    const boundarySample = phenomena.evaluateBlowingBoundaryLayer(
        parityBoundary, [0, boundaryAltitude, 0], 0);
    const normalizedAltitude = boundaryAltitude / parityBoundary.topAltitudeKm;
    const vertical = Math.exp(-normalizedAltitude / 0.16) *
        (1 - (normalizedAltitude <= 0.76 ? 0 : normalizedAltitude >= 1 ? 1 : (() => {
            const t = (normalizedAltitude - 0.76) / 0.24;
            return t * t * (3 - 2 * t);
        })()));
    const boundaryStreak = 0.78 + 0.22 * Math.sin(
        shaderHash(phenomena.weatherPhenomenonShaderSeed(parityBoundary.seed) *
            4_096 + 19) * Math.PI * 2);
    assert.ok(Math.abs(boundarySample.sourceWeight -
        Math.min(1, Math.max(0, vertical * boundaryStreak))) < 1e-14);

    for (const functionName of [
        "weather_spectral_angular_lobe",
        "weather_corona_phase",
        "weather_ordered_phase_replacement_source",
        "weather_droplet_ordered_source",
        "weather_oriented_ice_phase_replacement",
        "weather_oriented_ice_ordered_source",
        "weather_lightning_pulse",
        "weather_lightning_segment_injection",
        "weather_lightning_cloud_scattering_source",
        "weather_aurora_curtain_emission",
        "weather_aurora_ordered_emission_source",
        "weather_blowing_boundary_sample",
        "weather_blowing_passive_source_coefficient",
    ]) assert.ok(wgsl.includes(`fn ${functionName}`), functionName);
    assert.match(wgsl, /2 resuspended volcanic ash/);
    assert.ok(!/tone[_-]?map/i.test(wgsl));
    assert.ok(!/adaptation/i.test(wgsl));
    assert.ok(!/screen.?space/i.test(wgsl));
    assert.ok(!/alpha.?blend/i.test(wgsl));
    for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
        assert.equal(
            [...wgsl].filter((character) => character === open).length,
            [...wgsl].filter((character) => character === close).length,
            `unbalanced WGSL ${open}${close}`,
        );
    }
});

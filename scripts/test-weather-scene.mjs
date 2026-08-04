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
    "../components/backgrounds/sky/weather-scene.ts",
);
const abi = compileCommonJs(
    "../components/backgrounds/sky/weather-scene-abi.ts",
);

const finiteOwner = (overrides = {}) => ({
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

const dropletInput = () => ({
    owner: finiteOwner({ id: "rain", kind: "rain-shaft", opticalDepth: 0.55 }),
    effectiveRadiusMicrons: 620,
    effectiveVariance: 0.08,
    seed: 17,
});

const iceInput = () => ({
    owner: finiteOwner({ id: "ice", kind: "ice-cloud",
        bottomAltitudeKm: 7, topAltitudeKm: 10, opticalDepth: 0.62,
        temperatureKelvin: 228 }),
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
});

const lightningInput = () => ({
    id: "storm-flash",
    owner: finiteOwner({ id: "storm", kind: "convective-cloud",
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

const auroraInput = () => ({
    owner: finiteOwner({ id: "auroral-oval", kind: "magnetospheric-sheet",
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
    solarAltitudeDegrees: -18,
    emissionScale: 0.75,
    seed: 101,
});

const blowingInput = (kind = "volcanic-ash") => ({
    owner: finiteOwner({ id: kind, kind: "boundary-layer-region",
        bottomAltitudeKm: 0, topAltitudeKm: 0.5, opticalDepth: 2,
        temperatureKelvin: 265 }),
    kind,
    centerEastNorthKm: [3, -2],
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
    particleMedianDiameterMicrons: kind === "blowing-snow" ? 180 :
        kind === "blowing-dust" ? 22 : 18,
    volcanicAshSource: kind === "volcanic-ash" ? "resuspended-deposit" : undefined,
    volcanicAshCoverFraction: kind === "volcanic-ash" ? 0.7 : undefined,
    volcanicAshOpticalClass: kind === "volcanic-ash" ?
        "moderately-absorbing" : undefined,
    seed: 131,
});

const fullAuthoring = () => ({
    schema: 1,
    clock: {
        snapshotTimeSeconds: 10_000,
        sceneTimeSeconds: 37.5,
        deterministicSeed: 0xfedc_ba98,
    },
    dropletOpticalOwners: [{ ownerIndex: 7, input: dropletInput() }],
    orientedIceOpticalOwners: [{ ownerIndex: 11, input: iceInput() }],
    lightning: {
        kind: "direct",
        ownerIndex: 19,
        eventStartSceneTimeSeconds: 37.25,
        input: lightningInput(),
    },
    auroraCurtains: [auroraInput()],
    blowingBoundaryMedia: [blowingInput("blowing-snow"),
        blowingInput("blowing-dust"), blowingInput("volcanic-ash")],
});

const allZero = (data, startFloat, endFloat) => {
    for (let index = startFloat; index < endFloat; index += 1) {
        if (data[index] !== 0) return false;
    }
    return true;
};

test("weather-scene ABI is fixed, vec4-aligned, 256-byte padded, and below 64 KiB", () => {
    assert.equal(abi.WEATHER_SCENE_HEADER_VEC4S, 16);
    assert.equal(abi.WEATHER_SCENE_DROPLET_RECORD_VEC4S, 32);
    assert.equal(abi.WEATHER_SCENE_ICE_RECORD_VEC4S, 32);
    assert.deepEqual(abi.WEATHER_SCENE_VEC4_OFFSETS, {
        header: 0,
        dropletOwners: 16,
        iceOwners: 1168,
        lightningEvent: 2320,
        lightningSegments: 2328,
        lightningPulses: 2712,
        auroraCurtains: 2724,
        blowingMedia: 2764,
        end: 2832,
    });
    assert.equal(abi.WEATHER_SCENE_UNIFORM_VEC4S, 2832);
    assert.equal(abi.WEATHER_SCENE_UNIFORM_BYTES, 45_312);
    assert.equal(abi.WEATHER_SCENE_UNIFORM_BYTES % 256, 0);
    assert.ok(abi.WEATHER_SCENE_UNIFORM_BYTES <=
        abi.WEATHER_SCENE_BASELINE_UNIFORM_LIMIT_BYTES);
    for (const offset of Object.values(abi.WEATHER_SCENE_BYTE_OFFSETS)) {
        assert.equal(offset % 16, 0);
    }
});

test("all physical families resolve and pack deterministically", () => {
    const firstScene = sceneModule.resolveProductionWeatherScene(fullAuthoring());
    const secondScene = sceneModule.resolveProductionWeatherScene(fullAuthoring());
    assert.equal(firstScene.valid, true, JSON.stringify(firstScene.diagnostics));
    assert.deepEqual(firstScene, secondScene);
    assert.equal(firstScene.dropletOpticalOwners[0].ownerIndex, 7);
    assert.equal(firstScene.orientedIceOpticalOwners[0].ownerIndex, 11);
    assert.equal(firstScene.lightning.ownerIndex, 19);
    assert.ok(firstScene.lightning.state.channelSegments.length <= 128);
    assert.ok(firstScene.lightning.state.pulses.length <= 4);
    assert.equal(firstScene.auroraCurtains.length, 1);
    assert.deepEqual(firstScene.blowingBoundaryMedia.map(({ kind }) => kind),
        ["blowing-snow", "blowing-dust", "volcanic-ash"]);

    const first = abi.packResolvedProductionWeatherScene(firstScene);
    const second = abi.packResolvedProductionWeatherScene(secondScene);
    assert.equal(first.data.byteLength, abi.WEATHER_SCENE_UNIFORM_BYTES);
    assert.deepEqual(first.counts, second.counts);
    assert.deepEqual(first.data, second.data);
    assert.ok(first.data.every(Number.isFinite));
    assert.deepEqual([...first.data.slice(0, 4)], [
        1, abi.WEATHER_SCENE_UNIFORM_VEC4S,
        abi.WEATHER_SCENE_UNIFORM_BYTES, 1,
    ]);
    assert.deepEqual([...first.data.slice(6, 8)], [0xba98, 0xfedc]);
});

test("unused records, unused feature slots, and tail padding are zero-filled", () => {
    const scene = sceneModule.resolveProductionWeatherScene(fullAuthoring());
    const { data } = abi.packResolvedProductionWeatherScene(scene);
    const floatsPerVec4 = 4;
    const dropletSecond = (abi.WEATHER_SCENE_VEC4_OFFSETS.dropletOwners +
        abi.WEATHER_SCENE_DROPLET_RECORD_VEC4S) * floatsPerVec4;
    const dropletEnd = abi.WEATHER_SCENE_VEC4_OFFSETS.iceOwners * floatsPerVec4;
    assert.ok(allZero(data, dropletSecond, dropletEnd));
    const iceSecond = (abi.WEATHER_SCENE_VEC4_OFFSETS.iceOwners +
        abi.WEATHER_SCENE_ICE_RECORD_VEC4S) * floatsPerVec4;
    const iceEnd = abi.WEATHER_SCENE_VEC4_OFFSETS.lightningEvent * floatsPerVec4;
    assert.ok(allZero(data, iceSecond, iceEnd));
    const auroraSecond = (abi.WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains +
        abi.WEATHER_SCENE_AURORA_RECORD_VEC4S) * floatsPerVec4;
    const auroraEnd = abi.WEATHER_SCENE_VEC4_OFFSETS.blowingMedia * floatsPerVec4;
    assert.ok(allZero(data, auroraSecond, auroraEnd));
    const blowingFourth = (abi.WEATHER_SCENE_VEC4_OFFSETS.blowingMedia +
        3 * abi.WEATHER_SCENE_BLOWING_RECORD_VEC4S) * floatsPerVec4;
    const unpaddedEnd = (abi.WEATHER_SCENE_VEC4_OFFSETS.blowingMedia +
        sceneModule.WEATHER_SCENE_MAX_BLOWING_MEDIA *
            abi.WEATHER_SCENE_BLOWING_RECORD_VEC4S) * floatsPerVec4;
    assert.ok(allZero(data, blowingFourth, unpaddedEnd));
    assert.ok(allZero(data, unpaddedEnd, data.length));
    // Rain has two lobes; all four future lobe slots remain clear.
    const dropletUnusedLobes = (abi.WEATHER_SCENE_VEC4_OFFSETS.dropletOwners +
        8 + 2 * 4) * floatsPerVec4;
    const dropletRecordEnd = (abi.WEATHER_SCENE_VEC4_OFFSETS.dropletOwners +
        abi.WEATHER_SCENE_DROPLET_RECORD_VEC4S) * floatsPerVec4;
    assert.ok(allZero(data, dropletUnusedLobes, dropletRecordEnd));
});

test("invalid and impossible states are rejected before packing", () => {
    const activeEruption = fullAuthoring();
    activeEruption.blowingBoundaryMedia = [{
        ...blowingInput("volcanic-ash"),
        volcanicAshSource: "active-eruption-plume",
    }];
    const scene = sceneModule.resolveProductionWeatherScene(activeEruption);
    assert.equal(scene.valid, false);
    assert.equal(scene.blowingBoundaryMedia.length, 0);
    assert.ok(scene.diagnostics.some(({ reasons }) => reasons.includes(
        "volcanic-ash-boundary-medium-requires-resuspended-deposit")));
    assert.throws(() => abi.packResolvedProductionWeatherScene(scene),
        /weather-scene-is-invalid/);

    const nonFinite = sceneModule.resolveProductionWeatherScene({
        clock: fullAuthoring().clock,
        auroraCurtains: [{ ...auroraInput(), centerEastNorthKm: [NaN, 0] }],
    });
    assert.equal(nonFinite.valid, false);
    assert.equal(nonFinite.auroraCurtains.length, 0);
    assert.ok(nonFinite.diagnostics.some(({ reasons }) => reasons.some(
        (reason) => reason.includes("non-finite-number"))));
});

test("capacity overflow and duplicate authoritative owners are explicit failures", () => {
    const overflow = sceneModule.resolveProductionWeatherScene({
        clock: fullAuthoring().clock,
        blowingBoundaryMedia: Array.from({ length: 9 }, (_, index) => ({
            ...blowingInput("blowing-dust"),
            centerEastNorthKm: [index * 20, 0],
            seed: index,
        })),
    });
    assert.equal(overflow.valid, false);
    assert.equal(overflow.blowingBoundaryMedia.length, 8);
    assert.ok(overflow.diagnostics.some(({ code }) =>
        code === "scene-capacity-exceeded"));

    const duplicate = sceneModule.resolveProductionWeatherScene({
        clock: fullAuthoring().clock,
        dropletOpticalOwners: [
            { ownerIndex: 3, input: dropletInput() },
            { ownerIndex: 3, input: dropletInput() },
        ],
    });
    assert.equal(duplicate.valid, false);
    assert.equal(duplicate.dropletOpticalOwners.length, 1);
    assert.ok(duplicate.diagnostics.some(({ reasons }) => reasons.includes(
        "duplicate-droplet-owner-index")));
});

test("deep-convection lightning authoring uses the existing electrical bridge", () => {
    const source = {
        parentSystemId: "qualified-storm",
        active: true,
        intensity01: 0.9,
        lifecycleStage: "mature",
        organization: "supercell",
        sourceRegion: "mixed-phase-core",
        reservoirs: [{
            polarity: "negative", carrier: "graupel",
            ownerRegion: "mixed-phase-core", centerEastKm: 0,
            centerNorthKm: 0, altitudeRangeKm: [4.8, 6.2],
            majorRadiusKm: 2.4, minorRadiusKm: 2,
            relativeCharge01: 0.9,
        }, {
            polarity: "positive", carrier: "small-ice",
            ownerRegion: "upper-charge-reservoir", centerEastKm: 0.8,
            centerNorthKm: 0.3, altitudeRangeKm: [9.4, 11.2],
            majorRadiusKm: 2, minorRadiusKm: 1.6,
            relativeCharge01: 0.8,
        }],
        dischargeCandidates: [{
            id: "negative-to-ground", kind: "cloud-to-ground",
            fromReservoirIndex: 0, toReservoirIndex: null,
            controlPointsEastAltitudeNorthKm: [[0, 5.5, 0],
                [0.4, 2.7, 0.2], [0.8, 0, 0.3]],
            relativeProbability01: 0.5,
            maximumChannelRadiusMetres: 0.07,
        }],
        stormOwnerBounds: {
            centerEastKm: 0, centerNorthKm: 0, bottomAltitudeKm: 0,
            topAltitudeKm: 13, majorRadiusKm: 18, minorRadiusKm: 10,
            orientationRadians: 0,
        },
        illuminationEnvelope: null,
    };
    const scene = sceneModule.resolveProductionWeatherScene({
        clock: fullAuthoring().clock,
        lightning: {
            kind: "deep-convection",
            ownerIndex: 27,
            eventStartSceneTimeSeconds: 36,
            source,
            contract: {
                eventId: "qualified-storm-flash",
                candidateId: "negative-to-ground",
                peakCurrentKiloamps: 42,
                radiantEnergyJoules: 2.5e6,
                ownerOpticalDepth: 48,
                ownerTemperatureKelvin: 248,
                seed: 811,
            },
        },
    });
    assert.equal(scene.valid, true, JSON.stringify(scene.diagnostics));
    assert.equal(scene.lightning.ownerIndex, 27);
    assert.equal(scene.lightning.state.owner.id, "qualified-storm");
    assert.equal(scene.lightning.state.topology, "cloud-to-ground");
});

test("scene clocks advance monotonically from an immutable deterministic snapshot", () => {
    const scene = sceneModule.resolveProductionWeatherScene({
        clock: fullAuthoring().clock,
    });
    assert.equal(sceneModule.weatherSceneTimeSeconds(scene, 10_004.25), 41.75);
    assert.equal(sceneModule.weatherSceneTimeSeconds(scene, 9_999), 37.5);
    assert.equal(sceneModule.weatherSceneTimeSeconds(scene, NaN), 37.5);
    const invalid = sceneModule.resolveProductionWeatherScene({
        clock: { snapshotTimeSeconds: -1, sceneTimeSeconds: NaN,
            deterministicSeed: 2 ** 40 },
    });
    assert.equal(invalid.valid, false);
    assert.deepEqual(invalid.clock, {
        snapshotTimeSeconds: 0,
        sceneTimeSeconds: 0,
        deterministicSeed: 0,
        shaderSeed: invalid.clock.shaderSeed,
    });
});

test("WGSL twin is fixed-size, binding-free, and only declares a uniform on request", () => {
    assert.match(abi.WEATHER_SCENE_UNIFORM_WGSL,
        /data: array<vec4<f32>, 2832>/);
    assert.doesNotMatch(abi.WEATHER_SCENE_UNIFORM_WGSL, /arrayLength|var<storage>/);
    assert.doesNotMatch(abi.WEATHER_SCENE_UNIFORM_WGSL, /@group|@binding/);
    const declaration = abi.createWeatherSceneUniformDeclaration(2.9, 36.8,
        "production_weather");
    assert.match(declaration, /@group\(2\) @binding\(36\)/);
    assert.match(declaration, /var<uniform> production_weather/);
});

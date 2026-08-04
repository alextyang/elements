import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-hydrometeors-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const source = readFileSync(new URL(
    "../components/backgrounds/sky/hydrometeor-system.ts",
    import.meta.url,
), "utf8");
const hydrometeorWgslSource = readFileSync(new URL(
    "../components/backgrounds/sky/hydrometeor-wgsl.ts",
    import.meta.url,
), "utf8");
const deepConvectionSource = readFileSync(new URL(
    "../components/backgrounds/sky/deep-convection-physical-foundation.ts",
    import.meta.url,
), "utf8");
writeFileSync(join(temporaryRoot, "deep-convection-physical-foundation.mjs"),
    ts.transpileModule(deepConvectionSource, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText);
const transpiledHydrometeors = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText.replace(
    /from "\.\/deep-convection-physical-foundation";/g,
    'from "./deep-convection-physical-foundation.mjs";',
);
writeFileSync(join(temporaryRoot, "hydrometeor-system.mjs"), transpiledHydrometeors);
const hydrometeors = await import(
    new URL(`file://${join(temporaryRoot, "hydrometeor-system.mjs")}`)
);

const stateFor = ({
    id = "test-system",
    genus = "nimbostratus",
    baseAltitudeKm = 2.1,
    coverageOktas = 6,
    organization = "frontal-shield",
    species = null,
    supplementaryFeatures = [],
} = {}) => ({
    id,
    classification: {
        genus,
        species,
        varieties: [],
        supplementaryFeatures,
        accessoryClouds: [],
        origin: { kind: "natural" },
    },
    physical: {
        baseAltitudeKm,
        geometricDepthKm: genus === "cumulonimbus" ? 9 : 1.5,
        coverageOktas,
    },
    extent: {
        centerEastKm: 18,
        centerNorthKm: 31,
        majorRadiusKm: genus === "cumulonimbus" ? 16 : 34,
        minorRadiusKm: genus === "cumulonimbus" ? 11 : 19,
        orientation: 0.67,
        boundaryTransitionKm: 2,
    },
    organization: organization === "storm-complex" ? {
        kind: "storm-complex",
        inflowRadiusKm: 8,
        updraftRadiusKm: 3,
        outflowRadiusKm: 17,
        propagationDirection: 0.8,
    } : {
        kind: "frontal-shield",
        alongFrontLengthKm: 100,
        crossFrontDepthKm: 30,
        leadingTransitionKm: 4,
        trailingTransitionKm: 6,
        orientation: 0.67,
    },
});

const sourceFor = ({
    id = "test-system",
    precipitationKind = "rain",
    rate = 12,
    evaporationDepthKm = 0,
    genus = "nimbostratus",
    baseAltitudeKm = 2.1,
    coverageOktas = 6,
    liquidFraction = 0.85,
    topTemperatureKelvin = 258,
    organization = "frontal-shield",
    species = null,
    supplementaryFeatures = [],
    lifecycleStage = "precipitating",
    stageProgress = 0.62,
    verticalVelocity = genus === "cumulonimbus" ? 24 : 0.4,
    verticalShear = 4,
    precipitationEfficiency = 0.72,
} = {}) => {
    const state = stateFor({
        id,
        genus,
        baseAltitudeKm,
        coverageOktas,
        organization,
        species,
        supplementaryFeatures,
    });
    return {
        layerIndex: 0,
        systemIndex: 0,
        seeds: [0.17, 0.82, 0.41, 0.66],
        state,
        compiled: {
            sourceId: id,
            classification: state.classification,
            recipeId: genus === "cumulonimbus" ? "cumulonimbus-capillatus"
                : genus === "stratus" ? "stratus-nebulosus"
                    : "nimbostratus-praecipitatio",
            macroTopology: genus === "cumulonimbus" ? "deep-storm-complex"
                : genus === "stratus" ? "boundary-layer-sheet" : "precipitating-sheet",
            materialModel: "mixed-phase-sheet",
            organizationKind: state.organization.kind,
            organizationOperators: [],
            densityOperators: [],
            geometry: {
                baseAltitudeKm,
                geometricDepthKm: state.physical.geometricDepthKm,
                elementScaleKm: 25,
                verticalAspect: 0.08,
                supportBandFraction: 0.18,
                extent: state.extent,
            },
            material: {
                liquidWaterPathKgM2: 0.5,
                iceWaterPathKgM2: 0.15,
                liquidFraction01: liquidFraction,
                extinctionKm: 25,
                singleScatteringAlbedo: 0.999,
                asymmetryParameter: 0.84,
                liquidEffectiveRadiusMicrons: 13,
                iceEffectiveRadiusMicrons: 42,
            },
            thermodynamics: {
                baseTemperatureKelvin: 276,
                topTemperatureKelvin,
                relativeHumidity: 0.98,
                environmentalLapseRate: 5.8,
                stabilityIndex: 0.2,
                verticalVelocity,
                entrainment: 0.12,
            },
            kinematics: {
                windSpeed: 13,
                windDirection: 0.67,
                verticalShear,
                turbulenceIntegralScaleKm: 0.4,
                turbulenceDissipation: 0.018,
            },
            formation: {
                liftingCondensationLevelKm: baseAltitudeKm,
                levelOfFreeConvectionKm: genus === "cumulonimbus" ? baseAltitudeKm : null,
                equilibriumLevelKm: genus === "cumulonimbus" ? 11 : null,
                inversionBaseKm: null,
                inversionStrengthKelvin: 0,
                freezingLevelKm: 1.25,
                shearLayerBaseKm: baseAltitudeKm,
                shearLayerTopKm: baseAltitudeKm + state.physical.geometricDepthKm,
            },
            lifecycle: {
                stage: lifecycleStage,
                stageProgress,
                ageSeconds: 3200,
                cloudTopRiseRate: 0,
                condensateTendency: -0.02,
                glaciationRate: 0.002,
                precipitationEfficiency,
                outflowSpeed: genus === "cumulonimbus" ? 18 : 0,
            },
            precipitation: {
                kind: precipitationKind,
                rate,
                terminalVelocity: precipitationKind === "snow" ? 1.1 : 6.5,
                evaporationDepthKm,
            },
            features: {
                varieties: [],
                supplementary: [
                    ...supplementaryFeatures,
                    precipitationKind === "virga" ? "virga" : "praecipitatio",
                ],
                accessories: [],
                hasIncus: supplementaryFeatures.includes("incus"),
                hasVirga: precipitationKind === "virga",
                hasSurfacePrecipitation: precipitationKind !== "virga" &&
                    precipitationKind !== "none",
            },
        },
    };
};

const environment = {
    surfaceAltitudeKm: 0,
    surfaceTemperatureKelvin: 288,
    surfaceRelativeHumidity: 0.72,
    surfacePressureHpa: 1005,
    surfaceWindSpeed: 3,
    surfaceWindDirection: 0.2,
    fogAmount: 0,
};

const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const rotateEastNorth = ([east, north], yaw) => {
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    return [cosine * east + sine * north,
        -sine * east + cosine * north];
};
const embedEastAngle = (angle, yaw) => normalizeAngle(angle - yaw);

/** Apply the same rigid camera-world embedding used by cloud-world-frame.ts. */
const embedSourceInCameraWorld = (source, yaw) => {
    const embedded = structuredClone(source);
    const embedExtent = (extent) => {
        const center = rotateEastNorth([
            extent.centerEastKm,
            extent.centerNorthKm,
        ], yaw);
        extent.centerEastKm = center[0];
        extent.centerNorthKm = center[1];
        extent.orientation = embedEastAngle(extent.orientation, yaw);
    };
    embedExtent(embedded.state.extent);
    if (embedded.compiled.geometry?.extent &&
        embedded.compiled.geometry.extent !== embedded.state.extent) {
        embedExtent(embedded.compiled.geometry.extent);
    }
    if (embedded.state.physical?.kinematics) {
        embedded.state.physical.kinematics.windDirection = embedEastAngle(
            embedded.state.physical.kinematics.windDirection, yaw);
    }
    if (embedded.compiled.kinematics) {
        embedded.compiled.kinematics.windDirection = embedEastAngle(
            embedded.compiled.kinematics.windDirection, yaw);
    }
    const organization = embedded.state.organization;
    if (organization.kind === "storm-complex") {
        organization.propagationDirection = embedEastAngle(
            organization.propagationDirection, yaw);
    } else if ("orientation" in organization) {
        organization.orientation = embedEastAngle(organization.orientation, yaw);
    }
    return embedded;
};

const passiveTransfer = (transmittance = [1, 1, 1], scattered = [0, 0, 0]) =>
    hydrometeors.createHydrometeorPassiveRgbTransfer(transmittance, scattered);

const parentCouplingFor = (field, {
    sun = passiveTransfer(),
    moon = passiveTransfer(),
    diffuseSky = passiveTransfer(),
    ground = passiveTransfer(),
    phaseConvolvedScatteringRadianceRgb = [0, 0, 0],
} = {}) => ({
    parentSystemId: field.parentSystemId,
    parentSystemIndex: field.parentSystemIndex,
    parentLayerIndex: field.parentLayerIndex,
    ownerKind: field.ownerKind,
    sun,
    moon,
    diffuseSky,
    ground,
    phaseConvolvedScatteringRadianceRgb,
});

const eventAngles = {
    sunCosine: 0.37,
    moonCosine: -0.42,
    glintConcentration: 850,
    upperHemispherePhaseIntegral: 0.5,
    lowerHemispherePhaseIntegral: 0.5,
};

test("CPU and WGSL hydrometeors use the cloud east-angle basis", () => {
    assert.match(source, /const windVector[\s\S]*east:\s*Math\.cos\(direction\)\s*\* speed,[\s\S]*north:\s*Math\.sin\(direction\)\s*\* speed/);
    assert.match(source, /const cloudEastAngleBasis[\s\S]*alongEast:\s*Math\.cos\(angle\),[\s\S]*alongNorth:\s*Math\.sin\(angle\),[\s\S]*crossEast:\s*-Math\.sin\(angle\),[\s\S]*crossNorth:\s*Math\.cos\(angle\)/);
    assert.match(hydrometeorWgslSource, /orientation_sine\s*=\s*sin\(record\.source_geometry\.x\)/);
    assert.match(hydrometeorWgslSource, /vec2<f32>\(orientation_cosine, orientation_sine\)/);
    assert.match(hydrometeorWgslSource, /vec2<f32>\(-orientation_sine, orientation_cosine\)/);

    const sourceWithEastWind = sourceFor({
        id: "east-angle-wind",
        precipitationKind: "rain",
        rate: 12,
    });
    sourceWithEastWind.compiled.kinematics.windSpeed = 10;
    sourceWithEastWind.compiled.kinematics.windDirection = 0;
    const field = hydrometeors.createHydrometeorRuntime([
        sourceWithEastWind,
    ], {
        ...environment,
        surfaceWindSpeed: 0,
        surfaceWindDirection: 0,
    }).fields[0];
    assert.ok(field.motion.windEastMps > 7,
        "zero east-angle wind must advect toward +east");
    assert.ok(Math.abs(field.motion.windNorthMps) < 1e-9,
        "zero east-angle wind must have no north component");
});

test("one precipitating parent remains rigid under camera-yaw embedding", () => {
    const yaw = 0.73;
    const baseSource = sourceFor({
        id: "yaw-rain-parent",
        precipitationKind: "rain",
        rate: 16,
        genus: "nimbostratus",
        organization: "frontal-shield",
    });
    const baseEnvironment = {
        ...environment,
        surfaceWindDirection: 0.31,
    };
    const embeddedSource = embedSourceInCameraWorld(baseSource, yaw);
    const embeddedEnvironment = {
        ...baseEnvironment,
        surfaceWindDirection: embedEastAngle(
            baseEnvironment.surfaceWindDirection, yaw),
    };
    const baseRuntime = hydrometeors.createHydrometeorRuntime(
        [baseSource], baseEnvironment,
    );
    const embeddedRuntime = hydrometeors.createHydrometeorRuntime(
        [embeddedSource], embeddedEnvironment,
    );
    assert.equal(embeddedRuntime.fields.length, baseRuntime.fields.length);
    const close = (actual, expected, message, tolerance = 1e-9) =>
        assert.ok(Math.abs(actual - expected) <= tolerance,
            `${message}: expected ${expected}, received ${actual}`);
    const closeArray = (actual, expected, message, tolerance = 1e-9) =>
        actual.forEach((value, index) => close(
            value, expected[index], `${message}[${index}]`, tolerance));
    for (let index = 0; index < baseRuntime.fields.length; index += 1) {
        const baseField = baseRuntime.fields[index];
        const embeddedField = embeddedRuntime.fields[index];
        const rotatedCenter = rotateEastNorth([
            baseField.source.centerEastKm,
            baseField.source.centerNorthKm,
        ], yaw);
        close(embeddedField.source.centerEastKm, rotatedCenter[0],
            `field ${index} center east`);
        close(embeddedField.source.centerNorthKm, rotatedCenter[1],
            `field ${index} center north`);
        close(embeddedField.source.orientation,
            embedEastAngle(baseField.source.orientation, yaw),
            `field ${index} orientation`);
        const rotatedWind = rotateEastNorth([
            baseField.motion.windEastMps,
            baseField.motion.windNorthMps,
        ], yaw);
        close(embeddedField.motion.windEastMps, rotatedWind[0],
            `field ${index} wind east`);
        close(embeddedField.motion.windNorthMps, rotatedWind[1],
            `field ${index} wind north`);
        assert.equal(embeddedField.source.majorRadiusKm,
            baseField.source.majorRadiusKm);
        assert.equal(embeddedField.source.minorRadiusKm,
            baseField.source.minorRadiusKm);
    }

    // Sample the densest point in one finite source. Rotating both the field
    // and the query must preserve the CPU evaluator's complete result.
    const baseField = baseRuntime.fields[0];
    const top = baseField.source.topAltitudeKm;
    const bottom = baseField.source.bottomAltitudeKm;
    const vertical = 0.56;
    const altitude = bottom + (top - bottom) * vertical;
    const fallTime = (top - altitude) * 1000 /
        Math.max(0.05, baseField.motion.terminalVelocityMps);
    const center = [
        baseField.source.centerEastKm + baseField.motion.windEastMps * fallTime / 1000,
        baseField.source.centerNorthKm + baseField.motion.windNorthMps * fallTime / 1000,
    ];
    const alongEast = Math.cos(baseField.source.orientation);
    const alongNorth = Math.sin(baseField.source.orientation);
    const crossEast = -Math.sin(baseField.source.orientation);
    const crossNorth = Math.cos(baseField.source.orientation);
    let best = null;
    for (let along = -0.85; along <= 0.85; along += 0.1) {
        for (let cross = -0.85; cross <= 0.85; cross += 0.1) {
            const point = [
                center[0] + alongEast * along * baseField.source.majorRadiusKm +
                    crossEast * cross * baseField.source.minorRadiusKm,
                altitude,
                center[1] + alongNorth * along * baseField.source.majorRadiusKm +
                    crossNorth * cross * baseField.source.minorRadiusKm,
            ];
            const sample = hydrometeors.sampleHydrometeorField(
                baseField, point, 12, 11,
            );
            if (!best || sample.sourceWeight > best.sample.sourceWeight) {
                best = { point, sample };
            }
        }
    }
    assert.ok(best && best.sample.sourceWeight > 0,
        "the rigid-invariance probe must hit precipitating material");
    const embeddedField = embeddedRuntime.fields[0];
    const rotatedPoint = rotateEastNorth([best.point[0], best.point[2]], yaw);
    const embeddedSample = hydrometeors.sampleHydrometeorField(
        embeddedField,
        [rotatedPoint[0], best.point[1], rotatedPoint[1]],
        12,
        11,
    );
    close(embeddedSample.sourceWeight, best.sample.sourceWeight,
        "rotated source weight", 1e-8);
    closeArray(embeddedSample.extinctionRgbKm, best.sample.extinctionRgbKm,
        "rotated extinction", 1e-8);
    close(embeddedSample.liquidFraction, best.sample.liquidFraction,
        "rotated phase", 1e-8);
});

test("runtime is deterministic and every field remains source-owned", () => {
    const sources = [
        sourceFor({ id: "sheet", precipitationKind: "rain", rate: 14 }),
        sourceFor({
            id: "storm",
            precipitationKind: "shower",
            rate: 58,
            genus: "cumulonimbus",
            organization: "storm-complex",
        }),
    ];
    const first = hydrometeors.createHydrometeorRuntime(sources, environment);
    const second = hydrometeors.createHydrometeorRuntime(structuredClone(sources), environment);
    assert.deepEqual(first.fields, second.fields);
    assert.deepEqual([...first.packed.data], [...second.packed.data]);
    assert.ok(first.fields.length > 2);
    for (const field of first.fields) {
        assert.equal(field.parentSystemId, sources[field.parentSystemIndex].state.id);
        assert.equal(field.parentLayerIndex, sources[field.parentSystemIndex].layerIndex);
    }
});

test("qualified non-Cb precipitation fields retain a deterministic packed baseline", () => {
    const source = sourceFor({ id: "non-cb-baseline", precipitationKind: "rain", rate: 14 });
    const runtime = hydrometeors.createHydrometeorRuntime([source], environment);
    const sha256 = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(runtime.fields.length, 5);
    assert.equal(
        sha256(Buffer.from(JSON.stringify(runtime.fields))),
        "ff3ab16576a5ab644a0e1454f45e201eb3b96394f9df5cd0495c42ee1e108f4c",
    );
    assert.equal(
        sha256(Buffer.from(
            runtime.packed.data.buffer,
            runtime.packed.data.byteOffset,
            runtime.packed.data.byteLength,
        )),
        "d0af3934fde31eeaf96a5df7e1c617b598742d0a58b628d6050e0e1de20e31b1",
    );
    assert.ok(runtime.fields.every((field) => field.deepConvection === undefined));
});

test("mature Cb resolves mixed-phase rain, hail, and graupel into offset finite sources", () => {
    const storm = sourceFor({
        id: "continental-supercell",
        precipitationKind: "shower",
        rate: 72,
        genus: "cumulonimbus",
        species: "capillatus",
        organization: "storm-complex",
        supplementaryFeatures: ["incus", "arcus", "murus"],
        baseAltitudeKm: 1.45,
        topTemperatureKelvin: 218,
        verticalVelocity: 44,
        verticalShear: 5.8,
        precipitationEfficiency: 0.72,
    });
    const stormEnvironment = {
        ...environment,
        surfaceTemperatureKelvin: 296,
        surfaceRelativeHumidity: 0.68,
        surfaceWindSpeed: 6,
    };
    const context = hydrometeors.resolveCumulonimbusHydrometeorContext(
        storm,
        { ...hydrometeors.DEFAULT_HYDROMETEOR_ENVIRONMENT, ...stormEnvironment },
    );
    assert.equal(context.lifecycleStage, "precipitating");
    assert.equal(context.organization, "supercell");
    assert.deepEqual(
        context.plans.map((plan) => plan.phenomenon),
        ["rain", "hail", "graupel"],
    );
    assert.ok(context.topology.attachmentPaths.some((path) =>
        path.id === "mixed-phase-core->precipitation-core"));
    assert.ok(context.topology.attachmentPaths.some((path) =>
        path.id === "precipitation-core->downdraft-core"));
    assert.ok(context.topology.regions.some((region) => region.id === "cold-pool"));
    assert.ok(context.topology.regions.some((region) => region.id === "gust-front"));

    const runtime = hydrometeors.createHydrometeorRuntime([storm], stormEnvironment);
    assert.equal(runtime.packed.data[4], 2,
        "the existing active lane marks storm-owned evaluation without changing stride");
    assert.equal(runtime.packed.data[1], 16);
    const kinds = new Set(runtime.fields.map((field) => field.kind));
    assert.deepEqual(kinds, new Set(["convective-rain", "hail", "snow-pellets"]));
    assert.ok(runtime.fields.length >= 9 && runtime.fields.length <= 16);
    assert.ok(runtime.fields.every((field) =>
        field.parentSystemId === storm.state.id &&
        field.deepConvection?.lifecycleStage === "precipitating" &&
        field.deepConvection?.organization === "supercell"));
    assert.ok(runtime.fields.every((field) =>
        field.source.topAltitudeKm > storm.compiled.geometry.baseAltitudeKm &&
        field.source.topAltitudeKm < storm.compiled.geometry.baseAltitudeKm +
            storm.compiled.geometry.geometricDepthKm));
    assert.ok(runtime.fields.every((field) =>
        field.deepConvection.sourceAltitudeRangeKm[0] >=
            storm.compiled.geometry.baseAltitudeKm));
    assert.ok(runtime.fields.every((field) =>
        field.deepConvection.coldPoolCoupling01 > 0.45));

    const rain = runtime.fields.filter((field) => field.kind === "convective-rain");
    const hail = runtime.fields.filter((field) => field.kind === "hail");
    const graupel = runtime.fields.filter((field) => field.kind === "snow-pellets");
    assert.ok(rain.length >= 4 && hail.length >= 2 && graupel.length >= 2);
    assert.ok(rain.every((field) => field.particle.habit === "rain-drop"));
    assert.ok(hail.every((field) => field.particle.habit === "hailstone"));
    assert.ok(graupel.every((field) => field.particle.habit === "graupel"));
    const meanOffset = (fields) => fields.reduce((sum, field) =>
        sum + field.deepConvection.downshearOffset01, 0) / fields.length;
    assert.ok(meanOffset(rain) > meanOffset(hail) + 0.05,
        "rain loading must fall downshear of the protected mixed-phase updraft");
    assert.ok(rain.every((field) =>
        field.source.majorRadiusKm > hail[0].source.majorRadiusKm * 0.72),
    "rain shafts remain broader than compact hail cores");

    const totalMassFlux = runtime.fields.reduce((sum, field) =>
        sum + field.distribution.massFluxKgM2S, 0);
    assert.ok(Math.abs(totalMassFlux - storm.compiled.precipitation.rate / 3600) < 1e-10,
        "multi-habit Cb source splitting must conserve the parent mass flux");
    const positions = new Set(runtime.fields.map((field) =>
        `${field.source.centerEastKm.toFixed(5)}:${field.source.centerNorthKm.toFixed(5)}`));
    assert.equal(positions.size, runtime.fields.length,
        "storm source groups cannot collapse into a repeated picket/grid position");
});

test("Cb lifecycle and organization gate physically possible precipitation populations", () => {
    const base = {
        precipitationKind: "shower",
        rate: 58,
        genus: "cumulonimbus",
        species: "capillatus",
        organization: "storm-complex",
        verticalVelocity: 36,
        verticalShear: 4.8,
    };
    const developing = sourceFor({
        ...base,
        id: "developing-cell",
        lifecycleStage: "growing",
        stageProgress: 0.22,
    });
    const developingRuntime = hydrometeors.createHydrometeorRuntime(
        [developing],
        environment,
    );
    assert.deepEqual(developingRuntime.fields, []);
    assert.ok(developingRuntime.diagnostics.includes(
        "hydrometeor-cb-source-inactive:developing-cell:growing:shower"));

    const decaying = sourceFor({
        ...base,
        id: "decaying-cell",
        lifecycleStage: "decaying",
        stageProgress: 0.72,
        verticalVelocity: 8,
    });
    const decayContext = hydrometeors.resolveCumulonimbusHydrometeorContext(
        decaying,
        { ...hydrometeors.DEFAULT_HYDROMETEOR_ENVIRONMENT, ...environment },
    );
    assert.ok(decayContext.plans.every((plan) =>
        plan.phenomenon !== "hail" && plan.phenomenon !== "graupel"));
    const decay = hydrometeors.createHydrometeorRuntime([decaying], environment);
    assert.ok(decay.fields.every((field) =>
        field.deepConvection.lifecycleStage === "decaying" &&
        field.kind !== "hail" && field.kind !== "snow-pellets"));

    for (const organization of [
        "pulse-cell", "multicell-cluster", "supercell", "squall-line",
    ]) {
        const storm = sourceFor({ ...base, id: `organization-${organization}` });
        storm.deepConvection = { organization };
        const context = hydrometeors.resolveCumulonimbusHydrometeorContext(
            storm,
            { ...hydrometeors.DEFAULT_HYDROMETEOR_ENVIRONMENT, ...environment },
        );
        assert.equal(context.organization, organization);
        assert.ok(context.plans.length > 0);
    }
});

test("dry Cb virga terminates aloft while explicit hail and graupel stay habit-pure", () => {
    const dry = sourceFor({
        id: "dry-high-base-cb",
        precipitationKind: "shower",
        rate: 34,
        genus: "cumulonimbus",
        species: "capillatus",
        organization: "storm-complex",
        baseAltitudeKm: 3,
        verticalVelocity: 32,
        verticalShear: 4,
    });
    dry.deepConvection = { environment: "dry-high-base-convection" };
    const dryRuntime = hydrometeors.createHydrometeorRuntime([dry], {
        ...environment,
        surfaceRelativeHumidity: 0.28,
        surfaceTemperatureKelvin: 304,
    });
    const virga = dryRuntime.fields.filter((field) =>
        field.kind === "virga-liquid" || field.kind === "virga-ice");
    assert.ok(virga.length >= 2);
    assert.ok(virga.every((field) =>
        field.source.bottomAltitudeKm > environment.surfaceAltitudeKm &&
        field.evaporation.surfaceReachFraction === 0 &&
        field.deepConvection.phenomenon === "virga"));

    for (const [override, expectedKind, expectedHabit, phenomenon] of [
        ["hail", "hail", "hailstone", "hail"],
        ["snow-pellets", "snow-pellets", "graupel", "graupel"],
    ]) {
        const storm = sourceFor({
            id: `explicit-${override}`,
            precipitationKind: "shower",
            rate: 64,
            genus: "cumulonimbus",
            species: "capillatus",
            organization: "storm-complex",
            verticalVelocity: 42,
            verticalShear: 5.4,
        });
        const runtime = hydrometeors.createHydrometeorRuntime(
            [storm],
            environment,
            96,
            { cloudPrecipitation: [{ layerIndex: 0, kind: override }] },
        );
        assert.ok(runtime.fields.length > 0);
        assert.ok(runtime.fields.every((field) =>
            field.kind === expectedKind &&
            field.particle.habit === expectedHabit &&
            field.deepConvection.phenomenon === phenomenon));
    }
});

test("gamma spectra conserve prescribed water flux and retain physical ranges", () => {
    const cases = [
        ["drizzle", 1.2, 0.4, [0.1, 0.43], [0.1, 2.5]],
        ["stratiform-rain", 12, 0.5, [0.8, 2.4], [2.5, 8]],
        ["convective-rain", 55, 0.9, [1.1, 3.8], [3, 10]],
        ["snow-crystals", 1.2, 0.3, [0.08, 1.8], [0.06, 1.25]],
        ["snow-flakes", 8, 0.55, [0.6, 5.6], [0.25, 2.7]],
        ["snow-grains", 1.2, 0.3, [0.16, 0.72], [0.2, 1.45]],
        ["snow-pellets", 12, 0.7, [1.2, 4.2], [0.75, 4.6]],
        ["ice-pellets", 8, 0.5, [0.8, 3.7], [1.8, 8.5]],
        ["hail", 80, 0.8, [5, 24.1], [4, 42]],
        ["virga-liquid", 4, 0.3, [0.18, 1.5], [0.2, 7]],
        ["virga-ice", 4, 0.3, [0.6, 5.6], [0.25, 2.7]],
    ];
    for (const [kind, rate, intensity, diameterRange, velocityRange] of cases) {
        const distribution = hydrometeors.createParticleDistribution(
            kind,
            rate,
            intensity,
        );
        assert.ok(distribution.massMedianDiameterMm >= diameterRange[0]);
        assert.ok(distribution.massMedianDiameterMm <= diameterRange[1]);
        assert.ok(distribution.meanTerminalVelocityMps >= velocityRange[0]);
        assert.ok(distribution.meanTerminalVelocityMps <= velocityRange[1]);
        assert.ok(Math.abs(distribution.massFluxKgM2S - rate / 3600) < 1e-8);
        assert.ok(distribution.numberConcentrationM3 > 0);
        assert.ok(distribution.extinctionKm > 0 && Number.isFinite(distribution.extinctionKm));
    }
    const fog = hydrometeors.createParticleDistribution("fog", 0, 0.8);
    const mist = hydrometeors.createParticleDistribution("mist", 0, 0.4);
    assert.ok(fog.waterContentKgM3 > 0.00005 && fog.waterContentKgM3 < 0.0007);
    assert.ok(fog.numberConcentrationM3 > 1e7 && fog.numberConcentrationM3 < 1e9);
    assert.ok(3.912 / fog.extinctionKm < 1, "fog visibility is below one km");
    assert.ok(3.912 / mist.extinctionKm >= 1, "mist visibility is at least one km");
});

test("WMO particle definitions bound every represented species spectrum", () => {
    const expectedBounds = {
        drizzle: [0.035, 0.5],
        hail: [5, 50],
        "ice-pellets": [0.25, 4.95],
        "snow-grains": [0.06, 0.98],
        "snow-pellets": [0.45, 5],
        "ice-fog": [0.002, 0.03],
        "diamond-dust": [0.03, 0.2],
    };
    for (const [kind, expected] of Object.entries(expectedBounds)) {
        const profile = hydrometeors.HYDROMETEOR_SPECIES_MICROPHYSICS[kind];
        assert.deepEqual(profile.diameterRangeMm, expected);
        const distribution = hydrometeors.createParticleDistribution(
            kind,
            kind === "hail" ? 80 : kind.includes("fog") || kind === "diamond-dust" ? 0 : 5,
            0.7,
        );
        assert.ok(distribution.minimumDiameterMm >= expected[0]);
        assert.ok(distribution.maximumDiameterMm <= expected[1]);
        assert.ok(distribution.meanTerminalVelocityMps >=
            profile.terminalVelocityRangeMps[0] - 1e-9);
        assert.ok(distribution.meanTerminalVelocityMps <=
            profile.terminalVelocityRangeMps[1] + 1e-9);
    }
});

test("species optics are passive RGB coefficients rather than gray color grades", () => {
    const optics = new Map();
    for (const kind of Object.keys(hydrometeors.HYDROMETEOR_SPECIES_MICROPHYSICS)) {
        const suspended = ["fog", "mist", "ice-fog", "diamond-dust"].includes(kind);
        const distribution = hydrometeors.createParticleDistribution(
            kind,
            suspended ? 0 : kind === "hail" ? 72 : 8,
            0.62,
        );
        const value = hydrometeors.createHydrometeorOptics(
            kind,
            distribution,
            suspended ? 3.912 / (kind === "fog" || kind === "ice-fog" ? 0.3 : 4) :
                distribution.extinctionKm,
        );
        optics.set(kind, value);
        assert.ok(Math.abs(value.extinctionRgbKm[1] -
            (suspended ? 3.912 / (kind === "fog" || kind === "ice-fog" ? 0.3 : 4) :
                distribution.extinctionKm)) < 1e-12);
        for (let channel = 0; channel < 3; channel += 1) {
            assert.ok(value.singleScatteringAlbedoRgb[channel] >= 0 &&
                value.singleScatteringAlbedoRgb[channel] <= 1);
            assert.ok(value.extinctionRgbKm[channel] *
                value.singleScatteringAlbedoRgb[channel] <=
                value.extinctionRgbKm[channel] + 1e-12);
        }
        assert.ok(value.asymmetryParameter >=
            hydrometeors.HYDROMETEOR_SPECIES_MICROPHYSICS[kind].asymmetryRange[0]);
        assert.ok(value.asymmetryParameter <=
            hydrometeors.HYDROMETEOR_SPECIES_MICROPHYSICS[kind].asymmetryRange[1]);
    }
    assert.ok(optics.get("fog").extinctionRgbKm[2] /
        optics.get("fog").extinctionRgbKm[0] >
        optics.get("convective-rain").extinctionRgbKm[2] /
            optics.get("convective-rain").extinctionRgbKm[0]);
    assert.ok(optics.get("hail").asymmetryParameter >
        optics.get("diamond-dust").asymmetryParameter);
});

test("liquid-drop aspect follows the measured size regime", () => {
    const base = hydrometeors.createParticleDistribution("stratiform-rain", 8, 0.4);
    const small = hydrometeors.createHydrometeorParticleContract(
        "stratiform-rain", { ...base, massMedianDiameterMm: 0.4 });
    const moderate = hydrometeors.createHydrometeorParticleContract(
        "stratiform-rain", { ...base, massMedianDiameterMm: 4 });
    const large = hydrometeors.createHydrometeorParticleContract(
        "convective-rain", { ...base, massMedianDiameterMm: 6 });
    assert.equal(small.aspectRatio, 1);
    assert.ok(moderate.aspectRatio < 0.8 && moderate.aspectRatio > 0.75);
    assert.ok(large.aspectRatio < moderate.aspectRatio && large.aspectRatio >= 0.62);
});

test("unsupported phase and source combinations are rejected before packing", () => {
    const overdrizzle = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "drizzle", rate: 2, genus: "stratus" }),
    ], environment);
    assert.deepEqual(overdrizzle.fields, []);
    assert.ok(overdrizzle.diagnostics.some((value) =>
        value.includes("drizzle-rate-exceeds-wmo-regime")));

    const pelletSource = sourceFor({ precipitationKind: "snow", rate: 8 });
    const noWarmNose = hydrometeors.createHydrometeorRuntime([pelletSource], {
        ...environment,
        surfaceTemperatureKelvin: 268,
    }, 96, {
        cloudPrecipitation: [{ layerIndex: 0, kind: "ice-pellets" }],
        phaseProfile: {
            warmLayerBottomKm: 0.8,
            warmLayerTopKm: 1.4,
            warmLayerTemperatureKelvin: 270,
            surfaceColdLayerDepthKm: 0.7,
        },
    });
    assert.deepEqual(noWarmNose.fields, []);
    assert.ok(noWarmNose.diagnostics.some((value) =>
        value.includes("ice-pellets-require-elevated-melting-layer")));

    const unsupportedHail = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "hail", rate: 40, genus: "cumulonimbus",
            organization: "storm-complex", lifecycleStage: "growing",
            verticalVelocity: 2 }),
    ], environment);
    assert.deepEqual(unsupportedHail.fields, []);
    assert.ok(unsupportedHail.diagnostics.some((value) =>
        value.includes("hail-requires-active-mature-cumulonimbus")));

    const warmSnowGrains = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "snow", rate: 1, genus: "stratus" }),
    ], { ...environment, surfaceTemperatureKelvin: 278 }, 96, {
        cloudPrecipitation: [{ layerIndex: 0, kind: "snow-grains" }],
    });
    assert.deepEqual(warmSnowGrains.fields, []);
    assert.ok(warmSnowGrains.diagnostics.some((value) =>
        value.includes("snow-grains-surface-layer-is-above-freezing")));

    for (const [phenomenon, visibilityKm] of [["fog", 4], ["mist", 0.4]]) {
        const invalidSurface = hydrometeors.createHydrometeorRuntime([], {
            ...environment,
            surfaceRelativeHumidity: 0.98,
        }, 96, { surface: { phenomenon, visibilityKm } });
        assert.deepEqual(invalidSurface.fields, []);
        assert.ok(invalidSurface.diagnostics.some((value) =>
            value.includes(`hydrometeor-surface-invalid:${phenomenon}`)));
    }
});

test("finite extraction patches remain inside their parent cloud footprint", () => {
    const parent = sourceFor({ precipitationKind: "rain", rate: 24 });
    const runtime = hydrometeors.createHydrometeorRuntime([parent], environment);
    const alongEast = Math.cos(parent.state.extent.orientation);
    const alongNorth = Math.sin(parent.state.extent.orientation);
    const crossEast = -Math.sin(parent.state.extent.orientation);
    const crossNorth = Math.cos(parent.state.extent.orientation);
    for (const field of runtime.fields) {
        const dx = field.source.centerEastKm - parent.state.extent.centerEastKm;
        const dz = field.source.centerNorthKm - parent.state.extent.centerNorthKm;
        const along = Math.abs(dx * alongEast + dz * alongNorth) /
            parent.state.extent.majorRadiusKm;
        const cross = Math.abs(dx * crossEast + dz * crossNorth) /
            parent.state.extent.minorRadiusKm;
        assert.ok(along + field.source.majorRadiusKm /
            parent.state.extent.majorRadiusKm <= 0.951);
        assert.ok(cross + field.source.minorRadiusKm /
            parent.state.extent.minorRadiusKm <= 0.951);
    }
});

test("evaporation responds to particle size and humidity and virga ends aloft", () => {
    const smallDry = hydrometeors.estimateEvaporationDepthKm(
        "drizzle", 0.18, 0.42, 0.62,
    );
    const smallHumid = hydrometeors.estimateEvaporationDepthKm(
        "drizzle", 0.18, 0.92, 0.62,
    );
    const largeDry = hydrometeors.estimateEvaporationDepthKm(
        "stratiform-rain", 1.7, 0.42, 5.5,
    );
    assert.ok(smallHumid > smallDry);
    assert.ok(largeDry > smallDry * 10);
    const virga = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "virga", rate: 3, evaporationDepthKm: 0.8 }),
    ], { ...environment, surfaceRelativeHumidity: 0.35 });
    assert.ok(virga.fields.every((field) => field.source.bottomAltitudeKm > 0));
    assert.ok(virga.fields.every((field) =>
        field.evaporation.surfaceReachFraction === 0));
    assert.ok(virga.fields.every((field) => field.concentrationScale <= 0.24));
    assert.ok(virga.fields.every((field) =>
        field.source.majorRadiusKm / 34 <= 0.131 &&
        field.source.minorRadiusKm / 19 <= 0.116));
});

test("virga reconstructs sparse curved channels without horizontal end caps", () => {
    const runtime = hydrometeors.createHydrometeorRuntime([
        sourceFor({
            precipitationKind: "virga",
            rate: 1.1,
            evaporationDepthKm: 0.7,
            genus: "cumulus",
            baseAltitudeKm: 1.6,
            coverageOktas: 4,
            organization: "thermal-field",
        }),
    ], { ...environment, surfaceRelativeHumidity: 0.38 });
    assert.ok(runtime.fields.length >= 2);
    const field = runtime.fields[0];
    const top = field.source.topAltitudeKm;
    const bottom = field.source.bottomAltitudeKm;
    const topSample = hydrometeors.sampleHydrometeorField(field, [
        field.source.centerEastKm, top, field.source.centerNorthKm,
    ], 12);
    const bottomFallTime = (top - bottom) * 1000 /
        field.motion.terminalVelocityMps;
    const bottomSample = hydrometeors.sampleHydrometeorField(field, [
        field.source.centerEastKm + field.motion.windEastMps * bottomFallTime / 1000,
        bottom,
        field.source.centerNorthKm + field.motion.windNorthMps * bottomFallTime / 1000,
    ], 12);
    assert.equal(topSample.sourceWeight, 0,
        "a shaft must emerge continuously below its cloud source");
    assert.equal(bottomSample.sourceWeight, 0,
        "virga must evaporate to a continuous terminal boundary aloft");

    const altitude = bottom + (top - bottom) * 0.58;
    const fallTime = (top - altitude) * 1000 / field.motion.terminalVelocityMps;
    const centerEast = field.source.centerEastKm +
        field.motion.windEastMps * fallTime / 1000;
    const centerNorth = field.source.centerNorthKm +
        field.motion.windNorthMps * fallTime / 1000;
    const alongEast = Math.cos(field.source.orientation);
    const alongNorth = Math.sin(field.source.orientation);
    const crossEast = -Math.sin(field.source.orientation);
    const crossNorth = Math.cos(field.source.orientation);
    let occupied = 0;
    let empty = 0;
    let maximumWeight = 0;
    for (let along = -0.8; along <= 0.8; along += 0.1) {
        for (let cross = -0.8; cross <= 0.8; cross += 0.1) {
            const sample = hydrometeors.sampleHydrometeorField(field, [
                centerEast + alongEast * along * field.source.majorRadiusKm +
                    crossEast * cross * field.source.minorRadiusKm,
                altitude,
                centerNorth + alongNorth * along * field.source.majorRadiusKm +
                    crossNorth * cross * field.source.minorRadiusKm,
            ], 12);
            maximumWeight = Math.max(maximumWeight, sample.sourceWeight);
            if (sample.sourceWeight > 0.001) occupied += 1;
            else empty += 1;
        }
    }
    assert.ok(maximumWeight > 0.002, "at least one physical fallstreak survives");
    assert.ok(occupied > 0 && empty > occupied * 1.5,
        "the source patch contains clustered trails, not a filled ellipse");
    const outside = hydrometeors.sampleHydrometeorField(field, [
        centerEast + alongEast * field.source.majorRadiusKm * 1.4,
        altitude,
        centerNorth + alongNorth * field.source.majorRadiusKm * 1.4,
    ], 12);
    assert.equal(outside.sourceWeight, 0);
});

const sampleNormalizedField = (field, along, cross, vertical, timeSeconds = 0) => {
    const top = field.source.topAltitudeKm;
    const bottom = field.source.bottomAltitudeKm;
    const altitude = bottom + (top - bottom) * vertical;
    const fallTime = field.renderClass === "surface-bank" ? 0
        : (top - altitude) * 1000 / field.motion.terminalVelocityMps;
    const centerEast = field.source.centerEastKm +
        field.motion.windEastMps * fallTime / 1000;
    const centerNorth = field.source.centerNorthKm +
        field.motion.windNorthMps * fallTime / 1000;
    const radiusScale = field.morphology.radiusScaleAtBottom +
        (1 - field.morphology.radiusScaleAtBottom) * vertical;
    const alongEast = Math.cos(field.source.orientation);
    const alongNorth = Math.sin(field.source.orientation);
    const crossEast = -Math.sin(field.source.orientation);
    const crossNorth = Math.cos(field.source.orientation);
    return hydrometeors.sampleHydrometeorField(field, [
        centerEast + alongEast * along * field.source.majorRadiusKm * radiusScale +
            crossEast * cross * field.source.minorRadiusKm * radiusScale,
        altitude,
        centerNorth + alongNorth * along * field.source.majorRadiusKm * radiusScale +
            crossNorth * cross * field.source.minorRadiusKm * radiusScale,
    ], 12, timeSeconds);
};

const normalizedTopologySignature = (field, vertical = 0.55) => {
    const weights = [];
    for (let along = -0.9; along <= 0.9; along += 0.15) {
        for (let cross = -0.9; cross <= 0.9; cross += 0.15) {
            weights.push(sampleNormalizedField(
                field, along, cross, vertical,
            ).sourceWeight);
        }
    }
    const maximum = Math.max(...weights);
    const occupied = weights.filter((weight) => weight > maximum * 0.035).length;
    const signature = weights.map((weight) =>
        Math.round(weight / Math.max(1e-9, maximum) * 15)).join("");
    return { weights, maximum, occupied, signature };
};

test("every precipitation species has finite non-elliptic world-space topology", () => {
    const precipitationFields = [
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "drizzle-shared", precipitationKind: "drizzle", rate: 0.8,
                genus: "stratus", baseAltitudeKm: 0.45 }),
        ], environment).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "rain-shared", precipitationKind: "rain", rate: 12 }),
        ], environment).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "shower-shared", precipitationKind: "shower", rate: 52,
                genus: "cumulonimbus", organization: "storm-complex" }),
        ], environment).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "crystals-shared", precipitationKind: "snow", rate: 1.2 }),
        ], { ...environment, surfaceTemperatureKelvin: 258 }).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "flakes-shared", precipitationKind: "snow", rate: 8 }),
        ], { ...environment, surfaceTemperatureKelvin: 268 }).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "hail-shared", precipitationKind: "hail", rate: 80,
                genus: "cumulonimbus", organization: "storm-complex" }),
        ], environment).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "pellets-shared", precipitationKind: "snow", rate: 8 }),
        ], { ...environment, surfaceTemperatureKelvin: 268 }, 96, {
            cloudPrecipitation: [{ layerIndex: 0, kind: "ice-pellets" }],
        }).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "grains-shared", precipitationKind: "snow", rate: 1,
                genus: "stratus", baseAltitudeKm: 0.5 }),
        ], { ...environment, surfaceTemperatureKelvin: 268 }, 96, {
            cloudPrecipitation: [{ layerIndex: 0, kind: "snow-grains" }],
        }).fields[0],
        hydrometeors.createHydrometeorRuntime([
            sourceFor({ id: "graupel-shared", precipitationKind: "snow", rate: 14,
                genus: "cumulonimbus", organization: "storm-complex" }),
        ], { ...environment, surfaceTemperatureKelvin: 270 }, 96, {
            cloudPrecipitation: [{ layerIndex: 0, kind: "snow-pellets" }],
        }).fields[0],
    ];
    const expectedKinds = [
        "drizzle", "stratiform-rain", "convective-rain", "snow-crystals",
        "snow-flakes", "hail", "ice-pellets", "snow-grains", "snow-pellets",
    ];
    assert.deepEqual(precipitationFields.map((field) => field.kind), expectedKinds);
    const signatures = new Set();
    for (const original of precipitationFields) {
        // Holding seed constant makes this a topology test instead of merely a
        // deterministic-randomness test.
        const field = { ...original, seed: 0.371 };
        const topology = normalizedTopologySignature(field);
        assert.ok(topology.maximum > 0.001, `${field.kind} retains physical material`);
        assert.ok(topology.occupied > 0, `${field.kind} has at least one finite core`);
        assert.ok(topology.occupied < topology.weights.length * 0.72,
            `${field.kind} is not a filled ellipse`);
        assert.equal(sampleNormalizedField(field, 0, 0, 1).sourceWeight, 0,
            `${field.kind} emerges without a horizontal source cap`);
        assert.equal(sampleNormalizedField(field, 1.35, 0, 0.55).sourceWeight, 0,
            `${field.kind} remains finite in world space`);
        signatures.add(topology.signature);
    }
    assert.equal(signatures.size, precipitationFields.length,
        "species topology remains materially distinct at a common seed");

    const drizzle = normalizedTopologySignature({
        ...precipitationFields[0], seed: 0.371,
    });
    const hail = normalizedTopologySignature({
        ...precipitationFields[5], seed: 0.371,
    });
    assert.ok(drizzle.occupied > hail.occupied,
        "close drizzle veils remain broader than discrete hail cores");
});

test("fog, mist, ice fog and diamond dust form distinct finite 3-D banks", () => {
    const region = {
        id: "shared-boundary-bank",
        centerEastKm: 4,
        centerNorthKm: 18,
        majorRadiusKm: 12,
        minorRadiusKm: 7,
        orientation: 0.4,
        topAltitudeKm: 0.42,
        seed: 0.37,
    };
    const cases = [
        ["fog", { surfaceTemperatureKelvin: 275, surfaceRelativeHumidity: 0.98,
            surfaceVisibilityKm: 0.3 }],
        ["mist", { surfaceTemperatureKelvin: 282, surfaceRelativeHumidity: 0.9,
            surfaceVisibilityKm: 3 }],
        ["ice-fog", { surfaceTemperatureKelvin: 238, surfaceRelativeHumidity: 0.94,
            surfaceVisibilityKm: 0.04 }],
        ["diamond-dust", { surfaceTemperatureKelvin: 252, surfaceRelativeHumidity: 0.82,
            surfaceVisibilityKm: 9 }],
    ];
    const signatures = new Set();
    const occupancies = new Map();
    for (const [kind, boundary] of cases) {
        const runtime = hydrometeors.createHydrometeorRuntime([], {
            ...environment,
            ...boundary,
        }, 96, {
            surface: { phenomenon: kind, visibilityKm: boundary.surfaceVisibilityKm, region },
        });
        assert.ok(runtime.fields.length > 0);
        const field = { ...runtime.fields[0], seed: 0.371 };
        assert.equal(field.kind, kind);
        const topology = normalizedTopologySignature(field, 0.46);
        assert.ok(topology.maximum > 0.0001);
        assert.ok(topology.occupied > 0);
        assert.ok(topology.occupied < topology.weights.length * 0.82,
            `${kind} is a finite bank, not a uniform slab`);
        assert.equal(sampleNormalizedField(field, 1.35, 0, 0.46).sourceWeight, 0);
        signatures.add(topology.signature);
        occupancies.set(kind, topology.occupied);
    }
    assert.equal(signatures.size, cases.length);
    assert.ok(occupancies.get("fog") > occupancies.get("diamond-dust"),
        "fog is connected while clear-air crystals remain sparse");
});

test("wind slants shafts downwind while retaining the cloud-base source", () => {
    const runtime = hydrometeors.createHydrometeorRuntime([
        sourceFor({
            precipitationKind: "shower",
            rate: 45,
            genus: "cumulonimbus",
            organization: "storm-complex",
        }),
    ], environment);
    const field = runtime.fields[0];
    const altitude = (field.source.topAltitudeKm + field.source.bottomAltitudeKm) * 0.5;
    const fallTime = (field.source.topAltitudeKm - altitude) * 1000 /
        field.motion.terminalVelocityMps;
    const driftEast = field.motion.windEastMps * fallTime / 1000;
    const driftNorth = field.motion.windNorthMps * fallTime / 1000;
    const alongEast = Math.cos(field.source.orientation);
    const alongNorth = Math.sin(field.source.orientation);
    const crossEast = -Math.sin(field.source.orientation);
    const crossNorth = Math.cos(field.source.orientation);
    let downwindSample = { sourceWeight: 0 };
    let downwind = [0, altitude, 0];
    // Species topology intentionally makes the geometric center potentially
    // empty. Find a physical shower core, then compare that same core offset
    // against the incorrectly upwind-translated position.
    for (let along = -0.7; along <= 0.7; along += 0.1) {
        for (let cross = -0.7; cross <= 0.7; cross += 0.1) {
            const candidate = [
                field.source.centerEastKm + driftEast +
                    alongEast * along * field.source.majorRadiusKm +
                    crossEast * cross * field.source.minorRadiusKm,
                altitude,
                field.source.centerNorthKm + driftNorth +
                    alongNorth * along * field.source.majorRadiusKm +
                    crossNorth * cross * field.source.minorRadiusKm,
            ];
            const sample = hydrometeors.sampleHydrometeorField(field, candidate, 2);
            if (sample.sourceWeight > downwindSample.sourceWeight) {
                downwindSample = sample;
                downwind = candidate;
            }
        }
    }
    const upwindSample = hydrometeors.sampleHydrometeorField(field, [
        downwind[0] - driftEast * 2,
        altitude,
        downwind[2] - driftNorth * 2,
    ], 2);
    assert.ok(downwindSample.sourceWeight > 0);
    assert.ok(downwindSample.sourceWeight > upwindSample.sourceWeight);
});

test("near particle detail partitions, rather than adds, optical energy", () => {
    const runtime = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "rain", rate: 18 }),
    ], environment);
    const field = runtime.fields[0];
    const position = [
        field.source.centerEastKm,
        field.source.topAltitudeKm,
        field.source.centerNorthKm,
    ];
    const near = hydrometeors.sampleHydrometeorField(field, position, 0.001);
    const far = hydrometeors.sampleHydrometeorField(field, position, 20);
    assert.ok(Math.abs(near.volumetricEnergyFraction +
        near.sparseParticleEnergyFraction - 1) < 1e-8);
    assert.equal(far.sparseParticleEnergyFraction, 0);
    assert.equal(far.volumetricEnergyFraction, 1);
    assert.equal(near.extinctionRgbKm[1], far.extinctionRgbKm[1],
        "volume retains full energy until the sparse pass is bound");
});

test("snow melts through a finite warm layer and hail remains mostly ice", () => {
    const snow = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "snow", rate: 8, liquidFraction: 0.1 }),
    ], { ...environment, surfaceTemperatureKelvin: 289 }).fields[0];
    const hail = hydrometeors.createHydrometeorRuntime([
        sourceFor({
            precipitationKind: "hail",
            rate: 80,
            genus: "cumulonimbus",
            liquidFraction: 0.1,
            organization: "storm-complex",
        }),
    ], { ...environment, surfaceTemperatureKelvin: 289 }).fields[0];
    assert.equal(snow.phase.liquidFractionAtSource, 0);
    assert.ok(snow.phase.liquidFractionAtBottom > 0.8);
    assert.ok(hail.phase.liquidFractionAtBottom < snow.phase.liquidFractionAtBottom);
});

test("fog and mist are finite low-cloud-owned banks, never a global overlay", () => {
    const lowStratus = sourceFor({
        precipitationKind: "none",
        rate: 0,
        genus: "stratus",
        baseAltitudeKm: 0.12,
    });
    const fog = hydrometeors.createHydrometeorRuntime([lowStratus], {
        ...environment,
        surfaceRelativeHumidity: 0.97,
        fogAmount: 0.8,
        surfaceVisibilityKm: 0.3,
    });
    assert.ok(fog.fields.length > 0);
    assert.ok(fog.fields.every((field) => field.kind === "fog"));
    assert.ok(fog.fields.every((field) =>
        field.parentSystemId === lowStratus.state.id &&
        field.source.majorRadiusKm < lowStratus.state.extent.majorRadiusKm &&
        field.source.bottomAltitudeKm === environment.surfaceAltitudeKm));
    const clearOwnerless = hydrometeors.createHydrometeorRuntime([], {
        ...environment,
        surfaceRelativeHumidity: 0.99,
        fogAmount: 1,
    });
    assert.deepEqual(clearOwnerless.fields, []);
});

test("expanded WMO hydrometeors enforce valid owners and distinct habits", () => {
    const cases = [
        ["snow-grains", "stratus", "snow-grain", "curtain"],
        ["snow-pellets", "cumulonimbus", "graupel", "shower"],
        ["ice-pellets", "nimbostratus", "ice-pellet", "curtain"],
    ];
    for (const [override, genus, habit, renderClass] of cases) {
        const source = sourceFor({
            precipitationKind: "snow",
            rate: 7,
            genus,
            baseAltitudeKm: genus === "stratus" ? 0.4 : 2,
            organization: genus === "cumulonimbus" ? "storm-complex" : "frontal-shield",
        });
        const runtime = hydrometeors.createHydrometeorRuntime([source], {
            ...environment,
            surfaceTemperatureKelvin: 268,
        }, 96, {
            cloudPrecipitation: [{ layerIndex: 0, kind: override }],
        });
        assert.ok(runtime.fields.length > 0, `${override} generated`);
        assert.ok(runtime.fields.every((field) => field.kind === override));
        assert.ok(runtime.fields.every((field) => field.particle.habit === habit));
        assert.ok(runtime.fields.every((field) => field.renderClass === renderClass));
    }
    const invalid = sourceFor({
        precipitationKind: "rain",
        rate: 1,
        genus: "nimbostratus",
    });
    const rejected = hydrometeors.createHydrometeorRuntime([invalid], environment, 96, {
        cloudPrecipitation: [{ layerIndex: 0, kind: "snow-grains" }],
    });
    assert.deepEqual(rejected.fields, []);
    assert.ok(rejected.diagnostics.some((value) =>
        value.includes("hydrometeor-owner-invalid")));
});

test("Nimbostratus fall domains stay parent-linked and share one melting level", () => {
    for (const precipitationKind of ["virga", "rain", "snow"]) {
        const id = `ns-parent-${precipitationKind}`;
        const source = sourceFor({
            id,
            genus: "nimbostratus",
            precipitationKind,
            rate: precipitationKind === "virga" ? 2.5 : 9,
            liquidFraction: precipitationKind === "snow" ? 0.14 : 0.72,
            supplementaryFeatures: [
                precipitationKind === "virga" ? "virga" : "praecipitatio",
            ],
        });
        source.compiled.formation.freezingLevelKm = 1.42;
        const runtime = hydrometeors.createHydrometeorRuntime(
            [source],
            precipitationKind === "snow"
                ? { ...hydrometeors.DEFAULT_HYDROMETEOR_ENVIRONMENT,
                    surfaceTemperatureKelvin: 269 }
                : hydrometeors.DEFAULT_HYDROMETEOR_ENVIRONMENT,
        );
        assert.ok(runtime.fields.length > 0, precipitationKind);
        assert.ok(runtime.fields.every((field) =>
            field.parentSystemId === id &&
            field.ownerKind === "cloud-system"), precipitationKind);
        assert.ok(runtime.fields.every((field) =>
            field.phase.freezingAltitudeKm === 1.42), precipitationKind);
    }
});

test("ice pellets encode a physically distinct melt-refreeze path", () => {
    const source = sourceFor({ precipitationKind: "snow", rate: 9 });
    const field = hydrometeors.createHydrometeorRuntime([source], {
        ...environment,
        surfaceTemperatureKelvin: 268,
    }, 96, {
        cloudPrecipitation: [{ layerIndex: 0, kind: "ice-pellets" }],
        phaseProfile: {
        warmLayerBottomKm: 0.75,
        warmLayerTopKm: 1.65,
        warmLayerTemperatureKelvin: 276,
        surfaceColdLayerDepthKm: 0.75,
        },
    }).fields[0];
    assert.equal(field.phase.phasePath, "melt-refreeze");
    assert.ok(field.phase.refreezingDepthKm > 0.5);
    assert.ok(field.phase.liquidFractionAtBottom < 0.35);
    assert.equal(field.particle.habit, "ice-pellet");
});

test("clear-air diamond dust and ice fog retain finite boundary-region ownership", () => {
    const region = {
        id: "arctic-basin",
        centerEastKm: 4,
        centerNorthKm: 18,
        majorRadiusKm: 12,
        minorRadiusKm: 7,
        orientation: 0.4,
        topAltitudeKm: 0.4,
        seed: 0.37,
    };
    const diamond = hydrometeors.createHydrometeorRuntime([], {
        ...environment,
        surfaceTemperatureKelvin: 252,
        surfaceRelativeHumidity: 0.84,
    }, 96, {
        surface: {
            phenomenon: "diamond-dust",
            visibilityKm: 9,
            region,
        },
    });
    assert.ok(diamond.fields.length > 0);
    assert.ok(diamond.fields.every((field) =>
        field.kind === "diamond-dust" &&
        field.ownerKind === "boundary-layer-region" &&
        field.parentSystemId === region.id &&
        field.lighting.sourceGlintStrength > 0));
    assert.ok(diamond.fields.every((field) =>
        field.source.majorRadiusKm < region.majorRadiusKm));
    const iceFog = hydrometeors.createHydrometeorRuntime([], {
        ...environment,
        surfaceTemperatureKelvin: 238,
        surfaceRelativeHumidity: 0.96,
    }, 96, {
        surface: {
            phenomenon: "ice-fog",
            visibilityKm: 0.04,
            region,
        },
    });
    assert.ok(iceFog.fields.length > 0);
    assert.ok(iceFog.fields.every((field) => 3.912 /
        field.optics.extinctionRgbKm[1] < 0.05));
    const physicallyInvalid = hydrometeors.createHydrometeorRuntime([], {
        ...environment,
        surfaceTemperatureKelvin: 260,
        surfaceRelativeHumidity: 0.96,
    }, 96, {
        surface: { phenomenon: "ice-fog", visibilityKm: 0.04 },
    });
    assert.deepEqual(physicallyInvalid.fields, []);
    assert.ok(physicallyInvalid.diagnostics.includes(
        "hydrometeor-surface-invalid:ice-fog"));
});

test("near particles are deterministic, habit-aware, and light-coupled", () => {
    const runtime = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "snow", rate: 9 }),
    ], { ...environment, surfaceTemperatureKelvin: 269 });
    const field = runtime.fields[0];
    const first = hydrometeors.sampleHydrometeorNearParticle(field, 17, 0.001, 1);
    const second = hydrometeors.sampleHydrometeorNearParticle(field, 17, 0.001, 1);
    assert.deepEqual(first, second);
    assert.equal(first.habit, "aggregate-flake");
    assert.ok(first.visible);
    assert.ok(first.opticalEnergy > 0);
    assert.ok(first.diameterMm >= field.distribution.minimumDiameterMm);
    assert.ok(first.diameterMm <= field.distribution.maximumDiameterMm);
});

test("scene override signatures are canonical and include physical boundary state", () => {
    const first = {
        cloudPrecipitation: [
            { layerIndex: 2, kind: "snow" },
            { layerIndex: 0, kind: "drizzle" },
        ],
        boundaryLayer: {
            surfaceTemperatureKelvin: 258,
            surfaceRelativeHumidity: 0.91,
        },
    };
    const reordered = {
        boundaryLayer: {
            surfaceRelativeHumidity: 0.91,
            surfaceTemperatureKelvin: 258,
        },
        cloudPrecipitation: [...first.cloudPrecipitation].reverse(),
    };
    assert.equal(
        hydrometeors.createHydrometeorSceneOverrideSignature(first),
        hydrometeors.createHydrometeorSceneOverrideSignature(reordered),
    );
    assert.notEqual(
        hydrometeors.createHydrometeorSceneOverrideSignature(first),
        hydrometeors.createHydrometeorSceneOverrideSignature({
            ...first,
            boundaryLayer: { ...first.boundaryLayer, surfaceTemperatureKelvin: 270 },
        }),
    );
    assert.equal(hydrometeors.createHydrometeorSceneOverrideSignature(), "daily");
});

test("spectral Beer transport is analytic, monotone, and channel preserving", () => {
    const extinction = [0.18, 0.73, 1.91];
    const distance = 2.4;
    const transmission = hydrometeors.hydrometeorSpectralBeerTransmittance(
        extinction, distance);
    assert.deepEqual(transmission, extinction.map((value) =>
        Math.exp(-value * distance)));
    assert.ok(transmission[0] > transmission[1] && transmission[1] > transmission[2]);
    assert.deepEqual(
        hydrometeors.hydrometeorSpectralBeerTransmittance(extinction, 0),
        [1, 1, 1],
    );
});

test("glint and higher-order phase are normalized energy redistribution", () => {
    // Axisymmetric phase integral: 2pi integral[-1,1] p(mu) dmu.
    const samples = 200_000;
    let integral = 0;
    for (let index = 0; index < samples; index += 1) {
        const cosine = -1 + 2 * (index + 0.5) / samples;
        integral += hydrometeors.hydrometeorPassiveDirectionalPhase(
            cosine, 0.88, 0.73, 850, 0.64);
    }
    integral *= 4 * Math.PI / samples;
    assert.ok(Math.abs(integral - 1) < 0.004, `phase integral ${integral}`);
});

test("parent transfers are passive and every lighting-response ABI lane is bounded", () => {
    const transfer = passiveTransfer([0.8, 1.4, 0.2], [0.7, 0.4, 2.1]);
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(transfer.transmittanceRgb[channel] >= 0);
        assert.ok(transfer.scatteredTowardReceiverRgb[channel] >= 0);
        assert.ok(transfer.transmittanceRgb[channel] +
            transfer.scatteredTowardReceiverRgb[channel] <= 1 + 1e-12);
    }
    const runtime = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "snow", rate: 9 }),
    ], { ...environment, surfaceTemperatureKelvin: 269 });
    assert.ok(runtime.fields.every((field) =>
        Object.values(field.lighting).every((value) => value >= 0 && value <= 1)));
});

test("one passive RGB event budgets diffuse sky and ground without emission", () => {
    const original = hydrometeors.createHydrometeorRuntime([
        sourceFor({ precipitationKind: "rain", rate: 11 }),
    ], environment).fields[0];
    const field = structuredClone(original);
    field.optics.singleScatteringAlbedoRgb = [0.81, 0.72, 0.63];
    field.lighting = {
        directIrradianceWeight: 1,
        diffuseIrradianceWeight: 1,
        sourceGlintStrength: 1,
        multipleScatteringBoost: 1,
    };
    const uniformIncident = {
        atmosphereAttenuatedSunIrradianceRgb: [0, 0, 0],
        atmosphereAttenuatedMoonIrradianceRgb: [0, 0, 0],
        // E=pi corresponds to unit radiance in each uniform hemisphere.
        diffuseSkyHemisphereIrradianceRgb: [Math.PI, Math.PI, Math.PI],
        groundHemisphereIrradianceRgb: [Math.PI, Math.PI, Math.PI],
    };
    const extinction = [0.7, 1.3, 2.1];
    const distance = 0.46;
    const result = hydrometeors.integrateHydrometeorPassiveSegmentReference([{
        field,
        extinctionRgbKm: extinction,
        irradianceAtSample: uniformIncident,
        parentCoupling: parentCouplingFor(field),
        angles: eventAngles,
    }], distance);
    for (let channel = 0; channel < 3; channel += 1) {
        const albedo = field.optics.singleScatteringAlbedoRgb[channel];
        const interaction = 1 - Math.exp(-extinction[channel] * distance);
        assert.ok(Math.abs(result.sourceFunctionRadianceRgb[channel] - albedo) < 1e-12);
        assert.ok(Math.abs(result.eventRadianceRgb[channel] -
            albedo * interaction) < 1e-12);
    }
    const overcompleteQuadrature = hydrometeors
        .integrateHydrometeorPassiveSegmentReference([{
            field,
            extinctionRgbKm: extinction,
            irradianceAtSample: uniformIncident,
            parentCoupling: parentCouplingFor(field),
            angles: {
                ...eventAngles,
                upperHemispherePhaseIntegral: 1,
                lowerHemispherePhaseIntegral: 1,
            },
        }], distance);
    assert.deepEqual(overcompleteQuadrature.sourceFunctionRadianceRgb,
        result.sourceFunctionRadianceRgb,
        "complementary hemisphere phase integrals cannot spend more than one");

    const ownerRadiance = [1.7, 0.8, 0.35];
    const resolvedParent = hydrometeors
        .integrateHydrometeorPassiveSegmentReference([{
            field,
            extinctionRgbKm: extinction,
            irradianceAtSample: {
                atmosphereAttenuatedSunIrradianceRgb: [0, 0, 0],
                atmosphereAttenuatedMoonIrradianceRgb: [0, 0, 0],
                diffuseSkyHemisphereIrradianceRgb: [0, 0, 0],
                groundHemisphereIrradianceRgb: [0, 0, 0],
            },
            parentCoupling: parentCouplingFor(field, {
                phaseConvolvedScatteringRadianceRgb: ownerRadiance,
            }),
            angles: eventAngles,
        }], distance);
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(Math.abs(resolvedParent.sourceFunctionRadianceRgb[channel] -
            ownerRadiance[channel] *
                field.optics.singleScatteringAlbedoRgb[channel]) < 1e-12);
    }

    const darkness = hydrometeors.integrateHydrometeorPassiveSegmentReference([{
        field,
        extinctionRgbKm: extinction,
        irradianceAtSample: {
            atmosphereAttenuatedSunIrradianceRgb: [0, 0, 0],
            atmosphereAttenuatedMoonIrradianceRgb: [0, 0, 0],
            diffuseSkyHemisphereIrradianceRgb: [0, 0, 0],
            groundHemisphereIrradianceRgb: [0, 0, 0],
        },
        parentCoupling: parentCouplingFor(field),
        angles: eventAngles,
    }], distance);
    assert.deepEqual(darkness.eventRadianceRgb, [0, 0, 0]);
    assert.ok(darkness.segmentTransmittanceRgb.every((value) => value < 1));
});

test("overlap consumes one Beer event and never borrows an unrelated parent's light", () => {
    const base = hydrometeors.createHydrometeorRuntime([
        sourceFor({ id: "lit-parent", precipitationKind: "rain", rate: 11 }),
    ], environment).fields[0];
    const dark = structuredClone(base);
    dark.parentSystemId = "dark-parent";
    dark.parentSystemIndex = 7;
    dark.parentLayerIndex = 4;
    const localSource = {
        atmosphereAttenuatedSunIrradianceRgb: [7, 5, 3],
        atmosphereAttenuatedMoonIrradianceRgb: [0, 0, 0],
        diffuseSkyHemisphereIrradianceRgb: [0, 0, 0],
        groundHemisphereIrradianceRgb: [0, 0, 0],
    };
    const extinction = [0.42, 0.88, 1.37];
    const litEvent = {
        field: base,
        extinctionRgbKm: extinction,
        irradianceAtSample: localSource,
        parentCoupling: parentCouplingFor(base),
        angles: eventAngles,
    };
    const darkEvent = {
        field: dark,
        extinctionRgbKm: extinction,
        irradianceAtSample: localSource,
        parentCoupling: parentCouplingFor(dark, {
            sun: passiveTransfer([0, 0, 0]),
            moon: passiveTransfer([0, 0, 0]),
            diffuseSky: passiveTransfer([0, 0, 0]),
            ground: passiveTransfer([0, 0, 0]),
        }),
        angles: eventAngles,
    };
    const litOnly = hydrometeors.integrateHydrometeorPassiveSegmentReference(
        [litEvent], 0.7);
    const overlap = hydrometeors.integrateHydrometeorPassiveSegmentReference(
        [litEvent, darkEvent], 0.7);
    assert.deepEqual(overlap.sourceCoefficientRgbKm,
        litOnly.sourceCoefficientRgbKm,
        "the extinguishing dark field does not inherit the bright parent");
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(Math.abs(overlap.segmentTransmittanceRgb[channel] -
            Math.exp(-2 * extinction[channel] * 0.7)) < 1e-12);
    }
    assert.throws(() => hydrometeors.integrateHydrometeorPassiveSegmentReference([{
        ...litEvent,
        parentCoupling: parentCouplingFor(dark),
    }], 0.7), /hydrometeor-parent-mismatch/);
});

test("precipitation, virga, and fog inherit their own parent's source visibility", () => {
    const rain = hydrometeors.createHydrometeorRuntime([
        sourceFor({ id: "rain-owner", precipitationKind: "rain", rate: 8 }),
    ], environment).fields[0];
    const virga = hydrometeors.createHydrometeorRuntime([
        sourceFor({
            id: "virga-owner",
            precipitationKind: "virga",
            rate: 5,
            evaporationDepthKm: 1.5,
        }),
    ], { ...environment, surfaceRelativeHumidity: 0.28 }).fields[0];
    const fogOwner = sourceFor({
        id: "fog-owner",
        precipitationKind: "none",
        rate: 0,
        genus: "stratus",
        baseAltitudeKm: 0.12,
    });
    const fog = hydrometeors.createHydrometeorRuntime([fogOwner], {
        ...environment,
        surfaceRelativeHumidity: 0.97,
        fogAmount: 0.8,
        surfaceVisibilityKm: 0.3,
    }).fields[0];
    const incident = {
        atmosphereAttenuatedSunIrradianceRgb: [6, 5, 4],
        atmosphereAttenuatedMoonIrradianceRgb: [0, 0, 0],
        diffuseSkyHemisphereIrradianceRgb: [0, 0, 0],
        groundHemisphereIrradianceRgb: [0, 0, 0],
    };
    for (const field of [rain, virga, fog]) {
        assert.ok(field, "the owned field exists");
        const event = {
            field,
            extinctionRgbKm: field.optics.extinctionRgbKm.map((value) =>
                Math.max(0.01, value * 0.1)),
            irradianceAtSample: incident,
            parentCoupling: parentCouplingFor(field),
            angles: eventAngles,
        };
        const lit = hydrometeors.integrateHydrometeorPassiveSegmentReference(
            [event], 0.1);
        const shadowed = hydrometeors.integrateHydrometeorPassiveSegmentReference([{
            ...event,
            parentCoupling: parentCouplingFor(field, {
                sun: passiveTransfer([0, 0, 0]),
            }),
        }], 0.1);
        assert.ok(lit.sourceCoefficientRgbKm.some((value) => value > 0));
        assert.deepEqual(shadowed.sourceCoefficientRgbKm, [0, 0, 0]);
        assert.ok(hydrometeors.hydrometeorParentCouplingMatches(
            field, event.parentCoupling));
    }
});

test("GPU ABI is vec4 aligned, bounded, and reports dropped records", () => {
    const source = sourceFor({ precipitationKind: "rain", rate: 18 });
    const fields = hydrometeors.createHydrometeorRuntime([source], environment).fields;
    const packed = hydrometeors.packHydrometeorFields(fields, 2);
    assert.deepEqual([...packed.data.slice(0, 4)], [2, 16, 2, fields.length - 2]);
    assert.equal(packed.data.length, (1 + 2 * 16) * 4);
    assert.equal(packed.data.byteLength % 16, 0);
    assert.ok([...packed.data].every(Number.isFinite));
});

test("WGSL contract is bounded, world-space, and exposes optical coefficients", () => {
    const wgsl = readFileSync(new URL(
        "../components/backgrounds/sky/hydrometeor-wgsl.ts",
        import.meta.url,
    ), "utf8");
    assert.match(wgsl, /HYDROMETEOR_MAX_FIELDS/);
    assert.match(wgsl, /for \(var index = 0u; index < HYDROMETEOR_MAX_FIELDS/);
    assert.match(wgsl, /wind_displacement_km/);
    assert.match(wgsl, /extinction_rgb_km/);
    assert.match(wgsl, /scattering_albedo_rgb/);
    assert.match(wgsl, /sparse_particle_energy_fraction/);
    assert.match(wgsl, /lighting_response/);
    assert.match(wgsl, /struct HydrometeorLocalIrradianceAtSample/);
    assert.match(wgsl, /atmosphere_attenuated_sun_irradiance_rgb/);
    assert.match(wgsl, /struct HydrometeorParentLightCoupling/);
    assert.match(wgsl, /phase_convolved_scattering_radiance_rgb/);
    assert.match(wgsl, /fn hydrometeor_parent_coupling_matches/);
    assert.match(wgsl, /fn hydrometeor_passive_directional_phase/);
    assert.match(wgsl, /fn hydrometeor_resolve_passive_source_coefficient/);
    assert.match(wgsl, /fn hydrometeor_accumulate_passive_overlap/);
    assert.match(wgsl, /fn hydrometeor_integrate_passive_overlap/);
    assert.match(wgsl, /source_coefficient_rgb_km/);
    assert.match(wgsl, /parent_system_index/);
    assert.match(wgsl, /parent_layer_index/);
    assert.match(wgsl, /hydrometeor_near_particle_appearance/);
    assert.match(wgsl, /phase_path/);
    assert.match(wgsl, /fn hydrometeor_compact_c2/);
    assert.match(wgsl, /fn hydrometeor_fallstreak_channel_weight/);
    assert.match(wgsl, /for \(var lane = 0u; lane < 7u/);
    assert.match(wgsl, /source_emergence/);
    assert.match(wgsl, /terminal_taper/);
    assert.match(wgsl, /fn hydrometeor_precipitation_topology_weight/);
    assert.match(wgsl, /let storm_owned = record\.identity\.x > 1\.5/);
    assert.match(wgsl, /storm_curvature_scale/);
    assert.match(wgsl, /storm_activation/);
    assert.match(wgsl, /storm_overlap/);
    assert.match(wgsl, /fn hydrometeor_surface_topology_weight/);
    assert.match(wgsl, /if \(kind == 0u\)/);
    assert.match(wgsl, /if \(kind == 4u\)/);
    assert.match(wgsl, /if \(kind == 13u\)/);
    assert.match(wgsl, /let vertical_structure = 1\.0/);
    assert.doesNotMatch(wgsl, /screen_uv|frag_coord|background_color/);
});

test("production and Lab authoring paths preserve hydrometeor overrides", () => {
    const sky = readFileSync(new URL(
        "../components/backgrounds/sky/sky.tsx",
        import.meta.url,
    ), "utf8");
    const atmosphere = readFileSync(new URL(
        "../components/backgrounds/sky/atmosphere-canvas.tsx",
        import.meta.url,
    ), "utf8");
    const canvas = readFileSync(new URL(
        "../components/backgrounds/sky/sky-renderer-canvas.tsx",
        import.meta.url,
    ), "utf8");
    const lab = readFileSync(new URL(
        "../app/sky-lab/sky-lab.tsx",
        import.meta.url,
    ), "utf8");
    assert.match(sky, /hydrometeors\?: HydrometeorSceneOverrides/);
    assert.match(sky, /hydrometeors: preview\?\.hydrometeors/);
    assert.match(atmosphere, /hydrometeors\?: HydrometeorSceneOverrides/);
    assert.match(canvas, /createHydrometeorSceneOverrideSignature/);
    assert.match(canvas, /current\.radiance\.hydrometeors/);
    assert.match(canvas, /HYDROMETEOR_MAX_FIELDS,[\s\S]*current\.radiance\.hydrometeors/);
    assert.match(lab, /Weather matrix target/);
    assert.match(lab, /Weather environment/);
    assert.match(lab, /Review perspective/);
    assert.match(lab, /HYDROMETEOR_QUALIFICATION_TARGETS\.map/);
    assert.match(lab, /Previous \$\{label\}/);
    assert.match(lab, /Next \$\{label\}/);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-gate-a-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const moduleNames = [
    "cloud-physical-pass-parity",
    "cloud-production-buffers",
    "cloud-owner-spatial-index",
    "cloud-temporal-reconstruction",
    "cloud-production-frame",
    "cloud-production-gpu-runtime",
    "cloud-gate-a-qualification",
];
for (const name of moduleNames) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}
const physicalSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-physical-sample.ts",
        import.meta.url),
    "utf8",
);
writeFileSync(join(temporaryRoot, "cloud-physical-sample.mjs"),
    ts.transpileModule(physicalSource, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText);
const abiSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-system-abi-v2.ts",
        import.meta.url),
    "utf8",
).replace(/from "\.\/cloud-state-map"/g,
    'from "./cloud-state-map.mjs"')
    .replace(/from "\.\/cloud-scene"/g,
        'from "./cloud-scene.mjs"')
    .replace(/from "\.\/cloud-physical-sample"/g,
        'from "./cloud-physical-sample.mjs"');
writeFileSync(join(temporaryRoot, "cloud-system-abi-v2.mjs"),
    ts.transpileModule(abiSource, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText);
writeFileSync(join(temporaryRoot, "cloud-state-map.mjs"), "export {};\n");
writeFileSync(join(temporaryRoot, "cloud-scene.mjs"), "export {};\n");
writeFileSync(join(temporaryRoot, "cloud-generated-physical-sampler.mjs"), `
export const sampleCloudWeatherSimulationPhysical = (_simulation, position) => ({
  schemaVersion: 1, support: 1, density: 0.5, gradient: [0,1,0],
  velocityKmPerSecond: [0,0,0], ageSeconds: 60,
  liquidWaterContent: 0.2, iceWaterContent: 0.1,
  liquidEffectiveRadiusMicrons: 12, iceEffectiveRadiusMicrons: 35,
  precipitationSource: 0, turbulence: 0.2, temperatureKelvin: 270,
  ownerId: 101, featureId: 0, materialClass: 2,
  signedDistanceKm: -0.1, closestSurfaceKm: position,
  inverseCurvatureKm: 0.5, seam01: 0,
});
`);

const gate = await import(
    new URL(`file://${join(temporaryRoot, "cloud-gate-a-qualification.mjs")}`)
);

const system = {
    schemaVersion: 2,
    physicalSampleSchemaVersion: 1,
    owner: {
        ownerId: 101,
        sourceId: "owner-a",
        recipeId: "cumulus-congestus",
        macroTopology: "thermal-field",
        materialModel: "liquid-convective",
        physicalFoundationAdapter: "specialized-deep-convection",
        atlasRepresentation: "cumulus-congestus",
        centerKm: [0, 3, 0],
        horizontalRadiusKm: [2, 2, 2],
        baseAltitudeKm: 1,
        geometricDepthKm: 4,
        boundaryTransitionKm: 0.2,
        orientationRadians: 0,
        velocityKmPerSecond: [0, 0, 0],
        liquidWaterPathGramsPerSquareMetre: 300,
        iceWaterPathGramsPerSquareMetre: 0,
        liquidEffectiveRadiusMicrons: 12,
        iceEffectiveRadiusMicrons: 35,
        baseTemperatureKelvin: 285,
        topTemperatureKelvin: 260,
        relativeHumidity01: 0.96,
        turbulenceDissipation: 0.3,
        lifecycleAgeSeconds: 60,
        lifecycleProgress01: 0.4,
        precipitationRate: 0,
        featureStart: 0,
        featureCount: 0,
        generation: 0,
    },
    features: [],
    events: [],
};
const simulation = {
    step: 2,
    timeSeconds: 60,
    owners: [{
        active: true,
        numericId: 101,
        centerEastKm: 0,
        centerNorthKm: 0,
        baseAltitudeKm: 1,
        geometricDepthKm: 4,
        radiusEastKm: 2,
        radiusNorthKm: 2,
    }],
    features: [],
};
const runtime = {
    simulation,
    systemsV2: [system],
};
const capacities = {
    productionCapacities: {
        owners: 4,
        features: 8,
        events: 8,
        eventReferences: 64,
    },
    auxiliaryCapacities: {
        spatialCells: 128,
        spatialOwnerReferences: 512,
        temporalDecisions: 8,
    },
};

const sharedSample = () => ({
    schemaVersion: 1,
    support: 1,
    density: 0.5,
    gradient: [0, 1, 0],
    velocityKmPerSecond: [0, 0, 0],
    ageSeconds: 60,
    liquidWaterContent: 0.2,
    iceWaterContent: 0.1,
    liquidEffectiveRadiusMicrons: 12,
    iceEffectiveRadiusMicrons: 35,
    precipitationSource: 0,
    turbulence: 0.2,
    temperatureKelvin: 270,
    ownerId: 101,
    featureId: 0,
    materialClass: 2,
    signedDistanceKm: -0.1,
    closestSurfaceKm: [0, 3, 0],
    inverseCurvatureKm: 0.5,
    seam01: 0,
});
const providers = [
    { pass: "camera", sample: sharedSample },
    { pass: "light-volume", sample: sharedSample },
    { pass: "atmosphere-shadow", sample: sharedSample },
    { pass: "hydrometeor", sample: sharedSample },
    { pass: "reference", sample: sharedSample },
];

test("Gate A contract can pass while live integration remains truthfully blocked", () => {
    const result = gate.qualifyCloudGateA({
        runtime,
        samplePositionsKm: [[0, 3, 0]],
        providers,
        ...capacities,
    });
    assert.equal(result.contractReady, true);
    assert.equal(result.gateAReady, false);
    assert.equal(result.productionFrame.issues.length, 0);
    assert.equal(result.gpuUploadPlan.complete, true);
    assert.equal(result.parity.valid, true);
    for (const component of [
        "camera-transport", "light-volume", "atmosphere-shadow",
        "hydrometeors", "temporal-reconstruction",
    ]) assert.ok(result.blockers.includes(`not-live-integrated:${component}`));
    const summary = gate.cloudGateAQualificationSummary(result);
    assert.equal(summary.contractReady, true);
    assert.equal(summary.gateAReady, false);
    assert.equal("productionFrame" in summary, false);
});

test("Gate A closes only when every required component is live integrated", () => {
    const migration = gate.CURRENT_CLOUD_GATE_A_MIGRATION.map((record) => ({
        ...record,
        state: "live-integrated",
    }));
    const result = gate.qualifyCloudGateA({
        runtime,
        samplePositionsKm: [[0, 3, 0]],
        providers,
        migration,
        ...capacities,
    });
    assert.equal(result.contractReady, true);
    assert.equal(result.gateAReady, true);
    assert.deepEqual(result.blockers, []);
});

test("sample lattice is deterministic and camera independent", () => {
    const first = gate.createCloudGateASamplePositions(simulation, 5);
    const second = gate.createCloudGateASamplePositions(simulation, 5);
    assert.deepEqual(first, second);
    assert.equal(first.length, 5);
    assert.deepEqual(first[0], [0, 3, 0]);
    assert.ok(first.every((position) => position.length === 3));
});

test("parity failure remains a contract blocker after migration claims", () => {
    const migration = gate.CURRENT_CLOUD_GATE_A_MIGRATION.map((record) => ({
        ...record,
        state: "live-integrated",
    }));
    const divergentProviders = providers.map((provider) =>
        provider.pass === "hydrometeor" ? {
            ...provider,
            sample: () => ({ ...sharedSample(), density: 0.1 }),
        } : provider);
    const result = gate.qualifyCloudGateA({
        runtime,
        samplePositionsKm: [[0, 3, 0]],
        providers: divergentProviders,
        migration,
        ...capacities,
    });
    assert.equal(result.contractReady, false);
    assert.equal(result.gateAReady, false);
    assert.ok(result.blockers.includes("physical-pass-parity-failed"));
});

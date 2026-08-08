import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-bridge-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-system-abi-v2",
    "cloud-production-buffers",
    "cloud-owner-spatial-index",
    "cloud-temporal-reconstruction",
    "cloud-production-frame",
    "cloud-production-gpu-runtime",
    "cloud-production-runtime-bridge",
    "cloud-production-gpu-controller",
]) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const bridge = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-runtime-bridge.mjs")}`)
);
const controllerModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-gpu-controller.mjs")}`)
);

const state = {
    id: "legacy-owner",
    classification: {
        genus: "cumulus",
        species: "congestus",
        varieties: [],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    },
    physical: {
        baseAltitudeKm: 1,
        geometricDepthKm: 4,
        coverageOktas: 4,
        thermodynamics: {
            baseTemperatureKelvin: 285,
            topTemperatureKelvin: 260,
            relativeHumidity: 0.96,
            environmentalLapseRate: 6.5,
            stabilityIndex: 0.2,
            verticalVelocity: 8,
            entrainment: 0.2,
        },
        kinematics: {
            windSpeed: 10,
            windDirection: 0,
            verticalShear: 4,
            turbulenceIntegralScaleKm: 0.5,
            turbulenceDissipation: 0.3,
        },
        condensate: {
            liquidWaterPath: 300,
            iceWaterPath: 0,
            liquidFraction: 1,
            dropletEffectiveRadius: 12,
            iceEffectiveRadius: 35,
        },
        precipitation: {
            kind: "none",
            rate: 0,
            terminalVelocity: 6,
            evaporationDepthKm: 0,
        },
        formation: {
            liftingCondensationLevelKm: 1,
            levelOfFreeConvectionKm: 1.1,
            equilibriumLevelKm: 10,
            inversionBaseKm: null,
            inversionStrengthKelvin: 0,
            freezingLevelKm: 3.2,
            shearLayerBaseKm: 1,
            shearLayerTopKm: 5,
        },
    },
    extent: {
        centerEastKm: 0,
        centerNorthKm: 0,
        majorRadiusKm: 2,
        minorRadiusKm: 2,
        orientation: 0,
        boundaryTransitionKm: 0.2,
    },
    organization: {
        kind: "point-process",
        distribution: "clustered",
        meanSpacingKm: 1,
        minimumSeparationKm: 0.2,
        clusterRadiusKm: 2,
        anisotropy: 0,
        orientation: 0,
    },
    lifecycle: {
        stage: "growing",
        stageProgress: 0.4,
        ageSeconds: 60,
        cloudTopRiseRate: 8,
        condensateTendency: 0.2,
        glaciationRate: 0,
        precipitationEfficiency: 0,
        outflowSpeed: 0,
    },
};

const runtime = (legacyFeatureData = new Float32Array([0, 1, 0])) => ({
    signature: "legacy-runtime",
    systems: [{
        layerIndex: 0,
        systemIndex: 0,
        seeds: [1, 2, 3, 4],
        topologyExemplar: {},
        atlasDeterministicVariant: 0,
        state,
        compiled: {
            sourceId: state.id,
            classification: state.classification,
            recipeId: "cumulus-congestus",
            macroTopology: "thermal-field",
            materialModel: "liquid-convective",
        },
    }],
    diagnostics: [],
    packedSystemData: {
        data: new Float32Array(),
        count: 1,
        capacity: 36,
        dropped: 0,
    },
    legacyFeatureData,
    morphologyRequests: [],
    morphologyOwnerLayers: [],
    compositionQualifications: [],
});

const migratedFeature = {
    id: "legacy-owner:pileus",
    parentOwnerId: "legacy-owner",
    kind: "pileus",
    attachmentKm: [0, 5.1, 0],
    scaleKm: [1, 0.2, 1],
    orientationRadians: 0,
    lifecycleProgress01: 0.4,
    active: true,
    generation: 0,
    materialClass: "liquid-cloud",
};

const compile = (options = {}) => bridge.compileCloudSystemRuntimeProductionV1({
    runtime: runtime(options.legacyFeatureData),
    frameIndex: options.frameIndex ?? 1,
    simulationTimeSeconds: options.simulationTimeSeconds ?? 60,
    featureResolver: options.featureResolver,
    legacyFeaturesFullyMigrated: options.legacyFeaturesFullyMigrated,
    bufferCapacities: options.bufferCapacities ?? {
        owners: 4,
        features: 8,
        events: 8,
        eventReferences: 64,
    },
    gpuCapacities: options.gpuCapacities,
});

test("legacy runtime migration remains incomplete until occupied feature slots have parity evidence", () => {
    const pending = compile();
    assert.equal(pending.systemsV2.length, 1);
    assert.equal(pending.migration.pendingLegacyFeatureMigration, true);
    assert.equal(pending.productionReady, false);
    assert.ok(pending.diagnostics.some((value) =>
        value.includes("legacy-feature-data")));

    const migrated = compile({
        featureResolver: () => [migratedFeature],
        legacyFeaturesFullyMigrated: true,
    });
    assert.equal(migrated.migration.migratedFeatures, 1);
    assert.equal(migrated.migration.pendingLegacyFeatureMigration, false);
    assert.equal(migrated.migration.rendererMigrationComplete, true);
    assert.equal(migrated.productionReady, true);
    assert.equal(migrated.uploadPlan.complete, true);
});

test("GPU controller skips unchanged frames and recreates resources only when capacity grows", () => {
    const firstPlan = compile({
        legacyFeatureData: new Float32Array(),
        frameIndex: 3,
        bufferCapacities: {
            owners: 2,
            features: 2,
            events: 2,
            eventReferences: 16,
        },
        gpuCapacities: {
            spatialCells: 32,
            spatialOwnerReferences: 64,
            temporalDecisions: 2,
        },
    }).uploadPlan;
    const largerPlan = compile({
        legacyFeatureData: new Float32Array(),
        frameIndex: 4,
        simulationTimeSeconds: 120,
        bufferCapacities: {
            owners: 8,
            features: 16,
            events: 16,
            eventReferences: 128,
        },
        gpuCapacities: {
            spatialCells: 128,
            spatialOwnerReferences: 256,
            temporalDecisions: 8,
        },
    }).uploadPlan;

    const created = [];
    const writes = [];
    const device = {
        queue: {
            writeBuffer(buffer, bufferOffset, data, dataOffset, size) {
                writes.push({
                    buffer,
                    bufferOffset,
                    byteLength: size ?? data.byteLength,
                    dataOffset: dataOffset ?? 0,
                });
            },
        },
        createBuffer(descriptor) {
            const buffer = {
                ...descriptor,
                destroyed: false,
                destroy() { this.destroyed = true; },
            };
            created.push(buffer);
            return buffer;
        },
    };
    const controller = controllerModule.createCloudProductionGpuControllerV1(
        device,
    );
    const firstUpload = controller.upload(firstPlan);
    assert.equal(firstUpload.uploaded, true);
    assert.equal(firstUpload.recreated, true);
    assert.equal(controller.recreationCount, 1);
    assert.equal(controller.uploadCount, 1);
    assert.equal(
        controllerModule.cloudProductionGpuBindGroupEntriesV1(
            controller.resources,
        ).length,
        15,
    );

    const writeCount = writes.length;
    const unchanged = controller.upload(firstPlan);
    assert.equal(unchanged.skippedUnchanged, true);
    assert.equal(writes.length, writeCount);

    const larger = controller.upload(largerPlan);
    assert.equal(larger.uploaded, true);
    assert.equal(larger.recreated, true);
    assert.equal(controller.recreationCount, 2);
    assert.equal(controller.uploadCount, 2);
    assert.ok(created.some(({ destroyed }) => destroyed));
    controller.destroy();
    assert.equal(controller.resources, null);
});

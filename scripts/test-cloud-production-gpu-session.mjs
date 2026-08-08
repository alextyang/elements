import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-gpu-session-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-system-abi-v2",
    "cloud-production-buffers",
    "cloud-owner-spatial-index",
    "cloud-temporal-reconstruction",
    "cloud-production-frame",
    "cloud-production-gpu-runtime",
    "cloud-production-gpu-session",
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

const gpu = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-gpu-runtime.mjs")}`)
);
const sessionModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-gpu-session.mjs")}`)
);

const system = ({
    ownerId,
    centerKm,
    velocityKmPerSecond = [0, 0, 0],
    lifecycleAgeSeconds = 60,
}) => ({
    schemaVersion: 2,
    physicalSampleSchemaVersion: 1,
    owner: {
        ownerId,
        sourceId: `owner-${ownerId}`,
        recipeId: "cumulus-congestus",
        macroTopology: "thermal-field",
        materialModel: "liquid-convective",
        physicalFoundationAdapter: "specialized-deep-convection",
        atlasRepresentation: "cumulus-congestus",
        centerKm,
        horizontalRadiusKm: [2, 2, 2],
        baseAltitudeKm: 1,
        geometricDepthKm: 4,
        boundaryTransitionKm: 0.2,
        orientationRadians: 0,
        velocityKmPerSecond,
        liquidWaterPathGramsPerSquareMetre: 300,
        iceWaterPathGramsPerSquareMetre: 0,
        liquidEffectiveRadiusMicrons: 12,
        iceEffectiveRadiusMicrons: 35,
        baseTemperatureKelvin: 285,
        topTemperatureKelvin: 260,
        relativeHumidity01: 0.96,
        turbulenceDissipation: 0.3,
        lifecycleAgeSeconds,
        lifecycleProgress01: 0.4,
        precipitationRate: 0,
        featureStart: 0,
        featureCount: 0,
        generation: 0,
    },
    features: [],
    events: [],
});

const mockDevice = () => {
    const created = [];
    const writes = [];
    return {
        created,
        writes,
        device: {
            queue: {
                writeBuffer(buffer, offset, data) {
                    writes.push({ buffer, offset, byteLength: data.byteLength });
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
        },
    };
};

const options = {
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
    spatialIndex: { cellSizeKm: 4 },
};

test("persistent GPU session reuses allocations and owner-aware history", () => {
    const { device, created, writes } = mockDevice();
    const session = new sessionModule.CloudProductionGpuSessionV1(
        device,
        options,
    );
    const first = system({
        ownerId: 101,
        centerKm: [0, 3, 0],
        velocityKmPerSecond: [0.01, 0, 0],
    });
    const initial = session.update({
        systems: [first],
        frameIndex: 1,
        simulationTimeSeconds: 60,
    });
    assert.equal(initial.uploaded, true);
    assert.equal(initial.resourcesCreated, true);
    assert.equal(created.length, 15);
    assert.equal(writes.length, 15);
    assert.equal(session.bindGroupEntries().length, 15);
    assert.deepEqual(
        session.bindGroupEntries().map(({ binding }) => binding),
        Object.values(gpu.CLOUD_PRODUCTION_GPU_BINDINGS),
    );

    const advected = system({
        ownerId: 101,
        centerKm: [0.6, 3, 0],
        velocityKmPerSecond: [0.01, 0, 0],
        lifecycleAgeSeconds: 120,
    });
    const next = session.update({
        systems: [advected],
        frameIndex: 2,
        simulationTimeSeconds: 120,
    });
    assert.equal(next.uploaded, true);
    assert.equal(next.resourcesCreated, false);
    assert.equal(created.length, 15);
    assert.equal(writes.length, 30);
    assert.equal(next.frame.temporal.decisions[0].action, "reuse");
    assert.equal(session.snapshot().frameCount, 2);
    assert.equal(
        session.snapshot().uploadedFrameFingerprint,
        next.frame.fingerprint,
    );

    session.destroy();
    assert.equal(session.snapshot().destroyed, true);
    assert.equal(session.bindGroupEntries().length, 0);
    assert.ok(created.every(({ destroyed }) => destroyed));
    assert.throws(() => session.update({
        systems: [advected],
        frameIndex: 3,
        simulationTimeSeconds: 180,
    }), /Destroyed cloud production GPU session/);
});

test("GPU session fails closed when fixed production capacity truncates owners", () => {
    const { device, writes } = mockDevice();
    const session = new sessionModule.CloudProductionGpuSessionV1(device, {
        ...options,
        productionCapacities: {
            ...options.productionCapacities,
            owners: 1,
        },
    });
    const result = session.update({
        systems: [
            system({ ownerId: 101, centerKm: [0, 3, 0] }),
            system({ ownerId: 202, centerKm: [0, 3, 8] }),
        ],
        frameIndex: 1,
        simulationTimeSeconds: 60,
    });
    assert.equal(result.uploadPlan.complete, false);
    assert.equal(result.uploaded, false);
    assert.equal(writes.length, 0);
    assert.ok(result.uploadIssues.some(({ code }) =>
        code === "incomplete-frame-rejected"));
    assert.equal(session.snapshot().frameCount, 0);
    session.destroy();
});

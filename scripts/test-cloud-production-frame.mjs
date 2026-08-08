import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-production-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-system-abi-v2",
    "cloud-production-buffers",
    "cloud-owner-spatial-index",
    "cloud-temporal-reconstruction",
    "cloud-production-frame",
    "cloud-physical-pass-parity",
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

const buffers = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-buffers.mjs")}`)
);
const spatial = await import(
    new URL(`file://${join(temporaryRoot, "cloud-owner-spatial-index.mjs")}`)
);
const temporal = await import(
    new URL(`file://${join(temporaryRoot, "cloud-temporal-reconstruction.mjs")}`)
);
const production = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-frame.mjs")}`)
);
const parity = await import(
    new URL(`file://${join(temporaryRoot, "cloud-physical-pass-parity.mjs")}`)
);

const apiSource = readFileSync(
    new URL("../app/api/cloud-generation/route.ts", import.meta.url),
    "utf8",
);

const feature = (id, parentOwnerId, parentOwnerNumericId) => ({
    id,
    featureId: id * 10,
    parentOwnerId,
    parentOwnerNumericId,
    kind: "pileus",
    attachmentKm: [0, 2, 0],
    scaleKm: [1, 0.2, 1],
    orientationRadians: 0,
    lifecycleProgress01: 0.5,
    active: true,
    generation: 0,
    materialClass: "liquid-cloud",
});

const event = {
    id: "shared-growth-event",
    step: 4,
    simulationTimeSeconds: 60,
    kind: "growth",
    ownerIds: [101, 202],
    featureIds: [1010, 2020],
    parentEventIds: [],
    payload: { condensateDelta: 2.5 },
};

const system = ({
    ownerId,
    sourceId,
    centerKm,
    velocityKmPerSecond = [0, 0, 0],
    generation = 0,
    lifecycleAgeSeconds = 60,
    ownerEvents = [event],
}) => ({
    schemaVersion: 2,
    physicalSampleSchemaVersion: 1,
    owner: {
        ownerId,
        sourceId,
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
        featureCount: 1,
        generation,
    },
    features: [feature(ownerId, sourceId, ownerId)],
    events: ownerEvents,
});

const first = system({
    ownerId: 101,
    sourceId: "owner-a",
    centerKm: [0, 3, 0],
    velocityKmPerSecond: [0.01, 0, 0],
});
const second = system({
    ownerId: 202,
    sourceId: "owner-b",
    centerKm: [0, 3, 10],
});

test("production buffers flatten owners, globally rebase features, and deduplicate events", () => {
    const packed = buffers.buildCloudProductionBuffersV1([second, first], {
        owners: 4,
        features: 8,
        events: 8,
        eventReferences: 64,
    });
    assert.equal(packed.ownerCount, 2);
    assert.equal(packed.featureCount, 2);
    assert.equal(packed.eventCount, 1);
    assert.deepEqual(packed.ownerOffsets.map(({ ownerId }) => ownerId), [101, 202]);
    assert.deepEqual(packed.ownerOffsets.map(({ featureStart }) => featureStart), [0, 1]);
    assert.equal(packed.ownerUints[5], 0);
    assert.equal(packed.ownerUints[8 + 5], 1);
    assert.deepEqual(buffers.validateCloudProductionBuffersV1(packed), []);
    assert.match(packed.fingerprint, /^[0-9a-f]{8}$/);
});

test("fixed capacities report truncation instead of overflowing GPU records", () => {
    const packed = buffers.buildCloudProductionBuffersV1([first, second], {
        owners: 1,
        features: 1,
        events: 1,
        eventReferences: 8,
    });
    assert.equal(packed.ownerCount, 1);
    assert.equal(packed.droppedOwners, 1);
    assert.equal(packed.ownerFloats.length, 32);
    assert.equal(packed.ownerUints.length, 8);
    assert.deepEqual(buffers.validateCloudProductionBuffersV1(packed), []);
});

test("camera-independent DDA traversal returns exact owner intervals in depth order", () => {
    const index = spatial.buildCloudOwnerSpatialIndexV1([first, second], {
        cellSizeKm: 4,
    });
    assert.deepEqual(spatial.validateCloudOwnerSpatialIndexV1(index), []);
    const hits = spatial.queryCloudOwnerRayV1(
        index,
        [0, 3, -12],
        [0, 0, 1],
        40,
    );
    assert.deepEqual(hits.map(({ ownerId }) => ownerId), [101, 202]);
    assert.ok(hits[0].entryDistanceKm < hits[1].entryDistanceKm);
});

test("temporal identity reuses advection, invalidates generations, and retires absent owners", () => {
    const advected = system({
        ownerId: 101,
        sourceId: "owner-a",
        centerKm: [0.6, 3, 0],
        velocityKmPerSecond: [0.01, 0, 0],
        lifecycleAgeSeconds: 120,
        ownerEvents: [],
    });
    const stablePlan = temporal.buildCloudTemporalReconstructionPlanV1(
        [first], [advected], 0, 60,
    );
    assert.equal(stablePlan.decisions[0].action, "reuse");
    assert.equal(stablePlan.decisions[0].reuseWeight, 1);

    const regenerated = system({
        ownerId: 101,
        sourceId: "owner-a",
        centerKm: [0.6, 3, 0],
        velocityKmPerSecond: [0.01, 0, 0],
        generation: 1,
        lifecycleAgeSeconds: 120,
        ownerEvents: [],
    });
    const invalidPlan = temporal.buildCloudTemporalReconstructionPlanV1(
        [first, second], [regenerated], 0, 60,
    );
    const ownerDecision = invalidPlan.decisions.find(({ ownerId }) => ownerId === 101);
    const retiredDecision = invalidPlan.decisions.find(({ ownerId }) => ownerId === 202);
    assert.equal(ownerDecision.action, "invalidate");
    assert.ok(ownerDecision.reasons.includes("generation-change"));
    assert.equal(retiredDecision.action, "retire");
    assert.deepEqual(
        temporal.validateCloudTemporalReconstructionPlanV1(invalidPlan),
        [],
    );
});

test("one production-frame boundary joins buffers, culling, and temporal validation", () => {
    const frame = production.compileCloudProductionFrameV1({
        systems: [first, second],
        frameIndex: 4,
        simulationTimeSeconds: 60,
        capacities: {
            owners: 4,
            features: 8,
            events: 8,
            eventReferences: 64,
        },
        spatialIndex: { cellSizeKm: 4 },
    });
    assert.deepEqual(frame.issues, []);
    const summary = production.cloudProductionFrameSummaryV1(frame);
    assert.equal(summary.counts.owners, 2);
    assert.equal(summary.counts.features, 2);
    assert.equal(summary.history.created, 2);
    assert.equal(summary.history.globalReset, false);
    assert.equal("buffers" in production.serializeCloudProductionFrameV1(frame), false);
    assert.equal(
        "buffers" in production.serializeCloudProductionFrameV1(frame, true),
        true,
    );
});

test("the generation API exposes bounded production records without making them default payload", () => {
    assert.match(apiSource, /compileCloudProductionFrameV1/);
    assert.match(apiSource, /serializeCloudProductionFrameV1/);
    assert.match(apiSource, /MAXIMUM_EVENTS = 1_024/);
    assert.match(apiSource, /MAXIMUM_EVENT_REFERENCES = 8_192/);
    assert.match(apiSource, /includeProductionBuffers === true/);
    assert.doesNotMatch(apiSource, /writeFile|unlink|rmSync|exec\(/);
});

test("camera, light, shadow, and hydrometeor passes must preserve one physical sample", () => {
    const sample = {
        schemaVersion: 1,
        support: 0.8,
        density: 0.5,
        gradient: [0, 1, 0],
        velocityKmPerSecond: [0.01, 0, 0],
        ageSeconds: 60,
        liquidWaterContent: 0.3,
        iceWaterContent: 0.1,
        liquidEffectiveRadiusMicrons: 12,
        iceEffectiveRadiusMicrons: 35,
        precipitationSource: 0.02,
        turbulence: 0.2,
        temperatureKelvin: 268,
        ownerId: 101,
        featureId: 0,
        materialClass: 2,
        signedDistanceKm: -0.2,
        closestSurfaceKm: [0, 3, 0],
        inverseCurvatureKm: 0.5,
        seam01: 0,
    };
    const shared = () => sample;
    const providers = [
        { pass: "camera", sample: shared },
        { pass: "light-volume", sample: shared },
        { pass: "atmosphere-shadow", sample: shared },
        { pass: "hydrometeor", sample: shared },
    ];
    const valid = parity.qualifyCloudPhysicalPassParity(
        providers, [[0, 3, 0]], { simulationTimeSeconds: 60 },
    );
    assert.equal(valid.valid, true);
    assert.deepEqual(valid.issues, []);

    const divergent = parity.qualifyCloudPhysicalPassParity([
        ...providers.slice(0, 3),
        {
            pass: "hydrometeor",
            sample: () => ({ ...sample, density: sample.density * 0.7 }),
        },
    ], [[0, 3, 0]], { simulationTimeSeconds: 60 });
    assert.equal(divergent.valid, false);
    assert.ok(divergent.issues.some(({ code }) => code === "density-mismatch"));
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-sample-wgsl-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-system-abi-v2",
    "cloud-production-buffers",
    "cloud-production-gpu-runtime",
    "cloud-production-physical-sample-wgsl",
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

const physical = await import(
    new URL(`file://${join(temporaryRoot, "cloud-physical-sample.mjs")}`)
);
const abi = await import(
    new URL(`file://${join(temporaryRoot, "cloud-system-abi-v2.mjs")}`)
);
const sampleModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-production-physical-sample-wgsl.mjs")}`)
);

const buffers = () => {
    const ownerFloats = new Float32Array(32);
    ownerFloats.set([
        1, 3, 2, 4,
        2, 5, 1, 4,
        0.2, 0.4, 0.01, 0.002,
        -0.003, 400, 200, 12,
        35, 280, 240, 0.95,
        0.3, 60, 0.4, 5,
    ]);
    const ownerUints = new Uint32Array([
        2, 1, 42, 11, 8, 0, 1, 0,
    ]);
    const featureFloats = new Float32Array(24);
    featureFloats.set([
        0, 4, 0, 2,
        0.4, 2, 0, 0.5,
        0.5, 0, 2, 3,
        0.001, 0.002, 0.003, 10,
    ]);
    const featureUints = new Uint32Array([
        99,
        42,
        1,
        0,
        123,
        physical.cloudStableNumericId("ice-cloud"),
        0,
        0,
    ]);
    return {
        schemaVersion: 1,
        capacities: { owners: 1, features: 1, events: 1, eventReferences: 1 },
        ownerCount: 1,
        featureCount: 1,
        eventCount: 0,
        eventReferenceCount: 0,
        droppedOwners: 0,
        droppedFeatures: 0,
        droppedEvents: 0,
        droppedEventReferences: 0,
        headerUints: new Uint32Array([1, 1, 1, 0, 0, 0, 0, 0]),
        ownerFloats,
        ownerUints,
        featureFloats,
        featureUints,
        eventFloats: new Float32Array(4),
        eventUints: new Uint32Array(12),
        eventReferenceUints: new Uint32Array(1),
        ownerOffsets: [{
            ownerId: 42,
            sourceId: "owner-42",
            ownerIndex: 0,
            featureStart: 0,
            featureCount: 1,
        }],
        events: [],
        fingerprint: "fixture",
    };
};

const geometry = {
    support: 0.8,
    density: 0.5,
    signedDistanceKm: -0.2,
    gradient: [0, 2, 0],
    closestSurfaceKm: [1, 4, 2],
    inverseCurvatureKm: 0.25,
    seam01: 0.1,
    localAltitudeFraction01: 0.25,
};

const close = (actual, expected, tolerance = 1e-6) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${actual} != ${expected}`);

test("packed owner decoding derives condensate, phase, motion, and temperature", () => {
    const sample = sampleModule.resolvePackedCloudPhysicalSampleV1(
        buffers(),
        0,
        geometry,
    );
    close(sample.density, 0.4);
    close(sample.liquidWaterContent, 0.04);
    close(sample.iceWaterContent, 0.02);
    close(sample.temperatureKelvin, 270);
    assert.deepEqual(sample.gradient, [0, 1, 0]);
    close(sample.velocityKmPerSecond[0], 0.01);
    close(sample.velocityKmPerSecond[1], 0.002);
    close(sample.velocityKmPerSecond[2], -0.003);
    assert.equal(sample.ageSeconds, 60);
    assert.equal(sample.ownerId, 42);
    assert.equal(sample.featureId, 0);
    assert.equal(sample.materialClass,
        physical.CLOUD_MATERIAL_CLASS_CODES["mixed-phase-cloud"]);
    assert.deepEqual(physical.validateCloudPhysicalSample(sample), []);
});

test("owned feature records modify the same condensate and optical sample", () => {
    const sample = sampleModule.resolvePackedCloudPhysicalSampleV1(
        buffers(),
        0,
        geometry,
        0,
    );
    close(sample.density, 0.2);
    close(sample.liquidWaterContent, 0);
    close(sample.iceWaterContent, 0.02);
    close(sample.precipitationSource, 3);
    close(sample.velocityKmPerSecond[0], 0.011);
    close(sample.velocityKmPerSecond[1], 0.004);
    close(sample.velocityKmPerSecond[2], 0);
    assert.equal(sample.ageSeconds, 70);
    assert.equal(sample.featureId, 99);
    assert.equal(sample.materialClass,
        physical.CLOUD_MATERIAL_CLASS_CODES["ice-cloud"]);
});

test("CPU layout constants remain inside the authoritative V2 record strides", () => {
    assert.ok(Math.max(...Object.values(
        sampleModule.CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2,
    )) < abi.CLOUD_OWNER_RECORD_V2_FLOATS);
    assert.ok(Math.max(...Object.values(
        sampleModule.CLOUD_PRODUCTION_OWNER_UINT_LAYOUT_V2,
    )) < abi.CLOUD_OWNER_RECORD_V2_UINTS);
    assert.ok(Math.max(...Object.values(
        sampleModule.CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2,
    )) < abi.CLOUD_FEATURE_RECORD_V2_FLOATS);
    assert.ok(Math.max(...Object.values(
        sampleModule.CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2,
    )) < abi.CLOUD_FEATURE_RECORD_V2_UINTS);
});

test("generated WGSL exposes the same owner/feature sample without reserved identifiers", () => {
    const source = sampleModule.createCloudProductionPhysicalSampleWgsl({
        group: 6,
        bindings: {
            headerUints: 3,
            ownerFloats: 5,
            ownerUints: 7,
            featureFloats: 9,
            featureUints: 11,
        },
    });
    for (const contract of [
        "CloudPhysicalSampleV1",
        "CloudProductionGeometrySampleV1",
        "cloud_production_physical_sample_v1",
        "cloud_production_owner_material_class",
        "cloud_production_feature_material_class",
        "liquid_water_g_m3",
        "ice_water_g_m3",
        "precipitation_source",
        "owner_id",
        "feature_id",
    ]) assert.match(source, new RegExp(`\\b${contract}\\b`));
    for (const binding of [3, 5, 7, 9, 11]) {
        assert.match(source, new RegExp(`@group\\(6\\) @binding\\(${binding}\\)`));
    }
    assert.doesNotMatch(source, /\bactive\b|\bshared\b/);
    assert.doesNotMatch(source, /select\([^;]*\/\s*magnitude/);
    assert.match(source, new RegExp(
        `${physical.cloudStableNumericId("ice-cloud")}u`,
    ));
    assert.throws(() =>
        sampleModule.createCloudProductionPhysicalSampleWgsl({
            group: 0,
            bindings: { headerUints: 1, ownerFloats: 1 },
        }), /bindings must be unique/);
});

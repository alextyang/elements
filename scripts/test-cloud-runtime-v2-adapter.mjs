import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-runtime-v2-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-production-buffers",
    "cloud-owner-spatial-index",
    "cloud-temporal-reconstruction",
    "cloud-production-frame",
    "cloud-runtime-v2-adapter",
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
writeFileSync(join(temporaryRoot, "cloud-physical-sample.mjs"), `
export const cloudStableNumericId = value => value === "duplicate" ? 7 :
  [...value].reduce((hash, character) => ((hash * 33) ^ character.charCodeAt(0)) >>> 0, 5381) || 1;
`);
writeFileSync(join(temporaryRoot, "cloud-system-runtime.mjs"), "export {};\n");
writeFileSync(join(temporaryRoot, "cloud-system-abi-v2.mjs"), `
import { cloudStableNumericId } from "./cloud-physical-sample.mjs";
export const CLOUD_OWNER_RECORD_V2_FLOATS = 32;
export const CLOUD_OWNER_RECORD_V2_UINTS = 8;
export const CLOUD_FEATURE_RECORD_V2_FLOATS = 24;
export const CLOUD_FEATURE_RECORD_V2_UINTS = 8;
export const migrateCompiledCloudSystemV1 = (legacy, state, options) => ({
  schemaVersion: 2,
  physicalSampleSchemaVersion: 1,
  owner: {
    ownerId: cloudStableNumericId(state.id), sourceId: state.id,
    recipeId: legacy.recipeId, macroTopology: legacy.macroTopology,
    materialModel: legacy.materialModel,
    physicalFoundationAdapter: options.physicalFoundationAdapter,
    atlasRepresentation: options.atlasRepresentation,
    centerKm: [state.extent.centerEastKm, 3, state.extent.centerNorthKm],
    horizontalRadiusKm: [2,2,2], baseAltitudeKm: 1, geometricDepthKm: 4,
    boundaryTransitionKm: .2, orientationRadians: 0,
    velocityKmPerSecond: [0,0,0],
    liquidWaterPathGramsPerSquareMetre: 300,
    iceWaterPathGramsPerSquareMetre: 0,
    liquidEffectiveRadiusMicrons: 12, iceEffectiveRadiusMicrons: 35,
    baseTemperatureKelvin: 285, topTemperatureKelvin: 260,
    relativeHumidity01: .95, turbulenceDissipation: .3,
    lifecycleAgeSeconds: 60, lifecycleProgress01: .4,
    precipitationRate: 0, featureStart: 0, featureCount: 0, generation: 0,
  },
  features: [], events: [],
});
export const validateCompiledCloudSystemV2 = value =>
  value.owner.sourceId === "invalid" ? [{ code:"invalid-owner", subject:"owner", message:"invalid" }] : [];
export const packCloudSystemV2 = value => {
  const ownerFloats = new Float32Array(32);
  const ownerUints = new Uint32Array([2,1,value.owner.ownerId,1,1,0,0,0]);
  return { ownerFloats, ownerUints, featureFloats:new Float32Array(0), featureUints:new Uint32Array(0), events:[] };
};
`);

const adapter = await import(
    new URL(`file://${join(temporaryRoot, "cloud-runtime-v2-adapter.mjs")}`)
);

const state = id => ({
    id,
    extent: { centerEastKm: 0, centerNorthKm: 0 },
});
const runtimeSystem = (id, morphologyAssignment = undefined) => ({
    layerIndex: 0,
    systemIndex: 0,
    seeds: [1,2,3,4],
    topologyExemplar: { id: "fixture" },
    atlasDeterministicVariant: 3,
    state: state(id),
    compiled: {
        sourceId: id,
        recipeId: "cumulus-congestus",
        macroTopology: "thermal-field",
        materialModel: "liquid-convective",
    },
    familyProduction: { kind: "convective" },
    morphologyAssignment,
});

const runtime = systems => ({
    signature: "runtime-signature",
    systems,
    diagnostics: [],
});

test("shipping finite owners migrate to stable V2 shadow records", () => {
    const result = adapter.adaptCloudSystemRuntimeV2(runtime([
        runtimeSystem("owner-a"),
        runtimeSystem("owner-b"),
    ]));
    assert.equal(result.complete, true);
    assert.equal(result.productionReady, true);
    assert.equal(result.systemsV2.length, 2);
    assert.deepEqual(result.issues, []);
    assert.ok(result.systemsV2.every(({ owner }) =>
        owner.physicalFoundationAdapter === "legacy-runtime-family-production"));
    assert.ok(result.systemsV2.every(({ owner }) =>
        owner.atlasRepresentation.endsWith("variant-3")));
});

test("legacy morphology dependencies remain explicit warnings", () => {
    const result = adapter.adaptCloudSystemRuntimeV2(runtime([
        runtimeSystem("owner-a", { classification: "mamma" }),
    ]));
    assert.equal(result.complete, true);
    assert.equal(result.productionReady, false);
    assert.equal(result.legacyMorphologyAssignments, 1);
    assert.ok(result.issues.some(({ code, severity }) =>
        code === "legacy-morphology-buffer-required" && severity === "warning"));
});

test("duplicate stable identities and invalid owners fail migration", () => {
    const duplicate = adapter.adaptCloudSystemRuntimeV2(runtime([
        runtimeSystem("duplicate"),
        runtimeSystem("duplicate"),
        runtimeSystem("invalid"),
    ]));
    assert.equal(duplicate.complete, false);
    assert.equal(duplicate.productionReady, false);
    assert.ok(duplicate.issues.some(({ code }) => code === "duplicate-owner-id"));
    assert.ok(duplicate.issues.some(({ code }) => code === "invalid-owner"));
});

test("shadow frame uses the production buffer and temporal contracts", () => {
    const result = adapter.compileCloudRuntimeV2ShadowFrame(
        runtime([runtimeSystem("owner-a")]),
        { frameIndex: 7, simulationTimeSeconds: 120 },
    );
    assert.equal(result.complete, true);
    assert.equal(result.productionReady, true);
    assert.equal(result.frame.frameIndex, 7);
    assert.equal(result.frame.buffers.ownerCount, 1);
    assert.equal(result.frame.temporal.decisions[0].action, "new");
});

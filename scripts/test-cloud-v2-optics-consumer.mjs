import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const source = readFileSync(new URL("cloud-optics-runtime.ts", sourceRoot), "utf8");
const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-v2-optics-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const output = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
writeFileSync(join(temporaryRoot, "cloud-optics-runtime.mjs"), output);
writeFileSync(join(temporaryRoot, "cloud-optics.mjs"), `
export const CLOUD_OPTICS_ICE_HABITS = ["general", "aggregate", "plate", "column"];
export const CLOUD_OPTICS_ROUGHNESSES = ["smooth", "moderate", "severe"];
`);
writeFileSync(join(temporaryRoot, "cloud-system-runtime.mjs"),
    "export const CLOUD_SYSTEM_MAX_COUNT = 36;\n");
writeFileSync(join(temporaryRoot, "cloud-shipping-gpu-registry.mjs"), `
export const attachCloudShippingGpuDeviceV1 = () => ({
    schemaVersion: 1,
    attachmentId: 1,
    bindGroupEntries: () => [],
    snapshot: () => ({}),
    destroy: () => {},
});
`);

const optics = await import(new URL(
    `file://${join(temporaryRoot, "cloud-optics-runtime.mjs")}`,
));

const opticalRow = (id, phase, radius, phaseRow, overrides = {}) => ({
    id,
    phase,
    effectiveRadiusMicrons: radius,
    phaseRow,
    habit: phase === "ice" ? "general" : undefined,
    roughness: phase === "ice" ? "moderate" : undefined,
    massExtinctionRgbM2PerKg: [1, 1, 1],
    singleScatteringAlbedoRgb: [0.99, 0.99, 0.99],
    asymmetryRgb: [0.82, 0.82, 0.82],
    ...overrides,
});
const manifest = {
    rows: [
        opticalRow("liquid-8", "liquid", 8, 0),
        opticalRow("liquid-16", "liquid", 16, 1),
        opticalRow("ice-20", "ice", 20, 2),
        opticalRow("ice-40", "ice", 40, 3),
    ],
    checksums: { phaseTexture: "phase-sha" },
};
const system = {
    layerIndex: 0,
    systemIndex: 0,
    state: { id: "owner-a" },
    compiled: {
        classification: { genus: "cumulus" },
        recipeId: "cumulus-humilis",
        thermodynamics: {
            topTemperatureKelvin: 270,
            verticalVelocity: 1,
        },
        kinematics: { turbulenceDissipation: 0.001 },
        lifecycle: { stage: "mature" },
        precipitation: { kind: "none", rate: 0 },
        material: {
            liquidEffectiveRadiusMicrons: 8,
            iceEffectiveRadiusMicrons: 20,
            liquidFraction01: 0.9,
        },
    },
};
const owner = {
    sourceId: "owner-a",
    liquidEffectiveRadiusMicrons: 16,
    iceEffectiveRadiusMicrons: 40,
    liquidWaterPathGramsPerSquareMetre: 25,
    iceWaterPathGramsPerSquareMetre: 75,
    topTemperatureKelvin: 250,
};

test("shipping binding 24 resolves phase and particle inputs from V2 owners", () => {
    const runtime = {
        signature: "runtime-a",
        systems: [system],
        productionV2: {
            bridge: {
                systemsV2: [{ owner }],
                frame: { fingerprint: "frame-v2" },
            },
        },
    };
    const resolved = optics.createCloudOpticsOwnerRuntime(runtime, manifest);
    assert.equal(resolved.v2OwnerCount, 1);
    assert.equal(resolved.selections[0].source, "v2-owner");
    assert.equal(resolved.selections[0].defaultIceFraction, 0.75);
    assert.equal(resolved.selections[0].topTemperatureKelvin, 250);
    assert.equal(resolved.data[10], 16);
    assert.equal(resolved.data[11], 40);
    assert.match(resolved.signature, /frame-v2$/);
});

test("laboratory runtimes retain an explicit compatibility fallback", () => {
    const resolved = optics.createCloudOpticsOwnerRuntime({
        signature: "legacy",
        systems: [system],
    }, manifest);
    assert.equal(resolved.v2OwnerCount, 0);
    assert.equal(resolved.selections[0].source, "legacy-runtime");
    assert.ok(Math.abs(resolved.selections[0].defaultIceFraction - 0.1) < 1e-12);
    assert.match(resolved.signature, /legacy$/);
});

test("owner-order divergence fails closed before optical data is uploaded", () => {
    assert.throws(() => optics.createCloudOpticsOwnerRuntime({
        signature: "bad",
        systems: [system],
        productionV2: {
            bridge: {
                systemsV2: [{ owner: { ...owner, sourceId: "wrong-owner" } }],
                frame: { fingerprint: "bad-frame" },
            },
        },
    }, manifest), /V2 optical owner order mismatch/);
});

test("the GPU attachment is created without requesting a second adapter", () => {
    assert.match(source, /attachCloudShippingGpuDeviceV1/);
    assert.match(source, /productionV2\.destroy\(\)/);
    assert.doesNotMatch(source, /requestAdapter|requestDevice/);
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { transpileCloudPreviewModuleClosure } from "./lib/cloud-preview-scenarios.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-webgl-materials-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
transpileCloudPreviewModuleClosure({
    sourceRoot: fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url)),
    temporaryRoot,
    rootModuleNames: ["webgl-cloud-shader", "cloud-photograph-benchmark"],
});
const load = (name) => import(pathToFileURL(join(temporaryRoot, `${name}.mjs`)).href);
const { packCloudLayers } = await load("webgl-cloud-shader");
const { CLOUD_PHOTOGRAPH_CASES } = await load("cloud-photograph-benchmark");
const cases = CLOUD_PHOTOGRAPH_CASES.filter(({ id }) =>
    id.endsWith("--day-oblique-natural"));
const sceneFor = (id) => structuredClone(cases.find((entry) =>
    entry.id.startsWith(`${id}--`)).preview.cloudScene);
const layerIndex = (scene) => scene.layers.findIndex(({ present }) => present);

test("all 32 reference components pack finite WebGL material controls", () => {
    assert.equal(cases.length, 32);
    for (const entry of cases) {
        const packed = packCloudLayers(entry.preview.cloudScene, 1_800_000_000);
        assert.equal(packed.active, true, entry.id);
        for (const [name, value] of Object.entries(packed)) {
            if (value instanceof Float32Array) {
                assert.ok(value.every(Number.isFinite), `${entry.id}: ${name}`);
            }
        }
    }
});

test("zero optical depth has no invented extinction floor", () => {
    for (const entry of cases) {
        const scene = structuredClone(entry.preview.cloudScene);
        const index = layerIndex(scene);
        scene.layers[index].opticalDepth = 0;
        assert.equal(packCloudLayers(scene, 0).geometry[index * 4 + 3], 0, entry.id);
    }
});

test("ice optical thickness is distinct from convective water", () => {
    const extinction = (id) => {
        const scene = sceneFor(id);
        const index = layerIndex(scene);
        scene.layers[index].thickness = 1000;
        scene.layers[index].opticalDepth = 0.5;
        return packCloudLayers(scene, 0).geometry[index * 4 + 3];
    };
    const ice = extinction("ci-fibratus");
    const water = extinction("cu-humilis");
    assert.ok(Math.abs(ice * 1000 - 1.5) < 1e-6);
    assert.ok(water > ice * 10);
    for (const id of ["ci-spissatus", "ci-castellanus", "ci-floccus"]) {
        const denseIce = extinction(id);
        assert.ok(Math.abs(denseIce * 1000 - 3) < 1e-6, id);
        assert.ok(denseIce < water / 8, id);
    }
});

test("cloudlet extinction follows material thickness, not empty layer padding", () => {
    const scene = sceneFor("cc-stratiformis");
    const index = layerIndex(scene);
    const values = [400, 800].map((thickness) => {
        scene.layers[index].thickness = thickness;
        return packCloudLayers(scene, 0).geometry[index * 4 + 3];
    });
    assert.ok(Math.abs(values[0] - values[1]) < 1e-6);
});

test("explicit open/closed organization takes priority over random exemplars", () => {
    const scene = sceneFor("cc-stratiformis");
    const index = layerIndex(scene);
    for (const [organization, sign] of [["closed-cell", 1], ["open-cell", -1]]) {
        scene.layers[index].organization = organization;
        assert.ok(packCloudLayers(scene, 0).dynamics[index * 4 + 3] * sign > 0.7);
    }
    scene.layers[index].morphology = { cellularClosure: 0.25 };
    assert.equal(packCloudLayers(scene, 0).dynamics[index * 4 + 3], 0.25);
});

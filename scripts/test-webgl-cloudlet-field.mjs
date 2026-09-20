import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { transpileCloudPreviewModuleClosure } from "./lib/cloud-preview-scenarios.mjs";
import { createWebGlFieldEvaluator } from "./lib/webgl-field-evaluation.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloudlet-field-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
transpileCloudPreviewModuleClosure({
    sourceRoot: fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url)),
    temporaryRoot,
    rootModuleNames: ["webgl-cloudlet-field", "webgl-cloud-shader",
        "webgl-cloud-morphology", "cloud-photograph-benchmark", "cloud-scene"],
});
const load = (name) => import(pathToFileURL(join(temporaryRoot, `${name}.mjs`)).href);
const { CLOUD_CLOUDLET_FIELD_FUNCTIONS } = await load("webgl-cloudlet-field");
const { CLOUD_FUNCTIONS } = await load("webgl-cloud-shader");
const { compileWebGlCloudMorphology } = await load("webgl-cloud-morphology");
const { CLOUD_PHOTOGRAPH_CASES } = await load("cloud-photograph-benchmark");
const { CLOUD_SPECIES_CODE } = await load("cloud-scene");
const hostFunction = (name) => {
    const source = CLOUD_FUNCTIONS.match(new RegExp(
        `(?:float|vec2) ${name}\\([^]*?\\n\\}`))?.[0];
    assert.ok(source, `missing host helper ${name}`);
    return source;
};
const supportHelpers = hostFunction("cloud_packet_depth") + "\n" +
    hostFunction("cloud_material_bounds");
const fieldSource = supportHelpers + "\n" + hostFunction("cloud_rotate2") + "\n" +
    CLOUD_CLOUDLET_FIELD_FUNCTIONS;
const evaluate = createWebGlFieldEvaluator(fieldSource, "cloud_cloudlet_coverage");
const depth = createWebGlFieldEvaluator(supportHelpers, "cloud_packet_depth")({});
const bounds = createWebGlFieldEvaluator(supportHelpers, "cloud_material_bounds")({});

// Real authored Perlin/Worley volume, linearly filtered and repeated like the
// GPU texture. Runtime generation uses a different hash; this tests the actual
// noise distribution, while fresh GPU compilation/rendering remains required.
const base = readFileSync(new URL("../public/assets/sky/cloud-base-rgba8-128.bin", import.meta.url));
const size = 128;
assert.equal(base.byteLength, size ** 3 * 4);
const sampleTexture = (_kind, coordinate) => {
    const grid = coordinate.map((value) => (value - Math.floor(value)) * size - 0.5);
    const lower = grid.map(Math.floor);
    const fraction = grid.map((value, index) => value - lower[index]);
    const result = [0, 0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
        const offset = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
        const cell = lower.map((value, index) => (value + offset[index] + size) % size);
        const weight = offset.reduce((value, high, axis) => value *
            (high ? fraction[axis] : 1 - fraction[axis]), 1);
        const index = ((cell[2] * size + cell[1]) * size + cell[0]) * 4;
        for (let channel = 0; channel < 4; channel++) {
            result[channel] += base[index + channel] / 255 * weight;
        }
    }
    return result;
};
const bindings = {
    u_cloud_seed: [0.19, 0.43, 0.67, 0.83],
    cloud_texture: sampleTexture,
    cos: Math.cos, sin: Math.sin,
};
const field = evaluate(bindings);
const filtered = createWebGlFieldEvaluator(fieldSource, "cloud_cloudlet_filtered")(bindings);
const speciesNames = ["cirrocumulus-stratiformis", "altocumulus-stratiformis",
    "stratocumulus-stratiformis"];
const layers = speciesNames.map((species) => {
    const entry = CLOUD_PHOTOGRAPH_CASES.find(({ id, preview }) =>
        id.endsWith("--day-oblique-natural") &&
        preview.cloudScene.layers.some((layer) => layer.present && layer.species === species));
    const scene = entry.preview.cloudScene;
    const index = scene.layers.findIndex((layer) => layer.present && layer.species === species);
    const layer = scene.layers[index];
    return { ...layer, ...compileWebGlCloudMorphology(scene, layer, index),
        species: CLOUD_SPECIES_CODE[species], macroTopology: 3,
        wind: [Math.cos(layer.windDirection) * layer.windSpeed,
            Math.sin(layer.windDirection) * layer.windSpeed] };
});
const positionAt = (layer, x, z, h) =>
    [x, layer.baseAltitude + layer.thickness * h, z];
const horizontalSamples = (layer, h = 0.48) => Array.from({ length: 1024 }, (_, index) => {
    const period = layer.elementScaleKm * 1000;
    return positionAt(layer, (index % 32 - 16) * period * 0.19,
        (Math.floor(index / 32) - 16) * period * 0.19, h);
});

test("all stratiform cloudlets stay finite and within shared view/light packet bounds", () => {
    const controls = [{}, { elementScaleKm: 0.05, verticalAspect: 0.002, supportBand: 0.02,
        thickness: 20000, crownExpansion: 0, fragmentation: 1, erosionStrength: 1 },
    { elementScaleKm: 300, verticalAspect: 5, supportBand: 0.8,
        thickness: 1, crownExpansion: 1, fragmentation: 0, erosionStrength: 0 },
    { wind: [-0.173, -0.271] }, { wind: [0, 0] }];
    for (const original of layers) {
        for (const override of controls) {
            const layer = { ...original, ...override };
            const [low, high] = bounds(layer, 0, layer.thickness).map((value) => value / layer.thickness);
            for (const closure of [-1, -0.45, 0, 1]) {
                layer.cellularClosure = closure;
                for (let index = 0; index < 80; index++) {
                    const h = -0.2 + index / 79 * 1.4;
                    const position = positionAt(layer, index * 351, index * -913, h);
                    const value = field(position, layer, h, 0.8);
                    assert.ok(Number.isFinite(value) && value >= 0 && value <= 0.8,
                        `${layer.species} / ${JSON.stringify(override)}`);
                    if (h < low || h > high) assert.equal(value, 0);
                    assert.equal(field(position, layer, h, 0), 0);
                }
            }
        }
    }
});

test("filtered cloudlet potential suppresses fine silhouette fragmentation", () => {
    let rawChange = 0;
    let filteredChange = 0;
    let low = 1;
    let high = 0;
    for (let index = 0; index < 200; index++) {
        const coordinate = [index * 0.017, 0.413, index * 0.031];
        const moved = [coordinate[0] + 0.004, coordinate[1], coordinate[2] + 0.002];
        const raw = sampleTexture("base", coordinate)[1];
        const smoothed = filtered(coordinate)[1];
        rawChange += Math.abs(raw - sampleTexture("base", moved)[1]);
        filteredChange += Math.abs(smoothed - filtered(moved)[1]);
        low = Math.min(low, smoothed);
        high = Math.max(high, smoothed);
    }
    assert.ok(filteredChange < rawChange * 0.8,
        `fine variation ${filteredChange / rawChange} was not suppressed`);
    assert.ok(high - low > 0.15, "filter erased the cloudlet population");
});

test("each genus retains rounded supported interiors and clear gaps", () => {
    for (const layer of layers) {
        const values = horizontalSamples(layer).map((position) => field(position, layer, 0.48, 1));
        const occupied = values.filter((value) => value > 0.15).length / values.length;
        const gaps = values.filter((value) => value < 0.01).length / values.length;
        assert.ok(occupied > 0.08 && occupied < 0.92,
            `${layer.species} occupied ${occupied}`);
        assert.ok(gaps > 0.05, `${layer.species} has no clear cell gaps`);
        for (const position of horizontalSamples(layer).filter((_, index) => index % 41 === 0)) {
            let intervals = 0;
            let previous = false;
            for (let step = 0; step < 70; step++) {
                const h = 0.48 + depth(layer) * (-0.85 + step / 69 * 1.7);
                const present = field(positionAt(layer, position[0], position[2], h), layer, h, 1) > 0.01;
                if (present && !previous) intervals++;
                previous = present;
            }
            assert.ok(intervals <= 1, `${layer.species} stacks independent cloudlets vertically`);
        }
    }
});

test("open-cell control changes centres into rims continuously", () => {
    for (const layer of layers) {
        const closed = { ...layer, cellularClosure: 1 };
        const open = { ...layer, cellularClosure: -1 };
        let change = 0;
        for (const position of horizontalSamples(layer)) {
            change += Math.abs(field(position, closed, 0.48, 1) - field(position, open, 0.48, 1));
            const a = field(position, { ...layer, cellularClosure: -0.45 }, 0.48, 1);
            const b = field(position, { ...layer, cellularClosure: -0.4501 }, 0.48, 1);
            assert.ok(Math.abs(a - b) < 0.001, "closure control is discontinuous");
        }
        assert.ok(change / 1024 > 0.15, `${layer.species} ignores cellular closure`);
    }
});

test("cloudlet scale is physical and does not depend on camera or ray direction", () => {
    const layer = layers[1];
    const scaled = { ...layer, elementScaleKm: layer.elementScaleKm * 2,
        thickness: layer.thickness * 2, baseAltitude: layer.baseAltitude * 2 };
    for (const position of horizontalSamples(layer).filter((_, index) => index % 17 === 0)) {
        assert.ok(Math.abs(field(position, layer, 0.48, 0.7) -
            field(position.map((value) => value * 2), scaled, 0.48, 0.7)) < 1e-10);
        const nearby = [...position];
        nearby[0] += 0.01;
        assert.ok(Math.abs(field(position, layer, 0.48, 0.7) -
            field(nearby, layer, 0.48, 0.7)) < 0.002);
    }
});

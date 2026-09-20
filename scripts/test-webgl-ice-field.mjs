import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { transpileCloudPreviewModuleClosure } from "./lib/cloud-preview-scenarios.mjs";
import { createWebGlFieldEvaluator } from "./lib/webgl-field-evaluation.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-ice-field-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
transpileCloudPreviewModuleClosure({
    sourceRoot: fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url)),
    temporaryRoot,
    rootModuleNames: ["webgl-ice-field", "webgl-cloud-morphology",
        "cloud-photograph-benchmark", "cloud-scene"],
});
const load = (name) => import(pathToFileURL(join(temporaryRoot, `${name}.mjs`)).href);
const { CLOUD_ICE_FIELD_FUNCTIONS } = await load("webgl-ice-field");
const { compileWebGlCloudMorphology } = await load("webgl-cloud-morphology");
const { CLOUD_PHOTOGRAPH_CASES } = await load("cloud-photograph-benchmark");
const { CLOUD_SPECIES_CODE } = await load("cloud-scene");

const evaluate = createWebGlFieldEvaluator(CLOUD_ICE_FIELD_FUNCTIONS, "cloud_ice_coverage");
const createField = (texture, seed = [0.19, 0.43, 0.67, 0.83]) =>
    evaluate({ cloud_texture: texture, u_cloud_seed: seed,
        cloud_rotate2: ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle)] });
const texture = (kind, [x, y, z]) => kind === "base" ? [
    0.69 + 0.15 * Math.sin(x * 5.9 + y * 2.3 + z * 4.1),
    0.45 + 0.24 * Math.sin(x * 8.1 - y * 3.7 + z * 5.3),
    0.38 + 0.22 * Math.sin(x * 3.3 + y * 5.1 - z * 2.7), 0.5,
] : [
    0.51 + 0.27 * Math.sin(x * 5.1 + y * 3.7 + z * 4.3),
    0.46 + 0.25 * Math.sin(x * 6.7 - y * 2.9 + z * 8.3),
    0.49 + 0.24 * Math.sin(x * 9.1 + y * 4.7 - z * 6.1), 0.5,
];
const field = createField(texture);
const speciesNames = ["cirrus-fibratus", "cirrus-uncinus", "cirrus-spissatus",
    "cirrus-castellanus", "cirrus-floccus", "cirrostratus-fibratus", "cirrostratus-nebulosus"];
const layers = speciesNames.map((species) => {
    const entry = CLOUD_PHOTOGRAPH_CASES.find(({ id, preview }) =>
        id.endsWith("--day-oblique-natural") &&
        preview.cloudScene.layers.some((layer) => layer.present && layer.species === species));
    assert.ok(entry, species);
    const scene = entry.preview.cloudScene;
    const index = scene.layers.findIndex((layer) => layer.present && layer.species === species);
    const layer = scene.layers[index];
    return {
        ...layer, ...compileWebGlCloudMorphology(scene, layer, index),
        species: CLOUD_SPECIES_CODE[species],
        drift: [0, 0],
        wind: [Math.cos(layer.windDirection) * layer.windSpeed,
            Math.sin(layer.windDirection) * layer.windSpeed],
    };
});
const positionAt = (layer, x, z, h) => [x, layer.baseAltitude + layer.thickness * h, z];
const samples = (layer, override = {}, density = field) => {
    const configured = { ...layer, ...override };
    return Array.from({ length: 240 }, (_, index) => {
        const h = (index % 12 + 0.5) / 12;
        return density(positionAt(configured, (index % 17 - 8) * 1731,
            (index % 19 - 9) * 2117, h), configured, h, 0.8);
    });
};

test("all seven ice fields are finite and bounded across control and texture extremes", () => {
    const constantFields = [0, 0.5, 1].map((value) => createField(() => Array(4).fill(value)));
    const extremes = [{}, {
        elementScaleKm: 0.05, verticalAspect: 0.002, supportBand: 0.02,
        fragmentation: 0, anisotropy: 0.1, shearCoupling: 0,
        sedimentationCoupling: 0, fibreCurl: 0, baseConnectivity: 0,
        crownExpansion: 0, branchOrCrestCount: 0, thickness: 1,
    }, {
        elementScaleKm: 300, verticalAspect: 5, supportBand: 0.8,
        fragmentation: 1, anisotropy: 12, shearCoupling: 1,
        sedimentationCoupling: 1, fibreCurl: 1, baseConnectivity: 1,
        crownExpansion: 1, branchOrCrestCount: 24, thickness: 20000,
    }, { wind: [0, 0] }, { wind: [-0.173, -0.271] }];
    for (const layer of layers) {
        for (const override of extremes) {
            for (const density of [field, ...constantFields]) {
                const values = samples(layer, override, density);
                assert.ok(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
                    `species ${layer.species}, ${JSON.stringify(override)}`);
            }
        }
    }
});

test("ice fields have no density outside their layer or without meteorological support", () => {
    for (const layer of layers) {
        for (const h of [-1, -0.0001, 1.0001, 2]) {
            assert.equal(field(positionAt(layer, 11000, 19000, h), layer, h, 1), 0);
        }
        for (const weather of [-1, 0]) {
            assert.equal(field(positionAt(layer, 11000, 19000, 0.5), layer, 0.5, weather), 0);
        }
        assert.equal(field([0, 10000, 0], { ...layer, species: 0 }, 0.5, 1), 0);
    }
});

test("species resolve different continuous interiors at their authored controls", () => {
    const signatures = layers.map((layer) => samples(layer));
    for (const [index, values] of signatures.entries()) {
        assert.ok(values.some((value) => value > 0.02), `${speciesNames[index]} is empty`);
        for (let other = 0; other < index; other++) {
            const difference = values.reduce((sum, value, sample) =>
                sum + Math.abs(value - signatures[other][sample]), 0) / values.length;
            assert.ok(difference > 0.015, `${speciesNames[index]} aliases ${speciesNames[other]}`);
        }
        const layer = layers[index];
        for (let sample = 0; sample < 60; sample++) {
            const h = (sample % 10 + 0.5) / 10;
            const position = positionAt(layer, (sample - 30) * 891, (sample % 13 - 6) * 997, h);
            const before = field(position, layer, h, 0.8);
            const after = field([position[0] + 0.01, position[1], position[2]], layer, h, 0.8);
            assert.ok(Math.abs(before - after) < 0.003, `${speciesNames[index]} is discontinuous`);
        }
    }
});

test("nebulosus is a connected veil without a hidden fine-noise dependency", () => {
    const calls = [];
    const veil = createField((kind, position) => {
        calls.push(kind);
        return texture(kind, position);
    });
    const layer = layers[6];
    const values = Array.from({ length: 100 }, (_, index) =>
        veil(positionAt(layer, index * 1300, index * -1871, 0.49), layer, 0.49, 0.8));
    assert.ok(values.every((value) => value > 0.6 && value < 0.8));
    assert.ok(calls.every((kind) => kind === "base"));
});

test("vertical aspect changes packet support without rescaling texture height", () => {
    for (const layer of layers) {
        const traces = [0.02, 0.8].map((verticalAspect) => {
            const displaced = [0, 10].map((offset) => {
                const coordinates = [];
                const tracked = createField((kind, position) => {
                    coordinates.push([kind, position[1]]);
                    return texture(kind, position);
                });
                const position = positionAt(layer, 9317, -10317, 0.5);
                position[1] += offset;
                tracked(position, { ...layer, verticalAspect }, 0.5, 0.8);
                return coordinates;
            });
            return displaced[0].map(([kind, height], index) =>
                [kind, displaced[1][index][1] - height]);
        });
        assert.equal(traces[0].length, traces[1].length);
        traces[0].forEach(([kind, delta], index) => {
            assert.equal(kind, traces[1][index][0]);
            assert.ok(Math.abs(delta - traces[1][index][1]) < 1e-12,
                `${layer.species} double-compresses vertical noise`);
        });
    }
});

test("fibratus default packet retains the full-depth baseline while thin packets narrow", () => {
    const layer = { ...layers[0], elementScaleKm: 13, verticalAspect: 0.0525, thickness: 800 };
    const fullDepth = samples(layer);
    assert.deepEqual(fullDepth, samples(layer, { verticalAspect: 1 }),
        "the authored fibratus baseline must not acquire an extra altitude envelope");
    const thin = samples(layer, { verticalAspect: 0.002 });
    assert.ok(thin.reduce((sum, value) => sum + value, 0) <
        fullDepth.reduce((sum, value) => sum + value, 0) * 0.4);
});

test("species controls alter their supported anatomy", () => {
    const controls = ["fibreCurl", "sedimentationCoupling", "fragmentation",
        "branchOrCrestCount", "crownExpansion", "fibreCurl", "verticalAspect"];
    for (const [index, layer] of layers.entries()) {
        const control = controls[index];
        const lower = samples(layer, { [control]: control === "verticalAspect" ? 0.002 : 0 });
        const upper = samples(layer, { [control]: control === "branchOrCrestCount" ? 24 : 1 });
        const change = lower.reduce((sum, value, sample) => sum + Math.abs(value - upper[sample]), 0);
        assert.ok(change > 0.05, `${speciesNames[index]} ignores ${control}`);
    }
});

test("compact cirrus populations have finite world support independent of drift coordinates", () => {
    for (const original of [layers[3], layers[4]]) {
        for (const drift of [[0, 0], [120000, 750000]]) {
            const layer = { ...original, drift };
            for (const h of [0.2, 0.32, 0.64, 0.8]) {
                for (const [x, z] of [[60000, 0], [-60000, 0], [0, 60000], [0, -60000]]) {
                    const position = positionAt(layer,
                        x + drift[0] + layer.wind[0] * layer.shear * h * 90,
                        z + drift[1] + layer.wind[1] * layer.shear * h * 90, h);
                    assert.equal(field(position, layer, h, 1), 0);
                }
            }
        }
    }
});

test("floccus head source removes the host's kilometre-scale altitude shear", () => {
    const layer = layers[4];
    const traces = [0.58, 0.70].map((h) => {
        const coordinates = [];
        const tracked = createField((kind, position) => {
            coordinates.push([kind, position]);
            return texture(kind, position);
        });
        // A source column after the host's exact bulk/height advection.
        const position = positionAt(layer,
            8000 + layer.wind[0] * layer.shear * h * 90,
            -5000 + layer.wind[1] * layer.shear * h * 90, h);
        tracked(position, layer, h, 0.8);
        return coordinates;
    });
    // Read 0 is the shared pre-branch broad source; read 1 is the compact
    // group's own source, which must remain attached across height.
    traces[0][1][1].forEach((value, index) =>
        assert.ok(Math.abs(value - traces[1][1][1][index]) < 1e-12));
});

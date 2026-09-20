import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";
import { transpileCloudPreviewModuleClosure } from "./lib/cloud-preview-scenarios.mjs";
import { createWebGlFieldEvaluator } from "./lib/webgl-field-evaluation.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-wave-field-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
transpileCloudPreviewModuleClosure({
    sourceRoot: fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url)),
    temporaryRoot,
    rootModuleNames: ["webgl-wave-field", "webgl-cloud-morphology",
        "cloud-photograph-benchmark", "cloud-scene"],
});
const load = (name) => import(pathToFileURL(join(temporaryRoot, `${name}.mjs`)).href);
const { CLOUD_WAVE_FIELD_FUNCTIONS } = await load("webgl-wave-field");
const { compileWebGlCloudMorphology } = await load("webgl-cloud-morphology");
const { CLOUD_PHOTOGRAPH_CASES } = await load("cloud-photograph-benchmark");
const { CLOUD_SPECIES_CODE } = await load("cloud-scene");
const evaluate = createWebGlFieldEvaluator(CLOUD_WAVE_FIELD_FUNCTIONS, "cloud_wave_coverage");

// Actual authored base-volume distribution, trilinearly filtered with repeat.
// This is numerical coverage only: it neither compiles GLSL nor substitutes
// for runtime-noise and real-GPU visual acceptance after production integration.
const base = readFileSync(new URL("../public/assets/sky/cloud-base-rgba8-128.bin", import.meta.url));
const size = 128;
assert.equal(base.byteLength, size ** 3 * 4);
const texture = (_kind, coordinate) => {
    const grid = coordinate.map((value) => (value - Math.floor(value)) * size - 0.5);
    const lower = grid.map(Math.floor);
    const fraction = grid.map((value, index) => value - lower[index]);
    const result = [0, 0, 0, 0];
    for (let corner = 0; corner < 8; corner++) {
        const offset = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
        const cell = lower.map((value, axis) => (value + offset[axis] + size) % size);
        const weight = offset.reduce((value, high, axis) => value *
            (high ? fraction[axis] : 1 - fraction[axis]), 1);
        const index = ((cell[2] * size + cell[1]) * size + cell[0]) * 4;
        for (let channel = 0; channel < 4; channel++) {
            result[channel] += base[index + channel] / 255 * weight;
        }
    }
    return result;
};
const createField = (sample = texture, seed = [0.19, 0.43, 0.67, 0.83]) => evaluate({
    cloud_texture: sample, u_cloud_seed: seed,
    floor: Math.floor, sin: Math.sin, cos: Math.cos,
});
const field = createField();
const smoothField = createField(() => [0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0]);
const speciesNames = ["cirrocumulus-lenticularis", "altocumulus-lenticularis",
    "stratocumulus-lenticularis", "altocumulus-volutus", "stratocumulus-volutus"];
const authoredLayers = speciesNames.map((species) => {
    const entry = CLOUD_PHOTOGRAPH_CASES.find(({ id, preview }) =>
        id.endsWith("--day-oblique-natural") &&
        preview.cloudScene.layers.some((layer) => layer.present && layer.species === species));
    assert.ok(entry, species);
    const scene = entry.preview.cloudScene;
    const index = scene.layers.findIndex((layer) => layer.present && layer.species === species);
    const layer = scene.layers[index];
    return { ...layer, ...compileWebGlCloudMorphology(scene, layer, index),
        species: CLOUD_SPECIES_CODE[species],
        wind: [Math.cos(layer.windDirection) * layer.windSpeed,
            Math.sin(layer.windDirection) * layer.windSpeed] };
});
const configured = (species, controls = {}) => ({
    ...authoredLayers.find((layer) => layer.species === species),
    baseAltitude: 5000, thickness: 2000, wind: [10, 0],
    elementScaleKm: 2, verticalAspect: 0.15, anisotropy: 2,
    macroElementCount: 3, branchOrCrestCount: 2, waveAmplitude: 0.8,
    supportBand: 0.12, erosionStrength: 0.5, shearCoupling: 0.35,
    ...controls,
});
const positionAt = (layer, x, z, h) => [x, layer.baseAltitude + layer.thickness * h, z];
const densityAt = (layer, x, z, h, sample = field, center = [0, 0], weather = 1) =>
    sample(positionAt(layer, x, z, h), center, layer, h, weather);
const packetDepth = (layer) => Math.min(0.72, Math.max(0.00001,
    Math.max(50, layer.elementScaleKm * 1000) * Math.max(0.002, layer.verticalAspect) /
    Math.max(1, layer.thickness)));
const frac = (value) => value - Math.floor(value);
const points = (layer, count = 1600) => {
    const scale = layer.elementScaleKm * 1000;
    const roll = layer.species === 27 || layer.species === 14;
    const cross = roll ? packetDepth(layer) * layer.thickness : scale / Math.sqrt(layer.anisotropy);
    const axial = scale * Math.sqrt(layer.anisotropy) * (roll ? 1 : layer.macroElementCount * 1.35);
    return Array.from({ length: count }, (_, index) => {
        const x = (frac(index * 0.754877666) - 0.5) * cross * (layer.branchOrCrestCount + 1) * 1.8;
        const z = (frac(index * 0.569840296) - 0.5) * axial;
        const h = 0.5 + (frac(index * 0.438579021) - 0.5) * packetDepth(layer) * 1.4;
        return [x, z, h];
    });
};
const occupiedRuns = (values, threshold = 0.02) => values.reduce((state, value) => {
    const occupied = value > threshold;
    return { count: state.count + Number(occupied && !state.occupied), occupied };
}, { count: 0, occupied: false }).count;

test("all five authored species produce finite supported condensate", () => {
    for (const layer of authoredLayers) {
        // Rotate sampled local coordinates into the same physical wind frame.
        const length = Math.hypot(...layer.wind);
        const axis = length > 0 ? layer.wind.map((value) => value / length) : [1, 0];
        const values = points(layer).map(([x, z, h]) => densityAt(layer,
            x * axis[0] - z * axis[1], x * axis[1] + z * axis[0], h));
        assert.ok(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
        assert.ok(values.some((value) => value > 0.10), `species ${layer.species} is empty`);
        assert.ok(values.some((value) => value === 0), `species ${layer.species} has no detached gaps`);
    }
});

test("control extremes, zero wind and texture endpoints stay bounded", () => {
    const overrides = [{}, { elementScaleKm: 0.05, verticalAspect: 0.002,
        thickness: 20000, anisotropy: 0.1, macroElementCount: 128,
        branchOrCrestCount: 24, supportBand: 0.02, erosionStrength: 1 },
    { elementScaleKm: 300, verticalAspect: 5, thickness: 1, anisotropy: 12,
        macroElementCount: 1, branchOrCrestCount: 0.25, supportBand: 0.8 },
    { wind: [0, 0] }, { wind: [-0.173, -0.271] }];
    for (const authored of authoredLayers) {
        for (const override of overrides) {
            const layer = configured(authored.species, override);
            for (const sample of [field, ...[0, 0.5, 1].map((value) =>
                createField(() => Array(4).fill(value)))]) {
                for (const [x, z, h] of points(layer, 90)) {
                    const value = densityAt(layer, x, z, h, sample, [0, 0], 0.7);
                    assert.ok(Number.isFinite(value) && value >= 0 && value <= 0.7,
                        `${layer.species}: ${JSON.stringify(override)} -> ${value}`);
                }
            }
        }
    }
});

test("world, altitude, species and weather support are exactly bounded", () => {
    for (const authored of authoredLayers) {
        const layer = configured(authored.species);
        for (const h of [-1, -0.00001, 0, 1, 1.00001, 2]) {
            assert.equal(densityAt(layer, 0, 0, h), 0);
        }
        for (const [x, z] of [[1e10, 0], [-1e10, 0], [0, 1e10], [0, -1e10]]) {
            assert.equal(densityAt(layer, x, z, 0.5), 0);
        }
        for (const weather of [-1, 0]) {
            assert.equal(densityAt(layer, 0, 0, 0.5, field, [0, 0], weather), 0);
        }
        assert.equal(densityAt({ ...layer, species: 4 }, 0, 0, 0.5), 0);
        assert.equal(densityAt({ ...layer, waveAmplitude: 0 }, 0, 0, 0.5), 0);
        assert.equal(densityAt({ ...layer, branchOrCrestCount: 0 }, 0, 0, 0.5), 0);
    }
});

test("crest count counts detached fronts rather than changing wavelength", () => {
    for (const species of [24, 9, 28, 27, 14]) {
        for (const count of [1, 2, 5, 24]) {
            const layer = configured(species, { macroElementCount: 1,
                branchOrCrestCount: count, shearCoupling: 0, anisotropy: 1 });
            const cross = species === 27 || species === 14
                ? packetDepth(layer) * layer.thickness : layer.elementScaleKm * 1000;
            const spacing = cross * (species === 27 || species === 14 ? 1.65 : 1.40);
            const values = Array.from({ length: (count + 2) * 100 }, (_, index) => {
                const x = (index / 100 - (count + 2) * 0.5) * spacing;
                return densityAt(layer, x, 0, 0.5 + packetDepth(layer) * 0.08, smoothField);
            });
            assert.equal(occupiedRuns(values), count, `${species}: ${count} crests`);
        }
    }
});

test("lens macro count counts axial lobes while roll axial support stays connected", () => {
    for (const count of [1, 2, 7, 128]) {
        const lens = configured(9, { macroElementCount: count, branchOrCrestCount: 1,
            shearCoupling: 0, anisotropy: 1 });
        const length = lens.elementScaleKm * 1000;
        const h = 0.5 + packetDepth(lens) * 0.08;
        const values = Array.from({ length: (count + 2) * 100 }, (_, index) =>
            densityAt(lens, 0, (index / 100 - (count + 2) * 0.5) * length * 1.35, h, smoothField));
        assert.equal(occupiedRuns(values), count, `${count} axial lenses`);
        const roll = { ...lens, species: 27 };
        const rollValues = Array.from({ length: 500 }, (_, index) =>
            densityAt(roll, 0, (index / 499 - 0.5) * length * 1.2, h, smoothField));
        assert.equal(occupiedRuns(rollValues), 1, `${count} roll modulations severed its axis`);
    }
});

test("roll macro count produces the requested number of diameter maxima", () => {
    for (const species of [27, 14]) {
        for (const count of [1, 2, 7, 128]) {
            const layer = configured(species, { macroElementCount: count,
                branchOrCrestCount: 1, shearCoupling: 0, anisotropy: 1, erosionStrength: 0 });
            const length = layer.elementScaleKm * 1000;
            const width = packetDepth(layer) * layer.thickness;
            // An off-axis cut lies inside each swelling but outside its neck;
            // the centreline remains connected in the preceding test.
            const values = Array.from({ length: count * 100 + 1 }, (_, index) =>
                densityAt(layer, width * 0.385,
                    (index / (count * 100) - 0.5) * length * 0.70, 0.5, smoothField));
            assert.equal(occupiedRuns(values), count, `${species}: ${count} diameter maxima`);
        }
    }
});

test("the six principal controls change every species, including roll diameter modulations", () => {
    const controlPairs = {
        elementScaleKm: [1.4, 2.6], verticalAspect: [0.075, 0.225],
        anisotropy: [0.4, 5], macroElementCount: [1, 5],
        branchOrCrestCount: [1, 4], waveAmplitude: [0.35, 0.95],
        supportBand: [0.02, 0.8], erosionStrength: [0, 1], shearCoupling: [0, 1],
    };
    for (const authored of authoredLayers) {
        const layer = configured(authored.species);
        const positions = points(layer, 2400);
        for (const [control, [low, high]] of Object.entries(controlPairs)) {
            const difference = positions.reduce((sum, [x, z, h]) => sum + Math.abs(
                densityAt({ ...layer, [control]: low }, x, z, h) -
                densityAt({ ...layer, [control]: high }, x, z, h)), 0) / positions.length;
            assert.ok(difference > (control === "erosionStrength" ? 0.00001 : 0.0001),
                `${layer.species} ignores ${control}: mean difference ${difference}`);
        }
    }
});

test("genus material relief and lens versus roll anatomy are distinct", () => {
    const positions = points(configured(9), 2400);
    const signatures = authoredLayers.map(({ species }) => positions.map(([x, z, h]) =>
        densityAt(configured(species), x, z, h)));
    for (let first = 0; first < signatures.length; first++) {
        for (let second = 0; second < first; second++) {
            const difference = signatures[first].reduce((sum, value, index) =>
                sum + Math.abs(value - signatures[second][index]), 0) / positions.length;
            assert.ok(difference > 0.0001, `${speciesNames[first]} aliases ${speciesNames[second]}`);
        }
    }
});

test("world translation and uniform physical scaling preserve the field", () => {
    for (const authored of authoredLayers) {
        const layer = configured(authored.species);
        const scaled = { ...layer, elementScaleKm: layer.elementScaleKm * 3,
            thickness: layer.thickness * 3, baseAltitude: layer.baseAltitude * 3 };
        for (const [x, z, h] of points(layer, 200)) {
            const reference = densityAt(layer, x, z, h);
            assert.ok(Math.abs(reference - densityAt(layer, x + 13000, z - 17000,
                h, field, [13000, -17000])) < 1e-10);
            assert.ok(Math.abs(reference - densityAt(scaled, x * 3, z * 3, h)) < 1e-10);
        }
    }
});

test("spatial boundaries and fractional-count transitions are continuous", () => {
    for (const authored of authoredLayers) {
        const layer = configured(authored.species);
        for (const [x, z, h] of points(layer, 400)) {
            const reference = densityAt(layer, x, z, h);
            assert.ok(Math.abs(reference - densityAt(layer, x + 0.001, z, h)) < 0.002);
            for (const countControl of ["macroElementCount", "branchOrCrestCount"]) {
                const low = densityAt({ ...layer, [countControl]: 3.999999 }, x, z, h);
                const high = densityAt({ ...layer, [countControl]: 4.000001 }, x, z, h);
                assert.ok(Math.abs(high - low) < 0.002, `${countControl} jumps at integer count`);
            }
        }
        const roll = configured(27, { macroElementCount: 1, branchOrCrestCount: 1,
            shearCoupling: 0, anisotropy: 1 });
        const length = roll.elementScaleKm * 1000;
        const h = 0.5 + packetDepth(roll) * 0.08;
        assert.ok(densityAt(roll, 0, length * 0.5 - 0.001, h, smoothField) < 0.00001);
        assert.equal(densityAt(roll, 0, length * 0.5 + 0.001, h, smoothField), 0);
    }
});

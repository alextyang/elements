import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const rendererTypesSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/renderer-types.ts", import.meta.url),
    "utf8",
);
const javascript = ts.transpileModule(rendererTypesSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const moduleObject = { exports: {} };
new Function("exports", "module", javascript)(moduleObject.exports, moduleObject);
const { resolveSkyCloudSampling } = moduleObject.exports;

const layer = (overrides = {}) => ({
    genus: "clear",
    species: "generic",
    present: false,
    baseAltitude: 0,
    thickness: 0,
    coverage: 0,
    oktas: 0,
    opticalDepth: 0,
    stratusBlend: 0,
    towerAmount: 0,
    anvilAmount: 0,
    iceFraction: 0,
    detailStrength: 0,
    windSpeed: 0,
    windDirection: 0,
    shear: 0,
    turbulence: 0,
    precipitation: 0,
    organization: "uniform",
    lifecycle: 0,
    organizationStrength: 0,
    ...overrides,
});

const scene = (overrides = {}) => ({
    layers: [layer(), layer(), layer()],
    noctilucent: 0,
    classifications: [],
    ...overrides,
});

test("high-quality visible Ci/Cc/Cs requests native-scale cloud transport", () => {
    const sampling = resolveSkyCloudSampling({
        quality: "high",
        resolutionScale: 1,
        sceneKey: "spissatus",
        cloudScene: scene({
            layers: [
                layer(),
                layer(),
                layer({
                    genus: "cirrus",
                    species: "cirrus-spissatus",
                    present: true,
                    coverage: 0.48,
                    opticalDepth: 0.18,
                }),
            ],
        }),
    });
    assert.equal(sampling.highCloudActive, true);
    assert.equal(sampling.mode, "high-cloud-native");
    assert.ok(sampling.requestedScale >= 0.9);
    assert.ok(sampling.effectiveScale >= 0.9);
});

test("lower quality keeps the thermal-safe profile extent", () => {
    const sampling = resolveSkyCloudSampling({
        quality: "balanced",
        resolutionScale: 1,
        cloudScene: scene({
            layers: [layer(), layer(), layer({
                genus: "cirrocumulus",
                species: "cirrocumulus-stratiformis",
                present: true,
                coverage: 0.5,
                opticalDepth: 0.12,
            })],
        }),
    });
    assert.equal(sampling.highCloudActive, true);
    assert.equal(sampling.mode, "profile");
    assert.equal(sampling.effectiveScale, 0.48);
});

test("upper-atmosphere ice promotes high-quality sampling", () => {
    const sampling = resolveSkyCloudSampling({
        quality: "high",
        resolutionScale: 0.5,
        cloudScene: scene({ noctilucent: 0.7 }),
    });
    assert.equal(sampling.upperAtmosphereActive, true);
    assert.equal(sampling.effectiveScale, 0.9);
});

test("sampling signature changes when scene extent inputs change", () => {
    const base = resolveSkyCloudSampling({
        quality: "high",
        resolutionScale: 1,
        sceneKey: "scene-a",
        cloudScene: scene(),
    });
    const changed = resolveSkyCloudSampling({
        quality: "high",
        resolutionScale: 1,
        sceneKey: "scene-b",
        cloudScene: scene({
            layers: [layer(), layer(), layer({
                genus: "cirrus", species: "cirrus-fibratus", present: true,
                coverage: 0.25, opticalDepth: 0.1,
            })],
        }),
    });
    assert.notEqual(base.signature, changed.signature);
});

test("qualification shader contains adjacent and scale-separated final-output taps", () => {
    const shader = fs.readFileSync(
        new URL("../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
        "utf8",
    );
    assert.match(shader, /final_output_adjacent_variation_sum/);
    assert.match(shader, /final_output_scale_separated_variation_sum/);
    assert.match(shader, /resolved_pixel \+ vec2<i32>\(1, 0\)/);
    assert.match(shader, /resolved_pixel \+ vec2<i32>\(4, 0\)/);
});

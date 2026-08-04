import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const transpiled = new Map();

const loadTypeScriptModule = async (modulePath) => {
    const resolved = path.resolve(modulePath);
    if (transpiled.has(resolved)) return transpiled.get(resolved).exports;
    const source = await readFile(resolved, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: resolved,
    });
    const module = { exports: {} };
    transpiled.set(resolved, module);
    const requests = [...compiled.outputText.matchAll(/require\("(\.[^"]+)"\)/g)]
        .map((match) => match[1]);
    const dependencies = new Map();
    for (const request of requests) {
        const candidate = path.resolve(path.dirname(resolved), request);
        dependencies.set(request, await loadTypeScriptModule(
            path.extname(candidate) ? candidate : `${candidate}.ts`,
        ));
    }
    new Function("exports", "require", "module", compiled.outputText)(
        module.exports,
        (request) => dependencies.has(request)
            ? dependencies.get(request)
            : require(request),
        module,
    );
    return module.exports;
};

const shaders = await loadTypeScriptModule(new URL(
    "../components/backgrounds/sky/webgpu-shaders.ts",
    import.meta.url,
).pathname);

const entryPoints = (source) => [...source.matchAll(
    /@(compute|fragment|vertex)\b[^\n]*\n?fn\s+(cloud_lv_[A-Za-z0-9_]+_compute)\s*\(/g,
)].map((match) => match[2]);

const allEntryPoints = (source) => [...source.matchAll(
    /@(compute|fragment|vertex)\b[^\n]*\n?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
)].map((match) => ({ stage: match[1], name: match[2] }));

const SOURCE = [
    "cloud_lv_materialize_source_0_compute",
    "cloud_lv_materialize_source_1_compute",
];
const RESIDENT = [
    "cloud_lv_project_boundary_compute",
    "cloud_lv_materialize_medium_compute",
    "cloud_lv_materialize_medium_fine_compute",
];
const LIGHTNING = [
    "cloud_lv_materialize_lightning_transfer_compute",
];
const DIRECT = [
    "cloud_lv_direct_source_0_compute",
    "cloud_lv_direct_source_1_compute",
    "cloud_lv_clear_fluence_compute",
];
const P1 = [
    "cloud_lv_prolongate_medium_compute",
    "cloud_lv_restrict_medium_compute",
    "cloud_lv_smooth_compute",
    "cloud_lv_restrict_residual_compute",
    "cloud_lv_prolongate_compute",
    "cloud_lv_copy_fluence_compute",
    "cloud_lv_measure_residual_compute",
];

test("cloud-light WGSL modules expose only their reachable entry families", () => {
    assert.deepEqual(
        entryPoints(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER).sort(),
        [...SOURCE].sort(),
    );
    assert.deepEqual(
        entryPoints(
            shaders.WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER,
        ).sort(),
        [...SOURCE].sort(),
    );
    assert.deepEqual(
        entryPoints(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER).sort(),
        [...DIRECT].sort(),
    );
    assert.deepEqual(
        entryPoints(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER).sort(),
        [...RESIDENT].sort(),
    );
    assert.deepEqual(
        entryPoints(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER).sort(),
        [...P1].sort(),
    );
    assert.deepEqual(
        entryPoints(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER).sort(),
        [...LIGHTNING].sort(),
    );
    assert.equal(SOURCE.length + DIRECT.length + RESIDENT.length +
        P1.length + LIGHTNING.length, 16);
});

test("directional coupling compiles only its exact reachable entry graph", () => {
    const source = shaders.WEBGPU_CLOUD_COUPLING_SHADER;
    assert.deepEqual(allEntryPoints(source), [{
        stage: "compute",
        name: "cloud_coupling_shadow_compute",
    }]);
    assert.match(source, /fn\s+cloud_coupling_shadow_compute\s*\(/);
    assert.match(source, /fn\s+cloud_coupling_filtered_macro_owner_sample\s*\(/);
    assert.doesNotMatch(source, /fn\s+cloud_fragment_physical_layers\s*\(/);
    assert.doesNotMatch(source, /fn\s+cloud_lighting_fragment\s*\(/);
    assert.ok(
        source.length < shaders.WEBGPU_CLOUD_AUXILIARY_SHADER.length * 0.75,
        `coupling shader must remain materially smaller than the auxiliary graph: ` +
            `${source.length} versus ${shaders.WEBGPU_CLOUD_AUXILIARY_SHADER.length}`,
    );
});

test("Beer and P1 modules cannot reach the camera or morphology graph", () => {
    for (const [name, source] of [
        ["direct", shaders.WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER],
        ["P1", shaders.WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER],
    ]) {
        assert.doesNotMatch(source, /cloud_macro_owner_sample\s*\(/, name);
        assert.doesNotMatch(source, /cloud_morphology_evaluate_owner\s*\(/, name);
        assert.doesNotMatch(source, /weather_production_cloud_direct_radiance\s*\(/,
            name);
        assert.doesNotMatch(source, /cloud_fragment_physical_layers\s*\(/, name);
    }
    assert.match(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
        /cloud_macro_owner_sample\s*\(/);
    assert.match(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
        /cloud_morphology_evaluate_owner\s*\(/);
    assert.doesNotMatch(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
        /weather_production_lightning_transfer_bounded\s*\(/);
    assert.doesNotMatch(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
        /cloud_lv_project_boundary_compute\s*\(/);
    assert.match(shaders.WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER,
        /weather_production_lightning_transfer_bounded\s*\(/);
});

test("plain Ci fibratus source material is a statically isolated atlas query", () => {
    const source = shaders.WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER;
    assert.match(source, /fn\s+cloud_lv_query_source_world_medium\s*\(/);
    assert.match(source, /textureSampleLevel\(\s*cloud_macro_atlas/);
    assert.match(source, /textureLoad\(\s*cloud_macro_majorants/);
    assert.match(source, /macro_sample\.a \* 255\.0 - 128\.0/);
    for (const forbidden of [
        /fn\s+cloud_macro_owner_sample\s*\(/,
        /fn\s+cloud_morphology_evaluate_owner\s*\(/,
        /fn\s+cloud_lv_filtered_fibratus_owner_sample\s*\(/,
        /fn\s+cloud_macro_displaced_boundary_density\s*\(/,
        /fn\s+cloud_macro_sdf_normal\s*\(/,
        /fn\s+cloud_exterior_shape_signal\s*\(/,
        /fn\s+cloud_morphology_cirrus_fibratus_subvoxel_density\s*\(/,
        /fn\s+cloud_morphology_build_fibratus_descriptor\s*\(/,
        /fn\s+cloud_morphology_fibratus_descriptor_for\s*\(/,
    ]) {
        assert.doesNotMatch(source, forbidden);
    }
    // The two compute entries are the only legal source indices. Fixed reads
    // avoid a dynamically indexed runtime array even if Metal lowers the
    // shared helper before specializing its literal entry argument.
    assert.doesNotMatch(source, /cloud_lv_sources\s*\[\s*source_index\s*\]/);
    assert.ok(
        source.length <
            shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER.length * 0.7,
        `fibratus source module must stay materially below the generic graph: ` +
            `${source.length} versus ` +
            `${shaders.WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER.length}`,
    );
});

test("one cloud transport pipeline receives layer identity from first-instance", () => {
    const source = shaders.WEBGPU_CLOUD_LAYER_SHADER;
    assert.match(source,
        /@builtin\(instance_index\) production_layer_index: u32/);
    assert.match(source, /input\.production_layer_index/);
    assert.doesNotMatch(source, /override production_layer_index/);
});

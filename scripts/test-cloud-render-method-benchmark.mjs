import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const benchmark = JSON.parse(readFileSync(
    "data/cloud-render-benchmarks/cumulus-congestus.json", "utf8",
));
const runner = readFileSync("scripts/render-cloud-method-benchmark.mjs", "utf8");
const blender = readFileSync("scripts/blender/render_cloud_plate.py", "utf8");

test("render methods share one species, source, and production camera", () => {
    assert.equal(benchmark.schemaVersion, 1);
    assert.equal(benchmark.species.species, "cumulus-congestus");
    assert.equal(benchmark.fixedCamera.perspectiveId, "oblique-natural");
    assert.equal(benchmark.source.assetId, "congestus-23");
    assert.equal(new Set(benchmark.methods).size, benchmark.methods.length);
    assert.ok(benchmark.methods.includes("mesh-isosurface"));
    assert.ok(benchmark.methods.includes("eevee-null-scattering"));
    assert.ok(benchmark.methods.includes("cycles-henyey-greenstein"));
    assert.ok(benchmark.methods.includes("cycles-draine"));
    assert.ok(benchmark.methods.includes("cycles-mie"));
    assert.ok(benchmark.methods.includes("cycles-mie-raw"));
});

test("benchmark renders checksum-pinned source without generated images", () => {
    assert.match(runner, /sha256File\(path\) !== asset\.vdbSha256/);
    assert.match(runner, /CLOUD_PLATE_RENDER_METHOD/);
    assert.match(runner, /qualifyCloudPlateImage/);
    assert.doesNotMatch(runner, /imagegen|openai|diffusion|neural/i);
});

test("Blender exposes distinct surface, raster volume, and path traced paths", () => {
    assert.match(blender, /MESH_ISOSURFACE/);
    assert.match(blender, /EEVEE_VOLUME/);
    assert.match(blender, /CYCLES_VOLUME/);
    assert.match(blender, /GeometryNodeVolumeToMesh/);
    assert.match(blender, /scene\.render\.engine = "CYCLES"/);
});

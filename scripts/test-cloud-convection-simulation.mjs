import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
    "scripts/blender/simulate_congestus.py", "utf8");
const renderer = readFileSync(
    "scripts/blender/render_cloud_plate.py", "utf8");
const normalizer = readFileSync(
    "scripts/openvdb/cloud_vdb_normalizer.cpp", "utf8");

test("Congestus simulation uses one connected source and a gas solver", () => {
    assert.match(source, /ConnectedMoistUpdraft/);
    assert.match(source, /fluid_type = "DOMAIN"/);
    assert.match(source, /domain_type = "GAS"/);
    assert.match(source, /flow_behavior = "INFLOW"/);
    assert.match(source, /bpy\.ops\.fluid\.bake_data/);
    assert.match(source, /capture_frame/);
    assert.match(source, /"developing"/);
    assert.match(source, /"mature"/);
    assert.match(source, /"sheared"/);
    assert.match(source, /"regime": regime/);
    assert.match(source, /shutil\.rmtree\(cache_directory\)/);
    assert.doesNotMatch(source, /imagegen|diffusion|openai/i);
});

test("simulation bakes wavelet detail to an OpenVDB density cache", () => {
    assert.match(source, /cache_data_format = "OPENVDB"/);
    assert.match(source, /cache_noise_format = "OPENVDB"/);
    assert.match(source, /use_noise = True/);
    assert.match(source, /bpy\.ops\.fluid\.bake_noise/);
    assert.match(source,
        /frame_set\(1\)[\s\S]*bpy\.ops\.fluid\.bake_noise/);
    assert.match(source, /density/);
    assert.match(source, /source_grid = "density_noise"/);
    assert.match(source, /source_grid = "density"/);
    assert.match(source, /normalized\.returncode != 0/);
    assert.match(renderer, /CLOUD_DENSITY_GRID/);
    assert.match(renderer, /CLOUD_STORM_DETAIL_STRENGTH/);
    assert.match(normalizer, /density_noise/);
    assert.match(normalizer, /setName\("density"\)/);
    assert.match(normalizer, /GRID_FOG_VOLUME/);
});

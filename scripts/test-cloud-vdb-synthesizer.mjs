import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
    "scripts/openvdb/cloud_vdb_synthesizer.cpp", "utf8");
const cmake = readFileSync("scripts/openvdb/CMakeLists.txt", "utf8");

test("synthesizer produces one deterministic fog VDB from multiple sources", () => {
    assert.match(source, /sources\.size\(\) < 2/);
    assert.match(source, /GRID_FOG_VOLUME/);
    assert.match(source, /setName\("density"\)/);
    assert.match(source, /exemplar-warped-congestus-v2/);
    assert.match(source, /canonicalizeUuid/);
    assert.match(source, /PointSampler::sample/);
});

test("synthesis is object-space and contains no render primitives", () => {
    assert.match(source, /warpX/);
    assert.match(source, /primaryDensity/);
    assert.match(source, /primary = config\.seed % sources\.size\(\)/);
    assert.match(source, /microDetail/);
    assert.doesNotMatch(source, /sphere|sprite|camera|screen|particle/i);
    assert.match(cmake, /cloud-vdb-synthesizer/);
});

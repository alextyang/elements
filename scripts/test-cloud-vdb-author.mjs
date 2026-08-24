import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
    new URL("./openvdb/cloud_vdb_author.cpp", import.meta.url), "utf8");
const cmake = await readFile(
    new URL("./openvdb/CMakeLists.txt", import.meta.url), "utf8");
const wrapper = await readFile(
    new URL("./author-cloud-vdb.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url), "utf8"));
const cloudScene = await readFile(
    new URL("../components/backgrounds/sky/cloud-scene.ts", import.meta.url),
    "utf8");

const genera = [
    "cirrus", "cirrocumulus", "cirrostratus", "altocumulus",
    "altostratus", "nimbostratus", "stratocumulus", "stratus",
    "cumulus", "cumulonimbus",
];

test("continuous OpenVDB author covers every WMO genus", () => {
    for (const genus of genera) {
        assert.match(source, new RegExp(`genus == \\\"${genus}\\\"`), genus);
    }
    assert.match(source, /continuous-domain-warped-field-v2/);
    assert.match(source, /GRID_FOG_VOLUME/);
    assert.match(source, /grid->setName\("density"\)/);
});

test("every renderer species routes to a base or explicit morphology", () => {
    const list = cloudScene.match(
        /export type CloudSpecies =([\s\S]*?);\n\nexport const CLOUD_SPECIES_CODE/,
    );
    assert.ok(list);
    const species = [...list[1].matchAll(/\| "([a-z-]+)"/g)]
        .map((match) => match[1])
        .filter((value) => value !== "generic");
    assert.equal(species.length, 32);
    const baseMorphologies = new Set([
        "stratiformis", "congestus", "calvus", "capillatus", "incus",
        "opacus", "praecipitatio",
    ]);
    for (const value of species) {
        const suffixes = value.split("-").slice(1);
        assert.ok(suffixes.some((suffix) =>
            baseMorphologies.has(suffix) || source.includes(`\"${suffix}\"`)),
        value);
    }
});

test("VDB author has scale-separated field families and no primitive emitter", () => {
    assert.match(source, /convectiveEnvelope/);
    assert.match(source, /stratiformEnvelope/);
    assert.match(source, /fibrousEnvelope/);
    assert.match(source, /warp\(/);
    assert.match(source, /fbm\(/);
    assert.doesNotMatch(source, /LevelSetSphere|ParticlesToLevelSet|point sprite/i);
});

test("OpenVDB author builds outside tracked source and is exposed through npm", () => {
    assert.match(cmake, /OpenVDB::openvdb/);
    assert.match(wrapper, /output\/tools\/cloud-vdb-author-build/);
    assert.equal(packageJson.scripts["cloud:vdb:build"],
        "node scripts/author-cloud-vdb.mjs --build-only");
    assert.equal(packageJson.scripts["cloud:vdb:author"],
        "node scripts/author-cloud-vdb.mjs");
});

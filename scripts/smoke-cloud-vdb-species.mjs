#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sceneSource = readFileSync(
    join(root, "components/backgrounds/sky/cloud-scene.ts"), "utf8");
const speciesBlock = sceneSource.match(
    /export type CloudSpecies =([\s\S]*?);\n\nexport const CLOUD_SPECIES_CODE/,
);
if (!speciesBlock) throw new Error("Cloud species type was not found.");
const species = [...speciesBlock[1].matchAll(/\| "([a-z-]+)"/g)]
    .map((match) => match[1])
    .filter((value) => value !== "generic");
const executable = join(
    root, "output/tools/cloud-vdb-author-build/cloud-vdb-author");

for (const value of species) {
    const genus = value.split("-")[0];
    const output = join(
        root, "output/cloud-plates/vdb-author-smoke/species", `${value}.vdb`);
    const result = spawnSync(executable, [
        "--genus", genus,
        "--species", value,
        "--output", output,
        "--width", "36",
        "--depth", "24",
        "--height", "22",
        "--voxel-size", "0.25",
        "--seed", "17",
    ], { cwd: root, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${value}: ${result.stderr || result.stdout}`);
    }
    const metricsMatch = result.stdout.match(/CLOUD_VDB_AUTHOR_METRICS:(.*)/);
    if (!metricsMatch) throw new Error(`${value}: missing metrics`);
    const metrics = JSON.parse(metricsMatch[1]);
    if (metrics.activeVoxels <= 0) throw new Error(`${value}: empty VDB`);
    process.stdout.write(`${value}: ${metrics.activeVoxels} active voxels\n`);
}

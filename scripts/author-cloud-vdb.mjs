#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(repositoryRoot, "scripts/openvdb");
const buildDirectory = resolve(repositoryRoot, "output/tools/cloud-vdb-author-build");
const executable = resolve(buildDirectory, "cloud-vdb-author");

const run = (command, args) => {
    const result = spawnSync(command, args, {
        cwd: repositoryRoot,
        stdio: "inherit",
        env: process.env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${result.status}.`);
    }
};

const values = process.argv.slice(2);
const buildOnlyIndex = values.indexOf("--build-only");
const buildOnly = buildOnlyIndex !== -1;
if (buildOnly) values.splice(buildOnlyIndex, 1);

mkdirSync(buildDirectory, { recursive: true });
run("cmake", [
    "-S", sourceDirectory,
    "-B", buildDirectory,
    "-DCMAKE_BUILD_TYPE=Release",
]);
run("cmake", ["--build", buildDirectory, "--parallel"]);

if (!buildOnly) {
    if (!values.includes("--genus") || !values.includes("--output")) {
        process.stderr.write(`Usage:
  npm run cloud:vdb:author -- --genus GENUS --output PATH [author options]
  npm run cloud:vdb:build
`);
        process.exitCode = 1;
    } else {
        run(executable, values);
    }
}

#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const REQUIRED_KINDS = [
    "canonical-render",
    "density-debug",
    "owner-debug",
    "material-debug",
    "phase-debug",
    "light-volume-debug",
    "motion-sequence",
    "lifecycle-sequence",
    "timing-telemetry",
    "reconstruction-telemetry",
];

const parseArguments = (values) => {
    const result = { artifacts: [] };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (!argument.startsWith("--")) continue;
        const key = argument.slice(2);
        const value = values[index + 1];
        if (!value || value.startsWith("--")) {
            throw new Error(`Missing value for --${key}.`);
        }
        index += 1;
        if (key === "artifact") result.artifacts.push(value);
        else result[key] = value;
    }
    return result;
};

const mediaTypeFor = (path) => {
    switch (extname(path).toLowerCase()) {
        case ".png": return "image/png";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".webm": return "video/webm";
        case ".mp4": return "video/mp4";
        case ".json": return "application/json";
        default: return "application/octet-stream";
    }
};

const sha256 = (path) => createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");

const required = (options, key) => {
    const value = options[key];
    if (!value) throw new Error(`Missing required --${key}.`);
    return value;
};

const artifactFrom = (specification) => {
    const separator = specification.indexOf("=");
    if (separator < 1) {
        throw new Error(`Artifact must use kind=path: ${specification}`);
    }
    const kind = specification.slice(0, separator);
    const path = resolve(specification.slice(separator + 1));
    if (!REQUIRED_KINDS.includes(kind)) {
        throw new Error(`Unsupported baseline artifact kind ${kind}.`);
    }
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error(`Artifact is not a file: ${path}`);
    return {
        id: `${kind}:${basename(path)}`,
        kind,
        uri: path,
        sha256: sha256(path),
        mediaType: mediaTypeFor(path),
        bytes: stats.size,
    };
};

export const createCloudBaselineManifest = (options) => {
    const artifacts = options.artifacts.map(artifactFrom);
    const kinds = new Set(artifacts.map(({ kind }) => kind));
    const missing = REQUIRED_KINDS.filter((kind) => !kinds.has(kind));
    if (missing.length > 0) {
        throw new Error(`Missing required artifacts: ${missing.join(", ")}.`);
    }
    if (kinds.size !== artifacts.length) {
        throw new Error("Each baseline artifact kind must appear exactly once.");
    }
    const seed = Number(required(options, "seed"));
    const simulationStep = Number(required(options, "simulation-step"));
    if (!Number.isInteger(seed) || seed < 0 ||
        !Number.isInteger(simulationStep) || simulationStep < 0) {
        throw new Error("Seed and simulation step must be non-negative integers.");
    }
    const mode = required(options, "mode");
    if (mode !== "conditioned" && mode !== "free-running") {
        throw new Error("Mode must be conditioned or free-running.");
    }
    return {
        schemaVersion: 1,
        id: required(options, "id"),
        routeId: required(options, "route"),
        rendererRevision: required(options, "renderer-revision"),
        rendererSchemaVersions: {
            physicalSample: 1,
            cloudSystem: 2,
            weatherEngine: 1,
            qualificationEvidence: 1,
        },
        generatedAt: options["generated-at"] ?? new Date().toISOString(),
        generationMode: mode,
        sceneSeed: seed,
        simulationFingerprint: required(options, "simulation-fingerprint"),
        simulationStep,
        cameraSignature: required(options, "camera-signature"),
        environmentId: required(options, "environment"),
        exactCommand: process.argv.join(" "),
        artifacts,
    };
};

const main = () => {
    const options = parseArguments(process.argv.slice(2));
    const output = resolve(required(options, "output"));
    const manifest = createCloudBaselineManifest(options);
    const temporary = `${output}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(temporary, output);
    process.stdout.write(`${output}\n`);
};

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
        process.exitCode = 1;
    }
}

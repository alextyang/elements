import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import { createCloudBaselineManifest } from "./create-cloud-baseline-manifest.mjs";

const root = mkdtempSync(join(tmpdir(), "elements-cloud-baseline-"));
after(() => rmSync(root, { recursive: true, force: true }));
const kinds = [
    "canonical-render", "density-debug", "owner-debug", "material-debug",
    "phase-debug", "light-volume-debug", "motion-sequence",
    "lifecycle-sequence", "timing-telemetry", "reconstruction-telemetry",
];
const artifacts = kinds.map((kind) => {
    const extension = kind.includes("telemetry") ? "json" :
        kind.includes("sequence") ? "webm" : "png";
    const path = join(root, `${kind}.${extension}`);
    writeFileSync(path, `${kind}\n`);
    return `${kind}=${path}`;
});

const options = {
    id: "baseline-cu-congestus",
    route: "base:cumulus:congestus",
    "renderer-revision": "abc123",
    seed: "42",
    "simulation-fingerprint": "f".repeat(64),
    "simulation-step": "120",
    "camera-signature": "oblique-natural:v1",
    environment: "day-oblique-natural",
    mode: "conditioned",
    output: join(root, "manifest.json"),
    artifacts,
};

test("baseline manifests atomically identify the complete diagnostic set", () => {
    const manifest = createCloudBaselineManifest(options);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.artifacts.length, 10);
    assert.equal(new Set(manifest.artifacts.map(({ kind }) => kind)).size, 10);
    assert.ok(manifest.artifacts.every(({ sha256 }) =>
        /^[a-f0-9]{64}$/.test(sha256)));
    assert.equal(manifest.rendererSchemaVersions.cloudSystem, 2);
});

test("baseline manifests reject missing or duplicate artifacts", () => {
    assert.throws(() => createCloudBaselineManifest({
        ...options,
        artifacts: artifacts.slice(1),
    }), /Missing required artifacts/);
    assert.throws(() => createCloudBaselineManifest({
        ...options,
        artifacts: [...artifacts, artifacts[0]],
    }), /exactly once/);
});

test("the generated JSON remains reproducible and parseable", () => {
    const manifest = createCloudBaselineManifest({
        ...options,
        "generated-at": "2026-08-08T15:00:00.000Z",
    });
    const path = join(root, "round-trip.json");
    writeFileSync(path, JSON.stringify(manifest));
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), manifest);
});

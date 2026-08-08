import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL(
    "./qualify-cloud-production-shader.sh",
    import.meta.url,
), "utf8");

test("the qualification runner uses the repository browser harness", () => {
    assert.match(source, /^#!\/usr\/bin\/env bash/m);
    assert.match(source, /set -euo pipefail/);
    assert.match(source, /PWCLI:-playwright-cli/);
    assert.match(source, /\/cloud-production-probe/);
    assert.match(source, /data-cloud-production-shader-probe/);
    assert.match(source, /data-cloud-production-shader-sha256/);
    assert.match(source, /page\.waitForFunction/);
    assert.match(source, /CLOUD_PRODUCTION_PROBE_RESULT=/);
});

test("failed, unavailable, ambiguous, and unproven probes cannot pass", () => {
    assert.match(source, /status === 'passed' \|\| status === 'failed' \|\|/);
    assert.match(source, /status === 'unavailable'/);
    assert.match(source, /status !== 'passed'/);
    assert.match(source, /\^\[0-9a-f\]\{64\}\$/);
    assert.match(source, /run_status != 0/);
    assert.match(source, /transcript_failed/);
    assert.match(source, /"status":"passed"/);
});

test("the runner is bounded and atomically preserves provenance", () => {
    assert.match(source, /CLOUD_PRODUCTION_PROBE_TIMEOUT_MS:-60000/);
    assert.match(source, /probe-transcript\.log/);
    assert.match(source, /qualification\.json/);
    assert.match(source, /rendererRevision/);
    assert.match(source, /reproducibilityCommand/);
    assert.match(source, /transcriptSha256/);
    assert.match(source, /flag: "wx"/);
    assert.match(source, /renameSync/);
    assert.match(source, /trap cleanup EXIT/);
    assert.match(source, /curl -fsS/);
    assert.doesNotMatch(source, /rm -rf|git push|git add|gh pr merge/);
});

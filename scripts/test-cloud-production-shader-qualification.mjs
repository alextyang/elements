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
    assert.match(source, /page\.waitForFunction/);
    assert.match(source, /CLOUD_PRODUCTION_PROBE_RESULT=/);
});

test("failed, unavailable, and ambiguous probes cannot pass", () => {
    assert.match(source, /status === 'passed' \|\| status === 'failed' \|\|/);
    assert.match(source, /status === 'unavailable'/);
    assert.match(source, /if \(status !== 'passed'\)/);
    assert.match(source, /run_status != 0/);
    assert.match(source, /transcript_failed/);
    assert.match(source, /"status":"passed"/);
});

test("the runner is bounded and preserves a diagnostic transcript", () => {
    assert.match(source, /CLOUD_PRODUCTION_PROBE_TIMEOUT_MS:-60000/);
    assert.match(source, /probe-transcript\.log/);
    assert.match(source, /trap cleanup EXIT/);
    assert.match(source, /curl -fsS/);
    assert.doesNotMatch(source, /rm -rf|git push|git add|gh pr merge/);
});

#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
base_url="${CLOUD_PRODUCTION_PROBE_URL:-http://127.0.0.1:3000}"
probe_url="$base_url/cloud-production-probe"
timeout_ms="${CLOUD_PRODUCTION_PROBE_TIMEOUT_MS:-60000}"
playwright_cli="${PWCLI:-playwright-cli}"
session="cloud-production-probe-$$"
output_root="${CLOUD_PRODUCTION_PROBE_OUTPUT:-$root/output/cloud-production-probe}"
transcript="$output_root/probe-transcript.log"
qualification="$output_root/qualification.json"

mkdir -p "$output_root"
rm -f "$transcript" "$qualification"

cleanup() {
    "$playwright_cli" --session "$session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

transcript_failed() {
    printf '%s\n' "$1" | grep -Eq \
        '^[[:space:]]*(### Error([[:space:]]|$)|(Timeout|Playwright)?Error:)'
}

if ! curl -fsS "$probe_url" >/dev/null; then
    echo "Cloud production probe requires a running Elements server at $base_url" >&2
    exit 1
fi

open_status=0
open_result="$($playwright_cli --session "$session" open "$probe_url" 2>&1)" || \
    open_status=$?
printf '%s\n' "$open_result" >> "$transcript"
if (( open_status != 0 )) || transcript_failed "$open_result"; then
    echo "Opening the cloud production shader probe failed; transcript: $transcript" >&2
    exit 1
fi

run_status=0
run_result="$($playwright_cli --session "$session" run-code \
    "async (page) => {
        const selector = '[data-cloud-production-shader-probe]';
        await page.locator(selector).waitFor({
            state: 'attached',
            timeout: $timeout_ms,
        });
        await page.waitForFunction(() => {
            const output = document.querySelector(
                '[data-cloud-production-shader-probe]',
            );
            const status = output?.getAttribute(
                'data-cloud-production-shader-probe',
            );
            return status === 'passed' || status === 'failed' ||
                status === 'unavailable';
        }, undefined, { timeout: $timeout_ms });
        const output = page.locator(selector);
        const status = await output.getAttribute(
            'data-cloud-production-shader-probe',
        );
        const shaderSha256 = await output.getAttribute(
            'data-cloud-production-shader-sha256',
        );
        const diagnostics = await page.locator(selector + ' pre')
            .allTextContents();
        const result = {
            schemaVersion: 1,
            status,
            shaderSha256,
            diagnostics,
            url: page.url(),
        };
        console.log('CLOUD_PRODUCTION_PROBE_RESULT=' +
            JSON.stringify(result));
        if (status !== 'passed' ||
            !/^[0-9a-f]{64}$/.test(shaderSha256 ?? '')) {
            throw new Error('Cloud production physical-sample WGSL probe ' +
                'did not pass with valid provenance: ' +
                JSON.stringify(result));
        }
        return result;
    }" 2>&1)" || run_status=$?
printf '%s\n' "$run_result" >> "$transcript"

result_line="$(printf '%s\n' "$run_result" | grep \
    'CLOUD_PRODUCTION_PROBE_RESULT=.*"status":"passed"' | tail -1 || true)"
if (( run_status != 0 )) || transcript_failed "$run_result" ||
    [[ -z "$result_line" ]]; then
    echo "Cloud production physical-sample WGSL qualification failed; transcript: $transcript" >&2
    exit 1
fi

result_json="${result_line#*CLOUD_PRODUCTION_PROBE_RESULT=}"
renderer_revision="$(git -C "$root" rev-parse HEAD 2>/dev/null || printf 'unknown')"
RESULT_JSON="$result_json" \
RENDERER_REVISION="$renderer_revision" \
TRANSCRIPT_PATH="$transcript" \
node - "$qualification" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, renameSync, writeFileSync } = require("node:fs");

const outputPath = process.argv[2];
const temporaryPath = `${outputPath}.tmp-${process.pid}`;
const result = JSON.parse(process.env.RESULT_JSON ?? "null");
if (!result || result.status !== "passed" ||
    !/^[0-9a-f]{64}$/.test(result.shaderSha256 ?? "")) {
    throw new Error("Probe result is missing passed shader provenance.");
}
const transcriptBytes = readFileSync(process.env.TRANSCRIPT_PATH);
const payload = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    rendererRevision: process.env.RENDERER_REVISION ?? "unknown",
    reproducibilityCommand: "npm run cloud:production:probe",
    transcriptSha256: createHash("sha256")
        .update(transcriptBytes)
        .digest("hex"),
    result,
};
writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
    flag: "wx",
});
renameSync(temporaryPath, outputPath);
NODE

printf '%s\n' "$result_line"
echo "Cloud production physical-sample WGSL qualification passed."
echo "Qualification evidence: $qualification"

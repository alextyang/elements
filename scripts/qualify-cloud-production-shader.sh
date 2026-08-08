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

mkdir -p "$output_root"
rm -f "$transcript"

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
        const status = await page.locator(selector).getAttribute(
            'data-cloud-production-shader-probe',
        );
        const diagnostics = await page.locator(selector + ' pre')
            .allTextContents();
        const result = {
            schemaVersion: 1,
            status,
            diagnostics,
            url: page.url(),
        };
        console.log('CLOUD_PRODUCTION_PROBE_RESULT=' +
            JSON.stringify(result));
        if (status !== 'passed') {
            throw new Error('Cloud production physical-sample WGSL probe ' +
                'did not pass: ' + JSON.stringify(result));
        }
        return result;
    }" 2>&1)" || run_status=$?
printf '%s\n' "$run_result" >> "$transcript"

if (( run_status != 0 )) || transcript_failed "$run_result" ||
    ! printf '%s\n' "$run_result" | grep -q \
        'CLOUD_PRODUCTION_PROBE_RESULT=.*"status":"passed"'; then
    echo "Cloud production physical-sample WGSL qualification failed; transcript: $transcript" >&2
    exit 1
fi

printf '%s\n' "$run_result" | grep \
    'CLOUD_PRODUCTION_PROBE_RESULT=.*"status":"passed"' | tail -1
echo "Cloud production physical-sample WGSL qualification passed."

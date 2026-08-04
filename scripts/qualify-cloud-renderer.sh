#!/usr/bin/env bash
set -euo pipefail

qualification_root="$(cd "$(dirname "$0")/.." && pwd)"
qualification_base_url="${CLOUD_QUALIFICATION_URL:-http://127.0.0.1:3000}"
qualification_output_root="${CLOUD_QUALIFICATION_OUTPUT:-$qualification_root/output/cloud-qualification}"
qualification_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
qualification_run_dir="$qualification_output_root/$qualification_stamp"
qualification_session="cloud-qualification-$$"
qualification_receiver_port=$((45000 + $$ % 10000))
qualification_playwright_cli="${PWCLI:-${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh}"
qualification_node="${NODE_BIN:-node}"
qualification_plan="$qualification_run_dir/plan.json"
qualification_raw="$qualification_run_dir/raw.ndjson"
qualification_report="$qualification_run_dir/report.md"
qualification_receiver_pid=""

mkdir -p "$qualification_run_dir"

cleanup() {
    "$qualification_playwright_cli" --session "$qualification_session" close >/dev/null 2>&1 || true
    if [[ -n "$qualification_receiver_pid" ]]; then
        kill "$qualification_receiver_pid" >/dev/null 2>&1 || true
        wait "$qualification_receiver_pid" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if ! curl -fsS "$qualification_base_url/sky-lab" >/dev/null; then
    echo "Cloud qualification requires a running Elements server at $qualification_base_url" >&2
    exit 1
fi

"$qualification_node" "$qualification_root/scripts/cloud-qualification.mjs" \
    plan "$qualification_base_url" > "$qualification_plan"

"$qualification_node" "$qualification_root/scripts/cloud-qualification-receiver.mjs" \
    "$qualification_receiver_port" "$qualification_raw" >/dev/null &
qualification_receiver_pid=$!

for _ in {1..60}; do
    if curl -fsS "http://127.0.0.1:$qualification_receiver_port/health" >/dev/null 2>&1; then
        break
    fi
    sleep 0.05
done
if ! curl -fsS "http://127.0.0.1:$qualification_receiver_port/health" >/dev/null 2>&1; then
    echo "Cloud qualification receiver did not start" >&2
    exit 1
fi

qualification_jobs_json="$("$qualification_node" -e '
    const plan = require(process.argv[1]);
    process.stdout.write(JSON.stringify(plan.jobs));
' "$qualification_plan")"
qualification_first_url="$("$qualification_node" -e '
    const plan = require(process.argv[1]);
    process.stdout.write(plan.jobs[0].url);
' "$qualification_plan")"

"$qualification_playwright_cli" --session "$qualification_session" open \
    "$qualification_first_url" >/dev/null

echo "Running cloud qualification matrix"
"$qualification_playwright_cli" --session "$qualification_session" run-code \
    "async (page) => {
        const jobs = $qualification_jobs_json;
        const receiver = 'http://127.0.0.1:$qualification_receiver_port/record';
        for (const job of jobs) {
            let stats = null;
            let harnessError = null;
            try {
                await page.setViewportSize(job.viewport);
                await page.goto(job.url, { waitUntil: 'domcontentloaded' });
                await page.waitForFunction(
                    ({ samples }) => {
                        const output = document.querySelector('[data-cloud-stats-json]');
                        if (!output) return false;
                        try {
                            const current = JSON.parse(output.getAttribute('data-cloud-stats-json'));
                            if (current.backend !== 'webgpu' || current.lastError) return true;
                            return current.coldCloudWarmupComplete === true &&
                                Number.isFinite(current.firstCloudUpdateMs) &&
                                (current.cloudTimingSamples ?? 0) >= samples;
                        } catch {
                            return false;
                        }
                    },
                    { samples: job.timingSamples },
                    { timeout: job.timeoutMs },
                );
                await page.waitForTimeout(250);
                stats = await page.locator('[data-cloud-stats-json]').evaluate((element) =>
                    JSON.parse(element.getAttribute('data-cloud-stats-json')),
                );
            } catch (error) {
                harnessError = error instanceof Error ? error.message : String(error);
                stats = await page.locator('[data-cloud-stats-json]').count() > 0
                    ? await page.locator('[data-cloud-stats-json]').evaluate((element) =>
                        JSON.parse(element.getAttribute('data-cloud-stats-json')),
                    )
                    : { backend: 'unavailable', lastError: harnessError };
            }
            const record = {
                schemaVersion: 1,
                collectedAt: new Date().toISOString(),
                jobId: job.id,
                scenarioId: job.scenarioId,
                scenarioLabel: job.scenarioLabel,
                tier: job.tier,
                repeat: job.repeat,
                viewport: page.viewportSize(),
                userAgent: await page.evaluate(() => navigator.userAgent),
                harnessError,
                stats,
            };
            const response = await page.context().request.put(receiver, {
                data: record,
                headers: { 'content-type': 'application/json' },
            });
            if (!response.ok()) throw new Error('qualification receiver ' + response.status());
        }
    }" >/dev/null

kill "$qualification_receiver_pid" >/dev/null 2>&1 || true
wait "$qualification_receiver_pid" >/dev/null 2>&1 || true
qualification_receiver_pid=""

"$qualification_node" "$qualification_root/scripts/cloud-qualification.mjs" \
    report "$qualification_raw" "$qualification_report" "$qualification_plan"

echo "Cloud qualification artifacts: $qualification_run_dir"

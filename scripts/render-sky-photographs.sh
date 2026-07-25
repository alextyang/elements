#!/usr/bin/env bash
set -euo pipefail

benchmark_root="$(cd "$(dirname "$0")/.." && pwd)"
benchmark_base_url="${SKY_BENCHMARK_URL:-http://localhost:3000}"
benchmark_output="$benchmark_root/output/sky-benchmark/renders"
benchmark_session="sky-photographs-$$"
playwright_cli="${PWCLI:-${CODEX_HOME:-$HOME/.codex}/skills/playwright/scripts/playwright_cli.sh}"
benchmark_limit="${SKY_BENCHMARK_LIMIT:-0}"
benchmark_prefix="${SKY_BENCHMARK_PREFIX:-}"

mkdir -p "$benchmark_output"
benchmark_ids_json="$(node -e '
    const manifest = require(process.argv[1]);
    const limit = Number(process.argv[2]);
    const prefix = process.argv[3];
    let cases = prefix ? manifest.cases.filter((entry) => entry.id.startsWith(prefix)) : manifest.cases;
    if (limit > 0) cases = cases.slice(0, limit);
    process.stdout.write(JSON.stringify(cases.map((entry) => entry.id)));
' "$benchmark_root/data/sky-benchmark.json" "$benchmark_limit" "$benchmark_prefix")"
benchmark_count="$(node -e 'console.log(JSON.parse(process.argv[1]).length)' "$benchmark_ids_json")"

cleanup() {
    "$playwright_cli" --session "$benchmark_session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

first_id="$(node -e 'console.log(JSON.parse(process.argv[1])[0])' "$benchmark_ids_json")"
"$playwright_cli" --session "$benchmark_session" open \
    "$benchmark_base_url/sky-photographs?case=$first_id&capture=render" >/dev/null
"$playwright_cli" --session "$benchmark_session" resize 1280 800 >/dev/null

echo "Rendering $benchmark_count matched sky photographs"
"$playwright_cli" --session "$benchmark_session" run-code \
    "async (page) => { const ids = $benchmark_ids_json; for (const id of ids) { await page.goto('$benchmark_base_url/sky-photographs?case=' + id + '&capture=render'); await page.waitForFunction(() => document.querySelector('[data-benchmark-ready]')?.textContent === 'ready'); await page.waitForTimeout(120); await page.screenshot({path: '$benchmark_output/' + id + '.png'}); } }" \
    >/dev/null

echo "Rendered $benchmark_count cases to $benchmark_output"

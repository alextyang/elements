#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
    echo "npx is required. Install Node.js/npm before rendering the benchmark." >&2
    exit 1
fi

benchmark_root="$(cd "$(dirname "$0")/.." && pwd)"
benchmark_base_url="${SKY_BENCHMARK_URL:-http://localhost:3000}"
benchmark_output="$benchmark_root/output/sky-benchmark/renders"
benchmark_session="sky-benchmark-$$"
playwright_cli="${PWCLI:-/Users/alexyang/.codex/skills/playwright/scripts/playwright_cli.sh}"
benchmark_limit="${SKY_BENCHMARK_LIMIT:-0}"
benchmark_class="${SKY_BENCHMARK_CLASS:-all}"
benchmark_source="${SKY_BENCHMARK_SOURCE:-all}"
benchmark_port=$((43000 + $$ % 10000))
receiver_pid=""

mkdir -p "$benchmark_output"

benchmark_ids_json="$(node -e '
    const manifest = require(process.argv[1]);
    const limit = Number(process.argv[2]);
    const referenceClass = process.argv[3];
    const source = process.argv[4];
    let cases = manifest.cases.filter((entry) =>
        (referenceClass === "all" || entry.referenceClass === referenceClass) &&
        (source === "all" || entry.source.id === source));
    if (limit > 0) cases = cases.slice(0, limit);
    process.stdout.write(JSON.stringify(cases.map((entry) => entry.id)));
' "$benchmark_root/data/moon-benchmark.json" "$benchmark_limit" "$benchmark_class" "$benchmark_source")"
benchmark_count="$(node -e 'console.log(JSON.parse(process.argv[1]).length)' "$benchmark_ids_json")"

cleanup() {
    "$playwright_cli" --session "$benchmark_session" close >/dev/null 2>&1 || true
    if [[ -n "$receiver_pid" ]]; then
        kill "$receiver_pid" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

MOON_BENCHMARK_OUTPUT="$benchmark_output" MOON_BENCHMARK_PORT="$benchmark_port" \
    node "$benchmark_root/scripts/moon-benchmark-receiver.mjs" >/dev/null &
receiver_pid=$!
for _ in {1..40}; do
    if curl -fsS "http://127.0.0.1:$benchmark_port/health" >/dev/null 2>&1; then
        break
    fi
    sleep 0.05
done

first_id="$(node -e 'console.log(JSON.parse(process.argv[1])[0])' "$benchmark_ids_json")"
"$playwright_cli" --session "$benchmark_session" open \
    "$benchmark_base_url/sky-benchmark?case=$first_id&capture=render" >/dev/null
"$playwright_cli" --session "$benchmark_session" resize 1280 800 >/dev/null

echo "Rendering $benchmark_count matched skies"
"$playwright_cli" --session "$benchmark_session" run-code \
    "async (page) => { const ids = $benchmark_ids_json; for (const id of ids) { await page.goto('$benchmark_base_url/sky-benchmark?case=' + id + '&capture=render'); await page.waitForFunction(() => document.querySelector('[data-benchmark-ready]')?.textContent === 'ready'); await page.waitForTimeout(500); const bytes = await page.screenshot({type: 'png'}); const response = await page.context().request.put('http://127.0.0.1:$benchmark_port/' + encodeURIComponent(id), {data: bytes, headers: {'content-type': 'image/png'}}); if (!response.ok()) throw new Error('capture receiver ' + response.status()); } }" \
    >/dev/null

echo "Rendered $benchmark_count cases to $benchmark_output"

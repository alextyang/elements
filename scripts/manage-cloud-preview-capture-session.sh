#!/usr/bin/env bash
set -euo pipefail

session_root="$(cd "$(dirname "$0")/.." && pwd)"
session_command="${1:?start or stop is required}"
session_state="${2:?session state path is required}"
session_base_url="${CLOUD_PREVIEW_URL:-http://127.0.0.1:3000}"
session_mode="${CLOUD_PREVIEW_CAPTURE_MODE:-native-metal}"
session_native_config="$session_root/scripts/config/cloud-preview-native-playwright.json"
session_adapter_policy="$session_root/components/backgrounds/sky/cloud-transport-adapter-policy.mjs"
session_probe_url="$session_base_url/cloud-preview-adapter-probe.html"

session_cli_transcript_failed() {
    grep -Eq \
        '^[[:space:]]*(### Error([[:space:]]|$)|(Timeout|Playwright)?Error:)' \
        <<< "$1"
}

if [[ -n "${PWCLI:-}" ]]; then
    session_cli=("$PWCLI")
elif command -v playwright-cli >/dev/null 2>&1; then
    session_cli=(playwright-cli)
elif command -v npx >/dev/null 2>&1; then
    session_cli=(npx --yes --package @playwright/cli playwright-cli)
else
    echo "Cloud preview capture requires playwright-cli or Node.js/npm with npx." >&2
    exit 2
fi

read_state_field() {
    node -e '
        const { readFileSync } = require("node:fs");
        const value = JSON.parse(readFileSync(process.argv[1], "utf8"));
        const field = value[process.argv[2]];
        if (typeof field === "object") process.stdout.write(JSON.stringify(field));
        else if (field !== undefined && field !== null) process.stdout.write(String(field));
    ' "$session_state" "$1"
}

stop_session() {
    [[ -s "$session_state" ]] || return 0
    local owned_session owned_daemon
    owned_session="$(read_state_field session)"
    owned_daemon="$(read_state_field daemonPid)"
    if [[ ! "$owned_session" =~ ^cloud-preview-revision-[A-Za-z0-9_-]+$ ]] ||
        [[ ! "$owned_daemon" =~ ^[0-9]+$ ]]; then
        echo "Refusing malformed cloud preview capture session state." >&2
        return 1
    fi
    "${session_cli[@]}" --session "$owned_session" close >/dev/null 2>&1 &
    local close_pid=$!
    for _ in {1..30}; do
        if ! kill -0 "$close_pid" >/dev/null 2>&1; then break; fi
        sleep 0.1
    done
    if kill -0 "$close_pid" >/dev/null 2>&1; then
        kill -TERM "$close_pid" >/dev/null 2>&1 || true
        sleep 0.25
        kill -KILL "$close_pid" >/dev/null 2>&1 || true
    fi
    wait "$close_pid" >/dev/null 2>&1 || true
    local cleanup_status=0
    node "$session_root/scripts/cleanup-playwright-session.mjs" \
        cleanup "$owned_session" "$owned_daemon" || cleanup_status=$?
    if (( cleanup_status != 0 )); then
        echo "Cloud preview capture cleanup did not finish; retaining exact session state at $session_state." >&2
        return "$cleanup_status"
    fi
    rm -f "$session_state"
}

if [[ "$session_command" == "stop" ]]; then
    stop_session
    exit 0
fi
if [[ "$session_command" != "start" ]]; then
    echo "session command must be start or stop" >&2
    exit 2
fi
if [[ "$session_mode" != "native-metal" && "$session_mode" != "headless" ]]; then
    echo "CLOUD_PREVIEW_CAPTURE_MODE must be native-metal or headless" >&2
    exit 2
fi
if ! curl -fsS --max-time 10 "$session_base_url/cloud-photographs" >/dev/null; then
    echo "Cloud preview capture requires an Elements server at $session_base_url" >&2
    exit 2
fi

mkdir -p "$(dirname "$session_state")"
rm -f "$session_state"
session_name="cloud-preview-revision-${$}-$(date +%s)"
session_daemon=""
session_started=0
temporary_state=""
cleanup_failed_start() {
    if [[ -n "$temporary_state" ]]; then rm -f "$temporary_state"; fi
    if (( session_started == 0 )) && [[ -n "$session_daemon" ]]; then
        "${session_cli[@]}" --session "$session_name" close >/dev/null 2>&1 || true
        node "$session_root/scripts/cleanup-playwright-session.mjs" \
            cleanup "$session_name" "$session_daemon" || true
    fi
}
trap cleanup_failed_start EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

open_args=(open about:blank)
if [[ "$session_mode" == "native-metal" ]]; then
    open_args+=(--config "$session_native_config")
fi
open_status=0
open_output="$(
    "${session_cli[@]}" --session "$session_name" "${open_args[@]}" 2>&1
)" || open_status=$?
session_daemon="$(printf '%s\n' "$open_output" | node \
    "$session_root/scripts/cleanup-playwright-session.mjs" parse "$session_name")"
if (( open_status != 0 )) || session_cli_transcript_failed "$open_output" ||
    [[ -z "$session_daemon" ]]; then
    printf '%s\n' "$open_output" >&2
    echo "Cloud preview could not record its exact Playwright daemon pid." >&2
    exit 1
fi

preflight_status=0
preflight_output="$(
    "${session_cli[@]}" --session "$session_name" run-code \
        "async (page) => {
            await page.goto(
                $(node -p 'JSON.stringify(process.argv[1])' "$session_probe_url"),
                { waitUntil: 'domcontentloaded', timeout: 15000 }
            );
            const encodedInfo = await page.evaluate(async () => {
                const adapter = await navigator.gpu?.requestAdapter({
                    powerPreference: 'low-power',
                });
                if (!adapter) return null;
                const info = {
                    vendor: adapter.info.vendor,
                    architecture: adapter.info.architecture,
                    device: adapter.info.device,
                    description: adapter.info.description,
                    isFallbackAdapter: adapter.info.isFallbackAdapter === true,
                };
                const bytes = new TextEncoder().encode(JSON.stringify(info));
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                return btoa(binary);
            });
            if (!encodedInfo) throw new Error(
                'Cloud preview preflight could not acquire WebGPU.');
            return 'CLOUD_PREVIEW_ADAPTER_B64:' + encodedInfo;
        }" 2>&1
)" || preflight_status=$?
adapter_b64="$(
    printf '%s\n' "$preflight_output" |
        grep -Eo 'CLOUD_PREVIEW_ADAPTER_B64:[A-Za-z0-9+/=]+' |
        tail -n 1 |
        cut -d: -f2-
)"
if (( preflight_status != 0 )) ||
    session_cli_transcript_failed "$preflight_output" ||
    [[ -z "$adapter_b64" ]]; then
    printf '%s\n' "$preflight_output" >&2
    echo "Cloud preview persistent adapter preflight failed." >&2
    exit 1
fi
adapter_info="$(node -e \
    'process.stdout.write(Buffer.from(process.argv[1], "base64").toString("utf8"))' \
    "$adapter_b64")"
adapter_backend="$(node --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const policy = await import(pathToFileURL(process.argv[1]).href);
    const info = JSON.parse(process.argv[2]);
    process.stdout.write(policy.resolveCloudTransportAdapterBackend(info));
' "$session_adapter_policy" "$adapter_info")"
if [[ "$session_mode" == "native-metal" &&
    "$adapter_backend" != "native-apple-metal" ]]; then
    echo "Native cloud preview capture refused non-Apple-Metal WebGPU: $adapter_info" >&2
    exit 1
fi

temporary_state="${session_state}.${$}.tmp"
node -e '
    const { writeFileSync } = require("node:fs");
    writeFileSync(process.argv[1], JSON.stringify({
        schemaVersion: 1,
        session: process.argv[2],
        daemonPid: Number(process.argv[3]),
        adapterInfo: JSON.parse(process.argv[4]),
        adapterBackend: process.argv[5],
        captureMode: process.argv[6],
        createdAt: new Date().toISOString(),
    }, null, 2) + "\n");
' "$temporary_state" "$session_name" "$session_daemon" "$adapter_info" \
    "$adapter_backend" "$session_mode"
mv "$temporary_state" "$session_state"
session_started=1
trap - EXIT INT TERM HUP
printf 'Cloud preview persistent session ready: %s pid %s backend %s\n' \
    "$session_name" "$session_daemon" "$adapter_backend"

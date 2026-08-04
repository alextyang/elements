#!/usr/bin/env bash
set -euo pipefail

capture_root="$(cd "$(dirname "$0")/.." && pwd)"
capture_base_url="${CLOUD_PREVIEW_URL:-http://127.0.0.1:3000}"
capture_parameter="${1:?capture parameter (case or weather) is required}"
capture_case="${2:?case id is required}"
capture_output="${3:?output image path is required}"
capture_perspective="${CLOUD_PREVIEW_PRODUCTION_PERSPECTIVE:-oblique-natural}"
capture_debug="${CLOUD_PREVIEW_DEBUG_VIEW:-final}"
capture_updates="${CLOUD_PREVIEW_TRANSPORT_UPDATES:-64}"
capture_timeout_ms="${CLOUD_PREVIEW_PAGE_TIMEOUT_MS:-150000}"
capture_diagnostic_reserve_ms="${CLOUD_PREVIEW_DIAGNOSTIC_RESERVE_MS:-5000}"
capture_step_timeout_ms="${CLOUD_PREVIEW_CAPTURE_STEP_TIMEOUT_MS:-30000}"
capture_mode="${CLOUD_PREVIEW_CAPTURE_MODE:-native-metal}"
capture_skip_qualification="${CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION:-0}"
capture_immutable_output="${CLOUD_PREVIEW_IMMUTABLE_OUTPUT:-0}"
capture_disable_case_switch="${CLOUD_PREVIEW_DISABLE_CASE_SWITCH:-0}"
capture_metrics_path="${CLOUD_PREVIEW_CAPTURE_METRICS_PATH:-}"
capture_native_config="$capture_root/scripts/config/cloud-preview-native-playwright.json"
capture_adapter_policy="$capture_root/components/backgrounds/sky/cloud-transport-adapter-policy.mjs"
capture_adapter_probe_url="$capture_base_url/cloud-preview-adapter-probe.html"
capture_persistent_session="${CLOUD_PREVIEW_PERSISTENT_SESSION:-}"
capture_session="${capture_persistent_session:-cloud-preview-${$}-$(date +%s)}"
capture_daemon_pid="${CLOUD_PREVIEW_PERSISTENT_DAEMON_PID:-}"
capture_adapter_info="${CLOUD_PREVIEW_PERSISTENT_ADAPTER_INFO:-}"
capture_adapter_backend="${CLOUD_PREVIEW_PERSISTENT_ADAPTER_BACKEND:-}"
capture_owns_session=1
if [[ -n "$capture_persistent_session" ]]; then capture_owns_session=0; fi
capture_heartbeat_pid=""
capture_cleanup_started=0
capture_safe_case="$(printf '%s' "$capture_case" | tr -cs '[:alnum:]_-' '-')"
capture_diagnostic_root="${CLOUD_PREVIEW_DIAGNOSTIC_ROOT:-$capture_root/output/playwright/cloud-previews}"
capture_failure_log="$capture_diagnostic_root/${capture_parameter}-${capture_safe_case}.failure.log"
# Preserve enough of the complete in-memory CLI transcript for diagnosis while
# ensuring a noisy browser/protocol failure cannot grow a persistent log
# without bound. The tail contains Playwright's error and our readiness payload.
capture_failure_transcript_limit=131072

if [[ "$capture_parameter" != "case" && "$capture_parameter" != "weather" ]]; then
    echo "capture parameter must be case or weather" >&2
    exit 2
fi
case "$capture_debug" in
    final|coverage|density|transmittance|depth|velocity|history|lighting|steps|\
    lighting-direct-sun|lighting-exterior-diffuse|lighting-p1-cache|\
    lighting-atmosphere-composite|lighting-source-higher-order|\
    lighting-atmosphere-shadow-loss) ;;
    *)
        echo "CLOUD_PREVIEW_DEBUG_VIEW is not a supported renderer debug view: $capture_debug" >&2
        exit 2
        ;;
esac
if [[ "$capture_skip_qualification" != "0" &&
    "$capture_skip_qualification" != "1" ]] ||
    [[ "$capture_immutable_output" != "0" &&
    "$capture_immutable_output" != "1" ]] ||
    [[ "$capture_disable_case_switch" != "0" &&
    "$capture_disable_case_switch" != "1" ]]; then
    echo "Cloud preview capture mode flags must be 0 or 1." >&2
    exit 2
fi
if [[ "$capture_mode" != "native-metal" && "$capture_mode" != "headless" ]]; then
    echo "CLOUD_PREVIEW_CAPTURE_MODE must be native-metal or headless" >&2
    exit 2
fi
if (( capture_owns_session == 0 )) && {
    [[ ! "$capture_session" =~ ^cloud-preview-revision-[A-Za-z0-9_-]+$ ]] ||
    [[ ! "$capture_daemon_pid" =~ ^[0-9]+$ ]] ||
    [[ -z "$capture_adapter_info" ]] || [[ -z "$capture_adapter_backend" ]];
}; then
    echo "Persistent cloud preview session evidence is incomplete or malformed." >&2
    exit 2
fi
if [[ ! "$capture_timeout_ms" =~ ^[0-9]+$ ]] ||
    [[ ! "$capture_diagnostic_reserve_ms" =~ ^[0-9]+$ ]] ||
    [[ ! "$capture_step_timeout_ms" =~ ^[0-9]+$ ]] ||
    (( capture_step_timeout_ms < 1000 )) ||
    (( capture_timeout_ms < 1000 )); then
    echo "Cloud preview timeouts must be positive integer milliseconds." >&2
    exit 2
fi
if (( capture_diagnostic_reserve_ms >= capture_timeout_ms )); then
    capture_diagnostic_reserve_ms=$((capture_timeout_ms / 4))
fi

mkdir -p "$capture_diagnostic_root"
# Public preview generation deliberately replaces its transient raw path on a
# failed retry. Diagnostic callers opt into immutable output paths instead;
# never replace a frame or metrics record that already belongs to a revision.
if [[ "$capture_immutable_output" == "1" && -e "$capture_output" ]]; then
    echo "Refusing to replace immutable diagnostic output: $capture_output" >&2
    exit 2
fi
if [[ "$capture_immutable_output" == "1" && -n "$capture_metrics_path" &&
    -e "$capture_metrics_path" ]]; then
    echo "Refusing to replace immutable diagnostic metrics: $capture_metrics_path" >&2
    exit 2
fi
if [[ "$capture_immutable_output" != "1" ]]; then
    # A failed rerun must not leave an older frame at the caller's requested path.
    rm -f "$capture_output"
fi
rm -f "$capture_failure_log"

capture_record_lifecycle() {
    local stage="$1"
    local detail="${2:-}"
    local record
    printf -v record 'lifecycle_utc=%s lifecycle_stage=%s%s' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$stage" \
        "${detail:+ $detail}"
    printf '%s\n' "$record" >> "$capture_failure_log"
    printf '[cloud-preview:%s] %s\n' "$capture_safe_case" "$record"
}

stop_capture_heartbeat() {
    if [[ -z "$capture_heartbeat_pid" ]]; then return; fi
    kill -TERM "$capture_heartbeat_pid" >/dev/null 2>&1 || true
    wait "$capture_heartbeat_pid" >/dev/null 2>&1 || true
    capture_heartbeat_pid=""
}

start_capture_heartbeat() {
    node -e '
        const { appendFileSync } = require("node:fs");
        const path = process.argv[1];
        setInterval(() => appendFileSync(path,
            `lifecycle_utc=${new Date().toISOString()} ` +
            "lifecycle_stage=capture-running\n"), 30_000);
    ' "$capture_failure_log" &
    capture_heartbeat_pid=$!
}

capture_record_lifecycle "capture-start"

if [[ -n "${PWCLI:-}" ]]; then
    capture_cli=("$PWCLI")
elif command -v playwright-cli >/dev/null 2>&1; then
    capture_cli=(playwright-cli)
elif command -v npx >/dev/null 2>&1; then
    capture_cli=(npx --yes --package @playwright/cli playwright-cli)
else
    echo "Cloud preview capture requires playwright-cli or Node.js/npm with npx." >&2
    exit 2
fi

capture_encoded_case="$(node -p 'encodeURIComponent(process.argv[1])' "$capture_case")"
capture_encoded_perspective="$(node -p 'encodeURIComponent(process.argv[1])' "$capture_perspective")"
capture_encoded_debug="$(node -p 'encodeURIComponent(process.argv[1])' "$capture_debug")"
capture_url="$capture_base_url/cloud-photographs?$capture_parameter=$capture_encoded_case&capture=render&debug=$capture_encoded_debug&productionPerspective=$capture_encoded_perspective"

capture_cli_transcript_failed() {
    # playwright-cli can emit protocol/runtime failures while exiting zero.
    # Explicit error records in its transcript are therefore authoritative.
    grep -Eq \
        '^[[:space:]]*(### Error([[:space:]]|$)|(Timeout|Playwright)?Error:)' \
        <<< "$1"
}

capture_report_failure() {
    local stage="$1"
    local transcript="$2"
    local qualifier=""
    local readiness=""

    # A screenshot can pass page readiness and still be rejected by the
    # renderer-independent image qualifier. Preserve that result as the
    # primary failure instead of implying that page diagnostics were absent.
    qualifier="$(
        printf '%s\n' "$transcript" |
            sed -n 's/^.*\(Cloud preview high-cloud image qualification: .*$\)/\1/p' |
            tail -n 1 |
            cut -c 1-8192
    )" || true
    if [[ -n "$qualifier" ]]; then
        printf 'Cloud preview capture failed at stage=%s: %s\n' \
            "$stage" "$qualifier" >&2
        return
    fi

    readiness="$(
        printf '%s\n' "$transcript" |
            sed -n 's/^.*\(Cloud preview readiness: .*$\)/\1/p' |
            tail -n 1 |
            cut -c 1-8192
    )" || true
    if [[ -n "$readiness" ]]; then
        printf 'Cloud preview capture failed at stage=%s: %s\n' \
            "$stage" "$readiness" >&2
    else
        printf 'Cloud preview capture failed at stage=%s: ' "$stage" >&2
        echo "Cloud preview readiness: unavailable before benchmark diagnostics attached." >&2
    fi
}

persist_capture_failure() {
    local stage="$1"
    local status="$2"
    local transcript="$3"
    local transcript_bytes
    transcript_bytes="$(
        printf '%s' "$transcript" | LC_ALL=C wc -c | tr -d '[:space:]'
    )"
    {
        printf 'stage=%s\n' "$stage"
        printf 'case=%s\n' "$capture_case"
        printf 'parameter=%s\n' "$capture_parameter"
        printf 'cli_exit_status=%s\n' "$status"
        printf 'transcript_bytes=%s\n' "$transcript_bytes"
        if (( transcript_bytes > capture_failure_transcript_limit )); then
            printf 'transcript_truncated_to_tail_bytes=%s\n' \
                "$capture_failure_transcript_limit"
        else
            printf 'transcript_truncated_to_tail_bytes=0\n'
        fi
        printf '%s\n' '--- playwright transcript ---'
        if (( transcript_bytes > capture_failure_transcript_limit )); then
            printf '%s\n' "$transcript" |
                LC_ALL=C tail -c "$capture_failure_transcript_limit" || true
            printf '\n'
        else
            printf '%s\n' "$transcript"
        fi
    } >> "$capture_failure_log"
    capture_report_failure "$stage" "$transcript"
    echo "Cloud preview capture failed; diagnostics: $capture_failure_log" >&2
}

cleanup() {
    if (( capture_cleanup_started != 0 )); then return; fi
    capture_cleanup_started=1
    stop_capture_heartbeat
    if (( capture_owns_session == 0 )); then return; fi
    "${capture_cli[@]}" --session "$capture_session" close >/dev/null 2>&1 &
    local close_pid=$!
    for _ in {1..20}; do
        if ! kill -0 "$close_pid" >/dev/null 2>&1; then break; fi
        sleep 0.1
    done
    if kill -0 "$close_pid" >/dev/null 2>&1; then
        kill -TERM "$close_pid" >/dev/null 2>&1 || true
        sleep 0.25
        kill -KILL "$close_pid" >/dev/null 2>&1 || true
    fi
    wait "$close_pid" >/dev/null 2>&1 || true
    if [[ -n "$capture_daemon_pid" ]]; then
        node "$capture_root/scripts/cleanup-playwright-session.mjs" \
            cleanup "$capture_session" "$capture_daemon_pid" || true
    fi
}
trap cleanup EXIT INT TERM

quarantine_reused_session_after_step_timeout() {
    if (( capture_owns_session != 0 )); then return; fi
    capture_record_lifecycle "controller-step-timeout-quarantine" \
        "daemon_pid=$capture_daemon_pid session=$capture_session"
    # The timed-out evaluate still owns an unresolved GPU-fence promise in the
    # persistent page. Do not reuse that page for the remaining cases. Close it
    # with a short host-side bound, then validate and terminate only the exact
    # daemon pid/session pair recorded by the session manager. The generator's
    # final session-manager cleanup remains an idempotent second check.
    "${capture_cli[@]}" --session "$capture_session" close >/dev/null 2>&1 &
    local close_pid=$!
    for _ in {1..20}; do
        if ! kill -0 "$close_pid" >/dev/null 2>&1; then break; fi
        sleep 0.1
    done
    if kill -0 "$close_pid" >/dev/null 2>&1; then
        kill -TERM "$close_pid" >/dev/null 2>&1 || true
        sleep 0.25
        kill -KILL "$close_pid" >/dev/null 2>&1 || true
    fi
    wait "$close_pid" >/dev/null 2>&1 || true
    node "$capture_root/scripts/cleanup-playwright-session.mjs" \
        cleanup "$capture_session" "$capture_daemon_pid" || true
}

if ! curl -fsS --max-time 10 "$capture_base_url/cloud-photographs" >/dev/null; then
    echo "Cloud preview capture requires an Elements server at $capture_base_url" >&2
    exit 2
fi

if (( capture_owns_session != 0 )); then
    capture_open_status=0
    capture_open_args=(open about:blank)
    if [[ "$capture_mode" == "native-metal" ]]; then
        capture_open_args+=(--config "$capture_native_config")
    fi
    capture_open_output="$(
        "${capture_cli[@]}" --session "$capture_session" "${capture_open_args[@]}" 2>&1
    )" || capture_open_status=$?
    capture_daemon_pid="$(printf '%s\n' "$capture_open_output" | node \
        "$capture_root/scripts/cleanup-playwright-session.mjs" parse "$capture_session")"
    if (( capture_open_status != 0 )) || \
        capture_cli_transcript_failed "$capture_open_output" || \
        [[ -z "$capture_daemon_pid" ]]; then
        persist_capture_failure "open" "$capture_open_status" "$capture_open_output"
        echo "Cloud preview could not record its exact Playwright daemon pid." >&2
        exit 1
    fi
    capture_record_lifecycle "browser-opened" "daemon_pid=$capture_daemon_pid"
else
    capture_record_lifecycle "browser-session-reused" \
        "daemon_pid=$capture_daemon_pid session=$capture_session"
fi

# Probe the exact low-power adapter requested by the renderer on a tiny static
# same-origin page. This completes before the expensive application navigation,
# so adapter/backend evidence survives even if shader compilation starves the
# page event loop for the remainder of the per-image watchdog.
if (( capture_owns_session != 0 )); then
    capture_preflight_status=0
    capture_preflight_output="$(
    "${capture_cli[@]}" --session "$capture_session" run-code \
        "async (page) => {
            await page.goto(
                $(node -p 'JSON.stringify(process.argv[1])' "$capture_adapter_probe_url"),
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
            if (!encodedInfo) {
                throw new Error('Cloud preview preflight could not acquire WebGPU.');
            }
            return 'CLOUD_PREVIEW_ADAPTER_B64:' + encodedInfo;
        }" 2>&1
)" || capture_preflight_status=$?
    capture_adapter_b64="$(
    printf '%s\n' "$capture_preflight_output" |
        grep -Eo 'CLOUD_PREVIEW_ADAPTER_B64:[A-Za-z0-9+/=]+' |
        tail -n 1 |
        cut -d: -f2-
)" || true
    if (( capture_preflight_status != 0 )) ||
    capture_cli_transcript_failed "$capture_preflight_output" ||
    [[ -z "$capture_adapter_b64" ]]; then
        capture_record_lifecycle "adapter-preflight-failed"
        persist_capture_failure "adapter-preflight" "$capture_preflight_status" \
            "$capture_preflight_output"
        exit 1
    fi
    capture_adapter_info="$(node -e \
    'process.stdout.write(Buffer.from(process.argv[1], "base64").toString("utf8"))' \
    "$capture_adapter_b64")"
    capture_adapter_backend="$(node --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const policy = await import(pathToFileURL(process.argv[1]).href);
    const info = JSON.parse(process.argv[2]);
    process.stdout.write(policy.resolveCloudTransportAdapterBackend(info));
' "$capture_adapter_policy" "$capture_adapter_info")"
fi
if (( capture_owns_session != 0 )); then
    capture_record_lifecycle "adapter-preflight-complete" \
        "backend=$capture_adapter_backend adapter=$capture_adapter_info"
else
    capture_record_lifecycle "adapter-preflight-reused" \
        "backend=$capture_adapter_backend adapter=$capture_adapter_info"
fi
if [[ "$capture_mode" == "native-metal" &&
    "$capture_adapter_backend" != "native-apple-metal" ]]; then
    persist_capture_failure "adapter-policy" 1 \
        "Native cloud preview capture refused non-Apple-Metal WebGPU: $capture_adapter_info"
    exit 1
fi

capture_run_status=0
capture_record_lifecycle "capture-navigation-start" "url=$capture_url"
start_capture_heartbeat
capture_run_output="$(
"${capture_cli[@]}" --session "$capture_session" run-code \
    "async (page) => {
        const diagnosticReserveMs = $capture_diagnostic_reserve_ms;
        const deadline = Date.now() + Math.max(
            1, $capture_timeout_ms - diagnosticReserveMs);
        const remaining = () => Math.max(1, deadline - Date.now());
        const diagnosticTimeoutMs = Math.max(
            250, Math.min(1000, diagnosticReserveMs / 3));
        const controllerStepTimeoutMs = $capture_step_timeout_ms;
        const boundedDiagnostic = async (operation, fallback) => {
            try {
                return await Promise.race([
                    operation,
                    page.waitForTimeout(diagnosticTimeoutMs).then(() => fallback),
                ]);
            } catch {
                return fallback;
            }
        };
        const output = page.locator('[data-benchmark-ready]');
        const readinessSnapshot = async () => {
            const renderer = page.locator(
                '[data-benchmark-render] canvas[data-sky-renderer]'
            );
            const [attributes, rendererInitializationStage,
                rendererLightProgress] = await Promise.all([
                boundedDiagnostic(output.evaluate((element) =>
                    Object.fromEntries([...element.attributes]
                        .filter((attribute) => attribute.name.startsWith(
                            'data-cloud-') ||
                            attribute.name === 'data-benchmark-ready')
                        .map((attribute) => [attribute.name, attribute.value]))),
                    { missing: 'data-benchmark-ready' }),
                boundedDiagnostic(renderer.getAttribute(
                    'data-cloud-renderer-init-stage'), null),
                boundedDiagnostic(renderer.evaluate((canvas) =>
                    Object.fromEntries([...canvas.attributes]
                        .filter((attribute) => attribute.name.startsWith(
                            'data-cloud-light-volume-'))
                        .map((attribute) => [attribute.name, attribute.value]))),
                    { unavailable: 'renderer-light-progress' }),
            ]);
            return {
                captureAdapter: $(node -p 'JSON.stringify(JSON.parse(process.argv[1]))' "$capture_adapter_info"),
                captureBackend: $(node -p 'JSON.stringify(process.argv[1])' "$capture_adapter_backend"),
                benchmark: attributes,
                rendererInitializationStage:
                    rendererInitializationStage ?? 'unavailable',
                rendererLightProgress,
            };
        };
        try {
        // Establish thumbnail pixels before the renderer exists. Navigating at
        // the CLI's larger default viewport needlessly doubles full-quality
        // WebGPU shading work and can cause the same thermal spike as the old
        // live matrix even if the viewport is reduced afterward.
        await page.setViewportSize({ width: 800, height: 500 });
        const target = {
            caseId: $(node -p 'JSON.stringify(process.argv[1])' "$capture_case"),
            captureParameter:
                $(node -p 'JSON.stringify(process.argv[1])' "$capture_parameter"),
            debugView:
                $(node -p 'JSON.stringify(process.argv[1])' "$capture_debug"),
            productionPerspective:
                $(node -p 'JSON.stringify(process.argv[1])' "$capture_perspective"),
        };
        const persistent = $([[ -n "$capture_persistent_session" ]] && printf true || printf false);
        const canSwitch = persistent && $([[ "$capture_disable_case_switch" == "1" || "$capture_debug" != "final" ]] && printf false || printf true) && await page.evaluate(() =>
            typeof window.__elementsCloudPreviewCapture?.switchCase === 'function');
        if (canSwitch) {
            const accepted = await page.evaluate((request) =>
                window.__elementsCloudPreviewCapture.switchCase(request), target);
            if (!accepted) throw new Error(
                'Cloud preview persistent case switch was rejected.');
            await page.waitForFunction((request) => {
                const benchmark = document.querySelector('[data-benchmark-case]');
                return benchmark?.getAttribute('data-benchmark-case') ===
                        request.caseId &&
                    benchmark?.getAttribute('data-production-perspective') ===
                        request.productionPerspective &&
                    benchmark?.getAttribute('data-cloud-debug-view') ===
                        request.debugView;
            }, target, { timeout: remaining() });
        } else {
            await page.goto(
                $(node -p 'JSON.stringify(process.argv[1])' "$capture_url") +
                    (persistent ? '&captureSession=persistent' : ''),
                { waitUntil: 'domcontentloaded', timeout: remaining() }
            );
        }
        await output.waitFor({ state: 'attached', timeout: remaining() });
        const readinessPredicate = (request) => {
            const evidence = document.querySelector('[data-benchmark-ready]');
            const canvas = document.querySelector(
                '[data-benchmark-render] canvas[data-sky-renderer=\"webgpu\"]'
            );
            if (!evidence || !canvas) return false;
            const benchmark = document.querySelector('[data-benchmark-case]');
            if (benchmark?.getAttribute('data-cloud-debug-view') !==
                    request.debugView ||
                benchmark?.getAttribute('data-production-perspective') !==
                    request.productionPerspective) {
                return false;
            }
            if (evidence.getAttribute('data-cloud-scene-key') !== request.sceneKey ||
                canvas.getAttribute('data-cloud-scene-key') !== request.sceneKey) {
                return false;
            }
            const renderState = evidence.getAttribute('data-cloud-render-state');
            const lightState = evidence.getAttribute('data-cloud-light-volume-state');
            if (renderState === 'failed' || lightState === 'failed') return true;
            const updates = Number(
                evidence.getAttribute('data-cloud-transport-updates') ??
                canvas.getAttribute('data-cloud-transport-updates')
            );
            if (renderState === 'empty' &&
                Number.isFinite(updates) && updates >= request.minimumUpdates) {
                return true;
            }
            if (!Number.isFinite(updates) ||
                updates < request.minimumUpdates) return false;
            const generation = Number(
                evidence.getAttribute('data-cloud-light-volume-generation')
            );
            const selected = Number(
                evidence.getAttribute('data-cloud-light-volume-selected-bricks')
            );
            const ready = Number(
                evidence.getAttribute('data-cloud-light-volume-ready-bricks')
            );
            const transportNonFinite = Number(
                evidence.getAttribute('data-cloud-transport-non-finite-count')
            );
            const radianceNonFinite = Number(
                evidence.getAttribute('data-cloud-radiance-non-finite-count')
            );
            const rawNonFinite = Number(evidence.getAttribute(
                'data-cloud-reconstruction-raw-non-finite-count'
            ));
            const resolvedNonFinite = Number(evidence.getAttribute(
                'data-cloud-reconstruction-resolved-non-finite-count'
            ));
            const acceptance = Number(evidence.getAttribute(
                'data-cloud-history-acceptance-fraction'
            ));
            const minimumAcceptance = Number(evidence.getAttribute(
                'data-cloud-minimum-history-acceptance-fraction'
            ));
            const stableAge = Number(evidence.getAttribute(
                'data-cloud-stable-history-age'
            ));
            const minimumStableAge = Number(evidence.getAttribute(
                'data-cloud-minimum-stable-history-age'
            ));
            const confidence = Number(evidence.getAttribute(
                'data-cloud-persistent-history-confidence'
            ));
            const minimumConfidence = Number(evidence.getAttribute(
                'data-cloud-minimum-persistent-history-confidence'
            ));
            const reconstructionMature = evidence.getAttribute(
                'data-cloud-reconstruction-mature'
            ) === 'true' && rawNonFinite === 0 && resolvedNonFinite === 0 &&
                acceptance >= minimumAcceptance && stableAge >= minimumStableAge &&
                confidence >= minimumConfidence;
            const requiresVolumetricLighting = evidence.getAttribute(
                'data-cloud-requires-volumetric-lighting') === 'true';
            const volumetricLightingReady = evidence.getAttribute(
                'data-cloud-volumetric-lighting-ready') === 'true';
            const requiresHighCloudEvidence = evidence.getAttribute(
                'data-cloud-high-cloud-profile') !== 'none';
            const highCloudReady = evidence.getAttribute(
                'data-cloud-high-cloud-ready') === 'true';
            const hasCloudLighting = generation > 0 || selected > 0;
            const exactOnlyLightingReady = generation > 0 &&
                selected === 0 && lightState === 'empty' &&
                !requiresVolumetricLighting &&
                transportNonFinite === 0 && radianceNonFinite === 0;
            return evidence.getAttribute('data-benchmark-ready') === 'ready' &&
                reconstructionMature &&
                (!requiresVolumetricLighting || volumetricLightingReady) &&
                (!requiresHighCloudEvidence || highCloudReady) &&
                (!hasCloudLighting || exactOnlyLightingReady || (
                lightState === 'complete' && ready === selected
            )) && transportNonFinite === 0 && radianceNonFinite === 0;
        };
        const readinessRequest = {
            minimumUpdates: $capture_updates,
            sceneKey: target.caseId,
            debugView: target.debugView,
            productionPerspective: target.productionPerspective,
        };
        if (persistent) {
            await page.evaluate(() => new Promise((resolve) => {
                const initialized = () => document.querySelector(
                    'canvas[data-cloud-renderer-init-stage="first-draw-returned"]'
                ) !== null;
                if (initialized()) {
                    resolve(true);
                    return;
                }
                const observer = new MutationObserver(() => {
                    if (!initialized()) return;
                    observer.disconnect();
                    resolve(true);
                });
                observer.observe(document.documentElement, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                });
            }));
            const captureStepAvailable = await page.evaluate(() =>
                typeof window.__elementsSkyRendererCaptureStep === 'function');
            if (!captureStepAvailable) throw new Error(
                'Cloud preview controller step was not published.');
            let terminal = false;
            let controllerStepIndex = 0;
            let lastControllerStepState = 'not-started';
            while (Date.now() < deadline) {
                controllerStepIndex += 1;
                const stepStartedAt = Date.now();
                const stepBudgetMs = Math.max(1, Math.min(
                    controllerStepTimeoutMs, remaining()));
                // A page evaluation may wait forever when a WebGPU queue fence
                // never settles. Race it from the Playwright host; the page's
                // timer/rAF queues may be suspended and the CLI run-code host
                // intentionally does not expose global setTimeout.
                const stepOutcome = await Promise.race([
                    page.evaluate(() =>
                        window.__elementsSkyRendererCaptureStep?.()).then(
                        (state) => ({ kind: 'state', state }),
                        (error) => ({ kind: 'error', error: String(error) }),
                    ),
                    page.waitForTimeout(stepBudgetMs).then(() => ({
                        kind: 'timeout',
                    })),
                ]);
                if (stepOutcome.kind === 'timeout') {
                    const stepReadiness = await readinessSnapshot();
                    throw new Error(
                        'CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT ' +
                        JSON.stringify({
                            controllerStepIndex,
                            stepBudgetMs,
                            elapsedMs: Date.now() - stepStartedAt,
                            lastControllerStepState,
                            readiness: stepReadiness,
                        })
                    );
                }
                if (stepOutcome.kind === 'error') {
                    throw new Error(
                        'Cloud preview controller step rejected at step ' +
                        controllerStepIndex + ': ' + stepOutcome.error
                    );
                }
                const stepState = stepOutcome.state;
                lastControllerStepState = String(stepState);
                if (stepState === undefined || stepState === 'disposed') {
                    throw new Error(
                        'Cloud preview controller step became unavailable.');
                }
                // Each following protocol read is a separate browser task. Do
                // not delegate pacing to the offscreen page's suspended timer
                // or animation-frame queues.
                const [ready, renderState, lightState] = await Promise.all([
                    output.getAttribute('data-benchmark-ready'),
                    output.getAttribute('data-cloud-render-state'),
                    output.getAttribute('data-cloud-light-volume-state'),
                ]);
                if (ready === 'ready' || renderState === 'empty' ||
                    renderState === 'failed' ||
                    lightState === 'failed') {
                    terminal = true;
                    break;
                }
            }
            if (!terminal) throw new Error(
                'Cloud preview controller timed out before terminal readiness.');
        } else {
            await page.waitForFunction(
                readinessPredicate,
                readinessRequest,
                { timeout: remaining() },
            );
        }

        const signature = (element) => [...element.attributes]
            .filter((attribute) => attribute.name.startsWith('data-cloud-') ||
                attribute.name === 'data-benchmark-ready')
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((attribute) => attribute.name + '=' + attribute.value)
            .join('|');
        let stableSignature = await output.evaluate(signature);
        for (let poll = 0; poll < 3; poll += 1) {
            const nextSignature = await output.evaluate(signature);
            if (nextSignature !== stableSignature) {
                stableSignature = nextSignature;
                poll = -1;
            }
        }

        const state = await output.evaluate((element) => ({
            sceneKey: element.getAttribute('data-cloud-scene-key'),
            debugView: element.getAttribute('data-cloud-debug-view'),
            productionPerspective: document.querySelector('[data-benchmark-case]')
                ?.getAttribute('data-production-perspective') ?? null,
            productionCameraSignature: document.querySelector('[data-benchmark-case]')
                ?.getAttribute('data-production-camera-signature') ?? null,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1,
            },
            renderBounds: (() => {
                const render = document.querySelector('[data-benchmark-render]');
                const bounds = render?.getBoundingClientRect();
                return bounds ? {
                    width: bounds.width,
                    height: bounds.height,
                } : null;
            })(),
            benchmarkReady: element.getAttribute('data-benchmark-ready'),
            renderState: element.getAttribute('data-cloud-render-state'),
            renderFailure: element.getAttribute('data-cloud-render-failure'),
            projectedOpacity: Number(
                element.getAttribute('data-cloud-projected-opacity')
            ),
            occupiedSky: Number(element.getAttribute('data-cloud-occupied-sky')),
            minimumOccupiedSky: Number(
                element.getAttribute('data-cloud-minimum-occupied-sky')
            ),
            lightState: element.getAttribute('data-cloud-light-volume-state'),
            lightFailure: element.getAttribute('data-cloud-light-volume-residual-failure'),
            requiresVolumetricLighting: element.getAttribute(
                'data-cloud-requires-volumetric-lighting') === 'true',
            volumetricLightingReady: element.getAttribute(
                'data-cloud-volumetric-lighting-ready') === 'true',
            rawRadianceSpatialVariation: Number(element.getAttribute(
                'data-cloud-raw-radiance-spatial-variation')),
            resolvedRadianceSpatialVariation: Number(element.getAttribute(
                'data-cloud-resolved-radiance-spatial-variation')),
            directVolumeReady: element.getAttribute(
                'data-cloud-direct-volume-ready') === 'true',
            residentP1Ready: element.getAttribute(
                'data-cloud-resident-p1-ready') === 'true',
            requiresHighCloudEvidence: element.getAttribute(
                'data-cloud-high-cloud-profile') !== 'none',
            highCloudReady: element.getAttribute(
                'data-cloud-high-cloud-ready') === 'true',
            highCloudSpatialStructureReady: element.getAttribute(
                'data-cloud-high-cloud-spatial-structure-ready') === 'true',
            highCloudFootprintReady: element.getAttribute(
                'data-cloud-high-cloud-footprint-ready') === 'true',
            reconstructionMature:
                element.getAttribute('data-cloud-reconstruction-mature') === 'true',
            reconstructionRawNonFinite: Number(element.getAttribute(
                'data-cloud-reconstruction-raw-non-finite-count'
            )),
            reconstructionResolvedNonFinite: Number(element.getAttribute(
                'data-cloud-reconstruction-resolved-non-finite-count'
            )),
            updates: Number(element.getAttribute('data-cloud-transport-updates')),
            transportNonFinite: Number(
                element.getAttribute('data-cloud-transport-non-finite-count')
            ),
            radianceNonFinite: Number(
                element.getAttribute('data-cloud-radiance-non-finite-count')
            ),
        }));
        if (state.sceneKey !== target.caseId ||
            state.debugView !== target.debugView ||
            state.productionPerspective !== target.productionPerspective ||
            state.benchmarkReady !== 'ready' || !state.reconstructionMature ||
            state.reconstructionRawNonFinite !== 0 ||
            state.reconstructionResolvedNonFinite !== 0 ||
            (state.requiresVolumetricLighting &&
                !state.volumetricLightingReady) ||
            (state.requiresHighCloudEvidence && !state.highCloudReady) ||
            state.renderState === 'failed' || state.lightState === 'failed' ||
            state.renderFailure !== 'none' ||
            (state.lightFailure !== 'none' && state.lightFailure !== 'unavailable') ||
            state.transportNonFinite !== 0 || state.radianceNonFinite !== 0 ||
            state.updates < $capture_updates) {
            throw new Error('Cloud preview renderer rejected capture: ' +
                JSON.stringify(state));
        }
        await page.locator('[data-benchmark-render]').screenshot({
            path: $(node -p 'JSON.stringify(process.argv[1])' "$capture_output"),
            scale: 'device',
            type: 'png',
            timeout: remaining(),
        });
        // playwright-cli's run-code host intentionally does not expose the
        // browser TextEncoder/btoa globals. Keep encoding inside the page
        // realm, just as the adapter preflight does, and return only the
        // already-encoded string to the host.
        const encodedState = await page.evaluate((value) => {
            const bytes = new TextEncoder().encode(JSON.stringify(value));
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return btoa(binary);
        }, state);
        return 'CLOUD_PREVIEW_CAPTURE_METRICS_B64:' + encodedState;
        } catch (error) {
            const readiness = await readinessSnapshot();
            throw new Error('Cloud preview readiness: ' +
                JSON.stringify(readiness) + '; cause=' + String(error));
        }
    }" 2>&1
)" || capture_run_status=$?
stop_capture_heartbeat

if (( capture_run_status != 0 )) || \
    capture_cli_transcript_failed "$capture_run_output"; then
    if grep -Fq 'CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT' \
        <<< "$capture_run_output"; then
        quarantine_reused_session_after_step_timeout
        persist_capture_failure "run-code" "$capture_run_status" "$capture_run_output"
        # EX_TEMPFAIL tells the serial generator that its one revision-owned
        # browser was deliberately quarantined and must not be reused.
        exit 75
    fi
    persist_capture_failure "run-code" "$capture_run_status" "$capture_run_output"
    rm -f "$capture_output"
    exit 1
fi

if [[ ! -s "$capture_output" ]]; then
    persist_capture_failure "missing-image" "$capture_run_status" \
        "$capture_run_output"
    echo "Cloud preview capture produced no image for $capture_case" >&2
    exit 1
fi

if [[ -n "$capture_metrics_path" ]]; then
    capture_metrics_b64="$(
        printf '%s\n' "$capture_run_output" |
            grep -Eo 'CLOUD_PREVIEW_CAPTURE_METRICS_B64:[A-Za-z0-9+/=]+' |
            tail -n 1 |
            cut -d: -f2-
    )" || true
    if [[ -z "$capture_metrics_b64" ]]; then
        persist_capture_failure "metrics" 1 "$capture_run_output"
        if [[ "$capture_immutable_output" != "1" ]]; then
            rm -f "$capture_output"
        fi
        exit 1
    fi
    capture_metrics_directory="$(dirname "$capture_metrics_path")"
    mkdir -p "$capture_metrics_directory"
    if ! node -e '
        const { writeFileSync } = require("node:fs");
        const path = process.argv[1];
        const encoded = process.argv[2];
        const value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
        writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    ' "$capture_metrics_path" "$capture_metrics_b64"; then
        persist_capture_failure "metrics" 1 "Could not persist immutable diagnostic metrics." 
        if [[ "$capture_immutable_output" != "1" ]]; then
            rm -f "$capture_output"
        fi
        exit 1
    fi
fi

# The first canonical catalogue group uses stable WMO genus prefixes. Its
# final composited PNG receives a second, renderer-independent publication
# check so broad concentric/cascade artifacts cannot masquerade as thin-cloud
# texture in the renderer's occupied-pixel radiance metric.
if [[ "$capture_skip_qualification" != "1" &&
    "$capture_parameter" == "case" &&
    "$capture_case" =~ ^(ci|cc|cs)- ]]; then
    capture_image_qualification_args=("$capture_output")
    if [[ "$capture_case" =~ ^cs-nebulosus- ]]; then
        capture_image_qualification_args+=(--allow-smooth-veil)
    fi
    capture_image_qualification_status=0
    capture_image_qualification_output="$(
        node "$capture_root/scripts/qualify-cloud-preview-image.mjs" \
            "${capture_image_qualification_args[@]}" 2>&1
    )" || capture_image_qualification_status=$?
    if (( capture_image_qualification_status != 0 )); then
        persist_capture_failure "high-cloud-image-qualification" \
            "$capture_image_qualification_status" \
            "$capture_image_qualification_output"
        # Keep the fully rendered rejection beside its bounded diagnostics for
        # visual debugging, but never publish it into the immutable preview
        # manifest.  The matrix remains completed-images-only while a failed
        # morphology/artifact gate still leaves one inspectable canary.
        mkdir -p "$capture_diagnostic_root"
        cp "$capture_output" \
            "$capture_diagnostic_root/rejected-${capture_parameter}-${capture_safe_case}.png"
        rm -f "$capture_output"
        exit 1
    fi
fi

rm -f "$capture_failure_log"

#!/usr/bin/env bash
set -euo pipefail

review_root="$(cd "$(dirname "$0")/.." && pwd)"
review_base_url="${CLOUD_REVIEW_URL:-http://127.0.0.1:3000}"
review_case="${1:-cu-mediocris--day-oblique-natural}"
review_debug="${2:-final}"
review_production_perspective="${CLOUD_REVIEW_PRODUCTION_PERSPECTIVE:-oblique-natural}"
review_output_root="${CLOUD_REVIEW_OUTPUT:-$review_root/output/cloud-review}"
# The strict capture includes an exact light solve followed by 64 full-frame
# transports. Current high-quality adapters can legitimately need roughly
# thirteen minutes for that bounded workload, so retain a hard ceiling with
# enough margin for completion instead of failing a healthy run at one minute.
review_timeout_ms="${CLOUD_REVIEW_TIMEOUT_MS:-900000}"
review_transport_updates="${CLOUD_REVIEW_TRANSPORT_UPDATES:-64}"
review_playwright_cli="${PWCLI:-playwright-cli}"
review_session="cloud-review-$$"
review_safe_case="$(printf '%s' "$review_case" | tr -cs '[:alnum:]_-' '-')"
review_safe_debug="$(printf '%s' "$review_debug" | tr -cs '[:alnum:]_-' '-')"
review_image="$review_output_root/${review_safe_case}-${review_safe_debug}.png"
review_failure_log="$review_output_root/${review_safe_case}-${review_safe_debug}.failure.log"
review_url="$review_base_url/cloud-photographs?case=$review_case&capture=render&debug=$review_debug&productionPerspective=$review_production_perspective"

mkdir -p "$review_output_root"
# A rejected rerun must never leave an older frame at the requested path and
# make downstream review believe the current renderer succeeded.
rm -f "$review_image"
rm -f "$review_failure_log"

cleanup() {
    "$review_playwright_cli" --session "$review_session" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

review_cli_transcript_failed() {
    # playwright-cli currently reports some protocol/runtime failures in its
    # transcript while returning status zero. Treat its explicit error records
    # as authoritative rather than relying on the process status alone.
    printf '%s\n' "$1" | grep -Eq \
        '^[[:space:]]*(### Error([[:space:]]|$)|(Timeout|Playwright)?Error:)'
}

persist_review_failure() {
    local stage="$1"
    local status="$2"
    local transcript="$3"
    {
        printf 'stage=%s\n' "$stage"
        printf 'cli_exit_status=%s\n' "$status"
        printf '%s\n' "$transcript"
    } > "$review_failure_log"
    echo "Cloud review failed; diagnostics: $review_failure_log" >&2
}

if ! curl -fsS "$review_base_url/cloud-photographs" >/dev/null; then
    echo "Cloud review requires a running Elements server at $review_base_url" >&2
    exit 1
fi

review_open_status=0
review_open_result="$(
    "$review_playwright_cli" --session "$review_session" open "$review_url" 2>&1
)" || review_open_status=$?
if (( review_open_status != 0 )) || \
    review_cli_transcript_failed "$review_open_result"; then
    persist_review_failure "open" "$review_open_status" "$review_open_result"
    exit 1
fi

# This is the only path that writes a review image. It waits for the page's
# measured WebGPU contract, rejects failed/empty results, and screenshots only
# after a converged sequence of complete transports plus nonzero G-buffer
# cloud evidence. The page and strict harness share the complete 64-transport
# history horizon and measured reconstruction-maturity gate.
review_cli_status=0
review_result="$(
"$review_playwright_cli" --session "$review_session" run-code \
    "async (page) => {
        const deadline = Date.now() + $review_timeout_ms;
        const remainingTimeout = () => Math.max(1, deadline - Date.now());
        const readiness = page.locator('[data-benchmark-ready]');
        await readiness.waitFor({
            state: 'attached',
            timeout: remainingTimeout(),
        });
        try {
        await page.waitForFunction(() => {
            const output = document.querySelector('[data-benchmark-ready]');
            if (!output) return false;
            const ready = output.getAttribute('data-benchmark-ready');
            const state = output.getAttribute('data-cloud-render-state');
            const updates = Number(output.getAttribute('data-cloud-transport-updates'));
            const lightState = output.getAttribute('data-cloud-light-volume-state');
            const lightGeneration = Number(output.getAttribute('data-cloud-light-volume-generation'));
            const selectedBricks = Number(output.getAttribute('data-cloud-light-volume-selected-bricks'));
            const readyBricks = Number(output.getAttribute('data-cloud-light-volume-ready-bricks'));
            const residentLayerMask = Number(output.getAttribute('data-cloud-light-volume-resident-layer-mask'));
            const residual = Number(output.getAttribute('data-cloud-light-volume-residual'));
            const residualTolerance = Number(output.getAttribute('data-cloud-light-volume-residual-tolerance'));
            const nonFiniteCount = Number(output.getAttribute('data-cloud-light-volume-residual-non-finite-count'));
            const energyViolationCount = Number(output.getAttribute('data-cloud-light-volume-residual-energy-violation-count'));
            const occupiedCount = Number(output.getAttribute('data-cloud-light-volume-residual-occupied-count'));
            const nearStorageRailCount = Number(output.getAttribute('data-cloud-light-volume-near-storage-rail-count'));
            const transportNonFiniteCount = Number(output.getAttribute('data-cloud-transport-non-finite-count'));
            const radianceNonFiniteCount = Number(output.getAttribute('data-cloud-radiance-non-finite-count'));
            const rawRadianceTemporalDelta = Number(output.getAttribute('data-cloud-raw-radiance-temporal-delta'));
            const rawTransmittanceTemporalDelta = Number(output.getAttribute('data-cloud-raw-transmittance-temporal-delta'));
            const resolvedRadianceTemporalDelta = Number(output.getAttribute('data-cloud-resolved-radiance-temporal-delta'));
            const historyAcceptanceFraction = Number(output.getAttribute('data-cloud-history-acceptance-fraction'));
            const stableHistoryAge = Number(output.getAttribute('data-cloud-stable-history-age'));
            const persistentHistoryConfidence = Number(output.getAttribute('data-cloud-persistent-history-confidence'));
            const minimumHistoryAcceptanceFraction = Number(output.getAttribute('data-cloud-minimum-history-acceptance-fraction'));
            const minimumStableHistoryAge = Number(output.getAttribute('data-cloud-minimum-stable-history-age'));
            const minimumPersistentHistoryConfidence = Number(output.getAttribute('data-cloud-minimum-persistent-history-confidence'));
            const reconstructionMature = output.getAttribute('data-cloud-reconstruction-mature') === 'true';
            const reconstructionRawNonFiniteCount = Number(output.getAttribute('data-cloud-reconstruction-raw-non-finite-count'));
            const reconstructionResolvedNonFiniteCount = Number(output.getAttribute('data-cloud-reconstruction-resolved-non-finite-count'));
            const lightFailure = output.getAttribute('data-cloud-light-volume-residual-failure');
            const exactOnlyLighting = readyBricks === selectedBricks &&
                residentLayerMask === 0;
            const cachedLighting = residentLayerMask !== 0 &&
                selectedBricks > 0 &&
                readyBricks === selectedBricks &&
                Number.isFinite(residual) && Number.isFinite(residualTolerance) &&
                residual <= residualTolerance && nonFiniteCount === 0 &&
                energyViolationCount === 0 && nearStorageRailCount === 0 &&
                occupiedCount > 0;
            const lightingReady = lightGeneration > 0 &&
                lightState === 'complete' &&
                (exactOnlyLighting || cachedLighting) &&
                Number.isFinite(transportNonFiniteCount) &&
                Number.isFinite(radianceNonFiniteCount) &&
                transportNonFiniteCount === 0 &&
                radianceNonFiniteCount === 0 &&
                lightFailure === 'none';
            const reconstructionMeasured =
                Number.isFinite(rawRadianceTemporalDelta) &&
                Number.isFinite(rawTransmittanceTemporalDelta) &&
                Number.isFinite(resolvedRadianceTemporalDelta) &&
                Number.isFinite(historyAcceptanceFraction) &&
                Number.isFinite(stableHistoryAge) &&
                Number.isFinite(persistentHistoryConfidence) &&
                reconstructionRawNonFiniteCount === 0 &&
                reconstructionResolvedNonFiniteCount === 0;
            const reconstructionReady = reconstructionMeasured &&
                Number.isFinite(minimumHistoryAcceptanceFraction) &&
                Number.isFinite(minimumStableHistoryAge) &&
                Number.isFinite(minimumPersistentHistoryConfidence) &&
                historyAcceptanceFraction >= minimumHistoryAcceptanceFraction &&
                stableHistoryAge >= minimumStableHistoryAge &&
                persistentHistoryConfidence >= minimumPersistentHistoryConfidence &&
                reconstructionMature;
            return (ready === 'ready' && lightingReady && reconstructionMeasured &&
                reconstructionReady && updates >= $review_transport_updates) ||
                state === 'failed' ||
                lightState === 'failed' ||
                (state === 'empty' && updates >= $review_transport_updates);
        }, undefined, { timeout: remainingTimeout() });
        } catch (error) {
            const attributes = await readiness.evaluate((output) =>
                Object.fromEntries([...output.attributes]
                    .filter((attribute) => attribute.name.startsWith('data-'))
                    .map((attribute) => [attribute.name, attribute.value])))
                .catch(() => ({ missing: 'data-benchmark-ready' }));
            const rendererInitializationStage = await page
                .locator('canvas[data-sky-renderer]')
                .getAttribute('data-cloud-renderer-init-stage')
                .catch(() => null);
            const rendererLightProgress = await page
                .locator('canvas[data-sky-renderer]')
                .evaluate((canvas) => Object.fromEntries([...canvas.attributes]
                    .filter((attribute) => attribute.name.startsWith(
                        'data-cloud-light-volume-'))
                    .map((attribute) => [attribute.name, attribute.value])))
                .catch(() => ({ unavailable: 'renderer-light-progress' }));
            throw new Error('Cloud readiness timed out before screenshot: ' +
                JSON.stringify({
                    ...attributes,
                    rendererInitializationStage:
                        rendererInitializationStage ?? 'unavailable',
                    rendererLightProgress,
                }) + '; ' + String(error));
        }
        const evidence = await readiness.evaluate((element) => ({
            ready: element.getAttribute('data-benchmark-ready'),
            state: element.getAttribute('data-cloud-render-state'),
            projectedOpacity: Number(element.getAttribute('data-cloud-projected-opacity')),
            occupiedSky: Number(element.getAttribute('data-cloud-occupied-sky')),
            transportUpdates: Number(element.getAttribute('data-cloud-transport-updates')),
            lightState: element.getAttribute('data-cloud-light-volume-state'),
            lightGeneration: Number(element.getAttribute('data-cloud-light-volume-generation')),
            selectedBricks: Number(element.getAttribute('data-cloud-light-volume-selected-bricks')),
            readyBricks: Number(element.getAttribute('data-cloud-light-volume-ready-bricks')),
            residentLayerMask: Number(element.getAttribute('data-cloud-light-volume-resident-layer-mask')),
            residual: Number(element.getAttribute('data-cloud-light-volume-residual')),
            residualTolerance: Number(element.getAttribute('data-cloud-light-volume-residual-tolerance')),
            nonFiniteCount: Number(element.getAttribute('data-cloud-light-volume-residual-non-finite-count')),
            energyViolationCount: Number(element.getAttribute('data-cloud-light-volume-residual-energy-violation-count')),
            occupiedCount: Number(element.getAttribute('data-cloud-light-volume-residual-occupied-count')),
            maximumFluence: element.getAttribute('data-cloud-light-volume-maximum-fluence'),
            maximumNumerator: element.getAttribute('data-cloud-light-volume-maximum-numerator'),
            maximumDenominator: element.getAttribute('data-cloud-light-volume-maximum-denominator'),
            maximumBoundary: element.getAttribute('data-cloud-light-volume-maximum-boundary'),
            maximumCandidate: element.getAttribute('data-cloud-light-volume-maximum-candidate'),
            nearStorageRailCount: Number(element.getAttribute('data-cloud-light-volume-near-storage-rail-count')),
            transportNonFiniteCount: Number(element.getAttribute('data-cloud-transport-non-finite-count')),
            radianceNonFiniteCount: Number(element.getAttribute('data-cloud-radiance-non-finite-count')),
            maximumTransmittanceChroma: Number(element.getAttribute('data-cloud-maximum-transmittance-chroma')),
            rawRadianceTemporalDelta: Number(element.getAttribute('data-cloud-raw-radiance-temporal-delta')),
            rawTransmittanceTemporalDelta: Number(element.getAttribute('data-cloud-raw-transmittance-temporal-delta')),
            resolvedRadianceTemporalDelta: Number(element.getAttribute('data-cloud-resolved-radiance-temporal-delta')),
            rawResolvedRadianceResidual: Number(element.getAttribute('data-cloud-raw-resolved-radiance-residual')),
            historyAcceptanceFraction: Number(element.getAttribute('data-cloud-history-acceptance-fraction')),
            stableHistoryAge: Number(element.getAttribute('data-cloud-stable-history-age')),
            persistentHistoryConfidence: Number(element.getAttribute('data-cloud-persistent-history-confidence')),
            minimumHistoryAcceptanceFraction: Number(element.getAttribute('data-cloud-minimum-history-acceptance-fraction')),
            minimumStableHistoryAge: Number(element.getAttribute('data-cloud-minimum-stable-history-age')),
            minimumPersistentHistoryConfidence: Number(element.getAttribute('data-cloud-minimum-persistent-history-confidence')),
            reconstructionMature: element.getAttribute('data-cloud-reconstruction-mature') === 'true',
            rawRadianceSpatialVariation: Number(element.getAttribute('data-cloud-raw-radiance-spatial-variation')),
            resolvedRadianceSpatialVariation: Number(element.getAttribute('data-cloud-resolved-radiance-spatial-variation')),
            firstDepthTemporalDelta: Number(element.getAttribute('data-cloud-first-depth-temporal-delta')),
            meanDepthTemporalDelta: Number(element.getAttribute('data-cloud-mean-depth-temporal-delta')),
            opticalDepthTemporalDelta: Number(element.getAttribute('data-cloud-optical-depth-temporal-delta')),
            reconstructionRawNonFiniteCount: Number(element.getAttribute('data-cloud-reconstruction-raw-non-finite-count')),
            reconstructionResolvedNonFiniteCount: Number(element.getAttribute('data-cloud-reconstruction-resolved-non-finite-count')),
            lightFailure: element.getAttribute('data-cloud-light-volume-residual-failure'),
        }));
        if (evidence.ready !== 'ready') {
            throw new Error('Cloud frame rejected before screenshot: ' + JSON.stringify(evidence));
        }
        if (evidence.transportUpdates < $review_transport_updates) {
            throw new Error('Cloud frame was not converged before screenshot: ' + JSON.stringify(evidence));
        }
        const exactOnlyLighting =
            evidence.readyBricks === evidence.selectedBricks &&
            evidence.residentLayerMask === 0;
        const cachedLighting = evidence.residentLayerMask !== 0 &&
            evidence.selectedBricks > 0 &&
            evidence.readyBricks === evidence.selectedBricks &&
            Number.isFinite(evidence.residual) &&
            Number.isFinite(evidence.residualTolerance) &&
            evidence.residual <= evidence.residualTolerance &&
            evidence.nonFiniteCount === 0 && evidence.energyViolationCount === 0 &&
            evidence.nearStorageRailCount === 0 && evidence.occupiedCount > 0;
        const lightingReady = evidence.lightGeneration > 0 &&
            evidence.lightState === 'complete' &&
            (exactOnlyLighting || cachedLighting) &&
            Number.isFinite(evidence.transportNonFiniteCount) &&
            Number.isFinite(evidence.radianceNonFiniteCount) &&
            evidence.transportNonFiniteCount === 0 &&
            evidence.radianceNonFiniteCount === 0 &&
            evidence.lightFailure === 'none';
        if (!lightingReady) {
            throw new Error('Cloud light volume was incomplete before screenshot: ' + JSON.stringify(evidence));
        }
        const reconstructionMeasured =
            Number.isFinite(evidence.rawRadianceTemporalDelta) &&
            Number.isFinite(evidence.rawTransmittanceTemporalDelta) &&
            Number.isFinite(evidence.resolvedRadianceTemporalDelta) &&
            Number.isFinite(evidence.historyAcceptanceFraction) &&
            Number.isFinite(evidence.stableHistoryAge) &&
            Number.isFinite(evidence.persistentHistoryConfidence) &&
            evidence.reconstructionRawNonFiniteCount === 0 &&
            evidence.reconstructionResolvedNonFiniteCount === 0;
        if (!reconstructionMeasured) {
            throw new Error('Cloud reconstruction diagnostics were incomplete before screenshot: ' + JSON.stringify(evidence));
        }
        const reconstructionReady =
            Number.isFinite(evidence.minimumHistoryAcceptanceFraction) &&
            Number.isFinite(evidence.minimumStableHistoryAge) &&
            Number.isFinite(evidence.minimumPersistentHistoryConfidence) &&
            evidence.historyAcceptanceFraction >=
                evidence.minimumHistoryAcceptanceFraction &&
            evidence.stableHistoryAge >= evidence.minimumStableHistoryAge &&
            evidence.persistentHistoryConfidence >=
                evidence.minimumPersistentHistoryConfidence &&
            evidence.reconstructionMature;
        if (!reconstructionReady) {
            throw new Error('Cloud reconstruction was not mature before screenshot: ' + JSON.stringify(evidence));
        }
        await page.locator('[data-benchmark-render]').screenshot({
            path: '$review_image',
            scale: 'device',
            type: 'png',
        });
        return evidence;
    }" 2>&1
)" || review_cli_status=$?
if (( review_cli_status != 0 )) || \
    review_cli_transcript_failed "$review_result"; then
    # Keep the complete readiness payload even if the coordinating terminal or
    # task session expires. The next investigation can recover the exact phase,
    # brick, slab, fence, residual, and renderer initialization stage without
    # repeating a several-minute strict run.
    persist_review_failure "run-code" "$review_cli_status" "$review_result"
    exit 1
fi

printf '%s\n' "$review_result"

if [[ ! -s "$review_image" ]]; then
    persist_review_failure "missing-image" "$review_cli_status" "$review_result"
    echo "Cloud review produced no verified image for $review_case" >&2
    exit 1
fi

echo "Verified cloud review image: $review_image"

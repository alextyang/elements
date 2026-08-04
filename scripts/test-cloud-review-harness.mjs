import assert from "node:assert/strict";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const benchmarkSource = readFileSync(
    new URL("../app/cloud-photographs/cloud-photograph-benchmark.tsx", import.meta.url),
    "utf8",
);
const rendererSource = readFileSync(
    new URL("../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url),
    "utf8",
);
const orthogonalSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-photograph-orthogonal-benchmark.ts", import.meta.url),
    "utf8",
);
const harnessSource = readFileSync(
    new URL("./review-cloud-render.sh", import.meta.url),
    "utf8",
);

test("cloud photograph readiness is measured from the current WebGPU case", () => {
    assert.match(benchmarkSource, /visualResult\?\.caseId === benchmark\.id/);
    assert.match(benchmarkSource, /rendererResult\?\.caseId === benchmark\.id/);
    assert.match(benchmarkSource, /rendererStats\?\.backend === "webgpu"/);
    assert.match(benchmarkSource, /cloudLightResult\?\.caseId === benchmark\.id/);
    assert.match(benchmarkSource, /cloudLight\.generation > 0/);
    assert.match(benchmarkSource, /cloudLight\.state === "complete"/);
    assert.doesNotMatch(benchmarkSource,
        /cloudLight\.state === "empty"[\s\S]*cloudLight\.selectedBricks === 0/);
    assert.match(benchmarkSource, /cloudLight\.readyBricks === cloudLight\.selectedBricks/);
    assert.match(benchmarkSource, /cloudLight\.residentLayerMask === 0/,
        "an exact-only generation may retain ready direct-field bricks");
    assert.match(benchmarkSource,
        /cloudLight\.residentLayerMask !== 0[\s\S]*Number\.isFinite\(cloudLight\.residual\)/,
        "only resident P1 generations require diffusion residual evidence");
    assert.doesNotMatch(benchmarkSource, /cloudLight\.residentLayerMask > 0/,
        "partial but converged light volumes retain continuous fallback transport");
    assert.match(benchmarkSource, /Number\.isFinite\(cloudLight\.residual\)/);
    assert.match(benchmarkSource, /cloudLight\.residual <= cloudLight\.residualTolerance/);
    assert.match(benchmarkSource, /cloudLight\.nonFiniteCount === 0/);
    assert.match(benchmarkSource, /cloudLight\.energyViolationCount === 0/);
    assert.match(benchmarkSource, /cloudLight\.nearStorageRailCount === 0/);
    assert.match(benchmarkSource, /cloudLight\.occupiedCount > 0/);
    assert.match(benchmarkSource, /cloudLight\.transportNonFiniteCount === 0/);
    assert.match(benchmarkSource, /cloudLight\.radianceNonFiniteCount === 0/);
    assert.match(benchmarkSource, /cloudTransportInvalid/);
    assert.match(benchmarkSource, /cloudLightFailed/);
    assert.match(benchmarkSource, /cloudLight\.state === "failed"/);
    assert.doesNotMatch(benchmarkSource,
        /cloudLight && \(cloudLight\.state === "failed"[\s\S]*cloudLight\.failure !== "none"/,
        "an intermediate residual miss must remain a warming state");
    assert.match(benchmarkSource, /cloudLight\.failure === "none"/);
    assert.match(benchmarkSource, /cloudLightReady &&/);
    assert.match(benchmarkSource, /rendererStats\.historyValid/);
    assert.match(benchmarkSource,
        /rendererStats\.transportUpdates \?\? 0\) >=[\s\S]*CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(benchmarkSource, /isCloudReconstructionMature\(\{/);
    assert.match(benchmarkSource, /reconstructionMature &&/);
    assert.match(benchmarkSource,
        /data-cloud-reconstruction-mature=\{reconstructionMature \? "true" : "false"\}/);
    assert.match(benchmarkSource, /rendererStats\.projectedOpacity > 0\.00001/);
    assert.match(benchmarkSource, /rendererStats\.occupiedSkyFraction > minimumOccupiedSky/);
    assert.match(benchmarkSource, /Math\.max\(0\.0025, expectedCoverage \* 0\.02\)/);
    assert.doesNotMatch(benchmarkSource, /snapshot \? "ready" : "rendering"/);
});

test("capture-only render freezes weather and completes the bounded convergence tail", () => {
    assert.match(benchmarkSource,
        /if \(mode === "render"\)[\s\S]*?<Render[\s\S]*?paused/);
    assert.doesNotMatch(benchmarkSource,
        /mode === "overlay"[\s\S]*?<Render[^>]*paused/);
    assert.match(rendererSource, /resolveCloudRenderClock\(\{/);
    assert.match(rendererSource,
        /requestedSnapshotSeconds:[\s\S]*current\.radiance\.cloudTime % 10_000/);
    assert.match(rendererSource,
        /cloudLightState = "complete";[\s\S]*transportUpdates = 0;[\s\S]*wakeRef\.current\?\.\(\)/);
    assert.match(rendererSource, /CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(benchmarkSource,
        /CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
});

test("final-color observers receive nonempty cloud metrics", () => {
    assert.match(
        rendererSource,
        /current\.options\.debugView !== "final" \|\| current\.onStats/,
    );
    assert.match(rendererSource, /transportUpdates,/);
    assert.match(rendererSource, /cloudTransportUpdates = String\(transportUpdates\)/);
});

test("review harness writes no screenshot before measured readiness", () => {
    const readyCheck = harnessSource.indexOf("if (evidence.ready !== 'ready')");
    const screenshot = harnessSource.indexOf(".screenshot({");
    assert.ok(readyCheck >= 0);
    assert.ok(screenshot > readyCheck);
    assert.match(harnessSource, /state === 'failed' \|\|[\s\S]*state === 'empty' && updates >= \$review_transport_updates/);
    assert.match(harnessSource, /lightState === 'failed'/);
    assert.doesNotMatch(harnessSource,
        /lightFailure !== 'none' && lightFailure !== 'unavailable'/,
        "the renderer state, not an intermediate residual label, is terminal");
    assert.match(harnessSource, /Cloud frame rejected before screenshot/);
    assert.match(harnessSource, /CLOUD_REVIEW_TRANSPORT_UPDATES:-64/);
    assert.match(harnessSource, /CLOUD_REVIEW_TIMEOUT_MS:-900000/);
    assert.match(harnessSource,
        /const deadline = Date\.now\(\) \+ \$review_timeout_ms/);
    assert.match(harnessSource, /timeout: remainingTimeout\(\)/);
    assert.match(harnessSource, /evidence\.transportUpdates < \$review_transport_updates/);
    assert.match(harnessSource, /evidence\.lightGeneration > 0/);
    assert.match(harnessSource, /evidence\.lightState === 'complete'/);
    assert.match(harnessSource,
        /exactOnlyLighting =[\s\S]{0,120}evidence\.readyBricks === evidence\.selectedBricks[\s\S]{0,120}evidence\.residentLayerMask === 0/);
    assert.match(harnessSource,
        /cachedLighting = evidence\.residentLayerMask !== 0/);
    assert.match(harnessSource,
        /\(exactOnlyLighting \|\| cachedLighting\)/);
    assert.doesNotMatch(harnessSource,
        /evidence\.lightState === 'empty'[\s\S]*evidence\.selectedBricks === 0/);
    assert.match(harnessSource, /evidence\.readyBricks === evidence\.selectedBricks/);
    assert.doesNotMatch(harnessSource, /evidence\.residentLayerMask > 0/,
        "zero whole-layer residency is valid for support larger than the brick budget");
    assert.match(harnessSource, /Number\.isFinite\(evidence\.residual\)/);
    assert.match(harnessSource, /evidence\.residual <= evidence\.residualTolerance/);
    assert.match(harnessSource, /evidence\.nonFiniteCount === 0/);
    assert.match(harnessSource, /evidence\.energyViolationCount === 0/);
    assert.match(harnessSource, /evidence\.nearStorageRailCount === 0/);
    assert.match(harnessSource, /evidence\.transportNonFiniteCount === 0/);
    assert.match(harnessSource, /evidence\.radianceNonFiniteCount === 0/);
    assert.match(harnessSource, /evidence\.occupiedCount > 0/);
    assert.match(harnessSource, /evidence\.lightFailure === 'none'/);
    assert.match(harnessSource, /Cloud light volume was incomplete before screenshot/);
    assert.match(harnessSource, /Number\.isFinite\(evidence\.rawRadianceTemporalDelta\)/);
    assert.match(harnessSource, /Number\.isFinite\(evidence\.rawTransmittanceTemporalDelta\)/);
    assert.match(harnessSource, /Number\.isFinite\(evidence\.resolvedRadianceTemporalDelta\)/);
    assert.match(harnessSource, /Number\.isFinite\(evidence\.persistentHistoryConfidence\)/);
    assert.match(harnessSource,
        /evidence\.historyAcceptanceFraction >=[\s\S]*evidence\.minimumHistoryAcceptanceFraction/);
    assert.match(harnessSource,
        /evidence\.stableHistoryAge >= evidence\.minimumStableHistoryAge/);
    assert.match(harnessSource,
        /evidence\.persistentHistoryConfidence >=[\s\S]*evidence\.minimumPersistentHistoryConfidence/);
    assert.match(harnessSource, /evidence\.reconstructionMature/);
    assert.match(harnessSource, /evidence\.reconstructionRawNonFiniteCount === 0/);
    assert.match(harnessSource, /evidence\.reconstructionResolvedNonFiniteCount === 0/);
    assert.match(harnessSource, /Cloud reconstruction diagnostics were incomplete before screenshot/);
    assert.match(harnessSource, /Cloud reconstruction was not mature before screenshot/);
    assert.match(harnessSource, /rm -f "\$review_image"/);
    assert.match(harnessSource, /review_failure_log=/);
    assert.match(harnessSource,
        /persist_review_failure "run-code" "\$review_cli_status" "\$review_result"/);
    assert.match(harnessSource, /review_cli_transcript_failed/);
    assert.match(harnessSource, /### Error/);
    assert.match(harnessSource, /if \[\[ ! -s "\$review_image" \]\]/);
    assert.match(harnessSource, /rendererLightProgress/);
    assert.match(harnessSource, /data-cloud-light-volume-/);
});

test("review harness persists playwright transcript errors even at exit zero", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-review-harness-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const outputRoot = join(temporaryRoot, "output");
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
case " $* " in
  *" run-code "*)
    printf '%s\\n' '### Error' 'TimeoutError: synthetic readiness timeout'
    exit 0
    ;;
esac
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./review-cloud-render.sh", import.meta.url).pathname,
            "synthetic-case",
            "final",
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_REVIEW_OUTPUT: outputRoot,
                CLOUD_REVIEW_URL: "http://synthetic.invalid",
            },
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /Cloud review failed; diagnostics:/);
        assert.doesNotMatch(result.stderr, /produced no verified image/);
        const failureLog = join(outputRoot,
            "synthetic-case-final.failure.log");
        assert.equal(existsSync(failureLog), true);
        const diagnostics = readFileSync(failureLog, "utf8");
        assert.match(diagnostics, /stage=run-code/);
        assert.match(diagnostics, /cli_exit_status=0/);
        assert.match(diagnostics, /### Error/);
        assert.match(diagnostics, /TimeoutError: synthetic readiness timeout/);
        assert.equal(existsSync(join(outputRoot,
            "synthetic-case-final.png")), false);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("orthogonal controls and captures reuse the measured base-route contract", () => {
    for (const label of [
        "Production perspective",
        "Qualification set",
        "Morphology axis",
        "Target",
        "Physical environment",
        "Target resolver perspective",
        "Coverage",
    ]) {
        assert.match(benchmarkSource, new RegExp(`label="${label}"`));
    }
    assert.match(benchmarkSource, /resolveOrthogonalCloudPhotographCase\(requested\)/);
    assert.match(benchmarkSource, /orthogonalBenchmark \?\? baseBenchmark/);
    assert.match(benchmarkSource, /data-benchmark-kind=\{qualificationSet\}/);
    assert.match(benchmarkSource, /cloudMorphologyPhotographCaseId/);
    assert.match(benchmarkSource,
        /\$\{captureParameter\}=\$\{encodeURIComponent\(caseId\)\}/);
    assert.match(benchmarkSource, /applyProductionPerspectiveToCloudPhotographCase/);
    assert.match(benchmarkSource, /productionCameraSignature/);
    assert.doesNotMatch(benchmarkSource, /iterateCloudMorphologyPhotographCases/);
    assert.doesNotMatch(orthogonalSource,
        /iterateCloudMorphologyPhotographCases|fetch\s*\(|new\s+Image\s*\(/);
    assert.match(harnessSource,
        /review_url="\$review_base_url\/cloud-photographs\?case=\$review_case&capture=render&debug=\$review_debug&productionPerspective=\$review_production_perspective"/);
});

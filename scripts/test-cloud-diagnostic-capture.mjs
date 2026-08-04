import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
    CLOUD_DIAGNOSTIC_DEFAULT_TRANSPORT_UPDATES,
    CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT,
    CLOUD_DIAGNOSTIC_DEFAULT_VIEW_TIMEOUT_MS,
    CLOUD_DIAGNOSTIC_DEFAULT_VIEWS,
    CLOUD_DIAGNOSTIC_SCHEMA_VERSION,
    CLOUD_DIAGNOSTIC_SUPPORTED_VIEWS,
    diagnosticFilenameStem,
    parseDiagnosticArguments,
} from "./capture-cloud-diagnostics.mjs";

const root = join(import.meta.dirname, "..");
const diagnosticSource = readFileSync(
    join(import.meta.dirname, "capture-cloud-diagnostics.mjs"),
    "utf8",
);
const captureSource = readFileSync(
    join(import.meta.dirname, "capture-cloud-preview.sh"),
    "utf8",
);

const revision = "a".repeat(64);

test("diagnostics default to the required ordered view set", () => {
    assert.equal(CLOUD_DIAGNOSTIC_SCHEMA_VERSION, 1);
    assert.deepEqual(CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT, {
        width: 800,
        height: 500,
    });
    assert.equal(CLOUD_DIAGNOSTIC_DEFAULT_TRANSPORT_UPDATES, 64);
    assert.equal(CLOUD_DIAGNOSTIC_DEFAULT_VIEW_TIMEOUT_MS, 180_000);
    assert.deepEqual(CLOUD_DIAGNOSTIC_DEFAULT_VIEWS, [
        "final",
        "lighting-direct-sun",
        "lighting-exterior-diffuse",
        "lighting-p1-cache",
        "lighting-source-higher-order",
        "lighting-atmosphere-composite",
        "history",
    ]);
    for (const view of CLOUD_DIAGNOSTIC_DEFAULT_VIEWS) {
        assert.ok(CLOUD_DIAGNOSTIC_SUPPORTED_VIEWS.includes(view), view);
    }
});

test("diagnostic CLI parsing fixes the case and capture contract", () => {
    const options = parseDiagnosticArguments([
        "--case", "CI Spissatus/day",
        "--url=http://localhost:3030",
        "--output", "tmp/diagnostics",
        "--perspective", "oblique-natural",
        "--views=final,history",
        "--view-timeout-ms", "12000",
        "--transport-updates=8",
        "--capture-mode", "headless",
        "--session-state", "tmp/session.json",
        "--renderer-revision", revision,
    ]);
    assert.equal(options.caseId, "CI Spissatus/day");
    assert.equal(options.url, "http://localhost:3030");
    assert.equal(options.productionPerspective, "oblique-natural");
    assert.deepEqual(options.views, ["final", "history"]);
    assert.equal(options.viewTimeoutMs, 12_000);
    assert.equal(options.transportUpdates, 8);
    assert.equal(options.captureMode, "headless");
    assert.match(options.sessionState, /tmp\/session\.json$/);
    assert.equal(options.rendererRevision, revision);
    assert.match(options.outputRoot, /tmp\/diagnostics$/);
});

test("diagnostic CLI rejects unsupported or ambiguous capture requests", () => {
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--views", "final,no-history"]),
        /Unsupported diagnostic view.*no-history/,
    );
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--views", "final,final"]),
        /duplicate view names/,
    );
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--view-timeout-ms", "999"]),
        /at least 1000/,
    );
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--capture-mode", "gpu"]),
        /native-metal or headless/,
    );
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--url", "file:///tmp/server"]),
        /http\(s\) URL/,
    );
    assert.throws(
        () => parseDiagnosticArguments(["--case", "case", "--renderer-revision", "not-a-sha"]),
        /SHA-256 hex digest/,
    );
});

test("diagnostic filenames carry immutable case, view, and revision identity", () => {
    assert.equal(
        diagnosticFilenameStem({
            caseId: "CI Spissatus/day",
            view: "lighting-direct-sun",
            rendererRevision: revision,
        }),
        "ci-spissatus-day--lighting-direct-sun--aaaaaaaaaaaaaaaa",
    );
    assert.throws(
        () => diagnosticFilenameStem({
            caseId: "case",
            view: "final",
            rendererRevision: "bad",
        }),
        /SHA-256 hex digest/,
    );
});

test("capture primitive exposes named-view, fixed-frame, and metrics guards", () => {
    assert.match(captureSource, /CLOUD_PREVIEW_DEBUG_VIEW/);
    assert.match(captureSource, /debug=\$capture_encoded_debug/);
    assert.match(captureSource, /data-cloud-debug-view/);
    assert.match(captureSource, /data-production-perspective/);
    assert.match(captureSource, /CLOUD_PREVIEW_CAPTURE_METRICS_B64/);
    assert.match(captureSource, /writeFileSync\(path, JSON\.stringify\(value, null, 2\)/);
    assert.match(captureSource, /flag: "wx"/);
    assert.match(captureSource, /capture_skip_qualification.*!= "1"/s);
    assert.match(captureSource, /capture_immutable_output.*== "1"/s);
});

test("diagnostic runner is private, serial, revision-bound, and process-group bounded", () => {
    assert.match(diagnosticSource, /manage-cloud-preview-capture-session\.sh/);
    assert.match(diagnosticSource, /runWithProcessGroupWatchdog/);
    assert.match(diagnosticSource, /for \(const view of options\.views\)/);
    assert.match(diagnosticSource, /CLOUD_PREVIEW_IMMUTABLE_OUTPUT: "1"/);
    assert.match(diagnosticSource, /CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION: "1"/);
    assert.match(diagnosticSource, /publicManifestPublished: false/);
    assert.match(diagnosticSource, /writeExclusiveJson/);
    assert.match(diagnosticSource, /rendererContentHash/);
    assert.doesNotMatch(diagnosticSource, /public\/generated\/cloud-previews\/manifest\.json/);
    assert.doesNotMatch(diagnosticSource, /generate-cloud-previews/);
    assert.ok(root.endsWith("/work/elements"));
});

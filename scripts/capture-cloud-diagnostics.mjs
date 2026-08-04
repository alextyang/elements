#!/usr/bin/env node

/**
 * Capture renderer-owned diagnostic views for one cloud photograph case.
 *
 * This is deliberately separate from the public preview generator. It uses
 * the same persistent Playwright session and bounded capture primitive, but it
 * writes only to output/cloud-diagnostics (or an explicitly supplied private
 * directory) and never touches the public preview manifest.
 */

import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";

import {
    rendererContentHash,
    runWithProcessGroupWatchdog,
    safePreviewId,
    sha256,
} from "./lib/cloud-preview-generation.mjs";

export const CLOUD_DIAGNOSTIC_SCHEMA_VERSION = 1;
export const CLOUD_DIAGNOSTIC_DEFAULT_PERSPECTIVE = "oblique-natural";
export const CLOUD_DIAGNOSTIC_DEFAULT_VIEW_TIMEOUT_MS = 180_000;
export const CLOUD_DIAGNOSTIC_DEFAULT_TRANSPORT_UPDATES = 64;
export const CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT = Object.freeze({
    width: 800,
    height: 500,
});

/** Every currently named SkyDebugView is accepted; the default is narrower. */
export const CLOUD_DIAGNOSTIC_SUPPORTED_VIEWS = Object.freeze([
    "final",
    "coverage",
    "density",
    "transmittance",
    "depth",
    "velocity",
    "history",
    "lighting",
    "steps",
    "lighting-direct-sun",
    "lighting-exterior-diffuse",
    "lighting-p1-cache",
    "lighting-atmosphere-composite",
    "lighting-source-higher-order",
    "lighting-atmosphere-shadow-loss",
]);

/** Initial diagnostic set: the final image, source partitions, and history. */
export const CLOUD_DIAGNOSTIC_DEFAULT_VIEWS = Object.freeze([
    "final",
    "lighting-direct-sun",
    "lighting-exterior-diffuse",
    "lighting-p1-cache",
    "lighting-source-higher-order",
    "lighting-atmosphere-composite",
    "history",
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..");
export const captureScriptPath = join(scriptDirectory, "capture-cloud-preview.sh");
export const captureSessionScriptPath = join(
    scriptDirectory,
    "manage-cloud-preview-capture-session.sh",
);

const SHA256 = /^[a-f0-9]{64}$/i;

const parseInteger = (name, raw, minimum) => {
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${name} must be an integer of at least ${minimum}.`);
    }
    return value;
};

const parseViews = (raw) => {
    const values = String(raw).split(",").map((value) => value.trim())
        .filter(Boolean);
    if (values.length === 0) throw new Error("--views must not be empty.");
    const unknown = values.filter((value) =>
        !CLOUD_DIAGNOSTIC_SUPPORTED_VIEWS.includes(value));
    if (unknown.length > 0) {
        throw new Error(`Unsupported diagnostic view(s): ${unknown.join(", ")}`);
    }
    const unique = [...new Set(values)];
    if (unique.length !== values.length) {
        throw new Error("--views must not contain duplicate view names.");
    }
    return unique;
};

export const diagnosticFilenameStem = ({ caseId, view, rendererRevision }) => {
    if (!SHA256.test(rendererRevision)) {
        throw new Error("rendererRevision must be a SHA-256 hex digest.");
    }
    return `${safePreviewId(caseId)}--${safePreviewId(view)}--` +
        `${rendererRevision.slice(0, 16).toLowerCase()}`;
};

export const parseDiagnosticArguments = (values, {
    env = process.env,
} = {}) => {
    const options = {
        caseId: undefined,
        url: env.CLOUD_PREVIEW_URL ?? "http://127.0.0.1:3000",
        outputRoot: resolve(repositoryRoot,
            env.CLOUD_DIAGNOSTIC_ROOT ?? "output/cloud-diagnostics"),
        productionPerspective: env.CLOUD_PREVIEW_PRODUCTION_PERSPECTIVE ??
            CLOUD_DIAGNOSTIC_DEFAULT_PERSPECTIVE,
        views: [...CLOUD_DIAGNOSTIC_DEFAULT_VIEWS],
        viewTimeoutMs: parseInteger(
            "--view-timeout-ms",
            env.CLOUD_DIAGNOSTIC_VIEW_TIMEOUT_MS ??
                CLOUD_DIAGNOSTIC_DEFAULT_VIEW_TIMEOUT_MS,
            1_000,
        ),
        transportUpdates: parseInteger(
            "--transport-updates",
            env.CLOUD_PREVIEW_TRANSPORT_UPDATES ??
                CLOUD_DIAGNOSTIC_DEFAULT_TRANSPORT_UPDATES,
            1,
        ),
        captureMode: env.CLOUD_PREVIEW_CAPTURE_MODE ?? "native-metal",
        sessionState: undefined,
        rendererRevision: undefined,
        help: false,
    };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (argument === "--help" || argument === "-h") {
            options.help = true;
            continue;
        }
        const [name, inline] = argument.split("=", 2);
        const takesValue = [
            "--case", "--url", "--output", "--perspective", "--views",
            "--view-timeout-ms", "--transport-updates", "--capture-mode",
            "--session-state", "--renderer-revision",
        ].includes(name);
        if (!takesValue) throw new Error(`Unknown argument: ${argument}`);
        const value = inline ?? values[++index];
        if (value === undefined || value === "") {
            throw new Error(`${name} requires a value.`);
        }
        if (name === "--case") options.caseId = value;
        if (name === "--url") options.url = value;
        if (name === "--output") options.outputRoot = resolve(repositoryRoot, value);
        if (name === "--perspective") options.productionPerspective = value;
        if (name === "--views") options.views = parseViews(value);
        if (name === "--view-timeout-ms") options.viewTimeoutMs =
            parseInteger(name, value, 1_000);
        if (name === "--transport-updates") options.transportUpdates =
            parseInteger(name, value, 1);
        if (name === "--capture-mode") options.captureMode = value;
        if (name === "--session-state") options.sessionState = resolve(repositoryRoot, value);
        if (name === "--renderer-revision") options.rendererRevision = value;
    }
    if (options.help) return options;
    if (!options.caseId) throw new Error("--case is required.");
    if (!/^https?:\/\//.test(options.url)) {
        throw new Error("--url must be an http(s) URL.");
    }
    if (!["native-metal", "headless"].includes(options.captureMode)) {
        throw new Error("--capture-mode must be native-metal or headless.");
    }
    if (options.rendererRevision !== undefined &&
        !SHA256.test(options.rendererRevision)) {
        throw new Error("--renderer-revision must be a SHA-256 hex digest.");
    }
    return options;
};

export const diagnosticUsage = () => `Usage:
  node scripts/capture-cloud-diagnostics.mjs --case CASE [options]

Captures one cloud case through the existing persistent browser/session
lifecycle. Outputs are private diagnostic files, never public preview entries.

Options:
  --url URL                 Elements server (default http://127.0.0.1:3000)
  --output DIR              Private output directory
  --perspective ID          Fixed production perspective (default oblique-natural)
  --views CSV               Ordered serial debug views (default required set + history)
  --view-timeout-ms N       Per-view watchdog deadline (default 180000)
  --transport-updates N     Readiness transport horizon (default 64)
  --capture-mode MODE       native-metal or headless (default native-metal)
  --session-state PATH      Attach to an existing managed session; do not stop it
  --renderer-revision HASH  Expected local renderer SHA-256 (default computed)
`;

const readSessionState = (path, expectedCaptureMode) => {
    let state;
    try {
        state = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
        throw new Error(`Could not read persistent session state ${path}: ${
            error instanceof Error ? error.message : String(error)}`);
    }
    if (state?.schemaVersion !== 1 ||
        !/^cloud-preview-revision-[A-Za-z0-9_-]+$/.test(state.session ?? "") ||
        !Number.isSafeInteger(state.daemonPid) || state.daemonPid <= 0 ||
        !state.adapterInfo || typeof state.adapterBackend !== "string" ||
        state.captureMode !== expectedCaptureMode) {
        throw new Error(`Persistent cloud preview session state is invalid: ${path}`);
    }
    return state;
};

const captureTranscript = async ({
    captureScript,
    caseId,
    imagePath,
    repository,
    env,
    timeoutMs,
    run,
}) => {
    const chunks = [];
    const sink = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        },
    });
    const result = await run({
        command: "bash",
        args: [captureScript, "case", caseId, imagePath],
        cwd: repository,
        env,
        timeoutMs,
        stdout: sink,
        stderr: sink,
    });
    return {
        ...result,
        transcript: Buffer.concat(chunks).toString("utf8"),
    };
};

const pngDimensions = (path) => {
    const bytes = readFileSync(path);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) ||
        bytes.toString("ascii", 12, 16) !== "IHDR") {
        throw new Error(`Diagnostic output is not a PNG: ${path}`);
    }
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
    };
};

const writeExclusiveJson = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
};

const stopOwnedSession = async ({
    statePath,
    repository,
    sessionScript,
    run,
}) => {
    if (!existsSync(statePath)) return;
    const result = await run({
        command: "bash",
        args: [sessionScript, "stop", statePath],
        cwd: repository,
        env: process.env,
        timeoutMs: 15_000,
    });
    if (result.code !== 0) {
        throw new Error(`Persistent diagnostic session cleanup exited ${
            result.code ?? result.signal ?? "unknown"}.`);
    }
};

export const runCloudDiagnosticCapture = async (options, {
    repository = repositoryRoot,
    captureScript = captureScriptPath,
    sessionScript = captureSessionScriptPath,
    run = runWithProcessGroupWatchdog,
    hash = rendererContentHash,
    now = () => new Date().toISOString(),
} = {}) => {
    const rendererRevision = options.rendererRevision ?? hash(repository);
    if (!SHA256.test(rendererRevision)) {
        throw new Error("Computed renderer revision is not a SHA-256 digest.");
    }
    mkdirSync(options.outputRoot, { recursive: true });
    const caseStem = safePreviewId(options.caseId);
    const indexPath = join(
        options.outputRoot,
        `${caseStem}--${rendererRevision.slice(0, 16).toLowerCase()}.diagnostics.json`,
    );
    if (existsSync(indexPath)) {
        throw new Error(`Refusing to replace immutable diagnostic index: ${indexPath}`);
    }

    const ownedSessionRoot = mkdtempSync(join(
        tmpdir(),
        "elements-cloud-diagnostic-session-",
    ));
    const ownedStatePath = join(ownedSessionRoot, "session.json");
    const attachStatePath = options.sessionState;
    const statePath = attachStatePath ?? ownedStatePath;
    const ownsSession = !attachStatePath;
    let session;
    const lifecycleOutput = {
        stdout: process.stderr,
        stderr: process.stderr,
    };
    try {
        if (ownsSession) {
            const start = await run({
                command: "bash",
                args: [sessionScript, "start", statePath],
                cwd: repository,
                env: {
                    ...process.env,
                    CLOUD_PREVIEW_URL: options.url,
                    CLOUD_PREVIEW_CAPTURE_MODE: options.captureMode,
                },
                timeoutMs: 60_000,
                ...lifecycleOutput,
            });
            if (start.code !== 0 || !existsSync(statePath)) {
                throw new Error(`Persistent diagnostic session start exited ${
                    start.code ?? start.signal ?? "unknown"}.`);
            }
        }
        session = readSessionState(statePath, options.captureMode);
        const viewRecords = [];
        let productionCameraSignature;
        for (const view of options.views) {
            const currentRevision = hash(repository);
            if (currentRevision !== rendererRevision) {
                throw new Error(
                    "Renderer sources changed during diagnostic capture; " +
                    "discarding the mixed-revision run.",
                );
            }
            const stem = diagnosticFilenameStem({
                caseId: options.caseId,
                view,
                rendererRevision,
            });
            const imagePath = join(options.outputRoot, `${stem}.png`);
            const metricsPath = join(ownedSessionRoot, `${stem}.state.json`);
            const recordPath = join(options.outputRoot, `${stem}.json`);
            if (existsSync(imagePath) || existsSync(recordPath)) {
                throw new Error(`Refusing to replace immutable diagnostic view: ${stem}`);
            }
            const failureRoot = join(options.outputRoot, ".failures", stem);
            const result = await captureTranscript({
                captureScript,
                caseId: options.caseId,
                imagePath,
                repository,
                env: {
                    ...process.env,
                    CLOUD_PREVIEW_URL: options.url,
                    CLOUD_PREVIEW_PRODUCTION_PERSPECTIVE:
                        options.productionPerspective,
                    CLOUD_PREVIEW_DEBUG_VIEW: view,
                    CLOUD_PREVIEW_TRANSPORT_UPDATES:
                        String(options.transportUpdates),
                    CLOUD_PREVIEW_CAPTURE_MODE: options.captureMode,
                    CLOUD_PREVIEW_PAGE_TIMEOUT_MS: String(
                        Math.max(1_000, options.viewTimeoutMs - 5_000),
                    ),
                    CLOUD_PREVIEW_PERSISTENT_SESSION: session.session,
                    CLOUD_PREVIEW_PERSISTENT_DAEMON_PID:
                        String(session.daemonPid),
                    CLOUD_PREVIEW_PERSISTENT_ADAPTER_INFO:
                        JSON.stringify(session.adapterInfo),
                    CLOUD_PREVIEW_PERSISTENT_ADAPTER_BACKEND:
                        session.adapterBackend,
                    CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION: "1",
                    CLOUD_PREVIEW_IMMUTABLE_OUTPUT: "1",
                    CLOUD_PREVIEW_DISABLE_CASE_SWITCH: "1",
                    CLOUD_PREVIEW_CAPTURE_METRICS_PATH: metricsPath,
                    CLOUD_PREVIEW_DIAGNOSTIC_ROOT: failureRoot,
                },
                timeoutMs: options.viewTimeoutMs,
                run,
            });
            if (result.code !== 0 || !existsSync(imagePath) ||
                !existsSync(metricsPath)) {
                throw new Error(
                    `Diagnostic view ${view} failed (${result.code ?? result.signal ?? "unknown"}).\n` +
                    result.transcript.slice(-16_384),
                );
            }
            const metrics = JSON.parse(readFileSync(metricsPath, "utf8"));
            if (metrics.sceneKey !== options.caseId ||
                metrics.debugView !== view ||
                metrics.productionPerspective !== options.productionPerspective ||
                metrics.viewport?.width !== CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT.width ||
                metrics.viewport?.height !== CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT.height ||
                metrics.benchmarkReady !== "ready" ||
                typeof metrics.productionCameraSignature !== "string" ||
                metrics.productionCameraSignature.length === 0 ||
                (productionCameraSignature !== undefined &&
                    metrics.productionCameraSignature !== productionCameraSignature) ||
                metrics.renderBounds?.width !== CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT.width ||
                metrics.renderBounds?.height !== CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT.height ||
                !Number.isFinite(metrics.updates) ||
                metrics.updates < options.transportUpdates) {
                rmSync(imagePath, { force: true });
                throw new Error(
                    `Diagnostic view ${view} returned mismatched case/view/frame metrics: ` +
                    JSON.stringify(metrics),
                );
            }
            productionCameraSignature ??= metrics.productionCameraSignature;
            const afterRevision = hash(repository);
            if (afterRevision !== rendererRevision) {
                rmSync(imagePath, { force: true });
                throw new Error(
                    "Renderer sources changed after diagnostic screenshot; " +
                    "discarding the mixed-revision run.",
                );
            }
            const dimensions = pngDimensions(imagePath);
            const imageHash = sha256([readFileSync(imagePath)]);
            const record = {
                schemaVersion: CLOUD_DIAGNOSTIC_SCHEMA_VERSION,
                kind: "cloud-diagnostic-view",
                caseId: options.caseId,
                view,
                rendererRevision,
                productionPerspective: options.productionPerspective,
                productionCameraSignature,
                transportUpdates: options.transportUpdates,
                viewport: metrics.viewport,
                image: {
                    filename: `${stem}.png`,
                    path: relative(options.outputRoot, imagePath),
                    sha256: imageHash,
                    ...dimensions,
                },
                readiness: metrics,
                publicManifestPublished: false,
                capturedAt: now(),
            };
            writeExclusiveJson(recordPath, record);
            viewRecords.push({
                view,
                image: record.image,
                metrics: relative(options.outputRoot, recordPath),
                readiness: record.readiness,
            });
            rmSync(metricsPath, { force: true });
        }
        const finalRevision = hash(repository);
        if (finalRevision !== rendererRevision) {
            throw new Error(
                "Renderer sources changed before diagnostic index publication.",
            );
        }
        const index = {
            schemaVersion: CLOUD_DIAGNOSTIC_SCHEMA_VERSION,
            kind: "cloud-diagnostic-capture",
            caseId: options.caseId,
            rendererRevision,
            productionPerspective: options.productionPerspective,
            productionCameraSignature,
            viewport: CLOUD_DIAGNOSTIC_DEFAULT_VIEWPORT,
            transportUpdates: options.transportUpdates,
            views: viewRecords,
            publicManifestPublished: false,
            capturedAt: now(),
        };
        writeExclusiveJson(indexPath, index);
        return index;
    } finally {
        if (ownsSession) {
            try {
                await stopOwnedSession({
                    statePath,
                    repository,
                    sessionScript,
                    run,
                });
            } finally {
                rmSync(ownedSessionRoot, { recursive: true, force: true });
            }
        }
    }
};

const main = async () => {
    const options = parseDiagnosticArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(diagnosticUsage());
        return;
    }
    const result = await runCloudDiagnosticCapture(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

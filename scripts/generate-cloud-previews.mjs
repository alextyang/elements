#!/usr/bin/env node

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    renameSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
    CLOUD_PREVIEW_SCHEMA_VERSION,
    acquireGenerationLock,
    assertCloudPreviewFreeSpace,
    cloudPreviewAssetChecksumsEqual,
    isCloudPreviewAssetChecksums,
    readManifest,
    readCloudPreviewAssetChecksums,
    rendererContentHash,
    runWithProcessGroupWatchdog,
    safePreviewId,
    scenarioContentHash,
    sha256,
    writeJsonAtomic,
} from "./lib/cloud-preview-generation.mjs";
import { loadCloudPreviewScenarios } from "./lib/cloud-preview-scenarios.mjs";
import {
    HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT,
    cloudMaskFromCoverage,
    evaluateHighCloudPreviewImage,
    measureCloudPreviewImage,
} from "./lib/cloud-preview-image-qualification.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const publicRoot = join(repositoryRoot, "public/generated/cloud-previews");
const imageRoot = join(publicRoot, "images");
const manifestPath = join(publicRoot, "manifest.json");
const workRoot = join(repositoryRoot, "output/playwright/cloud-previews");
const captureScript = join(scriptDirectory, "capture-cloud-preview.sh");
const captureSessionScript = join(
    scriptDirectory,
    "manage-cloud-preview-capture-session.sh",
);
const shutdownController = new AbortController();
let shutdownExitCode;

/**
 * Convert the capture script's case-id filename component. The shell uses
 * `tr -cs '[:alnum:]_-' '-'`, which is equivalent to replacing each run of
 * non-alphanumeric/underscore/hyphen characters with one hyphen.
 */
export const captureFailureCaseName = (caseId) =>
    String(caseId).replace(/[^a-zA-Z0-9_-]+/g, "-");

/**
 * Preserve the primary reason recorded by capture-cloud-preview.sh. In
 * particular, a screenshot may pass page readiness and then fail the
 * renderer-independent high-cloud image qualifier; that result must survive
 * into the generator's rejection instead of becoming only "Capture exited 1".
 */
export const summarizeCloudPreviewCaptureFailure = (diagnostics) => {
    if (typeof diagnostics !== "string") return undefined;
    const stage = diagnostics.match(/^stage=([^\r\n]*)$/m)?.[1]?.trim();
    if (!stage) return undefined;
    const lines = diagnostics.split(/\r?\n/);
    const qualifier = lines
        .map((line) => line.match(
            /Cloud preview high-cloud image qualification: .*/,
        )?.[0])
        .filter(Boolean)
        .at(-1);
    const readiness = lines
        .map((line) => line.match(/Cloud preview readiness: .*/)?.[0])
        .filter(Boolean)
        .at(-1);
    const reason = qualifier ?? readiness;
    return reason
        ? `Cloud preview capture failed at stage=${stage}: ${reason}`
        : `Cloud preview capture failed at stage=${stage}.`;
};

export const readCloudPreviewCaptureFailure = (path) => {
    try {
        return summarizeCloudPreviewCaptureFailure(readFileSync(path, "utf8"));
    } catch {
        return undefined;
    }
};

const usage = () => process.stdout.write(`Usage:
  node scripts/generate-cloud-previews.mjs [options]

Options:
  --force                     Re-render selected previews even when hashes match.
  --url URL                   Elements server (default http://127.0.0.1:3000).
  --production-perspective ID Production camera (default oblique-natural).
  --only ID[,ID...]           Generate only these catalogue ids.
  --limit N                   Generate at most N selected pending entries.
  --transport-updates N       Completed transport threshold (minimum/default 64).
  --capture-mode MODE         native-metal (default) or headless.
  --timeout-ms N              Hard process-group watchdog per image (default 180000).
  --cooldown-ms N             Idle gap after renderer teardown (default 2500).
  --fail-fast                 Stop after the first rejected image.
  --list                      Print the exact shared catalogue without rendering.
`);

export const parseArguments = (values) => {
    const options = {
        force: false,
        url: process.env.CLOUD_PREVIEW_URL ?? "http://127.0.0.1:3000",
        productionPerspective: "oblique-natural",
        only: [],
        limit: Number.POSITIVE_INFINITY,
        transportUpdates: 64,
        captureMode: process.env.CLOUD_PREVIEW_CAPTURE_MODE ?? "native-metal",
        timeoutMs: 180_000,
        cooldownMs: 2_500,
        failFast: false,
        list: false,
    };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (argument === "--help" || argument === "-h") return { help: true };
        if (argument === "--force") { options.force = true; continue; }
        if (argument === "--fail-fast") { options.failFast = true; continue; }
        if (argument === "--list") { options.list = true; continue; }
        const [name, inline] = argument.split("=", 2);
        if (!["--url", "--production-perspective", "--only", "--limit",
            "--transport-updates", "--capture-mode", "--timeout-ms",
            "--cooldown-ms"].includes(name)) {
            throw new Error(`Unknown argument: ${argument}`);
        }
        const value = inline ?? values[++index];
        if (!value) throw new Error(`${name} requires a value.`);
        if (name === "--url") options.url = value.replace(/\/$/, "");
        if (name === "--production-perspective") options.productionPerspective = value;
        if (name === "--only") options.only.push(...value.split(",").filter(Boolean));
        if (name === "--limit") options.limit = Number(value);
        if (name === "--transport-updates") options.transportUpdates = Number(value);
        if (name === "--capture-mode") options.captureMode = value;
        if (name === "--timeout-ms") options.timeoutMs = Number(value);
        if (name === "--cooldown-ms") options.cooldownMs = Number(value);
    }
    if (!Number.isSafeInteger(options.transportUpdates) ||
        options.transportUpdates < 64) {
        throw new Error("--transport-updates must be an integer of at least 64.");
    }
    if (!["native-metal", "headless"].includes(options.captureMode)) {
        throw new Error("--capture-mode must be native-metal or headless.");
    }
    if (options.productionPerspective !== "oblique-natural") {
        throw new Error(
            "Cloud preview publication is fixed to the oblique-natural " +
            "production perspective.",
        );
    }
    for (const [name, value] of [
        ["--limit", options.limit],
        ["--timeout-ms", options.timeoutMs],
        ["--cooldown-ms", options.cooldownMs],
    ]) {
        if (value !== Number.POSITIVE_INFINITY &&
            (!Number.isSafeInteger(value) || value < 0)) {
            throw new Error(`${name} must be a non-negative integer.`);
        }
    }
    if (options.timeoutMs < 60_000) {
        throw new Error("--timeout-ms must be at least 60000.");
    }
    return options;
};

const wait = (milliseconds, signal) => new Promise((resolvePromise, reject) => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
        signal?.removeEventListener("abort", abort);
        resolvePromise();
    }
    function abort() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        reject(new Error("Cloud preview cooldown was interrupted."));
    }
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
});

export const manifestFor = ({
    rendererHash,
    assetChecksums,
    productionPerspective,
    captureMode,
    scenarios,
    entriesById,
}) => {
    if (!isCloudPreviewAssetChecksums(assetChecksums)) {
        throw new Error(
            "Cloud preview manifests require current atlas, majorant, and " +
            "exterior-boundary asset identities.",
        );
    }
    const entries = scenarios.flatMap((scenario) => {
        const entry = entriesById.get(scenario.id);
        return entry ? [entry] : [];
    });
    return {
        schemaVersion: CLOUD_PREVIEW_SCHEMA_VERSION,
        rendererHash,
        assetChecksums,
        productionPerspective,
        captureMode,
        generatedAt: new Date().toISOString(),
        status: entries.length === scenarios.length ? "complete" : "partial",
        total: scenarios.length,
        completed: entries.length,
        entries,
    };
};

export const writeCurrentRendererManifest = ({
    path,
    manifest,
    repositoryRoot: root,
    expectedRendererHash,
    expectedAssetChecksums,
    rendererHashImplementation = rendererContentHash,
    assetChecksumsImplementation = readCloudPreviewAssetChecksums,
    writeAtomicImplementation = writeJsonAtomic,
}) => writeAtomicImplementation(path, manifest, {
    beforeCommit: () => {
        if (rendererHashImplementation(root) !== expectedRendererHash) {
            throw new Error(
                "Renderer sources changed at manifest publication; " +
                "discarded stale preview revision.",
            );
        }
        if (expectedAssetChecksums &&
            !cloudPreviewAssetChecksumsEqual(
                manifest.assetChecksums,
                expectedAssetChecksums,
            )) {
            throw new Error(
                "Preview manifest asset identities do not match the current " +
                "revision; discarded stale preview revision.",
            );
        }
        if (expectedAssetChecksums &&
            !cloudPreviewAssetChecksumsEqual(
                assetChecksumsImplementation(root),
                expectedAssetChecksums,
            )) {
            throw new Error(
                "Cloud volume assets changed at manifest publication; " +
                "discarded stale preview revision.",
            );
        }
    },
});

export const publishPreviewEntry = ({
    path,
    rendererHash,
    assetChecksums,
    productionPerspective,
    captureMode,
    scenarios,
    entriesById,
    entry,
    repositoryRoot: root,
    writeManifestImplementation = writeCurrentRendererManifest,
}) => {
    // Keep the live set unchanged until the guarded manifest replacement has
    // committed. A rejected publication can therefore never leak the staged
    // entry into the end-of-run manifest.
    const stagedEntries = new Map(entriesById);
    stagedEntries.set(entry.id, entry);
    const manifest = manifestFor({
        rendererHash,
        assetChecksums,
        productionPerspective,
        captureMode,
        scenarios,
        entriesById: stagedEntries,
    });
    writeManifestImplementation({
        path,
        manifest,
        repositoryRoot: root,
        expectedRendererHash: rendererHash,
        expectedAssetChecksums: assetChecksums,
    });
    entriesById.set(entry.id, entry);
    return manifest;
};

export const reusablePreviewEntries = ({
    existing,
    rendererHash,
    assetChecksums,
    productionPerspective,
    captureMode,
    transportUpdates,
    scenarios,
    repositoryRoot: root,
    imageExistsImplementation = existsSync,
}) => {
    const entriesById = new Map();
    const options = { productionPerspective, captureMode, transportUpdates };
    if (!(existing?.rendererHash === rendererHash &&
        cloudPreviewAssetChecksumsEqual(
            existing.assetChecksums,
            assetChecksums,
        ) &&
        existing.productionPerspective === options.productionPerspective &&
        existing.captureMode === options.captureMode)) {
        return entriesById;
    }
    for (const entry of existing.entries) {
        const scenario = scenarios.find(({ id }) => id === entry.id);
        if (!scenario) continue;
        const expectedHash = scenarioContentHash({
            rendererHash,
            scenario,
            productionPerspective: options.productionPerspective,
            transportUpdates: options.transportUpdates,
            captureMode: options.captureMode,
        });
        const imagePath = join(root, "public", entry.imageUrl);
        if (entry.caseId === scenario.caseId &&
            entry.captureParameter === scenario.captureParameter &&
            entry.contentHash === expectedHash &&
            imageExistsImplementation(imagePath)) {
            entriesById.set(entry.id, entry);
        }
    }
    return entriesById;
};

export const publishImmutablePreviewImage = ({
    processedPath,
    imageRoot: destinationRoot,
    previewId,
}) => {
    const bytes = readFileSync(processedPath);
    const imageContentHash = sha256([bytes]);
    const filename = `${safePreviewId(previewId)}-` +
        `${imageContentHash.slice(0, 12)}.png`;
    const finalPath = join(destinationRoot, filename);
    if (existsSync(finalPath)) {
        const publishedHash = sha256([readFileSync(finalPath)]);
        if (publishedHash !== imageContentHash) {
            throw new Error(
                `Immutable preview hash collision for ${filename}; refusing ` +
                `to replace the published image.`,
            );
        }
        rmSync(processedPath, { force: true });
    } else {
        renameSync(processedPath, finalPath);
    }
    return { filename, finalPath, imageContentHash };
};

const isHighCloudCapture = (scenario) =>
    scenario.captureParameter === "case" && /^(ci|cc|cs)-/.test(scenario.caseId);

const analysisPixels = async (path) => {
    const { data, info } = await sharp(resolve(path))
        .resize({ width: HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT.analysisWidth })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, info };
};

/**
 * Qualify a final beauty image only over support reported by the renderer's
 * same-case coverage (`1 - T`) debug view. The matte is an input contract, not a
 * guessed sky segmentation; dimensions must match after the fixed analysis
 * resize and the caller owns the case/camera/revision identity checks.
 */
export const qualifyCloudPreviewPair = async ({
    imagePath,
    mattePath,
    allowSmoothVeil = false,
}) => {
    if (!existsSync(imagePath) || !existsSync(mattePath)) {
        throw new Error(
            `Cloud preview qualification requires both final image and ` +
            `same-case coverage matte: ${imagePath}, ${mattePath}`,
        );
    }
    const image = await analysisPixels(imagePath);
    const matte = await analysisPixels(mattePath);
    if (image.info.width !== matte.info.width ||
        image.info.height !== matte.info.height) {
        throw new Error(
            `Cloud coverage matte dimensions ${matte.info.width}x${matte.info.height} ` +
            `do not match final image ${image.info.width}x${image.info.height}.`,
        );
    }
    const cloudMask = cloudMaskFromCoverage({
        data: matte.data,
        width: matte.info.width,
        height: matte.info.height,
        channels: matte.info.channels,
    });
    const metrics = measureCloudPreviewImage({
        data: image.data,
        width: image.info.width,
        height: image.info.height,
        channels: image.info.channels,
        cloudMask,
    });
    return evaluateHighCloudPreviewImage(metrics, {
        requireScaleSeparatedStructure: !allowSmoothVeil,
        requireCloudMask: true,
    });
};

/**
 * Keep one bounded, private rejection bundle per case. The directory is keyed
 * by case plus the renderer revision, while older same-case evidence is
 * replaced instead of accumulating every stale revision. Nothing under this
 * path is ever published to the preview matrix.
 */
export const retainRejectedCloudPair = ({
    root,
    caseId,
    rendererRevision,
    productionPerspective,
    finalPath,
    coveragePath,
    finalMetricsPath,
    coverageMetricsPath,
    qualification,
    now = () => new Date().toISOString(),
}) => {
    if (!/^[a-f0-9]{64}$/i.test(rendererRevision)) {
        throw new Error("Rejected cloud pair renderer revision is not a SHA-256 digest.");
    }
    const rejectionRoot = join(root, "rejected-high-cloud");
    const safeCase = safePreviewId(caseId);
    const casePrefix = `${safeCase}--`;
    mkdirSync(rejectionRoot, { recursive: true });
    // Keep exactly one latest revision for this case. The hash remains in the
    // path and record, while older same-case bundles are removed before the
    // replacement is made visible.
    for (const entry of readdirSync(rejectionRoot)) {
        if (entry.startsWith(casePrefix)) {
            rmSync(join(rejectionRoot, entry), { recursive: true, force: true });
        }
    }
    const destination = join(
        rejectionRoot,
        `${safeCase}--${rendererRevision.slice(0, 16).toLowerCase()}`,
    );
    mkdirSync(destination, { recursive: true });
    const copyIfPresent = (source, filename) => {
        if (!existsSync(source)) return undefined;
        const target = join(destination, filename);
        copyFileSync(source, target);
        return filename;
    };
    const readJsonIfPresent = (source) => {
        if (!existsSync(source)) return undefined;
        try {
            return JSON.parse(readFileSync(source, "utf8"));
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error),
            };
        }
    };
    const finalReadiness = readJsonIfPresent(finalMetricsPath);
    const coverageReadiness = readJsonIfPresent(coverageMetricsPath);
    const record = {
        schemaVersion: 1,
        kind: "cloud-preview-high-cloud-rejection",
        caseId,
        rendererRevision,
        productionPerspective,
        finalImage: copyIfPresent(finalPath, "final.png"),
        coverageMatte: copyIfPresent(coveragePath, "coverage.png"),
        finalReadiness,
        coverageReadiness,
        finalReadinessFile: copyIfPresent(finalMetricsPath, "final.state.json"),
        coverageReadinessFile: copyIfPresent(
            coverageMetricsPath,
            "coverage.state.json",
        ),
        qualification: qualification ?? null,
        publicManifestPublished: false,
        retainedAt: now(),
    };
    writeFileSync(
        join(destination, "rejection.json"),
        `${JSON.stringify(record, null, 2)}\n`,
        { flag: "w" },
    );
    return { destination, record };
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) { usage(); return; }
    assertCloudPreviewFreeSpace({
        path: repositoryRoot,
        phase: "cloud preview manifest initialization",
    });
    const scenarios = await loadCloudPreviewScenarios({
        repositoryRoot,
        productionPerspective: options.productionPerspective,
    });
    if (options.list) {
        process.stdout.write(`${JSON.stringify(scenarios, null, 2)}\n`);
        return;
    }

    const requestedIds = new Set(options.only);
    const unknownIds = [...requestedIds].filter((id) =>
        !scenarios.some((scenario) => scenario.id === id));
    if (unknownIds.length > 0) {
        throw new Error(`Unknown preview id(s): ${unknownIds.join(", ")}`);
    }

    mkdirSync(imageRoot, { recursive: true });
    mkdirSync(workRoot, { recursive: true });
    const releaseLock = acquireGenerationLock(join(publicRoot, ".generation.lock"));
    const beginShutdown = (signal) => {
        shutdownExitCode = signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
        shutdownController.abort();
    };
    const handleInterrupt = () => beginShutdown("SIGINT");
    const handleTermination = () => beginShutdown("SIGTERM");
    const handleHangup = () => beginShutdown("SIGHUP");
    process.once("SIGINT", handleInterrupt);
    process.once("SIGTERM", handleTermination);
    process.once("SIGHUP", handleHangup);
    const captureSessionStatePath = join(
        workRoot,
        `.persistent-session.${process.pid}.json`,
    );
    let captureSession;
    try {
        const rendererHash = rendererContentHash(repositoryRoot);
        const assetChecksums = readCloudPreviewAssetChecksums(repositoryRoot);
        const existing = readManifest(manifestPath);
        const entriesById = reusablePreviewEntries({
            existing,
            rendererHash,
            assetChecksums,
            productionPerspective: options.productionPerspective,
            captureMode: options.captureMode,
            transportUpdates: options.transportUpdates,
            scenarios,
            repositoryRoot,
        });
        if (options.force) {
            for (const scenario of scenarios) {
                if (requestedIds.size === 0 || requestedIds.has(scenario.id)) {
                    entriesById.delete(scenario.id);
                }
            }
        }
        writeCurrentRendererManifest({
            path: manifestPath,
            manifest: manifestFor({
                rendererHash,
                assetChecksums,
                productionPerspective: options.productionPerspective,
                captureMode: options.captureMode,
                scenarios,
                entriesById,
            }),
            repositoryRoot,
            expectedRendererHash: rendererHash,
            expectedAssetChecksums: assetChecksums,
        });

        const pending = scenarios.filter((scenario) =>
            !entriesById.has(scenario.id) &&
            (requestedIds.size === 0 || requestedIds.has(scenario.id)))
            .slice(0, options.limit);
        process.stdout.write(
            `Cloud previews: ${entriesById.size}/${scenarios.length} current; ` +
            `${pending.length} queued at ${options.productionPerspective}.\n`,
        );
        const failures = [];
        if (pending.length > 0) {
            rmSync(captureSessionStatePath, { force: true });
            const sessionStart = await runWithProcessGroupWatchdog({
                command: "bash",
                args: [captureSessionScript, "start", captureSessionStatePath],
                cwd: repositoryRoot,
                env: {
                    ...process.env,
                    CLOUD_PREVIEW_URL: options.url,
                    CLOUD_PREVIEW_CAPTURE_MODE: options.captureMode,
                },
                timeoutMs: 60_000,
                signal: shutdownController.signal,
            });
            if (sessionStart.code !== 0 || !existsSync(captureSessionStatePath)) {
                throw new Error(
                    `Persistent cloud preview session exited ` +
                    `${sessionStart.code ?? sessionStart.signal ?? "unknown"}.`,
                );
            }
            captureSession = JSON.parse(readFileSync(
                captureSessionStatePath,
                "utf8",
            ));
            if (captureSession.schemaVersion !== 1 ||
                typeof captureSession.session !== "string" ||
                !Number.isSafeInteger(captureSession.daemonPid) ||
                typeof captureSession.adapterInfo !== "object" ||
                typeof captureSession.adapterBackend !== "string") {
                throw new Error("Persistent cloud preview session state is invalid.");
            }
            process.stdout.write(
                `Persistent capture session ${captureSession.session} owns ` +
                `all ${pending.length} serial case(s); adapter preflight ran once.\n`,
            );
        }
        let captureSessionQuarantined = false;
        for (const [index, scenario] of pending.entries()) {
            if (shutdownController.signal.aborted) {
                throw new Error("Cloud preview generation was interrupted.");
            }
            if (rendererContentHash(repositoryRoot) !== rendererHash) {
                throw new Error(
                    "Renderer sources changed during preview generation; rerun required.",
                );
            }
            assertCloudPreviewFreeSpace({
                path: repositoryRoot,
                phase: `cloud preview capture ${scenario.id}`,
            });
            const contentHash = scenarioContentHash({
                rendererHash,
                scenario,
                productionPerspective: options.productionPerspective,
                transportUpdates: options.transportUpdates,
                captureMode: options.captureMode,
            });
            const temporaryStem = `${safePreviewId(scenario.id)}-` +
                `${contentHash.slice(0, 12)}`;
            const rawPath = join(
                workRoot,
                `.${temporaryStem}.${process.pid}.raw.png`,
            );
            const coveragePath = join(
                workRoot,
                `.${temporaryStem}.${process.pid}.coverage.png`,
            );
            const finalMetricsPath = join(
                workRoot,
                `.${temporaryStem}.${process.pid}.final.state.json`,
            );
            const coverageMetricsPath = join(
                workRoot,
                `.${temporaryStem}.${process.pid}.coverage.state.json`,
            );
            const processedPath = join(
                imageRoot,
                `.${temporaryStem}.${process.pid}.tmp`,
            );
            const requiresCloudMatte = isHighCloudCapture(scenario);
            process.stdout.write(
                `[${index + 1}/${pending.length}] ${scenario.id} · ${scenario.caseId}\n`,
            );
            let qualificationResult;
            try {
                rmSync(rawPath, { force: true });
                rmSync(coveragePath, { force: true });
                rmSync(finalMetricsPath, { force: true });
                rmSync(coverageMetricsPath, { force: true });
                rmSync(processedPath, { force: true });
                const captureView = async ({ debugView, outputPath, metricsPath }) => {
                    const result = await runWithProcessGroupWatchdog({
                        command: "bash",
                        args: [captureScript, scenario.captureParameter,
                            scenario.caseId, outputPath],
                        cwd: repositoryRoot,
                        env: {
                            ...process.env,
                            CLOUD_PREVIEW_URL: options.url,
                            CLOUD_PREVIEW_PRODUCTION_PERSPECTIVE:
                                options.productionPerspective,
                            CLOUD_PREVIEW_DEBUG_VIEW: debugView,
                            CLOUD_PREVIEW_TRANSPORT_UPDATES:
                                String(options.transportUpdates),
                            CLOUD_PREVIEW_CAPTURE_MODE: options.captureMode,
                            CLOUD_PREVIEW_PAGE_TIMEOUT_MS:
                                String(Math.max(1, options.timeoutMs - 30_000)),
                            CLOUD_PREVIEW_PERSISTENT_SESSION: captureSession.session,
                            CLOUD_PREVIEW_PERSISTENT_DAEMON_PID:
                                String(captureSession.daemonPid),
                            CLOUD_PREVIEW_PERSISTENT_ADAPTER_INFO:
                                JSON.stringify(captureSession.adapterInfo),
                            CLOUD_PREVIEW_PERSISTENT_ADAPTER_BACKEND:
                                captureSession.adapterBackend,
                            // Public publication owns qualification below, where
                            // the same-case coverage matte is available.
                            CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION: "1",
                            CLOUD_PREVIEW_CAPTURE_METRICS_PATH: metricsPath,
                        },
                        timeoutMs: options.timeoutMs,
                        signal: shutdownController.signal,
                    });
                    if (result.code !== 0) {
                        captureSessionQuarantined = result.code === 75;
                        const captureFailureSummary =
                            readCloudPreviewCaptureFailure(join(
                                workRoot,
                                `${scenario.captureParameter}-${captureFailureCaseName(
                                    scenario.caseId,
                                )}.failure.log`,
                            ));
                        throw new Error(
                            captureFailureSummary ??
                            `Capture ${debugView} exited ` +
                            `${result.code ?? result.signal ?? "unknown"}.`,
                        );
                    }
                    if (!existsSync(outputPath) || !existsSync(metricsPath)) {
                        throw new Error(
                            `Capture ${debugView} did not produce its image and ` +
                            `readiness metrics for ${scenario.caseId}.`,
                        );
                    }
                    if (rendererContentHash(repositoryRoot) !== rendererHash) {
                        throw new Error(
                            `Renderer sources changed during capture (${debugView}); ` +
                            "discarded stale image.",
                        );
                    }
                    let metrics;
                    try {
                        metrics = JSON.parse(readFileSync(metricsPath, "utf8"));
                    } catch (error) {
                        throw new Error(
                            `Capture ${debugView} readiness metrics are invalid: ` +
                            `${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                    if (metrics.sceneKey !== scenario.caseId ||
                        metrics.debugView !== debugView ||
                        metrics.productionPerspective !== options.productionPerspective ||
                        metrics.viewport?.width !== 800 ||
                        metrics.viewport?.height !== 500 ||
                        metrics.renderBounds?.width !== 800 ||
                        metrics.renderBounds?.height !== 500 ||
                        metrics.benchmarkReady !== "ready" ||
                        typeof metrics.productionCameraSignature !== "string" ||
                        !metrics.productionCameraSignature) {
                        throw new Error(
                            `Capture ${debugView} returned mismatched case/camera ` +
                            `metrics: ${JSON.stringify(metrics)}`,
                        );
                    }
                    return metrics;
                };
                const finalMetrics = await captureView({
                    debugView: "final",
                    outputPath: rawPath,
                    metricsPath: finalMetricsPath,
                });
                if (requiresCloudMatte) {
                    const coverageMetrics = await captureView({
                        debugView: "coverage",
                        outputPath: coveragePath,
                        metricsPath: coverageMetricsPath,
                    });
                    if (coverageMetrics.sceneKey !== finalMetrics.sceneKey ||
                        coverageMetrics.productionPerspective !==
                            finalMetrics.productionPerspective ||
                        coverageMetrics.productionCameraSignature !==
                            finalMetrics.productionCameraSignature) {
                        throw new Error(
                            "Final and coverage captures do not share the " +
                            "same case, production perspective, and camera signature.",
                        );
                    }
                    qualificationResult = await qualifyCloudPreviewPair({
                        imagePath: rawPath,
                        mattePath: coveragePath,
                        allowSmoothVeil: /^cs-nebulosus-/.test(scenario.caseId),
                    });
                    process.stdout.write(
                        `Cloud preview high-cloud image qualification: ${
                            JSON.stringify(qualificationResult)}\n`,
                    );
                    if (!qualificationResult.ready) {
                        throw new Error(
                            "Cloud preview high-cloud image qualification: " +
                            JSON.stringify(qualificationResult),
                        );
                    }
                }
                const metadata = await sharp(rawPath)
                    .resize({ width: 480, withoutEnlargement: true })
                    .png({ compressionLevel: 9, adaptiveFiltering: true })
                    .toFile(processedPath);
                const { filename, imageContentHash } =
                    publishImmutablePreviewImage({
                        processedPath,
                        imageRoot,
                        previewId: scenario.id,
                    });
                const entry = {
                    id: scenario.id,
                    caseId: scenario.caseId,
                    captureParameter: scenario.captureParameter,
                    imageUrl: `/generated/cloud-previews/images/${filename}`,
                    width: metadata.width,
                    height: metadata.height,
                    contentHash,
                    imageContentHash,
                    generatedAt: new Date().toISOString(),
                };
                publishPreviewEntry({
                    path: manifestPath,
                    rendererHash,
                    assetChecksums,
                    productionPerspective: options.productionPerspective,
                    captureMode: options.captureMode,
                    scenarios,
                    entriesById,
                    entry,
                    repositoryRoot,
                });
            } catch (error) {
                if (requiresCloudMatte &&
                    (existsSync(rawPath) || existsSync(coveragePath) ||
                        existsSync(finalMetricsPath) ||
                        existsSync(coverageMetricsPath))) {
                    try {
                        const retained = retainRejectedCloudPair({
                            root: workRoot,
                            caseId: scenario.caseId,
                            rendererRevision: rendererHash,
                            productionPerspective: options.productionPerspective,
                            finalPath: rawPath,
                            coveragePath,
                            finalMetricsPath,
                            coverageMetricsPath,
                            qualification: qualificationResult,
                        });
                        process.stderr.write(
                            `Retained private high-cloud rejection at ` +
                            `${retained.destination}.\n`,
                        );
                    } catch (retentionError) {
                        process.stderr.write(
                            `Could not retain private high-cloud rejection: ` +
                            `${retentionError instanceof Error
                                ? retentionError.message : String(retentionError)}\n`,
                        );
                    }
                }
                failures.push({
                    id: scenario.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                process.stderr.write(
                    `Rejected ${scenario.id}: ${failures.at(-1).error}\n`,
                );
                if (options.failFast) break;
            } finally {
                rmSync(rawPath, { force: true });
                rmSync(coveragePath, { force: true });
                rmSync(finalMetricsPath, { force: true });
                rmSync(coverageMetricsPath, { force: true });
                rmSync(processedPath, { force: true });
            }
            if (captureSessionQuarantined) {
                process.stderr.write(
                    "Persistent capture session was quarantined; " +
                    "remaining cases will resume in a fresh generator run.\n",
                );
                break;
            }
            if (options.cooldownMs > 0) {
                await wait(options.cooldownMs, shutdownController.signal);
            }
        }

        const finalManifest = manifestFor({
            rendererHash,
            assetChecksums,
            productionPerspective: options.productionPerspective,
            captureMode: options.captureMode,
            scenarios,
            entriesById,
        });
        writeCurrentRendererManifest({
            path: manifestPath,
            manifest: finalManifest,
            repositoryRoot,
            expectedRendererHash: rendererHash,
            expectedAssetChecksums: assetChecksums,
        });
        process.stdout.write(
            `Cloud preview manifest: ${finalManifest.completed}/${finalManifest.total} ` +
            `${finalManifest.status} · ${manifestPath}\n`,
        );
        if (failures.length > 0) {
            throw new Error(`${failures.length} cloud preview capture(s) were rejected.`);
        }
    } finally {
        if (captureSession || existsSync(captureSessionStatePath)) {
            try {
                const sessionStop = await runWithProcessGroupWatchdog({
                    command: "bash",
                    args: [captureSessionScript, "stop", captureSessionStatePath],
                    cwd: repositoryRoot,
                    env: process.env,
                    timeoutMs: 15_000,
                });
                if (sessionStop.code !== 0) {
                    process.stderr.write(
                        `Persistent cloud preview session cleanup exited ` +
                        `${sessionStop.code ?? sessionStop.signal ?? "unknown"}.\n`,
                    );
                }
            } catch (error) {
                process.stderr.write(
                    `Persistent cloud preview session cleanup failed: ` +
                    `${error instanceof Error ? error.message : String(error)}\n`,
                );
            }
        }
        // The session manager removes its state only after exact daemon
        // teardown succeeds. Preserve a surviving state file after a failed or
        // timed-out stop so ownership evidence remains available for a bounded
        // cleanup retry instead of orphaning an unidentifiable browser.
        process.removeListener("SIGINT", handleInterrupt);
        process.removeListener("SIGTERM", handleTermination);
        process.removeListener("SIGHUP", handleHangup);
        releaseLock();
    }
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = shutdownExitCode ?? 1;
    });
}

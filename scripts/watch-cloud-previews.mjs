#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, statSync, watch } from "node:fs";
import { getPriority, setPriority } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
    CLOUD_PREVIEW_RENDERER_INPUTS,
    acquireGenerationLock,
    contentHashForPaths,
    writeJsonAtomic,
} from
    "./lib/cloud-preview-generation.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const generatorPath = join(scriptDirectory, "generate-cloud-previews.mjs");
const managedGeneratorPath = join(scriptDirectory, "run-cloud-preview-generation.mjs");
// The managed child may need one grace window to stop an active capture and a
// second to stop its detached Next server. Killing its owner sooner can orphan
// the server even though every individual cleanup path is bounded.
const WATCHER_CHILD_SHUTDOWN_GRACE_MS = 25_000;
export const CLOUD_PREVIEW_WATCH_DEBOUNCE_MS = 30_000;
export const CLOUD_PREVIEW_WATCH_COOLDOWN_MS = 15_000;
export const CLOUD_PREVIEW_WATCH_PRIORITY = 10;
export const CLOUD_PREVIEW_WATCH_RETRY_BASE_MS = 10 * 60_000;
export const CLOUD_PREVIEW_WATCH_RETRY_MAX_MS = 6 * 60 * 60_000;
export const CLOUD_PREVIEW_WATCH_RECONCILE_MS = 5_000;
export const CLOUD_PREVIEW_WATCH_LOCK_PATH = join(
    repositoryRoot,
    "output/playwright/cloud-previews/.watcher.lock",
);
export const CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH = join(
    repositoryRoot,
    "output/playwright/cloud-previews/watch-service.json",
);
// Keep the watcher aligned exactly with renderer revision identity. The shared
// catalogue and capture API are already explicit renderer inputs; filters,
// styles, and static image-serving routes must never provoke 276 GPU captures.
export const WATCH_PATHS = Object.freeze([
    ...new Set(CLOUD_PREVIEW_RENDERER_INPUTS),
]);

export const cloudPreviewWatchContentHash = (root = repositoryRoot) =>
    contentHashForPaths(root, WATCH_PATHS);

export const parseArguments = (values) => {
    const options = {
        debounceMs: CLOUD_PREVIEW_WATCH_DEBOUNCE_MS,
        priority: CLOUD_PREVIEW_WATCH_PRIORITY,
        retryBaseMs: CLOUD_PREVIEW_WATCH_RETRY_BASE_MS,
        retryMaxMs: CLOUD_PREVIEW_WATCH_RETRY_MAX_MS,
        initial: true,
        externalServer: false,
        serviceStatePath: undefined,
        serviceToken: undefined,
        generatorArgs: [],
    };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (argument === "--no-initial") {
            options.initial = false;
            continue;
        }
        if (argument === "--external-server") {
            options.externalServer = true;
            continue;
        }
        const [name, inline] = argument.split("=", 2);
        if (name === "--debounce-ms") {
            const value = inline ?? values[++index];
            options.debounceMs = Number(value);
            continue;
        }
        if (name === "--priority") {
            const value = inline ?? values[++index];
            options.priority = Number(value);
            continue;
        }
        if (name === "--retry-minutes") {
            const value = inline ?? values[++index];
            options.retryBaseMs = Number(value) * 60_000;
            continue;
        }
        if (name === "--retry-max-minutes") {
            const value = inline ?? values[++index];
            options.retryMaxMs = Number(value) * 60_000;
            continue;
        }
        if (name === "--service-state") {
            const value = inline ?? values[++index];
            options.serviceStatePath = value;
            continue;
        }
        if (name === "--service-token") {
            const value = inline ?? values[++index];
            options.serviceToken = value;
            continue;
        }
        options.generatorArgs.push(argument);
    }
    if (!Number.isSafeInteger(options.debounceMs) || options.debounceMs < 250) {
        throw new Error("--debounce-ms must be an integer of at least 250.");
    }
    if (!Number.isSafeInteger(options.priority) || options.priority < 0 ||
        options.priority > 19) {
        throw new Error("--priority must be an integer from 0 to 19.");
    }
    for (const [name, value] of [
        ["--retry-minutes", options.retryBaseMs],
        ["--retry-max-minutes", options.retryMaxMs],
    ]) {
        if (!Number.isSafeInteger(value) || value < 60_000 ||
            value % 60_000 !== 0) {
            throw new Error(`${name} must be a positive whole number of minutes.`);
        }
    }
    if (options.retryMaxMs < options.retryBaseMs) {
        throw new Error("--retry-max-minutes cannot be less than --retry-minutes.");
    }
    if ((options.serviceStatePath === undefined) !==
        (options.serviceToken === undefined)) {
        throw new Error("--service-state and --service-token must be provided together.");
    }
    if (options.serviceStatePath !== undefined) {
        if (resolve(options.serviceStatePath) !== CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH) {
            throw new Error("--service-state must use the dedicated preview service path.");
        }
        if (!/^[a-f0-9]{32}$/.test(options.serviceToken)) {
            throw new Error("--service-token must be a 32-character lowercase hex token.");
        }
        options.serviceStatePath = CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH;
        if (!options.initial) {
            throw new Error(
                "Detached preview service cannot accept --no-initial; it always " +
                "starts the full 276-case oblique-natural matrix.",
            );
        }
        const nonGeneratingArgument = options.generatorArgs.find((argument) =>
            argument === "--list" || argument === "--help" || argument === "-h");
        if (nonGeneratingArgument) {
            throw new Error(
                `Detached preview service cannot accept ${nonGeneratingArgument}; ` +
                "it always generates the full 276-case oblique-natural matrix.",
            );
        }
        const partialMatrixArgument = options.generatorArgs.find((argument) =>
            argument === "--only" || argument.startsWith("--only=") ||
            argument === "--limit" || argument.startsWith("--limit=") ||
            argument === "--production-perspective" ||
            argument.startsWith("--production-perspective="));
        if (partialMatrixArgument) {
            throw new Error(
                `Detached preview service cannot accept ${partialMatrixArgument}; ` +
                "it always owns the full 276-case oblique-natural matrix.",
            );
        }
    }
    if (!options.generatorArgs.some((argument) =>
        argument === "--cooldown-ms" || argument.startsWith("--cooldown-ms="))) {
        options.generatorArgs.push(
            "--cooldown-ms",
            String(CLOUD_PREVIEW_WATCH_COOLDOWN_MS),
        );
    }
    return options;
};

export const applyCloudPreviewWatchPriority = (
    priority,
    setPriorityImplementation = setPriority,
    getPriorityImplementation = getPriority,
) => {
    const currentPriority = getPriorityImplementation();
    if (!Number.isSafeInteger(currentPriority)) {
        throw new Error(`OS process priority is invalid: ${currentPriority}.`);
    }
    // A larger nice value is already lower priority. Do not try to raise such
    // a process back toward the requested floor: that can require privilege
    // and would weaken the thermal-safe contract even if permitted.
    if (currentPriority < priority) setPriorityImplementation(priority);
    const effectivePriority = getPriorityImplementation();
    if (!Number.isSafeInteger(effectivePriority) ||
        effectivePriority < priority) {
        throw new Error(
            `OS process priority remained ${effectivePriority}; ` +
            `required at least ${priority}.`,
        );
    }
    return effectivePriority;
};

export const writeCloudPreviewServiceStateSafely = (
    path,
    state,
    writeAtomic = writeJsonAtomic,
    logError = (message) => process.stderr.write(message),
) => {
    try {
        writeAtomic(path, state);
        return true;
    } catch (error) {
        try {
            logError(
                `Unable to persist cloud preview service state; in-memory ` +
                `process ownership remains authoritative: ` +
                `${error instanceof Error ? error.message : String(error)}\n`,
            );
        } catch {
            // A detached stderr log can share the full filesystem. Losing the
            // advisory error message must not interrupt in-memory teardown.
        }
        return false;
    }
};

const killGroup = (child, signal) => {
    if (!child?.pid) return;
    try {
        process.kill(-child.pid, signal);
    } catch {
        try { child.kill(signal); } catch { /* already exited */ }
    }
};

export const createCloudPreviewWatchCoordinator = ({
    debounceMs,
    retryBaseMs = CLOUD_PREVIEW_WATCH_RETRY_BASE_MS,
    retryMaxMs = CLOUD_PREVIEW_WATCH_RETRY_MAX_MS,
    spawnGeneration,
    getRevision,
    log = (message) => process.stdout.write(message),
    logError = (message) => process.stderr.write(message),
    onStopped = (exitCode) => process.exit(exitCode),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    killChild = killGroup,
    shutdownGraceMs = WATCHER_CHILD_SHUTDOWN_GRACE_MS,
}) => {
    let child;
    let childRevision;
    let childStale = false;
    let pendingRevision;
    let lastFinishedRevision;
    let revisionCheckPending = false;
    let debounceTimer;
    let retryTimer;
    let retryRevision;
    let retryAttempt = 0;
    let childKillTimer;
    let stopping = false;
    let stopExitCode = 0;

    const clearDebounce = () => {
        if (debounceTimer !== undefined) clearTimer(debounceTimer);
        debounceTimer = undefined;
    };
    const clearChildKill = () => {
        if (childKillTimer !== undefined) clearTimer(childKillTimer);
        childKillTimer = undefined;
    };
    const clearRetryTimer = () => {
        if (retryTimer !== undefined) clearTimer(retryTimer);
        retryTimer = undefined;
    };
    const resetRetry = () => {
        clearRetryTimer();
        retryRevision = undefined;
        retryAttempt = 0;
    };
    const terminateChild = () => {
        const target = child;
        if (!target || childKillTimer !== undefined) return;
        killChild(target, "SIGTERM");
        childKillTimer = setTimer(() => {
            childKillTimer = undefined;
            if (child === target) killChild(target, "SIGKILL");
        }, shutdownGraceMs);
        childKillTimer?.unref?.();
    };
    const run = () => {
        debounceTimer = undefined;
        if (child || stopping || pendingRevision === undefined) return;
        const revision = pendingRevision;
        pendingRevision = undefined;
        if (retryRevision !== undefined && revision !== retryRevision) resetRetry();
        childRevision = revision;
        childStale = false;
        child = spawnGeneration(revision);
        const launched = child;
        launched.once("error", (error) => {
            logError(`Cloud preview generator failed to start: ${error.message}\n`);
        });
        launched.once("close", (code, signal) => {
            if (child !== launched) return;
            const closedRevision = childRevision;
            const closedStale = childStale;
            child = undefined;
            childRevision = undefined;
            childStale = false;
            clearChildKill();
            if (!closedStale && code === 0) {
                lastFinishedRevision = closedRevision;
                resetRetry();
            }
            log(`Cloud preview generation exited ${code ?? signal ?? "unknown"}.\n`);
            if (stopping) onStopped(stopExitCode);
            // A replacement whose revision survived the complete quiet period
            // starts immediately after exact teardown. If another filesystem
            // event is still settling, its content must be qualified first.
            else if (!revisionCheckPending && debounceTimer === undefined &&
                pendingRevision !== undefined) run();
            else if (!closedStale && code !== 0 && closedRevision !== undefined) {
                if (retryRevision === closedRevision) retryAttempt += 1;
                else {
                    retryRevision = closedRevision;
                    retryAttempt = 1;
                }
                const delay = Math.min(
                    retryBaseMs * (2 ** Math.min(retryAttempt - 1, 30)),
                    retryMaxMs,
                );
                log(
                    `Incomplete cloud preview revision; retrying only its ` +
                    `pending cases in ${Math.round(delay / 60_000)} minute(s).\n`,
                );
                clearRetryTimer();
                retryTimer = setTimer(() => {
                    retryTimer = undefined;
                    if (stopping) return;
                    // A source debounce already in progress owns qualification.
                    // Once it matures it will either preserve this retry revision
                    // or immediately launch the materially newer one.
                    if (revisionCheckPending || debounceTimer !== undefined) return;
                    let currentRevision;
                    try {
                        currentRevision = getRevision();
                    } catch (error) {
                        logError(
                            `Unable to qualify cloud preview retry revision: ` +
                            `${error instanceof Error ? error.message : String(error)}\n`,
                        );
                        revisionCheckPending = true;
                        debounceTimer = setTimer(restartAfterDebounce, debounceMs);
                        debounceTimer?.unref?.();
                        return;
                    }
                    pendingRevision = currentRevision;
                    run();
                }, delay);
                retryTimer?.unref?.();
            }
        });
    };
    const restartAfterDebounce = () => {
        debounceTimer = undefined;
        if (stopping || !revisionCheckPending) return;
        let revision;
        try {
            revision = getRevision();
        } catch (error) {
            logError(
                `Unable to qualify cloud preview input revision: ` +
                `${error instanceof Error ? error.message : String(error)}\n`,
            );
            debounceTimer = setTimer(restartAfterDebounce, debounceMs);
            debounceTimer?.unref?.();
            return;
        }
        revisionCheckPending = false;
        if (child) {
            if (revision === childRevision && !childStale) {
                // fs.watch can emit for metadata updates, directory churn, or
                // an atomic rewrite whose bytes are unchanged. Never disrupt
                // a current capture unless the qualified bytes differ.
                pendingRevision = undefined;
                return;
            }
            pendingRevision = revision;
            childStale = true;
            log("Renderer inputs changed; restarting serial preview generation.\n");
            terminateChild();
            return;
        }
        if (retryTimer !== undefined && revision === retryRevision) {
            // Metadata-only churn must not turn a long retry backoff into a hot
            // loop. The already scheduled retry will re-qualify bytes at launch.
            pendingRevision = undefined;
            return;
        }
        if (retryRevision !== undefined && revision !== retryRevision) resetRetry();
        if (revision === lastFinishedRevision) {
            pendingRevision = undefined;
            return;
        }
        pendingRevision = revision;
        run();
    };
    const schedule = () => {
        if (stopping) return;
        revisionCheckPending = true;
        clearDebounce();
        debounceTimer = setTimer(restartAfterDebounce, debounceMs);
        debounceTimer?.unref?.();
    };
    const stop = (signal) => {
        if (stopping) return;
        stopping = true;
        clearDebounce();
        clearRetryTimer();
        stopExitCode = signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
        if (child) terminateChild();
        else onStopped(stopExitCode);
    };
    const killOwnedChildOnExit = () => killChild(child, "SIGKILL");

    return {
        killOwnedChildOnExit,
        schedule,
        stop,
        state: () => ({
            active: Boolean(child),
            activeRevision: childRevision,
            dirty: revisionCheckPending || pendingRevision !== undefined ||
                retryTimer !== undefined,
            pendingRevision,
            retryAttempt,
            retryScheduled: retryTimer !== undefined,
            retryRevision,
            stopping,
        }),
    };
};

const main = () => {
    const options = parseArguments(process.argv.slice(2));
    const releaseWatcherLock = acquireGenerationLock(CLOUD_PREVIEW_WATCH_LOCK_PATH);
    // This listener is installed before any subsequent setup can fail. The
    // release function is idempotent, so normal service teardown may call it
    // earlier without risking removal of a replacement owner's lock.
    process.once("exit", releaseWatcherLock);
    let serviceChildPid;
    let serviceStatus = "starting";
    let serviceReleased = false;
    const publishServiceState = () => {
        if (!options.serviceStatePath || serviceReleased) return;
        writeCloudPreviewServiceStateSafely(options.serviceStatePath, {
            schemaVersion: 1,
            pid: process.pid,
            token: options.serviceToken,
            startedAt: serviceStartedAt,
            status: serviceStatus,
            generationPid: serviceChildPid,
            priority: options.priority,
            debounceMs: options.debounceMs,
            mode: options.externalServer ? "external-server" : "managed-production",
            perspective: "oblique-natural",
        });
    };
    const removeOwnedServiceState = () => {
        if (!options.serviceStatePath || serviceReleased) return;
        serviceReleased = true;
        try {
            const state = JSON.parse(readFileSync(options.serviceStatePath, "utf8"));
            if (state.pid === process.pid && state.token === options.serviceToken) {
                rmSync(options.serviceStatePath, { force: true });
            }
        } catch {
            // Missing, partial, or replaced state is never removed.
        }
    };
    const releaseOwnedState = () => {
        removeOwnedServiceState();
        releaseWatcherLock();
    };
    const serviceStartedAt = new Date().toISOString();
    // Generation is permitted only after the watcher proves its effective OS
    // priority. Every subsequently spawned build, server, browser and capture
    // inherits this niceness; a platform failure therefore cannot silently
    // turn the detached thermal-safe service into normal-priority GPU work.
    const effectivePriority = applyCloudPreviewWatchPriority(options.priority);
    options.priority = effectivePriority;
    const commandPath = options.externalServer ? generatorPath : managedGeneratorPath;
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: options.debounceMs,
        retryBaseMs: options.retryBaseMs,
        retryMaxMs: options.retryMaxMs,
        getRevision: () => cloudPreviewWatchContentHash(repositoryRoot),
        spawnGeneration: () => {
            process.stdout.write(
                `Starting ${options.externalServer ? "external-server" :
                    "managed-production"} ` +
                `serial static cloud preview generation.\n`,
            );
            const launched = spawn(
                process.execPath,
                [commandPath, ...options.generatorArgs],
                {
                cwd: repositoryRoot,
                env: process.env,
                detached: process.platform !== "win32",
                stdio: "inherit",
                },
            );
            serviceChildPid = launched.pid;
            serviceStatus = "generating";
            publishServiceState();
            launched.once("close", () => {
                if (serviceChildPid !== launched.pid) return;
                serviceChildPid = undefined;
                serviceStatus = "watching";
                publishServiceState();
            });
            return launched;
        },
        onStopped: (exitCode) => {
            releaseOwnedState();
            process.exit(exitCode);
        },
    });

    const watchers = [];
    let observedInputRevision = cloudPreviewWatchContentHash(repositoryRoot);
    for (const relativePath of WATCH_PATHS) {
        const path = join(repositoryRoot, relativePath);
        if (!existsSync(path)) continue;
        const recursive = statSync(path).isDirectory();
        const fileWatcher = watch(path, { recursive }, () => coordinator.schedule());
        watchers.push(fileWatcher);
    }
    // Recursive fs.watch can drop rename-style editor events on macOS. The
    // generator independently rejects stale hashes, but without this bounded
    // reconciliation a dropped event would leave that revision in retry
    // backoff. Poll exact bytes at low process priority and schedule only when
    // they differ, preserving the normal quiet-period debounce and single
    // flight coordinator.
    const reconciliationTimer = setInterval(() => {
        if (coordinator.state().stopping) return;
        try {
            const revision = cloudPreviewWatchContentHash(repositoryRoot);
            if (revision === observedInputRevision) return;
            observedInputRevision = revision;
            process.stdout.write(
                "Reconciled renderer input change missed by filesystem events.\n",
            );
            coordinator.schedule();
        } catch (error) {
            process.stderr.write(
                `Unable to reconcile cloud preview inputs: ` +
                `${error instanceof Error ? error.message : String(error)}\n`,
            );
        }
    }, CLOUD_PREVIEW_WATCH_RECONCILE_MS);
    reconciliationTimer.unref();
    const stop = (signal) => {
        for (const fileWatcher of watchers) fileWatcher.close();
        clearInterval(reconciliationTimer);
        serviceStatus = "stopping";
        publishServiceState();
        coordinator.stop(signal);
    };
    process.once("SIGINT", () => stop("SIGINT"));
    process.once("SIGTERM", () => stop("SIGTERM"));
    process.once("SIGHUP", () => stop("SIGHUP"));
    process.once("exit", () => {
        coordinator.killOwnedChildOnExit();
        releaseOwnedState();
    });
    serviceStatus = "watching";
    publishServiceState();
    process.stdout.write(
        `Watching ${watchers.length} renderer inputs; changes are coalesced ` +
        `for ${options.debounceMs}ms and never overlap. ` +
        `Process priority: ${options.priority}; ` +
        `incomplete-run retry: ${Math.round(options.retryBaseMs / 60_000)}–` +
        `${Math.round(options.retryMaxMs / 60_000)} minutes; ` +
        `content reconciliation: ${CLOUD_PREVIEW_WATCH_RECONCILE_MS}ms; ` +
        `Mode: ${options.externalServer ? "external server" : "managed production"}.\n`,
    );
    if (options.initial) coordinator.schedule();
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}

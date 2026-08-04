#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

import { assertCloudPreviewFreeSpace } from
    "./lib/cloud-preview-generation.mjs";

import {
    CLOUD_PREVIEW_WATCH_LOCK_PATH,
    CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH,
} from "./watch-cloud-previews.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const watcherPath = join(scriptDirectory, "watch-cloud-previews.mjs");
export const CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH = join(
    repositoryRoot,
    "output/playwright/cloud-previews/watch-service.log",
);
const manifestPath = join(
    repositoryRoot,
    "public/generated/cloud-previews/manifest.json",
);
const generationLockPath = join(
    repositoryRoot,
    "public/generated/cloud-previews/.generation.lock/owner.json",
);
const STOP_GRACE_MS = 35_000;
const CHILD_STOP_GRACE_MS = 10_000;

const usage = () => process.stdout.write(`Usage:
  node scripts/manage-cloud-preview-watch.mjs start [watcher options]
  node scripts/manage-cloud-preview-watch.mjs status
  node scripts/manage-cloud-preview-watch.mjs stop
  node scripts/manage-cloud-preview-watch.mjs restart [watcher options]

The detached service watches renderer inputs and serially regenerates the full
276-case static manifest. Logs are written to:
  ${CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH}
`);

const processExists = (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

export const readWatchServiceState = (path = CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH) => {
    if (!existsSync(path)) return undefined;
    try {
        const state = JSON.parse(readFileSync(path, "utf8"));
        return state?.schemaVersion === 1 ? state : undefined;
    } catch {
        return undefined;
    }
};

const psIdentity = (pid, spawnSyncImplementation = spawnSync) => {
    const result = spawnSyncImplementation(
        "/bin/ps",
        ["-p", String(pid), "-o", "pgid=", "-o", "command="],
        { encoding: "utf8" },
    );
    if (result.status !== 0 || !result.stdout?.trim()) return undefined;
    const match = result.stdout.trim().match(/^(\d+)\s+([\s\S]+)$/);
    if (!match) return undefined;
    return { pgid: Number(match[1]), command: match[2] };
};

export const inspectWatchServiceIdentity = (
    state,
    spawnSyncImplementation = spawnSync,
    processExistsImplementation = processExists,
) => {
    if (!state || !processExistsImplementation(state.pid)) {
        return { active: false, exact: false, reason: "not-running" };
    }
    const identity = psIdentity(state.pid, spawnSyncImplementation);
    if (!identity) return { active: false, exact: false, reason: "not-running" };
    const exact = identity.pgid === state.pid &&
        identity.command.includes("scripts/watch-cloud-previews.mjs") &&
        identity.command.includes("--service-token") &&
        identity.command.includes(state.token) &&
        identity.command.includes("--service-state") &&
        identity.command.includes(CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH);
    return {
        active: true,
        exact,
        reason: exact ? "owned-service" : "identity-mismatch",
        ...identity,
    };
};

const inspectManagedGeneratorIdentity = (state) => {
    if (!Number.isSafeInteger(state?.generationPid) || state.generationPid <= 0 ||
        !processExists(state.generationPid)) return undefined;
    const identity = psIdentity(state.generationPid);
    if (!identity || identity.pgid !== state.generationPid) return undefined;
    const expected = state.mode === "external-server"
        ? "scripts/generate-cloud-previews.mjs"
        : "scripts/run-cloud-preview-generation.mjs";
    return identity.command.includes(expected) ? identity : undefined;
};

const wait = (milliseconds) => new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds));

const waitUntil = async (predicate, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await wait(100);
    }
    return predicate();
};

const activeGenerationOwner = () => {
    try {
        const owner = JSON.parse(readFileSync(generationLockPath, "utf8"));
        if (!processExists(owner?.pid)) return undefined;
        const identity = psIdentity(owner.pid);
        if (!identity || identity.pgid !== owner.pid ||
            !identity.command.includes("scripts/generate-cloud-previews.mjs")) {
            return { ...owner, exact: false };
        }
        return { ...owner, exact: true };
    } catch {
        return undefined;
    }
};

const removeStaleState = (state) => {
    const current = readWatchServiceState();
    if (current?.pid === state?.pid && current?.token === state?.token) {
        rmSync(CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH, { force: true });
    }
};

const start = async (watcherArguments) => {
    const current = readWatchServiceState();
    const currentIdentity = inspectWatchServiceIdentity(current);
    if (currentIdentity.active && currentIdentity.exact) {
        process.stdout.write(`Cloud preview watcher already active (pid ${current.pid}).\n`);
        return;
    }
    if (currentIdentity.active) {
        throw new Error(
            "Refusing to replace cloud preview service state with a live identity mismatch.",
        );
    }
    if (current) removeStaleState(current);
    const generationOwner = activeGenerationOwner();
    if (generationOwner) {
        throw new Error(
            `Cloud preview generation is already active in pid ` +
            `${generationOwner.pid}${generationOwner.exact ? "" :
                " with an unqualified identity"}; wait for or explicitly ` +
            `stop that run before starting the persistent watcher.`,
        );
    }
    if (existsSync(CLOUD_PREVIEW_WATCH_LOCK_PATH)) {
        let owner;
        try {
            owner = JSON.parse(readFileSync(
                join(CLOUD_PREVIEW_WATCH_LOCK_PATH, "owner.json"),
                "utf8",
            ));
        } catch {
            owner = undefined;
        }
        if (processExists(owner?.pid)) {
            throw new Error(
                `Another cloud preview watcher already owns pid ${owner.pid}; ` +
                "stop that foreground watcher before starting the service.",
            );
        }
    }
    assertCloudPreviewFreeSpace({
        path: repositoryRoot,
        phase: "detached cloud preview watcher startup",
    });

    mkdirSync(dirname(CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH), { recursive: true });
    const token = randomBytes(16).toString("hex");
    const logDescriptor = openSync(CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH, "a", 0o644);
    let child;
    try {
        child = spawn(process.execPath, [
            watcherPath,
            "--service-state", CLOUD_PREVIEW_WATCH_SERVICE_STATE_PATH,
            "--service-token", token,
            ...watcherArguments,
        ], {
            cwd: repositoryRoot,
            env: process.env,
            detached: true,
            stdio: ["ignore", logDescriptor, logDescriptor],
        });
    } finally {
        closeSync(logDescriptor);
    }
    child.unref();
    const ready = await waitUntil(() => {
        const state = readWatchServiceState();
        return state?.pid === child.pid && state.token === token &&
            inspectWatchServiceIdentity(state).exact;
    }, 5_000);
    if (!ready) {
        if (processExists(child.pid)) {
            try { process.kill(-child.pid, "SIGTERM"); } catch { /* exited */ }
        }
        throw new Error(
            `Cloud preview watcher failed to become ready; inspect ` +
            `${CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH}.`,
        );
    }
    const startedState = readWatchServiceState();
    process.stdout.write(
        `Cloud preview watcher started in background (pid ${child.pid}, priority ` +
        `${startedState?.priority ?? "unknown"}).\n`,
    );
};

const manifestSummary = () => {
    try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        return `${manifest.completed ?? 0}/${manifest.total ?? 276} ${manifest.status ?? "unknown"}`;
    } catch {
        return "0/276 not-published";
    }
};

const status = () => {
    const state = readWatchServiceState();
    const identity = inspectWatchServiceIdentity(state);
    if (!identity.active) {
        const generationOwner = activeGenerationOwner();
        process.stdout.write(
            `Cloud preview watcher: stopped${generationOwner ?
                `; standalone generation: active pid ${generationOwner.pid}` : ""}; ` +
            `manifest: ${manifestSummary()}.\n`,
        );
        return 0;
    }
    if (!identity.exact) {
        process.stderr.write(
            `Cloud preview watcher: unsafe identity mismatch for pid ${state.pid}; ` +
            `no signal will be sent; manifest: ${manifestSummary()}.\n`,
        );
        return 2;
    }
    const activity = inspectManagedGeneratorIdentity(state)
        ? `generating (child ${state.generationPid})`
        : state.status;
    process.stdout.write(
        `Cloud preview watcher: ${activity}, pid ${state.pid}, priority ` +
        `${state.priority}; manifest: ${manifestSummary()}; log: ` +
        `${CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH}.\n`,
    );
    return 0;
};

const stop = async () => {
    const state = readWatchServiceState();
    const identity = inspectWatchServiceIdentity(state);
    if (!identity.active) {
        if (state) removeStaleState(state);
        process.stdout.write("Cloud preview watcher is not running.\n");
        return;
    }
    if (!identity.exact) {
        throw new Error(
            `Refusing to stop pid ${state.pid}: cloud preview service identity mismatch.`,
        );
    }
    process.kill(-state.pid, "SIGTERM");
    const stopped = await waitUntil(() =>
        !inspectWatchServiceIdentity(state).active, STOP_GRACE_MS);
    if (!stopped) {
        const latest = readWatchServiceState() ?? state;
        const generationIdentity = inspectManagedGeneratorIdentity(latest);
        if (generationIdentity) {
            process.kill(-latest.generationPid, "SIGTERM");
            const childStopped = await waitUntil(() =>
                !inspectManagedGeneratorIdentity(latest), CHILD_STOP_GRACE_MS);
            if (!childStopped && inspectManagedGeneratorIdentity(latest)) {
                process.kill(-latest.generationPid, "SIGKILL");
            }
        }
        if (inspectWatchServiceIdentity(state).exact) {
            process.kill(-state.pid, "SIGKILL");
        }
        await waitUntil(() => !processExists(state.pid), 2_000);
    }
    removeStaleState(state);
    process.stdout.write(`Cloud preview watcher stopped (pid ${state.pid}).\n`);
};

const main = async () => {
    const [command, ...watcherArguments] = process.argv.slice(2);
    if (!command || command === "--help" || command === "-h") {
        usage();
        return;
    }
    if (command === "start") return start(watcherArguments);
    if (command === "status") {
        if (watcherArguments.length > 0) throw new Error("status accepts no options.");
        process.exitCode = status();
        return;
    }
    if (command === "stop") {
        if (watcherArguments.length > 0) throw new Error("stop accepts no options.");
        return stop();
    }
    if (command === "restart") {
        await stop();
        return start(watcherArguments);
    }
    throw new Error(`Unknown command: ${command}`);
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

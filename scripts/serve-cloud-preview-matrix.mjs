#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    acquireGenerationLock,
    runWithProcessGroupWatchdog,
} from "./lib/cloud-preview-generation.mjs";
import {
    assertLoopbackPortAvailable,
    pipeManagedProcessOutput,
    spawnManagedProcess,
    stopManagedProcess,
    waitForManagedServer,
} from "./lib/cloud-preview-managed-server.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const nextPath = join(repositoryRoot, "node_modules/next/dist/bin/next");
export const CLOUD_PREVIEW_LAB_DIST_NAME = ".next-cloud-preview-lab";
export const CLOUD_PREVIEW_LAB_LOCK_NAME = ".cloud-preview-lab-server.lock";
const previewDistPath = join(repositoryRoot, CLOUD_PREVIEW_LAB_DIST_NAME);
const lockPath = join(repositoryRoot, CLOUD_PREVIEW_LAB_LOCK_NAME);

const usage = () => process.stdout.write(`Usage:
  node scripts/serve-cloud-preview-matrix.mjs [options]

Builds and serves the static cloud preview matrix on loopback. The serial image
generator remains a separate command and newly committed manifests/images are
read from disk by dynamic API routes without rebuilding this server.

Options:
  --server-port N             Loopback port (default 3000).
  --build-timeout-ms N        Build watchdog (default 1200000).
  --health-timeout-ms N       Startup watchdog (default 180000).
`);

export const parseCloudPreviewLabArguments = (values) => {
    const options = {
        serverPort: 3_000,
        buildTimeoutMs: 1_200_000,
        healthTimeoutMs: 180_000,
    };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (argument === "--help" || argument === "-h") {
            options.help = true;
            continue;
        }
        const [name, inline] = argument.split("=", 2);
        if (!["--server-port", "--build-timeout-ms", "--health-timeout-ms"]
            .includes(name)) {
            throw new Error(`Unknown option: ${argument}`);
        }
        const value = inline ?? values[++index];
        if (!value) throw new Error(`${name} requires a value.`);
        if (name === "--server-port") options.serverPort = Number(value);
        if (name === "--build-timeout-ms") options.buildTimeoutMs = Number(value);
        if (name === "--health-timeout-ms") options.healthTimeoutMs = Number(value);
    }
    if (!Number.isSafeInteger(options.serverPort) || options.serverPort < 1 ||
        options.serverPort > 65_535) {
        throw new Error("--server-port must be an integer from 1 to 65535.");
    }
    for (const [name, value] of [
        ["--build-timeout-ms", options.buildTimeoutMs],
        ["--health-timeout-ms", options.healthTimeoutMs],
    ]) {
        if (!Number.isSafeInteger(value) || value < 1_000) {
            throw new Error(`${name} must be an integer of at least 1000.`);
        }
    }
    return options;
};

const waitForShutdown = (child, signal) => new Promise((resolveWait, reject) => {
    let settled = false;
    if (signal.aborted) {
        resolveWait();
        return;
    }
    const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        callback(value);
    };
    const abort = () => finish(resolveWait);
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code, closeSignal) => {
        if (signal.aborted) finish(resolveWait);
        else finish(reject, new Error(
            `Cloud preview matrix server exited unexpectedly ` +
            `(${code ?? closeSignal ?? "unknown"}).`,
        ));
    });
});

export const assertCloudPreviewDynamicApis = async ({
    baseUrl,
    fetchImplementation = fetch,
}) => {
    const manifest = await fetchImplementation(
        `${baseUrl}/api/cloud-previews/manifest`,
        { cache: "no-store" },
    );
    if (![200, 404].includes(manifest.status) ||
        !manifest.headers.get("content-type")?.includes("application/json") ||
        !manifest.headers.get("cache-control")?.includes("no-store")) {
        throw new Error(
            "Cloud preview manifest dynamic API is absent from the built lab bundle.",
        );
    }
    const invalidImage = await fetchImplementation(
        `${baseUrl}/api/cloud-previews/image/not-a-content-hash.png`,
        { cache: "no-store" },
    );
    if (invalidImage.status !== 400 ||
        !invalidImage.headers.get("content-type")?.includes("application/json")) {
        throw new Error(
            "Cloud preview image dynamic API is absent from the built lab bundle.",
        );
    }
};

const main = async () => {
    const options = parseCloudPreviewLabArguments(process.argv.slice(2));
    if (options.help) { usage(); return; }
    if (!existsSync(nextPath)) {
        throw new Error("Install dependencies before serving cloud previews.");
    }

    // Refuse before acquiring ownership or deleting the fixed lab dist. This
    // protects a manually started predecessor that predates the ownership lock.
    await assertLoopbackPortAvailable(options.serverPort);

    // The lock is acquired before the shared lab dist is removed. Therefore a
    // second invocation cannot damage the bundle or process owned by the first.
    const releaseLock = acquireGenerationLock(lockPath);
    const shutdownController = new AbortController();
    let shutdownExitCode;
    let server;
    const beginShutdown = (signal) => {
        shutdownExitCode = signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
        shutdownController.abort();
    };
    const handleInterrupt = () => beginShutdown("SIGINT");
    const handleTermination = () => beginShutdown("SIGTERM");
    const handleHangup = () => beginShutdown("SIGHUP");
    const handleProcessExit = () => {
        rmSync(previewDistPath, { recursive: true, force: true });
        releaseLock();
    };
    process.once("SIGINT", handleInterrupt);
    process.once("SIGTERM", handleTermination);
    process.once("SIGHUP", handleHangup);
    process.once("exit", handleProcessExit);

    try {
        rmSync(previewDistPath, { recursive: true, force: true });
        process.stdout.write("Building isolated cloud preview matrix.\n");
        const build = await runWithProcessGroupWatchdog({
            command: process.execPath,
            args: [nextPath, "build", "--turbopack"],
            cwd: repositoryRoot,
            env: {
                ...process.env,
                ELEMENTS_NEXT_DIST_DIR: CLOUD_PREVIEW_LAB_DIST_NAME,
                // Ordinary builds still validate types. This one-purpose bundle
                // relies on the separately run repository typecheck.
                ELEMENTS_PREVIEW_SKIP_TYPECHECK: "1",
            },
            timeoutMs: options.buildTimeoutMs,
            signal: shutdownController.signal,
        });
        if (build.code !== 0) {
            throw new Error(
                `Cloud preview matrix build exited ` +
                `${build.code ?? build.signal ?? "unknown"}.`,
            );
        }

        const baseUrl = `http://127.0.0.1:${options.serverPort}`;
        server = spawnManagedProcess({
            command: process.execPath,
            args: [nextPath, "start", "--hostname", "127.0.0.1", "--port",
                String(options.serverPort)],
            cwd: repositoryRoot,
            env: {
                ...process.env,
                ELEMENTS_NEXT_DIST_DIR: CLOUD_PREVIEW_LAB_DIST_NAME,
            },
        });
        pipeManagedProcessOutput(server);
        await waitForManagedServer({
            child: server,
            url: `${baseUrl}/cloud-preview-matrix`,
            timeoutMs: options.healthTimeoutMs,
            signal: shutdownController.signal,
        });
        await assertCloudPreviewDynamicApis({ baseUrl });
        process.stdout.write(
            `Cloud preview matrix ready at ${baseUrl}/cloud-preview-matrix\n`,
        );
        await waitForShutdown(server, shutdownController.signal);
    } finally {
        await stopManagedProcess(server);
        process.removeListener("SIGINT", handleInterrupt);
        process.removeListener("SIGTERM", handleTermination);
        process.removeListener("SIGHUP", handleHangup);
        process.removeListener("exit", handleProcessExit);
        rmSync(previewDistPath, { recursive: true, force: true });
        releaseLock();
    }
    if (shutdownExitCode) process.exitCode = shutdownExitCode;
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

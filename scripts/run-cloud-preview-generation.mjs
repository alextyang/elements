#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    assertCloudPreviewFreeSpace,
    rendererContentHash,
    runWithProcessGroupWatchdog,
} from "./lib/cloud-preview-generation.mjs";
import {
    assertLoopbackPortAvailable,
    pipeManagedProcessOutput,
    reserveLoopbackPort,
    spawnManagedProcess,
    stopManagedProcess,
    waitForManagedServer,
} from "./lib/cloud-preview-managed-server.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const generatorPath = join(scriptDirectory, "generate-cloud-previews.mjs");
const nextPath = join(repositoryRoot, "node_modules/next/dist/bin/next");
const previewDistName = ".next-cloud-preview-production";
const previewDistPath = join(repositoryRoot, previewDistName);
const shutdownController = new AbortController();
let shutdownExitCode;

const usage = () => process.stdout.write(`Usage:
  node scripts/run-cloud-preview-generation.mjs [managed options] [generator options]

Builds and serves the exact renderer revision before invoking the serial generator.
Use generate-cloud-previews.mjs directly only for an explicitly external server.

Managed options:
  --server-port N             Isolated localhost port (default: dynamically assigned).
  --build-timeout-ms N        Build watchdog (default 1200000).
  --health-timeout-ms N       /cloud-photographs startup watchdog (default 180000).

All other options are forwarded to generate-cloud-previews.mjs.
`);

export const parseManagedArguments = (values) => {
    const options = {
        serverPort: undefined,
        buildTimeoutMs: 1_200_000,
        healthTimeoutMs: 180_000,
        generatorArgs: [],
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
            options.generatorArgs.push(argument);
            continue;
        }
        const value = inline ?? values[++index];
        if (!value) throw new Error(`${name} requires a value.`);
        if (name === "--server-port") options.serverPort = Number(value);
        if (name === "--build-timeout-ms") options.buildTimeoutMs = Number(value);
        if (name === "--health-timeout-ms") options.healthTimeoutMs = Number(value);
    }
    if (options.serverPort !== undefined &&
        (!Number.isSafeInteger(options.serverPort) || options.serverPort < 1 ||
            options.serverPort > 65_535)) {
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

const assertRendererRevision = (expectedHash, phase) => {
    const actualHash = rendererContentHash(repositoryRoot);
    if (actualHash !== expectedHash) {
        throw new Error(
            `Renderer sources changed ${phase}; managed preview generation must rerun.`,
        );
    }
};

const main = async () => {
    const options = parseManagedArguments(process.argv.slice(2));
    if (options.help) { usage(); return; }
    if (!existsSync(nextPath)) {
        throw new Error("Install dependencies before generating cloud previews.");
    }
    if (options.generatorArgs.some((argument) =>
        argument === "--url" || argument.startsWith("--url="))) {
        throw new Error(
            "Managed generation owns its isolated URL; use " +
            "cloud:previews:generate:external for an external server.",
        );
    }

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
    const handleProcessExit = () => {
        rmSync(previewDistPath, { recursive: true, force: true });
    };
    process.once("exit", handleProcessExit);

    let server;
    try {
        assertCloudPreviewFreeSpace({
            path: repositoryRoot,
            phase: "managed cloud preview production build",
        });
        const expectedHash = rendererContentHash(repositoryRoot);
        rmSync(previewDistPath, { recursive: true, force: true });
        process.stdout.write(
            `Building managed cloud preview revision ${expectedHash.slice(0, 12)}.\n`,
        );
        const build = await runWithProcessGroupWatchdog({
            command: process.execPath,
            args: [nextPath, "build", "--turbopack"],
            cwd: repositoryRoot,
            env: {
                ...process.env,
                ELEMENTS_NEXT_DIST_DIR: previewDistName,
                ELEMENTS_PREVIEW_SKIP_TYPECHECK: "1",
            },
            timeoutMs: options.buildTimeoutMs,
            signal: shutdownController.signal,
        });
        if (build.code !== 0) {
            throw new Error(
                `Managed cloud preview build exited ` +
                `${build.code ?? build.signal ?? "unknown"}.`,
            );
        }
        assertRendererRevision(expectedHash, "during production build");

        const port = options.serverPort ?? await reserveLoopbackPort();
        // The dynamic reservation is released before Next starts. Re-check
        // ownership immediately before spawn so a stale or competing server
        // cannot satisfy the health probe during that handoff race.
        await assertLoopbackPortAvailable(port);
        const baseUrl = `http://127.0.0.1:${port}`;
        server = spawnManagedProcess({
            command: process.execPath,
            args: [nextPath, "start", "--hostname", "127.0.0.1", "--port",
                String(port)],
            cwd: repositoryRoot,
            env: {
                ...process.env,
                ELEMENTS_NEXT_DIST_DIR: previewDistName,
            },
        });
        pipeManagedProcessOutput(server);
        await waitForManagedServer({
            child: server,
            url: `${baseUrl}/cloud-photographs`,
            timeoutMs: options.healthTimeoutMs,
            signal: shutdownController.signal,
        });
        assertRendererRevision(expectedHash, "before serial capture");
        process.stdout.write(`Managed cloud preview server ready at ${baseUrl}.\n`);

        const generation = await runWithProcessGroupWatchdog({
            command: process.execPath,
            args: [generatorPath, "--url", baseUrl, ...options.generatorArgs],
            cwd: repositoryRoot,
            env: process.env,
            // Each image has its own stricter watchdog. This outer watchdog is
            // deliberately large enough for the complete 276-image matrix.
            timeoutMs: 7 * 24 * 60 * 60 * 1_000,
            signal: shutdownController.signal,
        });
        if (generation.code !== 0) {
            throw new Error(
                `Serial cloud preview generation exited ` +
                `${generation.code ?? generation.signal ?? "unknown"}.`,
            );
        }
        assertRendererRevision(expectedHash, "before managed server teardown");
    } finally {
        await stopManagedProcess(server);
        process.removeListener("SIGINT", handleInterrupt);
        process.removeListener("SIGTERM", handleTermination);
        process.removeListener("SIGHUP", handleHangup);
        rmSync(previewDistPath, { recursive: true, force: true });
    }
};

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = shutdownExitCode ?? 1;
    });
}

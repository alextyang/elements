import { spawn } from "node:child_process";
import { createServer } from "node:net";

export const CLOUD_PREVIEW_SERVER_SHUTDOWN_GRACE_MS = 8_000;

const killProcessGroup = (child, signal) => {
    if (!child?.pid) return;
    try {
        process.kill(-child.pid, signal);
    } catch {
        try { child.kill(signal); } catch { /* The process already exited. */ }
    }
};

export const reserveLoopbackPort = () => new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : undefined;
        server.close((error) => {
            if (error) reject(error);
            else if (!port) reject(new Error("Could not reserve a loopback port."));
            else resolve(port);
        });
    });
});

export const assertLoopbackPortAvailable = (port) =>
    new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        server.once("error", (error) => {
            if (error?.code === "EADDRINUSE") {
                reject(new Error(
                    `Loopback port ${port} is already in use; refusing to ` +
                    "modify an existing preview server bundle.",
                ));
            } else reject(error);
        });
        server.listen(port, "127.0.0.1", () => {
            server.close((error) => error ? reject(error) : resolve());
        });
    });

export const spawnManagedProcess = ({ command, args, cwd, env }) => {
    const child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });
    const parentExit = () => killProcessGroup(child, "SIGKILL");
    process.once("exit", parentExit);
    child.once("close", () => process.removeListener("exit", parentExit));
    return child;
};

export const pipeManagedProcessOutput = (
    child,
    stdout = process.stdout,
    stderr = process.stderr,
) => {
    child.stdout?.pipe(stdout, { end: false });
    child.stderr?.pipe(stderr, { end: false });
};

export const waitForManagedServer = async ({
    child,
    url,
    timeoutMs,
    signal,
    pollMs = 250,
    fetchImplementation = fetch,
}) => {
    const deadline = Date.now() + timeoutMs;
    let exit;
    child.once("error", (error) => { exit = { error }; });
    child.once("close", (code, closeSignal) => {
        exit = { code, signal: closeSignal };
    });
    while (Date.now() < deadline) {
        if (signal?.aborted) {
            throw new Error("Managed cloud preview server startup was aborted.");
        }
        if (exit) {
            if (exit.error) throw exit.error;
            throw new Error(
                `Managed cloud preview server exited before health check ` +
                `(${exit.code ?? exit.signal ?? "unknown"}).`,
            );
        }
        try {
            const response = await fetchImplementation(url, {
                method: "GET",
                cache: "no-store",
                signal: AbortSignal.timeout(Math.min(5_000,
                    Math.max(1, deadline - Date.now()))),
            });
            if (response.ok) return;
        } catch (error) {
            if (error?.name !== "TimeoutError" && error?.name !== "TypeError") {
                throw error;
            }
        }
        await new Promise((resolve) => setTimeout(resolve,
            Math.min(pollMs, Math.max(1, deadline - Date.now()))));
    }
    throw new Error(
        `Managed cloud preview server did not become healthy within ${timeoutMs}ms.`,
    );
};

export const stopManagedProcess = (child, {
    graceMs = CLOUD_PREVIEW_SERVER_SHUTDOWN_GRACE_MS,
} = {}) => new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
    }
    let settled = false;
    let escalation;
    const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(escalation);
        resolve();
    };
    child.once("close", finish);
    killProcessGroup(child, "SIGTERM");
    escalation = setTimeout(() => killProcessGroup(child, "SIGKILL"), graceMs);
    escalation.unref();
});

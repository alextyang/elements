#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
    cleanupGeneratedPlaywrightSessionDaemon,
    parseGeneratedPlaywrightDaemonPid,
} from "./lib/playwright-session-cleanup.mjs";

const execFileAsync = promisify(execFile);
const [, , command, session, pidArgument] = process.argv;

const inspect = async (pid) => {
    try {
        const { stdout } = await execFileAsync("ps", [
            "-o", "pgid=", "-o", "command=", "-p", String(pid),
        ]);
        const match = stdout.trim().match(/^(\d+)\s+([\s\S]+)$/);
        if (!match) return undefined;
        return { processGroupId: Number(match[1]), command: match[2] };
    } catch {
        return undefined;
    }
};

const terminate = async (pid, processGroupId, signal) => {
    // cliDaemon normally leads its own group. If it does not, target only the
    // exact ownership-checked pid rather than risking the caller's group.
    if (Number.isSafeInteger(processGroupId) && processGroupId === pid) {
        process.kill(-processGroupId, signal);
    } else {
        process.kill(pid, signal);
    }
};

const waitForExit = async (pid, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!await inspect(pid)) return true;
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    }
    return !await inspect(pid);
};

if (command === "parse") {
    let transcript = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) transcript += chunk;
    const pid = parseGeneratedPlaywrightDaemonPid(transcript, session);
    if (pid) process.stdout.write(String(pid));
} else if (command === "cleanup") {
    const result = await cleanupGeneratedPlaywrightSessionDaemon({
        session,
        pid: Number(pidArgument),
        inspect,
        terminate,
        waitForExit,
    });
    if (result.status === "still-running") {
        process.stderr.write(
            `Playwright daemon ${pidArgument} survived bounded cleanup.\n`,
        );
        process.exitCode = 1;
    }
} else {
    process.stderr.write(
        "Usage: cleanup-playwright-session.mjs parse SESSION | cleanup SESSION PID\n",
    );
    process.exitCode = 2;
}

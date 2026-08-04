import assert from "node:assert/strict";
import test from "node:test";

import {
    cleanupGeneratedPlaywrightSessionDaemon,
    commandOwnsGeneratedPlaywrightSession,
    parseGeneratedPlaywrightDaemonPid,
} from "./lib/playwright-session-cleanup.mjs";

const session = "sky-webgpu-validation-79500";

test("captures only the exact generated Playwright session daemon pid", () => {
    const output = `### Browser \`${session}\` opened with pid 79536.`;
    assert.equal(parseGeneratedPlaywrightDaemonPid(output, session), 79536);
    assert.equal(parseGeneratedPlaywrightDaemonPid(output,
        "sky-webgpu-validation-79501"), undefined);
    assert.equal(parseGeneratedPlaywrightDaemonPid(output, "default"), undefined);
    assert.equal(parseGeneratedPlaywrightDaemonPid(
        `### Browser \`${session}\` opened with pid 1.`, session), undefined);
});

test("ownership requires cliDaemon and the exact session token", () => {
    const command = `/usr/bin/node /cache/playwright/cliDaemon.js ${session}`;
    assert.equal(commandOwnsGeneratedPlaywrightSession({ command, session }), true);
    assert.equal(commandOwnsGeneratedPlaywrightSession({
        command: command.replace(session, `${session}-other`), session,
    }), false);
    assert.equal(commandOwnsGeneratedPlaywrightSession({
        command: `/usr/bin/node app.js ${session}`, session,
    }), false);
});

test("bounded cleanup terminates only an owned generated session", async () => {
    const signals = [];
    let inspections = 0;
    const result = await cleanupGeneratedPlaywrightSessionDaemon({
        session,
        pid: 79536,
        inspect: async () => {
            inspections += 1;
            return {
                command: `/usr/bin/node cliDaemon.js ${session}`,
                processGroupId: 79536,
            };
        },
        terminate: async (...args) => signals.push(args),
        waitForExit: async (_pid, timeout) => timeout === 1_000,
    });
    assert.deepEqual(result, { status: "killed" });
    assert.equal(inspections, 2,
        "ownership is revalidated before escalation to SIGKILL");
    assert.deepEqual(signals, [
        [79536, 79536, "SIGTERM"],
        [79536, 79536, "SIGKILL"],
    ]);
});

test("pid reuse or unrelated sessions are never signalled", async () => {
    let signalled = false;
    const result = await cleanupGeneratedPlaywrightSessionDaemon({
        session,
        pid: 79536,
        inspect: async () => ({
            command: "/usr/bin/node cliDaemon.js unrelated-session",
            processGroupId: 79536,
        }),
        terminate: async () => { signalled = true; },
        waitForExit: async () => false,
    });
    assert.deepEqual(result, { status: "ownership-mismatch" });
    assert.equal(signalled, false);
});

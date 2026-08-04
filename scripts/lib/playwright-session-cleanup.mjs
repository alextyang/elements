const GENERATED_SESSION_PATTERN =
    /^(?:sky-webgpu-validation-\d+|cloud-preview-\d+-\d+|cloud-preview-revision-\d+-\d+)$/;

const escapeRegularExpression = (value) => value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
);

export const isGeneratedPlaywrightSession = (session) =>
    typeof session === "string" && GENERATED_SESSION_PATTERN.test(session);

export const isGeneratedWebGpuValidationSession = isGeneratedPlaywrightSession;

/**
 * Playwright prints the detached cliDaemon pid when `open` succeeds. Capture
 * that exact pid instead of discovering daemons by process name later.
 */
export const parseGeneratedPlaywrightDaemonPid = (output, session) => {
    if (!isGeneratedPlaywrightSession(session)) return undefined;
    const escapedSession = escapeRegularExpression(session);
    const match = String(output ?? "").match(new RegExp(
        "Browser `" + escapedSession + "` opened with pid (\\d+)\\.",
    ));
    const pid = Number(match?.[1]);
    return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined;
};

/** A reused pid must never be mistaken for the validator's detached daemon. */
export const commandOwnsGeneratedPlaywrightSession = ({
    command,
    session,
}) => {
    if (!isGeneratedPlaywrightSession(session) ||
        typeof command !== "string" || !command.includes("cliDaemon.js")) {
        return false;
    }
    const escapedSession = escapeRegularExpression(session);
    return new RegExp(`(?:^|[\\s"'])${escapedSession}(?:$|[\\s"'])`)
        .test(command);
};

/**
 * Bounded fallback for a `playwright-cli close` which hangs. Every destructive
 * step revalidates the exact captured pid's command line and exact generated
 * session token. Callers provide process primitives so this contract can be
 * unit-tested without starting or killing a browser.
 */
export const cleanupGeneratedPlaywrightSessionDaemon = async ({
    session,
    pid,
    inspect,
    terminate,
    waitForExit,
}) => {
    if (!isGeneratedPlaywrightSession(session) ||
        !Number.isSafeInteger(pid) || pid <= 1) {
        return { status: "not-recorded" };
    }
    const first = await inspect(pid);
    if (!first) return { status: "already-exited" };
    if (!commandOwnsGeneratedPlaywrightSession({
        command: first.command,
        session,
    })) {
        return { status: "ownership-mismatch" };
    }
    await terminate(pid, first.processGroupId, "SIGTERM");
    if (await waitForExit(pid, 2_000)) return { status: "terminated" };

    // The pid could have exited and been reused during the grace period.
    const second = await inspect(pid);
    if (!second || !commandOwnsGeneratedPlaywrightSession({
        command: second.command,
        session,
    })) {
        return { status: second ? "ownership-mismatch" : "terminated" };
    }
    await terminate(pid, second.processGroupId, "SIGKILL");
    return {
        status: await waitForExit(pid, 1_000) ? "killed" : "still-running",
    };
};

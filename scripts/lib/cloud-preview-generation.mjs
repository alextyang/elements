import { createHash, randomBytes } from "node:crypto";
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    statfsSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { spawn } from "node:child_process";

export const CLOUD_PREVIEW_SCHEMA_VERSION = 1;
export const CLOUD_PREVIEW_GENERATOR_VERSION = 3;
export const CLOUD_PREVIEW_ASSET_MANIFEST_PATH =
    "public/assets/sky/cloud-macro-atlas-v2.json";
export const CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM = "SHA-256";
export const CLOUD_PREVIEW_ASSET_CHECKSUM_KEYS = Object.freeze([
    "atlas",
    "majorants",
    "exteriorBoundary",
]);
export const CLOUD_PREVIEW_LOCK_INITIALIZATION_GRACE_MS = 60_000;
export const CLOUD_PREVIEW_PROCESS_GROUP_GRACE_MS = 8_000;
export const CLOUD_PREVIEW_MINIMUM_FREE_BYTES = 2n * 1024n * 1024n * 1024n;
export const CLOUD_PREVIEW_RENDERER_INPUTS = Object.freeze([
    "components/backgrounds/sky",
    "app/cloud-photographs",
    "app/api/cloud-previews/init-stage",
    "app/sky-benchmark",
    "app/layout.tsx",
    "app/layout.css",
    "app/cloud-preview-matrix/cloud-preview-catalog.ts",
    "data/cloud-photographic-qualification.json",
    "data/cloud-qualification-scenarios.json",
    "public/assets/moon",
    "public/assets/sky",
    "public/cloud-preview-adapter-probe.html",
    "scripts/capture-cloud-preview.sh",
    "scripts/qualify-cloud-preview-image.mjs",
    "scripts/lib/cloud-preview-image-qualification.mjs",
    "scripts/generate-cloud-previews.mjs",
    "scripts/lib/cloud-preview-generation.mjs",
    "scripts/lib/cloud-preview-managed-server.mjs",
    "scripts/manage-cloud-preview-capture-session.sh",
    "scripts/run-cloud-preview-generation.mjs",
    "scripts/config/cloud-preview-native-playwright.json",
    "scripts/cleanup-playwright-session.mjs",
    "scripts/lib/playwright-session-cleanup.mjs",
    "scripts/lib/cloud-preview-scenarios.mjs",
    "next.config.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
]);

export const stableJson = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
};

export const sha256 = (values) => {
    const hash = createHash("sha256");
    for (const value of values) hash.update(value);
    return hash.digest("hex");
};

const walkFiles = (root, result) => {
    if (!existsSync(root)) return;
    const stats = statSync(root);
    if (stats.isFile()) {
        result.push(root);
        return;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) walkFiles(path, result);
        else if (entry.isFile()) result.push(path);
    }
};

export const contentHashForPaths = (repositoryRoot, relativePaths) => {
    const discoveredPaths = [];
    for (const source of relativePaths) {
        walkFiles(join(repositoryRoot, source), discoveredPaths);
    }
    // A watched directory may contain another explicitly watched input. Hash
    // each physical file once so revision identity is independent of overlap
    // in the watch catalogue.
    const paths = [...new Set(discoveredPaths)]
        .sort((left, right) => left.localeCompare(right));
    const hash = createHash("sha256");
    for (const path of paths) {
        hash.update(relative(repositoryRoot, path));
        hash.update("\0");
        hash.update(readFileSync(path));
        hash.update("\0");
    }
    return hash.digest("hex");
};

export const rendererContentHash = (repositoryRoot) =>
    contentHashForPaths(repositoryRoot, CLOUD_PREVIEW_RENDERER_INPUTS);

const isSha256Hex = (value) =>
    typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

/**
 * Read the identities of every versioned cloud-volume asset used by a
 * preview.  The atlas manifest is the public source of truth for these
 * checksums; keeping this as one object makes the preview manifest header a
 * complete cache key instead of relying on rendererHash to imply asset state.
 */
export const readCloudPreviewAssetChecksums = (repositoryRoot) => {
    const manifestPath = join(repositoryRoot, CLOUD_PREVIEW_ASSET_MANIFEST_PATH);
    let atlasManifest;
    try {
        atlasManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
        throw new Error(
            `Cloud preview asset manifest is unreadable at ${manifestPath}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
    }
    const checksums = atlasManifest?.checksums;
    if (checksums?.algorithm !== CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM ||
        CLOUD_PREVIEW_ASSET_CHECKSUM_KEYS.some((key) =>
            !isSha256Hex(checksums?.[key]))) {
        throw new Error(
            `Cloud preview asset manifest has invalid ${
                CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM} checksums.`,
        );
    }
    return {
        algorithm: CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM,
        atlas: checksums.atlas,
        majorants: checksums.majorants,
        exteriorBoundary: checksums.exteriorBoundary,
    };
};

export const isCloudPreviewAssetChecksums = (value) =>
    Boolean(value && value.algorithm === CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM &&
        CLOUD_PREVIEW_ASSET_CHECKSUM_KEYS.every((key) =>
            isSha256Hex(value[key])));

export const cloudPreviewAssetChecksumsEqual = (left, right) =>
    isCloudPreviewAssetChecksums(left) && isCloudPreviewAssetChecksums(right) &&
    CLOUD_PREVIEW_ASSET_CHECKSUM_KEYS.every((key) => left[key] === right[key]);

export const scenarioContentHash = ({
    rendererHash,
    scenario,
    productionPerspective,
    transportUpdates,
    captureMode,
}) => sha256([
    `generator:${CLOUD_PREVIEW_GENERATOR_VERSION}\0`,
    `renderer:${rendererHash}\0`,
    `perspective:${productionPerspective}\0`,
    `updates:${transportUpdates}\0`,
    `capture-mode:${captureMode}\0`,
    stableJson(scenario),
]);

export const safePreviewId = (id) => id
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

export const writeJsonAtomic = (path, value, { beforeCommit } = {}) => {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = join(
        dirname(path),
        `.${basename(path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    let descriptor;
    try {
        descriptor = openSync(temporary, "wx", 0o644);
        writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
        closeSync(descriptor);
        descriptor = undefined;
        // Run revision/ownership guards only after the complete replacement is
        // durable in its temporary file, at the last synchronous boundary
        // before the atomic rename makes it observable.
        beforeCommit?.();
        renameSync(temporary, path);
    } finally {
        if (descriptor !== undefined) closeSync(descriptor);
        rmSync(temporary, { force: true });
    }
};

export const cloudPreviewFreeBytes = (
    path,
    statfsImplementation = statfsSync,
) => {
    const filesystem = statfsImplementation(path, { bigint: true });
    return BigInt(filesystem.bavail) * BigInt(filesystem.bsize);
};

export const assertCloudPreviewFreeSpace = ({
    path,
    phase,
    minimumBytes = CLOUD_PREVIEW_MINIMUM_FREE_BYTES,
    statfsImplementation = statfsSync,
}) => {
    const availableBytes = cloudPreviewFreeBytes(path, statfsImplementation);
    const requiredBytes = BigInt(minimumBytes);
    if (availableBytes < requiredBytes) {
        const availableMiB = availableBytes / (1024n * 1024n);
        const requiredMiB = requiredBytes / (1024n * 1024n);
        throw new Error(
            `Insufficient free space before ${phase}: ${availableMiB} MiB ` +
            `available; ${requiredMiB} MiB required. No preview build or ` +
            `capture was started.`,
        );
    }
    return availableBytes;
};

export const readManifest = (path) => {
    if (!existsSync(path)) return undefined;
    try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        if (value?.schemaVersion !== CLOUD_PREVIEW_SCHEMA_VERSION ||
            !Array.isArray(value.entries)) return undefined;
        return value;
    } catch {
        return undefined;
    }
};

const processExists = (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

export const acquireGenerationLock = (lockDirectory) => {
    mkdirSync(dirname(lockDirectory), { recursive: true });
    const ownerToken = randomBytes(16).toString("hex");
    let claimed = false;
    for (let attempt = 0; attempt < 8 && !claimed; attempt += 1) {
        try {
            mkdirSync(lockDirectory);
            claimed = true;
            break;
        } catch (error) {
            if (error?.code !== "EEXIST") throw error;
        }

        let owner;
        try {
            owner = JSON.parse(readFileSync(join(lockDirectory, "owner.json"), "utf8"));
        } catch {
            owner = undefined;
        }
        if (processExists(owner?.pid)) {
            throw new Error(
                `Cloud preview generation is already active in process ${owner.pid}.`,
            );
        }
        if (!owner) {
            let ageMilliseconds = 0;
            try {
                ageMilliseconds = Date.now() - statSync(lockDirectory).mtimeMs;
            } catch (error) {
                if (error?.code === "ENOENT") continue;
                throw error;
            }
            if (ageMilliseconds < CLOUD_PREVIEW_LOCK_INITIALIZATION_GRACE_MS) {
                throw new Error(
                    "Cloud preview generation lock is still initializing; refusing " +
                    "to steal it.",
                );
            }
        }

        // Rename the stale lock out of the acquisition path atomically. If a
        // competing process wins this rename or creates the next lock first,
        // retry and inspect that new owner instead of deleting its directory.
        const quarantine = join(dirname(lockDirectory),
            `.${basename(lockDirectory)}.${process.pid}.` +
            `${randomBytes(6).toString("hex")}.stale`);
        try {
            renameSync(lockDirectory, quarantine);
        } catch (error) {
            if (error?.code === "ENOENT") continue;
            throw error;
        }
        rmSync(quarantine, { recursive: true, force: true });
    }
    if (!claimed) {
        throw new Error("Cloud preview generation lock acquisition was contended.");
    }
    writeJsonAtomic(join(lockDirectory, "owner.json"), {
        pid: process.pid,
        token: ownerToken,
        startedAt: new Date().toISOString(),
    });
    let released = false;
    return () => {
        if (released) return;
        released = true;
        try {
            const owner = JSON.parse(readFileSync(
                join(lockDirectory, "owner.json"), "utf8",
            ));
            if (owner.pid === process.pid && owner.token === ownerToken) {
                rmSync(lockDirectory, { recursive: true, force: true });
            }
        } catch {
            // The lock has already gone away or no longer belongs to us.
        }
    };
};

const killProcessGroup = (child, signal) => {
    if (!child.pid) return;
    try {
        process.kill(-child.pid, signal);
    } catch {
        try {
            child.kill(signal);
        } catch {
            // Process already exited.
        }
    }
};

/**
 * Run one capture in its own OS process group. The watchdog kills the entire
 * group, not just the shell, so an unresponsive browser/Playwright descendant
 * cannot survive for hours after the page timeout has expired.
 */
export const runWithProcessGroupWatchdog = ({
    command,
    args,
    cwd,
    env,
    timeoutMs,
    signal: abortSignal,
    stdout = process.stdout,
    stderr = process.stderr,
}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stdout, { end: false });
    child.stderr.pipe(stderr, { end: false });
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let escalationTimer;
    const hardKill = () => killProcessGroup(child, "SIGKILL");
    const parentExit = () => hardKill();
    process.once("exit", parentExit);
    const terminateWithEscalation = () => {
        killProcessGroup(child, "SIGTERM");
        if (escalationTimer) return;
        escalationTimer = setTimeout(
            hardKill,
            CLOUD_PREVIEW_PROCESS_GROUP_GRACE_MS,
        );
        escalationTimer.unref();
    };
    const timer = setTimeout(() => {
        timedOut = true;
        terminateWithEscalation();
    }, timeoutMs);
    timer.unref();
    const abort = () => {
        aborted = true;
        terminateWithEscalation();
    };
    if (abortSignal?.aborted) abort();
    else abortSignal?.addEventListener("abort", abort, { once: true });
    child.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(escalationTimer);
        process.removeListener("exit", parentExit);
        abortSignal?.removeEventListener("abort", abort);
        reject(error);
    });
    child.once("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(escalationTimer);
        process.removeListener("exit", parentExit);
        abortSignal?.removeEventListener("abort", abort);
        if (aborted) {
            reject(new Error("Cloud preview capture was aborted."));
            return;
        }
        if (timedOut) {
            reject(new Error(
                `Capture exceeded ${timeoutMs}ms; its complete process group was killed.`,
            ));
            return;
        }
        resolve({ code, signal });
    });
});

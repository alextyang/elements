import assert from "node:assert/strict";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import test from "node:test";

import {
    captureFailureCaseName,
    manifestFor,
    parseArguments,
    publishImmutablePreviewImage,
    publishPreviewEntry,
    readCloudPreviewCaptureFailure,
    reusablePreviewEntries,
    summarizeCloudPreviewCaptureFailure,
    writeCurrentRendererManifest,
} from "./generate-cloud-previews.mjs";
import { parseManagedArguments } from "./run-cloud-preview-generation.mjs";
import {
    CLOUD_PREVIEW_MINIMUM_FREE_BYTES,
    CLOUD_PREVIEW_PROCESS_GROUP_GRACE_MS,
    CLOUD_PREVIEW_RENDERER_INPUTS,
    acquireGenerationLock,
    assertCloudPreviewFreeSpace,
    cloudPreviewAssetChecksumsEqual,
    cloudPreviewFreeBytes,
    contentHashForPaths,
    readCloudPreviewAssetChecksums,
    rendererContentHash,
    runWithProcessGroupWatchdog,
    scenarioContentHash,
    writeJsonAtomic,
} from "./lib/cloud-preview-generation.mjs";
import {
    reserveLoopbackPort,
    spawnManagedProcess,
    stopManagedProcess,
    waitForManagedServer,
} from "./lib/cloud-preview-managed-server.mjs";
import {
    loadCloudPreviewScenarios,
    transpileCloudPreviewModuleClosure,
} from "./lib/cloud-preview-scenarios.mjs";
import {
    CLOUD_PREVIEW_WATCH_COOLDOWN_MS,
    CLOUD_PREVIEW_WATCH_DEBOUNCE_MS,
    CLOUD_PREVIEW_WATCH_PRIORITY,
    CLOUD_PREVIEW_WATCH_RECONCILE_MS,
    CLOUD_PREVIEW_WATCH_RETRY_BASE_MS,
    CLOUD_PREVIEW_WATCH_RETRY_MAX_MS,
    applyCloudPreviewWatchPriority,
    cloudPreviewWatchContentHash,
    createCloudPreviewWatchCoordinator,
    parseArguments as parseWatcherArguments,
    writeCloudPreviewServiceStateSafely,
    WATCH_PATHS,
} from "./watch-cloud-previews.mjs";
import {
    CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH,
    inspectWatchServiceIdentity,
} from "./manage-cloud-preview-watch.mjs";
import { parseGeneratedPlaywrightDaemonPid } from
    "./lib/playwright-session-cleanup.mjs";
import { EventEmitter } from "node:events";

const repositoryRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const generatorSource = readFileSync(new URL(
    "./generate-cloud-previews.mjs", import.meta.url,
), "utf8");
const captureSource = readFileSync(new URL(
    "./capture-cloud-preview.sh", import.meta.url,
), "utf8");
const captureSessionSource = readFileSync(new URL(
    "./manage-cloud-preview-capture-session.sh", import.meta.url,
), "utf8");
const capturePageSource = readFileSync(new URL(
    "../app/cloud-photographs/cloud-photograph-benchmark.tsx", import.meta.url,
), "utf8");
const skyRendererSource = readFileSync(new URL(
    "../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url,
), "utf8");
const watcherSource = readFileSync(new URL(
    "./watch-cloud-previews.mjs", import.meta.url,
), "utf8");
const managedSource = readFileSync(new URL(
    "./run-cloud-preview-generation.mjs", import.meta.url,
), "utf8");
const serviceManagerSource = readFileSync(new URL(
    "./manage-cloud-preview-watch.mjs", import.meta.url,
), "utf8");
const packageSource = JSON.parse(readFileSync(new URL(
    "../package.json", import.meta.url,
), "utf8"));
const scenarioLoaderSource = readFileSync(new URL(
    "./lib/cloud-preview-scenarios.mjs", import.meta.url,
), "utf8");
const nativeConfig = JSON.parse(readFileSync(new URL(
    "./config/cloud-preview-native-playwright.json", import.meta.url,
), "utf8"));

test("capture failure summaries preserve qualifier stage and compact metrics", () => {
    const diagnostics = [
        "lifecycle_stage=capture-navigation-start",
        "stage=high-cloud-image-qualification",
        "case=ci-spissatus-day-oblique-natural",
        "--- playwright transcript ---",
        "Cloud preview high-cloud image qualification: {\"ready\":false,\"finite\":true,\"radialArtifact\":true,\"scaleSeparatedStructureReady\":false,\"metrics\":{\"fineRms\":0.0040303862728781215,\"broadBandRms\":0.015879154263987408,\"fineTextureFraction\":0.0324462890625,\"fineToBroadRatio\":0.2538161797457123,\"radialExplainedVariance\":0.23993745138622438,\"radialExplainedCoverage\":0.1424560546875}}",
    ].join("\n");
    const summary = summarizeCloudPreviewCaptureFailure(diagnostics);
    assert.match(summary, /stage=high-cloud-image-qualification/);
    assert.match(summary, /Cloud preview high-cloud image qualification/);
    assert.match(summary, /"radialArtifact":true/);
    assert.match(summary, /"scaleSeparatedStructureReady":false/);
    assert.match(summary, /"fineRms":0\.0040303862728781215/);
    assert.equal(captureFailureCaseName("ci/spissatus day"),
        "ci-spissatus-day");
    assert.equal(summarizeCloudPreviewCaptureFailure(
        "stage=run-code\n--- playwright transcript ---\n" +
        "Error: Cloud preview readiness: {\"benchmark\":{}}",
    ), "Cloud preview capture failed at stage=run-code: " +
        "Cloud preview readiness: {\"benchmark\":{}}");
    assert.equal(summarizeCloudPreviewCaptureFailure(
        "stage=adapter-preflight\ntranscript_bytes=0",
    ), "Cloud preview capture failed at stage=adapter-preflight.");
    assert.equal(readCloudPreviewCaptureFailure(
        "/definitely/missing/cloud-preview.failure.log",
    ), undefined);
});

test("generator consumes the exact shared UI catalogue at one production camera", async () => {
    const scenarios = await loadCloudPreviewScenarios({
        repositoryRoot,
        productionPerspective: "oblique-natural",
    });
    assert.equal(scenarios.length, 276,
        "the shared full-grid catalogue is 32 base + 28 orthogonal + 216 weather");
    assert.equal(new Set(scenarios.map(({ id }) => id)).size, scenarios.length);
    assert.ok(scenarios.every(({ productionPerspective }) =>
        productionPerspective === "oblique-natural"));
    assert.match(scenarioLoaderSource,
        /app\/cloud-preview-matrix\/cloud-preview-catalog\.ts/);
    assert.match(scenarioLoaderSource, /catalog\.previewDefinitions\(productionPerspective\)/);
});

test("catalogue loader follows weather qualification runtime dependencies", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-closure-"));
    try {
        const modules = transpileCloudPreviewModuleClosure({
            sourceRoot: join(repositoryRoot, "components/backgrounds/sky"),
            temporaryRoot: temporary,
            rootModuleNames: ["weather-qualification-matrix"],
        });
        assert.ok(modules.includes("cloud-system-runtime.ts"),
            "weather qualification's retained runtime import must be emitted");
        assert.ok(modules.includes("cloud-family-production-adapter.ts"),
            "nested runtime dependencies must be emitted recursively");
        assert.ok(existsSync(join(temporary, "cloud-system-runtime.mjs")));
        assert.match(readFileSync(
            join(temporary, "weather-qualification-matrix.mjs"),
            "utf8",
        ), /from "\.\/cloud-system-runtime\.mjs"/);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("catalogue loader recursively mirrors future relative TypeScript modules", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-nested-"));
    try {
        const sourceRoot = join(temporary, "sky");
        const outputRoot = join(temporary, "output");
        mkdirSync(join(sourceRoot, "nested"), { recursive: true });
        mkdirSync(outputRoot);
        writeFileSync(join(sourceRoot, "entry.ts"),
            'import { nested } from "./nested/dependency";\nexport const value = nested;\n');
        writeFileSync(join(sourceRoot, "nested/dependency.ts"),
            'import { leaf } from "../leaf";\nexport const nested = leaf;\n');
        writeFileSync(join(sourceRoot, "leaf.ts"),
            'export const leaf = "complete";\n');

        const modules = transpileCloudPreviewModuleClosure({
            sourceRoot,
            temporaryRoot: outputRoot,
            rootModuleNames: ["entry"],
        });
        assert.deepEqual(modules, [
            "entry.ts",
            "leaf.ts",
            "nested/dependency.ts",
        ]);
        assert.match(readFileSync(
            join(outputRoot, "nested/dependency.mjs"),
            "utf8",
        ), /from "\.\.\/leaf\.mjs"/);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("catalogue loader rejects unresolved and out-of-root dependencies", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-safety-"));
    try {
        const sourceRoot = join(temporary, "sky");
        const outputRoot = join(temporary, "output");
        mkdirSync(sourceRoot);
        mkdirSync(outputRoot);
        writeFileSync(join(temporary, "escape.ts"),
            "export const escaped = true;\n");
        writeFileSync(join(sourceRoot, "entry.ts"),
            'import { escaped } from "../escape";\nexport { escaped };\n');
        assert.throws(() => transpileCloudPreviewModuleClosure({
            sourceRoot,
            temporaryRoot: outputRoot,
            rootModuleNames: ["entry"],
        }), /escapes the allowed sky source root/);

        writeFileSync(join(sourceRoot, "entry.ts"),
            'import { missing } from "./missing";\nexport { missing };\n');
        assert.throws(() => transpileCloudPreviewModuleClosure({
            sourceRoot,
            temporaryRoot: outputRoot,
            rootModuleNames: ["entry"],
        }), /Unresolved relative TypeScript dependency/);

        writeFileSync(join(temporary, "linked.ts"),
            "export const linked = true;\n");
        symlinkSync(join(temporary, "linked.ts"), join(sourceRoot, "linked.ts"));
        writeFileSync(join(sourceRoot, "entry.ts"),
            'import { linked } from "./linked";\nexport { linked };\n');
        assert.throws(() => transpileCloudPreviewModuleClosure({
            sourceRoot,
            temporaryRoot: outputRoot,
            rootModuleNames: ["entry"],
        }), /resolves outside the allowed sky source root/,
        "a dependency symlink cannot escape the bounded CPU source graph");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("renderer and scenario content hashes invalidate exact inputs", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-hash-"));
    try {
        const rendererDirectory = join(temporary, "components/backgrounds/sky");
        writeJsonAtomic(join(rendererDirectory, "fixture.ts"), { value: 1 });
        const first = rendererContentHash(temporary);
        writeFileSync(join(rendererDirectory, "fixture.ts"), "changed\n");
        const second = rendererContentHash(temporary);
        assert.notEqual(first, second);
        const common = {
            rendererHash: second,
            scenario: { id: "base:cumulus:humilis", caseId: "case-a" },
            productionPerspective: "oblique-natural",
            transportUpdates: 64,
            captureMode: "native-metal",
        };
        assert.equal(scenarioContentHash(common), scenarioContentHash(common));
        assert.notEqual(scenarioContentHash(common), scenarioContentHash({
            ...common,
            scenario: { ...common.scenario, caseId: "case-b" },
        }));
        assert.notEqual(scenarioContentHash(common), scenarioContentHash({
            ...common,
            captureMode: "headless",
        }), "native Metal and software/headless captures cannot share cache keys");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("renderer identity covers capture orchestration and every runtime sky asset", () => {
    for (const requiredInput of [
        "public/assets/moon",
        "public/assets/sky",
        "scripts/run-cloud-preview-generation.mjs",
        "scripts/lib/cloud-preview-managed-server.mjs",
        "scripts/config/cloud-preview-native-playwright.json",
        "tsconfig.json",
    ]) {
        assert.ok(CLOUD_PREVIEW_RENDERER_INPUTS.includes(requiredInput),
            `renderer identity must include ${requiredInput}`);
    }
});

test("watched content revisions ignore unchanged rewrites and overlapping paths", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-watch-hash-"));
    try {
        const directory = join(temporary, "watched");
        mkdirSync(directory);
        const file = join(directory, "fixture.ts");
        writeFileSync(file, "same bytes\n");
        const first = contentHashForPaths(temporary, ["watched", "watched/fixture.ts"]);
        writeFileSync(file, "same bytes\n");
        const unchanged = contentHashForPaths(temporary, ["watched"]);
        assert.equal(first, unchanged,
            "metadata churn and overlapping watch roots do not alter revision identity");
        writeFileSync(file, "materially changed bytes\n");
        assert.notEqual(contentHashForPaths(temporary, ["watched"]), unchanged);
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("manifest records capture backend identity", () => {
    const assetChecksums = readCloudPreviewAssetChecksums(repositoryRoot);
    const manifest = manifestFor({
        rendererHash: "renderer-a",
        assetChecksums,
        productionPerspective: "oblique-natural",
        captureMode: "native-metal",
        scenarios: [],
        entriesById: new Map(),
    });
    assert.equal(manifest.captureMode, "native-metal");
    assert.deepEqual(manifest.assetChecksums, assetChecksums);
    assert.equal(manifest.status, "complete");
});

test("preview asset identity includes every current cloud-volume checksum", () => {
    const checksums = readCloudPreviewAssetChecksums(repositoryRoot);
    assert.equal(checksums.algorithm, "SHA-256");
    for (const key of ["atlas", "majorants", "exteriorBoundary"]) {
        assert.match(checksums[key], /^[a-f0-9]{64}$/);
    }
    assert.equal(cloudPreviewAssetChecksumsEqual(checksums, {
        ...checksums,
    }), true);
    assert.equal(cloudPreviewAssetChecksumsEqual(checksums, {
        ...checksums,
        majorants: "0".repeat(64),
    }), false, "any cloud-volume asset change invalidates reuse");
});

test("old manifests without asset identities never reuse entries", () => {
    const assetChecksums = readCloudPreviewAssetChecksums(repositoryRoot);
    const scenarios = [{
        id: "base:stratus:nebulosus",
        caseId: "st-nebulosus--day-oblique-natural",
        captureParameter: "case",
    }];
    const reused = reusablePreviewEntries({
        existing: {
            schemaVersion: 1,
            rendererHash: "current",
            productionPerspective: "oblique-natural",
            captureMode: "native-metal",
            entries: [{
                id: scenarios[0].id,
                caseId: scenarios[0].caseId,
                captureParameter: scenarios[0].captureParameter,
                contentHash: "0".repeat(64),
                imageUrl: "/generated/cloud-previews/images/old.png",
            }],
        },
        rendererHash: "current",
        assetChecksums,
        productionPerspective: "oblique-natural",
        captureMode: "native-metal",
        transportUpdates: 64,
        scenarios,
        repositoryRoot,
    });
    assert.equal(reused.size, 0,
        "a pre-identity manifest is stale even when renderer metadata matches");
});

test("manifest writes and generation locks are atomic and single-owner", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-atomic-"));
    try {
        const manifest = join(temporary, "manifest.json");
        writeJsonAtomic(manifest, { schemaVersion: 1, entries: [] });
        assert.deepEqual(JSON.parse(readFileSync(manifest, "utf8")), {
            schemaVersion: 1,
            entries: [],
        });
        assert.deepEqual(readdirSync(temporary), ["manifest.json"]);
        const lock = join(temporary, ".generation.lock");
        const release = acquireGenerationLock(lock);
        assert.throws(() => acquireGenerationLock(lock), /already active/);
        release();
        assert.equal(existsSync(lock), false);

        const initializingLock = join(temporary, ".initializing.lock");
        mkdirSync(initializingLock);
        assert.throws(() => acquireGenerationLock(initializingLock),
            /still initializing/,
            "a second process cannot steal the lock before owner.json commits");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("renderer revision guard rejects a stale manifest at atomic commit", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-publish-"));
    try {
        const manifestPath = join(temporary, "manifest.json");
        const original = { schemaVersion: 1, rendererHash: "current", entries: [] };
        writeJsonAtomic(manifestPath, original);
        assert.throws(() => writeCurrentRendererManifest({
            path: manifestPath,
            manifest: {
                schemaVersion: 1,
                rendererHash: "stale",
                entries: [{ id: "base:cirrus:fibratus" }],
            },
            repositoryRoot: temporary,
            expectedRendererHash: "stale",
            rendererHashImplementation: () => "edited",
        }), /changed at manifest publication/);
        assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), original,
            "a rejected temporary manifest must never replace the visible file");
        assert.deepEqual(readdirSync(temporary), ["manifest.json"],
            "the rejected atomic replacement must clean up its temporary file");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("cloud asset revision guard rejects a stale manifest at atomic commit", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-assets-"));
    try {
        const manifestPath = join(temporary, "manifest.json");
        const assetChecksums = readCloudPreviewAssetChecksums(repositoryRoot);
        const original = {
            schemaVersion: 1,
            rendererHash: "current",
            assetChecksums,
            entries: [],
        };
        writeJsonAtomic(manifestPath, original);
        assert.throws(() => writeCurrentRendererManifest({
            path: manifestPath,
            manifest: original,
            repositoryRoot,
            expectedRendererHash: "current",
            expectedAssetChecksums: assetChecksums,
            rendererHashImplementation: () => "current",
            assetChecksumsImplementation: () => ({
                ...assetChecksums,
                exteriorBoundary: "d".repeat(64),
            }),
        }), /Cloud volume assets changed at manifest publication/);
        assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), original,
            "asset drift must not replace the visible atomic manifest");
        assert.deepEqual(readdirSync(temporary), ["manifest.json"],
            "the rejected asset publication must clean up its temporary file");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("rejected preview publication cannot leak its staged entry", () => {
    const scenarios = [{ id: "base:cirrus:fibratus" }];
    const entriesById = new Map();
    const entry = { id: scenarios[0].id, imageUrl: "/immutable.png" };
    const assetChecksums = readCloudPreviewAssetChecksums(repositoryRoot);
    assert.throws(() => publishPreviewEntry({
        path: "/unused/manifest.json",
        rendererHash: "stale",
        assetChecksums,
        productionPerspective: "oblique-natural",
        captureMode: "native-metal",
        scenarios,
        entriesById,
        entry,
        repositoryRoot: "/unused",
        writeManifestImplementation: () => {
            throw new Error("renderer changed at publication");
        },
    }), /renderer changed at publication/);
    assert.equal(entriesById.has(entry.id), false,
        "the final manifest source map must remain free of the stale entry");
});

test("published preview filenames hash PNG bytes and never replace content", () => {
    const temporary = mkdtempSync(join(tmpdir(), "elements-preview-image-"));
    try {
        const firstTemporary = join(temporary, ".first.tmp");
        writeFileSync(firstTemporary, "first immutable png bytes");
        const first = publishImmutablePreviewImage({
            processedPath: firstTemporary,
            imageRoot: temporary,
            previewId: "base:cumulus:humilis",
        });
        assert.match(first.filename,
            /^base-cumulus-humilis-[a-f0-9]{12}\.png$/);
        assert.equal(first.imageContentHash.length, 64);
        assert.equal(readFileSync(first.finalPath, "utf8"),
            "first immutable png bytes");

        const secondTemporary = join(temporary, ".second.tmp");
        writeFileSync(secondTemporary, "different immutable png bytes");
        const second = publishImmutablePreviewImage({
            processedPath: secondTemporary,
            imageRoot: temporary,
            previewId: "base:cumulus:humilis",
        });
        assert.notEqual(second.filename, first.filename,
            "changed pixels must publish at a new immutable URL");
        assert.equal(readFileSync(first.finalPath, "utf8"),
            "first immutable png bytes",
            "publishing a new capture cannot alter the prior URL");

        const duplicateTemporary = join(temporary, ".duplicate.tmp");
        writeFileSync(duplicateTemporary, "first immutable png bytes");
        const duplicate = publishImmutablePreviewImage({
            processedPath: duplicateTemporary,
            imageRoot: temporary,
            previewId: "base:cumulus:humilis",
        });
        assert.equal(duplicate.filename, first.filename);
        assert.equal(existsSync(duplicateTemporary), false,
            "identical bytes reuse the immutable asset without replacing it");
    } finally {
        rmSync(temporary, { recursive: true, force: true });
    }
});

test("free-space preflight rejects before build or capture work", () => {
    const gibibyte = 1024n * 1024n * 1024n;
    const fakeStatfs = () => ({ bavail: 3n, bsize: gibibyte });
    assert.equal(cloudPreviewFreeBytes(repositoryRoot, fakeStatfs), 3n * gibibyte);
    assert.equal(assertCloudPreviewFreeSpace({
        path: repositoryRoot,
        phase: "synthetic preview phase",
        statfsImplementation: fakeStatfs,
    }), 3n * gibibyte);
    assert.equal(CLOUD_PREVIEW_MINIMUM_FREE_BYTES, 2n * gibibyte);
    assert.throws(() => assertCloudPreviewFreeSpace({
        path: repositoryRoot,
        phase: "synthetic preview capture",
        statfsImplementation: () => ({ bavail: 511n, bsize: 1024n * 1024n }),
    }), /Insufficient free space before synthetic preview capture: 511 MiB available; 2048 MiB required[\s\S]*No preview build or capture was started/);
    assert.ok(managedSource.indexOf("assertCloudPreviewFreeSpace({") <
        managedSource.indexOf("Building managed cloud preview revision"),
    "managed build must be rejected before Next starts");
    const capturePreflight = generatorSource.indexOf(
        "phase: `cloud preview capture ${scenario.id}`",
    );
    assert.ok(capturePreflight >= 0 && capturePreflight <
        generatorSource.indexOf("runWithProcessGroupWatchdog({", capturePreflight),
    "each serial image must recheck disk before its browser process group starts");
    assert.ok(serviceManagerSource.indexOf("assertCloudPreviewFreeSpace({") <
        serviceManagerSource.indexOf("child = spawn(process.execPath"),
    "a detached watcher cannot start into a known ENOSPC condition");
});

test("service-state ENOSPC is nonfatal to in-memory process ownership", () => {
    const messages = [];
    const persisted = writeCloudPreviewServiceStateSafely(
        "/synthetic/watch-service.json",
        { pid: 100, generationPid: 200 },
        () => {
            const error = new Error("no space left on device");
            error.code = "ENOSPC";
            throw error;
        },
        (message) => messages.push(message),
    );
    assert.equal(persisted, false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /in-memory process ownership remains authoritative/);
    assert.doesNotThrow(() => writeCloudPreviewServiceStateSafely(
        "/synthetic/watch-service.json",
        { pid: 100, generationPid: 200 },
        () => { throw new Error("state ENOSPC"); },
        () => { throw new Error("log ENOSPC"); },
    ), "a full detached log cannot interrupt exact child teardown either");
    const timers = [];
    const child = new EventEmitter();
    child.pid = 23456;
    child.killSignals = [];
    let stoppedCode;
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: 250,
        getRevision: () => "revision-enospc",
        spawnGeneration: () => child,
        log: () => {},
        logError: () => {},
        onStopped: (code) => { stoppedCode = code; },
        setTimer: (callback, delay) => {
            const timer = { callback, delay, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { timer.cleared = true; },
        killChild: (ownedChild, signal) => ownedChild.killSignals.push(signal),
    });
    coordinator.schedule();
    timers.find(({ delay }) => delay === 250).callback();
    assert.equal(coordinator.state().active, true);
    coordinator.stop("SIGTERM");
    assert.deepEqual(child.killSignals, ["SIGTERM"],
        "shutdown targets the in-memory generator despite failed persistence");
    child.emit("close", 143, null);
    assert.equal(stoppedCode, 143);
    assert.match(watcherSource,
        /serviceChildPid = launched\.pid;[\s\S]*publishServiceState\(\)/,
        "the exact generator pid is retained before fallible persistence");
    assert.match(watcherSource,
        /publishServiceState\(\);[\s\S]*coordinator\.stop\(signal\)/,
        "a failed stopping-state write cannot bypass in-memory child teardown");
    assert.match(watcherSource,
        /process\.once\("exit", \(\) => \{[\s\S]*coordinator\.killOwnedChildOnExit\(\)/,
        "abrupt watcher exit still kills the exact in-memory child process group");
});

test("per-image watchdog bounds a stuck OS process group", async () => {
    assert.ok(CLOUD_PREVIEW_PROCESS_GROUP_GRACE_MS >= 6_000,
        "the capture trap needs enough time for bounded exact-daemon cleanup");
    const started = Date.now();
    const sink = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    await assert.rejects(runWithProcessGroupWatchdog({
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: repositoryRoot,
        env: process.env,
        timeoutMs: 100,
        stdout: sink,
        stderr: sink,
    }), /process group was killed/);
    assert.ok(Date.now() - started < 3_000);
    assert.match(readFileSync(new URL(
        "./lib/cloud-preview-generation.mjs", import.meta.url,
    ), "utf8"), /process\.once\("exit", parentExit\)/,
    "an abruptly exiting owner cannot orphan its detached child group");
    assert.match(readFileSync(new URL(
        "./lib/cloud-preview-generation.mjs", import.meta.url,
    ), "utf8"), /clearTimeout\(escalationTimer\)/,
    "a completed child must cancel delayed SIGKILL before its pid can be reused");
});

test("capture accepts only completed stable reconstruction and owns daemon cleanup", () => {
    assert.match(captureSource, /open about:blank/);
    assert.ok(captureSource.indexOf("setViewportSize") <
        captureSource.lastIndexOf("page.goto"));
    assert.match(captureSource, /data-benchmark-ready'\) === 'ready'/);
    assert.match(captureSource, /data-cloud-reconstruction-mature/);
    assert.match(captureSource, /minimum-history-acceptance-fraction/);
    assert.match(captureSource, /minimum-stable-history-age/);
    assert.match(captureSource, /minimum-persistent-history-confidence/);
    assert.match(captureSource, /for \(let poll = 0; poll < 3/);
    assert.match(captureSource, /cleanup-playwright-session\.mjs/);
    assert.match(captureSource, /capture_cleanup_started/,
        "TERM followed by EXIT must not run daemon cleanup twice");
    assert.match(captureSource, /CLOUD_PREVIEW_CAPTURE_MODE/);
    assert.match(captureSource, /capture_open_args\+\=\(--config/);
    assert.match(captureSource, /cloud-preview-adapter-probe\.html/);
    assert.match(captureSource,
        /requestAdapter\(\{[\s\S]*powerPreference: 'low-power'/,
        "capture must preflight the exact adapter preference used by the renderer");
    assert.match(captureSource,
        /const encodedInfo = await page\.evaluate\([\s\S]*new TextEncoder\(\)/,
        "adapter encoding must run in the browser context that provides TextEncoder");
    assert.doesNotMatch(captureSource,
        /const info = await page\.evaluate\([\s\S]{0,800}const bytes = new TextEncoder/,
        "the Playwright CLI host does not provide TextEncoder");
    assert.match(captureSource,
        /const encodedState = await page\.evaluate\(\(value\) => \{[\s\S]*new TextEncoder\(\)[\s\S]*return btoa\(binary\)[\s\S]*\}, state\)/,
        "capture metrics encoding must run in the browser context");
    assert.doesNotMatch(captureSource,
        /await page\.locator\('\[data-benchmark-render\]'\)\.screenshot\([\s\S]{0,500}\n\s*const bytes = new TextEncoder/,
        "capture metrics must not use TextEncoder in the Playwright CLI host");
    assert.ok(captureSource.indexOf("adapter-preflight-complete") <
        captureSource.indexOf("capture-navigation-start"));
    assert.match(captureSource, /cloud-transport-adapter-policy\.mjs/,
        "capture and renderer share one backend policy");
    assert.match(captureSource, /refused non-Apple-Metal WebGPU/);
    assert.match(captureSource, /capture_heartbeat_pid/);
    assert.match(captureSource, /lifecycle_stage=capture-running/);
    assert.match(captureSource, /diagnosticReserveMs/);
    assert.match(captureSource, /Promise\.race/,
        "readiness diagnostics must not consume the reserved watchdog tail");
    assert.match(captureSource,
        /const controllerStepTimeoutMs = \$capture_step_timeout_ms/);
    assert.match(captureSource,
        /page\.evaluate\(\(\) =>[\s\S]*__elementsSkyRendererCaptureStep[\s\S]*page\.waitForTimeout\(stepBudgetMs\)/,
        "each GPU-fence controller step needs a host-side timeout");
    assert.match(captureSource, /CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT/);
    assert.match(captureSource, /controllerStepIndex/);
    assert.match(captureSource, /lastControllerStepState/);
    assert.match(captureSource,
        /quarantine_reused_session_after_step_timeout/,
        "a poisoned persistent page must not outlive its exact owned session");
    assert.match(captureSource,
        /CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT[\s\S]*exit 75/,
        "the capture marks its revision-owned persistent page unusable");
    assert.match(generatorSource,
        /captureSessionQuarantined = result\.code === 75[\s\S]*if \(captureSessionQuarantined\)/,
        "the generator must not feed more cases to a quarantined session");
    assert.match(captureSource, /capture_run_output="\$\(/,
        "the complete run-code transcript must not be discarded");
    assert.match(captureSource, /capture_cli_transcript_failed/);
    assert.match(captureSource, /persist_capture_failure "run-code"/);
    assert.match(captureSource, /Cloud preview readiness:/);
    assert.match(captureSource, /rendererLightProgress/);
    assert.match(captureSource,
        /renderState === 'empty' &&[\s\S]*updates >= request\.minimumUpdates/,
        "empty occupancy after the full transport horizon is terminal");
    assert.match(captureSource, /data-cloud-projected-opacity/);
    assert.match(captureSource, /data-cloud-occupied-sky/);
    assert.match(captureSource, /data-cloud-minimum-occupied-sky/);
    assert.match(captureSource, /capture_failure_transcript_limit=131072/);
    assert.match(captureSource, /rm -f "\$capture_output"/);
    assert.equal(nativeConfig.browser.launchOptions.headless, false);
    assert.ok(nativeConfig.browser.launchOptions.args.includes(
        "--window-position=-10000,0"));
    assert.match(generatorSource, /runWithProcessGroupWatchdog/);
    assert.match(generatorSource, /changed at manifest publication/,
        "source edits during image encoding cannot commit a stale manifest entry");
    const session = "cloud-preview-8123-1780000000";
    assert.equal(parseGeneratedPlaywrightDaemonPid(
        `### Browser \`${session}\` opened with pid 9182.`, session,
    ), 9182);
    const revisionSession = "cloud-preview-revision-8123-1780000000";
    assert.equal(parseGeneratedPlaywrightDaemonPid(
        `### Browser \`${revisionSession}\` opened with pid 9183.`, revisionSession,
    ), 9183);
});

test("one persistent native session owns every serial case in a renderer revision", () => {
    const sessionStart = generatorSource.indexOf(
        'args: [captureSessionScript, "start", captureSessionStatePath]',
    );
    const serialLoop = generatorSource.indexOf(
        "for (const [index, scenario] of pending.entries())",
    );
    const sessionStop = generatorSource.indexOf(
        'args: [captureSessionScript, "stop", captureSessionStatePath]',
    );
    assert.ok(sessionStart >= 0 && sessionStart < serialLoop,
        "the adapter/browser session must start once before the serial loop");
    assert.ok(sessionStop > serialLoop &&
        generatorSource.lastIndexOf("} finally {") < sessionStop,
        "the persistent session must close from generator cleanup");
    assert.match(generatorSource, /CLOUD_PREVIEW_PERSISTENT_SESSION:/);
    assert.match(generatorSource, /CLOUD_PREVIEW_PERSISTENT_DAEMON_PID:/);
    assert.match(generatorSource, /adapter preflight ran once/);
    assert.match(captureSessionSource, /open about:blank/);
    assert.match(captureSessionSource,
        /requestAdapter\(\{[\s\S]*powerPreference: 'low-power'/);
    assert.match(captureSessionSource, /native-apple-metal/);
    assert.match(captureSessionSource,
        /cleanup-playwright-session\.mjs["']? \\\n+            cleanup/,
        "session stop retains exact daemon cleanup");
});

test("persistent session manager preflights once and publishes exact ownership", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-session-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const statePath = join(temporaryRoot, "session.json");
        const operationLog = join(temporaryRoot, "operations.log");
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
session=""
operation=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--session" ]; then session="$argument"; fi
  case "$argument" in open|run-code|close) operation="$argument" ;; esac
  previous="$argument"
done
printf '%s\\n' "$operation" >> "$CLOUD_PREVIEW_TEST_OPERATION_LOG"
case "$operation" in
  open)
    printf '### Browser \`%s\` opened with pid %s.\\n' "$session" "$$"
    ;;
  run-code)
    printf '%s\\n' 'CLOUD_PREVIEW_ADAPTER_B64:eyJ2ZW5kb3IiOiJBcHBsZSIsImFyY2hpdGVjdHVyZSI6Im1ldGFsLTMiLCJpc0ZhbGxiYWNrQWRhcHRlciI6ZmFsc2V9'
    ;;
esac
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const environment = {
            ...process.env,
            PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
            PWCLI: fakePlaywright,
            CLOUD_PREVIEW_URL: "http://synthetic.invalid",
            CLOUD_PREVIEW_CAPTURE_MODE: "headless",
            CLOUD_PREVIEW_TEST_OPERATION_LOG: operationLog,
        };
        const manager = new URL(
            "./manage-cloud-preview-capture-session.sh",
            import.meta.url,
        ).pathname;
        const start = spawnSync("bash", [manager, "start", statePath], {
            encoding: "utf8",
            env: environment,
        });
        assert.equal(start.status, 0, start.stderr);
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        assert.match(state.session, /^cloud-preview-revision-\d+-\d+$/);
        assert.equal(state.adapterBackend, "native-apple-metal");
        assert.equal(state.adapterInfo.architecture, "metal-3");
        assert.deepEqual(readFileSync(operationLog, "utf8").trim().split("\n"),
            ["open", "run-code"], "adapter preflight runs exactly once at start");
        const stop = spawnSync("bash", [manager, "stop", statePath], {
            encoding: "utf8",
            env: environment,
        });
        assert.equal(stop.status, 0, stop.stderr);
        assert.equal(existsSync(statePath), false);
        assert.deepEqual(readFileSync(operationLog, "utf8").trim().split("\n"),
            ["open", "run-code", "close"]);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("persistent captures switch scene state without remounting the GPU canvas", () => {
    assert.match(captureSource, /capture_owns_session=0/);
    assert.match(captureSource,
        /if \(\( capture_owns_session == 0 \)\); then return; fi/,
        "a per-case command must not close the revision-owned browser");
    assert.match(captureSource, /__elementsCloudPreviewCapture\?\.switchCase/);
    assert.match(captureSource, /Cloud preview persistent case switch was rejected/);
    assert.match(captureSource,
        /if \(canSwitch\)[\s\S]*page\.evaluate[\s\S]*else \{[\s\S]*page\.goto/,
        "navigation is only the first-case fallback; later cases use the bridge");
    assert.match(capturePageSource, /captureSession.*persistent/);
    assert.match(capturePageSource, /__elementsCloudPreviewCapture/);
    assert.match(capturePageSource,
        /rendererSceneKey=\{benchmark\.id\}/,
        "the mounted renderer receives the exact catalogue identity");
    assert.match(capturePageSource,
        /handleRendererStats = useCallback\([\s\S]*next\.sceneKey[\s\S]*\}, \[\]\)/,
        "stable stats callbacks use the renderer-owned key without restarting the device");
    assert.match(capturePageSource,
        /useLayoutEffect\(\(\) => \{[\s\S]*setVisualResult\(undefined\)/,
        "capture state resets before Sky's passive visual snapshot callback");
    assert.match(capturePageSource, /canvas\.dataset\.cloudSceneKey/,
        "light readiness cannot retag data from the previous scene");
    assert.match(captureSource,
        /data-cloud-scene-key[\s\S]*request\.sceneKey/,
        "capture waits for the canvas to acknowledge the requested scene");
    assert.match(captureSource,
        /ready === 'ready' \|\| renderState === 'empty' \|\|/,
        "persistent capture terminates promptly on a measured empty scene");
    assert.doesNotMatch(captureSource, /`page\.evaluate`/,
        "shell-embedded capture JavaScript cannot contain command-substitution quotes");
    assert.match(captureSource, /state\.sceneKey !== target\.caseId/,
        "final publication rejects a stale-scene screenshot");
    assert.match(skyRendererSource,
        /nextCloudHistorySignature !== cloudHistorySignature \|\|[\s\S]*nextSceneKey !== activeSceneKey/,
        "a caller scene-key transition invalidates accumulated cloud history");
    assert.match(skyRendererSource, /canvas\.dataset\.cloudSceneKey = activeSceneKey/,
        "the canvas acknowledges only the scene processed by its draw loop");
});

test("a persistent per-case capture never opens, preflights, or closes its session", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-reuse-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const diagnosticRoot = join(temporaryRoot, "diagnostics");
        const outputImage = join(temporaryRoot, "frame.png");
        const operationLog = join(temporaryRoot, "operations.log");
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
operation=""
for argument in "$@"; do
  case "$argument" in open|run-code|close) operation="$argument" ;; esac
done
printf '%s\\n' "$operation" >> "$CLOUD_PREVIEW_TEST_OPERATION_LOG"
if [ "$operation" = "run-code" ]; then
  printf 'synthetic png' > "$CLOUD_PREVIEW_TEST_OUTPUT"
fi
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./capture-cloud-preview.sh", import.meta.url).pathname,
            "case",
            "synthetic-case",
            outputImage,
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_PREVIEW_URL: "http://synthetic.invalid",
                CLOUD_PREVIEW_CAPTURE_MODE: "headless",
                CLOUD_PREVIEW_DIAGNOSTIC_ROOT: diagnosticRoot,
                CLOUD_PREVIEW_PERSISTENT_SESSION:
                    "cloud-preview-revision-8123-1780000000",
                CLOUD_PREVIEW_PERSISTENT_DAEMON_PID: "9182",
                CLOUD_PREVIEW_PERSISTENT_ADAPTER_INFO:
                    '{"vendor":"Apple","architecture":"metal-3"}',
                CLOUD_PREVIEW_PERSISTENT_ADAPTER_BACKEND:
                    "native-apple-metal",
                CLOUD_PREVIEW_TEST_OPERATION_LOG: operationLog,
                CLOUD_PREVIEW_TEST_OUTPUT: outputImage,
            },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /lifecycle_stage=browser-session-reused/);
        assert.match(result.stdout, /lifecycle_stage=adapter-preflight-reused/);
        assert.doesNotMatch(result.stdout, /adapter-preflight-complete/);
        assert.equal(existsSync(outputImage), true);
        assert.deepEqual(readFileSync(operationLog, "utf8").trim().split("\n"),
            ["run-code"]);
        assert.equal(readdirSync(diagnosticRoot).length, 0,
            "a successful reused case removes its transient lifecycle evidence");
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("a timed-out GPU-fence step quarantines its exact persistent session", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-step-timeout-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const diagnosticRoot = join(temporaryRoot, "diagnostics");
        const outputImage = join(temporaryRoot, "frame.png");
        const operationLog = join(temporaryRoot, "operations.log");
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
operation=""
for argument in "$@"; do
  case "$argument" in open|run-code|close) operation="$argument" ;; esac
done
printf '%s\\n' "$operation" >> "$CLOUD_PREVIEW_TEST_OPERATION_LOG"
if [ "$operation" = "run-code" ]; then
  printf '%s\\n' \\
    '### Error' \\
    'Error: Cloud preview readiness: {"benchmark":{"data-cloud-render-state":"lighting"}}; cause=Error: CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT {"controllerStepIndex":7,"stepBudgetMs":30000,"lastControllerStepState":"advanced"}'
fi
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./capture-cloud-preview.sh", import.meta.url).pathname,
            "case",
            "synthetic-timeout-case",
            outputImage,
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_PREVIEW_URL: "http://synthetic.invalid",
                CLOUD_PREVIEW_CAPTURE_MODE: "headless",
                CLOUD_PREVIEW_DIAGNOSTIC_ROOT: diagnosticRoot,
                CLOUD_PREVIEW_PERSISTENT_SESSION:
                    "cloud-preview-revision-8123-1780000000",
                CLOUD_PREVIEW_PERSISTENT_DAEMON_PID: "9182",
                CLOUD_PREVIEW_PERSISTENT_ADAPTER_INFO:
                    '{"vendor":"Apple","architecture":"metal-3"}',
                CLOUD_PREVIEW_PERSISTENT_ADAPTER_BACKEND:
                    "native-apple-metal",
                CLOUD_PREVIEW_TEST_OPERATION_LOG: operationLog,
            },
        });
        assert.equal(result.status, 75, result.stderr);
        assert.deepEqual(readFileSync(operationLog, "utf8").trim().split("\n"),
            ["run-code", "close"]);
        assert.match(result.stdout,
            /lifecycle_stage=controller-step-timeout-quarantine/);
        const diagnostics = readFileSync(join(
            diagnosticRoot,
            "case-synthetic-timeout-case.failure.log",
        ), "utf8");
        assert.match(diagnostics, /CLOUD_PREVIEW_CONTROLLER_STEP_TIMEOUT/);
        assert.match(diagnostics, /controllerStepIndex/);
        assert.equal(existsSync(outputImage), false);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("capture rejects exit-zero playwright errors and persists bounded readiness", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-capture-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const diagnosticRoot = join(temporaryRoot, "diagnostics");
        const outputImage = join(temporaryRoot, "stale.png");
        mkdirSync(binaryRoot);
        writeFileSync(outputImage, "stale frame");
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
session=""
operation=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--session" ]; then session="$argument"; fi
  case "$argument" in
    open|run-code|close) operation="$argument" ;;
  esac
  previous="$argument"
done
case "$operation" in
  open)
    printf '### Browser \`%s\` opened with pid %s.\\n' "$session" "$$"
    ;;
  run-code)
    case "$*" in
      *CLOUD_PREVIEW_ADAPTER_B64*)
        printf '%s\\n' 'CLOUD_PREVIEW_ADAPTER_B64:eyJ2ZW5kb3IiOiJBcHBsZSBJbmMuIiwiYXJjaGl0ZWN0dXJlIjoiIiwiaXNGYWxsYmFja0FkYXB0ZXIiOmZhbHNlfQ=='
        ;;
      *)
        dd if=/dev/zero bs=1024 count=150 2>/dev/null | tr '\\000' X
        printf '%s\\n' \
          '### Error' \
          'TimeoutError: synthetic readiness timeout' \
          'Error: Cloud preview readiness: {"benchmark":{"data-benchmark-ready":"rendering","data-cloud-render-state":"lighting","data-cloud-transport-updates":"31"},"rendererInitializationStage":"transport","rendererLightProgress":{"data-cloud-light-volume-state":"building"}}; cause=TimeoutError'
        exit 0
        ;;
    esac
    ;;
esac
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./capture-cloud-preview.sh", import.meta.url).pathname,
            "case",
            "synthetic/case",
            outputImage,
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_PREVIEW_URL: "http://synthetic.invalid",
                CLOUD_PREVIEW_CAPTURE_MODE: "headless",
                CLOUD_PREVIEW_DIAGNOSTIC_ROOT: diagnosticRoot,
            },
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr,
            /Cloud preview readiness: \{"benchmark":\{"data-benchmark-ready":"rendering"/);
        assert.match(result.stderr, /"data-cloud-transport-updates":"31"/);
        assert.match(result.stderr, /Cloud preview capture failed; diagnostics:/);
        assert.doesNotMatch(result.stderr, /produced no image/,
            "an explicit transcript failure must not degrade to a missing-image error");
        assert.equal(existsSync(outputImage), false,
            "a rejected rerun removes the stale requested screenshot");
        const failureLog = join(diagnosticRoot,
            "case-synthetic-case.failure.log");
        assert.equal(existsSync(failureLog), true);
        const diagnostics = readFileSync(failureLog, "utf8");
        assert.match(diagnostics, /stage=run-code/);
        assert.match(diagnostics,
            /lifecycle_stage=adapter-preflight-complete backend=native-apple-metal/);
        assert.match(diagnostics, /adapter=\{"vendor":"Apple Inc\."/);
        assert.match(diagnostics, /lifecycle_stage=capture-navigation-start/);
        assert.match(diagnostics, /cli_exit_status=0/);
        assert.match(diagnostics, /transcript_bytes=15\d{4}/);
        assert.match(diagnostics, /transcript_truncated_to_tail_bytes=131072/);
        assert.match(diagnostics, /### Error/);
        assert.match(diagnostics, /TimeoutError: synthetic readiness timeout/);
        assert.match(diagnostics, /data-cloud-light-volume-state/);
        assert.ok(statSync(failureLog).size < 132_000,
            "persistent failure diagnostics remain strictly bounded");
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("capture reports a post-screenshot qualifier rejection as the primary failure", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-qualifier-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const diagnosticRoot = join(temporaryRoot, "diagnostics");
        const outputImage = join(temporaryRoot, "frame.png");
        const rejectedImage = join(
            diagnosticRoot,
            "rejected-case-ci-spissatus-day.png",
        );
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakeNode = join(binaryRoot, "node");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakeNode, `#!/bin/sh
case "$*" in
  *qualify-cloud-preview-image.mjs*)
    printf '%s\\n' 'Cloud preview high-cloud image qualification: {"ready":false,"finite":true,"radialArtifact":true,"scaleSeparatedStructureReady":false,"metrics":{"fineRms":0.0040303862728781215,"broadBandRms":0.015879154263987408,"fineTextureFraction":0.0324462890625,"fineToBroadRatio":0.2538161797457123,"radialExplainedVariance":0.23993745138622438,"radialExplainedCoverage":0.1424560546875}}'
    exit 1
    ;;
esac
exec "$CLOUD_PREVIEW_REAL_NODE" "$@"
`);
        writeFileSync(fakePlaywright, `#!/bin/sh
operation=""
session=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--session" ]; then session="$argument"; fi
  case "$argument" in open|run-code|close) operation="$argument" ;; esac
  previous="$argument"
done
case "$operation" in
  open)
    printf '### Browser \`%s\` opened with pid %s.\\n' "$session" "$$"
    ;;
  run-code)
    case "$*" in
      *CLOUD_PREVIEW_ADAPTER_B64*)
        printf '%s\\n' 'CLOUD_PREVIEW_ADAPTER_B64:eyJ2ZW5kb3IiOiJBcHBsZSBJbmMuIiwiYXJjaGl0ZWN0dXJlIjoiIiwiaXNGYWxsYmFja0FkYXB0ZXIiOmZhbHNlfQ=='
        ;;
      *)
        cp "$CLOUD_PREVIEW_TEST_FIXTURE" "$CLOUD_PREVIEW_TEST_OUTPUT_IMAGE"
        ;;
    esac
    ;;
esac
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakeNode, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./capture-cloud-preview.sh", import.meta.url).pathname,
            "case",
            "ci-spissatus-day",
            outputImage,
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_PREVIEW_REAL_NODE: process.execPath,
                CLOUD_PREVIEW_TEST_FIXTURE: join(
                    repositoryRoot,
                    "scripts/fixtures/rejected-ci-spissatus-canary.png",
                ),
                CLOUD_PREVIEW_TEST_OUTPUT_IMAGE: outputImage,
                CLOUD_PREVIEW_URL: "http://synthetic.invalid",
                CLOUD_PREVIEW_CAPTURE_MODE: "headless",
                CLOUD_PREVIEW_DIAGNOSTIC_ROOT: diagnosticRoot,
            },
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr,
            /Cloud preview capture failed at stage=high-cloud-image-qualification:/);
        assert.match(result.stderr,
            /Cloud preview high-cloud image qualification: \{"ready":false/);
        assert.match(result.stderr, /"fineRms":0\.0040303862728781215/);
        assert.doesNotMatch(result.stderr,
            /Cloud preview readiness: unavailable before benchmark diagnostics attached/);
        assert.equal(existsSync(outputImage), false,
            "a rejected qualifier frame is removed from the requested output path");
        assert.equal(existsSync(rejectedImage), true,
            "the rejected frame remains beside bounded diagnostics");
        const diagnostics = readFileSync(join(
            diagnosticRoot,
            "case-ci-spissatus-day.failure.log",
        ), "utf8");
        assert.match(diagnostics, /stage=high-cloud-image-qualification/);
        assert.match(diagnostics,
            /Cloud preview high-cloud image qualification: \{"ready":false/);
        assert.ok(statSync(join(
            diagnosticRoot,
            "case-ci-spissatus-day.failure.log",
        )).size < 132_000);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("capture timeout with no page transcript preserves preflight evidence", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-preview-timeout-"));
    try {
        const binaryRoot = join(temporaryRoot, "bin");
        const diagnosticRoot = join(temporaryRoot, "diagnostics");
        const outputImage = join(temporaryRoot, "frame.png");
        mkdirSync(binaryRoot);
        const fakeCurl = join(binaryRoot, "curl");
        const fakePlaywright = join(binaryRoot, "playwright-cli");
        writeFileSync(fakeCurl, "#!/bin/sh\nexit 0\n");
        writeFileSync(fakePlaywright, `#!/bin/sh
session=""
operation=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--session" ]; then session="$argument"; fi
  case "$argument" in open|run-code|close) operation="$argument" ;; esac
  previous="$argument"
done
case "$operation" in
  open)
    printf '### Browser \`%s\` opened with pid %s.\\n' "$session" "$$"
    ;;
  run-code)
    case "$*" in
      *CLOUD_PREVIEW_ADAPTER_B64*)
        printf '%s\\n' 'CLOUD_PREVIEW_ADAPTER_B64:eyJ2ZW5kb3IiOiJBcHBsZSIsImFyY2hpdGVjdHVyZSI6InJlZGFjdGVkIiwiaXNGYWxsYmFja0FkYXB0ZXIiOmZhbHNlfQ=='
        ;;
      *) exit 143 ;;
    esac
    ;;
esac
exit 0
`);
        chmodSync(fakeCurl, 0o755);
        chmodSync(fakePlaywright, 0o755);
        const result = spawnSync("bash", [
            new URL("./capture-cloud-preview.sh", import.meta.url).pathname,
            "case",
            "timeout/case",
            outputImage,
        ], {
            encoding: "utf8",
            env: {
                ...process.env,
                PATH: `${binaryRoot}:${process.env.PATH ?? ""}`,
                PWCLI: fakePlaywright,
                CLOUD_PREVIEW_URL: "http://synthetic.invalid",
                CLOUD_PREVIEW_CAPTURE_MODE: "native-metal",
                CLOUD_PREVIEW_DIAGNOSTIC_ROOT: diagnosticRoot,
                CLOUD_PREVIEW_PAGE_TIMEOUT_MS: "2000",
            },
        });
        assert.equal(result.status, 1, result.stderr);
        const diagnostics = readFileSync(join(diagnosticRoot,
            "case-timeout-case.failure.log"), "utf8");
        assert.match(diagnostics,
            /lifecycle_stage=adapter-preflight-complete backend=native-apple-metal/);
        assert.match(diagnostics, /adapter=.*"architecture":"redacted"/);
        assert.match(diagnostics, /lifecycle_stage=capture-navigation-start/);
        assert.match(diagnostics, /stage=run-code/);
        assert.match(diagnostics, /cli_exit_status=143/);
        assert.match(diagnostics, /transcript_bytes=0/);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
});

test("watcher coalesces edits behind exactly one active generator", () => {
    assert.match(watcherSource, /if \(child\) \{[\s\S]*terminateChild\(\)/);
    assert.match(watcherSource, /if \(child === target\) killChild\(target, "SIGKILL"\)/);
    assert.match(watcherSource, /clearChildKill\(\)/,
        "a closed child must cancel delayed SIGKILL before pid reuse");
    assert.match(watcherSource, /revision === childRevision && !childStale/);
    assert.match(watcherSource, /cloudPreviewWatchContentHash\(repositoryRoot\)/);
    assert.equal(CLOUD_PREVIEW_WATCH_RECONCILE_MS, 5_000);
    assert.match(watcherSource, /Reconciled renderer input change missed/);
    assert.match(watcherSource,
        /revision === observedInputRevision[\s\S]*coordinator\.schedule\(\)/,
        "a dropped recursive fs event is recovered by exact content polling");
    assert.equal(typeof cloudPreviewWatchContentHash, "function");
    assert.match(generatorSource, /Renderer sources changed during capture/);
    assert.match(watcherSource, /managedGeneratorPath/);
    assert.match(watcherSource, /--external-server/);
    assert.match(watcherSource,
        /WATCHER_CHILD_SHUTDOWN_GRACE_MS = 25_000/,
        "the watcher must outlive capture and managed-server cleanup windows");
    assert.equal(packageSource.scripts["cloud:previews:watch"],
        "node scripts/watch-cloud-previews.mjs");
    assert.match(packageSource.scripts["cloud:previews:watch:external"],
        /--external-server/);
    assert.equal(packageSource.scripts["cloud:previews:watch:start"],
        "node scripts/manage-cloud-preview-watch.mjs start");
    assert.equal(packageSource.scripts["cloud:previews:watch:status"],
        "node scripts/manage-cloud-preview-watch.mjs status");
    assert.equal(packageSource.scripts["cloud:previews:watch:stop"],
        "node scripts/manage-cloud-preview-watch.mjs stop");
    assert.match(watcherSource, /\.watcher\.lock/,
        "foreground and detached coordinators share one singleton lock");
    assert.ok(WATCH_PATHS.includes("scripts/config/cloud-preview-native-playwright.json"));
    assert.ok(WATCH_PATHS.includes("next.config.ts"));
    for (const rendererInput of CLOUD_PREVIEW_RENDERER_INPUTS) {
        assert.ok(WATCH_PATHS.some((watchedPath) =>
            rendererInput === watchedPath ||
            rendererInput.startsWith(`${watchedPath}/`)),
        `renderer hash input must be watched: ${rendererInput}`);
    }
    assert.equal(WATCH_PATHS.includes("app/cloud-preview-matrix"), false,
        "filter and viewer-only edits cannot schedule the 276-image renderer");
    assert.equal(WATCH_PATHS.includes("app/api/cloud-previews"), false,
        "static file-serving route edits cannot schedule GPU capture");
    assert.ok(WATCH_PATHS.includes(
        "app/cloud-preview-matrix/cloud-preview-catalog.ts"),
    "the scenario-defining catalogue remains an exact watched input");
    for (const generatedOutput of [
        "public/generated/cloud-previews",
        "output/playwright/cloud-previews",
        ".next-cloud-preview-production",
    ]) {
        assert.ok(WATCH_PATHS.every((watchedPath) =>
            !generatedOutput.startsWith(`${watchedPath}/`) &&
            !watchedPath.startsWith(`${generatedOutput}/`) &&
            watchedPath !== generatedOutput),
        `the watcher must not observe its own output: ${generatedOutput}`);
    }
    const safeDefaults = parseWatcherArguments(["--no-initial"]);
    assert.equal(safeDefaults.initial, false);
    assert.equal(safeDefaults.debounceMs, CLOUD_PREVIEW_WATCH_DEBOUNCE_MS);
    assert.equal(safeDefaults.priority, CLOUD_PREVIEW_WATCH_PRIORITY);
    assert.equal(safeDefaults.retryBaseMs, CLOUD_PREVIEW_WATCH_RETRY_BASE_MS);
    assert.equal(safeDefaults.retryMaxMs, CLOUD_PREVIEW_WATCH_RETRY_MAX_MS);
    assert.deepEqual(safeDefaults.generatorArgs, [
        "--cooldown-ms",
        String(CLOUD_PREVIEW_WATCH_COOLDOWN_MS),
    ]);
    assert.deepEqual(
        parseWatcherArguments(["--cooldown-ms=9000"]).generatorArgs,
        ["--cooldown-ms=9000"],
        "an explicit generator cooldown overrides the thermal-safe default",
    );
    assert.equal(parseWatcherArguments(["--priority", "14"]).priority, 14);
    assert.throws(() => parseWatcherArguments(["--priority", "-1"]),
        /0 to 19/);
    let appliedPriority;
    assert.equal(applyCloudPreviewWatchPriority(10, (priority) => {
        appliedPriority = priority;
    }, (() => {
        let readCount = 0;
        return () => readCount++ === 0 ? 0 : 10;
    })()), 10);
    assert.equal(appliedPriority, 10,
        "the watcher lowers itself before spawning its inherited process tree");
    let raisedAlreadyLowPriority = false;
    assert.equal(applyCloudPreviewWatchPriority(10, () => {
        raisedAlreadyLowPriority = true;
    }, () => 14), 14,
        "an already lower-priority process preserves its effective niceness");
    assert.equal(raisedAlreadyLowPriority, false,
        "an already nicer process is never raised toward the configured floor");
    assert.throws(
        () => applyCloudPreviewWatchPriority(10, () => {}, () => 0),
        /required at least 10/,
        "generation fails closed when the OS does not apply low priority",
    );
    const customRetry = parseWatcherArguments([
        "--retry-minutes", "20",
        "--retry-max-minutes=120",
    ]);
    assert.equal(customRetry.retryBaseMs, 20 * 60_000);
    assert.equal(customRetry.retryMaxMs, 120 * 60_000);
    assert.throws(() => parseWatcherArguments(["--retry-minutes", "1.5"]),
        /whole number of minutes/);
    assert.throws(() => parseWatcherArguments([
        "--retry-minutes", "20", "--retry-max-minutes", "10",
    ]), /cannot be less/);
    const serviceOptions = parseWatcherArguments([
        "--service-state",
        new URL("../output/playwright/cloud-previews/watch-service.json",
            import.meta.url).pathname,
        "--service-token", "a".repeat(32),
    ]);
    assert.equal(serviceOptions.serviceToken, "a".repeat(32));
    assert.deepEqual(serviceOptions.generatorArgs, [
        "--cooldown-ms", String(CLOUD_PREVIEW_WATCH_COOLDOWN_MS),
    ], "service ownership arguments never leak into the generator command");
    assert.throws(() => parseWatcherArguments([
        "--service-state", serviceOptions.serviceStatePath,
    ]), /provided together/);
    assert.throws(() => parseWatcherArguments([
        "--service-state", serviceOptions.serviceStatePath,
        "--service-token", "c".repeat(32),
        "--limit", "1",
    ]), /full 276-case oblique-natural matrix/);
    for (const nonGeneratingArgument of ["--list", "--help", "-h"]) {
        assert.throws(() => parseWatcherArguments([
            "--service-state", serviceOptions.serviceStatePath,
            "--service-token", "c".repeat(32),
            nonGeneratingArgument,
        ]), /full 276-case oblique-natural matrix/);
    }
    assert.throws(() => parseWatcherArguments([
        "--service-state", serviceOptions.serviceStatePath,
        "--service-token", "c".repeat(32),
        "--no-initial",
    ]), /full 276-case oblique-natural matrix/);
});

test("detached watcher management is token-qualified and bounded", () => {
    const state = {
        schemaVersion: 1,
        pid: 81234,
        token: "b".repeat(32),
    };
    const exactCommand = [
        "node",
        "/repo/scripts/watch-cloud-previews.mjs",
        "--service-state",
        new URL("../output/playwright/cloud-previews/watch-service.json",
            import.meta.url).pathname,
        "--service-token",
        state.token,
    ].join(" ");
    const fakePs = (_command, _arguments, _options) => ({
        status: 0,
        stdout: `${state.pid} ${exactCommand}\n`,
    });
    assert.deepEqual(inspectWatchServiceIdentity(state, fakePs, () => true), {
        active: true,
        exact: true,
        reason: "owned-service",
        pgid: state.pid,
        command: exactCommand,
    });
    const reusedPidPs = () => ({
        status: 0,
        stdout: `${state.pid} node unrelated.mjs --service-token ${state.token}\n`,
    });
    assert.equal(
        inspectWatchServiceIdentity(state, reusedPidPs, () => true).exact,
        false,
        "a live reused pid cannot be signaled without the full service identity",
    );
    assert.match(serviceManagerSource, /detached: true/);
    assert.match(serviceManagerSource, /child\.unref\(\)/);
    assert.match(serviceManagerSource, /startedState\?\.priority \?\? "unknown"/,
        "detached startup reports the effective priority published by the service");
    assert.match(serviceManagerSource, /process\.kill\(-state\.pid, "SIGTERM"\)/);
    assert.match(serviceManagerSource,
        /inspectWatchServiceIdentity\(state\)\.exact[\s\S]*SIGKILL/,
        "hard-kill escalation requalifies the exact watcher identity");
    assert.match(serviceManagerSource, /inspectManagedGeneratorIdentity/,
        "forced watcher teardown also owns its separately detached generator");
    assert.match(serviceManagerSource,
        /Cloud preview generation is already active in pid/,
        "service startup cannot overlap an existing one-shot or orphaned generator");
    assert.match(serviceManagerSource, /STOP_GRACE_MS = 35_000/);
    assert.match(serviceManagerSource, /CHILD_STOP_GRACE_MS = 10_000/);
    assert.match(CLOUD_PREVIEW_WATCH_SERVICE_LOG_PATH,
        /output\/playwright\/cloud-previews\/watch-service\.log$/);
});

test("watch coordinator debounces, terminates stale work, and restarts single-flight", () => {
    const timers = [];
    const children = [];
    let revision = "revision-a";
    const launchedRevisions = [];
    const spawnGeneration = (launchedRevision) => {
        const child = new EventEmitter();
        child.pid = 8000 + children.length;
        child.killSignals = [];
        child.kill = (signal) => child.killSignals.push(signal);
        children.push(child);
        launchedRevisions.push(launchedRevision);
        return child;
    };
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: 250,
        getRevision: () => revision,
        spawnGeneration,
        log: () => {},
        logError: () => {},
        onStopped: () => {},
        setTimer: (callback) => {
            const timer = { callback, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { timer.cleared = true; },
        killChild: (child, signal) => child.killSignals.push(signal),
    });
    const flushLatest = () => {
        const timer = timers.findLast((candidate) => !candidate.cleared);
        assert.ok(timer, "a pending debounce or shutdown timer is expected");
        timer.cleared = true;
        timer.callback();
    };

    coordinator.schedule();
    coordinator.schedule();
    assert.equal(timers.filter(({ cleared }) => !cleared).length, 1,
        "rapid edits coalesce behind one debounce timer");
    flushLatest();
    assert.equal(children.length, 1);
    assert.deepEqual(launchedRevisions, ["revision-a"]);
    assert.equal(coordinator.state().active, true);

    coordinator.schedule();
    coordinator.schedule();
    flushLatest();
    assert.deepEqual(children[0].killSignals, [],
        "noisy fs.watch events with identical bytes preserve the active capture");
    assert.equal(children.length, 1);
    assert.equal(coordinator.state().dirty, false);

    revision = "revision-b";
    coordinator.schedule();
    flushLatest();
    assert.deepEqual(children[0].killSignals, ["SIGTERM"],
        "a matured renderer edit stops the stale serial run");
    assert.equal(children.length, 1, "replacement never overlaps stale work");
    children[0].emit("close", 143, null);
    assert.equal(children.length, 2,
        "a fully debounced edit restarts immediately after exact child close");
    assert.deepEqual(launchedRevisions, ["revision-a", "revision-b"]);
    assert.equal(coordinator.state().dirty, false);

    children[1].emit("close", 0, null);
    coordinator.schedule();
    flushLatest();
    assert.equal(children.length, 2,
        "an idle watcher does not retry a finished unchanged revision");
});

test("watch coordinator qualifies a newer revision before stale teardown relaunch", () => {
    const timers = [];
    const children = [];
    const launchedRevisions = [];
    let revision = "revision-a";
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: 250,
        getRevision: () => revision,
        spawnGeneration: (value) => {
            const child = new EventEmitter();
            child.pid = 9000 + children.length;
            child.killSignals = [];
            children.push(child);
            launchedRevisions.push(value);
            return child;
        },
        log: () => {},
        logError: () => {},
        onStopped: () => {},
        setTimer: (callback) => {
            const timer = { callback, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { timer.cleared = true; },
        killChild: (child, signal) => child.killSignals.push(signal),
    });
    const flushLatest = () => {
        const timer = timers.findLast((candidate) => !candidate.cleared);
        assert.ok(timer);
        timer.cleared = true;
        timer.callback();
    };

    coordinator.schedule();
    flushLatest();
    revision = "revision-b";
    coordinator.schedule();
    flushLatest();
    assert.deepEqual(children[0].killSignals, ["SIGTERM"]);

    revision = "revision-a";
    coordinator.schedule();
    children[0].emit("close", 143, null);
    assert.equal(children.length, 1,
        "an unqualified event blocks launch of the now-obsolete pending revision");
    flushLatest();
    assert.deepEqual(launchedRevisions, ["revision-a", "revision-a"],
        "a reverted revision is relaunched because the first run was terminated stale");
    assert.equal(children.length, 2);
});

test("failed revisions resume pending cases with capped exponential backoff", () => {
    const timers = [];
    const children = [];
    let revision = "revision-a";
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: 250,
        retryBaseMs: 600_000,
        retryMaxMs: 1_200_000,
        getRevision: () => revision,
        spawnGeneration: () => {
            const child = new EventEmitter();
            child.pid = 9500 + children.length;
            children.push(child);
            return child;
        },
        log: () => {},
        logError: () => {},
        onStopped: () => {},
        setTimer: (callback, delay) => {
            const timer = { callback, delay, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { timer.cleared = true; },
        killChild: () => {},
    });
    const fire = (delay) => {
        const timer = timers.find((candidate) =>
            !candidate.cleared && candidate.delay === delay);
        assert.ok(timer, `expected active ${delay}ms timer`);
        timer.cleared = true;
        timer.callback();
    };

    coordinator.schedule();
    fire(250);
    assert.equal(children.length, 1);
    children[0].emit("close", 1, null);
    assert.deepEqual(coordinator.state(), {
        active: false,
        activeRevision: undefined,
        dirty: true,
        pendingRevision: undefined,
        retryAttempt: 1,
        retryScheduled: true,
        retryRevision: "revision-a",
        stopping: false,
    });

    coordinator.schedule();
    fire(250);
    assert.equal(children.length, 1,
        "content-identical fs noise cannot collapse the long retry delay");
    fire(600_000);
    assert.equal(children.length, 2,
        "the unchanged failed revision resumes after its first backoff");
    children[1].emit("close", 1, null);
    assert.equal(coordinator.state().retryAttempt, 2);
    fire(1_200_000);
    assert.equal(children.length, 3);
    children[2].emit("close", 1, null);
    assert.equal(coordinator.state().retryAttempt, 3);
    fire(1_200_000);
    assert.equal(children.length, 4,
        "repeated deterministic failures remain capped at the maximum delay");
    children[3].emit("close", 0, null);
    assert.equal(coordinator.state().retryScheduled, false);
    assert.equal(coordinator.state().retryAttempt, 0);

    coordinator.schedule();
    fire(250);
    assert.equal(children.length, 4,
        "a successful current revision is not relaunched by metadata churn");
    assert.equal(revision, "revision-a");
});

test("a material renderer edit supersedes a failed-revision retry delay", () => {
    const timers = [];
    const children = [];
    let revision = "revision-a";
    const coordinator = createCloudPreviewWatchCoordinator({
        debounceMs: 250,
        retryBaseMs: 600_000,
        retryMaxMs: 3_600_000,
        getRevision: () => revision,
        spawnGeneration: (launchedRevision) => {
            const child = new EventEmitter();
            child.pid = 9700 + children.length;
            child.revision = launchedRevision;
            children.push(child);
            return child;
        },
        log: () => {},
        logError: () => {},
        onStopped: () => {},
        setTimer: (callback, delay) => {
            const timer = { callback, delay, cleared: false, unref() {} };
            timers.push(timer);
            return timer;
        },
        clearTimer: (timer) => { timer.cleared = true; },
        killChild: () => {},
    });
    const fire = (delay) => {
        const timer = timers.findLast((candidate) =>
            !candidate.cleared && candidate.delay === delay);
        assert.ok(timer);
        timer.cleared = true;
        timer.callback();
    };

    coordinator.schedule();
    fire(250);
    children[0].emit("close", 1, null);
    const oldRetry = timers.find((timer) =>
        !timer.cleared && timer.delay === 600_000);
    assert.ok(oldRetry);

    revision = "revision-b";
    coordinator.schedule();
    fire(250);
    assert.equal(oldRetry.cleared, true);
    assert.equal(children.length, 2);
    assert.equal(children[1].revision, "revision-b");
    assert.equal(coordinator.state().retryAttempt, 0);
});

test("managed production orchestration binds build, health, and capture revisions", () => {
    assert.match(managedSource, /ELEMENTS_NEXT_DIST_DIR: previewDistName/);
    assert.match(managedSource, /nextPath, "build", "--turbopack"/);
    assert.match(managedSource, /nextPath, "start"/);
    assert.match(managedSource, /cloud-photographs/);
    assert.match(managedSource, /assertRendererRevision\(expectedHash,[\s\S]*production build/);
    assert.match(managedSource, /assertRendererRevision\(expectedHash,[\s\S]*serial capture/);
    assert.match(managedSource, /await stopManagedProcess\(server\)/);
    assert.match(managedSource, /process\.once\("SIGHUP", handleHangup\)/);
    assert.match(managedSource, /process\.once\("exit", handleProcessExit\)/);
    assert.match(managedSource, /rmSync\(previewDistPath, \{ recursive: true, force: true \}\)/);
    assert.equal(parseManagedArguments([]).generatorArgs.length, 0);
    assert.deepEqual(
        parseManagedArguments(["--server-port", "4321", "--force"]).generatorArgs,
        ["--force"],
    );
    assert.throws(() => parseManagedArguments(["--server-port", "0"]),
        /1 to 65535/);
});

test("managed server health and exact process-group teardown smoke", async () => {
    const port = await reserveLoopbackPort();
    const child = spawnManagedProcess({
        command: process.execPath,
        args: ["-e", [
            "const http = require('node:http')",
            `const server = http.createServer((request, response) => {`,
            "response.statusCode = request.url === '/cloud-photographs' ? 200 : 404",
            "response.end('ok')",
            "})",
            `server.listen(${port}, '127.0.0.1')`,
            "process.on('SIGTERM', () => server.close(() => process.exit(0)))",
        ].join(";")],
        cwd: repositoryRoot,
        env: process.env,
    });
    child.stdout.resume();
    child.stderr.resume();
    const pid = child.pid;
    await waitForManagedServer({
        child,
        url: `http://127.0.0.1:${port}/cloud-photographs`,
        timeoutMs: 5_000,
    });
    await stopManagedProcess(child, { graceMs: 2_000 });
    assert.notEqual(pid, undefined);
    assert.throws(() => process.kill(pid, 0));
});

test("CLI exposes resumable, forced-full, and strict completed-render controls", () => {
    assert.equal(parseArguments([]).transportUpdates, 64);
    assert.equal(parseArguments([]).captureMode, "native-metal");
    assert.equal(parseArguments([]).timeoutMs, 180_000,
        "one failed scene must not hold the serial renderer for a quarter hour");
    assert.equal(parseArguments(["--capture-mode", "headless"]).captureMode,
        "headless");
    assert.match(generatorSource, /existing\.captureMode === options\.captureMode/);
    assert.match(generatorSource, /CLOUD_PREVIEW_CAPTURE_MODE: options\.captureMode/);
    assert.match(generatorSource, /captureMode: options\.captureMode/);
    const completedImagePublication = generatorSource.indexOf(
        "renameSync(processedPath, finalPath)",
    );
    const guardedEntryPublication = generatorSource.indexOf(
        "publishPreviewEntry({", completedImagePublication,
    );
    assert.ok(completedImagePublication < guardedEntryPublication,
    "the complete PNG must publish before it can enter the manifest");
    assert.match(generatorSource, /beforeCommit: \(\) =>/,
        "the renderer revision must be checked at the atomic publication boundary");
    assert.match(generatorSource, /publishPreviewEntry\(\{/,
        "new entries must use staged guarded publication");
    assert.doesNotMatch(generatorSource,
        /rmSync\(captureSessionStatePath, \{ force: true \}\);\s*process\.removeListener/,
        "failed exact browser cleanup must retain its ownership state");
    assert.match(captureSessionSource,
        /cleanup_status[\s\S]*retaining exact session state[\s\S]*return "\$cleanup_status"/,
        "the session manager must remove ownership evidence only after exact cleanup");
    assert.match(captureSource,
        /CLOUD_PREVIEW_PAGE_TIMEOUT_MS:-150000/,
        "direct captures need the same bounded page-readiness policy");
    assert.match(captureSource,
        /rejected-\$\{capture_parameter\}-\$\{capture_safe_case\}\.png/,
        "a fully rendered rejected canary remains inspectable outside publication");
    assert.equal(parseArguments(["--force"]).force, true);
    assert.equal(parseArguments(["--only", "one,two"]).only.length, 2);
    assert.throws(() => parseArguments(["--transport-updates", "8"]),
        /at least 64/);
    assert.throws(() => parseArguments(["--capture-mode", "swiftshader"]),
        /native-metal or headless/);
    assert.throws(() => parseArguments([
        "--production-perspective", "flat-editorial",
    ]), /fixed to the oblique-natural production perspective/);
});

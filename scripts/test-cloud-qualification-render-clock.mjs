import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const sourceUrl = new URL(
    "../components/backgrounds/sky/cloud-qualification-clock.ts",
    import.meta.url,
);
const adapterPolicy = await import(new URL(
    "../components/backgrounds/sky/cloud-transport-adapter-policy.mjs",
    import.meta.url,
));
assert.equal(existsSync(sourceUrl), true);
const javascript = ts.transpileModule(readFileSync(sourceUrl, "utf8"), {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
    },
    fileName: sourceUrl.pathname,
}).outputText;
const moduleObject = { exports: {} };
new Function("exports", "module", "require", javascript)(
    moduleObject.exports,
    moduleObject,
    (specifier) => {
        if (specifier === "./cloud-transport-adapter-policy.mjs") {
            return adapterPolicy;
        }
        throw new Error(`Unexpected transpiled dependency: ${specifier}`);
    },
);
const qualificationClock = moduleObject.exports;

test("paused qualification clock remains on the requested weather snapshot", () => {
    const input = {
        paused: true,
        requestedSnapshotSeconds: 7123.5,
        initialSnapshotSeconds: 7000,
        offsetSeconds: 41,
    };
    assert.equal(qualificationClock.resolveCloudRenderClock({
        ...input,
        elapsedSeconds: 0,
    }), 7164.5);
    assert.equal(qualificationClock.resolveCloudRenderClock({
        ...input,
        elapsedSeconds: 90,
    }), 7164.5);
});

test("production clock advances from its initial snapshot", () => {
    assert.equal(qualificationClock.resolveCloudRenderClock({
        paused: false,
        requestedSnapshotSeconds: 9999,
        initialSnapshotSeconds: 7000,
        elapsedSeconds: 90,
        offsetSeconds: 41,
    }), 7131);
});

test("paused qualification schedules the complete 64-sample history horizon", () => {
    const base = {
        hidden: false,
        paused: true,
        lightVolumeWarming: false,
        lightVolumeState: "complete",
    };
    assert.equal(qualificationClock.CLOUD_QUALIFICATION_HISTORY_SAMPLES, 64);
    assert.equal(qualificationClock.CLOUD_QUALIFICATION_TRANSPORT_UPDATES, 64);
    for (let updates = 0; updates < 64; updates += 1) {
        assert.equal(qualificationClock.shouldScheduleCloudRender({
            ...base,
            transportUpdates: updates,
        }), true, `update ${updates + 1} must remain scheduled`);
    }
    assert.equal(qualificationClock.shouldScheduleCloudRender({
        ...base,
        transportUpdates: 64,
    }), false);
});

test("strict transport tiles cover the production target once under a hard draw ceiling", () => {
    const width = 923;
    const height = 519;
    const ceiling = qualificationClock.CLOUD_STRICT_TRANSPORT_PIXELS_PER_DRAW;
    assert.equal(ceiling,
        qualificationClock.CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION);
    const tiles = qualificationClock.createCloudTransportRasterTiles(
        width, height,
    );
    assert.ok(tiles.length > 1);
    const coverage = new Uint8Array(width * height);
    for (const tile of tiles) {
        assert.ok(tile.width > 0 && tile.height > 0);
        assert.ok(tile.width * tile.height <= ceiling);
        assert.ok(tile.x >= 0 && tile.x + tile.width <= width);
        assert.ok(tile.y >= 0 && tile.y + tile.height <= height);
        for (let y = tile.y; y < tile.y + tile.height; y += 1) {
            for (let x = tile.x; x < tile.x + tile.width; x += 1) {
                coverage[y * width + x] += 1;
            }
        }
    }
    assert.equal(coverage.every((count) => count === 1), true);
});

test("strict transport tiling handles narrow and malformed target extents", () => {
    assert.deepEqual(
        qualificationClock.createCloudTransportRasterTiles(2, 2, 1, 256),
        [
            { x: 0, y: 0, width: 1, height: 1 },
            { x: 1, y: 0, width: 1, height: 1 },
            { x: 0, y: 1, width: 1, height: 1 },
            { x: 1, y: 1, width: 1, height: 1 },
        ],
    );
    assert.deepEqual(
        qualificationClock.createCloudTransportRasterTiles(0, Number.NaN, 0, 0),
        [{ x: 0, y: 0, width: 1, height: 1 }],
    );
});

test("strict transport batches bound total packet pixels and commit only once", () => {
    const width = 521;
    const height = 277;
    const ceiling =
        qualificationClock.CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION;
    const packetCount = qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT;
    const tiles = qualificationClock.createCloudTransportRasterTiles(
        width, height, 777, 37,
    );
    let cursor = { packetIndex: 0, tileIndex: 0 };
    const packetCoverage = Array.from(
        { length: packetCount }, () => new Uint8Array(width * height));
    let commits = 0;
    let batches = 0;
    while (true) {
        const batch = qualificationClock.createCloudTransportRasterBatch(
            cursor, tiles, ceiling, packetCount,
        );
        batches += 1;
        assert.ok(batch.shadedPixels > 0 && batch.shadedPixels <= ceiling);
        assert.equal(batch.clearPacket, cursor.tileIndex === 0);
        for (const tile of batch.tiles) {
            for (let y = tile.y; y < tile.y + tile.height; y += 1) {
                for (let x = tile.x; x < tile.x + tile.width; x += 1) {
                    packetCoverage[batch.packetIndex][y * width + x] += 1;
                }
            }
        }
        if (batch.terminalCommit) {
            commits += 1;
            assert.equal(batch.nextCursor, null);
            break;
        }
        assert.ok(batch.nextCursor);
        cursor = batch.nextCursor;
    }
    assert.ok(batches > packetCount);
    assert.equal(commits, 1);
    for (const coverage of packetCoverage) {
        assert.equal(coverage.every((count) => count === 1), true);
    }
});

test("strict backend selection qualifies only non-fallback Apple Metal", () => {
    const resolve = qualificationClock.resolveCloudStrictTransportBackend;
    for (const adapterInfo of [
        {
            vendor: "apple",
            architecture: "metal-3",
            isFallbackAdapter: false,
        },
        { vendor: " Apple Inc. ", architecture: "Metal 3" },
        { vendor: "Apple", architecture: "" },
        { vendor: "Apple", architecture: "redacted" },
        { vendor: "Apple", architecture: "unknown" },
        { vendor: "0x106b", architecture: "masked" },
        {
            vendor: "",
            architecture: "Metal",
            description: "ANGLE Metal Renderer: Apple M3 Max",
        },
        {
            vendor: "unknown",
            architecture: "",
            device: "Apple M2",
        },
    ]) assert.equal(resolve(adapterInfo), "native-apple-metal");
    for (const adapterInfo of [
        undefined,
        {},
        { vendor: "google", architecture: "swiftshader" },
        { vendor: "apple", architecture: "metal-3", isFallbackAdapter: true },
        { vendor: "apple", architecture: "vulkan" },
        { vendor: "apple", architecture: "swiftshader" },
        { vendor: "apple", architecture: "", description: "software renderer" },
        { vendor: "0x106b", architecture: "", device: "llvmpipe" },
        { vendor: "unknown", architecture: "metal-3" },
    ]) assert.equal(resolve(adapterInfo), "software-bounded");
});

test("native Metal scheduling changes submissions without changing packet pixels", () => {
    const width = 257;
    const height = 97;
    const software = qualificationClock.createCloudTransportRasterSchedule(
        width, height, { vendor: "google", architecture: "swiftshader" });
    const native = qualificationClock.createCloudTransportRasterSchedule(
        width, height, {
            vendor: "apple",
            architecture: "metal-3",
            isFallbackAdapter: false,
        });
    assert.equal(software.backend, "software-bounded");
    assert.equal(
        software.maximumPixelsPerSubmission,
        qualificationClock.CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
    );
    assert.equal(software.maximumPacketBatchesPerSubmission, 1,
        "software keeps one bounded packet batch behind each queue fence");
    assert.equal(native.backend, "native-apple-metal");
    assert.ok(native.tiles.length > 1);
    assert.equal(
        native.maximumPixelsPerDraw,
        qualificationClock
            .CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
    );
    assert.equal(
        native.maximumPixelsPerSubmission,
        qualificationClock
            .CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
    );
    assert.equal(native.maximumPacketBatchesPerSubmission, 1);
    for (const tile of native.tiles) {
        assert.ok(
            tile.width * tile.height <=
                qualificationClock
                    .CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
        );
    }

    const trace = (schedule) => {
        const pixels = [];
        let cursor = { packetIndex: 0, tileIndex: 0 };
        let submissions = 0;
        let commits = 0;
        while (true) {
            const submission =
                qualificationClock.createCloudTransportRasterSubmission(
                    cursor,
                    schedule.tiles,
                    schedule.maximumPixelsPerSubmission,
                    qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
                    schedule.maximumPacketBatchesPerSubmission,
                );
            submissions += 1;
            for (const batch of submission.batches) {
                for (const tile of batch.tiles) {
                    for (let y = tile.y; y < tile.y + tile.height; y += 1) {
                        for (let x = tile.x; x < tile.x + tile.width; x += 1) {
                            pixels.push(batch.packetIndex * width * height +
                                y * width + x);
                        }
                    }
                }
            }
            if (submission.terminalCommit) {
                commits += 1;
                break;
            }
            cursor = submission.nextCursor;
        }
        return { pixels, submissions, commits };
    };
    const softwareTrace = trace(software);
    const nativeTrace = trace(native);
    assert.deepEqual(
        [...nativeTrace.pixels].sort((left, right) => left - right),
        [...softwareTrace.pixels].sort((left, right) => left - right),
        "both backends shade every packet pixel exactly once",
    );
    assert.equal(softwareTrace.commits, 1);
    assert.equal(nativeTrace.commits, 1);
    assert.ok(softwareTrace.submissions > nativeTrace.submissions);
    assert.ok(nativeTrace.submissions >
        qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT);
    assert.equal(nativeTrace.pixels.length,
        width * height * qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT);
});

test("native Metal bounds every production preview submission exactly", () => {
    const width = 800;
    const height = 500;
    const software = qualificationClock.createCloudTransportRasterSchedule(
        width, height, { vendor: "google", architecture: "swiftshader" });
    const native = qualificationClock.createCloudTransportRasterSchedule(
        width, height, { vendor: "apple", architecture: "metal-3" });
    assert.equal(software.tiles.length, 128);
    assert.ok(native.tiles.length > 1);
    let cursor = { packetIndex: 0, tileIndex: 0 };
    let shadedPixels = 0;
    let submissions = 0;
    while (true) {
        const submission =
            qualificationClock.createCloudTransportRasterSubmission(
                cursor,
                native.tiles,
                native.maximumPixelsPerSubmission,
                qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
                native.maximumPacketBatchesPerSubmission,
            );
        assert.equal(submission.batches.length, 1);
        assert.ok(
            submission.shadedPixels <=
                qualificationClock
                    .CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
        );
        shadedPixels += submission.shadedPixels;
        submissions += 1;
        if (submission.terminalCommit) break;
        cursor = submission.nextCursor;
    }
    assert.ok(submissions >
        qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT);
    assert.equal(shadedPixels,
        width * height * qualificationClock.CLOUD_STRICT_TRANSPORT_PACKET_COUNT);
});

test("strict transaction identity rejects every mixed-generation commit", () => {
    const identity = {
        sceneKey: "scene-a",
        directionalVisibilityKey: "visibility-a",
        lightGeneration: 7,
        width: 923,
        height: 519,
        transportOrdinal: 12,
    };
    assert.equal(
        qualificationClock.cloudTransportTransactionIdentityMatches(
            identity, { ...identity }),
        true,
    );
    for (const changed of [
        { sceneKey: "scene-b" },
        { directionalVisibilityKey: "visibility-b" },
        { lightGeneration: 8 },
        { width: 924 },
        { height: 520 },
        { transportOrdinal: 13 },
    ]) assert.equal(
        qualificationClock.cloudTransportTransactionIdentityMatches(
            identity, { ...identity, ...changed }),
        false,
    );
});

test("photographic readiness requires measured mature reconstruction history", () => {
    assert.equal(qualificationClock.isCloudReconstructionMature({
        historyAcceptanceFraction: 0.96,
        stableHistoryAge: 0.84,
        persistentHistoryConfidence: 0.92,
    }), true);
    for (const immature of [
        {
            historyAcceptanceFraction: 0.89,
            stableHistoryAge: 0.84,
            persistentHistoryConfidence: 0.92,
        },
        {
            historyAcceptanceFraction: 0.96,
            stableHistoryAge: 47 / 64,
            persistentHistoryConfidence: 0.92,
        },
        {
            historyAcceptanceFraction: 0.96,
            stableHistoryAge: 0.84,
            persistentHistoryConfidence: 0.84,
        },
        {
            historyAcceptanceFraction: null,
            stableHistoryAge: 1,
            persistentHistoryConfidence: 1,
        },
    ]) assert.equal(
        qualificationClock.isCloudReconstructionMature(immature),
        false,
    );
});

test("motion reprojection follows cloud simulation time rather than submission cadence", () => {
    assert.equal(qualificationClock.resolveCloudTransportDeltaSeconds({
        historyAvailable: true,
        previousCloudClock: 7164.5,
        currentCloudClock: 7164.5,
    }), 0, "paused stochastic samples share one immutable cloud epoch");
    assert.equal(qualificationClock.resolveCloudTransportDeltaSeconds({
        historyAvailable: true,
        previousCloudClock: 100,
        currentCloudClock: 100.25,
    }), 0.25);
    assert.equal(qualificationClock.resolveCloudTransportDeltaSeconds({
        historyAvailable: false,
        previousCloudClock: 100,
        currentCloudClock: 104,
    }), 0, "the first sample has no history to advect");
    assert.equal(qualificationClock.resolveCloudTransportDeltaSeconds({
        historyAvailable: true,
        previousCloudClock: 100,
        currentCloudClock: 120,
    }), 8, "long live-render gaps retain the existing bounded displacement");
});

test("cloud transport waits for both same-frame invalidation and refresh work", () => {
    assert.equal(qualificationClock.isCloudLightTransportEpochReady({
        refreshWorkPending: false,
        invalidationPending: false,
    }), true);
    assert.equal(qualificationClock.isCloudLightTransportEpochReady({
        refreshWorkPending: false,
        invalidationPending: true,
    }), false, "a newly discovered generation blocks stale-bank transport");
    assert.equal(qualificationClock.isCloudLightTransportEpochReady({
        refreshWorkPending: true,
        invalidationPending: false,
    }), false, "an active solve blocks transport until atomic publication");
});

test("live light epochs wait for one completed transport and coalesce gaps", () => {
    const base = {
        lightVolumeState: "complete",
        requestedEpoch: 12,
        activeEpoch: 8,
        boundGeneration: 4,
        transportedGeneration: 3,
    };
    assert.equal(qualificationClock.shouldInvalidateCloudLightForTime(base), false,
        "a newly published bank must illuminate one completed view first");
    assert.equal(qualificationClock.shouldInvalidateCloudLightForTime({
        ...base,
        transportedGeneration: 4,
    }), true, "the latest requested epoch becomes eligible after transport");
    assert.equal(qualificationClock.shouldInvalidateCloudLightForTime({
        ...base,
        transportedGeneration: 4,
        requestedEpoch: 8,
    }), false, "an already-current bank is not rebuilt");
    assert.equal(qualificationClock.shouldInvalidateCloudLightForTime({
        ...base,
        transportedGeneration: 4,
        lightVolumeState: "warming",
    }), false, "time alone never replaces in-flight exact work");
    assert.equal(qualificationClock.shouldInvalidateCloudLightForTime({
        ...base,
        transportedGeneration: 0,
        boundGeneration: 0,
        lightVolumeState: "empty",
    }), false, "an unpublished empty state has no bank to retire");
});

test("scheduler distinguishes production, warming, publication wait, and failure", () => {
    const base = {
        hidden: false,
        paused: true,
        lightVolumeWarming: false,
        lightVolumeState: "warming",
        transportUpdates: 0,
    };
    assert.equal(qualificationClock.shouldScheduleCloudRender({
        ...base,
        paused: false,
    }), true, "production remains dynamic");
    assert.equal(qualificationClock.shouldScheduleCloudRender({
        ...base,
        lightVolumeWarming: true,
    }), true, "paused capture advances an active light solve");
    assert.equal(qualificationClock.shouldScheduleCloudRender(base), false,
        "paused capture sleeps during the atomic publication fence");
    assert.equal(qualificationClock.shouldScheduleCloudRender({
        ...base,
        lightVolumeState: "failed",
    }), false, "failed qualification does not spin");
    assert.equal(qualificationClock.shouldScheduleCloudRender({
        ...base,
        hidden: true,
        lightVolumeWarming: true,
    }), false, "hidden documents stay idle");
});

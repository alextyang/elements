import { resolveCloudTransportAdapterBackend } from
    "./cloud-transport-adapter-policy.mjs";

/** The temporal metadata encodes consecutive accepted history over 64 samples. */
export const CLOUD_QUALIFICATION_HISTORY_SAMPLES = 64;

// A photographic capture must reach the reconstruction's complete encoded
// history horizon. A smaller transport count can leave a numerically valid but
// visibly under-resolved/ghosted image and must not qualify as review-ready.
export const CLOUD_QUALIFICATION_TRANSPORT_UPDATES =
    CLOUD_QUALIFICATION_HISTORY_SAMPLES;

/**
 * Software WebGPU implementations may execute a fragment draw synchronously
 * inside one worker.  A full production cloud target can contain hundreds of
 * thousands of pixels and each finite-owner pixel has a deliberately large,
 * fixed physical-integration ceiling.  Strict photographic qualification
 * therefore rasterizes the byte-identical fullscreen triangle through bounded
 * scissor tiles.  This changes command granularity only: every pixel is still
 * shaded exactly once at the selected production resolution and quality.
 */
export const CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION = 4096;
/**
 * Apple Metal is substantially faster than a software adapter, but a single
 * production cloud pixel can still execute the complete finite-owner marcher.
 * Keep native qualification submissions below the browser/GPU watchdog scale
 * without falling back to the much smaller software tile. Scissoring changes
 * command granularity only; the shader, resolution, sample sequence and every
 * destination pixel remain identical.
 */
export const CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION = 16384;
// The tile generator also keeps every individual draw under the submission
// ceiling. Retain this alias for callers that inspect draw geometry directly.
export const CLOUD_STRICT_TRANSPORT_PIXELS_PER_DRAW =
    CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION;
export const CLOUD_STRICT_TRANSPORT_TILE_WIDTH = 256;
export const CLOUD_STRICT_TRANSPORT_PACKET_COUNT = 5;

export interface CloudTransportAdapterInfo {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
    isFallbackAdapter?: boolean;
}

export type CloudStrictTransportBackend =
    | "software-bounded"
    | "native-apple-metal";

/**
 * Select command granularity from the shared capture/renderer policy. Chrome
 * may redact architecture or vary Apple vendor text; explicit fallback and
 * software evidence still fail closed to bounded tiles.
 */
export const resolveCloudStrictTransportBackend = (
    adapterInfo: CloudTransportAdapterInfo | null | undefined,
): CloudStrictTransportBackend =>
    resolveCloudTransportAdapterBackend(adapterInfo) as
        CloudStrictTransportBackend;

export interface CloudTransportRasterTile {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CloudTransportRasterSchedule {
    backend: CloudStrictTransportBackend;
    tiles: readonly CloudTransportRasterTile[];
    maximumPixelsPerDraw: number;
    maximumPixelsPerSubmission: number;
    maximumPacketBatchesPerSubmission: number;
}

export const createCloudTransportRasterTiles = (
    widthInput: number,
    heightInput: number,
    maximumPixelsPerDraw = CLOUD_STRICT_TRANSPORT_PIXELS_PER_DRAW,
    maximumTileWidth = CLOUD_STRICT_TRANSPORT_TILE_WIDTH,
): readonly CloudTransportRasterTile[] => {
    const positiveInteger = (value: number) => Number.isFinite(value)
        ? Math.max(1, Math.floor(value))
        : 1;
    const width = positiveInteger(widthInput);
    const height = positiveInteger(heightInput);
    const pixelCeiling = positiveInteger(maximumPixelsPerDraw);
    const tileWidth = Math.max(1, Math.min(
        width,
        positiveInteger(maximumTileWidth),
        pixelCeiling,
    ));
    const tileHeight = Math.max(1, Math.floor(pixelCeiling / tileWidth));
    const tiles: CloudTransportRasterTile[] = [];
    for (let y = 0; y < height; y += tileHeight) {
        for (let x = 0; x < width; x += tileWidth) {
            tiles.push({
                x,
                y,
                width: Math.min(tileWidth, width - x),
                height: Math.min(tileHeight, height - y),
            });
        }
    }
    return Object.freeze(tiles.map((tile) => Object.freeze(tile)));
};

/**
 * Select command granularity only. Both schedules execute the same packet
 * pipelines, uniforms, target resolution, and complete pixel domain. Native
 * Metal uses a larger bounded tile than software WebGPU, while both keep one
 * physical packet batch behind each queue fence. This prevents a complex
 * finite-owner packet from sharing one uninterruptible submission with the
 * other four media packets.
 */
export const createCloudTransportRasterSchedule = (
    widthInput: number,
    heightInput: number,
    adapterInfo: CloudTransportAdapterInfo | null | undefined,
): CloudTransportRasterSchedule => {
    const width = Number.isFinite(widthInput)
        ? Math.max(1, Math.floor(widthInput))
        : 1;
    const height = Number.isFinite(heightInput)
        ? Math.max(1, Math.floor(heightInput))
        : 1;
    const backend = resolveCloudStrictTransportBackend(adapterInfo);
    if (backend === "native-apple-metal") {
        const nativePixelCeiling =
            CLOUD_NATIVE_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION;
        return Object.freeze({
            backend,
            tiles: createCloudTransportRasterTiles(
                width, height, nativePixelCeiling),
            maximumPixelsPerDraw: nativePixelCeiling,
            maximumPixelsPerSubmission: nativePixelCeiling,
            maximumPacketBatchesPerSubmission: 1,
        });
    }
    return Object.freeze({
        backend,
        tiles: createCloudTransportRasterTiles(width, height),
        maximumPixelsPerDraw: CLOUD_STRICT_TRANSPORT_PIXELS_PER_DRAW,
        maximumPixelsPerSubmission:
            CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
        maximumPacketBatchesPerSubmission: 1,
    });
};

export interface CloudTransportBatchCursor {
    packetIndex: number;
    tileIndex: number;
}

export interface CloudTransportRasterBatch {
    packetIndex: number;
    tiles: readonly CloudTransportRasterTile[];
    clearPacket: boolean;
    shadedPixels: number;
    terminalCommit: boolean;
    nextCursor: CloudTransportBatchCursor | null;
}

export interface CloudTransportRasterSubmission {
    batches: readonly CloudTransportRasterBatch[];
    shadedPixels: number;
    terminalCommit: boolean;
    nextCursor: CloudTransportBatchCursor | null;
}

/**
 * Advance one paused transport transaction by one queue submission.  The
 * ceiling applies to the sum of shaded packet pixels in the submission, not
 * merely to each draw contained by it.
 */
export const createCloudTransportRasterBatch = (
    cursor: CloudTransportBatchCursor,
    tiles: readonly CloudTransportRasterTile[],
    maximumPixelsPerSubmission = CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
    packetCount = CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
): CloudTransportRasterBatch => {
    if (tiles.length === 0 || !Number.isInteger(cursor.packetIndex) ||
        !Number.isInteger(cursor.tileIndex) || cursor.packetIndex < 0 ||
        cursor.packetIndex >= packetCount || cursor.tileIndex < 0 ||
        cursor.tileIndex >= tiles.length) {
        throw new RangeError("Invalid cloud transport batch cursor");
    }
    const pixelCeiling = Number.isFinite(maximumPixelsPerSubmission)
        ? Math.max(1, Math.floor(maximumPixelsPerSubmission))
        : 1;
    const selected: CloudTransportRasterTile[] = [];
    let shadedPixels = 0;
    let tileIndex = cursor.tileIndex;
    while (tileIndex < tiles.length) {
        const tile = tiles[tileIndex];
        const tilePixels = tile.width * tile.height;
        if (tilePixels <= 0 || tilePixels > pixelCeiling) {
            throw new RangeError("Cloud transport tile exceeds submission ceiling");
        }
        if (selected.length > 0 && shadedPixels + tilePixels > pixelCeiling) {
            break;
        }
        selected.push(tile);
        shadedPixels += tilePixels;
        tileIndex += 1;
    }
    const packetComplete = tileIndex === tiles.length;
    const terminalCommit = packetComplete &&
        cursor.packetIndex + 1 === packetCount;
    return Object.freeze({
        packetIndex: cursor.packetIndex,
        tiles: Object.freeze(selected),
        clearPacket: cursor.tileIndex === 0,
        shadedPixels,
        terminalCommit,
        nextCursor: terminalCommit
            ? null
            : Object.freeze(packetComplete
                ? { packetIndex: cursor.packetIndex + 1, tileIndex: 0 }
                : { packetIndex: cursor.packetIndex, tileIndex }),
    });
};

/**
 * Pack one or more ordered packet batches into a queue submission. Packet
 * ordering and per-packet row-major tile ordering are invariant; only the
 * number of queue fences changes between software and qualified hardware.
 */
export const createCloudTransportRasterSubmission = (
    cursor: CloudTransportBatchCursor,
    tiles: readonly CloudTransportRasterTile[],
    maximumPixelsPerSubmission =
        CLOUD_STRICT_TRANSPORT_PIXELS_PER_SUBMISSION,
    packetCount = CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
    maximumPacketBatchesPerSubmission = 1,
): CloudTransportRasterSubmission => {
    const pixelCeiling = Number.isFinite(maximumPixelsPerSubmission)
        ? Math.max(1, Math.floor(maximumPixelsPerSubmission))
        : 1;
    const batches: CloudTransportRasterBatch[] = [];
    let nextCursor: CloudTransportBatchCursor | null = cursor;
    let shadedPixels = 0;
    const batchCeiling = Number.isFinite(maximumPacketBatchesPerSubmission)
        ? Math.max(1, Math.floor(maximumPacketBatchesPerSubmission))
        : 1;
    while (nextCursor !== null && batches.length < batchCeiling) {
        const nextTile = tiles[nextCursor.tileIndex];
        if (!nextTile) throw new RangeError("Invalid cloud transport submission cursor");
        const nextTilePixels = nextTile.width * nextTile.height;
        const remainingPixels = pixelCeiling - shadedPixels;
        if (batches.length > 0 && nextTilePixels > remainingPixels) break;
        const batch = createCloudTransportRasterBatch(
            nextCursor,
            tiles,
            remainingPixels,
            packetCount,
        );
        batches.push(batch);
        shadedPixels += batch.shadedPixels;
        nextCursor = batch.nextCursor;
        if (batch.terminalCommit || shadedPixels >= pixelCeiling) break;
    }
    const terminalCommit = batches.at(-1)?.terminalCommit === true;
    return Object.freeze({
        batches: Object.freeze(batches),
        shadedPixels,
        terminalCommit,
        nextCursor: terminalCommit ? null : nextCursor,
    });
};

export interface CloudTransportTransactionIdentity {
    sceneKey: string;
    directionalVisibilityKey: string;
    lightGeneration: number;
    width: number;
    height: number;
    transportOrdinal: number;
}

/** Atomic commit is legal only against the exact immutable input generation. */
export const cloudTransportTransactionIdentityMatches = (
    left: CloudTransportTransactionIdentity,
    right: CloudTransportTransactionIdentity,
) => left.sceneKey === right.sceneKey &&
    left.directionalVisibilityKey === right.directionalVisibilityKey &&
    left.lightGeneration === right.lightGeneration &&
    left.width === right.width && left.height === right.height &&
    left.transportOrdinal === right.transportOrdinal;

// Silhouette pixels legitimately churn as stochastic coverage converges, so a
// strict frame does not require every occupied audit pixel to have age 1. The
// occupied-pixel mean must nevertheless retain at least 48 of 64 consecutive
// samples, the current decision must accept at least 90% of eligible history,
// and persistent confidence must average ten accepted updates or better.
export const CLOUD_QUALIFICATION_MIN_STABLE_HISTORY_AGE = 48 / 64;
export const CLOUD_QUALIFICATION_MIN_HISTORY_ACCEPTANCE_FRACTION = 0.9;
export const CLOUD_QUALIFICATION_MIN_PERSISTENT_HISTORY_CONFIDENCE = 0.85;

interface CloudReconstructionMaturityInput {
    historyAcceptanceFraction: number | null | undefined;
    stableHistoryAge: number | null | undefined;
    persistentHistoryConfidence: number | null | undefined;
}

/**
 * Transport count proves only that work was submitted. These occupied-pixel
 * temporal metrics prove the resolved image actually retained that history.
 */
export const isCloudReconstructionMature = ({
    historyAcceptanceFraction,
    stableHistoryAge,
    persistentHistoryConfidence,
}: CloudReconstructionMaturityInput) =>
    Number.isFinite(historyAcceptanceFraction) &&
    Number.isFinite(stableHistoryAge) &&
    Number.isFinite(persistentHistoryConfidence) &&
    historyAcceptanceFraction! >=
        CLOUD_QUALIFICATION_MIN_HISTORY_ACCEPTANCE_FRACTION &&
    stableHistoryAge! >= CLOUD_QUALIFICATION_MIN_STABLE_HISTORY_AGE &&
    persistentHistoryConfidence! >=
        CLOUD_QUALIFICATION_MIN_PERSISTENT_HISTORY_CONFIDENCE;

export type CloudQualificationLightState =
    | "empty"
    | "warming"
    | "complete"
    | "failed";

interface CloudRenderClockInput {
    paused: boolean;
    requestedSnapshotSeconds: number;
    initialSnapshotSeconds: number;
    elapsedSeconds: number;
    offsetSeconds: number;
}

/**
 * Qualification captures must keep density, light-volume, and view transport
 * on the same immutable weather epoch. Production rendering continues to
 * advance from its initial snapshot.
 */
export const resolveCloudRenderClock = ({
    paused,
    requestedSnapshotSeconds,
    initialSnapshotSeconds,
    elapsedSeconds,
    offsetSeconds,
}: CloudRenderClockInput) => (
    paused ? requestedSnapshotSeconds : initialSnapshotSeconds + elapsedSeconds
) + offsetSeconds;

interface CloudTransportDeltaInput {
    historyAvailable: boolean;
    previousCloudClock: number;
    currentCloudClock: number;
    maximumDeltaSeconds?: number;
}

/**
 * Motion reprojection follows simulation time, never presentation cadence.
 * A paused photographic capture deliberately submits several stochastic view
 * samples at one immutable cloud epoch, so its transport delta must be zero.
 */
export const resolveCloudTransportDeltaSeconds = ({
    historyAvailable,
    previousCloudClock,
    currentCloudClock,
    maximumDeltaSeconds = 8,
}: CloudTransportDeltaInput) => {
    if (!historyAvailable || !Number.isFinite(previousCloudClock) ||
        !Number.isFinite(currentCloudClock)) return 0;
    return Math.min(
        Math.max(0, maximumDeltaSeconds),
        Math.max(0, currentCloudClock - previousCloudClock),
    );
};

interface CloudLightTransportEpochInput {
    refreshWorkPending: boolean;
    invalidationPending: boolean;
}

/**
 * View transport may only sample a light bank from a coherent epoch. A new
 * invalidation is discovered in the same draw that creates its refresh work,
 * so checking refreshWork alone admits one stale-bank transport submission.
 */
export const isCloudLightTransportEpochReady = ({
    refreshWorkPending,
    invalidationPending,
}: CloudLightTransportEpochInput) =>
    !refreshWorkPending && !invalidationPending;

interface CloudLightTimeInvalidationInput {
    lightVolumeState: CloudQualificationLightState;
    requestedEpoch: number;
    activeEpoch: number;
    boundGeneration: number;
    transportedGeneration: number;
}

/**
 * Live animation coalesces missed light epochs instead of immediately
 * replacing a bank which has never illuminated a submitted camera sample.
 * The caller always passes the latest requested epoch, so one completed view
 * transport is enough to advance directly to the newest epoch rather than
 * replaying every epoch missed by a long exact solve.
 */
export const shouldInvalidateCloudLightForTime = ({
    lightVolumeState,
    requestedEpoch,
    activeEpoch,
    boundGeneration,
    transportedGeneration,
}: CloudLightTimeInvalidationInput) =>
    lightVolumeState === "complete" &&
    boundGeneration > 0 &&
    transportedGeneration === boundGeneration &&
    requestedEpoch !== activeEpoch;

interface CloudRenderScheduleInput {
    hidden: boolean;
    paused: boolean;
    lightVolumeWarming: boolean;
    lightVolumeState: CloudQualificationLightState;
    transportUpdates: number;
    targetTransportUpdates?: number;
}

/**
 * A paused capture is not a single-frame render. It first lets the immutable
 * light generation publish, then performs a bounded temporal qualification
 * tail. Once that tail converges, it becomes genuinely idle.
 */
export const shouldScheduleCloudRender = ({
    hidden,
    paused,
    lightVolumeWarming,
    lightVolumeState,
    transportUpdates,
    targetTransportUpdates = CLOUD_QUALIFICATION_TRANSPORT_UPDATES,
}: CloudRenderScheduleInput) => {
    if (hidden) return false;
    if (!paused) return true;
    if (lightVolumeWarming) return true;
    return lightVolumeState === "complete" &&
        transportUpdates < targetTransportUpdates;
};

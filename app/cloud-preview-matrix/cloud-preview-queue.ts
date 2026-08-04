export type CloudPreviewStatus =
    "queued" | "rendering" | "ready" | "failed" | "unavailable";

export interface CloudPreviewQueueSeed {
    id: string;
    available: boolean;
}

export interface CloudPreviewQueueItem {
    readonly id: string;
    status: CloudPreviewStatus;
    thumbnailUrl?: string;
    failure?: string;
    attempts: number;
}

export const CLOUD_PREVIEW_DEFAULT_COOLDOWN_MS = 5_000;
export const CLOUD_PREVIEW_MIN_COOLDOWN_MS = 1_000;
export const CLOUD_PREVIEW_MAX_COOLDOWN_MS = 60_000;
export const CLOUD_PREVIEW_MAX_STORED_THUMBNAILS = 24;
export const CLOUD_PREVIEW_FAILURE_PAUSE_THRESHOLD = 3;

export const clampCloudPreviewCooldown = (milliseconds: number): number => {
    if (!Number.isFinite(milliseconds)) return CLOUD_PREVIEW_DEFAULT_COOLDOWN_MS;
    return Math.min(
        CLOUD_PREVIEW_MAX_COOLDOWN_MS,
        Math.max(CLOUD_PREVIEW_MIN_COOLDOWN_MS, Math.round(milliseconds)),
    );
};

/**
 * Device loss and a renderer timeout are thermal/lifecycle faults, not merely
 * bad photographs. Requiring another explicit Start gives the browser and GPU
 * process a chance to recover. Three consecutive ordinary failures are treated
 * the same way so a broken route cannot spin indefinitely.
 */
export const shouldPauseCloudPreviewQueue = (
    failure: string,
    consecutiveFailures: number,
): boolean => /device\s+(?:was\s+)?lost|device\s+loss|timed?\s*out/i.test(failure) ||
    consecutiveFailures >= CLOUD_PREVIEW_FAILURE_PAUSE_THRESHOLD;

export interface CloudPreviewSelectOption {
    readonly value: string;
}

/**
 * Step a matrix selector with deterministic cyclic navigation. Keeping this
 * outside React makes the arrow contract identical for every selector and
 * directly testable without constructing a browser or GPU context.
 */
export const stepCloudPreviewOption = (
    options: readonly CloudPreviewSelectOption[],
    value: string,
    offset: number,
): string => {
    if (options.length === 0) return value;
    const selectedIndex = options.findIndex((option) => option.value === value);
    const origin = selectedIndex >= 0 ? selectedIndex : 0;
    const index = ((origin + offset) % options.length + options.length) %
        options.length;
    return options[index].value;
};

export type CloudPreviewQueueAction =
    | { type: "begin"; id: string }
    | { type: "complete"; id: string; thumbnailUrl: string }
    | { type: "fail"; id: string; failure: string }
    | { type: "evict-thumbnail"; id: string }
    | { type: "cancel"; id: string }
    | { type: "retry-failed" }
    | { type: "retry"; id: string }
    | { type: "reset"; unavailableIds?: ReadonlySet<string> };

export const createCloudPreviewQueue = (
    seeds: readonly (string | CloudPreviewQueueSeed)[],
): CloudPreviewQueueItem[] => seeds.map((seed) => ({
    id: typeof seed === "string" ? seed : seed.id,
    status: typeof seed === "string" || seed.available ? "queued" : "unavailable",
    attempts: 0,
}));

export const nextQueuedCloudPreview = (
    queue: readonly CloudPreviewQueueItem[],
    eligibleIds: ReadonlySet<string>,
): CloudPreviewQueueItem | undefined => {
    // Seriality is a queue invariant, not merely a React rendering detail.
    // If an active frame exists, no caller may nominate another target even
    // if its own active-id bookkeeping is stale for one render.
    if (queue.some((item) => item.status === "rendering")) return undefined;
    return queue.find(
        (item) => item.status === "queued" && eligibleIds.has(item.id),
    );
};

export const cloudPreviewQueueReducer = (
    queue: readonly CloudPreviewQueueItem[],
    action: CloudPreviewQueueAction,
): CloudPreviewQueueItem[] => {
    if (action.type === "reset") {
        return queue.map((item) => ({
            id: item.id,
            status: action.unavailableIds?.has(item.id)
                ? "unavailable" : "queued",
            attempts: 0,
        }));
    }
    if (action.type === "retry-failed") {
        return queue.map((item) => item.status === "failed" ? {
            id: item.id,
            status: "queued",
            attempts: item.attempts,
        } : item);
    }
    return queue.map((item) => {
        if (item.id !== action.id) return item;
        switch (action.type) {
        case "begin":
            if (item.status !== "queued" || queue.some(
                (candidate) => candidate.status === "rendering" &&
                    candidate.id !== item.id,
            )) return item;
            return {
                id: item.id,
                status: "rendering",
                attempts: item.attempts + 1,
            };
        case "complete":
            if (item.status !== "rendering") return item;
            return {
                id: item.id,
                status: "ready",
                thumbnailUrl: action.thumbnailUrl,
                attempts: item.attempts,
            };
        case "fail":
            if (item.status !== "rendering") return item;
            return {
                id: item.id,
                status: "failed",
                failure: action.failure,
                attempts: item.attempts,
            };
        case "evict-thumbnail":
            if (!item.thumbnailUrl) return item;
            return {
                id: item.id,
                status: item.status,
                attempts: item.attempts,
                ...(item.failure ? { failure: item.failure } : {}),
            };
        case "cancel":
        case "retry":
            return {
                id: item.id,
                status: "queued",
                attempts: item.attempts,
            };
        }
    });
};

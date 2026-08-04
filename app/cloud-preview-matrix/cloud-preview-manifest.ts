export const CLOUD_PREVIEW_MANIFEST_URL =
    "/api/cloud-previews/manifest";
const CLOUD_PREVIEW_IMAGE_PREFIX =
    "/generated/cloud-previews/images/";
const CLOUD_PREVIEW_IMAGE_NAME = /^[a-z0-9-]+-[a-f0-9]{12}\.png$/;
const CLOUD_PREVIEW_HASH = /^[a-f0-9]{64}$/;
const CLOUD_PREVIEW_TOTAL = 276;
const CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM = "SHA-256";

export const cloudPreviewImageProxyUrl = (imageUrl: string) => {
    const filename = imageUrl.startsWith(CLOUD_PREVIEW_IMAGE_PREFIX)
        ? imageUrl.slice(CLOUD_PREVIEW_IMAGE_PREFIX.length) : "";
    if (!CLOUD_PREVIEW_IMAGE_NAME.test(filename)) return undefined;
    return `/api/cloud-previews/image/${filename}`;
};

export interface CloudPreviewManifestEntry {
    id: string;
    caseId: string;
    captureParameter: "case" | "weather";
    imageUrl: string;
    width: number;
    height: number;
    contentHash: string;
    imageContentHash: string;
    generatedAt: string;
}

export interface CloudPreviewAssetChecksums {
    algorithm: "SHA-256";
    atlas: string;
    majorants: string;
    exteriorBoundary: string;
}

export interface CloudPreviewManifest {
    schemaVersion: 1;
    rendererHash: string;
    assetChecksums: CloudPreviewAssetChecksums;
    productionPerspective: string;
    captureMode: "native-metal" | "headless";
    generatedAt: string;
    status: "complete" | "partial";
    total: number;
    completed: number;
    entries: CloudPreviewManifestEntry[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";

const isAssetChecksums = (
    value: unknown,
): value is CloudPreviewAssetChecksums => isRecord(value) &&
    value.algorithm === CLOUD_PREVIEW_ASSET_CHECKSUM_ALGORITHM &&
    typeof value.atlas === "string" && CLOUD_PREVIEW_HASH.test(value.atlas) &&
    typeof value.majorants === "string" &&
    CLOUD_PREVIEW_HASH.test(value.majorants) &&
    typeof value.exteriorBoundary === "string" &&
    CLOUD_PREVIEW_HASH.test(value.exteriorBoundary);

export const parseCloudPreviewManifest = (
    value: unknown,
): CloudPreviewManifest | undefined => {
    if (!isRecord(value) || value.schemaVersion !== 1 ||
        typeof value.rendererHash !== "string" ||
        !CLOUD_PREVIEW_HASH.test(value.rendererHash) ||
        !isAssetChecksums(value.assetChecksums) ||
        value.productionPerspective !== "oblique-natural" ||
        (value.captureMode !== "native-metal" && value.captureMode !== "headless") ||
        typeof value.generatedAt !== "string" ||
        (value.status !== "complete" && value.status !== "partial") ||
        value.total !== CLOUD_PREVIEW_TOTAL ||
        !Number.isSafeInteger(value.completed) || Number(value.completed) < 0 ||
        !Array.isArray(value.entries)) return undefined;

    const entries: CloudPreviewManifestEntry[] = [];
    const ids = new Set<string>();
    for (const candidate of value.entries) {
        if (!isRecord(candidate) || typeof candidate.id !== "string" ||
            ids.has(candidate.id) || typeof candidate.caseId !== "string" ||
            (candidate.captureParameter !== "case" &&
                candidate.captureParameter !== "weather") ||
            typeof candidate.imageUrl !== "string" ||
            !cloudPreviewImageProxyUrl(candidate.imageUrl) ||
            !Number.isSafeInteger(candidate.width) ||
            Number(candidate.width) < 1 ||
            !Number.isSafeInteger(candidate.height) ||
            Number(candidate.height) < 1 ||
            typeof candidate.contentHash !== "string" ||
            !CLOUD_PREVIEW_HASH.test(candidate.contentHash) ||
            typeof candidate.imageContentHash !== "string" ||
            !CLOUD_PREVIEW_HASH.test(candidate.imageContentHash) ||
            !candidate.imageUrl.endsWith(
                `-${candidate.imageContentHash.slice(0, 12)}.png`,
            ) ||
            typeof candidate.generatedAt !== "string") return undefined;
        ids.add(candidate.id);
        entries.push(candidate as unknown as CloudPreviewManifestEntry);
    }
    if (Number(value.completed) !== entries.length ||
        Number(value.completed) > Number(value.total) ||
        (value.status === "complete") !==
            (Number(value.completed) === Number(value.total))) return undefined;
    return value as unknown as CloudPreviewManifest;
};

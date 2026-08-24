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
    productionPerspective: string;
    productionCameraSignature: string;
    photographicAcceptance: "accepted" | "not-accepted";
    qualification: {
        schemaVersion: 1;
        gate: "artifact-texture";
        profile: "artifact-and-texture" | "artifact-only";
        state: "accepted";
        cloudMaskUsed: boolean;
        radialArtifact: boolean;
        scaleSeparatedStructureReady: boolean;
        cloudLocalStructureReady: boolean;
        metrics: Record<string, number | boolean>;
    };
    generatedAt: string;
}

export interface CloudPreviewAssetChecksums {
    algorithm: "SHA-256";
    atlas: string;
    majorants: string;
    exteriorBoundary: string;
}

export interface CloudPreviewManifest {
    schemaVersion: 2;
    rendererHash: string;
    assetChecksums: CloudPreviewAssetChecksums;
    perspectiveMode: "single-camera";
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

const REQUIRED_IMAGE_METRICS = [
    "fineRms", "broadBandRms", "fineTextureFraction", "fineToBroadRatio",
    "radialExplainedVariance", "radialExplainedCoverage", "cloudMaskUsed",
    "cloudSupportFraction",
] as const;
const REQUIRED_STRUCTURED_IMAGE_METRICS = [
    "cloudCoreSupportFraction", "cloudCoreFraction", "cloudEdgeFraction",
    "cloudEdgeFineFraction", "cloudInteriorFineRms",
    "cloudInteriorBroadRms", "cloudInteriorFineToBroadRatio",
    "cloudInteriorTextureFraction", "cloudMaskResidualRms",
    "cloudMaskResidualFineToBroadRatio", "cloudMaskResidualTextureFraction",
    "cloudMaskEdgeProjection",
] as const;

const isQualification = (value: unknown) => {
    if (!isRecord(value) || value.schemaVersion !== 1 ||
        value.gate !== "artifact-texture" ||
        (value.profile !== "artifact-and-texture" &&
            value.profile !== "artifact-only") ||
        value.state !== "accepted" || typeof value.cloudMaskUsed !== "boolean" ||
        typeof value.radialArtifact !== "boolean" ||
        typeof value.scaleSeparatedStructureReady !== "boolean" ||
        typeof value.cloudLocalStructureReady !== "boolean" ||
        !isRecord(value.metrics)) return false;
    const metrics = value.metrics;
    if (!REQUIRED_IMAGE_METRICS.every((key) => key in metrics) ||
        (value.profile === "artifact-and-texture" &&
            !REQUIRED_STRUCTURED_IMAGE_METRICS.every((key) =>
                key in metrics))) return false;
    return Object.values(metrics).every((metric) =>
        typeof metric === "boolean" ||
        (typeof metric === "number" && Number.isFinite(metric)));
};

export const parseCloudPreviewManifest = (
    value: unknown,
): CloudPreviewManifest | undefined => {
    if (!isRecord(value) || value.schemaVersion !== 2 ||
        typeof value.rendererHash !== "string" ||
        !CLOUD_PREVIEW_HASH.test(value.rendererHash) ||
        !isAssetChecksums(value.assetChecksums) ||
        value.perspectiveMode !== "single-camera" ||
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
            typeof candidate.productionPerspective !== "string" ||
            !candidate.productionPerspective ||
            typeof candidate.productionCameraSignature !== "string" ||
            !candidate.productionCameraSignature ||
            (candidate.photographicAcceptance !== "accepted" &&
                candidate.photographicAcceptance !== "not-accepted") ||
            !isQualification(candidate.qualification) ||
            typeof candidate.generatedAt !== "string") return undefined;
        if ((candidate.qualification as Record<string, unknown>).profile ===
                "artifact-and-texture" &&
            (candidate.qualification as Record<string, unknown>).cloudMaskUsed !==
                true) return undefined;
        ids.add(candidate.id);
        entries.push(candidate as unknown as CloudPreviewManifestEntry);
    }
    if (Number(value.completed) !== entries.length ||
        Number(value.completed) > Number(value.total) ||
        (value.status === "complete") !==
            (Number(value.completed) === Number(value.total))) return undefined;
    return value as unknown as CloudPreviewManifest;
};

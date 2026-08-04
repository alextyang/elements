import type { CloudLayerState } from "./cloud-scene";

/**
 * The photographic preview is a publication surface, not merely a GPU health
 * check. Thick liquid and deep-convective volumes must therefore expose some
 * spatially resolved illumination evidence before their immutable PNG can be
 * published. Thin ice veils deliberately remain outside this contract.
 */
export const CLOUD_PREVIEW_THICK_OPTICAL_DEPTH = 0.7;
export const CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION = 0.0025;
export const CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION = 0.0015;

/**
 * High-cloud publication is deliberately independent of P1 residency. Thin
 * ice commonly uses the exact/direct path, but it must still produce resolved
 * image structure rather than a flat analytic ribbon. These thresholds are
 * relative neighbouring-pixel radiance deltas measured only where cloud
 * opacity exceeds two percent, so they do not impose a minimum cloud albedo.
 */
export const CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION = 0.0035;
export const CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION = 0.002;
export const CLOUD_PREVIEW_MIN_HIGH_CLOUD_OCCUPIED_SKY = 0.006;
export const CLOUD_PREVIEW_HIGH_CLOUD_COVERAGE_FRACTION = 0.03;

const HIGH_CLOUD_PREFIXES = [
    "cirrus-",
    "cirrostratus-",
    "cirrocumulus-",
] as const;

const SMOOTH_HIGH_CLOUD_VEILS = new Set<CloudLayerState["species"]>([
    "cirrostratus-nebulosus",
]);

const isHighCloudSpecies = (species: CloudLayerState["species"]) =>
    HIGH_CLOUD_PREFIXES.some((prefix) => species.startsWith(prefix));

export type CloudPreviewHighCloudProfile = "none" | "structured" | "smooth-veil";

export const cloudPreviewHighCloudProfile = (
    layers: readonly CloudLayerState[],
): CloudPreviewHighCloudProfile => {
    const presentHighClouds = layers.filter((layer) =>
        layer.present && isHighCloudSpecies(layer.species));
    if (presentHighClouds.length === 0) return "none";
    return presentHighClouds.every((layer) =>
        SMOOTH_HIGH_CLOUD_VEILS.has(layer.species))
        ? "smooth-veil" : "structured";
};

export const minimumHighCloudOccupiedSky = (
    layers: readonly CloudLayerState[],
) => {
    const expectedCoverage = Math.max(0, ...layers.map((layer) =>
        layer.present && isHighCloudSpecies(layer.species)
            ? layer.coverage : 0));
    if (!(expectedCoverage > 0)) return 0;
    return Math.max(
        CLOUD_PREVIEW_MIN_HIGH_CLOUD_OCCUPIED_SKY,
        expectedCoverage * CLOUD_PREVIEW_HIGH_CLOUD_COVERAGE_FRACTION,
    );
};

export interface CloudPreviewHighCloudEvidence {
    profile: CloudPreviewHighCloudProfile;
    rawRadianceSpatialVariation: number | null | undefined;
    resolvedRadianceSpatialVariation: number | null | undefined;
    projectedOpacity: number | null | undefined;
    occupiedSkyFraction: number | null | undefined;
    minimumOccupiedSkyFraction: number;
}

export interface CloudPreviewHighCloudReadiness {
    ready: boolean;
    spatialStructureReady: boolean;
    footprintReady: boolean;
}

/**
 * Publication contract for the canonical high-cloud group. A smooth
 * Cirrostratus nebulosus veil is physically allowed to have very little local
 * contrast, but every other high-cloud species must expose scale-resolved
 * radiance structure. All high clouds must occupy the physically expected
 * solid angle. No branch relies on selected bricks or P1 residency.
 */
export const evaluateCloudPreviewHighCloudReadiness = ({
    profile,
    rawRadianceSpatialVariation,
    resolvedRadianceSpatialVariation,
    projectedOpacity,
    occupiedSkyFraction,
    minimumOccupiedSkyFraction,
}: CloudPreviewHighCloudEvidence): CloudPreviewHighCloudReadiness => {
    const spatialStructureReady =
        Number.isFinite(rawRadianceSpatialVariation) &&
        Number(rawRadianceSpatialVariation) >=
            CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION &&
        Number.isFinite(resolvedRadianceSpatialVariation) &&
        Number(resolvedRadianceSpatialVariation) >=
            CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION;
    const footprintReady = Number.isFinite(projectedOpacity) &&
        Number(projectedOpacity) > 0.00001 &&
        Number.isFinite(occupiedSkyFraction) &&
        Number(occupiedSkyFraction) > minimumOccupiedSkyFraction;
    return {
        ready: profile === "none" ||
            (footprintReady &&
                (profile === "smooth-veil" || spatialStructureReady)),
        spatialStructureReady,
        footprintReady,
    };
};

const VOLUMETRIC_LIGHTING_SPECIES = new Set<CloudLayerState["species"]>([
    "altocumulus-stratiformis",
    "altocumulus-castellanus",
    "altocumulus-floccus",
    "stratocumulus-stratiformis",
    "stratocumulus-castellanus",
    "stratocumulus-floccus",
    "cumulus-humilis",
    "cumulus-mediocris",
    "cumulus-congestus",
    "cumulus-fractus",
    "cumulonimbus-calvus",
    "cumulonimbus-capillatus",
    "cumulonimbus-capillatus-incus",
]);

export const cloudLayersRequireVolumetricLightingEvidence = (
    layers: readonly CloudLayerState[],
) => layers.some((layer) => {
    return layer.present &&
        layer.opticalDepth >= CLOUD_PREVIEW_THICK_OPTICAL_DEPTH &&
        VOLUMETRIC_LIGHTING_SPECIES.has(layer.species);
});

export interface CloudPreviewLightingEvidence {
    requiresVolumetricLighting: boolean;
    rawRadianceSpatialVariation: number | null | undefined;
    resolvedRadianceSpatialVariation: number | null | undefined;
    selectedBricks: number;
    readyBricks: number;
    residentLayerMask: number;
    occupiedP1Voxels: number;
}

export interface CloudPreviewLightingReadiness {
    ready: boolean;
    spatialVariationReady: boolean;
    directVolumeReady: boolean;
    residentP1Ready: boolean;
}

/**
 * Reject only the specific failure in which a thick cloud has neither useful
 * spatial radiance structure nor a published direct/P1 volume. A qualified
 * analytic direct solution may pass by measured variation alone; conversely a
 * newly published volume may pass while temporal reconstruction settles.
 */
export const evaluateCloudPreviewLightingReadiness = ({
    requiresVolumetricLighting,
    rawRadianceSpatialVariation,
    resolvedRadianceSpatialVariation,
    selectedBricks,
    readyBricks,
    residentLayerMask,
    occupiedP1Voxels,
}: CloudPreviewLightingEvidence): CloudPreviewLightingReadiness => {
    const spatialVariationReady =
        Number.isFinite(rawRadianceSpatialVariation) &&
        Number(rawRadianceSpatialVariation) >=
            CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION &&
        Number.isFinite(resolvedRadianceSpatialVariation) &&
        Number(resolvedRadianceSpatialVariation) >=
            CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION;
    const directVolumeReady = selectedBricks > 0 &&
        readyBricks === selectedBricks;
    const residentP1Ready = residentLayerMask !== 0 && occupiedP1Voxels > 0;
    return {
        ready: !requiresVolumetricLighting || spatialVariationReady ||
            directVolumeReady || residentP1Ready,
        spatialVariationReady,
        directVolumeReady,
        residentP1Ready,
    };
};

/**
 * Runtime contract for the versioned authoritative macro-volume atlas.
 *
 * The atlas contains canonical local cloud volumes. World placement, wind,
 * deformation, and fine detail remain runtime concerns; the R channel replaces
 * visible analytic macro primitives as the source of the cloud silhouette.
 */

import type {
    CloudSystemPlacementMode,
    StratocumulusStratiformisOrganizationRegime,
} from "./low-layered-cloud-physical-foundation";

export const CLOUD_MACRO_ATLAS_MANIFEST_URL =
    "/assets/sky/cloud-macro-atlas-v2.json";

export const CLOUD_MACRO_VOLUME_IDS = [
    "cu-humilis", "cu-mediocris", "cu-congestus",
    "cb-calvus", "cb-capillatus", "cb-capillatus-incus", "cb-dissipating",
    "ci-fibratus", "ci-uncinus", "ci-spissatus", "ci-floccus", "ci-castellanus",
    "cs-veil",
    "cc-stratiformis", "cc-castellanus", "cc-floccus", "cc-lenticularis",
    "ac-stratiformis", "ac-castellanus", "ac-floccus", "ac-lenticularis", "ac-volutus",
    "as-opacus", "ns-precipitating",
    "sc-stratiformis", "sc-castellanus", "sc-floccus", "sc-lenticularis", "sc-volutus",
    "st-nebulosus", "st-fractus", "cu-fractus",
    "cu-congestus-turreted", "cu-congestus-multicell",
    "cb-calvus-multicell", "cb-capillatus-sheared",
    "cb-capillatus-incus-back-sheared", "cb-dissipating-remnant",
    "cs-fibratus", "as-translucidus",
    "cc-stratiformis-dispersive",
    "ci-fibratus-split-source", "ci-fibratus-depth-shear",
    "sc-stratiformis-closed-overhead",
    "sc-stratiformis-open-field",
    "sc-stratiformis-street-packet",
    "sc-stratiformis-transition-mosaic",
    "ns-deepening-altostratus-shield",
    "ns-generating-cell-shield",
    "ns-thickened-low-deck-shield",
] as const;

export type CloudMacroVolumeId = (typeof CLOUD_MACRO_VOLUME_IDS)[number];

export type CloudExteriorDetailClassId =
    | "liquid-cauli" | "liquid-turret" | "liquid-scud"
    | "stratiform-ragged" | "ice-fibre" | "ice-sedimentation"
    | "laminar-wave";

export interface CloudExteriorDetailClass {
    maximumCanonicalDisplacement: number;
    maximumExteriorDensity: number;
    axisScale: [number, number, number];
    topology: string;
}

export interface CloudExteriorBoundaryProfile {
    schema: "elements-cloud-exterior-boundary";
    version: 1;
    volumeResolution: number;
    detailClasses: CloudExteriorDetailClassId[];
    maximumOutwardDisplacementCanonical: number;
    maximumOutwardDisplacementVoxels: number;
    maximumExteriorDensity: number;
    interpolationHaloVoxels: number;
    majorantSampleHaloVoxels: 1;
    visibleOwnerBoundsInflationCanonical: number;
    traversalOwnerBoundsInflationCanonical: number;
    protectedBase: {
        mode:
            | "unprotected-ragged-boundary"
            | "precipitation-permeable-stratiform-base"
            | "protected-planar-stratiform-base"
            | "protected-laminar-lower-envelope"
            | "protected-cellular-condensation-base"
            | "protected-convective-condensation-base";
        normalizedAltitude: number;
        featherVoxels: number;
        downwardDisplacementScale: number;
    };
}

export type CloudMacroGenus =
    | "cirrus" | "cirrocumulus" | "cirrostratus"
    | "altocumulus" | "altostratus" | "nimbostratus"
    | "stratocumulus" | "stratus" | "cumulus" | "cumulonimbus";

export type CloudMacroFormationMechanism =
    | "parcel-thermal-tree"
    | "deep-convective-detrainment"
    | "sheared-ice-sedimentation"
    | "elevated-convective-ice"
    | "cellular-convective-colony"
    | "inversion-bounded-cellular-deck"
    | "frontal-ascent-sheet"
    | "orographic-wave-condensation"
    | "horizontal-roll-circulation"
    | "inversion-bounded-deck"
    | "boundary-layer-fragmentation";

/** Exhaustive finite ABI shared by manifest validation and GPU packing. */
export const CLOUD_MACRO_FORMATION_CODE = {
    "parcel-thermal-tree": 1,
    "deep-convective-detrainment": 2,
    "sheared-ice-sedimentation": 3,
    "elevated-convective-ice": 4,
    "cellular-convective-colony": 5,
    "inversion-bounded-cellular-deck": 6,
    "frontal-ascent-sheet": 7,
    "orographic-wave-condensation": 8,
    "horizontal-roll-circulation": 9,
    "inversion-bounded-deck": 10,
    "boundary-layer-fragmentation": 11,
} as const satisfies Readonly<Record<CloudMacroFormationMechanism, number>>;

export type CloudMacroTopologyPolicy =
    | "single-connected"
    | "fragmented-population"
    | "irregular-patch"
    | "cellular-colony"
    | "continuous-sheet"
    | "wave-packet"
    | "roll-tube";

/** Exhaustive finite ABI shared by manifest validation and GPU packing. */
export const CLOUD_MACRO_TOPOLOGY_CODE = {
    "single-connected": 1,
    "fragmented-population": 2,
    "cellular-colony": 3,
    "continuous-sheet": 4,
    "wave-packet": 5,
    "roll-tube": 6,
    "irregular-patch": 7,
} as const satisfies Readonly<Record<CloudMacroTopologyPolicy, number>>;

export interface CloudAtlasDimensions {
    width: number;
    height: number;
    depthOrArrayLayers: number;
}

export interface CloudMacroVolumeEntry {
    id: CloudMacroVolumeId;
    label: string;
    classification: {
        genus: CloudMacroGenus;
        species: string | null;
        morphologyVariant?: "balanced" | "turreted" | "multicell" | null;
        speciesAliases: string[];
        supplementaryFeature: "incus" | "praecipitatio" | null;
        lifecycle: "incipient" | "growing" | "mature" | "glaciating" | "precipitating" | "decaying";
    };
    formation: {
        mechanism: CloudMacroFormationMechanism;
        materialModel:
            | "fibrous-ice" | "granular-ice" | "mixed-phase-cellular"
            | "liquid-cellular" | "mixed-phase-sheet" | "liquid-sheet"
            | "liquid-convective" | "deep-mixed-phase";
        topologyPolicy: CloudMacroTopologyPolicy;
        boundaryModel:
            | "curved-frontal-swath"
            | "asymmetric-wave-condensation"
            | "soliton-envelope"
            | "sheared-fiber-bundles"
            | "finite-envelope-prior-3d-lognormal-fractal-iwc-excursion"
            | "domain-warped-formation-primitives";
        stratocumulusOrganization?: {
            regime: StratocumulusStratiformisOrganizationRegime;
            placement: CloudSystemPlacementMode;
            supportConstruction: "generated-material-manifold";
            postDensityMaskWeight: 0;
        };
        protectedConnectedCore: {
            material: "lower-liquid-updraft";
            roles: ("root" | "thermal-mass" | "feeder-thermal" | "thermal-junction")[];
            maximumIceFraction: number;
        } | null;
    };
    index: number;
    seed: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
    sampleTransform: {
        scale: [number, number, number];
        offset: [number, number, number];
    };
    majorantZOffset: number;
    majorantXOffset: number;
    majorantYOffset: number;
    majorantSampleTransform: {
        scale: [number, number, number];
        offset: [number, number, number];
    };
    exteriorBoundary: CloudExteriorBoundaryProfile;
    statistics: {
        occupiedVoxels: number;
        occupancyFraction: number;
        connectedComponentCount: number;
        largestComponentFraction: number;
        dominantComponentFractions: number[];
        occupiedBounds: {
            minimum: [number, number, number];
            maximum: [number, number, number];
        };
        meanDensity: number;
        meanDetailType: number;
        meanIceFraction: number;
        meanPrecipitationStructure: number;
        surfaceVoxelFraction: number;
        meanOccupiedNeighborCount: number;
        trilinearCoreFraction: number;
        projectedFootprintCompactness: number;
        projectedMirrorSimilarity: number;
        /** Rotation-invariant horizontal elongation from footprint covariance. */
        projectedPrincipalAspectRatio: number;
        projectedPrincipalAxisRadians: number;
        /** Local correlation revivals along the strongest single direction. */
        projectedOneAxisPeriodicScore: number;
        /** Orientation-robust repeated spacing on two orthogonal directions. */
        projectedTwoAxisPeriodicScore: number;
        projectedDirectionalPeriodicity: number[];
        reconstructionScale2MassRetention: number;
        reconstructionScale4MassRetention: number;
        reconstructionScale2SourceSupportRetention: number;
        reconstructionScale4SourceSupportRetention: number;
        reconstructionScale2OccupancyFraction: number;
        reconstructionScale4OccupancyFraction: number;
        reconstructionScale2ConnectedComponentCount: number;
        reconstructionScale4ConnectedComponentCount: number;
        reconstructionScale2LargestComponentFraction: number;
        reconstructionScale4LargestComponentFraction: number;
        /** Mean normalized condensate integral through occupied X columns. */
        meanDensityPathCrosswind: number;
        /** Mean normalized condensate integral through occupied vertical columns. */
        meanDensityPathVertical: number;
        /** Mean normalized condensate integral through occupied Z columns. */
        meanDensityPathDownwind: number;
        /** Dense-core reference retained for diagnostics and qualification. */
        p90DensityPathVertical: number;
        verticalSilhouetteCompactness: number;
        verticalSilhouetteMirrorSimilarity: number;
        baseHorizontalSpan: number;
        middleBodyHorizontalSpan: number;
        crownHorizontalSpan: number;
        middleBodyToBaseSpanRatio: number;
        crownToMiddleBodySpanRatio: number;
        broadBaseThicknessFraction: number;
        middleSliceSingleComponentFraction: number;
        middleSliceMeanComponentCount: number;
        middleSliceDominantComponentFraction: number;
        lowerThirdMassFraction: number;
        upperThirdMassFraction: number;
        /** Density-weighted normalized altitude of the reconstructed support. */
        verticalDensityCenterOfMass: number;
        verticalProfileCoefficientVariation: number;
        primitiveCount: number;
        formationGroupCount: number;
        ownerSpacingCoefficientVariation: number;
        ownerAngularEntropy: number;
        entrainmentCavityCount: number;
        streamlineCount: number;
        commonBaseCount: number;
        secondaryLobeCount: number;
        hierarchyLevelCount: number;
        waveCrestCount: number;
        waveStackLayerCount: number;
        formationBoundaryLobeCount: number;
        convectiveBaseLobeCount: number;
        convectiveCrownLobeCount: number;
        convectiveMergedBodyLobeCount: number;
        thermalBranchSpread: number;
        /** Number of source-connected buoyant lineages in the authored owner. */
        cumulusThermalChainCount: number;
        /** Older mixed-air shoulders retained beside the active Cu core. */
        cumulusDissipatingShoulderCount: number;
        /** Canonical altitude spread between authored terminal crown heads. */
        cumulusCrownTopHeightVariation: number;
        /** Most articulated of the two canonical crown elevations. */
        cumulusCrownMaximumViewFinePeakCount: number;
        /** Deepest reconstructed dry-air crown valley in either elevation. */
        cumulusCrownMaximumViewMaximumCleftDepthVoxels: number;
        /** CV of successive source-connected thermal-event height intervals. */
        cumulusThermalEventSpacingVariation: number;
        /** Mean vertical/horizontal aspect of dominant authored thermal heads. */
        cumulusMeanThermalVerticalAspect: number;
        exteriorPotentialVoxels: number;
        exteriorPotentialFraction: number;
        exteriorMaximumDensityByte: number;
        exteriorMinimumSignedDistanceVoxels: number;
        exteriorMaximumSignedDistanceVoxels: number;
        exteriorPotentialBounds: {
            minimum: [number, number, number];
            maximum: [number, number, number];
        } | null;
    };
}

export interface CloudMacroAtlasManifest {
    schema: "elements-cloud-macro-atlas";
    version: 2;
    generatorVersion: string;
    deterministicSeed: number;
    coordinateSystem: {
        axes: { x: "crosswind"; y: "altitude"; z: "downwind" };
        handedness: "right-handed";
        localDomain: { minimum: [0, 0, 0]; maximum: [1, 1, 1] };
    };
    atlas: {
        url: string;
        file: string;
        format: "rgba8unorm";
        dimensions: CloudAtlasDimensions;
        volumeResolution: number;
        volumeCount: number;
        zStride: number;
        paddingZ: number;
        packing: {
            kind: "xz-tiled-canonical-volumes";
            columns: number;
            rows: number;
            xStride: number;
            zStride: number;
        };
        byteLength: number;
        channels: Record<"r" | "g" | "b" | "a", Record<string, unknown>>;
    };
    majorants: {
        url: string;
        file: string;
        format: "r8unorm";
        dimensions: CloudAtlasDimensions;
        brickSize: number;
        gridSize: number;
        byteLength: number;
        semantic: "conservative-potential-density-majorant";
        filtering: "nearest";
        conservatism: string;
    };
    /**
     * Legacy coarse moment metadata.  The runtime no longer uploads this
     * payload; it remains optional so regenerated manifests can retain it as
     * offline provenance while the fine source atlas is authoritative.
     */
    highIceMomentSidecar?: {
        schema: "elements-cloud-high-ice-moment-sidecar";
        version: 1;
        url: string;
        file: string;
        format: "rg8unorm";
        dimensions: CloudAtlasDimensions;
        volumeResolution: number;
        volumeCount: number;
        zStride: number;
        paddingZ: number;
        packing: {
            kind: "xz-tiled-canonical-volumes";
            columns: number;
            rows: number;
            xStride: number;
            zStride: number;
        };
        byteLength: number;
        sourceResolution: number;
        sourceIds: CloudMacroVolumeId[];
        filtering: "linear";
        alignment: string;
        channels: Record<"r" | "g", Record<string, unknown>>;
        supportContract: string;
    };
    /** Guarded, compact authored source-density atlas used at binding 32. */
    highIceSourceAtlas: {
        schema: "elements-cloud-high-ice-source-atlas";
        version: 1;
        url: string;
        file: string;
        format: "rgba8unorm";
        dimensions: CloudAtlasDimensions;
        layout: "xyz-tiled-canonical-source-volumes";
        filtering: "linear";
        guard: {
            voxels: number;
            value: number;
            semantics: string;
            filtering: string;
        };
        guardVoxels: number;
        sourceResolution: number;
        sourceCount: number;
        sourceIds: CloudMacroVolumeId[];
        sourceIdToSlot: Record<string, number>;
        slots: Array<{
            slot: number;
            id: CloudMacroVolumeId;
            tile: { x: number; y: number; z: number };
            xOffset: number;
            yOffset: number;
            zOffset: number;
            checksum: string;
        }>;
        packing: {
            kind: "xyz-tiled-canonical-source-volumes";
            sourceResolution: number;
            guardVoxels: number;
            xStride: number;
            yStride: number;
            zStride: number;
            columns: number;
            rows: number;
            layers: number;
            slotCount: number;
            dimensions: CloudAtlasDimensions;
        };
        byteLength: number;
        sourceChecksums: Record<string, string>;
        channels: Record<"r" | "g" | "b" | "a", Record<string, unknown>>;
        supportSemantics: Record<string, string>;
        alignment: string;
    };
    occupancy: {
        densityByteThreshold: number;
        connectivity: "six-neighbor";
    };
    topologyExemplars: {
        schema: "elements-cloud-topology-exemplars";
        version: 1;
        selection: {
            inputs: string[];
            hash: string;
            cameraInvariant: true;
            frameTimeInvariant: true;
        };
        logicalExemplarsPerSpecies: 3;
        denseAssetBudget: {
            maximumWidthSlices: 2048;
            maximumDepthSlices: 2048;
            usedWidthSlices: number;
            usedDepthSlices: number;
            remainingWidthSlices: number;
            remainingDepthSlices: number;
            zStridePerVolume: number;
            packingColumns: number;
            maximumAdditionalDenseVolumes: number;
            policy: string;
        };
        species: Array<{
            rendererSpecies: string;
            genus: CloudMacroGenus;
            logicalExemplarCount: 3;
            materializedExemplarCount: number;
            materializedVolumeIds: CloudMacroVolumeId[];
            /** Exact stable topology-ordinal to dense anatomy mapping. */
            ordinalVolumeIds: [
                CloudMacroVolumeId,
                CloudMacroVolumeId,
                CloudMacroVolumeId,
            ];
            remainingLogicalExemplars: number;
            status: "dense-multi-exemplar" | "canonical-plus-logical-exemplars";
        }>;
    };
    organizationManifolds: {
        schema: "elements-cloud-organization-manifolds";
        version: 1;
        rendererSpecies: "stratocumulus-stratiformis";
        selection: {
            authoritativeInputs: string[];
            seedRole: "within-manifold variation only";
            forbiddenSubstitutions: string[];
        };
        manifolds: Array<{
            regime: StratocumulusStratiformisOrganizationRegime;
            placement: CloudSystemPlacementMode;
            volumeId: CloudMacroVolumeId;
            materialSupport: string;
        }>;
    };
    exteriorBoundary: {
        schema: "elements-cloud-exterior-boundary";
        version: 1;
        densitySemantics: Record<string, string>;
        detailClasses: Record<CloudExteriorDetailClassId, CloudExteriorDetailClass>;
        classSelection: { inputs: string[]; orderedRules: string[] };
        signedDistanceContract: Record<string, string>;
        displacementContract: Record<string, string | number>;
        compositionContract: { order: string[]; forbiddenEarlyExit: string };
        storageGuards: Record<string, string>;
        accelerationContract: Record<string, string | number>;
    };
    volumes: CloudMacroVolumeEntry[];
    checksums: {
        algorithm: "SHA-256";
        atlas: string;
        majorants: string;
        highIceMomentSidecar?: string;
        highIceSourceAtlas: string;
        exteriorBoundary: string;
    };
}

export interface LoadedCloudMacroAtlas {
    manifest: CloudMacroAtlasManifest;
    atlasBytes: Uint8Array;
    majorantBytes: Uint8Array;
    highIceSourceAtlasBytes: Uint8Array;
    volumes: ReadonlyMap<CloudMacroVolumeId, CloudMacroVolumeEntry>;
}

/**
 * Canonical support used to place bounded lighting bricks. The bounds contain
 * every atlas texel that may contribute either authoritative condensate or the
 * permitted procedural exterior. The anchor is an actually occupied, dense
 * atlas voxel near the density-weighted centre, rather than the centre of an
 * AABB (which may lie in a lacuna or between disconnected fragments).
 */
export interface CloudMacroConservativeSupport {
    volumeId: CloudMacroVolumeId;
    minimumCanonical: [number, number, number];
    maximumCanonical: [number, number, number];
    anchorCanonical: [number, number, number];
    anchorDensity: number;
}

const conservativeSupportCache = new WeakMap<
    LoadedCloudMacroAtlas,
    ReadonlyMap<CloudMacroVolumeId, CloudMacroConservativeSupport>
>();

const createCloudMacroConservativeSupports = (
    loaded: LoadedCloudMacroAtlas,
) => {
    const { manifest, atlasBytes } = loaded;
    const resolution = manifest.atlas.volumeResolution;
    const denominator = Math.max(1, resolution - 1);
    const halfVoxel = 0.5 / denominator;
    const width = manifest.atlas.dimensions.width;
    const height = manifest.atlas.dimensions.height;
    const densityThreshold = manifest.occupancy.densityByteThreshold;
    const result = new Map<CloudMacroVolumeId, CloudMacroConservativeSupport>();
    for (const volume of manifest.volumes) {
        let maximumDensityByte = 0;
        let weightSum = 0;
        const weightedCoordinate = [0, 0, 0];
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const byteIndex = (((volume.zOffset + z) * height +
                        volume.yOffset + y) * width + volume.xOffset + x) * 4;
                    const densityByte = atlasBytes[byteIndex];
                    if (densityByte <= densityThreshold) continue;
                    maximumDensityByte = Math.max(maximumDensityByte, densityByte);
                    // Bias the centroid toward the optically stable core. A
                    // fourth-power weight prevents a diffuse fringe or a long
                    // fallstreak from pulling the mandatory first brick away
                    // from material that is certain to survive fine erosion.
                    const density = densityByte / 255;
                    const weight = density ** 4;
                    weightSum += weight;
                    weightedCoordinate[0] += x * weight;
                    weightedCoordinate[1] += y * weight;
                    weightedCoordinate[2] += z * weight;
                }
            }
        }
        const occupied = volume.statistics.occupiedBounds;
        const fallbackAnchor = occupied.minimum.map((minimum, axis) =>
            (minimum + occupied.maximum[axis]) * 0.5) as [number, number, number];
        let anchorCanonical = fallbackAnchor;
        let anchorDensity = 0;
        if (weightSum > 0 && maximumDensityByte > densityThreshold) {
            const centroid = weightedCoordinate.map((value) => value / weightSum);
            let bestScore = Number.POSITIVE_INFINITY;
            const coreThreshold = Math.max(
                densityThreshold + 1,
                Math.floor(maximumDensityByte * 0.72),
            );
            for (let z = 0; z < resolution; z += 1) {
                for (let y = 0; y < resolution; y += 1) {
                    for (let x = 0; x < resolution; x += 1) {
                        const byteIndex = (((volume.zOffset + z) * height +
                            volume.yOffset + y) * width + volume.xOffset + x) * 4;
                        const densityByte = atlasBytes[byteIndex];
                        if (densityByte < coreThreshold) continue;
                        const distance = (
                            (x - centroid[0]) ** 2 +
                            (y - centroid[1]) ** 2 +
                            (z - centroid[2]) ** 2
                        ) / (denominator * denominator);
                        const densityPenalty =
                            (maximumDensityByte - densityByte) /
                            Math.max(1, maximumDensityByte) * 0.08;
                        const score = distance + densityPenalty;
                        if (score < bestScore) {
                            bestScore = score;
                            anchorCanonical = [
                                x / denominator,
                                y / denominator,
                                z / denominator,
                            ];
                            anchorDensity = densityByte / 255;
                        }
                    }
                }
            }
        }
        const potential = volume.statistics.exteriorPotentialBounds;
        const potentialMinimum = potential
            ? potential.minimum.map((value) => value / denominator)
            : occupied.minimum;
        const potentialMaximum = potential
            ? potential.maximum.map((value) => value / denominator)
            : occupied.maximum;
        result.set(volume.id, {
            volumeId: volume.id,
            minimumCanonical: potentialMinimum.map((value, axis) =>
                Math.max(-0.13, Math.min(value,
                    occupied.minimum[axis]) - halfVoxel)) as [number, number, number],
            maximumCanonical: potentialMaximum.map((value, axis) =>
                Math.min(1.13, Math.max(value,
                    occupied.maximum[axis]) + halfVoxel)) as [number, number, number],
            anchorCanonical,
            anchorDensity,
        });
    }
    return result;
};

export const getCloudMacroConservativeSupport = (
    loaded: LoadedCloudMacroAtlas,
    volumeId: CloudMacroVolumeId,
) => {
    let supports = conservativeSupportCache.get(loaded);
    if (!supports) {
        supports = createCloudMacroConservativeSupports(loaded);
        conservativeSupportCache.set(loaded, supports);
    }
    const support = supports.get(volumeId);
    if (!support) throw new Error(`Cloud macro support ${volumeId} is unavailable`);
    return support;
};

interface TextureLike {
    createView?: (descriptor?: Record<string, unknown>) => unknown;
    destroy?: () => void;
}

interface CloudAtlasGpuDevice {
    createTexture: (descriptor: Record<string, unknown>) => TextureLike;
    queue: {
        writeTexture: (
            destination: Record<string, unknown>,
            data: Uint8Array,
            dataLayout: Record<string, number>,
            size: CloudAtlasDimensions,
        ) => void;
    };
}

export interface UploadedCloudMacroAtlas {
    atlasTexture: TextureLike;
    majorantTexture: TextureLike;
    /** Binding 32: guarded authored high-ice source density/coverage/moments RGBA8. */
    highIceSourceAtlasTexture: TextureLike;
    manifest: CloudMacroAtlasManifest;
    volumes: ReadonlyMap<CloudMacroVolumeId, CloudMacroVolumeEntry>;
    destroy: () => void;
}

const EXPECTED_IDS: readonly CloudMacroVolumeId[] = CLOUD_MACRO_VOLUME_IDS;

/**
 * Source IDs are an explicit ABI.  They intentionally exclude analytic
 * fibratus and every non-high-ice owner so a missing source slot can never be
 * interpreted as an authored zero-density volume by the shader.
 */
export const CLOUD_HIGH_ICE_SOURCE_IDS: readonly CloudMacroVolumeId[] = [
    "ci-uncinus",
    "ci-spissatus",
    "ci-floccus",
    "ci-castellanus",
    "cs-veil",
    "cs-fibratus",
    "cc-stratiformis",
    "cc-stratiformis-dispersive",
    "cc-castellanus",
    "cc-floccus",
    "cc-lenticularis",
];
export const CLOUD_HIGH_ICE_SOURCE_RESOLUTION = 96;

const isPositiveInteger = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0;

const validateManifest = (candidate: unknown): CloudMacroAtlasManifest => {
    if (!candidate || typeof candidate !== "object") {
        throw new Error("Cloud macro atlas manifest is not an object");
    }
    const manifest = candidate as CloudMacroAtlasManifest;
    if (manifest.schema !== "elements-cloud-macro-atlas" || manifest.version !== 2) {
        throw new Error(`Unsupported cloud macro atlas ${manifest.schema}@${manifest.version}`);
    }
    if (
        manifest.atlas?.format !== "rgba8unorm" ||
        manifest.majorants?.format !== "r8unorm" ||
        manifest.highIceSourceAtlas?.format !== "rgba8unorm" ||
        !isPositiveInteger(manifest.atlas.byteLength) ||
        !isPositiveInteger(manifest.majorants.byteLength) ||
        !isPositiveInteger(manifest.highIceSourceAtlas.byteLength)
    ) {
        throw new Error("Cloud macro atlas manifest has an invalid texture layout");
    }
    const sidecar = manifest.highIceMomentSidecar;
    if (sidecar && (
        sidecar.schema !== "elements-cloud-high-ice-moment-sidecar" ||
        sidecar.version !== 1 ||
        sidecar.format !== "rg8unorm" ||
        !isPositiveInteger(sidecar.byteLength) ||
        sidecar.filtering !== "linear" ||
        sidecar.volumeResolution !== manifest.atlas.volumeResolution ||
        sidecar.volumeCount !== manifest.atlas.volumeCount ||
        sidecar.zStride !== manifest.atlas.zStride ||
        sidecar.paddingZ !== manifest.atlas.paddingZ ||
        sidecar.dimensions.width !== manifest.atlas.dimensions.width ||
        sidecar.dimensions.height !== manifest.atlas.dimensions.height ||
        sidecar.dimensions.depthOrArrayLayers !==
            manifest.atlas.dimensions.depthOrArrayLayers ||
        sidecar.packing.kind !== manifest.atlas.packing.kind ||
        sidecar.packing.columns !== manifest.atlas.packing.columns ||
        sidecar.packing.rows !== manifest.atlas.packing.rows ||
        sidecar.packing.xStride !== manifest.atlas.packing.xStride ||
        sidecar.packing.zStride !== manifest.atlas.packing.zStride ||
        sidecar.sourceResolution !== manifest.atlas.volumeResolution * 2 ||
        !Array.isArray(sidecar.sourceIds) ||
        !sidecar.channels?.r ||
        !sidecar.channels?.g ||
        !/raw|second|E\[rho²\]|E\[rho\^2\]/i.test(
            `${sidecar.channels.r.semantic ?? ""} ${sidecar.channels.r.decode ?? ""}`,
        ) ||
        !/sample\s*\/\s*255/i.test(String(sidecar.channels.g.decode ?? "")) ||
        !/RG=0|both channels.*zero/i.test(sidecar.supportContract ?? "") ||
        sidecar.dimensions.width * sidecar.dimensions.height *
            sidecar.dimensions.depthOrArrayLayers * 2 !== sidecar.byteLength ||
        sidecar.dimensions.width > 2048 || sidecar.dimensions.height > 2048 ||
        sidecar.dimensions.depthOrArrayLayers > 2048 ||
        !/^[a-f0-9]{64}$/.test(manifest.checksums?.highIceMomentSidecar ?? "")
    )) {
        throw new Error("Cloud macro atlas has an invalid high-ice moment sidecar contract");
    }
    const source = manifest.highIceSourceAtlas;
    if (!source || typeof source !== "object" ||
        !source.guard || typeof source.guard !== "object" ||
        !source.packing || typeof source.packing !== "object" ||
        !Array.isArray(source.sourceIds)) {
        throw new Error("Cloud macro atlas has no high-ice source atlas contract");
    }
    const sourcePacking = source.packing;
    const sourceIds = source.sourceIds;
    const sourceIdSet = new Set(sourceIds);
    if (
        source.schema !== "elements-cloud-high-ice-source-atlas" ||
        source.version !== 1 ||
        source.layout !== "xyz-tiled-canonical-source-volumes" ||
        source.filtering !== "linear" ||
        !isPositiveInteger(source.sourceResolution) ||
        source.sourceResolution !== CLOUD_HIGH_ICE_SOURCE_RESOLUTION ||
        !isPositiveInteger(source.sourceCount) ||
        source.sourceCount !== sourceIds.length ||
        sourceIds.length !== CLOUD_HIGH_ICE_SOURCE_IDS.length ||
        CLOUD_HIGH_ICE_SOURCE_IDS.some((id, index) =>
            sourceIds[index] !== id || !sourceIdSet.has(id)) ||
        !isPositiveInteger(source.guardVoxels) ||
        source.guardVoxels !== source.guard.voxels ||
        source.guard.value !== 0 ||
        sourcePacking.kind !== "xyz-tiled-canonical-source-volumes" ||
        sourcePacking.sourceResolution !== source.sourceResolution ||
        sourcePacking.guardVoxels !== source.guardVoxels ||
        sourcePacking.xStride !== source.sourceResolution + source.guardVoxels * 2 ||
        sourcePacking.yStride !== source.sourceResolution + source.guardVoxels * 2 ||
        sourcePacking.zStride !== source.sourceResolution + source.guardVoxels * 2 ||
        sourcePacking.columns < 1 || sourcePacking.rows < 1 || sourcePacking.layers < 1 ||
        sourcePacking.slotCount < source.sourceCount ||
        sourcePacking.dimensions.width !== sourcePacking.columns * sourcePacking.xStride ||
        sourcePacking.dimensions.height !== sourcePacking.rows * sourcePacking.yStride ||
        sourcePacking.dimensions.depthOrArrayLayers !== sourcePacking.layers * sourcePacking.zStride ||
        source.dimensions.width !== sourcePacking.dimensions.width ||
        source.dimensions.height !== sourcePacking.dimensions.height ||
        source.dimensions.depthOrArrayLayers !== sourcePacking.dimensions.depthOrArrayLayers ||
        !source.sourceIdToSlot || typeof source.sourceIdToSlot !== "object" ||
        sourceIdSet.size !== sourceIds.length ||
        !Array.isArray(source.slots) || source.slots.length !== source.sourceCount ||
        !source.channels?.r || !source.channels?.g ||
        !/source.*density|authored.*density/i.test(
            `${source.channels.r.semantic ?? ""} ${source.channels.r.decode ?? ""}`,
        ) ||
        !/coverage/i.test(
            `${source.channels.g.semantic ?? ""} ${source.channels.g.decode ?? ""}`,
        ) ||
        !/second|moment|E\[rho/i.test(
            `${source.channels.b.semantic ?? ""} ${source.channels.b.decode ?? ""}`,
        ) ||
        !/occup|support/i.test(
            `${source.channels.a.semantic ?? ""} ${source.channels.a.decode ?? ""}`,
        ) ||
        !/^[a-f0-9]{64}$/.test(manifest.checksums?.highIceSourceAtlas ?? "")
    ) {
        throw new Error("Cloud macro atlas has an invalid high-ice source atlas contract");
    }
    const slotIds = new Set<CloudMacroVolumeId>();
    for (const slot of source.slots) {
        const expectedTile = {
            x: slot.slot % sourcePacking.columns,
            y: Math.floor(slot.slot / sourcePacking.columns) % sourcePacking.rows,
            z: Math.floor(slot.slot /
                (sourcePacking.columns * sourcePacking.rows)),
        };
        if (
            !Number.isInteger(slot.slot) || slot.slot < 0 ||
            slot.slot >= sourcePacking.slotCount ||
            !sourceIdSet.has(slot.id) || slotIds.has(slot.id) ||
            source.sourceIdToSlot?.[slot.id] !== slot.slot ||
            slot.tile?.x !== expectedTile.x ||
            slot.tile?.y !== expectedTile.y ||
            slot.tile?.z !== expectedTile.z ||
            slot.xOffset !== expectedTile.x * sourcePacking.xStride + source.guardVoxels ||
            slot.yOffset !== expectedTile.y * sourcePacking.yStride + source.guardVoxels ||
            slot.zOffset !== expectedTile.z * sourcePacking.zStride + source.guardVoxels ||
            !Number.isInteger(slot.xOffset) || !Number.isInteger(slot.yOffset) ||
            !Number.isInteger(slot.zOffset) ||
            slot.xOffset < source.guardVoxels ||
            slot.yOffset < source.guardVoxels ||
            slot.zOffset < source.guardVoxels ||
            slot.xOffset + source.sourceResolution + source.guardVoxels >
                source.dimensions.width ||
            slot.yOffset + source.sourceResolution + source.guardVoxels >
                source.dimensions.height ||
            slot.zOffset + source.sourceResolution + source.guardVoxels >
                source.dimensions.depthOrArrayLayers ||
            !/^[a-f0-9]{64}$/.test(slot.checksum ?? "") ||
            source.sourceChecksums?.[slot.id] !== slot.checksum
        ) {
            throw new Error(`Cloud high-ice source slot ${slot.id ?? "unknown"} is invalid`);
        }
        slotIds.add(slot.id);
    }
    if (slotIds.size !== source.sourceCount) {
        throw new Error("Cloud high-ice source slots do not cover every source ID");
    }
    if (
        manifest.majorants.semantic !== "conservative-potential-density-majorant" ||
        manifest.exteriorBoundary?.schema !== "elements-cloud-exterior-boundary" ||
        manifest.exteriorBoundary.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(manifest.checksums?.exteriorBoundary ?? "")
    ) {
        throw new Error("Cloud macro atlas has an invalid exterior-boundary contract");
    }
    const topologyExemplars = manifest.topologyExemplars;
    if (
        topologyExemplars?.schema !== "elements-cloud-topology-exemplars" ||
        topologyExemplars.version !== 1 ||
        topologyExemplars.logicalExemplarsPerSpecies !== 3 ||
        topologyExemplars.selection.cameraInvariant !== true ||
        topologyExemplars.selection.frameTimeInvariant !== true ||
        topologyExemplars.denseAssetBudget.maximumDepthSlices !== 2048 ||
        topologyExemplars.denseAssetBudget.usedDepthSlices !==
            manifest.atlas.dimensions.depthOrArrayLayers ||
        topologyExemplars.denseAssetBudget.remainingDepthSlices !==
            2048 - manifest.atlas.dimensions.depthOrArrayLayers
    ) {
        throw new Error("Cloud macro atlas has an invalid topology-exemplar contract");
    }
    const organizationManifolds = manifest.organizationManifolds;
    if (
        organizationManifolds?.schema !==
            "elements-cloud-organization-manifolds" ||
        organizationManifolds.version !== 1 ||
        organizationManifolds.rendererSpecies !==
            "stratocumulus-stratiformis" ||
        organizationManifolds.selection.seedRole !==
            "within-manifold variation only" ||
        organizationManifolds.manifolds.length !== 5 ||
        new Set(organizationManifolds.manifolds.map(({ volumeId }) =>
            volumeId)).size !== 5
    ) {
        throw new Error("Cloud macro atlas has an invalid organization-manifold contract");
    }
    const ids = new Set(manifest.volumes?.map((volume) => volume.id));
    if (
        manifest.volumes?.length !== EXPECTED_IDS.length ||
        EXPECTED_IDS.some((id) => !ids.has(id))
    ) {
        throw new Error("Cloud macro atlas is missing a required lifecycle volume");
    }
    if (
        manifest.atlas.dimensions.width *
            manifest.atlas.dimensions.height *
            manifest.atlas.dimensions.depthOrArrayLayers * 4 !== manifest.atlas.byteLength ||
        manifest.majorants.dimensions.width *
            manifest.majorants.dimensions.height *
            manifest.majorants.dimensions.depthOrArrayLayers !== manifest.majorants.byteLength ||
        source.dimensions.width *
            source.dimensions.height *
            source.dimensions.depthOrArrayLayers * 4 !== source.byteLength
    ) {
        throw new Error("Cloud macro atlas byte lengths do not match its dimensions");
    }
    if (
        manifest.atlas.dimensions.width > 2048 ||
        manifest.atlas.dimensions.height > 2048 ||
        manifest.atlas.dimensions.depthOrArrayLayers > 2048 ||
        source.dimensions.width > 2048 ||
        source.dimensions.height > 2048 ||
        source.dimensions.depthOrArrayLayers > 2048
    ) {
        throw new Error(
            "Cloud macro atlas exceeds WebGPU maxTextureDimension3D (2048)",
        );
    }
    for (const volume of manifest.volumes) {
        const formationMechanism = volume.formation?.mechanism;
        const formationCode = typeof formationMechanism === "string"
            ? (CLOUD_MACRO_FORMATION_CODE as Readonly<Record<string, number>>)[
                formationMechanism
            ]
            : undefined;
        const topologyPolicy = volume.formation?.topologyPolicy;
        const topologyCode = typeof topologyPolicy === "string"
            ? (CLOUD_MACRO_TOPOLOGY_CODE as Readonly<Record<string, number>>)[
                topologyPolicy
            ]
            : undefined;
        if (!Number.isFinite(formationCode) || !Number.isFinite(topologyCode)) {
            throw new Error(`Cloud macro volume ${volume.id} has an invalid formation ABI`);
        }
        if (
            !Number.isInteger(volume.xOffset) ||
            !Number.isInteger(volume.yOffset) ||
            !Number.isInteger(volume.zOffset) ||
            volume.xOffset < 0 || volume.yOffset < 0 || volume.zOffset < 0 ||
            volume.xOffset + manifest.atlas.volumeResolution >
                manifest.atlas.dimensions.width ||
            volume.yOffset + manifest.atlas.volumeResolution >
                manifest.atlas.dimensions.height ||
            volume.zOffset + manifest.atlas.volumeResolution >
                manifest.atlas.dimensions.depthOrArrayLayers ||
            volume.exteriorBoundary?.schema !== "elements-cloud-exterior-boundary" ||
            volume.exteriorBoundary.version !== 1 ||
            volume.exteriorBoundary.volumeResolution !== manifest.atlas.volumeResolution ||
            volume.exteriorBoundary.detailClasses.length < 1 ||
            volume.exteriorBoundary.detailClasses.some((id) =>
                !(id in manifest.exteriorBoundary.detailClasses))
        ) {
            throw new Error(`Cloud macro volume ${volume.id} has an invalid exterior boundary`);
        }
    }
    for (const species of topologyExemplars.species) {
        if (
            species.logicalExemplarCount !== 3 ||
            species.materializedExemplarCount < 1 ||
            species.materializedExemplarCount > 3 ||
            species.remainingLogicalExemplars !==
                3 - species.materializedExemplarCount ||
            species.materializedVolumeIds.some((id) => !ids.has(id)) ||
            species.ordinalVolumeIds?.length !== 3 ||
            species.ordinalVolumeIds.some((id) => !ids.has(id))
        ) {
            throw new Error(
                `Cloud topology exemplars for ${species.rendererSpecies} are invalid`,
            );
        }
    }
    return manifest;
};

/** Exported for asset-contract tests and diagnostic tooling. */
export const validateCloudMacroAtlasManifest = validateManifest;

export interface CloudHighIceSourceSampleTransform {
    scale: [number, number, number];
    offset: [number, number, number];
    slot: number;
}

/**
 * Derive the exact texel-centre transform for one guarded source tile.  The
 * manifest's slot offsets include the leading guard voxel; keeping this
 * calculation here prevents the CPU and WGSL paths from inventing a second
 * packing convention.
 */
export const getCloudHighIceSourceSampleTransform = (
    manifest: Pick<CloudMacroAtlasManifest, "highIceSourceAtlas">,
    volumeId: CloudMacroVolumeId,
): CloudHighIceSourceSampleTransform | undefined => {
    const source = manifest.highIceSourceAtlas;
    if (!source) return undefined;
    const slot = source.slots.find((entry) => entry.id === volumeId);
    if (!slot) return undefined;
    const { width, height, depthOrArrayLayers: depth } = source.dimensions;
    const denominator = Math.max(1, source.sourceResolution - 1);
    return {
        scale: [
            denominator / width,
            denominator / height,
            denominator / depth,
        ],
        offset: [
            (slot.xOffset + 0.5) / width,
            (slot.yOffset + 0.5) / height,
            (slot.zOffset + 0.5) / depth,
        ],
        slot: slot.slot,
    };
};

const fetchBytes = async (url: string, expectedBytes: number, signal?: AbortSignal) => {
    const response = await fetch(url, { cache: "force-cache", signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== expectedBytes) {
        throw new Error(`${url} contains ${bytes.byteLength} bytes; expected ${expectedBytes}`);
    }
    return bytes;
};

const versionedAssetUrl = (
    assetUrl: string,
    baseUrl: URL,
    checksum: string,
) => {
    const url = new URL(assetUrl, baseUrl);
    // The manifest is deliberately revalidated, while the 24 MB atlas payload
    // remains immutable for a specific checksum. This prevents a long-lived
    // preview/browser cache from pairing newly generated metadata with stale
    // binary volume bytes during local authoring.
    url.searchParams.set("sha256", checksum);
    return url.toString();
};

const sha256 = async (bytes: Uint8Array) => {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
};

const validateChecksum = async (label: string, bytes: Uint8Array, expected: string) => {
    const actual = await sha256(bytes);
    if (actual !== expected) {
        throw new Error(`${label} checksum mismatch: received ${actual}; expected ${expected}`);
    }
};

const exteriorBoundaryChecksumBytes = (manifest: CloudMacroAtlasManifest) =>
    new TextEncoder().encode(JSON.stringify({
        contract: manifest.exteriorBoundary,
        volumes: manifest.volumes.map((volume) => ({
            id: volume.id,
            exteriorBoundary: volume.exteriorBoundary,
        })),
    }));

let cachedAtlas: Promise<LoadedCloudMacroAtlas> | undefined;

export const loadCloudMacroAtlas = ({
    manifestUrl = CLOUD_MACRO_ATLAS_MANIFEST_URL,
    signal,
    verifyChecksums = true,
}: {
    manifestUrl?: string;
    signal?: AbortSignal;
    verifyChecksums?: boolean;
} = {}): Promise<LoadedCloudMacroAtlas> => {
    // Abortable or non-default requests must not poison the process-wide cache.
    const cacheable = manifestUrl === CLOUD_MACRO_ATLAS_MANIFEST_URL && !signal && verifyChecksums;
    if (cacheable && cachedAtlas) return cachedAtlas;
    const request = (async () => {
        const manifestResponse = await fetch(manifestUrl, {
            cache: "no-cache",
            signal,
        });
        if (!manifestResponse.ok) {
            throw new Error(`${manifestUrl} returned ${manifestResponse.status}`);
        }
        const manifest = validateManifest(await manifestResponse.json());
        const baseUrl = new URL(manifestUrl, window.location.href);
        const atlasUrl = versionedAssetUrl(
            manifest.atlas.url,
            baseUrl,
            manifest.checksums.atlas,
        );
        const majorantUrl = versionedAssetUrl(
            manifest.majorants.url,
            baseUrl,
            manifest.checksums.majorants,
        );
        const highIceSourceAtlasUrl = versionedAssetUrl(
            manifest.highIceSourceAtlas.url,
            baseUrl,
            manifest.checksums.highIceSourceAtlas,
        );
        const [atlasBytes, majorantBytes, highIceSourceAtlasBytes] = await Promise.all([
            fetchBytes(atlasUrl, manifest.atlas.byteLength, signal),
            fetchBytes(majorantUrl, manifest.majorants.byteLength, signal),
            fetchBytes(
                highIceSourceAtlasUrl,
                manifest.highIceSourceAtlas.byteLength,
                signal,
            ),
        ]);
        if (verifyChecksums) {
            await Promise.all([
                validateChecksum("Cloud macro atlas", atlasBytes, manifest.checksums.atlas),
                validateChecksum("Cloud macro majorants", majorantBytes, manifest.checksums.majorants),
                validateChecksum(
                    "Cloud high-ice source atlas",
                    highIceSourceAtlasBytes,
                    manifest.checksums.highIceSourceAtlas,
                ),
                validateChecksum(
                    "Cloud macro exterior boundary",
                    exteriorBoundaryChecksumBytes(manifest),
                    manifest.checksums.exteriorBoundary,
                ),
            ]);
        }
        return {
            manifest,
            atlasBytes,
            majorantBytes,
            highIceSourceAtlasBytes,
            volumes: new Map(manifest.volumes.map((volume) => [volume.id, volume])),
        };
    })();
    if (cacheable) {
        cachedAtlas = request.catch((error) => {
            cachedAtlas = undefined;
            throw error;
        });
        return cachedAtlas;
    }
    return request;
};

const alignTo = (value: number, alignment: number) =>
    Math.ceil(value / alignment) * alignment;

const packTextureRowsForWebGPU = (
    bytes: Uint8Array,
    dimensions: CloudAtlasDimensions,
    bytesPerTexel: number,
) => {
    const sourceBytesPerRow = dimensions.width * bytesPerTexel;
    const bytesPerRow = alignTo(sourceBytesPerRow, 256);
    if (bytesPerRow === sourceBytesPerRow) return { bytes, bytesPerRow };
    const packed = new Uint8Array(
        bytesPerRow * dimensions.height * dimensions.depthOrArrayLayers,
    );
    for (let z = 0; z < dimensions.depthOrArrayLayers; z += 1) {
        for (let y = 0; y < dimensions.height; y += 1) {
            const sourceOffset = (z * dimensions.height + y) * sourceBytesPerRow;
            const targetOffset = (z * dimensions.height + y) * bytesPerRow;
            packed.set(bytes.subarray(sourceOffset, sourceOffset + sourceBytesPerRow), targetOffset);
        }
    }
    return { bytes: packed, bytesPerRow };
};

/** Packs RGBA8 atlas rows when compact macro resolutions are not 64-voxel aligned. */
export const packCloudAtlasForWebGPU = (
    bytes: Uint8Array,
    dimensions: CloudAtlasDimensions,
) => packTextureRowsForWebGPU(bytes, dimensions, 4);

/** Packs tightly stored R8 rows for WebGPU's 256-byte upload alignment. */
export const packCloudMajorantsForWebGPU = (
    bytes: Uint8Array,
    dimensions: CloudAtlasDimensions,
) => {
    return packTextureRowsForWebGPU(bytes, dimensions, 1);
};

/** Packs guarded RGBA8 high-ice source/coverage/moment rows for 256-byte alignment. */
export const packCloudHighIceSourceAtlasForWebGPU = (
    bytes: Uint8Array,
    dimensions: CloudAtlasDimensions,
) => packTextureRowsForWebGPU(bytes, dimensions, 4);

/** @deprecated Offline tests may still use the old helper name. */
export const packCloudHighIceMomentSidecarForWebGPU =
    (bytes: Uint8Array, dimensions: CloudAtlasDimensions) =>
        packTextureRowsForWebGPU(bytes, dimensions, 2);

/** Creates and uploads the macro, majorant, and high-ice source 3D textures. */
export const uploadCloudMacroAtlas = (
    device: CloudAtlasGpuDevice,
    loaded: LoadedCloudMacroAtlas,
    usage = 0x02 | 0x04, // GPUTextureUsage.COPY_DST | TEXTURE_BINDING
): UploadedCloudMacroAtlas => {
    const { manifest } = loaded;
    const atlasTexture = device.createTexture({
        label: "cloud macro lifecycle atlas",
        size: manifest.atlas.dimensions,
        dimension: "3d",
        format: manifest.atlas.format,
        mipLevelCount: 1,
        usage,
    });
    const packedAtlas = packCloudAtlasForWebGPU(
        loaded.atlasBytes,
        manifest.atlas.dimensions,
    );
    device.queue.writeTexture(
        { texture: atlasTexture },
        packedAtlas.bytes,
        {
            offset: 0,
            bytesPerRow: packedAtlas.bytesPerRow,
            rowsPerImage: manifest.atlas.dimensions.height,
        },
        manifest.atlas.dimensions,
    );

    const packedMajorants = packCloudMajorantsForWebGPU(
        loaded.majorantBytes,
        manifest.majorants.dimensions,
    );
    const majorantTexture = device.createTexture({
        label: "cloud macro conservative majorants",
        size: manifest.majorants.dimensions,
        dimension: "3d",
        format: manifest.majorants.format,
        mipLevelCount: 1,
        usage,
    });
    device.queue.writeTexture(
        { texture: majorantTexture },
        packedMajorants.bytes,
        {
            offset: 0,
            bytesPerRow: packedMajorants.bytesPerRow,
            rowsPerImage: manifest.majorants.dimensions.height,
        },
        manifest.majorants.dimensions,
    );
    const packedHighIceSourceAtlas = packCloudHighIceSourceAtlasForWebGPU(
        loaded.highIceSourceAtlasBytes,
        manifest.highIceSourceAtlas.dimensions,
    );
    const highIceSourceAtlasTexture = device.createTexture({
        label: "cloud high-ice authored source density/coverage atlas",
        size: manifest.highIceSourceAtlas.dimensions,
        dimension: "3d",
        format: manifest.highIceSourceAtlas.format,
        mipLevelCount: 1,
        usage,
    });
    device.queue.writeTexture(
        { texture: highIceSourceAtlasTexture },
        packedHighIceSourceAtlas.bytes,
        {
            offset: 0,
            bytesPerRow: packedHighIceSourceAtlas.bytesPerRow,
            rowsPerImage: manifest.highIceSourceAtlas.dimensions.height,
        },
        manifest.highIceSourceAtlas.dimensions,
    );
    return {
        atlasTexture,
        majorantTexture,
        highIceSourceAtlasTexture,
        manifest,
        volumes: loaded.volumes,
        destroy: () => {
            atlasTexture.destroy?.();
            majorantTexture.destroy?.();
            highIceSourceAtlasTexture.destroy?.();
        },
    };
};

export const getCloudMacroVolume = (
    atlas: Pick<LoadedCloudMacroAtlas, "volumes">,
    id: CloudMacroVolumeId,
) => {
    const volume = atlas.volumes.get(id);
    if (!volume) throw new Error(`Cloud macro volume ${id} is unavailable`);
    return volume;
};

const SPECIES_VOLUME_LOOKUP: Readonly<Record<string, CloudMacroVolumeId>> = {
    "cumulus-humilis": "cu-humilis",
    "cumulus-mediocris": "cu-mediocris",
    "cumulus-congestus": "cu-congestus",
    "cumulus-fractus": "cu-fractus",
    "cumulonimbus-calvus": "cb-calvus",
    "cumulonimbus-capillatus": "cb-capillatus",
    "cumulonimbus-capillatus-incus": "cb-capillatus-incus",
    "cirrus-fibratus": "ci-fibratus",
    "cirrus-uncinus": "ci-uncinus",
    "cirrus-spissatus": "ci-spissatus",
    "cirrus-floccus": "ci-floccus",
    "cirrus-castellanus": "ci-castellanus",
    "cirrostratus-fibratus": "cs-fibratus",
    "cirrostratus-nebulosus": "cs-veil",
    "cirrocumulus-stratiformis": "cc-stratiformis",
    "cirrocumulus-castellanus": "cc-castellanus",
    "cirrocumulus-floccus": "cc-floccus",
    "cirrocumulus-lenticularis": "cc-lenticularis",
    "altocumulus-stratiformis": "ac-stratiformis",
    "altocumulus-castellanus": "ac-castellanus",
    "altocumulus-floccus": "ac-floccus",
    "altocumulus-lenticularis": "ac-lenticularis",
    "altocumulus-volutus": "ac-volutus",
    "altostratus-opacus": "as-opacus",
    "nimbostratus-praecipitatio": "ns-precipitating",
    "stratocumulus-stratiformis": "sc-stratiformis",
    "stratocumulus-castellanus": "sc-castellanus",
    "stratocumulus-floccus": "sc-floccus",
    "stratocumulus-lenticularis": "sc-lenticularis",
    "stratocumulus-volutus": "sc-volutus",
    "stratus-nebulosus": "st-nebulosus",
    "stratus-fractus": "st-fractus",
};

const GENUS_DEFAULT_VOLUME: Readonly<Record<CloudMacroGenus, CloudMacroVolumeId>> = {
    cirrus: "ci-fibratus",
    cirrocumulus: "cc-stratiformis",
    cirrostratus: "cs-veil",
    altocumulus: "ac-stratiformis",
    altostratus: "as-opacus",
    nimbostratus: "ns-precipitating",
    stratocumulus: "sc-stratiformis",
    stratus: "st-nebulosus",
    cumulus: "cu-mediocris",
    cumulonimbus: "cb-capillatus",
};

export interface CloudMacroVolumeSelection {
    genus: CloudMacroGenus;
    /** Accepts either a WMO suffix (`fibratus`) or renderer key (`cirrus-fibratus`). */
    species?: string | null;
    supplementaryFeatures?: readonly string[];
    /** Orthogonal WMO varieties that require a distinct dense macrovolume. */
    varieties?: readonly string[];
    lifecycleStage?: string;
    /** Authoritative physical Sc organization; never selected from a seed. */
    organizationRegime?: StratocumulusStratiformisOrganizationRegime;
    /** Camera-independent relationship between the observer and finite domain. */
    placementRegime?: CloudSystemPlacementMode;
    /** Authoritative low-layer parent-shield cause, independent of fall state. */
    nimbostratusParentTopologyVariantId?: string;
    /** Stable owner index used only to choose among equal-species macroforms. */
    deterministicVariant?: number;
    /** Stable scene/day seed. Used when no preselected exemplar ordinal is supplied. */
    deterministicSceneSeed?: number | string | readonly number[];
    /** Stable finite-owner identity; camera and frame state are not admissible. */
    deterministicOwnerSeed?: number | string;
}

export interface CloudMacroVolumeCandidateSet {
    volumeIds: readonly CloudMacroVolumeId[];
    /** Three species-qualified causal exemplars are addressable by the stable ordinal. */
    logicalExemplarCount: 3;
    materialization: "dense-multi-exemplar" | "canonical-plus-logical-exemplars";
}

const stableSelectionHash = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const stableSelectionSeedText = (
    seed: CloudMacroVolumeSelection["deterministicSceneSeed"],
) => Array.isArray(seed)
    ? seed.map((value) => Number(value).toPrecision(12)).join(":")
    : String(seed);

/**
 * Reports physical atlas choices separately from logical causal exemplars.
 * This makes the bounded dense-asset ceiling observable instead of silently
 * pretending that rotated copies are distinct macroshapes.
 */
export const cloudMacroVolumeCandidates = ({
    genus,
    species,
    supplementaryFeatures = [],
    varieties = [],
    lifecycleStage,
    organizationRegime,
    placementRegime,
    nimbostratusParentTopologyVariantId,
}: CloudMacroVolumeSelection): CloudMacroVolumeCandidateSet => {
    let volumeIds: readonly CloudMacroVolumeId[];
    if (genus === "cumulonimbus") {
        if (lifecycleStage === "decaying") {
            volumeIds = ["cb-dissipating", "cb-dissipating-remnant"];
        } else if (supplementaryFeatures.includes("incus") || species?.includes("incus")) {
            volumeIds = ["cb-capillatus-incus", "cb-capillatus-incus-back-sheared"];
        } else if (species?.includes("capillatus")) {
            volumeIds = ["cb-capillatus", "cb-capillatus-sheared"];
        } else {
            volumeIds = ["cb-calvus", "cb-calvus-multicell"];
        }
    } else if (genus === "nimbostratus") {
        volumeIds = nimbostratusParentTopologyVariantId ===
            "deepening-altostratus-shield"
            ? ["ns-deepening-altostratus-shield"]
            : nimbostratusParentTopologyVariantId ===
                "thickened-low-deck-nimbostratus"
                ? ["ns-thickened-low-deck-shield"]
                : nimbostratusParentTopologyVariantId ===
                    "generating-cell-stratiform-shield"
                    ? ["ns-generating-cell-shield"]
                    : ["ns-precipitating"];
    } else if (genus === "altostratus" && varieties.includes("translucidus")) {
        volumeIds = ["as-translucidus"];
    } else {
        const normalizedSpecies = species
            ? (species.startsWith(`${genus}-`) ? species : `${genus}-${species}`)
            : null;
        if (normalizedSpecies === "cumulus-congestus") {
            volumeIds = [
                "cu-congestus", "cu-congestus-turreted", "cu-congestus-multicell",
            ];
        } else if (normalizedSpecies === "cirrocumulus-stratiformis") {
            volumeIds = ["cc-stratiformis", "cc-stratiformis-dispersive"];
        } else if (normalizedSpecies === "cirrus-fibratus") {
            volumeIds = [
                "ci-fibratus",
                "ci-fibratus-depth-shear",
                "ci-fibratus-split-source",
            ];
        } else if (normalizedSpecies === "stratocumulus-stratiformis") {
            volumeIds = organizationRegime === "open-cell"
                ? ["sc-stratiformis-open-field"]
                : organizationRegime === "street"
                    ? ["sc-stratiformis-street-packet"]
                    : organizationRegime === "sparse-transition"
                        ? ["sc-stratiformis-transition-mosaic"]
                        : placementRegime === "immediate-overcast"
                            ? ["sc-stratiformis-closed-overhead"]
                            : ["sc-stratiformis"];
        } else {
            volumeIds = [(normalizedSpecies && SPECIES_VOLUME_LOOKUP[normalizedSpecies]) ||
                GENUS_DEFAULT_VOLUME[genus]];
        }
    }
    return {
        volumeIds,
        logicalExemplarCount: 3,
        materialization: volumeIds.length > 1
            ? "dense-multi-exemplar"
            : "canonical-plus-logical-exemplars",
    };
};

/**
 * Resolves physical classification to a canonical topology volume. Runtime
 * scale, organization, condensate, and lifecycle interpolation remain separate
 * and must not be baked into this classification lookup.
 */
export const selectCloudMacroVolumeId = ({
    genus,
    species,
    supplementaryFeatures = [],
    varieties = [],
    lifecycleStage,
    organizationRegime,
    placementRegime,
    nimbostratusParentTopologyVariantId,
    deterministicVariant,
    deterministicSceneSeed,
    deterministicOwnerSeed = 0,
}: CloudMacroVolumeSelection): CloudMacroVolumeId => {
    const candidates = cloudMacroVolumeCandidates({
        genus, species, supplementaryFeatures, varieties, lifecycleStage,
        organizationRegime, placementRegime,
        nimbostratusParentTopologyVariantId,
    }).volumeIds;
    const stableVariant = deterministicVariant !== undefined &&
        Number.isFinite(deterministicVariant)
        ? Math.abs(Math.trunc(deterministicVariant))
        : deterministicSceneSeed !== undefined
            ? stableSelectionHash(
                `${genus}|${species ?? "generic"}|` +
                `${stableSelectionSeedText(deterministicSceneSeed)}|` +
                `${String(deterministicOwnerSeed)}`,
            )
            : 0;
    return candidates[stableVariant % candidates.length];
};

export const getCloudMacroVolumeForClassification = (
    atlas: Pick<LoadedCloudMacroAtlas, "volumes">,
    selection: CloudMacroVolumeSelection,
) => getCloudMacroVolume(atlas, selectCloudMacroVolumeId(selection));

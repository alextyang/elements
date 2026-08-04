import type { RuntimeCloudSystem } from "./cloud-system-runtime.ts";
import type {
    CloudMorphologyBounds,
    PackedCloudMorphologyModifiers,
} from "./cloud-morphology-modifiers.ts";
import type { CloudMacroVolumeEntry } from "./cloud-volume-atlas.ts";
import {
    CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR,
    CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL,
    CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED,
    CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG,
    CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG,
    CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
    createCloudLightVolumeOwnerMask,
    createCloudLightVolumeBrick,
    evaluateCloudLightVolumeDirectFieldResolution,
    packCloudLightVolumeBricks,
    type CloudLightVolumeBoundaryKind,
    type CloudLightVolumeBrick,
    type CloudLightVolumeDirectSource,
    type CloudLightVolumeDirectFieldResolution,
    type CloudLightVolumeGridConfig,
    type CloudLightVolumeOwnerMask,
    type CloudLightVolumeVec3,
} from "./cloud-light-volume.ts";

export type CloudLightVolumePlainFibratusIneligibilityReason =
    | "missing-runtime-owner"
    | "not-ci-fibratus"
    | "missing-macro-volume"
    | "macro-volume-not-ci-fibratus"
    | "formation-not-sheared-ice-sedimentation"
    | "topology-not-fragmented-population"
    | "owner-medium-is-resident"
    | "missing-ordinary-morphology-range"
    | "ordinary-morphology-range-not-empty"
    | "missing-fibratus-descriptor-range"
    | "fibratus-descriptor-count-out-of-range"
    | "fibratus-descriptors-dropped"
    | "fibratus-descriptor-range-invalid"
    | "fibratus-descriptor-owner-mismatch";

export interface CloudLightVolumePlainFibratusOwnerEligibility {
    ownerIndex: number;
    eligible: boolean;
    reasons: readonly CloudLightVolumePlainFibratusIneligibilityReason[];
}

export interface CloudLightVolumePlainFibratusEligibilityInput {
    systems: readonly RuntimeCloudSystem[];
    /** Exact macro volumes selected for these runtime owners. */
    macroVolumesByOwner: ReadonlyMap<number, CloudMacroVolumeEntry>;
    /** The same immutable payload uploaded to cloud_morphology_texture. */
    morphology: Pick<PackedCloudMorphologyModifiers,
        "ownerRanges" | "fibratusOwnerRanges" | "fibratusDescriptors">;
    /**
     * Final retained bricks, after direct-only owners clear the resident-source
     * flag. The publication owner mask is not equivalent to medium residency.
     */
    retainedBricks: readonly Pick<CloudLightVolumeBrick,
        "ownerIndex" | "samplingFlags">[];
}

export interface CloudLightVolumePlainFibratusEligibility {
    owners: readonly CloudLightVolumePlainFibratusOwnerEligibility[];
    eligibleOwnerIndices: readonly number[];
    retainedOwnerCount: number;
    allRetainedOwnersSafe: boolean;
}

/**
 * Proves when source materialization can use the statically pruned, plain
 * Ci-fibratus query. Every checked fact changes the reachable WGSL semantics:
 * an unqualified owner must remain on the complete morphology/material path.
 */
export const qualifyCloudLightVolumePlainFibratusSourcePath = ({
    systems,
    macroVolumesByOwner,
    morphology,
    retainedBricks,
}: CloudLightVolumePlainFibratusEligibilityInput):
CloudLightVolumePlainFibratusEligibility => {
    const retainedOwners = [...new Set(retainedBricks.map(({ ownerIndex }) =>
        ownerIndex))]
        .sort((left, right) => left - right);
    const owners = retainedOwners.map((ownerIndex) => {
        const reasons: CloudLightVolumePlainFibratusIneligibilityReason[] = [];
        const system = systems[ownerIndex];
        if (!system) {
            reasons.push("missing-runtime-owner");
        } else {
            const classification = system.state.classification;
            if (classification.genus !== "cirrus" ||
                classification.species !== "fibratus" ||
                system.compiled.recipeId !== "cirrus-fibratus") {
                reasons.push("not-ci-fibratus");
            }
            if (system.topologyExemplar.connectivity !==
                "fragmented-population") {
                reasons.push("topology-not-fragmented-population");
            }
        }

        const volume = macroVolumesByOwner.get(ownerIndex);
        if (!volume) {
            reasons.push("missing-macro-volume");
        } else {
            if (volume.classification.genus !== "cirrus" ||
                volume.classification.species !== "fibratus") {
                reasons.push("macro-volume-not-ci-fibratus");
            }
            if (volume.formation.mechanism !==
                "sheared-ice-sedimentation") {
                reasons.push("formation-not-sheared-ice-sedimentation");
            }
            if (volume.formation.topologyPolicy !==
                "fragmented-population") {
                reasons.push("topology-not-fragmented-population");
            }
        }

        if (retainedBricks.some((brick) => brick.ownerIndex === ownerIndex &&
            (brick.samplingFlags &
                CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG) !== 0)) {
            reasons.push("owner-medium-is-resident");
        }

        const ordinaryRange = morphology.ownerRanges.find((range) =>
            range.ownerIndex === ownerIndex);
        if (!ordinaryRange) {
            reasons.push("missing-ordinary-morphology-range");
        } else if (ordinaryRange.count !== 0) {
            reasons.push("ordinary-morphology-range-not-empty");
        }

        const fibratusRange = morphology.fibratusOwnerRanges.find((range) =>
            range.ownerIndex === ownerIndex);
        if (!fibratusRange) {
            reasons.push("missing-fibratus-descriptor-range");
        } else {
            if (fibratusRange.count < 6 || fibratusRange.count > 8) {
                reasons.push("fibratus-descriptor-count-out-of-range");
            }
            if (fibratusRange.dropped !== 0) {
                reasons.push("fibratus-descriptors-dropped");
            }
            const rangeValid = Number.isInteger(fibratusRange.offset) &&
                Number.isInteger(fibratusRange.count) &&
                fibratusRange.offset >= 0 && fibratusRange.count >= 0 &&
                fibratusRange.offset + fibratusRange.count <=
                    morphology.fibratusDescriptors.length;
            if (!rangeValid) {
                reasons.push("fibratus-descriptor-range-invalid");
            } else if (morphology.fibratusDescriptors.slice(
                fibratusRange.offset,
                fibratusRange.offset + fibratusRange.count,
            ).some((descriptor) => descriptor.ownerIndex !== ownerIndex)) {
                reasons.push("fibratus-descriptor-owner-mismatch");
            }
        }

        return {
            ownerIndex,
            eligible: reasons.length === 0,
            reasons: [...new Set(reasons)],
        };
    });
    const eligibleOwnerIndices = owners
        .filter(({ eligible }) => eligible)
        .map(({ ownerIndex }) => ownerIndex);
    return {
        owners,
        eligibleOwnerIndices,
        retainedOwnerCount: owners.length,
        allRetainedOwnersSafe: owners.every(({ eligible }) => eligible),
    };
};

const PLANET_RADIUS_KM = 6_371;
const TARGET_TILE_HALF_EXTENT_KM = [1.44, 0.8, 1.44] as const;
const OVERLAP_CELLS = 2;
const WHOLE_SUPPORT_PADDING_CELLS = 2;
const WHOLE_SUPPORT_MAXIMUM_CELL_OPTICAL_DEPTH = 0.75;
const WHOLE_SUPPORT_MAXIMUM_EXACT_FOOTPRINT_OPTICAL_DEPTH = 1.5;
const WHOLE_SUPPORT_MAXIMUM_EXACT_AXIS_KM = 0.30;
// Direct-disc activity is scheduling metadata only. Source irradiance remains
// byte-for-byte TOA radiometry in the packed source record.
export const CLOUD_LIGHT_VOLUME_SOURCE_ABSOLUTE_IRRADIANCE_THRESHOLD = 1e-10;
export const CLOUD_LIGHT_VOLUME_DAYLIGHT_RELATIVE_SOURCE_THRESHOLD = 1e-5;
export const CLOUD_LIGHT_VOLUME_DAYLIGHT_SUN_ELEVATION_RADIANS =
    6 * Math.PI / 180;
// Upper-limb radius plus near-horizon refraction and a small numerical margin.
export const CLOUD_LIGHT_VOLUME_SOURCE_HORIZON_MARGIN_RADIANS =
    1 * Math.PI / 180;
const SHEET_TOPOLOGIES = new Set([
    "layered-veil",
    "precipitating-sheet",
    "boundary-layer-sheet",
]);
const WHOLE_SUPPORT_TOPOLOGIES = new Set([
    // A thermal owner is one finite causal cloud. Keeping its complete
    // conservative support in one low-frequency P1 domain is both more
    // physical and cheaper than publishing disconnected partial tiles.
    "thermal-field",
]);

const add3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3):
CloudLightVolumeVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (v: CloudLightVolumeVec3, scale: number):
CloudLightVolumeVec3 => [v[0] * scale, v[1] * scale, v[2] * scale];
const dot3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length3 = (v: CloudLightVolumeVec3) => Math.hypot(v[0], v[1], v[2]);
const normalize3 = (v: CloudLightVolumeVec3, fallback: CloudLightVolumeVec3):
CloudLightVolumeVec3 => {
    const length = length3(v);
    return length > 1e-9 ? scale3(v, 1 / length) : fallback;
};
const cross3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3):
CloudLightVolumeVec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** [east, altitude, north] to the renderer's curved Earth-relative world. */
const morphologyPointToWorld = (
    point: CloudLightVolumeVec3,
): CloudLightVolumeVec3 => {
    const radius = PLANET_RADIUS_KM + point[1];
    return [point[0], Math.sqrt(Math.max(1,
        radius * radius - point[0] * point[0] - point[2] * point[2])), point[2]];
};

interface OwnerDomain {
    ownerIndex: number;
    layerIndex: number;
    center: CloudLightVolumeVec3;
    halfExtent: CloudLightVolumeVec3;
    axes: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
        CloudLightVolumeVec3];
    system: RuntimeCloudSystem;
}

export interface CloudLightVolumeSourceSupportSphere {
    centerWorldKm: CloudLightVolumeVec3;
    radiusKm: number;
}

export interface CloudLightVolumeMacroSupport {
    /** Stable atlas identity, retained in the immutable solve signature. */
    volumeId?: string;
    /** Conservative interior + legal procedural-exterior canonical support. */
    minimumCanonical: CloudLightVolumeVec3;
    maximumCanonical: CloudLightVolumeVec3;
    /** An actually occupied dense-core canonical point. */
    anchorCanonical: CloudLightVolumeVec3;
}

interface OwnerSupportDomain {
    anchorLocal: CloudLightVolumeVec3;
    minimumLocal: CloudLightVolumeVec3;
    maximumLocal: CloudLightVolumeVec3;
}

interface TileCandidate {
    key: string;
    ownerIndex: number;
    center: CloudLightVolumeVec3;
    halfExtent: CloudLightVolumeVec3;
    axes: OwnerDomain["axes"];
    grid: readonly [number, number, number];
    counts: readonly [number, number, number];
    faceBoundaryKind: readonly CloudLightVolumeBoundaryKind[];
    ownerDomain: OwnerDomain;
    localCenter: CloudLightVolumeVec3;
    score: number;
}

const CLOUD_LIGHT_VOLUME_FACE_OFFSETS = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
] as const;

export interface CloudLightVolumeInternalHaloTile {
    ownerIndex: number;
    grid: readonly [number, number, number];
    counts: readonly [number, number, number];
    faceBoundaryKind: readonly CloudLightVolumeBoundaryKind[];
}

/**
 * Proves that every internal finite-volume face has the selected, reciprocal
 * sibling required by the diffusion stencil. A missing sibling is not an
 * exterior/vacuum boundary: publishing that brick would turn a cache-layout
 * error into a rectangular energy sink visible to the camera.
 */
export const qualifyCloudLightVolumeInternalHaloTopology = (
    tiles: readonly CloudLightVolumeInternalHaloTile[],
) => {
    const key = (ownerIndex: number, grid: readonly number[]) =>
        `${ownerIndex}:${grid[0]}:${grid[1]}:${grid[2]}`;
    const selected = new Map(tiles.map((tile) => [
        key(tile.ownerIndex, tile.grid), tile,
    ]));
    const invalidOwnerIndices = new Set<number>();
    const reasons: string[] = [];
    for (const tile of tiles) {
        for (let face = 0; face < CLOUD_LIGHT_VOLUME_FACE_OFFSETS.length;
            face += 1) {
            if (tile.faceBoundaryKind[face] !==
                CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL) continue;
            const offset = CLOUD_LIGHT_VOLUME_FACE_OFFSETS[face];
            const neighborGrid = [
                tile.grid[0] + offset[0],
                tile.grid[1] + offset[1],
                tile.grid[2] + offset[2],
            ] as const;
            const inside = neighborGrid.every((value, axis) =>
                value >= 0 && value < tile.counts[axis]);
            const sibling = inside
                ? selected.get(key(tile.ownerIndex, neighborGrid))
                : undefined;
            const reciprocalFace = face ^ 1;
            if (!sibling || sibling.faceBoundaryKind[reciprocalFace] !==
                CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL) {
                invalidOwnerIndices.add(tile.ownerIndex);
                reasons.push(`owner-${tile.ownerIndex}-grid-${tile.grid.join("-")}` +
                    `-face-${face}-missing-reciprocal-internal-halo`);
            }
        }
    }
    return {
        valid: reasons.length === 0,
        invalidOwnerIndices: [...invalidOwnerIndices].sort((a, b) => a - b),
        reasons,
    };
};

export interface CloudLightVolumeRuntimeInput {
    systems: readonly RuntimeCloudSystem[];
    sources: readonly CloudLightVolumeDirectSource[];
    /** Include atmosphere/source state so its change schedules a fresh solve. */
    lightingSignature: string;
    /** Conservative base + additive/reuse morphology bounds by owner. */
    morphologyBoundsByOwner?: ReadonlyMap<number, CloudMorphologyBounds>;
    /** Manifest-derived conservative macro support and occupied core anchor. */
    macroSupportByOwner?: ReadonlyMap<number, CloudLightVolumeMacroSupport>;
    /** Curved renderer-world observer position; defaults to sea-level origin. */
    observerPositionKm?: CloudLightVolumeVec3;
    config?: CloudLightVolumeGridConfig;
}

export interface CloudLightVolumeRuntime {
    signature: string;
    /** TOA source records with only their construction-activity lane resolved. */
    sources: readonly CloudLightVolumeDirectSource[];
    bricks: readonly CloudLightVolumeBrick[];
    /** Selected geometric candidates before direct/P1 publication pruning. */
    candidateBricks: readonly CloudLightVolumeBrick[];
    packedBricks: ReturnType<typeof packCloudLightVolumeBricks>;
    brickKeys: readonly string[];
    selectedOwnerCount: number;
    /** Owners whose complete conservative condensate support is tiled. */
    fullyResidentOwnerCount: number;
    /** Selected owners with only a strict spatial subset of support tiled. */
    partiallyResidentOwnerCount: number;
    /** Exact morphology/material queries after representative-owner source dedup. */
    exactMediumQueriesPerRefresh: number;
    /** Production remains exact until conservative per-block evidence exists. */
    exactSamplingBrickCount: number;
    /** Reserved diagnostic; owner-level topology/material inference never increments it. */
    filteredSamplingBrickCount: number;
    /** Reserved diagnostic; requires every sampled block of an owner to qualify. */
    filteredSamplingOwnerCount: number;
    candidateBrickCount: number;
    /** Tiles intersecting conservative condensate support across all owners. */
    requiredBrickCount: number;
    materializedCandidateCount: number;
    sheetOwnerCount: number;
    selectedSheetOwnerCount: number;
    /** Retained ABI diagnostic; production no longer categorically excludes sheets. */
    excludedSheetOwnerCount: number;
    /** Per-owner active Sun/Moon direct-grid resolution and publication decision. */
    directFieldQualifications: readonly (CloudLightVolumeDirectFieldResolution & {
        ownerIndex: number;
    })[];
    directQualifiedOwnerCount: number;
    /** Selected owners kept on exact same-layer source tracing. */
    exactCameraTracingOwnerCount: number;
    /**
     * Layers whose every finite owner is both fully tiled and direct-qualified.
     * An under-resolved reduced beam cannot publish a camera-visible P1 basis.
     */
    residentLayerMask: number;
    /** Direct-qualified physical owners whose Beer fields are in the published bank. */
    residentOwnerMask: CloudLightVolumeOwnerMask;
}

const ownerDomainFor = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
): OwnerDomain => {
    const extent = system.state.extent;
    const base = system.compiled.geometry.baseAltitudeKm;
    const depth = Math.max(0.05, system.compiled.geometry.geometricDepthKm);
    const middleAltitude = base + depth * 0.5;
    const east = extent.centerEastKm;
    const north = extent.centerNorthKm;
    const radius = PLANET_RADIUS_KM + middleAltitude;
    const radial = Math.sqrt(Math.max(1,
        radius * radius - east * east - north * north));
    const center: CloudLightVolumeVec3 = [east, radial, north];
    const up = normalize3(center, [0, 1, 0]);
    const rawDownwind: CloudLightVolumeVec3 = [
        Math.cos(extent.orientation), 0, Math.sin(extent.orientation),
    ];
    const downwind = normalize3(add3(rawDownwind,
        scale3(up, -dot3(rawDownwind, up))), [0, 0, 1]);
    const crosswind = normalize3(cross3(up, downwind), [1, 0, 0]);
    const transition = Math.max(0.02, extent.boundaryTransitionKm);
    // Match the exact macro query's legal undeformed canonical support:
    // [-0.13, 1.13] maps to 1.26 horizontal half-extents and
    // base-0.13d..top+0.13d. The central marcher uses 1.30 / 0.30 margins;
    // retain those plus the authored transition. Project curved-world corners
    // rather than assuming a tangent box, so large frontal systems include the
    // Earth-curvature sag at their lower/far edges.
    const downwind2 = [Math.cos(extent.orientation),
        Math.sin(extent.orientation)] as const;
    const crosswind2 = [-downwind2[1], downwind2[0]] as const;
    const minorReach = extent.minorRadiusKm * 1.30 + transition;
    const majorReach = extent.majorRadiusKm * 1.30 + transition;
    const verticalPad = Math.min(0.2, transition * 0.2);
    const bottom = base - depth * 0.30 - verticalPad;
    const top = base + depth * 1.30 + verticalPad;
    const minima = [Infinity, Infinity, Infinity];
    const maxima = [-Infinity, -Infinity, -Infinity];
    // The curved renderer world is not an affine transform of the canonical
    // box.  Corner-only projection is insufficient for a broad sheet: the
    // sphere's interior points sit several kilometres above the sagging far
    // corners.  Include the face centres, box centre, and the horizontal point
    // nearest the planet axis so the OBB remains conservative for the complete
    // curved support, not only its corners.
    const nearestCross = Math.max(-minorReach, Math.min(minorReach,
        -(east * crosswind2[0] + north * crosswind2[1])));
    const nearestDown = Math.max(-majorReach, Math.min(majorReach,
        -(east * downwind2[0] + north * downwind2[1])));
    const crossCoordinates = [-minorReach, 0, minorReach, nearestCross];
    const downCoordinates = [-majorReach, 0, majorReach, nearestDown];
    for (const crossCoordinate of crossCoordinates) {
        for (const downCoordinate of downCoordinates) {
            for (const altitude of [bottom, (bottom + top) * 0.5, top]) {
                const supportEast = east + crosswind2[0] * crossCoordinate +
                    downwind2[0] * downCoordinate;
                const supportNorth = north + crosswind2[1] * crossCoordinate +
                    downwind2[1] * downCoordinate;
                const delta = sub3(morphologyPointToWorld(
                    [supportEast, altitude, supportNorth]), center);
                [crosswind, up, downwind].forEach((axis, axisIndex) => {
                    const projection = dot3(delta, axis);
                    minima[axisIndex] = Math.min(minima[axisIndex], projection);
                    maxima[axisIndex] = Math.max(maxima[axisIndex], projection);
                });
            }
        }
    }
    const localCenter: CloudLightVolumeVec3 = [
        (minima[0] + maxima[0]) * 0.5,
        (minima[1] + maxima[1]) * 0.5,
        (minima[2] + maxima[2]) * 0.5,
    ];
    const domainCenter = add3(center, add3(
        scale3(crosswind, localCenter[0]), add3(
            scale3(up, localCenter[1]), scale3(downwind, localCenter[2]))));
    return {
        ownerIndex,
        layerIndex: system.layerIndex,
        center: domainCenter,
        halfExtent: [
            Math.max(0.05, (maxima[0] - minima[0]) * 0.5),
            Math.max(0.05, (maxima[1] - minima[1]) * 0.5),
            Math.max(0.05, (maxima[2] - minima[2]) * 0.5),
        ],
        axes: [crosswind, up, downwind],
        system,
    };
};

const sub3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3):
CloudLightVolumeVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const expandOwnerDomainToMorphology = (
    domain: OwnerDomain,
    bounds: CloudMorphologyBounds | undefined,
): OwnerDomain => {
    if (!bounds) return domain;
    const minima = domain.halfExtent.map((value) => -value) as
        [number, number, number];
    const maxima = [...domain.halfExtent] as [number, number, number];
    for (const east of [bounds.minimumKm[0], bounds.maximumKm[0]]) {
        for (const altitude of [bounds.minimumKm[1], bounds.maximumKm[1]]) {
            for (const north of [bounds.minimumKm[2], bounds.maximumKm[2]]) {
                const delta = sub3(morphologyPointToWorld(
                    [east, altitude, north]), domain.center);
                for (let axis = 0; axis < 3; axis += 1) {
                    const projection = dot3(delta, domain.axes[axis]);
                    minima[axis] = Math.min(minima[axis], projection);
                    maxima[axis] = Math.max(maxima[axis], projection);
                }
            }
        }
    }
    const localCenter: CloudLightVolumeVec3 = [
        (minima[0] + maxima[0]) * 0.5,
        (minima[1] + maxima[1]) * 0.5,
        (minima[2] + maxima[2]) * 0.5,
    ];
    return {
        ...domain,
        center: add3(domain.center, add3(
            scale3(domain.axes[0], localCenter[0]), add3(
                scale3(domain.axes[1], localCenter[1]),
                scale3(domain.axes[2], localCenter[2])))),
        halfExtent: [
            Math.max(0.05, (maxima[0] - minima[0]) * 0.5),
            Math.max(0.05, (maxima[1] - minima[1]) * 0.5),
            Math.max(0.05, (maxima[2] - minima[2]) * 0.5),
        ],
    };
};

/**
 * Conservative planet-world bounds used only to decide whether a direct disc
 * can reach any selected cloud support. The sphere encloses the complete OBB,
 * including additive/reuse morphology expansion, so a false result cannot hide
 * an illuminated cloud edge.
 */
export const createCloudLightVolumeSourceSupportSpheres = (
    systems: readonly RuntimeCloudSystem[],
    morphologyBoundsByOwner?: ReadonlyMap<number, CloudMorphologyBounds>,
): readonly CloudLightVolumeSourceSupportSphere[] => systems.map(
    (system, ownerIndex) => {
        const domain = expandOwnerDomainToMorphology(
            ownerDomainFor(system, ownerIndex),
            morphologyBoundsByOwner?.get(ownerIndex),
        );
        return {
            centerWorldKm: domain.center,
            radiusKm: Math.hypot(...domain.halfExtent),
        };
    },
);

const sourceReachesSupportSphere = (
    sourceDirection: CloudLightVolumeVec3,
    support: CloudLightVolumeSourceSupportSphere,
) => {
    const centerDistance = length3(support.centerWorldKm);
    if (!Number.isFinite(centerDistance) || centerDistance <= PLANET_RADIUS_KM) {
        return true;
    }
    const direction = normalize3(sourceDirection, [0, 0, 0]);
    if (length3(direction) < 0.5) return false;
    const localUp = scale3(support.centerWorldKm, 1 / centerDistance);
    const centerElevation = Math.asin(Math.max(-1, Math.min(1,
        dot3(localUp, direction))));
    const angularReach = Math.asin(Math.max(0, Math.min(1,
        support.radiusKm / centerDistance)));
    const maximumRadialDistance = centerDistance +
        Math.max(0, support.radiusKm);
    const geometricHorizonDepression = Math.acos(Math.max(0, Math.min(1,
        PLANET_RADIUS_KM / maximumRadialDistance)));
    return centerElevation + angularReach +
        CLOUD_LIGHT_VOLUME_SOURCE_HORIZON_MARGIN_RADIANS >=
        -geometricHorizonDepression;
};

const sourcePhotopicIrradiance = (source: CloudLightVolumeDirectSource) =>
    source.atmosphereTransportedIrradianceRgb[0] * 0.2126 +
    source.atmosphereTransportedIrradianceRgb[1] * 0.7152 +
    source.atmosphereTransportedIrradianceRgb[2] * 0.0722;

/**
 * Resolve direct-volume work without altering source direction or radiometry.
 * A source is inactive only when its complete disc cannot reach any finite
 * cloud support, its TOA irradiance is numerically negligible, or (for the
 * Moon) it is below 1e-5 of a Sun at least 6 degrees above the observer horizon.
 * Twilight Moon transport is retained because low-Sun atmosphere attenuation
 * can reverse the TOA ratio at cloud altitude.
 */
export const resolveCloudLightVolumeSourceActivity = (
    sources: readonly CloudLightVolumeDirectSource[],
    supports: readonly CloudLightVolumeSourceSupportSphere[],
): readonly CloudLightVolumeDirectSource[] => {
    const geometricallyAndAbsolutelyActive = sources.map((source) =>
        source.active &&
        Number.isFinite(sourcePhotopicIrradiance(source)) &&
        sourcePhotopicIrradiance(source) >
            CLOUD_LIGHT_VOLUME_SOURCE_ABSOLUTE_IRRADIANCE_THRESHOLD &&
        supports.some((support) =>
            sourceReachesSupportSphere(source.directionToSource, support)));
    const sunIndex = sources.findIndex(({ kind }) => kind === "sun");
    const sun = sunIndex >= 0 ? sources[sunIndex] : undefined;
    const sunDirection = sun
        ? normalize3(sun.directionToSource, [0, 0, 0])
        : [0, 0, 0] as CloudLightVolumeVec3;
    const daylightSun = sun !== undefined &&
        geometricallyAndAbsolutelyActive[sunIndex] &&
        Math.asin(Math.max(-1, Math.min(1, sunDirection[1]))) >=
            CLOUD_LIGHT_VOLUME_DAYLIGHT_SUN_ELEVATION_RADIANS;
    const sunIrradiance = sun ? sourcePhotopicIrradiance(sun) : 0;
    return sources.map((source, sourceIndex) => {
        let active = geometricallyAndAbsolutelyActive[sourceIndex];
        if (active && source.kind === "moon" && daylightSun &&
            sourcePhotopicIrradiance(source) <= sunIrradiance *
                CLOUD_LIGHT_VOLUME_DAYLIGHT_RELATIVE_SOURCE_THRESHOLD) {
            active = false;
        }
        // Preserve TOA RGB and direction exactly; only the scheduling lane may
        // change. Physical atmosphere/diffuse transport still owns twilight.
        return active === source.active ? source : { ...source, active };
    });
};

const canonicalPointToWorld = (
    system: RuntimeCloudSystem,
    canonical: CloudLightVolumeVec3,
): CloudLightVolumeVec3 => {
    const extent = system.state.extent;
    const downwind = [Math.cos(extent.orientation),
        Math.sin(extent.orientation)] as const;
    const crosswind = [-downwind[1], downwind[0]] as const;
    const crosswindKm = (canonical[0] - 0.5) * 2 * extent.minorRadiusKm;
    const downwindKm = (canonical[2] - 0.5) * 2 * extent.majorRadiusKm;
    return morphologyPointToWorld([
        extent.centerEastKm + crosswind[0] * crosswindKm +
            downwind[0] * downwindKm,
        system.compiled.geometry.baseAltitudeKm + canonical[1] *
            Math.max(0.05, system.compiled.geometry.geometricDepthKm),
        extent.centerNorthKm + crosswind[1] * crosswindKm +
            downwind[1] * downwindKm,
    ]);
};

const projectWorldPointToOwner = (
    domain: OwnerDomain,
    point: CloudLightVolumeVec3,
): CloudLightVolumeVec3 => {
    const delta = sub3(point, domain.center);
    return domain.axes.map((axis) => dot3(delta, axis)) as
        [number, number, number];
};

const ownerSupportDomainFor = (
    domain: OwnerDomain,
    support: CloudLightVolumeMacroSupport | undefined,
    morphologyBounds: CloudMorphologyBounds | undefined,
): OwnerSupportDomain => {
    const resolved = support ?? {
        minimumCanonical: [0, 0, 0] as CloudLightVolumeVec3,
        maximumCanonical: [1, 1, 1] as CloudLightVolumeVec3,
        anchorCanonical: [0.5, 0.5, 0.5] as CloudLightVolumeVec3,
    };
    const minimumLocal: [number, number, number] = [Infinity, Infinity, Infinity];
    const maximumLocal: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const includeWorld = (point: CloudLightVolumeVec3) => {
        const local = projectWorldPointToOwner(domain, point);
        for (let axis = 0; axis < 3; axis += 1) {
            minimumLocal[axis] = Math.min(minimumLocal[axis], local[axis]);
            maximumLocal[axis] = Math.max(maximumLocal[axis], local[axis]);
        }
    };
    // Include the canonical face centres and centre.  On the curved Earth
    // mapping, the maximum radial projection can occur in the interior of a
    // broad atlas rectangle; its eight corners alone can therefore place the
    // support outside the owner OBB and produce no candidate bricks.
    const canonicalValues = (axis: number) => {
        const minimum = resolved.minimumCanonical[axis];
        const maximum = resolved.maximumCanonical[axis];
        return [minimum, (minimum + maximum) * 0.5, maximum];
    };
    const extent = domain.system.state.extent;
    const downwind = [Math.cos(extent.orientation),
        Math.sin(extent.orientation)] as const;
    const crosswind = [-downwind[1], downwind[0]] as const;
    const crossMinimum = (resolved.minimumCanonical[0] - 0.5) *
        2 * extent.minorRadiusKm;
    const crossMaximum = (resolved.maximumCanonical[0] - 0.5) *
        2 * extent.minorRadiusKm;
    const downMinimum = (resolved.minimumCanonical[2] - 0.5) *
        2 * extent.majorRadiusKm;
    const downMaximum = (resolved.maximumCanonical[2] - 0.5) *
        2 * extent.majorRadiusKm;
    const targetCross = -(extent.centerEastKm * crosswind[0] +
        extent.centerNorthKm * crosswind[1]);
    const targetDown = -(extent.centerEastKm * downwind[0] +
        extent.centerNorthKm * downwind[1]);
    const nearestCross = Math.max(crossMinimum,
        Math.min(crossMaximum, targetCross));
    const nearestDown = Math.max(downMinimum,
        Math.min(downMaximum, targetDown));
    const nearestCanonical = [
        0.5 + nearestCross / Math.max(0.05, 2 * extent.minorRadiusKm),
        (resolved.minimumCanonical[1] + resolved.maximumCanonical[1]) * 0.5,
        0.5 + nearestDown / Math.max(0.05, 2 * extent.majorRadiusKm),
    ] as const;
    const canonicalUValues = [...canonicalValues(0), nearestCanonical[0]];
    const canonicalWValues = [...canonicalValues(2), nearestCanonical[2]];
    for (const u of canonicalUValues) {
        for (const v of canonicalValues(1)) {
            for (const w of canonicalWValues) {
                includeWorld(canonicalPointToWorld(domain.system, [u, v, w]));
            }
        }
    }
    // Modifier bounds are extension-only: the unchanged base owner never
    // appears here. Placement, reuse, warp, and additive records may extend
    // support beyond the macro volume and must remain eligible for residency.
    if (morphologyBounds) {
        const morphologyValues = (axis: number) => {
            const minimum = morphologyBounds.minimumKm[axis];
            const maximum = morphologyBounds.maximumKm[axis];
            return [minimum, (minimum + maximum) * 0.5, maximum];
        };
        const nearestEast = Math.max(morphologyBounds.minimumKm[0],
            Math.min(morphologyBounds.maximumKm[0], 0));
        const nearestNorth = Math.max(morphologyBounds.minimumKm[2],
            Math.min(morphologyBounds.maximumKm[2], 0));
        const morphologyEastValues = [...morphologyValues(0), nearestEast];
        const morphologyNorthValues = [...morphologyValues(2), nearestNorth];
        for (const east of morphologyEastValues) {
            for (const altitude of morphologyValues(1)) {
                for (const north of morphologyNorthValues) {
                    includeWorld(morphologyPointToWorld([east, altitude, north]));
                }
            }
        }
    }
    return {
        anchorLocal: projectWorldPointToOwner(domain,
            canonicalPointToWorld(domain.system, resolved.anchorCanonical)),
        minimumLocal,
        maximumLocal,
    };
};

interface OwnerTileLayout {
    counts: readonly [number, number, number];
    interiorHalf: CloudLightVolumeVec3;
    tileHalf: CloudLightVolumeVec3;
    fullCandidateCount: number;
}

const tileLayoutForOwner = (
    domain: OwnerDomain,
    config: CloudLightVolumeGridConfig,
): OwnerTileLayout => {
    const counts = domain.halfExtent.map((halfExtent, axis) => Math.max(1,
        Math.ceil(halfExtent / TARGET_TILE_HALF_EXTENT_KM[axis]))) as
        [number, number, number];
    const interiorHalf: CloudLightVolumeVec3 = [
        domain.halfExtent[0] / counts[0],
        domain.halfExtent[1] / counts[1],
        domain.halfExtent[2] / counts[2],
    ];
    const overlap: CloudLightVolumeVec3 = [
        OVERLAP_CELLS * (2 * interiorHalf[0] / config.dimensions[0]),
        OVERLAP_CELLS * (2 * interiorHalf[1] / config.dimensions[1]),
        OVERLAP_CELLS * (2 * interiorHalf[2] / config.dimensions[2]),
    ];
    const tileHalf: CloudLightVolumeVec3 = [
        interiorHalf[0] + overlap[0],
        interiorHalf[1] + overlap[1],
        interiorHalf[2] + overlap[2],
    ];
    return {
        counts,
        interiorHalf,
        tileHalf,
        fullCandidateCount: counts[0] * counts[1] * counts[2],
    };
};

const tileKey = (
    domain: OwnerDomain,
    grid: readonly [number, number, number],
) => `${domain.system.state.id}:${grid[0]}:${grid[1]}:${grid[2]}`;

const createTileCandidate = (
    domain: OwnerDomain,
    layout: OwnerTileLayout,
    grid: readonly [number, number, number],
    observer: CloudLightVolumeVec3,
): TileCandidate => {
    const local: CloudLightVolumeVec3 = [
        -domain.halfExtent[0] + layout.interiorHalf[0] * (2 * grid[0] + 1),
        -domain.halfExtent[1] + layout.interiorHalf[1] * (2 * grid[1] + 1),
        -domain.halfExtent[2] + layout.interiorHalf[2] * (2 * grid[2] + 1),
    ];
    const center = add3(domain.center, add3(
        scale3(domain.axes[0], local[0]), add3(
            scale3(domain.axes[1], local[1]),
            scale3(domain.axes[2], local[2]))));
    const distance = Math.max(0.1, length3(sub3(center, observer)));
    const projectedScale = Math.sqrt(
        layout.tileHalf[0] * layout.tileHalf[2]) / distance;
    const opticalPriority = Math.max(0.01,
        domain.system.compiled.material.extinctionKm);
    return {
        key: tileKey(domain, grid),
        ownerIndex: domain.ownerIndex,
        center,
        halfExtent: layout.tileHalf,
        axes: domain.axes,
        grid,
        counts: layout.counts,
        faceBoundaryKind: Array(6).fill(
            CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED) as CloudLightVolumeBoundaryKind[],
        ownerDomain: domain,
        localCenter: local,
        score: projectedScale * (1 + Math.log1p(opticalPriority)),
    };
};

/** One support-tight, padded P1 domain for a compact finite thermal owner. */
const createWholeSupportCandidate = (
    domain: OwnerDomain,
    config: CloudLightVolumeGridConfig,
    observer: CloudLightVolumeVec3,
    support: OwnerSupportDomain,
): TileCandidate | undefined => {
    if (!WHOLE_SUPPORT_TOPOLOGIES.has(domain.system.compiled.macroTopology)) {
        return undefined;
    }
    if (support.minimumLocal.some((minimum, axis) =>
        !Number.isFinite(minimum) ||
        !Number.isFinite(support.maximumLocal[axis]) ||
        support.maximumLocal[axis] < minimum)) {
        return undefined;
    }
    const localCenter = support.minimumLocal.map((minimum, axis) =>
        (minimum + support.maximumLocal[axis]) * 0.5) as
        [number, number, number];
    const supportHalf = support.minimumLocal.map((minimum, axis) =>
        Math.max(0.025,
            (support.maximumLocal[axis] - minimum) * 0.5)) as
        [number, number, number];
    // H = h + paddingCells * (2H / N). Solving for H makes the requested
    // support padding exact after the resulting fine-cell size is known.
    const halfExtent = supportHalf.map((half, axis) => {
        const denominator = 1 - 2 * WHOLE_SUPPORT_PADDING_CELLS /
            config.dimensions[axis];
        return denominator > 0 ? half / denominator : Number.POSITIVE_INFINITY;
    }) as [number, number, number];
    if (halfExtent.some((half, axis) =>
        !Number.isFinite(half) || half <= 0 ||
        Math.abs(localCenter[axis]) + half > domain.halfExtent[axis] + 1e-7)) {
        return undefined;
    }
    const cellSize = halfExtent.map((half, axis) =>
        2 * half / config.dimensions[axis]) as [number, number, number];
    const extinction = Math.max(0,
        domain.system.compiled.material.extinctionKm);
    const cellOpticalDepth = Math.hypot(...cellSize) * extinction;
    if (cellOpticalDepth > WHOLE_SUPPORT_MAXIMUM_CELL_OPTICAL_DEPTH ||
        cellOpticalDepth * 2 >
            WHOLE_SUPPORT_MAXIMUM_EXACT_FOOTPRINT_OPTICAL_DEPTH ||
        Math.max(...cellSize) * 2 > WHOLE_SUPPORT_MAXIMUM_EXACT_AXIS_KM) {
        return undefined;
    }
    const center = add3(domain.center, add3(
        scale3(domain.axes[0], localCenter[0]), add3(
            scale3(domain.axes[1], localCenter[1]),
            scale3(domain.axes[2], localCenter[2]))));
    const distance = Math.max(0.1, length3(sub3(center, observer)));
    const projectedScale = Math.sqrt(halfExtent[0] * halfExtent[2]) /
        distance;
    const opticalPriority = Math.max(0.01, extinction);
    return {
        key: `${domain.system.state.id}:whole-support`,
        ownerIndex: domain.ownerIndex,
        center,
        halfExtent,
        axes: domain.axes,
        grid: [0, 0, 0],
        counts: [1, 1, 1],
        faceBoundaryKind: Array(6).fill(
            CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR) as
            CloudLightVolumeBoundaryKind[],
        ownerDomain: domain,
        localCenter,
        score: projectedScale * (1 + Math.log1p(opticalPriority)),
    };
};

const tileIntersectsSupport = (
    tile: TileCandidate,
    support: OwnerSupportDomain,
) => tile.localCenter.every((center, axis) =>
    center + tile.halfExtent[axis] >= support.minimumLocal[axis] - 1e-7 &&
    center - tile.halfExtent[axis] <= support.maximumLocal[axis] + 1e-7);

const tileGridAtLocalPoint = (
    domain: OwnerDomain,
    layout: OwnerTileLayout,
    local: CloudLightVolumeVec3,
) => local.map((coordinate, axis) => {
    const index = Math.floor((coordinate + domain.halfExtent[axis]) /
        Math.max(1e-9, layout.interiorHalf[axis] * 2));
    return Math.min(layout.counts[axis] - 1, Math.max(0, index));
}) as [number, number, number];

const supportIntersectingTileCount = (
    domain: OwnerDomain,
    layout: OwnerTileLayout,
    support: OwnerSupportDomain,
) => {
    let count = 1;
    for (let axis = 0; axis < 3; axis += 1) {
        const half = layout.interiorHalf[axis];
        const tileHalf = layout.tileHalf[axis];
        // Tile center c_i = -H + h(2i+1). Count exactly the integer i for
        // which [c_i-tileHalf,c_i+tileHalf] intersects conservative support.
        const lower = Math.ceil((
            support.minimumLocal[axis] + domain.halfExtent[axis] - half - tileHalf
        ) / Math.max(1e-9, 2 * half) - 1e-9);
        const upper = Math.floor((
            support.maximumLocal[axis] + domain.halfExtent[axis] - half + tileHalf
        ) / Math.max(1e-9, 2 * half) + 1e-9);
        const boundedLower = Math.max(0, lower);
        const boundedUpper = Math.min(layout.counts[axis] - 1, upper);
        count *= Math.max(0, boundedUpper - boundedLower + 1);
    }
    return count;
};

/**
 * Generates only a connected, observer-prioritized frontier. Runtime cost is
 * bounded independently of an owner's possibly enormous Cartesian tile count.
 */
const tileCandidatesForOwner = (
    domain: OwnerDomain,
    config: CloudLightVolumeGridConfig,
    observer: CloudLightVolumeVec3,
    support: OwnerSupportDomain,
) => {
    const layout = tileLayoutForOwner(domain, config);
    const requiredCandidateCount = supportIntersectingTileCount(
        domain, layout, support);
    const observerLocal = projectWorldPointToOwner(domain, observer);
    const supportNearestObserver = observerLocal.map((coordinate, axis) =>
        Math.min(support.maximumLocal[axis],
            Math.max(support.minimumLocal[axis], coordinate))) as
        [number, number, number];
    // Finite non-sheet owners must spend their mandatory residency brick on
    // known condensate, not on the observer-facing edge of a padded OBB. A
    // sheet may retain near-field relevance, but only after clamping that seed
    // to its conservative physical support.
    const seedLocal = SHEET_TOPOLOGIES.has(domain.system.compiled.macroTopology)
        ? supportNearestObserver : support.anchorLocal;
    const seed = tileGridAtLocalPoint(domain, layout, seedLocal);
    const limit = Math.min(layout.fullCandidateCount,
        Math.max(1, config.maxBricks * 3));
    const visited = new Set<string>();
    const frontier: TileCandidate[] = [];
    const selected: TileCandidate[] = [];
    const enqueue = (grid: readonly [number, number, number]) => {
        if (grid.some((value, axis) => value < 0 ||
            value >= layout.counts[axis])) return;
        const key = tileKey(domain, grid);
        if (visited.has(key)) return;
        visited.add(key);
        const candidate = createTileCandidate(domain, layout, grid, observer);
        if (!tileIntersectsSupport(candidate, support)) return;
        frontier.push(candidate);
    };
    enqueue(seed);
    const offsets = [
        [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
    ] as const;
    while (selected.length < limit && frontier.length > 0) {
        frontier.sort((left, right) => right.score - left.score ||
            left.key.localeCompare(right.key));
        const next = frontier.shift()!;
        selected.push(next);
        for (const offset of offsets) enqueue([
            next.grid[0] + offset[0],
            next.grid[1] + offset[1],
            next.grid[2] + offset[2],
        ]);
    }
    return {
        candidates: selected,
        fullCandidateCount: layout.fullCandidateCount,
        requiredCandidateCount,
    };
};

const selectStableTiles = (
    sequences: readonly (readonly TileCandidate[])[],
    maximum: number,
) => {
    const owners = sequences.filter((sequence) => sequence.length > 0)
        .sort((left, right) => right[0].score - left[0].score ||
            left[0].ownerIndex - right[0].ownerIndex);
    const participating = owners.slice(0, maximum);
    const selected = participating.map((sequence) => sequence[0]);
    const cursors = new Map(participating.map((sequence) => [sequence, 1]));
    while (selected.length < maximum) {
        let bestSequence: readonly TileCandidate[] | undefined;
        let best: TileCandidate | undefined;
        for (const sequence of participating) {
            const candidate = sequence[cursors.get(sequence)!];
            if (!candidate) continue;
            if (!best || candidate.score > best.score ||
                (candidate.score === best.score &&
                    candidate.key.localeCompare(best.key) < 0)) {
                best = candidate;
                bestSequence = sequence;
            }
        }
        if (!best || !bestSequence) break;
        selected.push(best);
        cursors.set(bestSequence, cursors.get(bestSequence)! + 1);
    }
    const selectedKeys = new Set(selected.map(({ key }) => key));
    const classified = selected.map((tile): TileCandidate => ({
        ...tile,
        faceBoundaryKind: CLOUD_LIGHT_VOLUME_FACE_OFFSETS.map(
            (offset): CloudLightVolumeBoundaryKind => {
            const neighbor = [tile.grid[0] + offset[0],
                tile.grid[1] + offset[1], tile.grid[2] + offset[2]] as const;
            if (neighbor.some((value, axis) => value < 0 ||
                value >= tile.counts[axis])) {
                return CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR;
            }
            return selectedKeys.has(tileKey(tile.ownerDomain, neighbor))
                ? CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL
                : CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED;
        }),
    }));
    // Slot identity is deterministic and independent of the relevance sort.
    return classified.sort((a, b) => a.ownerIndex - b.ownerIndex ||
        a.key.localeCompare(b.key));
};

export const createCloudLightVolumeRuntime = (
    input: CloudLightVolumeRuntimeInput,
): CloudLightVolumeRuntime => {
    const config = input.config ?? CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG;
    const excludedSheetOwnerCount = 0;
    const sheetOwners = new Set<number>();
    const domains = input.systems.map((system, ownerIndex) => {
        if (SHEET_TOPOLOGIES.has(system.compiled.macroTopology)) {
            sheetOwners.add(ownerIndex);
        }
        return expandOwnerDomainToMorphology(
            ownerDomainFor(system, ownerIndex),
            input.morphologyBoundsByOwner?.get(ownerIndex),
        );
    });
    const observer = input.observerPositionKm ?? [0, PLANET_RADIUS_KM, 0];
    const supports = domains.map((domain) => ownerSupportDomainFor(
        domain,
        input.macroSupportByOwner?.get(domain.ownerIndex),
        input.morphologyBoundsByOwner?.get(domain.ownerIndex),
    ));
    const generated = domains.map((domain, ownerIndex) => {
        const wholeSupport = createWholeSupportCandidate(
            domain, config, observer, supports[ownerIndex]);
        return wholeSupport ? {
            candidates: [wholeSupport],
            fullCandidateCount: 1,
            requiredCandidateCount: 1,
        } : tileCandidatesForOwner(
            domain, config, observer, supports[ownerIndex]);
    });
    const selected = selectStableTiles(
        generated.map(({ candidates }) => candidates), config.maxBricks);
    const internalHaloTopology =
        qualifyCloudLightVolumeInternalHaloTopology(selected);
    const internalHaloInvalidOwners = new Set(
        internalHaloTopology.invalidOwnerIndices);
    const selectedOwnerIndices = new Set(selected.map(({ ownerIndex }) =>
        ownerIndex));
    const selectedTileCountByOwner = new Map<number, number>();
    for (const { ownerIndex } of selected) {
        selectedTileCountByOwner.set(ownerIndex,
            (selectedTileCountByOwner.get(ownerIndex) ?? 0) + 1);
    }
    const fullyResidentOwners = new Set<number>();
    generated.forEach(({ requiredCandidateCount }, ownerIndex) => {
        if (requiredCandidateCount > 0 &&
            (selectedTileCountByOwner.get(ownerIndex) ?? 0) >=
                requiredCandidateCount) {
            fullyResidentOwners.add(ownerIndex);
        }
    });
    // Each representative Beer transform and every truncated-boundary trace
    // spans the complete selected owner, not only its retained diffusion tile.
    // Use that identical support for horizon activity so a sunlit cloud top
    // cannot be suppressed merely because the selected low tile is occulted.
    const sources = resolveCloudLightVolumeSourceActivity(
        input.sources,
        domains.filter(({ ownerIndex }) => selectedOwnerIndices.has(ownerIndex))
            .map((domain) => ({
                centerWorldKm: domain.center,
                radiusKm: Math.hypot(...domain.halfExtent),
            })),
    );
    const candidateBricks = selected.map((tile) => createCloudLightVolumeBrick({
        ownerIndex: tile.ownerIndex,
        layerIndex: tile.ownerDomain.layerIndex,
        centerKm: tile.center,
        halfExtentKm: tile.halfExtent,
        axes: tile.axes,
        sources,
        // The authoritative 17-lobe boundary is projected on the GPU. This
        // placeholder only keeps the renderer-independent brick contract valid.
        environment: {
            skyLobes: [],
            localUpDirection: tile.axes[1],
            quadratureSampleCount: 256,
        },
        directDomain: {
            centerKm: tile.ownerDomain.center,
            halfExtentKm: tile.ownerDomain.halfExtent,
            axes: tile.ownerDomain.axes,
        },
        faceBoundaryKind: tile.faceBoundaryKind,
        maximumExtinctionPerKm:
            tile.ownerDomain.system.compiled.material.extinctionKm,
        // Diffusion material remains exact. Once every conservative support
        // tile for an owner is resident, however, the later source-aligned
        // Beer pass can resample this already materialized fine field. Partial
        // owners retain the procedural fallback outside their selected tiles.
        samplingFlags: fullyResidentOwners.has(tile.ownerIndex)
            ? CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG : 0,
    }, config));
    const selectedOwners = selectedOwnerIndices;
    // Sibling bricks share byte-identical full-owner direct transforms. Qualify
    // one representative per selected owner against every active stable source.
    // Under-resolved fields are excluded from both this mask and the retained
    // cache brick set below; exact same-layer tracing is authoritative and no
    // unsampleable source/P1 workload is scheduled.
    const directFieldQualifications = [...selectedOwners]
        .sort((left, right) => left - right)
        .map((ownerIndex) => {
            const representative = candidateBricks.find((brick) =>
                brick.ownerIndex === ownerIndex);
            if (!representative) {
                throw new Error(`Selected cloud-light owner ${ownerIndex} has no brick`);
            }
            return {
                ownerIndex,
                ...evaluateCloudLightVolumeDirectFieldResolution(
                    representative,
                    sources,
                    domains[ownerIndex].system.compiled.material.extinctionKm,
                ),
            };
        });
    const directQualifiedOwners = new Set(directFieldQualifications
        .filter(({ qualifiesActiveSources }) => qualifiesActiveSources)
        .map(({ ownerIndex }) => ownerIndex));
    const residentOwnerMask = createCloudLightVolumeOwnerMask(
        directQualifiedOwners);
    let residentLayerMask = 0;
    for (let layerIndex = 0; layerIndex < 3; layerIndex += 1) {
        const owners = domains.filter((domain) => domain.layerIndex === layerIndex);
        if (owners.length > 0 &&
            owners.every((domain) =>
                fullyResidentOwners.has(domain.ownerIndex) &&
                directQualifiedOwners.has(domain.ownerIndex) &&
                !internalHaloInvalidOwners.has(domain.ownerIndex))) {
            residentLayerMask |= 1 << layerIndex;
        }
    }
    // A direct field which failed the optical-cell qualification is forbidden
    // to participate in camera Beer transport.  A P1 layer is likewise
    // forbidden unless every owner in that layer is complete and direct-safe.
    // Do not retain bricks which can serve neither published contract: their
    // source grids and diffusion solve are dead work, and a zero ready bit is
    // the canonical vacuum/identity representation consumed by the shader.
    // Direct-qualified owners remain materialized even when their layer-wide
    // P1 closure is unavailable; their Beer field is still an exact member of
    // the resident/exact owner partition.
    const retainedSelectedIndices: number[] = [];
    for (let index = 0; index < selected.length; index += 1) {
        if (directQualifiedOwners.has(selected[index].ownerIndex)) {
            retainedSelectedIndices.push(index);
        }
    }
    const bricks = retainedSelectedIndices.map((index) => {
        const brick = candidateBricks[index];
        const p1Eligible = (residentLayerMask & (1 << brick.layerIndex)) !== 0;
        // A direct-only owner has no need for the diffusion-grid copy. Force
        // its source grid onto the exact procedural query and leave its P1
        // field at vacuum; otherwise a stale/omitted medium atlas could become
        // an accidental dependency of an independently valid Beer cache.
        const samplingFlags = p1Eligible
            ? brick.samplingFlags | CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG
            : brick.samplingFlags &
                ~CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG;
        return { ...brick, samplingFlags };
    });
    const brickKeys = retainedSelectedIndices.map((index) =>
        selected[index].key);
    const packedBricks = packCloudLightVolumeBricks(bricks, config);
    return {
        signature: JSON.stringify({
            lighting: input.lightingSignature,
            keys: brickKeys,
            owners: selected.map(({ ownerIndex, ownerDomain }) => ({
                ownerIndex,
                layerIndex: ownerDomain.layerIndex,
                id: ownerDomain.system.state.id,
                domainCenter: ownerDomain.center,
                domainHalfExtent: ownerDomain.halfExtent,
                extent: ownerDomain.system.state.extent,
                geometry: ownerDomain.system.compiled.geometry,
                material: ownerDomain.system.compiled.material,
                macroSupport: input.macroSupportByOwner?.get(ownerIndex) ?? null,
                samplingFlags: fullyResidentOwners.has(ownerIndex)
                    ? CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG : 0,
            })),
            sources: sources.map((source) => ({
                kind: source.kind,
                direction: source.directionToSource,
                active: source.active,
            })),
            directFieldQualifications,
            internalHaloTopology,
            retainedKeys: brickKeys,
        }),
        sources,
        bricks,
        candidateBricks,
        packedBricks,
        brickKeys,
        selectedOwnerCount: selectedOwners.size,
        fullyResidentOwnerCount: fullyResidentOwners.size,
        partiallyResidentOwnerCount: [...selectedOwners].filter((ownerIndex) =>
            !fullyResidentOwners.has(ownerIndex)).length,
        exactMediumQueriesPerRefresh: (() => {
            const fineVoxelCount = config.dimensions[0] * config.dimensions[1] *
                config.dimensions[2];
            const p1BrickCount = bricks.filter((brick) =>
                (brick.samplingFlags &
                    CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG) !== 0).length;
            const exactDirectOwnerCount = [...directQualifiedOwners].filter(
                (ownerIndex) => {
                    const p1Eligible = (residentLayerMask &
                        (1 << domains[ownerIndex].layerIndex)) !== 0;
                    return !p1Eligible || !fullyResidentOwners.has(ownerIndex);
                }).length;
            const directQueriesPerOwnerSource = fineVoxelCount;
            return fineVoxelCount * p1BrickCount +
                directQueriesPerOwnerSource * exactDirectOwnerCount *
                    sources.filter(({ active }) => active).length;
        })(),
        exactSamplingBrickCount: bricks.length,
        filteredSamplingBrickCount: 0,
        filteredSamplingOwnerCount: 0,
        candidateBrickCount: generated.reduce((sum, owner) =>
            sum + owner.fullCandidateCount, 0),
        requiredBrickCount: generated.reduce((sum, owner) =>
            sum + owner.requiredCandidateCount, 0),
        materializedCandidateCount: generated.reduce((sum, owner) =>
            sum + owner.candidates.length, 0),
        sheetOwnerCount: sheetOwners.size,
        selectedSheetOwnerCount: [...sheetOwners].filter((ownerIndex) =>
            selectedOwners.has(ownerIndex)).length,
        excludedSheetOwnerCount,
        directFieldQualifications,
        directQualifiedOwnerCount: directQualifiedOwners.size,
        exactCameraTracingOwnerCount:
            selectedOwners.size - directQualifiedOwners.size,
        residentLayerMask,
        residentOwnerMask,
    };
};

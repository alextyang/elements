/**
 * Renderer-independent contracts and CPU references for a bounded world-space
 * cloud light volume. The GPU implementation lives in cloud-light-volume-wgsl.
 *
 * Units are kilometres, inverse kilometres, and scene-linear radiometry. The
 * volume stores diffuse fluence (the zeroth angular moment), not exposed RGB.
 */

import {
    DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT,
    DIRECTIONAL_SKY_MAX_SOURCE_LOBES,
    evaluateDirectionalSkyLobe,
    type DirectionalLightingVec3,
    type DirectionalSkyRadianceLobe,
} from "./directional-atmosphere-cloud-lighting.ts";

export type CloudLightVolumeVec3 = DirectionalLightingVec3;

export const CLOUD_LIGHT_VOLUME_SCHEMA = 1;
export const CLOUD_LIGHT_VOLUME_SOURCE_COUNT = 2;
export const CLOUD_LIGHT_VOLUME_FACE_COUNT = 6;
export const CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL = 0;
export const CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR = 1;
export const CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED = 2;
export type CloudLightVolumeBoundaryKind =
    | typeof CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL
    | typeof CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR
    | typeof CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED;
export const CLOUD_LIGHT_VOLUME_ACTIVE_LOBE_COUNT =
    DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT + DIRECTIONAL_SKY_MAX_SOURCE_LOBES + 1;
export const CLOUD_LIGHT_VOLUME_BRICK_STRIDE_VEC4 = 19;
export const CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS =
    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_VEC4 * 4;
/**
 * `owner_atlas_tau_schema.w` is an exactly-representable integer payload.  The
 * low byte remains the record schema; upper bits opt individual bricks into
 * sampling reductions.  A legacy value of `1` therefore decodes to schema 1
 * with exact sampling, and missing/unknown flags fail closed.
 */
export const CLOUD_LIGHT_VOLUME_BRICK_METADATA_SCHEMA_MASK = 0xff;
export const CLOUD_LIGHT_VOLUME_BRICK_FILTERED_DIFFUSE_L1_FLAG = 1 << 8;
export const CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG = 1 << 9;
/**
 * The complete conservative support of this owner is present in the fine
 * diffusion atlas. Source-aligned Beer material may therefore resample that
 * immutable material instead of evaluating the procedural morphology a
 * second time at every source-grid center. This does not reduce the diffusion
 * material solve itself; it only keeps the two representations of one medium
 * coherent and avoids duplicate morphology work.
 */
export const CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG = 1 << 10;
/**
 * The brick belongs to a layer whose complete finite owner set is resident
 * and direct-qualified. Only these bricks participate in the P1 solve; a
 * direct-only brick keeps its packed fluence at the vacuum value.
 */
export const CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG = 1 << 11;
export const CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK =
    CLOUD_LIGHT_VOLUME_BRICK_FILTERED_DIFFUSE_L1_FLAG |
    CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG |
    CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG |
    CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG;
export const CLOUD_LIGHT_VOLUME_SOURCE_STRIDE_FLOATS = 8;
export const CLOUD_LIGHT_VOLUME_MULTIGRID_LEVEL_COUNT = 4;
export const CLOUD_LIGHT_VOLUME_PACKED_FIELD_COUNT = 3;
export const CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT = 2;
/**
 * Source-aligned Beer grids reserve real empty transverse cells around the
 * finite owner domain. Two cells keep filtered/trilinear footprints away from
 * condensate at the atlas edge without materially reducing the 48-cell
 * production interior.
 */
export const CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS = 2;
/**
 * A cached full-owner source field is a point-sampled Beer discretization.
 * Keep every active source-axis or transverse cell below this optical depth;
 * coarser fields fall back to exact same-layer tracing instead of publishing a
 * source-aligned block approximation. This is independent of P1 brick
 * resolution because the direct transform spans the complete owner OBB.
 */
export const CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH = 0.75;
/** Two u32 words cover the renderer's fixed 36-owner production ABI. */
export type CloudLightVolumeOwnerMask = readonly [number, number];
// Two medium fields, two direct/RHS fields, one source-material/multigrid
// scratch field, two atomic packed-view banks of fluence/Sun/Moon, and two
// coarse lightning-transfer publication banks. Mip overhead is accounted
// exactly by createCloudLightVolumePlan rather than this base-voxel shorthand.
export const CLOUD_LIGHT_VOLUME_TEXTURE_BYTES_PER_VOXEL = 104;

export const CLOUD_LIGHT_VOLUME_FACE_ORDER = Object.freeze([
    "+x", "-x", "+y", "-y", "+z", "-z",
] as const);
export type CloudLightVolumeFace = typeof CLOUD_LIGHT_VOLUME_FACE_ORDER[number];

export interface CloudLightVolumeGridConfig {
    dimensions: readonly [number, number, number];
    maxBricks: number;
    multigridLevels: number;
    preSmoothIterations: number;
    postSmoothIterations: number;
    coarseSmoothIterations: number;
    maximumVCycles: number;
    residualTolerance: number;
    relaxation: number;
    emptyExtinctionThresholdPerKm: number;
    maximumFluence: number;
}

export const CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG = Object.freeze({
    dimensions: [48, 32, 48] as const,
    maxBricks: 6,
    multigridLevels: CLOUD_LIGHT_VOLUME_MULTIGRID_LEVEL_COUNT,
    preSmoothIterations: 2,
    // Prolongation writes scratch. Three post-smooths land directly in the
    // packed field, replacing the publication-only copy required by an even
    // count with a useful Jacobi pass at the same dispatch count per level.
    postSmoothIterations: 3,
    coarseSmoothIterations: 16,
    // Residual readback exits immediately when qualified. The photographed
    // three-owner congestus scene retains a low-frequency cross-brick mode at
    // 2.66% after cycle five, so production permits three additional bounded
    // refinements while preserving the 2% equation gate. Each pass remains a
    // fixed-size slab submission; this extends convergence, not watchdog risk.
    maximumVCycles: 8,
    residualTolerance: 0.02,
    // 0.92 is the measured bounded optimum across the production Cu support,
    // a dense owner, and six disconnected variable-density owners. Keeping
    // omega below one preserves the nonnegative convex fine-grid update while
    // damping the boundary modes left by piecewise-constant aggregation.
    relaxation: 0.92,
    emptyExtinctionThresholdPerKm: 1e-4,
    maximumFluence: 65_504,
} satisfies CloudLightVolumeGridConfig);

export interface CloudLightVolumeSmoothingParity {
    requiresScratchSeed: boolean;
    firstReadPacked: boolean;
    endsPacked: boolean;
}

/** Exact ping-pong ownership for any legal Jacobi iteration count. */
export const resolveCloudLightVolumeSmoothingParity = (
    iterationCountInput: number,
    initialOwner: "packed" | "scratch",
): CloudLightVolumeSmoothingParity => {
    const iterationCount = Math.max(1, Math.floor(iterationCountInput));
    // A packed initial field with an odd iteration count is copied to scratch
    // first, making the last Jacobi write land in packed. A prolongated field
    // already starts in scratch and needs no seed.
    const requiresScratchSeed = initialOwner === "packed" &&
        iterationCount % 2 === 1;
    const firstReadPacked = initialOwner === "packed" &&
        !requiresScratchSeed;
    const endsPacked = firstReadPacked
        ? iterationCount % 2 === 0
        : iterationCount % 2 === 1;
    return { requiresScratchSeed, firstReadPacked, endsPacked };
};

export interface CloudLightVolumeValidation {
    valid: boolean;
    reasons: readonly string[];
}

export interface CloudLightVolumeMemoryBreakdown {
    voxelCount: number;
    mipVoxelCount: number;
    mediumBytes: number;
    directTransmittanceBytes: number;
    fluenceScratchBytes: number;
    lightningTransferBytes: number;
    packedViewBankBytes: number;
    totalTextureBytes: number;
}

export interface CloudLightVolumeDispatchBounds {
    materializeWorkgroups: readonly [number, number, number];
    sourceMaterializeWorkgroupsPerSource: readonly [number, number, number];
    directWorkgroupsPerSource: readonly [number, number, number];
    multigridWorkgroupsByLevel: readonly (readonly [number, number, number])[];
    fineSmoothingVoxelUpdatesPerCycle: number;
    coarseSmoothingVoxelUpdatesPerCycle: number;
    exactMediumQueriesPerRefresh: number;
    maximumBoundaryMediumQueriesPerBrick: number;
}

export interface CloudLightVolumePlan {
    schema: typeof CLOUD_LIGHT_VOLUME_SCHEMA;
    config: CloudLightVolumeGridConfig;
    atlasDimensions: readonly [number, number, number];
    packedAtlasDimensions: readonly [number, number, number];
    memory: CloudLightVolumeMemoryBreakdown;
    dispatch: CloudLightVolumeDispatchBounds;
    validation: CloudLightVolumeValidation;
}

const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, finite(value) ? value : low));
const add3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3): CloudLightVolumeVec3 =>
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3): CloudLightVolumeVec3 =>
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (v: CloudLightVolumeVec3, s: number): CloudLightVolumeVec3 =>
    [v[0] * s, v[1] * s, v[2] * s];
const dot3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: CloudLightVolumeVec3, b: CloudLightVolumeVec3): CloudLightVolumeVec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const length3 = (v: CloudLightVolumeVec3) => Math.hypot(v[0], v[1], v[2]);
const normalize3 = (
    v: CloudLightVolumeVec3,
    fallback: CloudLightVolumeVec3 = [0, 1, 0],
): CloudLightVolumeVec3 => {
    const length = length3(v);
    return length > 1e-10 ? scale3(v, 1 / length) : fallback;
};
const mulAdd3 = (
    origin: CloudLightVolumeVec3,
    x: CloudLightVolumeVec3,
    sx: number,
    y: CloudLightVolumeVec3,
    sy: number,
    z: CloudLightVolumeVec3,
    sz: number,
) => add3(origin, add3(scale3(x, sx), add3(scale3(y, sy), scale3(z, sz))));
const luminance = (rgb: CloudLightVolumeVec3) =>
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const finiteNonnegative3 = (value: CloudLightVolumeVec3) =>
    value.every((component) => finite(component) && component >= 0);

/** Packs stable physical owner indices into the fixed 36-bit view mask. */
export const createCloudLightVolumeOwnerMask = (
    ownerIndices: Iterable<number>,
): CloudLightVolumeOwnerMask => {
    let low = 0;
    let high = 0;
    for (const ownerIndexInput of ownerIndices) {
        const ownerIndex = Math.floor(ownerIndexInput);
        if (!Number.isFinite(ownerIndexInput) || ownerIndex < 0 || ownerIndex >= 36) {
            continue;
        }
        if (ownerIndex < 32) {
            low = (low | (1 << ownerIndex)) >>> 0;
        } else {
            high = (high | (1 << (ownerIndex - 32))) >>> 0;
        }
    }
    return [low, high];
};

export const cloudLightVolumeOwnerMaskContains = (
    mask: CloudLightVolumeOwnerMask,
    ownerIndexInput: number,
) => {
    const ownerIndex = Math.floor(ownerIndexInput);
    if (!Number.isFinite(ownerIndexInput) || ownerIndex < 0 || ownerIndex >= 36) {
        return false;
    }
    return ownerIndex < 32
        ? ((mask[0] >>> ownerIndex) & 1) !== 0
        : ((mask[1] >>> (ownerIndex - 32)) & 1) !== 0;
};

export interface CloudLightVolumeOwnerOpticalDepth {
    ownerIndex: number;
    opticalDepthRgb: CloudLightVolumeVec3;
}

/**
 * CPU reference for the production source-path partition. Optical depth is
 * additive, so resident Beer transport and exact missing-owner Beer transport
 * multiply to the unpartitioned result without an overlap term.
 */
export const partitionCloudLightVolumeOwnerOpticalDepth = (
    contributions: readonly CloudLightVolumeOwnerOpticalDepth[],
    residentOwnerMask: CloudLightVolumeOwnerMask,
) => {
    let resident: CloudLightVolumeVec3 = [0, 0, 0];
    let missing: CloudLightVolumeVec3 = [0, 0, 0];
    for (const contribution of contributions) {
        const opticalDepth = contribution.opticalDepthRgb.map((channel) =>
            Math.max(0, Number.isFinite(channel) ? channel : 0)) as unknown as
                CloudLightVolumeVec3;
        if (cloudLightVolumeOwnerMaskContains(
            residentOwnerMask, contribution.ownerIndex)) {
            resident = add3(resident, opticalDepth);
        } else {
            missing = add3(missing, opticalDepth);
        }
    }
    const total = add3(resident, missing);
    const transmittance = (opticalDepth: CloudLightVolumeVec3) =>
        opticalDepth.map((channel) => Math.exp(-channel)) as unknown as
            CloudLightVolumeVec3;
    return {
        residentOpticalDepthRgb: resident,
        missingOpticalDepthRgb: missing,
        totalOpticalDepthRgb: total,
        residentTransmittanceRgb: transmittance(resident),
        missingTransmittanceRgb: transmittance(missing),
        totalTransmittanceRgb: transmittance(total),
    };
};

const ceilDiv = (value: number, divisor: number) => Math.ceil(value / divisor);

export const createCloudLightVolumePlan = (
    input: Partial<CloudLightVolumeGridConfig> = {},
): CloudLightVolumePlan => {
    const dimensions = (input.dimensions ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.dimensions) as readonly [number, number, number];
    const config: CloudLightVolumeGridConfig = {
        dimensions: [...dimensions] as [number, number, number],
        maxBricks: input.maxBricks ?? CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks,
        multigridLevels: input.multigridLevels ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.multigridLevels,
        preSmoothIterations: input.preSmoothIterations ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.preSmoothIterations,
        postSmoothIterations: input.postSmoothIterations ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.postSmoothIterations,
        coarseSmoothIterations: input.coarseSmoothIterations ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.coarseSmoothIterations,
        maximumVCycles: input.maximumVCycles ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumVCycles,
        residualTolerance: input.residualTolerance ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.residualTolerance,
        relaxation: input.relaxation ?? CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.relaxation,
        emptyExtinctionThresholdPerKm: input.emptyExtinctionThresholdPerKm ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.emptyExtinctionThresholdPerKm,
        maximumFluence: input.maximumFluence ??
            CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumFluence,
    };
    const reasons: string[] = [];
    if (config.dimensions.length !== 3 || config.dimensions.some((value) =>
        !Number.isInteger(value) || value < 4 || value > 128)) {
        reasons.push("cloud-light-volume-dimensions-must-be-integer-4-through-128");
    }
    if (!Number.isInteger(config.maxBricks) || config.maxBricks < 1 ||
        config.maxBricks > 32) {
        reasons.push("cloud-light-volume-max-bricks-must-be-integer-1-through-32");
    }
    if (config.dimensions[2] * config.maxBricks *
        CLOUD_LIGHT_VOLUME_PACKED_FIELD_COUNT *
        CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT > 2_048) {
        reasons.push("cloud-light-volume-double-bank-atlas-depth-exceeds-webgpu-core-limit");
    }
    if (!Number.isInteger(config.multigridLevels) ||
        config.multigridLevels !== CLOUD_LIGHT_VOLUME_MULTIGRID_LEVEL_COUNT ||
        config.dimensions.some((value) => value %
            2 ** (config.multigridLevels - 1) !== 0)) {
        reasons.push("cloud-light-volume-requires-four-exact-multigrid-levels");
    }
    for (const [name, value, maximum] of [
        ["pre-smooth", config.preSmoothIterations, 8],
        ["post-smooth", config.postSmoothIterations, 8],
        ["coarse-smooth", config.coarseSmoothIterations, 64],
        ["maximum-v-cycles", config.maximumVCycles, 8],
    ] as const) {
        if (!Number.isInteger(value) || value < 1 || value > maximum) {
            reasons.push(`cloud-light-volume-${name}-is-out-of-range`);
        }
    }
    if (!(config.residualTolerance > 0 && config.residualTolerance <= 0.1) ||
        !finite(config.residualTolerance)) {
        reasons.push("cloud-light-volume-residual-tolerance-is-invalid");
    }
    if (!(config.relaxation > 0 && config.relaxation <= 1)) {
        reasons.push("cloud-light-volume-relaxation-must-be-in-zero-one");
    }
    if (!(config.emptyExtinctionThresholdPerKm >= 0) ||
        !finite(config.emptyExtinctionThresholdPerKm)) {
        reasons.push("cloud-light-volume-empty-threshold-is-invalid");
    }
    if (!(config.maximumFluence > 0) || !finite(config.maximumFluence)) {
        reasons.push("cloud-light-volume-maximum-fluence-is-invalid");
    }
    const voxelCount = config.dimensions[0] * config.dimensions[1] *
        config.dimensions[2] * config.maxBricks;
    const mipVoxelCount = Array.from({ length: config.multigridLevels },
        (_, level) => Math.max(1, config.dimensions[0] >> level) *
            Math.max(1, config.dimensions[1] >> level) *
            Math.max(1, config.dimensions[2] >> level) * config.maxBricks)
        .reduce((sum, value) => sum + value, 0);
    const mediumBytes = mipVoxelCount * 16;
    const directTransmittanceBytes = mipVoxelCount * 16;
    const fluenceScratchBytes = mipVoxelCount * 8;
    const lightningTransferBytes = mipVoxelCount * 8 *
        CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT;
    const packedViewBankBytes = mipVoxelCount * 8 *
        CLOUD_LIGHT_VOLUME_PACKED_FIELD_COUNT;
    const totalTextureBytes = mediumBytes + directTransmittanceBytes +
        fluenceScratchBytes + lightningTransferBytes + packedViewBankBytes *
        CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT;
    const atlasDimensions = [config.dimensions[0], config.dimensions[1],
        config.dimensions[2] * config.maxBricks] as const;
    const packedAtlasDimensions = [config.dimensions[0], config.dimensions[1],
        config.dimensions[2] * config.maxBricks *
            CLOUD_LIGHT_VOLUME_PACKED_FIELD_COUNT *
            CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT] as const;
    const volumeWorkgroups = [
        ceilDiv(config.dimensions[0], 4),
        ceilDiv(config.dimensions[1], 4),
        ceilDiv(config.dimensions[2], 4),
    ] as const;
    const directWorkgroups = [
        ceilDiv(config.dimensions[0], 8),
        1,
        ceilDiv(config.dimensions[2], 8),
    ] as const;
    const sourceMaterializeWorkgroups = [
        ceilDiv(config.dimensions[0], 4),
        // Production gives every exact source-axis y center its own invocation
        // so procedural-query latency can be hidden across the full grid.
        ceilDiv(config.dimensions[1], 4),
        config.dimensions[2],
    ] as const;
    const multigridWorkgroupsByLevel = Array.from(
        { length: config.multigridLevels }, (_, level) => [
            ceilDiv(Math.max(1, config.dimensions[0] >> level), 4),
            ceilDiv(Math.max(1, config.dimensions[1] >> level), 4),
            ceilDiv(Math.max(1, config.dimensions[2] >> level), 4),
        ] as const);
    const brickVoxelCount = voxelCount / config.maxBricks;
    const intermediateCoarseVoxelCount = Array.from(
        { length: config.multigridLevels - 2 }, (_, offset) => {
            const level = offset + 1;
            return Math.max(1, config.dimensions[0] >> level) *
                Math.max(1, config.dimensions[1] >> level) *
                Math.max(1, config.dimensions[2] >> level);
        }).reduce((sum, value) => sum + value, 0);
    return {
        schema: CLOUD_LIGHT_VOLUME_SCHEMA,
        config,
        atlasDimensions,
        packedAtlasDimensions,
        memory: {
            voxelCount,
            mipVoxelCount,
            mediumBytes,
            directTransmittanceBytes,
            fluenceScratchBytes,
            lightningTransferBytes,
            packedViewBankBytes,
            totalTextureBytes,
        },
        dispatch: {
            materializeWorkgroups: volumeWorkgroups,
            sourceMaterializeWorkgroupsPerSource: sourceMaterializeWorkgroups,
            directWorkgroupsPerSource: directWorkgroups,
            multigridWorkgroupsByLevel,
            fineSmoothingVoxelUpdatesPerCycle: brickVoxelCount *
                (config.preSmoothIterations + config.postSmoothIterations),
            coarseSmoothingVoxelUpdatesPerCycle: intermediateCoarseVoxelCount *
                (config.preSmoothIterations + config.postSmoothIterations) +
                Math.max(1, config.dimensions[0] >> (config.multigridLevels - 1)) *
                Math.max(1, config.dimensions[1] >> (config.multigridLevels - 1)) *
                Math.max(1, config.dimensions[2] >> (config.multigridLevels - 1)) *
                config.coarseSmoothIterations,
            // The bounded plan is a fail-closed ceiling: exact L0 diffuse
            // material plus exact source-axis material for Sun and Moon. A
            // future per-block classifier may reduce measured runtime work,
            // but unsupported owner-level inference must not lower this bound.
            exactMediumQueriesPerRefresh: voxelCount *
                (1 + CLOUD_LIGHT_VOLUME_SOURCE_COUNT),
            maximumBoundaryMediumQueriesPerBrick:
                CLOUD_LIGHT_VOLUME_FACE_COUNT * 16 * 8 * config.maxBricks,
        },
        validation: { valid: reasons.length === 0, reasons },
    };
};

export interface CloudLightVolumeTransform {
    originKm: CloudLightVolumeVec3;
    axes: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3, CloudLightVolumeVec3];
    cellSizeKm: CloudLightVolumeVec3;
}

export interface CloudLightVolumeDirectSource {
    kind: "sun" | "moon";
    directionToSource: CloudLightVolumeVec3;
    atmosphereTransportedIrradianceRgb: CloudLightVolumeVec3;
    active: boolean;
}

export interface CloudLightVolumeEnvironment {
    /** The existing positive 14 diffuse + horizon + Sun/Moon-adjacent lobes. */
    skyLobes: readonly DirectionalSkyRadianceLobe[];
    localUpDirection: CloudLightVolumeVec3;
    /** Additional lower-air radiance; resolved source discs must not be included. */
    lowerAtmosphereRadianceRgb?: CloudLightVolumeVec3;
    /** Lambertian ground radiance after atmosphere and cloud-shadow coupling. */
    groundRadianceRgb?: CloudLightVolumeVec3;
    quadratureSampleCount?: number;
}

export interface CloudLightVolumeBoundaryProjection {
    faceIrradianceRgb: readonly CloudLightVolumeVec3[];
    quadratureSolidAngleSteradians: number;
    validation: CloudLightVolumeValidation;
}

const fibonacciSphereDirection = (index: number, count: number): CloudLightVolumeVec3 => {
    const vertical = 1 - 2 * (index + 0.5) / count;
    const radius = Math.sqrt(Math.max(0, 1 - vertical * vertical));
    const azimuth = index * Math.PI * (3 - Math.sqrt(5));
    return [radius * Math.cos(azimuth), vertical, radius * Math.sin(azimuth)];
};

/**
 * Projects the positive 17-lobe field plus lower atmosphere/ground onto the
 * six incoming partial currents required by a P1 (Marshak) boundary.
 */
export const projectCloudLightEnvironmentToFaces = (
    environment: CloudLightVolumeEnvironment,
    axesInput: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
        CloudLightVolumeVec3],
): CloudLightVolumeBoundaryProjection => {
    const reasons: string[] = [];
    if (environment.skyLobes.length > CLOUD_LIGHT_VOLUME_ACTIVE_LOBE_COUNT) {
        reasons.push("cloud-light-volume-sky-lobe-count-exceeds-17");
    }
    if (environment.skyLobes.some((lobe) => !finiteNonnegative3(
        lobe.integratedRadianceRgb))) {
        reasons.push("cloud-light-volume-sky-lobe-energy-is-invalid");
    }
    const axes = axesInput.map((axis) => normalize3(axis)) as unknown as
        [CloudLightVolumeVec3, CloudLightVolumeVec3, CloudLightVolumeVec3];
    if (Math.abs(dot3(axes[0], axes[1])) > 1e-4 ||
        Math.abs(dot3(axes[0], axes[2])) > 1e-4 ||
        Math.abs(dot3(axes[1], axes[2])) > 1e-4) {
        reasons.push("cloud-light-volume-projection-axes-are-not-orthogonal");
    }
    const faceNormals: CloudLightVolumeVec3[] = [
        axes[0], scale3(axes[0], -1), axes[1], scale3(axes[1], -1),
        axes[2], scale3(axes[2], -1),
    ];
    const count = Math.round(clamp(environment.quadratureSampleCount ?? 4_096,
        256, 65_536));
    const solidAngle = 4 * Math.PI / count;
    const up = normalize3(environment.localUpDirection);
    const lower = environment.lowerAtmosphereRadianceRgb ?? [0, 0, 0];
    const ground = environment.groundRadianceRgb ?? [0, 0, 0];
    if (!finiteNonnegative3(lower) || !finiteNonnegative3(ground)) {
        reasons.push("cloud-light-volume-lower-boundary-radiance-is-invalid");
    }
    const irradiance = faceNormals.map(() => [0, 0, 0] as
        [number, number, number]);
    for (let index = 0; index < count; index += 1) {
        const direction = fibonacciSphereDirection(index, count);
        let radiance: CloudLightVolumeVec3 = [0, 0, 0];
        for (const lobe of environment.skyLobes.slice(
            0, CLOUD_LIGHT_VOLUME_ACTIVE_LOBE_COUNT)) {
            radiance = add3(radiance, evaluateDirectionalSkyLobe(lobe, direction));
        }
        if (dot3(direction, up) < 0) {
            radiance = add3(radiance, add3(lower, ground));
        }
        faceNormals.forEach((normal, faceIndex) => {
            const projected = Math.max(0, dot3(normal, direction)) * solidAngle;
            irradiance[faceIndex][0] += radiance[0] * projected;
            irradiance[faceIndex][1] += radiance[1] * projected;
            irradiance[faceIndex][2] += radiance[2] * projected;
        });
    }
    return {
        faceIrradianceRgb: irradiance,
        quadratureSolidAngleSteradians: solidAngle * count,
        validation: { valid: reasons.length === 0, reasons },
    };
};

export interface CloudLightVolumeBrickInput {
    ownerIndex: number;
    /** Tropospheric layer owning this brick; used by residual-light transport. */
    layerIndex?: number;
    centerKm: CloudLightVolumeVec3;
    halfExtentKm: CloudLightVolumeVec3;
    axes?: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
        CloudLightVolumeVec3];
    sources: readonly CloudLightVolumeDirectSource[];
    environment: CloudLightVolumeEnvironment;
    /** Full owner domain used for source-aligned Beer integration. */
    directDomain?: {
        centerKm: CloudLightVolumeVec3;
        halfExtentKm: CloudLightVolumeVec3;
        axes?: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
            CloudLightVolumeVec3];
    };
    /**
     * Boundary classification in +x,-x,+y,-y,+z,-z order. Internal faces
     * exchange a halo with a selected sibling, exterior faces see the physical
     * environment, and truncated faces use an explicit legacy/coarse Dirichlet
     * value. A truncated face must never be projected as clear sky.
     */
    faceBoundaryKind?: readonly CloudLightVolumeBoundaryKind[];
    /** @deprecated Compatibility input; prefer faceBoundaryKind. */
    faceExterior?: readonly boolean[];
    maximumExtinctionPerKm?: number;
    /**
     * Explicit opt-in only. Zero is the production-safe exact L0/exact-y
     * policy. Unknown or partial flags are rejected instead of inferred.
     */
    samplingFlags?: number;
}

export interface CloudLightVolumeBrick {
    ownerIndex: number;
    layerIndex: number;
    diffusionTransform: CloudLightVolumeTransform;
    directTransforms: readonly [CloudLightVolumeTransform, CloudLightVolumeTransform];
    faceIrradianceRgb: readonly CloudLightVolumeVec3[];
    faceBoundaryKind: readonly CloudLightVolumeBoundaryKind[];
    /** Compatibility projection; true only for a physical owner exterior. */
    faceExterior: readonly boolean[];
    maximumCellOpticalDepth: number;
    /** Packed upper metadata bits; zero means exact morphology/source queries. */
    samplingFlags: number;
    validation: CloudLightVolumeValidation;
}

export const packCloudLightVolumeBrickMetadata = (
    samplingFlagsInput = 0,
) => {
    const samplingFlags = Number.isInteger(samplingFlagsInput) &&
        samplingFlagsInput >= 0 &&
        samplingFlagsInput <= CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK &&
        (samplingFlagsInput & ~CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK) === 0
        ? samplingFlagsInput : 0;
    return CLOUD_LIGHT_VOLUME_SCHEMA | samplingFlags;
};

export const unpackCloudLightVolumeBrickMetadata = (metadataInput: number) => {
    const validInteger = Number.isSafeInteger(metadataInput) &&
        metadataInput >= 0 && metadataInput <= 0xffff_ffff;
    const metadata = validInteger ? metadataInput : CLOUD_LIGHT_VOLUME_SCHEMA;
    const schema = metadata & CLOUD_LIGHT_VOLUME_BRICK_METADATA_SCHEMA_MASK;
    const knownFlags = metadata & CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK;
    const unknownFlags = metadata & ~(
        CLOUD_LIGHT_VOLUME_BRICK_METADATA_SCHEMA_MASK |
        CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK);
    // An unknown schema/flag combination must never silently select reduced
    // sampling. Callers may inspect the decoded schema separately.
    const pairedRequiresFiltered =
        (knownFlags & CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG) === 0 ||
        (knownFlags & CLOUD_LIGHT_VOLUME_BRICK_FILTERED_DIFFUSE_L1_FLAG) !== 0;
    const samplingFlags = validInteger && schema === CLOUD_LIGHT_VOLUME_SCHEMA &&
        unknownFlags === 0 && pairedRequiresFiltered ? knownFlags : 0;
    return { schema, samplingFlags };
};

const sourcesByStableSlot = (
    sources: readonly CloudLightVolumeDirectSource[],
): readonly [CloudLightVolumeDirectSource | undefined,
    CloudLightVolumeDirectSource | undefined] => [
    sources.find(({ kind }) => kind === "sun"),
    sources.find(({ kind }) => kind === "moon"),
];

const orthonormalAxes = (
    axesInput?: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
        CloudLightVolumeVec3],
): readonly [CloudLightVolumeVec3, CloudLightVolumeVec3, CloudLightVolumeVec3] => {
    const x = normalize3(axesInput?.[0] ?? [1, 0, 0], [1, 0, 0]);
    const yCandidate = axesInput?.[1] ?? [0, 1, 0];
    const y = normalize3(sub3(yCandidate, scale3(x, dot3(x, yCandidate))), [0, 1, 0]);
    let z = normalize3(cross3(x, y), [0, 0, 1]);
    if (axesInput?.[2] && dot3(z, axesInput[2]) < 0) z = scale3(z, -1);
    return [x, y, z];
};

const orientedBoxCorners = (
    center: CloudLightVolumeVec3,
    halfExtent: CloudLightVolumeVec3,
    axes: readonly [CloudLightVolumeVec3, CloudLightVolumeVec3,
        CloudLightVolumeVec3],
) => {
    const corners: CloudLightVolumeVec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        corners.push(mulAdd3(center, axes[0], halfExtent[0] * x,
            axes[1], halfExtent[1] * y, axes[2], halfExtent[2] * z));
    }
    return corners;
};

const sourceAlignedTransform = (
    corners: readonly CloudLightVolumeVec3[],
    sourceDirectionInput: CloudLightVolumeVec3,
    dimensions: readonly [number, number, number],
): CloudLightVolumeTransform => {
    const y = normalize3(sourceDirectionInput);
    const reference: CloudLightVolumeVec3 = Math.abs(y[1]) < 0.9
        ? [0, 1, 0] : [1, 0, 0];
    const x = normalize3(cross3(reference, y), [1, 0, 0]);
    const z = normalize3(cross3(x, y), [0, 0, 1]);
    const axes = [x, y, z] as const;
    const minima = [Infinity, Infinity, Infinity];
    const maxima = [-Infinity, -Infinity, -Infinity];
    for (const corner of corners) {
        axes.forEach((axis, index) => {
            const projection = dot3(corner, axis);
            minima[index] = Math.min(minima[index], projection);
            maxima[index] = Math.max(maxima[index], projection);
        });
    }
    const guardX = Math.min(CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
        Math.max(0, Math.floor((dimensions[0] - 2) / 2)));
    const guardZ = Math.min(CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
        Math.max(0, Math.floor((dimensions[2] - 2) / 2)));
    const cellSize: CloudLightVolumeVec3 = [
        (maxima[0] - minima[0]) / (dimensions[0] - 2 * guardX),
        (maxima[1] - minima[1]) / dimensions[1],
        (maxima[2] - minima[2]) / (dimensions[2] - 2 * guardZ),
    ];
    const guardedMinima = [
        minima[0] - guardX * cellSize[0],
        minima[1],
        minima[2] - guardZ * cellSize[2],
    ];
    const origin = add3(scale3(x, guardedMinima[0]), add3(
        scale3(y, guardedMinima[1]), scale3(z, guardedMinima[2])));
    return {
        originKm: origin,
        axes,
        cellSizeKm: cellSize,
    };
};

export const createCloudLightVolumeBrick = (
    input: CloudLightVolumeBrickInput,
    config: CloudLightVolumeGridConfig = CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
): CloudLightVolumeBrick => {
    const reasons: string[] = [];
    if (!Number.isInteger(input.ownerIndex) || input.ownerIndex < 0 ||
        input.ownerIndex > 35) reasons.push("cloud-light-volume-owner-index-is-invalid");
    if (!finiteNonnegative3(input.halfExtentKm) ||
        input.halfExtentKm.some((value) => value <= 0)) {
        reasons.push("cloud-light-volume-half-extent-is-invalid");
    }
    if (input.sources.length > CLOUD_LIGHT_VOLUME_SOURCE_COUNT) {
        reasons.push("cloud-light-volume-source-count-exceeds-two");
    }
    if (new Set(input.sources.map(({ kind }) => kind)).size !== input.sources.length) {
        reasons.push("cloud-light-volume-source-kinds-are-duplicated");
    }
    if (input.sources.some((source) =>
        !finiteNonnegative3(source.atmosphereTransportedIrradianceRgb) ||
        (source.active && length3(source.directionToSource) < 1e-8))) {
        reasons.push("cloud-light-volume-direct-source-is-invalid");
    }
    if (input.faceExterior && input.faceExterior.length !==
        CLOUD_LIGHT_VOLUME_FACE_COUNT) {
        reasons.push("cloud-light-volume-face-exterior-count-is-not-six");
    }
    if (input.faceBoundaryKind && (input.faceBoundaryKind.length !==
        CLOUD_LIGHT_VOLUME_FACE_COUNT || input.faceBoundaryKind.some((kind) =>
        kind !== CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL &&
        kind !== CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR &&
        kind !== CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED))) {
        reasons.push("cloud-light-volume-face-boundary-kind-is-invalid");
    }
    const samplingFlags = input.samplingFlags ?? 0;
    if (!Number.isInteger(samplingFlags) || samplingFlags < 0 ||
        samplingFlags > CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK ||
        (samplingFlags & ~CLOUD_LIGHT_VOLUME_BRICK_SAMPLING_FLAG_MASK) !== 0) {
        reasons.push("cloud-light-volume-sampling-flags-are-invalid");
    }
    if ((samplingFlags & CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG) !== 0 &&
        (samplingFlags & CLOUD_LIGHT_VOLUME_BRICK_FILTERED_DIFFUSE_L1_FLAG) === 0) {
        // The reduced source grid is currently qualified only as part of the
        // complete conservative filtered policy; never enable it by itself.
        reasons.push("cloud-light-volume-paired-direct-requires-filtered-diffuse");
    }
    const axes = orthonormalAxes(input.axes);
    const extent = scale3(input.halfExtentKm, 2);
    const origin = mulAdd3(input.centerKm, axes[0], -input.halfExtentKm[0],
        axes[1], -input.halfExtentKm[1], axes[2], -input.halfExtentKm[2]);
    const diffusionTransform: CloudLightVolumeTransform = {
        originKm: origin,
        axes,
        cellSizeKm: [extent[0] / config.dimensions[0],
            extent[1] / config.dimensions[1], extent[2] / config.dimensions[2]],
    };
    const directAxes = orthonormalAxes(input.directDomain?.axes ?? axes);
    const corners = orientedBoxCorners(
        input.directDomain?.centerKm ?? input.centerKm,
        input.directDomain?.halfExtentKm ?? input.halfExtentKm,
        directAxes,
    );
    const stableSources = sourcesByStableSlot(input.sources);
    const directTransforms = [0, 1].map((sourceIndex) => sourceAlignedTransform(
        corners,
        stableSources[sourceIndex]?.directionToSource ?? [0, 1, 0],
        config.dimensions,
    )) as [CloudLightVolumeTransform, CloudLightVolumeTransform];
    const projection = projectCloudLightEnvironmentToFaces(input.environment, axes);
    reasons.push(...projection.validation.reasons);
    const maximumCellOpticalDepth = Math.max(0,
        input.maximumExtinctionPerKm ?? 0) * Math.hypot(
        ...diffusionTransform.cellSizeKm);
    const faceBoundaryKind = Array.from(
        { length: CLOUD_LIGHT_VOLUME_FACE_COUNT },
        (_, faceIndex): CloudLightVolumeBoundaryKind =>
            input.faceBoundaryKind?.[faceIndex] ??
            (input.faceExterior?.[faceIndex] ?? true
                ? CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR
                : CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL),
    );
    return {
        ownerIndex: input.ownerIndex,
        layerIndex: Math.min(2, Math.max(0, Math.floor(input.layerIndex ?? 0))),
        diffusionTransform,
        directTransforms,
        faceIrradianceRgb: projection.faceIrradianceRgb,
        faceBoundaryKind,
        faceExterior: faceBoundaryKind.map((kind) =>
            kind === CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR),
        maximumCellOpticalDepth,
        samplingFlags: reasons.some((reason) =>
            reason.startsWith("cloud-light-volume-sampling-")) ||
            reasons.includes("cloud-light-volume-paired-direct-requires-filtered-diffuse")
            ? 0 : samplingFlags,
        validation: { valid: reasons.length === 0, reasons: [...new Set(reasons)] },
    };
};

export interface CloudLightVolumeResolution {
    cellSizeKm: CloudLightVolumeVec3;
    maximumCellToMeanFreePathRatio: number;
    resolvesDenseTransport: boolean;
}

export interface CloudLightVolumeDirectFieldResolution {
    /** Stable Sun/Moon bits whose source fields are active this generation. */
    activeSourceMask: number;
    /** Active source bits meeting the independent direct-cell optical-depth gate. */
    qualifiedSourceMask: number;
    /** Maximum x/y/z cell optical depth for stable Sun and Moon transforms. */
    sourceMaximumCellOpticalDepth: readonly [number, number];
    maximumActiveSourceCellOpticalDepth: number;
    maximumPermittedCellOpticalDepth: number;
    qualifiesActiveSources: boolean;
}

/**
 * Qualify the two complete-owner, source-aligned Beer transforms. Inactive
 * sources are neutral and do not veto publication. Every active stable source
 * must pass; otherwise the owner remains absent from residentOwnerMask and the
 * shader's exact missing-owner trace remains authoritative.
 */
export const evaluateCloudLightVolumeDirectFieldResolution = (
    brick: CloudLightVolumeBrick,
    sources: readonly CloudLightVolumeDirectSource[],
    maximumExtinctionPerKm: number,
    maximumPermittedCellOpticalDepth =
        CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH,
): CloudLightVolumeDirectFieldResolution => {
    const stableSources = sourcesByStableSlot(sources);
    const validExtinction = Number.isFinite(maximumExtinctionPerKm) &&
        maximumExtinctionPerKm >= 0;
    const validThreshold = Number.isFinite(maximumPermittedCellOpticalDepth) &&
        maximumPermittedCellOpticalDepth > 0;
    let activeSourceMask = 0;
    let qualifiedSourceMask = 0;
    const sourceMaximumCellOpticalDepth = [0, 0] as [number, number];
    for (let sourceIndex = 0; sourceIndex < 2; sourceIndex += 1) {
        const source = stableSources[sourceIndex];
        if (!source?.active) continue;
        const sourceBit = 1 << sourceIndex;
        activeSourceMask |= sourceBit;
        const transform = brick.directTransforms[sourceIndex];
        const maximumCellAxisKm = Math.max(...transform.cellSizeKm.map(
            (value) => Math.abs(value)));
        const opticalDepth = validExtinction && Number.isFinite(maximumCellAxisKm)
            ? maximumExtinctionPerKm * maximumCellAxisKm
            : Number.POSITIVE_INFINITY;
        sourceMaximumCellOpticalDepth[sourceIndex] = opticalDepth;
        if (validThreshold && opticalDepth <=
            maximumPermittedCellOpticalDepth + 1e-12) {
            qualifiedSourceMask |= sourceBit;
        }
    }
    const maximumActiveSourceCellOpticalDepth = Math.max(
        ...sourceMaximumCellOpticalDepth);
    return {
        activeSourceMask,
        qualifiedSourceMask,
        sourceMaximumCellOpticalDepth,
        maximumActiveSourceCellOpticalDepth,
        maximumPermittedCellOpticalDepth,
        qualifiesActiveSources: validThreshold &&
            (qualifiedSourceMask & activeSourceMask) === activeSourceMask,
    };
};

export const evaluateCloudLightVolumeResolution = (
    brick: CloudLightVolumeBrick,
    minimumMeanFreePathKm: number,
): CloudLightVolumeResolution => {
    const largestCell = Math.max(...brick.diffusionTransform.cellSizeKm);
    const ratio = largestCell / Math.max(1e-9, minimumMeanFreePathKm);
    return {
        cellSizeKm: brick.diffusionTransform.cellSizeKm,
        maximumCellToMeanFreePathRatio: ratio,
        resolvesDenseTransport: ratio <= 1.5,
    };
};

const writeVec4 = (
    target: Float32Array,
    offset: number,
    xyz: CloudLightVolumeVec3,
    w: number,
) => {
    target[offset] = xyz[0];
    target[offset + 1] = xyz[1];
    target[offset + 2] = xyz[2];
    target[offset + 3] = w;
};

const writeTransform = (
    target: Float32Array,
    offset: number,
    transform: CloudLightVolumeTransform,
    active: number,
) => {
    writeVec4(target, offset, transform.originKm, active);
    writeVec4(target, offset + 4, transform.axes[0], transform.cellSizeKm[0]);
    writeVec4(target, offset + 8, transform.axes[1], transform.cellSizeKm[1]);
    writeVec4(target, offset + 12, transform.axes[2], transform.cellSizeKm[2]);
};

export const packCloudLightVolumeBricks = (
    bricks: readonly CloudLightVolumeBrick[],
    config: CloudLightVolumeGridConfig = CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
) => {
    if (bricks.length > config.maxBricks) {
        throw new Error(`Cloud light volume has ${bricks.length} bricks; ` +
            `the bounded layout permits ${config.maxBricks}`);
    }
    const data = new Float32Array(
        config.maxBricks * CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS);
    bricks.forEach((brick, index) => {
        if (!brick.validation.valid) {
            throw new Error(`Invalid cloud light brick ${index}: ` +
                brick.validation.reasons.join(", "));
        }
        const offset = index * CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS;
        writeTransform(data, offset, brick.diffusionTransform, 1);
        writeTransform(data, offset + 16, brick.directTransforms[0], 1);
        writeTransform(data, offset + 32, brick.directTransforms[1], 1);
        data[offset + 48] = brick.ownerIndex;
        data[offset + 49] = brick.layerIndex;
        data[offset + 50] = brick.maximumCellOpticalDepth;
        data[offset + 51] = packCloudLightVolumeBrickMetadata(
            brick.samplingFlags);
        brick.faceIrradianceRgb.forEach((irradiance, faceIndex) =>
            writeVec4(data, offset + 52 + faceIndex * 4, irradiance,
                brick.faceBoundaryKind[faceIndex]));
    });
    return {
        data,
        strideFloats: CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS,
        activeBrickCount: bricks.length,
    };
};

export const packCloudLightVolumeSources = (
    sourcesInput: readonly CloudLightVolumeDirectSource[],
) => {
    if (sourcesInput.length > CLOUD_LIGHT_VOLUME_SOURCE_COUNT) {
        throw new Error("Cloud light volume supports at most Sun and Moon");
    }
    if (new Set(sourcesInput.map(({ kind }) => kind)).size !== sourcesInput.length) {
        throw new Error("Cloud light volume source kinds must be unique");
    }
    const stableSources = sourcesByStableSlot(sourcesInput);
    const sources = [0, 1].map((index) => stableSources[index] ?? ({
        kind: index === 0 ? "sun" : "moon",
        directionToSource: [0, 1, 0],
        atmosphereTransportedIrradianceRgb: [0, 0, 0],
        active: false,
    } satisfies CloudLightVolumeDirectSource));
    const data = new Float32Array(
        CLOUD_LIGHT_VOLUME_SOURCE_COUNT * CLOUD_LIGHT_VOLUME_SOURCE_STRIDE_FLOATS);
    sources.forEach((source, index) => {
        const offset = index * CLOUD_LIGHT_VOLUME_SOURCE_STRIDE_FLOATS;
        writeVec4(data, offset, normalize3(source.directionToSource),
            source.active ? 1 : 0);
        writeVec4(data, offset + 4, source.atmosphereTransportedIrradianceRgb, 0);
    });
    return data;
};

/**
 * 64-byte WGSL-uniform payload: base dimensions, active/work brick indices, a
 * bounded level-local z slab, solver controls, and multigrid/bank I/O flags.
 */
export const packCloudLightVolumeUniforms = (
    plan: CloudLightVolumePlan,
    activeBrickCount: number,
    workBrickIndex = 0,
    slabStart = 0,
    slabDepth = plan.config.dimensions[2],
    level = 0,
    targetBank = 0,
    readPacked = false,
    writePacked = false,
) => {
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);
    const dimensions = plan.config.dimensions;
    [dimensions[0], dimensions[1], dimensions[2], plan.config.maxBricks]
        .forEach((value, index) => view.setUint32(index * 4, value, true));
    const boundedLevel = Math.min(plan.config.multigridLevels - 1,
        Math.max(0, Math.floor(level)));
    const levelDepth = Math.max(1, plan.config.dimensions[2] >> boundedLevel);
    const boundedSlabStart = Math.min(levelDepth - 1,
        Math.max(0, Math.floor(slabStart)));
    const boundedSlabDepth = Math.min(
        levelDepth - boundedSlabStart,
        Math.max(1, Math.floor(slabDepth)),
    );
    [Math.min(plan.config.maxBricks, Math.max(0, activeBrickCount)),
        Math.min(plan.config.maxBricks - 1, Math.max(0, workBrickIndex)),
        boundedSlabStart,
        boundedSlabDepth]
        .forEach((value, index) => view.setUint32(16 + index * 4, value, true));
    [plan.config.relaxation, plan.config.emptyExtinctionThresholdPerKm,
        plan.config.maximumFluence, plan.config.residualTolerance]
        .forEach((value, index) => view.setFloat32(32 + index * 4, value, true));
    [boundedLevel,
        Math.min(CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT - 1,
            Math.max(0, Math.floor(targetBank))),
        readPacked ? 1 : 0,
        writePacked ? 1 : 0]
        .forEach((value, index) => view.setUint32(48 + index * 4, value, true));
    return new Uint8Array(buffer);
};

/**
 * Fixed-size group-1 uniform. The renderer replaces this header and its brick
 * records only after the complete target bank passes global residual checks.
 */
export const packCloudLightVolumeViewUniforms = (
    packedBricks: Float32Array,
    readyMaskInput: number,
    config: CloudLightVolumeGridConfig = CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
    activeBank = 0,
    residentLayerMask = 0,
    residentOwnerMask: CloudLightVolumeOwnerMask = [0, 0],
) => {
    const brickFloatCount = config.maxBricks *
        CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS;
    if (packedBricks.length !== brickFloatCount) {
        throw new Error("Cloud light view brick payload has the wrong fixed size");
    }
    const validMask = config.maxBricks >= 32
        ? 0xffffffff
        : (2 ** config.maxBricks - 1) >>> 0;
    const readyMask = (readyMaskInput >>> 0) & validMask;
    const buffer = new ArrayBuffer(32 + brickFloatCount * 4);
    const header = new DataView(buffer);
    header.setUint32(0, readyMask, true);
    let readyCount = 0;
    for (let index = 0; index < config.maxBricks; index += 1) {
        if ((readyMask & (1 << index)) !== 0) readyCount += 1;
    }
    header.setUint32(4, readyCount, true);
    header.setUint32(8, CLOUD_LIGHT_VOLUME_SCHEMA, true);
    const atlasDepth = config.dimensions[2] * config.maxBricks;
    const boundedBank = Math.min(CLOUD_LIGHT_VOLUME_PACKED_BANK_COUNT - 1,
        Math.max(0, Math.floor(activeBank)));
    header.setUint32(12, boundedBank * CLOUD_LIGHT_VOLUME_PACKED_FIELD_COUNT *
        atlasDepth, true);
    header.setUint32(16, residentLayerMask & 0b111, true);
    header.setUint32(20, residentOwnerMask[0] >>> 0, true);
    header.setUint32(24, residentOwnerMask[1] >>> 0, true);
    header.setUint32(28, atlasDepth, true);
    const records = new Float32Array(buffer, 32, brickFloatCount);
    records.set(packedBricks);
    for (let index = 0; index < config.maxBricks; index += 1) {
        records[index * CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS + 3] =
            (readyMask & (1 << index)) !== 0 ? 1 : 0;
    }
    return new Uint8Array(buffer);
};

export interface CloudLightTransportCoefficients {
    absorptionPerKm: number;
    reducedScatteringPerKm: number;
    transportExtinctionPerKm: number;
    diffusionKm: number;
}

export const evaluateCloudLightTransportCoefficients = (
    extinctionPerKmInput: number,
    scatteringPerKmInput: number,
    asymmetryInput: number,
): CloudLightTransportCoefficients => {
    const extinction = Math.max(0, finite(extinctionPerKmInput)
        ? extinctionPerKmInput : 0);
    const scattering = Math.min(extinction, Math.max(0,
        finite(scatteringPerKmInput) ? scatteringPerKmInput : 0));
    const asymmetry = clamp(asymmetryInput, -0.99, 0.99);
    const absorption = extinction - scattering;
    const reducedScattering = scattering * (1 - asymmetry);
    const transport = absorption + reducedScattering;
    return {
        absorptionPerKm: absorption,
        reducedScatteringPerKm: reducedScattering,
        transportExtinctionPerKm: transport,
        diffusionKm: 1 / Math.max(3e-6, 3 * transport),
    };
};

/** Finite-volume coefficient for phi + 2 D d(phi)/dn = 4 E_in. */
export const marshakBoundaryCoefficient = (diffusionKm: number, cellSizeKm: number) => {
    const diffusion = Math.max(0, diffusionKm);
    const cellSize = Math.max(1e-9, cellSizeKm);
    return (2 * diffusion / (cellSize * cellSize)) /
        (1 + 4 * diffusion / cellSize);
};

export interface CloudLightGridReferenceInput {
    dimensions: readonly [number, number, number];
    cellSizeKm: CloudLightVolumeVec3;
    extinctionPerKm: ArrayLike<number>;
    scatteringPerKm: ArrayLike<number>;
    asymmetry: ArrayLike<number>;
    /** Unscattered Sun+Moon irradiance after direct volume transmittance. */
    directIncidentIrradiance: ArrayLike<number>;
    faceIrradiance: readonly [number, number, number, number, number, number];
    iterations: number;
    relaxation?: number;
    emptyExtinctionThresholdPerKm?: number;
}

export interface CloudLightGridReferenceResult {
    fluence: Float64Array;
    /** Last weighted-Jacobi update magnitude; retained for baseline diagnostics. */
    maximumResidual: number;
    /** Same equation normalization and occupancy semantics as GPU publication. */
    maximumNormalizedResidual: number;
    nonFiniteCount: number;
    occupiedCount: number;
}

/** Scalar-channel reference of the WGSL variable-coefficient Jacobi kernel. */
export const solveCloudLightGridReference = (
    input: CloudLightGridReferenceInput,
): CloudLightGridReferenceResult => {
    const [width, height, depth] = input.dimensions;
    const count = width * height * depth;
    for (const field of [input.extinctionPerKm, input.scatteringPerKm,
        input.asymmetry, input.directIncidentIrradiance]) {
        if (field.length !== count) throw new Error("Cloud light reference field size mismatch");
    }
    const indexOf = (x: number, y: number, z: number) =>
        x + width * (y + height * z);
    const transport = new Float64Array(count);
    const absorption = new Float64Array(count);
    const scattering = new Float64Array(count);
    const diffusion = new Float64Array(count);
    const active = new Uint8Array(count);
    const threshold = input.emptyExtinctionThresholdPerKm ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.emptyExtinctionThresholdPerKm;
    for (let index = 0; index < count; index += 1) {
        const coefficients = evaluateCloudLightTransportCoefficients(
            input.extinctionPerKm[index], input.scatteringPerKm[index],
            input.asymmetry[index]);
        transport[index] = coefficients.transportExtinctionPerKm;
        absorption[index] = coefficients.absorptionPerKm;
        scattering[index] = Math.min(Math.max(0, input.scatteringPerKm[index]),
            Math.max(0, input.extinctionPerKm[index]));
        diffusion[index] = coefficients.diffusionKm;
        active[index] = input.extinctionPerKm[index] > threshold ? 1 : 0;
    }
    let read = new Float64Array(count);
    let write = new Float64Array(count);
    const relaxation = clamp(input.relaxation ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.relaxation, 1e-4, 1);
    const neighbors = [
        [1, 0, 0, 0], [-1, 0, 0, 1], [0, 1, 0, 2],
        [0, -1, 0, 3], [0, 0, 1, 4], [0, 0, -1, 5],
    ] as const;
    const equationTerms = (
        x: number,
        y: number,
        z: number,
        field: Float64Array,
    ) => {
        const index = indexOf(x, y, z);
        let numerator = scattering[index] * Math.max(0,
            input.directIncidentIrradiance[index]);
        let denominator = absorption[index];
        for (const [dx, dy, dz, face] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            const axis = face < 2 ? 0 : face < 4 ? 1 : 2;
            const h = input.cellSizeKm[axis];
            const inside = nx >= 0 && nx < width && ny >= 0 && ny < height &&
                nz >= 0 && nz < depth;
            const neighborIndex = inside ? indexOf(nx, ny, nz) : -1;
            if (inside && active[neighborIndex]) {
                const harmonicD = 2 * diffusion[index] * diffusion[neighborIndex] /
                    Math.max(1e-12, diffusion[index] + diffusion[neighborIndex]);
                const coefficient = harmonicD / (h * h);
                numerator += coefficient * field[neighborIndex];
                denominator += coefficient;
            } else {
                const coefficient = marshakBoundaryCoefficient(diffusion[index], h);
                numerator += coefficient * 4 * Math.max(0,
                    input.faceIrradiance[face]);
                denominator += coefficient;
            }
        }
        return { numerator, denominator };
    };
    let maximumResidual = 0;
    for (let iteration = 0; iteration < input.iterations; iteration += 1) {
        maximumResidual = 0;
        for (let z = 0; z < depth; z += 1) for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = indexOf(x, y, z);
                if (!active[index]) {
                    write[index] = 0;
                    continue;
                }
                const { numerator, denominator } = equationTerms(x, y, z, read);
                const candidate = numerator / Math.max(1e-12, denominator);
                write[index] = read[index] + (candidate - read[index]) * relaxation;
                maximumResidual = Math.max(maximumResidual,
                    Math.abs(write[index] - read[index]));
            }
        }
        [read, write] = [write, read];
    }
    let maximumNormalizedResidual = 0;
    let nonFiniteCount = 0;
    let occupiedCount = 0;
    for (let z = 0; z < depth; z += 1) for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = indexOf(x, y, z);
            if (!active[index]) continue;
            occupiedCount += 1;
            const { numerator, denominator } = equationTerms(x, y, z, read);
            const applied = denominator * read[index];
            const normalized = Math.abs(numerator - applied) /
                Math.max(1e-5, Math.abs(numerator), Math.abs(applied));
            if (!Number.isFinite(read[index]) || !Number.isFinite(normalized)) {
                nonFiniteCount += 1;
                continue;
            }
            maximumNormalizedResidual = Math.max(
                maximumNormalizedResidual, normalized);
        }
    }
    return {
        fluence: read,
        maximumResidual,
        maximumNormalizedResidual,
        nonFiniteCount,
        occupiedCount,
    };
};

export interface CloudLightMultigridReferenceInput extends
Omit<CloudLightGridReferenceInput, "iterations"> {
    vCycles?: number;
    multigridLevels?: number;
    preSmoothIterations?: number;
    postSmoothIterations?: number;
    coarseSmoothIterations?: number;
}

export interface CloudLightMultigridReferenceResult extends
CloudLightGridReferenceResult {
    normalizedResidualByCycle: readonly number[];
}

/**
 * Scalar-channel executable specification of the production aggregation
 * multigrid hierarchy. The fine operator is exactly the P1 finite-volume
 * equation above. Every coarse operator is evaluated matrix-free as R A P,
 * with piecewise-constant P over occupied children and volume-average R.
 * This keeps disconnected condensate, fine void Marshak faces, and signed
 * correction residuals intact instead of rediscretizing diluted material.
 */
export const solveCloudLightMultigridReference = (
    input: CloudLightMultigridReferenceInput,
): CloudLightMultigridReferenceResult => {
    const [width, height, depth] = input.dimensions;
    const count = width * height * depth;
    for (const field of [input.extinctionPerKm, input.scatteringPerKm,
        input.asymmetry, input.directIncidentIrradiance]) {
        if (field.length !== count) {
            throw new Error("Cloud light multigrid reference field size mismatch");
        }
    }
    const levelCount = Math.max(1, Math.floor(input.multigridLevels ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.multigridLevels));
    if (input.dimensions.some((value) => value % 2 ** (levelCount - 1) !== 0)) {
        throw new Error("Cloud light multigrid dimensions must divide every level");
    }
    const dimensions = Array.from({ length: levelCount }, (_, level) =>
        input.dimensions.map((value) => value >> level) as
            [number, number, number]);
    const indexOf = (level: number, x: number, y: number, z: number) => {
        const current = dimensions[level];
        return x + current[0] * (y + current[1] * z);
    };
    const fineTransport = new Float64Array(count);
    const fineAbsorption = new Float64Array(count);
    const fineScattering = new Float64Array(count);
    const fineDiffusion = new Float64Array(count);
    const fineActive = new Uint8Array(count);
    const threshold = input.emptyExtinctionThresholdPerKm ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.emptyExtinctionThresholdPerKm;
    for (let index = 0; index < count; index += 1) {
        const coefficients = evaluateCloudLightTransportCoefficients(
            input.extinctionPerKm[index], input.scatteringPerKm[index],
            input.asymmetry[index]);
        fineTransport[index] = coefficients.transportExtinctionPerKm;
        fineAbsorption[index] = coefficients.absorptionPerKm;
        fineScattering[index] = Math.min(
            Math.max(0, input.scatteringPerKm[index]),
            Math.max(0, input.extinctionPerKm[index]));
        fineDiffusion[index] = coefficients.diffusionKm;
        fineActive[index] = input.extinctionPerKm[index] > threshold ? 1 : 0;
    }
    const levels = dimensions.map((current, level) => {
        const levelCount = current[0] * current[1] * current[2];
        const active = new Uint8Array(levelCount);
        if (level === 0) active.set(fineActive);
        else {
            const scale = 2 ** level;
            for (let z = 0; z < current[2]; z += 1) {
                for (let y = 0; y < current[1]; y += 1) {
                    for (let x = 0; x < current[0]; x += 1) {
                        let occupied = 0;
                        for (let fz = 0; fz < scale && !occupied; fz += 1) {
                            for (let fy = 0; fy < scale && !occupied; fy += 1) {
                                for (let fx = 0; fx < scale; fx += 1) {
                                    if (fineActive[indexOf(0,
                                        x * scale + fx,
                                        y * scale + fy,
                                        z * scale + fz)]) {
                                        occupied = 1;
                                        break;
                                    }
                                }
                            }
                        }
                        active[indexOf(level, x, y, z)] = occupied;
                    }
                }
            }
        }
        return {
            active,
            rhs: new Float64Array(levelCount),
            solution: new Float64Array(levelCount),
        };
    });
    for (let index = 0; index < count; index += 1) {
        levels[0].rhs[index] = fineScattering[index] * Math.max(0,
            input.directIncidentIrradiance[index]);
    }
    const neighborOffsets = [
        [1, 0, 0, 0], [-1, 0, 0, 1], [0, 1, 0, 2],
        [0, -1, 0, 3], [0, 0, 1, 4], [0, 0, -1, 5],
    ] as const;
    const fineCoefficient = (left: number, right: number, axis: number) =>
        (2 * fineDiffusion[left] * fineDiffusion[right] /
            Math.max(1e-12, fineDiffusion[left] + fineDiffusion[right])) /
        (input.cellSizeKm[axis] * input.cellSizeKm[axis]);
    const fineTerms = (x: number, y: number, z: number,
        field: Float64Array) => {
        const index = indexOf(0, x, y, z);
        let numerator = levels[0].rhs[index];
        let denominator = fineAbsorption[index];
        for (const [dx, dy, dz, face] of neighborOffsets) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            const axis = face < 2 ? 0 : face < 4 ? 1 : 2;
            const inside = nx >= 0 && nx < width && ny >= 0 && ny < height &&
                nz >= 0 && nz < depth;
            const neighbor = inside ? indexOf(0, nx, ny, nz) : -1;
            if (inside && fineActive[neighbor]) {
                const coefficient = fineCoefficient(index, neighbor, axis);
                numerator += coefficient * field[neighbor];
                denominator += coefficient;
            } else {
                const coefficient = marshakBoundaryCoefficient(
                    fineDiffusion[index], input.cellSizeKm[axis]);
                numerator += coefficient * 4 * Math.max(0,
                    input.faceIrradiance[face]);
                denominator += coefficient;
            }
        }
        return { numerator, denominator };
    };
    const aggregateTerms = (level: number, x: number, y: number, z: number,
        field: Float64Array) => {
        const scale = 2 ** level;
        const inverseVolume = 1 / scale ** 3;
        let numerator = levels[level].rhs[indexOf(level, x, y, z)];
        let transportNumerator = 0;
        let denominator = 0;
        for (let fz = 0; fz < scale; fz += 1) {
            for (let fy = 0; fy < scale; fy += 1) {
                for (let fx = 0; fx < scale; fx += 1) {
                    const fineX = x * scale + fx;
                    const fineY = y * scale + fy;
                    const fineZ = z * scale + fz;
                    const fine = indexOf(0, fineX, fineY, fineZ);
                    if (!fineActive[fine]) continue;
                    denominator += fineAbsorption[fine];
                    for (const [dx, dy, dz, face] of neighborOffsets) {
                        const nx = fineX + dx;
                        const ny = fineY + dy;
                        const nz = fineZ + dz;
                        const axis = face < 2 ? 0 : face < 4 ? 1 : 2;
                        const inside = nx >= 0 && nx < width &&
                            ny >= 0 && ny < height && nz >= 0 && nz < depth;
                        const neighbor = inside ? indexOf(0, nx, ny, nz) : -1;
                        if (inside && fineActive[neighbor]) {
                            const coarseX = Math.floor(nx / scale);
                            const coarseY = Math.floor(ny / scale);
                            const coarseZ = Math.floor(nz / scale);
                            if (coarseX === x && coarseY === y && coarseZ === z) {
                                continue;
                            }
                            const coefficient = fineCoefficient(
                                fine, neighbor, axis);
                            transportNumerator += coefficient * field[
                                indexOf(level, coarseX, coarseY, coarseZ)];
                            denominator += coefficient;
                        } else {
                            denominator += marshakBoundaryCoefficient(
                                fineDiffusion[fine], input.cellSizeKm[axis]);
                        }
                    }
                }
            }
        }
        numerator += transportNumerator * inverseVolume;
        denominator *= inverseVolume;
        return { numerator, denominator };
    };
    const terms = (level: number, x: number, y: number, z: number,
        field: Float64Array) => level === 0
        ? fineTerms(x, y, z, field)
        : aggregateTerms(level, x, y, z, field);
    const relaxation = clamp(input.relaxation ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.relaxation, 1e-4, 1);
    const smooth = (level: number, iterations: number) => {
        const current = dimensions[level];
        let read = levels[level].solution;
        let write = new Float64Array(read.length);
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            for (let z = 0; z < current[2]; z += 1) {
                for (let y = 0; y < current[1]; y += 1) {
                    for (let x = 0; x < current[0]; x += 1) {
                        const index = indexOf(level, x, y, z);
                        if (!levels[level].active[index]) {
                            write[index] = 0;
                            continue;
                        }
                        const equation = terms(level, x, y, z, read);
                        const candidate = equation.numerator /
                            Math.max(1e-12, equation.denominator);
                        write[index] = read[index] + relaxation *
                            (candidate - read[index]);
                    }
                }
            }
            [read, write] = [write, read];
        }
        levels[level].solution = read;
    };
    const restrictResidual = (targetLevel: number) => {
        const sourceLevel = targetLevel - 1;
        const targetDimensions = dimensions[targetLevel];
        const source = levels[sourceLevel];
        const target = levels[targetLevel];
        target.rhs.fill(0);
        target.solution.fill(0);
        for (let z = 0; z < targetDimensions[2]; z += 1) {
            for (let y = 0; y < targetDimensions[1]; y += 1) {
                for (let x = 0; x < targetDimensions[0]; x += 1) {
                    let restricted = 0;
                    for (let dz = 0; dz < 2; dz += 1) {
                        for (let dy = 0; dy < 2; dy += 1) {
                            for (let dx = 0; dx < 2; dx += 1) {
                                const sx = x * 2 + dx;
                                const sy = y * 2 + dy;
                                const sz = z * 2 + dz;
                                const sourceIndex = indexOf(
                                    sourceLevel, sx, sy, sz);
                                if (!source.active[sourceIndex]) continue;
                                const equation = terms(sourceLevel,
                                    sx, sy, sz, source.solution);
                                restricted += equation.numerator -
                                    equation.denominator *
                                        source.solution[sourceIndex];
                            }
                        }
                    }
                    target.rhs[indexOf(targetLevel, x, y, z)] =
                        restricted * 0.125;
                }
            }
        }
    };
    const prolongate = (fineLevel: number) => {
        const current = dimensions[fineLevel];
        const fine = levels[fineLevel];
        const coarse = levels[fineLevel + 1];
        for (let z = 0; z < current[2]; z += 1) {
            for (let y = 0; y < current[1]; y += 1) {
                for (let x = 0; x < current[0]; x += 1) {
                    const index = indexOf(fineLevel, x, y, z);
                    if (!fine.active[index]) continue;
                    fine.solution[index] += coarse.solution[indexOf(
                        fineLevel + 1,
                        Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2))];
                    if (fineLevel === 0) fine.solution[index] = Math.max(0,
                        fine.solution[index]);
                }
            }
        }
    };
    const normalizedResidual = () => {
        let maximum = 0;
        const solution = levels[0].solution;
        for (let z = 0; z < depth; z += 1) {
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const index = indexOf(0, x, y, z);
                    if (!fineActive[index]) continue;
                    const equation = fineTerms(x, y, z, solution);
                    const applied = equation.denominator * solution[index];
                    maximum = Math.max(maximum,
                        Math.abs(equation.numerator - applied) /
                        Math.max(1e-5, Math.abs(equation.numerator),
                            Math.abs(applied)));
                }
            }
        }
        return maximum;
    };
    const pre = input.preSmoothIterations ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.preSmoothIterations;
    const post = input.postSmoothIterations ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.postSmoothIterations;
    const coarseIterations = input.coarseSmoothIterations ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.coarseSmoothIterations;
    const cycleCount = input.vCycles ??
        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumVCycles;
    const normalizedResidualByCycle: number[] = [];
    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
        smooth(0, pre);
        for (let level = 1; level < levelCount; level += 1) {
            restrictResidual(level);
            smooth(level, level === levelCount - 1
                ? coarseIterations : pre);
        }
        for (let level = levelCount - 2; level >= 0; level -= 1) {
            prolongate(level);
            smooth(level, post);
        }
        normalizedResidualByCycle.push(normalizedResidual());
    }
    let nonFiniteCount = 0;
    let occupiedCount = 0;
    for (let index = 0; index < count; index += 1) {
        if (!fineActive[index]) continue;
        occupiedCount += 1;
        if (!Number.isFinite(levels[0].solution[index])) nonFiniteCount += 1;
    }
    return {
        fluence: levels[0].solution,
        maximumResidual: normalizedResidualByCycle.at(-1) ?? 0,
        maximumNormalizedResidual: normalizedResidualByCycle.at(-1) ?? 0,
        normalizedResidualByCycle,
        nonFiniteCount,
        occupiedCount,
    };
};

export interface HomogeneousSlabDiffusionInput {
    thicknessKm: number;
    extinctionPerKm: number;
    scatteringPerKm: number;
    asymmetry: number;
    sourceIrradiance: number;
}

/**
 * CPU reference for the source-grid representation used by the GPU direct
 * solve. Input cells are ordered from downstream y=0 to sourceward y=N-1;
 * each output is RGB transmittance at that cell's downstream face. Keeping a
 * true exit face makes the field valid for receivers beyond the owner OBB.
 */
export const integrateCloudLightVolumeBeerFaces = (
    extinctionRgbPerKm: readonly CloudLightVolumeVec3[],
    cellLengthKmInput: number,
): CloudLightVolumeVec3[] => {
    const cellLengthKm = Math.max(0,
        finite(cellLengthKmInput) ? cellLengthKmInput : 0);
    const result = Array<CloudLightVolumeVec3>(extinctionRgbPerKm.length);
    let transmittance: CloudLightVolumeVec3 = [1, 1, 1];
    for (let index = extinctionRgbPerKm.length - 1; index >= 0; index -= 1) {
        const extinction = extinctionRgbPerKm[index];
        const half = (value: number) => Math.exp(-Math.min(24,
            Math.max(0, finite(value) ? value : 0) * cellLengthKm * 0.5));
        const halfStep: CloudLightVolumeVec3 = [
            half(extinction[0]), half(extinction[1]), half(extinction[2]),
        ];
        transmittance = [
            transmittance[0] * halfStep[0] * halfStep[0],
            transmittance[1] * halfStep[1] * halfStep[1],
            transmittance[2] * halfStep[2] * halfStep[2],
        ];
        result[index] = transmittance;
    }
    return result;
};

/** Samples downstream-face Beer data at a source-grid cell-center coordinate. */
export const sampleCloudLightVolumeBeerFaces = (
    downstreamFaces: readonly CloudLightVolumeVec3[],
    centerY: number,
): CloudLightVolumeVec3 => {
    if (downstreamFaces.length === 0) return [1, 1, 1];
    const faceY = (finite(centerY) ? centerY : downstreamFaces.length) + 0.5;
    if (faceY >= downstreamFaces.length) return [1, 1, 1];
    const boundedFace = Math.max(0, faceY);
    const lower = Math.min(downstreamFaces.length - 1,
        Math.floor(boundedFace));
    const fraction = boundedFace - lower;
    const upper = lower + 1 < downstreamFaces.length
        ? downstreamFaces[lower + 1] : [1, 1, 1] as CloudLightVolumeVec3;
    const interpolate = (channel: number) => Math.exp(
        (1 - fraction) * Math.log(Math.max(
            1e-30, downstreamFaces[lower][channel])) +
        fraction * Math.log(Math.max(1e-30, upper[channel])));
    return [interpolate(0), interpolate(1), interpolate(2)];
};

/**
 * Analytic 1D P1 reference for a collimated beam and vacuum Marshak boundaries.
 * Source direction is +x into a slab spanning x=[0, thickness].
 */
export const evaluateHomogeneousSlabDiffusion = (
    input: HomogeneousSlabDiffusionInput,
    positionKmInput: number,
): number => {
    const thickness = Math.max(1e-9, input.thicknessKm);
    const x = clamp(positionKmInput, 0, thickness);
    const sigmaT = Math.max(1e-9, input.extinctionPerKm);
    const sigmaS = Math.min(sigmaT, Math.max(0, input.scatteringPerKm));
    const coefficients = evaluateCloudLightTransportCoefficients(
        sigmaT, sigmaS, input.asymmetry);
    const D = coefficients.diffusionKm;
    const sigmaA = coefficients.absorptionPerKm;
    const q0 = sigmaS * Math.max(0, input.sourceIrradiance);
    const solve2 = (a00: number, a01: number, a10: number, a11: number,
        b0: number, b1: number) => {
        const determinant = a00 * a11 - a01 * a10;
        if (Math.abs(determinant) < 1e-20) return [0, 0] as const;
        return [(b0 * a11 - a01 * b1) / determinant,
            (a00 * b1 - b0 * a10) / determinant] as const;
    };
    if (sigmaA <= 1e-10) {
        const particular = -q0 / (D * sigmaT * sigmaT);
        const [constant, slope] = solve2(
            1, -2 * D,
            1, thickness + 2 * D,
            -particular * (1 + 2 * D * sigmaT),
            -particular * Math.exp(-sigmaT * thickness) *
                (1 - 2 * D * sigmaT),
        );
        return Math.max(0, particular * Math.exp(-sigmaT * x) + constant + slope * x);
    }
    const k = Math.sqrt(sigmaA / D);
    const denominator = sigmaA - D * sigmaT * sigmaT;
    if (Math.abs(denominator) < 1e-10) {
        // The resonant case has an x*exp(-sigmaT*x) particular solution.
        const epsilon = sigmaT * 1e-5;
        return 0.5 * (
            evaluateHomogeneousSlabDiffusion({ ...input,
                extinctionPerKm: sigmaT - epsilon }, x) +
            evaluateHomogeneousSlabDiffusion({ ...input,
                extinctionPerKm: sigmaT + epsilon }, x));
    }
    const particular = q0 / denominator;
    const expK = Math.exp(k * thickness);
    const expMinusK = Math.exp(-k * thickness);
    const expT = Math.exp(-sigmaT * thickness);
    const [positive, negative] = solve2(
        1 - 2 * D * k, 1 + 2 * D * k,
        expK * (1 + 2 * D * k), expMinusK * (1 - 2 * D * k),
        -particular * (1 + 2 * D * sigmaT),
        -particular * expT * (1 - 2 * D * sigmaT),
    );
    return Math.max(0, positive * Math.exp(k * x) +
        negative * Math.exp(-k * x) + particular * Math.exp(-sigmaT * x));
};

/** P1 reconstruction with a per-channel realizability (nonnegative-radiance) limit. */
export const reconstructCloudLightP1Radiance = (
    fluence: number,
    current: CloudLightVolumeVec3,
    direction: CloudLightVolumeVec3,
) => {
    const boundedFluence = Math.max(0, fluence);
    const magnitude = length3(current);
    const limitedCurrent = magnitude > boundedFluence / 3 && magnitude > 1e-12
        ? scale3(current, boundedFluence / (3 * magnitude)) : current;
    return Math.max(0, (boundedFluence + 3 * dot3(
        limitedCurrent, normalize3(direction))) / (4 * Math.PI));
};

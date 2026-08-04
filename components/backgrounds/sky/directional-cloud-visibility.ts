/**
 * CPU contract for receiver-depth-resolved Sun/Moon cloud visibility.
 *
 * The GPU representation stores RGB visibility averaged over four coherent
 * source-plane sub-rays. Each sub-ray accumulates additive optical depth
 * independently before Beer attenuation; averaging extinction first would
 * turn partial coverage into nonphysical dark grey transmission.
 */

import {
    cloudRadiativeNormalize3,
    createCloudSourceAlignedBasis,
    projectCloudRadiativeOwnerDomain,
    type CloudRadiativeOwnerDomain,
    type CloudRadiativeOwnerProjection,
    type CloudRadiativeVec2,
    type CloudRadiativeVec3,
} from "./cloud-radiative-domain.ts";

export const DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA = 5;
export const DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT = 2;
export const DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT = 3;
export const DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT = 32;
export const DIRECTIONAL_CLOUD_VISIBILITY_PROFILE_LAYER_COUNT = 1;
export const DIRECTIONAL_CLOUD_VISIBILITY_WIDTH = 96;
export const DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT = 96;
export const DIRECTIONAL_CLOUD_VISIBILITY_FORMAT = "rgba16float" as const;
export const DIRECTIONAL_CLOUD_VISIBILITY_RGBA16_BYTES = 8;
export const DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH = 24;
/**
 * The compute pass integrates the square footprint of every source-plane
 * texel with tensor-product two-node Gauss-Legendre quadrature.  The node is
 * expressed in texel widths (rather than on [-1, 1]).
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE =
    0.28867513459481287;
export const DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT = 4;
/** Baseline GL2 rule retained by intervals without resolved Ci/Cc/Cs owners. */
export const DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_DEPTH_SAMPLE_COUNT = 2;
/** Thin raw-R high-ice intervals use the positive four-node GL rule. */
export const DIRECTIONAL_CLOUD_VISIBILITY_HIGH_ICE_DEPTH_SAMPLE_COUNT = 4;
export const DIRECTIONAL_CLOUD_VISIBILITY_MAXIMUM_DEPTH_SAMPLE_COUNT =
    DIRECTIONAL_CLOUD_VISIBILITY_HIGH_ICE_DEPTH_SAMPLE_COUNT;
export const DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLES_PER_DEPTH =
    DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
/** Four monotone depth knots, one hardware-linear lateral fetch per knot. */
/** Four knots in one cascade, or eight only inside a cascade blend band. */
export const DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_COUNT = 8;
export const DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_CEILING = 8;
/** Worst-case Sun + Moon atlas traffic for one camera-cloud source event. */
export const DIRECTIONAL_CLOUD_VISIBILITY_CAMERA_EVENT_FETCH_CEILING =
    DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
    DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_CEILING;
/**
 * Hardware-linear tent reconstruction reaches the adjacent texel centre. A
 * second clear texel covers the producer footprint so the far-domain boundary
 * remains exactly clear under clamp-to-edge sampling.
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS = 2;
/**
 * Two-node Gauss-Legendre integration over each camera-path interval. The
 * atmosphere pass cannot reuse its clear-sky LUT after spatial cloud
 * visibility is introduced, and the former sixteen point samples promoted a
 * single shadow-map hit to an entire multi-kilometre air segment.
 */
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT = 32;
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE =
    0.5773502691896257;
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_BASE_SAMPLE_COUNT = 2;
/** Three extra Gauss-Kronrod nodes retain both base nodes when refined. */
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_REFINEMENT_EXTRA_SAMPLE_COUNT = 3;
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT =
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT *
    (DIRECTIONAL_CLOUD_AERIAL_SHADOW_BASE_SAMPLE_COUNT +
        DIRECTIONAL_CLOUD_AERIAL_SHADOW_REFINEMENT_EXTRA_SAMPLE_COUNT);
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD = 0.12;
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_PARTIAL_THRESHOLD = 0.08;
export const DIRECTIONAL_CLOUD_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD = 0.2;
export const DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES = 176;
export const DIRECTIONAL_CLOUD_VISIBILITY_CORE_MAX_ARRAY_LAYERS = 256;
export const DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP = [2, 2, 32] as const;
export const DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH = [48, 48, 6] as const;
export const DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUPS =
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0] *
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1] *
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[2];
export const DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUP_CEILING = 14_000;
export const DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_INVOCATIONS =
    DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP[0] *
    DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP[1] *
    DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP[2];
/**
 * Two scan arrays, one shared two-word finite-owner mask, and one high-ice
 * quadrature flag per depth lane.
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_STORAGE_BYTES =
    2 * 4 * DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT * 16 +
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT * 2 *
        Uint32Array.BYTES_PER_ELEMENT +
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT *
        Uint32Array.BYTES_PER_ELEMENT;
export const DIRECTIONAL_CLOUD_VISIBILITY_DEFAULT_EXTENTS_KM =
    [20, 64, 192] as const;
export const DIRECTIONAL_CLOUD_VISIBILITY_MINIMUM_NEAR_EXTENT_KM = 6;
/** Spatial influence radius used only to translate the near source-plane clip. */
export const DIRECTIONAL_CLOUD_VISIBILITY_NEAR_INFLUENCE_RADIUS_KM = 20;
/**
 * A connected owner intersecting this inner fraction remains wholly
 * receiver-important. Only the outer annulus contracts it continuously into
 * the middle cascade.
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_NEAR_CORE_RADIUS_FRACTION = 0.75;
export const DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE =
    [0.76, 0.96] as const;
export const DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SPAN_RATIO = 2;
export const DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SCALE_FRACTION = 0.2;
export const DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_MINIMUM_SCALE_KM = 1;

export const DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT =
    DIRECTIONAL_CLOUD_VISIBILITY_PROFILE_LAYER_COUNT +
    DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT;
export const DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES =
    DIRECTIONAL_CLOUD_VISIBILITY_WIDTH *
    DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT *
    DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT *
    DIRECTIONAL_CLOUD_VISIBILITY_RGBA16_BYTES;
export const DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_CEILING_BYTES =
    16 * 1024 * 1024;
/**
 * One two-word owner mask for every source/cascade, 2x2 plane workgroup and
 * receiver-depth interval.  CPU projection of finite owner OBBs into these
 * slabs lets empty workgroups and disjoint depth lanes fail before any cloud
 * texture or morphology access.
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_WORD_COUNT = 2;
export const DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT =
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0] *
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1] *
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[2] *
    (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1);
export const DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES =
    DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT *
    DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_WORD_COUNT * Uint32Array.BYTES_PER_ELEMENT;
export const DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_MEMORY_CEILING_BYTES =
    4 * 1024 * 1024;
export const DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_BYTES =
    DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES +
    DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES;
export const DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_CEILING_BYTES =
    20 * 1024 * 1024;
export const DIRECTIONAL_CLOUD_VISIBILITY_MAX_FINITE_OWNER_COUNT = 36;
/**
 * Worst-case sixteen separable depth/footprint samples at every plane-column
 * interval when each conservative mask contains resolved high ice.
 */
export const DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_SITES =
    DIRECTIONAL_CLOUD_VISIBILITY_WIDTH *
    DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT *
    DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
    DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT *
    (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1) *
    DIRECTIONAL_CLOUD_VISIBILITY_MAXIMUM_DEPTH_SAMPLE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLES_PER_DEPTH;
export const DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_CEILING =
    28_000_000;
/** The producer is forbidden from calling the procedural view-medium graph. */
export const DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_MEDIUM_EVALUATIONS = 0;
export const DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_EVALUATION_CEILING =
    0;

export const DIRECTIONAL_CLOUD_VISIBILITY_LAYOUT = Object.freeze({
    width: DIRECTIONAL_CLOUD_VISIBILITY_WIDTH,
    height: DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT,
    depthOrArrayLayers: DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT,
    format: DIRECTIONAL_CLOUD_VISIBILITY_FORMAT,
    profileLayerCount: DIRECTIONAL_CLOUD_VISIBILITY_PROFILE_LAYER_COUNT,
    sourceCount: DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT,
    cascadesPerSource: DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT,
    depthKnots: DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT,
    textureMemoryBytes: DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES,
    uniformBytes: DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES,
    workgroup: DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP,
    dispatch: DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH,
    dispatchWorkgroups: DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUPS,
    lookupFetches: DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_COUNT,
    producerMediumEvaluations:
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_MEDIUM_EVALUATIONS,
    producerHierarchyQuerySites:
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_SITES,
    ownerMaskBytes: DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES,
    totalGpuMemoryBytes: DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_BYTES,
    workgroupStorageBytes: DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_STORAGE_BYTES,
    textureMemoryCeilingBytes:
        DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_CEILING_BYTES,
    dispatchWorkgroupCeiling:
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUP_CEILING,
    lookupFetchCeiling: DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_CEILING,
    producerEvaluationCeiling:
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_EVALUATION_CEILING,
    producerHierarchyQueryCeiling:
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_CEILING,
    ownerMaskMemoryCeilingBytes:
        DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_MEMORY_CEILING_BYTES,
    totalGpuMemoryCeilingBytes:
        DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_CEILING_BYTES,
});

export interface DirectionalCloudVisibilityValidation {
    valid: boolean;
    reasons: readonly string[];
}

export interface DirectionalCloudVisibilityDomain {
    sourceIndex: number;
    cascadeIndex: number;
    minimumDepthKm: number;
    maximumDepthKm: number;
    inverseDepthSpanPerKm: number;
    /** Source-plane clip centre relative to the observer. */
    planeCenterKm: CloudRadiativeVec2;
    planeHalfExtentKm: number;
    /** Shared source-wide depth-warp reference, equal to cascade zero's extent. */
    depthWarpReferenceExtentKm: number;
    ownerIndices: readonly number[];
}

export interface DirectionalCloudVisibilityDomainInput {
    owners: readonly CloudRadiativeOwnerDomain[];
    observerAtmosphereWorldKm: CloudRadiativeVec3;
    sourceDirectionsAtmosphere: readonly CloudRadiativeVec3[];
    baseCascadeExtentsKm?: readonly [number, number, number];
}

export interface DirectionalCloudVisibilityDomainSet {
    domains: readonly DirectionalCloudVisibilityDomain[];
    sourceDirectionsAtmosphere: readonly [CloudRadiativeVec3, CloudRadiativeVec3];
    observerAtmosphereWorldKm: CloudRadiativeVec3;
    validation: DirectionalCloudVisibilityValidation;
}

const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, finite(value) ? value : minimum));
const saturate = (value: number) => clamp(value, 0, 1);
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;
const smoothstep = (minimum: number, maximum: number, value: number) => {
    const unit = saturate((value - minimum) / Math.max(1e-12, maximum - minimum));
    return unit * unit * (3 - 2 * unit);
};
const add3 = (
    left: CloudRadiativeVec3,
    right: CloudRadiativeVec3,
): CloudRadiativeVec3 => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const scale3 = (
    value: CloudRadiativeVec3,
    scale: number,
): CloudRadiativeVec3 => [value[0] * scale, value[1] * scale, value[2] * scale];
const expNegative3 = (opticalDepth: CloudRadiativeVec3): CloudRadiativeVec3 => [
    Math.exp(-Math.min(DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH,
        Math.max(0, opticalDepth[0]))),
    Math.exp(-Math.min(DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH,
        Math.max(0, opticalDepth[1]))),
    Math.exp(-Math.min(DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH,
        Math.max(0, opticalDepth[2]))),
];
const rounded = (value: number) => Number(value.toFixed(9));

export interface DirectionalCloudAerialShadowQuadratureSample {
    distanceKm: number;
    weightKm: number;
}

/** CPU reference for the bounded camera-path quadrature mirrored by WGSL. */
export const createDirectionalCloudAerialShadowQuadrature = (
    distanceKm: number,
    distributionPower: number,
): readonly DirectionalCloudAerialShadowQuadratureSample[] => {
    if (!(finite(distanceKm) && distanceKm >= 0) ||
        !(finite(distributionPower) && distributionPower >= 1 &&
            distributionPower <= 2)) {
        throw new RangeError("Aerial-shadow quadrature inputs are out of range");
    }
    const result: DirectionalCloudAerialShadowQuadratureSample[] = [];
    const halfUnit = 0.5 / DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT;
    for (let interval = 0;
        interval < DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT;
        interval += 1) {
        const centre = (interval + 0.5) /
            DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT;
        for (const sign of [-1, 1]) {
            const unit = centre + sign * halfUnit *
                DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE;
            result.push(Object.freeze({
                distanceKm: distanceKm * unit ** distributionPower,
                weightKm: distanceKm * distributionPower *
                    unit ** (distributionPower - 1) * halfUnit,
            }));
        }
    }
    return Object.freeze(result);
};

export interface DirectionalCloudAerialShadowLossNode {
    cameraTransmittance: CloudRadiativeVec3;
    removedSourceCoefficient: CloudRadiativeVec3;
    /** Maximum enabled-source shadow fraction at this camera-path point. */
    shadowAmount: number;
    /** Zero for clear/opaque support and positive for fractional visibility. */
    partiality: number;
}

export type DirectionalCloudAerialShadowLossEvaluator = (
    distanceKm: number,
) => DirectionalCloudAerialShadowLossNode;

const AERIAL_SHADOW_KRONROD_OUTER_NODE = Math.sqrt(6 / 7);
const AERIAL_SHADOW_KRONROD_BASE_WEIGHT = 0.4909090909090909;
const AERIAL_SHADOW_KRONROD_OUTER_WEIGHT = 0.19797979797979798;
const AERIAL_SHADOW_KRONROD_CENTER_WEIGHT = 0.6222222222222222;

const safeAerialShadowLossNode = (
    evaluator: DirectionalCloudAerialShadowLossEvaluator,
    distanceKm: number,
) => {
    const node = evaluator(distanceKm);
    const rgb = [...node.cameraTransmittance,
        ...node.removedSourceCoefficient];
    if (rgb.some((value) => !finite(value) || value < 0) ||
        !(finite(node.shadowAmount) && node.shadowAmount >= 0 &&
            node.shadowAmount <= 1) ||
        !(finite(node.partiality) && node.partiality >= 0 &&
            node.partiality <= 1)) {
        throw new RangeError("Aerial-shadow loss node is out of range");
    }
    return Object.freeze({
        ...node,
        integrand: node.cameraTransmittance.map((value, channel) =>
            value * node.removedSourceCoefficient[channel]) as
            unknown as CloudRadiativeVec3,
    });
};

/**
 * CPU mirror of the atmosphere background loss kernel. The base two-node rule
 * is replaced by its embedded five-node Gauss-Kronrod extension only where
 * shadow state is fractional or materially changes across the interval.
 */
export const integrateDirectionalCloudAerialShadowLoss = (
    distanceKm: number,
    distributionPower: number,
    evaluator: DirectionalCloudAerialShadowLossEvaluator,
) => {
    if (!(finite(distanceKm) && distanceKm >= 0) ||
        !(finite(distributionPower) && distributionPower >= 1 &&
            distributionPower <= 2)) {
        throw new RangeError("Aerial-shadow loss integration is out of range");
    }
    let loss: CloudRadiativeVec3 = [0, 0, 0];
    let sampleCount = 0;
    let refinedIntervalCount = 0;
    const intervalCount = DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT;
    for (let interval = 0; interval < intervalCount; interval += 1) {
        const unitMinimum = interval / intervalCount;
        const unitMaximum = (interval + 1) / intervalCount;
        const distanceMinimum = distanceKm * unitMinimum ** distributionPower;
        const distanceMaximum = distanceKm * unitMaximum ** distributionPower;
        const center = (distanceMinimum + distanceMaximum) * 0.5;
        const halfLength = (distanceMaximum - distanceMinimum) * 0.5;
        const leftDistance = center - halfLength *
            DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE;
        const rightDistance = center + halfLength *
            DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE;
        const left = safeAerialShadowLossNode(evaluator, leftDistance);
        const right = safeAerialShadowLossNode(evaluator, rightDistance);
        sampleCount += 2;
        const maximumLoss = Math.max(...left.integrand, ...right.integrand);
        const lossDisagreement = Math.max(...left.integrand.map(
            (value, channel) => Math.abs(value - right.integrand[channel]))) >
            Math.max(1e-8, maximumLoss *
                DIRECTIONAL_CLOUD_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD);
        const refine =
            Math.abs(left.shadowAmount - right.shadowAmount) >
                DIRECTIONAL_CLOUD_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD ||
            Math.max(left.partiality, right.partiality) >
                DIRECTIONAL_CLOUD_AERIAL_SHADOW_PARTIAL_THRESHOLD ||
            lossDisagreement;
        const addNode = (node: typeof left, weight: number) => {
            loss = add3(loss, scale3(node.integrand,
                halfLength * weight));
        };
        if (!refine) {
            addNode(left, 1);
            addNode(right, 1);
            continue;
        }
        refinedIntervalCount += 1;
        const outerLeftDistance = center - halfLength *
            AERIAL_SHADOW_KRONROD_OUTER_NODE;
        const outerRightDistance = center + halfLength *
            AERIAL_SHADOW_KRONROD_OUTER_NODE;
        const outerLeft = safeAerialShadowLossNode(
            evaluator, outerLeftDistance);
        const middle = safeAerialShadowLossNode(evaluator, center);
        const outerRight = safeAerialShadowLossNode(
            evaluator, outerRightDistance);
        sampleCount +=
            DIRECTIONAL_CLOUD_AERIAL_SHADOW_REFINEMENT_EXTRA_SAMPLE_COUNT;
        addNode(outerLeft, AERIAL_SHADOW_KRONROD_OUTER_WEIGHT);
        addNode(left, AERIAL_SHADOW_KRONROD_BASE_WEIGHT);
        addNode(middle, AERIAL_SHADOW_KRONROD_CENTER_WEIGHT);
        addNode(right, AERIAL_SHADOW_KRONROD_BASE_WEIGHT);
        addNode(outerRight,
            AERIAL_SHADOW_KRONROD_OUTER_WEIGHT);
    }
    return Object.freeze({
        loss: Object.freeze(loss) as CloudRadiativeVec3,
        sampleCount,
        refinedIntervalCount,
    });
};

export const directionalCloudVisibilityLayerIndex = (
    sourceIndex: number,
    cascadeIndex: number,
    knotIndex: number,
) => {
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 ||
        sourceIndex >= DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT ||
        !Number.isInteger(cascadeIndex) || cascadeIndex < 0 ||
        cascadeIndex >= DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT ||
        !Number.isInteger(knotIndex) || knotIndex < 0 ||
        knotIndex >= DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT) {
        throw new RangeError("Directional cloud visibility layer coordinate is out of range");
    }
    return DIRECTIONAL_CLOUD_VISIBILITY_PROFILE_LAYER_COUNT +
        (sourceIndex * DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT + cascadeIndex) *
            DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT + knotIndex;
};

export const validateDirectionalCloudVisibilityLayout = ():
DirectionalCloudVisibilityValidation => {
    const reasons: string[] = [];
    if (DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT >
        DIRECTIONAL_CLOUD_VISIBILITY_CORE_MAX_ARRAY_LAYERS) {
        reasons.push("visibility-atlas-exceeds-webgpu-core-array-layer-limit");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES !== 176) {
        reasons.push("visibility-uniform-must-remain-176-bytes");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT < 2 ||
        (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT &
            (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1)) !== 0) {
        reasons.push("visibility-depth-knot-count-must-be-a-power-of-two");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_INVOCATIONS > 256) {
        reasons.push("visibility-workgroup-exceeds-webgpu-core-invocations");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_STORAGE_BYTES > 16_384) {
        reasons.push("visibility-workgroup-exceeds-webgpu-core-storage");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES >
        DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_CEILING_BYTES) {
        reasons.push("visibility-atlas-exceeds-fixed-memory-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUPS >
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUP_CEILING) {
        reasons.push("visibility-dispatch-exceeds-fixed-workgroup-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_COUNT >
        DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_CEILING) {
        reasons.push("visibility-sampling-exceeds-fixed-fetch-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES >
        DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_MEMORY_CEILING_BYTES) {
        reasons.push("visibility-owner-mask-exceeds-fixed-memory-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_BYTES >
        DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_CEILING_BYTES) {
        reasons.push("visibility-resources-exceed-fixed-total-memory-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_SITES >
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_CEILING) {
        reasons.push("visibility-producer-exceeds-fixed-hierarchy-query-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_MEDIUM_EVALUATIONS >
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_EVALUATION_CEILING) {
        reasons.push("visibility-producer-exceeds-fixed-evaluation-ceiling");
    }
    if (DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0] *
            DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP[0] !==
            DIRECTIONAL_CLOUD_VISIBILITY_WIDTH ||
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1] *
            DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP[1] !==
            DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT ||
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[2] !==
            DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
                DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT) {
        reasons.push("visibility-dispatch-does-not-cover-the-atlas-contract");
    }
    return { valid: reasons.length === 0, reasons };
};

export const validateDirectionalCloudVisibilityDomains = (
    domainsInput: readonly DirectionalCloudVisibilityDomain[],
): DirectionalCloudVisibilityValidation => {
    const reasons: string[] = [];
    const domains = [...domainsInput].sort((left, right) =>
        domainSlot(left.sourceIndex, left.cascadeIndex) -
            domainSlot(right.sourceIndex, right.cascadeIndex));
    if (domains.length !== DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT) {
        reasons.push("visibility-requires-one-domain-per-source-cascade");
    }
    domains.forEach((domain, index) => {
        if (!Number.isInteger(domain.sourceIndex) || domain.sourceIndex < 0 ||
            domain.sourceIndex >= DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT ||
            !Number.isInteger(domain.cascadeIndex) || domain.cascadeIndex < 0 ||
            domain.cascadeIndex >= DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT) {
            reasons.push("visibility-domain-coordinate-is-out-of-range");
            return;
        }
        if (domainSlot(domain.sourceIndex, domain.cascadeIndex) !== index) {
            reasons.push("visibility-domain-coordinate-is-duplicated-or-missing");
        }
        const fields = [domain.minimumDepthKm, domain.maximumDepthKm,
            domain.inverseDepthSpanPerKm, domain.planeHalfExtentKm,
            domain.depthWarpReferenceExtentKm,
            ...domain.planeCenterKm];
        if (fields.some((value) => !finite(value))) {
            reasons.push("visibility-domain-fields-must-be-finite");
        }
        if (!(domain.planeHalfExtentKm > 0)) {
            reasons.push("visibility-domain-plane-extent-must-be-positive");
        }
        if (!(domain.depthWarpReferenceExtentKm > 0)) {
            reasons.push("visibility-domain-depth-warp-reference-must-be-positive");
        }
        if (domain.inverseDepthSpanPerKm === 0) {
            if (domain.minimumDepthKm !== domain.maximumDepthKm ||
                domain.ownerIndices.length !== 0) {
                reasons.push("empty-visibility-domain-must-have-zero-span-and-no-owners");
            }
        } else {
            const span = domain.maximumDepthKm - domain.minimumDepthKm;
            if (!(span > 0) || !(domain.inverseDepthSpanPerKm > 0) ||
                Math.abs(domain.inverseDepthSpanPerKm * span - 1) > 1e-5) {
                reasons.push("active-visibility-domain-has-inconsistent-depth-span");
            }
            if (domain.ownerIndices.length === 0) {
                reasons.push("active-visibility-domain-must-have-an-owner");
            }
        }
        if (domain.ownerIndices.some((owner, ownerIndex) =>
            !Number.isInteger(owner) || owner < 0 ||
            owner >= DIRECTIONAL_CLOUD_VISIBILITY_MAX_FINITE_OWNER_COUNT ||
            (ownerIndex > 0 && owner <= domain.ownerIndices[ownerIndex - 1]))) {
            reasons.push("visibility-domain-owner-indices-must-be-unique-and-sorted");
        }
    });
    for (let sourceIndex = 0;
        sourceIndex < DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT;
        sourceIndex += 1) {
        const sourceDomains = domains.filter((domain) =>
            domain.sourceIndex === sourceIndex);
        const extents = sourceDomains.map((domain) =>
            domain.planeHalfExtentKm);
        if (sourceDomains.length === DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT &&
            !(extents[0] < extents[1] && extents[1] < extents[2])) {
            reasons.push("visibility-cascade-extents-must-be-strictly-nested");
        }
        if (sourceDomains.length === DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT &&
            sourceDomains.some((domain) =>
                Math.abs(domain.depthWarpReferenceExtentKm - extents[0]) >
                    1e-6)) {
            reasons.push("visibility-cascades-must-share-source-depth-warp-reference");
        }
        for (let cascadeIndex = 0;
            cascadeIndex + 1 < sourceDomains.length; cascadeIndex += 1) {
            const inner = sourceDomains[cascadeIndex];
            const outer = sourceDomains[cascadeIndex + 1];
            if (Math.abs(inner.planeCenterKm[0] - outer.planeCenterKm[0]) +
                    inner.planeHalfExtentKm > outer.planeHalfExtentKm + 1e-6 ||
                Math.abs(inner.planeCenterKm[1] - outer.planeCenterKm[1]) +
                    inner.planeHalfExtentKm > outer.planeHalfExtentKm + 1e-6) {
                reasons.push("visibility-cascade-clips-must-be-geometrically-nested");
            }
            const outerOwners = new Set(outer.ownerIndices);
            if (inner.ownerIndices.some((owner) => !outerOwners.has(owner))) {
                reasons.push("visibility-cascade-owner-sets-must-be-nested");
            }
        }
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
};

const projectionMaximumPlaneCoordinate = (
    minimum: CloudRadiativeVec2,
    maximum: CloudRadiativeVec2,
) => Math.max(Math.abs(minimum[0]), Math.abs(minimum[1]),
    Math.abs(maximum[0]), Math.abs(maximum[1]));

const projectionDistanceFromObserver = (
    projection: CloudRadiativeOwnerProjection,
) => {
    const intervalDistance = (minimum: number, maximum: number) =>
        minimum > 0 ? minimum : maximum < 0 ? -maximum : 0;
    return Math.hypot(
        intervalDistance(projection.planeMinimumKm[0],
            projection.planeMaximumKm[0]),
        intervalDistance(projection.planeMinimumKm[1],
            projection.planeMaximumKm[1]),
        intervalDistance(projection.depthMinimumKm,
            projection.depthMaximumKm),
    );
};

const projectionOverlapsCenteredSquare = (
    projection: CloudRadiativeOwnerProjection,
    centerKm: CloudRadiativeVec2,
    halfExtentKm: number,
    guardKm: number,
) => projection.planeMaximumKm[0] >= centerKm[0] - halfExtentKm - guardKm &&
    projection.planeMinimumKm[0] <= centerKm[0] + halfExtentKm + guardKm &&
    projection.planeMaximumKm[1] >= centerKm[1] - halfExtentKm - guardKm &&
    projection.planeMinimumKm[1] <= centerKm[1] + halfExtentKm + guardKm;

interface WeightedNearProjection {
    projection: CloudRadiativeOwnerProjection;
    influence: number;
}

/**
 * Derive a bounded receiver-important clip without selecting a winning owner.
 * Every projection contributes through a C1 compact-support weight, so tied
 * owners average deterministically and an owner handoff cannot jump the atlas.
 */
const deriveDirectionalVisibilityNearClip = (
    projections: readonly CloudRadiativeOwnerProjection[],
    baseExtents: readonly [number, number, number],
) => {
    const radius = DIRECTIONAL_CLOUD_VISIBILITY_NEAR_INFLUENCE_RADIUS_KM;
    const coreRadius = radius *
        DIRECTIONAL_CLOUD_VISIBILITY_NEAR_CORE_RADIUS_FRACTION;
    const weighted: WeightedNearProjection[] = projections.map((projection) => ({
        projection,
        influence: 1 - smoothstep(coreRadius, radius,
            projectionDistanceFromObserver(projection)),
    }));
    // Source visibility is queried at finite receivers, not only at the
    // observer. Anchoring the finest clip to the observer made an elongated
    // connected owner inside the near core land almost entirely in the
    // kilometre-scale middle cascade. Use the receiver projections' centroid;
    // a C1 activation still returns it continuously to the observer when the
    // final owner crosses the outer influence boundary.
    let totalWeight = 0;
    let centerX = 0;
    let centerY = 0;
    for (const { projection, influence } of weighted) {
        if (influence <= 0) continue;
        const midpointX = (projection.planeMinimumKm[0] +
            projection.planeMaximumKm[0]) * 0.5;
        const midpointY = (projection.planeMinimumKm[1] +
            projection.planeMaximumKm[1]) * 0.5;
        centerX += midpointX * influence;
        centerY += midpointY * influence;
        totalWeight += influence;
    }
    if (totalWeight > 1e-12) {
        const activation = smoothstep(0, 1, Math.min(1, totalWeight));
        centerX = centerX / totalWeight * activation;
        centerY = centerY / totalWeight * activation;
    }

    const minimumExtent = Math.min(baseExtents[0],
        DIRECTIONAL_CLOUD_VISIBILITY_MINIMUM_NEAR_EXTENT_KM);
    const extentRequirements = [minimumExtent];
    for (const { projection, influence } of weighted) {
        if (influence <= 0) continue;
        // Contract only in the C1 outer handoff annulus. Inner-core owners use
        // their complete projected support, preventing one physical cloud from
        // being split across incompatible source-field band-limits.
        const support = smoothstep(0, 1, influence);
        const boundedMinimumX = projection.planeMinimumKm[0] * support;
        const boundedMaximumX = projection.planeMaximumKm[0] * support;
        const boundedMinimumY = projection.planeMinimumKm[1] * support;
        const boundedMaximumY = projection.planeMaximumKm[1] * support;
        extentRequirements.push(
            Math.abs(boundedMinimumX - centerX),
            Math.abs(boundedMaximumX - centerX),
            Math.abs(boundedMinimumY - centerY),
            Math.abs(boundedMaximumY - centerY));
    }
    // An even L8 norm is a smooth conservative maximum. Unlike choosing the
    // farthest owner, it has no derivative handoff when equally near owners
    // exchange order under an arbitrarily small translation.
    const requiredExtent = extentRequirements.reduce((sum, requirement) =>
        sum + requirement ** 8, 0) ** (1 / 8);
    const supportScale = DIRECTIONAL_CLOUD_VISIBILITY_WIDTH /
        (DIRECTIONAL_CLOUD_VISIBILITY_WIDTH -
            2 * DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS);
    const extent = clamp(requiredExtent * supportScale,
        minimumExtent, baseExtents[0]);
    // Make nesting explicit even for custom cascade extents. The ordinary
    // 20/64 km contract never reaches this bound.
    const maximumCenterMagnitude = Math.max(0, baseExtents[1] - extent);
    centerX = clamp(centerX, -maximumCenterMagnitude, maximumCenterMagnitude);
    centerY = clamp(centerY, -maximumCenterMagnitude, maximumCenterMagnitude);
    return Object.freeze({
        centerKm: Object.freeze([centerX, centerY]) as CloudRadiativeVec2,
        halfExtentKm: extent,
    });
};

export const createDirectionalCloudVisibilityDomains = (
    input: DirectionalCloudVisibilityDomainInput,
): DirectionalCloudVisibilityDomainSet => {
    const reasons = [...validateDirectionalCloudVisibilityLayout().reasons];
    if (input.sourceDirectionsAtmosphere.length !==
        DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT) {
        reasons.push("visibility-requires-exactly-two-source-directions");
    }
    if (input.observerAtmosphereWorldKm.some((value) => !finite(value))) {
        reasons.push("visibility-observer-must-be-finite");
    }
    const baseExtents = input.baseCascadeExtentsKm ??
        DIRECTIONAL_CLOUD_VISIBILITY_DEFAULT_EXTENTS_KM;
    if (baseExtents.some((value, index) => !(finite(value) && value > 0) ||
        (index > 0 && value <= baseExtents[index - 1]))) {
        reasons.push("visibility-cascade-extents-must-be-finite-positive-and-increasing");
    }
    const rawSources = input.sourceDirectionsAtmosphere.slice(
        0, DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT);
    while (rawSources.length < DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT) {
        rawSources.push([0, 0, 1]);
    }
    rawSources.forEach((direction) => {
        if (direction.some((value) => !finite(value)) || Math.hypot(...direction) < 1e-8) {
            reasons.push("visibility-source-direction-must-be-finite-and-nonzero");
        }
    });
    if (reasons.length > 0) {
        return {
            domains: [],
            sourceDirectionsAtmosphere: [[0, 0, 1], [0, 0, 1]],
            observerAtmosphereWorldKm: input.observerAtmosphereWorldKm,
            validation: { valid: false, reasons: [...new Set(reasons)] },
        };
    }

    const sources = rawSources.map((direction) =>
        cloudRadiativeNormalize3(direction)) as [
        CloudRadiativeVec3, CloudRadiativeVec3,
    ];
    const owners = [...input.owners].sort((left, right) =>
        left.ownerIndex - right.ownerIndex || left.id.localeCompare(right.id));
    const domains: DirectionalCloudVisibilityDomain[] = [];
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
        const basis = createCloudSourceAlignedBasis(sources[sourceIndex]);
        const projections = owners.map((owner) => ({
            owner,
            projection: projectCloudRadiativeOwnerDomain(
                owner, input.observerAtmosphereWorldKm, basis),
        }));
        const nearClip = deriveDirectionalVisibilityNearClip(
            projections.map(({ projection }) => projection), baseExtents);
        const maximumProjectedCoordinate = projections.reduce(
            (maximum, { projection }) => Math.max(maximum,
                projectionMaximumPlaneCoordinate(
                    projection.planeMinimumKm, projection.planeMaximumKm)),
            0,
        );
        // Leave the complete positive-reconstruction support clear around
        // every finite owner. Outside the far cascade is therefore physically
        // clear rather than an authored fade to clear, even after the producer
        // footprint and cubic lateral reconstruction are applied.
        const farExtent = Math.max(baseExtents[2],
            maximumProjectedCoordinate *
                DIRECTIONAL_CLOUD_VISIBILITY_WIDTH /
                (DIRECTIONAL_CLOUD_VISIBILITY_WIDTH -
                    2 * DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS));
        const extents = [nearClip.halfExtentKm,
            baseExtents[1], farExtent] as const;
        const planeCenters = [nearClip.centerKm,
            [0, 0] as CloudRadiativeVec2,
            [0, 0] as CloudRadiativeVec2] as const;
        // All active cascades for one source use the same source-depth support.
        // Lateral owner handoff can therefore only add a zero-boundary owner; it
        // cannot retime every existing knot by changing the depth parameterization.
        const depthGuard = Math.max(0.25, ...projections.map(({ owner }) =>
            owner.boundaryTransitionKm * 0.25));
        const sourceMinimumDepth = projections.length > 0
            ? Math.min(...projections.map(({ projection }) =>
                projection.depthMinimumKm)) - depthGuard
            : 0;
        const sourceMaximumDepth = projections.length > 0
            ? Math.max(...projections.map(({ projection }) =>
                projection.depthMaximumKm)) + depthGuard
            : 0;
        const sourceDepthSpan = Math.max(1e-4,
            sourceMaximumDepth - sourceMinimumDepth);
        for (let cascadeIndex = 0;
            cascadeIndex < DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT;
            cascadeIndex += 1) {
            const extent = extents[cascadeIndex];
            const planeCenter = planeCenters[cascadeIndex];
            const planeGuard = 2 * extent /
                DIRECTIONAL_CLOUD_VISIBILITY_WIDTH *
                DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS;
            const included = projections.filter(({ projection }) =>
                projectionOverlapsCenteredSquare(
                    projection, planeCenter, extent, planeGuard));
            if (included.length === 0) {
                domains.push(Object.freeze({
                    sourceIndex,
                    cascadeIndex,
                    minimumDepthKm: 0,
                    maximumDepthKm: 0,
                    inverseDepthSpanPerKm: 0,
                    planeCenterKm: planeCenter,
                    planeHalfExtentKm: extent,
                    depthWarpReferenceExtentKm: extents[0],
                    ownerIndices: Object.freeze([]),
                }));
                continue;
            }
            domains.push(Object.freeze({
                sourceIndex,
                cascadeIndex,
                minimumDepthKm: sourceMinimumDepth,
                maximumDepthKm: sourceMaximumDepth,
                inverseDepthSpanPerKm: 1 / sourceDepthSpan,
                planeCenterKm: planeCenter,
                planeHalfExtentKm: extent,
                depthWarpReferenceExtentKm: extents[0],
                ownerIndices: Object.freeze(included.map(({ owner }) =>
                    owner.ownerIndex).sort((left, right) => left - right)),
            }));
        }
    }
    const domainValidation = validateDirectionalCloudVisibilityDomains(domains);
    return {
        domains: Object.freeze(domains),
        sourceDirectionsAtmosphere: sources,
        observerAtmosphereWorldKm: input.observerAtmosphereWorldKm,
        validation: domainValidation,
    };
};

const domainSlot = (sourceIndex: number, cascadeIndex: number) =>
    sourceIndex * DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT + cascadeIndex;

const directionalCloudVisibilityDepthWarpScale = (
    domain: DirectionalCloudVisibilityDomain,
) => Math.max(DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_MINIMUM_SCALE_KM,
    domain.depthWarpReferenceExtentKm *
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SCALE_FRACTION);

export const directionalCloudVisibilityUsesDepthWarp = (
    domain: DirectionalCloudVisibilityDomain,
) => domain.inverseDepthSpanPerKm > 0 &&
    domain.maximumDepthKm - domain.minimumDepthKm >
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SPAN_RATIO *
            domain.depthWarpReferenceExtentKm;

/** Exact producer/mask inverse of the receiver-depth knot coordinate. */
export const directionalCloudVisibilityDepthAtUnit = (
    domain: DirectionalCloudVisibilityDomain,
    unitInput: number,
) => {
    if (!finite(unitInput)) {
        throw new RangeError("Visibility depth unit coordinate must be finite");
    }
    const unit = saturate(unitInput);
    if (!directionalCloudVisibilityUsesDepthWarp(domain)) {
        return mix(domain.minimumDepthKm, domain.maximumDepthKm, unit);
    }
    const scale = directionalCloudVisibilityDepthWarpScale(domain);
    const minimumWarped = Math.asinh(domain.minimumDepthKm / scale);
    const maximumWarped = Math.asinh(domain.maximumDepthKm / scale);
    return scale * Math.sinh(mix(minimumWarped, maximumWarped, unit));
};

/** Receiver-depth coordinate mirrored bit-for-formula by the WGSL consumer. */
export const directionalCloudVisibilityUnitAtDepth = (
    domain: DirectionalCloudVisibilityDomain,
    depthKm: number,
) => {
    if (!finite(depthKm)) {
        throw new RangeError("Visibility receiver depth must be finite");
    }
    if (domain.inverseDepthSpanPerKm <= 0) return 0;
    if (!directionalCloudVisibilityUsesDepthWarp(domain)) {
        return saturate((depthKm - domain.minimumDepthKm) *
            domain.inverseDepthSpanPerKm);
    }
    const scale = directionalCloudVisibilityDepthWarpScale(domain);
    const minimumWarped = Math.asinh(domain.minimumDepthKm / scale);
    const maximumWarped = Math.asinh(domain.maximumDepthKm / scale);
    return saturate((Math.asinh(depthKm / scale) - minimumWarped) /
        Math.max(1e-12, maximumWarped - minimumWarped));
};

const ownerMaskRecordIndexUnchecked = (
    sourceCascadeIndex: number,
    tileX: number,
    tileY: number,
    depthIntervalIndex: number,
) => (((sourceCascadeIndex * DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1] + tileY) *
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0] + tileX) *
    (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1) + depthIntervalIndex);

export const directionalCloudVisibilityOwnerMaskRecordIndex = (
    sourceIndex: number,
    cascadeIndex: number,
    tileX: number,
    tileY: number,
    depthIntervalIndex: number,
) => {
    const coordinates = [sourceIndex, cascadeIndex, tileX, tileY,
        depthIntervalIndex];
    const maxima = [DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT,
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT,
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0],
        DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1],
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1];
    if (coordinates.some((value, index) =>
        !Number.isInteger(value) || value < 0 || value >= maxima[index])) {
        throw new RangeError("Directional visibility owner-mask coordinate is out of range");
    }
    return ownerMaskRecordIndexUnchecked(
        domainSlot(sourceIndex, cascadeIndex), tileX, tileY, depthIntervalIndex);
};

export interface DirectionalCloudVisibilityOwnerMaskInput {
    owners: readonly CloudRadiativeOwnerDomain[];
    domains: readonly DirectionalCloudVisibilityDomain[];
    observerAtmosphereWorldKm: CloudRadiativeVec3;
    sourceDirectionsAtmosphere: readonly CloudRadiativeVec3[];
}

/**
 * Rasterize conservative finite-owner projections into exactly the slabs read
 * by one producer invocation. The rectangle includes every rotated lateral
 * quadrature node in the 2x2 workgroup; depth uses the complete knot interval,
 * so the mask can only add a cheap candidate and can never remove a producer
 * sample that lies inside the owner's curved-world OBB.
 */
export const createDirectionalCloudVisibilityOwnerMasks = (
    input: DirectionalCloudVisibilityOwnerMaskInput,
) => {
    const domainValidation = validateDirectionalCloudVisibilityDomains(
        input.domains);
    if (!domainValidation.valid) {
        throw new RangeError("Invalid visibility owner-mask domains: " +
            domainValidation.reasons.join(", "));
    }
    if (input.sourceDirectionsAtmosphere.length !==
            DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT ||
        input.observerAtmosphereWorldKm.some((value) => !finite(value))) {
        throw new RangeError("Visibility owner-mask frame is invalid");
    }
    const ownersByIndex = new Map<number, CloudRadiativeOwnerDomain>();
    for (const owner of input.owners) {
        if (!Number.isInteger(owner.ownerIndex) || owner.ownerIndex < 0 ||
            owner.ownerIndex >= DIRECTIONAL_CLOUD_VISIBILITY_MAX_FINITE_OWNER_COUNT ||
            ownersByIndex.has(owner.ownerIndex)) {
            throw new RangeError("Visibility owner-mask owner indices are invalid");
        }
        ownersByIndex.set(owner.ownerIndex, owner);
    }
    const masks = new Uint32Array(
        DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT *
            DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_WORD_COUNT);
    const domains = [...input.domains].sort((left, right) =>
        domainSlot(left.sourceIndex, left.cascadeIndex) -
            domainSlot(right.sourceIndex, right.cascadeIndex));
    const tileMinimumOffset = 0.5 -
        DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE;
    const tileMaximumOffset = 1.5 +
        DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE;
    const intervalCount = DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1;
    for (const domain of domains) {
        if (domain.inverseDepthSpanPerKm <= 0) continue;
        const sourceDirection = input.sourceDirectionsAtmosphere[
            domain.sourceIndex];
        if (sourceDirection.some((value) => !finite(value)) ||
            Math.hypot(...sourceDirection) < 1e-8) {
            throw new RangeError("Visibility owner-mask source is invalid");
        }
        const basis = createCloudSourceAlignedBasis(sourceDirection);
        const sourceCascadeIndex = domainSlot(
            domain.sourceIndex, domain.cascadeIndex);
        for (const ownerIndex of domain.ownerIndices) {
            const owner = ownersByIndex.get(ownerIndex);
            if (!owner) {
                throw new RangeError(
                    `Visibility owner-mask domain references missing owner ${ownerIndex}`);
            }
            const projection = projectCloudRadiativeOwnerDomain(
                owner, input.observerAtmosphereWorldKm, basis);
            const toTexel = (coordinateKm: number, centerKm: number) =>
                ((coordinateKm - centerKm) /
                    (2 * domain.planeHalfExtentKm) + 0.5) *
                    DIRECTIONAL_CLOUD_VISIBILITY_WIDTH;
            const minimumTexelX = toTexel(
                projection.planeMinimumKm[0], domain.planeCenterKm[0]);
            const maximumTexelX = toTexel(
                projection.planeMaximumKm[0], domain.planeCenterKm[0]);
            const minimumTexelY = toTexel(
                projection.planeMinimumKm[1], domain.planeCenterKm[1]);
            const maximumTexelY = toTexel(
                projection.planeMaximumKm[1], domain.planeCenterKm[1]);
            const minimumTileX = Math.max(0, Math.ceil(
                (minimumTexelX - tileMaximumOffset) / 2));
            const maximumTileX = Math.min(
                DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[0] - 1,
                Math.floor((maximumTexelX - tileMinimumOffset) / 2));
            const minimumTileY = Math.max(0, Math.ceil(
                (minimumTexelY - tileMaximumOffset) / 2));
            const maximumTileY = Math.min(
                DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH[1] - 1,
                Math.floor((maximumTexelY - tileMinimumOffset) / 2));
            if (minimumTileX > maximumTileX || minimumTileY > maximumTileY) {
                continue;
            }
            for (let intervalIndex = 0;
                intervalIndex < intervalCount; intervalIndex += 1) {
                const intervalMinimum = directionalCloudVisibilityDepthAtUnit(
                    domain, intervalIndex / intervalCount);
                const intervalMaximum = directionalCloudVisibilityDepthAtUnit(
                    domain, (intervalIndex + 1) / intervalCount);
                if (intervalMaximum < projection.depthMinimumKm ||
                    intervalMinimum > projection.depthMaximumKm) {
                    continue;
                }
                for (let tileY = minimumTileY;
                    tileY <= maximumTileY; tileY += 1) {
                    for (let tileX = minimumTileX;
                        tileX <= maximumTileX; tileX += 1) {
                        const recordIndex = ownerMaskRecordIndexUnchecked(
                            sourceCascadeIndex, tileX, tileY, intervalIndex);
                        const wordIndex = ownerIndex >= 32 ? 1 : 0;
                        masks[recordIndex *
                            DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_WORD_COUNT +
                            wordIndex] |= 1 << (ownerIndex & 31);
                    }
                }
            }
        }
    }
    return masks;
};

const popcount32 = (valueInput: number) => {
    let value = valueInput >>> 0;
    value -= (value >>> 1) & 0x55555555;
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export const summarizeDirectionalCloudVisibilityOwnerMasks = (
    masks: Uint32Array,
) => {
    if (masks.byteLength !== DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES) {
        throw new RangeError("Visibility owner mask has the wrong byte length");
    }
    let activeSlabCount = 0;
    let ownerSlabAssociations = 0;
    for (let record = 0;
        record < DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT;
        record += 1) {
        const low = masks[record * 2];
        const high = masks[record * 2 + 1];
        if ((low | high) !== 0) activeSlabCount += 1;
        ownerSlabAssociations += popcount32(low) + popcount32(high);
    }
    // A mask contains owner bits but no genus identity, so this diagnostic
    // reports the exact GL2 baseline. The exported global query contract uses
    // the four-depth high-ice maximum conservatively.
    const samplesPerSlab = 4 *
        DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_DEPTH_SAMPLE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLES_PER_DEPTH;
    return Object.freeze({
        activeSlabCount,
        ownerSlabAssociations,
        hierarchyQuerySites: activeSlabCount * samplesPerSlab,
        ownerCandidateEvaluations: ownerSlabAssociations * samplesPerSlab,
    });
};

export const packDirectionalCloudVisibilityUniform = (
    domainsInput: readonly DirectionalCloudVisibilityDomain[],
    generation: number,
) => {
    if (!Number.isInteger(generation) || generation < 0 || generation > 0xffffffff) {
        throw new RangeError("Visibility generation must be an unsigned 32-bit integer");
    }
    const validation = validateDirectionalCloudVisibilityDomains(domainsInput);
    if (!validation.valid) {
        throw new RangeError("Invalid visibility domains: " +
            validation.reasons.join(", "));
    }
    const domains = [...domainsInput].sort((left, right) =>
        domainSlot(left.sourceIndex, left.cascadeIndex) -
        domainSlot(right.sourceIndex, right.cascadeIndex));
    if (domains.length !== DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT ||
        domains.some((domain, index) =>
            domainSlot(domain.sourceIndex, domain.cascadeIndex) !== index)) {
        throw new RangeError("Visibility uniform requires one ordered domain per source/cascade");
    }
    const bytes = new Uint8Array(DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    [DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA,
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT,
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT,
        generation].forEach((value, index) => view.setUint32(index * 4, value, true));
    domains.forEach((domain, index) => {
        const offset = 16 + index * 16;
        [domain.minimumDepthKm, domain.maximumDepthKm,
            domain.inverseDepthSpanPerKm, domain.planeHalfExtentKm]
            .forEach((value, component) =>
                view.setFloat32(offset + component * 4, value, true));
        const centerOffset = 112 + Math.floor(index / 2) * 16 +
            (index % 2) * 8;
        view.setFloat32(centerOffset, domain.planeCenterKm[0], true);
        view.setFloat32(centerOffset + 4, domain.planeCenterKm[1], true);
    });
    const footerOffset = DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES - 16;
    [DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT,
        DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT,
        DIRECTIONAL_CLOUD_VISIBILITY_WIDTH,
        DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT]
        .forEach((value, index) =>
            view.setUint32(footerOffset + index * 4, value, true));
    return bytes;
};

export const unpackDirectionalCloudVisibilityUniform = (
    bytes: Uint8Array,
) => {
    if (bytes.byteLength !== DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES) {
        throw new RangeError("Visibility uniform has the wrong byte length");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const domains: DirectionalCloudVisibilityDomain[] = [];
    for (let index = 0; index < 6; index += 1) {
        const offset = 16 + index * 16;
        domains.push({
            sourceIndex: Math.floor(index / DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT),
            cascadeIndex: index % DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT,
            minimumDepthKm: view.getFloat32(offset, true),
            maximumDepthKm: view.getFloat32(offset + 4, true),
            inverseDepthSpanPerKm: view.getFloat32(offset + 8, true),
            planeCenterKm: [
                view.getFloat32(112 + Math.floor(index / 2) * 16 +
                    (index % 2) * 8, true),
                view.getFloat32(116 + Math.floor(index / 2) * 16 +
                    (index % 2) * 8, true),
            ],
            planeHalfExtentKm: view.getFloat32(offset + 12, true),
            depthWarpReferenceExtentKm: 0,
            ownerIndices: [],
        });
    }
    domains.forEach((domain) => {
        domain.depthWarpReferenceExtentKm = domains[
            domain.sourceIndex * DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT]
            .planeHalfExtentKm;
    });
    return {
        schema: view.getUint32(0, true),
        knotCount: view.getUint32(4, true),
        cascadeCount: view.getUint32(8, true),
        generation: view.getUint32(12, true),
        domains,
        sourceCount: view.getUint32(160, true),
        layerCount: view.getUint32(164, true),
        width: view.getUint32(168, true),
        height: view.getUint32(172, true),
    };
};

export type DirectionalCloudExtinctionEvaluator = (
    sourceDepthKm: number,
    lateralNodeIndex: number,
) => CloudRadiativeVec3;

const GAUSS_LEGENDRE_NODES = [
    -0.5773502691896257, 0.5773502691896257,
] as const;
const GAUSS_LEGENDRE_WEIGHTS = [1, 1] as const;

const safeExtinction = (
    evaluator: DirectionalCloudExtinctionEvaluator,
    depthKm: number,
    lateralNodeIndex = 0,
): CloudRadiativeVec3 => {
    const value = evaluator(depthKm, lateralNodeIndex);
    if (value.some((component) => !finite(component) || component < 0)) {
        throw new RangeError("Visibility extinction must be finite and nonnegative");
    }
    return value;
};

export interface DirectionalCloudVisibilityLateralSample {
    planeCoordinateKm: CloudRadiativeVec2;
    weight: number;
}

/** CPU reference for the deterministic square-texel prefilter used by WGSL. */
export const createDirectionalCloudVisibilityLateralSamples = (
    planeCenterKm: CloudRadiativeVec2,
    texelWidthKm: number,
): readonly DirectionalCloudVisibilityLateralSample[] => {
    if (planeCenterKm.some((value) => !finite(value)) ||
        !(finite(texelWidthKm) && texelWidthKm > 0)) {
        throw new RangeError("Visibility lateral footprint is out of range");
    }
    const offset = texelWidthKm *
        DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE;
    return Object.freeze([-1, 1].flatMap((ySign) => [-1, 1].map((xSign) =>
        Object.freeze({
            planeCoordinateKm: [
                planeCenterKm[0] + xSign * offset,
                planeCenterKm[1] + ySign * offset,
            ] as CloudRadiativeVec2,
            weight: 1 / DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT,
        }))));
};

export interface DirectionalCloudVisibilityProducerSample {
    sourceDepthKm: number;
    planeCoordinateKm: CloudRadiativeVec2;
    /** Gauss weight within this coherent ray's optical-depth integral. */
    weightKm: number;
    /** Weight applied only after this ray is converted to Beer visibility. */
    visibilityWeight: number;
    depthNodeIndex: number;
    lateralNodeIndex: number;
}

/**
 * CPU mirror of one producer interval. Each lateral node owns both depth
 * samples on one fixed source-parallel ray. `visibilityWeight` is deliberately
 * separate from `weightKm`: combining them before Beer attenuation would
 * implement exp(-E[tau]) instead of E[exp(-tau)].
 */
export const createDirectionalCloudVisibilityProducerSamples = (
    planeCenterKm: CloudRadiativeVec2,
    texelWidthKm: number,
    depthMidpointKm: number,
    intervalLengthKm: number,
): readonly DirectionalCloudVisibilityProducerSample[] => {
    if (!finite(depthMidpointKm) ||
        !(finite(intervalLengthKm) && intervalLengthKm > 0)) {
        throw new RangeError("Visibility producer quadrature is out of range");
    }
    const lateral = createDirectionalCloudVisibilityLateralSamples(
        planeCenterKm, texelWidthKm);
    return Object.freeze(lateral.flatMap(
        (lateralSample, lateralNodeIndex) => GAUSS_LEGENDRE_NODES.map(
            (node, depthNodeIndex) =>
            Object.freeze({
                sourceDepthKm: depthMidpointKm +
                    intervalLengthKm * 0.5 * node,
                planeCoordinateKm: lateralSample.planeCoordinateKm,
                weightKm: GAUSS_LEGENDRE_WEIGHTS[depthNodeIndex] *
                    intervalLengthKm * 0.5,
                visibilityWeight: lateralSample.weight,
                depthNodeIndex,
                lateralNodeIndex,
            }))));
};

/** Positive tent weights matching one hardware-linear atlas lookup. */
export const directionalCloudVisibilityLinearWeights = (
    fraction: number,
): readonly [number, number] => {
    if (!finite(fraction)) {
        throw new RangeError("Visibility lateral coordinate must be finite");
    }
    const amount = saturate(fraction);
    return Object.freeze([1 - amount, amount]);
};

export const buildDirectionalCloudVisibilityKnots = (
    domain: DirectionalCloudVisibilityDomain,
    extinctionAtDepth: DirectionalCloudExtinctionEvaluator,
) => {
    const knots = new Float32Array(
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT * 3);
    if (domain.inverseDepthSpanPerKm <= 0) {
        knots.fill(1);
        return knots;
    }
    const intervalCount = DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1;
    // Preserve the four footprint nodes as coherent source-parallel rays.
    // Beer attenuation is nonlinear: average exp(-tau), never extinction.
    for (let lateralNodeIndex = 0;
        lateralNodeIndex < DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
        lateralNodeIndex += 1) {
        const intervalTau: CloudRadiativeVec3[] = [];
        for (let interval = 0;
            interval < intervalCount;
            interval += 1) {
            const lower = directionalCloudVisibilityDepthAtUnit(
                domain, interval / intervalCount);
            const upper = directionalCloudVisibilityDepthAtUnit(
                domain, (interval + 1) / intervalCount);
            const intervalLength = upper - lower;
            const midpoint = lower + intervalLength * 0.5;
            let integral: CloudRadiativeVec3 = [0, 0, 0];
            for (let sample = 0;
                sample < DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_DEPTH_SAMPLE_COUNT;
                sample += 1) {
                const depth = midpoint + intervalLength * 0.5 *
                    GAUSS_LEGENDRE_NODES[sample];
                integral = add3(integral, scale3(
                    safeExtinction(
                        extinctionAtDepth, depth, lateralNodeIndex),
                    GAUSS_LEGENDRE_WEIGHTS[sample] * intervalLength * 0.5,
                ));
            }
            intervalTau.push(integral);
        }
        let cumulative: CloudRadiativeVec3 = [0, 0, 0];
        for (let knot = DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1;
            knot >= 0; knot -= 1) {
            if (knot < intervalTau.length) {
                cumulative = add3(cumulative, intervalTau[knot]);
            }
            const visibility = expNegative3(cumulative);
            const offset = knot * 3;
            knots[offset] += visibility[0] /
                DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
            knots[offset + 1] += visibility[1] /
                DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
            knots[offset + 2] += visibility[2] /
                DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
        }
    }
    return knots;
};

const knotValue = (
    knots: Float32Array,
    index: number,
): CloudRadiativeVec3 => {
    const offset = index * 3;
    return [knots[offset], knots[offset + 1], knots[offset + 2]];
};

const monotoneCubicTangent = (
    previousSlope: number,
    nextSlope: number,
) => previousSlope * nextSlope <= 0
    ? 0
    : 2 * previousSlope * nextSlope / (previousSlope + nextSlope);

const reconstructMonotoneVisibility = (
    previous: CloudRadiativeVec3,
    lower: CloudRadiativeVec3,
    upper: CloudRadiativeVec3,
    next: CloudRadiativeVec3,
    amountInput: number,
    lowerIsEndpoint: boolean,
    upperIsEndpoint: boolean,
): CloudRadiativeVec3 => {
    const amount = saturate(amountInput);
    const amount2 = amount * amount;
    const amount3 = amount2 * amount;
    const lowerWeight = 2 * amount3 - 3 * amount2 + 1;
    const lowerTangentWeight = amount3 - 2 * amount2 + amount;
    const upperWeight = -2 * amount3 + 3 * amount2;
    const upperTangentWeight = amount3 - amount2;
    const reconstructChannel = (channel: number) => {
        const lowerValue = lower[channel];
        const upperValue = upper[channel];
        const intervalSlope = upperValue - lowerValue;
        const lowerTangent = lowerIsEndpoint ? 0 : monotoneCubicTangent(
            lowerValue - previous[channel], intervalSlope);
        const upperTangent = upperIsEndpoint ? 0 : monotoneCubicTangent(
            intervalSlope, next[channel] - upperValue);
        const reconstructed = lowerWeight * lowerValue +
            lowerTangentWeight * lowerTangent +
            upperWeight * upperValue + upperTangentWeight * upperTangent;
        return clamp(reconstructed,
            Math.min(lowerValue, upperValue),
            Math.max(lowerValue, upperValue));
    };
    return [reconstructChannel(0), reconstructChannel(1),
        reconstructChannel(2)];
};

export const sampleDirectionalCloudVisibilityKnots = (
    knots: Float32Array,
    domain: DirectionalCloudVisibilityDomain,
    receiverDepthKm: number,
): CloudRadiativeVec3 => {
    if (knots.length !== DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT * 3) {
        throw new RangeError("Visibility knot field has the wrong length");
    }
    if (domain.inverseDepthSpanPerKm <= 0 ||
        receiverDepthKm >= domain.maximumDepthKm) return [1, 1, 1];
    if (receiverDepthKm <= domain.minimumDepthKm) return knotValue(knots, 0);
    const coordinate = directionalCloudVisibilityUnitAtDepth(
        domain, receiverDepthKm) *
        (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1);
    const lower = Math.min(
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 2,
        Math.floor(coordinate));
    const amount = coordinate - lower;
    const upper = lower + 1;
    return reconstructMonotoneVisibility(
        knotValue(knots, Math.max(0, lower - 1)),
        knotValue(knots, lower),
        knotValue(knots, upper),
        knotValue(knots, Math.min(
            DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1, upper + 1)),
        amount,
        lower === 0,
        upper === DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1,
    );
};

const validateVisibilityGrid = (
    visibilityGrid: Float32Array,
    width: number,
    height: number,
) => {
    if (!Number.isInteger(width) || width < 1 ||
        !Number.isInteger(height) || height < 1 ||
        visibilityGrid.length !== width * height *
            DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT * 3) {
        throw new RangeError("Visibility grid has the wrong shape");
    }
};

const visibilityGridValue = (
    visibilityGrid: Float32Array,
    width: number,
    height: number,
    xInput: number,
    yInput: number,
    knotIndex: number,
): CloudRadiativeVec3 => {
    const x = Math.min(width - 1, Math.max(0, xInput));
    const y = Math.min(height - 1, Math.max(0, yInput));
    const offset = ((knotIndex * height + y) * width + x) * 3;
    return [visibilityGrid[offset], visibilityGrid[offset + 1],
        visibilityGrid[offset + 2]];
};

/**
 * CPU mirror of positive hardware-linear lateral reconstruction. Texel
 * centres have integer coordinates, matching `uv * dimensions - 0.5` in WGSL.
 */
export const sampleDirectionalCloudVisibilityLateralGrid = (
    visibilityGrid: Float32Array,
    width: number,
    height: number,
    knotIndex: number,
    texelCoordinate: CloudRadiativeVec2,
): CloudRadiativeVec3 => {
    validateVisibilityGrid(visibilityGrid, width, height);
    if (!Number.isInteger(knotIndex) || knotIndex < 0 ||
        knotIndex >= DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT ||
        texelCoordinate.some((value) => !finite(value))) {
        throw new RangeError("Visibility grid sample coordinate is out of range");
    }
    const baseX = Math.floor(texelCoordinate[0]);
    const baseY = Math.floor(texelCoordinate[1]);
    const weightsX = directionalCloudVisibilityLinearWeights(
        texelCoordinate[0] - baseX);
    const weightsY = directionalCloudVisibilityLinearWeights(
        texelCoordinate[1] - baseY);
    const result: [number, number, number] = [0, 0, 0];
    for (let yTap = 0; yTap < 2; yTap += 1) {
        for (let xTap = 0; xTap < 2; xTap += 1) {
            const value = visibilityGridValue(visibilityGrid, width, height,
                baseX + xTap, baseY + yTap, knotIndex);
            const weight = weightsX[xTap] * weightsY[yTap];
            result[0] += value[0] * weight;
            result[1] += value[1] * weight;
            result[2] += value[2] * weight;
        }
    }
    return result.map((value) => saturate(value)) as
        unknown as CloudRadiativeVec3;
};

/** CPU reference for the complete linear-lateral/monotone-depth reconstruction. */
export const sampleDirectionalCloudVisibilityGrid = (
    visibilityGrid: Float32Array,
    width: number,
    height: number,
    domain: DirectionalCloudVisibilityDomain,
    texelCoordinate: CloudRadiativeVec2,
    receiverDepthKm: number,
): CloudRadiativeVec3 => {
    validateVisibilityGrid(visibilityGrid, width, height);
    if (domain.inverseDepthSpanPerKm <= 0 ||
        receiverDepthKm >= domain.maximumDepthKm) return [1, 1, 1];
    const coordinate = receiverDepthKm <= domain.minimumDepthKm ? 0 :
        directionalCloudVisibilityUnitAtDepth(domain, receiverDepthKm) *
            (DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1);
    const lower = Math.min(
        DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 2,
        Math.floor(coordinate));
    const upper = lower + 1;
    const sampleKnot = (knotIndex: number) =>
        sampleDirectionalCloudVisibilityLateralGrid(
            visibilityGrid, width, height, knotIndex, texelCoordinate);
    return reconstructMonotoneVisibility(
        sampleKnot(Math.max(0, lower - 1)),
        sampleKnot(lower),
        sampleKnot(upper),
        sampleKnot(Math.min(
            DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1, upper + 1)),
        coordinate - lower,
        lower === 0,
        upper === DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT - 1,
    );
};

export const sampleDirectionalCloudVisibilityTransmittance = (
    knots: Float32Array,
    domain: DirectionalCloudVisibilityDomain,
    receiverDepthKm: number,
) => sampleDirectionalCloudVisibilityKnots(knots, domain, receiverDepthKm);

export interface DirectionalCloudVisibilityCascadeColumn {
    domain: DirectionalCloudVisibilityDomain;
    visibilityKnots: Float32Array;
}

export interface DirectionalCloudVisibilityCascadeSelection {
    cascadeIndex: number;
    nextCascadeIndex: number | null;
    blendAmount: number;
    receiverDistanceKm: number;
    normalizedImportance: number;
}

const directionalCloudVisibilityCascadeImportance = (
    domain: DirectionalCloudVisibilityDomain,
    planeCoordinateKm: CloudRadiativeVec2,
) => {
    return Math.max(
        Math.abs(planeCoordinateKm[0] - domain.planeCenterKm[0]),
        Math.abs(planeCoordinateKm[1] - domain.planeCenterKm[1])) /
            domain.planeHalfExtentKm;
};

/**
 * Select the finest cascade whose source-normal plane contains the receiver.
 * Receiver depth is already an independent atlas coordinate, so folding the
 * camera-to-receiver radius into cascade selection creates non-physical
 * spherical resolution shells. Those shells project as concentric bands when
 * adjacent cascades disagree by even a small amount. A blend fetch is exposed
 * only when the next source-plane domain contains the same receiver.
 */
export const resolveDirectionalCloudVisibilityCascadeSelection = (
    domainsInput: readonly DirectionalCloudVisibilityDomain[],
    planeCoordinateKm: CloudRadiativeVec2,
    receiverDepthKm: number,
): DirectionalCloudVisibilityCascadeSelection | null => {
    if (planeCoordinateKm.some((value) => !finite(value)) ||
        !finite(receiverDepthKm)) {
        throw new RangeError("Visibility cascade receiver must be finite");
    }
    const domains = [...domainsInput].sort((left, right) =>
        left.cascadeIndex - right.cascadeIndex);
    if (domains.length !== DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT ||
        domains.some((domain, index) => domain.cascadeIndex !== index ||
            !(finite(domain.planeHalfExtentKm) &&
                domain.planeHalfExtentKm > 0) ||
            domain.planeCenterKm.some((value) => !finite(value)))) {
        throw new RangeError("Visibility selection requires three ordered cascades");
    }
    const receiverDistanceKm = Math.hypot(
        planeCoordinateKm[0], planeCoordinateKm[1], receiverDepthKm);
    const importance = domains.map((domain) =>
        directionalCloudVisibilityCascadeImportance(
            domain, planeCoordinateKm));
    const cascadeIndex = importance.findIndex((value) => value <= 1);
    if (cascadeIndex < 0) return null;
    const normalizedImportance = importance[cascadeIndex];
    let blendAmount = 0;
    let nextCascadeIndex: number | null = null;
    if (cascadeIndex + 1 < domains.length &&
        importance[cascadeIndex + 1] <= 1) {
        blendAmount = smoothstep(
            DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE[0],
            DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE[1],
            normalizedImportance);
        if (blendAmount > 0) nextCascadeIndex = cascadeIndex + 1;
    }
    return Object.freeze({
        cascadeIndex,
        nextCascadeIndex,
        blendAmount,
        receiverDistanceKm,
        normalizedImportance,
    });
};

export const sampleDirectionalCloudVisibilityCascadeColumn = (
    cascadesInput: readonly DirectionalCloudVisibilityCascadeColumn[],
    planeCoordinateKm: CloudRadiativeVec2,
    receiverDepthKm: number,
): CloudRadiativeVec3 => {
    const cascades = [...cascadesInput].sort((left, right) =>
        left.domain.cascadeIndex - right.domain.cascadeIndex);
    if (cascades.length !== DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT) {
        throw new RangeError("Visibility sampling requires three cascades");
    }
    const selection = resolveDirectionalCloudVisibilityCascadeSelection(
        cascades.map(({ domain }) => domain),
        planeCoordinateKm, receiverDepthKm);
    if (!selection) return [1, 1, 1];
    const current = cascades[selection.cascadeIndex];
    let visibility = sampleDirectionalCloudVisibilityKnots(
        current.visibilityKnots, current.domain, receiverDepthKm);
    if (selection.nextCascadeIndex !== null) {
        const next = cascades[selection.nextCascadeIndex];
        const nextVisibility = sampleDirectionalCloudVisibilityKnots(
            next.visibilityKnots, next.domain, receiverDepthKm);
        visibility = [
            mix(visibility[0], nextVisibility[0], selection.blendAmount),
            mix(visibility[1], nextVisibility[1], selection.blendAmount),
            mix(visibility[2], nextVisibility[2], selection.blendAmount),
        ];
    }
    return visibility;
};

export const integrateDirectionalCloudVisibilityReference = (
    domain: DirectionalCloudVisibilityDomain,
    receiverDepthKm: number,
    extinctionAtDepth: DirectionalCloudExtinctionEvaluator,
    stepCount = 128,
): CloudRadiativeVec3 => {
    if (!Number.isInteger(stepCount) || stepCount < 1) {
        throw new RangeError("Reference visibility step count must be positive");
    }
    if (domain.inverseDepthSpanPerKm <= 0 ||
        receiverDepthKm >= domain.maximumDepthKm) return [1, 1, 1];
    const lower = Math.max(domain.minimumDepthKm, receiverDepthKm);
    const length = domain.maximumDepthKm - lower;
    const stepLength = length / stepCount;
    let visibility: CloudRadiativeVec3 = [0, 0, 0];
    for (let lateralNodeIndex = 0;
        lateralNodeIndex < DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT;
        lateralNodeIndex += 1) {
        let opticalDepth: CloudRadiativeVec3 = [0, 0, 0];
        for (let step = 0; step < stepCount; step += 1) {
            opticalDepth = add3(opticalDepth, scale3(safeExtinction(
                extinctionAtDepth,
                lower + (step + 0.5) * stepLength,
                lateralNodeIndex), stepLength));
        }
        visibility = add3(visibility, scale3(expNegative3(opticalDepth),
            1 / DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT));
    }
    return visibility;
};

export interface DirectionalCloudVisibilityInvalidationInput {
    cloudRuntimeSignature: string;
    morphologySignature: string;
    extinctionSignature: string;
    advectionEpoch: number;
    observerAtmosphereWorldKm: CloudRadiativeVec3;
    sourceDirectionsAtmosphere: readonly CloudRadiativeVec3[];
    domains: readonly DirectionalCloudVisibilityDomain[];
}

export const createDirectionalCloudVisibilityInvalidationSignature = (
    input: DirectionalCloudVisibilityInvalidationInput,
) => JSON.stringify({
    schema: DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA,
    cloud: input.cloudRuntimeSignature,
    morphology: input.morphologySignature,
    extinction: input.extinctionSignature,
    advectionEpoch: Math.floor(input.advectionEpoch),
    observer: input.observerAtmosphereWorldKm.map(rounded),
    sources: input.sourceDirectionsAtmosphere.map((direction) =>
        cloudRadiativeNormalize3(direction).map(rounded)),
    domains: [...input.domains].sort((left, right) =>
        domainSlot(left.sourceIndex, left.cascadeIndex) -
            domainSlot(right.sourceIndex, right.cascadeIndex)).map((domain) => ({
        source: domain.sourceIndex,
        cascade: domain.cascadeIndex,
        minimumDepthKm: rounded(domain.minimumDepthKm),
        maximumDepthKm: rounded(domain.maximumDepthKm),
        inverseDepthSpanPerKm: rounded(domain.inverseDepthSpanPerKm),
        planeCenterKm: domain.planeCenterKm.map(rounded),
        planeHalfExtentKm: rounded(domain.planeHalfExtentKm),
        depthWarpReferenceExtentKm:
            rounded(domain.depthWarpReferenceExtentKm),
        owners: [...domain.ownerIndices].sort((left, right) => left - right),
    })),
});

const COMPLETE_SOURCE_CASCADE_MASK =
    (1 << (DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT *
        DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT)) - 1;

export interface DirectionalCloudVisibilitySnapshot<Payload> {
    generation: number;
    signature: string;
    payload: Payload;
}

export interface DirectionalCloudVisibilityPending<Payload>
    extends DirectionalCloudVisibilitySnapshot<Payload> {
    completedSourceCascadeMask: number;
    qualified: boolean;
}

export interface DirectionalCloudVisibilityPublicationState<Payload> {
    active: DirectionalCloudVisibilitySnapshot<Payload> | null;
    pending: DirectionalCloudVisibilityPending<Payload> | null;
    nextGeneration: number;
}

export const createDirectionalCloudVisibilityPublicationState = <Payload>(
    active: DirectionalCloudVisibilitySnapshot<Payload> | null = null,
): DirectionalCloudVisibilityPublicationState<Payload> => ({
    active,
    pending: null,
    nextGeneration: (active?.generation ?? 0) + 1,
});

export const beginDirectionalCloudVisibilityGeneration = <Payload>(
    state: DirectionalCloudVisibilityPublicationState<Payload>,
    signature: string,
    payload: Payload,
): DirectionalCloudVisibilityPublicationState<Payload> => ({
    active: state.active,
    pending: {
        generation: state.nextGeneration,
        signature,
        payload,
        completedSourceCascadeMask: 0,
        qualified: true,
    },
    nextGeneration: state.nextGeneration + 1,
});

export const completeDirectionalCloudVisibilitySourceCascade = <Payload>(
    state: DirectionalCloudVisibilityPublicationState<Payload>,
    generation: number,
    sourceIndex: number,
    cascadeIndex: number,
    qualified = true,
): DirectionalCloudVisibilityPublicationState<Payload> => {
    if (!state.pending || state.pending.generation !== generation) return state;
    const slot = domainSlot(sourceIndex, cascadeIndex);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 ||
        sourceIndex >= DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT ||
        !Number.isInteger(cascadeIndex) || cascadeIndex < 0 ||
        cascadeIndex >= DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT) {
        throw new RangeError("Completed visibility source/cascade is out of range");
    }
    return {
        ...state,
        pending: {
            ...state.pending,
            completedSourceCascadeMask:
                state.pending.completedSourceCascadeMask | (1 << slot),
            qualified: state.pending.qualified && qualified,
        },
    };
};

export const publishDirectionalCloudVisibilityGeneration = <Payload>(
    state: DirectionalCloudVisibilityPublicationState<Payload>,
    generation: number,
): {
    state: DirectionalCloudVisibilityPublicationState<Payload>;
    published: boolean;
} => {
    const pending = state.pending;
    if (!pending || pending.generation !== generation || !pending.qualified ||
        pending.completedSourceCascadeMask !== COMPLETE_SOURCE_CASCADE_MASK) {
        return { state, published: false };
    }
    return {
        state: {
            active: {
                generation: pending.generation,
                signature: pending.signature,
                payload: pending.payload,
            },
            pending: null,
            nextGeneration: state.nextGeneration,
        },
        published: true,
    };
};

export const cancelDirectionalCloudVisibilityGeneration = <Payload>(
    state: DirectionalCloudVisibilityPublicationState<Payload>,
    generation: number,
): DirectionalCloudVisibilityPublicationState<Payload> =>
    state.pending?.generation === generation
        ? { ...state, pending: null }
        : state;

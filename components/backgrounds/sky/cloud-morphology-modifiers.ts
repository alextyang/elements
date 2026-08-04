import type {
    CloudClassification,
    CloudLifecycleStage,
    CloudTopologyConnectivity,
    CloudTopologyExemplar,
    UpperAtmosphericCloud,
} from "./cloud-state-map";
import type {
    UpperAtmosphericCloudRepresentation,
    UpperParticleComposition,
} from "./upper-atmospheric-cloud-foundation";
export const CLOUD_MORPHOLOGY_MODIFIER_MANIFEST_URL =
    "/assets/sky/cloud-morphology-modifiers-v1.json";
export const CLOUD_MORPHOLOGY_TEXTURE_WIDTH = 256;
/** 256 rgba32float texels; naturally satisfies WebGPU's 256-byte row alignment. */
export const CLOUD_MORPHOLOGY_BYTES_PER_ROW =
    CLOUD_MORPHOLOGY_TEXTURE_WIDTH * 4 * Float32Array.BYTES_PER_ELEMENT;
export const CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS = 36;
export const CLOUD_MORPHOLOGY_MAX_RECORDS = 288;
export const CLOUD_MORPHOLOGY_MAX_RECORDS_PER_OWNER = 8;
export const CLOUD_MORPHOLOGY_RECORD_TEXELS = 8;
export const CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS = 5;
/**
 * Header zero, 36 unchanged modifier owner headers, then 36 owner-static
 * Ci-fibratus descriptor ranges. Keeping the tables disjoint preserves the
 * append-only modifier range/topology ABI.
 */
export const CLOUD_MORPHOLOGY_HEADER_TEXELS = 73;
/** Exact local-coordinate support limit mirrored by the WGSL evaluator. */
export const CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH = 1.04;
/** World-space guard beyond the finite WGSL envelope for f32 transform noise. */
export const CLOUD_MORPHOLOGY_BOUNDS_NUMERIC_MARGIN_KM = 1e-4;
/**
 * Species-qualified display reconstruction for the two-sample-wide
 * Ci-fibratus proxy carried by the 48^3 macro atlas. These are physical
 * density bounds, not camera-space styling controls.
 */
export const CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT = Object.freeze({
    speciesCode: 1,
    formationMechanismCode: 3,
    connectivityCode: 1,
    maximumFibreCount: 8,
    primaryFibreCount: [3, 5] as const,
    sourceCrossRadiusKm: [0.016, 0.075] as const,
    sourceVerticalRadiusKm: [0.014, 0.055] as const,
    terminalWidthRatio: [0.30, 0.58] as const,
    terminalDensityRatio: [0.34, 0.58] as const,
    maximumSourceToTerminalDropDepth: 0.48,
    originalSupportMaximumSdfVoxels: 0,
    couplingFootprintVoxelFraction: 0.35,
    implementation:
        "owner-seeded-c2-elliptical-fibres-with-area-preserving-world-filter",
    prohibitions: Object.freeze([
        "camera-space-density",
        "screen-space-geometry",
        "generic-scalar-noise",
        "fibratus-hooks",
        "fibratus-terminal-tufts",
        "exterior-support-expansion",
    ] as const),
});

export interface CloudCirrusFibratusSubvoxelFibre {
    index: number;
    primaryLane: number;
    daughter: boolean;
    sourceKm: readonly [number, number, number];
    terminalKm: readonly [number, number, number];
    sourceRadiiKm: readonly [number, number];
    terminalWidthRatio: number;
    terminalDensityRatio: number;
}

/** Owner-static inputs consumed by every sample of one analytic fibre. */
export interface CloudCirrusFibratusPackedDescriptor {
    ownerIndex: number;
    index: number;
    primaryLane: number;
    daughter: boolean;
    start: number;
    end: number;
    sourceCrossKm: number;
    sourceVerticalKm: number;
    terminalCrossKm: number;
    terminalVerticalKm: number;
    sourceCrossRadiusKm: number;
    sourceVerticalRadiusKm: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
    h7: number;
    h8: number;
    terminalWidthRatio: number;
    terminalDensityRatio: number;
}

export interface CloudCirrusFibratusSubvoxelDensityInput {
    topology: CloudTopologyExemplar;
    ownerIndex: number;
    deterministicSeeds: readonly [number, number, number, number];
    /** crosswind radius, altitude half-depth, downwind radius */
    ownerHalfExtentKm: readonly [number, number, number];
    canonical: readonly [number, number, number];
    macroDensity: number;
    sdfVoxels: number;
    requestedFilterRadiusKm: number;
    /** Camera ray segment integrated by one density query; zero for exact/light. */
    rayStepLengthKm?: number;
    /** Unit ray direction in owner crosswind/up/downwind coordinates. */
    rayDirectionOwnerLocal?: readonly [number, number, number];
    /** Qualification-only mirror of the owner-static texture payload. */
    packedDescriptors?: readonly CloudCirrusFibratusPackedDescriptor[];
}

/**
 * Equivalent circular half-footprint of one rectilinear camera pixel at a
 * world-space sample. This mirrors the production WGSL and is qualification
 * only: it changes neither physical fibre radius nor owner placement.
 */
export const cloudCirrusFibratusCameraPixelFootprintRadiusKm = ({
    distanceKm,
    horizontalFovRadians,
    verticalFovRadians,
    width,
    height,
}: {
    distanceKm: number;
    horizontalFovRadians: number;
    verticalFovRadians: number;
    width: number;
    height: number;
}) => {
    const halfX = Math.max(0, distanceKm) * Math.tan(
        Math.max(1e-7, horizontalFovRadians) /
            (2 * Math.max(1, width)),
    );
    const halfY = Math.max(0, distanceKm) * Math.tan(
        Math.max(1e-7, verticalFovRadians) /
            (2 * Math.max(1, height)),
    );
    return Math.hypot(halfX, halfY) / Math.SQRT2;
};

export interface CloudCirrusFibratusSubvoxelDensityEvaluation {
    density: number;
    residualOnly: boolean;
    longitudinalRejectCount: number;
    boundingBoxRejectCount: number;
    squaredEllipseRejectCount: number;
    zeroCrossSectionRejectCount: number;
    contributingFibreCount: number;
}

/**
 * CPU qualification mirror for the owner-level endpoints and physical taper
 * used by the WGSL reconstruction. It intentionally does not rasterize or
 * imitate a camera; photograph tests use these fibres to prove that every
 * packed topology produces nonparallel, sedimenting, finite trajectories.
 */
export function qualifyCloudCirrusFibratusSubvoxelFibres({
    topology,
    ownerIndex,
    deterministicSeeds,
    ownerHalfExtentKm,
}: {
    topology: CloudTopologyExemplar;
    ownerIndex: number;
    deterministicSeeds: readonly [number, number, number, number];
    /** crosswind radius, altitude half-depth, downwind radius */
    ownerHalfExtentKm: readonly [number, number, number];
}): CloudCirrusFibratusSubvoxelFibre[] {
    const float = new Float32Array(1);
    const words = new Uint32Array(float.buffer);
    const floatBits = (value: number) => {
        float[0] = Math.fround(value);
        return words[0] >>> 0;
    };
    const hashCell = (x: number, y: number, z: number, seed: number) => {
        let value = seed >>> 0;
        value = (value ^ Math.imul(x, 0x9e3779b1)) >>> 0;
        value = (value ^ Math.imul(y, 0x85ebca77)) >>> 0;
        value = (value ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        value = Math.imul(value, 0x7feb352d) >>> 0;
        value = (value ^ value >>> 15) >>> 0;
        value = Math.imul(value, 0x846ca68b) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        return value / 0x1_0000_0000;
    };
    const midpoint = (range: readonly [number, number]) =>
        (range[0] + range[1]) * 0.5;
    const construction = topology.construction;
    const branchCount = Math.min(15, Math.round(midpoint(
        construction.branchOrCrestCount,
    )));
    const macroElementCount = Math.min(63, Math.round(midpoint(
        construction.macroElementCount,
    )));
    const shearCoupling = Math.round(midpoint(
        construction.shearCoupling,
    ) * 15) / 15;
    const sedimentationCoupling = Math.round(midpoint(
        construction.sedimentationCoupling,
    ) * 15) / 15;
    const primaryCount = Math.min(5, Math.max(
        3, Math.round(branchCount * 0.55 + 2),
    ));
    const fibreCount = Math.min(
        CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT.maximumFibreCount,
        Math.max(6, Math.round(macroElementCount * 0.45 + 3)),
    );
    const minorRadiusKm = Math.max(0.04, ownerHalfExtentKm[0]);
    const depthKm = Math.max(0.02, ownerHalfExtentKm[1] * 2);
    const majorRadiusKm = Math.max(0.04, ownerHalfExtentKm[2]);
    const ownerSeed = (
        floatBits(deterministicSeeds[0]) ^
        Math.imul(floatBits(deterministicSeeds[2]), 0x9e3779b1) ^
        Math.imul(ownerIndex, 0x85ebca77) ^
        Math.imul(topology.ordinal, 0xc2b2ae3d)
    ) >>> 0;
    const result: CloudCirrusFibratusSubvoxelFibre[] = [];
    for (let index = 0; index < fibreCount; index += 1) {
        const daughter = index >= primaryCount;
        const primaryLane = daughter
            ? (index - primaryCount) % primaryCount : index;
        const laneFraction = (primaryLane + 1) / (primaryCount + 1);
        const h0 = hashCell(index, 0, topology.ordinal, ownerSeed);
        const h1 = hashCell(index, 1, topology.ordinal, ownerSeed);
        const h2 = hashCell(index, 2, topology.ordinal, ownerSeed);
        const fractional = (value: number) => value - Math.floor(value);
        const h3 = fractional(
            h0 * 0.754877666 + h1 * 0.569840291 + 0.137,
        );
        const h4 = fractional(
            h1 * 0.618033989 + h2 * 0.414213562 + 0.271,
        );
        const h5 = fractional(
            h2 * 0.732050808 + h0 * 0.438447187 + 0.419,
        );
        const h6 = fractional(
            h0 * 0.324717957 + h2 * 0.682327804 + 0.587,
        );
        const h7 = fractional(
            h1 * 0.819172513 + h0 * 0.219978738 + 0.731,
        );
        let start = 0.045 + (0.16 - 0.045) * h0;
        let end = 0.76 + (0.96 - 0.76) * h1;
        if (daughter) {
            start = 0.20 + (0.40 - 0.20) * h0;
            end = Math.min(0.94,
                start + 0.27 + (0.48 - 0.27) * h1);
        }
        const span = Math.max(0.16, end - start);
        const alongSpanKm = 2 * majorRadiusKm * span;
        const lanePosition = (laneFraction - 0.5) *
            minorRadiusKm * 1.20;
        const daughterOffset = daughter
            ? (-0.10 + 0.20 * h4) * minorRadiusKm : 0;
        const sourceXKm = lanePosition +
            (h0 - 0.5) * minorRadiusKm * 0.11 + daughterOffset;
        const sourceYKm = (-0.06 + 0.38 * h1) * depthKm +
            (daughter ? (-0.055 + 0.11 * h5) * depthKm : 0);
        const synopticCrossSlope =
            (shearCoupling - 0.5) * 0.055 +
            (deterministicSeeds[1] - 0.5) * 0.025;
        const differentialCrossSlope =
            (h2 - 0.5) * (0.09 +
                (0.16 - 0.09) * shearCoupling);
        const terminalXKm = Math.min(
            minorRadiusKm * 0.78,
            Math.max(-minorRadiusKm * 0.78,
                sourceXKm + alongSpanKm *
                    (synopticCrossSlope + differentialCrossSlope)),
        );
        const sedimentationDropKm = depthKm * (
            0.12 + (0.48 - 0.12) * Math.min(1, Math.max(
                0, sedimentationCoupling * 0.46 + h3 * 0.54,
            ))
        );
        const terminalYKm = Math.max(
            -depthKm * 0.48,
            sourceYKm - sedimentationDropKm,
        );
        let sourceCrossRadiusKm = Math.min(0.075, Math.max(
            0.016,
            minorRadiusKm * 2 * (0.009 + (0.018 - 0.009) * h5),
        ));
        let sourceVerticalRadiusKm = Math.min(0.055, Math.max(
            0.014,
            depthKm * (0.020 + (0.045 - 0.020) * h6),
        ));
        if (daughter) {
            const daughterScale = 0.66 + (0.82 - 0.66) * h7;
            sourceCrossRadiusKm *= daughterScale;
            sourceVerticalRadiusKm *= daughterScale;
        }
        result.push({
            index,
            primaryLane,
            daughter,
            sourceKm: [
                sourceXKm,
                sourceYKm,
                (start - 0.5) * 2 * majorRadiusKm,
            ],
            terminalKm: [
                terminalXKm,
                terminalYKm,
                (end - 0.5) * 2 * majorRadiusKm,
            ],
            sourceRadiiKm: [
                sourceCrossRadiusKm,
                sourceVerticalRadiusKm,
            ],
            terminalWidthRatio:
                CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                    .terminalWidthRatio[0] +
                (CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                    .terminalWidthRatio[1] -
                    CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                        .terminalWidthRatio[0]) * h7,
            terminalDensityRatio:
                CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                    .terminalDensityRatio[0] +
                (CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                    .terminalDensityRatio[1] -
                    CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT
                        .terminalDensityRatio[0]) * h3,
        });
    }
    return result;
}

/**
 * Compile the immutable half of the WGSL fibre body. Values cross the same
 * rgba32float boundary as CloudSystem data, so explicitly store f32 here and
 * leave only canonical-position/filter dependent work to the shader.
 */
export function compileCloudCirrusFibratusPackedDescriptors({
    topology,
    ownerIndex,
    deterministicSeeds,
    ownerHalfExtentKm,
}: {
    topology: CloudTopologyExemplar;
    ownerIndex: number;
    deterministicSeeds: readonly [number, number, number, number];
    ownerHalfExtentKm: readonly [number, number, number];
}): CloudCirrusFibratusPackedDescriptor[] {
    const float = new Float32Array(1);
    const words = new Uint32Array(float.buffer);
    const floatBits = (value: number) => {
        float[0] = Math.fround(value);
        return words[0] >>> 0;
    };
    const hashCell = (x: number, y: number, z: number, seed: number) => {
        let value = seed >>> 0;
        value = (value ^ Math.imul(x, 0x9e3779b1)) >>> 0;
        value = (value ^ Math.imul(y, 0x85ebca77)) >>> 0;
        value = (value ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        value = Math.imul(value, 0x7feb352d) >>> 0;
        value = (value ^ value >>> 15) >>> 0;
        value = Math.imul(value, 0x846ca68b) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        return Math.fround(value / 0x1_0000_0000);
    };
    const fract = (value: number) => Math.fround(
        Math.fround(value) - Math.floor(Math.fround(value)),
    );
    const affineFract = (
        left: number, leftCoefficient: number,
        right: number, rightCoefficient: number,
        bias: number,
    ) => fract(Math.fround(
        Math.fround(Math.fround(left * leftCoefficient) +
            Math.fround(right * rightCoefficient)) + bias,
    ));
    const ownerSeed = (
        floatBits(deterministicSeeds[0]) ^
        Math.imul(floatBits(deterministicSeeds[2]), 0x9e3779b1) ^
        Math.imul(ownerIndex, 0x85ebca77) ^
        Math.imul(topology.ordinal, 0xc2b2ae3d)
    ) >>> 0;
    const fibres = qualifyCloudCirrusFibratusSubvoxelFibres({
        topology,
        ownerIndex,
        deterministicSeeds: deterministicSeeds.map(Math.fround) as
            unknown as readonly [number, number, number, number],
        ownerHalfExtentKm: ownerHalfExtentKm.map(Math.fround) as
            unknown as readonly [number, number, number],
    });
    const majorRadiusKm = Math.max(0.04, Math.fround(ownerHalfExtentKm[2]));
    return fibres.map((fibre) => {
        const h0 = hashCell(fibre.index, 0, topology.ordinal, ownerSeed);
        const h1 = hashCell(fibre.index, 1, topology.ordinal, ownerSeed);
        const h2 = hashCell(fibre.index, 2, topology.ordinal, ownerSeed);
        const h3 = affineFract(h0, 0.754877666, h1, 0.569840291, 0.137);
        const h4 = affineFract(h1, 0.618033989, h2, 0.414213562, 0.271);
        const h5 = affineFract(h2, 0.732050808, h0, 0.438447187, 0.419);
        const h6 = affineFract(h0, 0.324717957, h2, 0.682327804, 0.587);
        const h7 = affineFract(h1, 0.819172513, h0, 0.219978738, 0.731);
        const h8 = affineFract(h2, 0.671043606, h1, 0.463647609, 0.887);
        return {
            ownerIndex,
            index: fibre.index,
            primaryLane: fibre.primaryLane,
            daughter: fibre.daughter,
            start: Math.fround(fibre.sourceKm[2] /
                Math.fround(2 * majorRadiusKm) + 0.5),
            end: Math.fround(fibre.terminalKm[2] /
                Math.fround(2 * majorRadiusKm) + 0.5),
            sourceCrossKm: Math.fround(fibre.sourceKm[0]),
            sourceVerticalKm: Math.fround(fibre.sourceKm[1]),
            terminalCrossKm: Math.fround(fibre.terminalKm[0]),
            terminalVerticalKm: Math.fround(fibre.terminalKm[1]),
            sourceCrossRadiusKm: Math.fround(fibre.sourceRadiiKm[0]),
            sourceVerticalRadiusKm: Math.fround(fibre.sourceRadiiKm[1]),
            h2, h3, h4, h5, h6, h7, h8,
            terminalWidthRatio: Math.fround(fibre.terminalWidthRatio),
            terminalDensityRatio: Math.fround(fibre.terminalDensityRatio),
        };
    });
}

const cloudCirrusFibratusSmoothstep = (
    edge0: number,
    edge1: number,
    value: number,
) => {
    const amount = Math.min(1, Math.max(0,
        (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
};

const cloudCirrusFibratusSaturate = (value: number) =>
    Math.min(1, Math.max(0, value));

/**
 * CPU numerical mirror for the Ci-fibratus analytic density kernel. The
 * reference mode deliberately executes the complete member body; optimized
 * mode mirrors only mathematically conservative WGSL early-outs. It is a
 * qualification oracle, not a second production renderer.
 */
const evaluateCloudCirrusFibratusSubvoxelDensity = (
    input: CloudCirrusFibratusSubvoxelDensityInput,
    conservativeEarlyOuts: boolean,
): CloudCirrusFibratusSubvoxelDensityEvaluation => {
    const empty = (density: number, residualOnly: boolean) => ({
        density,
        residualOnly,
        longitudinalRejectCount: 0,
        boundingBoxRejectCount: 0,
        squaredEllipseRejectCount: 0,
        zeroCrossSectionRejectCount: 0,
        contributingFibreCount: 0,
    });
    if (input.macroDensity <= 0.0001) {
        return empty(input.macroDensity, true);
    }
    if (input.topology.connectivity !== "fragmented-population") {
        return empty(input.macroDensity, true);
    }
    if (input.sdfVoxels >= 0) return empty(0, true);

    const midpoint = (range: readonly [number, number]) =>
        (range[0] + range[1]) * 0.5;
    const sedimentationCoupling = Math.round(midpoint(
        input.topology.construction.sedimentationCoupling,
    ) * 15) / 15;
    const support = 1 - cloudCirrusFibratusSmoothstep(
        -0.085, 0, input.sdfVoxels,
    );
    const macroEnvelope = cloudCirrusFibratusSmoothstep(
        0.002, 0.14, input.macroDensity,
    );
    const residualIce = input.macroDensity * support * (
        0.032 + (0.068 - 0.032) * sedimentationCoupling
    );
    if (conservativeEarlyOuts && macroEnvelope <= 0) {
        return empty(cloudCirrusFibratusSaturate(residualIce), true);
    }

    const minorRadiusKm = Math.max(0.04, input.ownerHalfExtentKm[0]);
    const depthKm = Math.max(0.02, input.ownerHalfExtentKm[1] * 2);
    const majorRadiusKm = Math.max(0.04, input.ownerHalfExtentKm[2]);
    const physicalPositionKm = input.canonical.map((value, component) =>
        (value - 0.5) * input.ownerHalfExtentKm[component] * 2,
    ) as [number, number, number];
    const fibres = input.packedDescriptors?.map((descriptor) => ({
        index: descriptor.index,
        primaryLane: descriptor.primaryLane,
        daughter: descriptor.daughter,
        sourceKm: [
            descriptor.sourceCrossKm,
            descriptor.sourceVerticalKm,
            (descriptor.start - 0.5) * 2 * majorRadiusKm,
        ] as const,
        terminalKm: [
            descriptor.terminalCrossKm,
            descriptor.terminalVerticalKm,
            (descriptor.end - 0.5) * 2 * majorRadiusKm,
        ] as const,
        sourceRadiiKm: [
            descriptor.sourceCrossRadiusKm,
            descriptor.sourceVerticalRadiusKm,
        ] as const,
        terminalWidthRatio: descriptor.terminalWidthRatio,
        terminalDensityRatio: descriptor.terminalDensityRatio,
    })) ?? qualifyCloudCirrusFibratusSubvoxelFibres({
        topology: input.topology,
        ownerIndex: input.ownerIndex,
        deterministicSeeds: input.deterministicSeeds,
        ownerHalfExtentKm: input.ownerHalfExtentKm,
    });

    const float = new Float32Array(1);
    const words = new Uint32Array(float.buffer);
    const floatBits = (value: number) => {
        float[0] = Math.fround(value);
        return words[0] >>> 0;
    };
    const hashCell = (x: number, y: number, z: number, seed: number) => {
        let value = seed >>> 0;
        value = (value ^ Math.imul(x, 0x9e3779b1)) >>> 0;
        value = (value ^ Math.imul(y, 0x85ebca77)) >>> 0;
        value = (value ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        value = Math.imul(value, 0x7feb352d) >>> 0;
        value = (value ^ value >>> 15) >>> 0;
        value = Math.imul(value, 0x846ca68b) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        return value / 0x1_0000_0000;
    };
    const ownerSeed = (
        floatBits(input.deterministicSeeds[0]) ^
        Math.imul(floatBits(input.deterministicSeeds[2]), 0x9e3779b1) ^
        Math.imul(input.ownerIndex, 0x85ebca77) ^
        Math.imul(input.topology.ordinal, 0xc2b2ae3d)
    ) >>> 0;
    const fractional = (value: number) => value - Math.floor(value);
    const counts = {
        longitudinalRejectCount: 0,
        boundingBoxRejectCount: 0,
        squaredEllipseRejectCount: 0,
        zeroCrossSectionRejectCount: 0,
        contributingFibreCount: 0,
    };
    let fibreUnion = 0;
    for (const fibre of fibres) {
        const packedDescriptor = input.packedDescriptors?.find(
            ({ index }) => index === fibre.index,
        );
        const h0 = hashCell(
            fibre.index, 0, input.topology.ordinal, ownerSeed,
        );
        const h1 = hashCell(
            fibre.index, 1, input.topology.ordinal, ownerSeed,
        );
        const derivedH2 = hashCell(
            fibre.index, 2, input.topology.ordinal, ownerSeed,
        );
        const h2 = packedDescriptor?.h2 ?? derivedH2;
        const h3 = packedDescriptor?.h3 ?? fractional(
            h0 * 0.754877666 + h1 * 0.569840291 + 0.137,
        );
        const h4 = packedDescriptor?.h4 ?? fractional(
            h1 * 0.618033989 + derivedH2 * 0.414213562 + 0.271,
        );
        const h5 = packedDescriptor?.h5 ?? fractional(
            derivedH2 * 0.732050808 + h0 * 0.438447187 + 0.419,
        );
        const h6 = packedDescriptor?.h6 ?? fractional(
            h0 * 0.324717957 + derivedH2 * 0.682327804 + 0.587,
        );
        const h7 = packedDescriptor?.h7 ?? fractional(
            h1 * 0.819172513 + h0 * 0.219978738 + 0.731,
        );
        const h8 = packedDescriptor?.h8 ?? fractional(
            derivedH2 * 0.671043606 + h1 * 0.463647609 + 0.887,
        );
        const start = packedDescriptor?.start ??
            fibre.sourceKm[2] / (2 * majorRadiusKm) + 0.5;
        const end = packedDescriptor?.end ??
            fibre.terminalKm[2] / (2 * majorRadiusKm) + 0.5;
        const span = Math.max(0.16, end - start);
        const amount = (input.canonical[2] - start) / span;
        if (conservativeEarlyOuts &&
            (amount <= -0.025 || amount >= 1.025)) {
            counts.longitudinalRejectCount += 1;
            continue;
        }
        const t = Math.min(1, Math.max(0, amount));
        const c2Amount = t * t * t * (t * (t * 6 - 15) + 10);
        const sourceCrossRadiusKm = fibre.sourceRadiiKm[0];
        const sourceVerticalRadiusKm = fibre.sourceRadiiKm[1];
        const intrinsicFilterKm = Math.max(
            0.003,
            Math.min(sourceCrossRadiusKm, sourceVerticalRadiusKm) * 0.16,
        );
        const filterRadiusKm = Math.max(
            intrinsicFilterKm, input.requestedFilterRadiusKm,
        );
        const conservativeOuterRadius = 1.421;
        const bow = 4 * t * (1 - t);
        const centreXKm = fibre.sourceKm[0] +
            (fibre.terminalKm[0] - fibre.sourceKm[0]) * c2Amount +
            (-0.085 + 0.17 * h4) * minorRadiusKm * bow;
        const centreYKm = fibre.sourceKm[1] +
            (fibre.terminalKm[1] - fibre.sourceKm[1]) * c2Amount +
            (-0.040 + 0.095 * h5) * depthKm * bow;
        const c2Derivative = 30 * t ** 2 * (t - 1) ** 2;
        const bowDerivative = 4 * (1 - 2 * t);
        const alongSpanKm = Math.max(1e-6,
            2 * majorRadiusKm * span);
        const tangentCrossPerDownwind = (
            (fibre.terminalKm[0] - fibre.sourceKm[0]) * c2Derivative +
            (-0.085 + 0.17 * h4) * minorRadiusKm * bowDerivative
        ) / alongSpanKm;
        const tangentVerticalPerDownwind = (
            (fibre.terminalKm[1] - fibre.sourceKm[1]) * c2Derivative +
            (-0.040 + 0.095 * h5) * depthKm * bowDerivative
        ) / alongSpanKm;
        const ray = input.rayDirectionOwnerLocal ?? [0, 0, 0];
        const halfStepKm = Math.max(0, input.rayStepLengthKm ?? 0) * 0.5;
        const sweptCrossKm = halfStepKm * (
            ray[0] - tangentCrossPerDownwind * ray[2]
        );
        const sweptVerticalKm = halfStepKm * (
            ray[1] - tangentVerticalPerDownwind * ray[2]
        );
        const deltaCrossKm = physicalPositionKm[0] - centreXKm;
        const deltaVerticalKm = physicalPositionKm[1] - centreYKm;
        if (conservativeEarlyOuts) {
            // At a fixed canonical z only this local C2 cross-section can
            // contribute.  The coordinate projections of
            // x^T covariance^-1 x <= R^2 are exactly R^2 * covariance.xx/yy;
            // use the proven maximum physical radii to reject without the
            // former whole-fibre AABB or an arbitrary tangent bound.
            const maximumCovarianceCross =
                sourceCrossRadiusKm ** 2 * 1.21 ** 2 +
                filterRadiusKm ** 2 + sweptCrossKm ** 2;
            const maximumCovarianceVertical =
                sourceVerticalRadiusKm ** 2 / 0.86 ** 2 +
                filterRadiusKm ** 2 + sweptVerticalKm ** 2;
            if (deltaCrossKm ** 2 > conservativeOuterRadius ** 2 *
                    maximumCovarianceCross ||
                deltaVerticalKm ** 2 > conservativeOuterRadius ** 2 *
                    maximumCovarianceVertical) {
                counts.boundingBoxRejectCount += 1;
                continue;
            }
        }

        const taperAmount = t ** (0.76 + (1.28 - 0.76) * h6);
        const widthPulse = Math.max(
            0.78,
            1 + (h8 - 0.5) * 0.30 * bow + (h4 - 0.5) * 0.12 * t,
        );
        const widthTaper = 1 +
            (fibre.terminalWidthRatio - 1) * taperAmount;
        const crossRadiusKm = sourceCrossRadiusKm * widthTaper * widthPulse;
        const verticalRadiusKm = sourceVerticalRadiusKm * widthTaper /
            Math.max(0.86, widthPulse);
        // A camera query represents both one pixel cone and one finite ray
        // stratum.  The latter sweeps relative to the curved fibre tangent,
        // so its covariance is rank one rather than an isotropic blur.  This
        // is the analytic line/pixel overlap used by the WGSL camera path.
        const covarianceCross = crossRadiusKm ** 2 +
            filterRadiusKm ** 2 + sweptCrossKm ** 2;
        const covarianceVertical = verticalRadiusKm ** 2 +
            filterRadiusKm ** 2 + sweptVerticalKm ** 2;
        const covarianceCrossVertical = sweptCrossKm * sweptVerticalKm;
        const covarianceDeterminant = Math.max(1e-12,
            covarianceCross * covarianceVertical -
                covarianceCrossVertical ** 2);
        const filteredCrossRadiusKm = Math.sqrt(covarianceCross);
        const filteredVerticalRadiusKm = Math.sqrt(covarianceVertical);
        const areaPreservation = cloudCirrusFibratusSaturate(
            crossRadiusKm * verticalRadiusKm /
                Math.max(1e-6, Math.sqrt(covarianceDeterminant)),
        );
        const ellipticalDistanceSquared = Math.max(0, (
            covarianceVertical * deltaCrossKm ** 2 -
            2 * covarianceCrossVertical * deltaCrossKm * deltaVerticalKm +
            covarianceCross * deltaVerticalKm ** 2
        ) / covarianceDeterminant);
        if (conservativeEarlyOuts && ellipticalDistanceSquared >
            conservativeOuterRadius ** 2) {
            counts.squaredEllipseRejectCount += 1;
            continue;
        }
        const ellipticalDistance = Math.sqrt(ellipticalDistanceSquared);
        const crossSection = (1 - cloudCirrusFibratusSmoothstep(
            0.48, 1.42, ellipticalDistance,
        )) * areaPreservation;
        if (conservativeEarlyOuts && crossSection <= 0) {
            counts.zeroCrossSectionRejectCount += 1;
            continue;
        }
        const longitudinal = cloudCirrusFibratusSmoothstep(
            -0.025, 0.065, amount,
        ) * (1 - cloudCirrusFibratusSmoothstep(0.87, 1.025, amount));
        const densityTaper = 1 + (fibre.terminalDensityRatio - 1) *
            t ** (0.82 + (1.34 - 0.82) * h2);
        const gapCentre = 0.42 + (0.72 - 0.42) * h6;
        const gapHalfWidth = 0.018 + (0.052 - 0.018) * h7;
        const gapWindow = cloudCirrusFibratusSmoothstep(
            gapCentre - gapHalfWidth, gapCentre, t,
        ) * (1 - cloudCirrusFibratusSmoothstep(
            gapCentre, gapCentre + gapHalfWidth, t,
        ));
        const hasGap = fibre.daughter || h8 < 0.26;
        const gapStrength = hasGap ? 0.52 + (0.90 - 0.52) * h8 : 0;
        const continuity = 1 - gapWindow * gapStrength;
        const fibreDensity = cloudCirrusFibratusSaturate(
            crossSection * longitudinal * densityTaper * continuity,
        );
        if (fibreDensity > 0) counts.contributingFibreCount += 1;
        fibreUnion = 1 - (1 - fibreUnion) * (1 - fibreDensity);
    }

    const concentratedFibres = support * macroEnvelope *
        cloudCirrusFibratusSaturate(fibreUnion * (
            0.74 + (1.08 - 0.74) * Math.sqrt(
                cloudCirrusFibratusSaturate(input.macroDensity),
            )
        ));
    return {
        density: cloudCirrusFibratusSaturate(Math.max(
            residualIce, concentratedFibres,
        )),
        residualOnly: concentratedFibres <= residualIce,
        ...counts,
    };
};

export const qualifyCloudCirrusFibratusSubvoxelDensityReference = (
    input: CloudCirrusFibratusSubvoxelDensityInput,
) => evaluateCloudCirrusFibratusSubvoxelDensity(input, false);

export const qualifyCloudCirrusFibratusSubvoxelDensityOptimized = (
    input: CloudCirrusFibratusSubvoxelDensityInput,
) => evaluateCloudCirrusFibratusSubvoxelDensity(input, true);
/** Operators that can only remove or reweight condensate already in the base. */
export const CLOUD_MORPHOLOGY_EXISTING_SUPPORT_ONLY_OPERATOR_CODES =
    Object.freeze([4, 5, 7, 8, 12] as const);

/** Bit codes mirrored by the generated manifest and WGSL owner header. */
export const CLOUD_LOGICAL_TOPOLOGY_CONNECTIVITY_CODES: Readonly<
    Record<CloudTopologyConnectivity, number>
> = Object.freeze({
    "single-connected": 0,
    "fragmented-population": 1,
    "cellular-colony": 2,
    "continuous-sheet": 3,
    "finite-wave-packet": 4,
    "roll-tube": 5,
});

export const CLOUD_MORPHOLOGY_MODIFIER_IDS = [
    "intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
    "duplicatus", "translucidus", "perlucidus", "opacus",
    "mamma", "fluctus", "asperitas", "cavum", "arcus", "tuba",
    "murus", "cauda", "incus",
    "pileus", "velum", "pannus", "flumen",
    "polar-stratospheric", "nacreous", "noctilucent",
] as const;

export type CloudMorphologyModifierId =
    (typeof CLOUD_MORPHOLOGY_MODIFIER_IDS)[number];
export type CloudMorphologyPhase = "liquid" | "mixed" | "ice";
export type CloudMorphologySeason = "winter" | "summer";
export type CloudMorphologyCategory =
    | "variety"
    | "supplementary-feature"
    | "accessory-cloud"
    | "upper-atmospheric";
export type CloudMorphologyBlend =
    | "smooth-union"
    | "subtract"
    | "warp"
    | "placement"
    | "optical"
    | "reuse";

type Vec3 = readonly [number, number, number];
type Range = readonly [number, number];

export interface CloudMorphologyOperatorDefinition {
    code: string;
    opCode: number;
    blend: CloudMorphologyBlend;
    blendCode: number;
    anchor: string;
    anchorCode: number;
    parameters: Record<string, unknown>;
    flags: string[];
}

export interface CloudMorphologyModifierDefinition {
    id: CloudMorphologyModifierId;
    category: CloudMorphologyCategory;
    description: string;
    representation: string;
    support: {
        frame: "parent-local-crosswind-altitude-downwind" | "earth-tangent-shell";
        finite: true;
        anchor: string;
        normalizedSupport: { u: Range; v: Range; w: Range };
        verticalOffsetMeters: Range;
        altitudeKm?: Range;
    };
    physicalScale: {
        horizontalExtentMeters: Range;
        verticalExtentMeters: Range;
        downwindExtentMeters: Range;
        wavelengthMeters: Range | null;
        note: string;
    };
    placement: {
        method: string;
        count: Range;
        scaleRelative: Range;
        minimumSeparation: number;
        candidateCount: number;
        jitterFraction: number;
    };
    constraints: {
        genera: string[];
        phases: CloudMorphologyPhase[];
        lifecycle: CloudLifecycleStage[];
        requires: string[];
        dependencies: CloudMorphologyModifierId[];
        excludes: CloudMorphologyModifierId[];
        environment: Record<string, unknown>;
    };
    operators: CloudMorphologyOperatorDefinition[];
    sources: string[];
    referenceVariation: {
        seed: number;
        instances: Array<{
            index: number;
            center: [number, number, number];
            scale: [number, number, number];
            angleRadians: number;
            intensity: number;
        }>;
        topology: {
            count: number;
            nearestSpacingCoefficientVariation: number;
            orderedIntervalCoefficientVariation: number;
            nearestDirectionEntropy: number;
        };
    };
}

export interface CloudMorphologyModifierManifest {
    schema: "elements-cloud-morphology-modifiers";
    version: 1;
    generatorVersion: string;
    coordinateSystems: Record<string, unknown>;
    compositionOrder: CloudMorphologyBlend[];
    operatorCodes: Record<string, number>;
    blendCodes: Record<CloudMorphologyBlend, number>;
    anchorCodes: Record<string, number>;
    materialProfileCodes: Record<string, number>;
    macroVolumeCodes: Record<string, number>;
    logicalTopologyConnectivityCodes: Record<CloudTopologyConnectivity, number>;
    logicalTopologyOwnerWordLayout: Record<string, readonly [number, number]>;
    operatorParameterLayouts: Record<string, string[]>;
    flagBits: Record<string, number>;
    rendererContract: Record<string, unknown>;
    modifiers: CloudMorphologyModifierDefinition[];
    checksums: { algorithm: "SHA-256"; payload: string };
    provenance: Record<string, unknown>;
    limitations: string[];
}

/**
 * Camera-independent authoring path that production CloudScene should expose.
 * A stable system id survives owner sorting; layer/system indices are retained
 * only as a deterministic compatibility key for existing scene generation.
 */
export interface CloudMorphologyClassificationAssignment {
    layerIndex: number;
    systemId?: string;
    systemIndex?: number;
    /** Apply one canonical classification to every finite owner in the layer. */
    scope?: "owner" | "layer";
    /** Causal relation to another authored system; never camera-derived. */
    relation?: "independent" | "mother" | "embedded" | "genitus" | "mutatus";
    /** Stable mother-cloud owner for a real cross-owner genitus/mutatus link. */
    causalParent?: CloudMorphologyOwnerReference;
    /** Fraction of a mutatus transition represented by the child owner. */
    transitionProgress?: number;
    /** Finite generating source for a WMO special-origin assignment. */
    sourceId?: string;
    classification: CloudClassification;
    upperAtmosphericCloud?: Exclude<UpperAtmosphericCloud, "none">;
}

export interface CloudMorphologyOwnerReference {
    layerIndex: number;
    systemId?: string;
    systemIndex?: number;
}

export interface CloudSceneMorphologyExtension {
    /** Optional future CloudScene field; authored once, never camera-derived. */
    classifications?: readonly CloudMorphologyClassificationAssignment[];
}

export const cloudMorphologyAssignmentKey = ({
    layerIndex,
    systemId,
    systemIndex,
    scope,
}: Pick<CloudMorphologyClassificationAssignment,
    "layerIndex" | "systemId" | "systemIndex" | "scope">) =>
    scope === "layer" ? `${layerIndex}:*`
        : systemId ? `${layerIndex}:${systemId}`
            : `${layerIndex}:#${systemIndex ?? 0}`;

export function indexCloudMorphologyAssignments(
    assignments: readonly CloudMorphologyClassificationAssignment[] = [],
) {
    const indexed = new Map<string, CloudMorphologyClassificationAssignment>();
    for (const assignment of assignments) {
        const key = cloudMorphologyAssignmentKey(assignment);
        if (indexed.has(key)) throw new Error(`Duplicate cloud morphology assignment ${key}`);
        indexed.set(key, assignment);
    }
    return indexed;
}

export function resolveCloudMorphologyAssignment(
    indexed: ReadonlyMap<string, CloudMorphologyClassificationAssignment>,
    identity: Pick<CloudMorphologyClassificationAssignment,
        "layerIndex" | "systemId" | "systemIndex">,
) {
    if (identity.systemId) {
        const stable = indexed.get(`${identity.layerIndex}:${identity.systemId}`);
        if (stable) return stable;
    }
    const exact = indexed.get(`${identity.layerIndex}:#${identity.systemIndex ?? 0}`);
    return exact ?? indexed.get(`${identity.layerIndex}:*`);
}

export interface CloudMorphologyPhysicalContext {
    organizationKind?: string;
    organizationTopology?: string;
    phase: CloudMorphologyPhase;
    temperatureKelvin?: number;
    relativeHumidity?: number;
    verticalVelocityMps?: number;
    verticalShearMps?: number;
    gradientRichardsonNumber?: number;
    vorticityS1?: number;
    precipitationKind?: string;
    outflowSpeedMps?: number;
    cloudyUnderside?: boolean;
    subcloudDetrainmentOrSublimation?: boolean;
    settlingOrEvaporation?: boolean;
    stormComplex?: boolean;
    supercell?: boolean;
    mesocyclone?: boolean;
    rainFreeUpdraftBase?: boolean;
    precipitationRegion?: boolean;
    supercellInflow?: boolean;
    pseudoWarmFront?: boolean;
    precipitationMoistenedLayer?: boolean;
    capillatusStage?: boolean;
    polarWinterVortex?: boolean;
    stratosphericColdPool?: boolean;
    belowIceFrostPoint?: boolean;
    polarSummerMesopause?: boolean;
    sunlitUpperLayer?: boolean;
}

/** Converts physical owner state into the exact manifest requirement tokens. */
export function deriveCloudMorphologyRequirements(
    context: CloudMorphologyPhysicalContext,
) {
    const result = new Set<string>();
    if (context.organizationKind === "banded") result.add("banded-organization");
    if (context.organizationKind === "cellular" &&
        context.organizationTopology !== "closed") result.add("open-cell-organization");
    if (context.cloudyUnderside) result.add("cloudy-underside");
    if (context.subcloudDetrainmentOrSublimation) {
        result.add("subcloud-detrainment-or-sublimation");
    }
    if ((context.verticalShearMps ?? 0) >= 3) result.add("vertical-shear-at-least-3-mps");
    if ((context.gradientRichardsonNumber ?? Infinity) < 0.25) {
        result.add("richardson-unstable-layer");
    }
    if (context.settlingOrEvaporation) result.add("settling-or-evaporation");
    if ((context.verticalShearMps ?? 0) > 0) result.add("vertical-shear");
    if (context.phase !== "ice" && (context.temperatureKelvin ?? Infinity) < 273.15) {
        result.add("supercooled-liquid-layer");
    }
    const hasPrecipitation = context.precipitationKind !== undefined &&
        !["none", "virga"].includes(context.precipitationKind);
    if (hasPrecipitation && (context.outflowSpeedMps ?? 0) > 0) {
        result.add("precipitation-driven-cold-pool");
    }
    if ((context.outflowSpeedMps ?? 0) > 0) result.add("positive-outflow-speed");
    if ((context.verticalVelocityMps ?? 0) > 0) result.add("positive-convective-ascent");
    if (Math.abs(context.vorticityS1 ?? 0) > 0) result.add("resolved-vorticity");
    if (context.stormComplex) result.add("storm-complex");
    if (context.supercell && context.mesocyclone) result.add("supercell-mesocyclone");
    if (context.rainFreeUpdraftBase) result.add("rain-free-updraft-base");
    if (context.supercellInflow) result.add("supercell-inflow");
    if (context.precipitationRegion) result.add("precipitation-region");
    if (context.capillatusStage) result.add("capillatus-stage");
    if (context.precipitationMoistenedLayer) result.add("precipitation-moistened-layer");
    if ((context.relativeHumidity ?? 0) >= 0.85) result.add("relative-humidity-at-least-0.85");
    if (context.pseudoWarmFront) result.add("pseudo-warm-front");
    if (context.polarWinterVortex) result.add("polar-winter-vortex");
    if (context.stratosphericColdPool) result.add("stratospheric-cold-pool");
    if (context.belowIceFrostPoint) result.add("below-ice-frost-point");
    if (context.polarSummerMesopause) result.add("polar-summer-mesopause");
    if (context.sunlitUpperLayer) result.add("sunlit-upper-layer");
    return result;
}

const isFiniteRange = (candidate: unknown): candidate is [number, number] =>
    Array.isArray(candidate) && candidate.length === 2 &&
    candidate.every(Number.isFinite) && candidate[0] <= candidate[1];

export function validateCloudMorphologyModifierManifest(
    candidate: unknown,
): CloudMorphologyModifierManifest {
    if (!candidate || typeof candidate !== "object") {
        throw new Error("Cloud morphology modifier manifest is not an object");
    }
    const manifest = candidate as CloudMorphologyModifierManifest;
    if (manifest.schema !== "elements-cloud-morphology-modifiers" || manifest.version !== 1) {
        throw new Error(`Unsupported cloud morphology modifiers ${manifest.schema}@${manifest.version}`);
    }
    if (
        manifest.modifiers?.length !== CLOUD_MORPHOLOGY_MODIFIER_IDS.length ||
        manifest.rendererContract === null ||
        Object.entries(CLOUD_LOGICAL_TOPOLOGY_CONNECTIVITY_CODES).some(
            ([connectivity, code]) =>
                manifest.logicalTopologyConnectivityCodes?.[
                    connectivity as CloudTopologyConnectivity
                ] !== code,
        ) ||
        manifest.logicalTopologyOwnerWordLayout?.cellularClosure?.[0] !== 27 ||
        manifest.logicalTopologyOwnerWordLayout?.cellularClosure?.[1] !== 5 ||
        !/^[0-9a-f]{64}$/.test(manifest.checksums?.payload ?? "") ||
        manifest.compositionOrder.join(",") !==
            "placement,warp,subtract,smooth-union,reuse,optical"
    ) {
        throw new Error("Cloud morphology manifest has an incompatible operator contract");
    }
    const expectedIds = new Set<string>(CLOUD_MORPHOLOGY_MODIFIER_IDS);
    const ids = new Set<string>();
    for (const modifier of manifest.modifiers) {
        if (!expectedIds.has(modifier.id) || ids.has(modifier.id)) {
            throw new Error(`Unknown or duplicate cloud morphology modifier ${modifier.id}`);
        }
        ids.add(modifier.id);
        if (!modifier.support.finite || !modifier.operators.length) {
            throw new Error(`${modifier.id} must have finite support and a physical operator`);
        }
        for (const axis of ["u", "v", "w"] as const) {
            if (!isFiniteRange(modifier.support.normalizedSupport[axis])) {
                throw new Error(`${modifier.id} has invalid ${axis} support`);
            }
        }
        for (const operation of modifier.operators) {
            if (
                manifest.operatorCodes[operation.code] !== operation.opCode ||
                manifest.blendCodes[operation.blend] !== operation.blendCode ||
                manifest.anchorCodes[operation.anchor] !== operation.anchorCode ||
                manifest.operatorParameterLayouts[operation.code]?.length !== 8
            ) {
                throw new Error(`${modifier.id}/${operation.code} has an incompatible ABI`);
            }
        }
    }
    return manifest;
}

let cachedManifest: Promise<CloudMorphologyModifierManifest> | undefined;
export function loadCloudMorphologyModifierManifest({
    url = CLOUD_MORPHOLOGY_MODIFIER_MANIFEST_URL,
    signal,
}: { url?: string; signal?: AbortSignal } = {}) {
    const cacheable = url === CLOUD_MORPHOLOGY_MODIFIER_MANIFEST_URL && !signal;
    if (cacheable && cachedManifest) return cachedManifest;
    const request = fetch(url, { cache: "force-cache", signal }).then(async (response) => {
        if (!response.ok) throw new Error(`${url} returned ${response.status}`);
        return validateCloudMorphologyModifierManifest(await response.json());
    });
    if (cacheable) {
        cachedManifest = request.catch((error) => {
            cachedManifest = undefined;
            throw error;
        });
        return cachedManifest;
    }
    return request;
}

export interface CloudMorphologyEnvironment {
    temperatureKelvin?: number;
    absoluteLatitudeDegrees?: number;
    season?: CloudMorphologySeason;
    altitudeKm?: number;
    solarDepressionDegrees?: number;
}

export interface CloudMorphologySelectionRequest {
    classification?: CloudClassification;
    upperAtmosphericCloud?: Exclude<UpperAtmosphericCloud, "none">;
    phase: CloudMorphologyPhase;
    lifecycle: CloudLifecycleStage;
    requirements: ReadonlySet<string>;
    environment?: CloudMorphologyEnvironment;
}

export interface CloudMorphologyDiagnostic {
    modifierId: CloudMorphologyModifierId;
    code: string;
    message: string;
    severity: "error" | "warning";
}

export interface CloudMorphologySelection {
    modifiers: CloudMorphologyModifierDefinition[];
    diagnostics: CloudMorphologyDiagnostic[];
}

/**
 * The packed modifier ABI predates the production PSC particle-class IDs.
 * Keep the three stable operator IDs while resolving the finer authoring
 * states to their shared geometric path. Particle composition remains
 * distinct in `upperAtmosphericState` and in the packed material profile.
 */
export const upperMorphologyModifierForState = (
    state: Exclude<UpperAtmosphericCloud, "none">,
): Extract<CloudMorphologyModifierId,
    "polar-stratospheric" | "nacreous" | "noctilucent"> =>
    state === "noctilucent" ? "noctilucent"
        : state === "nacreous" || state === "polar-stratospheric-ice"
            ? "nacreous" : "polar-stratospheric";

const environmentalIssue = (
    modifier: CloudMorphologyModifierDefinition,
    environment: CloudMorphologyEnvironment,
) => {
    const expected = modifier.constraints.environment;
    if (typeof expected.maximumTemperatureKelvin === "number" &&
        (!(typeof environment.temperatureKelvin === "number") ||
            environment.temperatureKelvin > expected.maximumTemperatureKelvin)) {
        return "temperature-domain";
    }
    if (isFiniteRange(expected.absoluteLatitudeDegrees) &&
        (!(typeof environment.absoluteLatitudeDegrees === "number") ||
            environment.absoluteLatitudeDegrees < expected.absoluteLatitudeDegrees[0] ||
            environment.absoluteLatitudeDegrees > expected.absoluteLatitudeDegrees[1])) {
        return "latitude-domain";
    }
    if (typeof expected.season === "string" && environment.season !== expected.season) {
        return "season-domain";
    }
    if (isFiniteRange(expected.altitudeKm) &&
        (!(typeof environment.altitudeKm === "number") ||
            environment.altitudeKm < expected.altitudeKm[0] ||
            environment.altitudeKm > expected.altitudeKm[1])) {
        return "altitude-domain";
    }
    if (isFiniteRange(expected.solarDepressionDegrees) &&
        (!(typeof environment.solarDepressionDegrees === "number") ||
            environment.solarDepressionDegrees < expected.solarDepressionDegrees[0] ||
            environment.solarDepressionDegrees > expected.solarDepressionDegrees[1])) {
        return "solar-domain";
    }
    return null;
};

export function selectCloudMorphologyModifiers(
    manifest: CloudMorphologyModifierManifest,
    request: CloudMorphologySelectionRequest,
): CloudMorphologySelection {
    const definitions = new Map(manifest.modifiers.map((modifier) => [modifier.id, modifier]));
    const requested: CloudMorphologyModifierId[] = [];
    if (request.classification) {
        requested.push(...request.classification.varieties);
        requested.push(...request.classification.supplementaryFeatures.filter(
            (id): id is Exclude<typeof id, "virga" | "praecipitatio"> =>
                id !== "virga" && id !== "praecipitatio",
        ));
        requested.push(...request.classification.accessoryClouds);
    }
    if (request.upperAtmosphericCloud) {
        requested.push(upperMorphologyModifierForState(
            request.upperAtmosphericCloud,
        ));
    }
    const requestedSet = new Set(requested);
    const selected: CloudMorphologyModifierDefinition[] = [];
    const diagnostics: CloudMorphologyDiagnostic[] = [];
    for (const id of requested) {
        const modifier = definitions.get(id);
        if (!modifier) continue;
        const genus = request.classification?.genus;
        const invalidGenus = modifier.category !== "upper-atmospheric" &&
            (!genus || !modifier.constraints.genera.includes(genus));
        const missingRequirement = modifier.constraints.requires.find(
            (requirement) => !request.requirements.has(requirement),
        );
        const missingDependency = modifier.constraints.dependencies.find(
            (dependency) => !requestedSet.has(dependency),
        );
        const exclusion = modifier.constraints.excludes.find((other) => requestedSet.has(other));
        const environmentIssue = environmentalIssue(modifier, request.environment ?? {});
        const issue = invalidGenus ? "invalid-genus" :
            !modifier.constraints.phases.includes(request.phase) ? "invalid-phase" :
            !modifier.constraints.lifecycle.includes(request.lifecycle) ? "invalid-lifecycle" :
            missingRequirement ? `missing-requirement:${missingRequirement}` :
            missingDependency ? `missing-dependency:${missingDependency}` :
            exclusion ? `exclusive-with:${exclusion}` : environmentIssue;
        if (issue) {
            diagnostics.push({
                modifierId: id,
                code: issue,
                message: `${id} rejected by morphology constraint ${issue}.`,
                severity: "error",
            });
        } else if (!selected.some((candidate) => candidate.id === id)) {
            selected.push(modifier);
        }
    }
    return { modifiers: selected, diagnostics };
}

export interface CloudMorphologyOwnerGeometry {
    ownerIndex: number;
    centerKm: Vec3;
    halfExtentsKm: Vec3;
    axisU: Vec3;
    axisV: Vec3;
    axisW: Vec3;
    anchorsKm?: Readonly<Record<string, Vec3>>;
}

export interface CloudMorphologyCompileRequest extends CloudMorphologySelectionRequest {
    parent: CloudMorphologyOwnerGeometry;
    seed: number;
    intensity?: number;
    /** Species-qualified topology shared with atlas and family production. */
    logicalTopology?: CloudTopologyExemplar;
    /**
     * The four immutable CloudSystem seeds as uploaded to WGSL. When present
     * on Ci fibratus, owner-static fibre anatomy is packed once instead of
     * being rebuilt for every ray sample.
     */
    deterministicSeeds?: readonly [number, number, number, number];
    upperAtmosphericState?: UpperAtmosphericMorphologyState;
}

const quantizeUnit = (value: number, maximum: number) =>
    Math.round(clamp(value) * maximum);

/**
 * Pack causal topology into the formerly reserved owner-range word. The word
 * is transported as raw IEEE bits, so all 32 bits survive rgba32float upload.
 */
export const packCloudLogicalTopologyWord = (
    topology?: CloudTopologyExemplar,
) => {
    if (!topology) return 0;
    const construction = topology.construction;
    const midpointOf = (range: readonly [number, number]) =>
        (range[0] + range[1]) * 0.5;
    const ordinal = Math.min(3, Math.max(0, topology.ordinal)) >>> 0;
    const connectivity = CLOUD_LOGICAL_TOPOLOGY_CONNECTIVITY_CODES[
        topology.connectivity
    ] >>> 0;
    const lineage = Math.min(15, Math.round(midpointOf(
        construction.lineageDepth,
    ))) >>> 0;
    const elements = Math.min(63, Math.round(midpointOf(
        construction.macroElementCount,
    ))) >>> 0;
    const branches = Math.min(15, Math.round(midpointOf(
        construction.branchOrCrestCount,
    ))) >>> 0;
    const shear = quantizeUnit(midpointOf(construction.shearCoupling), 15) >>> 0;
    const sedimentation = quantizeUnit(
        midpointOf(construction.sedimentationCoupling),
        15,
    ) >>> 0;
    const closure = quantizeUnit(
        (midpointOf(construction.cellularClosure) + 1) * 0.5,
        31,
    ) >>> 0;
    return (
        ordinal |
        connectivity << 2 |
        lineage << 5 |
        elements << 9 |
        branches << 15 |
        shear << 19 |
        sedimentation << 23 |
        closure << 27
    ) >>> 0;
};

/** CPU-visible provenance retained beside the fixed eight-scalar GPU ABI. */
export interface UpperAtmosphericMorphologyState {
    stateId: Exclude<UpperAtmosphericCloud, "none">;
    representation: UpperAtmosphericCloudRepresentation;
    topologyVariantId: string;
    formationAspectRatio: readonly [number, number];
    wavelengthKm: readonly [number, number] | null;
    composition: UpperParticleComposition;
    particleDiameterMicrons: readonly [number, number];
    /** Current transport is scalar/RGB; this basis makes a later Mueller ABI explicit. */
    polarizationBasis: "scalar-rgb-with-latent-stokes-mueller-basis";
}

export interface CloudMorphologyRecord {
    modifierId: CloudMorphologyModifierId;
    parentOwnerIndex: number;
    operatorCode: number;
    operatorName: string;
    blendCode: number;
    blend: CloudMorphologyBlend;
    anchorCode: number;
    flags: number;
    seed: number;
    intensity: number;
    lifecycle: number;
    centerKm: [number, number, number];
    axes: readonly [Vec3, Vec3, Vec3];
    halfExtentsKm: [number, number, number];
    shape0: [number, number, number, number];
    shape1: [number, number, number, number];
    upperAtmosphericState?: UpperAtmosphericMorphologyState;
}

export interface CloudMorphologyBounds {
    minimumKm: [number, number, number];
    maximumKm: [number, number, number];
}

const EXISTING_SUPPORT_ONLY_OPERATOR_CODES = new Set<number>(
    CLOUD_MORPHOLOGY_EXISTING_SUPPORT_ONLY_OPERATOR_CODES,
);

/** Unknown operation codes intentionally return true (fail closed). */
export const cloudMorphologyOperationMayChangeSupport = (
    operatorCode: number,
) => !EXISTING_SUPPORT_ONLY_OPERATOR_CODES.has(operatorCode);

/**
 * CPU reference for the point-wise support proof used by cloud-light WGSL.
 * `localPositionKm` is the same flat-altitude coordinate passed to
 * cloud_morphology_evaluate_owner, not the geocentric renderer coordinate.
 */
export function cloudMorphologyRecordMayChangeSupportAt(
    record: CloudMorphologyRecord,
    localPositionKm: Vec3,
) {
    if (record.intensity <= 0 ||
        !cloudMorphologyOperationMayChangeSupport(record.operatorCode)) {
        return false;
    }
    const offset: Vec3 = [
        localPositionKm[0] - record.centerKm[0],
        localPositionKm[1] - record.centerKm[1],
        localPositionKm[2] - record.centerKm[2],
    ];
    let largest = 0;
    for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
        const axis = record.axes[axisIndex];
        const coordinate = Math.abs((
            offset[0] * axis[0] +
            offset[1] * axis[1] +
            offset[2] * axis[2]
        ) / Math.max(1e-5, record.halfExtentsKm[axisIndex]));
        largest = Math.max(largest, coordinate);
    }
    return largest < CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH;
}

export interface PackedCloudMorphologyModifiers {
    data: Float32Array;
    width: 256;
    height: number;
    bytesPerRow: number;
    recordCount: number;
    dropped: number;
    ownerRanges: Array<{ ownerIndex: number; offset: number; count: number; dropped: number }>;
    records: CloudMorphologyRecord[];
    fibratusDescriptorCount: number;
    fibratusOwnerRanges: Array<{
        ownerIndex: number;
        offset: number;
        count: number;
        dropped: number;
    }>;
    fibratusDescriptors: CloudCirrusFibratusPackedDescriptor[];
    inflatedBounds: ReadonlyMap<number, CloudMorphologyBounds>;
    diagnostics: CloudMorphologyDiagnostic[];
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.max(minimum, Math.min(maximum, value));
const lerp = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;
const add3 = (left: Vec3, right: Vec3): [number, number, number] => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const scale3 = (vector: Vec3, scalar: number): [number, number, number] => [
    vector[0] * scalar, vector[1] * scalar, vector[2] * scalar,
];

const mulberry32 = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };
};

const hashModifierSeed = (seed: number, id: string, operationIndex: number) => {
    let hash = seed >>> 0;
    for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash ^ Math.imul(operationIndex + 1, 0x9e3779b1)) >>> 0;
};

const resolvedScalar = (value: unknown, random: () => number) => {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (isFiniteRange(value)) return lerp(value[0], value[1], random());
    return 0;
};

const parameterValue = (
    manifest: CloudMorphologyModifierManifest,
    operation: CloudMorphologyOperatorDefinition,
    name: string,
    random: () => number,
) => {
    if (name === "zero") return 0;
    if (name === "materialProfileCode") {
        return manifest.materialProfileCodes[String(operation.parameters.materialProfile ?? "none")] ?? 0;
    }
    if (name === "macroVolumeCode") {
        return manifest.macroVolumeCodes[String(operation.parameters.macroVolumeId ?? "none")] ?? 0;
    }
    return resolvedScalar(operation.parameters[name], random);
};

const lifecycleValue = (lifecycle: CloudLifecycleStage) => ({
    incipient: 0,
    growing: 0.2,
    mature: 0.45,
    glaciating: 0.62,
    precipitating: 0.78,
    decaying: 1,
})[lifecycle];

const modifierFlags = (
    manifest: CloudMorphologyModifierManifest,
    modifier: CloudMorphologyModifierDefinition,
    operation: CloudMorphologyOperatorDefinition,
) => {
    const bits = manifest.flagBits;
    let flags = bits.finite ?? 0;
    if (modifier.category !== "upper-atmospheric") flags |= bits.parentAttached ?? 0;
    if (modifier.category === "upper-atmospheric") flags |= bits.upperAtmosphere ?? 0;
    if (operation.flags.includes("camera-independent") || operation.flags.includes("world-parallel")) {
        flags |= bits.cameraIndependent ?? 0;
    }
    if (operation.blend === "subtract") flags |= bits.subtractive ?? 0;
    if (operation.blend === "optical") flags |= bits.optical ?? 0;
    if (operation.flags.some((flag) => flag.includes("hydrometeor-anchor"))) {
        flags |= bits.hydrometeorAnchor ?? 0;
    }
    if (operation.flags.includes("independent-advection")) flags |= bits.independentAdvection ?? 0;
    if (operation.flags.some((flag) => flag.includes("material-required"))) {
        flags |= bits.materialRequired ?? 0;
    }
    if (operation.blend === "reuse") flags |= bits.reuseBase ?? 0;
    if (modifier.constraints.requires.includes("supercooled-liquid-layer")) {
        flags |= bits.supercooled ?? 0;
    }
    return flags >>> 0;
};

const physicalHalfExtent = (
    parentHalfExtentKm: number,
    normalizedRange: Range,
    physicalRangeMeters: Range,
    random: () => number,
) => {
    const normalizedHalfSpan = (normalizedRange[1] - normalizedRange[0]) * 0.5;
    const parentSupport = parentHalfExtentKm * normalizedHalfSpan;
    const physicalMinimum = physicalRangeMeters[0] / 2_000;
    const physicalMaximum = physicalRangeMeters[1] / 2_000;
    const physicalTarget = lerp(physicalMinimum, physicalMaximum, 0.22 + random() * 0.42);
    return Math.min(physicalMaximum, Math.max(physicalMinimum, Math.min(parentSupport, physicalTarget)));
};

const compileModifierOperation = (
    manifest: CloudMorphologyModifierManifest,
    modifier: CloudMorphologyModifierDefinition,
    operation: CloudMorphologyOperatorDefinition,
    request: CloudMorphologyCompileRequest,
    operationIndex: number,
): CloudMorphologyRecord => {
    const seed = hashModifierSeed(request.seed, modifier.id, operationIndex);
    const random = mulberry32(seed);
    const { parent } = request;
    const anchor = parent.anchorsKm?.[operation.anchor] ?? parent.centerKm;
    const normalized = modifier.support.normalizedSupport;
    const localMidpoint: Vec3 = [
        (normalized.u[0] + normalized.u[1]) * 0.5,
        (normalized.v[0] + normalized.v[1]) * 0.5,
        (normalized.w[0] + normalized.w[1]) * 0.5,
    ];
    const verticalOffsetMeters = modifier.support.verticalOffsetMeters;
    const verticalOffsetKm = lerp(verticalOffsetMeters[0], verticalOffsetMeters[1], random()) / 1_000;
    let center = add3(anchor, scale3(parent.axisU, localMidpoint[0] * parent.halfExtentsKm[0]));
    center = add3(center, scale3(parent.axisV,
        localMidpoint[1] * parent.halfExtentsKm[1] + verticalOffsetKm));
    center = add3(center, scale3(parent.axisW, localMidpoint[2] * parent.halfExtentsKm[2]));
    const halfExtentsKm: [number, number, number] = [
        physicalHalfExtent(parent.halfExtentsKm[0], normalized.u,
            modifier.physicalScale.horizontalExtentMeters, random),
        physicalHalfExtent(parent.halfExtentsKm[1], normalized.v,
            modifier.physicalScale.verticalExtentMeters, random),
        physicalHalfExtent(parent.halfExtentsKm[2], normalized.w,
            modifier.physicalScale.downwindExtentMeters, random),
    ];
    const layout = manifest.operatorParameterLayouts[operation.code];
    const parameters = layout.map((name) => parameterValue(manifest, operation, name, random));
    const upperState = request.upperAtmosphericState;
    if (operation.code === "add-upper-wave-sheet" && upperState) {
        const wavelength = upperState.wavelengthKm;
        if (wavelength) {
            parameters[2] = lerp(wavelength[0], wavelength[1], 0.2 + random() * 0.6) * 1_000;
        }
        parameters[4] = clamp(
            Math.sqrt(upperState.formationAspectRatio[0] *
                upperState.formationAspectRatio[1]) / 8,
            1.5,
            upperState.stateId === "nacreous" ? 80 : 24,
        );
        parameters[7] = upperState.stateId === "noctilucent"
            ? manifest.materialProfileCodes["pmc-water-ice-60-100nm"] ?? 3
            : upperState.stateId === "nacreous" ||
                upperState.stateId === "polar-stratospheric-ice"
                ? manifest.materialProfileCodes["psc-ice-nacreous-10um"] ?? 2
                : manifest.materialProfileCodes["psc-nitric-acid-water"] ?? 1;
    }
    return {
        modifierId: modifier.id,
        parentOwnerIndex: parent.ownerIndex,
        operatorCode: operation.opCode,
        operatorName: operation.code,
        blendCode: operation.blendCode,
        blend: operation.blend,
        anchorCode: operation.anchorCode,
        flags: modifierFlags(manifest, modifier, operation),
        seed,
        intensity: clamp(request.intensity ?? 1),
        lifecycle: lifecycleValue(request.lifecycle),
        centerKm: center,
        axes: [parent.axisU, parent.axisV, parent.axisW],
        halfExtentsKm,
        shape0: parameters.slice(0, 4) as [number, number, number, number],
        shape1: parameters.slice(4, 8) as [number, number, number, number],
        ...(upperState ? { upperAtmosphericState: upperState } : {}),
    };
};

export function compileCloudMorphologyRecords(
    manifest: CloudMorphologyModifierManifest,
    requests: readonly CloudMorphologyCompileRequest[],
) {
    const records: CloudMorphologyRecord[] = [];
    const diagnostics: CloudMorphologyDiagnostic[] = [];
    for (const request of requests) {
        if (request.parent.ownerIndex < 0 ||
            request.parent.ownerIndex >= CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS) {
            throw new Error(`Cloud morphology parent ${request.parent.ownerIndex} is out of range`);
        }
        const selection = selectCloudMorphologyModifiers(manifest, request);
        diagnostics.push(...selection.diagnostics);
        for (const modifier of selection.modifiers) {
            for (let operationIndex = 0; operationIndex < modifier.operators.length; operationIndex += 1) {
                records.push(compileModifierOperation(
                    manifest,
                    modifier,
                    modifier.operators[operationIndex],
                    request,
                    operationIndex,
                ));
            }
        }
    }
    const blendOrder = new Map(manifest.compositionOrder.map((blend, index) => [blend, index]));
    const modifierOrder = new Map(manifest.modifiers.map((modifier, index) => [modifier.id, index]));
    records.sort((left, right) =>
        left.parentOwnerIndex - right.parentOwnerIndex ||
        (blendOrder.get(left.blend) ?? 99) - (blendOrder.get(right.blend) ?? 99) ||
        (modifierOrder.get(left.modifierId) ?? 99) - (modifierOrder.get(right.modifierId) ?? 99));
    return { records, diagnostics };
}

const conservativeRecordBounds = (record: CloudMorphologyRecord): CloudMorphologyBounds => {
    const radius: [number, number, number] = [0, 0, 0];
    for (let component = 0; component < 3; component += 1) {
        radius[component] =
            CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH * (
                Math.abs(record.axes[0][component]) *
                    Math.max(1e-5, record.halfExtentsKm[0]) +
                Math.abs(record.axes[1][component]) *
                    Math.max(1e-5, record.halfExtentsKm[1]) +
                Math.abs(record.axes[2][component]) *
                    Math.max(1e-5, record.halfExtentsKm[2])
            ) + CLOUD_MORPHOLOGY_BOUNDS_NUMERIC_MARGIN_KM;
    }
    return {
        minimumKm: [
            record.centerKm[0] - radius[0],
            record.centerKm[1] - radius[1],
            record.centerKm[2] - radius[2],
        ],
        maximumKm: [
            record.centerKm[0] + radius[0],
            record.centerKm[1] + radius[1],
            record.centerKm[2] + radius[2],
        ],
    };
};

const unionBounds = (
    left: CloudMorphologyBounds,
    right: CloudMorphologyBounds,
): CloudMorphologyBounds => ({
    minimumKm: left.minimumKm.map((value, index) =>
        Math.min(value, right.minimumKm[index])) as [number, number, number],
    maximumKm: left.maximumKm.map((value, index) =>
        Math.max(value, right.maximumKm[index])) as [number, number, number],
});

export function inflateCloudMorphologyBounds(
    owners: readonly CloudMorphologyOwnerGeometry[],
    records: readonly CloudMorphologyRecord[],
) {
    const result = new Map<number, CloudMorphologyBounds>();
    const ownerIndices = new Set(owners.map(({ ownerIndex }) => ownerIndex));
    for (const record of records) {
        if (!ownerIndices.has(record.parentOwnerIndex)) continue;
        if (record.blend === "subtract" || record.blend === "optical") continue;
        const bounds = conservativeRecordBounds(record);
        const existing = result.get(record.parentOwnerIndex);
        result.set(record.parentOwnerIndex, existing ? unionBounds(existing, bounds) : bounds);
    }
    return result;
}

const writeTexel = (
    data: Float32Array,
    texel: number,
    values: readonly [number, number, number, number],
) => data.set(values, texel * 4);

const writeSeedBits = (data: Float32Array, texel: number, seed: number) => {
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
    words[texel * 4 + 1] = seed >>> 0;
};

export function packCloudMorphologyModifiers(
    manifest: CloudMorphologyModifierManifest,
    requests: readonly CloudMorphologyCompileRequest[],
): PackedCloudMorphologyModifiers {
    const compiled = compileCloudMorphologyRecords(manifest, requests);
    const records: CloudMorphologyRecord[] = [];
    const ownerRanges: PackedCloudMorphologyModifiers["ownerRanges"] = [];
    let dropped = 0;
    for (let ownerIndex = 0; ownerIndex < CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS; ownerIndex += 1) {
        const ownerRecords = compiled.records.filter((record) =>
            record.parentOwnerIndex === ownerIndex);
        const available = Math.max(0, CLOUD_MORPHOLOGY_MAX_RECORDS - records.length);
        const keep = ownerRecords.slice(0,
            Math.min(CLOUD_MORPHOLOGY_MAX_RECORDS_PER_OWNER, available));
        const ownerDropped = ownerRecords.length - keep.length;
        ownerRanges.push({
            ownerIndex,
            offset: records.length,
            count: keep.length,
            dropped: ownerDropped,
        });
        records.push(...keep);
        dropped += ownerDropped;
    }
    const fibratusDescriptors: CloudCirrusFibratusPackedDescriptor[] = [];
    const fibratusOwnerRanges: PackedCloudMorphologyModifiers[
        "fibratusOwnerRanges"
    ] = [];
    let fibratusDropped = 0;
    const descriptorCapacity = Math.floor((
        CLOUD_MORPHOLOGY_MAX_RECORDS * CLOUD_MORPHOLOGY_RECORD_TEXELS -
        records.length * CLOUD_MORPHOLOGY_RECORD_TEXELS
    ) / CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS);
    for (let ownerIndex = 0;
        ownerIndex < CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS;
        ownerIndex += 1) {
        const request = requests.find(({ parent }) =>
            parent.ownerIndex === ownerIndex);
        const isFibratus = request?.classification?.genus === "cirrus" &&
            request.classification.species === "fibratus" &&
            request.logicalTopology?.connectivity === "fragmented-population" &&
            request.deterministicSeeds !== undefined;
        const compiledDescriptors = isFibratus
            ? compileCloudCirrusFibratusPackedDescriptors({
                topology: request.logicalTopology!,
                ownerIndex,
                deterministicSeeds: request.deterministicSeeds!,
                ownerHalfExtentKm: request.parent.halfExtentsKm,
            })
            : [];
        const available = Math.max(0,
            descriptorCapacity - fibratusDescriptors.length);
        const keep = compiledDescriptors.slice(0, available);
        const ownerDropped = compiledDescriptors.length - keep.length;
        fibratusOwnerRanges.push({
            ownerIndex,
            offset: fibratusDescriptors.length,
            count: keep.length,
            dropped: ownerDropped,
        });
        fibratusDescriptors.push(...keep);
        fibratusDropped += ownerDropped;
    }
    const texelCount = CLOUD_MORPHOLOGY_HEADER_TEXELS +
        records.length * CLOUD_MORPHOLOGY_RECORD_TEXELS +
        fibratusDescriptors.length * CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS;
    const height = Math.max(1, Math.ceil(texelCount / CLOUD_MORPHOLOGY_TEXTURE_WIDTH));
    const data = new Float32Array(CLOUD_MORPHOLOGY_TEXTURE_WIDTH * height * 4);
    writeTexel(data, 0, [
        records.length,
        CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS,
        CLOUD_MORPHOLOGY_RECORD_TEXELS,
        manifest.version,
    ]);
    for (const range of ownerRanges) {
        writeTexel(data, 1 + range.ownerIndex, [range.offset, range.count, range.dropped, 0]);
        const request = requests.find(({ parent }) =>
            parent.ownerIndex === range.ownerIndex);
        const words = new Uint32Array(data.buffer, data.byteOffset, data.length);
        words[(1 + range.ownerIndex) * 4 + 3] = packCloudLogicalTopologyWord(
            request?.logicalTopology,
        );
    }
    for (const range of fibratusOwnerRanges) {
        writeTexel(data,
            1 + CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS + range.ownerIndex,
            [range.offset, range.count, range.dropped, 0]);
    }
    records.forEach((record, recordIndex) => {
        const base = CLOUD_MORPHOLOGY_HEADER_TEXELS +
            recordIndex * CLOUD_MORPHOLOGY_RECORD_TEXELS;
        writeTexel(data, base, [record.operatorCode, record.blendCode,
            record.anchorCode, record.flags]);
        writeTexel(data, base + 1, [record.parentOwnerIndex, record.seed,
            record.intensity, record.lifecycle]);
        // rgba32float carries the seed as raw IEEE bits so no low hash bits are
        // lost to the 24-bit f32 mantissa. WGSL reads it with bitcast<u32>().
        writeSeedBits(data, base + 1, record.seed);
        writeTexel(data, base + 2, [...record.centerKm,
            Math.hypot(...record.halfExtentsKm)]);
        writeTexel(data, base + 3, [...record.axes[0], record.halfExtentsKm[0]]);
        writeTexel(data, base + 4, [...record.axes[1], record.halfExtentsKm[1]]);
        writeTexel(data, base + 5, [...record.axes[2], record.halfExtentsKm[2]]);
        writeTexel(data, base + 6, record.shape0);
        writeTexel(data, base + 7, record.shape1);
    });
    const descriptorBase = CLOUD_MORPHOLOGY_HEADER_TEXELS +
        records.length * CLOUD_MORPHOLOGY_RECORD_TEXELS;
    fibratusDescriptors.forEach((descriptor, descriptorIndex) => {
        const base = descriptorBase + descriptorIndex *
            CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS;
        writeTexel(data, base, [
            descriptor.index,
            descriptor.daughter ? 1 : 0,
            descriptor.start,
            descriptor.end,
        ]);
        writeTexel(data, base + 1, [
            descriptor.sourceCrossKm,
            descriptor.sourceVerticalKm,
            descriptor.terminalCrossKm,
            descriptor.terminalVerticalKm,
        ]);
        writeTexel(data, base + 2, [
            descriptor.sourceCrossRadiusKm,
            descriptor.sourceVerticalRadiusKm,
            descriptor.h2,
            descriptor.h3,
        ]);
        writeTexel(data, base + 3, [
            descriptor.h4,
            descriptor.h5,
            descriptor.h6,
            descriptor.h7,
        ]);
        writeTexel(data, base + 4, [
            descriptor.h8,
            descriptor.terminalWidthRatio,
            descriptor.terminalDensityRatio,
            descriptor.primaryLane,
        ]);
    });
    if (dropped > 0) {
        compiled.diagnostics.push({
            modifierId: records.at(-1)?.modifierId ?? "intortus",
            code: "modifier-record-capacity",
            message: `${dropped} morphology modifier records exceeded bounded capacity.`,
            severity: "warning",
        });
    }
    if (fibratusDropped > 0) {
        compiled.diagnostics.push({
            modifierId: "intortus",
            code: "fibratus-descriptor-capacity",
            message: `${fibratusDropped} Ci-fibratus descriptors exceeded bounded capacity.`,
            severity: "warning",
        });
    }
    return {
        data,
        width: CLOUD_MORPHOLOGY_TEXTURE_WIDTH,
        height,
        bytesPerRow: CLOUD_MORPHOLOGY_BYTES_PER_ROW,
        recordCount: records.length,
        dropped,
        ownerRanges,
        records,
        fibratusDescriptorCount: fibratusDescriptors.length,
        fibratusOwnerRanges,
        fibratusDescriptors,
        inflatedBounds: inflateCloudMorphologyBounds(
            requests.map((request) => request.parent),
            records,
        ),
        diagnostics: compiled.diagnostics,
    };
}

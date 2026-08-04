/**
 * Renderer-independent reference contract for deterministic cloud optical-depth
 * integration. Distances are kilometres and extinction is inverse kilometres.
 *
 * The WebGPU marcher is not expected to call this CPU implementation. It is a
 * numerical oracle for its step-size, empty-space-skip, and early-out policy.
 * Keeping the contract in optical units is important: a geometric step limit
 * alone cannot resolve both tenuous cirrus and a dense convective core.
 */

export const CLOUD_OPTICAL_INTEGRATION_CONTRACT = Object.freeze({
    /** Maximum potential optical thickness of an occupied integration step. */
    maximumSegmentOpticalDepth: 0.2,
    /** exp(-14) is 8.32e-7, below the useful contribution of an RGB16F path. */
    earlyOutOpticalDepth: 14,
    /** Retains morphology detail where the optical constraint becomes loose. */
    maximumOccupiedStepKm: 0.1,
    /** The observed dense Cu/congestus runtime range after atlas normalization. */
    canonicalCumulusExtinctionKmInverse: Object.freeze([16, 20] as const),
});

export interface CloudOpticalMajorantSegment {
    readonly startKm: number;
    readonly endKm: number;
    /** Conservative maximum of the total extinction over this interval. */
    readonly extinctionMajorantKmInverse: number;
}

export interface CloudOpticalIntegrationOptions {
    readonly segments: readonly CloudOpticalMajorantSegment[];
    /** Actual combined extinction at a source- or view-ray distance. */
    readonly extinctionAtKm: (distanceKm: number) => number;
    readonly maximumSegmentOpticalDepth?: number;
    readonly earlyOutOpticalDepth?: number;
    readonly maximumOccupiedStepKm?: number;
    /** Relative slack is only for quantized conservative-majorant roundoff. */
    readonly majorantRelativeTolerance?: number;
}

export interface CloudOpticalIntegrationResult {
    readonly opticalDepth: number;
    readonly transmittance: number;
    readonly sampleCount: number;
    readonly occupiedDistanceKm: number;
    readonly skippedDistanceKm: number;
    readonly maximumPotentialSegmentOpticalDepth: number;
    readonly terminatedEarly: boolean;
    readonly terminationDistanceKm: number | null;
}

const assertFiniteNonnegative = (name: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a finite nonnegative number`);
    }
};

/**
 * Largest permissible occupied-ray step for a conservative extinction
 * majorant. A zero majorant represents certified empty space and may skip the
 * entire majorant cell.
 */
export const cloudOpticalStepLengthKm = (
    extinctionMajorantKmInverse: number,
    maximumDistanceKm: number,
    maximumSegmentOpticalDepth: number =
        CLOUD_OPTICAL_INTEGRATION_CONTRACT.maximumSegmentOpticalDepth,
    maximumOccupiedStepKm: number =
        CLOUD_OPTICAL_INTEGRATION_CONTRACT.maximumOccupiedStepKm,
) => {
    assertFiniteNonnegative("extinction majorant", extinctionMajorantKmInverse);
    assertFiniteNonnegative("maximum distance", maximumDistanceKm);
    if (!(maximumSegmentOpticalDepth > 0) ||
        !Number.isFinite(maximumSegmentOpticalDepth)) {
        throw new Error("Maximum segment optical depth must be finite and positive");
    }
    if (!(maximumOccupiedStepKm > 0) || !Number.isFinite(maximumOccupiedStepKm)) {
        throw new Error("Maximum occupied step must be finite and positive");
    }
    if (maximumDistanceKm === 0 || extinctionMajorantKmInverse === 0) {
        return maximumDistanceKm;
    }
    return Math.min(
        maximumDistanceKm,
        maximumOccupiedStepKm,
        maximumSegmentOpticalDepth / extinctionMajorantKmInverse,
    );
};

/**
 * Midpoint reference integration over conservative majorant cells. Each
 * occupied cell is subdivided uniformly so every substep satisfies the optical
 * bound. Cells with a zero majorant cost no density lookup.
 */
export const integrateCloudOpticalDepth = (
    options: CloudOpticalIntegrationOptions,
): CloudOpticalIntegrationResult => {
    const maximumSegmentOpticalDepth = options.maximumSegmentOpticalDepth ??
        CLOUD_OPTICAL_INTEGRATION_CONTRACT.maximumSegmentOpticalDepth;
    const earlyOutOpticalDepth = options.earlyOutOpticalDepth ??
        CLOUD_OPTICAL_INTEGRATION_CONTRACT.earlyOutOpticalDepth;
    const maximumOccupiedStepKm = options.maximumOccupiedStepKm ??
        CLOUD_OPTICAL_INTEGRATION_CONTRACT.maximumOccupiedStepKm;
    const majorantRelativeTolerance = options.majorantRelativeTolerance ?? 1e-6;
    if (!(maximumSegmentOpticalDepth > 0) ||
        !Number.isFinite(maximumSegmentOpticalDepth)) {
        throw new Error("Maximum segment optical depth must be finite and positive");
    }
    if (!(earlyOutOpticalDepth >= 12 && earlyOutOpticalDepth <= 16)) {
        throw new Error("Cloud optical early-out must remain in the [12, 16] contract");
    }
    if (!(maximumOccupiedStepKm > 0) || !Number.isFinite(maximumOccupiedStepKm)) {
        throw new Error("Maximum occupied step must be finite and positive");
    }
    if (!(majorantRelativeTolerance >= 0) || !Number.isFinite(majorantRelativeTolerance)) {
        throw new Error("Majorant relative tolerance must be finite and nonnegative");
    }

    let opticalDepth = 0;
    let sampleCount = 0;
    let occupiedDistanceKm = 0;
    let skippedDistanceKm = 0;
    let maximumPotentialSegmentOpticalDepth = 0;
    let previousEndKm = -Infinity;

    for (const segment of options.segments) {
        assertFiniteNonnegative("majorant segment start", segment.startKm);
        assertFiniteNonnegative("majorant segment end", segment.endKm);
        assertFiniteNonnegative(
            "segment extinction majorant",
            segment.extinctionMajorantKmInverse,
        );
        if (!(segment.endKm > segment.startKm)) {
            throw new Error("Cloud optical majorant segments must have positive length");
        }
        if (segment.startKm < previousEndKm - 1e-12) {
            throw new Error("Cloud optical majorant segments must be sorted and nonoverlapping");
        }
        previousEndKm = segment.endKm;

        const lengthKm = segment.endKm - segment.startKm;
        const majorant = segment.extinctionMajorantKmInverse;
        if (majorant === 0) {
            skippedDistanceKm += lengthKm;
            continue;
        }
        const maximumStepKm = cloudOpticalStepLengthKm(
            majorant,
            lengthKm,
            maximumSegmentOpticalDepth,
            maximumOccupiedStepKm,
        );
        const stepCount = Math.max(1, Math.ceil(lengthKm / maximumStepKm));
        const stepKm = lengthKm / stepCount;
        const potentialStepOpticalDepth = majorant * stepKm;
        maximumPotentialSegmentOpticalDepth = Math.max(
            maximumPotentialSegmentOpticalDepth,
            potentialStepOpticalDepth,
        );

        for (let step = 0; step < stepCount; step += 1) {
            const distanceKm = segment.startKm + (step + 0.5) * stepKm;
            const extinction = options.extinctionAtKm(distanceKm);
            assertFiniteNonnegative("sampled cloud extinction", extinction);
            if (extinction > majorant * (1 + majorantRelativeTolerance) + 1e-12) {
                throw new Error(
                    `Cloud extinction ${extinction} exceeds conservative majorant ${majorant}`,
                );
            }
            opticalDepth += extinction * stepKm;
            sampleCount += 1;
            occupiedDistanceKm += stepKm;
            if (opticalDepth >= earlyOutOpticalDepth) {
                return {
                    opticalDepth,
                    transmittance: Math.exp(-opticalDepth),
                    sampleCount,
                    occupiedDistanceKm,
                    skippedDistanceKm,
                    maximumPotentialSegmentOpticalDepth,
                    terminatedEarly: true,
                    terminationDistanceKm: segment.startKm + (step + 1) * stepKm,
                };
            }
        }
    }

    return {
        opticalDepth,
        transmittance: Math.exp(-opticalDepth),
        sampleCount,
        occupiedDistanceKm,
        skippedDistanceKm,
        maximumPotentialSegmentOpticalDepth,
        terminatedEarly: false,
        terminationDistanceKm: null,
    };
};

export type CloudDirection = readonly [number, number, number];

const normalizeDirection = (name: string, value: CloudDirection): CloudDirection => {
    if (value.length !== 3 || !value.every(Number.isFinite)) {
        throw new Error(`${name} must contain three finite components`);
    }
    const length = Math.hypot(value[0], value[1], value[2]);
    if (!(length > 0)) throw new Error(`${name} must have nonzero length`);
    return [value[0] / length, value[1] / length, value[2] / length];
};

/**
 * Scattering cosine used by the renderer. The view ray points camera→sample;
 * the source direction points sample→source. Negating both gives the physical
 * incident and outgoing propagation vectors, so their dot product is unchanged.
 */
export const cloudScatteringCosine = (
    viewRayCameraToSample: CloudDirection,
    sourceDirectionSampleToSource: CloudDirection,
) => {
    const view = normalizeDirection("view ray", viewRayCameraToSample);
    const source = normalizeDirection("source direction", sourceDirectionSampleToSource);
    return Math.max(-1, Math.min(1,
        view[0] * source[0] + view[1] * source[1] + view[2] * source[2]));
};

export interface CloudSlabTransportEstimate {
    readonly photonCount: number;
    readonly directTransmittance: number;
    readonly scatteredTransmittance: number;
    readonly reflectance: number;
    readonly absorption: number;
    readonly multipleScatteredExitance: number;
    readonly maximumConservationError: number;
    readonly ninetyNinePercentHalfWidth: number;
}

export interface CloudSlabTransportOptions {
    readonly opticalDepth: number;
    readonly singleScatteringAlbedo: number;
    readonly asymmetry: number;
    readonly photonCount?: number;
    readonly seed?: number;
    readonly maximumInteractions?: number;
}

const xorshift32 = (initialSeed: number) => {
    let state = initialSeed >>> 0 || 0x9e3779b9;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) + 0.5) / 4_294_967_296;
    };
};

const sampleHenyeyGreensteinCosine = (asymmetry: number, random: number) => {
    if (Math.abs(asymmetry) < 1e-6) return 1 - 2 * random;
    const ratio = (1 - asymmetry * asymmetry) /
        (1 - asymmetry + 2 * asymmetry * random);
    return Math.max(-1, Math.min(1,
        (1 + asymmetry * asymmetry - ratio * ratio) / (2 * asymmetry)));
};

/**
 * Deterministic analog Monte Carlo reference for a normally illuminated,
 * homogeneous plane-parallel slab. It is qualification-only: the renderer
 * should use a cached light field, not run this estimator. Fractions represent
 * flux probabilities and the returned confidence half-width bounds each one.
 */
export const estimateCloudHomogeneousSlabTransport = (
    options: CloudSlabTransportOptions,
): CloudSlabTransportEstimate => {
    assertFiniteNonnegative("slab optical depth", options.opticalDepth);
    if (!(options.singleScatteringAlbedo >= 0 &&
        options.singleScatteringAlbedo <= 1)) {
        throw new Error("Single-scattering albedo must be in [0, 1]");
    }
    if (!(options.asymmetry > -1 && options.asymmetry < 1)) {
        throw new Error("Asymmetry must be in (-1, 1)");
    }
    const photonCount = options.photonCount ?? 40_000;
    const maximumInteractions = options.maximumInteractions ?? 100_000;
    if (!Number.isInteger(photonCount) || photonCount < 1) {
        throw new Error("Photon count must be a positive integer");
    }
    if (!Number.isInteger(maximumInteractions) || maximumInteractions < 1) {
        throw new Error("Maximum interactions must be a positive integer");
    }
    if (options.opticalDepth === 0) {
        return {
            photonCount,
            directTransmittance: 1,
            scatteredTransmittance: 0,
            reflectance: 0,
            absorption: 0,
            multipleScatteredExitance: 0,
            maximumConservationError: 0,
            ninetyNinePercentHalfWidth: 0,
        };
    }

    const random = xorshift32(options.seed ?? 0x4f1bbcdc);
    let directTransmitted = 0;
    let scatteredTransmitted = 0;
    let reflected = 0;
    let absorbed = 0;
    let multipleScatteredExit = 0;

    for (let photon = 0; photon < photonCount; photon += 1) {
        let depth = 0;
        let direction: [number, number, number] = [0, 0, 1];
        let interactions = 0;
        while (interactions <= maximumInteractions) {
            const freePath = -Math.log(Math.max(Number.MIN_VALUE, random()));
            depth += direction[2] * freePath;
            if (depth < 0) {
                reflected += 1;
                if (interactions >= 2) multipleScatteredExit += 1;
                break;
            }
            if (depth > options.opticalDepth) {
                if (interactions === 0) directTransmitted += 1;
                else scatteredTransmitted += 1;
                if (interactions >= 2) multipleScatteredExit += 1;
                break;
            }
            interactions += 1;
            if (random() > options.singleScatteringAlbedo) {
                absorbed += 1;
                break;
            }
            if (interactions > maximumInteractions) {
                throw new Error("Cloud slab reference exceeded its interaction budget");
            }

            const cosine = sampleHenyeyGreensteinCosine(options.asymmetry, random());
            const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
            const azimuth = Math.PI * 2 * random();
            const tangentLength = Math.hypot(direction[0], direction[1]);
            let tangent: [number, number, number];
            if (tangentLength > 1e-12) {
                tangent = [-direction[1] / tangentLength,
                    direction[0] / tangentLength, 0];
            } else {
                tangent = [1, 0, 0];
            }
            const bitangent: [number, number, number] = [
                direction[1] * tangent[2] - direction[2] * tangent[1],
                direction[2] * tangent[0] - direction[0] * tangent[2],
                direction[0] * tangent[1] - direction[1] * tangent[0],
            ];
            direction = [
                direction[0] * cosine + sine * (
                    tangent[0] * Math.cos(azimuth) + bitangent[0] * Math.sin(azimuth)),
                direction[1] * cosine + sine * (
                    tangent[1] * Math.cos(azimuth) + bitangent[1] * Math.sin(azimuth)),
                direction[2] * cosine + sine * (
                    tangent[2] * Math.cos(azimuth) + bitangent[2] * Math.sin(azimuth)),
            ];
        }
    }

    const inverseCount = 1 / photonCount;
    const accounted = directTransmitted + scatteredTransmitted + reflected + absorbed;
    // A conservative simultaneous 99% normal bound. Tests use it as an
    // envelope, not as a claim of exact Gaussian coverage for rare events.
    const ninetyNinePercentHalfWidth = 2.576 * Math.sqrt(0.25 / photonCount);
    return {
        photonCount,
        directTransmittance: directTransmitted * inverseCount,
        scatteredTransmittance: scatteredTransmitted * inverseCount,
        reflectance: reflected * inverseCount,
        absorption: absorbed * inverseCount,
        multipleScatteredExitance: multipleScatteredExit * inverseCount,
        maximumConservationError: Math.abs(1 - accounted * inverseCount),
        ninetyNinePercentHalfWidth,
    };
};

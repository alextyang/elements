/**
 * Renderer-independent reference integrator for atmosphere-coupled weather.
 *
 * Distances are kilometres. Extinction/scattering coefficients are km^-1 and
 * emission is scene-linear radiance per kilometre. The implementation is a
 * CPU truth contract for a later WGSL marcher; it is not used per frame.
 *
 * Every accepted ray segment is an affine RGB operator
 *
 *     outgoing = radiance + transmittance * incoming
 *
 * and operators are composed in camera-to-background order. When finite
 * media overlap, their extinction and source coefficients are added before
 * the segment is integrated. This is the important distinction from placing
 * an already-integrated cloud at one representative depth in clear air.
 */

export type OrderedTransportRgb = readonly [number, number, number];

export interface OrderedRgbTransport {
    readonly radiance: OrderedTransportRgb;
    readonly transmittance: OrderedTransportRgb;
}

export interface OrderedVolumeSample {
    /** Absorption plus out-scattering, in inverse kilometres. */
    readonly extinctionPerKm: OrderedTransportRgb;
    /** Out-scattering coefficient. Must not exceed extinction. */
    readonly scatteringPerKm?: OrderedTransportRgb;
    /** Phase-integrated incident radiance scattered toward the camera ray. */
    readonly scatteredIncidentRadiance?: OrderedTransportRgb;
    /** True emissive source coefficient, in radiance per kilometre. */
    readonly emissionPerKm?: OrderedTransportRgb;
}

export interface OrderedRaySampleContext {
    readonly distanceKm: number;
    readonly normalizedDistance: number;
    readonly positionKm: OrderedTransportRgb;
    /** Normalized camera-to-sample direction. */
    readonly direction: OrderedTransportRgb;
    readonly rayNearKm: number;
    readonly rayFarKm: number;
    readonly integrationSpanNearKm: number;
    readonly integrationSpanFarKm: number;
}

export type OrderedVolumeSampler = (
    context: OrderedRaySampleContext,
) => OrderedVolumeSample;

export interface OrderedAtmosphereMedium {
    readonly id?: string;
    /**
     * Local coefficients are mandatory wherever atmosphere and bounded media
     * overlap. They allow the renderer to add coefficients before integration.
     */
    readonly sample?: OrderedVolumeSampler;
    /** Maximum physical step used when local atmosphere sampling is required. */
    readonly maximumStepKm?: number;
    /**
     * Optional exact/LUT-backed clear-air operator. It is used only in spans
     * containing no bounded medium, so it cannot reorder air around weather.
     */
    readonly segmentTransport?: (
        context: OrderedAtmosphereSegmentContext,
    ) => OrderedRgbTransport;
}

export interface OrderedAtmosphereSegmentContext {
    readonly nearKm: number;
    readonly farKm: number;
    readonly startPositionKm: OrderedTransportRgb;
    readonly endPositionKm: OrderedTransportRgb;
    readonly direction: OrderedTransportRgb;
}

export interface OrderedFiniteMedium {
    readonly id: string;
    readonly nearKm: number;
    readonly farKm: number;
    /** Physical/morphological sample ceiling for this medium. */
    readonly maximumStepKm: number;
    readonly sample: OrderedVolumeSampler;
}

export interface OrderedCameraRayIntegrationOptions {
    readonly originKm: OrderedTransportRgb;
    readonly direction: OrderedTransportRgb;
    readonly nearKm: number;
    readonly farKm: number;
    readonly atmosphere?: OrderedAtmosphereMedium;
    readonly media?: readonly OrderedFiniteMedium[];
    /** Global sample ceiling before medium-specific ceilings are applied. */
    readonly maximumStepKm?: number;
    readonly minimumStepKm?: number;
    /** Maximum accepted optical thickness of one exponential midpoint step. */
    readonly maximumStepOpticalDepth?: number;
    readonly absoluteTolerance?: number;
    readonly relativeTolerance?: number;
    readonly maximumRefinementDepth?: number;
}

export interface OrderedCameraRayDiagnostics {
    readonly sampleCount: number;
    readonly acceptedStepCount: number;
    readonly refinementCount: number;
    readonly exactAtmosphereSegmentCount: number;
    readonly boundedSpanCount: number;
    readonly maximumAcceptedStepKm: number;
    readonly maximumAcceptedStepOpticalDepth: number;
    readonly maximumNormalizedError: number;
    readonly reachedRefinementLimit: boolean;
}

export interface OrderedCameraRayIntegrationResult {
    readonly transport: OrderedRgbTransport;
    readonly diagnostics: OrderedCameraRayDiagnostics;
}

export const ORDERED_WEATHER_ATMOSPHERE_CONTRACT = Object.freeze({
    defaultMaximumStepKm: 1,
    defaultMinimumStepKm: 0.001,
    defaultMaximumStepOpticalDepth: 0.2,
    defaultAbsoluteTolerance: 1e-7,
    defaultRelativeTolerance: 2e-3,
    defaultMaximumRefinementDepth: 14,
});

const ZERO: OrderedTransportRgb = [0, 0, 0];
const ONE: OrderedTransportRgb = [1, 1, 1];
const SAMPLE_EPSILON = 1e-10;

const rgb = (red: number, green: number, blue: number): OrderedTransportRgb =>
    [red, green, blue];
const addRgb = (
    left: OrderedTransportRgb,
    right: OrderedTransportRgb,
): OrderedTransportRgb => rgb(
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
);
const multiplyRgb = (
    left: OrderedTransportRgb,
    right: OrderedTransportRgb,
): OrderedTransportRgb => rgb(
    left[0] * right[0],
    left[1] * right[1],
    left[2] * right[2],
);
const scaleRgb = (
    value: OrderedTransportRgb,
    scale: number,
): OrderedTransportRgb => rgb(value[0] * scale, value[1] * scale, value[2] * scale);
const maximumRgb = (value: OrderedTransportRgb) =>
    Math.max(value[0], value[1], value[2]);

const assertFiniteRgb = (name: string, value: OrderedTransportRgb) => {
    if (value.length !== 3 || !value.every(Number.isFinite)) {
        throw new Error(`${name} must contain three finite components`);
    }
};

const assertNonnegativeRgb = (name: string, value: OrderedTransportRgb) => {
    assertFiniteRgb(name, value);
    if (value.some((component) => component < 0)) {
        throw new Error(`${name} must be nonnegative`);
    }
};

const normalizeDirection = (
    direction: OrderedTransportRgb,
): OrderedTransportRgb => {
    assertFiniteRgb("ray direction", direction);
    const length = Math.hypot(direction[0], direction[1], direction[2]);
    if (!(length > 0)) throw new Error("ray direction must have nonzero length");
    return rgb(direction[0] / length, direction[1] / length, direction[2] / length);
};

const positionAt = (
    origin: OrderedTransportRgb,
    direction: OrderedTransportRgb,
    distanceKm: number,
): OrderedTransportRgb => addRgb(origin, scaleRgb(direction, distanceKm));

export const orderedTransportIdentity = (): OrderedRgbTransport => ({
    radiance: ZERO,
    transmittance: ONE,
});

/** `front` is closer to the camera than `back`. */
export const composeOrderedRgbTransport = (
    front: OrderedRgbTransport,
    back: OrderedRgbTransport,
): OrderedRgbTransport => ({
    radiance: addRgb(front.radiance,
        multiplyRgb(front.transmittance, back.radiance)),
    transmittance: multiplyRgb(front.transmittance, back.transmittance),
});

export const applyOrderedRgbTransport = (
    transport: OrderedRgbTransport,
    backgroundRadiance: OrderedTransportRgb,
): OrderedTransportRgb => addRgb(
    transport.radiance,
    multiplyRgb(transport.transmittance, backgroundRadiance),
);

const validateTransport = (name: string, transport: OrderedRgbTransport) => {
    assertNonnegativeRgb(`${name} radiance`, transport.radiance);
    assertNonnegativeRgb(`${name} transmittance`, transport.transmittance);
    if (transport.transmittance.some((component) => component > 1 + 1e-7)) {
        throw new Error(`${name} transmittance must not exceed one`);
    }
};

/**
 * Express a physically integrated air-plus-weather operator relative to the
 * atmosphere operator already present in the background texture. Production
 * background radiance has already applied directional cloud-shadow loss, so
 * the local air source used to build this baseline must carry the same loss.
 *
 * If `C` is the coupled transport, `A'` is the rendered atmosphere, and `T_w`
 * is weather-only Beer transmittance, this returns `W` such that
 * `W(A'(B)) = C(B)` for every boundary radiance `B`:
 *
 *     W.L = C.L - T_w * A'.L
 *     W.T = T_w
 *
 * `W.L` is deliberately allowed to be negative. It is a signed relative
 * correction, not a standalone emissive medium. Supplying unshadowed `A` when
 * the compositor uses `A'` would remove `T_w * (A.L - A'.L)` twice.
 */
export const relativeOrderedWeatherTransport = (
    combined: OrderedRgbTransport,
    backgroundAtmosphere: OrderedRgbTransport,
    trackedWeatherTransmittance: OrderedTransportRgb,
): OrderedRgbTransport => {
    validateTransport("combined air-weather transport", combined);
    validateTransport("background-atmosphere transport", backgroundAtmosphere);
    assertNonnegativeRgb(
        "tracked weather transmittance", trackedWeatherTransmittance);
    if (trackedWeatherTransmittance.some((component) => component > 1 + 1e-7)) {
        throw new Error("tracked weather transmittance must not exceed one");
    }
    const transmittance = trackedWeatherTransmittance.map((component) =>
        Math.min(1, component)) as [number, number, number];
    const expectedCombinedTransmittance = multiplyRgb(
        backgroundAtmosphere.transmittance, transmittance);
    if (combined.transmittance.some((component, channel) =>
        Math.abs(component - expectedCombinedTransmittance[channel]) > 1e-7)) {
        throw new Error(
            "combined transmittance must equal background-air times tracked weather",
        );
    }
    return {
        radiance: [0, 1, 2].map((channel) =>
            combined.radiance[channel] -
                transmittance[channel] * backgroundAtmosphere.radiance[channel],
        ) as [number, number, number],
        transmittance,
    };
};

/**
 * Recover the operator on [near, far] from two camera-origin prefix operators.
 * This is useful when the atmosphere implementation exposes prefix LUT values.
 */
export const orderedRelativeTransportFromPrefixes = (
    nearPrefix: OrderedRgbTransport,
    farPrefix: OrderedRgbTransport,
    minimumUsableTransmittance = 1e-6,
): OrderedRgbTransport => {
    validateTransport("near atmosphere prefix", nearPrefix);
    validateTransport("far atmosphere prefix", farPrefix);
    if (!(minimumUsableTransmittance > 0) ||
        !Number.isFinite(minimumUsableTransmittance)) {
        throw new Error("minimum usable transmittance must be finite and positive");
    }
    const radiance = [0, 1, 2].map((channel) => {
        const nearT = nearPrefix.transmittance[channel];
        if (nearT < minimumUsableTransmittance) {
            throw new Error("near atmosphere prefix is too opaque for stable division");
        }
        const difference = farPrefix.radiance[channel] - nearPrefix.radiance[channel];
        if (difference < -1e-7) {
            throw new Error("atmosphere prefix radiance is not monotonically composable");
        }
        return Math.max(0, difference) / nearT;
    }) as [number, number, number];
    const transmittance = [0, 1, 2].map((channel) => {
        const nearT = nearPrefix.transmittance[channel];
        const farT = farPrefix.transmittance[channel];
        if (farT > nearT + 1e-7) {
            throw new Error("atmosphere prefix transmittance must be nonincreasing");
        }
        return Math.min(1, farT / nearT);
    }) as [number, number, number];
    const result = { radiance, transmittance };
    validateTransport("relative atmosphere segment", result);
    return result;
};

interface CombinedVolumeSample {
    readonly extinctionPerKm: OrderedTransportRgb;
    readonly sourcePerKm: OrderedTransportRgb;
}

const validateVolumeSample = (
    name: string,
    sample: OrderedVolumeSample,
): CombinedVolumeSample => {
    const scattering = sample.scatteringPerKm ?? ZERO;
    const incident = sample.scatteredIncidentRadiance ?? ZERO;
    const emission = sample.emissionPerKm ?? ZERO;
    assertNonnegativeRgb(`${name} extinction`, sample.extinctionPerKm);
    assertNonnegativeRgb(`${name} scattering`, scattering);
    assertNonnegativeRgb(`${name} scattered incident radiance`, incident);
    assertNonnegativeRgb(`${name} emission`, emission);
    if (scattering.some((component, channel) =>
        component > sample.extinctionPerKm[channel] + 1e-8)) {
        throw new Error(`${name} scattering must not exceed extinction`);
    }
    return {
        extinctionPerKm: sample.extinctionPerKm,
        sourcePerKm: addRgb(emission, multiplyRgb(scattering, incident)),
    };
};

/** Exact affine solution for one piecewise-homogeneous segment. */
export const integrateOrderedHomogeneousSegment = (
    extinctionPerKm: OrderedTransportRgb,
    sourcePerKm: OrderedTransportRgb,
    lengthKm: number,
): OrderedRgbTransport => {
    assertNonnegativeRgb("homogeneous extinction", extinctionPerKm);
    assertNonnegativeRgb("homogeneous source", sourcePerKm);
    if (!(lengthKm >= 0) || !Number.isFinite(lengthKm)) {
        throw new Error("homogeneous segment length must be finite and nonnegative");
    }
    const transmittance = [0, 1, 2].map((channel) =>
        Math.exp(-extinctionPerKm[channel] * lengthKm),
    ) as [number, number, number];
    const radiance = [0, 1, 2].map((channel) => {
        const extinction = extinctionPerKm[channel];
        const source = sourcePerKm[channel];
        if (extinction <= SAMPLE_EPSILON) return source * lengthKm;
        const removed = -Math.expm1(-extinction * lengthKm);
        return source * removed / extinction;
    }) as [number, number, number];
    return { radiance, transmittance };
};

interface MutableDiagnostics {
    sampleCount: number;
    acceptedStepCount: number;
    refinementCount: number;
    exactAtmosphereSegmentCount: number;
    boundedSpanCount: number;
    maximumAcceptedStepKm: number;
    maximumAcceptedStepOpticalDepth: number;
    maximumNormalizedError: number;
    reachedRefinementLimit: boolean;
}

interface EvaluatedStep {
    readonly transport: OrderedRgbTransport;
    readonly maximumOpticalDepth: number;
}

interface NormalizedOptions {
    readonly originKm: OrderedTransportRgb;
    readonly direction: OrderedTransportRgb;
    readonly nearKm: number;
    readonly farKm: number;
    readonly atmosphere?: OrderedAtmosphereMedium;
    readonly media: readonly OrderedFiniteMedium[];
    readonly maximumStepKm: number;
    readonly minimumStepKm: number;
    readonly maximumStepOpticalDepth: number;
    readonly absoluteTolerance: number;
    readonly relativeTolerance: number;
    readonly maximumRefinementDepth: number;
}

const normalizeOptions = (
    options: OrderedCameraRayIntegrationOptions,
): NormalizedOptions => {
    assertFiniteRgb("ray origin", options.originKm);
    if (!Number.isFinite(options.nearKm) || !Number.isFinite(options.farKm) ||
        options.nearKm < 0 || !(options.farKm > options.nearKm)) {
        throw new Error("camera ray must have a finite positive interval");
    }
    const maximumStepKm = options.maximumStepKm ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultMaximumStepKm;
    const minimumStepKm = options.minimumStepKm ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultMinimumStepKm;
    const maximumStepOpticalDepth = options.maximumStepOpticalDepth ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultMaximumStepOpticalDepth;
    const absoluteTolerance = options.absoluteTolerance ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultAbsoluteTolerance;
    const relativeTolerance = options.relativeTolerance ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultRelativeTolerance;
    const maximumRefinementDepth = options.maximumRefinementDepth ??
        ORDERED_WEATHER_ATMOSPHERE_CONTRACT.defaultMaximumRefinementDepth;
    for (const [name, value] of [
        ["maximum step", maximumStepKm],
        ["minimum step", minimumStepKm],
        ["maximum step optical depth", maximumStepOpticalDepth],
        ["absolute tolerance", absoluteTolerance],
        ["relative tolerance", relativeTolerance],
    ] as const) {
        if (!(value > 0) || !Number.isFinite(value)) {
            throw new Error(`${name} must be finite and positive`);
        }
    }
    if (minimumStepKm > maximumStepKm) {
        throw new Error("minimum step must not exceed maximum step");
    }
    if (!Number.isInteger(maximumRefinementDepth) ||
        maximumRefinementDepth < 0 || maximumRefinementDepth > 24) {
        throw new Error("maximum refinement depth must be an integer in [0, 24]");
    }
    if (options.atmosphere?.maximumStepKm !== undefined &&
        (!(options.atmosphere.maximumStepKm > 0) ||
            !Number.isFinite(options.atmosphere.maximumStepKm))) {
        throw new Error("atmosphere maximum step must be finite and positive");
    }
    const ids = new Set<string>();
    const media = (options.media ?? []).map((medium) => {
        if (!medium.id || ids.has(medium.id)) {
            throw new Error("finite medium ids must be nonempty and unique");
        }
        ids.add(medium.id);
        if (!Number.isFinite(medium.nearKm) || !Number.isFinite(medium.farKm) ||
            !(medium.farKm > medium.nearKm)) {
            throw new Error(`finite medium ${medium.id} must have a positive interval`);
        }
        if (!(medium.maximumStepKm > 0) ||
            !Number.isFinite(medium.maximumStepKm)) {
            throw new Error(`finite medium ${medium.id} maximum step must be positive`);
        }
        return medium;
    });
    const intersectsBoundedMedium = media.some((medium) =>
        medium.farKm > options.nearKm && medium.nearKm < options.farKm);
    if (intersectsBoundedMedium && options.atmosphere?.segmentTransport &&
        !options.atmosphere.sample) {
        throw new Error(
            "local atmosphere samples are required where bounded media overlap air",
        );
    }
    return {
        ...options,
        direction: normalizeDirection(options.direction),
        media,
        maximumStepKm,
        minimumStepKm,
        maximumStepOpticalDepth,
        absoluteTolerance,
        relativeTolerance,
        maximumRefinementDepth,
    };
};

const sampleContext = (
    options: NormalizedOptions,
    distanceKm: number,
    spanNearKm: number,
    spanFarKm: number,
): OrderedRaySampleContext => ({
    distanceKm,
    normalizedDistance: (distanceKm - options.nearKm) /
        (options.farKm - options.nearKm),
    positionKm: positionAt(options.originKm, options.direction, distanceKm),
    direction: options.direction,
    rayNearKm: options.nearKm,
    rayFarKm: options.farKm,
    integrationSpanNearKm: spanNearKm,
    integrationSpanFarKm: spanFarKm,
});

const sampleCombinedMedium = (
    options: NormalizedOptions,
    activeMedia: readonly OrderedFiniteMedium[],
    distanceKm: number,
    spanNearKm: number,
    spanFarKm: number,
    diagnostics: MutableDiagnostics,
): CombinedVolumeSample => {
    const context = sampleContext(options, distanceKm, spanNearKm, spanFarKm);
    let extinction = ZERO;
    let source = ZERO;
    if (options.atmosphere?.sample) {
        const air = validateVolumeSample(
            options.atmosphere.id ?? "atmosphere",
            options.atmosphere.sample(context),
        );
        extinction = addRgb(extinction, air.extinctionPerKm);
        source = addRgb(source, air.sourcePerKm);
    }
    for (const medium of activeMedia) {
        const sampled = validateVolumeSample(medium.id, medium.sample(context));
        extinction = addRgb(extinction, sampled.extinctionPerKm);
        source = addRgb(source, sampled.sourcePerKm);
    }
    diagnostics.sampleCount += 1;
    return { extinctionPerKm: extinction, sourcePerKm: source };
};

const evaluateMidpointStep = (
    options: NormalizedOptions,
    activeMedia: readonly OrderedFiniteMedium[],
    nearKm: number,
    farKm: number,
    diagnostics: MutableDiagnostics,
): EvaluatedStep => {
    const lengthKm = farKm - nearKm;
    const sample = sampleCombinedMedium(
        options, activeMedia, (nearKm + farKm) * 0.5,
        nearKm, farKm, diagnostics,
    );
    return {
        transport: integrateOrderedHomogeneousSegment(
            sample.extinctionPerKm, sample.sourcePerKm, lengthKm),
        maximumOpticalDepth: maximumRgb(sample.extinctionPerKm) * lengthKm,
    };
};

const transportNormalizedError = (
    coarse: OrderedRgbTransport,
    fine: OrderedRgbTransport,
    absoluteTolerance: number,
    relativeTolerance: number,
) => {
    let maximum = 0;
    for (const field of ["radiance", "transmittance"] as const) {
        for (let channel = 0; channel < 3; channel += 1) {
            const left = coarse[field][channel];
            const right = fine[field][channel];
            const scale = Math.max(Math.abs(left), Math.abs(right));
            const tolerance = absoluteTolerance + relativeTolerance * scale;
            maximum = Math.max(maximum, Math.abs(left - right) / tolerance);
        }
    }
    return maximum;
};

const integrateAdaptiveSpan = (
    options: NormalizedOptions,
    activeMedia: readonly OrderedFiniteMedium[],
    nearKm: number,
    farKm: number,
    depth: number,
    diagnostics: MutableDiagnostics,
): OrderedRgbTransport => {
    const midpoint = (nearKm + farKm) * 0.5;
    const coarse = evaluateMidpointStep(
        options, activeMedia, nearKm, farKm, diagnostics);
    const left = evaluateMidpointStep(
        options, activeMedia, nearKm, midpoint, diagnostics);
    const right = evaluateMidpointStep(
        options, activeMedia, midpoint, farKm, diagnostics);
    const fine = composeOrderedRgbTransport(left.transport, right.transport);
    const error = transportNormalizedError(
        coarse.transport, fine,
        options.absoluteTolerance, options.relativeTolerance,
    );
    diagnostics.maximumNormalizedError = Math.max(
        diagnostics.maximumNormalizedError, error);
    const lengthKm = farKm - nearKm;
    const opticalBoundSatisfied = Math.max(
        left.maximumOpticalDepth, right.maximumOpticalDepth,
    ) <= options.maximumStepOpticalDepth;
    const mustStop = lengthKm <= options.minimumStepKm * (1 + 1e-12) ||
        depth >= options.maximumRefinementDepth;
    if ((error <= 1 && opticalBoundSatisfied) || mustStop) {
        if (mustStop && (error > 1 || !opticalBoundSatisfied)) {
            diagnostics.reachedRefinementLimit = true;
        }
        diagnostics.acceptedStepCount += 2;
        diagnostics.maximumAcceptedStepKm = Math.max(
            diagnostics.maximumAcceptedStepKm, lengthKm * 0.5);
        diagnostics.maximumAcceptedStepOpticalDepth = Math.max(
            diagnostics.maximumAcceptedStepOpticalDepth,
            left.maximumOpticalDepth,
            right.maximumOpticalDepth,
        );
        return fine;
    }
    diagnostics.refinementCount += 1;
    return composeOrderedRgbTransport(
        integrateAdaptiveSpan(
            options, activeMedia, nearKm, midpoint, depth + 1, diagnostics),
        integrateAdaptiveSpan(
            options, activeMedia, midpoint, farKm, depth + 1, diagnostics),
    );
};

const exactAtmosphereSpan = (
    options: NormalizedOptions,
    nearKm: number,
    farKm: number,
): OrderedRgbTransport => {
    const callback = options.atmosphere?.segmentTransport;
    if (!callback) return orderedTransportIdentity();
    const transport = callback({
        nearKm,
        farKm,
        startPositionKm: positionAt(options.originKm, options.direction, nearKm),
        endPositionKm: positionAt(options.originKm, options.direction, farKm),
        direction: options.direction,
    });
    validateTransport("exact atmosphere segment", transport);
    return transport;
};

const uniqueSortedBreakpoints = (values: readonly number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const unique: number[] = [];
    for (const value of sorted) {
        if (unique.length === 0 || Math.abs(value - unique[unique.length - 1]) > 1e-10) {
            unique.push(value);
        }
    }
    return unique;
};

/**
 * Integrate one camera ray with all bounded media and clear atmosphere in
 * physical depth order. Finite interval boundaries are exact integration
 * events; adaptive exponential-midpoint marching occurs only inside them.
 */
export const integrateOrderedWeatherAtmosphereRay = (
    input: OrderedCameraRayIntegrationOptions,
): OrderedCameraRayIntegrationResult => {
    const options = normalizeOptions(input);
    const clippedMedia = options.media.filter((medium) =>
        medium.farKm > options.nearKm && medium.nearKm < options.farKm);
    const breakpoints = uniqueSortedBreakpoints([
        options.nearKm,
        options.farKm,
        ...clippedMedia.flatMap((medium) => [
            Math.max(options.nearKm, medium.nearKm),
            Math.min(options.farKm, medium.farKm),
        ]),
    ]);
    const diagnostics: MutableDiagnostics = {
        sampleCount: 0,
        acceptedStepCount: 0,
        refinementCount: 0,
        exactAtmosphereSegmentCount: 0,
        boundedSpanCount: 0,
        maximumAcceptedStepKm: 0,
        maximumAcceptedStepOpticalDepth: 0,
        maximumNormalizedError: 0,
        reachedRefinementLimit: false,
    };
    let result = orderedTransportIdentity();
    for (let boundary = 0; boundary + 1 < breakpoints.length; boundary += 1) {
        const spanNearKm = breakpoints[boundary];
        const spanFarKm = breakpoints[boundary + 1];
        if (spanFarKm <= spanNearKm) continue;
        const midpoint = (spanNearKm + spanFarKm) * 0.5;
        const activeMedia = clippedMedia.filter((medium) =>
            midpoint >= medium.nearKm && midpoint < medium.farKm);
        if (activeMedia.length === 0 && options.atmosphere?.segmentTransport) {
            result = composeOrderedRgbTransport(
                result, exactAtmosphereSpan(options, spanNearKm, spanFarKm));
            diagnostics.exactAtmosphereSegmentCount += 1;
            continue;
        }
        if (activeMedia.length > 0) diagnostics.boundedSpanCount += 1;
        if (activeMedia.length === 0 && !options.atmosphere?.sample) continue;
        const localStepLimit = Math.min(
            options.maximumStepKm,
            options.atmosphere?.maximumStepKm ?? Number.POSITIVE_INFINITY,
            ...activeMedia.map((medium) => medium.maximumStepKm),
        );
        const stepCount = Math.max(1, Math.ceil(
            (spanFarKm - spanNearKm) / localStepLimit));
        const stepKm = (spanFarKm - spanNearKm) / stepCount;
        for (let step = 0; step < stepCount; step += 1) {
            const nearKm = spanNearKm + step * stepKm;
            const farKm = spanNearKm + (step + 1) * stepKm;
            result = composeOrderedRgbTransport(
                result,
                integrateAdaptiveSpan(
                    options, activeMedia, nearKm, farKm, 0, diagnostics),
            );
        }
    }
    validateTransport("ordered camera-ray result", result);
    return { transport: result, diagnostics };
};

/**
 * Scene-linear, renderer-independent weather optical/emissive phenomena.
 *
 * Every evaluator returns either a bounded phase-function replacement or a
 * source term tagged by its physical transport domain. No function applies
 * atmosphere extinction, camera exposure, tone mapping, or screen-space alpha.
 */

export type WeatherVec2 = readonly [number, number];
export type WeatherVec3 = readonly [number, number, number];

export const WEATHER_PHENOMENA_SCHEMA = 1;
export const WEATHER_RGB_WAVELENGTHS_MICRONS = [0.680, 0.550, 0.440] as const;

const PI = Math.PI;
const TAU = PI * 2;
const RGB_LUMINANCE: WeatherVec3 = [0.2126, 0.7152, 0.0722];
const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const saturate = (value: number) => clamp(value, 0, 1);
const smoothstep = (low: number, high: number, value: number) => {
    const t = saturate((value - low) / Math.max(1e-12, high - low));
    return t * t * (3 - 2 * t);
};
const mix = (left: number, right: number, amount: number) =>
    left + (right - left) * amount;
const dot3 = (left: WeatherVec3, right: WeatherVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const length3 = (value: WeatherVec3) => Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value: WeatherVec3): WeatherVec3 => {
    const length = length3(value);
    return length > 1e-12
        ? [value[0] / length, value[1] / length, value[2] / length]
        : [0, 1, 0];
};
const add3 = (left: WeatherVec3, right: WeatherVec3): WeatherVec3 =>
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
const scale3 = (value: WeatherVec3, amount: number): WeatherVec3 =>
    [value[0] * amount, value[1] * amount, value[2] * amount];
const mul3 = (left: WeatherVec3, right: WeatherVec3): WeatherVec3 =>
    [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
const sum3 = (value: WeatherVec3) => value[0] + value[1] + value[2];
const luminance3 = (value: WeatherVec3) => dot3(value, RGB_LUMINANCE);
const radians = (degrees: number) => degrees * PI / 180;
const wrapRadians = (value: number) => {
    let wrapped = (value + PI) % TAU;
    if (wrapped < 0) wrapped += TAU;
    return wrapped - PI;
};

const hashUint = (input: number) => {
    let value = Math.floor(input) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value >>> 0;
};
const hash01 = (seed: number, stream = 0) =>
    hashUint(hashUint(seed) ^ Math.imul(stream + 1, 0x9e3779b9)) / 0x1_0000_0000;
const shaderHash11 = (value: number) =>
    ((Math.sin(value * 127.1) * 43_758.5453123) % 1 + 1) % 1;

/** Stable f32 seed packed for parity with dynamic WGSL evaluators. */
export const weatherPhenomenonShaderSeed = (seed: number) => Math.fround(hash01(seed));

export interface PhenomenonValidity {
    valid: boolean;
    reasons: readonly string[];
}

export type FinitePhenomenonOwnerKind =
    | "rain-shaft"
    | "fog-bank"
    | "liquid-cloud"
    | "ice-cloud"
    | "diamond-dust-region"
    | "convective-cloud"
    | "boundary-layer-region"
    | "magnetospheric-sheet";

export interface FinitePhenomenonOwner {
    id: string;
    kind: FinitePhenomenonOwnerKind;
    /** The authoritative cloud/hydrometeor/region field must have finite support. */
    finite: boolean;
    bottomAltitudeKm: number;
    topAltitudeKm: number;
    opticalDepth: number;
    temperatureKelvin: number;
}

const validateFiniteOwner = (owner: FinitePhenomenonOwner) => {
    const reasons: string[] = [];
    if (!owner.id) reasons.push("missing-owner-id");
    if (!owner.finite) reasons.push("owner-must-have-finite-world-support");
    if (!(owner.topAltitudeKm > owner.bottomAltitudeKm)) {
        reasons.push("owner-altitude-interval-is-empty");
    }
    if (!(owner.opticalDepth >= 0)) reasons.push("owner-optical-depth-is-negative");
    if (!(owner.temperatureKelvin > 0) || !Number.isFinite(owner.temperatureKelvin)) {
        reasons.push("owner-temperature-is-invalid");
    }
    return reasons;
};

/**
 * One directional light evaluated at a world-space scattering point.
 *
 * `radianceBeforeAtmosphereRgb` is the source-side scene-linear radiance.
 * The two multiplicative visibility terms are deliberately explicit so a
 * halo/rainbow cannot accidentally bypass atmosphere extinction or cloud/
 * terrain shadowing. Camera-path transmittance is not included here; the
 * ordered marcher applies it once after this local source is assembled.
 */
export interface WeatherDirectionalRadianceAtSample {
    id: string;
    kind: "sun" | "moon" | "lightning" | "artificial";
    /** Unit vector from the scattering sample toward the source. */
    directionToSource: WeatherVec3;
    radianceBeforeAtmosphereRgb: WeatherVec3;
    atmosphereTransmittanceToSampleRgb: WeatherVec3;
    sourceVisibilityRgb: WeatherVec3;
}

/** Exact finite-owner input consumed by directional phase replacements. */
export interface WeatherFiniteOwnerScatteringSample {
    ownerId: string;
    positionEastAltitudeNorthKm: WeatherVec3;
    /** Fractional membership supplied by the authoritative finite owner field. */
    ownerSampleWeight: number;
    scatteringCoefficientRgbPerKm: WeatherVec3;
    /** A normalized broad phase function, in sr^-1. */
    basePhaseRgbPerSteradian: WeatherVec3;
}

/**
 * Local source coefficient for one ordered participating-medium step.
 * Neither camera-path transmittance nor post-process bloom has been applied.
 */
export interface WeatherOrderedDirectionalScatteringSource {
    ownerId: string;
    sourceId: string;
    enabled: boolean;
    inactiveReason?:
        | "invalid-state"
        | "owner-mismatch"
        | "outside-owner-altitude"
        | "empty-owner-sample"
        | "source-direction-mismatch";
    incidentRadianceAtSampleRgb: WeatherVec3;
    retainedBasePhaseRgbPerSteradian: WeatherVec3;
    replacementPhaseRgbPerSteradian: WeatherVec3;
    combinedPhaseRgbPerSteradian: WeatherVec3;
    /** sigma_s * phase * L_i, suitable for the shared ordered source sum. */
    sourceCoefficientRgbPerKmPerSteradian: WeatherVec3;
    cameraPathTransmittanceApplied: false;
    bloomApplied: false;
}

const ZERO_RGB: WeatherVec3 = [0, 0, 0];

const inactiveOrderedDirectionalSource = (
    ownerId: string,
    sourceId: string,
    reason: NonNullable<WeatherOrderedDirectionalScatteringSource["inactiveReason"]>,
): WeatherOrderedDirectionalScatteringSource => ({
    ownerId,
    sourceId,
    enabled: false,
    inactiveReason: reason,
    incidentRadianceAtSampleRgb: ZERO_RGB,
    retainedBasePhaseRgbPerSteradian: ZERO_RGB,
    replacementPhaseRgbPerSteradian: ZERO_RGB,
    combinedPhaseRgbPerSteradian: ZERO_RGB,
    sourceCoefficientRgbPerKmPerSteradian: ZERO_RGB,
    cameraPathTransmittanceApplied: false,
    bloomApplied: false,
});

const evaluateOrderedPhaseReplacement = (
    owner: FinitePhenomenonOwner,
    source: WeatherDirectionalRadianceAtSample,
    sample: WeatherFiniteOwnerScatteringSample,
    replacementPhaseRgbPerSteradian: WeatherVec3,
    replacementEnergyRgb: WeatherVec3,
): WeatherOrderedDirectionalScatteringSource => {
    if (sample.ownerId !== owner.id) {
        return inactiveOrderedDirectionalSource(owner.id, source.id, "owner-mismatch");
    }
    if (sample.positionEastAltitudeNorthKm[1] < owner.bottomAltitudeKm ||
        sample.positionEastAltitudeNorthKm[1] > owner.topAltitudeKm) {
        return inactiveOrderedDirectionalSource(
            owner.id, source.id, "outside-owner-altitude");
    }
    const membership = saturate(sample.ownerSampleWeight);
    if (membership <= 0 ||
        sample.scatteringCoefficientRgbPerKm.every((value) => !(value > 0))) {
        return inactiveOrderedDirectionalSource(owner.id, source.id, "empty-owner-sample");
    }
    const incidentRadianceAtSampleRgb = mul3(
        mul3(
            sampleNonNegativeRgb(source.radianceBeforeAtmosphereRgb),
            sampleUnitRgb(source.atmosphereTransmittanceToSampleRgb),
        ),
        sampleUnitRgb(source.sourceVisibilityRgb),
    );
    const effectiveReplacementEnergy = scale3(
        sampleUnitRgb(replacementEnergyRgb), membership);
    const retainedBasePhaseRgbPerSteradian = mul3(
        sampleNonNegativeRgb(sample.basePhaseRgbPerSteradian),
        effectiveReplacementEnergy.map((value) => 1 - value) as
            unknown as WeatherVec3,
    );
    const replacementPhase = scale3(
        sampleNonNegativeRgb(replacementPhaseRgbPerSteradian), membership);
    const combinedPhaseRgbPerSteradian = add3(
        retainedBasePhaseRgbPerSteradian,
        replacementPhase,
    );
    const sourceCoefficientRgbPerKmPerSteradian = mul3(
        sampleNonNegativeRgb(sample.scatteringCoefficientRgbPerKm),
        mul3(incidentRadianceAtSampleRgb, combinedPhaseRgbPerSteradian),
    );
    return {
        ownerId: owner.id,
        sourceId: source.id,
        enabled: true,
        incidentRadianceAtSampleRgb,
        retainedBasePhaseRgbPerSteradian,
        replacementPhaseRgbPerSteradian: replacementPhase,
        combinedPhaseRgbPerSteradian,
        sourceCoefficientRgbPerKmPerSteradian,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
};

function sampleNonNegativeRgb(value: WeatherVec3): WeatherVec3 {
    return value.map((channel) => Math.max(0,
        Number.isFinite(channel) ? channel : 0)) as unknown as WeatherVec3;
}

function sampleUnitRgb(value: WeatherVec3): WeatherVec3 {
    return value.map(saturate) as unknown as WeatherVec3;
}

// ---------------------------------------------------------------------------
// Liquid-droplet bows, glory and corona
// ---------------------------------------------------------------------------

export type DropletOpticalFeature =
    | "primary-rainbow"
    | "secondary-rainbow"
    | "fogbow"
    | "glory"
    | "corona";

export interface DropletSizeDistribution {
    effectiveRadiusMicrons: number;
    /** Hansen effective variance. Narrow cloud spectra are about 0.05–0.15. */
    effectiveVariance: number;
    minimumRadiusMicrons: number;
    maximumRadiusMicrons: number;
}

export interface SpectralAngularLobe {
    id: string;
    centerRadiansRgb: WeatherVec3;
    sigmaRadiansRgb: WeatherVec3;
    /** Fraction of total scattering energy replaced by this lobe. */
    energyRgb: WeatherVec3;
    /** Integral of the unnormalized kernel over 4π, one value per channel. */
    normalizationRgb: WeatherVec3;
}

export interface SpectralCoronaState {
    effectiveRadiusMicrons: number;
    effectiveVariance: number;
    energyRgb: WeatherVec3;
    normalizationRgb: WeatherVec3;
}

export interface DropletOpticalPhenomenonState {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    owner: FinitePhenomenonOwner;
    distribution: DropletSizeDistribution;
    requestedFeatures: readonly DropletOpticalFeature[];
    enabledFeatures: readonly DropletOpticalFeature[];
    lobes: readonly SpectralAngularLobe[];
    corona?: SpectralCoronaState;
    /** Remove this fraction of the broad base phase before adding replacement. */
    replacementEnergyRgb: WeatherVec3;
    validity: PhenomenonValidity;
    seed: number;
}

export interface DropletOpticalPhenomenonInput {
    owner: FinitePhenomenonOwner;
    effectiveRadiusMicrons: number;
    effectiveVariance: number;
    seed: number;
    requestedFeatures?: readonly DropletOpticalFeature[];
}

const angularGaussian = (theta: number, center: number, sigma: number) =>
    Math.exp(-0.5 * ((theta - center) / Math.max(1e-7, sigma)) ** 2);

const integrateAxisymmetricKernel = (
    evaluator: (theta: number) => number,
    samples = 8_192,
) => {
    let integral = 0;
    for (let index = 0; index < samples; index += 1) {
        const theta = PI * (index + 0.5) / samples;
        integral += evaluator(theta) * Math.sin(theta);
    }
    return Math.max(1e-12, integral * PI / samples * TAU);
};

const createSpectralAngularLobe = (
    id: string,
    centerRadiansRgb: WeatherVec3,
    sigmaRadiansRgb: WeatherVec3,
    energyRgb: WeatherVec3,
): SpectralAngularLobe => ({
    id,
    centerRadiansRgb,
    sigmaRadiansRgb,
    energyRgb,
    normalizationRgb: centerRadiansRgb.map((center, channel) =>
        integrateAxisymmetricKernel((theta) => angularGaussian(
            theta,
            center,
            sigmaRadiansRgb[channel],
        ))) as unknown as WeatherVec3,
});

const besselJ1 = (input: number) => {
    const sign = input < 0 ? -1 : 1;
    const x = Math.abs(input);
    if (x < 10) {
        const half = x * 0.5;
        let term = half;
        let result = term;
        for (let order = 1; order < 18; order += 1) {
            term *= -(half * half) / (order * (order + 1));
            result += term;
        }
        return result * sign;
    }
    return sign * Math.sqrt(2 / (PI * x)) *
        (Math.cos(x - PI * 0.75) - 3 / (8 * x) * Math.sin(x - PI * 0.75));
};

const coronaKernel = (
    theta: number,
    effectiveRadiusMicrons: number,
    effectiveVariance: number,
    wavelengthMicrons: number,
) => {
    const x = 2 * TAU * effectiveRadiusMicrons / wavelengthMicrons *
        Math.sin(theta * 0.5);
    const airy = Math.abs(x) < 1e-5 ? 1 : (2 * besselJ1(x) / x) ** 2;
    // A finite Hansen distribution preserves the central aureole while damping
    // high-order monochromatic rings that would not survive real size spread.
    const polydisperseDamping = Math.exp(-clamp(effectiveVariance, 0.01, 0.35) * x * 0.16);
    return airy * polydisperseDamping;
};

const automaticDropletFeatures = (
    owner: FinitePhenomenonOwner,
    radius: number,
): DropletOpticalFeature[] => {
    if (owner.kind === "rain-shaft" && radius >= 80) {
        return ["primary-rainbow", "secondary-rainbow"];
    }
    if ((owner.kind === "fog-bank" || owner.kind === "liquid-cloud") && radius <= 35) {
        return owner.kind === "fog-bank"
            ? ["fogbow", "glory"]
            : ["fogbow", "glory", "corona"];
    }
    return owner.kind === "liquid-cloud" ? ["corona"] : [];
};

export const createDropletOpticalPhenomenonState = ({
    owner,
    effectiveRadiusMicrons,
    effectiveVariance,
    seed,
    requestedFeatures,
}: DropletOpticalPhenomenonInput): DropletOpticalPhenomenonState => {
    const reasons = validateFiniteOwner(owner);
    const radius = clamp(effectiveRadiusMicrons, 1.5, 2_500);
    const variance = clamp(effectiveVariance, 0.01, 0.35);
    if (owner.opticalDepth <= 0) reasons.push("droplet-owner-has-no-optical-depth");
    if (owner.temperatureKelvin < 230 || owner.temperatureKelvin > 323) {
        reasons.push("liquid-droplet-owner-temperature-is-implausible");
    }
    const requested = [...(requestedFeatures ?? automaticDropletFeatures(owner, radius))];
    const enabled: DropletOpticalFeature[] = [];
    for (const feature of requested) {
        if ((feature === "primary-rainbow" || feature === "secondary-rainbow") &&
            (owner.kind !== "rain-shaft" || radius < 80)) {
            reasons.push(`${feature}-requires-finite-rain-with-large-drops`);
            continue;
        }
        if (feature === "fogbow" && (
            !(owner.kind === "fog-bank" || owner.kind === "liquid-cloud") ||
            radius > 45
        )) {
            reasons.push("fogbow-requires-small-liquid-droplets");
            continue;
        }
        if (feature === "glory" &&
            !(["fog-bank", "liquid-cloud"] as const).includes(
                owner.kind as "fog-bank" | "liquid-cloud")) {
            reasons.push("glory-requires-liquid-cloud-or-fog-owner");
            continue;
        }
        if (feature === "glory" && radius > 45) {
            reasons.push("glory-requires-small-liquid-droplets");
            continue;
        }
        if (feature === "corona" && owner.kind !== "liquid-cloud") {
            reasons.push("corona-requires-thin-liquid-cloud-owner");
            continue;
        }
        if (feature === "corona" && radius > 55) {
            reasons.push("corona-requires-cloud-sized-liquid-droplets");
            continue;
        }
        if (feature === "corona" && owner.opticalDepth > 4) {
            reasons.push("corona-obscured-by-excessive-optical-depth");
            continue;
        }
        if (!enabled.includes(feature)) enabled.push(feature);
    }
    if (enabled.length === 0 && reasons.length === 0) {
        reasons.push("no-droplet-optical-feature-is-supported");
    }

    // Water's refractive index varies slightly with temperature. Keep the
    // resulting angular shift small and state-derived rather than introducing
    // an unphysical per-day random displacement.
    const temperatureAngleShiftDegrees = clamp(
        (273.15 - owner.temperatureKelvin) * 0.0015, -0.06, 0.06);
    const lobes: SpectralAngularLobe[] = [];
    if (enabled.includes("primary-rainbow")) {
        const width = radians(0.42 + variance * 8 + 55 / radius);
        lobes.push(createSpectralAngularLobe(
            "primary-rainbow",
            [137.55, 138.55, 139.55].map((value) =>
                radians(value + temperatureAngleShiftDegrees)) as unknown as WeatherVec3,
            [width * 0.92, width, width * 1.08],
            [0.060, 0.064, 0.069],
        ));
    }
    if (enabled.includes("secondary-rainbow")) {
        const width = radians(0.72 + variance * 10 + 85 / radius);
        lobes.push(createSpectralAngularLobe(
            "secondary-rainbow",
            [129.6, 127.9, 126.35].map((value) =>
                radians(value - temperatureAngleShiftDegrees)) as unknown as WeatherVec3,
            [width * 0.94, width, width * 1.10],
            [0.020, 0.023, 0.027],
        ));
    }
    if (enabled.includes("fogbow")) {
        const width = radians(clamp(2.8 + 54 / radius + variance * 18, 4, 18));
        const colorSeparationDegrees = clamp((radius - 4) / 180, 0, 0.18);
        lobes.push(createSpectralAngularLobe(
            "fogbow",
            [139 - colorSeparationDegrees, 139, 139 + colorSeparationDegrees]
                .map(radians) as unknown as WeatherVec3,
            [width, width * 1.04, width * 1.08],
            [0.070, 0.073, 0.075],
        ));
    }
    if (enabled.includes("glory")) {
        const ringRadius = WEATHER_RGB_WAVELENGTHS_MICRONS.map((wavelength) =>
            clamp(2.15 * wavelength / radius, radians(1.4), radians(18))) as
            unknown as WeatherVec3;
        const width = ringRadius.map((value) =>
            clamp(value * (0.19 + variance * 0.8), radians(0.18), radians(3))) as
            unknown as WeatherVec3;
        lobes.push(createSpectralAngularLobe(
            "glory-inner",
            ringRadius.map((value) => PI - value) as unknown as WeatherVec3,
            width,
            [0.021, 0.024, 0.029],
        ));
        lobes.push(createSpectralAngularLobe(
            "glory-outer",
            ringRadius.map((value) => PI - value * 1.82) as unknown as WeatherVec3,
            width.map((value) => value * 1.35) as unknown as WeatherVec3,
            [0.008, 0.010, 0.013],
        ));
    }
    let corona: SpectralCoronaState | undefined;
    if (enabled.includes("corona")) {
        const energyRgb: WeatherVec3 = [0.105, 0.115, 0.128];
        corona = {
            effectiveRadiusMicrons: radius,
            effectiveVariance: variance,
            energyRgb,
            normalizationRgb: WEATHER_RGB_WAVELENGTHS_MICRONS.map((wavelength) =>
                integrateAxisymmetricKernel((theta) => coronaKernel(
                    theta,
                    radius,
                    variance,
                    wavelength,
                ), 16_384)) as unknown as WeatherVec3,
        };
    }
    const replacementEnergyRgb = [0, 1, 2].map((channel) => clamp(
        lobes.reduce((total, lobe) => total + lobe.energyRgb[channel], 0) +
            (corona?.energyRgb[channel] ?? 0),
        0,
        0.38,
    )) as unknown as WeatherVec3;
    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        owner,
        distribution: {
            effectiveRadiusMicrons: radius,
            effectiveVariance: variance,
            minimumRadiusMicrons: radius * clamp(0.18 - variance * 0.1, 0.08, 0.22),
            maximumRadiusMicrons: radius * clamp(3.2 + variance * 8, 3, 6),
        },
        requestedFeatures: requested,
        enabledFeatures: enabled,
        lobes,
        corona,
        replacementEnergyRgb,
        validity: { valid: reasons.length === 0 && enabled.length > 0, reasons },
        seed,
    };
};

export const evaluateSpectralAngularLobe = (
    lobe: SpectralAngularLobe,
    scatteringAngleRadians: number,
): WeatherVec3 => [0, 1, 2].map((channel) =>
    lobe.energyRgb[channel] * angularGaussian(
        scatteringAngleRadians,
        lobe.centerRadiansRgb[channel],
        lobe.sigmaRadiansRgb[channel],
    ) / Math.max(1e-12, lobe.normalizationRgb[channel])) as unknown as WeatherVec3;

export const evaluateDropletPhaseReplacement = (
    state: DropletOpticalPhenomenonState,
    sourceDirection: WeatherVec3,
    viewDirection: WeatherVec3,
    /** Authoritative cloud/hydrometeor density or scattering weight. */
    ownerSampleWeight = 1,
): WeatherVec3 => {
    if (!state.validity.valid || ownerSampleWeight <= 0) return [0, 0, 0];
    const theta = Math.acos(clamp(
        dot3(normalize3(sourceDirection), normalize3(viewDirection)), -1, 1));
    let phase: WeatherVec3 = [0, 0, 0];
    for (const lobe of state.lobes) phase = add3(phase,
        evaluateSpectralAngularLobe(lobe, theta));
    if (state.corona) {
        const corona = state.corona;
        phase = add3(phase, [0, 1, 2].map((channel) =>
            corona.energyRgb[channel] * coronaKernel(
                theta,
                corona.effectiveRadiusMicrons,
                corona.effectiveVariance,
                WEATHER_RGB_WAVELENGTHS_MICRONS[channel],
            ) / Math.max(1e-12, corona.normalizationRgb[channel])) as
            unknown as WeatherVec3);
    }
    return scale3(phase, saturate(ownerSampleWeight));
};

export interface DropletOrderedScatteringInput {
    source: WeatherDirectionalRadianceAtSample;
    sample: WeatherFiniteOwnerScatteringSample;
    /** Unit vector from the scattering sample toward the camera. */
    viewDirectionToCamera: WeatherVec3;
}

/**
 * Conservatively replaces broad droplet phase energy and produces the exact
 * local coefficient expected by the ordered cloud/weather marcher.
 */
export const evaluateDropletOrderedScatteringSource = (
    state: DropletOpticalPhenomenonState,
    input: DropletOrderedScatteringInput,
): WeatherOrderedDirectionalScatteringSource => {
    if (!state.validity.valid) {
        return inactiveOrderedDirectionalSource(
            state.owner.id, input.source.id, "invalid-state");
    }
    const replacement = evaluateDropletPhaseReplacement(
        state,
        input.source.directionToSource,
        input.viewDirectionToCamera,
        1,
    );
    return evaluateOrderedPhaseReplacement(
        state.owner,
        input.source,
        input.sample,
        replacement,
        state.replacementEnergyRgb,
    );
};

// ---------------------------------------------------------------------------
// Oriented ice crystals: rings, arcs, pillars and specular glints
// ---------------------------------------------------------------------------

export type IceOpticalFeature =
    | "halo-22"
    | "halo-46"
    | "sundogs"
    | "circumzenithal-arc"
    | "light-pillar"
    | "diamond-dust-glints";

export interface IceHabitOrientationDistribution {
    plateFraction: number;
    columnFraction: number;
    aggregateFraction: number;
    randomOrientationFraction: number;
    horizontalPlateFraction: number;
    horizontalColumnFraction: number;
    tiltStandardDeviationRadians: number;
    surfaceRoughness: number;
    effectiveRadiusMicrons: number;
    /** Effective variance of the physical ice-size population. */
    effectiveVariance: number;
    minimumRadiusMicrons: number;
    maximumRadiusMicrons: number;
}

export interface OrientedIceFeatureState {
    kind: IceOpticalFeature;
    energyRgb: WeatherVec3;
    normalizationRgb: WeatherVec3;
    spectralAngleRadiansRgb: WeatherVec3;
    angularWidthRadians: number;
    secondaryWidthRadians: number;
}

export interface OrientedIcePhenomenonState {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    owner: FinitePhenomenonOwner;
    sourceDirection: WeatherVec3;
    localUpDirection: WeatherVec3;
    sourceElevationRadians: number;
    distribution: IceHabitOrientationDistribution;
    requestedFeatures: readonly IceOpticalFeature[];
    enabledFeatures: readonly IceOpticalFeature[];
    features: readonly OrientedIceFeatureState[];
    replacementEnergyRgb: WeatherVec3;
    validity: PhenomenonValidity;
    seed: number;
}

export interface OrientedIcePhenomenonInput {
    owner: FinitePhenomenonOwner;
    sourceDirection: WeatherVec3;
    localUpDirection?: WeatherVec3;
    plateFraction: number;
    columnFraction: number;
    aggregateFraction?: number;
    randomOrientationFraction: number;
    horizontalPlateFraction: number;
    horizontalColumnFraction?: number;
    tiltStandardDeviationDegrees: number;
    surfaceRoughness: number;
    effectiveRadiusMicrons: number;
    /** Optional measured size variance; otherwise inferred from habit mixture. */
    effectiveVariance?: number;
    requestedFeatures?: readonly IceOpticalFeature[];
    seed: number;
}

const directionAzimuthElevation = (
    directionInput: WeatherVec3,
    upInput: WeatherVec3,
) => {
    // Production uses east/up/north, and this evaluator intentionally requires
    // the corresponding local up. The tangent reference is deterministic.
    const direction = normalize3(directionInput);
    const up = normalize3(upInput);
    const elevation = Math.asin(clamp(dot3(direction, up), -1, 1));
    const horizontal: WeatherVec3 = [
        direction[0] - up[0] * Math.sin(elevation),
        direction[1] - up[1] * Math.sin(elevation),
        direction[2] - up[2] * Math.sin(elevation),
    ];
    const horizontalNormalized = normalize3(horizontal);
    // This explicit east/up/north azimuth is used by the shared sky camera.
    const azimuth = Math.atan2(horizontalNormalized[0], horizontalNormalized[2]);
    return { azimuth, elevation };
};

const iceFeatureRaw = (
    kind: IceOpticalFeature,
    channel: number,
    feature: Omit<OrientedIceFeatureState, "normalizationRgb">,
    sourceDirection: WeatherVec3,
    viewDirection: WeatherVec3,
    up: WeatherVec3,
    sourceElevation: number,
    tiltSigma: number,
) => {
    const source = directionAzimuthElevation(sourceDirection, up);
    const view = directionAzimuthElevation(viewDirection, up);
    const separation = Math.acos(clamp(
        dot3(normalize3(sourceDirection), normalize3(viewDirection)), -1, 1));
    const azimuthDelta = wrapRadians(view.azimuth - source.azimuth);
    const spectralAngle = feature.spectralAngleRadiansRgb[channel];
    if (kind === "halo-22" || kind === "halo-46") {
        return angularGaussian(separation, spectralAngle,
            feature.angularWidthRadians);
    }
    if (kind === "sundogs") {
        const targetAzimuth = spectralAngle /
            Math.max(0.34, Math.cos(sourceElevation));
        const azimuthError = Math.abs(Math.abs(azimuthDelta) - targetAzimuth);
        return Math.exp(-0.5 * (azimuthError / feature.angularWidthRadians) ** 2 -
            0.5 * ((view.elevation - sourceElevation) /
                feature.secondaryWidthRadians) ** 2);
    }
    if (kind === "circumzenithal-arc") {
        const refractiveIndex = [1.306, 1.311, 1.317][channel];
        const targetSine = Math.sqrt(Math.max(0,
            refractiveIndex * refractiveIndex - Math.cos(sourceElevation) ** 2));
        if (targetSine > 1 || sourceElevation < 0 || sourceElevation > radians(32.3)) {
            return 0;
        }
        const targetElevation = Math.asin(targetSine);
        return Math.exp(-0.5 * ((view.elevation - targetElevation) /
                feature.angularWidthRadians) ** 2 -
            0.5 * (azimuthDelta / feature.secondaryWidthRadians) ** 2);
    }
    if (kind === "light-pillar") {
        const vertical = Math.exp(-Math.abs(view.elevation - sourceElevation) /
            feature.secondaryWidthRadians);
        const azimuth = Math.exp(-0.5 *
            (azimuthDelta / feature.angularWidthRadians) ** 2);
        return vertical * azimuth;
    }
    // A Beckmann microfacet normal distribution for nearly horizontal plates.
    const sourceVector = normalize3(sourceDirection);
    const viewVector = normalize3(viewDirection);
    const halfSum = add3(sourceVector, viewVector);
    if (length3(halfSum) < 1e-6) return 0;
    const half = normalize3(halfSum);
    const cosine = Math.max(1e-5, dot3(half, normalize3(up)));
    const tangentSquared = Math.max(0, 1 - cosine * cosine) / (cosine * cosine);
    const alpha = clamp(Math.max(tiltSigma, radians(0.12)), radians(0.12), radians(12));
    return Math.exp(-tangentSquared / (alpha * alpha)) /
        (PI * alpha * alpha * cosine ** 4);
};

const normalizeDirectionalIceFeature = (
    feature: Omit<OrientedIceFeatureState, "normalizationRgb">,
    sourceDirection: WeatherVec3,
    up: WeatherVec3,
    sourceElevation: number,
    tiltSigma: number,
): WeatherVec3 => [0, 1, 2].map((channel) => {
    if (feature.kind === "halo-22" || feature.kind === "halo-46") {
        return integrateAxisymmetricKernel((theta) => angularGaussian(
            theta,
            feature.spectralAngleRadiansRgb[channel],
            feature.angularWidthRadians,
        ));
    }
    if (feature.kind === "sundogs") {
        // Two non-overlapping local Gaussian patches at ± the refracted azimuth.
        return Math.max(1e-10, 4 * PI * feature.angularWidthRadians *
            feature.secondaryWidthRadians * Math.max(0.05, Math.cos(sourceElevation)));
    }
    if (feature.kind === "circumzenithal-arc") {
        const refractiveIndex = [1.306, 1.311, 1.317][channel];
        const targetSine = Math.sqrt(Math.max(0,
            refractiveIndex * refractiveIndex - Math.cos(sourceElevation) ** 2));
        if (targetSine > 1) return 1;
        const targetElevation = Math.asin(targetSine);
        return Math.max(1e-10, 2 * PI * feature.angularWidthRadians *
            feature.secondaryWidthRadians * Math.max(0.015, Math.cos(targetElevation)));
    }
    if (feature.kind === "light-pillar") {
        const samples = 8_192;
        let elevationIntegral = 0;
        for (let index = 0; index < samples; index += 1) {
            const elevation = -PI * 0.5 + PI * (index + 0.5) / samples;
            elevationIntegral += Math.exp(-Math.abs(elevation - sourceElevation) /
                feature.secondaryWidthRadians) * Math.cos(elevation);
        }
        elevationIntegral *= PI / samples;
        return Math.max(1e-10,
            Math.sqrt(2 * PI) * feature.angularWidthRadians * elevationIntegral);
    }
    // Beckmann NDF is normalized over microfacet normals. Reflection maps a
    // normal differential to approximately 4 |v·h| outgoing solid angle.
    return Math.max(1e-10, 4 * Math.max(0.02, Math.sin(Math.max(0, sourceElevation))));
}) as unknown as WeatherVec3;

const automaticIceFeatures = (
    owner: FinitePhenomenonOwner,
    sourceElevation: number,
    input: OrientedIcePhenomenonInput,
): IceOpticalFeature[] => {
    const result: IceOpticalFeature[] = [];
    if (input.randomOrientationFraction > 0.12) result.push("halo-22");
    if (input.randomOrientationFraction > 0.3 && input.surfaceRoughness < 0.35) {
        result.push("halo-46");
    }
    if (input.horizontalPlateFraction > 0.12 && sourceElevation < radians(42)) {
        result.push("sundogs");
    }
    if (input.horizontalPlateFraction > 0.18 && sourceElevation >= 0 &&
        sourceElevation < radians(32.3)) result.push("circumzenithal-arc");
    if (input.horizontalPlateFraction > 0.12 && sourceElevation < radians(16)) {
        result.push("light-pillar");
    }
    if (owner.kind === "diamond-dust-region") result.push("diamond-dust-glints");
    return result;
};

export const createOrientedIcePhenomenonState = (
    input: OrientedIcePhenomenonInput,
): OrientedIcePhenomenonState => {
    const reasons = validateFiniteOwner(input.owner);
    const up = normalize3(input.localUpDirection ?? [0, 1, 0]);
    const source = normalize3(input.sourceDirection);
    const sourceElevation = Math.asin(clamp(dot3(source, up), -1, 1));
    const tiltSigma = radians(clamp(input.tiltStandardDeviationDegrees, 0.08, 25));
    const effectiveRadiusMicrons = clamp(input.effectiveRadiusMicrons, 5, 1_000);
    const inferredVariance = 0.035 +
        saturate(input.aggregateFraction ?? 0) * 0.18 +
        saturate(input.surfaceRoughness) * 0.11;
    const effectiveVariance = clamp(input.effectiveVariance ?? inferredVariance,
        0.015, 0.35);
    const distribution: IceHabitOrientationDistribution = {
        plateFraction: saturate(input.plateFraction),
        columnFraction: saturate(input.columnFraction),
        aggregateFraction: saturate(input.aggregateFraction ??
            Math.max(0, 1 - input.plateFraction - input.columnFraction)),
        randomOrientationFraction: saturate(input.randomOrientationFraction),
        horizontalPlateFraction: saturate(input.horizontalPlateFraction),
        horizontalColumnFraction: saturate(input.horizontalColumnFraction ?? 0),
        tiltStandardDeviationRadians: tiltSigma,
        surfaceRoughness: saturate(input.surfaceRoughness),
        effectiveRadiusMicrons,
        effectiveVariance,
        minimumRadiusMicrons: effectiveRadiusMicrons * clamp(
            0.2 - effectiveVariance * 0.22, 0.08, 0.24),
        maximumRadiusMicrons: effectiveRadiusMicrons * clamp(
            2.8 + effectiveVariance * 7, 2.8, 5.25),
    };
    if (!(input.owner.kind === "ice-cloud" ||
        input.owner.kind === "diamond-dust-region")) {
        reasons.push("oriented-ice-optics-require-ice-owner");
    }
    if (input.owner.temperatureKelvin > 269) {
        reasons.push("ice-owner-is-too-warm");
    }
    if (input.owner.opticalDepth <= 0) reasons.push("ice-owner-has-no-optical-depth");
    const habitPopulation = distribution.plateFraction + distribution.columnFraction +
        distribution.aggregateFraction;
    const orientationPopulation = distribution.randomOrientationFraction +
        distribution.horizontalPlateFraction + distribution.horizontalColumnFraction;
    if (habitPopulation > 1.02) reasons.push("ice-habit-fractions-exceed-population");
    if (orientationPopulation > 1.02) {
        reasons.push("ice-orientation-fractions-exceed-population");
    }
    if (distribution.horizontalPlateFraction > distribution.plateFraction + 1e-6) {
        reasons.push("horizontal-plate-fraction-exceeds-plate-population");
    }
    if (distribution.horizontalColumnFraction > distribution.columnFraction + 1e-6) {
        reasons.push("horizontal-column-fraction-exceeds-column-population");
    }
    if (sum3([
        distribution.plateFraction,
        distribution.columnFraction,
        distribution.aggregateFraction,
    ]) < 0.25) reasons.push("ice-habit-population-is-empty");
    const requested = [...(input.requestedFeatures ?? automaticIceFeatures(
        input.owner, sourceElevation, input))];
    const enabled: IceOpticalFeature[] = [];
    for (const feature of requested) {
        let valid = true;
        if ((feature === "sundogs" || feature === "circumzenithal-arc" ||
            feature === "light-pillar") && distribution.horizontalPlateFraction < 0.08) {
            reasons.push(`${feature}-requires-horizontal-plates`);
            valid = false;
        }
        if (feature === "circumzenithal-arc" &&
            (sourceElevation < 0 || sourceElevation > radians(32.3))) {
            reasons.push("circumzenithal-arc-source-elevation-invalid");
            valid = false;
        }
        if (feature === "diamond-dust-glints" &&
            input.owner.kind !== "diamond-dust-region") {
            reasons.push("diamond-dust-glints-require-boundary-layer-diamond-dust");
            valid = false;
        }
        if ((feature === "halo-22" || feature === "halo-46") &&
            distribution.randomOrientationFraction < 0.05) {
            reasons.push(`${feature}-requires-random-orientation-population`);
            valid = false;
        }
        if (valid && !enabled.includes(feature)) enabled.push(feature);
    }

    const sizeCoherence = Math.exp(-1.15 * distribution.effectiveVariance);
    const sizeBroadeningDegrees = clamp(
        distribution.effectiveVariance * 1.6, 0.025, 0.56);
    const haloSurvival = (1 - distribution.surfaceRoughness) ** 2 *
        sizeCoherence *
        smoothstep(0.02, 0.28, input.owner.opticalDepth) *
        (1 - smoothstep(2.2, 5, input.owner.opticalDepth));
    const definitions: Omit<OrientedIceFeatureState, "normalizationRgb">[] = [];
    const addFeature = (
        kind: IceOpticalFeature,
        energy: WeatherVec3,
        anglesDegrees: WeatherVec3,
        angularWidthDegrees: number,
        secondaryWidthDegrees: number,
    ) => definitions.push({
        kind,
        energyRgb: scale3(energy, haloSurvival),
        spectralAngleRadiansRgb: anglesDegrees.map(radians) as unknown as WeatherVec3,
        angularWidthRadians: radians(angularWidthDegrees),
        secondaryWidthRadians: radians(secondaryWidthDegrees),
    });
    if (enabled.includes("halo-22")) addFeature(
        "halo-22", scale3([0.075, 0.068, 0.058], distribution.randomOrientationFraction),
        [21.75, 22.02, 22.38],
        mix(0.35, 3.5, distribution.surfaceRoughness) + sizeBroadeningDegrees,
        1 + sizeBroadeningDegrees * 0.45);
    if (enabled.includes("halo-46")) addFeature(
        "halo-46", scale3([0.021, 0.018, 0.014], distribution.randomOrientationFraction),
        [45.65, 46.08, 46.62],
        mix(0.55, 4.8, distribution.surfaceRoughness) +
            sizeBroadeningDegrees * 1.25,
        1 + sizeBroadeningDegrees * 0.65);
    if (enabled.includes("sundogs")) addFeature(
        "sundogs", scale3([0.052, 0.042, 0.028], distribution.horizontalPlateFraction),
        [21.75, 22.02, 22.38],
        mix(0.35, 2.2, distribution.surfaceRoughness) +
            sizeBroadeningDegrees * 0.55,
        clamp(input.tiltStandardDeviationDegrees * 1.35, 0.25, 6));
    if (enabled.includes("circumzenithal-arc")) addFeature(
        "circumzenithal-arc",
        scale3([0.038, 0.031, 0.022], distribution.horizontalPlateFraction),
        [46, 46, 46],
        mix(0.3, 2, distribution.surfaceRoughness) +
            sizeBroadeningDegrees * 0.65,
        clamp(10 + input.tiltStandardDeviationDegrees * 3, 10, 34));
    if (enabled.includes("light-pillar")) addFeature(
        "light-pillar", scale3([0.028, 0.027, 0.025],
            distribution.horizontalPlateFraction),
        [0, 0, 0], clamp(0.22 + input.tiltStandardDeviationDegrees * 0.45, 0.2, 4),
        clamp(2.5 + input.tiltStandardDeviationDegrees * 2.6, 3, 24));
    if (enabled.includes("diamond-dust-glints")) addFeature(
        "diamond-dust-glints", scale3([0.020, 0.021, 0.023],
            distribution.horizontalPlateFraction + distribution.horizontalColumnFraction),
        [0, 0, 0], Math.max(0.12, input.tiltStandardDeviationDegrees),
        Math.max(0.12, input.tiltStandardDeviationDegrees));

    const features = definitions.map<OrientedIceFeatureState>((definition) => ({
        ...definition,
        normalizationRgb: normalizeDirectionalIceFeature(
            definition,
            source,
            up,
            sourceElevation,
            tiltSigma,
        ),
    }));
    const replacementEnergyRgb = [0, 1, 2].map((channel) => clamp(
        features.reduce((total, feature) => total + feature.energyRgb[channel], 0),
        0,
        0.28,
    )) as unknown as WeatherVec3;
    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        owner: input.owner,
        sourceDirection: source,
        localUpDirection: up,
        sourceElevationRadians: sourceElevation,
        distribution,
        requestedFeatures: requested,
        enabledFeatures: enabled,
        features,
        replacementEnergyRgb,
        validity: { valid: reasons.length === 0 && enabled.length > 0, reasons },
        seed: input.seed,
    };
};

export const evaluateOrientedIcePhaseReplacement = (
    state: OrientedIcePhenomenonState,
    viewDirection: WeatherVec3,
    ownerSampleWeight = 1,
): WeatherVec3 => {
    if (!state.validity.valid || ownerSampleWeight <= 0) return [0, 0, 0];
    let result: WeatherVec3 = [0, 0, 0];
    for (const feature of state.features) {
        const value = [0, 1, 2].map((channel) => feature.energyRgb[channel] *
            iceFeatureRaw(
                feature.kind,
                channel,
                feature,
                state.sourceDirection,
                viewDirection,
                state.localUpDirection,
                state.sourceElevationRadians,
                state.distribution.tiltStandardDeviationRadians,
            ) / Math.max(1e-12, feature.normalizationRgb[channel])) as
            unknown as WeatherVec3;
        result = add3(result, value);
    }
    return scale3(result, saturate(ownerSampleWeight));
};

export interface OrientedIceOrderedScatteringInput {
    source: WeatherDirectionalRadianceAtSample;
    sample: WeatherFiniteOwnerScatteringSample;
    /** Unit vector from the scattering sample toward the camera. */
    viewDirectionToCamera: WeatherVec3;
}

/**
 * Ordered source for a source-relative ice display. The source direction used
 * to build the CPU state must be the same ephemeris direction used here; a
 * stale halo state is rejected instead of silently rotating or smearing it.
 */
export const evaluateOrientedIceOrderedScatteringSource = (
    state: OrientedIcePhenomenonState,
    input: OrientedIceOrderedScatteringInput,
): WeatherOrderedDirectionalScatteringSource => {
    if (!state.validity.valid) {
        return inactiveOrderedDirectionalSource(
            state.owner.id, input.source.id, "invalid-state");
    }
    const directionAgreement = dot3(
        normalize3(state.sourceDirection),
        normalize3(input.source.directionToSource),
    );
    if (directionAgreement < Math.cos(radians(0.05))) {
        return inactiveOrderedDirectionalSource(
            state.owner.id, input.source.id, "source-direction-mismatch");
    }
    const replacement = evaluateOrientedIcePhaseReplacement(
        state,
        input.viewDirectionToCamera,
        1,
    );
    return evaluateOrderedPhaseReplacement(
        state.owner,
        input.source,
        input.sample,
        replacement,
        state.replacementEnergyRgb,
    );
};

// ---------------------------------------------------------------------------
// Lightning channel topology and finite source injection
// ---------------------------------------------------------------------------

export type LightningTopology = "intra-cloud" | "cloud-to-ground";

export interface LightningChargeRegion {
    centerEastAltitudeNorthKm: WeatherVec3;
    radiusKm: number;
    polarity: -1 | 1;
}

export interface LightningChannelSegment {
    startEastAltitudeNorthKm: WeatherVec3;
    endEastAltitudeNorthKm: WeatherVec3;
    radiusMetres: number;
    parentSegmentIndex: number;
    branchOrder: number;
    emissiveWeight: number;
}

export interface LightningPulseState {
    startSeconds: number;
    durationSeconds: number;
    riseSeconds: number;
    decaySeconds: number;
    peakCurrentKiloamps: number;
    radiantEnergyJoules: number;
    spectrumRgb: WeatherVec3;
    temporalNormalization: number;
    peakNormalization: number;
}

export interface LightningEventState {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    id: string;
    owner: FinitePhenomenonOwner;
    topology: LightningTopology;
    negativeCharge: LightningChargeRegion;
    positiveCharge: LightningChargeRegion;
    groundAltitudeKm: number;
    channelSegments: readonly LightningChannelSegment[];
    pulses: readonly LightningPulseState[];
    totalChannelLengthKm: number;
    validity: PhenomenonValidity;
    seed: number;
}

export interface LightningEventInput {
    id: string;
    owner: FinitePhenomenonOwner;
    topology: LightningTopology;
    negativeCharge: LightningChargeRegion;
    positiveCharge: LightningChargeRegion;
    groundAltitudeKm: number;
    peakCurrentKiloamps: number;
    radiantEnergyJoules: number;
    /** Optional charge-topology guide, never a screen-space polyline. */
    guideControlPointsEastAltitudeNorthKm?: readonly WeatherVec3[];
    /** Physical luminous-core radius, not a camera-space line width. */
    maximumChannelRadiusMetres?: number;
    seed: number;
}

const distance3 = (left: WeatherVec3, right: WeatherVec3) =>
    Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

const lightningRawPulse = (
    elapsed: number,
    rise: number,
    decay: number,
) => {
    if (elapsed < 0) return 0;
    const ratio = elapsed / Math.max(1e-7, rise);
    const leader = ratio ** 3 / (1 + ratio ** 3);
    return leader * Math.exp(-elapsed / Math.max(rise, decay));
};

const integrateLightningPulse = (rise: number, decay: number, duration: number) => {
    const samples = 8_192;
    let sum = 0;
    for (let index = 0; index < samples; index += 1) {
        sum += lightningRawPulse(
            duration * (index + 0.5) / samples,
            rise,
            decay,
        );
    }
    return Math.max(1e-12, sum * duration / samples);
};

const lightningPulsePeak = (rise: number, decay: number, duration: number) => {
    let maximum = 1e-12;
    for (let index = 0; index <= 4_096; index += 1) {
        maximum = Math.max(maximum, lightningRawPulse(
            duration * index / 4_096,
            rise,
            decay,
        ));
    }
    return maximum;
};

const createJaggedChannel = (
    start: WeatherVec3,
    end: WeatherVec3,
    seed: number,
    steps: number,
    parentSegmentIndex = -1,
    branchOrder = 0,
    globalSegmentOffset = 0,
    maximumCoreRadiusMetres = 0.09,
): LightningChannelSegment[] => {
    const segments: LightningChannelSegment[] = [];
    let prior = start;
    const horizontalScale = Math.max(0.015, distance3(start, end) * 0.035 /
        Math.sqrt(Math.max(4, steps)));
    let driftX = 0;
    let driftZ = 0;
    for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        driftX = driftX * 0.62 + (hash01(seed, step * 2) - 0.5) * horizontalScale;
        driftZ = driftZ * 0.62 + (hash01(seed, step * 2 + 1) - 0.5) * horizontalScale;
        const point: WeatherVec3 = step === steps ? end : [
            mix(start[0], end[0], progress) + driftX,
            mix(start[1], end[1], progress) +
                (hash01(seed, 500 + step) - 0.5) * horizontalScale * 0.25,
            mix(start[2], end[2], progress) + driftZ,
        ];
        segments.push({
            startEastAltitudeNorthKm: prior,
            endEastAltitudeNorthKm: point,
            // Physical luminous-core scale. Screen-space resolvability belongs
            // to analytic segment integration and the camera PSF, not a
            // fictitiously broad world-space channel.
            radiusMetres: mix(maximumCoreRadiusMetres,
                Math.max(0.002, maximumCoreRadiusMetres * 0.28), progress) *
                (branchOrder === 0 ? 1 : 0.65),
            parentSegmentIndex: step === 1 ? parentSegmentIndex :
                globalSegmentOffset + segments.length - 1,
            branchOrder,
            emissiveWeight: (branchOrder === 0 ? 1 : 0.38) * mix(1, 0.45, progress),
        });
        prior = point;
    }
    return segments;
};

export const createLightningEventState = (
    input: LightningEventInput,
): LightningEventState => {
    const reasons = validateFiniteOwner(input.owner);
    if (input.owner.kind !== "convective-cloud") {
        reasons.push("lightning-requires-deep-convective-cloud-owner");
    }
    if (input.owner.topAltitudeKm - input.owner.bottomAltitudeKm < 3) {
        reasons.push("lightning-owner-lacks-charge-separation-depth");
    }
    if (input.negativeCharge.polarity !== -1 || input.positiveCharge.polarity !== 1) {
        reasons.push("lightning-charge-polarities-invalid");
    }
    for (const [name, charge] of [
        ["negative", input.negativeCharge],
        ["positive", input.positiveCharge],
    ] as const) {
        if (!(charge.radiusKm > 0) || !Number.isFinite(charge.radiusKm)) {
            reasons.push(`${name}-charge-radius-is-invalid`);
        }
        const altitude = charge.centerEastAltitudeNorthKm[1];
        if (altitude < input.owner.bottomAltitudeKm ||
            altitude > input.owner.topAltitudeKm) {
            reasons.push(`${name}-charge-region-is-outside-convective-owner`);
        }
    }
    if (distance3(input.negativeCharge.centerEastAltitudeNorthKm,
        input.positiveCharge.centerEastAltitudeNorthKm) < 0.5) {
        reasons.push("lightning-charge-regions-lack-physical-separation");
    }
    if (!(input.peakCurrentKiloamps > 0) || !Number.isFinite(input.peakCurrentKiloamps)) {
        reasons.push("lightning-peak-current-is-invalid");
    }
    if (!(input.radiantEnergyJoules > 0) || !Number.isFinite(input.radiantEnergyJoules)) {
        reasons.push("lightning-radiant-energy-is-invalid");
    }
    if (input.maximumChannelRadiusMetres !== undefined &&
        (!(input.maximumChannelRadiusMetres >= 0.002) ||
            !(input.maximumChannelRadiusMetres <= 0.2))) {
        reasons.push("lightning-channel-core-radius-is-outside-measured-envelope");
    }
    const defaultDestination: WeatherVec3 = input.topology === "cloud-to-ground"
        ? [
            input.negativeCharge.centerEastAltitudeNorthKm[0] +
                (hash01(input.seed, 3) - 0.5) * input.negativeCharge.radiusKm,
            input.groundAltitudeKm,
            input.negativeCharge.centerEastAltitudeNorthKm[2] +
                (hash01(input.seed, 4) - 0.5) * input.negativeCharge.radiusKm,
        ]
        : input.positiveCharge.centerEastAltitudeNorthKm;
    const start = input.negativeCharge.centerEastAltitudeNorthKm;
    const authoredGuide = input.guideControlPointsEastAltitudeNorthKm;
    const authoredGuidePoints: WeatherVec3[] | undefined = authoredGuide?.map(
        (point) => [point[0], point[1], point[2]]);
    const authoredGuideIsUsable = Boolean(authoredGuidePoints &&
        authoredGuidePoints.length >= 2 && authoredGuidePoints.every((point) =>
            point.every(Number.isFinite)));
    const destination = authoredGuideIsUsable
        ? authoredGuidePoints![authoredGuidePoints!.length - 1]
        : defaultDestination;
    if (input.topology === "cloud-to-ground" && start[1] <= input.groundAltitudeKm) {
        reasons.push("cloud-to-ground-channel-start-is-below-ground");
    }
    const guide: WeatherVec3[] = authoredGuideIsUsable
        ? authoredGuidePoints!
        : [start, destination];
    if (authoredGuide && !authoredGuideIsUsable) {
        reasons.push("lightning-channel-guide-is-invalid");
    } else {
        if (distance3(guide[0], start) > Math.max(0.05, input.negativeCharge.radiusKm)) {
            reasons.push("lightning-channel-guide-does-not-start-in-negative-charge");
        }
        if (input.topology === "cloud-to-ground") {
            if (Math.abs(destination[1] - input.groundAltitudeKm) > 1e-6) {
                reasons.push("cloud-to-ground-guide-does-not-reach-ground");
            }
        } else if (distance3(destination,
            input.positiveCharge.centerEastAltitudeNorthKm) >
                Math.max(0.05, input.positiveCharge.radiusKm)) {
            reasons.push("intra-cloud-guide-does-not-end-in-positive-charge");
        }
        for (let index = 0; index < guide.length; index += 1) {
            const altitude = guide[index][1];
            const groundEndpoint = input.topology === "cloud-to-ground" &&
                index === guide.length - 1;
            if ((!groundEndpoint && (altitude < input.owner.bottomAltitudeKm ||
                altitude > input.owner.topAltitudeKm)) ||
                (groundEndpoint && altitude < input.groundAltitudeKm - 1e-6)) {
                reasons.push("lightning-channel-guide-exits-finite-owner");
                break;
            }
        }
    }
    const guideLengths = guide.slice(1).map((point, index) =>
        distance3(guide[index], point));
    const guideLength = guideLengths.reduce((sum, value) => sum + value, 0);
    const targetMainSteps = clamp(Math.round(guideLength * 5.5), 12, 64);
    const maximumCoreRadiusMetres = clamp(
        input.maximumChannelRadiusMetres ?? 0.09, 0.002, 0.2);
    const segments: LightningChannelSegment[] = [];
    for (let leg = 0; leg < guide.length - 1; leg += 1) {
        const legSteps = Math.max(2, Math.round(targetMainSteps *
            guideLengths[leg] / Math.max(1e-6, guideLength)));
        segments.push(...createJaggedChannel(
            guide[leg],
            guide[leg + 1],
            input.seed + leg * 65_537,
            legSteps,
            leg === 0 ? -1 : segments.length - 1,
            0,
            segments.length,
            maximumCoreRadiusMetres,
        ));
    }
    const mainSegmentCount = segments.length;
    const branchCount = clamp(Math.floor(mainSegmentCount / 12), 1, 5);
    for (let branch = 0; branch < branchCount; branch += 1) {
        const parent = clamp(
            Math.floor(mix(mainSegmentCount * 0.18, mainSegmentCount * 0.82,
                hash01(input.seed, 200 + branch))),
            1,
            mainSegmentCount - 2,
        );
        const branchStart = segments[parent].startEastAltitudeNorthKm;
        const length = distance3(start, destination) * mix(0.08, 0.22,
            hash01(input.seed, 240 + branch));
        const azimuth = hash01(input.seed, 260 + branch) * TAU;
        const branchEnd: WeatherVec3 = [
            branchStart[0] + Math.cos(azimuth) * length,
            clamp(branchStart[1] + (hash01(input.seed, 280 + branch) - 0.62) * length,
                input.groundAltitudeKm + 0.02,
                input.owner.topAltitudeKm),
            branchStart[2] + Math.sin(azimuth) * length,
        ];
        const branchSegments = createJaggedChannel(
            branchStart,
            branchEnd,
            input.seed + 997 * (branch + 1),
            clamp(Math.round(length * 4), 3, 12),
            parent,
            1,
            segments.length,
            maximumCoreRadiusMetres,
        );
        segments.push(...branchSegments);
    }
    const totalChannelLengthKm = segments.reduce((total, segment) => total +
        distance3(segment.startEastAltitudeNorthKm,
            segment.endEastAltitudeNorthKm), 0);
    const radiantEnergyJoulesPerMetre = input.radiantEnergyJoules /
        Math.max(1, totalChannelLengthKm * 1_000);
    if (radiantEnergyJoulesPerMetre < 0.5 || radiantEnergyJoulesPerMetre > 5_000) {
        reasons.push("lightning-radiant-energy-per-channel-length-is-implausible");
    }
    const pulseCount = input.topology === "cloud-to-ground"
        ? 2 + Math.floor(hash01(input.seed, 401) * 3)
        : 1 + Math.floor(hash01(input.seed, 402) * 2);
    const pulses: LightningPulseState[] = [];
    for (let pulse = 0; pulse < pulseCount; pulse += 1) {
        // Return-stroke light rises over tens of microseconds and measured
        // subsequent-stroke widths cluster around 0.10–0.24 ms. Intracloud
        // optical pulses are weaker and more slowly varying.
        const rise = input.topology === "cloud-to-ground"
            ? mix(12e-6, 70e-6, hash01(input.seed, 500 + pulse))
            : mix(60e-6, 300e-6, hash01(input.seed, 500 + pulse));
        const decay = input.topology === "cloud-to-ground"
            ? mix(70e-6, 280e-6, hash01(input.seed, 520 + pulse))
            : mix(0.0003, 0.002, hash01(input.seed, 520 + pulse));
        const duration = Math.min(0.016, decay * 8);
        const spectrum = [0.78, 0.93, 1.32] as WeatherVec3;
        pulses.push({
            startSeconds: pulse === 0 ? 0 :
                mix(0.018, 0.095, pulse / Math.max(1, pulseCount - 1)) +
                hash01(input.seed, 540 + pulse) * 0.012,
            durationSeconds: duration,
            riseSeconds: rise,
            decaySeconds: decay,
            peakCurrentKiloamps: clamp(input.peakCurrentKiloamps, 2, 300) *
                (pulse === 0 ? 1 : mix(0.42, 0.82, hash01(input.seed, 560 + pulse))),
            radiantEnergyJoules: clamp(input.radiantEnergyJoules, 1e3, 3e8) /
                pulseCount,
            spectrumRgb: scale3(spectrum, 1 / luminance3(spectrum)),
            temporalNormalization: integrateLightningPulse(rise, decay, duration),
            peakNormalization: lightningPulsePeak(rise, decay, duration),
        });
    }
    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        id: input.id,
        owner: input.owner,
        topology: input.topology,
        negativeCharge: input.negativeCharge,
        positiveCharge: input.positiveCharge,
        groundAltitudeKm: input.groundAltitudeKm,
        channelSegments: segments,
        pulses,
        totalChannelLengthKm,
        validity: { valid: reasons.length === 0, reasons },
        seed: input.seed,
    };
};

export interface LightningEmissionSample {
    /** Scene-linear radiant power spectrum injected at channel world position. */
    emittedPowerRgb: WeatherVec3;
    currentKiloamps: number;
    normalizedTemporalProfilePerSecond: number;
}

/** Sum of all active stroke/substroke pulses at one event time. */
export const evaluateLightningEventPower = (
    event: LightningEventState,
    eventTimeSeconds: number,
): LightningEmissionSample => {
    if (!event.validity.valid) {
        return { emittedPowerRgb: [0, 0, 0], currentKiloamps: 0,
            normalizedTemporalProfilePerSecond: 0 };
    }
    let emittedPowerRgb: WeatherVec3 = [0, 0, 0];
    let currentKiloamps = 0;
    let normalizedTemporalProfilePerSecond = 0;
    for (const pulse of event.pulses) {
        const sample = evaluateLightningPulse(pulse, eventTimeSeconds);
        emittedPowerRgb = add3(emittedPowerRgb, sample.emittedPowerRgb);
        currentKiloamps += sample.currentKiloamps;
        normalizedTemporalProfilePerSecond +=
            sample.normalizedTemporalProfilePerSecond;
    }
    return { emittedPowerRgb, currentKiloamps,
        normalizedTemporalProfilePerSecond };
};

export const evaluateLightningPulse = (
    pulse: LightningPulseState,
    eventTimeSeconds: number,
): LightningEmissionSample => {
    const elapsed = eventTimeSeconds - pulse.startSeconds;
    if (elapsed < 0 || elapsed > pulse.durationSeconds) {
        return { emittedPowerRgb: [0, 0, 0], currentKiloamps: 0,
            normalizedTemporalProfilePerSecond: 0 };
    }
    const normalizedTemporalProfilePerSecond = lightningRawPulse(
        elapsed,
        pulse.riseSeconds,
        pulse.decaySeconds,
    ) / Math.max(1e-12, pulse.temporalNormalization);
    return {
        emittedPowerRgb: scale3(
            pulse.spectrumRgb,
            pulse.radiantEnergyJoules * normalizedTemporalProfilePerSecond,
        ),
        currentKiloamps: pulse.peakCurrentKiloamps * clamp(
            lightningRawPulse(elapsed, pulse.riseSeconds, pulse.decaySeconds) /
                Math.max(1e-12, pulse.peakNormalization), 0, 1),
        normalizedTemporalProfilePerSecond,
    };
};

export const distanceToLightningSegmentKm = (
    position: WeatherVec3,
    segment: LightningChannelSegment,
) => {
    const start = segment.startEastAltitudeNorthKm;
    const end = segment.endEastAltitudeNorthKm;
    const direction: WeatherVec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    const relative: WeatherVec3 = [
        position[0] - start[0], position[1] - start[1], position[2] - start[2],
    ];
    const denominator = Math.max(1e-12, dot3(direction, direction));
    const progress = saturate(dot3(relative, direction) / denominator);
    return distance3(position, [
        start[0] + direction[0] * progress,
        start[1] + direction[1] * progress,
        start[2] + direction[2] * progress,
    ]);
};

export interface LightningVolumeInjectionSample {
    /** In-world emissivity; integrate through cloud and atmosphere once. */
    emissivityRgbPerKm3: WeatherVec3;
    channelWeight: number;
    eventId: string;
    finiteSupport: boolean;
    cameraPathTransmittanceApplied: false;
    bloomApplied: false;
}

const LIGHTNING_CHANNEL_SUPPORT_SIGMAS = 4.5;

const finiteLightningRadialKernel = (radiusKm: number, sigmaKm: number) => {
    const supportRadiusKm = LIGHTNING_CHANNEL_SUPPORT_SIGMAS * sigmaKm;
    if (radiusKm > supportRadiusKm) return 0;
    const capturedEnergy = 1 - Math.exp(-0.5 * LIGHTNING_CHANNEL_SUPPORT_SIGMAS ** 2);
    return Math.exp(-0.5 * (radiusKm / sigmaKm) ** 2) /
        (TAU * sigmaKm * sigmaKm * capturedEnergy);
};

export const evaluateLightningChannelInjection = (
    event: LightningEventState,
    eventTimeSeconds: number,
    positionEastAltitudeNorthKm: WeatherVec3,
): LightningVolumeInjectionSample => {
    if (!event.validity.valid) return {
        emissivityRgbPerKm3: [0, 0, 0],
        channelWeight: 0,
        eventId: event.id,
        finiteSupport: true,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
    const eventPower = evaluateLightningEventPower(event, eventTimeSeconds)
        .emittedPowerRgb;
    if (eventPower.every((value) => value <= 0)) {
        return {
            emissivityRgbPerKm3: [0, 0, 0],
            channelWeight: 0,
            eventId: event.id,
            finiteSupport: true,
            cameraPathTransmittanceApplied: false,
            bloomApplied: false,
        };
    }
    const weightedLength = event.channelSegments.reduce((total, segment) => total +
        distance3(segment.startEastAltitudeNorthKm,
            segment.endEastAltitudeNorthKm) * segment.emissiveWeight, 0);
    let channelWeight = 0;
    for (const segment of event.channelSegments) {
        const sigmaKm = Math.max(2e-5, segment.radiusMetres * 0.001 * 1.6);
        const radiusKm = distanceToLightningSegmentKm(
            positionEastAltitudeNorthKm,
            segment,
        );
        const radial = finiteLightningRadialKernel(radiusKm, sigmaKm);
        channelWeight += segment.emissiveWeight * radial /
            Math.max(1e-6, weightedLength);
    }
    return {
        emissivityRgbPerKm3: scale3(eventPower, channelWeight),
        channelWeight,
        eventId: event.id,
        finiteSupport: true,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
};

export interface LightningCloudScatteringInput {
    eventId: string;
    ownerId: string;
    positionEastAltitudeNorthKm: WeatherVec3;
    ownerSampleWeight: number;
    cloudScatteringCoefficientRgbPerKm: WeatherVec3;
    /**
     * Channel radiance already integrated over segment directions and the
     * cloud phase function, but before channel-to-sample extinction.
     */
    unattenuatedPhaseConvolvedChannelRadianceRgb: WeatherVec3;
    channelToSampleTransmittanceRgb: WeatherVec3;
}

export interface LightningCloudScatteringSource {
    eventId: string;
    ownerId: string;
    enabled: boolean;
    inactiveReason?: "invalid-event" | "event-mismatch" | "owner-mismatch" |
        "outside-owner-altitude" | "empty-owner-sample" | "inactive-pulse";
    phaseConvolvedIncidentRadianceRgb: WeatherVec3;
    sourceCoefficientRgbPerKm: WeatherVec3;
    /** Channel power is transported, not copied into a second volume emitter. */
    duplicatesChannelEmission: false;
    cameraPathTransmittanceApplied: false;
    bloomApplied: false;
}

const inactiveLightningCloudSource = (
    event: LightningEventState,
    input: LightningCloudScatteringInput,
    reason: NonNullable<LightningCloudScatteringSource["inactiveReason"]>,
): LightningCloudScatteringSource => ({
    eventId: event.id,
    ownerId: event.owner.id,
    enabled: false,
    inactiveReason: reason,
    phaseConvolvedIncidentRadianceRgb: ZERO_RGB,
    sourceCoefficientRgbPerKm: ZERO_RGB,
    duplicatesChannelEmission: false,
    cameraPathTransmittanceApplied: false,
    bloomApplied: false,
});

/**
 * Exact local cloud-lighting hookup for one lightning event. The caller traces
 * the event channel to the sample and phase-convolves those incident segment
 * directions. This function applies the finite owner and sigma_s exactly once;
 * it never invents a second diffuse flash or post-process glow.
 */
export const evaluateLightningCloudScatteringSource = (
    event: LightningEventState,
    eventTimeSeconds: number,
    input: LightningCloudScatteringInput,
): LightningCloudScatteringSource => {
    if (!event.validity.valid) {
        return inactiveLightningCloudSource(event, input, "invalid-event");
    }
    if (input.eventId !== event.id) {
        return inactiveLightningCloudSource(event, input, "event-mismatch");
    }
    if (input.ownerId !== event.owner.id) {
        return inactiveLightningCloudSource(event, input, "owner-mismatch");
    }
    const altitude = input.positionEastAltitudeNorthKm[1];
    if (altitude < event.owner.bottomAltitudeKm ||
        altitude > event.owner.topAltitudeKm) {
        return inactiveLightningCloudSource(event, input, "outside-owner-altitude");
    }
    const membership = saturate(input.ownerSampleWeight);
    if (membership <= 0 || input.cloudScatteringCoefficientRgbPerKm.every(
        (value) => !(value > 0))) {
        return inactiveLightningCloudSource(event, input, "empty-owner-sample");
    }
    if (evaluateLightningEventPower(event, eventTimeSeconds)
        .emittedPowerRgb.every((value) => value <= 0)) {
        return inactiveLightningCloudSource(event, input, "inactive-pulse");
    }
    const phaseConvolvedIncidentRadianceRgb = mul3(
        sampleNonNegativeRgb(input.unattenuatedPhaseConvolvedChannelRadianceRgb),
        sampleUnitRgb(input.channelToSampleTransmittanceRgb),
    );
    const sourceCoefficientRgbPerKm = scale3(mul3(
        sampleNonNegativeRgb(input.cloudScatteringCoefficientRgbPerKm),
        phaseConvolvedIncidentRadianceRgb,
    ), membership);
    return {
        eventId: event.id,
        ownerId: event.owner.id,
        enabled: true,
        phaseConvolvedIncidentRadianceRgb,
        sourceCoefficientRgbPerKm,
        duplicatesChannelEmission: false,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
};

// ---------------------------------------------------------------------------
// Aurora: physical-altitude magnetic curtains and line emission
// ---------------------------------------------------------------------------

export interface AuroralCurtainState {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    owner: FinitePhenomenonOwner;
    centerEastNorthKm: WeatherVec2;
    orientationRadians: number;
    lengthKm: number;
    sheetWidthKm: number;
    bottomAltitudeKm: number;
    topAltitudeKm: number;
    foldAmplitudeKm: number;
    foldWavelengthKm: number;
    foldOctaves: number;
    driftEastNorthKmPerSecond: WeatherVec2;
    magneticFieldDirection: WeatherVec3;
    emissionScale: number;
    /** Altitude integral of each unnormalized spectral line profile, in km. */
    altitudeProfileNormalizationRgb: WeatherVec3;
    /** Scene-linear column emission before local fold modulation. */
    columnEmissionRgb: WeatherVec3;
    geomagneticLatitudeDegrees: number;
    kpIndex: number;
    solarAltitudeDegrees: number;
    seed: number;
    validity: PhenomenonValidity;
}

export interface AuroralCurtainInput {
    owner: FinitePhenomenonOwner;
    centerEastNorthKm: WeatherVec2;
    orientationRadians: number;
    lengthKm: number;
    sheetWidthKm: number;
    bottomAltitudeKm: number;
    topAltitudeKm: number;
    foldAmplitudeKm: number;
    foldWavelengthKm: number;
    driftEastNorthKmPerSecond: WeatherVec2;
    magneticFieldDirection: WeatherVec3;
    geomagneticLatitudeDegrees: number;
    kpIndex: number;
    solarAltitudeDegrees: number;
    emissionScale: number;
    seed: number;
}

export const createAuroralCurtainState = (
    input: AuroralCurtainInput,
): AuroralCurtainState => {
    const reasons = validateFiniteOwner(input.owner);
    if (input.owner.kind !== "magnetospheric-sheet") {
        reasons.push("aurora-requires-magnetospheric-sheet-owner");
    }
    if (input.bottomAltitudeKm < 80 || input.topAltitudeKm > 550 ||
        input.topAltitudeKm <= input.bottomAltitudeKm) {
        reasons.push("auroral-altitude-outside-physical-thermosphere");
    }
    if (input.bottomAltitudeKm < input.owner.bottomAltitudeKm ||
        input.topAltitudeKm > input.owner.topAltitudeKm) {
        reasons.push("auroral-curtain-exceeds-owner-shell");
    }
    if (Math.abs(input.geomagneticLatitudeDegrees) < 48 && input.kpIndex < 7) {
        reasons.push("aurora-latitude-requires-severe-geomagnetic-storm");
    }
    const magneticField = normalize3(input.magneticFieldDirection);
    if (length3(input.magneticFieldDirection) < 1e-6 ||
        Math.abs(magneticField[1]) < 0.15) {
        reasons.push("auroral-sheet-requires-field-with-vertical-component");
    }
    if (!(input.lengthKm > 0) || !(input.sheetWidthKm > 0) ||
        !(input.foldWavelengthKm > 0)) {
        reasons.push("auroral-sheet-geometry-is-empty");
    }
    if (!(input.emissionScale >= 0 && input.emissionScale <= 1) ||
        !Number.isFinite(input.emissionScale)) {
        reasons.push("auroral-emission-scale-is-invalid");
    }
    const bottomAltitudeKm = clamp(input.bottomAltitudeKm, 80, 300);
    const topAltitudeKm = clamp(input.topAltitudeKm, 100, 550);
    const altitudeProfileNormalizationRgb = integrateAuroralAltitudeSpectrum(
        bottomAltitudeKm, topAltitudeKm);
    const emissionScale = clamp(input.emissionScale, 0, 1) *
        clamp((input.kpIndex - 0.5) / 8.5, 0.04, 1);
    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        owner: input.owner,
        centerEastNorthKm: input.centerEastNorthKm,
        orientationRadians: input.orientationRadians,
        lengthKm: clamp(input.lengthKm, 10, 2_000),
        sheetWidthKm: clamp(input.sheetWidthKm, 0.05, 12),
        bottomAltitudeKm,
        topAltitudeKm,
        foldAmplitudeKm: clamp(input.foldAmplitudeKm, 0, 80),
        foldWavelengthKm: clamp(input.foldWavelengthKm, 1, 400),
        foldOctaves: clamp(Math.floor(2 + hash01(input.seed, 2) * 3), 2, 4),
        driftEastNorthKmPerSecond: input.driftEastNorthKmPerSecond,
        magneticFieldDirection: magneticField,
        emissionScale,
        altitudeProfileNormalizationRgb,
        // These values preserve the former peak radiance while making the
        // altitude integral explicit and invariant to march resolution.
        columnEmissionRgb: scale3([8.36e-7, 7.67e-7, 3.00e-7], emissionScale),
        geomagneticLatitudeDegrees: input.geomagneticLatitudeDegrees,
        kpIndex: clamp(input.kpIndex, 0, 9),
        solarAltitudeDegrees: input.solarAltitudeDegrees,
        seed: input.seed,
        validity: { valid: reasons.length === 0, reasons },
    };
};

const gaussian = (value: number, center: number, sigma: number) =>
    Math.exp(-0.5 * ((value - center) / Math.max(1e-6, sigma)) ** 2);

const auroralAltitudeSpectrum = (altitudeKm: number): WeatherVec3 => [
    gaussian(altitudeKm, 225, 48) * 0.34 +
        gaussian(altitudeKm, 155, 28) * 0.08,
    gaussian(altitudeKm, 113.8, 17),
    // Large paired-camera statistics place the 427.8 nm N2+ peak at
    // essentially the same height as 557.7 nm, not in a fictitious low band.
    gaussian(altitudeKm, 113.5, 14) * 0.36 +
        gaussian(altitudeKm, 136, 20) * 0.08,
];

function integrateAuroralAltitudeSpectrum(
    bottomAltitudeKm: number,
    topAltitudeKm: number,
): WeatherVec3 {
    const samples = 8_192;
    const stepKm = (topAltitudeKm - bottomAltitudeKm) / samples;
    let integral: WeatherVec3 = [0, 0, 0];
    for (let index = 0; index < samples; index += 1) {
        integral = add3(integral, scale3(auroralAltitudeSpectrum(
            bottomAltitudeKm + (index + 0.5) * stepKm), stepKm));
    }
    return integral.map((value) => Math.max(1e-12, value)) as
        unknown as WeatherVec3;
}

export interface AuroraEmissionSample {
    /** Local line-emission coefficient; atmosphere extinction is still pending. */
    emissivityRgbPerKm: WeatherVec3;
    sheetDensity: number;
    representativeAltitudeKm: number;
    ownerId: string;
    finiteSupport: boolean;
    cameraPathTransmittanceApplied: false;
    bloomApplied: false;
}

export const evaluateAuroralCurtainEmission = (
    state: AuroralCurtainState,
    positionEastAltitudeNorthKm: WeatherVec3,
    timeSeconds: number,
): AuroraEmissionSample => {
    if (!state.validity.valid) {
        return { emissivityRgbPerKm: [0, 0, 0], sheetDensity: 0,
            representativeAltitudeKm: 110, ownerId: state.owner.id,
            finiteSupport: true, cameraPathTransmittanceApplied: false,
            bloomApplied: false };
    }
    const movedCenter: WeatherVec2 = [
        state.centerEastNorthKm[0] + state.driftEastNorthKmPerSecond[0] * timeSeconds,
        state.centerEastNorthKm[1] + state.driftEastNorthKmPerSecond[1] * timeSeconds,
    ];
    const field = normalize3(state.magneticFieldDirection);
    const referenceAltitudeKm = 113.8;
    const fieldAltitudeScale = (positionEastAltitudeNorthKm[1] - referenceAltitudeKm) /
        Math.max(0.08, Math.abs(field[1]));
    const delta: WeatherVec2 = [
        positionEastAltitudeNorthKm[0] - movedCenter[0] - field[0] * fieldAltitudeScale,
        positionEastAltitudeNorthKm[2] - movedCenter[1] - field[2] * fieldAltitudeScale,
    ];
    const alongDirection: WeatherVec2 = [
        Math.cos(state.orientationRadians), Math.sin(state.orientationRadians),
    ];
    const acrossDirection: WeatherVec2 = [-alongDirection[1], alongDirection[0]];
    const along = delta[0] * alongDirection[0] + delta[1] * alongDirection[1];
    let fold = 0;
    let amplitude = state.foldAmplitudeKm;
    let frequency = TAU / state.foldWavelengthKm;
    const dynamicSeed = weatherPhenomenonShaderSeed(state.seed) * 4_096;
    for (let octave = 0; octave < state.foldOctaves; octave += 1) {
        fold += Math.sin(along * frequency + timeSeconds * (0.11 + octave * 0.07) +
            shaderHash11(dynamicSeed + octave * 17) * TAU) * amplitude;
        amplitude *= 0.42;
        frequency *= 2.07;
    }
    const across = delta[0] * acrossDirection[0] + delta[1] * acrossDirection[1] - fold;
    const alongWindow = 1 - smoothstep(state.lengthKm * 0.43,
        state.lengthKm * 0.5, Math.abs(along));
    const absoluteAcross = Math.abs(across);
    const acrossWindow = 1 - smoothstep(
        state.sheetWidthKm * 3.5,
        state.sheetWidthKm * 4,
        absoluteAcross,
    );
    const sheetDensity = absoluteAcross >= state.sheetWidthKm * 4 ? 0 :
        Math.exp(-0.5 * (across / state.sheetWidthKm) ** 2) *
            alongWindow * acrossWindow;
    const altitude = positionEastAltitudeNorthKm[1];
    if (altitude < state.bottomAltitudeKm || altitude > state.topAltitudeKm ||
        sheetDensity <= 1e-8) {
        return { emissivityRgbPerKm: [0, 0, 0], sheetDensity: 0,
            representativeAltitudeKm: 110, ownerId: state.owner.id,
            finiteSupport: true, cameraPathTransmittanceApplied: false,
            bloomApplied: false };
    }
    // O I 630.0 nm red, O I 557.7 nm green, and N2/N2+ blue-violet bands.
    const rawSpectrum = auroralAltitudeSpectrum(altitude);
    const electronPrecipitation = 0.84 + 0.16 * Math.sin(
        along / Math.max(2, state.foldWavelengthKm) * 11.7 +
        timeSeconds * 1.9 + shaderHash11(dynamicSeed * 2 + 77) * TAU);
    const spectrum = mul3(
        state.columnEmissionRgb,
        rawSpectrum.map((value, channel) => value /
            state.altitudeProfileNormalizationRgb[channel]) as
            unknown as WeatherVec3,
    );
    const boundedScale = sheetDensity *
        clamp(electronPrecipitation, 0.6, 1.05);
    return {
        emissivityRgbPerKm: scale3(spectrum, boundedScale),
        sheetDensity,
        representativeAltitudeKm: rawSpectrum[0] > rawSpectrum[1] &&
            rawSpectrum[0] > rawSpectrum[2] ? 225 :
            rawSpectrum[2] > rawSpectrum[1] ? 113.5 : 113.8,
        ownerId: state.owner.id,
        finiteSupport: true,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
};

export interface AuroraOrderedEmissionSource {
    ownerId: string;
    emissionCoefficientRgbPerKm: WeatherVec3;
    extinctionContributionRgbPerKm: WeatherVec3;
    scatteringContributionRgbPerKm: WeatherVec3;
    cameraPathTransmittanceApplied: false;
    bloomApplied: false;
}

/** Add this coefficient to the local ordered source sum before transmittance. */
export const evaluateAuroralOrderedEmissionSource = (
    state: AuroralCurtainState,
    positionEastAltitudeNorthKm: WeatherVec3,
    timeSeconds: number,
): AuroraOrderedEmissionSource => {
    const sample = evaluateAuroralCurtainEmission(
        state, positionEastAltitudeNorthKm, timeSeconds);
    return {
        ownerId: state.owner.id,
        emissionCoefficientRgbPerKm: sample.emissivityRgbPerKm,
        extinctionContributionRgbPerKm: ZERO_RGB,
        scatteringContributionRgbPerKm: ZERO_RGB,
        cameraPathTransmittanceApplied: false,
        bloomApplied: false,
    };
};

// ---------------------------------------------------------------------------
// Wind-raised snow/dust/ash: finite boundary-layer participating media
// ---------------------------------------------------------------------------

export type BlowingPhenomenonKind =
    | "blowing-snow"
    | "blowing-dust"
    | "volcanic-ash";

export type VolcanicAshOpticalClass =
    | "weakly-absorbing"
    | "moderately-absorbing"
    | "strongly-absorbing";

export interface BlowingBoundaryLayerState {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    owner: FinitePhenomenonOwner;
    kind: BlowingPhenomenonKind;
    centerEastNorthKm: WeatherVec2;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientationRadians: number;
    topAltitudeKm: number;
    boundaryTransitionFraction: number;
    windEastNorthMps: WeatherVec2;
    frictionVelocityMps: number;
    visibilityKm: number;
    extinctionRgbKm: WeatherVec3;
    singleScatteringAlbedoRgb: WeatherVec3;
    asymmetry: number;
    particleMedianDiameterMicrons: number;
    particleDiameterRangeMicrons: readonly [number, number];
    particleDensityKgM3: number;
    provenance: "erodible-snowpack" | "erodible-mineral-soil" |
        "resuspended-volcanic-deposit";
    volcanicAshOpticalClass?: VolcanicAshOpticalClass;
    seed: number;
    validity: PhenomenonValidity;
}

export interface BlowingBoundaryLayerInput {
    owner: FinitePhenomenonOwner;
    kind: BlowingPhenomenonKind;
    centerEastNorthKm: WeatherVec2;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientationRadians: number;
    topAltitudeKm: number;
    windSpeedMps: number;
    windDirectionRadians: number;
    frictionVelocityMps: number;
    visibilityKm: number;
    surfaceTemperatureKelvin: number;
    surfaceRelativeHumidity: number;
    snowCoverFraction: number;
    soilMoistureFraction: number;
    particleMedianDiameterMicrons: number;
    /** Required for volcanic ash; eruption plumes are not boundary media. */
    volcanicAshSource?: "resuspended-deposit" | "active-eruption-plume";
    volcanicAshCoverFraction?: number;
    volcanicAshOpticalClass?: VolcanicAshOpticalClass;
    seed: number;
}

const VOLCANIC_ASH_ALBEDO: Record<VolcanicAshOpticalClass, WeatherVec3> = {
    "weakly-absorbing": [0.975, 0.960, 0.940],
    "moderately-absorbing": [0.920, 0.870, 0.810],
    "strongly-absorbing": [0.875, 0.820, 0.755],
};

export const createBlowingBoundaryLayerState = (
    input: BlowingBoundaryLayerInput,
): BlowingBoundaryLayerState => {
    const reasons = validateFiniteOwner(input.owner);
    if (!(input.majorRadiusKm > 0) || !(input.minorRadiusKm > 0) ||
        !Number.isFinite(input.majorRadiusKm) || !Number.isFinite(input.minorRadiusKm)) {
        reasons.push("blowing-medium-horizontal-support-is-invalid");
    }
    if (!(input.visibilityKm > 0) || !Number.isFinite(input.visibilityKm)) {
        reasons.push("blowing-medium-visibility-is-invalid");
    }
    if (!(input.windSpeedMps >= 0) || !(input.frictionVelocityMps >= 0) ||
        !Number.isFinite(input.windSpeedMps) ||
        !Number.isFinite(input.frictionVelocityMps)) {
        reasons.push("blowing-medium-wind-state-is-invalid");
    }
    if (input.owner.kind !== "boundary-layer-region") {
        reasons.push("blowing-medium-requires-finite-boundary-layer-owner");
    }
    if (input.owner.bottomAltitudeKm > 0 ||
        input.topAltitudeKm > input.owner.topAltitudeKm || input.topAltitudeKm <= 0) {
        reasons.push("blowing-medium-exceeds-boundary-layer-owner");
    }
    if (input.kind === "blowing-snow") {
        if (input.surfaceTemperatureKelvin > 275) reasons.push("blowing-snow-surface-too-warm");
        if (input.snowCoverFraction < 0.18) reasons.push("blowing-snow-lacks-erodible-snow");
        if (input.windSpeedMps < 4.5) reasons.push("blowing-snow-wind-below-threshold");
        if (input.frictionVelocityMps < 0.12) {
            reasons.push("blowing-snow-friction-velocity-below-threshold");
        }
    } else if (input.kind === "blowing-dust") {
        if (input.soilMoistureFraction > 0.28 || input.surfaceRelativeHumidity > 0.82) {
            reasons.push("blowing-dust-surface-is-not-erodible");
        }
        if (input.snowCoverFraction > 0.08) reasons.push("blowing-dust-conflicts-with-snow-cover");
        if (input.windSpeedMps < 6.5) reasons.push("blowing-dust-wind-below-threshold");
        if (input.frictionVelocityMps < 0.18) {
            reasons.push("blowing-dust-friction-velocity-below-threshold");
        }
    } else {
        if (input.volcanicAshSource !== "resuspended-deposit") {
            reasons.push("volcanic-ash-boundary-medium-requires-resuspended-deposit");
        }
        if ((input.volcanicAshCoverFraction ?? 0) < 0.02) {
            reasons.push("volcanic-ash-lacks-finite-source-deposit");
        }
        if (input.soilMoistureFraction > 0.35 || input.surfaceRelativeHumidity > 0.9) {
            reasons.push("volcanic-ash-deposit-is-not-readily-remobilized");
        }
        if (input.snowCoverFraction > 0.12) {
            reasons.push("volcanic-ash-deposit-is-buried-by-snow");
        }
        if (input.windSpeedMps < 5.5) reasons.push("volcanic-ash-wind-below-threshold");
        if (input.frictionVelocityMps < 0.15) {
            reasons.push("volcanic-ash-friction-velocity-below-threshold");
        }
        if (input.particleMedianDiameterMicrons < 0.5 ||
            input.particleMedianDiameterMicrons > 500) {
            reasons.push("volcanic-ash-particle-size-outside-resuspension-regime");
        }
    }
    const visibility = clamp(input.visibilityKm, 0.03, 80);
    const extinction550 = clamp(3.912 / visibility, 0.01, 130);
    const extinctionRgb: WeatherVec3 = input.kind === "blowing-snow"
        ? [extinction550 * 0.985, extinction550, extinction550 * 1.015]
        : input.kind === "blowing-dust"
            ? [extinction550 * 0.82, extinction550, extinction550 * 1.28]
            : [extinction550 * 0.94, extinction550, extinction550 * 1.10];
    const ashOpticalClass = input.volcanicAshOpticalClass ?? "moderately-absorbing";
    const singleScatteringAlbedoRgb: WeatherVec3 = input.kind === "blowing-snow"
        ? [0.995, 0.997, 0.998]
        : input.kind === "blowing-dust"
            ? [0.985, 0.965, 0.90]
            : VOLCANIC_ASH_ALBEDO[ashOpticalClass];
    const particleDiameterRangeMicrons: readonly [number, number] =
        input.kind === "blowing-snow" ? [30, 2_000]
            : input.kind === "blowing-dust" ? [0.1, 300] : [0.5, 500];
    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        owner: input.owner,
        kind: input.kind,
        centerEastNorthKm: input.centerEastNorthKm,
        majorRadiusKm: clamp(input.majorRadiusKm, 0.08, 800),
        minorRadiusKm: clamp(input.minorRadiusKm, 0.04, 400),
        orientationRadians: input.orientationRadians,
        topAltitudeKm: clamp(input.topAltitudeKm, 0.005, 3.5),
        boundaryTransitionFraction: clamp(0.14 + hash01(input.seed, 4) * 0.16, 0.1, 0.34),
        windEastNorthMps: [
            Math.sin(input.windDirectionRadians) * input.windSpeedMps,
            Math.cos(input.windDirectionRadians) * input.windSpeedMps,
        ],
        frictionVelocityMps: clamp(input.frictionVelocityMps, 0.08, 3),
        visibilityKm: visibility,
        extinctionRgbKm: extinctionRgb,
        singleScatteringAlbedoRgb,
        asymmetry: input.kind === "blowing-snow" ? 0.86
            : input.kind === "blowing-dust" ? 0.73 : 0.62,
        particleMedianDiameterMicrons: clamp(input.particleMedianDiameterMicrons,
            particleDiameterRangeMicrons[0],
            particleDiameterRangeMicrons[1]),
        particleDiameterRangeMicrons,
        particleDensityKgM3: input.kind === "blowing-snow" ? 917
            : input.kind === "blowing-dust" ? 2_650 : 2_300,
        provenance: input.kind === "blowing-snow" ? "erodible-snowpack"
            : input.kind === "blowing-dust" ? "erodible-mineral-soil"
                : "resuspended-volcanic-deposit",
        ...(input.kind === "volcanic-ash" ? {
            volcanicAshOpticalClass: ashOpticalClass,
        } : {}),
        seed: input.seed,
        validity: { valid: reasons.length === 0, reasons },
    };
};

export interface BlowingBoundaryLayerSample {
    extinctionRgbKm: WeatherVec3;
    singleScatteringAlbedoRgb: WeatherVec3;
    asymmetry: number;
    sourceWeight: number;
    velocityEastAltitudeNorthMps: WeatherVec3;
}

export const evaluateBlowingBoundaryLayer = (
    state: BlowingBoundaryLayerState,
    positionEastAltitudeNorthKm: WeatherVec3,
    timeSeconds: number,
): BlowingBoundaryLayerSample => {
    if (!state.validity.valid || positionEastAltitudeNorthKm[1] < 0 ||
        positionEastAltitudeNorthKm[1] > state.topAltitudeKm) {
        return { extinctionRgbKm: [0, 0, 0], singleScatteringAlbedoRgb: [0, 0, 0],
            asymmetry: state.asymmetry, sourceWeight: 0,
            velocityEastAltitudeNorthMps: [0, 0, 0] };
    }
    const advectedCenter: WeatherVec2 = [
        state.centerEastNorthKm[0] + state.windEastNorthMps[0] * timeSeconds / 1_000,
        state.centerEastNorthKm[1] + state.windEastNorthMps[1] * timeSeconds / 1_000,
    ];
    const delta: WeatherVec2 = [
        positionEastAltitudeNorthKm[0] - advectedCenter[0],
        positionEastAltitudeNorthKm[2] - advectedCenter[1],
    ];
    const sine = Math.sin(state.orientationRadians);
    const cosine = Math.cos(state.orientationRadians);
    const localX = (delta[0] * sine + delta[1] * cosine) / state.majorRadiusKm;
    const localY = (delta[0] * cosine - delta[1] * sine) / state.minorRadiusKm;
    const angle = Math.atan2(localY, localX);
    const dynamicSeed = weatherPhenomenonShaderSeed(state.seed) * 4_096;
    const irregularBoundary = 1 + 0.08 * Math.sin(angle * 3 +
        shaderHash11(dynamicSeed + 11) * TAU) +
        0.045 * Math.sin(angle * 7 - shaderHash11(dynamicSeed + 12) * TAU);
    const radius = Math.hypot(localX, localY) / Math.max(0.75, irregularBoundary);
    const horizontal = 1 - smoothstep(
        1 - state.boundaryTransitionFraction,
        1 + state.boundaryTransitionFraction,
        radius,
    );
    const normalizedAltitude = positionEastAltitudeNorthKm[1] / state.topAltitudeKm;
    const verticalScale = state.kind === "blowing-snow" ? 0.16
        : state.kind === "blowing-dust" ? 0.28 : 0.36;
    const vertical = Math.exp(-normalizedAltitude / verticalScale) *
        (1 - smoothstep(0.76, 1, normalizedAltitude));
    const streak = 0.78 + 0.22 * Math.sin(
        delta[0] * 5.1 + delta[1] * 2.7 + timeSeconds * 2.2 +
            shaderHash11(dynamicSeed + 19) * TAU);
    const sourceWeight = saturate(horizontal * vertical * streak);
    return {
        extinctionRgbKm: scale3(state.extinctionRgbKm, sourceWeight),
        singleScatteringAlbedoRgb: state.singleScatteringAlbedoRgb,
        asymmetry: state.asymmetry,
        sourceWeight,
        velocityEastAltitudeNorthMps: [
            state.windEastNorthMps[0],
            state.frictionVelocityMps * 0.16,
            state.windEastNorthMps[1],
        ],
    };
};

/**
 * Structural adapter for the shared ordered-volume API. The supplied incident
 * radiance must already include atmosphere attenuation and the directional
 * phase response for this sample; this function spends sigma_s exactly once.
 */
export interface BlowingBoundaryOrderedMediumSample {
    ownerId: string;
    mediumKind: BlowingPhenomenonKind;
    extinctionPerKm: WeatherVec3;
    scatteringPerKm: WeatherVec3;
    scatteredIncidentRadiance: WeatherVec3;
    sourceCoefficientPerKm: WeatherVec3;
    asymmetry: number;
    sourceWeight: number;
    velocityEastAltitudeNorthMps: WeatherVec3;
}

export const evaluateBlowingBoundaryOrderedMedium = (
    state: BlowingBoundaryLayerState,
    positionEastAltitudeNorthKm: WeatherVec3,
    timeSeconds: number,
    phaseWeightedIncidentRadiance: WeatherVec3 = [0, 0, 0],
): BlowingBoundaryOrderedMediumSample => {
    const sample = evaluateBlowingBoundaryLayer(
        state,
        positionEastAltitudeNorthKm,
        timeSeconds,
    );
    const incident: WeatherVec3 = [
        Math.max(0, phaseWeightedIncidentRadiance[0]),
        Math.max(0, phaseWeightedIncidentRadiance[1]),
        Math.max(0, phaseWeightedIncidentRadiance[2]),
    ];
    const scattering = mul3(
        sample.extinctionRgbKm,
        sample.singleScatteringAlbedoRgb,
    );
    return {
        ownerId: state.owner.id,
        mediumKind: state.kind,
        extinctionPerKm: sample.extinctionRgbKm,
        scatteringPerKm: scattering,
        scatteredIncidentRadiance: incident,
        sourceCoefficientPerKm: mul3(scattering, incident),
        asymmetry: sample.asymmetry,
        sourceWeight: sample.sourceWeight,
        velocityEastAltitudeNorthMps: sample.velocityEastAltitudeNorthMps,
    };
};

// Fixed, deterministic parity fixture inputs. Tests lock the CPU reference and
// WGSL equations without requiring a GPU validation process.
export const WEATHER_PHENOMENA_PARITY_FIXTURES = Object.freeze({
    angularGaussian: Object.freeze({ theta: 2.41, center: 2.42, sigma: 0.035 }),
    corona: Object.freeze({ theta: 0.031, radius: 11, variance: 0.09,
        wavelength: 0.550 }),
    lightningPulse: Object.freeze({ elapsed: 0.00042, rise: 0.00005, decay: 0.0012 }),
    auroraAltitudeKm: 112,
    boundaryVisibilityKm: 0.8,
    shaderSeed: 101,
});

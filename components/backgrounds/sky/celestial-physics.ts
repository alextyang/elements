/**
 * Scene-linear celestial and natural-night reference model.
 *
 * This module deliberately does not know about display exposure or tone
 * mapping.  It describes top-of-atmosphere point/extended sources, emitters
 * inside the atmosphere, and upward ground emission as different transport
 * classes.  Consumers must attenuate each class exactly once and apply the one
 * shared scene exposure only after atmosphere, clouds and celestial radiance
 * have been composed.
 */

export type CelestialVec2 = readonly [number, number];
export type CelestialVec3 = readonly [number, number, number];

/** Increment when a packed consumer-visible field or WGSL signature changes. */
export const CELESTIAL_PHYSICS_ABI_VERSION = 3 as const;

/**
 * Canonical source order. Clouds/hydrometeors consume the resulting observer-
 * side atmosphere radiance later as their own affine transport layer.
 */
export const CELESTIAL_RADIANCE_ORDER = Object.freeze([
    "galactic-and-zodiacal-boundary",
    "catalogue-stars",
    "resolved-sun",
    "resolved-moon",
    "atmosphere-and-airglow",
    "clouds-and-hydrometeors",
    "shared-exposure-and-output-transform",
] as const);

/** Texture semantics expected by the lunar CPU and WGSL evaluators. */
export const CELESTIAL_LUNAR_TEXTURE_CONTRACT = Object.freeze({
    albedo: "linear-reflectance-rgb" as const,
    surfaceNormal: "signed-tangent-space-elevation-normal" as const,
    normalConvention: "+x-east,+y-north,+z-outward" as const,
    colorTransform: "none-before-photometry" as const,
    uAddressMode: "repeat-longitude" as const,
    vAddressMode: "clamp-latitude" as const,
    lodSelection: "explicit-footprint-from-disc-jacobian" as const,
    limbNormalPolicy: "fade-terrain-normal-to-geometric-normal" as const,
    missingNormal: Object.freeze([0, 0, 1] as const),
});

/**
 * NASA SVS Moon frames are geometry/appearance references, not calibrated
 * radiance measurements. A consumer must decode them to linear light,
 * integrate the disc profile, and normalize that profile to the same ROLO
 * disk-integrated target used by the analytic BRDF. Phase brightness is never
 * multiplied onto an already phase-resolved image.
 */
export const CELESTIAL_LUNAR_IMAGE_RADIANCE_CONTRACT = Object.freeze({
    sourceSemantics: "non-radiometric-phase-resolved-profile" as const,
    decodedDomain: "scene-linear-relative-profile" as const,
    blackFramePolicy: "exclude-outside-geometric-disc" as const,
    normalization: "solid-angle-integral-to-rolo-target" as const,
    phaseApplicationCount: 1 as const,
    exposureApplication: "shared-after-full-scene-composition" as const,
});

export const CELESTIAL_PHYSICS_CONSTANTS = Object.freeze({
    pi: Math.PI,
    sunVisualMagnitude: -26.74,
    solarAngularRadiusRadians: 0.2666 * Math.PI / 180,
    rgbWavelengthsNm: Object.freeze([680, 550, 440] as const),
    linearRgbLuminance: Object.freeze([0.2126, 0.7152, 0.0722] as const),
    minMoffatBeta: 1.05,
    // Full-Earth geometric albedo times its solid-angle dilution at the Moon.
    // This is physical source energy, not display-domain dark-side visibility.
    maxEarthshineRatio: 1.2e-4,
    astronomicalUnitKm: 149_597_870.7,
    solarPhotosphericRadiusKm: 695_700,
    earthRadiusKm: 6360,
    airglowBottomKm: 84,
    airglowTopKm: 101,
});

const PI = CELESTIAL_PHYSICS_CONSTANTS.pi;
const TAU = PI * 2;
const RGB_LUMINANCE = CELESTIAL_PHYSICS_CONSTANTS.linearRgbLuminance;

const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const saturate = (value: number) => clamp(value, 0, 1);
const fract = (value: number) => value - Math.floor(value);
const smoothstep = (low: number, high: number, value: number) => {
    const t = saturate((value - low) / Math.max(1e-12, high - low));
    return t * t * (3 - 2 * t);
};
const dot3 = (left: CelestialVec3, right: CelestialVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const length3 = (value: CelestialVec3) => Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value: CelestialVec3): CelestialVec3 => {
    const length = length3(value);
    return length > 1e-12
        ? [value[0] / length, value[1] / length, value[2] / length]
        : [0, 1, 0];
};
const scale3 = (value: CelestialVec3, amount: number): CelestialVec3 =>
    [value[0] * amount, value[1] * amount, value[2] * amount];
const add3 = (left: CelestialVec3, right: CelestialVec3): CelestialVec3 =>
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
const subtract3 = (left: CelestialVec3, right: CelestialVec3): CelestialVec3 =>
    [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
const mul3 = (left: CelestialVec3, right: CelestialVec3): CelestialVec3 =>
    [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
const cross3 = (left: CelestialVec3, right: CelestialVec3): CelestialVec3 => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];
const mix3 = (left: CelestialVec3, right: CelestialVec3, amount: number): CelestialVec3 =>
    [
        left[0] + (right[0] - left[0]) * amount,
        left[1] + (right[1] - left[1]) * amount,
        left[2] + (right[2] - left[2]) * amount,
    ];
const luminance3 = (value: CelestialVec3) => dot3(value, RGB_LUMINANCE);

// ---------------------------------------------------------------------------
// Catalogue stars, seeing and turbulence
// ---------------------------------------------------------------------------

/** Integrated V-band point-source flux relative to the Sun. */
export const stellarFluxRelativeToSun = (visualMagnitude: number) =>
    10 ** (-0.4 * (visualMagnitude - CELESTIAL_PHYSICS_CONSTANTS.sunVisualMagnitude));

/** Ballesteros B-V colour-temperature approximation, bounded to real stars. */
export const stellarTemperatureFromBv = (bv: number) => {
    const bounded = clamp(bv, -0.4, 2.4);
    return clamp(
        4600 * (
            1 / (0.92 * bounded + 1.7) +
            1 / (0.92 * bounded + 0.62)
        ),
        2400,
        40_000,
    );
};

/** Planckian-locus chromaticity converted from CIE XYZ to linear sRGB. */
export const stellarLinearRgbFromTemperature = (
    temperatureKelvin: number,
): CelestialVec3 => {
    const temperature = clamp(temperatureKelvin, 1_667, 25_000);
    const inverse = 1 / temperature;
    const inverse2 = inverse * inverse;
    const inverse3 = inverse2 * inverse;
    const x = temperature <= 4_000
        ? -0.2661239e9 * inverse3 - 0.2343580e6 * inverse2 +
            0.8776956e3 * inverse + 0.179910
        : -3.0258469e9 * inverse3 + 2.1070379e6 * inverse2 +
            0.2226347e3 * inverse + 0.240390;
    const y = temperature <= 2_222
        ? -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x -
            0.20219683
        : temperature <= 4_000
            ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x -
                0.16748867
            : 3.0817580 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x -
                0.37001483;
    const xyz: CelestialVec3 = [
        x / Math.max(1e-6, y),
        1,
        Math.max(0, (1 - x - y) / Math.max(1e-6, y)),
    ];
    const linearRgb: CelestialVec3 = [
        3.2406 * xyz[0] - 1.5372 * xyz[1] - 0.4986 * xyz[2],
        -0.9689 * xyz[0] + 1.8758 * xyz[1] + 0.0415 * xyz[2],
        0.0557 * xyz[0] - 0.2040 * xyz[1] + 1.0570 * xyz[2],
    ];
    const nonnegative: CelestialVec3 = [
        Math.max(0, linearRgb[0]),
        Math.max(0, linearRgb[1]),
        Math.max(0, linearRgb[2]),
    ];
    return scale3(nonnegative, 1 / Math.max(1e-8, luminance3(nonnegative)));
};

/**
 * Linear RGB spectral shape from B-V. Its linear-sRGB luminance is exactly one,
 * so multiplying it by catalogue V-band flux preserves magnitude ratios.
 */
export const stellarLinearRgbFromBv = (bv: number): CelestialVec3 => {
    return stellarLinearRgbFromTemperature(stellarTemperatureFromBv(bv));
};

export interface StellarSourceSample {
    /** Integrated V-band flux; independent of detection and exposure. */
    visualFluxRelativeToSun: number;
    /** Unit-luminance spectrum before atmosphere transport. */
    spectralShapeRgb: CelestialVec3;
    /** Scene-linear point-source flux entering the top of the atmosphere. */
    topOfAtmosphereFluxRgb: CelestialVec3;
    /** Same point-source flux after the supplied foreground transmittance. */
    observerFluxRgb: CelestialVec3;
}

export const createStellarSourceSample = (
    visualMagnitude: number,
    bv: number,
    foregroundTransmittance: CelestialVec3 = [1, 1, 1],
): StellarSourceSample => {
    const visualFluxRelativeToSun = stellarFluxRelativeToSun(visualMagnitude);
    const spectralShapeRgb = stellarLinearRgbFromBv(bv);
    const topOfAtmosphereFluxRgb = scale3(spectralShapeRgb, visualFluxRelativeToSun);
    return {
        visualFluxRelativeToSun,
        spectralShapeRgb,
        topOfAtmosphereFluxRgb,
        observerFluxRgb: mul3(topOfAtmosphereFluxRgb, foregroundTransmittance),
    };
};

export interface EnergyNormalizedMoffatPsf {
    /** Full width at half maximum in the caller's coordinate units. */
    fwhm: number;
    /** Wing exponent; values around 2.5–4.5 are typical seeing profiles. */
    beta: number;
    /** Fraction of integrated energy assigned to the wider component. */
    wingFraction: number;
    /** Wide-component FWHM divided by core FWHM. */
    wingScale: number;
}

export const createEnergyNormalizedMoffatPsf = (
    fwhm: number,
    beta = 3.5,
    wingFraction = 0.035,
    wingScale = 4.5,
): EnergyNormalizedMoffatPsf => ({
    fwhm: clamp(fwhm, 1e-7, 1e6),
    beta: clamp(beta, CELESTIAL_PHYSICS_CONSTANTS.minMoffatBeta, 12),
    wingFraction: clamp(wingFraction, 0, 0.35),
    wingScale: clamp(wingScale, 1.001, 32),
});

export const moffatAlphaFromFwhm = (fwhm: number, beta: number) =>
    Math.max(1e-12, fwhm) /
    (2 * Math.sqrt(Math.max(1e-12, 2 ** (1 / Math.max(1.001, beta)) - 1)));

/** Energy density per square coordinate unit. Its plane integral is one. */
export const evaluateNormalizedMoffat = (
    radius: number,
    fwhm: number,
    beta: number,
) => {
    const boundedBeta = Math.max(CELESTIAL_PHYSICS_CONSTANTS.minMoffatBeta, beta);
    const alpha = moffatAlphaFromFwhm(fwhm, boundedBeta);
    const radiusSquared = Math.max(0, radius) ** 2;
    return (boundedBeta - 1) / (PI * alpha * alpha) *
        (1 + radiusSquared / (alpha * alpha)) ** -boundedBeta;
};

export const evaluateStellarPsf = (
    radius: number,
    psf: EnergyNormalizedMoffatPsf,
) => {
    const core = evaluateNormalizedMoffat(radius, psf.fwhm, psf.beta);
    const wing = evaluateNormalizedMoffat(
        radius,
        psf.fwhm * psf.wingScale,
        Math.max(1.08, psf.beta - 0.8),
    );
    return core * (1 - psf.wingFraction) + wing * psf.wingFraction;
};

export const moffatEncircledEnergy = (
    radius: number,
    fwhm: number,
    beta: number,
) => {
    const boundedBeta = Math.max(CELESTIAL_PHYSICS_CONSTANTS.minMoffatBeta, beta);
    const alpha = moffatAlphaFromFwhm(fwhm, boundedBeta);
    return saturate(1 - (1 + Math.max(0, radius) ** 2 / (alpha * alpha)) **
        (1 - boundedBeta));
};

export const stellarPsfEncircledEnergy = (
    radius: number,
    psf: EnergyNormalizedMoffatPsf,
) => (1 - psf.wingFraction) * moffatEncircledEnergy(radius, psf.fwhm, psf.beta) +
    psf.wingFraction * moffatEncircledEnergy(
        radius,
        psf.fwhm * psf.wingScale,
        Math.max(1.08, psf.beta - 0.8),
    );

export const stellarPsfSupportRadius = (
    psf: EnergyNormalizedMoffatPsf,
    retainedEnergy = 0.9995,
) => {
    const target = clamp(retainedEnergy, 0.9, 0.999999);
    let low = 0;
    let high = psf.fwhm * psf.wingScale;
    while (stellarPsfEncircledEnergy(high, psf) < target && high < psf.fwhm * 1e5) {
        high *= 2;
    }
    for (let iteration = 0; iteration < 48; iteration += 1) {
        const middle = (low + high) * 0.5;
        if (stellarPsfEncircledEnergy(middle, psf) < target) low = middle;
        else high = middle;
    }
    return high;
};

export interface StellarTurbulenceInput {
    timeSeconds: number;
    seed: number;
    relativeAirMass: number;
    apertureDiameterMm: number;
    exposureSeconds: number;
    observerAltitudeMetres?: number;
    seeingFwhmArcseconds?: number;
    chromaticStrength?: number;
    turbulenceFrequencyHz?: number;
}

export interface StellarTurbulenceState {
    /** Correlated, positive RGB flux multiplier. */
    rgbGain: CelestialVec3;
    /** Achromatic multiplier whose long-time expectation is approximately one. */
    commonIntensityGain: number;
    /** Image motion in angular arcseconds; not baked into PSF width. */
    tipTiltArcseconds: CelestialVec2;
    /** RMS fractional intensity used to derive the log-normal process. */
    intensityRms: number;
    /** Seeing FWHM to convert to the renderer's angular/pixel PSF units. */
    seeingFwhmArcseconds: number;
}

const hash11 = (value: number) => fract(Math.sin(value * 127.1) * 43_758.5453123);
const noise1 = (value: number) => {
    const cell = Math.floor(value);
    const local = fract(value);
    const eased = local * local * (3 - 2 * local);
    return (hash11(cell) + (hash11(cell + 1) - hash11(cell)) * eased) * 2 - 1;
};
const turbulenceNoise = (time: number, seed: number) =>
    noise1(time * 0.43 + seed * 113) * 0.28 +
    noise1(time * 1.73 + seed * 271) * 0.46 +
    noise1(time * 4.21 + seed * 619) * 0.26;

/**
 * Young-family finite-aperture scintillation with correlated colour and a
 * separate image-motion process. It returns source modulation only; detection,
 * exposure and tone mapping are intentionally absent.
 */
export const createStellarTurbulenceState = ({
    timeSeconds,
    seed,
    relativeAirMass,
    apertureDiameterMm,
    exposureSeconds,
    observerAltitudeMetres = 0,
    seeingFwhmArcseconds = 1.4,
    chromaticStrength = 1,
    turbulenceFrequencyHz = 1,
}: StellarTurbulenceInput): StellarTurbulenceState => {
    const airMass = clamp(relativeAirMass, 1, 40);
    const apertureCm = clamp(apertureDiameterMm / 10, 0.2, 1_000);
    const temporalAverage = Math.sqrt(Math.max(1, 2 * exposureSeconds * 60));
    const intensityRms = clamp(
        0.09 * apertureCm ** (-2 / 3) * airMass ** 1.75 *
            Math.exp(-Math.max(0, observerAltitudeMetres) / 8_000) /
            temporalAverage,
        0,
        0.42,
    );
    const logSigma = Math.sqrt(Math.log1p(intensityRms * intensityRms));
    const time = timeSeconds * clamp(turbulenceFrequencyHz, 0.05, 12);
    const commonNoise = turbulenceNoise(time, seed);
    const commonIntensityGain = Math.exp(
        commonNoise * logSigma - 0.5 * logSigma * logSigma,
    );

    const dispersion = saturate((airMass - 1) / 15) *
        clamp(chromaticStrength, 0, 2) * logSigma * 0.32;
    const chromaticA = turbulenceNoise(time * 1.19 + 17.3, seed + 7.17);
    const chromaticB = turbulenceNoise(time * 0.91 + 41.9, seed + 19.31);
    const rawChromatic: CelestialVec3 = [
        Math.exp(dispersion * (0.7071 * chromaticA + 0.4082 * chromaticB)),
        Math.exp(dispersion * (-0.8165 * chromaticB)),
        Math.exp(dispersion * (-0.7071 * chromaticA + 0.4082 * chromaticB)),
    ];
    // Chromatic scintillation redistributes colour around the independently
    // sampled achromatic intensity instead of inventing extra stellar energy.
    const chromaticNormalization = Math.max(1e-6, luminance3(rawChromatic));
    const rgbGain = scale3(rawChromatic, commonIntensityGain / chromaticNormalization);

    const tipTiltRms = clamp(
        Math.max(0.1, seeingFwhmArcseconds) *
            (0.055 + 0.16 * saturate((airMass - 1) / 8)) *
            clamp((25 / Math.max(2, apertureDiameterMm)) ** 0.16, 0.65, 1.8),
        0.005,
        1.5,
    );
    const tipTiltArcseconds: CelestialVec2 = [
        turbulenceNoise(time * 0.67 + 83.1, seed + 31.7) * tipTiltRms,
        turbulenceNoise(time * 0.59 + 129.7, seed + 53.9) * tipTiltRms,
    ];

    return {
        rgbGain,
        commonIntensityGain,
        tipTiltArcseconds,
        intensityRms,
        seeingFwhmArcseconds: clamp(seeingFwhmArcseconds, 0.15, 12),
    };
};

export interface StellarRenderSampleInput extends StellarTurbulenceInput {
    visualMagnitude: number;
    bv: number;
    foregroundTransmittanceRgb?: CelestialVec3;
    psfBeta?: number;
    psfWingFraction?: number;
    psfWingScale?: number;
}

export interface StellarRenderSample {
    /** Source state remains integrated angular flux, never display intensity. */
    source: StellarSourceSample;
    turbulence: StellarTurbulenceState;
    /** Angular energy density kernel. FWHM and support are in radians. */
    angularPsf: EnergyNormalizedMoffatPsf;
    angularSupportRadiusRadians: number;
    /** Observer flux after transmittance and flux-conserving scintillation. */
    observerFluxRgb: CelestialVec3;
}

const stellarPsfSupportScaleCache = new Map<string, number>();

const stellarPsfSupportScale = (
    psf: EnergyNormalizedMoffatPsf,
    retainedEnergy = 0.9995,
) => {
    const key = [
        psf.beta.toFixed(6),
        psf.wingFraction.toFixed(6),
        psf.wingScale.toFixed(6),
        retainedEnergy.toFixed(7),
    ].join(":");
    const cached = stellarPsfSupportScaleCache.get(key);
    if (cached !== undefined) return cached;
    const unitPsf = { ...psf, fwhm: 1 };
    const scale = stellarPsfSupportRadius(unitPsf, retainedEnergy);
    // The scene has a tiny fixed family of PSF shapes. Bound the cache anyway
    // so arbitrary lab inputs cannot turn it into unbounded retained state.
    if (stellarPsfSupportScaleCache.size >= 32) {
        stellarPsfSupportScaleCache.delete(
            stellarPsfSupportScaleCache.keys().next().value as string,
        );
    }
    stellarPsfSupportScaleCache.set(key, scale);
    return scale;
};

/**
 * Concrete catalogue-to-render record. Detection probability and exposure are
 * intentionally absent: callers may cull with detection metadata, but must not
 * multiply surviving source energy by it.
 */
export const createStellarRenderSample = (
    input: StellarRenderSampleInput,
): StellarRenderSample => {
    const source = createStellarSourceSample(
        input.visualMagnitude,
        input.bv,
        input.foregroundTransmittanceRgb,
    );
    const turbulence = createStellarTurbulenceState(input);
    const radiansPerArcsecond = PI / (180 * 3_600);
    const angularPsf = createEnergyNormalizedMoffatPsf(
        turbulence.seeingFwhmArcseconds * radiansPerArcsecond,
        input.psfBeta,
        input.psfWingFraction,
        input.psfWingScale,
    );
    return {
        source,
        turbulence,
        angularPsf,
        angularSupportRadiusRadians:
            angularPsf.fwhm * stellarPsfSupportScale(angularPsf),
        observerFluxRgb: mul3(source.observerFluxRgb, turbulence.rgbGain),
    };
};

// ---------------------------------------------------------------------------
// Lunar surface, analytic antialiasing and ordered composition
// ---------------------------------------------------------------------------

export interface LunarPhotometryParameters {
    singleScatteringAlbedo: number;
    backscatterAsymmetry: number;
    secondaryLobeWeight: number;
    oppositionAmplitude: number;
    oppositionWidthRadians: number;
    roughnessRadians: number;
    /** Reference reflectance represented by the Hapke single-scattering state. */
    referenceAlbedo: number;
}

export const DEFAULT_LUNAR_PHOTOMETRY: Readonly<LunarPhotometryParameters> =
    Object.freeze({
        singleScatteringAlbedo: 0.42,
        backscatterAsymmetry: 0.32,
        secondaryLobeWeight: 0.12,
        oppositionAmplitude: 1.05,
        oppositionWidthRadians: 0.035,
        roughnessRadians: 0.34,
        referenceAlbedo: 0.12,
    });

/** Two vec4 values matching the WGSL `CelestialLunarPhotometry` layout. */
export const packLunarPhotometry = (
    overrides: Partial<LunarPhotometryParameters> = {},
) => {
    const value = { ...DEFAULT_LUNAR_PHOTOMETRY, ...overrides };
    return new Float32Array([
        clamp(value.singleScatteringAlbedo, 0.01, 0.99),
        clamp(value.backscatterAsymmetry, 0, 0.9),
        saturate(value.secondaryLobeWeight),
        Math.max(0, value.oppositionAmplitude),
        clamp(value.oppositionWidthRadians, 1e-4, PI),
        clamp(value.roughnessRadians, 0, 1.2),
        clamp(value.referenceAlbedo, 0.01, 0.95),
        0,
    ]);
};

export interface LunarTerrainNormalInput {
    geometricNormal: CelestialVec3;
    tangentDirection: CelestialVec3;
    bitangentDirection: CelestialVec3;
    /** Decoded signed SLDEM/LOLA-derived tangent-space normal. */
    elevationNormalTangentSpace: CelestialVec3;
    normalStrength?: number;
}

/**
 * Reconstruct the outward lunar surface normal from a registered elevation-
 * normal texture. The handedness follows `CELESTIAL_LUNAR_TEXTURE_CONTRACT`.
 */
export const reconstructLunarSurfaceNormal = ({
    geometricNormal,
    tangentDirection,
    bitangentDirection,
    elevationNormalTangentSpace,
    normalStrength = 1,
}: LunarTerrainNormalInput): CelestialVec3 => {
    const normal = normalize3(geometricNormal);
    const projectedTangent = subtract3(
        tangentDirection,
        scale3(normal, dot3(tangentDirection, normal)),
    );
    const tangent = length3(projectedTangent) > 1e-8
        ? normalize3(projectedTangent)
        : normalize3(cross3(
            Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
            normal,
        ));
    const canonicalBitangent = normalize3(cross3(normal, tangent));
    const bitangent = dot3(canonicalBitangent, bitangentDirection) < 0
        ? scale3(canonicalBitangent, -1)
        : canonicalBitangent;
    const localInput: CelestialVec3 = [
        elevationNormalTangentSpace[0] * clamp(normalStrength, 0, 4),
        elevationNormalTangentSpace[1] * clamp(normalStrength, 0, 4),
        Math.max(0, elevationNormalTangentSpace[2]),
    ];
    const local = length3(localInput) > 1e-8
        ? normalize3(localInput)
        : [0, 0, 1] as const;
    return normalize3(add3(
        add3(scale3(tangent, local[0]), scale3(bitangent, local[1])),
        scale3(normal, local[2]),
    ));
};

export interface LunarSurfaceInput {
    surfaceNormal: CelestialVec3;
    sunDirection: CelestialVec3;
    observerDirection: CelestialVec3;
    /** Registered LRO/LOLA-derived linear albedo at the surface point. */
    albedoRgb: CelestialVec3;
    /** Unattenuated solar irradiance incident at lunar orbit. */
    solarTopOfAtmosphereIrradianceRgb: CelestialVec3;
    illuminatedFraction: number;
    earthAlbedoFactor?: number;
    /** Optional disk-integrated ROLO calibration; defaults to energy-neutral RGB. */
    roloCalibrationRgb?: CelestialVec3;
    photometry?: Partial<LunarPhotometryParameters>;
}

export interface LunarDiskPhotometricCalibration {
    phaseAngleRadians: number;
    illuminatedFraction: number;
    distanceScale: number;
    /** Disk-integrated irradiance relative to mean-distance full Moon. */
    relativeIrradiance: number;
    /** Unit-luminance restrained phase-reddening calibration. */
    roloCalibrationRgb: CelestialVec3;
}

export type LunarDiscProfileKind =
    | "nasa-svs-phase-profile"
    | "analytic-hapke-profile";

/**
 * One disk-integrated lunar source contract shared by photographic and
 * analytic surface profiles. `topOfAtmosphereIrradianceRgb` is the one and
 * only phase/distance brightness target. A resolved profile supplies spatial
 * structure and is normalized to this target before atmosphere transport.
 */
export interface LunarDiscRadianceContract {
    profileKind: LunarDiscProfileKind;
    angularRadiusRadians: number;
    solidAngleSteradians: number;
    photometry: LunarDiskPhotometricCalibration;
    /** Mean-distance full-Moon irradiance in the renderer's scene-linear domain. */
    fullMoonTopOfAtmosphereIrradianceRgb: CelestialVec3;
    /** Phase-, distance-, and ROLO-colour-corrected disk-integrated target. */
    topOfAtmosphereIrradianceRgb: CelestialVec3;
    /** Direct atmosphere transfer from the shared physical atmosphere state. */
    observerTransmittanceRgb: CelestialVec3;
    /** Disk-integrated direct irradiance after atmosphere, before clouds. */
    observedDirectIrradianceRgb: CelestialVec3;
    /** Mean disc radiance; profiles integrate back to this source energy. */
    meanTopOfAtmosphereRadianceRgb: CelestialVec3;
    /** Common exposure is intentionally not inverted or baked into the source. */
    commonExposureScale: 1;
    phaseApplicationCount: 1;
}

export interface LunarDiscProfileCalibration {
    profileKind: LunarDiscProfileKind;
    /** Integral of the decoded/analytic relative profile over the lunar disc. */
    profileSolidAngleIntegralRgb: CelestialVec3;
    /** Multiplier converting that relative profile to calibrated TOA radiance. */
    profileToTopOfAtmosphereRadianceScaleRgb: CelestialVec3;
}

export const LUNAR_DISC_RADIANCE_ABI = Object.freeze({
    version: CELESTIAL_PHYSICS_ABI_VERSION,
    floatCount: 24,
    vec4Count: 6,
    profileKindCode: Object.freeze({
        "nasa-svs-phase-profile": 0,
        "analytic-hapke-profile": 1,
    } satisfies Record<LunarDiscProfileKind, number>),
});

/** Krisciunas-Schaefer phase law with restrained ROLO-like opposition/color. */
export const createLunarDiskPhotometricCalibration = (
    phaseAngleRadians: number,
    distanceKm = 384_400,
): LunarDiskPhotometricCalibration => {
    const phase = clamp(phaseAngleRadians, 0, PI);
    const phaseDegrees = phase * 180 / PI;
    const phaseMagnitude = 0.026 * phaseDegrees + 4e-9 * phaseDegrees ** 4;
    const oppositionProgress = saturate((7 - phaseDegrees) / 7);
    const oppositionSurge = 1 + oppositionProgress ** 2 * 0.24;
    const phaseRelative = saturate(
        10 ** (-0.4 * phaseMagnitude) * oppositionSurge / 1.24,
    );
    const distanceScale = clamp(384_400 / Math.max(340_000, distanceKm), 0.88, 1.14);
    const phaseReddening = smoothstep(18 * PI / 180, 145 * PI / 180, phase);
    const rawCalibration: CelestialVec3 = [
        1 + phaseReddening * 0.035,
        1,
        1 - phaseReddening * 0.052,
    ];
    const roloCalibrationRgb = scale3(
        rawCalibration,
        1 / Math.max(1e-8, luminance3(rawCalibration)),
    );
    return {
        phaseAngleRadians: phase,
        illuminatedFraction: (1 + Math.cos(phase)) * 0.5,
        distanceScale,
        relativeIrradiance: phaseRelative * distanceScale ** 2,
        roloCalibrationRgb,
    };
};

export const createLunarDiscRadianceContract = (
    profileKind: LunarDiscProfileKind,
    angularRadiusRadians: number,
    fullMoonTopOfAtmosphereIrradianceRgb: CelestialVec3,
    photometry: LunarDiskPhotometricCalibration,
    observerTransmittanceRgb: CelestialVec3,
): LunarDiscRadianceContract => {
    const angularRadius = clamp(angularRadiusRadians, 1e-5, 0.02);
    const solidAngleSteradians = 2 * PI * (1 - Math.cos(angularRadius));
    const fullMoonIrradiance = fullMoonTopOfAtmosphereIrradianceRgb.map(
        (channel) => Math.max(0, channel),
    ) as unknown as CelestialVec3;
    const topOfAtmosphereIrradianceRgb = mul3(
        scale3(
            fullMoonIrradiance,
            photometry.relativeIrradiance,
        ),
        photometry.roloCalibrationRgb,
    );
    const transmittance = observerTransmittanceRgb.map((channel) =>
        clamp(channel, 0, 1)) as unknown as CelestialVec3;
    return {
        profileKind,
        angularRadiusRadians: angularRadius,
        solidAngleSteradians,
        photometry,
        fullMoonTopOfAtmosphereIrradianceRgb: fullMoonIrradiance,
        topOfAtmosphereIrradianceRgb,
        observerTransmittanceRgb: transmittance,
        observedDirectIrradianceRgb: mul3(
            topOfAtmosphereIrradianceRgb,
            transmittance,
        ),
        meanTopOfAtmosphereRadianceRgb: scale3(
            topOfAtmosphereIrradianceRgb,
            1 / Math.max(1e-12, solidAngleSteradians),
        ),
        commonExposureScale: 1,
        phaseApplicationCount: 1,
    };
};

/**
 * Calibrate either a phase-resolved NASA profile or an analytic BRDF profile
 * to the same disk-integrated lunar source. The supplied profile integral must
 * be measured before any ROLO phase target, atmosphere transfer, or exposure.
 */
export const createLunarDiscProfileCalibration = (
    contract: LunarDiscRadianceContract,
    profileSolidAngleIntegralRgb: CelestialVec3,
): LunarDiscProfileCalibration => ({
    profileKind: contract.profileKind,
    profileSolidAngleIntegralRgb:
        profileSolidAngleIntegralRgb.map((channel) =>
            Math.max(0, channel)) as unknown as CelestialVec3,
    profileToTopOfAtmosphereRadianceScaleRgb:
        contract.topOfAtmosphereIrradianceRgb.map((target, channel) => {
            const integral = profileSolidAngleIntegralRgb[channel];
            return integral > 1e-20 ? target / integral : 0;
        }) as unknown as CelestialVec3,
});

export const evaluateCalibratedLunarDiscProfile = (
    relativeProfileRadianceRgb: CelestialVec3,
    calibration: LunarDiscProfileCalibration,
): CelestialVec3 => mul3(
    relativeProfileRadianceRgb.map((channel) =>
        Math.max(0, channel)) as unknown as CelestialVec3,
    calibration.profileToTopOfAtmosphereRadianceScaleRgb,
);

export interface AnalyticLunarDiscProfileIntegralInput {
    angularRadiusRadians: number;
    sunDirectionInDiscFrame: CelestialVec3;
    illuminatedFraction: number;
    roloCalibrationRgb: CelestialVec3;
    /** Mean linear LROC reflectance represented by the currently loaded map. */
    meanAlbedoRgb?: CelestialVec3;
    /** Deterministic square quadrature resolution. Production defaults to 64. */
    gridSize?: number;
}

/**
 * Integrate the same phase-resolved Hapke profile evaluated by WGSL over the
 * apparent lunar solid angle. This integral is deliberately computed before
 * the disk ROLO target, atmosphere transfer, and exposure: the compositor can
 * therefore normalize changing phase geometry and either LROC or neutral
 * reference albedo to one disk-integrated source without a second phase law.
 */
export const integrateAnalyticLunarDiscProfileSolidAngle = ({
    angularRadiusRadians,
    sunDirectionInDiscFrame,
    illuminatedFraction,
    roloCalibrationRgb,
    meanAlbedoRgb = [
        DEFAULT_LUNAR_PHOTOMETRY.referenceAlbedo,
        DEFAULT_LUNAR_PHOTOMETRY.referenceAlbedo,
        DEFAULT_LUNAR_PHOTOMETRY.referenceAlbedo,
    ],
    gridSize = 64,
}: AnalyticLunarDiscProfileIntegralInput): CelestialVec3 => {
    const resolution = Math.round(clamp(gridSize, 16, 192));
    const cellWidth = 2 / resolution;
    const solidAnglePerDiscArea = clamp(
        angularRadiusRadians,
        1e-5,
        0.02,
    ) ** 2;
    const integral: [number, number, number] = [0, 0, 0];
    for (let row = 0; row < resolution; row += 1) {
        const y = -1 + (row + 0.5) * cellWidth;
        for (let column = 0; column < resolution; column += 1) {
            const x = -1 + (column + 0.5) * cellWidth;
            const radialSquared = x * x + y * y;
            if (radialSquared >= 1) continue;
            const sample = evaluateLunarSurface({
                surfaceNormal: [x, y, Math.sqrt(1 - radialSquared)],
                sunDirection: sunDirectionInDiscFrame,
                observerDirection: [0, 0, 1],
                albedoRgb: meanAlbedoRgb,
                solarTopOfAtmosphereIrradianceRgb: [1, 1, 1],
                illuminatedFraction,
                earthAlbedoFactor: 1,
                roloCalibrationRgb,
            });
            const weight = cellWidth * cellWidth * solidAnglePerDiscArea;
            integral[0] += sample.topOfAtmosphereRadianceRgb[0] * weight;
            integral[1] += sample.topOfAtmosphereRadianceRgb[1] * weight;
            integral[2] += sample.topOfAtmosphereRadianceRgb[2] * weight;
        }
    }
    return integral;
};

/** Six vec4 values matching the documented scene-linear lunar source ABI. */
export const packLunarDiscRadianceContract = (
    contract: LunarDiscRadianceContract,
): Float32Array => new Float32Array([
    ...contract.topOfAtmosphereIrradianceRgb,
    contract.angularRadiusRadians,
    ...contract.observerTransmittanceRgb,
    contract.solidAngleSteradians,
    ...contract.observedDirectIrradianceRgb,
    contract.commonExposureScale,
    ...contract.meanTopOfAtmosphereRadianceRgb,
    LUNAR_DISC_RADIANCE_ABI.profileKindCode[contract.profileKind],
    contract.photometry.relativeIrradiance,
    contract.photometry.illuminatedFraction,
    contract.photometry.distanceScale,
    contract.phaseApplicationCount,
    ...contract.photometry.roloCalibrationRgb,
    contract.photometry.phaseAngleRadians,
]);

export interface LunarSurfaceSample {
    topOfAtmosphereRadianceRgb: CelestialVec3;
    directSolarRadianceRgb: CelestialVec3;
    earthshineRadianceRgb: CelestialVec3;
    incidenceCosine: number;
    emissionCosine: number;
    phaseAngleRadians: number;
    bidirectionalReflectance: number;
    earthshineRatio: number;
}

const hapkeH = (cosine: number, singleScatteringAlbedo: number) =>
    (1 + 2 * Math.max(0, cosine)) /
    (1 + 2 * Math.max(0, cosine) * Math.sqrt(Math.max(1e-5,
        1 - singleScatteringAlbedo)));

const unnormalizedHenyeyGreenstein = (cosine: number, asymmetry: number) => {
    const g = clamp(asymmetry, -0.95, 0.95);
    return (1 - g * g) /
        Math.max(1e-7, 1 + g * g - 2 * g * cosine) ** 1.5;
};

export const lunarEarthshineRatio = (
    illuminatedFraction: number,
    earthAlbedoFactor = 1,
) => CELESTIAL_PHYSICS_CONSTANTS.maxEarthshineRatio *
    (1 - saturate(illuminatedFraction)) ** 1.65 *
    clamp(earthAlbedoFactor, 0.55, 1.45);

/** CPU reference for the WGSL Hapke-like lunar evaluator. */
export const evaluateLunarSurface = (input: LunarSurfaceInput): LunarSurfaceSample => {
    const normal = normalize3(input.surfaceNormal);
    const sun = normalize3(input.sunDirection);
    const observer = normalize3(input.observerDirection);
    const parameters: LunarPhotometryParameters = {
        ...DEFAULT_LUNAR_PHOTOMETRY,
        ...input.photometry,
    };
    const signedIncidence = dot3(normal, sun);
    const mu0 = Math.max(0, signedIncidence);
    const mu = Math.max(0, dot3(normal, observer));
    const phaseCosine = clamp(dot3(sun, observer), -1, 1);
    const phaseAngleRadians = Math.acos(phaseCosine);
    const secondaryWeight = saturate(parameters.secondaryLobeWeight);
    const phaseFunction =
        unnormalizedHenyeyGreenstein(
            phaseCosine,
            clamp(parameters.backscatterAsymmetry, 0, 0.9),
        ) * (1 - secondaryWeight) +
        unnormalizedHenyeyGreenstein(
            phaseCosine,
            -clamp(parameters.backscatterAsymmetry * 0.45, 0, 0.9),
        ) * secondaryWeight;
    const opposition = parameters.oppositionAmplitude /
        (1 + Math.tan(phaseAngleRadians * 0.5) /
            Math.max(1e-4, parameters.oppositionWidthRadians));
    const w = clamp(parameters.singleScatteringAlbedo, 0.01, 0.99);
    const multipleScattering = hapkeH(mu0, w) * hapkeH(mu, w) - 1;
    const slopePenalty = Math.tan(clamp(parameters.roughnessRadians, 0, 1.2)) ** 2;
    const roughnessShadow = Math.exp(-slopePenalty *
        ((1 - mu0) ** 2 + (1 - mu) ** 2) * 0.42);
    const bidirectionalReflectance = mu0 > 0 && mu > 0
        ? w / (4 * PI) * mu0 / Math.max(1e-5, mu0 + mu) *
            ((1 + opposition) * phaseFunction + multipleScattering) *
            roughnessShadow
        : 0;
    // The Hapke state establishes the reference material reflectance. LROC
    // albedo supplies spatial/chromatic modulation around that reference; this
    // avoids multiplying absolute albedo by single-scattering albedo twice.
    const referenceAlbedo = clamp(parameters.referenceAlbedo, 0.01, 0.95);
    const albedoModulationRgb: CelestialVec3 = [
        clamp(input.albedoRgb[0] / referenceAlbedo, 0, 4),
        clamp(input.albedoRgb[1] / referenceAlbedo, 0, 4),
        clamp(input.albedoRgb[2] / referenceAlbedo, 0, 4),
    ];
    const directSolarRadianceRgb = mul3(scale3(
        mul3(input.solarTopOfAtmosphereIrradianceRgb, albedoModulationRgb),
        bidirectionalReflectance,
    ), input.roloCalibrationRgb ?? [1, 1, 1]);
    const earthshineRatio = lunarEarthshineRatio(
        input.illuminatedFraction,
        input.earthAlbedoFactor,
    );
    // To first order Earth is colocated with the observer as seen from the
    // Moon. This is a deliberately tiny Lambertian secondary source.
    const earthshineRadianceRgb = scale3(
        mul3(input.solarTopOfAtmosphereIrradianceRgb, input.albedoRgb),
        earthshineRatio * mu / PI,
    );
    return {
        topOfAtmosphereRadianceRgb: add3(
            directSolarRadianceRgb,
            earthshineRadianceRgb,
        ),
        directSolarRadianceRgb,
        earthshineRadianceRgb,
        incidenceCosine: signedIncidence,
        emissionCosine: mu,
        phaseAngleRadians,
        bidirectionalReflectance,
        earthshineRatio,
    };
};

export interface LunarDiscGeometrySample {
    surfaceNormal: CelestialVec3;
    limbCoverage: number;
    radialDistance: number;
}

export interface LunarTextureCoordinateSample extends LunarDiscGeometrySample {
    /** Registered equirectangular LROC/LOLA coordinate, longitude wraps in U. */
    textureUv: CelestialVec2;
    /** Moon-fixed unit direction corresponding to the sampled surface point. */
    moonFixedDirection: CelestialVec3;
    /** Conservative angular footprint for explicit texture LOD selection. */
    textureFootprintRadians: number;
    /** Fade terrain normals to the geometric normal at an under-resolved limb. */
    terrainNormalReliability: number;
}

/** Analytic limb coverage; pass `fwidth(length(discUv))` in a shader. */
export const sampleLunarDiscGeometry = (
    discUv: CelestialVec2,
    radialPixelFootprint: number,
): LunarDiscGeometrySample => {
    const radialDistance = Math.hypot(discUv[0], discUv[1]);
    const footprint = clamp(radialPixelFootprint, 1e-6, 0.25);
    const limbCoverage = 1 - smoothstep(1 - footprint, 1 + footprint, radialDistance);
    const clampedRadius = Math.min(0.999999, radialDistance);
    const scale = radialDistance > 1e-12 ? clampedRadius / radialDistance : 0;
    const x = discUv[0] * scale;
    const y = discUv[1] * scale;
    return {
        surfaceNormal: normalize3([x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]),
        limbCoverage,
        radialDistance,
    };
};

/**
 * Register an antialiased disc sample against a moon-fixed equirectangular
 * texture. The basis includes optical/physical libration through the sub-Earth
 * coordinates and rotates the texture with the true lunar north-pole angle.
 * Longitude is periodic; callers must use repeat addressing in U and clamp in
 * V. Terrain normals fade only when the limb foreshortening is unresolved.
 */
export const sampleLunarTextureCoordinates = (
    discUv: CelestialVec2,
    radialPixelFootprint: number,
    subEarthLongitudeRadians: number,
    subEarthLatitudeRadians: number,
    northPoleAngleRadians: number,
): LunarTextureCoordinateSample => {
    const geometry = sampleLunarDiscGeometry(discUv, radialPixelFootprint);
    const c = Math.cos(northPoleAngleRadians);
    const s = Math.sin(northPoleAngleRadians);
    // Screen coordinates projected onto lunar east and north respectively.
    const eastCoordinate = discUv[0] * c - discUv[1] * s;
    const northCoordinate = discUv[0] * s + discUv[1] * c;
    const radial = Math.hypot(eastCoordinate, northCoordinate);
    const boundedRadial = Math.min(0.999999, radial);
    const radialScale = radial > 1e-12 ? boundedRadial / radial : 0;
    const localEast = eastCoordinate * radialScale;
    const localNorth = northCoordinate * radialScale;
    const localObserver = Math.sqrt(Math.max(
        0,
        1 - localEast * localEast - localNorth * localNorth,
    ));
    const longitude = subEarthLongitudeRadians;
    const latitude = clamp(subEarthLatitudeRadians, -PI / 2, PI / 2);
    const center: CelestialVec3 = [
        Math.cos(latitude) * Math.cos(longitude),
        Math.cos(latitude) * Math.sin(longitude),
        Math.sin(latitude),
    ];
    const east: CelestialVec3 = [-Math.sin(longitude), Math.cos(longitude), 0];
    const north: CelestialVec3 = [
        -Math.sin(latitude) * Math.cos(longitude),
        -Math.sin(latitude) * Math.sin(longitude),
        Math.cos(latitude),
    ];
    const moonFixedDirection = normalize3(add3(
        add3(scale3(east, localEast), scale3(north, localNorth)),
        scale3(center, localObserver),
    ));
    const surfaceLongitude = Math.atan2(
        moonFixedDirection[1],
        moonFixedDirection[0],
    );
    const surfaceLatitude = Math.asin(clamp(moonFixedDirection[2], -1, 1));
    const footprint = clamp(radialPixelFootprint, 1e-7, 0.25);
    const foreshortening = Math.max(localObserver, footprint * 1.5);
    const textureFootprintRadians = clamp(
        footprint / foreshortening,
        footprint,
        0.35,
    );
    const terrainNormalReliability = smoothstep(
        footprint * 2.5,
        footprint * 9,
        localObserver,
    );
    return {
        ...geometry,
        textureUv: [
            fract(surfaceLongitude / TAU + 0.5),
            clamp(0.5 - surfaceLatitude / PI, 0, 1),
        ],
        moonFixedDirection,
        textureFootprintRadians,
        terrainNormalReliability,
    };
};

/** Subpixel coverage of the sunlit side; never use it as lunar-disc alpha. */
export const lunarTerminatorCoverage = (
    incidenceCosine: number,
    normalPixelFootprint: number,
) => smoothstep(
    -Math.max(1e-6, normalPixelFootprint),
    Math.max(1e-6, normalPixelFootprint),
    incidenceCosine,
);

export interface LunarAtmosphericAureoleInput {
    angularSeparationRadians: number;
    lunarAngularRadiusRadians: number;
    moonTopOfAtmosphereIrradianceRgb: CelestialVec3;
    /** Moon-to-representative-scatter-point transmittance. */
    sourceToScatterTransmittanceRgb: CelestialVec3;
    /** Slant-path molecular scattering optical depth. */
    rayleighScatteringOpticalDepthRgb: CelestialVec3;
    /** Slant-path aerosol scattering optical depth after absorption. */
    aerosolScatteringOpticalDepthRgb: CelestialVec3;
    aerosolAsymmetry: number;
    /** Transmittance from the representative scatter point to the observer. */
    scatterToObserverTransmittanceRgb?: CelestialVec3;
    /** Bounded multiple-scattering support supplied by atmosphere transport. */
    multipleScatteringRgb?: CelestialVec3;
}

export interface LunarAtmosphericAureoleSample {
    observedRadianceRgb: CelestialVec3;
    rayleighRadianceRgb: CelestialVec3;
    aerosolRadianceRgb: CelestialVec3;
    effectiveScatteringAngleRadians: number;
}

const rayleighPhaseNormalized = (cosine: number) =>
    3 / (16 * PI) * (1 + cosine * cosine);

const cornetteShanksPhaseNormalized = (cosine: number, asymmetry: number) => {
    const g = clamp(asymmetry, -0.94, 0.94);
    const denominator = Math.max(1e-7, 1 + g * g - 2 * g * cosine) ** 1.5;
    return 3 / (8 * PI) * (1 - g * g) / (2 + g * g) *
        (1 + cosine * cosine) / denominator;
};

/**
 * Single-scattered lunar aureole in the same scene-linear domain as the sky.
 * It consumes atmosphere optical depths and transmittance rather than drawing
 * a radial display stamp. The finite lunar disc regularizes the forward lobe;
 * cloud diffraction and camera/ocular glare remain separate effects.
 */
export const evaluateLunarAtmosphericAureole = (
    input: LunarAtmosphericAureoleInput,
): LunarAtmosphericAureoleSample => {
    const separation = Math.max(0, input.angularSeparationRadians);
    const moonRadius = clamp(input.lunarAngularRadiusRadians, 1e-5, 0.02);
    const effectiveScatteringAngleRadians = Math.sqrt(
        separation * separation + moonRadius * moonRadius * 0.32,
    );
    const cosine = Math.cos(effectiveScatteringAngleRadians);
    const sourceAtScatter = mul3(
        input.moonTopOfAtmosphereIrradianceRgb,
        input.sourceToScatterTransmittanceRgb,
    );
    const pathTransmission = input.scatterToObserverTransmittanceRgb ??
        [1, 1, 1] as const;
    const rayleighRadianceRgb = mul3(
        mul3(sourceAtScatter, input.rayleighScatteringOpticalDepthRgb),
        scale3(pathTransmission, rayleighPhaseNormalized(cosine)),
    );
    const aerosolRadianceRgb = mul3(
        mul3(sourceAtScatter, input.aerosolScatteringOpticalDepthRgb),
        scale3(
            pathTransmission,
            cornetteShanksPhaseNormalized(cosine, input.aerosolAsymmetry),
        ),
    );
    const multiple = mul3(
        sourceAtScatter,
        input.multipleScatteringRgb ?? [0, 0, 0],
    );
    return {
        observedRadianceRgb: add3(add3(
            rayleighRadianceRgb,
            aerosolRadianceRgb,
        ), multiple),
        rayleighRadianceRgb,
        aerosolRadianceRgb,
        effectiveScatteringAngleRadians,
    };
};

export interface CelestialForegroundTransport {
    /** In-scattered atmosphere/cloud/hydrometeor radiance in front of the source. */
    foregroundRadianceRgb: CelestialVec3;
    /** Foreground transmittance from the celestial layer to the observer. */
    foregroundTransmittanceRgb: CelestialVec3;
}

export interface CelestialLayerContribution {
    /** Add this after foreground transport; it is already foreground-attenuated. */
    additiveObservedRadianceRgb: CelestialVec3;
    /** Transmission for unresolved extra-atmospheric background behind the body. */
    extraAtmosphericBackgroundTransmission: number;
    /** Separate visibility mask for catalogue stars. */
    stellarOccultationCoverage: number;
}

/**
 * The Moon is not an alpha decal over an already-rendered sky. This function
 * contributes only non-negative foreground-transmitted surface radiance and
 * returns separate occultation for stars/extra-atmospheric background.
 */
export const createCelestialLayerContribution = (
    sourceTopOfAtmosphereRadianceRgb: CelestialVec3,
    limbCoverage: number,
    foregroundTransmittanceRgb: CelestialVec3,
): CelestialLayerContribution => {
    const coverage = saturate(limbCoverage);
    return {
        additiveObservedRadianceRgb: scale3(
            mul3(sourceTopOfAtmosphereRadianceRgb, foregroundTransmittanceRgb),
            coverage,
        ),
        extraAtmosphericBackgroundTransmission: 1 - coverage,
        stellarOccultationCoverage: coverage,
    };
};

/** Exact ordered composition when the behind-source radiance is available. */
export const composeCelestialRay = (
    transport: CelestialForegroundTransport,
    sourceTopOfAtmosphereRadianceRgb: CelestialVec3,
    behindSourceTopOfAtmosphereRadianceRgb: CelestialVec3,
    limbCoverage: number,
): CelestialVec3 => {
    const coverage = saturate(limbCoverage);
    const behindLayer = mix3(
        behindSourceTopOfAtmosphereRadianceRgb,
        sourceTopOfAtmosphereRadianceRgb,
        coverage,
    );
    return add3(
        transport.foregroundRadianceRgb,
        mul3(transport.foregroundTransmittanceRgb, behindLayer),
    );
};

export interface CelestialResolvedLayer {
    topOfAtmosphereRadianceRgb: CelestialVec3;
    /** Geometric pixel coverage. Illumination must never be substituted here. */
    coverage: number;
}

export interface CelestialAtmosphereOrderInput {
    /** Unresolved Galactic plus zodiacal boundary radiance. */
    extraAtmosphericDiffuseRadianceRgb: CelestialVec3;
    /** Integrated catalogue-star flux density already rasterized into this ray. */
    stellarRadianceRgb: CelestialVec3;
    sunDisc?: CelestialResolvedLayer;
    /** Moon is nearer than the Sun and therefore replaces it during an eclipse. */
    moonDisc?: CelestialResolvedLayer;
    atmosphereTransmittanceRgb: CelestialVec3;
    /** Rayleigh/aerosol multiple and single-scattered foreground radiance. */
    atmosphereInscatteredRadianceRgb: CelestialVec3;
    /** Airglow integrated from its shell through the lower atmosphere. */
    observedAirglowRadianceRgb: CelestialVec3;
}

export interface CelestialAtmosphereOrderSample {
    topOfAtmosphereBoundaryRadianceRgb: CelestialVec3;
    observedRadianceBeforeCloudsRgb: CelestialVec3;
    /** Combined occlusion of diffuse background and catalogue stars. */
    extraAtmosphericBackgroundTransmission: number;
}

const overResolvedCelestialLayer = (
    behind: CelestialVec3,
    layer?: CelestialResolvedLayer,
) => layer
    ? mix3(behind, layer.topOfAtmosphereRadianceRgb, saturate(layer.coverage))
    : behind;

/**
 * Reference implementation of the production ordering hooks. It stops before
 * cloud/hydrometeor transport and before the one shared exposure.
 */
export const composeCelestialAtmosphereOrder = (
    input: CelestialAtmosphereOrderInput,
): CelestialAtmosphereOrderSample => {
    const distantBoundary = add3(
        input.extraAtmosphericDiffuseRadianceRgb,
        input.stellarRadianceRgb,
    );
    const withSun = overResolvedCelestialLayer(distantBoundary, input.sunDisc);
    const topOfAtmosphereBoundaryRadianceRgb = overResolvedCelestialLayer(
        withSun,
        input.moonDisc,
    );
    const sunTransmission = 1 - saturate(input.sunDisc?.coverage ?? 0);
    const moonTransmission = 1 - saturate(input.moonDisc?.coverage ?? 0);
    return {
        topOfAtmosphereBoundaryRadianceRgb,
        observedRadianceBeforeCloudsRgb: add3(
            add3(
                input.atmosphereInscatteredRadianceRgb,
                input.observedAirglowRadianceRgb,
            ),
            mul3(
                input.atmosphereTransmittanceRgb,
                topOfAtmosphereBoundaryRadianceRgb,
            ),
        ),
        extraAtmosphericBackgroundTransmission:
            sunTransmission * moonTransmission,
    };
};

// ---------------------------------------------------------------------------
// Natural night radiance and artificial ground emission
// ---------------------------------------------------------------------------

export interface AirglowEmissionState {
    earthRadiusKm: number;
    observerAltitudeKm: number;
    layerBottomKm: number;
    layerTopKm: number;
    /** Scene-linear zenith radiance, before lower-atmosphere attenuation. */
    zenithRadianceRgb: CelestialVec3;
    gravityWaveAmplitude: number;
    gravityWaveHorizontalScaleKm: number;
    gravityWaveDirection: CelestialVec2;
    gravityWavePhase: number;
}

export const DEFAULT_AIRGLOW_STATE: Readonly<AirglowEmissionState> = Object.freeze({
    earthRadiusKm: CELESTIAL_PHYSICS_CONSTANTS.earthRadiusKm,
    observerAltitudeKm: 0,
    layerBottomKm: CELESTIAL_PHYSICS_CONSTANTS.airglowBottomKm,
    layerTopKm: CELESTIAL_PHYSICS_CONSTANTS.airglowTopKm,
    // O I 557.7 nm, weaker O I 630.0 nm/Na and blue continuum represented in
    // the renderer's scene-linear RGB domain.
    zenithRadianceRgb: [1.8e-10, 4.8e-10, 1.15e-10] as const,
    gravityWaveAmplitude: 0.08,
    gravityWaveHorizontalScaleKm: 72,
    gravityWaveDirection: [0.82, 0.57] as const,
    gravityWavePhase: 0,
});

const sphereForwardIntersection = (
    observerRadiusKm: number,
    viewZenithCosine: number,
    sphereRadiusKm: number,
) => {
    const discriminant = observerRadiusKm * observerRadiusKm *
        (viewZenithCosine * viewZenithCosine - 1) + sphereRadiusKm * sphereRadiusKm;
    if (discriminant <= 0) return 0;
    return Math.max(0,
        -observerRadiusKm * viewZenithCosine + Math.sqrt(discriminant));
};

export interface AirglowRadianceSample {
    emissionRadianceRgb: CelestialVec3;
    relativePathLength: number;
    representativeAltitudeKm: number;
}

export const evaluateAirglowRadiance = (
    state: AirglowEmissionState,
    viewDirection: CelestialVec3,
): AirglowRadianceSample => {
    const view = normalize3(viewDirection);
    if (view[1] <= -0.01) {
        return { emissionRadianceRgb: [0, 0, 0], relativePathLength: 0,
            representativeAltitudeKm: (state.layerBottomKm + state.layerTopKm) * 0.5 };
    }
    const observerRadius = state.earthRadiusKm + state.observerAltitudeKm;
    const bottomRadius = state.earthRadiusKm + state.layerBottomKm;
    const topRadius = state.earthRadiusKm + state.layerTopKm;
    const distanceBottom = sphereForwardIntersection(observerRadius, view[1], bottomRadius);
    const distanceTop = sphereForwardIntersection(observerRadius, view[1], topRadius);
    const pathLength = Math.max(0, distanceTop - distanceBottom);
    const verticalThickness = Math.max(1e-4, state.layerTopKm - state.layerBottomKm);
    const relativePathLength = pathLength / verticalThickness;
    const middleDistance = (distanceBottom + distanceTop) * 0.5;
    const horizontalPosition: CelestialVec2 = [
        view[0] * middleDistance,
        view[2] * middleDistance,
    ];
    const waveDirectionLength = Math.hypot(
        state.gravityWaveDirection[0],
        state.gravityWaveDirection[1],
    );
    const waveDirection: CelestialVec2 = waveDirectionLength > 1e-8
        ? [
            state.gravityWaveDirection[0] / waveDirectionLength,
            state.gravityWaveDirection[1] / waveDirectionLength,
        ]
        : [1, 0];
    const waveCoordinate = (
        horizontalPosition[0] * waveDirection[0] +
        horizontalPosition[1] * waveDirection[1]
    ) / Math.max(2, state.gravityWaveHorizontalScaleKm);
    const wave = 1 + clamp(state.gravityWaveAmplitude, 0, 0.3) * (
        Math.sin(waveCoordinate * PI * 2 + state.gravityWavePhase) * 0.68 +
        Math.sin(waveCoordinate * PI * 0.73 - state.gravityWavePhase * 0.41) * 0.32
    );
    return {
        emissionRadianceRgb: scale3(
            state.zenithRadianceRgb,
            Math.max(0, relativePathLength * wave),
        ),
        relativePathLength,
        representativeAltitudeKm: (state.layerBottomKm + state.layerTopKm) * 0.5,
    };
};

export interface ZodiacalLightState {
    sunDirection: CelestialVec3;
    eclipticNorthDirection: CelestialVec3;
    /** Scene-linear scale for the calibrated interplanetary-dust radiance. */
    radianceScale: number;
    solarSpectrumRgb: CelestialVec3;
}

export const evaluateZodiacalRadiance = (
    state: ZodiacalLightState,
    viewDirection: CelestialVec3,
): CelestialVec3 => {
    const view = normalize3(viewDirection);
    if (view[1] <= 0) return [0, 0, 0];
    const sun = normalize3(state.sunDirection);
    const eclipticNorth = normalize3(state.eclipticNorthDirection);
    const elongation = Math.acos(clamp(dot3(view, sun), -1, 1));
    const latitude = Math.abs(Math.asin(clamp(dot3(view, eclipticNorth), -1, 1)));
    const plane = Math.exp(-((latitude / 0.19) ** 1.18));
    const solarLobe = clamp(0.10 + 0.62 / (0.11 + elongation) ** 0.82, 0, 9);
    const gegenschein = 0.42 * Math.exp(-(((PI - elongation) / 0.20) ** 2)) *
        Math.exp(-((latitude / 0.12) ** 2));
    const reddenedSolarSpectrum = mul3(state.solarSpectrumRgb, [1.08, 1, 0.88]);
    return scale3(
        reddenedSolarSpectrum,
        Math.max(0, state.radianceScale) * plane * (solarLobe + gegenschein),
    );
};

export interface GalacticRadianceState {
    galacticNorthDirection: CelestialVec3;
    galacticCenterDirection: CelestialVec3;
    radianceScale: number;
    /** One prefers a calibrated all-sky map; zero selects analytic fallback. */
    calibratedMapWeight: number;
    coolPlaneSpectrumRgb: CelestialVec3;
    warmBulgeSpectrumRgb: CelestialVec3;
}

export interface IntegratedStarlightState {
    galacticNorthDirection: CelestialVec3;
    galacticCenterDirection: CelestialVec3;
    /** Scene-linear all-sky integrated-starlight scale. */
    radianceScale: number;
    stellarPopulationSpectrumRgb: CelestialVec3;
}

/**
 * Unresolved stellar background outside the structured Milky Way map. This
 * broad component represents the measured integrated starlight that remains
 * after individually rasterized catalogue stars are removed.
 */
export const evaluateIntegratedStarlightRadiance = (
    state: IntegratedStarlightState,
    viewDirection: CelestialVec3,
): CelestialVec3 => {
    const view = normalize3(viewDirection);
    if (view[1] <= 0) return [0, 0, 0];
    const north = normalize3(state.galacticNorthDirection);
    const center = normalize3(state.galacticCenterDirection);
    const sinLatitude = clamp(dot3(view, north), -1, 1);
    const broadDisc = Math.exp(-Math.abs(sinLatitude) / 0.31);
    const centerSeparation = Math.acos(clamp(dot3(view, center), -1, 1));
    const innerGalaxy = Math.exp(-((centerSeparation / 0.72) ** 1.45));
    const highLatitudeFloor = 0.16;
    return scale3(
        state.stellarPopulationSpectrumRgb,
        Math.max(0, state.radianceScale) *
            (highLatitudeFloor + broadDisc * 0.72 + innerGalaxy * 0.54),
    );
};

export const evaluateGalacticRadiance = (
    state: GalacticRadianceState,
    viewDirection: CelestialVec3,
    calibratedMapRadianceRgb: CelestialVec3 = [0, 0, 0],
): CelestialVec3 => {
    const view = normalize3(viewDirection);
    if (view[1] <= 0) return [0, 0, 0];
    const north = normalize3(state.galacticNorthDirection);
    const center = normalize3(state.galacticCenterDirection);
    const latitudeSine = clamp(dot3(view, north), -1, 1);
    const latitude = Math.asin(latitudeSine);
    const centerSeparation = Math.acos(clamp(dot3(view, center), -1, 1));
    const viewOnPlane = normalize3([
        view[0] - north[0] * latitudeSine,
        view[1] - north[1] * latitudeSine,
        view[2] - north[2] * latitudeSine,
    ]);
    const centerNorth = dot3(center, north);
    const centerOnPlane = normalize3([
        center[0] - north[0] * centerNorth,
        center[1] - north[1] * centerNorth,
        center[2] - north[2] * centerNorth,
    ]);
    const longitudeCosine = clamp(dot3(viewOnPlane, centerOnPlane), -1, 1);
    const longitude = Math.acos(longitudeCosine);
    const plane = Math.exp(-((Math.abs(latitude) / 0.105) ** 1.28));
    const bulge = Math.exp(-((centerSeparation / 0.31) ** 1.35));
    const dustLane = 1 - 0.58 * Math.exp(-((latitude / 0.026) ** 2)) *
        Math.exp(-((centerSeparation / 0.72) ** 2));
    const unresolvedStructure = 0.88 +
        0.075 * Math.sin(longitude * 7.1 + 0.4) +
        0.045 * Math.sin(longitude * 19.7 - 1.2);
    const analyticPlane = scale3(
        state.coolPlaneSpectrumRgb,
        plane * dustLane * Math.max(0.6, unresolvedStructure),
    );
    const analyticBulge = scale3(state.warmBulgeSpectrumRgb, bulge * 1.25);
    const analytic = scale3(add3(analyticPlane, analyticBulge),
        Math.max(0, state.radianceScale));
    return mix3(analytic, calibratedMapRadianceRgb,
        saturate(state.calibratedMapWeight));
};

export interface ArtificialGroundLightSource {
    centerGroundKm: CelestialVec2;
    radiusKm: number;
    upwardRadianceRgb: CelestialVec3;
    /** 0 is Lambertian; positive values concentrate leakage toward zenith. */
    upwardAnisotropy: number;
}

/**
 * Boundary radiance leaving the ground. It must enter atmosphere/cloud
 * transport; it is not an additive screen-space sky dome.
 */
export const evaluateArtificialGroundEmission = (
    source: ArtificialGroundLightSource,
    groundPositionKm: CelestialVec2,
    upwardDirection: CelestialVec3,
): CelestialVec3 => {
    const deltaX = groundPositionKm[0] - source.centerGroundKm[0];
    const deltaY = groundPositionKm[1] - source.centerGroundKm[1];
    const normalizedRadius = Math.hypot(deltaX, deltaY) /
        Math.max(0.05, source.radiusKm);
    const spatial = Math.exp(-0.5 * normalizedRadius * normalizedRadius);
    const zenithCosine = Math.max(0, normalize3(upwardDirection)[1]);
    const angular = (0.08 + 0.92 * zenithCosine) **
        clamp(1 + source.upwardAnisotropy, 0.25, 8);
    return scale3(source.upwardRadianceRgb, spatial * angular);
};

export interface PhysicalNightEmissionSample {
    /** Source inside the thermosphere; integrate/attenuate from its altitude. */
    atmosphericEmissionRadianceRgb: CelestialVec3;
    /** Source behind the atmosphere; pass through atmosphere exactly once. */
    extraAtmosphericRadianceRgb: CelestialVec3;
    /** Upward boundary source; scatter through atmosphere/clouds, do not add. */
    groundUpwardRadianceRgb: CelestialVec3;
    /** Diagnostic source split; both are included in extraAtmosphericRadianceRgb. */
    zodiacalLightRadianceRgb: CelestialVec3;
    unresolvedGalacticRadianceRgb: CelestialVec3;
    integratedStarlightRadianceRgb: CelestialVec3;
}

export interface PhysicalNightEmissionInput {
    viewDirection: CelestialVec3;
    airglow: AirglowEmissionState;
    zodiacal: ZodiacalLightState;
    galactic: GalacticRadianceState;
    integratedStarlight?: IntegratedStarlightState;
    calibratedGalacticMapRadianceRgb?: CelestialVec3;
    artificialSource?: ArtificialGroundLightSource;
    groundPositionKm?: CelestialVec2;
    groundUpwardDirection?: CelestialVec3;
}

export const evaluatePhysicalNightEmission = (
    input: PhysicalNightEmissionInput,
): PhysicalNightEmissionSample => {
    const airglow = evaluateAirglowRadiance(input.airglow, input.viewDirection);
    const zodiacal = evaluateZodiacalRadiance(input.zodiacal, input.viewDirection);
    const galactic = evaluateGalacticRadiance(
        input.galactic,
        input.viewDirection,
        input.calibratedGalacticMapRadianceRgb,
    );
    const integratedStarlight = input.integratedStarlight
        ? evaluateIntegratedStarlightRadiance(
            input.integratedStarlight,
            input.viewDirection,
        )
        : [0, 0, 0] as const;
    const ground = input.artificialSource
        ? evaluateArtificialGroundEmission(
            input.artificialSource,
            input.groundPositionKm ?? [0, 0],
            input.groundUpwardDirection ?? [0, 1, 0],
        )
        : [0, 0, 0] as const;
    return {
        atmosphericEmissionRadianceRgb: airglow.emissionRadianceRgb,
        extraAtmosphericRadianceRgb: add3(
            add3(zodiacal, galactic),
            integratedStarlight,
        ),
        groundUpwardRadianceRgb: ground,
        zodiacalLightRadianceRgb: zodiacal,
        unresolvedGalacticRadianceRgb: galactic,
        integratedStarlightRadianceRgb: integratedStarlight,
    };
};

export interface NaturalNightObserverTransportInput {
    sources: PhysicalNightEmissionSample;
    /** Full atmosphere path for extraterrestrial sources. */
    extraAtmosphericTransmittanceRgb: CelestialVec3;
    /** Remaining lower-atmosphere path from the airglow shell. */
    airglowToObserverTransmittanceRgb: CelestialVec3;
}

export interface NaturalNightObserverTransportSample {
    observedExtraAtmosphericRadianceRgb: CelestialVec3;
    observedAirglowRadianceRgb: CelestialVec3;
    observedDiffuseRadianceBeforeCloudsRgb: CelestialVec3;
    /** Boundary source forwarded unchanged for scattering, never directly added. */
    groundUpwardRadianceRgb: CelestialVec3;
}

/** Apply each physically distinct night-source path exactly once. */
export const transportNaturalNightSources = (
    input: NaturalNightObserverTransportInput,
): NaturalNightObserverTransportSample => {
    const observedExtraAtmosphericRadianceRgb = mul3(
        input.sources.extraAtmosphericRadianceRgb,
        input.extraAtmosphericTransmittanceRgb,
    );
    const observedAirglowRadianceRgb = mul3(
        input.sources.atmosphericEmissionRadianceRgb,
        input.airglowToObserverTransmittanceRgb,
    );
    return {
        observedExtraAtmosphericRadianceRgb,
        observedAirglowRadianceRgb,
        observedDiffuseRadianceBeforeCloudsRgb: add3(
            observedExtraAtmosphericRadianceRgb,
            observedAirglowRadianceRgb,
        ),
        groundUpwardRadianceRgb: input.sources.groundUpwardRadianceRgb,
    };
};

// ---------------------------------------------------------------------------
// Resolved solar disc and compact optical PSF
// ---------------------------------------------------------------------------

export interface PhysicalSunDiscState {
    direction: CelestialVec3;
    distanceAstronomicalUnits: number;
    angularRadiusRadians: number;
    solidAngleSteradians: number;
    topOfAtmosphereIrradianceRgb: CelestialVec3;
    /** Limb-centre TOA radiance after disk-integral normalization. */
    centerTopOfAtmosphereRadianceRgb: CelestialVec3;
    /** Quadratic limb-darkening coefficients in linear radiance. */
    limbDarkening: CelestialVec2;
    /** Energy-normalized angular seeing/optical kernel. */
    psf: EnergyNormalizedMoffatPsf;
}

/** NOAA/Meeus low-order Earth-Sun distance approximation. */
export const solarDistanceAstronomicalUnits = (date: Date) => {
    const julianDate = date.getTime() / 86_400_000 + 2_440_587.5;
    const daysSinceJ2000 = julianDate - 2_451_545;
    const meanAnomaly = (
        357.52911 + 0.98560028 * daysSinceJ2000
    ) * PI / 180;
    return clamp(
        1.00014 - 0.01671 * Math.cos(meanAnomaly) -
            0.00014 * Math.cos(2 * meanAnomaly),
        0.98,
        1.02,
    );
};

export const solarAngularRadiusRadians = (distanceAstronomicalUnits: number) =>
    Math.asin(clamp(
        CELESTIAL_PHYSICS_CONSTANTS.solarPhotosphericRadiusKm /
            (CELESTIAL_PHYSICS_CONSTANTS.astronomicalUnitKm *
                clamp(distanceAstronomicalUnits, 0.98, 1.02)),
        0,
        0.02,
    ));

export const createPhysicalSunDiscState = (
    direction: CelestialVec3,
    topOfAtmosphereIrradianceRgb: CelestialVec3,
    angularRadiusRadians = CELESTIAL_PHYSICS_CONSTANTS.solarAngularRadiusRadians,
    limbDarkening: CelestialVec2 = [0.47, 0.23],
    psf = createEnergyNormalizedMoffatPsf(
        2 * Math.PI / (180 * 3_600),
        3.8,
        0.012,
        8,
    ),
    distanceAstronomicalUnits = 1,
): PhysicalSunDiscState => {
    const radius = clamp(angularRadiusRadians, 0.001, 0.02);
    const coefficients: CelestialVec2 = [
        clamp(limbDarkening[0], 0, 1),
        clamp(limbDarkening[1], 0, 1),
    ];
    const solidAngleSteradians = 2 * PI * (1 - Math.cos(radius));
    const meanLimbRadiance = Math.max(
        0.05,
        1 - coefficients[0] / 3 - coefficients[1] / 6,
    );
    const irradiance = topOfAtmosphereIrradianceRgb.map((channel) =>
        Math.max(0, channel)) as unknown as CelestialVec3;
    return {
        direction: normalize3(direction),
        distanceAstronomicalUnits: clamp(distanceAstronomicalUnits, 0.98, 1.02),
        angularRadiusRadians: radius,
        solidAngleSteradians,
        topOfAtmosphereIrradianceRgb: irradiance,
        centerTopOfAtmosphereRadianceRgb: scale3(
            irradiance,
            1 / Math.max(1e-12, solidAngleSteradians * meanLimbRadiance),
        ),
        limbDarkening: coefficients,
        psf,
    };
};

export interface PhysicalSunDiscAtmosphereState {
    source: PhysicalSunDiscState;
    /** Same direct observer transfer sampled by the physical atmosphere LUT. */
    observerTransmittanceRgb: CelestialVec3;
    /** Direct finite-disc irradiance before cloud/weather transport. */
    observedDirectIrradianceRgb: CelestialVec3;
    /** Scene-linear atmospheric forward-scatter input; not an additive halo. */
    atmosphericGlareHandoff: {
        owner: "physical-atmosphere-forward-scattering";
        sourceDirection: CelestialVec3;
        sourceAngularRadiusRadians: number;
        topOfAtmosphereIrradianceRgb: CelestialVec3;
    };
    /** Common exposure is applied only after atmosphere and finite media. */
    commonExposureScale: 1;
}

export const PHYSICAL_SUN_DISC_RADIANCE_ABI = Object.freeze({
    version: CELESTIAL_PHYSICS_ABI_VERSION,
    floatCount: 28,
    vec4Count: 7,
    glareOwnerCode: Object.freeze({
        "physical-atmosphere-forward-scattering": 1,
    } as const),
});

export const createPhysicalSunDiscAtmosphereState = (
    source: PhysicalSunDiscState,
    observerTransmittanceRgb: CelestialVec3,
): PhysicalSunDiscAtmosphereState => {
    const transmittance = observerTransmittanceRgb.map((channel) =>
        clamp(channel, 0, 1)) as unknown as CelestialVec3;
    return {
        source,
        observerTransmittanceRgb: transmittance,
        observedDirectIrradianceRgb: mul3(
            source.topOfAtmosphereIrradianceRgb,
            transmittance,
        ),
        atmosphericGlareHandoff: {
            owner: "physical-atmosphere-forward-scattering",
            sourceDirection: source.direction,
            sourceAngularRadiusRadians: source.angularRadiusRadians,
            topOfAtmosphereIrradianceRgb:
                source.topOfAtmosphereIrradianceRgb,
        },
        commonExposureScale: 1,
    };
};

/** Seven vec4 values; contains physical source/transfer state and no exposure. */
export const packPhysicalSunDiscAtmosphereState = (
    state: PhysicalSunDiscAtmosphereState,
): Float32Array => new Float32Array([
    ...state.source.direction,
    state.source.angularRadiusRadians,
    ...state.source.topOfAtmosphereIrradianceRgb,
    state.source.solidAngleSteradians,
    ...state.source.centerTopOfAtmosphereRadianceRgb,
    state.source.distanceAstronomicalUnits,
    ...state.observerTransmittanceRgb,
    state.commonExposureScale,
    ...state.observedDirectIrradianceRgb,
    PHYSICAL_SUN_DISC_RADIANCE_ABI.glareOwnerCode[
        state.atmosphericGlareHandoff.owner
    ],
    state.source.limbDarkening[0],
    state.source.limbDarkening[1],
    state.source.psf.fwhm,
    state.source.psf.beta,
    state.source.psf.wingFraction,
    state.source.psf.wingScale,
    0,
    0,
]);

export interface SunDiscRadianceSample {
    topOfAtmosphereRadianceRgb: CelestialVec3;
    coverage: number;
    angularSeparationRadians: number;
}

/**
 * Resolved solar radiance. Its solid-angle integral reproduces the supplied
 * TOA irradiance (up to the subpixel limb integration performed by the caller).
 */
export const evaluateSunDiscRadiance = (
    state: PhysicalSunDiscState,
    viewDirection: CelestialVec3,
    angularPixelFootprintRadians: number,
): SunDiscRadianceSample => {
    const separation = Math.acos(clamp(
        dot3(normalize3(viewDirection), state.direction),
        -1,
        1,
    ));
    const radius = state.angularRadiusRadians;
    const footprint = clamp(angularPixelFootprintRadians, 1e-8, radius * 0.5);
    const coverage = 1 - smoothstep(radius - footprint, radius + footprint, separation);
    const normalizedRadius = Math.min(1, separation / Math.max(1e-8, radius));
    const mu = Math.sqrt(Math.max(0, 1 - normalizedRadius * normalizedRadius));
    const [u1, u2] = state.limbDarkening;
    const limbRadiance = Math.max(0, 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2);
    return {
        topOfAtmosphereRadianceRgb: scale3(
            state.centerTopOfAtmosphereRadianceRgb,
            limbRadiance * coverage,
        ),
        coverage,
        angularSeparationRadians: separation,
    };
};

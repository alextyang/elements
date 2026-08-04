/**
 * Physical, scene-linear atmosphere model and WebGPU LUT resource graph.
 *
 * The LUT decomposition and spherical parameterizations follow the method in
 * Sébastien Hillaire, "A Scalable and Production Ready Sky and Atmosphere
 * Rendering Technique" (EGSR 2020). This is an original TypeScript/WGSL
 * implementation informed by Epic's MIT-licensed reference implementation:
 * https://github.com/sebh/UnrealEngineSkyAtmosphere
 *
 * Units are kilometres, inverse kilometres, and scene-linear radiance. Light
 * sources always contain top-of-atmosphere radiance. Attenuated radiance must
 * never be passed back as source radiance, which prevents double extinction.
 */

import {
    PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL,
    PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL,
    PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL,
    PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL,
    PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL,
    physicalAtmosphereConsumerWgsl,
} from "./physical-atmosphere-wgsl.ts";
import {
    DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT,
    DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT,
    DIRECTIONAL_CLOUD_VISIBILITY_WIDTH,
} from "./directional-cloud-visibility.ts";

export type AtmosphereVec3 = readonly [number, number, number];
export type AtmosphereAerosolType =
    | "clean"
    | "maritime"
    | "continental"
    | "urban"
    | "sulfate"
    | "dust"
    | "smoke";

export interface AtmosphereArtisticGrade {
    /** Photographic exposure after physical integration. Clamped to ±1.5 EV. */
    exposureCompensationEv: number;
    /** Small linear-light channel residual, clamped to ±0.12 per channel. */
    chromaResidual: AtmosphereVec3;
    /** Residual strength; zero is a purely physical result. Clamped to 0–0.35. */
    moodStrength: number;
}

export interface PhysicalAtmosphereInput {
    bottomRadiusKm?: number;
    atmosphereHeightKm?: number;
    observerAltitudeKm?: number;
    surfacePressureHpa?: number;
    rayleighScaleHeightKm?: number;
    aerosolType?: AtmosphereAerosolType;
    aerosolOpticalDepth550?: number;
    /** Continuous microphysics overrides; the named aerosol type is only a prior. */
    aerosolAngstromExponent?: number;
    aerosolSingleScatteringAlbedo?: AtmosphereVec3;
    aerosolAsymmetry?: number;
    aerosolScaleHeightKm?: number;
    /** Fraction of tropospheric aerosol trapped below the mixing-layer top. */
    aerosolBoundaryLayerStrength?: number;
    /** Mixing-layer top. A stronger inversion makes the transition visible in long paths. */
    aerosolBoundaryLayerHeightKm?: number;
    /** Smoothness of the mixing-layer transition; never a hard density slab. */
    aerosolBoundaryLayerTransitionKm?: number;
    relativeHumidity?: number;
    /** Independently conserved elevated aerosol column, usually sulfate or aged smoke. */
    stratosphericAerosolOpticalDepth550?: number;
    stratosphericAerosolCenterAltitudeKm?: number;
    stratosphericAerosolWidthKm?: number;
    ozoneColumnDobson?: number;
    ozoneCenterAltitudeKm?: number;
    ozoneHalfWidthKm?: number;
    groundAlbedo?: AtmosphereVec3;
    multipleScatteringFactor?: number;
    grade?: Partial<AtmosphereArtisticGrade>;
}

interface AerosolPreset {
    opticalDepth550: number;
    angstromExponent: number;
    singleScatteringAlbedo: AtmosphereVec3;
    asymmetry: number;
    scaleHeightKm: number;
    hygroscopicity: number;
}

export interface PhysicalAtmosphereState {
    bottomRadiusKm: number;
    topRadiusKm: number;
    observerAltitudeKm: number;
    rayleighScaleHeightKm: number;
    mieScaleHeightKm: number;
    aerosolBoundaryLayerStrength: number;
    aerosolBoundaryLayerHeightKm: number;
    aerosolBoundaryLayerTransitionKm: number;
    rayleighScatteringKm: AtmosphereVec3;
    mieScatteringKm: AtmosphereVec3;
    mieAbsorptionKm: AtmosphereVec3;
    mieAsymmetry: number;
    stratosphericMieScatteringKm: AtmosphereVec3;
    stratosphericMieAbsorptionKm: AtmosphereVec3;
    stratosphericMieAsymmetry: number;
    stratosphericAerosolOpticalDepth550: number;
    stratosphericAerosolCenterAltitudeKm: number;
    stratosphericAerosolWidthKm: number;
    ozoneAbsorptionKm: AtmosphereVec3;
    ozoneCenterAltitudeKm: number;
    ozoneHalfWidthKm: number;
    groundAlbedo: AtmosphereVec3;
    multipleScatteringFactor: number;
    aerosolType: AtmosphereAerosolType;
    aerosolOpticalDepth550: number;
    aerosolAngstromExponent: number;
    aerosolSingleScatteringAlbedo: AtmosphereVec3;
    relativeHumidity: number;
    grade: AtmosphereArtisticGrade;
}

export type AtmosphereLightKind = "sun" | "moon";

export interface AtmosphereLightSource {
    kind: AtmosphereLightKind;
    /** Unit direction from the atmosphere toward the source. */
    direction: AtmosphereVec3;
    /** Unattenuated top-of-atmosphere scene-linear RGB radiance. */
    topOfAtmosphereRadiance: AtmosphereVec3;
    angularRadiusRadians: number;
    enabled?: boolean;
}

export interface AtmosphereLightingState {
    observerAltitudeKm?: number;
    sources: readonly AtmosphereLightSource[];
}

export interface AtmosphereMediumSample {
    rayleighDensity: number;
    mieDensity: number;
    stratosphericMieDensity: number;
    ozoneDensity: number;
    rayleighScattering: AtmosphereVec3;
    mieScattering: AtmosphereVec3;
    troposphericMieScattering: AtmosphereVec3;
    stratosphericMieScattering: AtmosphereVec3;
    absorption: AtmosphereVec3;
    scattering: AtmosphereVec3;
    extinction: AtmosphereVec3;
}

export interface AtmosphereSegmentTransport {
    radiance: AtmosphereVec3;
    transmittance: AtmosphereVec3;
}

const RGB_WAVELENGTHS_MICRONS: AtmosphereVec3 = [0.680, 0.550, 0.440];
const EARTH_RAYLEIGH_SCATTERING_KM: AtmosphereVec3 = [0.005802, 0.013558, 0.033100];
const EARTH_OZONE_ABSORPTION_KM: AtmosphereVec3 = [0.000650, 0.001881, 0.000085];
const STANDARD_OZONE_DOBSON = 300;
// The reference absorption coefficients are calibrated to the default
// raised-cosine profile whose vertical integral is exactly its 15 km
// half-width. Alternate authored profile geometry must preserve that column.
const STANDARD_OZONE_PROFILE_COLUMN_KM = 15;
const STRATOSPHERIC_SULFATE_ANGSTROM_EXPONENT = 1.60;
const STRATOSPHERIC_SULFATE_SINGLE_SCATTERING_ALBEDO: AtmosphereVec3 =
    [0.995, 0.997, 0.998];
const STRATOSPHERIC_SULFATE_ASYMMETRY = 0.64;
const PI = Math.PI;

export const PHYSICAL_ATMOSPHERE_UNIFORM_FLOATS = 64;
export const PHYSICAL_ATMOSPHERE_UNIFORM_BYTES = PHYSICAL_ATMOSPHERE_UNIFORM_FLOATS * 4;
export const PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY = 2;

export const PHYSICAL_ATMOSPHERE_LUT_LAYOUT = Object.freeze({
    transmittance: Object.freeze({
        width: 256,
        height: 64,
        depthOrArrayLayers: 1,
        format: "rgba16float" as const,
    }),
    multipleScattering: Object.freeze({
        width: 32,
        height: 32,
        depthOrArrayLayers: 1,
        format: "rgba16float" as const,
    }),
    skyView: Object.freeze({
        width: 192,
        height: 108,
        depthOrArrayLayers: PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY,
        format: "rgba16float" as const,
    }),
    irradiance: Object.freeze({
        width: 64,
        height: 32,
        depthOrArrayLayers: 1,
        format: "rgba16float" as const,
    }),
    /**
     * Layer 0 packs 17 positive directional lobes plus upper/lower irradiance.
     * Layers 1-192 are 32 receiver-depth RGB visibility knots in each of three
     * source-aligned cascades for Sun and Moon. Every knot is the mean Beer
     * visibility of four coherent footprint rays, preventing both behind-
     * receiver shadows and partial-coverage darkening.
     */
    directionalCoupling: Object.freeze({
        width: DIRECTIONAL_CLOUD_VISIBILITY_WIDTH,
        height: DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT,
        depthOrArrayLayers: DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT,
        format: "rgba16float" as const,
    }),
});

const AEROSOL_PRESETS: Readonly<Record<AtmosphereAerosolType, AerosolPreset>> = {
    clean: {
        opticalDepth550: 0.035,
        angstromExponent: 1.05,
        singleScatteringAlbedo: [0.99, 0.99, 0.985],
        asymmetry: 0.72,
        scaleHeightKm: 1.35,
        hygroscopicity: 0.12,
    },
    maritime: {
        opticalDepth550: 0.095,
        angstromExponent: 0.55,
        singleScatteringAlbedo: [0.995, 0.995, 0.99],
        asymmetry: 0.82,
        scaleHeightKm: 1.25,
        hygroscopicity: 0.72,
    },
    continental: {
        opticalDepth550: 0.14,
        angstromExponent: 1.20,
        singleScatteringAlbedo: [0.94, 0.95, 0.96],
        asymmetry: 0.74,
        scaleHeightKm: 1.45,
        hygroscopicity: 0.38,
    },
    urban: {
        opticalDepth550: 0.22,
        angstromExponent: 1.35,
        singleScatteringAlbedo: [0.86, 0.89, 0.92],
        asymmetry: 0.70,
        scaleHeightKm: 1.10,
        hygroscopicity: 0.45,
    },
    sulfate: {
        opticalDepth550: 0.16,
        angstromExponent: 1.55,
        singleScatteringAlbedo: [0.995, 0.998, 0.998],
        asymmetry: 0.68,
        scaleHeightKm: 2.20,
        hygroscopicity: 0.82,
    },
    dust: {
        opticalDepth550: 0.24,
        angstromExponent: 0.18,
        singleScatteringAlbedo: [0.95, 0.91, 0.82],
        asymmetry: 0.80,
        scaleHeightKm: 2.60,
        hygroscopicity: 0.05,
    },
    smoke: {
        opticalDepth550: 0.28,
        angstromExponent: 1.70,
        singleScatteringAlbedo: [0.82, 0.86, 0.91],
        asymmetry: 0.66,
        scaleHeightKm: 2.00,
        hygroscopicity: 0.30,
    },
};

const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const saturate = (value: number) => clamp(value, 0, 1);

const map3 = (value: AtmosphereVec3, fn: (channel: number, index: number) => number): AtmosphereVec3 =>
    [fn(value[0], 0), fn(value[1], 1), fn(value[2], 2)];
const add3 = (left: AtmosphereVec3, right: AtmosphereVec3): AtmosphereVec3 =>
    [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
const mul3 = (left: AtmosphereVec3, right: AtmosphereVec3): AtmosphereVec3 =>
    [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
const scale3 = (value: AtmosphereVec3, amount: number): AtmosphereVec3 =>
    [value[0] * amount, value[1] * amount, value[2] * amount];
const expNeg3 = (value: AtmosphereVec3): AtmosphereVec3 =>
    [Math.exp(-value[0]), Math.exp(-value[1]), Math.exp(-value[2])];
const length3 = (value: AtmosphereVec3) => Math.hypot(value[0], value[1], value[2]);
const dot3 = (left: AtmosphereVec3, right: AtmosphereVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const normalize3 = (value: AtmosphereVec3): AtmosphereVec3 => {
    const length = length3(value);
    if (length < 1e-12) return [0, 0, 1];
    return scale3(value, 1 / length);
};

const finitePositive = (value: number | undefined, fallback: number, low: number, high: number) =>
    clamp(value ?? fallback, low, high);

const smoothBoundaryLayerDensity = (
    altitudeKm: number,
    heightKm: number,
    transitionKm: number,
) => {
    const exponent = clamp((Math.max(0, altitudeKm) - heightKm) /
        Math.max(0.01, transitionKm), -60, 60);
    return 1 / (1 + Math.exp(exponent));
};

const troposphericAerosolDensity = (
    altitudeKm: number,
    scaleHeightKm: number,
    boundaryStrength: number,
    boundaryHeightKm: number,
    boundaryTransitionKm: number,
) => {
    const altitude = Math.max(0, altitudeKm);
    return (1 - boundaryStrength) * Math.exp(-altitude / scaleHeightKm) +
        boundaryStrength * smoothBoundaryLayerDensity(
            altitude, boundaryHeightKm, boundaryTransitionKm);
};

const gaussianLayerDensity = (altitudeKm: number, centerKm: number, widthKm: number) => {
    const normalized = (altitudeKm - centerKm) / Math.max(0.05, widthKm);
    return Math.exp(-0.5 * normalized * normalized);
};

const raisedCosineOzoneDensity = (
    altitudeKm: number,
    centerKm: number,
    halfWidthKm: number,
) => {
    const offset = Math.abs(altitudeKm - centerKm) /
        Math.max(0.05, halfWidthKm);
    return offset < 1 ? 0.5 * (1 + Math.cos(PI * offset)) : 0;
};

/** Midpoint column integral used once per state, never per rendered sample. */
const integrateVerticalProfile = (
    atmosphereHeightKm: number,
    sample: (altitudeKm: number) => number,
) => {
    const steps = 512;
    const stepKm = atmosphereHeightKm / steps;
    let integral = 0;
    for (let index = 0; index < steps; index += 1) {
        integral += sample((index + 0.5) * stepKm) * stepKm;
    }
    return Math.max(1e-6, integral);
};

/** Resolve weather-facing controls into physically usable RGB coefficients. */
export const createPhysicalAtmosphereState = (
    input: PhysicalAtmosphereInput = {},
): PhysicalAtmosphereState => {
    const bottomRadiusKm = finitePositive(input.bottomRadiusKm, 6360, 100, 100_000);
    const atmosphereHeightKm = finitePositive(input.atmosphereHeightKm, 100, 20, 500);
    const pressureScale = finitePositive(input.surfacePressureHpa, 1013.25, 200, 1400) / 1013.25;
    const rayleighScaleHeightKm = finitePositive(input.rayleighScaleHeightKm, 8, 4, 16);
    const aerosolType = input.aerosolType ?? "clean";
    const preset = AEROSOL_PRESETS[aerosolType];
    const aerosolAngstromExponent = clamp(
        input.aerosolAngstromExponent ?? preset.angstromExponent,
        0,
        3,
    );
    const aerosolSingleScatteringAlbedo = map3(
        input.aerosolSingleScatteringAlbedo ?? preset.singleScatteringAlbedo,
        (channel) => clamp(channel, 0.65, 0.9999),
    );
    const relativeHumidity = clamp(input.relativeHumidity ?? 0.45, 0.02, 0.98);
    const dryOpticalDepth = finitePositive(
        input.aerosolOpticalDepth550,
        preset.opticalDepth550,
        0.002,
        1.5,
    );
    // Smooth, bounded hygroscopic growth. It changes both aerosol amount and
    // apparent size without creating the singularity of an unbounded f(RH).
    const humidityGrowth = 1 + preset.hygroscopicity *
        clamp(Math.pow((1 - 0.45) / Math.max(0.02, 1 - relativeHumidity), 0.45) - 1, -0.25, 2.5);
    const aerosolOpticalDepth550 = dryOpticalDepth * humidityGrowth;
    const mieScaleHeightKm = finitePositive(
        input.aerosolScaleHeightKm,
        preset.scaleHeightKm * (1 + 0.12 * Math.max(0, humidityGrowth - 1)),
        0.25,
        8,
    );
    const inferredBoundaryStrength = clamp(
        0.06 + preset.hygroscopicity * 0.18 +
            Math.max(0, relativeHumidity - 0.62) * 0.75,
        0,
        0.82,
    );
    const aerosolBoundaryLayerStrength = clamp(
        input.aerosolBoundaryLayerStrength ?? inferredBoundaryStrength,
        0,
        0.92,
    );
    const aerosolBoundaryLayerHeightKm = finitePositive(
        input.aerosolBoundaryLayerHeightKm,
        1.65 - aerosolBoundaryLayerStrength * 0.75,
        0.12,
        5,
    );
    const aerosolBoundaryLayerTransitionKm = finitePositive(
        input.aerosolBoundaryLayerTransitionKm,
        0.32 + (1 - aerosolBoundaryLayerStrength) * 0.22,
        0.04,
        1.5,
    );
    const troposphericColumnKm = integrateVerticalProfile(
        atmosphereHeightKm,
        (altitudeKm) => troposphericAerosolDensity(
            altitudeKm,
            mieScaleHeightKm,
            aerosolBoundaryLayerStrength,
            aerosolBoundaryLayerHeightKm,
            aerosolBoundaryLayerTransitionKm,
        ),
    );
    const extinction550 = aerosolOpticalDepth550 / troposphericColumnKm;
    const mieExtinctionKm = map3(RGB_WAVELENGTHS_MICRONS, (wavelength) =>
        extinction550 * Math.pow(wavelength / 0.55, -aerosolAngstromExponent));
    const mieScatteringKm = mul3(mieExtinctionKm, aerosolSingleScatteringAlbedo);
    const mieAbsorptionKm: AtmosphereVec3 = [
        Math.max(0, mieExtinctionKm[0] - mieScatteringKm[0]),
        Math.max(0, mieExtinctionKm[1] - mieScatteringKm[1]),
        Math.max(0, mieExtinctionKm[2] - mieScatteringKm[2]),
    ];
    const stratosphericAerosolOpticalDepth550 = clamp(
        input.stratosphericAerosolOpticalDepth550 ?? 0,
        0,
        0.6,
    );
    const stratosphericAerosolCenterAltitudeKm = finitePositive(
        input.stratosphericAerosolCenterAltitudeKm,
        20,
        8,
        Math.min(45, atmosphereHeightKm - 1),
    );
    const stratosphericAerosolWidthKm = finitePositive(
        input.stratosphericAerosolWidthKm,
        4.5,
        1.25,
        12,
    );
    const stratosphericColumnKm = integrateVerticalProfile(
        atmosphereHeightKm,
        (altitudeKm) => gaussianLayerDensity(
            altitudeKm,
            stratosphericAerosolCenterAltitudeKm,
            stratosphericAerosolWidthKm,
        ),
    );
    const stratosphericExtinction550 = stratosphericAerosolOpticalDepth550 /
        stratosphericColumnKm;
    const stratosphericExtinctionKm = map3(RGB_WAVELENGTHS_MICRONS, (wavelength) =>
        stratosphericExtinction550 * Math.pow(
            wavelength / 0.55,
            -STRATOSPHERIC_SULFATE_ANGSTROM_EXPONENT,
        ));
    const stratosphericMieScatteringKm = mul3(
        stratosphericExtinctionKm,
        STRATOSPHERIC_SULFATE_SINGLE_SCATTERING_ALBEDO,
    );
    const stratosphericMieAbsorptionKm: AtmosphereVec3 = [
        Math.max(0, stratosphericExtinctionKm[0] - stratosphericMieScatteringKm[0]),
        Math.max(0, stratosphericExtinctionKm[1] - stratosphericMieScatteringKm[1]),
        Math.max(0, stratosphericExtinctionKm[2] - stratosphericMieScatteringKm[2]),
    ];
    const ozoneScale = finitePositive(
        input.ozoneColumnDobson,
        STANDARD_OZONE_DOBSON,
        100,
        700,
    ) / STANDARD_OZONE_DOBSON;
    const ozoneCenterAltitudeKm = finitePositive(
        input.ozoneCenterAltitudeKm,
        25,
        12,
        45,
    );
    const ozoneHalfWidthKm = finitePositive(
        input.ozoneHalfWidthKm,
        STANDARD_OZONE_PROFILE_COLUMN_KM,
        5,
        30,
    );
    // Normalize after clipping the profile to the finite atmosphere. This is
    // important for broad/low authored layers whose mathematical support would
    // otherwise extend below the ground and silently lose ozone mass.
    const ozoneProfileColumnKm = integrateVerticalProfile(
        atmosphereHeightKm,
        (altitudeKm) => raisedCosineOzoneDensity(
            altitudeKm,
            ozoneCenterAltitudeKm,
            ozoneHalfWidthKm,
        ),
    );
    const residual = input.grade?.chromaResidual ?? [0, 0, 0];
    return {
        bottomRadiusKm,
        topRadiusKm: bottomRadiusKm + atmosphereHeightKm,
        observerAltitudeKm: clamp(input.observerAltitudeKm ?? 0.002, 0.001, atmosphereHeightKm - 0.01),
        rayleighScaleHeightKm,
        mieScaleHeightKm,
        aerosolBoundaryLayerStrength,
        aerosolBoundaryLayerHeightKm,
        aerosolBoundaryLayerTransitionKm,
        rayleighScatteringKm: scale3(EARTH_RAYLEIGH_SCATTERING_KM, pressureScale),
        mieScatteringKm,
        mieAbsorptionKm,
        mieAsymmetry: clamp(
            (input.aerosolAsymmetry ?? preset.asymmetry) +
                0.035 * Math.max(0, humidityGrowth - 1),
            0.45,
            0.92,
        ),
        stratosphericMieScatteringKm,
        stratosphericMieAbsorptionKm,
        stratosphericMieAsymmetry: STRATOSPHERIC_SULFATE_ASYMMETRY,
        stratosphericAerosolOpticalDepth550,
        stratosphericAerosolCenterAltitudeKm,
        stratosphericAerosolWidthKm,
        ozoneAbsorptionKm: scale3(
            EARTH_OZONE_ABSORPTION_KM,
            ozoneScale * STANDARD_OZONE_PROFILE_COLUMN_KM /
                ozoneProfileColumnKm,
        ),
        ozoneCenterAltitudeKm,
        ozoneHalfWidthKm,
        groundAlbedo: map3(input.groundAlbedo ?? [0.10, 0.11, 0.12], (channel) => clamp(channel, 0, 0.95)),
        multipleScatteringFactor: clamp(input.multipleScatteringFactor ?? 1, 0, 1.25),
        aerosolType,
        aerosolOpticalDepth550,
        aerosolAngstromExponent,
        aerosolSingleScatteringAlbedo,
        relativeHumidity,
        grade: {
            exposureCompensationEv: clamp(input.grade?.exposureCompensationEv ?? 0, -1.5, 1.5),
            chromaResidual: map3(residual, (channel) => clamp(channel, -0.12, 0.12)),
            moodStrength: clamp(input.grade?.moodStrength ?? 0, 0, 0.35),
        },
    };
};

/** Density and coefficient evaluation shared by CPU qualification tests. */
export const sampleAtmosphereMedium = (
    state: PhysicalAtmosphereState,
    altitudeKm: number,
): AtmosphereMediumSample => {
    const altitude = Math.max(0, altitudeKm);
    const rayleighDensity = Math.exp(-altitude / state.rayleighScaleHeightKm);
    const mieDensity = troposphericAerosolDensity(
        altitude,
        state.mieScaleHeightKm,
        state.aerosolBoundaryLayerStrength,
        state.aerosolBoundaryLayerHeightKm,
        state.aerosolBoundaryLayerTransitionKm,
    );
    const stratosphericMieDensity = gaussianLayerDensity(
        altitude,
        state.stratosphericAerosolCenterAltitudeKm,
        state.stratosphericAerosolWidthKm,
    );
    // Raised cosine has the same vertical integral as the former triangle but
    // is C1-continuous at its peak and support boundary.
    const ozoneDensity = raisedCosineOzoneDensity(
        altitude,
        state.ozoneCenterAltitudeKm,
        state.ozoneHalfWidthKm,
    );
    const rayleighScattering = scale3(state.rayleighScatteringKm, rayleighDensity);
    const troposphericMieScattering = scale3(state.mieScatteringKm, mieDensity);
    const stratosphericMieScattering = scale3(
        state.stratosphericMieScatteringKm,
        stratosphericMieDensity,
    );
    const mieScattering = add3(troposphericMieScattering, stratosphericMieScattering);
    const absorption = add3(
        add3(
            scale3(state.mieAbsorptionKm, mieDensity),
            scale3(state.stratosphericMieAbsorptionKm, stratosphericMieDensity),
        ),
        scale3(state.ozoneAbsorptionKm, ozoneDensity),
    );
    const scattering = add3(rayleighScattering, mieScattering);
    return {
        rayleighDensity,
        mieDensity,
        stratosphericMieDensity,
        ozoneDensity,
        rayleighScattering,
        mieScattering,
        troposphericMieScattering,
        stratosphericMieScattering,
        absorption,
        scattering,
        extinction: add3(scattering, absorption),
    };
};

export const beerLambert = (extinctionPerKm: AtmosphereVec3, distanceKm: number): AtmosphereVec3 =>
    expNeg3(scale3(extinctionPerKm, Math.max(0, distanceKm)));

export const raySphereNearestDistance = (
    origin: AtmosphereVec3,
    direction: AtmosphereVec3,
    radiusKm: number,
): number => {
    const unitDirection = normalize3(direction);
    const b = dot3(origin, unitDirection);
    const c = dot3(origin, origin) - radiusKm * radiusKm;
    const discriminant = b * b - c;
    if (discriminant < 0) return -1;
    const root = Math.sqrt(discriminant);
    const near = -b - root;
    const far = -b + root;
    if (near >= 0) return near;
    return far >= 0 ? far : -1;
};

/** Hillaire/Bruneton spherical transmittance parameterization. */
export const atmosphereTransmittanceLutUv = (
    state: PhysicalAtmosphereState,
    radiusKm: number,
    zenithCosine: number,
): readonly [number, number] => {
    const radius = clamp(radiusKm, state.bottomRadiusKm, state.topRadiusKm);
    const mu = clamp(zenithCosine, -1, 1);
    const H = Math.sqrt(Math.max(0,
        state.topRadiusKm ** 2 - state.bottomRadiusKm ** 2));
    const rho = Math.sqrt(Math.max(0,
        radius ** 2 - state.bottomRadiusKm ** 2));
    const discriminant = Math.max(0,
        radius ** 2 * (mu ** 2 - 1) + state.topRadiusKm ** 2);
    const distance = Math.max(0, -radius * mu + Math.sqrt(discriminant));
    const minimumDistance = state.topRadiusKm - radius;
    const maximumDistance = rho + H;
    return [
        saturate((distance - minimumDistance) /
            Math.max(maximumDistance - minimumDistance, 1e-9)),
        saturate(rho / Math.max(H, 1e-9)),
    ];
};

export const atmosphereTransmittanceLutParameters = (
    state: PhysicalAtmosphereState,
    uv: readonly [number, number],
): { radiusKm: number; zenithCosine: number } => {
    const H = Math.sqrt(Math.max(0,
        state.topRadiusKm ** 2 - state.bottomRadiusKm ** 2));
    const rho = H * saturate(uv[1]);
    const radiusKm = Math.sqrt(rho ** 2 + state.bottomRadiusKm ** 2);
    const minimumDistance = state.topRadiusKm - radiusKm;
    const maximumDistance = rho + H;
    const distance = minimumDistance + saturate(uv[0]) *
        (maximumDistance - minimumDistance);
    const zenithCosine = distance <= 1e-9 ? 1 : clamp(
        (H ** 2 - rho ** 2 - distance ** 2) /
            (2 * radiusKm * distance),
        -1,
        1,
    );
    return { radiusKm, zenithCosine };
};

const unitToSubUv = (value: number, resolution: number) =>
    (value + 0.5 / resolution) * resolution / (resolution + 1);

/** The two horizon branches converge continuously to the centre texel row. */
export const atmosphereSkyViewLutUv = (
    state: PhysicalAtmosphereState,
    observerAltitudeKm: number,
    viewZenithCosine: number,
    lightViewCosine: number,
    intersectsGround: boolean,
): readonly [number, number] => {
    const radius = state.bottomRadiusKm + Math.max(0.001, observerAltitudeKm);
    const horizonDistance = Math.sqrt(Math.max(0,
        radius ** 2 - state.bottomRadiusKm ** 2));
    const beta = Math.acos(clamp(horizonDistance / radius, -1, 1));
    const zenithHorizonAngle = PI - beta;
    let v: number;
    if (!intersectsGround) {
        let coordinate = 1 - Math.acos(clamp(viewZenithCosine, -1, 1)) /
            Math.max(zenithHorizonAngle, 1e-9);
        coordinate = Math.sqrt(Math.max(0, coordinate));
        v = (1 - coordinate) * 0.5;
    } else {
        let coordinate = (Math.acos(clamp(viewZenithCosine, -1, 1)) -
            zenithHorizonAngle) / Math.max(beta, 1e-9);
        coordinate = Math.sqrt(Math.max(0, coordinate));
        v = coordinate * 0.5 + 0.5;
    }
    const u = Math.sqrt(saturate(-lightViewCosine * 0.5 + 0.5));
    return [unitToSubUv(u, 192), unitToSubUv(v, 108)];
};

const pointAlong = (origin: AtmosphereVec3, direction: AtmosphereVec3, distance: number): AtmosphereVec3 => [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
];

export const atmosphereOpticalDepthBetween = (
    state: PhysicalAtmosphereState,
    startWorldKm: AtmosphereVec3,
    endWorldKm: AtmosphereVec3,
    sampleCount = 96,
): AtmosphereVec3 => {
    const delta: AtmosphereVec3 = [
        endWorldKm[0] - startWorldKm[0],
        endWorldKm[1] - startWorldKm[1],
        endWorldKm[2] - startWorldKm[2],
    ];
    const distance = length3(delta);
    if (distance <= 1e-9) return [0, 0, 0];
    const direction = scale3(delta, 1 / distance);
    const steps = Math.max(4, Math.min(512, Math.floor(sampleCount)));
    const dt = distance / steps;
    let opticalDepth: AtmosphereVec3 = [0, 0, 0];
    for (let index = 0; index < steps; index += 1) {
        const point = pointAlong(startWorldKm, direction, (index + 0.5) * dt);
        const altitude = length3(point) - state.bottomRadiusKm;
        if (altitude < 0 || length3(point) > state.topRadiusKm) continue;
        opticalDepth = add3(opticalDepth, scale3(sampleAtmosphereMedium(state, altitude).extinction, dt));
    }
    return opticalDepth;
};

export const atmosphereTransmittanceBetween = (
    state: PhysicalAtmosphereState,
    startWorldKm: AtmosphereVec3,
    endWorldKm: AtmosphereVec3,
    sampleCount = 96,
): AtmosphereVec3 => expNeg3(atmosphereOpticalDepthBetween(state, startWorldKm, endWorldKm, sampleCount));

const rayHitsGround = (
    state: PhysicalAtmosphereState,
    startWorldKm: AtmosphereVec3,
    direction: AtmosphereVec3,
) => raySphereNearestDistance(startWorldKm, direction, state.bottomRadiusKm + 1e-4) >= 0;

export const atmosphereTransmittanceToSpace = (
    state: PhysicalAtmosphereState,
    startWorldKm: AtmosphereVec3,
    direction: AtmosphereVec3,
    sampleCount = 96,
): AtmosphereVec3 => {
    const unitDirection = normalize3(direction);
    if (rayHitsGround(state, startWorldKm, unitDirection)) return [0, 0, 0];
    const distance = raySphereNearestDistance(startWorldKm, unitDirection, state.topRadiusKm);
    if (distance < 0) return [1, 1, 1];
    return atmosphereTransmittanceBetween(
        state,
        startWorldKm,
        pointAlong(startWorldKm, unitDirection, distance),
        sampleCount,
    );
};

/**
 * Exact CPU reference for the direct celestial path at the configured
 * observer. The returned value is a transfer coefficient only: source
 * radiance, visibility, photographic exposure, and cloud occultation are not
 * part of this API. Consumers that also use the atmosphere LUT can therefore
 * share one optical state without baking extinction into a source twice.
 */
export const atmosphereObserverTransmittanceToSpace = (
    state: PhysicalAtmosphereState,
    direction: AtmosphereVec3,
    observerAltitudeKm = state.observerAltitudeKm,
    sampleCount = 128,
): AtmosphereVec3 => {
    const altitude = clamp(
        observerAltitudeKm,
        0.001,
        state.topRadiusKm - state.bottomRadiusKm - 0.01,
    );
    const observerWorldKm: AtmosphereVec3 = [
        0,
        0,
        state.bottomRadiusKm + altitude,
    ];
    return atmosphereTransmittanceToSpace(
        state,
        observerWorldKm,
        direction,
        sampleCount,
    );
};

export const rayleighPhase = (cosTheta: number) =>
    3 / (16 * PI) * (1 + clamp(cosTheta, -1, 1) ** 2);

export const cornetteShanksPhase = (asymmetry: number, cosTheta: number) => {
    const g = clamp(asymmetry, -0.98, 0.98);
    const mu = clamp(cosTheta, -1, 1);
    const normalization = 3 / (8 * PI) * (1 - g * g) / (2 + g * g);
    return normalization * (1 + mu * mu) /
        Math.pow(Math.max(1e-6, 1 + g * g - 2 * g * mu), 1.5);
};

const normalizeSource = (source: AtmosphereLightSource): AtmosphereLightSource => ({
    kind: source.kind,
    direction: normalize3(source.direction),
    topOfAtmosphereRadiance: map3(source.topOfAtmosphereRadiance, (channel) =>
        clamp(channel, 0, 1e9)),
    angularRadiusRadians: clamp(source.angularRadiusRadians, 1e-6, 0.1),
    enabled: source.enabled ?? true,
});

export const resolveAtmosphereSources = (
    sources: readonly AtmosphereLightSource[],
): readonly [AtmosphereLightSource, AtmosphereLightSource] => {
    const byKind = new Map(sources.map((source) => [source.kind, normalizeSource(source)]));
    const disabled = (kind: AtmosphereLightKind): AtmosphereLightSource => ({
        kind,
        direction: [0, 0, -1],
        topOfAtmosphereRadiance: [0, 0, 0],
        angularRadiusRadians: kind === "sun" ? 0.004675 : 0.00452,
        enabled: false,
    });
    return [byKind.get("sun") ?? disabled("sun"), byKind.get("moon") ?? disabled("moon")];
};

/**
 * Direct source radiance at a world point. Input radiance is always TOA and
 * extinction is applied exactly once here.
 */
export const transportTopOfAtmosphereSource = (
    state: PhysicalAtmosphereState,
    pointWorldKm: AtmosphereVec3,
    source: AtmosphereLightSource,
): AtmosphereVec3 => {
    const normalized = normalizeSource(source);
    if (!normalized.enabled) return [0, 0, 0];
    return mul3(
        normalized.topOfAtmosphereRadiance,
        atmosphereTransmittanceToSpace(state, pointWorldKm, normalized.direction),
    );
};

/** Direct irradiance transfer at a physical altitude; diffuse light comes from the irradiance LUT. */
export const worldAltitudeDirectIrradiance = (
    state: PhysicalAtmosphereState,
    altitudeKm: number,
    source: AtmosphereLightSource,
): AtmosphereVec3 => {
    const normalized = normalizeSource(source);
    const point: AtmosphereVec3 = [0, 0, state.bottomRadiusKm + Math.max(0, altitudeKm)];
    const cosine = Math.max(0, normalized.direction[2]);
    const sourceSolidAngle = 2 * PI * (1 - Math.cos(normalized.angularRadiusRadians));
    return scale3(transportTopOfAtmosphereSource(state, point, normalized),
        cosine * sourceSolidAngle);
};

/**
 * CPU reference for finite cloud/ground-to-camera air transport. The GPU API
 * in `physical-atmosphere-wgsl.ts` uses the same midpoint/analytic-step form.
 */
export const integrateAtmosphereSegment = (
    state: PhysicalAtmosphereState,
    startWorldKm: AtmosphereVec3,
    endWorldKm: AtmosphereVec3,
    sources: readonly AtmosphereLightSource[],
    sampleCount = 32,
): AtmosphereSegmentTransport => {
    const delta: AtmosphereVec3 = [
        endWorldKm[0] - startWorldKm[0],
        endWorldKm[1] - startWorldKm[1],
        endWorldKm[2] - startWorldKm[2],
    ];
    const distance = length3(delta);
    if (distance <= 1e-9) return { radiance: [0, 0, 0], transmittance: [1, 1, 1] };
    const viewDirection = scale3(delta, 1 / distance);
    const steps = Math.max(4, Math.min(128, Math.floor(sampleCount)));
    const dt = distance / steps;
    let throughput: AtmosphereVec3 = [1, 1, 1];
    let radiance: AtmosphereVec3 = [0, 0, 0];
    const resolvedSources = resolveAtmosphereSources(sources);
    for (let index = 0; index < steps; index += 1) {
        const point = pointAlong(startWorldKm, viewDirection, (index + 0.5) * dt);
        const altitude = length3(point) - state.bottomRadiusKm;
        if (altitude < 0 || length3(point) > state.topRadiusKm) continue;
        const medium = sampleAtmosphereMedium(state, altitude);
        let sourceTerm: AtmosphereVec3 = [0, 0, 0];
        for (const source of resolvedSources) {
            if (!source.enabled) continue;
            const sourceSolidAngle = 2 * PI * (1 - Math.cos(source.angularRadiusRadians));
            const sourceIrradiance = scale3(
                transportTopOfAtmosphereSource(state, point, source),
                sourceSolidAngle,
            );
            // Both vectors point away from the observer toward the sample and
            // source. Equal directions are zero-angle forward scattering.
            const cosTheta = dot3(viewDirection, source.direction);
            const phaseScattering = add3(
                scale3(medium.rayleighScattering, rayleighPhase(cosTheta)),
                add3(
                    scale3(
                        medium.troposphericMieScattering,
                        cornetteShanksPhase(state.mieAsymmetry, cosTheta),
                    ),
                    scale3(
                        medium.stratosphericMieScattering,
                        cornetteShanksPhase(state.stratosphericMieAsymmetry, cosTheta),
                    ),
                ),
            );
            sourceTerm = add3(sourceTerm, mul3(sourceIrradiance, phaseScattering));
        }
        const stepTransmittance = beerLambert(medium.extinction, dt);
        const integratedSource: AtmosphereVec3 = [0, 1, 2].map((channel) => {
            const extinction = medium.extinction[channel];
            return sourceTerm[channel] * (1 - stepTransmittance[channel]) /
                Math.max(extinction, 1e-8);
        }) as unknown as AtmosphereVec3;
        radiance = add3(radiance, mul3(throughput, integratedSource));
        throughput = mul3(throughput, stepTransmittance);
    }
    return { radiance, transmittance: throughput };
};

/**
 * CPU reference for a complete ground-observer sky ray. This deliberately
 * shares the finite affine transport path so qualification cannot hide a
 * different day/twilight/night equation behind regime labels.
 */
export const integrateAtmosphereViewRay = (
    state: PhysicalAtmosphereState,
    observerAltitudeKm: number,
    viewDirection: AtmosphereVec3,
    sources: readonly AtmosphereLightSource[],
    sampleCount = 128,
): AtmosphereSegmentTransport => {
    const altitude = clamp(
        observerAltitudeKm,
        0.001,
        state.topRadiusKm - state.bottomRadiusKm - 0.01,
    );
    const origin: AtmosphereVec3 = [0, 0, state.bottomRadiusKm + altitude];
    const direction = normalize3(viewDirection);
    const topDistance = raySphereNearestDistance(origin, direction, state.topRadiusKm);
    const groundDistance = raySphereNearestDistance(
        origin,
        direction,
        state.bottomRadiusKm + 1e-4,
    );
    const distance = groundDistance >= 0 &&
        (topDistance < 0 || groundDistance < topDistance)
        ? groundDistance
        : topDistance;
    if (distance <= 1e-9) {
        return { radiance: [0, 0, 0], transmittance: [1, 1, 1] };
    }
    return integrateAtmosphereSegment(
        state,
        origin,
        pointAlong(origin, direction, distance),
        sources,
        sampleCount,
    );
};

export const composeAtmosphereSegment = (
    backgroundRadiance: AtmosphereVec3,
    segment: AtmosphereSegmentTransport,
): AtmosphereVec3 => add3(segment.radiance, mul3(backgroundRadiance, segment.transmittance));

/** Creative residual applied only after physical scene radiance is complete. */
export const applyAtmosphereArtisticGrade = (
    radiance: AtmosphereVec3,
    grade: AtmosphereArtisticGrade,
): AtmosphereVec3 => {
    const exposure = Math.pow(2, clamp(grade.exposureCompensationEv, -1.5, 1.5));
    const amount = clamp(grade.moodStrength, 0, 0.35);
    return map3(radiance, (channel, index) => Math.max(0,
        channel * exposure * (1 + clamp(grade.chromaResidual[index], -0.12, 0.12) * amount)));
};

const packSource = (target: Float32Array, offset: number, source: AtmosphereLightSource) => {
    target.set([...source.direction, source.enabled ? 1 : 0], offset);
    target.set([...source.topOfAtmosphereRadiance, source.angularRadiusRadians], offset + 4);
};

/** Exact 16×vec4 WGSL uniform ABI. */
export const packPhysicalAtmosphereUniforms = (
    state: PhysicalAtmosphereState,
    lighting: AtmosphereLightingState,
): Float32Array => {
    const result = new Float32Array(PHYSICAL_ATMOSPHERE_UNIFORM_FLOATS);
    const observerAltitude = clamp(
        lighting.observerAltitudeKm ?? state.observerAltitudeKm,
        0.001,
        state.topRadiusKm - state.bottomRadiusKm - 0.01,
    );
    const [sun, moon] = resolveAtmosphereSources(lighting.sources);
    result.set([
        state.bottomRadiusKm,
        state.topRadiusKm,
        state.rayleighScaleHeightKm,
        state.mieScaleHeightKm,
    ], 0);
    result.set([...state.rayleighScatteringKm, state.mieAsymmetry], 4);
    result.set([...state.mieScatteringKm, observerAltitude], 8);
    result.set([...state.mieAbsorptionKm, state.ozoneCenterAltitudeKm], 12);
    result.set([...state.ozoneAbsorptionKm, state.ozoneHalfWidthKm], 16);
    result.set([...state.groundAlbedo, state.multipleScatteringFactor], 20);
    packSource(result, 24, sun);
    packSource(result, 32, moon);
    result.set([
        state.grade.exposureCompensationEv,
        ...state.grade.chromaResidual,
    ], 40);
    result.set([
        state.grade.moodStrength,
        state.topRadiusKm - state.bottomRadiusKm,
        48,
        32,
    ], 44);
    result.set([0, 0, state.bottomRadiusKm + observerAltitude, 1], 48);
    result.set([
        ...state.stratosphericMieScatteringKm,
        state.stratosphericAerosolCenterAltitudeKm,
    ], 52);
    result.set([
        ...state.stratosphericMieAbsorptionKm,
        state.stratosphericAerosolWidthKm,
    ], 56);
    result.set([
        state.aerosolBoundaryLayerStrength,
        state.aerosolBoundaryLayerHeightKm,
        state.aerosolBoundaryLayerTransitionKm,
        state.stratosphericMieAsymmetry,
    ], 60);
    return result;
};

const stableNumbersKey = (values: Iterable<number>) => Array.from(values)
    .map((value) => Number.isFinite(value) ? value.toPrecision(9) : "nan")
    .join("|");

export const physicalAtmosphereOpticalKey = (state: PhysicalAtmosphereState) => stableNumbersKey([
    state.bottomRadiusKm,
    state.topRadiusKm,
    state.rayleighScaleHeightKm,
    state.mieScaleHeightKm,
    state.aerosolBoundaryLayerStrength,
    state.aerosolBoundaryLayerHeightKm,
    state.aerosolBoundaryLayerTransitionKm,
    ...state.rayleighScatteringKm,
    ...state.mieScatteringKm,
    ...state.mieAbsorptionKm,
    state.mieAsymmetry,
    ...state.stratosphericMieScatteringKm,
    ...state.stratosphericMieAbsorptionKm,
    state.stratosphericMieAsymmetry,
    state.stratosphericAerosolCenterAltitudeKm,
    state.stratosphericAerosolWidthKm,
    ...state.ozoneAbsorptionKm,
    state.ozoneCenterAltitudeKm,
    state.ozoneHalfWidthKm,
    ...state.groundAlbedo,
    state.multipleScatteringFactor,
]);

export const physicalAtmosphereSkyKey = (
    state: PhysicalAtmosphereState,
    lighting: AtmosphereLightingState,
) => {
    const [sun, moon] = resolveAtmosphereSources(lighting.sources);
    return stableNumbersKey([
        lighting.observerAltitudeKm ?? state.observerAltitudeKm,
        ...sun.direction,
        sun.enabled ? 1 : 0,
        ...moon.direction,
        moon.enabled ? 1 : 0,
    ]);
};

/**
 * Directional radiance stores transported scene energy, so source radiometry
 * invalidates it while exposure and the bounded display grade do not. The
 * ordinary sky-view LUT remains a radiometry-independent transfer cache.
 */
export const physicalAtmosphereDirectionalLightingKey = (
    state: PhysicalAtmosphereState,
    lighting: AtmosphereLightingState,
) => {
    const [sun, moon] = resolveAtmosphereSources(lighting.sources);
    return `${physicalAtmosphereOpticalKey(state)}|${stableNumbersKey([
        ...sun.direction,
        ...sun.topOfAtmosphereRadiance,
        sun.angularRadiusRadians,
        sun.enabled ? 1 : 0,
        ...moon.direction,
        ...moon.topOfAtmosphereRadiance,
        moon.angularRadiusRadians,
        moon.enabled ? 1 : 0,
    ])}`;
};

interface GpuResourceLike {
    destroy?: () => void;
    createView?: (descriptor?: Record<string, unknown>) => unknown;
}

interface GpuPipelineLike {
    getBindGroupLayout: (index: number) => unknown;
}

interface PhysicalAtmosphereGpuDevice {
    createTexture: (descriptor: Record<string, unknown>) => GpuResourceLike;
    createBuffer: (descriptor: Record<string, unknown>) => GpuResourceLike;
    createSampler: (descriptor: Record<string, unknown>) => GpuResourceLike;
    createShaderModule: (descriptor: Record<string, unknown>) => unknown;
    createComputePipelineAsync: (descriptor: Record<string, unknown>) => Promise<GpuPipelineLike>;
    createBindGroup: (descriptor: Record<string, unknown>) => unknown;
    queue: {
        writeBuffer: (
            buffer: GpuResourceLike,
            bufferOffset: number,
            data: Float32Array,
        ) => void;
    };
}

interface ComputePassLike {
    setPipeline: (pipeline: GpuPipelineLike) => void;
    setBindGroup: (index: number, bindGroup: unknown) => void;
    dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
    end: () => void;
}

interface CommandEncoderLike {
    beginComputePass: (descriptor?: Record<string, unknown>) => ComputePassLike;
}

export interface PhysicalAtmosphereGpuBindings {
    uniformBuffer: GpuResourceLike;
    transmittanceView: unknown;
    multipleScatteringView: unknown;
    skyView: unknown;
    irradianceView: unknown;
    directionalCouplingAtlasView: unknown;
    directionalCouplingAtlasStorageView: unknown;
    sampler: GpuResourceLike;
}

export interface AtmosphereLutUpdateReport {
    opticalUpdated: boolean;
    skyViewUpdated: boolean;
    directionalLightingUpdated: boolean;
    passes: readonly string[];
}

export interface PhysicalAtmosphereGpuResources {
    readonly bindings: PhysicalAtmosphereGpuBindings;
    readonly textureMemoryBytes: number;
    readonly consumerWgsl: typeof physicalAtmosphereConsumerWgsl;
    update: (state: PhysicalAtmosphereState, lighting: AtmosphereLightingState) => {
        opticalChanged: boolean;
        skyViewChanged: boolean;
        directionalLightingChanged: boolean;
        uniformChanged: boolean;
    };
    encodePendingLutUpdates: (encoder: CommandEncoderLike) => AtmosphereLutUpdateReport;
    destroy: () => void;
}

const textureByteLength = (layout: { width: number; height: number; depthOrArrayLayers: number }) =>
    layout.width * layout.height * layout.depthOrArrayLayers * 8;

/**
 * Allocate and compile the bounded atmosphere LUT graph. Optical LUTs update
 * only when medium/planet state changes; sky-view updates only when optical
 * state, observer altitude, or source direction changes. Source radiance
 * refreshes only the compact directional cache; the creative grade and
 * exposure remain cheap uniform-only updates.
 */
export const createPhysicalAtmosphereGpuResources = async (
    device: PhysicalAtmosphereGpuDevice,
    initialState: PhysicalAtmosphereState,
    initialLighting: AtmosphereLightingState,
    usage = {
        texture: 0x04 | 0x08, // TEXTURE_BINDING | STORAGE_BINDING
        buffer: 0x08 | 0x40, // COPY_DST | UNIFORM
    },
): Promise<PhysicalAtmosphereGpuResources> => {
    const makeTexture = (name: keyof typeof PHYSICAL_ATMOSPHERE_LUT_LAYOUT) => {
        const layout = PHYSICAL_ATMOSPHERE_LUT_LAYOUT[name];
        return device.createTexture({
            label: `physical atmosphere ${name} LUT`,
            size: {
                width: layout.width,
                height: layout.height,
                depthOrArrayLayers: layout.depthOrArrayLayers,
            },
            dimension: "2d",
            format: layout.format,
            mipLevelCount: 1,
            usage: usage.texture,
        });
    };
    const transmittance = makeTexture("transmittance");
    const multipleScattering = makeTexture("multipleScattering");
    const skyView = makeTexture("skyView");
    const irradiance = makeTexture("irradiance");
    const directionalCoupling = makeTexture("directionalCoupling");
    const transmittanceView = transmittance.createView?.() ?? transmittance;
    const multipleScatteringView = multipleScattering.createView?.() ?? multipleScattering;
    const skyViewArray = skyView.createView?.({
        dimension: "2d-array",
        arrayLayerCount: PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY,
    }) ?? skyView;
    const irradianceView = irradiance.createView?.() ?? irradiance;
    const directionalCouplingAtlasView = directionalCoupling.createView?.({
        dimension: "2d-array",
        arrayLayerCount: PHYSICAL_ATMOSPHERE_LUT_LAYOUT.directionalCoupling
            .depthOrArrayLayers,
    }) ?? directionalCoupling;
    const directionalCouplingAtlasStorageView = directionalCoupling.createView?.({
        dimension: "2d-array",
        arrayLayerCount: PHYSICAL_ATMOSPHERE_LUT_LAYOUT.directionalCoupling
            .depthOrArrayLayers,
    }) ?? directionalCoupling;
    const uniformBuffer = device.createBuffer({
        label: "physical atmosphere uniform state",
        size: PHYSICAL_ATMOSPHERE_UNIFORM_BYTES,
        usage: usage.buffer,
    });
    const sampler = device.createSampler({
        label: "physical atmosphere LUT sampler",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        addressModeW: "clamp-to-edge",
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "nearest",
    });
    const destroyAllocatedResources = () => {
        transmittance.destroy?.();
        multipleScattering.destroy?.();
        skyView.destroy?.();
        irradiance.destroy?.();
        directionalCoupling.destroy?.();
        uniformBuffer.destroy?.();
        sampler.destroy?.();
    };
    const shaderSources = [
        ["transmittance", PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL],
        ["multiple scattering", PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL],
        ["irradiance", PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL],
        ["sky view", PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL],
        ["directional lighting", PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL],
    ] as const;
    let pipelines: readonly GpuPipelineLike[];
    try {
        pipelines = await Promise.all(shaderSources.map(async ([label, code]) => {
            const module = device.createShaderModule({ label: `physical atmosphere ${label} shader`, code });
            return device.createComputePipelineAsync({
                label: `physical atmosphere ${label} pipeline`,
                layout: "auto",
                compute: { module, entryPoint: `${label.replaceAll(" ", "_")}_compute` },
            });
        }));
    } catch (error) {
        destroyAllocatedResources();
        throw error;
    }
    const [transmittancePipeline, multipleScatteringPipeline, irradiancePipeline,
        skyViewPipeline, directionalLightingPipeline] = pipelines;
    let bindGroups: readonly unknown[];
    try {
        bindGroups = [
            device.createBindGroup({
                label: "physical atmosphere transmittance bindings",
                layout: transmittancePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: transmittanceView },
                ],
            }),
            device.createBindGroup({
                label: "physical atmosphere multiple scattering bindings",
                layout: multipleScatteringPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: transmittanceView },
                    { binding: 2, resource: sampler },
                    { binding: 3, resource: multipleScatteringView },
                ],
            }),
            device.createBindGroup({
                label: "physical atmosphere irradiance bindings",
                layout: irradiancePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: transmittanceView },
                    { binding: 2, resource: multipleScatteringView },
                    { binding: 3, resource: sampler },
                    { binding: 4, resource: irradianceView },
                ],
            }),
            device.createBindGroup({
                label: "physical atmosphere sky-view bindings",
                layout: skyViewPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: transmittanceView },
                    { binding: 2, resource: multipleScatteringView },
                    { binding: 3, resource: sampler },
                    { binding: 4, resource: skyViewArray },
                ],
            }),
            device.createBindGroup({
                label: "physical atmosphere directional-lighting bindings",
                layout: directionalLightingPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 1, resource: transmittanceView },
                    { binding: 2, resource: multipleScatteringView },
                    { binding: 3, resource: sampler },
                    { binding: 4, resource: directionalCouplingAtlasStorageView },
                ],
            }),
        ];
    } catch (error) {
        destroyAllocatedResources();
        throw error;
    }
    const [transmittanceBindGroup, multipleScatteringBindGroup,
        irradianceBindGroup, skyViewBindGroup, directionalLightingBindGroup] = bindGroups;

    let opticalKey = "";
    let skyKey = "";
    let directionalLightingKey = "";
    let uniformKey = "";
    let opticalDirty = true;
    let skyDirty = true;
    let directionalLightingDirty = true;
    let destroyed = false;
    const update = (state: PhysicalAtmosphereState, lighting: AtmosphereLightingState) => {
        if (destroyed) throw new Error("Physical atmosphere resources are destroyed");
        const nextOpticalKey = physicalAtmosphereOpticalKey(state);
        const nextSkyKey = physicalAtmosphereSkyKey(state, lighting);
        const nextDirectionalLightingKey = physicalAtmosphereDirectionalLightingKey(
            state, lighting);
        const packed = packPhysicalAtmosphereUniforms(state, lighting);
        const nextUniformKey = stableNumbersKey(packed);
        const opticalChanged = nextOpticalKey !== opticalKey;
        const skyViewChanged = opticalChanged || nextSkyKey !== skyKey;
        const directionalLightingChanged = opticalChanged ||
            nextDirectionalLightingKey !== directionalLightingKey;
        const uniformChanged = nextUniformKey !== uniformKey;
        if (uniformChanged) device.queue.writeBuffer(uniformBuffer, 0, packed);
        opticalDirty ||= opticalChanged;
        skyDirty ||= skyViewChanged;
        directionalLightingDirty ||= directionalLightingChanged;
        opticalKey = nextOpticalKey;
        skyKey = nextSkyKey;
        directionalLightingKey = nextDirectionalLightingKey;
        uniformKey = nextUniformKey;
        return { opticalChanged, skyViewChanged, directionalLightingChanged,
            uniformChanged };
    };
    update(initialState, initialLighting);

    const run = (
        encoder: CommandEncoderLike,
        label: string,
        pipeline: GpuPipelineLike,
        bindGroup: unknown,
        x: number,
        y: number,
        z = 1,
    ) => {
        const pass = encoder.beginComputePass({ label });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(x / 8), Math.ceil(y / 8), z);
        pass.end();
    };
    const encodePendingLutUpdates = (encoder: CommandEncoderLike): AtmosphereLutUpdateReport => {
        if (destroyed) throw new Error("Physical atmosphere resources are destroyed");
        const passes: string[] = [];
        const opticalUpdated = opticalDirty;
        const skyViewUpdated = skyDirty || opticalDirty;
        const directionalLightingUpdated = directionalLightingDirty || opticalDirty;
        if (opticalDirty) {
            run(encoder, "physical atmosphere transmittance LUT", transmittancePipeline,
                transmittanceBindGroup, 256, 64);
            passes.push("transmittance");
            run(encoder, "physical atmosphere multiple-scattering LUT", multipleScatteringPipeline,
                multipleScatteringBindGroup, 32, 32);
            passes.push("multiple-scattering");
            run(encoder, "physical atmosphere irradiance LUT", irradiancePipeline,
                irradianceBindGroup, 64, 32);
            passes.push("irradiance");
        }
        if (skyViewUpdated) {
            run(encoder, "physical atmosphere sky-view LUT", skyViewPipeline,
                skyViewBindGroup, 192, 108, PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY);
            passes.push("sky-view");
        }
        if (directionalLightingUpdated) {
            const pass = encoder.beginComputePass({
                label: "physical atmosphere directional-lighting cache",
            });
            pass.setPipeline(directionalLightingPipeline);
            pass.setBindGroup(0, directionalLightingBindGroup);
            pass.dispatchWorkgroups(12, 1, 1);
            pass.end();
            passes.push("directional-lighting");
        }
        opticalDirty = false;
        skyDirty = false;
        directionalLightingDirty = false;
        return { opticalUpdated, skyViewUpdated, directionalLightingUpdated, passes };
    };

    return {
        bindings: {
            uniformBuffer,
            transmittanceView,
            multipleScatteringView,
            skyView: skyViewArray,
            irradianceView,
            directionalCouplingAtlasView,
            directionalCouplingAtlasStorageView,
            sampler,
        },
        textureMemoryBytes: Object.values(PHYSICAL_ATMOSPHERE_LUT_LAYOUT)
            .reduce((sum, layout) => sum + textureByteLength(layout), 0),
        consumerWgsl: physicalAtmosphereConsumerWgsl,
        update,
        encodePendingLutUpdates,
        destroy: () => {
            if (destroyed) return;
            destroyed = true;
            destroyAllocatedResources();
        },
    };
};

export { physicalAtmosphereConsumerWgsl };

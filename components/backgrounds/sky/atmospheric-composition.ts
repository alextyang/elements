import type {
    SkyAerosolType,
    SkySeason,
    SkySurfaceType,
} from "./sky-palettes";
import {
    createPhysicalAtmosphereState,
    type AtmosphereAerosolType,
    type AtmosphereArtisticGrade,
    type PhysicalAtmosphereState,
} from "./physical-atmosphere";

export type GroundAlbedoRgb = readonly [number, number, number];

export interface PhysicalSkyComposition {
    aerosol: number;
    humidity: number;
    aerosolSize: number;
    aerosolAbsorption: number;
    ozone: number;
    observerAltitude: number;
    inversion: number;
    stratosphericAerosol: number;
    groundAlbedo: number;
    /** Optional linear RGB Lambertian reflectance; scalar remains the default. */
    groundAlbedoRgb?: GroundAlbedoRgb;
}

export interface ResolvedPhysicalAtmosphereComposition {
    aerosolOpticalDepth550: number;
    stratosphericAerosolOpticalDepth550: number;
    aerosolBoundaryLayerStrength: number;
    aerosolBoundaryLayerHeightKm: number;
    aerosolBoundaryLayerTransitionKm: number;
    relativeHumidity: number;
    aerosolAngstromExponent: number;
    aerosolSingleScatteringAlbedo: GroundAlbedoRgb;
    aerosolAsymmetry: number;
    ozoneColumnDobson: number;
    observerAltitudeKm: number;
    groundAlbedo: GroundAlbedoRgb;
}

export interface PhysicalAtmosphereStateFromCompositionOptions {
    bottomRadiusKm?: number;
    atmosphereHeightKm?: number;
    grade?: Partial<AtmosphereArtisticGrade>;
}

const AEROSOL_MICROPHYSICS_PRIORS: Record<SkyAerosolType, {
    singleScatteringAlbedo: GroundAlbedoRgb;
    asymmetry: number;
}> = {
    clean: { singleScatteringAlbedo: [0.99, 0.99, 0.985], asymmetry: 0.72 },
    maritime: { singleScatteringAlbedo: [0.995, 0.995, 0.99], asymmetry: 0.82 },
    dust: { singleScatteringAlbedo: [0.95, 0.91, 0.82], asymmetry: 0.80 },
    smoke: { singleScatteringAlbedo: [0.82, 0.86, 0.91], asymmetry: 0.66 },
    sulfate: { singleScatteringAlbedo: [0.995, 0.998, 0.998], asymmetry: 0.68 },
    pollution: { singleScatteringAlbedo: [0.86, 0.89, 0.92], asymmetry: 0.70 },
};

interface AerosolEnvelope {
    aerosol: readonly [number, number];
    humidity: readonly [number, number];
    size: readonly [number, number];
    absorption: readonly [number, number];
    stratosphere: readonly [number, number];
    angstromExponent: number;
}

export interface AerosolAuthoringPrior {
    aerosol: number;
    humidity: number;
    size: number;
    absorption: number;
}

/** Central dry-particle recipes used when the aerosol class itself is changed. */
export const AEROSOL_AUTHORING_PRIORS: Record<
    SkyAerosolType,
    AerosolAuthoringPrior
> = {
    clean: { aerosol: 0.16, humidity: 0.28, size: 0.18, absorption: 0.025 },
    maritime: { aerosol: 0.5, humidity: 0.78, size: 0.76, absorption: 0.025 },
    dust: { aerosol: 0.62, humidity: 0.2, size: 0.8, absorption: 0.22 },
    smoke: { aerosol: 0.66, humidity: 0.26, size: 0.24, absorption: 0.58 },
    sulfate: { aerosol: 0.34, humidity: 0.46, size: 0.22, absorption: 0.025 },
    pollution: { aerosol: 0.72, humidity: 0.56, size: 0.3, absorption: 0.38 },
};

/**
 * Broad natural envelopes, not single canonical aerosol recipes. Mixed and
 * aged air masses remain possible while combinations that would silently turn
 * sea salt into soot (or mineral dust into fine sulfate) are rejected.
 * Bounds follow the OPAC aerosol classes and NOAA hygroscopic-growth behavior.
 */
export const AEROSOL_PHYSICAL_ENVELOPES: Record<SkyAerosolType, AerosolEnvelope> = {
    clean: {
        aerosol: [0.01, 0.62],
        humidity: [0.02, 0.94],
        size: [0.025, 0.48],
        absorption: [0, 0.16],
        stratosphere: [0, 0.2],
        angstromExponent: 1.3,
    },
    maritime: {
        aerosol: [0.06, 1],
        humidity: [0.34, 1],
        size: [0.42, 1],
        absorption: [0, 0.16],
        stratosphere: [0, 0.14],
        angstromExponent: 0.48,
    },
    dust: {
        aerosol: [0.08, 1],
        humidity: [0.01, 0.66],
        size: [0.5, 1],
        absorption: [0.07, 0.46],
        stratosphere: [0, 0.3],
        angstromExponent: 0.38,
    },
    smoke: {
        aerosol: [0.12, 1],
        humidity: [0.01, 0.84],
        size: [0.06, 0.52],
        absorption: [0.22, 0.95],
        stratosphere: [0, 0.65],
        angstromExponent: 1.72,
    },
    sulfate: {
        aerosol: [0.025, 1],
        humidity: [0.08, 1],
        size: [0.06, 0.56],
        absorption: [0, 0.16],
        stratosphere: [0, 1],
        angstromExponent: 1.82,
    },
    pollution: {
        aerosol: [0.18, 1],
        humidity: [0.16, 1],
        size: [0.1, 0.64],
        absorption: [0.14, 0.76],
        stratosphere: [0, 0.24],
        angstromExponent: 1.36,
    },
};

const finiteClamp = (
    value: number,
    [minimum, maximum]: readonly [number, number],
) => Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

/**
 * Resolve a legacy scalar or explicit linear RGB surface reflectance. The
 * scalar control remains authoritative when no physical surface spectrum is
 * known, rather than inferring terrain from an atmospheric palette label.
 */
export const resolveGroundAlbedoRgb = (
    groundAlbedo: number,
    override?: GroundAlbedoRgb,
): GroundAlbedoRgb => {
    const neutral = finiteClamp(groundAlbedo, [0, 0.95]);
    const source = override ?? [neutral, neutral, neutral];
    return source.map((channel) => finiteClamp(channel, [0, 0.95])) as
        unknown as GroundAlbedoRgb;
};

const SURFACE_REFLECTANCE_PRIORS: Record<SkySurfaceType, GroundAlbedoRgb> = {
    ocean: [0.035, 0.05, 0.07],
    vegetation: [0.075, 0.12, 0.055],
    desert: [0.34, 0.24, 0.14],
    snow: [0.82, 0.88, 0.92],
    urban: [0.12, 0.115, 0.105],
    rock: [0.18, 0.16, 0.14],
    wet: [0.055, 0.065, 0.07],
};

/**
 * Resolve a spectral Lambertian boundary from a real surface class. The small
 * deterministic perturbation changes brightness, never the material's channel
 * ordering, so daily variety cannot turn ocean into snow or vegetation into
 * neutral concrete.
 */
export const resolveEnvironmentGroundAlbedo = (
    surface: SkySurfaceType,
    variability = 0.5,
): GroundAlbedoRgb => {
    const scale = 0.9 + finiteClamp(variability, [0, 1]) * 0.2;
    return SURFACE_REFLECTANCE_PRIORS[surface].map((channel) =>
        finiteClamp(channel * scale, [0.02, 0.92])) as unknown as GroundAlbedoRgb;
};

export interface OzoneClimatologyInput {
    latitude: number;
    season: SkySeason;
    /** Small authored residual around one; it is not a Dobson-unit offset. */
    familyScale?: number;
    variability?: number;
}

/**
 * Broad total-column ozone climatology in Dobson units. NOAA observations put
 * the global mean near 300 DU, the equatorial belt lowest, and middle/high
 * latitudes higher with a seasonal cycle. This intentionally models only the
 * ordinary climatology; an Antarctic ozone-hole state belongs to explicit
 * upper-atmosphere weather authoring.
 */
export const climatologicalOzoneColumnDobson = ({
    latitude,
    season,
    familyScale = 1,
    variability = 0.5,
}: OzoneClimatologyInput) => {
    const latitudeFraction = finiteClamp(Math.abs(latitude) / 90, [0, 1]);
    const latitudeMean = 265 + 70 * latitudeFraction ** 0.86;
    const seasonalScale: Record<SkySeason, number> = {
        winter: 1.035,
        spring: 1.075,
        summer: 0.97,
        autumn: 0.94,
    };
    const weatherResidual = 0.96 + finiteClamp(variability, [0, 1]) * 0.08;
    return finiteClamp(
        latitudeMean *
            seasonalScale[season] *
            finiteClamp(familyScale, [0.86, 1.14]) *
            weatherResidual,
        [230, 430],
    );
};

/** Resolve authored/lab controls onto a physically possible aerosol manifold. */
export const constrainPhysicalSkyComposition = <T extends PhysicalSkyComposition>(
    composition: T,
    aerosolType: SkyAerosolType,
): T & { groundAlbedoRgb: GroundAlbedoRgb } => {
    const envelope = AEROSOL_PHYSICAL_ENVELOPES[aerosolType];
    const groundAlbedo = finiteClamp(composition.groundAlbedo, [0.03, 0.92]);
    return {
        ...composition,
        aerosol: finiteClamp(composition.aerosol, envelope.aerosol),
        humidity: finiteClamp(composition.humidity, envelope.humidity),
        aerosolSize: finiteClamp(composition.aerosolSize, envelope.size),
        aerosolAbsorption: finiteClamp(
            composition.aerosolAbsorption,
            envelope.absorption,
        ),
        ozone: finiteClamp(composition.ozone, [0.65, 1.35]),
        observerAltitude: finiteClamp(composition.observerAltitude, [0, 1]),
        inversion: finiteClamp(composition.inversion, [0, 1]),
        stratosphericAerosol: finiteClamp(
            composition.stratosphericAerosol,
            envelope.stratosphere,
        ),
        groundAlbedo,
        groundAlbedoRgb: resolveGroundAlbedoRgb(
            groundAlbedo,
            composition.groundAlbedoRgb,
        ),
    };
};

export const aerosolAngstromExponent = (aerosolType: SkyAerosolType) =>
    AEROSOL_PHYSICAL_ENVELOPES[aerosolType].angstromExponent;

/** Dry tropospheric column, kept separate from elevated aerosol transport. */
export const troposphericAerosolOpticalDepth550 = (
    composition: PhysicalSkyComposition,
) => Math.max(0.008, 0.018 + composition.aerosol * 0.22);

/** Elevated column is not hygroscopically grown with the boundary layer. */
export const stratosphericAerosolOpticalDepth550 = (
    composition: PhysicalSkyComposition,
) => Math.max(0, composition.stratosphericAerosol * 0.08);

/** Legacy total-column query used by celestial attenuation. */
export const aerosolOpticalDepth550 = (composition: PhysicalSkyComposition) =>
    troposphericAerosolOpticalDepth550(composition) +
    stratosphericAerosolOpticalDepth550(composition);

export const observerAltitudeKm = (composition: PhysicalSkyComposition) =>
    Math.max(0.001, composition.observerAltitude * 2.5);

export const ozoneColumnScale = (composition: PhysicalSkyComposition) =>
    finiteClamp(composition.ozone, [230 / 300, 430 / 300]);

/**
 * One coherent conversion from normalized palette/weather controls to the
 * physical atmosphere state. The palette contributes no sky colors here.
 * Inversion changes vertical organization while conserving aerosol column.
 */
export const resolvePhysicalAtmosphereComposition = (
    composition: PhysicalSkyComposition,
    aerosolType: SkyAerosolType = "clean",
): ResolvedPhysicalAtmosphereComposition => {
    // This resolver is also a public runtime boundary used by the Lab. Do not
    // rely on an upstream palette path having called the authoring constraint:
    // impossible sea-salt/soot or dust/humidity combinations must not enter
    // the physical atmosphere merely because a caller bypassed that helper.
    const constrained = constrainPhysicalSkyComposition(
        composition,
        aerosolType,
    );
    const humidity = finiteClamp(constrained.humidity, [0.02, 0.98]);
    const inversion = finiteClamp(constrained.inversion, [0, 1]);
    const envelope = AEROSOL_PHYSICAL_ENVELOPES[aerosolType];
    const prior = AEROSOL_MICROPHYSICS_PRIORS[aerosolType];
    const sizeSpan = Math.max(1e-6, envelope.size[1] - envelope.size[0]);
    const normalizedSize = finiteClamp(
        (constrained.aerosolSize - envelope.size[0]) / sizeSpan,
        [0, 1],
    );
    const absorptionSpan = Math.max(1e-6,
        envelope.absorption[1] - envelope.absorption[0]);
    const normalizedAbsorption = finiteClamp(
        (constrained.aerosolAbsorption - envelope.absorption[0]) /
            absorptionSpan,
        [0, 1],
    );
    const boundaryStrength = finiteClamp(
        inversion * (0.34 + humidity * 0.56),
        [0, 0.9],
    );
    return {
        aerosolOpticalDepth550: troposphericAerosolOpticalDepth550(constrained),
        stratosphericAerosolOpticalDepth550:
            stratosphericAerosolOpticalDepth550(constrained),
        aerosolBoundaryLayerStrength: boundaryStrength,
        aerosolBoundaryLayerHeightKm: 2.35 - inversion * 1.78,
        aerosolBoundaryLayerTransitionKm: 0.16 + (1 - inversion) * 0.42,
        relativeHumidity: humidity,
        aerosolAngstromExponent: finiteClamp(
            envelope.angstromExponent * (1.18 - normalizedSize * 0.36),
            [0, 3],
        ),
        aerosolSingleScatteringAlbedo: prior.singleScatteringAlbedo.map(
            (channel) => finiteClamp(
                channel - (normalizedAbsorption - 0.5) * 0.10,
                [0.65, 0.9999],
            ),
        ) as unknown as GroundAlbedoRgb,
        aerosolAsymmetry: finiteClamp(
            prior.asymmetry + (normalizedSize - 0.5) * 0.08,
            [0.45, 0.92],
        ),
        ozoneColumnDobson: 300 * finiteClamp(
            constrained.ozone,
            [230 / 300, 430 / 300],
        ),
        observerAltitudeKm: observerAltitudeKm(constrained),
        groundAlbedo: resolveGroundAlbedoRgb(
            constrained.groundAlbedo,
            constrained.groundAlbedoRgb,
        ),
    };
};

export const atmosphereAerosolTypeForSky = (
    aerosolType: SkyAerosolType,
): AtmosphereAerosolType => aerosolType === "pollution" ? "urban" : aerosolType;

/**
 * Canonical physical-state constructor for every sky consumer. Celestial CPU
 * qualification and the renderer LUT graph must receive the same returned
 * object instead of independently rebuilding similar optical coefficients.
 */
export const createPhysicalAtmosphereStateFromComposition = (
    composition: PhysicalSkyComposition,
    aerosolType: SkyAerosolType = "clean",
    options: PhysicalAtmosphereStateFromCompositionOptions = {},
): PhysicalAtmosphereState => {
    const resolved = resolvePhysicalAtmosphereComposition(
        composition,
        aerosolType,
    );
    return createPhysicalAtmosphereState({
        bottomRadiusKm: options.bottomRadiusKm ?? 6371,
        atmosphereHeightKm: options.atmosphereHeightKm ?? 100,
        observerAltitudeKm: resolved.observerAltitudeKm,
        aerosolType: atmosphereAerosolTypeForSky(aerosolType),
        aerosolOpticalDepth550: resolved.aerosolOpticalDepth550,
        stratosphericAerosolOpticalDepth550:
            resolved.stratosphericAerosolOpticalDepth550,
        aerosolBoundaryLayerStrength:
            resolved.aerosolBoundaryLayerStrength,
        aerosolBoundaryLayerHeightKm:
            resolved.aerosolBoundaryLayerHeightKm,
        aerosolBoundaryLayerTransitionKm:
            resolved.aerosolBoundaryLayerTransitionKm,
        relativeHumidity: resolved.relativeHumidity,
        aerosolAngstromExponent: resolved.aerosolAngstromExponent,
        aerosolSingleScatteringAlbedo:
            resolved.aerosolSingleScatteringAlbedo,
        aerosolAsymmetry: resolved.aerosolAsymmetry,
        ozoneColumnDobson: resolved.ozoneColumnDobson,
        groundAlbedo: resolved.groundAlbedo,
        grade: options.grade,
    });
};

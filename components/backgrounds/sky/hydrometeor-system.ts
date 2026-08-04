import type {
    CloudPrecipitationKind,
    CloudSystemState,
    CompiledCloudSystem,
} from "./cloud-state-map";
import {
    DEEP_CONVECTION_ENVIRONMENTS,
    createDeepConvectionDescriptor,
    resolveDeepConvectionSourceContracts,
    resolveDeepConvectionTopology,
    sampleDeepConvectionMicrophysics,
    type DeepConvectionEnvironment,
    type DeepConvectionEnvironmentId,
    type DeepConvectionLifecycleStage,
    type DeepConvectionOrganization,
    type DeepConvectionTopologyRegionId,
} from "./deep-convection-physical-foundation";

/**
 * CPU-side contract for precipitation and surface hydrometeors.
 *
 * A field is always owned by a finite CloudSystem. The renderer must never
 * create rain from the global sky coverage value: the parent system supplies
 * the source altitude, footprint, phase, extraction rate, wind and lifecycle.
 */
export type HydrometeorKind =
    | "drizzle"
    | "stratiform-rain"
    | "convective-rain"
    | "snow-crystals"
    | "snow-flakes"
    | "hail"
    | "ice-pellets"
    | "snow-grains"
    | "snow-pellets"
    | "virga-liquid"
    | "virga-ice"
    | "fog"
    | "mist"
    | "ice-fog"
    | "diamond-dust";

export type HydrometeorPrecipitationKind = CloudPrecipitationKind
    | "ice-pellets"
    | "snow-grains"
    | "snow-pellets";

export type HydrometeorParticleHabit =
    | "drizzle-sphere"
    | "rain-drop"
    | "pristine-crystal"
    | "aggregate-flake"
    | "hailstone"
    | "ice-pellet"
    | "snow-grain"
    | "graupel"
    | "fog-droplet"
    | "ice-fog-crystal"
    | "diamond-plate";

export type HydrometeorRenderClass =
    | "shaft"
    | "curtain"
    | "shower"
    | "surface-bank";

export interface HydrometeorCloudSource {
    layerIndex: number;
    systemIndex: number;
    seeds: readonly [number, number, number, number];
    state: CloudSystemState;
    compiled: CompiledCloudSystem;
    /** Optional expanded WMO hydrometeor state not represented by CloudPrecipitationKind. */
    precipitationKindOverride?: HydrometeorPrecipitationKind;
    /** Optional exact storm organization/environment for Cb source resolution. */
    deepConvection?: {
        environment?: DeepConvectionEnvironmentId;
        organization?: DeepConvectionOrganization;
        intensity01?: number;
    };
}

export interface HydrometeorSurfaceRegion {
    id: string;
    centerEastKm: number;
    centerNorthKm: number;
    majorRadiusKm: number;
    minorRadiusKm: number;
    /** Cloud east-angle radians: zero +east, increasing toward +north. */
    orientation: number;
    topAltitudeKm: number;
    seed: number;
}

export type HydrometeorSurfacePhenomenon =
    | "auto"
    | "none"
    | "fog"
    | "mist"
    | "ice-fog"
    | "diamond-dust";

/** Minimal authoring payload that can travel from production/Sky Lab to runtime. */
export interface HydrometeorSceneOverrides {
    cloudPrecipitation?: readonly {
        layerIndex: number;
        kind: HydrometeorPrecipitationKind;
        /** Exact source rate when CloudScene's legacy scalar is constrained away. */
        rateMmHour?: number;
    }[];
    surface?: {
        phenomenon: Exclude<HydrometeorSurfacePhenomenon, "auto">;
        visibilityKm: number;
        region?: HydrometeorSurfaceRegion;
    };
    phaseProfile?: {
        warmLayerBottomKm: number;
        warmLayerTopKm: number;
        warmLayerTemperatureKelvin: number;
        surfaceColdLayerDepthKm: number;
    };
    /** Physical sub-cloud boundary state when authoring/review needs exact weather. */
    boundaryLayer?: {
        surfaceTemperatureKelvin?: number;
        surfaceRelativeHumidity?: number;
        surfacePressureHpa?: number;
        surfaceWindSpeed?: number;
        surfaceWindDirection?: number;
    };
}

export interface HydrometeorEnvironmentState {
    surfaceAltitudeKm: number;
    surfaceTemperatureKelvin: number;
    surfaceRelativeHumidity: number;
    surfacePressureHpa: number;
    surfaceWindSpeed: number;
    /** Cloud east-angle radians: zero +east, increasing toward +north. */
    surfaceWindDirection: number;
    /** Enables finite fog/mist banks below eligible low-cloud owners. */
    fogAmount: number;
    /** Meteorological optical range; fog is <1 km, mist and diamond dust >=1 km. */
    surfaceVisibilityKm: number;
    surfacePhenomenon: HydrometeorSurfacePhenomenon;
    surfaceRegion?: HydrometeorSurfaceRegion;
    /** Optional elevated melting layer for ice-pellet phase paths. */
    warmLayerBottomKm: number;
    warmLayerTopKm: number;
    warmLayerTemperatureKelvin: number;
    /** Depth of the sub-freezing layer beneath an elevated warm nose. */
    surfaceColdLayerDepthKm: number;
}

export const DEFAULT_HYDROMETEOR_ENVIRONMENT: HydrometeorEnvironmentState = {
    surfaceAltitudeKm: 0,
    surfaceTemperatureKelvin: 288.15,
    surfaceRelativeHumidity: 0.72,
    surfacePressureHpa: 1013.25,
    surfaceWindSpeed: 2.5,
    surfaceWindDirection: 0,
    fogAmount: 0,
    surfaceVisibilityKm: 80,
    surfacePhenomenon: "auto",
    warmLayerBottomKm: 0.8,
    warmLayerTopKm: 1.8,
    warmLayerTemperatureKelvin: 274.5,
    surfaceColdLayerDepthKm: 0.8,
};

export function applyHydrometeorSceneOverrides(
    sources: readonly HydrometeorCloudSource[],
    environment: HydrometeorEnvironmentState,
    overrides?: HydrometeorSceneOverrides,
) {
    if (!overrides) return { sources, environment };
    const precipitationByLayer = new Map(
        overrides.cloudPrecipitation?.map((entry) =>
            [Math.floor(entry.layerIndex), entry] as const) ?? [],
    );
    const overriddenSources = sources.map((source) => {
        const precipitation = precipitationByLayer.get(source.layerIndex);
        return precipitation === undefined ? source : {
            ...source,
            precipitationKindOverride: precipitation.kind,
            compiled: precipitation.rateMmHour === undefined ? source.compiled : {
                ...source.compiled,
                precipitation: {
                    ...source.compiled.precipitation,
                    rate: clamp(precipitation.rateMmHour, 0, 300),
                },
            },
        };
    });
    const overriddenEnvironment: HydrometeorEnvironmentState = {
        ...environment,
        ...(overrides.surface ? {
            surfacePhenomenon: overrides.surface.phenomenon,
            surfaceVisibilityKm: overrides.surface.visibilityKm,
            surfaceRegion: overrides.surface.region,
        } : {}),
        ...(overrides.phaseProfile ?? {}),
        ...(overrides.boundaryLayer ?? {}),
    };
    return { sources: overriddenSources, environment: overriddenEnvironment };
}

/** Canonical invalidation key; independent of object identity and field order. */
export function createHydrometeorSceneOverrideSignature(
    overrides?: HydrometeorSceneOverrides,
) {
    if (!overrides) return "daily";
    const scalar = (value: number | undefined) => value === undefined
        ? null : Math.round(value * 1_000_000) / 1_000_000;
    const region = overrides.surface?.region;
    return JSON.stringify({
        cloudPrecipitation: [...(overrides.cloudPrecipitation ?? [])]
            .sort((left, right) => left.layerIndex - right.layerIndex ||
                left.kind.localeCompare(right.kind))
            .map(({ layerIndex, kind, rateMmHour }) => [
                Math.floor(layerIndex),
                kind,
                scalar(rateMmHour),
            ]),
        surface: overrides.surface ? {
            phenomenon: overrides.surface.phenomenon,
            visibilityKm: scalar(overrides.surface.visibilityKm),
            region: region ? [
                region.id,
                scalar(region.centerEastKm),
                scalar(region.centerNorthKm),
                scalar(region.majorRadiusKm),
                scalar(region.minorRadiusKm),
                scalar(region.orientation),
                scalar(region.topAltitudeKm),
                scalar(region.seed),
            ] : null,
        } : null,
        phaseProfile: overrides.phaseProfile ? [
            scalar(overrides.phaseProfile.warmLayerBottomKm),
            scalar(overrides.phaseProfile.warmLayerTopKm),
            scalar(overrides.phaseProfile.warmLayerTemperatureKelvin),
            scalar(overrides.phaseProfile.surfaceColdLayerDepthKm),
        ] : null,
        boundaryLayer: overrides.boundaryLayer ? [
            scalar(overrides.boundaryLayer.surfaceTemperatureKelvin),
            scalar(overrides.boundaryLayer.surfaceRelativeHumidity),
            scalar(overrides.boundaryLayer.surfacePressureHpa),
            scalar(overrides.boundaryLayer.surfaceWindSpeed),
            scalar(overrides.boundaryLayer.surfaceWindDirection),
        ] : null,
    });
}

export interface GammaParticleDistribution {
    /** Diameter of the mass-spectrum peak for precipitation, in millimetres. */
    massMedianDiameterMm: number;
    shape: number;
    minimumDiameterMm: number;
    maximumDiameterMm: number;
    particleDensityKgM3: number;
    projectedAreaFactor: number;
    numberConcentrationM3: number;
    waterContentKgM3: number;
    massFluxKgM2S: number;
    meanTerminalVelocityMps: number;
    effectiveRadiusMicrons: number;
    extinctionKm: number;
}

export interface HydrometeorOptics {
    extinctionRgbKm: readonly [number, number, number];
    singleScatteringAlbedoRgb: readonly [number, number, number];
    asymmetryParameter: number;
}

/**
 * Species-level renderer qualification envelope. Diameter is equivalent-volume
 * diameter for liquid/dense ice and maximum dimension for snow/ice habits.
 * RGB lanes are 680/550/440 nm. The optical values are deliberately subtle:
 * visible geometric-optics extinction is almost neutral for precipitation,
 * while absorption and phase remain habit/size dependent.
 */
export interface HydrometeorSpeciesMicrophysicsProfile {
    diameterRangeMm: readonly [number, number];
    terminalVelocityRangeMps: readonly [number, number];
    extinctionRgbScaleAtSmallSize: HydrometeorRgb;
    singleScatteringAlbedoRgb: HydrometeorRgb;
    asymmetryRange: readonly [number, number];
    evidence: string;
}

export type HydrometeorRgb = readonly [number, number, number];

/**
 * Mutually exclusive outcomes for light crossing a parent cloud domain.
 * `transmittanceRgb + scatteredTowardReceiverRgb` is normalized to at most one
 * per channel; the unrepresented remainder is absorption or scattering toward
 * another angular domain.
 */
export interface HydrometeorPassiveRgbTransfer {
    transmittanceRgb: HydrometeorRgb;
    scatteredTowardReceiverRgb: HydrometeorRgb;
}

/**
 * Irradiance evaluated at the hydrometeor sample after atmospheric transport.
 * These are deliberately not top-of-atmosphere source values: applying the
 * atmosphere again in the hydrometeor pass would double Beer attenuation.
 */
export interface HydrometeorLocalIrradianceAtSample {
    atmosphereAttenuatedSunIrradianceRgb: HydrometeorRgb;
    atmosphereAttenuatedMoonIrradianceRgb: HydrometeorRgb;
    diffuseSkyHemisphereIrradianceRgb: HydrometeorRgb;
    groundHemisphereIrradianceRgb: HydrometeorRgb;
}

/** Exact owner join used before a field may inherit cloud-source visibility. */
export interface HydrometeorParentLightCoupling {
    parentSystemId: string;
    parentSystemIndex: number;
    parentLayerIndex: number;
    ownerKind: HydrometeorField["ownerKind"];
    sun: HydrometeorPassiveRgbTransfer;
    moon: HydrometeorPassiveRgbTransfer;
    diffuseSky: HydrometeorPassiveRgbTransfer;
    ground: HydrometeorPassiveRgbTransfer;
    /**
     * Exact parent light-volume radiance after convolution with this event's
     * phase. Keep Sun/Moon scattered-transfer lanes zero when this is supplied.
     */
    phaseConvolvedScatteringRadianceRgb: HydrometeorRgb;
}

export interface HydrometeorEventAngles {
    sunCosine: number;
    moonCosine: number;
    /** Concentration of the normalized spherical-Gaussian glint lobe. */
    glintConcentration: number;
    /** Integral of the normalized phase function over the upper hemisphere. */
    upperHemispherePhaseIntegral: number;
    /** Integral of the normalized phase function over the lower hemisphere. */
    lowerHemispherePhaseIntegral: number;
}

export interface HydrometeorPassiveFieldEvent {
    field: HydrometeorField;
    /** Density-resolved coefficient at the event, not the record maximum. */
    extinctionRgbKm: HydrometeorRgb;
    irradianceAtSample: HydrometeorLocalIrradianceAtSample;
    parentCoupling: HydrometeorParentLightCoupling;
    angles: HydrometeorEventAngles;
}

export interface HydrometeorPassiveSegmentReference {
    extinctionRgbKm: HydrometeorRgb;
    scatteringRgbKm: HydrometeorRgb;
    /** sigma_t * source-function radiance, accumulated before division. */
    sourceCoefficientRgbKm: HydrometeorRgb;
    sourceFunctionRadianceRgb: HydrometeorRgb;
    eventRadianceRgb: HydrometeorRgb;
    segmentTransmittanceRgb: HydrometeorRgb;
    cameraTransmittanceRgb: HydrometeorRgb;
}

export interface HydrometeorField {
    parentSystemId: string;
    parentSystemIndex: number;
    parentLayerIndex: number;
    sourceIndex: number;
    ownerKind: "cloud-system" | "boundary-layer-region";
    kind: HydrometeorKind;
    renderClass: HydrometeorRenderClass;
    source: {
        centerEastKm: number;
        centerNorthKm: number;
        majorRadiusKm: number;
        minorRadiusKm: number;
        /** Cloud east-angle radians: zero +east, increasing toward +north. */
        orientation: number;
        topAltitudeKm: number;
        bottomAltitudeKm: number;
        boundaryTransitionFraction: number;
        harmonicA: number;
        harmonicB: number;
    };
    distribution: GammaParticleDistribution;
    optics: HydrometeorOptics;
    phase: {
        liquidFractionAtSource: number;
        liquidFractionAtBottom: number;
        freezingAltitudeKm: number;
        meltingDepthKm: number;
        warmLayerBottomKm: number;
        warmLayerTopKm: number;
        refreezingDepthKm: number;
        phasePath: "liquid" | "ice" | "melting" | "melt-refreeze";
    };
    evaporation: {
        sourceRelativeHumidity: number;
        completeEvaporationDepthKm: number;
        profileExponent: number;
        surfaceReachFraction: number;
    };
    motion: {
        windEastMps: number;
        windNorthMps: number;
        terminalVelocityMps: number;
        turbulenceMps: number;
        flutterAmplitude: number;
    };
    rendering: {
        maximumResolvableDistanceKm: number;
        exposureTrackLengthM: number;
        volumetricEnergyFraction: number;
        sparseParticleEnergyFraction: number;
    };
    morphology: {
        radiusScaleAtBottom: number;
        verticalModulation: number;
        temporalIntermittency: number;
        clustering: number;
    };
    particle: {
        habit: HydrometeorParticleHabit;
        aspectRatio: number;
        orientationDispersion: number;
        surfaceRoughness: number;
    };
    lighting: {
        /** Bounded material response to collimated, locally attenuated sources. */
        directIrradianceWeight: number;
        /** Bounded response to atmosphere/ground hemispheric irradiance. */
        diffuseIrradianceWeight: number;
        /** Energy fraction moved from the base phase into a normalized glint. */
        sourceGlintStrength: number;
        /** ABI name retained: bounded fraction redistributed to broad orders. */
        multipleScatteringBoost: number;
    };
    /** CPU-side provenance; the existing 16-vec4 GPU ABI carries its result. */
    deepConvection?: {
        lifecycleStage: DeepConvectionLifecycleStage;
        organization: DeepConvectionOrganization;
        environment: DeepConvectionEnvironmentId;
        phenomenon: "rain" | "hail" | "graupel" | "snow" | "virga";
        sourceRegion: DeepConvectionTopologyRegionId;
        sourceAltitudeRangeKm: readonly [number, number];
        attachmentPath: string;
        downshearOffset01: number;
        coldPoolCoupling01: number;
        surfaceSurvivalFraction01: number;
    };
    concentrationScale: number;
    seed: number;
    importance: number;
}

export const HYDROMETEOR_MAX_FIELDS = 96;
export const HYDROMETEOR_VEC4_STRIDE = 16;
export const HYDROMETEOR_HEADER_VEC4S = 1;

export const HYDROMETEOR_VEC4_LAYOUT = {
    identity: 0,
    sourceCenterExtent: 1,
    sourceGeometry: 2,
    distribution: 3,
    kinematics: 4,
    extinction: 5,
    scattering: 6,
    phaseTransition: 7,
    evaporation: 8,
    particleRendering: 9,
    sourceBoundary: 10,
    energyAndImportance: 11,
    morphology: 12,
    particleShape: 13,
    lightingResponse: 14,
    phasePath: 15,
} as const;

export interface PackedHydrometeorFields {
    data: Float32Array;
    count: number;
    capacity: number;
    dropped: number;
}

export interface HydrometeorRuntime {
    fields: readonly HydrometeorField[];
    packed: PackedHydrometeorFields;
    diagnostics: readonly string[];
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const lerp = (low: number, high: number, amount: number) =>
    low + (high - low) * amount;

const rgbMap = (
    value: HydrometeorRgb,
    operation: (channel: number, index: number) => number,
): HydrometeorRgb => value.map(operation) as [number, number, number];

const rgbZip = (
    left: HydrometeorRgb,
    right: HydrometeorRgb,
    operation: (leftChannel: number, rightChannel: number, index: number) => number,
): HydrometeorRgb => left.map((channel, index) =>
    operation(channel, right[index], index)) as [number, number, number];

const rgbAdd = (left: HydrometeorRgb, right: HydrometeorRgb) =>
    rgbZip(left, right, (a, b) => a + b);
const rgbMultiply = (left: HydrometeorRgb, right: HydrometeorRgb) =>
    rgbZip(left, right, (a, b) => a * b);
const rgbScale = (value: HydrometeorRgb, scale: number) =>
    rgbMap(value, (channel) => channel * scale);
const rgbSafeDivide = (numerator: HydrometeorRgb, denominator: HydrometeorRgb) =>
    rgbZip(numerator, denominator, (value, divisor) =>
        divisor > 1e-12 ? value / divisor : 0);
const nonnegativeRgb = (value: HydrometeorRgb) =>
    rgbMap(value, (channel) => Math.max(0, Number.isFinite(channel) ? channel : 0));

export function createHydrometeorPassiveRgbTransfer(
    transmittanceRgb: HydrometeorRgb,
    scatteredTowardReceiverRgb: HydrometeorRgb = [0, 0, 0],
): HydrometeorPassiveRgbTransfer {
    const transmittance = nonnegativeRgb(transmittanceRgb);
    const scattered = nonnegativeRgb(scatteredTowardReceiverRgb);
    const normalization = rgbZip(transmittance, scattered, (direct, redirected) =>
        1 / Math.max(1, direct + redirected));
    return {
        transmittanceRgb: rgbMultiply(transmittance, normalization),
        scatteredTowardReceiverRgb: rgbMultiply(scattered, normalization),
    };
}

export function hydrometeorSpectralBeerTransmittance(
    extinctionRgbKm: HydrometeorRgb,
    distanceKm: number,
): HydrometeorRgb {
    const distance = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
    return rgbMap(nonnegativeRgb(extinctionRgbKm), (extinction) =>
        Math.exp(-extinction * distance));
}

export function hydrometeorHenyeyGreensteinPhase(
    cosine: number,
    asymmetry: number,
) {
    const boundedCosine = clamp(cosine, -1, 1);
    const g = clamp(asymmetry, -0.98, 0.98);
    const denominator = 4 * Math.PI *
        (1 + g * g - 2 * g * boundedCosine) ** 1.5;
    return (1 - g * g) / Math.max(1e-12, denominator);
}

export function hydrometeorSphericalGaussianPhase(
    cosine: number,
    concentration: number,
) {
    const kappa = clamp(concentration, 1e-4, 28_000);
    const normalization = kappa /
        (2 * Math.PI * Math.max(1e-12, 1 - Math.exp(-2 * kappa)));
    return normalization * Math.exp(kappa * (clamp(cosine, -1, 1) - 1));
}

/**
 * Convex mixture of three normalized phase functions. Glint and broad
 * higher-order response only redistribute the same scattering event energy.
 */
export function hydrometeorPassiveDirectionalPhase(
    cosine: number,
    asymmetry: number,
    glintEnergyFraction: number,
    glintConcentration: number,
    multipleScatteringFraction: number,
) {
    const base = hydrometeorHenyeyGreensteinPhase(cosine, asymmetry);
    const glint = hydrometeorSphericalGaussianPhase(cosine, glintConcentration);
    const firstOrder = lerp(base, glint, clamp(glintEnergyFraction));
    const broadOrder = hydrometeorHenyeyGreensteinPhase(
        cosine,
        Math.sign(asymmetry) * clamp(Math.abs(asymmetry)) ** 2,
    );
    return lerp(firstOrder, broadOrder, clamp(multipleScatteringFraction));
}

export function hydrometeorParentCouplingMatches(
    field: HydrometeorField,
    coupling: HydrometeorParentLightCoupling,
) {
    return field.parentSystemId === coupling.parentSystemId &&
        field.parentSystemIndex === coupling.parentSystemIndex &&
        field.parentLayerIndex === coupling.parentLayerIndex &&
        field.ownerKind === coupling.ownerKind;
}

const transferTotal = (transfer: HydrometeorPassiveRgbTransfer) => {
    const passive = createHydrometeorPassiveRgbTransfer(
        transfer.transmittanceRgb,
        transfer.scatteredTowardReceiverRgb,
    );
    return rgbAdd(passive.transmittanceRgb, passive.scatteredTowardReceiverRgb);
};

const sourceCoefficientForPassiveField = (
    event: HydrometeorPassiveFieldEvent,
) => {
    const { field, irradianceAtSample: incident, parentCoupling, angles } = event;
    if (!hydrometeorParentCouplingMatches(field, parentCoupling)) {
        throw new RangeError(
            `hydrometeor-parent-mismatch:${field.parentSystemId}:${field.sourceIndex}`,
        );
    }
    const sunTransfer = createHydrometeorPassiveRgbTransfer(
        parentCoupling.sun.transmittanceRgb,
        parentCoupling.sun.scatteredTowardReceiverRgb,
    );
    const moonTransfer = createHydrometeorPassiveRgbTransfer(
        parentCoupling.moon.transmittanceRgb,
        parentCoupling.moon.scatteredTowardReceiverRgb,
    );
    const requestedUpperIntegral = clamp(angles.upperHemispherePhaseIntegral);
    const requestedLowerIntegral = clamp(angles.lowerHemispherePhaseIntegral);
    const phaseIntegralNormalization = 1 / Math.max(1,
        requestedUpperIntegral + requestedLowerIntegral);
    const upperIntegral = requestedUpperIntegral * phaseIntegralNormalization;
    const lowerIntegral = requestedLowerIntegral * phaseIntegralNormalization;
    const directWeight = clamp(field.lighting.directIrradianceWeight);
    const diffuseWeight = clamp(field.lighting.diffuseIrradianceWeight);
    const phaseArguments = [
        field.optics.asymmetryParameter,
        field.lighting.sourceGlintStrength,
        angles.glintConcentration,
        field.lighting.multipleScatteringBoost,
    ] as const;
    const sunPhase = hydrometeorPassiveDirectionalPhase(
        angles.sunCosine, ...phaseArguments);
    const moonPhase = hydrometeorPassiveDirectionalPhase(
        angles.moonCosine, ...phaseArguments);
    const directSun = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.atmosphereAttenuatedSunIrradianceRgb),
        sunTransfer.transmittanceRgb,
    ), directWeight * sunPhase);
    const directMoon = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.atmosphereAttenuatedMoonIrradianceRgb),
        moonTransfer.transmittanceRgb,
    ), directWeight * moonPhase);

    // Parent-scattered source energy and the directional source transfer are
    // mutually exclusive. Treat the redirected share as upper-hemisphere
    // irradiance; it is never added on top of an unpartitioned direct beam.
    const redirectedSun = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.atmosphereAttenuatedSunIrradianceRgb),
        sunTransfer.scatteredTowardReceiverRgb,
    ), diffuseWeight * upperIntegral / Math.PI);
    const redirectedMoon = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.atmosphereAttenuatedMoonIrradianceRgb),
        moonTransfer.scatteredTowardReceiverRgb,
    ), diffuseWeight * upperIntegral / Math.PI);
    const diffuseSky = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.diffuseSkyHemisphereIrradianceRgb),
        transferTotal(parentCoupling.diffuseSky),
    ), diffuseWeight * upperIntegral / Math.PI);
    const ground = rgbScale(rgbMultiply(
        nonnegativeRgb(incident.groundHemisphereIrradianceRgb),
        transferTotal(parentCoupling.ground),
    ), diffuseWeight * lowerIntegral / Math.PI);
    const parentScattering = rgbScale(nonnegativeRgb(
        parentCoupling.phaseConvolvedScatteringRadianceRgb), diffuseWeight);
    const sourceRadiance = rgbAdd(rgbAdd(directSun, directMoon),
        rgbAdd(rgbAdd(redirectedSun, redirectedMoon),
            rgbAdd(parentScattering, rgbAdd(diffuseSky, ground))));
    const extinction = nonnegativeRgb(event.extinctionRgbKm);
    const albedo = rgbMap(field.optics.singleScatteringAlbedoRgb,
        (channel) => clamp(channel));
    const scattering = rgbMultiply(extinction, albedo);
    return {
        extinction,
        scattering,
        sourceCoefficient: rgbMultiply(scattering, sourceRadiance),
    };
};

/**
 * Analytic homogeneous-segment reference. Every overlapping field first
 * contributes sigma_s * incident-radiance using its own exact parent transfer;
 * the sum is divided by total sigma_t once and consumes one RGB Beer event.
 */
export function integrateHydrometeorPassiveSegmentReference(
    events: readonly HydrometeorPassiveFieldEvent[],
    distanceKm: number,
    cameraTransmittanceRgb: HydrometeorRgb = [1, 1, 1],
): HydrometeorPassiveSegmentReference {
    let extinction: HydrometeorRgb = [0, 0, 0];
    let scattering: HydrometeorRgb = [0, 0, 0];
    let sourceCoefficient: HydrometeorRgb = [0, 0, 0];
    for (const event of events) {
        const coefficients = sourceCoefficientForPassiveField(event);
        extinction = rgbAdd(extinction, coefficients.extinction);
        scattering = rgbAdd(scattering, coefficients.scattering);
        sourceCoefficient = rgbAdd(sourceCoefficient, coefficients.sourceCoefficient);
    }
    const segmentTransmittance = hydrometeorSpectralBeerTransmittance(
        extinction, distanceKm);
    const interaction = rgbMap(segmentTransmittance, (channel) => 1 - channel);
    const sourceFunction = rgbSafeDivide(sourceCoefficient, extinction);
    const boundedCameraTransmittance = rgbMap(cameraTransmittanceRgb,
        (channel) => clamp(channel));
    const eventRadiance = rgbMultiply(boundedCameraTransmittance,
        rgbMultiply(sourceFunction, interaction));
    return {
        extinctionRgbKm: extinction,
        scatteringRgbKm: scattering,
        sourceCoefficientRgbKm: sourceCoefficient,
        sourceFunctionRadianceRgb: sourceFunction,
        eventRadianceRgb: eventRadiance,
        segmentTransmittanceRgb: segmentTransmittance,
        cameraTransmittanceRgb: rgbMultiply(
            boundedCameraTransmittance, segmentTransmittance),
    };
}

const hashText = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

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

const airDensityFromEnvironment = (environment: HydrometeorEnvironmentState) => {
    const pressurePa = clamp(environment.surfacePressureHpa, 600, 1085) * 100;
    const temperature = clamp(environment.surfaceTemperatureKelvin, 220, 325);
    return pressurePa / (287.05 * temperature);
};

const interpolateTable = (
    value: number,
    samples: readonly (readonly [number, number])[],
) => {
    if (value <= samples[0][0]) return samples[0][1];
    for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const current = samples[index];
        if (value <= current[0]) {
            return lerp(previous[1], current[1],
                (value - previous[0]) / (current[0] - previous[0]));
        }
    }
    return samples.at(-1)![1];
};

const RAIN_TERMINAL_VELOCITY = [
    [0.04, 0.05], [0.1, 0.27], [0.2, 0.72], [0.3, 1.17],
    [0.5, 2.06], [0.7, 3.0], [1.0, 4.03], [1.5, 5.17],
    [2.0, 6.49], [3.0, 8.06], [4.0, 8.83], [5.0, 9.09],
    [6.0, 9.2],
] as const;

export function hydrometeorTerminalVelocity(
    kind: HydrometeorKind | "snow",
    diameterMm: number,
    airDensityKgM3 = 1.225,
) {
    const diameter = Math.max(0.001, diameterMm);
    const densityCorrection = (1.225 / clamp(airDensityKgM3, 0.55, 1.45)) ** 0.4;
    if (kind === "snow-crystals" || kind === "diamond-dust") {
        return clamp((0.055 + 0.34 * diameter ** 0.72) * densityCorrection,
            kind === "diamond-dust" ? 0.008 : 0.06,
            kind === "diamond-dust" ? 0.42 : 1.25);
    }
    if (kind === "snow" || kind === "snow-flakes" || kind === "virga-ice") {
        return clamp((0.38 + 0.42 * Math.sqrt(diameter)) * densityCorrection,
            0.25, 2.7);
    }
    if (kind === "snow-grains") {
        return clamp((0.22 + 0.78 * diameter ** 0.62) * densityCorrection, 0.2, 1.45);
    }
    if (kind === "snow-pellets") {
        return clamp((0.68 + 0.95 * diameter ** 0.74) * densityCorrection, 0.75, 4.6);
    }
    if (kind === "ice-pellets") {
        return clamp((1.35 + 1.85 * diameter ** 0.78) * densityCorrection, 1.8, 8.5);
    }
    if (kind === "hail") {
        const diameterM = diameter * 1e-3;
        const velocity = Math.sqrt(
            4 * 9.80665 * diameterM * 850 /
            (3 * 0.62 * clamp(airDensityKgM3, 0.55, 1.45)),
        );
        return clamp(velocity, 4, 42);
    }
    if (kind === "fog" || kind === "mist" || kind === "ice-fog") return 0;
    return interpolateTable(diameter, RAIN_TERMINAL_VELOCITY) * densityCorrection;
}

interface DistributionDefinition {
    diameterMm: number;
    shape: number;
    minimumMm: number;
    maximumMm: number;
    densityKgM3: number;
    areaFactor: number;
}

const distributionDefinition = (
    kind: HydrometeorKind | "snow",
    rateMmHour: number,
    intensity: number,
): DistributionDefinition => {
    const logRate = Math.log1p(Math.max(0, rateMmHour));
    switch (kind) {
        case "drizzle": return {
            diameterMm: clamp(0.12 + 0.055 * logRate, 0.1, 0.42),
            shape: 2.6,
            minimumMm: 0.035,
            maximumMm: 0.5,
            densityKgM3: 997,
            areaFactor: 1,
        };
        case "stratiform-rain": return {
            diameterMm: clamp(0.92 + 0.36 * logRate, 0.8, 2.35),
            shape: 0.2,
            minimumMm: 0.08,
            maximumMm: 5.4,
            densityKgM3: 997,
            areaFactor: 0.98,
        };
        case "convective-rain": return {
            diameterMm: clamp(1.28 + 0.47 * logRate, 1.1, 3.7),
            shape: clamp(1.2 + intensity * 1.8, 1, 3.4),
            minimumMm: 0.1,
            maximumMm: 6.2,
            densityKgM3: 997,
            areaFactor: 0.94,
        };
        case "hail": return {
            diameterMm: clamp(5.5 + 2.25 * logRate, 5, 24),
            shape: 2.1,
            minimumMm: 5,
            maximumMm: clamp(14 + 7 * logRate, 14, 50),
            densityKgM3: 850,
            areaFactor: 0.88,
        };
        case "snow-crystals": return {
            diameterMm: clamp(0.18 + 0.18 * logRate, 0.08, 1.8),
            shape: 2.4,
            minimumMm: 0.025,
            maximumMm: clamp(1.3 + 0.45 * logRate, 1.1, 3.2),
            densityKgM3: lerp(210, 430, intensity),
            areaFactor: lerp(0.34, 0.58, intensity),
        };
        case "snow":
        case "snow-flakes":
        case "virga-ice": return {
            diameterMm: clamp(0.85 + 0.62 * logRate, 0.6, 5.5),
            shape: 1.4,
            minimumMm: 0.15,
            maximumMm: clamp(3.5 + 1.45 * logRate, 3, 14),
            densityKgM3: lerp(130, 310, intensity),
            areaFactor: lerp(0.28, 0.5, intensity),
        };
        case "snow-grains": return {
            diameterMm: clamp(0.22 + 0.09 * logRate, 0.16, 0.72),
            shape: 3.4,
            minimumMm: 0.06,
            maximumMm: 0.98,
            densityKgM3: 520,
            areaFactor: 0.72,
        };
        case "snow-pellets": return {
            diameterMm: clamp(1.4 + 0.5 * logRate, 1.2, 4.2),
            shape: 2.5,
            minimumMm: 0.45,
            maximumMm: 5,
            densityKgM3: lerp(180, 480, intensity),
            areaFactor: 0.83,
        };
        case "ice-pellets": return {
            diameterMm: clamp(1.05 + 0.38 * logRate, 0.8, 3.7),
            shape: 3,
            minimumMm: 0.25,
            maximumMm: 4.95,
            densityKgM3: 910,
            areaFactor: 0.92,
        };
        case "virga-liquid": return {
            diameterMm: clamp(0.28 + 0.24 * logRate, 0.18, 1.45),
            shape: 1.2,
            minimumMm: 0.04,
            maximumMm: 3.2,
            densityKgM3: 997,
            areaFactor: 0.99,
        };
        case "fog": return {
            diameterMm: lerp(0.012, 0.022, intensity),
            shape: 5.2,
            minimumMm: 0.002,
            maximumMm: 0.065,
            densityKgM3: 997,
            areaFactor: 1,
        };
        case "mist": return {
            diameterMm: lerp(0.016, 0.03, intensity),
            shape: 4.2,
            minimumMm: 0.003,
            maximumMm: 0.08,
            densityKgM3: 997,
            areaFactor: 1,
        };
        case "ice-fog": return {
            diameterMm: lerp(0.004, 0.016, intensity),
            shape: 4.8,
            minimumMm: 0.002,
            maximumMm: 0.03,
            densityKgM3: 917,
            areaFactor: 0.72,
        };
        case "diamond-dust": return {
            diameterMm: lerp(0.045, 0.13, intensity),
            shape: 3.2,
            minimumMm: 0.03,
            maximumMm: 0.2,
            densityKgM3: 917,
            areaFactor: 0.48,
        };
    }
};

/**
 * Integrate a bounded gamma DSD. Precipitation distributions are normalized
 * to the source water flux; fog/mist distributions are normalized to LWC.
 */
export function createParticleDistribution(
    kind: HydrometeorKind | "snow",
    rateMmHour: number,
    intensity: number,
    airDensityKgM3 = 1.225,
): GammaParticleDistribution {
    const boundedRate = clamp(rateMmHour, 0, 300);
    const boundedIntensity = clamp(intensity);
    const definition = distributionDefinition(kind, boundedRate, boundedIntensity);
    const bins = 128;
    const step = (definition.maximumMm - definition.minimumMm) / bins;
    const lambda = (definition.shape + 4) / definition.diameterMm;
    let rawNumber = 0;
    let rawMass = 0;
    let rawFlux = 0;
    let rawArea = 0;
    let rawMoment2 = 0;
    let rawMoment3 = 0;
    let rawVelocityMass = 0;
    for (let index = 0; index < bins; index += 1) {
        const diameterMm = definition.minimumMm + (index + 0.5) * step;
        const weight = diameterMm ** definition.shape *
            Math.exp(-lambda * diameterMm) * step;
        const diameterM = diameterMm * 1e-3;
        const mass = Math.PI / 6 * diameterM ** 3 * definition.densityKgM3;
        const velocity = hydrometeorTerminalVelocity(kind, diameterMm, airDensityKgM3);
        const area = Math.PI * diameterM ** 2 * 0.25 * definition.areaFactor;
        rawNumber += weight;
        rawMass += weight * mass;
        rawFlux += weight * mass * Math.max(velocity, 0.001);
        rawArea += weight * area;
        rawMoment2 += weight * diameterMm ** 2;
        rawMoment3 += weight * diameterMm ** 3;
        rawVelocityMass += weight * mass * velocity;
    }
    const suspended = kind === "fog" || kind === "mist" || kind === "ice-fog" ||
        kind === "diamond-dust";
    const targetLwc = suspended
        ? kind === "fog"
            ? lerp(0.00008, 0.00062, boundedIntensity)
            : kind === "mist"
                ? lerp(0.000005, 0.000045, boundedIntensity)
                : kind === "ice-fog"
                    ? lerp(0.000015, 0.00022, boundedIntensity)
                    : lerp(2e-7, 8e-6, boundedIntensity)
        : 0;
    const targetFlux = boundedRate / 3600;
    const normalization = suspended
        ? targetLwc / Math.max(rawMass, Number.MIN_VALUE)
        : targetFlux / Math.max(rawFlux, Number.MIN_VALUE);
    const numberConcentration = rawNumber * normalization;
    const waterContent = rawMass * normalization;
    // Qext approaches two in the geometric-optics regime. Keeping the
    // integral physical also makes dense rain a participating medium instead
    // of an arbitrary gray overlay.
    const extinctionKm = 2 * rawArea * normalization * 1000;
    return {
        massMedianDiameterMm: definition.diameterMm,
        shape: definition.shape,
        minimumDiameterMm: definition.minimumMm,
        maximumDiameterMm: definition.maximumMm,
        particleDensityKgM3: definition.densityKgM3,
        projectedAreaFactor: definition.areaFactor,
        numberConcentrationM3: numberConcentration,
        waterContentKgM3: waterContent,
        massFluxKgM2S: rawFlux * normalization,
        meanTerminalVelocityMps: kind === "fog" || kind === "mist" || kind === "ice-fog" ? 0
            : rawVelocityMass / Math.max(rawMass, Number.MIN_VALUE),
        effectiveRadiusMicrons: rawMoment3 /
            Math.max(rawMoment2, Number.MIN_VALUE) * 500,
        extinctionKm,
    };
}

/** Complete-evaporation travel depth from a ventilated D-squared model. */
export function estimateEvaporationDepthKm(
    kind: HydrometeorKind | "snow",
    massMedianDiameterMm: number,
    relativeHumidity: number,
    terminalVelocityMps: number,
) {
    if (kind === "hail" || kind === "ice-pellets") return 100;
    if (kind === "fog" || kind === "mist" || kind === "ice-fog" ||
        kind === "diamond-dust") return 0;
    const diameterM = Math.max(0.02, massMedianDiameterMm) * 1e-3;
    const ice = kind === "snow" || kind === "snow-crystals" || kind === "snow-flakes" ||
        kind === "snow-grains" || kind === "snow-pellets" || kind === "virga-ice";
    const diffusionalCoefficient = ice ? 1.55e-10 : 6.0e-10;
    const undersaturation = Math.max(0.012, 1 - clamp(relativeHumidity, 0, 1));
    const ventilation = 1 + 0.32 * Math.sqrt(
        Math.max(0, terminalVelocityMps * diameterM / 1.5e-5),
    );
    const lifetimeSeconds = diameterM ** 2 /
        (diffusionalCoefficient * undersaturation * ventilation);
    return clamp(lifetimeSeconds * Math.max(terminalVelocityMps, 0.05) / 1000,
        0.005, 100);
}

/** WMO Cloud Atlas association table for falling hydrometeors. */
export const HYDROMETEOR_ALLOWED_GENERA = {
    drizzle: ["stratus"],
    rain: ["altostratus", "nimbostratus", "stratocumulus"],
    shower: ["cumulus", "cumulonimbus"],
    snow: ["altostratus", "nimbostratus", "stratocumulus", "stratus", "cumulus", "cumulonimbus"],
    hail: ["cumulonimbus"],
    "ice-pellets": ["altostratus", "nimbostratus"],
    "snow-grains": ["stratus"],
    "snow-pellets": ["stratocumulus", "cumulus", "cumulonimbus"],
    virga: ["cirrocumulus", "altocumulus", "altostratus", "nimbostratus", "stratocumulus", "cumulus", "cumulonimbus"],
} as const satisfies Record<Exclude<HydrometeorPrecipitationKind, "none">, readonly string[]>;

export function hydrometeorOwnerIsWmoValid(
    precipitation: HydrometeorPrecipitationKind,
    genus: string,
) {
    if (precipitation === "none") return true;
    return (HYDROMETEOR_ALLOWED_GENERA[precipitation] as readonly string[]).includes(genus);
}

export interface HydrometeorPhysicalValidity {
    valid: boolean;
    reasons: readonly string[];
}

/** Rejects phase/source combinations that the current model cannot realize. */
export function validateHydrometeorPhysicalCombination(
    precipitation: HydrometeorPrecipitationKind,
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
): HydrometeorPhysicalValidity {
    const reasons: string[] = [];
    if (precipitation === "drizzle" && source.compiled.precipitation.rate > 1.05) {
        reasons.push("drizzle-rate-exceeds-wmo-regime");
    }
    if (precipitation === "ice-pellets") {
        const warmDepth = environment.warmLayerTopKm - environment.warmLayerBottomKm;
        const sourceBottom = source.compiled.geometry.baseAltitudeKm;
        if (!(environment.warmLayerBottomKm > environment.surfaceAltitudeKm &&
            environment.warmLayerTopKm < sourceBottom + 0.2 && warmDepth >= 0.15 &&
            environment.warmLayerTemperatureKelvin > 273.15)) {
            reasons.push("ice-pellets-require-elevated-melting-layer");
        }
        if (!(environment.surfaceTemperatureKelvin < 273.15 &&
            environment.surfaceColdLayerDepthKm >= 0.15)) {
            reasons.push("ice-pellets-require-subfreezing-refreeze-layer");
        }
    }
    if (precipitation === "snow-grains" &&
        environment.surfaceTemperatureKelvin > 273.15) {
        reasons.push("snow-grains-surface-layer-is-above-freezing");
    }
    if (precipitation === "hail") {
        if (source.compiled.classification.genus !== "cumulonimbus" ||
            !["mature", "glaciating", "precipitating"].includes(
                source.compiled.lifecycle.stage)) {
            reasons.push("hail-requires-active-mature-cumulonimbus");
        }
        if (source.compiled.thermodynamics.verticalVelocity < 5 ||
            source.compiled.thermodynamics.topTemperatureKelvin >= 273.15) {
            reasons.push("hail-requires-cold-aloft-updraft-support");
        }
    }
    if (precipitation === "snow-pellets" &&
        source.compiled.classification.genus === "cumulonimbus" &&
        ["incipient", "growing", "decaying"].includes(source.compiled.lifecycle.stage)) {
        reasons.push("graupel-requires-active-mixed-phase-collision-zone");
    }
    return { valid: reasons.length === 0, reasons };
}

const kindFromPrecipitation = (
    precipitation: HydrometeorPrecipitationKind,
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
): HydrometeorKind | null => {
    switch (precipitation) {
        case "none": return null;
        case "drizzle": return "drizzle";
        case "rain": return source.compiled.classification.genus === "cumulonimbus" ||
            source.compiled.classification.genus === "cumulus"
            ? "convective-rain" : "stratiform-rain";
        case "shower": return "convective-rain";
        case "snow": {
            const cold = source.compiled.thermodynamics.baseTemperatureKelvin < 266.5 ||
                environment.surfaceTemperatureKelvin < 266;
            const lowRate = source.compiled.precipitation.rate < 2.2;
            return cold && lowRate ? "snow-crystals" : "snow-flakes";
        }
        case "hail": return "hail";
        case "ice-pellets": return "ice-pellets";
        case "snow-grains": return "snow-grains";
        case "snow-pellets": return "snow-pellets";
        case "virga": return source.compiled.material.liquidFraction01 < 0.42
            ? "virga-ice" : "virga-liquid";
    }
};

const renderClassFor = (kind: HydrometeorKind): HydrometeorRenderClass => {
    if (kind === "fog" || kind === "mist" || kind === "ice-fog" ||
        kind === "diamond-dust") return "surface-bank";
    if (kind === "convective-rain" || kind === "hail" || kind === "snow-pellets") {
        return "shower";
    }
    if (kind === "stratiform-rain" || kind === "snow-crystals" ||
        kind === "snow-flakes" || kind === "snow-grains" ||
        kind === "ice-pellets" || kind === "drizzle") {
        return "curtain";
    }
    return "shaft";
};

const isSurfaceMeteor = (kind: HydrometeorKind) =>
    kind === "fog" || kind === "mist" || kind === "ice-fog" ||
    kind === "diamond-dust";

const isIceMeteor = (kind: HydrometeorKind) =>
    kind === "snow-crystals" || kind === "snow-flakes" ||
    kind === "snow-grains" || kind === "snow-pellets" ||
    kind === "ice-pellets" || kind === "hail" || kind === "virga-ice" ||
    kind === "ice-fog" || kind === "diamond-dust";

export const HYDROMETEOR_SPECIES_MICROPHYSICS = Object.freeze({
    drizzle: {
        diameterRangeMm: [0.035, 0.5], terminalVelocityRangeMps: [0.04, 2.1],
        extinctionRgbScaleAtSmallSize: [0.997, 1, 1.004],
        singleScatteringAlbedoRgb: [0.99945, 0.99968, 0.99980],
        asymmetryRange: [0.81, 0.85],
        evidence: "WMO drizzle diameter; Gunn-Kinzer liquid-drop fall speeds",
    },
    "stratiform-rain": {
        diameterRangeMm: [0.08, 5.4], terminalVelocityRangeMps: [0.20, 9.2],
        extinctionRgbScaleAtSmallSize: [0.998, 1, 1.003],
        singleScatteringAlbedoRgb: [0.99920, 0.99955, 0.99972],
        asymmetryRange: [0.84, 0.88],
        evidence: "Gunn-Kinzer fall speeds; Beard-Chuang drop shapes",
    },
    "convective-rain": {
        diameterRangeMm: [0.1, 6.2], terminalVelocityRangeMps: [0.25, 9.3],
        extinctionRgbScaleAtSmallSize: [0.9985, 1, 1.002],
        singleScatteringAlbedoRgb: [0.99910, 0.99950, 0.99970],
        asymmetryRange: [0.85, 0.89],
        evidence: "WMO shower-size regime; Gunn-Kinzer/Beard-Chuang",
    },
    "snow-crystals": {
        diameterRangeMm: [0.025, 3.2], terminalVelocityRangeMps: [0.06, 1.25],
        extinctionRgbScaleAtSmallSize: [0.990, 1, 1.015],
        singleScatteringAlbedoRgb: [0.99870, 0.99935, 0.99968],
        asymmetryRange: [0.69, 0.78],
        evidence: "Mitchell-Heymsfield fall speeds; NASA ice habit optics",
    },
    "snow-flakes": {
        diameterRangeMm: [0.15, 14], terminalVelocityRangeMps: [0.25, 2.7],
        extinctionRgbScaleAtSmallSize: [0.994, 1, 1.009],
        singleScatteringAlbedoRgb: [0.99855, 0.99925, 0.99962],
        asymmetryRange: [0.75, 0.83],
        evidence: "Mitchell-Heymsfield aggregate dynamics; NASA ice optics",
    },
    hail: {
        diameterRangeMm: [5, 50], terminalVelocityRangeMps: [4, 42],
        extinctionRgbScaleAtSmallSize: [0.9995, 1, 1.0007],
        singleScatteringAlbedoRgb: [0.99780, 0.99890, 0.99945],
        asymmetryRange: [0.86, 0.91],
        evidence: "WMO hail size/density/form and thunderstorm provenance",
    },
    "ice-pellets": {
        diameterRangeMm: [0.25, 4.95], terminalVelocityRangeMps: [1.8, 8.5],
        extinctionRgbScaleAtSmallSize: [0.997, 1, 1.004],
        singleScatteringAlbedoRgb: [0.99820, 0.99905, 0.99952],
        asymmetryRange: [0.84, 0.90],
        evidence: "WMO dense ice-pellet size and melt-refreeze phase path",
    },
    "snow-grains": {
        diameterRangeMm: [0.06, 0.98], terminalVelocityRangeMps: [0.2, 1.45],
        extinctionRgbScaleAtSmallSize: [0.988, 1, 1.018],
        singleScatteringAlbedoRgb: [0.99855, 0.99925, 0.99962],
        asymmetryRange: [0.75, 0.82],
        evidence: "WMO sub-millimetre opaque snow grains from Stratus",
    },
    "snow-pellets": {
        diameterRangeMm: [0.45, 5], terminalVelocityRangeMps: [0.75, 4.6],
        extinctionRgbScaleAtSmallSize: [0.993, 1, 1.010],
        singleScatteringAlbedoRgb: [0.99820, 0.99900, 0.99948],
        asymmetryRange: [0.79, 0.86],
        evidence: "WMO graupel size/density/form; ice-habit optics",
    },
    "virga-liquid": {
        diameterRangeMm: [0.04, 3.2], terminalVelocityRangeMps: [0.04, 8.2],
        extinctionRgbScaleAtSmallSize: [0.992, 1, 1.012],
        singleScatteringAlbedoRgb: [0.99935, 0.99963, 0.99978],
        asymmetryRange: [0.81, 0.87],
        evidence: "WMO evaporating precipitation; ventilated D-squared loss",
    },
    "virga-ice": {
        diameterRangeMm: [0.15, 14], terminalVelocityRangeMps: [0.25, 2.7],
        extinctionRgbScaleAtSmallSize: [0.992, 1, 1.012],
        singleScatteringAlbedoRgb: [0.99855, 0.99925, 0.99962],
        asymmetryRange: [0.73, 0.82],
        evidence: "WMO sublimating precipitation; aggregate ice dynamics",
    },
    fog: {
        diameterRangeMm: [0.002, 0.065], terminalVelocityRangeMps: [0, 0],
        extinctionRgbScaleAtSmallSize: [0.978, 1, 1.034],
        singleScatteringAlbedoRgb: [0.99935, 0.99970, 0.99986],
        asymmetryRange: [0.81, 0.87],
        evidence: "WMO microscopic liquid suspension and MOR below 1 km",
    },
    mist: {
        diameterRangeMm: [0.003, 0.08], terminalVelocityRangeMps: [0, 0],
        extinctionRgbScaleAtSmallSize: [0.974, 1, 1.040],
        singleScatteringAlbedoRgb: [0.99935, 0.99970, 0.99986],
        asymmetryRange: [0.80, 0.86],
        evidence: "WMO liquid suspension and MOR at least 1 km",
    },
    "ice-fog": {
        diameterRangeMm: [0.002, 0.03], terminalVelocityRangeMps: [0, 0],
        extinctionRgbScaleAtSmallSize: [0.960, 1, 1.060],
        singleScatteringAlbedoRgb: [0.99880, 0.99942, 0.99974],
        asymmetryRange: [0.73, 0.82],
        evidence: "WMO 2-30 micrometre irregular ice-fog particles",
    },
    "diamond-dust": {
        diameterRangeMm: [0.03, 0.2], terminalVelocityRangeMps: [0.008, 0.42],
        extinctionRgbScaleAtSmallSize: [0.975, 1, 1.038],
        singleScatteringAlbedoRgb: [0.99865, 0.99932, 0.99968],
        asymmetryRange: [0.65, 0.77],
        evidence: "WMO 30-200 micrometre clear-air plates; NASA habit optics",
    },
} satisfies Record<HydrometeorKind, HydrometeorSpeciesMicrophysicsProfile>);

const isShowerMeteor = (kind: HydrometeorKind) =>
    kind === "convective-rain" || kind === "hail" || kind === "snow-pellets";

const fieldCountFor = (
    source: HydrometeorCloudSource,
    kind: HydrometeorKind,
    rate: number,
) => {
    const coverage = source.state.physical.coverageOktas / 8;
    if (isSurfaceMeteor(kind)) return 1 + Math.round(coverage * 2);
    if (kind === "hail") return 1 + Number(rate > 35) + Number(rate > 90);
    if (kind === "convective-rain") return 1 + Math.round(coverage * 2 + clamp(rate / 45) * 3);
    if (kind === "virga-liquid" || kind === "virga-ice") {
        return 1 + Math.round(coverage * 3);
    }
    return 2 + Math.round(coverage * 3 + clamp(rate / 35));
};

interface SourcePlacement {
    localAlong: number;
    localCross: number;
}

const sourcePlacements = (
    count: number,
    source: HydrometeorCloudSource,
    kind: HydrometeorKind,
    random: () => number,
): SourcePlacement[] => {
    const placements: SourcePlacement[] = [];
    const frontal = source.state.organization.kind === "frontal-shield";
    const convective = isShowerMeteor(kind);
    const virga = kind === "virga-liquid" || kind === "virga-ice";
    if (virga) {
        // Virga is extracted in irregular fallstreak groups beneath finite
        // generating cells. A farthest-point distribution produces the very
        // regular picket-fence/grid arrangement that real precipitation
        // shafts do not have, so first form a few parent-attached clusters and
        // then place neighboring source channels around those clusters.
        const clusterCount = count >= 6 ? 3 : count >= 3 ? 2 : 1;
        const clusters = Array.from({ length: clusterCount }, () => {
            const angle = random() * Math.PI * 2;
            const radius = Math.sqrt(random()) * 0.46;
            return {
                localAlong: Math.cos(angle) * radius,
                localCross: Math.sin(angle) * radius,
            };
        });
        for (let index = 0; index < count; index += 1) {
            const cluster = clusters[index % clusterCount];
            const angle = random() * Math.PI * 2;
            const radius = Math.sqrt(random()) * lerp(0.08, 0.22, random());
            placements.push({
                localAlong: clamp(
                    cluster.localAlong + Math.cos(angle) * radius,
                    -0.68,
                    0.68,
                ),
                localCross: clamp(
                    cluster.localCross + Math.sin(angle) * radius,
                    -0.62,
                    0.62,
                ),
            });
        }
        return placements;
    }
    const candidates = Array.from({ length: Math.max(48, count * 24) }, () => {
        if (frontal) {
            return {
                localAlong: lerp(-0.72, 0.72, random()),
                localCross: lerp(-0.28, 0.28, random()),
            };
        }
        if (convective) {
            // Extraction is biased into the downshear precipitation flank,
            // while still retaining a compact core under the updraft complex.
            return {
                localAlong: clamp((random() - 0.42) * 1.15, -0.62, 0.72),
                localCross: clamp((random() - 0.5) * 0.94, -0.55, 0.55),
            };
        }
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * 0.66;
        return {
            localAlong: Math.cos(angle) * radius,
            localCross: Math.sin(angle) * radius,
        };
    });
    placements.push(candidates[0]);
    while (placements.length < count) {
        let best = candidates[placements.length % candidates.length];
        let bestDistance = -1;
        for (const candidate of candidates) {
            const nearest = Math.min(...placements.map((placement) =>
                Math.hypot(candidate.localAlong - placement.localAlong,
                    candidate.localCross - placement.localCross)));
            if (nearest > bestDistance) {
                bestDistance = nearest;
                best = candidate;
            }
        }
        placements.push(best);
    }
    return placements;
};

const fieldRadii = (
    source: HydrometeorCloudSource,
    kind: HydrometeorKind,
    count: number,
    random: () => number,
) => {
    const { majorRadiusKm, minorRadiusKm } = source.state.extent;
    if (isSurfaceMeteor(kind)) return {
        major: majorRadiusKm * lerp(0.42, 0.68, random()),
        minor: minorRadiusKm * lerp(0.32, 0.58, random()),
    };
    if (kind === "virga-liquid" || kind === "virga-ice") return {
        // This is the finite generating-cell footprint, not the full cloud
        // system footprint. Several curved sub-channels are reconstructed
        // inside it by the field evaluator. Keep this ahead of organization
        // branches: virga beneath a frontal shield is still locally cellular.
        major: majorRadiusKm * lerp(0.05, 0.13, random()),
        minor: minorRadiusKm * lerp(0.045, 0.115, random()),
    };
    if (source.state.organization.kind === "frontal-shield") return {
        major: majorRadiusKm * clamp(0.62 / Math.sqrt(count), 0.22, 0.56),
        minor: minorRadiusKm * lerp(0.34, 0.58, random()),
    };
    if (isShowerMeteor(kind)) return {
        major: majorRadiusKm * lerp(0.11, 0.24, random()),
        minor: minorRadiusKm * lerp(0.12, 0.27, random()),
    };
    return {
        major: majorRadiusKm * clamp(0.68 / Math.sqrt(count), 0.2, 0.46),
        minor: minorRadiusKm * clamp(0.62 / Math.sqrt(count), 0.18, 0.44),
    };
};

export const createHydrometeorOptics = (
    kind: HydrometeorKind,
    distribution: GammaParticleDistribution,
    greenExtinctionKm = distribution.extinctionKm,
): HydrometeorOptics => {
    const profile = HYDROMETEOR_SPECIES_MICROPHYSICS[kind];
    const representativeDiameterMm = Math.max(1e-6,
        distribution.effectiveRadiusMicrons * 0.002);
    const logMinimum = Math.log(Math.max(1e-6, profile.diameterRangeMm[0]));
    const logMaximum = Math.log(Math.max(
        profile.diameterRangeMm[0] * 1.001,
        profile.diameterRangeMm[1],
    ));
    const normalizedSize = clamp(
        (Math.log(representativeDiameterMm) - logMinimum) /
            Math.max(1e-6, logMaximum - logMinimum),
    );
    // Qext tends toward two without visible spectral structure as the size
    // parameter grows. Preserve measured/modelled small-particle separation,
    // then continuously neutralize it in the geometric-optics regime.
    const neutralization = clamp(normalizedSize * 0.78);
    const extinctionScale = profile.extinctionRgbScaleAtSmallSize.map((value) =>
        lerp(value, 1, neutralization)) as [number, number, number];
    const extinction = clamp(greenExtinctionKm, 0, 140);
    const asymmetry = lerp(
        profile.asymmetryRange[0],
        profile.asymmetryRange[1],
        Math.sqrt(normalizedSize),
    );
    return {
        extinctionRgbKm: [
            extinction * extinctionScale[0],
            extinction,
            extinction * extinctionScale[2],
        ],
        singleScatteringAlbedoRgb: profile.singleScatteringAlbedoRgb,
        asymmetryParameter: asymmetry,
    };
};

/**
 * Cloud horizontal-angle ABI: zero points along +east and positive angles
 * turn toward +north. Keep wind vectors in that same Earth-local basis so a
 * packed cloud wind direction and a hydrometeor wind direction are identical:
 * `[east, north] = speed * [cos(theta), sin(theta)]`.
 */
const windVector = (speed: number, direction: number) => ({
    east: Math.cos(direction) * speed,
    north: Math.sin(direction) * speed,
});

/**
 * Major/cross axes for the cloud east-angle ABI. The cross axis is the
 * right-handed perpendicular `[-sin(theta), cos(theta)]`, matching cloud
 * runtime and shader ellipse reconstruction.
 */
const cloudEastAngleBasis = (angle: number) => ({
    alongEast: Math.cos(angle),
    alongNorth: Math.sin(angle),
    crossEast: -Math.sin(angle),
    crossNorth: Math.cos(angle),
});

const phaseState = (
    kind: HydrometeorKind,
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
    bottomAltitudeKm: number,
) => {
    const freezingAltitude = source.compiled.formation.freezingLevelKm;
    const sourceLiquid = isIceMeteor(kind) ? (kind === "hail" ? 0.08 : 0) : 1;
    const warmDepth = Math.max(0, freezingAltitude - bottomAltitudeKm);
    const meltingDepthKm = kind === "hail"
        ? clamp(0.9 + source.compiled.precipitation.rate * 0.012, 0.8, 3.5)
        : clamp(0.22 + source.compiled.precipitation.rate * 0.018, 0.2, 0.85);
    let bottomLiquid = sourceLiquid;
    let phasePath: HydrometeorField["phase"]["phasePath"] = sourceLiquid >= 0.99
        ? "liquid" : "ice";
    let refreezingDepthKm = 0;
    if (kind === "ice-pellets") {
        const warmLayerDepth = Math.max(0,
            environment.warmLayerTopKm - environment.warmLayerBottomKm);
        const melts = environment.warmLayerTemperatureKelvin > 273.15 &&
            warmLayerDepth > 0.15;
        refreezingDepthKm = environment.surfaceTemperatureKelvin < 273.15
            ? Math.min(environment.surfaceColdLayerDepthKm,
                Math.max(0, environment.warmLayerBottomKm - bottomAltitudeKm)) : 0;
        bottomLiquid = melts ? clamp(1 - refreezingDepthKm / 0.45, 0.01, 0.35) : 0;
        phasePath = "melt-refreeze";
    } else if (sourceLiquid < 1 && environment.surfaceTemperatureKelvin > 273.15) {
        bottomLiquid = clamp(warmDepth / meltingDepthKm);
        phasePath = "melting";
    }
    return {
        liquidFractionAtSource: sourceLiquid,
        liquidFractionAtBottom: bottomLiquid,
        freezingAltitudeKm: freezingAltitude,
        meltingDepthKm,
        warmLayerBottomKm: environment.warmLayerBottomKm,
        warmLayerTopKm: environment.warmLayerTopKm,
        refreezingDepthKm,
        phasePath,
    };
};

const renderingContract = (
    kind: HydrometeorKind,
    distribution: GammaParticleDistribution,
) => {
    if (isSurfaceMeteor(kind)) return {
        maximumResolvableDistanceKm: 0,
        exposureTrackLengthM: 0,
        volumetricEnergyFraction: 1,
        sparseParticleEnergyFraction: 0,
    };
    const snow = kind === "snow-crystals" || kind === "snow-flakes" ||
        kind === "snow-grains" || kind === "snow-pellets" || kind === "virga-ice";
    const hail = kind === "hail";
    const shutterSeconds = snow ? 1 / 90 : 1 / 120;
    const exposureTrackLengthM = Math.max(
        distribution.maximumDiameterMm * 1e-3,
        distribution.meanTerminalVelocityMps * shutterSeconds,
    );
    const maximumResolvableDistanceKm = clamp(
        exposureTrackLengthM / 0.0012 / 1000,
        snow ? 0.006 : 0.012,
        hail ? 0.24 : snow ? 0.075 : 0.11,
    );
    const sparse = hail ? 0.34 : snow ? 0.24 : 0.18;
    return {
        maximumResolvableDistanceKm,
        exposureTrackLengthM,
        volumetricEnergyFraction: 1 - sparse,
        sparseParticleEnergyFraction: sparse,
    };
};

export const createHydrometeorParticleContract = (
    kind: HydrometeorKind,
    distribution: GammaParticleDistribution,
): HydrometeorField["particle"] => {
    const diameterMm = distribution.massMedianDiameterMm;
    // Pruppacher-Beard's wind-tunnel relation is spherical below 0.5 mm and
    // b/a = 1.03 - 0.062 D above it. The packed aspect is an oblate proxy; the
    // sparse appearance path may add the Beard-Chuang flattened lower pole.
    const liquidDropAspect = diameterMm <= 0.5
        ? 1 : clamp(1.03 - 0.062 * diameterMm, 0.62, 1);
    switch (kind) {
        case "drizzle": return { habit: "drizzle-sphere", aspectRatio: 1, orientationDispersion: 1, surfaceRoughness: 0.02 };
        case "stratiform-rain":
        case "convective-rain":
        case "virga-liquid": return { habit: "rain-drop", aspectRatio: liquidDropAspect, orientationDispersion: 0.16, surfaceRoughness: 0.06 };
        case "snow-crystals":
        case "virga-ice": return { habit: "pristine-crystal", aspectRatio: 0.12, orientationDispersion: 0.42, surfaceRoughness: 0.16 };
        case "snow-flakes": return { habit: "aggregate-flake", aspectRatio: 0.22, orientationDispersion: 0.72, surfaceRoughness: 0.58 };
        case "hail": return { habit: "hailstone", aspectRatio: 0.93, orientationDispersion: 0.38, surfaceRoughness: 0.48 };
        case "ice-pellets": return { habit: "ice-pellet", aspectRatio: 0.9, orientationDispersion: 0.62, surfaceRoughness: 0.2 };
        case "snow-grains": return { habit: "snow-grain", aspectRatio: 0.48, orientationDispersion: 0.7, surfaceRoughness: 0.74 };
        case "snow-pellets": return { habit: "graupel", aspectRatio: 0.82, orientationDispersion: 0.78, surfaceRoughness: 0.88 };
        case "fog":
        case "mist": return { habit: "fog-droplet", aspectRatio: 1, orientationDispersion: 1, surfaceRoughness: 0.01 };
        case "ice-fog": return { habit: "ice-fog-crystal", aspectRatio: 0.36, orientationDispersion: 0.58, surfaceRoughness: 0.12 };
        case "diamond-dust": return { habit: "diamond-plate", aspectRatio: 0.07, orientationDispersion: 0.24, surfaceRoughness: 0.04 };
    }
};

const morphologyFor = (
    kind: HydrometeorKind,
    source: HydrometeorCloudSource,
    random: () => number,
): HydrometeorField["morphology"] => {
    const virga = kind === "virga-liquid" || kind === "virga-ice";
    if (kind === "drizzle") return {
        radiusScaleAtBottom: lerp(0.9, 1.08, random()),
        verticalModulation: lerp(0.08, 0.18, random()),
        temporalIntermittency: lerp(0.03, 0.1, random()),
        clustering: lerp(0.72, 0.9, random()),
    };
    if (kind === "stratiform-rain" || kind === "ice-pellets") return {
        radiusScaleAtBottom: lerp(0.94, 1.2, random()),
        verticalModulation: lerp(0.12, 0.28, random()),
        temporalIntermittency: lerp(0.08, 0.2, random()),
        clustering: lerp(0.58, 0.78, random()),
    };
    if (kind === "snow-crystals" || kind === "snow-grains") return {
        radiusScaleAtBottom: lerp(1.02, 1.34, random()),
        verticalModulation: lerp(0.22, 0.42, random()),
        temporalIntermittency: lerp(0.12, 0.3, random()),
        clustering: lerp(0.42, 0.66, random()),
    };
    if (kind === "snow-flakes") return {
        radiusScaleAtBottom: lerp(1.12, 1.48, random()),
        verticalModulation: lerp(0.3, 0.55, random()),
        temporalIntermittency: lerp(0.2, 0.42, random()),
        clustering: lerp(0.48, 0.72, random()),
    };
    if (kind === "convective-rain" || kind === "hail" || kind === "snow-pellets") {
        return {
            radiusScaleAtBottom: kind === "hail"
                ? lerp(0.9, 1.18, random()) : lerp(1.08, 1.52, random()),
            verticalModulation: kind === "hail"
                ? lerp(0.38, 0.62, random()) : lerp(0.28, 0.52, random()),
            temporalIntermittency: clamp(
                0.48 + source.compiled.thermodynamics.verticalVelocity / 90,
                0.48,
                0.86,
            ),
            clustering: kind === "hail"
                ? lerp(0.72, 0.94, random()) : lerp(0.62, 0.86, random()),
        };
    }
    return {
        radiusScaleAtBottom: isSurfaceMeteor(kind) ? lerp(0.92, 1.16, random())
            : isShowerMeteor(kind) ? lerp(1.08, 1.52, random())
                : virga ? lerp(0.54, 0.88, random())
                    : lerp(0.84, 1.18, random()),
        verticalModulation: isSurfaceMeteor(kind) ? lerp(0.06, 0.18, random())
            : isShowerMeteor(kind) ? lerp(0.22, 0.48, random())
                : virga ? lerp(0.18, 0.34, random())
                    : lerp(0.08, 0.24, random()),
        temporalIntermittency: isShowerMeteor(kind)
            ? clamp(0.38 + source.compiled.thermodynamics.verticalVelocity / 80, 0.38, 0.78)
            : virga ? lerp(0.035, 0.1, random())
                : kind === "diamond-dust" ? 0.24 : 0.06,
        // Shaft evaluation uses this as the number/spread of independently
        // curved fallstreak channels rather than a screen-space noise amount.
        clustering: virga ? lerp(0.62, 0.92, random())
            : kind === "diamond-dust" ? 0.32 : 0.16,
    };
};

const lightingFor = (kind: HydrometeorKind): HydrometeorField["lighting"] => ({
    // All four lanes are energy-domain fractions. Values above one formerly
    // acted as exposure controls and made the same extinction event luminous
    // more than once. Species character now comes from normalized phase and
    // parent visibility, not an emissive gain.
    directIrradianceWeight: kind === "fog" || kind === "ice-fog" ? 0.52
        : kind === "diamond-dust" ? 0.9
            : kind === "snow-crystals" || kind === "snow-flakes" ||
                kind === "snow-pellets" ? 0.76 : 0.82,
    diffuseIrradianceWeight: isSurfaceMeteor(kind) ? 0.96 : 0.94,
    sourceGlintStrength: kind === "diamond-dust" ? 1
        : kind === "ice-pellets" ? 0.34
            : kind === "hail" ? 0.18
                : kind === "snow-crystals" ? 0.26 : 0.02,
    multipleScatteringBoost: kind === "fog" || kind === "ice-fog" ? 0.62
        : kind === "snow-flakes" || kind === "snow-pellets" ? 0.42
            : kind === "diamond-dust" ? 0.18 : 0.28,
});

const fogKindFor = (
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
): "fog" | "mist" | null => {
    if (environment.fogAmount <= 0.015) return null;
    const base = source.compiled.geometry.baseAltitudeKm;
    const lowCloud = source.compiled.classification.genus === "stratus" ||
        source.compiled.classification.genus === "stratocumulus";
    if (!lowCloud || base > 1.2 || environment.surfaceRelativeHumidity < 0.78) {
        return null;
    }
    // WMO distinguishes fog from mist by surface MOR, not authored density.
    return environment.surfaceVisibilityKm < 1 ? "fog" : "mist";
};

const deepConvectionLifecycleFor = (
    source: HydrometeorCloudSource,
): DeepConvectionLifecycleStage => {
    switch (source.compiled.lifecycle.stage) {
        case "incipient":
        case "growing": return "developing";
        case "mature": return "mature";
        case "glaciating":
        case "precipitating": return "precipitating";
        case "decaying": return "decaying";
    }
};

const deepConvectionOrganizationFor = (
    source: HydrometeorCloudSource,
): DeepConvectionOrganization => {
    if (source.deepConvection?.organization) return source.deepConvection.organization;
    const organization = source.state.organization;
    if (organization.kind === "banded" ||
        source.state.extent.majorRadiusKm /
            Math.max(0.1, source.state.extent.minorRadiusKm) > 2.8) {
        return "squall-line";
    }
    if (organization.kind === "point-process" &&
        organization.distribution === "clustered") return "multicell-cluster";
    if (organization.kind === "storm-complex") {
        const depth = source.compiled.geometry.geometricDepthKm;
        const deepLayerShear = source.compiled.kinematics.verticalShear *
            Math.min(6, depth);
        const rotatingFeatures = source.compiled.features.supplementary.some((feature) =>
            feature === "murus" || feature === "cauda" || feature === "tuba");
        if (rotatingFeatures || deepLayerShear >= 27) return "supercell";
        if (organization.outflowRadiusKm > organization.updraftRadiusKm * 4.5) {
            return "multicell-cluster";
        }
    }
    return "pulse-cell";
};

const deepConvectionEnvironmentFor = (
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
    organization: DeepConvectionOrganization,
): DeepConvectionEnvironment => {
    const requested = source.deepConvection?.environment;
    const environmentId: DeepConvectionEnvironmentId = requested ?? (
        organization === "supercell" ? "continental-sheared-supercell"
            : organization === "squall-line" ? "cool-season-squall-line"
                : organization === "multicell-cluster" ? "maritime-multicell"
                    : source.compiled.geometry.baseAltitudeKm > 2.25 ||
                        environment.surfaceRelativeHumidity < 0.52
                        ? "dry-high-base-convection"
                        : "tropical-humid-pulse"
    );
    const preset = DEEP_CONVECTION_ENVIRONMENTS[environmentId];
    const base = source.compiled.geometry.baseAltitudeKm;
    const cloudTop = base + source.compiled.geometry.geometricDepthKm;
    const equilibriumLevel = source.compiled.formation.equilibriumLevelKm ??
        Math.max(base + 1.2, cloudTop - 0.35);
    const deepLayerShear = clamp(
        source.compiled.kinematics.verticalShear *
            Math.min(6, source.compiled.geometry.geometricDepthKm),
        0,
        45,
    );
    const updraft = Math.max(0, source.compiled.thermodynamics.verticalVelocity);
    const diagnosedCape = clamp(updraft * updraft * 2.15, 250, 5200);
    return {
        ...preset,
        surfaceTemperatureKelvin: environment.surfaceTemperatureKelvin,
        environmentalLapseRateKelvinPerKm: clamp(
            source.compiled.thermodynamics.environmentalLapseRate,
            4.5,
            9.5,
        ),
        cloudBaseKm: base,
        freezingLevelKm: clamp(
            source.compiled.formation.freezingLevelKm,
            Math.min(base, 0.1),
            Math.max(base + 0.2, cloudTop - 0.25),
        ),
        equilibriumLevelKm: Math.max(base + 1.2, equilibriumLevel),
        tropopauseKm: Math.max(
            equilibriumLevel + 0.35,
            cloudTop + 0.2,
        ),
        capeJoulesPerKilogram: lerp(preset.capeJoulesPerKilogram, diagnosedCape, 0.62),
        deepLayerShearMetresPerSecond: deepLayerShear,
        stormRelativeInflowMetresPerSecond: clamp(
            source.compiled.kinematics.windSpeed * 0.72 + updraft * 0.22,
            4,
            38,
        ),
        lowLevelWindDirectionDegrees: source.compiled.kinematics.windDirection *
            180 / Math.PI,
        anvilLevelWindDirectionDegrees: (
            source.compiled.kinematics.windDirection +
            Math.sign(source.compiled.kinematics.verticalShear || 1) *
                lerp(0.12, 0.72, deepLayerShear / 45)
        ) * 180 / Math.PI,
        anvilLevelWindMetresPerSecond: clamp(
            source.compiled.kinematics.windSpeed + deepLayerShear * 0.64,
            5,
            55,
        ),
        subcloudRelativeHumidity01: clamp(environment.surfaceRelativeHumidity),
        midlevelRelativeHumidity01: clamp(
            source.compiled.thermodynamics.relativeHumidity * 0.94,
        ),
        upperRelativeHumidity01: clamp(
            source.compiled.thermodynamics.relativeHumidity * 0.82,
        ),
        precipitationEfficiency01: clamp(
            source.compiled.lifecycle.precipitationEfficiency,
        ),
        lowLevelRotation01: organization === "supercell"
            ? clamp(0.42 + deepLayerShear / 75, 0.42, 0.96)
            : organization === "squall-line" ? 0.26 : 0.14,
    };
};

interface DeepConvectionHydrometeorPlan {
    kind: HydrometeorKind;
    phenomenon: NonNullable<HydrometeorField["deepConvection"]>["phenomenon"];
    sourceRegion: DeepConvectionTopologyRegionId;
    sourceAltitudeRangeKm: readonly [number, number];
    attachmentPath: string;
    relativeMass: number;
    fieldCount: number;
    intensity01: number;
    surfaceSurvivalFraction01: number;
}

interface DeepConvectionHydrometeorContext {
    lifecycleStage: DeepConvectionLifecycleStage;
    organization: DeepConvectionOrganization;
    environment: DeepConvectionEnvironment;
    descriptor: ReturnType<typeof createDeepConvectionDescriptor>;
    topology: ReturnType<typeof resolveDeepConvectionTopology>;
    plans: readonly DeepConvectionHydrometeorPlan[];
}

/**
 * Resolves legal storm-owned particle populations before any GPU packing.
 * The result intentionally contains no lightning opacity; electrical charge
 * reservoirs belong to the separate source contract.
 */
export function resolveCumulonimbusHydrometeorContext(
    source: HydrometeorCloudSource,
    environment: HydrometeorEnvironmentState,
): DeepConvectionHydrometeorContext | null {
    if (source.compiled.classification.genus !== "cumulonimbus") return null;
    const lifecycleStage = deepConvectionLifecycleFor(source);
    const organization = deepConvectionOrganizationFor(source);
    const resolvedEnvironment = deepConvectionEnvironmentFor(
        source,
        environment,
        organization,
    );
    const descriptor = createDeepConvectionDescriptor({
        environment: resolvedEnvironment,
        lifecycleStage,
        stageProgress01: source.compiled.lifecycle.stageProgress,
        species: source.compiled.classification.species === "calvus"
            ? "calvus" : "capillatus",
        organization,
        intensity01: source.deepConvection?.intensity01 ?? clamp(
            0.38 + source.compiled.thermodynamics.verticalVelocity / 72 +
                source.compiled.precipitation.rate / 420,
            0.28,
            1,
        ),
        seed: hashText(source.state.id),
    });
    const topology = resolveDeepConvectionTopology(descriptor);
    const contracts = resolveDeepConvectionSourceContracts(descriptor);
    const mixed = sampleDeepConvectionMicrophysics(descriptor, {
        altitudeKm: lerp(
            descriptor.mixedPhaseBottomKm,
            descriptor.mixedPhaseTopKm,
            0.52,
        ),
        normalizedRadialDistance01: 0.2,
        normalizedDownwindDistance01: 0.18,
    });
    const precipitation = source.precipitationKindOverride ??
        source.compiled.precipitation.kind;
    if (precipitation === "none" || source.compiled.precipitation.rate <= 0) {
        return { lifecycleStage, organization, environment: resolvedEnvironment,
            descriptor, topology, plans: [] };
    }

    const explicit = source.precipitationKindOverride !== undefined ||
        precipitation === "hail" || precipitation === "virga";
    const candidates: Omit<DeepConvectionHydrometeorPlan, "fieldCount">[] = [];
    const add = (
        plan: Omit<DeepConvectionHydrometeorPlan, "fieldCount">,
        active = true,
    ) => {
        if (active && plan.relativeMass > 1e-4) candidates.push(plan);
    };
    const snowKind: HydrometeorKind = source.compiled.precipitation.rate < 2.2 ||
        source.compiled.thermodynamics.topTemperatureKelvin < 250
        ? "snow-crystals" : "snow-flakes";
    const primaryKind = kindFromPrecipitation(precipitation, source, environment);

    if (primaryKind === "virga-liquid" || primaryKind === "virga-ice") {
        add({
            kind: primaryKind, phenomenon: "virga", sourceRegion: "precipitation-core",
            sourceAltitudeRangeKm: contracts.virga.sourceAltitudeRangeKm,
            attachmentPath: "mixed-phase-core->precipitation-core->subcloud-evaporation",
            relativeMass: 1, intensity01: Math.max(0.16, contracts.virga.intensity01),
            surfaceSurvivalFraction01: 0,
        });
    } else if (primaryKind === "hail") {
        add({
            kind: "hail", phenomenon: "hail", sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: contracts.hail.sourceAltitudeRangeKm,
            attachmentPath: "mixed-phase-updraft-cycle->precipitation-core",
            relativeMass: 1, intensity01: Math.max(0.18, contracts.hail.intensity01),
            surfaceSurvivalFraction01: contracts.hail.reachesGroundFraction01,
        }, lifecycleStage === "mature" || lifecycleStage === "precipitating");
    } else if (precipitation === "snow-pellets") {
        add({
            kind: "snow-pellets", phenomenon: "graupel", sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: [descriptor.mixedPhaseBottomKm, descriptor.mixedPhaseTopKm],
            attachmentPath: "mixed-phase-collision-zone->precipitation-core",
            relativeMass: 1, intensity01: clamp(mixed.phaseFractions.graupel * 2.4),
            surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
        }, lifecycleStage !== "developing" && lifecycleStage !== "decaying");
    } else if (precipitation === "snow") {
        add({
            kind: snowKind, phenomenon: "snow", sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: [descriptor.mixedPhaseBottomKm, descriptor.mixedPhaseTopKm],
            attachmentPath: "ice-crown->mixed-phase-core->precipitation-core",
            relativeMass: Math.max(0.42, mixed.phaseFractions["ice-crystals"]),
            intensity01: clamp(descriptor.precipitationStrength01),
            surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
        }, lifecycleStage !== "developing");
        if (!explicit) add({
            kind: "snow-pellets", phenomenon: "graupel", sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: [descriptor.mixedPhaseBottomKm, descriptor.mixedPhaseTopKm],
            attachmentPath: "mixed-phase-collision-zone->precipitation-core",
            relativeMass: mixed.phaseFractions.graupel * 0.72,
            intensity01: clamp(mixed.phaseFractions.graupel * 2.2),
            surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
        }, mixed.phaseFractions.graupel > 0.06 && lifecycleStage !== "decaying");
    } else {
        add({
            kind: "convective-rain", phenomenon: "rain", sourceRegion: "precipitation-core",
            sourceAltitudeRangeKm: contracts.rain.sourceAltitudeRangeKm,
            attachmentPath: "mixed-phase-core->precipitation-core->downdraft-core",
            relativeMass: Math.max(0.52, mixed.phaseFractions.rain),
            intensity01: contracts.rain.intensity01,
            surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
        }, contracts.rain.active);
        if (!explicit) {
            add({
                kind: "hail", phenomenon: "hail", sourceRegion: "mixed-phase-core",
                sourceAltitudeRangeKm: contracts.hail.sourceAltitudeRangeKm,
                attachmentPath: "mixed-phase-updraft-cycle->precipitation-core",
                relativeMass: contracts.hail.intensity01 * 0.34,
                intensity01: contracts.hail.intensity01,
                surfaceSurvivalFraction01: contracts.hail.reachesGroundFraction01,
            }, contracts.hail.active && source.compiled.precipitation.rate >= 24);
            add({
                kind: "snow-pellets", phenomenon: "graupel", sourceRegion: "mixed-phase-core",
                sourceAltitudeRangeKm: [descriptor.mixedPhaseBottomKm, descriptor.mixedPhaseTopKm],
                attachmentPath: "mixed-phase-collision-zone->precipitation-core",
                relativeMass: mixed.phaseFractions.graupel * 0.56,
                intensity01: clamp(mixed.phaseFractions.graupel * 2.2),
                surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
            }, mixed.phaseFractions.graupel > 0.075 &&
                lifecycleStage !== "developing" && lifecycleStage !== "decaying");
            add({
                kind: mixed.phaseFractions["ice-crystals"] > 0.55
                    ? "snow-crystals" : "snow-flakes",
                phenomenon: "snow", sourceRegion: "mixed-phase-core",
                sourceAltitudeRangeKm: [descriptor.mixedPhaseBottomKm,
                    descriptor.mixedPhaseTopKm],
                attachmentPath: "ice-crown->mixed-phase-core->precipitation-core",
                relativeMass: mixed.phaseFractions["ice-crystals"] * 0.38,
                intensity01: clamp(mixed.phaseFractions["ice-crystals"]),
                surfaceSurvivalFraction01: contracts.rain.reachesGroundFraction01,
            }, environment.surfaceTemperatureKelvin < 272.15 &&
                mixed.phaseFractions["ice-crystals"] > 0.14);
            add({
                kind: mixed.phaseFractions["ice-crystals"] > 0.45
                    ? "virga-ice" : "virga-liquid",
                phenomenon: "virga", sourceRegion: "precipitation-core",
                sourceAltitudeRangeKm: contracts.virga.sourceAltitudeRangeKm,
                attachmentPath: "precipitation-core->subcloud-evaporation",
                relativeMass: contracts.virga.intensity01 * 0.32,
                intensity01: contracts.virga.intensity01,
                surfaceSurvivalFraction01: 0,
            }, contracts.virga.active);
        }
    }

    const totalMass = candidates.reduce((sum, plan) =>
        sum + Math.max(0, plan.relativeMass ?? 0), 0);
    const organizationExtra = organization === "squall-line" ? 2
        : organization === "multicell-cluster" ? 1 : 0;
    const plans: DeepConvectionHydrometeorPlan[] = candidates.map((plan) => {
        const baseCount = plan.phenomenon === "rain" ? 2
            : plan.phenomenon === "virga" ? 2
                : plan.phenomenon === "snow" ? 2 : 1;
        const intensityExtra = Math.round(plan.intensity01 *
            (plan.phenomenon === "hail" ? 2 : 3));
        return {
            ...plan,
            relativeMass: plan.relativeMass / Math.max(1e-6, totalMass),
            fieldCount: clamp(
                baseCount + intensityExtra + organizationExtra,
                1,
                plan.phenomenon === "rain" || plan.phenomenon === "snow" ? 7 : 5,
            ),
        };
    });
    return { lifecycleStage, organization, environment: resolvedEnvironment,
        descriptor, topology, plans };
}

const stormRegionFor = (
    context: DeepConvectionHydrometeorContext,
    id: DeepConvectionTopologyRegionId,
) => context.topology.regions.find((region) => region.id === id) ??
    context.topology.regions.find((region) => region.id === "precipitation-core") ??
    context.topology.regions[0];

/** Uses the existing 16-vec4 field ABI; only CPU provenance is appended. */
export function createCumulonimbusHydrometeorFields(
    source: HydrometeorCloudSource,
    parentSystemIndex: number,
    environment: HydrometeorEnvironmentState,
): HydrometeorField[] {
    const context = resolveCumulonimbusHydrometeorContext(source, environment);
    if (!context || context.plans.length === 0) return [];
    const fields: HydrometeorField[] = [];
    const parentRate = Math.max(0.001, source.compiled.precipitation.rate);
    const airDensity = airDensityFromEnvironment(environment);
    const parentExtent = source.state.extent;
    const parentWind = windVector(
        source.compiled.kinematics.windSpeed,
        source.compiled.kinematics.windDirection,
    );
    const stormDirection = source.state.organization.kind === "storm-complex"
        ? source.state.organization.propagationDirection
        : parentExtent.orientation;
    const propagation = windVector(1, stormDirection);
    // Normalize source offsets by the live storm core, not the much larger
    // cold-pool/system boundary. Using the full boundary collapsed every rain
    // core back onto the updraft whenever a mature gust front was extensive.
    const downwindScale = Math.max(0.2, context.descriptor.coreRadiusKm * 3.2);
    const crosswindScale = Math.max(0.2, context.descriptor.coreRadiusKm *
        (context.organization === "squall-line" ? 5.2
            : context.organization === "multicell-cluster" ? 3.2 : 2.6));
    const parentBasis = cloudEastAngleBasis(parentExtent.orientation);
    let sourceIndex = 0;

    for (const plan of context.plans) {
        const region = stormRegionFor(context, plan.sourceRegion);
        const precipitationRegion = stormRegionFor(context, "precipitation-core");
        const mixedRegion = stormRegionFor(context, "mixed-phase-core");
        const regionCentre = plan.phenomenon === "hail" || plan.phenomenon === "graupel"
            ? [
                lerp(mixedRegion.centreKm[0], precipitationRegion.centreKm[0], 0.48),
                mixedRegion.centreKm[1],
                lerp(mixedRegion.centreKm[2], precipitationRegion.centreKm[2], 0.34),
            ]
            : region.centreKm;
        const sourceAlong = clamp(regionCentre[0] / downwindScale * 0.68, -0.58, 0.68);
        const sourceCross = clamp(regionCentre[2] / crosswindScale * 0.58, -0.56, 0.56);
        const random = mulberry32(hashText(
            `${source.state.id}:deep-convection:${plan.phenomenon}:${plan.kind}`,
        ));
        const variations = Array.from({ length: plan.fieldCount }, () =>
            lerp(0.68, 1.32, random()));
        const variationTotal = variations.reduce((sum, value) => sum + value, 0);
        const clusterCount = context.organization === "multicell-cluster" ? 3
            : context.organization === "squall-line" ? 4
                : context.organization === "supercell" ? 2 : 1;
        const clusters = Array.from({ length: clusterCount }, (_, index) => {
            if (index === 0) return { along: sourceAlong, cross: sourceCross };
            const angle = random() * Math.PI * 2;
            const spreadAlong = context.organization === "squall-line" ? 0.10 : 0.16;
            const spreadCross = context.organization === "squall-line" ? 0.36 : 0.20;
            return {
                along: clamp(sourceAlong + Math.cos(angle) * spreadAlong *
                    lerp(0.45, 1, random()), -0.68, 0.68),
                cross: clamp(sourceCross + Math.sin(angle) * spreadCross *
                    lerp(0.45, 1, random()), -0.62, 0.62),
            };
        });

        for (let index = 0; index < plan.fieldCount; index += 1) {
            const cluster = clusters[index % clusters.length];
            const angle = random() * Math.PI * 2;
            const radial = Math.sqrt(random());
            const hailLike = plan.phenomenon === "hail" || plan.phenomenon === "graupel";
            const virga = plan.phenomenon === "virga";
            const localAlong = clamp(
                cluster.along + Math.cos(angle) * radial * (hailLike ? 0.075 : virga ? 0.12 : 0.14),
                -0.74,
                0.74,
            );
            const localCross = clamp(
                cluster.cross + Math.sin(angle) * radial *
                    (context.organization === "squall-line" ? 0.18 : hailLike ? 0.07 : 0.12),
                -0.70,
                0.70,
            );
            const majorFraction = hailLike ? lerp(0.055, 0.105, random())
                : virga ? lerp(0.045, 0.105, random())
                    : plan.phenomenon === "snow" ? lerp(0.09, 0.18, random())
                        : lerp(0.09, 0.19, random());
            const minorFraction = hailLike ? lerp(0.06, 0.115, random())
                : virga ? lerp(0.045, 0.10, random())
                    : plan.phenomenon === "snow" ? lerp(0.10, 0.20, random())
                        : lerp(0.10, 0.21, random());
            const majorRadiusKm = parentExtent.majorRadiusKm * Math.min(
                majorFraction,
                Math.max(0.025, 0.94 - Math.abs(localAlong)),
            );
            const minorRadiusKm = parentExtent.minorRadiusKm * Math.min(
                minorFraction,
                Math.max(0.025, 0.94 - Math.abs(localCross)),
            );
            const centerEastKm = parentExtent.centerEastKm +
                parentBasis.alongEast * localAlong * parentExtent.majorRadiusKm +
                parentBasis.crossEast * localCross * parentExtent.minorRadiusKm;
            const centerNorthKm = parentExtent.centerNorthKm +
                parentBasis.alongNorth * localAlong * parentExtent.majorRadiusKm +
                parentBasis.crossNorth * localCross * parentExtent.minorRadiusKm;
            const localRate = parentRate * plan.relativeMass *
                variations[index] / Math.max(1e-6, variationTotal);
            const distribution = createParticleDistribution(
                plan.kind,
                localRate,
                clamp(plan.intensity01 * variations[index]),
                airDensity,
            );
            const cloudTop = source.compiled.geometry.baseAltitudeKm +
                source.compiled.geometry.geometricDepthKm;
            const topAltitudeKm = virga
                ? clamp(plan.sourceAltitudeRangeKm[1],
                    source.compiled.geometry.baseAltitudeKm - 0.05,
                    source.compiled.geometry.baseAltitudeKm + 0.08)
                : clamp(plan.sourceAltitudeRangeKm[1],
                    source.compiled.geometry.baseAltitudeKm + 0.18,
                    cloudTop - 0.04);
            const availableFallKm = Math.max(0.02,
                topAltitudeKm - environment.surfaceAltitudeKm);
            const humidity = clamp(lerp(
                environment.surfaceRelativeHumidity,
                source.compiled.thermodynamics.relativeHumidity,
                0.58,
            ));
            let evaporationDepthKm = estimateEvaporationDepthKm(
                plan.kind,
                distribution.massMedianDiameterMm,
                humidity,
                distribution.meanTerminalVelocityMps,
            );
            if (virga) {
                evaporationDepthKm = clamp(
                    source.compiled.precipitation.evaporationDepthKm > 0
                        ? source.compiled.precipitation.evaporationDepthKm
                        : availableFallKm * lerp(0.52, 0.88, random()),
                    0.08,
                    Math.max(0.09, availableFallKm - 0.04),
                );
            }
            const reachesSurface = !virga &&
                (plan.surfaceSurvivalFraction01 > 0.06 ||
                    plan.phenomenon === "snow" || plan.phenomenon === "graupel");
            const bottomAltitudeKm = reachesSurface
                ? environment.surfaceAltitudeKm
                : Math.max(
                    environment.surfaceAltitudeKm + 0.04,
                    topAltitudeKm - Math.min(evaporationDepthKm,
                        availableFallKm * 0.94),
                );
            const survival = reachesSurface
                ? clamp(plan.surfaceSurvivalFraction01, 0.06, 1) : 0;
            const outflow = context.descriptor.coldPoolStrength01 *
                lerp(2, 9, plan.phenomenon === "rain" ? 1 : 0.35);
            const windEastMps = parentWind.east + propagation.east * outflow;
            const windNorthMps = parentWind.north + propagation.north * outflow;
            const render = renderingContract(plan.kind, distribution);
            const optics = createHydrometeorOptics(plan.kind, distribution);
            const baseMorphology = morphologyFor(plan.kind, source, random);
            const morphology: HydrometeorField["morphology"] = {
                radiusScaleAtBottom: virga ? lerp(0.52, 0.82, random())
                    : hailLike ? lerp(0.88, 1.12, random())
                        : lerp(1.04, 1.34 + context.descriptor.coldPoolStrength01 * 0.34,
                            random()),
                verticalModulation: clamp(
                    baseMorphology.verticalModulation +
                        context.environment.deepLayerShearMetresPerSecond / 90,
                    0.12,
                    0.82,
                ),
                temporalIntermittency: clamp(
                    baseMorphology.temporalIntermittency *
                        (context.lifecycleStage === "precipitating" ? 1.08
                            : context.lifecycleStage === "decaying" ? 0.74 : 0.92),
                    0.04,
                    0.92,
                ),
                clustering: clamp(
                    baseMorphology.clustering +
                        (context.organization === "multicell-cluster" ? 0.10
                            : context.organization === "squall-line" ? 0.16 : 0.04),
                    0.18,
                    0.96,
                ),
            };
            const concentrationScale = virga
                ? lerp(0.045, 0.19, Math.sqrt(plan.intensity01))
                : clamp(0.48 + plan.intensity01 * 0.46, 0.42, 0.96);
            const area = Math.PI * majorRadiusKm * minorRadiusKm;
            const importance = optics.extinctionRgbKm[1] * area *
                (0.25 + availableFallKm) * concentrationScale;
            fields.push({
                parentSystemId: source.state.id,
                parentSystemIndex,
                parentLayerIndex: source.layerIndex,
                sourceIndex,
                ownerKind: "cloud-system",
                kind: plan.kind,
                renderClass: renderClassFor(plan.kind),
                source: {
                    centerEastKm,
                    centerNorthKm,
                    majorRadiusKm: Math.max(0.025, majorRadiusKm),
                    minorRadiusKm: Math.max(0.025, minorRadiusKm),
                    orientation: stormDirection + (random() - 0.5) *
                        (hailLike ? 0.09 : 0.20),
                    topAltitudeKm,
                    bottomAltitudeKm,
                    boundaryTransitionFraction: lerp(0.09, 0.22, random()),
                    harmonicA: (random() - 0.5) * (hailLike ? 0.08 : 0.16),
                    harmonicB: (random() - 0.5) * (hailLike ? 0.07 : 0.13),
                },
                distribution,
                optics,
                phase: phaseState(plan.kind, source, environment, bottomAltitudeKm),
                evaporation: {
                    sourceRelativeHumidity: humidity,
                    completeEvaporationDepthKm: evaporationDepthKm,
                    profileExponent: virga ? lerp(1.45, 2.6, random())
                        : lerp(0.62, 1.18, random()),
                    surfaceReachFraction: survival,
                },
                motion: {
                    windEastMps,
                    windNorthMps,
                    terminalVelocityMps: distribution.meanTerminalVelocityMps,
                    turbulenceMps: clamp(
                        Math.sqrt(source.compiled.kinematics.turbulenceDissipation) * 2.4 +
                            context.descriptor.downdraftStrength01 * 0.55,
                        0.08,
                        3.2,
                    ),
                    flutterAmplitude: plan.phenomenon === "snow" ? lerp(0.28, 0.72, random())
                        : plan.phenomenon === "graupel" ? lerp(0.12, 0.28, random())
                            : plan.phenomenon === "hail" ? 0.03 : 0.08,
                },
                rendering: render,
                morphology,
                particle: createHydrometeorParticleContract(plan.kind, distribution),
                lighting: lightingFor(plan.kind),
                deepConvection: {
                    lifecycleStage: context.lifecycleStage,
                    organization: context.organization,
                    environment: context.environment.id,
                    phenomenon: plan.phenomenon,
                    sourceRegion: plan.sourceRegion,
                    sourceAltitudeRangeKm: plan.sourceAltitudeRangeKm,
                    attachmentPath: plan.attachmentPath,
                    downshearOffset01: sourceAlong,
                    coldPoolCoupling01: context.descriptor.coldPoolStrength01,
                    surfaceSurvivalFraction01: survival,
                },
                concentrationScale,
                seed: random(),
                importance,
            });
            sourceIndex += 1;
        }
    }
    return fields;
}

const createFieldsForKind = (
    source: HydrometeorCloudSource,
    parentSystemIndex: number,
    kind: HydrometeorKind,
    environment: HydrometeorEnvironmentState,
): HydrometeorField[] => {
    const parentPrecipitation = source.compiled.precipitation;
    const fog = isSurfaceMeteor(kind);
    const rate = fog ? 0 : Math.max(0.001, parentPrecipitation.rate);
    const intensity = fog ? clamp(environment.fogAmount)
        : clamp(rate / (kind === "drizzle" ? 3 : kind === "hail" ? 120 : 50));
    const count = fieldCountFor(source, kind, rate);
    const random = mulberry32(hashText(`${source.state.id}:${kind}:hydrometeors`));
    const placements = sourcePlacements(count, source, kind, random);
    const airDensity = airDensityFromEnvironment(environment);
    const fields: HydrometeorField[] = [];
    for (let index = 0; index < count; index += 1) {
        const variation = lerp(0.72, 1.28, random());
        const localRate = Math.max(0.001, rate * variation);
        const distribution = createParticleDistribution(
            kind,
            localRate,
            clamp(intensity * variation),
            airDensity,
        );
        const placement = placements[index];
        const requestedRadii = fieldRadii(source, kind, count, random);
        // The extraction patch must remain inside the finite parent support at
        // cloud base. Hydrometeors can slant beyond it only after falling.
        const radii = {
            major: Math.min(requestedRadii.major,
                source.state.extent.majorRadiusKm *
                    Math.max(0.08, 0.94 - Math.abs(placement.localAlong))),
            minor: Math.min(requestedRadii.minor,
                source.state.extent.minorRadiusKm *
                    Math.max(0.08, 0.94 - Math.abs(placement.localCross))),
        };
        const orientation = source.state.extent.orientation +
            (random() - 0.5) * (fog ? 0.32 : 0.16);
        const parentBasis = cloudEastAngleBasis(source.state.extent.orientation);
        const centerEastKm = source.state.extent.centerEastKm +
            parentBasis.alongEast * placement.localAlong * source.state.extent.majorRadiusKm +
            parentBasis.crossEast * placement.localCross * source.state.extent.minorRadiusKm;
        const centerNorthKm = source.state.extent.centerNorthKm +
            parentBasis.alongNorth * placement.localAlong * source.state.extent.majorRadiusKm +
            parentBasis.crossNorth * placement.localCross * source.state.extent.minorRadiusKm;
        const topAltitudeKm = fog
            ? environment.surfaceAltitudeKm + lerp(kind === "fog" ? 0.055 : 0.025,
                kind === "fog" ? 0.34 : 0.18, intensity * lerp(0.75, 1.1, random()))
            : Math.max(environment.surfaceAltitudeKm + 0.02,
                source.compiled.geometry.baseAltitudeKm +
                source.compiled.geometry.geometricDepthKm * lerp(0, 0.035, random()));
        const availableFallKm = Math.max(0.01,
            topAltitudeKm - environment.surfaceAltitudeKm);
        const humidity = clamp(lerp(
            environment.surfaceRelativeHumidity,
            Math.min(1, source.compiled.thermodynamics.relativeHumidity),
            0.62,
        ));
        let evaporationDepthKm = fog ? 0 : estimateEvaporationDepthKm(
            kind,
            distribution.massMedianDiameterMm,
            humidity,
            distribution.meanTerminalVelocityMps,
        );
        const explicitDepth = parentPrecipitation.evaporationDepthKm;
        const declaredVirga = kind === "virga-liquid" || kind === "virga-ice";
        if (declaredVirga && explicitDepth > 0) evaporationDepthKm = explicitDepth;
        if (declaredVirga) evaporationDepthKm = Math.min(
            evaporationDepthKm,
            availableFallKm * lerp(0.58, 0.9, random()),
        );
        const completelyEvaporates = !fog && evaporationDepthKm < availableFallKm &&
            (declaredVirga || kind === "drizzle" || humidity < 0.5);
        const bottomAltitudeKm = fog ? environment.surfaceAltitudeKm
            : completelyEvaporates
                ? topAltitudeKm - evaporationDepthKm
                : environment.surfaceAltitudeKm;
        const surfaceReachFraction = fog ? 1
            : completelyEvaporates ? 0
                : clamp(Math.sqrt(Math.max(0,
                    1 - availableFallKm / Math.max(evaporationDepthKm, availableFallKm + 1e-5))) ** 3,
                0.08, 1);
        const parentWind = windVector(
            source.compiled.kinematics.windSpeed,
            source.compiled.kinematics.windDirection,
        );
        const surfaceWind = windVector(
            environment.surfaceWindSpeed,
            environment.surfaceWindDirection,
        );
        const windMix = fog ? 0.2 : 0.72;
        const windEastMps = lerp(surfaceWind.east, parentWind.east, windMix);
        const windNorthMps = lerp(surfaceWind.north, parentWind.north, windMix);
        const render = renderingContract(kind, distribution);
        let optics = createHydrometeorOptics(kind, distribution);
        if (fog) {
            const visibilityKm = kind === "fog"
                ? clamp(environment.surfaceVisibilityKm, 0.03, 0.999)
                : kind === "ice-fog"
                    ? clamp(environment.surfaceVisibilityKm, 0.015, 0.999)
                    : clamp(environment.surfaceVisibilityKm, 1, 80);
            const extinction = clamp(3.912 / visibilityKm, 0.03, 140);
            optics = createHydrometeorOptics(kind, distribution, extinction);
        }
        const concentrationScale = declaredVirga
            // Distant virga is normally a low-optical-depth modulation of the
            // air column. Retain rate response while preventing a trace source
            // from becoming an opaque white volume.
            ? lerp(0.055, 0.24, Math.sqrt(intensity))
            : source.state.organization.kind === "frontal-shield"
                ? 0.74 : fog ? 0.68 : 1;
        const area = Math.PI * radii.major * radii.minor;
        const importance = optics.extinctionRgbKm[1] * area *
            (0.25 + availableFallKm) * concentrationScale;
        fields.push({
            parentSystemId: source.state.id,
            parentSystemIndex,
            parentLayerIndex: source.layerIndex,
            sourceIndex: index,
            ownerKind: "cloud-system",
            kind,
            renderClass: renderClassFor(kind),
            source: {
                centerEastKm,
                centerNorthKm,
                majorRadiusKm: Math.max(0.015, radii.major),
                minorRadiusKm: Math.max(0.015, radii.minor),
                orientation,
                topAltitudeKm,
                bottomAltitudeKm,
                boundaryTransitionFraction: fog ? lerp(0.18, 0.34, random())
                    : lerp(0.08, 0.22, random()),
                harmonicA: (random() - 0.5) * (fog ? 0.22 : 0.12),
                harmonicB: (random() - 0.5) * (fog ? 0.16 : 0.09),
            },
            distribution,
            optics,
            phase: phaseState(kind, source, environment, bottomAltitudeKm),
            evaporation: {
                sourceRelativeHumidity: humidity,
                completeEvaporationDepthKm: evaporationDepthKm,
                profileExponent: declaredVirga ? lerp(1.35, 2.4, random())
                    : lerp(0.55, 1.15, random()),
                surfaceReachFraction,
            },
            motion: {
                windEastMps,
                windNorthMps,
                terminalVelocityMps: distribution.meanTerminalVelocityMps,
                turbulenceMps: clamp(
                    Math.sqrt(source.compiled.kinematics.turbulenceDissipation) * 2.4,
                    0.02,
                    2.4,
                ),
                flutterAmplitude: kind === "snow-crystals" || kind === "snow-flakes" ||
                    kind === "snow-grains" || kind === "virga-ice"
                    ? lerp(0.18, 0.62, random()) : kind === "hail" ? 0.03 : 0.08,
            },
            rendering: render,
            morphology: morphologyFor(kind, source, random),
            particle: createHydrometeorParticleContract(kind, distribution),
            lighting: lightingFor(kind),
            concentrationScale,
            seed: random(),
            importance,
        });
    }
    return fields;
};

export const validateHydrometeorSurfacePhenomenon = (
    kind: Exclude<HydrometeorSurfacePhenomenon, "auto" | "none">,
    environment: HydrometeorEnvironmentState,
): HydrometeorPhysicalValidity => {
    const reasons: string[] = [];
    if ((kind === "fog" || kind === "mist") &&
        environment.surfaceRelativeHumidity < 0.78) {
        reasons.push("liquid-suspension-requires-near-saturated-air");
    }
    if (kind === "fog" && !(environment.surfaceVisibilityKm > 0 &&
        environment.surfaceVisibilityKm < 1)) {
        reasons.push("fog-requires-meteorological-optical-range-below-one-kilometre");
    }
    if (kind === "mist" && environment.surfaceVisibilityKm < 1) {
        reasons.push("mist-requires-meteorological-optical-range-at-least-one-kilometre");
    }
    if (kind === "ice-fog" && (environment.surfaceTemperatureKelvin > 243.15 ||
        environment.surfaceRelativeHumidity < 0.7)) {
        reasons.push("ice-fog-requires-humid-air-below-minus-thirty-celsius");
    }
    if (kind === "ice-fog" && !(environment.surfaceVisibilityKm > 0 &&
        environment.surfaceVisibilityKm < 1)) {
        reasons.push("ice-fog-requires-restricted-surface-visibility");
    }
    if (kind === "diamond-dust" && (environment.surfaceTemperatureKelvin > 263.15 ||
        environment.surfaceRelativeHumidity < 0.62)) {
        reasons.push("diamond-dust-requires-cold-humid-clear-air");
    }
    if (kind === "diamond-dust" && environment.surfaceVisibilityKm < 1) {
        reasons.push("diamond-dust-visibility-conflicts-with-rendered-regime");
    }
    return { valid: reasons.length === 0, reasons };
};

const createSurfaceRegionFields = (
    kind: "fog" | "mist" | "ice-fog" | "diamond-dust",
    environment: HydrometeorEnvironmentState,
): HydrometeorField[] => {
    const region = environment.surfaceRegion ?? {
        id: `boundary-${kind}`,
        centerEastKm: -7,
        centerNorthKm: 22,
        majorRadiusKm: 24,
        minorRadiusKm: 13,
        orientation: 0.35,
        topAltitudeKm: kind === "diamond-dust" ? 0.75 : kind === "ice-fog" ? 0.16 : 0.28,
        seed: hashText(kind) / 0xffff_ffff,
    };
    const random = mulberry32(hashText(`${region.id}:${kind}:${region.seed}`));
    const intensity = clamp(Math.max(environment.fogAmount,
        kind === "diamond-dust" ? 0.24 : 0.42));
    const distribution = createParticleDistribution(kind, 0, intensity,
        airDensityFromEnvironment(environment));
    const requestedVisibility = kind === "fog" ? clamp(environment.surfaceVisibilityKm, 0.03, 0.999)
        : kind === "ice-fog" ? clamp(environment.surfaceVisibilityKm, 0.015, 0.999)
            : clamp(environment.surfaceVisibilityKm, 1, 80);
    const extinction = clamp(3.912 / requestedVisibility, 0.03, 140);
    const optics = createHydrometeorOptics(kind, distribution, extinction);
    const count = kind === "diamond-dust" ? 3 : 2;
    const surfaceWind = windVector(environment.surfaceWindSpeed,
        environment.surfaceWindDirection);
    return Array.from({ length: count }, (_, index): HydrometeorField => {
        const angle = index / count * Math.PI * 2 + region.seed * 2.4;
        const radial = index === 0 ? 0 : lerp(0.24, 0.46, random());
        const regionBasis = cloudEastAngleBasis(region.orientation);
        const centerEastKm = region.centerEastKm +
            regionBasis.alongEast * Math.cos(angle) * region.majorRadiusKm * radial +
            regionBasis.crossEast * Math.sin(angle) * region.minorRadiusKm * radial;
        const centerNorthKm = region.centerNorthKm +
            regionBasis.alongNorth * Math.cos(angle) * region.majorRadiusKm * radial +
            regionBasis.crossNorth * Math.sin(angle) * region.minorRadiusKm * radial;
        const topAltitudeKm = environment.surfaceAltitudeKm +
            clamp(region.topAltitudeKm, 0.02, kind === "diamond-dust" ? 1.5 : 0.8) *
            lerp(0.78, 1.08, random());
        const majorRadiusKm = region.majorRadiusKm * lerp(0.42, 0.68, random());
        const minorRadiusKm = region.minorRadiusKm * lerp(0.38, 0.64, random());
        const importance = extinction * Math.PI * majorRadiusKm * minorRadiusKm *
            (topAltitudeKm - environment.surfaceAltitudeKm) * 0.72;
        const seed = random();
        return {
            parentSystemId: region.id,
            parentSystemIndex: -1,
            parentLayerIndex: -1,
            sourceIndex: index,
            ownerKind: "boundary-layer-region",
            kind,
            renderClass: "surface-bank",
            source: {
                centerEastKm,
                centerNorthKm,
                majorRadiusKm,
                minorRadiusKm,
                orientation: region.orientation + (random() - 0.5) * 0.24,
                topAltitudeKm,
                bottomAltitudeKm: environment.surfaceAltitudeKm,
                boundaryTransitionFraction: lerp(0.2, 0.38, random()),
                harmonicA: (random() - 0.5) * 0.2,
                harmonicB: (random() - 0.5) * 0.14,
            },
            distribution,
            optics,
            phase: {
                liquidFractionAtSource: kind === "fog" || kind === "mist" ? 1 : 0,
                liquidFractionAtBottom: kind === "fog" || kind === "mist" ? 1 : 0,
                freezingAltitudeKm: 0,
                meltingDepthKm: 0,
                warmLayerBottomKm: environment.warmLayerBottomKm,
                warmLayerTopKm: environment.warmLayerTopKm,
                refreezingDepthKm: 0,
                phasePath: kind === "fog" || kind === "mist" ? "liquid" : "ice",
            },
            evaporation: {
                sourceRelativeHumidity: environment.surfaceRelativeHumidity,
                completeEvaporationDepthKm: 0,
                profileExponent: 0.7,
                surfaceReachFraction: 1,
            },
            motion: {
                windEastMps: surfaceWind.east,
                windNorthMps: surfaceWind.north,
                terminalVelocityMps: distribution.meanTerminalVelocityMps,
                turbulenceMps: kind === "diamond-dust" ? 0.06 : 0.035,
                flutterAmplitude: kind === "diamond-dust" ? 0.38 : kind === "ice-fog" ? 0.12 : 0.02,
            },
            rendering: renderingContract(kind, distribution),
            morphology: {
                radiusScaleAtBottom: kind === "mist"
                    ? lerp(0.9, 1.2, random())
                    : kind === "diamond-dust" ? lerp(0.96, 1.3, random())
                        : lerp(0.94, 1.14, random()),
                verticalModulation: kind === "fog"
                    ? lerp(0.06, 0.14, random())
                    : kind === "mist" ? lerp(0.18, 0.34, random())
                        : kind === "ice-fog" ? lerp(0.08, 0.2, random())
                            : lerp(0.24, 0.46, random()),
                temporalIntermittency: kind === "diamond-dust" ? 0.24
                    : kind === "mist" ? 0.12 : 0.04,
                clustering: kind === "fog" ? lerp(0.78, 0.94, random())
                    : kind === "mist" ? lerp(0.5, 0.72, random())
                        : kind === "ice-fog" ? lerp(0.7, 0.88, random())
                            : lerp(0.3, 0.5, random()),
            },
            particle: createHydrometeorParticleContract(kind, distribution),
            lighting: lightingFor(kind),
            concentrationScale: kind === "fog" || kind === "ice-fog" ? 1
                : kind === "mist" ? 0.7 : 0.14,
            seed,
            importance,
        };
    });
};

export function createHydrometeorRuntime(
    sources: readonly HydrometeorCloudSource[],
    environmentOverrides: Partial<HydrometeorEnvironmentState> = {},
    capacity = HYDROMETEOR_MAX_FIELDS,
    sceneOverrides?: HydrometeorSceneOverrides,
): HydrometeorRuntime {
    const baseEnvironment: HydrometeorEnvironmentState = {
        ...DEFAULT_HYDROMETEOR_ENVIRONMENT,
        ...environmentOverrides,
    };
    const resolved = applyHydrometeorSceneOverrides(
        sources,
        baseEnvironment,
        sceneOverrides,
    );
    const environment = resolved.environment;
    const diagnostics: string[] = [];
    const candidates: HydrometeorField[] = [];
    resolved.sources.forEach((source, parentSystemIndex) => {
        const precipitation = source.precipitationKindOverride ??
            source.compiled.precipitation.kind;
        const genus = source.compiled.classification.genus;
        const validationKind = precipitation === "rain" &&
            (genus === "cumulus" || genus === "cumulonimbus") ? "shower" : precipitation;
        if (!hydrometeorOwnerIsWmoValid(validationKind, genus)) {
            diagnostics.push(`hydrometeor-owner-invalid:${source.state.id}:${precipitation}:${genus}`);
            return;
        }
        const physicalValidity = validateHydrometeorPhysicalCombination(
            precipitation,
            source,
            environment,
        );
        if (!physicalValidity.valid) {
            for (const reason of physicalValidity.reasons) {
                diagnostics.push(
                    `hydrometeor-physical-invalid:${source.state.id}:${precipitation}:${reason}`,
                );
            }
            return;
        }
        if (genus === "cumulonimbus") {
            const stormFields = createCumulonimbusHydrometeorFields(
                source,
                parentSystemIndex,
                environment,
            );
            candidates.push(...stormFields);
            if (precipitation !== "none" && source.compiled.precipitation.rate > 0 &&
                stormFields.length === 0) {
                diagnostics.push(
                    `hydrometeor-cb-source-inactive:${source.state.id}:` +
                    `${source.compiled.lifecycle.stage}:${precipitation}`,
                );
            }
        } else {
            const kind = kindFromPrecipitation(precipitation, source, environment);
            if (kind && source.compiled.precipitation.rate > 0) {
                candidates.push(...createFieldsForKind(
                    source,
                    parentSystemIndex,
                    kind,
                    environment,
                ));
            }
        }
        const fogKind = environment.surfacePhenomenon === "auto"
            ? fogKindFor(source, environment) : null;
        if (fogKind) {
            candidates.push(...createFieldsForKind(
                source,
                parentSystemIndex,
                fogKind,
                environment,
            ));
        }
    });
    if (environment.surfacePhenomenon !== "auto" &&
        environment.surfacePhenomenon !== "none") {
        const validity = validateHydrometeorSurfacePhenomenon(
            environment.surfacePhenomenon,
            environment,
        );
        if (validity.valid) {
            candidates.push(...createSurfaceRegionFields(
                environment.surfacePhenomenon,
                environment,
            ));
        } else {
            diagnostics.push(`hydrometeor-surface-invalid:${environment.surfacePhenomenon}`);
            diagnostics.push(...validity.reasons.map((reason) =>
                `hydrometeor-surface-invalid:${environment.surfacePhenomenon}:${reason}`));
        }
    }
    const boundedCapacity = Math.max(1,
        Math.min(HYDROMETEOR_MAX_FIELDS, Math.floor(capacity)));
    const selected = [...candidates]
        .sort((left, right) => right.importance - left.importance ||
            left.parentSystemIndex - right.parentSystemIndex ||
            left.sourceIndex - right.sourceIndex)
        .slice(0, boundedCapacity)
        .sort((left, right) => left.parentSystemIndex - right.parentSystemIndex ||
            left.sourceIndex - right.sourceIndex || left.kind.localeCompare(right.kind));
    if (candidates.length > selected.length) {
        diagnostics.push(`hydrometeor-capacity:dropped-${candidates.length - selected.length}`);
    }
    const packed = packHydrometeorFields(selected, boundedCapacity,
        candidates.length - selected.length);
    return { fields: selected, packed, diagnostics };
}

const kindCode: Record<HydrometeorKind, number> = {
    drizzle: 0,
    "stratiform-rain": 1,
    "convective-rain": 2,
    "snow-flakes": 3,
    hail: 4,
    "virga-liquid": 5,
    "virga-ice": 6,
    fog: 7,
    mist: 8,
    "snow-crystals": 9,
    "ice-pellets": 10,
    "snow-grains": 11,
    "snow-pellets": 12,
    "ice-fog": 13,
    "diamond-dust": 14,
};

const renderClassCode: Record<HydrometeorRenderClass, number> = {
    shaft: 0,
    curtain: 1,
    "surface-bank": 2,
    shower: 3,
};

const particleHabitCode: Record<HydrometeorParticleHabit, number> = {
    "drizzle-sphere": 0,
    "rain-drop": 1,
    "pristine-crystal": 2,
    "aggregate-flake": 3,
    hailstone: 4,
    "ice-pellet": 5,
    "snow-grain": 6,
    graupel: 7,
    "fog-droplet": 8,
    "ice-fog-crystal": 9,
    "diamond-plate": 10,
};

const phasePathCode: Record<HydrometeorField["phase"]["phasePath"], number> = {
    liquid: 0,
    ice: 1,
    melting: 2,
    "melt-refreeze": 3,
};

const setVector = (
    target: Float32Array,
    vectorIndex: number,
    values: readonly number[],
) => target.set(values, vectorIndex * 4);

export function packHydrometeorFields(
    fields: readonly HydrometeorField[],
    capacity = HYDROMETEOR_MAX_FIELDS,
    alreadyDropped = 0,
): PackedHydrometeorFields {
    const boundedCapacity = Math.max(1,
        Math.min(HYDROMETEOR_MAX_FIELDS, Math.floor(capacity)));
    const count = Math.min(fields.length, boundedCapacity);
    const dropped = Math.max(0, fields.length - count) + Math.max(0, alreadyDropped);
    const data = new Float32Array(
        (HYDROMETEOR_HEADER_VEC4S + boundedCapacity * HYDROMETEOR_VEC4_STRIDE) * 4,
    );
    setVector(data, 0, [count, HYDROMETEOR_VEC4_STRIDE, boundedCapacity, dropped]);
    for (let index = 0; index < count; index += 1) {
        const field = fields[index];
        const offset = HYDROMETEOR_HEADER_VEC4S + index * HYDROMETEOR_VEC4_STRIDE;
        setVector(data, offset + 0, [
            field.deepConvection ? 2 : 1,
            kindCode[field.kind],
            field.parentSystemIndex,
            renderClassCode[field.renderClass],
        ]);
        setVector(data, offset + 1, [
            field.source.centerEastKm,
            field.source.centerNorthKm,
            field.source.majorRadiusKm,
            field.source.minorRadiusKm,
        ]);
        setVector(data, offset + 2, [
            field.source.orientation,
            field.source.topAltitudeKm,
            field.source.bottomAltitudeKm,
            field.source.boundaryTransitionFraction,
        ]);
        setVector(data, offset + 3, [
            field.distribution.massMedianDiameterMm,
            field.distribution.shape,
            field.distribution.minimumDiameterMm,
            field.distribution.maximumDiameterMm,
        ]);
        setVector(data, offset + 4, [
            field.motion.windEastMps,
            field.motion.windNorthMps,
            field.motion.terminalVelocityMps,
            field.motion.turbulenceMps,
        ]);
        setVector(data, offset + 5, [
            ...field.optics.extinctionRgbKm,
            field.concentrationScale,
        ]);
        setVector(data, offset + 6, [
            ...field.optics.singleScatteringAlbedoRgb,
            field.optics.asymmetryParameter,
        ]);
        setVector(data, offset + 7, [
            field.phase.liquidFractionAtSource,
            field.phase.liquidFractionAtBottom,
            field.phase.freezingAltitudeKm,
            field.phase.meltingDepthKm,
        ]);
        setVector(data, offset + 8, [
            field.evaporation.sourceRelativeHumidity,
            field.evaporation.completeEvaporationDepthKm,
            field.evaporation.profileExponent,
            field.evaporation.surfaceReachFraction,
        ]);
        setVector(data, offset + 9, [
            field.rendering.maximumResolvableDistanceKm,
            field.rendering.exposureTrackLengthM,
            field.distribution.numberConcentrationM3,
            field.distribution.waterContentKgM3,
        ]);
        setVector(data, offset + 10, [
            field.source.harmonicA,
            field.source.harmonicB,
            field.motion.flutterAmplitude,
            field.seed,
        ]);
        setVector(data, offset + 11, [
            field.rendering.volumetricEnergyFraction,
            field.rendering.sparseParticleEnergyFraction,
            field.importance,
            field.parentLayerIndex,
        ]);
        setVector(data, offset + 12, [
            field.morphology.radiusScaleAtBottom,
            field.morphology.verticalModulation,
            field.morphology.temporalIntermittency,
            field.morphology.clustering,
        ]);
        setVector(data, offset + 13, [
            particleHabitCode[field.particle.habit],
            field.particle.aspectRatio,
            field.particle.orientationDispersion,
            field.particle.surfaceRoughness,
        ]);
        setVector(data, offset + 14, [
            clamp(field.lighting.directIrradianceWeight),
            clamp(field.lighting.diffuseIrradianceWeight),
            clamp(field.lighting.sourceGlintStrength),
            clamp(field.lighting.multipleScatteringBoost),
        ]);
        setVector(data, offset + 15, [
            field.phase.warmLayerBottomKm,
            field.phase.warmLayerTopKm,
            field.phase.refreezingDepthKm,
            phasePathCode[field.phase.phasePath],
        ]);
    }
    return { data, count, capacity: boundedCapacity, dropped };
}

export interface HydrometeorFieldSample {
    sourceWeight: number;
    extinctionRgbKm: readonly [number, number, number];
    liquidFraction: number;
    volumetricEnergyFraction: number;
    sparseParticleEnergyFraction: number;
    directIrradianceWeight: number;
    diffuseIrradianceWeight: number;
    sourceGlintStrength: number;
    multipleScatteringBoost: number;
}

const hydrometeorCompactC2 = (distance: number) => {
    const remainder = clamp(1 - distance);
    return remainder ** 4 * (1 + 4 * Math.max(0, distance));
};

const hydrometeorChannelHash = (seed: number, lane: number) => {
    const value = Math.sin(seed * 113.17 + lane * 71.43) * 43758.5453123;
    return value - Math.floor(value);
};

/** CPU reference for the compact, curved channel field used by virga. */
const hydrometeorFallstreakChannelWeight = (
    field: HydrometeorField,
    localAlong: number,
    localCross: number,
    vertical: number,
) => {
    const descent = 1 - vertical;
    let strongest = 0;
    let accumulated = 0;
    for (let lane = 0; lane < 7; lane += 1) {
        const laneNumber = lane + 1;
        const randomA = hydrometeorChannelHash(field.seed, laneNumber * 3 + 1);
        const randomB = hydrometeorChannelHash(field.seed, laneNumber * 3 + 2);
        const randomC = hydrometeorChannelHash(field.seed, laneNumber * 3 + 3);
        const enabled = randomC < lerp(0.38, 0.92, field.morphology.clustering)
            ? 1 : 0;
        const sourceAngle = randomA * Math.PI * 2;
        const sourceRadius = Math.sqrt(randomB) * 0.52;
        const sourceAlong = Math.cos(sourceAngle) * sourceRadius;
        const sourceCross = Math.sin(sourceAngle) * sourceRadius;
        const differentialShear = (randomC - 0.5) *
            lerp(0.12, 0.34, field.morphology.verticalModulation);
        const curvature = Math.sin(
            descent * Math.PI * lerp(0.65, 1.35, randomB) +
            randomA * Math.PI * 2,
        ) * differentialShear * descent ** 1.35;
        const channelAlong = sourceAlong + differentialShear * 0.36 * descent ** 1.6;
        const channelCross = sourceCross + curvature;
        const width = lerp(0.075, 0.16, randomB) *
            lerp(1, 0.48, descent);
        const aspect = lerp(0.7, 1.22, randomA);
        const distance = Math.hypot(
            (localAlong - channelAlong) / Math.max(0.025, width),
            (localCross - channelCross) / Math.max(0.025, width * aspect),
        );
        const channel = hydrometeorCompactC2(distance) *
            lerp(0.48, 1, randomC) * enabled;
        strongest = Math.max(strongest, channel);
        accumulated += channel;
    }
    const connectedChannels = strongest +
        0.24 * Math.max(0, Math.min(1, accumulated - strongest));
    const sourceEmergence = clamp(descent / 0.075);
    const terminalTaper = clamp(vertical / 0.24);
    return clamp(connectedChannels * sourceEmergence * terminalTaper);
};

interface HydrometeorTopologyParameters {
    lanes: number;
    alongWidth: readonly [number, number];
    crossWidth: readonly [number, number];
    sourceRadius: number;
    curvature: number;
    overlap: number;
    activation: number;
}

const precipitationTopologyParameters = (
    kind: HydrometeorKind,
): HydrometeorTopologyParameters => {
    switch (kind) {
        case "drizzle": return {
            lanes: 12, alongWidth: [0.34, 0.62], crossWidth: [0.09, 0.19],
            sourceRadius: 0.6, curvature: 0.08, overlap: 0.52, activation: 0.92,
        };
        case "stratiform-rain": return {
            lanes: 9, alongWidth: [0.3, 0.58], crossWidth: [0.08, 0.17],
            sourceRadius: 0.6, curvature: 0.13, overlap: 0.34, activation: 0.82,
        };
        case "convective-rain": return {
            lanes: 6, alongWidth: [0.15, 0.3], crossWidth: [0.13, 0.27],
            sourceRadius: 0.42, curvature: 0.22, overlap: 0.3, activation: 0.76,
        };
        case "snow-crystals": return {
            lanes: 10, alongWidth: [0.09, 0.22], crossWidth: [0.055, 0.13],
            sourceRadius: 0.68, curvature: 0.3, overlap: 0.18, activation: 0.72,
        };
        case "snow-flakes": return {
            lanes: 8, alongWidth: [0.14, 0.31], crossWidth: [0.12, 0.26],
            sourceRadius: 0.7, curvature: 0.42, overlap: 0.25, activation: 0.76,
        };
        case "hail": return {
            lanes: 4, alongWidth: [0.11, 0.24], crossWidth: [0.1, 0.22],
            sourceRadius: 0.34, curvature: 0.08, overlap: 0.12, activation: 0.72,
        };
        case "ice-pellets": return {
            lanes: 7, alongWidth: [0.2, 0.4], crossWidth: [0.07, 0.16],
            sourceRadius: 0.58, curvature: 0.16, overlap: 0.26, activation: 0.78,
        };
        case "snow-grains": return {
            lanes: 11, alongWidth: [0.24, 0.48], crossWidth: [0.07, 0.15],
            sourceRadius: 0.62, curvature: 0.12, overlap: 0.4, activation: 0.86,
        };
        case "snow-pellets": return {
            lanes: 5, alongWidth: [0.13, 0.28], crossWidth: [0.11, 0.25],
            sourceRadius: 0.46, curvature: 0.24, overlap: 0.2, activation: 0.76,
        };
        default: return {
            lanes: 7, alongWidth: [0.16, 0.34], crossWidth: [0.1, 0.22],
            sourceRadius: 0.56, curvature: 0.2, overlap: 0.25, activation: 0.75,
        };
    }
};

/** Finite source-owned bands/cores for all non-virga precipitation species. */
const hydrometeorPrecipitationTopologyWeight = (
    field: HydrometeorField,
    localAlong: number,
    localCross: number,
    vertical: number,
    timeSeconds: number,
) => {
    const parameters = precipitationTopologyParameters(field.kind);
    const descent = 1 - vertical;
    const stormOwned = field.deepConvection !== undefined;
    const curvatureScale = stormOwned
        ? lerp(0.72, 1.58, clamp(field.morphology.verticalModulation)) : 1;
    const activation = stormOwned
        ? clamp(parameters.activation * lerp(
            0.82,
            1.12,
            clamp(field.morphology.clustering),
        ), 0.42, 0.98)
        : parameters.activation;
    let strongest = 0;
    let accumulated = 0;
    for (let lane = 0; lane < parameters.lanes; lane += 1) {
        const laneNumber = lane + 1;
        const randomA = hydrometeorChannelHash(field.seed + 0.137, laneNumber * 5 + 1);
        const randomB = hydrometeorChannelHash(field.seed + 0.137, laneNumber * 5 + 2);
        const randomC = hydrometeorChannelHash(field.seed + 0.137, laneNumber * 5 + 3);
        const randomD = hydrometeorChannelHash(field.seed + 0.137, laneNumber * 5 + 4);
        if (randomD > activation) continue;
        const angle = randomA * Math.PI * 2;
        const radius = Math.sqrt(randomB) * parameters.sourceRadius;
        const sourceAlong = Math.cos(angle) * radius;
        const sourceCross = Math.sin(angle) * radius;
        const sizeSorting = (randomC - 0.5) * parameters.curvature *
            curvatureScale;
        const flutter = Math.sin(
            descent * Math.PI * lerp(0.7, 1.8, randomB) + randomA * Math.PI * 2,
        ) * sizeSorting * descent ** 1.25;
        const stormShear = stormOwned
            ? (randomB - 0.5) * field.morphology.verticalModulation * 0.22 *
                descent ** 1.65
            : 0;
        const centerAlong = sourceAlong + sizeSorting * 0.28 * descent ** 1.4 +
            stormShear;
        const centerCross = sourceCross + flutter - stormShear * 0.37;
        const alongWidth = lerp(
            parameters.alongWidth[0], parameters.alongWidth[1], randomC,
        );
        const crossWidth = lerp(
            parameters.crossWidth[0], parameters.crossWidth[1], randomB,
        );
        const shower = field.renderClass === "shower";
        const widthScale = shower ? lerp(0.86, 1.18, descent) : lerp(1, 0.82, descent);
        const distance = Math.hypot(
            (localAlong - centerAlong) / Math.max(0.03, alongWidth * widthScale),
            (localCross - centerCross) / Math.max(0.025, crossWidth * widthScale),
        );
        const temporal = lerp(
            1,
            0.72 + 0.28 * (0.5 + 0.5 * Math.sin(
                timeSeconds * lerp(0.025, 0.11, randomC) +
                descent * lerp(2.4, 7.5, randomB) + randomA * Math.PI * 2,
            )),
            field.morphology.temporalIntermittency,
        );
        const laneWeight = hydrometeorCompactC2(distance) *
            lerp(0.55, 1, randomD) * temporal;
        strongest = Math.max(strongest, laneWeight);
        accumulated += laneWeight;
    }
    const sourceEmergence = clamp(descent / 0.045);
    const overlap = stormOwned
        ? parameters.overlap * lerp(0.72, 1.06,
            clamp(field.morphology.clustering))
        : parameters.overlap;
    return clamp((strongest + overlap *
        Math.max(0, Math.min(1, accumulated - strongest))) * sourceEmergence);
};

const surfaceTopologyParameters = (kind: HydrometeorKind) => {
    switch (kind) {
        case "fog": return {
            lobes: 10, horizontal: [0.34, 0.68] as const,
            vertical: [0.3, 0.62] as const, activation: 0.96, overlap: 0.58,
        };
        case "mist": return {
            lobes: 9, horizontal: [0.2, 0.48] as const,
            vertical: [0.2, 0.48] as const, activation: 0.82, overlap: 0.34,
        };
        case "ice-fog": return {
            lobes: 9, horizontal: [0.28, 0.56] as const,
            vertical: [0.24, 0.5] as const, activation: 0.9, overlap: 0.48,
        };
        default: return {
            lobes: 11, horizontal: [0.1, 0.28] as const,
            vertical: [0.1, 0.3] as const, activation: 0.68, overlap: 0.12,
        };
    }
};

/** Connected finite boundary-layer cells; never a uniform altitude slab. */
const hydrometeorSurfaceTopologyWeight = (
    field: HydrometeorField,
    localAlong: number,
    localCross: number,
    vertical: number,
    timeSeconds: number,
) => {
    const parameters = surfaceTopologyParameters(field.kind);
    let strongest = 0;
    let accumulated = 0;
    for (let lobe = 0; lobe < parameters.lobes; lobe += 1) {
        const lobeNumber = lobe + 1;
        const randomA = hydrometeorChannelHash(field.seed + 0.419, lobeNumber * 5 + 1);
        const randomB = hydrometeorChannelHash(field.seed + 0.419, lobeNumber * 5 + 2);
        const randomC = hydrometeorChannelHash(field.seed + 0.419, lobeNumber * 5 + 3);
        const randomD = hydrometeorChannelHash(field.seed + 0.419, lobeNumber * 5 + 4);
        if (randomD > parameters.activation) continue;
        const angle = randomA * Math.PI * 2;
        const radius = Math.sqrt(randomB) * 0.58;
        const centerAlong = Math.cos(angle) * radius;
        const centerCross = Math.sin(angle) * radius;
        // The first two cells are surface-rooted; later cells form soft domes
        // and entrained fragments without creating a continuous top plane.
        const centerVertical = lobe < 2 ? 0
            : lerp(0.12, 0.58, randomC);
        const horizontalWidth = lerp(
            parameters.horizontal[0], parameters.horizontal[1], randomC,
        );
        const verticalWidth = lerp(
            parameters.vertical[0], parameters.vertical[1], randomB,
        );
        const drift = Math.sin(
            timeSeconds * lerp(0.008, 0.026, randomC) + randomA * Math.PI * 2,
        ) * field.morphology.verticalModulation * 0.08;
        const distance = Math.sqrt(
            ((localAlong - centerAlong - drift) / horizontalWidth) ** 2 +
            ((localCross - centerCross + drift * 0.7) /
                (horizontalWidth * lerp(0.72, 1.18, randomA))) ** 2 +
            ((vertical - centerVertical) / verticalWidth) ** 2,
        );
        const cell = hydrometeorCompactC2(distance) * lerp(0.58, 1, randomD);
        strongest = Math.max(strongest, cell);
        accumulated += cell;
    }
    return clamp(strongest + parameters.overlap *
        Math.max(0, Math.min(1, accumulated - strongest)));
};

/** CPU reference for the bounded WGSL field evaluator. */
export function sampleHydrometeorField(
    field: HydrometeorField,
    position: readonly [number, number, number],
    viewDistanceKm: number,
    timeSeconds = 0,
): HydrometeorFieldSample {
    const altitude = position[1];
    const top = field.source.topAltitudeKm;
    const bottom = field.source.bottomAltitudeKm;
    if (altitude < bottom || altitude > top) {
        return {
            sourceWeight: 0,
            extinctionRgbKm: [0, 0, 0],
            liquidFraction: field.phase.liquidFractionAtBottom,
            volumetricEnergyFraction: 0,
            sparseParticleEnergyFraction: 0,
            directIrradianceWeight: 0,
            diffuseIrradianceWeight: 0,
            sourceGlintStrength: 0,
            multipleScatteringBoost: 0,
        };
    }
    const terminal = Math.max(0.05, field.motion.terminalVelocityMps);
    const fallTime = field.renderClass === "surface-bank" ? 0
        : (top - altitude) * 1000 / terminal;
    const centerEast = field.source.centerEastKm +
        field.motion.windEastMps * fallTime / 1000;
    const centerNorth = field.source.centerNorthKm +
        field.motion.windNorthMps * fallTime / 1000;
    const dx = position[0] - centerEast;
    const dz = position[2] - centerNorth;
    const basis = cloudEastAngleBasis(field.source.orientation);
    const vertical = clamp((altitude - bottom) / Math.max(0.001, top - bottom));
    const radiusScale = lerp(field.morphology.radiusScaleAtBottom, 1, vertical);
    const along = (dx * basis.alongEast + dz * basis.alongNorth) /
        (field.source.majorRadiusKm * radiusScale);
    const cross = (dx * basis.crossEast + dz * basis.crossNorth) /
        (field.source.minorRadiusKm * radiusScale);
    const theta = Math.atan2(cross, along);
    const boundary = 1 + field.source.harmonicA * Math.cos(theta * 3 + field.seed * 6.28) +
        field.source.harmonicB * Math.sin(theta * 5 - field.seed * 3.14);
    const radius = Math.hypot(along, cross) / Math.max(0.7, boundary);
    const edge = Math.max(0.01, field.source.boundaryTransitionFraction);
    let sourceWeight = clamp((1 + edge - radius) / (2 * edge));
    if (field.renderClass === "shaft") {
        sourceWeight *= hydrometeorFallstreakChannelWeight(
            field,
            along,
            cross,
            vertical,
        );
    } else if (field.renderClass === "surface-bank") {
        sourceWeight *= hydrometeorSurfaceTopologyWeight(
            field, along, cross, vertical, timeSeconds,
        );
    } else {
        sourceWeight *= hydrometeorPrecipitationTopologyWeight(
            field, along, cross, vertical, timeSeconds,
        );
    }
    let profile = field.renderClass === "surface-bank"
        ? 1 - clamp((vertical - 0.7) / 0.3) ** 2
        : lerp(field.evaporation.surfaceReachFraction, 1,
            vertical ** field.evaporation.profileExponent);
    // A coherent altitude-only sine reads as horizontal banding in a virga
    // shaft. Curved shaft channels already carry their own non-coherent
    // vertical variation, so reserve this profile for curtains/banks/showers.
    const verticalStructure = 1;
    const intermittency = 0.5 + 0.5 * Math.sin(
        timeSeconds * (0.035 + field.morphology.temporalIntermittency * 0.08) +
        field.seed * 53 + vertical * 4.7,
    );
    profile *= Math.max(0.2, verticalStructure) * lerp(1,
        lerp(0.58, 1, intermittency), field.morphology.temporalIntermittency);
    const weight = sourceWeight * profile * field.concentrationScale;
    const resolveDistance = field.rendering.maximumResolvableDistanceKm;
    const sparseMix = resolveDistance <= 0 ? 0
        : clamp((resolveDistance * 1.25 - viewDistanceKm) /
            Math.max(0.001, resolveDistance * 0.65));
    const sparseEnergy = field.rendering.sparseParticleEnergyFraction * sparseMix;
    const volumetricEnergy = 1 - sparseEnergy;
    let liquid = lerp(field.phase.liquidFractionAtBottom,
        field.phase.liquidFractionAtSource, vertical);
    if (field.phase.phasePath === "melt-refreeze") {
        const melt = 1 - clamp((altitude - field.phase.warmLayerBottomKm) /
            Math.max(0.001, field.phase.warmLayerTopKm - field.phase.warmLayerBottomKm));
        const refreeze = 1 - clamp((altitude -
            (field.phase.warmLayerBottomKm - field.phase.refreezingDepthKm)) /
            Math.max(0.001, field.phase.refreezingDepthKm));
        liquid = clamp(melt * (1 - refreeze));
    }
    return {
        sourceWeight: weight,
        extinctionRgbKm: field.optics.extinctionRgbKm.map((value) =>
            value * weight) as [number, number, number],
        liquidFraction: liquid,
        volumetricEnergyFraction: volumetricEnergy,
        sparseParticleEnergyFraction: sparseEnergy,
        directIrradianceWeight: clamp(field.lighting.directIrradianceWeight),
        diffuseIrradianceWeight: clamp(field.lighting.diffuseIrradianceWeight),
        sourceGlintStrength: clamp(field.lighting.sourceGlintStrength),
        multipleScatteringBoost: clamp(field.lighting.multipleScatteringBoost),
    };
}

export interface HydrometeorNearParticleAppearance {
    visible: boolean;
    habit: HydrometeorParticleHabit;
    diameterMm: number;
    exposureTrackLengthM: number;
    orientationRadians: number;
    opticalEnergy: number;
    sourceGlintWeight: number;
    velocityEastAltitudeNorthMps: readonly [number, number, number];
}

/** Deterministic camera-local particle contract for a future sparse draw pass. */
export function sampleHydrometeorNearParticle(
    field: HydrometeorField,
    particleIndex: number,
    viewDistanceKm: number,
    sourceAlignment: number,
): HydrometeorNearParticleAppearance {
    const random = mulberry32(hashText(
        `${field.parentSystemId}:${field.sourceIndex}:${Math.floor(particleIndex)}:${field.seed}`,
    ));
    const logMin = Math.log(Math.max(0.001, field.distribution.minimumDiameterMm));
    const logMax = Math.log(Math.max(field.distribution.minimumDiameterMm,
        field.distribution.maximumDiameterMm));
    const diameterMm = Math.exp(lerp(logMin, logMax,
        (random() + random() + random()) / 3));
    const resolveDistance = field.rendering.maximumResolvableDistanceKm;
    const visible = resolveDistance > 0 && viewDistanceKm <= resolveDistance * 1.25;
    const alignment = clamp((sourceAlignment + 1) * 0.5);
    const glintOffset = (1 - alignment) /
        Math.max(0.015, field.particle.orientationDispersion * 0.35);
    const glintLobe = Math.exp(-(glintOffset ** 2));
    return {
        visible,
        habit: field.particle.habit,
        diameterMm,
        exposureTrackLengthM: Math.max(diameterMm * 1e-3,
            field.rendering.exposureTrackLengthM),
        orientationRadians: (random() - 0.5) * Math.PI *
            field.particle.orientationDispersion,
        opticalEnergy: visible ? field.rendering.sparseParticleEnergyFraction : 0,
        sourceGlintWeight: visible
            ? clamp(field.lighting.sourceGlintStrength) * glintLobe : 0,
        velocityEastAltitudeNorthMps: [
            field.motion.windEastMps,
            -field.motion.terminalVelocityMps,
            field.motion.windNorthMps,
        ],
    };
}

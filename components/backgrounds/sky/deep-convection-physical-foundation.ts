/**
 * Renderer-independent physical foundation for Cumulonimbus systems.
 *
 * Coordinates use a storm-relative frame in kilometres:
 *   x = downwind, y = altitude above ground, z = crosswind.
 *
 * This module deliberately describes coherent finite storm systems rather than
 * screen-space masks or texture recipes. A later serial integration can turn
 * the topology, thermodynamic boundaries, microphysics, and phenomenon source
 * contracts into density and radiance without losing physical ownership.
 */

export const DEEP_CONVECTION_SPECIES = ["calvus", "capillatus"] as const;
export type DeepConvectionSpecies = (typeof DEEP_CONVECTION_SPECIES)[number];

export const DEEP_CONVECTION_LIFECYCLE_STAGES = [
    "developing",
    "mature",
    "precipitating",
    "decaying",
] as const;
export type DeepConvectionLifecycleStage =
    (typeof DEEP_CONVECTION_LIFECYCLE_STAGES)[number];

export const DEEP_CONVECTION_ORGANIZATIONS = [
    "pulse-cell",
    "multicell-cluster",
    "supercell",
    "squall-line",
] as const;
export type DeepConvectionOrganization =
    (typeof DEEP_CONVECTION_ORGANIZATIONS)[number];

export const DEEP_CONVECTION_FEATURES = [
    "incus",
    "arcus",
    "murus",
    "cauda",
    "tuba",
    "mamma",
    "pileus",
    "velum",
    "flumen",
    "pannus",
] as const;
export type DeepConvectionFeature =
    (typeof DEEP_CONVECTION_FEATURES)[number];

export const DEEP_CONVECTION_PHENOMENA = [
    "rain",
    "hail",
    "virga",
    "lightning",
] as const;
export type DeepConvectionPhenomenon =
    (typeof DEEP_CONVECTION_PHENOMENA)[number];

export type DeepConvectionVec3Km = readonly [
    downwindKm: number,
    altitudeKm: number,
    crosswindKm: number,
];

export interface DeepConvectionSpeciesDescriptor {
    readonly species: DeepConvectionSpecies;
    readonly wmoAbbreviation: string;
    readonly wmoDefinition: string;
    readonly wmoSource: string;
    readonly requiredMorphology: readonly string[];
    readonly forbiddenMorphology: readonly string[];
    readonly glaciationRange01: readonly [number, number];
    readonly permitsIncus: boolean;
}

export const DEEP_CONVECTION_SPECIES_DESCRIPTORS = {
    calvus: {
        species: "calvus",
        wmoAbbreviation: "Cb cal",
        wmoDefinition: "Cumulonimbus whose upper sproutings are becoming indistinct and smooth, without fibrous or striated parts.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-species-calvus.html",
        requiredMorphology: [
            "one attached deep convective tower",
            "rounded but multi-scale upper sproutings",
            "softening glaciation transition at the crown",
            "flat or ragged physically owned cloud base",
        ],
        forbiddenMorphology: [
            "fibrous anvil",
            "detached mushroom cap",
            "stacked oval lobes",
            "screen-space precipitation patch",
        ],
        glaciationRange01: [0, 0.5],
        permitsIncus: false,
    },
    capillatus: {
        species: "capillatus",
        wmoAbbreviation: "Cb cap",
        wmoDefinition: "Cumulonimbus with clearly fibrous or striated cirriform upper portions, often spreading into an anvil, plume, or hair-like mass.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cumulonimbus-capillatus-cb-cap.html",
        requiredMorphology: [
            "liquid tower continuously joined to a glaciated crown",
            "fibrous upper outflow",
            "shear-aligned asymmetric detrainment",
            "multi-scale turbulent perimeter",
        ],
        forbiddenMorphology: [
            "binary liquid-to-ice seam",
            "detached anvil plate",
            "radially symmetric anvil under shear",
            "uniform ellipsoid tower",
        ],
        glaciationRange01: [0.36, 1],
        permitsIncus: true,
    },
} as const satisfies Record<DeepConvectionSpecies, DeepConvectionSpeciesDescriptor>;

export interface DeepConvectionLifecycleDescriptor {
    readonly stage: DeepConvectionLifecycleStage;
    readonly progressRange01: readonly [number, number];
    readonly definingFlow: string;
    readonly requiredState: readonly string[];
    readonly forbiddenState: readonly string[];
    readonly noaaSource: string;
}

export const DEEP_CONVECTION_LIFECYCLE_DESCRIPTORS = {
    developing: {
        stage: "developing",
        progressRange01: [0, 0.3],
        definingFlow: "updraft-dominant growth",
        requiredState: ["continuous surface-fed updraft", "attached growing turrets"],
        forbiddenState: ["dominant downdraft", "broad precipitation curtain", "remnant-only anvil"],
        noaaSource: "https://www.weather.gov/spotterguide/life",
    },
    mature: {
        stage: "mature",
        progressRange01: [0.3, 0.55],
        definingFlow: "coexisting organized updraft and nascent downdraft",
        requiredState: ["persistent inflow", "deep mixed-phase core", "early precipitation loading"],
        forbiddenState: ["downdraft-only tower", "detached upper cloud"],
        noaaSource: "https://www.weather.gov/spotterguide/life",
    },
    precipitating: {
        stage: "precipitating",
        progressRange01: [0.55, 0.82],
        definingFlow: "coexisting updraft, precipitation-driven downdraft, and cold-pool outflow",
        requiredState: ["owned precipitation core", "downdraft", "finite cold pool"],
        forbiddenState: ["rain detached from condensate source", "gust front without downdraft"],
        noaaSource: "https://www.weather.gov/spotterguide/life",
    },
    decaying: {
        stage: "decaying",
        progressRange01: [0.82, 1],
        definingFlow: "downdraft-dominant decay with a possible glaciated anvil remnant",
        requiredState: ["weakening lower liquid core", "outflow separated from lost inflow", "eroding remnant condensate"],
        forbiddenState: ["strong continuous surface-fed updraft", "new pileus over dead turret"],
        noaaSource: "https://www.weather.gov/spotterguide/life",
    },
} as const satisfies Record<
    DeepConvectionLifecycleStage,
    DeepConvectionLifecycleDescriptor
>;

export const DEEP_CONVECTION_ENVIRONMENT_IDS = [
    "tropical-humid-pulse",
    "continental-sheared-supercell",
    "maritime-multicell",
    "dry-high-base-convection",
    "cool-season-squall-line",
] as const;
export type DeepConvectionEnvironmentId =
    (typeof DEEP_CONVECTION_ENVIRONMENT_IDS)[number];

export interface DeepConvectionEnvironment {
    readonly id: DeepConvectionEnvironmentId;
    readonly label: string;
    readonly surfaceTemperatureKelvin: number;
    readonly environmentalLapseRateKelvinPerKm: number;
    readonly cloudBaseKm: number;
    readonly freezingLevelKm: number;
    readonly equilibriumLevelKm: number;
    readonly tropopauseKm: number;
    readonly capeJoulesPerKilogram: number;
    readonly deepLayerShearMetresPerSecond: number;
    readonly stormRelativeInflowMetresPerSecond: number;
    readonly lowLevelWindDirectionDegrees: number;
    readonly anvilLevelWindDirectionDegrees: number;
    readonly anvilLevelWindMetresPerSecond: number;
    readonly subcloudRelativeHumidity01: number;
    readonly midlevelRelativeHumidity01: number;
    readonly upperRelativeHumidity01: number;
    readonly precipitationEfficiency01: number;
    readonly lowLevelRotation01: number;
}

export const DEEP_CONVECTION_ENVIRONMENTS = {
    "tropical-humid-pulse": {
        id: "tropical-humid-pulse",
        label: "Tropical humid pulse convection",
        surfaceTemperatureKelvin: 303,
        environmentalLapseRateKelvinPerKm: 6.1,
        cloudBaseKm: 0.65,
        freezingLevelKm: 4.8,
        equilibriumLevelKm: 16,
        tropopauseKm: 16.5,
        capeJoulesPerKilogram: 3200,
        deepLayerShearMetresPerSecond: 8,
        stormRelativeInflowMetresPerSecond: 14,
        lowLevelWindDirectionDegrees: 95,
        anvilLevelWindDirectionDegrees: 115,
        anvilLevelWindMetresPerSecond: 14,
        subcloudRelativeHumidity01: 0.86,
        midlevelRelativeHumidity01: 0.78,
        upperRelativeHumidity01: 0.7,
        precipitationEfficiency01: 0.92,
        lowLevelRotation01: 0.18,
    },
    "continental-sheared-supercell": {
        id: "continental-sheared-supercell",
        label: "Continental high-CAPE sheared supercell",
        surfaceTemperatureKelvin: 301,
        environmentalLapseRateKelvinPerKm: 6.8,
        cloudBaseKm: 1.45,
        freezingLevelKm: 4.15,
        equilibriumLevelKm: 14.8,
        tropopauseKm: 12.8,
        capeJoulesPerKilogram: 3600,
        deepLayerShearMetresPerSecond: 32,
        stormRelativeInflowMetresPerSecond: 25,
        lowLevelWindDirectionDegrees: 155,
        anvilLevelWindDirectionDegrees: 245,
        anvilLevelWindMetresPerSecond: 38,
        subcloudRelativeHumidity01: 0.7,
        midlevelRelativeHumidity01: 0.64,
        upperRelativeHumidity01: 0.55,
        precipitationEfficiency01: 0.67,
        lowLevelRotation01: 0.9,
    },
    "maritime-multicell": {
        id: "maritime-multicell",
        label: "Warm maritime multicell cluster",
        surfaceTemperatureKelvin: 299,
        environmentalLapseRateKelvinPerKm: 6,
        cloudBaseKm: 0.5,
        freezingLevelKm: 4.3,
        equilibriumLevelKm: 12.7,
        tropopauseKm: 15.2,
        capeJoulesPerKilogram: 1850,
        deepLayerShearMetresPerSecond: 15,
        stormRelativeInflowMetresPerSecond: 17,
        lowLevelWindDirectionDegrees: 110,
        anvilLevelWindDirectionDegrees: 145,
        anvilLevelWindMetresPerSecond: 24,
        subcloudRelativeHumidity01: 0.92,
        midlevelRelativeHumidity01: 0.86,
        upperRelativeHumidity01: 0.76,
        precipitationEfficiency01: 0.96,
        lowLevelRotation01: 0.28,
    },
    "dry-high-base-convection": {
        id: "dry-high-base-convection",
        label: "Dry continental high-base convection",
        surfaceTemperatureKelvin: 306,
        environmentalLapseRateKelvinPerKm: 7.4,
        cloudBaseKm: 2.8,
        freezingLevelKm: 4.55,
        equilibriumLevelKm: 13.4,
        tropopauseKm: 13.1,
        capeJoulesPerKilogram: 2250,
        deepLayerShearMetresPerSecond: 21,
        stormRelativeInflowMetresPerSecond: 18,
        lowLevelWindDirectionDegrees: 190,
        anvilLevelWindDirectionDegrees: 235,
        anvilLevelWindMetresPerSecond: 31,
        subcloudRelativeHumidity01: 0.29,
        midlevelRelativeHumidity01: 0.47,
        upperRelativeHumidity01: 0.48,
        precipitationEfficiency01: 0.43,
        lowLevelRotation01: 0.46,
    },
    "cool-season-squall-line": {
        id: "cool-season-squall-line",
        label: "Cool-season strongly sheared squall line",
        surfaceTemperatureKelvin: 289,
        environmentalLapseRateKelvinPerKm: 6.4,
        cloudBaseKm: 1.05,
        freezingLevelKm: 2.35,
        equilibriumLevelKm: 9.4,
        tropopauseKm: 10.6,
        capeJoulesPerKilogram: 950,
        deepLayerShearMetresPerSecond: 29,
        stormRelativeInflowMetresPerSecond: 16,
        lowLevelWindDirectionDegrees: 175,
        anvilLevelWindDirectionDegrees: 245,
        anvilLevelWindMetresPerSecond: 36,
        subcloudRelativeHumidity01: 0.77,
        midlevelRelativeHumidity01: 0.72,
        upperRelativeHumidity01: 0.62,
        precipitationEfficiency01: 0.82,
        lowLevelRotation01: 0.34,
    },
} as const satisfies Record<DeepConvectionEnvironmentId, DeepConvectionEnvironment>;

export interface CreateDeepConvectionDescriptorInput {
    readonly environment: DeepConvectionEnvironmentId | DeepConvectionEnvironment;
    readonly lifecycleStage: DeepConvectionLifecycleStage;
    /** Progress within the named stage, not across the complete lifecycle. */
    readonly stageProgress01?: number;
    readonly species?: DeepConvectionSpecies;
    readonly organization?: DeepConvectionOrganization;
    readonly intensity01?: number;
    readonly seed?: number;
    /** Null/omitted means deterministic natural incidence; an array is explicit art direction. */
    readonly requestedFeatures?: readonly DeepConvectionFeature[] | null;
}

export interface DeepConvectionSystemBoundary {
    readonly representation:
        | "advected-thermal-union"
        | "rotating-thermal-union"
        | "multicell-cascade"
        | "line-convective-manifold";
    readonly closure: "finite-closed-condensate-support";
    readonly condensateIsosurfaceGramsPerKilogram: number;
    readonly interfaceThicknessKm: readonly [minimum: number, maximum: number];
    readonly entrainmentScallopScaleKm: readonly [minimum: number, maximum: number];
    readonly turbulentErosionScaleKm: readonly [minimum: number, maximum: number];
    readonly thermalLobeCount: number;
    readonly horizontalBoundsKm: readonly [
        minimumDownwind: number,
        maximumDownwind: number,
        minimumCrosswind: number,
        maximumCrosswind: number,
    ];
    readonly verticalBoundsKm: readonly [minimumAltitude: number, maximumAltitude: number];
    readonly boundaryProcesses: readonly (
        | "entrainment"
        | "detrainment"
        | "evaporation"
        | "sublimation"
        | "precipitation-loading"
        | "shear-stretching"
    )[];
}

export interface DeepConvectionDescriptor {
    readonly id: string;
    readonly seed: number;
    readonly environment: DeepConvectionEnvironment;
    readonly lifecycleStage: DeepConvectionLifecycleStage;
    readonly lifecycleProgress01: number;
    readonly species: DeepConvectionSpecies;
    readonly organization: DeepConvectionOrganization;
    readonly intensity01: number;
    readonly requestedFeatures: readonly DeepConvectionFeature[] | null;
    readonly cloudBaseKm: number;
    readonly liquidCoreTopKm: number;
    readonly mixedPhaseBottomKm: number;
    readonly mixedPhaseTopKm: number;
    readonly equilibriumLevelKm: number;
    readonly cloudTopKm: number;
    readonly glaciation01: number;
    readonly updraftStrength01: number;
    readonly updraftMetresPerSecond: number;
    readonly downdraftStrength01: number;
    readonly downdraftMetresPerSecond: number;
    readonly precipitationStrength01: number;
    readonly coldPoolStrength01: number;
    readonly anvilStrength01: number;
    readonly overshootHeightKm: number;
    readonly coreRadiusKm: number;
    readonly anvilDownwindExtentKm: number;
    readonly anvilUpwindExtentKm: number;
    readonly anvilCrosswindExtentKm: number;
    readonly systemBoundary: DeepConvectionSystemBoundary;
}

const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smoothstep = (edge0: number, edge1: number, value: number) => {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const amount = clamp01((value - edge0) / (edge1 - edge0));
    return amount * amount * (3 - 2 * amount);
};
const bell = (value: number, centre: number, halfWidth: number) => {
    const normalized = Math.abs(value - centre) / Math.max(halfWidth, 1e-6);
    return 1 - smoothstep(0, 1, normalized);
};
const round = (value: number, precision = 1e6) =>
    Math.round(value * precision) / precision;
const hash01 = (seed: number, salt: number) => {
    const value = Math.sin((Math.trunc(seed) + 1) * 12.9898 + salt * 78.233) *
        43758.5453123;
    return value - Math.floor(value);
};

const lifecycleProgress = (
    stage: DeepConvectionLifecycleStage,
    stageProgress01 = 0.5,
) => {
    const range = DEEP_CONVECTION_LIFECYCLE_DESCRIPTORS[stage].progressRange01;
    return mix(range[0], range[1], clamp01(stageProgress01));
};

export const deepConvectionStageAtProgress = (
    lifecycleProgress01: number,
): DeepConvectionLifecycleStage => {
    const progress = clamp01(lifecycleProgress01);
    if (progress < 0.3) return "developing";
    if (progress < 0.55) return "mature";
    if (progress < 0.82) return "precipitating";
    return "decaying";
};

const defaultOrganization = (
    environment: DeepConvectionEnvironment,
): DeepConvectionOrganization => {
    if (environment.id === "continental-sheared-supercell") return "supercell";
    if (environment.id === "maritime-multicell") return "multicell-cluster";
    if (environment.id === "cool-season-squall-line") return "squall-line";
    return "pulse-cell";
};

const boundaryRepresentation = (
    organization: DeepConvectionOrganization,
): DeepConvectionSystemBoundary["representation"] => {
    if (organization === "supercell") return "rotating-thermal-union";
    if (organization === "multicell-cluster") return "multicell-cascade";
    if (organization === "squall-line") return "line-convective-manifold";
    return "advected-thermal-union";
};

export const createDeepConvectionDescriptor = (
    input: CreateDeepConvectionDescriptorInput,
): DeepConvectionDescriptor => {
    const environment = typeof input.environment === "string"
        ? DEEP_CONVECTION_ENVIRONMENTS[input.environment]
        : input.environment;
    const seed = Math.trunc(input.seed ?? 1);
    const progress = lifecycleProgress(input.lifecycleStage, input.stageProgress01);
    const intensity = clamp01(input.intensity01 ?? 0.78);
    const organization = input.organization ?? defaultOrganization(environment);

    const growth = smoothstep(0.015, 0.26, progress) *
        (1 - 0.88 * smoothstep(0.69, 1, progress));
    const precipitation = clamp01(
        intensity * smoothstep(0.34, 0.6, progress) *
        (1 - 0.58 * smoothstep(0.86, 1, progress)) *
        (0.5 + 0.5 * environment.precipitationEfficiency01),
    );
    const downdraft = clamp01(
        smoothstep(0.39, 0.64, progress) *
        (1 - 0.3 * smoothstep(0.92, 1, progress)) *
        (0.35 + precipitation * 0.65),
    );
    const updraftStrength = clamp01(
        intensity * growth *
        (0.58 + environment.capeJoulesPerKilogram / 8500) *
        (organization === "supercell" ? 1.13 : 1),
    );
    const coldPoolStrength = clamp01(
        precipitation * downdraft *
        (1.15 - environment.subcloudRelativeHumidity01 * 0.28),
    );
    const naturalGlaciation = clamp01(
        smoothstep(0.18, 0.58, progress) * (0.58 + intensity * 0.48),
    );
    const species = input.species ??
        (naturalGlaciation >= 0.36 ? "capillatus" : "calvus");
    const speciesGlaciation = species === "calvus"
        ? Math.min(naturalGlaciation, 0.49)
        : Math.max(naturalGlaciation, 0.38);
    const glaciation = clamp01(speciesGlaciation);
    const anvilStrength = species === "capillatus"
        ? clamp01(
            smoothstep(0.28, 0.66, progress) *
            (0.42 + glaciation * 0.58) *
            (1 - 0.08 * smoothstep(0.96, 1, progress)),
        )
        : clamp01(naturalGlaciation * 0.18);

    const idealUpdraft = Math.sqrt(Math.max(0,
        2 * environment.capeJoulesPerKilogram));
    const updraftMetresPerSecond = idealUpdraft * 0.5 * updraftStrength;
    const downdraftMetresPerSecond = downdraft * mix(
        8,
        30,
        clamp01(precipitation * 0.7 + (1 - environment.midlevelRelativeHumidity01) * 0.3),
    );
    const potentialDepth = environment.equilibriumLevelKm - environment.cloudBaseKm;
    const developingDepthFraction = mix(0.28, 0.98,
        smoothstep(0.02, 0.47, progress));
    const liveCoreFraction = developingDepthFraction *
        (1 - 0.43 * smoothstep(0.82, 1, progress));
    const liquidCoreTopKm = clamp(
        environment.cloudBaseKm + potentialDepth * liveCoreFraction,
        environment.cloudBaseKm + 1.2,
        environment.equilibriumLevelKm,
    );
    const overshootHeightKm = updraftStrength > 0.64 &&
        progress > 0.31 && progress < 0.84
        ? clamp(
            (updraftStrength - 0.64) * 4.4 + hash01(seed, 7) * 0.28,
            0.08,
            2.2,
        )
        : 0;
    const cloudTopKm = Math.max(
        liquidCoreTopKm + overshootHeightKm,
        anvilStrength > 0.16
            ? environment.equilibriumLevelKm + overshootHeightKm * 0.35
            : liquidCoreTopKm,
    );

    const coreRadiusFactor = organization === "pulse-cell" ? 0.8
        : organization === "multicell-cluster" ? 1.22
            : organization === "supercell" ? 1.12 : 1.5;
    const coreRadiusKm = mix(1.2, 4.2, intensity) * coreRadiusFactor *
        mix(0.78, 1.18, hash01(seed, 2));
    const shear01 = clamp01(environment.deepLayerShearMetresPerSecond / 38);
    const anvilDownwindExtentKm = anvilStrength * mix(
        7,
        58,
        clamp01(shear01 * 0.72 + environment.anvilLevelWindMetresPerSecond / 110),
    ) * mix(0.88, 1.15, hash01(seed, 3));
    const anvilUpwindExtentKm = anvilStrength * mix(
        coreRadiusKm * 0.45,
        coreRadiusKm * 2.1,
        clamp01((updraftStrength - 0.55) * 1.8),
    );
    const organizationWidth = organization === "squall-line" ? 4.5
        : organization === "multicell-cluster" ? 2.4
            : organization === "supercell" ? 1.55 : 1;
    const anvilCrosswindExtentKm = anvilStrength * coreRadiusKm *
        mix(1.7, 3.8, shear01) * organizationWidth;
    const coldPoolEnvelopeRadius = coldPoolStrength > 0.08
        ? coreRadiusKm * mix(1.5, 4.8, coldPoolStrength) : 0;
    const downwindMinimum = -Math.max(coreRadiusKm * 2.2, anvilUpwindExtentKm);
    const downwindMaximum = Math.max(
        coreRadiusKm * 2.4,
        anvilDownwindExtentKm + coreRadiusKm,
        coldPoolEnvelopeRadius > 0
            ? coreRadiusKm * 1.45 + coldPoolEnvelopeRadius : 0,
    );
    const crosswindExtent = Math.max(
        coreRadiusKm * organizationWidth * 1.8,
        anvilCrosswindExtentKm,
        coldPoolEnvelopeRadius * organizationWidth,
    );

    const systemBoundary: DeepConvectionSystemBoundary = {
        representation: boundaryRepresentation(organization),
        closure: "finite-closed-condensate-support",
        condensateIsosurfaceGramsPerKilogram: round(mix(0.025, 0.09,
            1 - environment.midlevelRelativeHumidity01)),
        interfaceThicknessKm: [
            round(mix(0.045, 0.12, intensity)),
            round(mix(0.28, 0.92, 1 - environment.midlevelRelativeHumidity01)),
        ],
        entrainmentScallopScaleKm: [
            round(coreRadiusKm * 0.035),
            round(coreRadiusKm * 0.32),
        ],
        turbulentErosionScaleKm: [
            round(coreRadiusKm * 0.018),
            round(coreRadiusKm * mix(0.16, 0.48, 1 - environment.midlevelRelativeHumidity01)),
        ],
        thermalLobeCount: Math.max(5, Math.round(
            mix(8, 18, intensity) *
            (organization === "multicell-cluster" ? 1.8 :
                organization === "squall-line" ? 2.3 : 1),
        )),
        horizontalBoundsKm: [
            round(downwindMinimum),
            round(downwindMaximum),
            round(-crosswindExtent),
            round(crosswindExtent),
        ],
        verticalBoundsKm: [0, round(cloudTopKm)],
        boundaryProcesses: [
            "entrainment",
            "detrainment",
            progress > 0.75 ? "sublimation" : "evaporation",
            ...(precipitation > 0.15 ? ["precipitation-loading" as const] : []),
            ...(shear01 > 0.28 ? ["shear-stretching" as const] : []),
        ],
    };

    const mixedPhaseBottomKm = clamp(
        environment.freezingLevelKm - mix(0.15, 0.65, updraftStrength),
        environment.cloudBaseKm,
        liquidCoreTopKm,
    );
    const mixedPhaseTopKm = clamp(
        environment.freezingLevelKm + mix(2.7, 5.8, glaciation),
        mixedPhaseBottomKm + 0.8,
        Math.max(mixedPhaseBottomKm + 0.8, cloudTopKm),
    );

    return {
        id: [environment.id, organization, species, input.lifecycleStage,
            String(seed)].join(":"),
        seed,
        environment,
        lifecycleStage: input.lifecycleStage,
        lifecycleProgress01: round(progress),
        species,
        organization,
        intensity01: round(intensity),
        requestedFeatures: input.requestedFeatures === undefined ||
            input.requestedFeatures === null
            ? null
            : [...new Set(input.requestedFeatures)],
        cloudBaseKm: round(environment.cloudBaseKm),
        liquidCoreTopKm: round(liquidCoreTopKm),
        mixedPhaseBottomKm: round(mixedPhaseBottomKm),
        mixedPhaseTopKm: round(mixedPhaseTopKm),
        equilibriumLevelKm: round(environment.equilibriumLevelKm),
        cloudTopKm: round(cloudTopKm),
        glaciation01: round(glaciation),
        updraftStrength01: round(updraftStrength),
        updraftMetresPerSecond: round(updraftMetresPerSecond),
        downdraftStrength01: round(downdraft),
        downdraftMetresPerSecond: round(downdraftMetresPerSecond),
        precipitationStrength01: round(precipitation),
        coldPoolStrength01: round(coldPoolStrength),
        anvilStrength01: round(anvilStrength),
        overshootHeightKm: round(overshootHeightKm),
        coreRadiusKm: round(coreRadiusKm),
        anvilDownwindExtentKm: round(anvilDownwindExtentKm),
        anvilUpwindExtentKm: round(anvilUpwindExtentKm),
        anvilCrosswindExtentKm: round(anvilCrosswindExtentKm),
        systemBoundary,
    };
};

export const DEEP_CONVECTION_TOPOLOGY_REGION_IDS = [
    "storm-system",
    "inflow-stream",
    "rain-free-base",
    "liquid-updraft-core",
    "mixed-phase-core",
    "upper-turret-crown",
    "ice-crown",
    "overshooting-top",
    "anvil-outflow",
    "precipitation-core",
    "downdraft-core",
    "cold-pool",
    "gust-front",
] as const;
export type DeepConvectionTopologyRegionId =
    (typeof DEEP_CONVECTION_TOPOLOGY_REGION_IDS)[number];

export type DeepConvectionRegionShape =
    | "finite-system-envelope"
    | "swept-inflow-band"
    | "rain-free-base-disk"
    | "tapered-thermal-column"
    | "interlocking-thermal-cluster"
    | "cauliflower-turret-union"
    | "glaciated-fibrous-crown"
    | "buoyant-dome"
    | "shear-detrained-sheet"
    | "precipitation-curtain"
    | "descending-plume"
    | "spreading-density-current"
    | "lifting-wedge";

export type DeepConvectionPhaseSupport =
    | "airflow"
    | "warm-liquid"
    | "supercooled-liquid"
    | "mixed-phase"
    | "ice"
    | "precipitation"
    | "rain-cooled-air";

export interface DeepConvectionTopologyRegion {
    readonly id: DeepConvectionTopologyRegionId;
    readonly parentId: DeepConvectionTopologyRegionId | null;
    readonly shape: DeepConvectionRegionShape;
    readonly centreKm: DeepConvectionVec3Km;
    readonly halfExtentsKm: DeepConvectionVec3Km;
    readonly strength01: number;
    readonly phaseSupport: DeepConvectionPhaseSupport;
    readonly motionMetresPerSecond: DeepConvectionVec3Km;
    readonly boundaryInterfaceKm: readonly [minimum: number, maximum: number];
}

export interface DeepConvectionAttachmentPath {
    readonly id: string;
    readonly from: DeepConvectionTopologyRegionId;
    readonly to: DeepConvectionTopologyRegionId;
    readonly kind:
        | "mass-continuity"
        | "phase-transition"
        | "detrainment"
        | "precipitation-fallout"
        | "outflow-spreading"
        | "inflow-feeding";
    readonly controlPointsKm: readonly DeepConvectionVec3Km[];
    readonly strength01: number;
}

export interface DeepConvectionTopology {
    readonly coordinateConvention: "x-downwind-y-altitude-z-crosswind-km";
    readonly regions: readonly DeepConvectionTopologyRegion[];
    readonly attachmentPaths: readonly DeepConvectionAttachmentPath[];
}

const topologyRegion = (
    descriptor: DeepConvectionDescriptor,
    region: Omit<DeepConvectionTopologyRegion, "boundaryInterfaceKm">,
): DeepConvectionTopologyRegion => ({
    ...region,
    centreKm: region.centreKm.map((value) => round(value)) as unknown as
        DeepConvectionVec3Km,
    halfExtentsKm: region.halfExtentsKm.map((value) => round(Math.max(0.001,
        value))) as unknown as DeepConvectionVec3Km,
    strength01: round(clamp01(region.strength01)),
    motionMetresPerSecond: region.motionMetresPerSecond.map((value) =>
        round(value)) as unknown as DeepConvectionVec3Km,
    boundaryInterfaceKm: descriptor.systemBoundary.interfaceThicknessKm,
});

/**
 * Produces a connected storm graph. Every active child has an active owner;
 * no cloud piece is emitted merely to decorate screen space.
 */
export const resolveDeepConvectionTopology = (
    descriptor: DeepConvectionDescriptor,
): DeepConvectionTopology => {
    const boundary = descriptor.systemBoundary;
    const [minimumDownwind, maximumDownwind, minimumCrosswind,
        maximumCrosswind] = boundary.horizontalBoundsKm;
    const [minimumAltitude, maximumAltitude] = boundary.verticalBoundsKm;
    const base = descriptor.cloudBaseKm;
    const radius = descriptor.coreRadiusKm;
    const shear01 = clamp01(
        descriptor.environment.deepLayerShearMetresPerSecond / 38,
    );
    const lineWidth = descriptor.organization === "squall-line" ? 3.8
        : descriptor.organization === "multicell-cluster" ? 2.1 : 1;
    const root = topologyRegion(descriptor, {
        id: "storm-system",
        parentId: null,
        shape: "finite-system-envelope",
        centreKm: [
            (minimumDownwind + maximumDownwind) * 0.5,
            (minimumAltitude + maximumAltitude) * 0.5,
            (minimumCrosswind + maximumCrosswind) * 0.5,
        ],
        halfExtentsKm: [
            (maximumDownwind - minimumDownwind) * 0.5,
            (maximumAltitude - minimumAltitude) * 0.5,
            (maximumCrosswind - minimumCrosswind) * 0.5,
        ],
        strength01: 1,
        phaseSupport: "airflow",
        motionMetresPerSecond: [
            descriptor.environment.anvilLevelWindMetresPerSecond * 0.32,
            0,
            0,
        ],
    });
    const regions: DeepConvectionTopologyRegion[] = [root];

    const add = (
        active: boolean,
        region: Omit<DeepConvectionTopologyRegion, "boundaryInterfaceKm">,
    ) => {
        if (active) regions.push(topologyRegion(descriptor, region));
    };

    add(descriptor.updraftStrength01 > 0.08 &&
        descriptor.lifecycleStage !== "decaying", {
        id: "inflow-stream",
        parentId: "storm-system",
        shape: "swept-inflow-band",
        centreKm: [-radius * 2.4, base * 0.58, radius * 0.65],
        halfExtentsKm: [radius * 2.6, Math.max(0.18, base * 0.48), radius * 0.65],
        strength01: descriptor.updraftStrength01,
        phaseSupport: "airflow",
        motionMetresPerSecond: [
            descriptor.environment.stormRelativeInflowMetresPerSecond,
            descriptor.updraftMetresPerSecond * 0.04,
            -descriptor.environment.stormRelativeInflowMetresPerSecond * 0.12,
        ],
    });
    add(descriptor.updraftStrength01 > 0.12 &&
        descriptor.lifecycleStage !== "decaying", {
        id: "rain-free-base",
        parentId: "storm-system",
        shape: "rain-free-base-disk",
        centreKm: [-radius * 0.22, base, 0],
        halfExtentsKm: [radius * 1.15, Math.max(0.08, radius * 0.08),
            radius * lineWidth],
        strength01: descriptor.updraftStrength01,
        phaseSupport: "warm-liquid",
        motionMetresPerSecond: [0, descriptor.updraftMetresPerSecond * 0.16, 0],
    });
    add(descriptor.updraftStrength01 > 0.035, {
        id: "liquid-updraft-core",
        parentId: "storm-system",
        shape: "tapered-thermal-column",
        centreKm: [
            -shear01 * radius * 0.3,
            (base + descriptor.liquidCoreTopKm) * 0.5,
            0,
        ],
        halfExtentsKm: [
            radius,
            Math.max(0.3, (descriptor.liquidCoreTopKm - base) * 0.5),
            radius * lineWidth,
        ],
        strength01: descriptor.updraftStrength01,
        phaseSupport: "warm-liquid",
        motionMetresPerSecond: [
            descriptor.environment.deepLayerShearMetresPerSecond * 0.08,
            descriptor.updraftMetresPerSecond,
            0,
        ],
    });
    add(descriptor.cloudTopKm > descriptor.mixedPhaseBottomKm + 0.3 &&
        descriptor.updraftStrength01 > 0.035, {
        id: "mixed-phase-core",
        parentId: "liquid-updraft-core",
        shape: "interlocking-thermal-cluster",
        centreKm: [
            shear01 * radius * 0.22,
            (descriptor.mixedPhaseBottomKm + descriptor.mixedPhaseTopKm) * 0.5,
            0,
        ],
        halfExtentsKm: [
            radius * 1.05,
            Math.max(0.35,
                (descriptor.mixedPhaseTopKm - descriptor.mixedPhaseBottomKm) * 0.5),
            radius * lineWidth,
        ],
        strength01: Math.max(descriptor.updraftStrength01 * 0.72,
            descriptor.glaciation01 * 0.45),
        phaseSupport: "mixed-phase",
        motionMetresPerSecond: [
            descriptor.environment.deepLayerShearMetresPerSecond * 0.18,
            descriptor.updraftMetresPerSecond * 0.76,
            0,
        ],
    });
    add(descriptor.updraftStrength01 > 0.035, {
        id: "upper-turret-crown",
        parentId: regions.some(({ id }) => id === "mixed-phase-core")
            ? "mixed-phase-core" : "liquid-updraft-core",
        shape: "cauliflower-turret-union",
        centreKm: [
            shear01 * radius * 0.42,
            Math.max(base + 0.6, descriptor.liquidCoreTopKm - radius * 0.5),
            0,
        ],
        halfExtentsKm: [radius * 1.3, radius * 0.9, radius * lineWidth * 1.12],
        strength01: descriptor.updraftStrength01,
        phaseSupport: descriptor.species === "capillatus"
            ? "mixed-phase" : "supercooled-liquid",
        motionMetresPerSecond: [
            descriptor.environment.deepLayerShearMetresPerSecond * 0.32,
            descriptor.updraftMetresPerSecond * 0.66,
            0,
        ],
    });
    add(descriptor.species === "capillatus" && descriptor.glaciation01 >= 0.36, {
        id: "ice-crown",
        parentId: "upper-turret-crown",
        shape: "glaciated-fibrous-crown",
        centreKm: [
            shear01 * radius * 0.72,
            Math.min(descriptor.cloudTopKm,
                Math.max(descriptor.mixedPhaseTopKm, descriptor.equilibriumLevelKm - radius)),
            0,
        ],
        halfExtentsKm: [radius * 1.45, radius * 0.8,
            radius * lineWidth * 1.3],
        strength01: descriptor.glaciation01,
        phaseSupport: "ice",
        motionMetresPerSecond: [
            descriptor.environment.anvilLevelWindMetresPerSecond * 0.55,
            descriptor.updraftMetresPerSecond * 0.22,
            0,
        ],
    });
    add(descriptor.overshootHeightKm > 0 &&
        regions.some(({ id }) => id === "ice-crown"), {
        id: "overshooting-top",
        parentId: "ice-crown",
        shape: "buoyant-dome",
        centreKm: [
            shear01 * radius * 0.62,
            descriptor.equilibriumLevelKm + descriptor.overshootHeightKm * 0.55,
            0,
        ],
        halfExtentsKm: [
            Math.max(0.2, radius * 0.48),
            descriptor.overshootHeightKm * 0.55,
            Math.max(0.2, radius * 0.46),
        ],
        strength01: descriptor.updraftStrength01,
        phaseSupport: "ice",
        motionMetresPerSecond: [
            descriptor.environment.anvilLevelWindMetresPerSecond * 0.18,
            descriptor.updraftMetresPerSecond * 0.34,
            0,
        ],
    });
    add(descriptor.anvilStrength01 > 0.1 &&
        regions.some(({ id }) => id === "ice-crown"), {
        id: "anvil-outflow",
        parentId: "ice-crown",
        shape: "shear-detrained-sheet",
        centreKm: [
            (descriptor.anvilDownwindExtentKm - descriptor.anvilUpwindExtentKm) * 0.5,
            descriptor.equilibriumLevelKm - radius * 0.16,
            0,
        ],
        halfExtentsKm: [
            Math.max(0.3,
                (descriptor.anvilDownwindExtentKm + descriptor.anvilUpwindExtentKm) * 0.5),
            Math.max(0.2, radius * mix(0.12, 0.42, descriptor.anvilStrength01)),
            Math.max(0.3, descriptor.anvilCrosswindExtentKm),
        ],
        strength01: descriptor.anvilStrength01,
        phaseSupport: "ice",
        motionMetresPerSecond: [
            descriptor.environment.anvilLevelWindMetresPerSecond,
            0.3,
            0,
        ],
    });
    add(descriptor.precipitationStrength01 > 0.07, {
        id: "precipitation-core",
        parentId: regions.some(({ id }) => id === "mixed-phase-core")
            ? "mixed-phase-core" : "storm-system",
        shape: "precipitation-curtain",
        centreKm: [radius * mix(0.62, 1.2, shear01),
            descriptor.mixedPhaseBottomKm * 0.53, radius * 0.18],
        halfExtentsKm: [radius * mix(0.65, 1.25, descriptor.precipitationStrength01),
            Math.max(0.25, descriptor.mixedPhaseBottomKm * 0.52),
            radius * lineWidth * mix(0.62, 1.08, descriptor.precipitationStrength01)],
        strength01: descriptor.precipitationStrength01,
        phaseSupport: "precipitation",
        motionMetresPerSecond: [
            descriptor.environment.deepLayerShearMetresPerSecond * 0.15,
            -mix(5, 16, descriptor.precipitationStrength01),
            0,
        ],
    });
    add(descriptor.downdraftStrength01 > 0.08 &&
        regions.some(({ id }) => id === "precipitation-core"), {
        id: "downdraft-core",
        parentId: "precipitation-core",
        shape: "descending-plume",
        centreKm: [radius * mix(0.85, 1.45, shear01),
            Math.max(0.3, descriptor.mixedPhaseBottomKm * 0.48), radius * 0.22],
        halfExtentsKm: [radius * 0.8, Math.max(0.25,
            descriptor.mixedPhaseBottomKm * 0.46), radius * lineWidth * 0.85],
        strength01: descriptor.downdraftStrength01,
        phaseSupport: "rain-cooled-air",
        motionMetresPerSecond: [
            descriptor.environment.deepLayerShearMetresPerSecond * 0.12,
            -descriptor.downdraftMetresPerSecond,
            0,
        ],
    });
    const coldPoolRadius = radius * mix(1.5, 4.8,
        descriptor.coldPoolStrength01);
    add(descriptor.coldPoolStrength01 > 0.08 &&
        regions.some(({ id }) => id === "downdraft-core"), {
        id: "cold-pool",
        parentId: "downdraft-core",
        shape: "spreading-density-current",
        centreKm: [radius * 1.1, Math.max(0.08, base * 0.1), 0],
        halfExtentsKm: [coldPoolRadius, Math.max(0.08, base * 0.12),
            coldPoolRadius * lineWidth],
        strength01: descriptor.coldPoolStrength01,
        phaseSupport: "rain-cooled-air",
        motionMetresPerSecond: [
            mix(4, 24, descriptor.coldPoolStrength01),
            0,
            0,
        ],
    });
    add(descriptor.coldPoolStrength01 > 0.14 &&
        regions.some(({ id }) => id === "cold-pool"), {
        id: "gust-front",
        parentId: "cold-pool",
        shape: "lifting-wedge",
        centreKm: [radius * 1.1 + coldPoolRadius,
            Math.max(0.12, base * 0.28), 0],
        halfExtentsKm: [Math.max(0.2, radius * 0.3),
            Math.max(0.12, base * 0.34), coldPoolRadius * lineWidth],
        strength01: descriptor.coldPoolStrength01,
        phaseSupport: "rain-cooled-air",
        motionMetresPerSecond: [
            mix(5, 28, descriptor.coldPoolStrength01),
            mix(0.5, 4, descriptor.coldPoolStrength01),
            0,
        ],
    });

    const regionIds = new Set(regions.map(({ id }) => id));
    const paths: DeepConvectionAttachmentPath[] = [];
    const attach = (
        from: DeepConvectionTopologyRegionId,
        to: DeepConvectionTopologyRegionId,
        kind: DeepConvectionAttachmentPath["kind"],
        strength01: number,
    ) => {
        if (!regionIds.has(from) || !regionIds.has(to)) return;
        const fromRegion = regions.find(({ id }) => id === from);
        const toRegion = regions.find(({ id }) => id === to);
        if (!fromRegion || !toRegion) return;
        paths.push({
            id: from + "->" + to,
            from,
            to,
            kind,
            controlPointsKm: [fromRegion.centreKm, [
                mix(fromRegion.centreKm[0], toRegion.centreKm[0], 0.5),
                mix(fromRegion.centreKm[1], toRegion.centreKm[1], 0.5),
                mix(fromRegion.centreKm[2], toRegion.centreKm[2], 0.5),
            ], toRegion.centreKm],
            strength01: round(clamp01(strength01)),
        });
    };
    attach("inflow-stream", "rain-free-base", "inflow-feeding",
        descriptor.updraftStrength01);
    attach("rain-free-base", "liquid-updraft-core", "mass-continuity",
        descriptor.updraftStrength01);
    attach("liquid-updraft-core", "mixed-phase-core", "phase-transition",
        descriptor.glaciation01);
    attach("mixed-phase-core", "upper-turret-crown", "mass-continuity",
        descriptor.updraftStrength01);
    attach("liquid-updraft-core", "upper-turret-crown", "mass-continuity",
        descriptor.updraftStrength01);
    attach("upper-turret-crown", "ice-crown", "phase-transition",
        descriptor.glaciation01);
    attach("ice-crown", "overshooting-top", "mass-continuity",
        descriptor.updraftStrength01);
    attach("ice-crown", "anvil-outflow", "detrainment",
        descriptor.anvilStrength01);
    attach("mixed-phase-core", "precipitation-core", "precipitation-fallout",
        descriptor.precipitationStrength01);
    attach("precipitation-core", "downdraft-core", "precipitation-fallout",
        descriptor.downdraftStrength01);
    attach("downdraft-core", "cold-pool", "outflow-spreading",
        descriptor.coldPoolStrength01);
    attach("cold-pool", "gust-front", "outflow-spreading",
        descriptor.coldPoolStrength01);

    return {
        coordinateConvention: "x-downwind-y-altitude-z-crosswind-km",
        regions,
        attachmentPaths: paths,
    };
};

export type DeepConvectionFeatureClassification =
    | "supplementary-feature"
    | "accessory-cloud";
export type DeepConvectionFeatureAttachment =
    | "merged-with-owner"
    | "attached-to-owner"
    | "partly-merged"
    | "detached-but-flow-coupled";

export interface DeepConvectionFeatureDescriptor {
    readonly feature: DeepConvectionFeature;
    readonly classification: DeepConvectionFeatureClassification;
    readonly wmoDefinition: string;
    readonly wmoSource: string;
    readonly ownerRegion: DeepConvectionTopologyRegionId;
    readonly requiredOwnerRegions: readonly DeepConvectionTopologyRegionId[];
    readonly parentFeature: DeepConvectionFeature | null;
    readonly attachment: DeepConvectionFeatureAttachment;
    readonly motionRule: string;
    readonly forbiddenAlias: string;
}

export const DEEP_CONVECTION_FEATURE_DESCRIPTORS = {
    incus: {
        feature: "incus", classification: "supplementary-feature",
        wmoDefinition: "A smooth, fibrous, or striated upper Cumulonimbus portion spread into an anvil shape.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-incus.html",
        ownerRegion: "anvil-outflow", requiredOwnerRegions: ["ice-crown", "anvil-outflow"],
        parentFeature: null, attachment: "merged-with-owner",
        motionRule: "detrain continuously from the glaciated crown along anvil-level wind",
        forbiddenAlias: "detached flat plate",
    },
    arcus: {
        feature: "arcus", classification: "supplementary-feature",
        wmoDefinition: "A dense horizontal roll with tattered edges on the lower forward part of the storm.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-arcus.html",
        ownerRegion: "gust-front", requiredOwnerRegions: ["cold-pool", "gust-front"],
        parentFeature: null, attachment: "attached-to-owner",
        motionRule: "advance with the precipitation-driven gust front while lifting warm inflow",
        forbiddenAlias: "detached horizon band",
    },
    murus: {
        feature: "murus", classification: "supplementary-feature",
        wmoDefinition: "A localized persistent lowering from the rain-free base of a severe multicell or supercell Cumulonimbus.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-murus.html",
        ownerRegion: "rain-free-base", requiredOwnerRegions: ["inflow-stream", "rain-free-base"],
        parentFeature: null, attachment: "merged-with-owner",
        motionRule: "remain fixed relative to the rain-free updraft while inflow rises through it",
        forbiddenAlias: "shelf cloud on outflow",
    },
    cauda: {
        feature: "cauda", classification: "supplementary-feature",
        wmoDefinition: "A horizontal tail at the shared base height joining supercell precipitation to murus.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-cauda.html",
        ownerRegion: "rain-free-base", requiredOwnerRegions: ["rain-free-base", "precipitation-core"],
        parentFeature: "murus", attachment: "attached-to-owner",
        motionRule: "move from the precipitation region toward murus and accelerate upward at the junction",
        forbiddenAlias: "funnel or tail pointing away from murus",
    },
    tuba: {
        feature: "tuba", classification: "supplementary-feature",
        wmoDefinition: "A cloud column or inverted cone protruding from cloud base and revealing a vortex.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-tuba.html",
        ownerRegion: "rain-free-base", requiredOwnerRegions: ["rain-free-base"],
        parentFeature: "murus", attachment: "attached-to-owner",
        motionRule: "extend downward from the rotating murus/updraft base, never laterally from precipitation",
        forbiddenAlias: "cauda or rain shaft",
    },
    mamma: {
        feature: "mamma", classification: "supplementary-feature",
        wmoDefinition: "Hanging pouch-like protuberances on the underside of a cloud, frequently the projecting Cumulonimbus anvil.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-mamma.html",
        ownerRegion: "anvil-outflow", requiredOwnerRegions: ["anvil-outflow"],
        parentFeature: null, attachment: "merged-with-owner",
        motionRule: "descend locally from the cloudy anvil underside while remaining materially continuous",
        forbiddenAlias: "independent bubble grid",
    },
    pileus: {
        feature: "pileus", classification: "accessory-cloud",
        wmoDefinition: "A small cap or hood above or attached to an actively rising cumuliform top, which often penetrates it.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-accessory-pileus.html",
        ownerRegion: "upper-turret-crown", requiredOwnerRegions: ["upper-turret-crown"],
        parentFeature: null, attachment: "partly-merged",
        motionRule: "condense in displaced stable air immediately above the rising turret and be pierced by it",
        forbiddenAlias: "persistent circular stamp",
    },
    velum: {
        feature: "velum", classification: "accessory-cloud",
        wmoDefinition: "A broad veil close above or attached to one or more cumuliform upper parts, which often pierce it.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-accessory-velum.html",
        ownerRegion: "upper-turret-crown", requiredOwnerRegions: ["upper-turret-crown"],
        parentFeature: null, attachment: "partly-merged",
        motionRule: "span a finite lifted stable layer and remain coupled to the penetrating towers",
        forbiddenAlias: "global unbounded haze sheet",
    },
    flumen: {
        feature: "flumen", classification: "accessory-cloud",
        wmoDefinition: "Low cloud bands parallel to low-level wind, moving into a supercell along the pseudo-warm-front inflow.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-accessory-flumen.html",
        ownerRegion: "inflow-stream", requiredOwnerRegions: ["inflow-stream", "rain-free-base"],
        parentFeature: null, attachment: "detached-but-flow-coupled",
        motionRule: "flow toward the updraft, with a base above and no attachment to murus",
        forbiddenAlias: "cauda attached to wall cloud",
    },
    pannus: {
        feature: "pannus", classification: "accessory-cloud",
        wmoDefinition: "Ragged low shreds below the parent cloud, sometimes merging into a discontinuous layer.",
        wmoSource: "https://cloudatlas.wmo.int/en/clouds-accessory-pannus.html",
        ownerRegion: "precipitation-core", requiredOwnerRegions: ["precipitation-core"],
        parentFeature: null, attachment: "detached-but-flow-coupled",
        motionRule: "form in precipitation-moistened turbulent air below the storm base",
        forbiddenAlias: "uniform opaque lower deck",
    },
} as const satisfies Record<DeepConvectionFeature, DeepConvectionFeatureDescriptor>;

export interface DeepConvectionFeatureOwnership {
    readonly feature: DeepConvectionFeature;
    readonly eligible: boolean;
    readonly present: boolean;
    readonly presence01: number;
    readonly ownerRegion: DeepConvectionTopologyRegionId;
    readonly requiredOwnerRegions: readonly DeepConvectionTopologyRegionId[];
    readonly parentFeature: DeepConvectionFeature | null;
    readonly attachment: DeepConvectionFeatureAttachment;
    readonly reasons: readonly string[];
}

const featureEligibility = (
    feature: DeepConvectionFeature,
    descriptor: DeepConvectionDescriptor,
    activeRegions: ReadonlySet<DeepConvectionTopologyRegionId>,
) => {
    const base = DEEP_CONVECTION_FEATURE_DESCRIPTORS[feature];
    const reasons: string[] = [];
    for (const region of base.requiredOwnerRegions) {
        if (!activeRegions.has(region)) reasons.push("missing-owner:" + region);
    }
    if (feature === "incus" && (descriptor.species !== "capillatus" ||
        descriptor.glaciation01 < 0.58 || descriptor.anvilStrength01 < 0.34)) {
        reasons.push("incus-requires-glaciated-capillatus-anvil");
    }
    if (feature === "mamma" && (descriptor.anvilStrength01 < 0.38 ||
        descriptor.lifecycleProgress01 < 0.48)) {
        reasons.push("mamma-requires-developed-cloudy-anvil-underside");
    }
    if ((feature === "pileus" || feature === "velum") &&
        (descriptor.updraftStrength01 < (feature === "pileus" ? 0.48 : 0.32) ||
            descriptor.lifecycleStage === "decaying")) {
        reasons.push(feature + "-requires-active-rising-turret");
    }
    if (feature === "arcus" && descriptor.coldPoolStrength01 < 0.18) {
        reasons.push("arcus-requires-precipitation-driven-cold-pool");
    }
    if ((feature === "murus" || feature === "cauda" || feature === "tuba" ||
        feature === "flumen") && descriptor.organization !== "supercell") {
        reasons.push(feature + "-requires-supercell-organization");
    }
    if (feature === "murus" && (descriptor.environment.lowLevelRotation01 < 0.52 ||
        descriptor.updraftStrength01 < 0.42)) {
        reasons.push("murus-requires-rotating-rain-free-updraft");
    }
    if (feature === "cauda" && descriptor.precipitationStrength01 < 0.18) {
        reasons.push("cauda-requires-supercell-precipitation-region");
    }
    if (feature === "tuba" && descriptor.environment.lowLevelRotation01 < 0.72) {
        reasons.push("tuba-requires-resolved-strong-base-vorticity");
    }
    if (feature === "flumen" &&
        descriptor.environment.stormRelativeInflowMetresPerSecond < 14) {
        reasons.push("flumen-requires-organized-pseudo-warm-front-inflow");
    }
    if (feature === "pannus" && (descriptor.precipitationStrength01 < 0.18 ||
        descriptor.environment.subcloudRelativeHumidity01 < 0.68)) {
        reasons.push("pannus-requires-precipitation-moistened-subcloud-air");
    }
    return { eligible: reasons.length === 0, reasons };
};

export const resolveDeepConvectionFeatureOwnership = (
    descriptor: DeepConvectionDescriptor,
): readonly DeepConvectionFeatureOwnership[] => {
    const topology = resolveDeepConvectionTopology(descriptor);
    const activeRegions = new Set(topology.regions.map(({ id }) => id));
    const explicit = descriptor.requestedFeatures === null
        ? null : new Set(descriptor.requestedFeatures);
    const provisional = new Map<DeepConvectionFeature,
        DeepConvectionFeatureOwnership>();

    for (const [index, feature] of DEEP_CONVECTION_FEATURES.entries()) {
        const featureDescriptor = DEEP_CONVECTION_FEATURE_DESCRIPTORS[feature];
        const qualification = featureEligibility(feature, descriptor, activeRegions);
        const requestedByDependent = explicit !== null &&
            ((feature === "murus" && (explicit.has("cauda") || explicit.has("tuba"))));
        const preference = explicit === null
            ? hash01(descriptor.seed, 40 + index) * 0.68 + 0.16
            : explicit.has(feature) || requestedByDependent ? 1 : 0;
        const physicalFrequency = feature === "incus" ? descriptor.anvilStrength01
            : feature === "arcus" ? descriptor.coldPoolStrength01
                : feature === "mamma" ? descriptor.anvilStrength01 * 0.72
                    : feature === "pileus" ? descriptor.updraftStrength01 * 0.76
                        : feature === "velum" ? descriptor.updraftStrength01 * 0.46
                            : feature === "pannus" ? descriptor.precipitationStrength01 *
                                descriptor.environment.subcloudRelativeHumidity01
                                : feature === "murus" || feature === "cauda" ||
                                    feature === "tuba" || feature === "flumen"
                                    ? descriptor.environment.lowLevelRotation01 * 0.82
                                    : 0.5;
        const presence = qualification.eligible
            ? clamp01(preference * 0.58 + physicalFrequency * 0.62)
            : 0;
        provisional.set(feature, {
            feature,
            eligible: qualification.eligible,
            present: false,
            presence01: round(presence),
            ownerRegion: featureDescriptor.ownerRegion,
            requiredOwnerRegions: featureDescriptor.requiredOwnerRegions,
            parentFeature: featureDescriptor.parentFeature,
            attachment: featureDescriptor.attachment,
            reasons: qualification.reasons,
        });
    }

    return DEEP_CONVECTION_FEATURES.map((feature) => {
        const state = provisional.get(feature);
        if (!state) throw new Error("Missing deep convection feature state: " + feature);
        const parentPresent = state.parentFeature === null ||
            (provisional.get(state.parentFeature)?.presence01 ?? 0) >= 0.5;
        const reasons = parentPresent ? state.reasons : [
            ...state.reasons,
            "missing-parent-feature:" + state.parentFeature,
        ];
        return {
            ...state,
            present: state.eligible && parentPresent && state.presence01 >= 0.5,
            reasons,
        };
    });
};

export const DEEP_CONVECTION_HYDROMETEOR_CLASSES = [
    "cloud-liquid",
    "supercooled-liquid",
    "ice-crystals",
    "graupel",
    "rain",
    "hail",
] as const;
export type DeepConvectionHydrometeorClass =
    (typeof DEEP_CONVECTION_HYDROMETEOR_CLASSES)[number];
export type DeepConvectionHydrometeorFractions = Readonly<Record<
    DeepConvectionHydrometeorClass,
    number
>>;

export interface DeepConvectionMicrophysicsSampleInput {
    /** Used when altitudeKm is omitted. Zero is cloud base; one is cloud top. */
    readonly normalizedAltitude01?: number;
    readonly altitudeKm?: number;
    /** Zero at the active core centre, one at its thermodynamic boundary. */
    readonly normalizedRadialDistance01?: number;
    /** Zero in the updraft source; one in downstream detrainment. */
    readonly normalizedDownwindDistance01?: number;
}

export interface DeepConvectionMicrophysicsSample {
    readonly altitudeKm: number;
    readonly normalizedAltitude01: number;
    readonly temperatureKelvin: number;
    readonly relativeCondensate01: number;
    readonly liquidWaterContentGramsPerCubicMetre: number;
    readonly iceWaterContentGramsPerCubicMetre: number;
    readonly effectiveLiquidRadiusMicrons: number;
    readonly effectiveIceRadiusMicrons: number;
    readonly mixedPhaseCollisionPotential01: number;
    readonly chargeSeparationPotential01: number;
    readonly phaseFractions: DeepConvectionHydrometeorFractions;
}

const normalizedFractions = (
    weights: Readonly<Record<DeepConvectionHydrometeorClass, number>>,
): DeepConvectionHydrometeorFractions => {
    const total = DEEP_CONVECTION_HYDROMETEOR_CLASSES.reduce((sum, kind) =>
        sum + Math.max(0, weights[kind]), 0);
    if (total <= 1e-12) {
        return {
            "cloud-liquid": 1,
            "supercooled-liquid": 0,
            "ice-crystals": 0,
            graupel: 0,
            rain: 0,
            hail: 0,
        };
    }
    return {
        "cloud-liquid": Math.max(0, weights["cloud-liquid"]) / total,
        "supercooled-liquid": Math.max(0, weights["supercooled-liquid"]) / total,
        "ice-crystals": Math.max(0, weights["ice-crystals"]) / total,
        graupel: Math.max(0, weights.graupel) / total,
        rain: Math.max(0, weights.rain) / total,
        hail: Math.max(0, weights.hail) / total,
    };
};

/**
 * Samples a continuous bulk mixed-phase model. This is not a weather forecast
 * microphysics scheme; it is a bounded rendering contract whose temperature
 * response preserves coexistence of liquid, ice, and graupel instead of a
 * binary phase switch.
 */
export const sampleDeepConvectionMicrophysics = (
    descriptor: DeepConvectionDescriptor,
    input: DeepConvectionMicrophysicsSampleInput,
): DeepConvectionMicrophysicsSample => {
    const normalizedAltitude = clamp01(input.normalizedAltitude01 ?? 0.5);
    const altitudeKm = clamp(
        input.altitudeKm ?? mix(
            descriptor.cloudBaseKm,
            descriptor.cloudTopKm,
            normalizedAltitude,
        ),
        0,
        Math.max(descriptor.cloudTopKm, 0.01),
    );
    const cloudNormalizedAltitude = clamp01(
        (altitudeKm - descriptor.cloudBaseKm) /
        Math.max(0.01, descriptor.cloudTopKm - descriptor.cloudBaseKm),
    );
    const radial = clamp01(input.normalizedRadialDistance01 ?? 0.22);
    const downwind = clamp01(input.normalizedDownwindDistance01 ?? 0);
    const lapse = descriptor.environment.environmentalLapseRateKelvinPerKm;
    const temperature = altitudeKm <= descriptor.environment.freezingLevelKm
        ? 273.15 + lapse *
            (descriptor.environment.freezingLevelKm - altitudeKm)
        : 273.15 - mix(lapse, 7.2, 0.35) *
            (altitudeKm - descriptor.environment.freezingLevelKm);

    // Natural mixed-phase clouds retain supercooled liquid well below 0 C,
    // while homogeneous freezing removes it by roughly -38 C. Smooth thermal
    // weights avoid a visible/material seam at the nominal freezing level.
    const warmLiquidThermal = smoothstep(268.15, 275.15, temperature);
    const thermalIce = 1 - smoothstep(235.15, 271.15, temperature);
    const supercooledThermal = (1 - warmLiquidThermal) * (1 - thermalIce);
    const glaciatedIce = thermalIce * mix(0.45, 1,
        descriptor.glaciation01);
    const mixedPhaseOverlap = clamp01(
        4 * thermalIce * (1 - thermalIce) *
        smoothstep(0.08, 0.5, descriptor.glaciation01),
    );
    const radialSupport = 1 - smoothstep(0.66, 1, radial);
    const baseSupport = smoothstep(
        descriptor.cloudBaseKm - 0.08,
        descriptor.cloudBaseKm + 0.18,
        altitudeKm,
    );
    const topSupport = 1 - smoothstep(
        descriptor.cloudTopKm - mix(0.35, 1.1, downwind),
        descriptor.cloudTopKm + 0.04,
        altitudeKm,
    );
    const decay01 = smoothstep(0.82, 1, descriptor.lifecycleProgress01);
    const lowerCore = 1 - smoothstep(
        descriptor.mixedPhaseBottomKm,
        descriptor.mixedPhaseTopKm,
        altitudeKm,
    );
    const lowerDecayLoss = 1 - decay01 * lowerCore * 0.88;
    const anvilPreservation = downwind * descriptor.anvilStrength01 *
        smoothstep(descriptor.mixedPhaseTopKm - 0.8,
            descriptor.equilibriumLevelKm, altitudeKm);
    const relativeCondensate = clamp01(
        baseSupport * topSupport * radialSupport *
        (lowerDecayLoss + anvilPreservation * 0.58) *
        mix(0.58, 1, descriptor.intensity01),
    );
    const collisionPotential = clamp01(
        mixedPhaseOverlap * descriptor.updraftStrength01 *
        mix(0.55, 1, radialSupport) *
        (0.7 + descriptor.precipitationStrength01 * 0.3),
    );
    const rainThermal = smoothstep(252, 276, temperature) *
        (1 - smoothstep(descriptor.mixedPhaseBottomKm,
            descriptor.mixedPhaseTopKm, altitudeKm));
    const hailPotential = collisionPotential *
        smoothstep(0.48, 0.88, descriptor.updraftStrength01) *
        smoothstep(900, 3200, descriptor.environment.capeJoulesPerKilogram);
    const precipitationLoading = descriptor.precipitationStrength01 *
        (1 - downwind * 0.35);

    const phaseFractions = normalizedFractions({
        "cloud-liquid": warmLiquidThermal * mix(1, 0.65,
            precipitationLoading),
        "supercooled-liquid": supercooledThermal * mix(0.85, 0.38,
            descriptor.glaciation01) * (0.7 + collisionPotential * 0.3),
        "ice-crystals": glaciatedIce * mix(0.72, 1.35,
            downwind * descriptor.anvilStrength01),
        graupel: collisionPotential * mix(0.38, 1.05,
            descriptor.precipitationStrength01),
        rain: rainThermal * precipitationLoading * 0.95,
        hail: hailPotential * descriptor.precipitationStrength01 * 0.58,
    });
    const liquidFraction = phaseFractions["cloud-liquid"] +
        phaseFractions["supercooled-liquid"] + phaseFractions.rain;
    const iceFraction = phaseFractions["ice-crystals"] +
        phaseFractions.graupel + phaseFractions.hail;
    const condensateScale = relativeCondensate * mix(0.65, 4.8,
        descriptor.intensity01) * (0.72 + descriptor.precipitationStrength01 * 0.5);
    const chargePotential = clamp01(
        collisionPotential *
        (0.45 + descriptor.downdraftStrength01 * 0.55) *
        smoothstep(0.25, 0.62, descriptor.glaciation01),
    );

    return {
        altitudeKm: round(altitudeKm),
        normalizedAltitude01: round(cloudNormalizedAltitude),
        temperatureKelvin: round(temperature),
        relativeCondensate01: round(relativeCondensate),
        liquidWaterContentGramsPerCubicMetre: round(condensateScale *
            liquidFraction),
        iceWaterContentGramsPerCubicMetre: round(condensateScale * iceFraction),
        effectiveLiquidRadiusMicrons: round(mix(8, 34,
            clamp01(precipitationLoading * 0.7 + collisionPotential * 0.3))),
        effectiveIceRadiusMicrons: round(mix(18, 180,
            clamp01(downwind * 0.48 + collisionPotential * 0.52))),
        mixedPhaseCollisionPotential01: round(collisionPotential),
        chargeSeparationPotential01: round(chargePotential),
        phaseFractions,
    };
};

export interface DeepConvectionTransitionState {
    readonly progress01: number;
    readonly speciesWeights: Readonly<Record<DeepConvectionSpecies, number>>;
    readonly lifecycleWeights: Readonly<Record<DeepConvectionLifecycleStage, number>>;
    readonly updraftStrength01: number;
    readonly downdraftStrength01: number;
    readonly precipitationStrength01: number;
    readonly glaciation01: number;
    readonly anvilStrength01: number;
    readonly featurePresence: Readonly<Record<DeepConvectionFeature, number>>;
}

const categoricalBlend = <Key extends string>(
    keys: readonly Key[],
    from: Key,
    to: Key,
    progress: number,
): Readonly<Record<Key, number>> => Object.fromEntries(keys.map((key) => [
    key,
    from === to ? (key === from ? 1 : 0)
        : key === from ? 1 - progress
            : key === to ? progress : 0,
])) as Readonly<Record<Key, number>>;

export const interpolateDeepConvectionDescriptors = (
    from: DeepConvectionDescriptor,
    to: DeepConvectionDescriptor,
    progress01: number,
): DeepConvectionTransitionState => {
    const progress = smoothstep(0, 1, clamp01(progress01));
    const fromFeatures = new Map(resolveDeepConvectionFeatureOwnership(from)
        .map((feature) => [feature.feature, feature.presence01]));
    const toFeatures = new Map(resolveDeepConvectionFeatureOwnership(to)
        .map((feature) => [feature.feature, feature.presence01]));
    const featurePresence = Object.fromEntries(DEEP_CONVECTION_FEATURES.map(
        (feature) => [feature, round(mix(
            fromFeatures.get(feature) ?? 0,
            toFeatures.get(feature) ?? 0,
            progress,
        ))],
    )) as Readonly<Record<DeepConvectionFeature, number>>;
    return {
        progress01: round(progress),
        speciesWeights: categoricalBlend(DEEP_CONVECTION_SPECIES,
            from.species, to.species, progress),
        lifecycleWeights: categoricalBlend(DEEP_CONVECTION_LIFECYCLE_STAGES,
            from.lifecycleStage, to.lifecycleStage, progress),
        updraftStrength01: round(mix(from.updraftStrength01,
            to.updraftStrength01, progress)),
        downdraftStrength01: round(mix(from.downdraftStrength01,
            to.downdraftStrength01, progress)),
        precipitationStrength01: round(mix(from.precipitationStrength01,
            to.precipitationStrength01, progress)),
        glaciation01: round(mix(from.glaciation01, to.glaciation01, progress)),
        anvilStrength01: round(mix(from.anvilStrength01,
            to.anvilStrength01, progress)),
        featurePresence,
    };
};

export const sampleDeepConvectionTransitionMicrophysics = (
    from: DeepConvectionDescriptor,
    to: DeepConvectionDescriptor,
    progress01: number,
    input: DeepConvectionMicrophysicsSampleInput,
): DeepConvectionMicrophysicsSample => {
    const progress = smoothstep(0, 1, clamp01(progress01));
    const a = sampleDeepConvectionMicrophysics(from, input);
    const b = sampleDeepConvectionMicrophysics(to, input);
    const phaseFractions = normalizedFractions(Object.fromEntries(
        DEEP_CONVECTION_HYDROMETEOR_CLASSES.map((kind) => [
            kind,
            mix(a.phaseFractions[kind], b.phaseFractions[kind], progress),
        ]),
    ) as unknown as Record<DeepConvectionHydrometeorClass, number>);
    return {
        altitudeKm: round(mix(a.altitudeKm, b.altitudeKm, progress)),
        normalizedAltitude01: round(mix(a.normalizedAltitude01,
            b.normalizedAltitude01, progress)),
        temperatureKelvin: round(mix(a.temperatureKelvin,
            b.temperatureKelvin, progress)),
        relativeCondensate01: round(mix(a.relativeCondensate01,
            b.relativeCondensate01, progress)),
        liquidWaterContentGramsPerCubicMetre: round(mix(
            a.liquidWaterContentGramsPerCubicMetre,
            b.liquidWaterContentGramsPerCubicMetre,
            progress,
        )),
        iceWaterContentGramsPerCubicMetre: round(mix(
            a.iceWaterContentGramsPerCubicMetre,
            b.iceWaterContentGramsPerCubicMetre,
            progress,
        )),
        effectiveLiquidRadiusMicrons: round(mix(a.effectiveLiquidRadiusMicrons,
            b.effectiveLiquidRadiusMicrons, progress)),
        effectiveIceRadiusMicrons: round(mix(a.effectiveIceRadiusMicrons,
            b.effectiveIceRadiusMicrons, progress)),
        mixedPhaseCollisionPotential01: round(mix(
            a.mixedPhaseCollisionPotential01,
            b.mixedPhaseCollisionPotential01,
            progress,
        )),
        chargeSeparationPotential01: round(mix(
            a.chargeSeparationPotential01,
            b.chargeSeparationPotential01,
            progress,
        )),
        phaseFractions,
    };
};

export interface DeepConvectionChargeRegion {
    readonly polarity: "positive" | "negative";
    readonly ownerRegion: DeepConvectionTopologyRegionId;
    readonly altitudeRangeKm: readonly [number, number];
    readonly carrier: "small-ice" | "graupel" | "warm-precipitation";
    readonly relativeCharge01: number;
}

export interface DeepConvectionPhenomenonSourceContract {
    readonly phenomenon: DeepConvectionPhenomenon;
    readonly active: boolean;
    readonly intensity01: number;
    readonly sourceRegion: DeepConvectionTopologyRegionId;
    readonly sourceAltitudeRangeKm: readonly [number, number];
    readonly prerequisites: readonly string[];
    readonly transport: string;
    readonly termination: string;
    readonly reachesGroundFraction01: number;
    readonly chargeRegions: readonly DeepConvectionChargeRegion[];
}

export type DeepConvectionPhenomenonSourceContracts = Readonly<Record<
    DeepConvectionPhenomenon,
    DeepConvectionPhenomenonSourceContract
>>;

export const resolveDeepConvectionSourceContracts = (
    descriptor: DeepConvectionDescriptor,
): DeepConvectionPhenomenonSourceContracts => {
    const mixedSample = sampleDeepConvectionMicrophysics(descriptor, {
        altitudeKm: mix(descriptor.mixedPhaseBottomKm,
            descriptor.mixedPhaseTopKm, 0.52),
        normalizedRadialDistance01: 0.18,
    });
    const precipitationActive = descriptor.precipitationStrength01 > 0.08 &&
        descriptor.lifecycleStage !== "developing";
    const evaporationPotential = clamp01(
        descriptor.precipitationStrength01 *
        (1 - descriptor.environment.subcloudRelativeHumidity01) *
        smoothstep(1.1, 3.4, descriptor.cloudBaseKm),
    );
    const virgaActive = precipitationActive && evaporationPotential > 0.12;
    const groundRainFraction = precipitationActive
        ? clamp01(descriptor.environment.subcloudRelativeHumidity01 *
            descriptor.environment.precipitationEfficiency01 *
            (1 - evaporationPotential * 0.78))
        : 0;
    const hailPotential = clamp01(
        mixedSample.mixedPhaseCollisionPotential01 *
        smoothstep(0.45, 0.86, descriptor.updraftStrength01) *
        smoothstep(1200, 3200,
            descriptor.environment.capeJoulesPerKilogram) *
        (0.72 + descriptor.glaciation01 * 0.28),
    );
    const hailActive = descriptor.lifecycleStage !== "developing" &&
        descriptor.lifecycleStage !== "decaying" && hailPotential > 0.18;
    const lightningPotential = clamp01(
        mixedSample.chargeSeparationPotential01 *
        smoothstep(0.28, 0.72, descriptor.updraftStrength01) *
        (0.55 + descriptor.downdraftStrength01 * 0.45),
    );
    const lightningActive = (descriptor.lifecycleStage === "mature" ||
        descriptor.lifecycleStage === "precipitating") &&
        lightningPotential > 0.1;
    const chargeRegions: readonly DeepConvectionChargeRegion[] = lightningActive
        ? [{
            polarity: "positive",
            ownerRegion: "ice-crown",
            altitudeRangeKm: [round(descriptor.mixedPhaseTopKm * 0.92),
                round(descriptor.cloudTopKm)],
            carrier: "small-ice",
            relativeCharge01: round(lightningPotential * 0.82),
        }, {
            polarity: "negative",
            ownerRegion: "mixed-phase-core",
            altitudeRangeKm: [round(descriptor.mixedPhaseBottomKm),
                round(descriptor.mixedPhaseTopKm)],
            carrier: "graupel",
            relativeCharge01: round(lightningPotential),
        }, {
            polarity: "positive",
            ownerRegion: "precipitation-core",
            altitudeRangeKm: [round(descriptor.cloudBaseKm),
                round(descriptor.mixedPhaseBottomKm)],
            carrier: "warm-precipitation",
            relativeCharge01: round(lightningPotential * 0.3),
        }]
        : [];

    return {
        rain: {
            phenomenon: "rain",
            active: precipitationActive,
            intensity01: round(descriptor.precipitationStrength01),
            sourceRegion: "precipitation-core",
            sourceAltitudeRangeKm: [round(descriptor.cloudBaseKm),
                round(descriptor.mixedPhaseTopKm)],
            prerequisites: [
                "condensate-growth",
                "collision-coalescence-or-melting-ice",
                "owned-precipitation-fallout-path",
            ],
            transport: "fall through the precipitation core with wind and size-dependent drift",
            termination: groundRainFraction > 0.08
                ? "ground-and-partial-subcloud-evaporation"
                : "subcloud-evaporation",
            reachesGroundFraction01: round(groundRainFraction),
            chargeRegions: [],
        },
        hail: {
            phenomenon: "hail",
            active: hailActive,
            intensity01: round(hailPotential),
            sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: [round(descriptor.mixedPhaseBottomKm),
                round(descriptor.mixedPhaseTopKm)],
            prerequisites: [
                "supercooled-liquid",
                "graupel-ice-collisions",
                "updraft-capable-of-hydrometeor-support",
            ],
            transport: "cycle within the mixed-phase updraft before falling through the precipitation core",
            termination: "fallout-when-updraft-support-is-exceeded",
            reachesGroundFraction01: hailActive
                ? round(groundRainFraction * mix(0.32, 0.78, hailPotential)) : 0,
            chargeRegions: [],
        },
        virga: {
            phenomenon: "virga",
            active: virgaActive,
            intensity01: round(evaporationPotential),
            sourceRegion: "precipitation-core",
            sourceAltitudeRangeKm: [
                round(Math.max(0.08, descriptor.cloudBaseKm *
                    (1 - evaporationPotential * 0.82))),
                round(descriptor.cloudBaseKm),
            ],
            prerequisites: [
                "precipitation-generated-aloft",
                "subcloud-relative-humidity-deficit",
                "sufficient-evaporation-depth",
            ],
            transport: "fallstreaks drift and narrow while evaporating below cloud base",
            termination: "complete-evaporation-above-ground",
            reachesGroundFraction01: 0,
            chargeRegions: [],
        },
        lightning: {
            phenomenon: "lightning",
            active: lightningActive,
            intensity01: round(lightningPotential),
            sourceRegion: "mixed-phase-core",
            sourceAltitudeRangeKm: [round(descriptor.mixedPhaseBottomKm),
                round(descriptor.cloudTopKm)],
            prerequisites: [
                "coexisting-supercooled-liquid-graupel-and-small-ice",
                "noninductive-collisional-charge-transfer",
                "updraft-downdraft-charge-separation",
                "resolved-opposite-charge-reservoirs",
            ],
            transport: "leaders propagate only between resolved charge reservoirs or a reservoir and induced ground charge",
            termination: "charge-neutralization-within-storm-owned-electrical-field",
            reachesGroundFraction01: lightningActive
                ? round(clamp01(descriptor.precipitationStrength01 * 0.22 +
                    descriptor.environment.lowLevelRotation01 * 0.12)) : 0,
            chargeRegions,
        },
    };
};

export type DeepConvectionFramingGoal =
    | "full-system"
    | "tower-study"
    | "under-anvil";

export interface DeepConvectionPerspective {
    readonly id: string;
    readonly label: string;
    readonly framingGoal: DeepConvectionFramingGoal;
    readonly cameraAltitudeKm: number;
    readonly slantRangeKm: number;
    readonly azimuthRelativeToDownwindDegrees: number;
    readonly verticalFieldOfViewDegrees: number;
    readonly aspectRatio: number;
}

export interface DeepConvectionPerspectiveQualification {
    readonly valid: boolean;
    readonly violations: readonly string[];
    readonly apparentVerticalSpanDegrees: number;
    readonly apparentHorizontalSpanDegrees: number;
    readonly horizontalFieldOfViewDegrees: number;
}

const degrees = (radians: number) => radians * 180 / Math.PI;
const radians = (degreesValue: number) => degreesValue * Math.PI / 180;

export const qualifyDeepConvectionPerspective = (
    descriptor: DeepConvectionDescriptor,
    perspective: DeepConvectionPerspective,
): DeepConvectionPerspectiveQualification => {
    const violations: string[] = [];
    if (!Number.isFinite(perspective.cameraAltitudeKm) ||
        perspective.cameraAltitudeKm < 0) {
        violations.push("camera-altitude-must-be-finite-and-nonnegative");
    }
    if (!Number.isFinite(perspective.slantRangeKm) ||
        perspective.slantRangeKm <= 0) {
        violations.push("slant-range-must-be-positive");
    }
    if (perspective.verticalFieldOfViewDegrees <= 4 ||
        perspective.verticalFieldOfViewDegrees >= 130) {
        violations.push("vertical-field-of-view-outside-physical-camera-range");
    }
    if (perspective.aspectRatio <= 0.4 || perspective.aspectRatio >= 4) {
        violations.push("aspect-ratio-outside-supported-range");
    }
    const safeRange = Math.max(0.01, perspective.slantRangeKm);
    const bottomAngle = degrees(Math.atan2(
        descriptor.cloudBaseKm - perspective.cameraAltitudeKm,
        safeRange,
    ));
    const topAngle = degrees(Math.atan2(
        descriptor.cloudTopKm - perspective.cameraAltitudeKm,
        safeRange,
    ));
    const verticalSpan = Math.max(0, topAngle - bottomAngle);
    const horizontalFov = degrees(2 * Math.atan(
        Math.tan(radians(perspective.verticalFieldOfViewDegrees) * 0.5) *
        perspective.aspectRatio,
    ));
    const boundary = descriptor.systemBoundary.horizontalBoundsKm;
    const downwindSpan = boundary[1] - boundary[0];
    const crosswindSpan = boundary[3] - boundary[2];
    const azimuth = radians(perspective.azimuthRelativeToDownwindDegrees);
    const projectedWidth = Math.abs(Math.cos(azimuth)) * crosswindSpan +
        Math.abs(Math.sin(azimuth)) * downwindSpan;
    const horizontalSpan = degrees(2 * Math.atan2(projectedWidth * 0.5,
        safeRange));

    if (perspective.framingGoal === "full-system") {
        if (verticalSpan > perspective.verticalFieldOfViewDegrees * 0.94) {
            violations.push("full-system-vertical-extent-is-clipped");
        }
        if (horizontalSpan > horizontalFov * 0.94) {
            violations.push("full-system-horizontal-extent-is-clipped");
        }
    } else if (perspective.framingGoal === "tower-study") {
        const towerSpan = degrees(Math.atan2(
            descriptor.liquidCoreTopKm - perspective.cameraAltitudeKm,
            safeRange,
        )) - bottomAngle;
        if (towerSpan < 2.5) {
            violations.push("tower-study-is-too-distant-to-resolve-macroshape");
        }
        if (perspective.cameraAltitudeKm > descriptor.cloudBaseKm + 0.2) {
            violations.push("tower-study-must-remain-a-semi-ground-view");
        }
    } else {
        if (descriptor.anvilStrength01 < 0.2) {
            violations.push("under-anvil-view-requires-developed-anvil");
        }
        if (perspective.cameraAltitudeKm >= descriptor.cloudBaseKm) {
            violations.push("under-anvil-camera-must-remain-below-cloud-base");
        }
        if (perspective.slantRangeKm > Math.max(18,
            descriptor.anvilDownwindExtentKm * 1.4)) {
            violations.push("under-anvil-view-is-not-within-storm-outflow-context");
        }
    }

    return {
        valid: violations.length === 0,
        violations,
        apparentVerticalSpanDegrees: round(verticalSpan),
        apparentHorizontalSpanDegrees: round(horizontalSpan),
        horizontalFieldOfViewDegrees: round(horizontalFov),
    };
};

export interface DeepConvectionQualification {
    readonly valid: boolean;
    readonly violations: readonly string[];
    readonly warnings: readonly string[];
    readonly topology: DeepConvectionTopology;
    readonly featureOwnership: readonly DeepConvectionFeatureOwnership[];
    readonly sourceContracts: DeepConvectionPhenomenonSourceContracts;
    readonly perspective: DeepConvectionPerspectiveQualification | null;
}

const allFinite = (values: readonly number[]) => values.every(Number.isFinite);

export const qualifyDeepConvection = (
    descriptor: DeepConvectionDescriptor,
    perspective?: DeepConvectionPerspective,
): DeepConvectionQualification => {
    const violations: string[] = [];
    const warnings: string[] = [];
    const environment = descriptor.environment;
    if (!(environment.cloudBaseKm > 0 &&
        environment.freezingLevelKm > environment.cloudBaseKm &&
        environment.equilibriumLevelKm > environment.freezingLevelKm)) {
        violations.push("environment-levels-must-order-base-freezing-equilibrium");
    }
    if (environment.tropopauseKm < environment.freezingLevelKm) {
        violations.push("tropopause-cannot-be-below-freezing-level");
    }
    if (environment.capeJoulesPerKilogram <= 0) {
        violations.push("deep-convection-requires-positive-cape");
    }
    if (descriptor.cloudTopKm < descriptor.liquidCoreTopKm ||
        descriptor.cloudTopKm > Math.max(environment.equilibriumLevelKm,
            environment.tropopauseKm) + 2.6) {
        violations.push("cloud-top-outside-equilibrium-overshoot-envelope");
    }
    if (descriptor.mixedPhaseBottomKm >= descriptor.mixedPhaseTopKm) {
        violations.push("mixed-phase-layer-must-have-positive-depth");
    }
    const speciesContract = DEEP_CONVECTION_SPECIES_DESCRIPTORS[
        descriptor.species
    ];
    if (descriptor.glaciation01 < speciesContract.glaciationRange01[0] - 1e-6 ||
        descriptor.glaciation01 > speciesContract.glaciationRange01[1] + 1e-6) {
        violations.push("species-glaciation-outside-wmo-morphology-range");
    }
    if (descriptor.lifecycleStage === "developing" &&
        descriptor.downdraftStrength01 > 0.18) {
        violations.push("developing-cell-cannot-be-downdraft-dominant");
    }
    if (descriptor.lifecycleStage === "precipitating" &&
        (descriptor.precipitationStrength01 < 0.08 ||
            descriptor.downdraftStrength01 < 0.08)) {
        violations.push("precipitating-stage-requires-fallout-and-downdraft");
    }
    if (descriptor.lifecycleStage === "decaying" &&
        descriptor.updraftStrength01 > descriptor.downdraftStrength01 + 0.06) {
        violations.push("decaying-stage-must-not-remain-updraft-dominant");
    }
    if (descriptor.overshootHeightKm > 0 &&
        descriptor.updraftStrength01 <= 0.64) {
        violations.push("overshooting-top-requires-strong-updraft");
    }
    const boundary = descriptor.systemBoundary;
    if (boundary.closure !== "finite-closed-condensate-support" ||
        !allFinite([...boundary.horizontalBoundsKm,
            ...boundary.verticalBoundsKm,
            ...boundary.interfaceThicknessKm])) {
        violations.push("storm-boundary-must-be-finite-and-closed");
    }
    if (boundary.horizontalBoundsKm[0] >= boundary.horizontalBoundsKm[1] ||
        boundary.horizontalBoundsKm[2] >= boundary.horizontalBoundsKm[3] ||
        boundary.verticalBoundsKm[0] >= boundary.verticalBoundsKm[1]) {
        violations.push("storm-boundary-extents-must-have-positive-volume");
    }
    if (boundary.interfaceThicknessKm[0] <= 0 ||
        boundary.interfaceThicknessKm[1] <= boundary.interfaceThicknessKm[0]) {
        violations.push("thermodynamic-interface-must-have-multiscale-thickness");
    }

    const topology = resolveDeepConvectionTopology(descriptor);
    const regionIds = new Set(topology.regions.map(({ id }) => id));
    for (const region of topology.regions) {
        if (region.parentId !== null && !regionIds.has(region.parentId)) {
            violations.push("orphan-topology-region:" + region.id);
        }
        if (!allFinite([...region.centreKm, ...region.halfExtentsKm,
            ...region.motionMetresPerSecond])) {
            violations.push("non-finite-topology-region:" + region.id);
        }
        if (region.halfExtentsKm.some((extent) => extent <= 0)) {
            violations.push("non-positive-topology-extent:" + region.id);
        }
    }
    for (const path of topology.attachmentPaths) {
        if (!regionIds.has(path.from) || !regionIds.has(path.to)) {
            violations.push("attachment-path-has-missing-endpoint:" + path.id);
        }
    }
    if (descriptor.species === "capillatus" && !regionIds.has("ice-crown")) {
        violations.push("capillatus-requires-attached-ice-crown");
    }
    if (descriptor.overshootHeightKm > 0 && !regionIds.has("overshooting-top")) {
        violations.push("overshoot-must-be-attached-to-ice-crown");
    }

    const featureOwnership = resolveDeepConvectionFeatureOwnership(descriptor);
    const presentFeatures = new Set(featureOwnership.filter(({ present }) =>
        present).map(({ feature }) => feature));
    for (const feature of featureOwnership) {
        if (feature.present && !feature.requiredOwnerRegions.every((owner) =>
            regionIds.has(owner))) {
            violations.push("present-feature-has-no-active-owner:" + feature.feature);
        }
        if (feature.present && feature.parentFeature !== null &&
            !presentFeatures.has(feature.parentFeature)) {
            violations.push("present-feature-has-no-parent-feature:" +
                feature.feature);
        }
        if (descriptor.requestedFeatures?.includes(feature.feature) &&
            !feature.present) {
            warnings.push("requested-feature-not-physically-eligible:" +
                feature.feature);
        }
    }
    if (presentFeatures.has("incus") && descriptor.species !== "capillatus") {
        violations.push("incus-cannot-belong-to-calvus");
    }

    const sourceContracts = resolveDeepConvectionSourceContracts(descriptor);
    for (const phenomenon of DEEP_CONVECTION_PHENOMENA) {
        const source = sourceContracts[phenomenon];
        if (source.active && !regionIds.has(source.sourceRegion)) {
            violations.push("active-source-has-no-owner:" + phenomenon);
        }
        if (source.active && source.sourceAltitudeRangeKm[0] >
            source.sourceAltitudeRangeKm[1]) {
            violations.push("source-altitude-range-is-inverted:" + phenomenon);
        }
    }
    if (descriptor.lifecycleStage === "developing" &&
        (sourceContracts.hail.active || sourceContracts.lightning.active)) {
        violations.push("developing-stage-cannot-source-hail-or-lightning");
    }
    if (sourceContracts.lightning.active &&
        sourceContracts.lightning.chargeRegions.length < 2) {
        violations.push("lightning-requires-separated-charge-reservoirs");
    }
    if (sourceContracts.virga.active &&
        sourceContracts.virga.reachesGroundFraction01 !== 0) {
        violations.push("virga-cannot-reach-ground");
    }

    for (let index = 0; index <= 24; index += 1) {
        const sample = sampleDeepConvectionMicrophysics(descriptor, {
            normalizedAltitude01: index / 24,
            normalizedRadialDistance01: 0.2,
        });
        const fractionSum = Object.values(sample.phaseFractions).reduce(
            (sum, value) => sum + value, 0);
        if (Math.abs(fractionSum - 1) > 1e-9) {
            violations.push("microphysics-fractions-do-not-normalize");
            break;
        }
        if (!allFinite(Object.values(sample.phaseFractions)) ||
            Object.values(sample.phaseFractions).some((value) =>
                value < 0 || value > 1)) {
            violations.push("microphysics-fractions-out-of-range");
            break;
        }
    }

    const perspectiveQualification = perspective
        ? qualifyDeepConvectionPerspective(descriptor, perspective) : null;
    if (perspectiveQualification && !perspectiveQualification.valid) {
        violations.push(...perspectiveQualification.violations.map((violation) =>
            "perspective:" + violation));
    }

    return {
        valid: violations.length === 0,
        violations: [...new Set(violations)],
        warnings: [...new Set(warnings)],
        topology,
        featureOwnership,
        sourceContracts,
        perspective: perspectiveQualification,
    };
};

export interface CreateDeepConvectionAtProgressInput extends Omit<
    CreateDeepConvectionDescriptorInput,
    "lifecycleStage" | "stageProgress01"
> {
    readonly lifecycleProgress01: number;
}

export const createDeepConvectionDescriptorAtProgress = (
    input: CreateDeepConvectionAtProgressInput,
): DeepConvectionDescriptor => {
    const stage = deepConvectionStageAtProgress(input.lifecycleProgress01);
    const range = DEEP_CONVECTION_LIFECYCLE_DESCRIPTORS[stage].progressRange01;
    const stageProgress01 = clamp01(
        (clamp01(input.lifecycleProgress01) - range[0]) /
        Math.max(1e-6, range[1] - range[0]),
    );
    return createDeepConvectionDescriptor({
        ...input,
        lifecycleStage: stage,
        stageProgress01,
    });
};

export interface DeepConvectionArchetype {
    readonly id: string;
    readonly label: string;
    readonly input: CreateDeepConvectionDescriptorInput;
    readonly definingTraits: readonly string[];
}

export const DEEP_CONVECTION_ARCHETYPES = [
    {
        id: "tropical-calvus-growth",
        label: "Humid tropical Cumulonimbus calvus growth",
        input: { environment: "tropical-humid-pulse", lifecycleStage: "developing",
            stageProgress01: 0.7, species: "calvus", organization: "pulse-cell",
            intensity01: 0.76, seed: 11, requestedFeatures: ["pileus"] },
        definingTraits: ["smooth non-fibrous crown", "deep attached liquid tower", "little precipitation"],
    },
    {
        id: "tropical-capillatus-downpour",
        label: "Humid tropical Cumulonimbus capillatus downpour",
        input: { environment: "tropical-humid-pulse", lifecycleStage: "precipitating",
            stageProgress01: 0.42, species: "capillatus", organization: "multicell-cluster",
            intensity01: 0.9, seed: 17, requestedFeatures: ["incus", "arcus", "pannus"] },
        definingTraits: ["high precipitation efficiency", "broad warm rain core", "humid ragged pannus"],
    },
    {
        id: "classic-supercell-incus",
        label: "Classic continental supercell with incus",
        input: { environment: "continental-sheared-supercell", lifecycleStage: "precipitating",
            stageProgress01: 0.3, species: "capillatus", organization: "supercell",
            intensity01: 0.96, seed: 23,
            requestedFeatures: ["incus", "mamma", "murus", "cauda", "flumen"] },
        definingTraits: ["rotating rain-free updraft", "separated precipitation core", "long shear-aligned anvil"],
    },
    {
        id: "tornadic-supercell-base",
        label: "Strongly rotating supercell base with tuba",
        input: { environment: "continental-sheared-supercell", lifecycleStage: "mature",
            stageProgress01: 0.92, species: "capillatus", organization: "supercell",
            intensity01: 1, seed: 29, requestedFeatures: ["murus", "tuba", "flumen"] },
        definingTraits: ["persistent wall cloud", "resolved base vortex", "inflow band above and detached from murus"],
    },
    {
        id: "maritime-multicell-complex",
        label: "Maritime multicell Cumulonimbus complex",
        input: { environment: "maritime-multicell", lifecycleStage: "precipitating",
            stageProgress01: 0.48, species: "capillatus", organization: "multicell-cluster",
            intensity01: 0.82, seed: 31, requestedFeatures: ["incus", "arcus", "pannus"] },
        definingTraits: ["successive attached cells", "dense rain curtain", "humid low cloud shreds"],
    },
    {
        id: "dry-high-base-virga",
        label: "Dry high-base capillatus with virga",
        input: { environment: "dry-high-base-convection", lifecycleStage: "precipitating",
            stageProgress01: 0.2, species: "capillatus", organization: "pulse-cell",
            intensity01: 0.83, seed: 37, requestedFeatures: ["incus"] },
        definingTraits: ["high cloud base", "evaporating fallstreaks", "lower precipitation efficiency"],
    },
    {
        id: "squall-line-arcus",
        label: "Cool-season squall line with attached arcus",
        input: { environment: "cool-season-squall-line", lifecycleStage: "precipitating",
            stageProgress01: 0.64, species: "capillatus", organization: "squall-line",
            intensity01: 0.78, seed: 41, requestedFeatures: ["incus", "arcus", "pannus"] },
        definingTraits: ["finite line-convective manifold", "continuous gust-front ownership", "sheared stratiform outflow"],
    },
    {
        id: "decaying-remnant-anvil",
        label: "Decaying Cumulonimbus with remnant anvil",
        input: { environment: "cool-season-squall-line", lifecycleStage: "decaying",
            stageProgress01: 0.58, species: "capillatus", organization: "multicell-cluster",
            intensity01: 0.68, seed: 47, requestedFeatures: ["incus", "mamma"] },
        definingTraits: ["lost lower liquid core", "downdraft-dominant remnant", "persistent eroding ice outflow"],
    },
] as const satisfies readonly DeepConvectionArchetype[];

export interface DeepConvectionQualificationCase {
    readonly id: string;
    readonly label: string;
    readonly descriptorInput: CreateDeepConvectionDescriptorInput;
    readonly perspectives: readonly DeepConvectionPerspective[];
    readonly requiredRegions: readonly DeepConvectionTopologyRegionId[];
    readonly requiredFeatures: readonly DeepConvectionFeature[];
    readonly requiredSources: readonly DeepConvectionPhenomenon[];
    readonly forbiddenSources: readonly DeepConvectionPhenomenon[];
}

const standardPerspectives = (
    prefix: string,
    fullSystemRangeKm: number,
    studyRangeKm: number,
    includeUnderAnvil: boolean,
): readonly DeepConvectionPerspective[] => [{
    id: prefix + "-wide-full-system",
    label: "Wide semi-ground full-system view",
    framingGoal: "full-system",
    cameraAltitudeKm: 0.08,
    slantRangeKm: fullSystemRangeKm,
    azimuthRelativeToDownwindDegrees: 68,
    verticalFieldOfViewDegrees: 58,
    aspectRatio: 16 / 9,
}, {
    id: prefix + "-normal-tower-study",
    label: "Normal-lens oblique tower study",
    framingGoal: "tower-study",
    cameraAltitudeKm: 0.12,
    slantRangeKm: studyRangeKm,
    azimuthRelativeToDownwindDegrees: 42,
    verticalFieldOfViewDegrees: 42,
    aspectRatio: 3 / 2,
}, includeUnderAnvil ? {
    id: prefix + "-under-anvil-context",
    label: "Immersive under-anvil context",
    framingGoal: "under-anvil",
    cameraAltitudeKm: 0.08,
    slantRangeKm: Math.min(14, studyRangeKm * 0.45),
    azimuthRelativeToDownwindDegrees: 8,
    verticalFieldOfViewDegrees: 66,
    aspectRatio: 16 / 9,
} : {
    id: prefix + "-distant-compressed",
    label: "Distant compressed full-system view",
    framingGoal: "full-system",
    cameraAltitudeKm: 0.15,
    slantRangeKm: fullSystemRangeKm * 1.8,
    azimuthRelativeToDownwindDegrees: 82,
    verticalFieldOfViewDegrees: 30,
    aspectRatio: 16 / 9,
}];

export const DEEP_CONVECTION_QUALIFICATION_CASES = [
    {
        id: "tropical-calvus-development",
        label: "Tropical calvus from a semi-ground wide and compressed view",
        descriptorInput: DEEP_CONVECTION_ARCHETYPES[0].input,
        perspectives: standardPerspectives("tropical-calvus", 42, 27, false),
        requiredRegions: ["liquid-updraft-core", "upper-turret-crown"],
        requiredFeatures: ["pileus"],
        requiredSources: [],
        forbiddenSources: ["hail", "lightning"],
    },
    {
        id: "continental-classic-supercell",
        label: "Continental supercell from wide, oblique, and under-anvil views",
        descriptorInput: DEEP_CONVECTION_ARCHETYPES[2].input,
        perspectives: standardPerspectives("classic-supercell", 118, 52, true),
        requiredRegions: ["mixed-phase-core", "ice-crown", "anvil-outflow",
            "precipitation-core", "downdraft-core", "cold-pool", "gust-front"],
        requiredFeatures: ["incus", "mamma", "murus", "cauda", "flumen"],
        requiredSources: ["rain", "hail", "lightning"],
        forbiddenSources: [],
    },
    {
        id: "maritime-precipitating-multicell",
        label: "Maritime multicell complex across three grounded perspectives",
        descriptorInput: DEEP_CONVECTION_ARCHETYPES[4].input,
        perspectives: standardPerspectives("maritime-multicell", 88, 43, true),
        requiredRegions: ["liquid-updraft-core", "mixed-phase-core",
            "anvil-outflow", "precipitation-core", "gust-front"],
        requiredFeatures: ["incus", "arcus", "pannus"],
        requiredSources: ["rain", "lightning"],
        forbiddenSources: [],
    },
    {
        id: "dry-high-base-virga",
        label: "Dry high-base convection with fully evaporating fallstreaks",
        descriptorInput: DEEP_CONVECTION_ARCHETYPES[5].input,
        perspectives: standardPerspectives("dry-high-base", 92, 46, true),
        requiredRegions: ["mixed-phase-core", "anvil-outflow",
            "precipitation-core", "downdraft-core"],
        requiredFeatures: ["incus"],
        requiredSources: ["rain", "virga"],
        forbiddenSources: [],
    },
    {
        id: "decaying-remnant-outflow",
        label: "Decaying storm and remnant anvil in cool strongly sheared air",
        descriptorInput: DEEP_CONVECTION_ARCHETYPES[7].input,
        perspectives: standardPerspectives("decaying-remnant", 110, 58, true),
        requiredRegions: ["ice-crown", "anvil-outflow", "downdraft-core",
            "cold-pool"],
        requiredFeatures: ["incus", "mamma"],
        requiredSources: ["rain"],
        forbiddenSources: ["hail", "lightning"],
    },
] as const satisfies readonly DeepConvectionQualificationCase[];

export interface DeepConvectionCaseQualification {
    readonly valid: boolean;
    readonly violations: readonly string[];
    readonly descriptor: DeepConvectionDescriptor;
    readonly perspectives: readonly DeepConvectionPerspectiveQualification[];
}

export const qualifyDeepConvectionCase = (
    qualificationCase: DeepConvectionQualificationCase,
): DeepConvectionCaseQualification => {
    const descriptor = createDeepConvectionDescriptor(
        qualificationCase.descriptorInput,
    );
    const baseQualification = qualifyDeepConvection(descriptor);
    const violations = [...baseQualification.violations];
    const regions = new Set(baseQualification.topology.regions.map(({ id }) => id));
    const features = new Set(baseQualification.featureOwnership
        .filter(({ present }) => present).map(({ feature }) => feature));
    for (const region of qualificationCase.requiredRegions) {
        if (!regions.has(region)) violations.push("missing-required-region:" + region);
    }
    for (const feature of qualificationCase.requiredFeatures) {
        if (!features.has(feature)) violations.push("missing-required-feature:" + feature);
    }
    for (const phenomenon of qualificationCase.requiredSources) {
        if (!baseQualification.sourceContracts[phenomenon].active) {
            violations.push("missing-required-source:" + phenomenon);
        }
    }
    for (const phenomenon of qualificationCase.forbiddenSources) {
        if (baseQualification.sourceContracts[phenomenon].active) {
            violations.push("forbidden-source-active:" + phenomenon);
        }
    }
    const perspectiveQualifications = qualificationCase.perspectives.map(
        (perspective) => qualifyDeepConvectionPerspective(descriptor, perspective),
    );
    perspectiveQualifications.forEach((qualification, index) => {
        if (!qualification.valid) {
            violations.push(...qualification.violations.map((violation) =>
                "perspective-" + String(index) + ":" + violation));
        }
    });
    return {
        valid: violations.length === 0,
        violations: [...new Set(violations)],
        descriptor,
        perspectives: perspectiveQualifications,
    };
};

export const qualifyAllDeepConvectionCases = () =>
    DEEP_CONVECTION_QUALIFICATION_CASES.map(qualifyDeepConvectionCase);

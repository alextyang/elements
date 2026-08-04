import {
    CLOUD_GENUS_LEVEL,
    WMO_CLOUD_SPECIES,
    EMPTY_LAYER,
    constrainScene,
    createLayer,
    type CloudGenus,
    type CloudScene,
} from "./cloud-scene";
import {
    CLOUD_ACCESSORY_GENERA,
    CLOUD_FEATURE_GENERA,
    CLOUD_PRECIPITATION_GENERA,
    CLOUD_MOTHER_GENUS_RELATIONS,
    CLOUD_SPECIAL_ORIGIN_GENERA,
    CLOUD_VARIETY_GENERA,
    WMO_SPECIES_BY_GENUS,
    classificationFromRendererSpecies,
    rendererSpeciesForClassification,
    type CloudAccessory,
    type CloudClassification,
    type CloudLifecycleStage,
    type CloudPrecipitationKind,
    type CloudSpecialOrigin,
    type CloudSupplementaryFeature,
    type CloudVariety,
    type UpperAtmosphericCloud,
    type WmoCloudGenus,
} from "./cloud-state-map";
import type { HydrometeorSceneOverrides } from "./hydrometeor-system";
import {
    createCloudSpecialOriginSource,
    type CloudSpecialOriginSource,
    type CloudSpecialOriginDesignation,
} from "./cloud-special-origin-source";
import { HIGH_CLOUD_SPECIES_DESCRIPTORS } from "./high-cloud-physical-foundation";
import { MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS } from "./middle-cloud-physical-foundation";
import { LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS } from "./low-layered-cloud-physical-foundation";
import { UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS } from "./upper-atmospheric-cloud-foundation";
import {
    cirrostratusRepresentationFor,
    lowLayeredCloudRepresentationFor,
    middleCloudRepresentationFor,
} from "./cloud-family-admissibility";
import {
    createCloudSystemRuntime,
    estimateCloudPopulationProjection,
} from "./cloud-system-runtime";

/**
 * Lazy physical qualification map for the whole weather domain.
 *
 * This is intentionally not an eager array of screenshots. The finite causal
 * previews reuse the CPU projection path only to select a stable physical
 * range; projection values never enter density, opacity, or GPU state. The review
 * harness can iterate one case, await a completed cloud transport frame, and
 * release it before requesting the next case.  It also keeps unsupported WMO
 * states visible as explicit implementation gaps instead of silently dropping
 * them from a green benchmark.
 *
 * Primary taxonomy:
 * https://cloudatlas.wmo.int/cloud-classification-summary.html
 * https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html
 */

export type WeatherQualificationAxis =
    | "species"
    | "variety"
    | "supplementary-feature"
    | "accessory-cloud"
    | "precipitation"
    | "convective-lifecycle"
    | "mother-cloud"
    | "special-origin"
    | "surface-obscuration"
    | "upper-atmospheric"
    | "multilayer";

export type QualificationPrecipitationKind = CloudPrecipitationKind |
    "snow-grains" | "snow-pellets" | "ice-pellets";

export type WeatherImplementationStatus =
    | "packed"
    | "operator-active"
    | "transport-attached"
    | "photographically-qualified"
    | "not-representable";

export interface QualificationEnvironment {
    id: string;
    label: string;
    solarElevationDegrees: number;
    latitude: number;
    /** 0 winter, 0.5 equinox, 1 local summer. */
    season: number;
    relativeHumidity: number;
    surfaceTemperatureKelvin: number;
    aerosolOpticalDepth: number;
    aerosolType: "clean" | "maritime" | "dust" | "smoke" | "sulfate" | "pollution";
    /** Ångström exponent: low for coarse sea salt/dust, high for fine smoke. */
    aerosolAngstromExponent: number;
    aerosolSingleScatteringAlbedo: number;
    stratosphericAerosolOpticalDepth: number;
    ozoneDobsonUnits: number;
    surfaceAlbedo: number;
    surfaceVisibilityKm: number;
    windSpeedMetersPerSecond: number;
    boundaryLayer: "stable" | "neutral" | "convective";
    freezingLevelKm: number;
    stratosphericTemperatureKelvin: number;
    /** Summer polar mesopause temperature controlling NLC ice reachability. */
    mesopauseTemperatureKelvin: number;
    moonElevationDegrees: number;
    moonIlluminatedFraction: number;
    moonRelativeAzimuthDegrees: number;
    artificialSkyglow: number;
    lighting: "front" | "side" | "back" | "diffuse" | "moon" |
        "moonless" | "twilight";
}

export interface QualificationPerspective {
    id: string;
    label: string;
    observerAltitudeKm: number;
    viewElevationDegrees: number;
    horizontalFieldOfViewDegrees: number;
    range: "near" | "natural" | "distant";
    purpose: string;
}

interface QualificationTargetBase {
    id: string;
    axis: WeatherQualificationAxis;
    label: string;
    environments: readonly string[];
    perspectives: readonly string[];
    cues: readonly string[];
    source: string;
    implementation: WeatherImplementationStatus;
}

export interface CloudQualificationTarget extends QualificationTargetBase {
    kind: "cloud";
    classification: CloudClassification;
    precipitationKind?: QualificationPrecipitationKind;
    lifecycleStage?: CloudLifecycleStage;
}

export interface SurfaceObscurationQualificationTarget extends QualificationTargetBase {
    kind: "surface-obscuration";
    obscuration: "fog" | "mist" | "ice-fog" | "diamond-dust";
    visibilityKm: readonly [number, number];
    depthKm: readonly [number, number];
}

export interface UpperAtmosphericQualificationTarget extends QualificationTargetBase {
    kind: "upper-atmospheric";
    upperCloud: Exclude<UpperAtmosphericCloud, "none">;
    altitudeKm: readonly [number, number];
    absoluteLatitudeDegrees: readonly [number, number];
    season: "winter" | "summer";
    solarDepressionDegrees: readonly [number, number];
}

export interface MultilayerQualificationTarget extends QualificationTargetBase {
    kind: "multilayer";
    systems: readonly {
        classification: CloudClassification;
        baseAltitudeKm: number;
        topAltitudeKm: number;
        relation: "independent" | "mother" | "embedded" | "genitus" | "mutatus";
        causalParent?: {
            layerIndex: number;
            systemIndex?: number;
            systemId?: string;
        };
        transitionProgress?: number;
    }[];
}

export type WeatherQualificationTarget =
    | CloudQualificationTarget
    | SurfaceObscurationQualificationTarget
    | UpperAtmosphericQualificationTarget
    | MultilayerQualificationTarget;

export interface WeatherQualificationCase {
    id: string;
    target: WeatherQualificationTarget;
    environment: QualificationEnvironment;
    perspective: QualificationPerspective;
}

export interface ResolvedQualificationAtmosphere {
    aerosolType: QualificationEnvironment["aerosolType"];
    aerosolOpticalDepth550: number;
    aerosolAngstromExponent: number;
    aerosolSingleScatteringAlbedo: number;
    stratosphericAerosolOpticalDepth: number;
    ozoneDobsonUnits: number;
    relativeHumidity: number;
    visibilityKm: number;
}

export interface ResolvedQualificationIllumination {
    solarElevationDegrees: number;
    lighting: QualificationEnvironment["lighting"];
    moonElevationDegrees: number;
    moonIlluminatedFraction: number;
    moonRelativeAzimuthDegrees: number;
    artificialSkyglow: number;
    /** 0 day/full twilight, 1 pristine astronomical darkness. */
    darkness: number;
}

export interface ResolvedWeatherQualificationState {
    cloudScene: CloudScene;
    classifications: readonly CloudClassification[];
    atmosphere: ResolvedQualificationAtmosphere;
    illumination: ResolvedQualificationIllumination;
    surface: {
        temperatureKelvin: number;
        albedo: number;
        visibilityKm: number;
        windSpeedMetersPerSecond: number;
        boundaryLayer: QualificationEnvironment["boundaryLayer"];
        freezingLevelKm: number;
    };
    phenomena: readonly string[];
    /** Executable per-family state that CloudScene's scalar precipitation cannot carry. */
    hydrometeors: HydrometeorSceneOverrides;
    /** Morphology which still needs a dedicated volume/optics shader operator. */
    remainingRendererDependencies: readonly string[];
}

type QualificationEnvironmentSeed = Pick<QualificationEnvironment,
    "id" | "label" | "solarElevationDegrees" | "latitude" | "season" |
    "relativeHumidity" | "surfaceTemperatureKelvin" |
    "aerosolOpticalDepth" | "lighting"> &
    Partial<Omit<QualificationEnvironment,
        "id" | "label" | "solarElevationDegrees" | "latitude" | "season" |
        "relativeHumidity" | "surfaceTemperatureKelvin" |
        "aerosolOpticalDepth" | "lighting">>;

const qualificationEnvironment = (
    seed: QualificationEnvironmentSeed,
): QualificationEnvironment => ({
    aerosolType: "clean",
    aerosolAngstromExponent: 1.15,
    aerosolSingleScatteringAlbedo: 0.96,
    stratosphericAerosolOpticalDepth: 0.004,
    ozoneDobsonUnits: 310,
    surfaceAlbedo: 0.2,
    surfaceVisibilityKm: 80,
    windSpeedMetersPerSecond: 6,
    boundaryLayer: "neutral",
    freezingLevelKm: 2.6,
    stratosphericTemperatureKelvin: 205,
    mesopauseTemperatureKelvin: 190,
    moonElevationDegrees: -20,
    moonIlluminatedFraction: 0,
    moonRelativeAzimuthDegrees: 120,
    artificialSkyglow: 0,
    ...seed,
});

export const WEATHER_QUALIFICATION_ENVIRONMENTS: readonly QualificationEnvironment[] = [
    qualificationEnvironment({ id: "clean-midday-front", label: "Clean midday front light", solarElevationDegrees: 58, latitude: 34, season: 0.85, relativeHumidity: 0.34, surfaceTemperatureKelvin: 297, aerosolOpticalDepth: 0.08, lighting: "front", boundaryLayer: "convective", freezingLevelKm: 3.6, surfaceVisibilityKm: 110 }),
    qualificationEnvironment({ id: "clean-midday-side", label: "Clean midday side light", solarElevationDegrees: 48, latitude: 44, season: 0.78, relativeHumidity: 0.42, surfaceTemperatureKelvin: 292, aerosolOpticalDepth: 0.1, lighting: "side", boundaryLayer: "convective", freezingLevelKm: 3.0 }),
    qualificationEnvironment({ id: "golden-backlight", label: "Golden-hour backlight", solarElevationDegrees: 5, latitude: 34, season: 0.8, relativeHumidity: 0.58, surfaceTemperatureKelvin: 291, aerosolOpticalDepth: 0.22, lighting: "back", aerosolType: "pollution", aerosolAngstromExponent: 1.45, aerosolSingleScatteringAlbedo: 0.91, surfaceVisibilityKm: 24 }),
    qualificationEnvironment({ id: "humid-marine", label: "Humid marine daylight", solarElevationDegrees: 42, latitude: 26, season: 0.9, relativeHumidity: 0.9, surfaceTemperatureKelvin: 300, aerosolOpticalDepth: 0.17, lighting: "side", aerosolType: "maritime", aerosolAngstromExponent: 0.48, aerosolSingleScatteringAlbedo: 0.99, surfaceVisibilityKm: 28, boundaryLayer: "neutral", freezingLevelKm: 4.7, surfaceAlbedo: 0.08, windSpeedMetersPerSecond: 9 }),
    qualificationEnvironment({ id: "diffuse-overcast", label: "Diffuse overcast", solarElevationDegrees: 27, latitude: 51, season: 0.62, relativeHumidity: 0.98, surfaceTemperatureKelvin: 282, aerosolOpticalDepth: 0.2, lighting: "diffuse", aerosolType: "maritime", aerosolAngstromExponent: 0.7, aerosolSingleScatteringAlbedo: 0.99, surfaceVisibilityKm: 12, boundaryLayer: "stable", freezingLevelKm: 1.5 }),
    qualificationEnvironment({ id: "twilight-afterglow", label: "Clean civil-twilight afterglow", solarElevationDegrees: -5, latitude: 37, season: 0.72, relativeHumidity: 0.63, surfaceTemperatureKelvin: 287, aerosolOpticalDepth: 0.14, lighting: "twilight", aerosolType: "maritime", aerosolAngstromExponent: 0.75, aerosolSingleScatteringAlbedo: 0.98, surfaceVisibilityKm: 45 }),
    qualificationEnvironment({ id: "blue-nautical-twilight", label: "Blue nautical twilight", solarElevationDegrees: -10, latitude: 46, season: 0.58, relativeHumidity: 0.46, surfaceTemperatureKelvin: 281, aerosolOpticalDepth: 0.055, lighting: "twilight", surfaceVisibilityKm: 120, ozoneDobsonUnits: 350, moonElevationDegrees: -12 }),
    qualificationEnvironment({ id: "sulfate-afterglow", label: "Volcanic sulfate afterglow", solarElevationDegrees: -7, latitude: 42, season: 0.56, relativeHumidity: 0.38, surfaceTemperatureKelvin: 285, aerosolOpticalDepth: 0.12, lighting: "twilight", aerosolType: "sulfate", aerosolAngstromExponent: 1.8, aerosolSingleScatteringAlbedo: 0.995, stratosphericAerosolOpticalDepth: 0.12, surfaceVisibilityKm: 90 }),
    qualificationEnvironment({ id: "smoke-sunset", label: "Absorbing smoke sunset", solarElevationDegrees: 2, latitude: 40, season: 0.9, relativeHumidity: 0.3, surfaceTemperatureKelvin: 300, aerosolOpticalDepth: 0.65, lighting: "back", aerosolType: "smoke", aerosolAngstromExponent: 1.72, aerosolSingleScatteringAlbedo: 0.84, surfaceVisibilityKm: 9, boundaryLayer: "stable" }),
    qualificationEnvironment({ id: "desert-dust-golden", label: "Coarse desert-dust golden light", solarElevationDegrees: 8, latitude: 27, season: 0.86, relativeHumidity: 0.16, surfaceTemperatureKelvin: 309, aerosolOpticalDepth: 0.42, lighting: "side", aerosolType: "dust", aerosolAngstromExponent: 0.22, aerosolSingleScatteringAlbedo: 0.9, surfaceVisibilityKm: 16, boundaryLayer: "convective", surfaceAlbedo: 0.36, freezingLevelKm: 5.0 }),
    qualificationEnvironment({ id: "pristine-moonless", label: "Pristine moonless astronomical night", solarElevationDegrees: -30, latitude: 35, season: 0.64, relativeHumidity: 0.26, surfaceTemperatureKelvin: 276, aerosolOpticalDepth: 0.025, lighting: "moonless", aerosolAngstromExponent: 1.0, aerosolSingleScatteringAlbedo: 0.98, surfaceVisibilityKm: 180, surfaceAlbedo: 0.12, boundaryLayer: "stable", moonElevationDegrees: -28, moonIlluminatedFraction: 0.04 }),
    qualificationEnvironment({ id: "crescent-night", label: "Low crescent nautical night", solarElevationDegrees: -16, latitude: 31, season: 0.72, relativeHumidity: 0.38, surfaceTemperatureKelvin: 280, aerosolOpticalDepth: 0.045, lighting: "moon", surfaceVisibilityKm: 120, moonElevationDegrees: 14, moonIlluminatedFraction: 0.14, moonRelativeAzimuthDegrees: 38 }),
    qualificationEnvironment({ id: "quarter-moon-clean", label: "High quarter-Moon clean night", solarElevationDegrees: -25, latitude: 41, season: 0.54, relativeHumidity: 0.35, surfaceTemperatureKelvin: 276, aerosolOpticalDepth: 0.04, lighting: "moon", surfaceVisibilityKm: 150, moonElevationDegrees: 52, moonIlluminatedFraction: 0.5, moonRelativeAzimuthDegrees: 72 }),
    qualificationEnvironment({ id: "full-moon-maritime", label: "Full-Moon humid maritime night", solarElevationDegrees: -28, latitude: 28, season: 0.82, relativeHumidity: 0.78, surfaceTemperatureKelvin: 288, aerosolOpticalDepth: 0.13, lighting: "moon", aerosolType: "maritime", aerosolAngstromExponent: 0.5, aerosolSingleScatteringAlbedo: 0.99, surfaceVisibilityKm: 38, surfaceAlbedo: 0.1, moonElevationDegrees: 58, moonIlluminatedFraction: 0.99, moonRelativeAzimuthDegrees: 18 }),
    qualificationEnvironment({ id: "urban-moonless", label: "Moonless urban skyglow", solarElevationDegrees: -27, latitude: 40, season: 0.54, relativeHumidity: 0.62, surfaceTemperatureKelvin: 284, aerosolOpticalDepth: 0.24, lighting: "moonless", aerosolType: "pollution", aerosolAngstromExponent: 1.5, aerosolSingleScatteringAlbedo: 0.9, surfaceVisibilityKm: 18, artificialSkyglow: 0.58, moonElevationDegrees: -15, moonIlluminatedFraction: 0.06 }),
    qualificationEnvironment({ id: "dark-moonlight", label: "Dark gibbous moonlight", solarElevationDegrees: -24, latitude: 35, season: 0.72, relativeHumidity: 0.48, surfaceTemperatureKelvin: 282, aerosolOpticalDepth: 0.07, lighting: "moon", surfaceVisibilityKm: 90, moonElevationDegrees: 34, moonIlluminatedFraction: 0.74, moonRelativeAzimuthDegrees: 55 }),
    qualificationEnvironment({ id: "tropical-convection", label: "Tropical deep-convective air", solarElevationDegrees: 51, latitude: 12, season: 0.9, relativeHumidity: 0.88, surfaceTemperatureKelvin: 304, aerosolOpticalDepth: 0.16, lighting: "side", aerosolType: "maritime", aerosolAngstromExponent: 0.62, aerosolSingleScatteringAlbedo: 0.99, boundaryLayer: "convective", freezingLevelKm: 4.9, windSpeedMetersPerSecond: 12, surfaceVisibilityKm: 32 }),
    qualificationEnvironment({ id: "orographic-wave", label: "Stable mountain-wave air", solarElevationDegrees: 24, latitude: 46, season: 0.48, relativeHumidity: 0.62, surfaceTemperatureKelvin: 279, aerosolOpticalDepth: 0.09, lighting: "side", boundaryLayer: "stable", windSpeedMetersPerSecond: 22, freezingLevelKm: 1.7, surfaceAlbedo: 0.3 }),
    qualificationEnvironment({ id: "polar-winter-twilight", label: "Polar winter twilight", solarElevationDegrees: -7, latitude: 70, season: 0.08, relativeHumidity: 0.5, surfaceTemperatureKelvin: 246, aerosolOpticalDepth: 0.04, lighting: "twilight", surfaceAlbedo: 0.72, freezingLevelKm: 0, stratosphericTemperatureKelvin: 184, surfaceVisibilityKm: 110 }),
    qualificationEnvironment({ id: "polar-summer-twilight", label: "Polar summer twilight", solarElevationDegrees: -11, latitude: 62, season: 0.92, relativeHumidity: 0.5, surfaceTemperatureKelvin: 276, aerosolOpticalDepth: 0.04, lighting: "twilight", surfaceAlbedo: 0.2, freezingLevelKm: 1.0, mesopauseTemperatureKelvin: 145, surfaceVisibilityKm: 130 }),
    qualificationEnvironment({ id: "polar-snow-moonlight", label: "Polar snowfield moonlight", solarElevationDegrees: -26, latitude: 68, season: 0.1, relativeHumidity: 0.42, surfaceTemperatureKelvin: 244, aerosolOpticalDepth: 0.03, lighting: "moon", surfaceAlbedo: 0.82, freezingLevelKm: 0, moonElevationDegrees: 26, moonIlluminatedFraction: 0.93, moonRelativeAzimuthDegrees: 28, surfaceVisibilityKm: 150 }),
    qualificationEnvironment({ id: "cold-surface-calm", label: "Cold calm surface layer", solarElevationDegrees: -3, latitude: 66, season: 0.12, relativeHumidity: 0.99, surfaceTemperatureKelvin: 239, aerosolOpticalDepth: 0.05, lighting: "twilight", surfaceAlbedo: 0.76, surfaceVisibilityKm: 0.04, windSpeedMetersPerSecond: 0.8, boundaryLayer: "stable", freezingLevelKm: 0 }),
] as const;

export const WEATHER_QUALIFICATION_PERSPECTIVES: readonly QualificationPerspective[] = [
    { id: "horizon-wide", label: "Low horizon wide", observerAltitudeKm: 0.02, viewElevationDegrees: 7, horizontalFieldOfViewDegrees: 96, range: "distant", purpose: "Finite weather-system boundaries, fronts and aerial perspective." },
    { id: "oblique-natural", label: "Natural oblique", observerAltitudeKm: 0.05, viewElevationDegrees: 27, horizontalFieldOfViewDegrees: 64, range: "natural", purpose: "Canonical ground-observer morphology and lighting." },
    { id: "zenith-wide", label: "Wide uplook", observerAltitudeKm: 0.02, viewElevationDegrees: 72, horizontalFieldOfViewDegrees: 84, range: "near", purpose: "Underside structure, spatial organization and cloud ownership." },
    { id: "distant-telephoto", label: "Distant telephoto", observerAltitudeKm: 0.03, viewElevationDegrees: 12, horizontalFieldOfViewDegrees: 32, range: "distant", purpose: "Scale hierarchy, storm silhouettes and wave geometry." },
    { id: "near-uplook", label: "Near-field uplook", observerAltitudeKm: 0.01, viewElevationDegrees: 48, horizontalFieldOfViewDegrees: 70, range: "near", purpose: "Boundary texture, self-shadow and attached accessory clouds." },
    { id: "elevated-above-low-deck", label: "Elevated above low deck", observerAltitudeKm: 1.8, viewElevationDegrees: -3, horizontalFieldOfViewDegrees: 74, range: "natural", purpose: "Cloud-top structure, fog/Stratus equivalence and layer separation." },
] as const;

const GENERAL_ENVIRONMENTS = [
    "clean-midday-front", "clean-midday-side", "golden-backlight",
    "humid-marine", "twilight-afterglow", "blue-nautical-twilight",
    "pristine-moonless", "crescent-night", "quarter-moon-clean", "full-moon-maritime",
    "dark-moonlight", "sulfate-afterglow", "smoke-sunset",
    "desert-dust-golden", "urban-moonless", "polar-snow-moonlight",
] as const;
const GENERAL_PERSPECTIVES = [
    "horizon-wide", "oblique-natural", "zenith-wide", "distant-telephoto",
] as const;
const WMO_CLASSIFICATION_SOURCE =
    "https://cloudatlas.wmo.int/cloud-classification-summary.html";
const WMO_FEATURE_SOURCE =
    "https://cloudatlas.wmo.int/principles-of-cloud-classification-supplementary-features-and-accessory-clouds.html";

const DEFAULT_SPECIES = {
    cirrus: "cirrus-fibratus",
    cirrocumulus: "cirrocumulus-stratiformis",
    cirrostratus: "cirrostratus-nebulosus",
    altocumulus: "altocumulus-stratiformis",
    altostratus: "altostratus-opacus",
    nimbostratus: "nimbostratus-praecipitatio",
    stratocumulus: "stratocumulus-stratiformis",
    stratus: "stratus-nebulosus",
    cumulus: "cumulus-congestus",
    cumulonimbus: "cumulonimbus-capillatus",
} as const;

const replaceClassificationAxes = (
    base: CloudClassification,
    axes: Partial<Pick<CloudClassification,
        "varieties" | "supplementaryFeatures" | "accessoryClouds" | "origin">>,
): CloudClassification => ({ ...base, ...axes } as CloudClassification);

const classificationForGenus = (
    genus: WmoCloudGenus,
    axes: Partial<Pick<CloudClassification,
        "varieties" | "supplementaryFeatures" | "accessoryClouds" | "origin">> = {},
) => replaceClassificationAxes(
    classificationFromRendererSpecies(DEFAULT_SPECIES[genus]),
    axes,
);

const supportForClassification = (
    classification: CloudClassification,
): WeatherImplementationStatus => {
    if (!rendererSpeciesForClassification(classification)) return "not-representable";
    // An exact family recipe plus selected morphology operator is stronger
    // than packed metadata, but it does not by itself prove host transport or
    // photographic agreement.
    return "operator-active";
};

const speciesTargets: CloudQualificationTarget[] = [
    ...WMO_CLOUD_SPECIES.map((species): CloudQualificationTarget => {
        if (species === "generic") {
            throw new Error("The canonical WMO species list cannot contain generic.");
        }
        const classification = classificationFromRendererSpecies(species);
        return {
            kind: "cloud", id: `species-${species}`, axis: "species",
            label: species.replaceAll("-", " "), classification,
            environments: GENERAL_ENVIRONMENTS,
            perspectives: GENERAL_PERSPECTIVES,
            cues: ["Species-specific macroshape", "Correct angular scale", "Finite aperiodic organization", "Phase-appropriate edge texture"],
            source: WMO_CLASSIFICATION_SOURCE,
            implementation: "transport-attached",
        };
    }),
    ...(["altostratus", "nimbostratus"] as const).map((genus): CloudQualificationTarget => {
        const classification = classificationForGenus(genus);
        return {
            kind: "cloud", id: `genus-${genus}`, axis: "species",
            label: `${genus} (genus has no species)`, classification,
            environments: GENERAL_ENVIRONMENTS,
            perspectives: GENERAL_PERSPECTIVES,
            cues: ["Continuous physically bounded shield", "Layer-depth variation", "No invented cellular species texture"],
            source: WMO_CLASSIFICATION_SOURCE,
            implementation: "transport-attached",
        };
    }),
];

const varietyTargets: CloudQualificationTarget[] = (
    Object.entries(CLOUD_VARIETY_GENERA) as [CloudVariety, CloudGenus[]][]
).flatMap(([variety, genera]) => genera
    .filter((genus): genus is WmoCloudGenus => genus !== "clear")
    .map((genus): CloudQualificationTarget => {
        const classification = classificationForGenus(genus, { varieties: [variety] });
        return {
            kind: "cloud", id: `variety-${genus}-${variety}`, axis: "variety",
            label: `${genus} ${variety}`, classification,
            environments: ["clean-midday-side", "golden-backlight", "diffuse-overcast"],
            perspectives: variety === "radiatus" ? ["horizon-wide", "oblique-natural"]
                : variety === "duplicatus" ? ["oblique-natural", "distant-telephoto"]
                    : ["oblique-natural", "zenith-wide"],
            cues: ["Variety changes organization or optical transmission, not genus identity", "No screen-space mask surrogate"],
            source: WMO_CLASSIFICATION_SOURCE,
            implementation: supportForClassification(classification),
        };
    }));

const featureTargets: CloudQualificationTarget[] = (
    Object.entries(CLOUD_FEATURE_GENERA) as [CloudSupplementaryFeature, CloudGenus[]][]
).flatMap(([feature, genera]) => genera
    .filter((genus): genus is WmoCloudGenus => genus !== "clear")
    .map((genus): CloudQualificationTarget => {
        const features: CloudSupplementaryFeature[] = feature === "cauda"
            ? ["murus", "cauda"] : [feature];
        const classification = classificationForGenus(genus, {
            supplementaryFeatures: features,
        });
        return {
            kind: "cloud", id: `feature-${genus}-${feature}`,
            axis: "supplementary-feature", label: `${genus} ${feature}`,
            classification,
            lifecycleStage: feature === "mamma" || feature === "asperitas"
                ? "decaying" : undefined,
            environments: feature === "incus" || feature === "arcus" ||
                feature === "murus" || feature === "cauda" || feature === "tuba"
                ? ["tropical-convection", "golden-backlight", "dark-moonlight"]
                : ["clean-midday-side", "golden-backlight", "diffuse-overcast"],
            perspectives: feature === "mamma" || feature === "asperitas"
                ? ["zenith-wide", "near-uplook"]
                : ["oblique-natural", "distant-telephoto"],
            cues: ["Feature remains physically attached to its owner", "Scale and phase inherit the parent system", "Feature survives front/side/back-light comparison"],
            source: WMO_FEATURE_SOURCE,
            implementation: supportForClassification(classification),
        };
    }));

const accessoryTargets: CloudQualificationTarget[] = (
    Object.entries(CLOUD_ACCESSORY_GENERA) as [CloudAccessory, CloudGenus[]][]
).flatMap(([accessory, genera]) => genera
    .filter((genus): genus is WmoCloudGenus => genus !== "clear")
    .map((genus): CloudQualificationTarget => {
        const classification = classificationForGenus(genus, {
            accessoryClouds: [accessory],
        });
        return {
            kind: "cloud", id: `accessory-${genus}-${accessory}`,
            axis: "accessory-cloud", label: `${genus} ${accessory}`,
            classification,
            lifecycleStage: accessory === "pileus" || accessory === "velum"
                ? "growing" : undefined,
            environments: accessory === "flumen"
                ? ["tropical-convection", "golden-backlight"]
                : ["clean-midday-side", "golden-backlight", "diffuse-overcast"],
            perspectives: ["oblique-natural", "near-uplook", "distant-telephoto"],
            cues: accessory === "flumen"
                ? ["Finite inflow band moves toward a supercell", "Base remains above and detached from murus"]
                : ["Accessory is separately resolved but parent-owned", "Relative altitude and scale match the WMO definition"],
            source: WMO_FEATURE_SOURCE,
            implementation: supportForClassification(classification),
        };
    }));

const precipitationTargets: CloudQualificationTarget[] = (
    Object.entries(CLOUD_PRECIPITATION_GENERA) as [CloudPrecipitationKind, CloudGenus[]][]
).flatMap(([precipitationKind, genera]) => precipitationKind === "none" ? [] : genera
    .filter((genus): genus is WmoCloudGenus => genus !== "clear")
    // Stratocumulus can carry drizzle microphysics internally, but production
    // deliberately transports its explicit falling precipitation as rain.
    // The old standalone drizzle row therefore duplicated the Sc wet-weather
    // state while resolving to no hydrometeor field. Keep the canonical cloud
    // state valid for mamma/open-cell microphysics, but omit the inoperable
    // preview/qualification identity.
    .filter((genus) => !(precipitationKind === "drizzle" &&
        genus === "stratocumulus"))
    .map((genus): CloudQualificationTarget => {
        const feature: CloudSupplementaryFeature = precipitationKind === "virga"
            ? "virga" : "praecipitatio";
        const classification = classificationForGenus(genus, {
            supplementaryFeatures: [feature],
        });
        return {
            kind: "cloud", id: `precipitation-${genus}-${precipitationKind}`,
            axis: "precipitation", label: `${genus} ${precipitationKind}`,
            classification, precipitationKind,
            environments: precipitationKind === "snow"
                ? ["diffuse-overcast", "polar-winter-twilight"]
                : precipitationKind === "hail" || precipitationKind === "shower"
                    ? ["tropical-convection", "golden-backlight"]
                    : ["humid-marine", "diffuse-overcast", "golden-backlight"],
            perspectives: ["horizon-wide", "oblique-natural", "near-uplook"],
            cues: ["Hydrometeors originate inside finite parent condensate", "Fall speed, phase and evaporation are physically coupled", "No precipitation outside the parent footprint"],
            source: "https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html",
            implementation: rendererSpeciesForClassification(classification)
                ? "transport-attached" : "not-representable",
        };
    }));

/** WMO hydrometeors carried by the expanded scene-to-runtime override ABI. */
const extendedPrecipitationGenera = {
    "snow-grains": ["stratus"],
    "snow-pellets": ["stratocumulus", "cumulus", "cumulonimbus"],
    "ice-pellets": ["altostratus", "nimbostratus"],
} as const satisfies Record<
    Exclude<QualificationPrecipitationKind, CloudPrecipitationKind>,
    readonly WmoCloudGenus[]
>;

const extendedPrecipitationTargets: CloudQualificationTarget[] = (
    Object.entries(extendedPrecipitationGenera) as [
        Exclude<QualificationPrecipitationKind, CloudPrecipitationKind>,
        readonly WmoCloudGenus[],
    ][]
).flatMap(([precipitationKind, genera]) => genera.map((genus) => {
    const classification = classificationForGenus(genus, {
        supplementaryFeatures: ["praecipitatio"],
    });
    return {
        kind: "cloud",
        id: `precipitation-${genus}-${precipitationKind}`,
        axis: "precipitation",
        label: `${genus} ${precipitationKind}`,
        classification,
        precipitationKind,
        // Every extended solid-particle target carries praecipitatio, so the
        // particles must survive to the surface. Warm tropical/diffuse cases
        // belong in an aloft-only phase benchmark, not this ground-reaching
        // qualification axis.
        environments: ["polar-winter-twilight", "polar-snow-moonlight"],
        perspectives: ["horizon-wide", "oblique-natural", "near-uplook"],
        cues: ["Particle phase and fall behaviour remain distinct from generic snow", "Hydrometeors remain parent-owned", "Surface survival follows the freezing profile"],
        source: "https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html",
        implementation: "transport-attached",
    };
}));

const lifecycleDefinitions: readonly [
    CloudLifecycleStage, WmoCloudGenus, string, readonly string[],
][] = [
    ["incipient", "cumulus", "cumulus-humilis", ["nascent thermals", "small water-droplet bodies"]],
    ["growing", "cumulus", "cumulus-congestus", ["successive buoyant turrets", "increasing vertical scale"]],
    ["mature", "cumulonimbus", "cumulonimbus-calvus", ["coherent deep tower", "smooth upper dome beginning to glaciate"]],
    ["glaciating", "cumulonimbus", "cumulonimbus-capillatus", ["fibrous upper transition", "storm-owned outflow"]],
    ["precipitating", "cumulonimbus", "cumulonimbus-capillatus", ["source-connected shower core", "cold-pool outflow"]],
    ["decaying", "cumulonimbus", "cumulonimbus-capillatus-incus", ["weakening tower", "persistent sheared anvil and precipitation remnants"]],
] as const;

const lifecycleTargets: CloudQualificationTarget[] = lifecycleDefinitions.map(
    ([lifecycleStage, , rendererSpecies, cues]): CloudQualificationTarget => ({
        kind: "cloud", id: `lifecycle-${lifecycleStage}`,
        axis: "convective-lifecycle", label: `Convective ${lifecycleStage}`,
        classification: classificationFromRendererSpecies(
            rendererSpecies as Parameters<typeof classificationFromRendererSpecies>[0]),
        lifecycleStage,
        environments: ["tropical-convection", "golden-backlight", "twilight-afterglow"],
        perspectives: ["horizon-wide", "oblique-natural", "distant-telephoto"],
        cues, source: "https://cloudatlas.wmo.int/en/species-cumulonimbus-capillatus-cb-cap.html",
        implementation: "transport-attached",
    }),
);

const specialOriginTargets: CloudQualificationTarget[] = (
    Object.entries(CLOUD_SPECIAL_ORIGIN_GENERA) as [
        Exclude<CloudSpecialOrigin, "natural">, CloudGenus[],
    ][]
).flatMap(([designation, genera]) => genera
    .filter((genus): genus is WmoCloudGenus => genus !== "clear")
    .map((genus): CloudQualificationTarget => {
        const aircraftOrigin = designation === "homomutatus" ||
            designation === "homogenitus" && genus === "cirrus";
        const baseClassification = classificationForGenus(genus, {
            origin: {
                kind: "special", designation,
                ...(aircraftOrigin
                    ? { source: "aircraft-condensation-trail" as const }
                    : {}),
            },
        });
        const classification: CloudClassification =
            designation === "homogenitus" && genus === "cirrus"
                ? {
                    ...baseClassification,
                    species: null,
                    varieties: [],
                    supplementaryFeatures: [],
                } as CloudClassification
                : baseClassification;
        return {
            kind: "cloud", id: `origin-${genus}-${designation}`,
            axis: "special-origin", label: `${genus} ${designation}`,
            classification,
            environments: designation === "cataractagenitus" || designation === "silvagenitus"
                ? ["humid-marine", "diffuse-overcast"]
                : ["clean-midday-side", "golden-backlight", "twilight-afterglow"],
            perspectives: ["oblique-natural", "distant-telephoto"],
            cues: ["Generating source determines finite placement and material", "Cloud evolves into its WMO genus without retaining a generic plume stamp"],
            source: "https://cloudatlas.wmo.int/en/clouds-special.html",
            implementation: designation === "flammagenitus" ||
                designation === "homogenitus" && genus !== "cirrus"
                ? "operator-active" : "transport-attached",
        };
    }));

const motherCloudDefinitions: readonly (readonly [
    WmoCloudGenus, "genitus" | "mutatus", WmoCloudGenus,
])[] = (Object.entries(CLOUD_MOTHER_GENUS_RELATIONS) as [
    WmoCloudGenus,
    (typeof CLOUD_MOTHER_GENUS_RELATIONS)[WmoCloudGenus],
][]).flatMap(([genus, relations]) =>
    (["genitus", "mutatus"] as const).flatMap((relation) =>
        relations[relation].map((motherGenus) =>
            [genus, relation, motherGenus] as const)));

const motherCloudTargets: CloudQualificationTarget[] = motherCloudDefinitions.map(
    ([genus, relation, motherGenus]): CloudQualificationTarget => {
        const classification = classificationForGenus(genus, {
            origin: { kind: relation, motherGenus },
        });
        return {
            kind: "cloud", id: `mother-${genus}-${motherGenus}-${relation}`,
            axis: "mother-cloud", label: `${genus} ${motherGenus}${relation}`,
            classification,
            environments: ["clean-midday-side", "golden-backlight", "diffuse-overcast"],
            perspectives: ["horizon-wide", "oblique-natural", "distant-telephoto"],
            cues: relation === "genitus"
                ? ["Extension remains causally attached before separation", "Mother and child use one wind/shear history"]
                : ["Large-scale internal transformation is continuous", "No cross-faded independent stamps"],
            source: "https://cloudatlas.wmo.int/principles-of-cloud-classification-mother-clouds.html",
            implementation: "transport-attached",
        };
    },
);

const surfaceObscurationTargets: SurfaceObscurationQualificationTarget[] = [
    { kind: "surface-obscuration", id: "obscuration-fog", axis: "surface-obscuration", label: "Liquid fog", obscuration: "fog", visibilityKm: [0.03, 0.999], depthKm: [0.01, 0.6], environments: ["humid-marine", "diffuse-overcast"], perspectives: ["horizon-wide", "elevated-above-low-deck"], cues: ["Visibility below 1 km", "Continuous terrain contact", "Top resembles smooth Stratus from above"], source: "https://cloudatlas.wmo.int/fog-compared-with-mist.html", implementation: "transport-attached" },
    { kind: "surface-obscuration", id: "obscuration-mist", axis: "surface-obscuration", label: "Mist", obscuration: "mist", visibilityKm: [1, 10], depthKm: [0.005, 0.25], environments: ["humid-marine", "twilight-afterglow"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Visibility remains at least 1 km", "Thin grey veil", "Low contrast without opaque whitening"], source: "https://cloudatlas.wmo.int/fog-compared-with-mist.html", implementation: "transport-attached" },
    { kind: "surface-obscuration", id: "obscuration-ice-fog", axis: "surface-obscuration", label: "Ice fog", obscuration: "ice-fog", visibilityKm: [0.01, 0.5], depthKm: [0.005, 0.2], environments: ["cold-surface-calm"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["2-30 micrometre irregular ice particles", "Very cold clear calm air", "No invented halo from ice fog alone"], source: "https://cloudatlas.wmo.int/ice-fog.html", implementation: "transport-attached" },
    { kind: "surface-obscuration", id: "obscuration-diamond-dust", axis: "surface-obscuration", label: "Diamond dust", obscuration: "diamond-dust", visibilityKm: [1, 40], depthKm: [0.02, 1.2], environments: ["cold-surface-calm", "polar-snow-moonlight"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Sparse suspended ice crystals remain individually unresolved", "Pillars and halos arise only from source/crystal orientation", "Clear-sky precipitation does not become an opaque fog bank"], source: "https://cloudatlas.wmo.int/en/diamond-dust.html", implementation: "transport-attached" },
];

const upperAtmosphericTargets: UpperAtmosphericQualificationTarget[] = [
    { kind: "upper-atmospheric", id: "upper-psc-type-ib-sts", axis: "upper-atmospheric", label: "PSC Type Ib (STS)", upperCloud: "polar-stratospheric-sts", altitudeKm: [15, 30], absoluteLatitudeDegrees: [60, 90], season: "winter", solarDepressionDegrees: [-4, 9], environments: ["polar-winter-twilight"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Supercooled ternary solution droplets in polar-vortex cold air", "Finite synoptic or gravity-wave support", "Weak liquid-particle angular colour rather than a nacreous rainbow"], source: "https://doi.org/10.1029/2007JD008616", implementation: "transport-attached" },
    { kind: "upper-atmospheric", id: "upper-psc-type-ia-nat", axis: "upper-atmospheric", label: "PSC Type Ia (NAT)", upperCloud: "polar-stratospheric-nat", altitudeKm: [15, 30], absoluteLatitudeDegrees: [60, 90], season: "winter", solarDepressionDegrees: [-4, 9], environments: ["polar-winter-twilight"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Solid nitric-acid-trihydrate particle state", "Aspherical-particle provenance retained for future polarization", "Thin finite vortex ribbons or mountain-wave patches"], source: "https://doi.org/10.1029/2007JD008616", implementation: "transport-attached" },
    { kind: "upper-atmospheric", id: "upper-psc-type-ii-ice", axis: "upper-atmospheric", label: "PSC Type II water ice", upperCloud: "polar-stratospheric-ice", altitudeKm: [18, 30], absoluteLatitudeDegrees: [60, 90], season: "winter", solarDepressionDegrees: [-4, 9], environments: ["polar-winter-twilight"], perspectives: ["horizon-wide", "distant-telephoto"], cues: ["Water-ice PSC below the stratospheric frost point", "Finite stationary wave crests", "Spectral ice material without forcing a conspicuous nacreous display"], source: "https://cloudatlas.wmo.int/nacreous-clouds.html", implementation: "transport-attached" },
    { kind: "upper-atmospheric", id: "upper-nacreous", axis: "upper-atmospheric", label: "Nacreous ice PSC display", upperCloud: "nacreous", altitudeKm: [18, 30], absoluteLatitudeDegrees: [60, 90], season: "winter", solarDepressionDegrees: [1, 9], environments: ["polar-winter-twilight"], perspectives: ["horizon-wide", "distant-telephoto"], cues: ["Visible Type II ice PSC below the frost point", "Mother-of-pearl diffraction coloration follows view/source geometry", "Very thin high-altitude stationary wave structure"], source: "https://cloudatlas.wmo.int/nacreous-clouds.html", implementation: "transport-attached" },
    { kind: "upper-atmospheric", id: "upper-noctilucent", axis: "upper-atmospheric", label: "Noctilucent cloud", upperCloud: "noctilucent", altitudeKm: [80, 85], absoluteLatitudeDegrees: [50, 70], season: "summer", solarDepressionDegrees: [6, 16], environments: ["polar-summer-twilight"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Mesopause altitude", "Sunlit against a dark lower atmosphere", "Fine wave bands rather than tropospheric cirrus"], source: "https://cloudatlas.wmo.int/en/upper-atmospheric-clouds.html", implementation: "transport-attached" },
];

const layer = (
    rendererSpecies: Parameters<typeof classificationFromRendererSpecies>[0],
    baseAltitudeKm: number,
    topAltitudeKm: number,
    relation: MultilayerQualificationTarget["systems"][number]["relation"] =
        "independent",
) => ({
    classification: classificationFromRendererSpecies(rendererSpecies),
    baseAltitudeKm,
    topAltitudeKm,
    relation,
});

const relatedLayer = (
    rendererSpecies: Parameters<typeof classificationFromRendererSpecies>[0],
    baseAltitudeKm: number,
    topAltitudeKm: number,
    relation: "genitus" | "mutatus",
    motherGenus: WmoCloudGenus,
    causalParent: NonNullable<
        MultilayerQualificationTarget["systems"][number]["causalParent"]
    >,
    transitionProgress?: number,
) => {
    const classification = classificationFromRendererSpecies(rendererSpecies);
    return {
        classification: {
            ...classification,
            origin: { kind: relation, motherGenus },
        } as CloudClassification,
        baseAltitudeKm,
        topAltitudeKm,
        relation,
        causalParent,
        ...(transitionProgress === undefined ? {} : { transitionProgress }),
    };
};

const multilayerTargets: MultilayerQualificationTarget[] = [
    { id: "multilayer-warm-front", label: "Advancing warm-front transformation", systems: [layer("altostratus-opacus", 3.2, 7.5, "mother"), relatedLayer("cirrostratus-fibratus", 7.0, 10.2, "mutatus", "altostratus", { layerIndex: 1, systemIndex: 0 }, 0.56)], environments: ["diffuse-overcast", "twilight-afterglow"], perspectives: ["horizon-wide", "oblique-natural"], cues: ["Cs transformation shares the upper Altostratus interface", "Condensate is partitioned across one continuous mutatus manifold"] },
    { id: "multilayer-marine-boundary", label: "Marine boundary layer and high ice", systems: [layer("stratocumulus-stratiformis", 0.6, 1.5), layer("cirrus-fibratus", 8.2, 9.2)], environments: ["humid-marine", "golden-backlight"], perspectives: ["oblique-natural", "elevated-above-low-deck"], cues: ["Independent winds and aerial perspective", "High fibres remain visible only through real low-layer gaps"] },
    { id: "multilayer-orographic-waves", label: "Multiple orographic wave levels", systems: [layer("stratocumulus-lenticularis", 1.1, 1.7), layer("altocumulus-lenticularis", 3.6, 4.4), layer("cirrocumulus-lenticularis", 7.8, 8.2)], environments: ["orographic-wave"], perspectives: ["horizon-wide", "distant-telephoto"], cues: ["Terrain-relative stationary phase", "Scale and optical phase change with altitude", "No repeated saucer grid"] },
    { id: "multilayer-convective-anvil", label: "Deep storm and daughter anvil", systems: [layer("cumulonimbus-capillatus-incus", 0.7, 13.5, "mother"), relatedLayer("cirrus-spissatus", 11.2, 13.8, "genitus", "cumulonimbus", { layerIndex: 0, systemIndex: 0 })], environments: ["tropical-convection", "golden-backlight", "twilight-afterglow"], perspectives: ["horizon-wide", "distant-telephoto", "near-uplook"], cues: ["Tower, incus, precipitation and daughter Cirrus share one lifecycle", "The daughter crosses the storm perimeter with inherited ice and upper wind"] },
    { id: "multilayer-elevated-instability", label: "Stable low deck under elevated instability", systems: [layer("stratus-nebulosus", 0.15, 0.55), layer("altocumulus-castellanus", 3.4, 4.8)], environments: ["diffuse-overcast", "twilight-afterglow"], perspectives: ["oblique-natural", "zenith-wide"], cues: ["Low stable sheet and mid-level turrets retain independent formation manifolds", "No shared rigid motion"] },
    { id: "multilayer-postfrontal-cells", label: "Postfrontal cellular layers", systems: [layer("stratocumulus-stratiformis", 0.7, 1.6), layer("altocumulus-stratiformis", 3.2, 4.0), layer("cirrus-uncinus", 8.8, 10.0)], environments: ["clean-midday-side", "golden-backlight"], perspectives: ["oblique-natural", "zenith-wide"], cues: ["Angular element scale separates Sc, Ac and Ci", "Independent wind/shear prevents duplicated grids"] },
    { id: "multilayer-precipitation-pannus", label: "Precipitating shield with pannus", systems: [layer("stratus-fractus", 0.15, 0.45, "embedded"), layer("nimbostratus-praecipitatio", 0.8, 5.5)], environments: ["diffuse-overcast", "dark-moonlight"], perspectives: ["horizon-wide", "near-uplook"], cues: ["Pannus/fractus forms in the humid precipitation layer", "Rain curtains remain parent-owned and depth ordered"] },
] .map((target): MultilayerQualificationTarget => ({
    kind: "multilayer", axis: "multilayer",
    source: WMO_CLASSIFICATION_SOURCE,
    implementation: "transport-attached",
    ...target,
}));

export const WEATHER_QUALIFICATION_TARGETS: readonly WeatherQualificationTarget[] = [
    ...speciesTargets,
    ...varietyTargets,
    ...featureTargets,
    ...accessoryTargets,
    ...precipitationTargets,
    ...extendedPrecipitationTargets,
    ...lifecycleTargets,
    ...motherCloudTargets,
    ...specialOriginTargets,
    ...surfaceObscurationTargets,
    ...upperAtmosphericTargets,
    ...multilayerTargets,
];

export interface QualificationValidationIssue {
    targetId: string;
    code: string;
    message: string;
}

const environmentById = new Map(
    WEATHER_QUALIFICATION_ENVIRONMENTS.map((environment) => [environment.id, environment]),
);
const perspectiveById = new Map(
    WEATHER_QUALIFICATION_PERSPECTIVES.map((perspective) => [perspective.id, perspective]),
);

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));

const seedForQualification = (value: string): [number, number, number, number] => {
    let state = 0x811c9dc5;
    const values: number[] = [];
    for (let index = 0; index < 4; index += 1) {
        for (const character of `${value}:${index}`) {
            state ^= character.charCodeAt(0);
            state = Math.imul(state, 0x01000193);
        }
        values.push((state >>> 0) / 0x1_0000_0000);
    }
    return values as [number, number, number, number];
};

/** Stable Earth-local forward meridian used by the qualification camera. */
export const QUALIFICATION_FORWARD_MERIDIAN_RADIANS = 0;
/** Curated owners remain physically near that meridian, never frame-authored. */
export const QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS = 0.18;
const QUALIFICATION_VIEW_ELEVATION_RADIANS = 27 * Math.PI / 180;
const QUALIFICATION_VERTICAL_FOV_RADIANS = 64 * 0.68 * Math.PI / 180;
const QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS =
    QUALIFICATION_VIEW_ELEVATION_RADIANS -
    QUALIFICATION_VERTICAL_FOV_RADIANS * 0.5;
const QUALIFICATION_MAXIMUM_FRAME_ELEVATION_RADIANS =
    QUALIFICATION_VIEW_ELEVATION_RADIANS +
    QUALIFICATION_VERTICAL_FOV_RADIANS * 0.5;

const qualificationEditorialBearing = (
    identity: string,
    physicalRoleOffset = 0,
) => clamp(
    QUALIFICATION_FORWARD_MERIDIAN_RADIANS +
        (seedForQualification(`${identity}:editorial-bearing`)[0] - 0.5) *
            0.08 + physicalRoleOffset,
    QUALIFICATION_FORWARD_MERIDIAN_RADIANS -
        QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS,
    QUALIFICATION_FORWARD_MERIDIAN_RADIANS +
        QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS,
);

const qualificationMultilayerBearing = (
    targetId: string,
    index: number,
    systemCount: number,
    layerIndex: 0 | 1 | 2,
    relation: "independent" | "mother" | "embedded" | "genitus" |
        "mutatus" | undefined,
) => {
    const altitudeRole = (layerIndex - 1) * 0.045;
    const ordinalRole = (index - (systemCount - 1) * 0.5) * 0.018;
    const causalRole = relation === "mother" ? -0.012
        : relation === "genitus" || relation === "mutatus" ? 0.012
            : relation === "embedded" ? -0.018 : 0;
    return qualificationEditorialBearing(
        `${targetId}:multilayer`,
        altitudeRole + ordinalRole + causalRole,
    );
};

const specialOriginTerminalRangeKm = (
    source: CloudSpecialOriginSource,
) => {
    const activeAgeSeconds = Math.min(
        source.ageSeconds,
        source.activeLifetimeSeconds,
    );
    const displacementKm = source.advectionSpeedMps *
        activeAgeSeconds / 1000;
    return Math.hypot(
        source.geometry.centerEastKm +
            Math.cos(source.advectionDirection) * displacementKm,
        source.geometry.centerNorthKm +
            Math.sin(source.advectionDirection) * displacementKm,
    );
};

const qualificationSpecialOriginMaximumOwnerRadiiKm = (
    source: CloudSpecialOriginSource,
) => {
    const major = source.geometry.majorRadiusKm;
    const minor = source.geometry.minorRadiusKm;
    if (source.kind === "waterfall-spray") {
        return {
            major: clamp(major * 4.4, 0.2, 2.4),
            minor: clamp(minor * 3.2, 0.2, 2.4),
        };
    }
    if (source.kind === "forest-evapotranspiration") {
        const ownerMajor = clamp(major * 0.94, 1.2, 32);
        return {
            major: ownerMajor,
            minor: clamp(minor * 1.04, 0.8, ownerMajor),
        };
    }
    if (source.kind === "industrial-thermal") {
        const ownerMajor = clamp(Math.max(major * 2.2, 4), 0.35, 9);
        return {
            major: ownerMajor,
            minor: clamp(Math.max(minor * 1.8, 3), 0.25, ownerMajor),
        };
    }
    if (source.kind === "aircraft-exhaust-line" ||
        source.kind === "aircraft-aerodynamic-line") {
        const ownerMajor = clamp(major * 0.42, 1, 65);
        return {
            major: ownerMajor,
            minor: clamp(minor * 9, 0.2, Math.min(4, ownerMajor)),
        };
    }
    if (source.kind === "persistent-contrail-field") {
        const ownerMajor = clamp(major * 0.82, 18, 260);
        return {
            major: ownerMajor,
            minor: clamp(minor * 1.35, 2, Math.min(80, ownerMajor)),
        };
    }
    const ownerMajor = clamp(Math.max(major * 2.4, 12), 1, 85);
    return {
        major: ownerMajor,
        minor: clamp(Math.max(minor * 2, 8), 0.8, ownerMajor),
    };
};

const qualificationSpecialOriginNominalOwnerRadiiKm = (
    source: CloudSpecialOriginSource,
) => {
    const major = source.geometry.majorRadiusKm;
    const minor = source.geometry.minorRadiusKm;
    if (source.kind === "waterfall-spray") {
        const ownerMajor = clamp(major * 2.9, 0.2, 2.4);
        return {
            major: ownerMajor,
            minor: clamp(minor * 2.2, 0.2, ownerMajor),
        };
    }
    if (source.kind === "forest-evapotranspiration") {
        const ownerMajor = clamp(major * 0.76, 1.2, 32);
        return {
            major: ownerMajor,
            minor: clamp(minor * 0.83, 0.8, ownerMajor),
        };
    }
    if (source.kind === "industrial-thermal") {
        const ownerMajor = clamp(Math.max(major * 2.2, 2), 0.35, 9);
        return {
            major: ownerMajor,
            minor: clamp(Math.max(minor * 1.8, 1.4), 0.25, ownerMajor),
        };
    }
    if (source.kind === "aircraft-exhaust-line" ||
        source.kind === "aircraft-aerodynamic-line") {
        const ownerMajor = clamp(major * 0.3, 1, 65);
        return {
            major: ownerMajor,
            minor: clamp(minor * 5.75, 0.2, Math.min(4, ownerMajor)),
        };
    }
    if (source.kind === "persistent-contrail-field") {
        const ownerMajor = clamp(major * 0.62, 18, 260);
        return {
            major: ownerMajor,
            minor: clamp(minor * 1.025, 2, Math.min(80, ownerMajor)),
        };
    }
    const ownerMajor = clamp(Math.max(major * 2.4, 8), 1, 85);
    return {
        major: ownerMajor,
        minor: clamp(Math.max(minor * 2, 5), 0.8, ownerMajor),
    };
};

const qualificationSpecialOriginFootprint = (
    source: CloudSpecialOriginSource,
) => {
    const activeAgeSeconds = Math.min(
        source.ageSeconds,
        source.activeLifetimeSeconds,
    );
    const displacementKm = source.advectionSpeedMps *
        activeAgeSeconds / 1000;
    const terminalEastKm = source.geometry.centerEastKm +
        Math.cos(source.advectionDirection) * displacementKm;
    const terminalNorthKm = source.geometry.centerNorthKm +
        Math.sin(source.advectionDirection) * displacementKm;
    const terminalRangeKm = Math.max(
        0.25,
        Math.hypot(terminalEastKm, terminalNorthKm),
    );
    const radial = [
        terminalEastKm / terminalRangeKm,
        terminalNorthKm / terminalRangeKm,
    ] as const;
    const lateral = [radial[1], -radial[0]] as const;
    const alongAxis = [
        Math.cos(source.geometry.orientation),
        Math.sin(source.geometry.orientation),
    ] as const;
    const crossAxis = [-alongAxis[1], alongAxis[0]] as const;
    const alongOffsetKm = source.geometry.kind === "point"
        ? 0 : source.geometry.majorRadiusKm * 0.72;
    const crossOffsetKm = source.geometry.minorRadiusKm *
        (source.geometry.kind === "point" ? 0.35 : 0.68);
    const projectedOffset = (axis: readonly [number, number],
        direction: readonly [number, number]) => Math.abs(
        axis[0] * direction[0] + axis[1] * direction[1]
    );
    const maximumLateralCenterOffsetKm =
        projectedOffset(alongAxis, lateral) * alongOffsetKm +
        projectedOffset(crossAxis, lateral) * crossOffsetKm;
    const maximumRadialCenterOffsetKm =
        projectedOffset(alongAxis, radial) * alongOffsetKm +
        projectedOffset(crossAxis, radial) * crossOffsetKm;
    const maximumOwnerRadiiKm =
        qualificationSpecialOriginMaximumOwnerRadiiKm(source);
    const nominalOwnerRadiiKm =
        qualificationSpecialOriginNominalOwnerRadiiKm(source);
    // Line-source owners retain 92% of the authored source orientation.  The
    // oriented bounds therefore preserve the complete long-axis result while
    // avoiding the fictitious circular footprint produced by applying the
    // major radius in every direction.
    const maximumRadialOwnerExtentKm =
        projectedOffset(alongAxis, radial) * maximumOwnerRadiiKm.major +
        projectedOffset(crossAxis, radial) * maximumOwnerRadiiKm.minor;
    const maximumLateralOwnerExtentKm =
        projectedOffset(alongAxis, lateral) * maximumOwnerRadiiKm.major +
        projectedOffset(crossAxis, lateral) * maximumOwnerRadiiKm.minor;
    const nominalRadialOwnerExtentKm =
        projectedOffset(alongAxis, radial) * nominalOwnerRadiiKm.major +
        projectedOffset(crossAxis, radial) * nominalOwnerRadiiKm.minor;
    const nominalLateralOwnerExtentKm =
        projectedOffset(alongAxis, lateral) * nominalOwnerRadiiKm.major +
        projectedOffset(crossAxis, lateral) * nominalOwnerRadiiKm.minor;
    const minimumHorizontalRangeKm = Math.max(
        0.25,
        terminalRangeKm - maximumRadialCenterOffsetKm -
            maximumRadialOwnerExtentKm,
    );
    const maximumHorizontalRangeKm = terminalRangeKm +
        maximumRadialCenterOffsetKm + maximumRadialOwnerExtentKm;
    const horizontalHalfWidth = Math.atan2(
        maximumLateralCenterOffsetKm + maximumLateralOwnerExtentKm,
        minimumHorizontalRangeKm,
    );
    return {
        horizontalHalfWidth,
        minimumHorizontalRangeKm,
        maximumHorizontalRangeKm,
        nominalHorizontalHalfWidth: Math.atan2(
            maximumLateralCenterOffsetKm * 0.5 +
                nominalLateralOwnerExtentKm,
            Math.max(
                0.25,
                terminalRangeKm - maximumRadialCenterOffsetKm * 0.5 -
                    nominalRadialOwnerExtentKm,
            ),
        ),
        nominalMinimumHorizontalRangeKm: Math.max(
            0.25,
            terminalRangeKm - maximumRadialCenterOffsetKm * 0.5 -
                nominalRadialOwnerExtentKm,
        ),
        nominalMaximumHorizontalRangeKm: terminalRangeKm +
            maximumRadialCenterOffsetKm * 0.5 +
            nominalRadialOwnerExtentKm,
        normalizedSourceSpan: (
            source.geometry.majorRadiusKm + source.geometry.minorRadiusKm
        ) / terminalRangeKm,
    };
};

const qualificationSpecialOriginProjectedEnvelopeFraction = (
    source: CloudSpecialOriginSource,
    layer: ReturnType<typeof createLayer>,
    footprint: ReturnType<typeof qualificationSpecialOriginFootprint>,
) => {
    const baseAltitudeKm = layer.baseAltitude / 1000;
    const topAltitudeKm = (layer.baseAltitude + layer.thickness) / 1000;
    const minimumElevation = Math.atan2(
        baseAltitudeKm,
        footprint.nominalMaximumHorizontalRangeKm,
    );
    const maximumElevation = Math.atan2(
        topAltitudeKm,
        footprint.nominalMinimumHorizontalRangeKm,
    );
    const clippedVerticalSpan = Math.max(0,
        Math.min(maximumElevation,
            QUALIFICATION_MAXIMUM_FRAME_ELEVATION_RADIANS) -
        Math.max(minimumElevation,
            QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS));
    const activeAgeSeconds = Math.min(
        source.ageSeconds,
        source.activeLifetimeSeconds,
    );
    const displacementKm = source.advectionSpeedMps *
        activeAgeSeconds / 1000;
    const terminalBearing = Math.atan2(
        source.geometry.centerEastKm +
            Math.cos(source.advectionDirection) * displacementKm,
        source.geometry.centerNorthKm +
            Math.sin(source.advectionDirection) * displacementKm,
    );
    const horizontalHalfFov = 32 * Math.PI / 180;
    const clippedHorizontalSpan = Math.max(0,
        Math.min(
            horizontalHalfFov,
            terminalBearing + footprint.nominalHorizontalHalfWidth,
        ) - Math.max(
            -horizontalHalfFov,
            terminalBearing - footprint.nominalHorizontalHalfWidth,
        ));
    const fill = source.geometry.kind === "point" ? 0.72
        : source.kind === "persistent-contrail-field" ? 0.34
            : source.geometry.kind === "line" ? 0.24 : 0.52;
    return clamp(
        clippedVerticalSpan / QUALIFICATION_VERTICAL_FOV_RADIANS *
        clippedHorizontalSpan / (horizontalHalfFov * 2) * fill,
    );
};

/**
 * Select a real bounded source state whose advected endpoint intersects the
 * fixed qualification lens, then rotate that complete trajectory azimuthally.
 * No accepted source field is shortened, translated, or otherwise mutated.
 */
const createQualificationSpecialOriginSource = ({
    id,
    designation,
    genus,
    deterministicSeed,
    layer,
    editorialTerminalBearing,
}: {
    id: string;
    designation: CloudSpecialOriginDesignation;
    genus: WmoCloudGenus;
    deterministicSeed: number;
    layer: ReturnType<typeof createLayer>;
    editorialTerminalBearing: number;
}) => {
    const baseAltitudeKm = layer.baseAltitude / 1000;
    const topAltitudeKm = (layer.baseAltitude + layer.thickness) / 1000;
    const minimumRangeKm = Math.max(
        0,
        baseAltitudeKm /
            Math.tan(QUALIFICATION_MAXIMUM_FRAME_ELEVATION_RADIANS),
    );
    const maximumRangeKm = topAltitudeKm /
        Math.tan(QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS);
    const preferredElevation = QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS +
        (QUALIFICATION_VIEW_ELEVATION_RADIANS -
            QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS) * 0.15;
    const preferredRangeKm = Math.max(
        0.5,
        (baseAltitudeKm + topAltitudeKm) * 0.5 /
            Math.tan(preferredElevation),
    );
    const requiredSourceKind = createCloudSpecialOriginSource({
        id,
        designation,
        genus,
        deterministicSeed,
    }).kind;
    let selected: CloudSpecialOriginSource | undefined;
    let selectedSeed = deterministicSeed;
    let selectedScore = Number.POSITIVE_INFINITY;
    for (let ordinal = 0; ordinal < 96; ordinal += 1) {
        const candidateSeed = ordinal === 0 ? deterministicSeed : (
            deterministicSeed ^ Math.imul(ordinal, 0x9e3779b1) ^
            Math.imul(ordinal + 17, 0x85ebca6b)
        ) >>> 0;
        const unrotatedCandidate = createCloudSpecialOriginSource({
            id,
            designation,
            genus,
            deterministicSeed: candidateSeed,
        });
        // Candidate selection may vary a state within the chosen physical
        // source profile, but may not swap (for example) a wildfire for a
        // volcanic column or exhaust ice for an aerodynamic condensation line.
        if (unrotatedCandidate.kind !== requiredSourceKind) continue;
        // Qualification previews represent a live causal formation, not the
        // inert position of an emitter after its accepted active lifetime.
        if (unrotatedCandidate.ageSeconds >=
            unrotatedCandidate.activeLifetimeSeconds) continue;
        const candidate = createCloudSpecialOriginSource({
            id,
            designation,
            genus,
            deterministicSeed: candidateSeed,
            editorialTerminalBearing,
        });
        const rangeKm = specialOriginTerminalRangeKm(candidate);
        const outsideFraction = rangeKm < minimumRangeKm
            ? (minimumRangeKm - rangeKm) / Math.max(1, minimumRangeKm)
            : rangeKm > maximumRangeKm
                ? (rangeKm - maximumRangeKm) / Math.max(1, maximumRangeKm)
                : 0;
        const preference = Math.abs(Math.log(
            Math.max(0.25, rangeKm) / preferredRangeKm,
        ));
        const footprint = qualificationSpecialOriginFootprint(candidate);
        const horizontalHalfWidth = footprint.horizontalHalfWidth;
        const safeHorizontalHalfWidth = Math.max(
            8 * Math.PI / 180,
            29 * Math.PI / 180 - Math.abs(editorialTerminalBearing),
        );
        const horizontalOverflow = Math.max(
            0,
            (horizontalHalfWidth - safeHorizontalHalfWidth) /
                safeHorizontalHalfWidth,
        );
        const envelopeRangeOverflow =
            Math.max(
                0,
                (minimumRangeKm - footprint.minimumHorizontalRangeKm) /
                    Math.max(1, minimumRangeKm),
            ) + Math.max(
                0,
                (footprint.maximumHorizontalRangeKm - maximumRangeKm) /
                    Math.max(1, maximumRangeKm),
            );
        const projectedEnvelopeFraction =
            qualificationSpecialOriginProjectedEnvelopeFraction(
                candidate,
                layer,
                footprint,
            );
        const occupiedSkyGate = Math.max(0.0025, layer.coverage * 0.02);
        const targetEnvelopeFraction = Math.max(
            0.025,
            occupiedSkyGate * 2.4,
        );
        const envelopeDeficit = Math.max(
            0,
            (targetEnvelopeFraction - projectedEnvelopeFraction) /
                targetEnvelopeFraction,
        );
        const envelopeExcess = Math.max(
            0,
            (projectedEnvelopeFraction - 0.18) / 0.18,
        );
        const envelopePreference = Math.abs(Math.log(
            Math.max(0.0005, projectedEnvelopeFraction) /
                targetEnvelopeFraction,
        ));
        const lineSpan = candidate.geometry.majorRadiusKm /
            Math.max(0.25, rangeKm);
        const aircraftLineDeficit = candidate.kind ===
            "aircraft-exhaust-line"
            ? Math.max(0, 0.36 - lineSpan) / 0.36
            : 0;
        // Endpoint elevation is the hard physical qualification constraint.
        // The finite source/owner envelope then distinguishes viable states:
        // it discourages a source whose possible result crowds or crosses the
        // complete frame, without allowing that conservative worst case to
        // displace the real trajectory beyond the visible atmospheric slab.
        // Opacity never participates in candidate selection.
        const score = outsideFraction * 1000 + envelopeDeficit * 250 +
            envelopeExcess * 100 + envelopePreference * 12 +
            aircraftLineDeficit * 80 + preference * 2 +
            envelopeRangeOverflow * 0.75 + horizontalOverflow * 4 +
            horizontalHalfWidth * 0.35 +
            footprint.normalizedSourceSpan * 0.4;
        if (score >= selectedScore) continue;
        selected = candidate;
        selectedSeed = candidateSeed;
        selectedScore = score;
    }
    if (!selected) {
        throw new Error(`No deterministic qualification source for ${id}.`);
    }
    return createCloudSpecialOriginSource({
        id,
        designation,
        genus,
        deterministicSeed: selectedSeed,
        editorialTerminalBearing,
    });
};

const GENUS_QUALIFICATION_OKTAS: Record<WmoCloudGenus, number> = {
    cirrus: 3,
    cirrocumulus: 4,
    cirrostratus: 6,
    altocumulus: 4,
    altostratus: 6,
    nimbostratus: 8,
    stratocumulus: 6,
    stratus: 7,
    cumulus: 3,
    cumulonimbus: 4,
};

const SPECIES_DEPTH_KM: Partial<Record<string, number>> = {
    "cirrus-fibratus": 0.8,
    "cirrus-uncinus": 1.2,
    "cirrus-spissatus": 1.8,
    "cirrus-castellanus": 1.4,
    "cirrus-floccus": 1.1,
    "cirrostratus-fibratus": 1.0,
    "cirrostratus-nebulosus": 1.4,
    "altostratus-opacus": 2.4,
    "nimbostratus-praecipitatio": 4.8,
    "stratus-nebulosus": 0.55,
    "stratus-fractus": 0.38,
    "cumulus-humilis": 0.8,
    "cumulus-mediocris": 1.8,
    "cumulus-congestus": 4.5,
    "cumulus-fractus": 0.55,
    "cumulonimbus-calvus": 9.2,
    "cumulonimbus-capillatus": 11.4,
    "cumulonimbus-capillatus-incus": 12.4,
};

const rendererDependencyFor = (
    target: WeatherQualificationTarget,
): readonly string[] => {
    if (target.implementation === "transport-attached" ||
        target.implementation === "photographically-qualified") return [];
    if (target.kind === "surface-obscuration") {
        return target.obscuration === "ice-fog"
            ? ["host binding for finite ice-fog state and sparse crystal draw"]
            : target.obscuration === "diamond-dust"
                ? ["host binding for source-angle glint and sparse crystal draw"]
                : ["photographically qualified near-surface droplet transport"];
    }
    if (target.kind === "upper-atmospheric") {
        return target.upperCloud === "noctilucent"
            ? ["resolved mesospheric ice/wave volume state"]
            : ["polar-stratospheric volume and diffraction optics"];
    }
    if (target.kind === "multilayer") {
        return ["causal attachment between related layer owners"];
    }
    const dependencies: string[] = [];
    if (target.axis === "precipitation") {
        dependencies.push("host binding for species lighting response and sparse particle draw");
    }
    if (target.precipitationKind &&
        !Object.hasOwn(CLOUD_PRECIPITATION_GENERA, target.precipitationKind)) {
        dependencies.push("forward resolved per-layer hydrometeor override into the runtime");
    }
    if (target.axis === "variety") {
        dependencies.push("variety-specific internal organization/optical operator");
    } else if (target.axis === "supplementary-feature") {
        dependencies.push("owner-attached supplementary-feature density operator");
    } else if (target.axis === "accessory-cloud") {
        dependencies.push("owner-attached accessory-cloud volume operator");
    } else if (target.axis === "mother-cloud") {
        dependencies.push("continuous mother/child formation manifold");
    } else if (target.axis === "special-origin") {
        if (target.classification.origin.kind === "special" &&
            (target.classification.origin.designation === "flammagenitus" ||
                target.classification.origin.designation === "homogenitus" &&
                target.classification.genus !== "cirrus")) {
            dependencies.push(
                "spectral transport for non-water smoke/industrial aerosol outside the condensed cloud volume",
            );
        }
    }
    return dependencies;
};

const layerForQualification = (
    target: CloudQualificationTarget,
    environment: QualificationEnvironment,
) => {
    const classification = target.classification;
    const genus = classification.genus;
    // A missing exact orthogonal recipe must not erase the meteorology.  The
    // genus/species base still executes, while the unresolved variety/feature
    // operator remains explicit in `remainingRendererDependencies`.
    const rendererSpecies = rendererSpeciesForClassification(classification) ??
        DEFAULT_SPECIES[genus];
    let oktas = GENUS_QUALIFICATION_OKTAS[genus];
    let opticalDepth = genus === "cirrus" || genus === "cirrocumulus" ? 0.34
        : genus === "cirrostratus" ? 0.28
            : genus === "cumulonimbus" || genus === "nimbostratus" ? 1
                : genus === "altostratus" || genus === "stratus" ? 0.82 : 0.72;
    let convection = genus === "cumulonimbus" ? 0.96
        : genus === "cumulus" ? 0.56
            : classification.species === "castellanus" ? 0.42 : 0.14;
    let precipitation = target.precipitationKind && target.precipitationKind !== "none"
        ? target.precipitationKind === "virga" ? 0.24 :
            target.precipitationKind === "drizzle" ? 0.3 : 0.72
        : genus === "nimbostratus" ? 0.78 : genus === "cumulonimbus" ? 0.68 : 0;
    let organization: Parameters<typeof createLayer>[0]["organization"] =
        rendererSpecies.includes("lenticularis") || rendererSpecies.includes("volutus")
            ? "banded"
            : genus === "cirrus" ? "unorganized"
                : genus === "cirrostratus" || genus === "altostratus" ||
                    genus === "nimbostratus" ? "frontal"
                    : genus === "cumulonimbus" || genus === "cumulus"
                        ? "isolated"
                        : "closed-cell";
    const varieties = classification.varieties;
    if (varieties.includes("opacus")) opticalDepth = Math.max(opticalDepth, 0.9);
    if (varieties.includes("translucidus")) opticalDepth = Math.min(opticalDepth, 0.52);
    if (varieties.includes("perlucidus")) {
        opticalDepth = Math.min(opticalDepth, 0.68);
        oktas = Math.min(oktas, 5);
    }
    if (varieties.includes("duplicatus")) oktas = Math.max(oktas, 5);
    if (varieties.includes("radiatus") || varieties.includes("undulatus")) {
        organization = "banded";
    }
    if (varieties.includes("lacunosus")) organization = "open-cell";
    if (classification.supplementaryFeatures.includes("fluctus")) {
        organization = "banded";
    }
    if (classification.supplementaryFeatures.includes("mamma")) {
        // Mature/decaying mamma needs an actual detraining or sublimating
        // underside path; a purely static, non-settling parent is not enough.
        precipitation = Math.max(precipitation, 0.14);
    }
    if (classification.supplementaryFeatures.includes("asperitas")) {
        organization = "banded";
    }
    if (classification.supplementaryFeatures.includes("virga")) {
        precipitation = 0.24;
        // A virga qualification case must actually condense enough material
        // to produce falling hydrometeors before the dry sub-cloud layer
        // evaporates them. `constrainScene` correctly removes precipitation
        // from optically thinner high cloud, so keep the labeled reference on
        // the physically active side of that threshold.
        opticalDepth = Math.max(0.48, opticalDepth);
    }
    if (classification.supplementaryFeatures.includes("praecipitatio")) {
        precipitation = Math.max(0.55, precipitation);
        opticalDepth = Math.max(0.58, opticalDepth);
    }
    if (classification.supplementaryFeatures.includes("arcus") ||
        classification.supplementaryFeatures.includes("murus") ||
        classification.supplementaryFeatures.includes("cauda") ||
        classification.accessoryClouds.includes("flumen")) {
        convection = Math.max(0.9, convection);
        precipitation = Math.max(0.64, precipitation);
        organization = "isolated";
    }
    if (classification.accessoryClouds.includes("pannus")) {
        precipitation = Math.max(0.55, precipitation);
        oktas = Math.max(5, oktas);
    }
    if (classification.accessoryClouds.includes("pileus") ||
        classification.accessoryClouds.includes("velum")) {
        precipitation = 0;
        convection = Math.max(convection, 0.84);
    }
    const lifecycle = target.lifecycleStage === "incipient" ? 0.06
        : target.lifecycleStage === "growing" ? 0.24
            : target.lifecycleStage === "mature" ? 0.48
                : target.lifecycleStage === "glaciating" ? 0.62
                    : target.lifecycleStage === "precipitating" ? 0.7
                        : target.lifecycleStage === "decaying" ? 0.94 : 0.52;
    const cavum = classification.supplementaryFeatures.includes("cavum");
    const baseByLevel = cavum && genus === "stratocumulus" ? 1.35
        : CLOUD_GENUS_LEVEL[genus] === "low" ? 0.75
        : CLOUD_GENUS_LEVEL[genus] === "middle" ? 3.3 : 8.5;
    const depthKm = cavum && genus === "stratocumulus" ? 1.65
        : SPECIES_DEPTH_KM[rendererSpecies] ??
        (CLOUD_GENUS_LEVEL[genus] === "low" ? 1.1 :
            CLOUD_GENUS_LEVEL[genus] === "middle" ? 1.4 : 0.8);
    const windDirection = seedForQualification(target.id)[0] * Math.PI * 2;
    const strongShear = classification.supplementaryFeatures.includes("fluctus") ||
        classification.supplementaryFeatures.includes("asperitas") ||
        classification.supplementaryFeatures.includes("tuba") ||
        classification.supplementaryFeatures.includes("murus") ||
        classification.supplementaryFeatures.includes("cauda") ||
        classification.supplementaryFeatures.includes("incus") ||
        classification.accessoryClouds.includes("flumen") ||
        varieties.includes("radiatus") || varieties.includes("undulatus");
    return createLayer({
        genus,
        species: rendererSpecies,
        oktas,
        latitude: environment.latitude,
        season: environment.season,
        baseAltitude: baseByLevel * 1000,
        thickness: depthKm * 1000,
        opticalDepth,
        convection,
        precipitation,
        iceFraction: CLOUD_GENUS_LEVEL[genus] === "high" ? 1
            : genus === "cumulonimbus" ? 0.48
                : environment.freezingLevelKm <= baseByLevel ? 0.82 : 0.05,
        windSpeed: Math.max(environment.windSpeedMetersPerSecond,
            CLOUD_GENUS_LEVEL[genus] === "high" ? 24 : 7),
        windDirection,
        shear: strongShear ? 0.92 : genus === "cumulonimbus" ? 0.58 : 0.24,
        turbulence: genus === "cumulonimbus" || genus === "cumulus" ? 0.72
            : classification.species === "fractus" ? 0.82 : 0.28,
        organization,
        lifecycle,
        organizationStrength: organization === "banded" || organization === "frontal"
            ? 0.82 : 0.64,
    });
};

const emptyScene = (
    id: string,
    environment: QualificationEnvironment,
): CloudScene => ({
    layers: [{ ...EMPTY_LAYER }, { ...EMPTY_LAYER }, { ...EMPTY_LAYER }],
    totalOktas: 0,
    convection: environment.boundaryLayer === "convective" ? 0.38 : 0.08,
    instability: environment.boundaryLayer === "convective" ? 0.42 : 0.12,
    humidity: environment.relativeHumidity,
    fog: 0,
    noctilucent: 0,
    classifications: [],
    latitude: environment.latitude,
    season: environment.season,
    solarDepression: Math.max(0, -environment.solarElevationDegrees),
    stratosphericTemperatureKelvin: environment.stratosphericTemperatureKelvin,
    mesopauseTemperatureKelvin: environment.mesopauseTemperatureKelvin,
    seed: seedForQualification(id),
});

const qualificationLayerIndex = (genus: WmoCloudGenus): 0 | 1 | 2 => {
    const level = CLOUD_GENUS_LEVEL[genus];
    return level === "low" ? 0 : level === "middle" ? 1 : 2;
};

const qualificationFormationSpanKm = (
    classification: CloudClassification,
    layer: ReturnType<typeof createLayer>,
): readonly [number, number] | undefined => {
    const rendererSpecies = layer.species;
    if (rendererSpecies === "generic") return undefined;
    if (Object.hasOwn(HIGH_CLOUD_SPECIES_DESCRIPTORS, rendererSpecies)) {
        return HIGH_CLOUD_SPECIES_DESCRIPTORS[
            rendererSpecies as keyof typeof HIGH_CLOUD_SPECIES_DESCRIPTORS
        ].formationSpanKm;
    }
    const cirrostratus = cirrostratusRepresentationFor(
        classification,
        rendererSpecies,
    );
    if (cirrostratus) {
        return UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[cirrostratus]
            .formationSpanKm;
    }
    const middle = middleCloudRepresentationFor(classification, rendererSpecies);
    if (middle) {
        return MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[middle]
            .formationSpanKm;
    }
    const lowLayered = lowLayeredCloudRepresentationFor(
        classification,
        rendererSpecies,
    );
    if (lowLayered) {
        return LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[lowLayered]
            .formationSpanKm;
    }
    return undefined;
};

const qualificationUsesImmediateLowDeck = (
    layer: ReturnType<typeof createLayer>,
) => layer.species === "stratocumulus-stratiformis"
    // The Sc foundation defines four-okta broken fields as observer-containing
    // mesoscale domains with clear cells inside them. Authoring the owner as a
    // remote bank while labelling it immediate-broken is contradictory.
    ? layer.coverage >= 0.46
    : layer.coverage >= 0.72 && (
        layer.species === "stratus-nebulosus" ||
        layer.genus === "nimbostratus"
    );

const qualificationSystemManifold = (
    id: string,
    layer: ReturnType<typeof createLayer>,
    classification: CloudClassification,
    options: { bearing?: number; rangeKm?: number; scale?: number } = {},
) => {
    const seed = seedForQualification(`${id}:manifold`);
    const layerIndex = qualificationLayerIndex(
        layer.genus as WmoCloudGenus,
    );
    const bearing = options.bearing ?? seed[0] * Math.PI * 2;
    const authoredRangeKm = options.rangeKm ?? (
        layerIndex === 0 ? 18 + seed[1] * 18
            : layerIndex === 1 ? 32 + seed[1] * 26
                : 48 + seed[1] * 42
    );
    const scale = options.scale ?? 1;
    const broadDeck = layer.stratusBlend > 0.82;
    const deepConvection = layer.genus === "cumulonimbus";
    const thermal = layer.genus === "cumulus";
    const sampledMajorRadiusKm = scale * (broadDeck
        ? layer.genus === "nimbostratus"
            ? 44 + seed[2] * 48
            : 28 + seed[2] * 34
        : deepConvection ? 7 + seed[2] * 5
            : thermal ? 2.8 + seed[2] * 3.2
                : layerIndex === 2 ? 10 + seed[2] * 16
                    : 8 + seed[2] * 14);
    const formationSpanKm = qualificationFormationSpanKm(classification, layer);
    // A causal family compiler retains 74-88% of a genitus daughter's radius
    // and 94% of a mutatus daughter's radius before foundation qualification.
    // Author enough real formation support for that retained manifold, while
    // keeping every non-convective owner inside its exact family contract.
    const retainedRadiusFraction = classification.origin.kind === "genitus"
        ? 0.74
        : classification.origin.kind === "mutatus" ? 0.94 : 1;
    const majorRadiusKm = formationSpanKm
        ? Math.max(
            formationSpanKm[0] / (2 * retainedRadiusFraction),
            Math.min(
                formationSpanKm[1] / (2 * retainedRadiusFraction),
                sampledMajorRadiusKm,
            ),
        )
        : sampledMajorRadiusKm;
    const minorRadiusKm = Math.max(0.2, majorRadiusKm * (
        broadDeck ? 0.48 + seed[3] * 0.20
            : deepConvection ? 0.62 + seed[3] * 0.18
                : 0.36 + seed[3] * 0.28
    ));
    const orientation = layer.windDirection + (seed[2] - 0.5) * 0.18;
    const boundaryTransitionKm = Math.max(0.08,
        Math.min(8, minorRadiusKm * (0.12 + seed[3] * 0.12)));
    const lowLayered = layer.species === "generic" ? undefined
        : lowLayeredCloudRepresentationFor(classification, layer.species);
    const radialEast = Math.sin(bearing);
    const radialNorth = Math.cos(bearing);
    const downwindEast = Math.cos(orientation);
    const downwindNorth = Math.sin(orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const radialSupportKm = Math.hypot(
        majorRadiusKm * (
            radialEast * downwindEast + radialNorth * downwindNorth
        ),
        minorRadiusKm * (
            radialEast * crosswindEast + radialNorth * crosswindNorth
        ),
    );
    // Broken low sheets are finite banks, not observer-containing ceilings.
    // Place their generated condensation support just beyond the observer in
    // world space. An explicit zero range is reserved for an immediate deck.
    const rangeKm = lowLayered && authoredRangeKm !== 0 &&
        !qualificationUsesImmediateLowDeck(layer)
        ? Math.max(
            authoredRangeKm,
            radialSupportKm + boundaryTransitionKm * 1.08,
        )
        : authoredRangeKm;
    return {
        centerEastKm: Math.sin(bearing) * rangeKm,
        centerNorthKm: Math.cos(bearing) * rangeKm,
        majorRadiusKm,
        minorRadiusKm,
        orientation,
        boundaryTransitionKm,
    };
};

const familyMinimumBaseKm = (layerIndex: 0 | 1 | 2) =>
    layerIndex === 0 ? 0.02 : layerIndex === 1 ? 1.5 : 4.5;

/**
 * Put two WMO-valid layers on a real shared formation interface.  Genitus
 * needs a bounded attachment region; mutatus needs a broader overlapping
 * transformation volume.  The adjustment moves the higher family toward its
 * physically admitted lower edge before minimally deepening the lower owner.
 */
const coupleMotherCloudLayers = (
    motherInput: ReturnType<typeof createLayer>,
    childInput: ReturnType<typeof createLayer>,
    relation: "genitus" | "mutatus",
) => {
    const mother = { ...motherInput };
    const child = { ...childInput };
    const motherLevel = qualificationLayerIndex(
        mother.genus as WmoCloudGenus,
    );
    const childLevel = qualificationLayerIndex(
        child.genus as WmoCloudGenus,
    );
    const minimumOverlapKm = Math.max(
        relation === "mutatus" ? 0.18 : 0.06,
        Math.min(mother.thickness, child.thickness) / 1000 *
            (relation === "mutatus" ? 0.42 : 0.14),
    );
    const topKm = (layer: typeof mother) =>
        (layer.baseAltitude + layer.thickness) / 1000;
    const overlapKm = () => Math.max(0,
        Math.min(topKm(mother), topKm(child)) -
        Math.max(mother.baseAltitude, child.baseAltitude) / 1000);

    if (overlapKm() < minimumOverlapKm) {
        if (motherLevel === childLevel) {
            const centeredChildBaseKm = mother.baseAltitude / 1000 +
                (mother.thickness - child.thickness) / 2000 +
                (relation === "genitus" ? mother.thickness / 1000 * 0.16 : 0);
            child.baseAltitude = Math.max(
                familyMinimumBaseKm(childLevel) * 1000,
                centeredChildBaseKm * 1000,
            );
        } else if (motherLevel < childLevel) {
            child.baseAltitude = Math.max(
                familyMinimumBaseKm(childLevel) * 1000,
                (topKm(mother) - minimumOverlapKm) * 1000,
            );
        } else {
            mother.baseAltitude = Math.max(
                familyMinimumBaseKm(motherLevel) * 1000,
                (topKm(child) - minimumOverlapKm) * 1000,
            );
        }
    }

    const deficitKm = minimumOverlapKm - overlapKm();
    if (deficitKm > 0) {
        const lower = mother.baseAltitude <= child.baseAltitude ? mother : child;
        const verticalGapKm = Math.max(0,
            Math.max(mother.baseAltitude, child.baseAltitude) / 1000 -
            Math.min(topKm(mother), topKm(child)));
        lower.thickness += (verticalGapKm + deficitKm + 0.02) * 1000;
    }
    return { mother, child };
};

/**
 * Place a non-immediate causal pair at one real horizontal range. The shared
 * distance projects their coupled vertical envelope into the lower part of
 * the fixed natural lens: enough sky remains above the lineage, while both
 * levels retain readable attachment and altitude-driven parallax. Broad
 * shields stay farther away than compact cellular/convective lineages.
 */
const qualificationLineageSharedRangeKm = (
    mother: ReturnType<typeof createLayer>,
    child: ReturnType<typeof createLayer>,
) => {
    const overlapBaseKm = Math.max(
        mother.baseAltitude,
        child.baseAltitude,
    ) / 1000;
    const overlapTopKm = Math.min(
        mother.baseAltitude + mother.thickness,
        child.baseAltitude + child.thickness,
    ) / 1000;
    const attachmentAltitudeKm = overlapBaseKm +
        Math.max(0, overlapTopKm - overlapBaseKm) * 0.55;
    const broadShield = mother.stratusBlend > 0.82 ||
        child.stratusBlend > 0.82;
    const lowerFrameFraction = broadShield ? 0.06 : 0.13;
    const targetElevation = QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS +
        (QUALIFICATION_VIEW_ELEVATION_RADIANS -
            QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS) *
            lowerFrameFraction;
    return clamp(
        // The real shared formation interface is the only altitude guaranteed
        // to belong to both causal slabs. Projecting its robust interior into
        // the low natural-sky band keeps both owners readable; using the top
        // of a deep member can leave the other owner as a horizon sliver.
        attachmentAltitudeKm / Math.tan(targetElevation),
        8,
        90,
    );
};

const qualificationManifoldAxisSupportKm = (
    manifold: ReturnType<typeof qualificationSystemManifold>,
    bearing: number,
) => {
    const radialEast = Math.sin(bearing);
    const radialNorth = Math.cos(bearing);
    const lateralEast = Math.cos(bearing);
    const lateralNorth = -Math.sin(bearing);
    const majorEast = Math.cos(manifold.orientation);
    const majorNorth = Math.sin(manifold.orientation);
    const minorEast = -majorNorth;
    const minorNorth = majorEast;
    const support = (east: number, north: number) => Math.hypot(
        manifold.majorRadiusKm * (east * majorEast + north * majorNorth),
        manifold.minorRadiusKm * (east * minorEast + north * minorNorth),
    );
    return {
        radial: support(radialEast, radialNorth),
        lateral: support(lateralEast, lateralNorth),
    };
};

/**
 * Retain the largest physical formation that fits a shared causal range. This
 * is important for broad genitus daughters: their unconstrained synoptic
 * exemplar can force the common centre beyond the entire overlap slab even
 * though a smaller member of the same descriptor remains fully WMO-valid.
 */
const qualificationLineageManifold = ({
    id,
    layer,
    classification,
    bearing,
    rangeKm,
    baseScale,
}: {
    id: string;
    layer: ReturnType<typeof createLayer>;
    classification: CloudClassification;
    bearing: number;
    rangeKm: number;
    baseScale: number;
}) => {
    const scaleFactors = [
        1, 0.82, 0.68, 0.56, 0.46, 0.38, 0.31, 0.25, 0.2, 0.16, 0.13, 0.1,
    ] as const;
    let selected = qualificationSystemManifold(
        id,
        layer,
        classification,
        { bearing, rangeKm, scale: baseScale * scaleFactors.at(-1)! },
    );
    for (const scaleFactor of scaleFactors) {
        const candidate = qualificationSystemManifold(
            id,
            layer,
            classification,
            { bearing, rangeKm, scale: baseScale * scaleFactor },
        );
        const centerRangeKm = Math.hypot(
            candidate.centerEastKm,
            candidate.centerNorthKm,
        );
        const support = qualificationManifoldAxisSupportKm(
            candidate,
            bearing,
        );
        const nearRangeKm = Math.max(
            0.1,
            centerRangeKm - support.radial -
                candidate.boundaryTransitionKm,
        );
        const horizontalHalfWidth = Math.atan2(
            support.lateral + candidate.boundaryTransitionKm,
            nearRangeKm,
        );
        selected = candidate;
        if (centerRangeKm <= rangeKm * 1.05 &&
            horizontalHalfWidth <= 0.38) break;
    }
    return selected;
};

const recenterQualificationManifold = (
    manifold: ReturnType<typeof qualificationSystemManifold>,
    bearing: number,
    rangeKm: number,
) => ({
    ...manifold,
    centerEastKm: Math.sin(bearing) * rangeKm,
    centerNorthKm: Math.cos(bearing) * rangeKm,
});

const qualificationLineageTextHash = (text: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const qualificationLineageUnitHash = (seed: number, salt: number) => {
    let value = Math.imul((seed ^ salt) >>> 0, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
};

/**
 * A genitus daughter is materialized through one real parent perimeter by the
 * causal compiler. Rotate the complete authored pair (never either owner in
 * isolation) so that deterministic perimeter is on the observer-facing side
 * of the same finite weather system. This is a camera-independent azimuthal
 * choice inside the qualification sector: it preserves every size, range,
 * attachment offset, and wind state while preventing a low daughter from
 * being displaced behind a distant mother and below the natural sky lens.
 */
const orientQualificationGenitusManifolds = (
    parent: ReturnType<typeof qualificationSystemManifold>,
    child: ReturnType<typeof qualificationSystemManifold>,
    parentId: string,
    childId: string,
    parentBearing: number,
) => {
    const deterministicSeed = qualificationLineageTextHash(
        `${parentId}:${childId}`,
    );
    const lineageSeed = (
        deterministicSeed ^ qualificationLineageTextHash(parentId) ^
        qualificationLineageTextHash(childId) ^ 0x71a5
    ) >>> 0;
    const directionOffset = qualificationLineageUnitHash(
        lineageSeed,
        0xe18d,
    ) < 0.5 ? Math.PI : 0;
    const attachmentJitter = (
        qualificationLineageUnitHash(lineageSeed, 0x2f81) - 0.5
    ) * 0.28;
    // Extent orientation uses the conventional east/north vector
    // (cos(theta), sin(theta)); qualification bearing is east of north.
    const inwardAttachmentOrientation = -Math.PI * 0.5 - parentBearing;
    const targetParentOrientation = inwardAttachmentOrientation -
        directionOffset - attachmentJitter;
    const rotation = Math.atan2(
        Math.sin(targetParentOrientation - parent.orientation),
        Math.cos(targetParentOrientation - parent.orientation),
    );
    return {
        parent: { ...parent, orientation: parent.orientation + rotation },
        child: { ...child, orientation: child.orientation + rotation },
    };
};

type QualificationLineageOwner = {
    layer: ReturnType<typeof createLayer>;
    manifold: ReturnType<typeof qualificationSystemManifold>;
};

const qualificationLineageRadicalInverse = (input: number) => {
    let bits = input >>> 0;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) |
        ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) |
        ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) |
        ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) |
        ((bits & 0xff00ff00) >>> 8)) >>> 0;
    return bits / 0x1_0000_0000;
};

const QUALIFICATION_EARTH_RADIUS_KM = 6_371;
const qualificationHorizontalRangeAtAltitude = (
    altitudeKm: number,
    elevation: number,
) => {
    const sine = Math.sin(elevation);
    const cosine = Math.cos(elevation);
    const radius = QUALIFICATION_EARTH_RADIUS_KM + Math.max(0, altitudeKm);
    const discriminant = Math.max(0,
        radius * radius - QUALIFICATION_EARTH_RADIUS_KM ** 2 * cosine ** 2);
    const slantRange = -QUALIFICATION_EARTH_RADIUS_KM * sine +
        Math.sqrt(discriminant);
    return Math.max(0, slantRange * cosine);
};

const qualificationRayIntersectsLineageOwner = (
    azimuth: number,
    elevation: number,
    owner: QualificationLineageOwner,
) => {
    const { manifold, layer } = owner;
    const baseAltitudeKm = layer.baseAltitude / 1000;
    const topAltitudeKm = (layer.baseAltitude + layer.thickness) / 1000;
    const startRange = qualificationHorizontalRangeAtAltitude(
        baseAltitudeKm,
        elevation,
    );
    const endRange = qualificationHorizontalRangeAtAltitude(
        topAltitudeKm,
        elevation,
    );
    const minimumRange = Math.min(startRange, endRange);
    const maximumRange = Math.max(startRange, endRange);
    const rayEast = Math.sin(azimuth);
    const rayNorth = Math.cos(azimuth);
    const downwindEast = Math.cos(manifold.orientation);
    const downwindNorth = Math.sin(manifold.orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const major = Math.max(0.001, manifold.majorRadiusKm);
    const minor = Math.max(0.001, manifold.minorRadiusKm);
    const originEast = -manifold.centerEastKm;
    const originNorth = -manifold.centerNorthKm;
    const rayDownwind = (
        rayEast * downwindEast + rayNorth * downwindNorth
    ) / major;
    const rayCrosswind = (
        rayEast * crosswindEast + rayNorth * crosswindNorth
    ) / minor;
    const originDownwind = (
        originEast * downwindEast + originNorth * downwindNorth
    ) / major;
    const originCrosswind = (
        originEast * crosswindEast + originNorth * crosswindNorth
    ) / minor;
    const quadratic = rayDownwind ** 2 + rayCrosswind ** 2;
    const linear = originDownwind * rayDownwind +
        originCrosswind * rayCrosswind;
    const closestRange = quadratic > 1e-9
        ? clamp(-linear / quadratic, minimumRange, maximumRange)
        : minimumRange;
    const downwind = originDownwind + rayDownwind * closestRange;
    const crosswind = originCrosswind + rayCrosswind * closestRange;
    return downwind ** 2 + crosswind ** 2 <= 1;
};

const qualificationPostCausalLineageOwners = (
    parentInput: QualificationLineageOwner,
    childInput: QualificationLineageOwner,
    relation: "genitus" | "mutatus",
    parentId: string,
    childId: string,
) => {
    const parent = {
        layer: parentInput.layer,
        manifold: { ...parentInput.manifold },
    };
    const child = {
        layer: childInput.layer,
        manifold: { ...childInput.manifold },
    };
    if (relation === "mutatus") {
        const progress = 0.56;
        child.manifold.centerEastKm = parent.manifold.centerEastKm +
            (child.manifold.centerEastKm - parent.manifold.centerEastKm) *
                progress * 0.12;
        child.manifold.centerNorthKm = parent.manifold.centerNorthKm +
            (child.manifold.centerNorthKm - parent.manifold.centerNorthKm) *
                progress * 0.12;
        child.manifold.majorRadiusKm = parent.manifold.majorRadiusKm +
            (child.manifold.majorRadiusKm - parent.manifold.majorRadiusKm) *
                progress;
        child.manifold.minorRadiusKm = parent.manifold.minorRadiusKm +
            (child.manifold.minorRadiusKm - parent.manifold.minorRadiusKm) *
                progress;
        return [parent, child] as const;
    }

    const deterministicSeed = qualificationLineageTextHash(
        `${parentId}:${childId}`,
    );
    const lineageSeed = (
        deterministicSeed ^ qualificationLineageTextHash(parentId) ^
        qualificationLineageTextHash(childId) ^ 0x71a5
    ) >>> 0;
    const reverse = qualificationLineageUnitHash(
        lineageSeed,
        0xe18d,
    ) < 0.5;
    const direction = parent.manifold.orientation + (reverse ? Math.PI : 0);
    const attachmentAngle = direction + (
        qualificationLineageUnitHash(lineageSeed, 0x2f81) - 0.5
    ) * 0.28;
    const majorRadiusKm = clamp(
        child.manifold.majorRadiusKm,
        Math.max(0.2, parent.manifold.majorRadiusKm * 0.28),
        Math.max(0.25, parent.manifold.majorRadiusKm * 2.2),
    );
    const minorRadiusKm = clamp(
        child.manifold.minorRadiusKm,
        0.2,
        Math.min(majorRadiusKm,
            Math.max(0.25, parent.manifold.minorRadiusKm * 1.65)),
    );
    const attachmentDistanceKm = parent.manifold.majorRadiusKm * 0.68 +
        majorRadiusKm * 0.18;
    const crossOffsetKm = parent.manifold.minorRadiusKm *
        (qualificationLineageUnitHash(lineageSeed, 0x8c53) - 0.5) * 0.22;
    const crossAngle = attachmentAngle + Math.PI * 0.5;
    child.manifold.centerEastKm = parent.manifold.centerEastKm +
        Math.cos(attachmentAngle) * attachmentDistanceKm +
        Math.cos(crossAngle) * crossOffsetKm;
    child.manifold.centerNorthKm = parent.manifold.centerNorthKm +
        Math.sin(attachmentAngle) * attachmentDistanceKm +
        Math.sin(crossAngle) * crossOffsetKm;
    child.manifold.majorRadiusKm = majorRadiusKm;
    child.manifold.minorRadiusKm = minorRadiusKm;
    return [parent, child] as const;
};

const estimateQualificationLineageProjection = (
    owners: readonly QualificationLineageOwner[],
    sampleCount = 4_096,
) => {
    const visibleOwners = new Set<number>();
    let supportedWeight = 0;
    let sampledWeight = 0;
    for (let index = 0; index < sampleCount; index += 1) {
        const azimuth = QUALIFICATION_FORWARD_MERIDIAN_RADIANS +
            ((index + 0.5) / sampleCount - 0.5) * 64 * Math.PI / 180;
        const elevation = QUALIFICATION_VIEW_ELEVATION_RADIANS +
            (qualificationLineageRadicalInverse(index) - 0.5) *
                QUALIFICATION_VERTICAL_FOV_RADIANS;
        const weight = Math.max(0.001, Math.cos(elevation));
        sampledWeight += weight;
        let supported = false;
        for (let ownerIndex = 0; ownerIndex < owners.length; ownerIndex += 1) {
            if (!qualificationRayIntersectsLineageOwner(
                azimuth,
                elevation,
                owners[ownerIndex],
            )) continue;
            supported = true;
            visibleOwners.add(ownerIndex);
        }
        if (supported) supportedWeight += weight;
    }
    return {
        supportFraction: supportedWeight / Math.max(1e-9, sampledWeight),
        visibleOwnerCount: visibleOwners.size,
    };
};

const qualificationScaledLineageManifold = (
    manifold: ReturnType<typeof qualificationSystemManifold>,
    scale: number,
) => ({
    ...manifold,
    majorRadiusKm: manifold.majorRadiusKm * scale,
    minorRadiusKm: manifold.minorRadiusKm * scale,
    boundaryTransitionKm: manifold.boundaryTransitionKm * scale,
});

const qualificationLineageEnvelopeCache = new Map<string, {
    rangeKm: number;
    parentScale: number;
    childScale: number;
}>();

/**
 * Normalize every finite causal pair to a robust piece of the natural frame,
 * rather than merely clearing a one-ray publication gate. The finite search
 * is intentional: range participates in the stable owner signature and may
 * select a different, still valid causal phenotype, so binary search is not
 * monotonic. Only when no full-scale range works does the solver descend the
 * existing physical scale lattice, one dominant owner at a time.
 */
const solveQualificationLineageEnvelope = ({
    targetId,
    relation,
    parentId,
    childId,
    parent,
    child,
    sceneTemplate,
    parentLayerIndex,
    childLayerIndex,
    assignments,
}: {
    targetId: string;
    relation: "genitus" | "mutatus";
    parentId: string;
    childId: string;
    parent: QualificationLineageOwner;
    child: QualificationLineageOwner;
    sceneTemplate: CloudScene;
    parentLayerIndex: 0 | 1 | 2;
    childLayerIndex: 0 | 1 | 2;
    assignments: NonNullable<CloudScene["classifications"]>;
}) => {
    const parentBearing = Math.atan2(
        parent.manifold.centerEastKm,
        parent.manifold.centerNorthKm,
    );
    const childBearing = Math.atan2(
        child.manifold.centerEastKm,
        child.manifold.centerNorthKm,
    );
    const signature = [
        targetId,
        relation,
        parent.layer.baseAltitude,
        parent.layer.thickness,
        child.layer.baseAltitude,
        child.layer.thickness,
        parent.manifold.majorRadiusKm.toFixed(6),
        parent.manifold.minorRadiusKm.toFixed(6),
        parent.manifold.orientation.toFixed(6),
        child.manifold.majorRadiusKm.toFixed(6),
        child.manifold.minorRadiusKm.toFixed(6),
        child.manifold.orientation.toFixed(6),
    ].join(":");
    const apply = (selection: {
        rangeKm: number;
        parentScale: number;
        childScale: number;
    }) => ({
        parent: {
            layer: parent.layer,
            manifold: recenterQualificationManifold(
                qualificationScaledLineageManifold(
                    parent.manifold,
                    selection.parentScale,
                ),
                parentBearing,
                selection.rangeKm,
            ),
        },
        child: {
            layer: child.layer,
            manifold: recenterQualificationManifold(
                qualificationScaledLineageManifold(
                    child.manifold,
                    selection.childScale,
                ),
                childBearing,
                selection.rangeKm,
            ),
        },
    });
    const cached = qualificationLineageEnvelopeCache.get(signature);
    if (cached) return apply(cached);

    type Selection = {
        rangeKm: number;
        parentScale: number;
        childScale: number;
        score: number;
        singletonSupportById: Readonly<Record<string, number>>;
    };
    const evaluate = (
        rangeKm: number,
        parentScale: number,
        childScale: number,
        includeSingletons: boolean,
    ) => {
        const candidate = apply({ rangeKm, parentScale, childScale });
        const candidateScene = constrainScene({
            ...sceneTemplate,
            authoredSystems: [
                {
                    id: parentId,
                    layerIndex: parentLayerIndex,
                    layer: candidate.parent.layer,
                    manifold: candidate.parent.manifold,
                },
                {
                    id: childId,
                    layerIndex: childLayerIndex,
                    layer: candidate.child.layer,
                    manifold: candidate.child.manifold,
                },
            ],
            classifications: assignments,
        });
        const cloudRuntime = createCloudSystemRuntime(candidateScene);
        if (cloudRuntime.diagnostics.length > 0 ||
            cloudRuntime.systems.length !== 2) return undefined;
        const projection = estimateCloudPopulationProjection(
            cloudRuntime.systems,
            {
                azimuthRadians: QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
                elevationRadians: QUALIFICATION_VIEW_ELEVATION_RADIANS,
                horizontalFovRadians: 64 * Math.PI / 180,
                verticalFovRadians: QUALIFICATION_VERTICAL_FOV_RADIANS,
                sampleCount: 4_096,
            },
        );
        const singletonSupportById: Record<string, number> = {};
        if (includeSingletons) {
            for (const system of cloudRuntime.systems) {
                singletonSupportById[system.state.id] =
                    estimateCloudPopulationProjection([system], {
                        azimuthRadians:
                            QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
                        elevationRadians:
                            QUALIFICATION_VIEW_ELEVATION_RADIANS,
                        horizontalFovRadians: 64 * Math.PI / 180,
                        verticalFovRadians:
                            QUALIFICATION_VERTICAL_FOV_RADIANS,
                        sampleCount: 4_096,
                    }).supportFraction;
            }
        }
        return { projection, singletonSupportById };
    };

    const scan = (parentScale: number, childScale: number) => {
        const scaledParent = qualificationScaledLineageManifold(
            parent.manifold,
            parentScale,
        );
        const scaledChild = qualificationScaledLineageManifold(
            child.manifold,
            childScale,
        );
        // Family adaptation and the causal compiler can contract a daughter's
        // authored pre-compensation substantially before projection. Start at
        // the physical near-field floor and let the actual post-causal runtime
        // reject observer-containing or family-invalid candidates; applying a
        // pre-causal radial floor here can incorrectly discard the valid band.
        const minimumRangeKm = 4;
        const topAltitudeKm = Math.max(
            (parent.layer.baseAltitude + parent.layer.thickness) / 1000,
            (child.layer.baseAltitude + child.layer.thickness) / 1000,
        );
        const maximumRangeKm = Math.min(
            220,
            Math.max(
                80,
                qualificationHorizontalRangeAtAltitude(
                    topAltitudeKm,
                    QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS,
                ) + Math.max(
                    scaledParent.majorRadiusKm,
                    scaledChild.majorRadiusKm,
                ),
            ),
        );
        let selected: Selection | undefined;
        let closest: Selection | undefined;
        for (let rangeKm = Math.ceil(minimumRangeKm * 2) / 2;
            rangeKm <= maximumRangeKm;
            rangeKm += 0.5) {
            const coarse = evaluate(
                rangeKm,
                parentScale,
                childScale,
                false,
            );
            if (!coarse || coarse.projection.visibleOwnerCount !== 2) continue;
            const coarseScore = Math.abs(
                coarse.projection.supportFraction - 0.09,
            );
            if (!closest || coarseScore < closest.score) {
                const withSingletons = evaluate(
                    rangeKm,
                    parentScale,
                    childScale,
                    true,
                );
                if (withSingletons) {
                    closest = {
                        rangeKm,
                        parentScale,
                        childScale,
                        score: coarseScore,
                        singletonSupportById:
                            withSingletons.singletonSupportById,
                    };
                }
            }
            if (coarse.projection.supportFraction < 0.07 ||
                coarse.projection.supportFraction > 0.12) continue;
            const withSingletons = evaluate(
                rangeKm,
                parentScale,
                childScale,
                true,
            );
            if (!withSingletons) continue;
            const candidate = apply({ rangeKm, parentScale, childScale });
            const analyticProjection =
                estimateQualificationLineageProjection(
                    qualificationPostCausalLineageOwners(
                        candidate.parent,
                        candidate.child,
                        relation,
                        parentId,
                        childId,
                    ),
                    1_024,
                );
            const score = coarseScore + Math.abs(
                analyticProjection.supportFraction - 0.09,
            ) * 1e-6 + Math.abs(Math.log(
                rangeKm / Math.max(1,
                    qualificationLineageSharedRangeKm(
                        parent.layer,
                        child.layer,
                    )),
            )) * 1e-7;
            if (selected && score >= selected.score) continue;
            selected = {
                rangeKm,
                parentScale,
                childScale,
                score,
                singletonSupportById: withSingletons.singletonSupportById,
            };
        }
        return { selected, closest };
    };

    const fullScale = scan(1, 1);
    let selected = fullScale.selected;
    if (!selected) {
        const closest = fullScale.closest;
        if (!closest) {
            throw new Error(`No visible qualification lineage for ${targetId}.`);
        }
        const parentDominates = (
            closest.singletonSupportById[parentId] ?? 0
        ) >= (closest.singletonSupportById[childId] ?? 0);
        const scaleFactors = [0.82, 0.68, 0.56, 0.46, 0.38] as const;
        for (const scale of scaleFactors) {
            const dominant = scan(
                parentDominates ? scale : 1,
                parentDominates ? 1 : scale,
            ).selected;
            if (dominant) {
                selected = dominant;
                break;
            }
            const alternate = scan(
                parentDominates ? 1 : scale,
                parentDominates ? scale : 1,
            ).selected;
            if (alternate) {
                selected = alternate;
                break;
            }
        }
    }
    if (!selected) {
        throw new Error(`No bounded qualification lineage for ${targetId}.`);
    }
    const cachedSelection = {
        rangeKm: selected.rangeKm,
        parentScale: selected.parentScale,
        childScale: selected.childScale,
    };
    qualificationLineageEnvelopeCache.set(signature, cachedSelection);
    return apply(cachedSelection);
};

const sceneForQualification = (
    qualificationCase: WeatherQualificationCase,
): { scene: CloudScene; classifications: CloudClassification[]; phenomena: string[] } => {
    const { target, environment } = qualificationCase;
    const scene = emptyScene(target.id, environment);
    const classifications: CloudClassification[] = [];
    const phenomena: string[] = [];
    if (target.kind === "cloud") {
        let cloudLayer = layerForQualification(target, environment);
        const layerIndex = qualificationLayerIndex(target.classification.genus);
        scene.layers[layerIndex] = cloudLayer;
        scene.convection = target.classification.genus === "cumulonimbus" ? 0.96
            : target.classification.genus === "cumulus" ? 0.62 : scene.convection;
        scene.instability = target.classification.genus === "cumulonimbus" ? 0.94
            : target.classification.genus === "cumulus" ? 0.58 : scene.instability;
        classifications.push(target.classification);
        const assignment: NonNullable<CloudScene["classifications"]>[number] = {
            layerIndex,
            scope: "layer",
            classification: target.classification,
            relation: target.classification.origin.kind === "genitus" ||
                target.classification.origin.kind === "mutatus"
                ? target.classification.origin.kind : "independent",
        };
        if (target.classification.origin.kind === "special") {
            const sourceId = `source-${target.id}`;
            const sourceSeed = seedForQualification(sourceId).reduce(
                (seed, value, index) =>
                    (seed ^ Math.floor(value * 0xffff_ffff) ^
                        Math.imul(index + 1, 0x9e3779b1)) >>> 0,
                0x811c9dc5,
            );
            scene.specialOriginSources = [createQualificationSpecialOriginSource({
                id: sourceId,
                designation: target.classification.origin.designation,
                genus: target.classification.genus,
                deterministicSeed: sourceSeed,
                layer: cloudLayer,
                editorialTerminalBearing: qualificationEditorialBearing(
                    `${target.id}:special-origin-terminal`,
                ),
            })];
            assignment.sourceId = sourceId;
        }
        if (target.classification.varieties.includes("duplicatus")) {
            const firstId = `${target.id}:lower-layer`;
            const secondId = `${target.id}:upper-layer`;
            const depthKm = cloudLayer.thickness / 1000;
            const separationKm = Math.max(
                layerIndex === 2 ? 0.18 : layerIndex === 1 ? 0.28 : 0.12,
                depthKm * 0.32,
            );
            const upperLayer = {
                ...cloudLayer,
                baseAltitude: cloudLayer.baseAltitude + separationKm * 1000,
                thickness: cloudLayer.thickness * 0.88,
                windSpeed: cloudLayer.windSpeed * 1.16,
                windDirection: cloudLayer.windDirection + 0.22,
                shear: Math.min(1, cloudLayer.shear * 1.12 + 0.04),
                lifecycle: Math.min(1, cloudLayer.lifecycle + 0.08),
            };
            const sharedBearing = qualificationEditorialBearing(
                `${target.id}:duplicatus`,
            );
            const immediateLayeredDeck = qualificationUsesImmediateLowDeck(
                cloudLayer,
            );
            scene.authoredSystems = [
                {
                    id: firstId,
                    layerIndex,
                    layer: { ...cloudLayer },
                    manifold: qualificationSystemManifold(
                        firstId,
                        cloudLayer,
                        target.classification,
                        {
                            bearing: sharedBearing - 0.045,
                            // Duplicatus is vertical superposition. A
                            // high-cover low deck is authored around the
                            // observer; broken/elevated layers remain banks.
                            rangeKm: immediateLayeredDeck ? 0
                                : layerIndex === 2 ? 58
                                    : layerIndex === 1 ? 38 : 24,
                            scale: 1.08,
                        },
                    ),
                },
                {
                    id: secondId,
                    layerIndex,
                    layer: upperLayer,
                    manifold: qualificationSystemManifold(
                        secondId,
                        upperLayer,
                        target.classification,
                        {
                            bearing: sharedBearing + 0.035,
                            rangeKm: immediateLayeredDeck ? 0
                                : layerIndex === 2 ? 86
                                    // At the real 3-5 km Ac/As level, 61 km
                                    // puts the complete upper population below
                                    // the natural oblique frame. 49 km retains
                                    // distant two-level parallax while keeping
                                    // the physical layer above the horizon.
                                    : layerIndex === 1 ? 49 : 39,
                            scale: 0.86,
                        },
                    ),
                },
            ];
            scene.classifications = [firstId, secondId].map((systemId) => ({
                ...assignment,
                scope: "owner" as const,
                systemId,
            }));
        } else if (target.classification.origin.kind === "genitus" ||
            target.classification.origin.kind === "mutatus") {
            const relation = target.classification.origin.kind;
            const motherGenus = target.classification.origin.motherGenus;
            const motherClassification = classificationForGenus(motherGenus);
            const motherTarget: CloudQualificationTarget = {
                ...target,
                id: `${target.id}:mother`,
                label: `${motherGenus} mother owner`,
                classification: motherClassification,
                precipitationKind: undefined,
                lifecycleStage: undefined,
            };
            const coupled = coupleMotherCloudLayers(
                layerForQualification(motherTarget, environment),
                cloudLayer,
                relation,
            );
            if (relation === "genitus" && coupled.child.coverage >= 0.72) {
                // A daughter extension may occupy part of a broad mother
                // system, but it is not itself an immediate overcast deck.
                // Keep enough broken cover to read the attachment perimeter.
                coupled.child.oktas = Math.min(coupled.child.oktas, 5);
                coupled.child.coverage = Math.min(coupled.child.coverage, 5 / 8);
            }
            cloudLayer = coupled.child;
            scene.layers[layerIndex] = cloudLayer;
            const motherLayerIndex = qualificationLayerIndex(motherGenus);
            if (motherLayerIndex !== layerIndex) {
                scene.layers[motherLayerIndex] = coupled.mother;
            }
            const motherId = `${target.id}:mother-owner`;
            const childId = `${target.id}:child-owner`;
            let sharedBearing = qualificationEditorialBearing(
                `${target.id}:lineage`,
            );
            const immediateTransition = relation === "mutatus" &&
                ([coupled.mother, coupled.child].some((layer) =>
                    qualificationUsesImmediateLowDeck(layer)));
            const immediateMotherDeck = qualificationUsesImmediateLowDeck(
                coupled.mother,
            );
            const sharedLineageRangeKm = !immediateTransition &&
                !immediateMotherDeck
                ? qualificationLineageSharedRangeKm(
                    coupled.mother,
                    coupled.child,
                )
                : undefined;
            let motherManifold;
            let childManifold;
            if (sharedLineageRangeKm !== undefined) {
                let selectedScore = Number.POSITIVE_INFINITY;
                let selectedBearing = sharedBearing;
                let provisionalMother;
                let provisionalChild;
                let finalSharedRangeKm = sharedLineageRangeKm;
                const candidateBearings = [
                    sharedBearing,
                    ...Array.from({ length: 25 }, (_, index) =>
                        -0.155 + index * 0.31 / 24),
                ];
                for (const candidateBearing of candidateBearings) {
                    let candidateMother = qualificationLineageManifold({
                        id: motherId,
                        layer: coupled.mother,
                        classification: motherClassification,
                        bearing: candidateBearing,
                        rangeKm: sharedLineageRangeKm,
                        baseScale: 1.12,
                    });
                    let candidateChild = qualificationLineageManifold({
                        id: childId,
                        layer: coupled.child,
                        classification: target.classification,
                        bearing: candidateBearing + 0.025,
                        rangeKm: sharedLineageRangeKm,
                        baseScale: 0.82,
                    });
                    const childTopKm = (
                        coupled.child.baseAltitude + coupled.child.thickness
                    ) / 1000;
                    const visibleTopKm = Math.max(
                        (coupled.mother.baseAltitude +
                            coupled.mother.thickness) / 1000,
                        childTopKm,
                    );
                    const finiteFormationRadiusKm = Math.min(
                        20,
                        Math.max(
                            candidateMother.majorRadiusKm,
                            candidateChild.majorRadiusKm,
                        ),
                    );
                    // A readable semi-ground composition needs room for both
                    // the finite horizontal formation and its complete
                    // vertical development. This physical lower bound tracks
                    // the same angular quantities as the production lens and
                    // prevents compact/deep pairs from filling the frame,
                    // while the cap keeps synoptic shields from being pushed
                    // beyond their shared attachment altitude.
                    const verticalRangeWeight = 0.88 + Math.min(
                        0.82,
                        finiteFormationRadiusKm / 20 * 0.82,
                    );
                    const compositionRangeKm =
                        finiteFormationRadiusKm * 1.5 +
                        visibleTopKm * verticalRangeWeight;
                    const provisionalRangeKm = Math.max(
                        sharedLineageRangeKm,
                        compositionRangeKm,
                    );
                    const childNeedsNearPerimeter = relation === "genitus" &&
                        Math.atan2(
                            childTopKm,
                            provisionalRangeKm,
                        ) < QUALIFICATION_MINIMUM_FRAME_ELEVATION_RADIANS +
                            0.005;
                    if (childNeedsNearPerimeter) {
                        const oriented = orientQualificationGenitusManifolds(
                            candidateMother,
                            candidateChild,
                            motherId,
                            childId,
                            candidateBearing,
                        );
                        candidateMother = oriented.parent;
                        candidateChild = oriented.child;
                    }
                    const motherSupport = qualificationManifoldAxisSupportKm(
                        candidateMother,
                        candidateBearing,
                    );
                    const childSupport = qualificationManifoldAxisSupportKm(
                        candidateChild,
                        candidateBearing + 0.025,
                    );
                    const physicalFloorRangeKm = Math.max(
                        Math.hypot(
                            candidateMother.centerEastKm,
                            candidateMother.centerNorthKm,
                        ),
                        Math.hypot(
                            candidateChild.centerEastKm,
                            candidateChild.centerNorthKm,
                        ),
                        motherSupport.radial +
                            candidateMother.boundaryTransitionKm * 1.08,
                        childSupport.radial +
                            candidateChild.boundaryTransitionKm * 1.08,
                    );
                    const candidateSharedRangeKm = Math.max(
                        sharedLineageRangeKm,
                        compositionRangeKm,
                        physicalFloorRangeKm,
                    );
                    const score = Math.abs(Math.log(
                        candidateSharedRangeKm / sharedLineageRangeKm,
                    )) + Math.abs(Math.log(
                        physicalFloorRangeKm / sharedLineageRangeKm,
                    )) * 0.2 + Math.abs(Math.atan2(
                        Math.sin(candidateBearing - sharedBearing),
                        Math.cos(candidateBearing - sharedBearing),
                    )) * 0.01;
                    if (score >= selectedScore) continue;
                    selectedScore = score;
                    selectedBearing = candidateBearing;
                    provisionalMother = candidateMother;
                    provisionalChild = candidateChild;
                    finalSharedRangeKm = candidateSharedRangeKm;
                }
                if (!provisionalMother || !provisionalChild) {
                    throw new Error(`No qualification lineage for ${target.id}.`);
                }
                sharedBearing = selectedBearing;
                motherManifold = recenterQualificationManifold(
                    provisionalMother,
                    sharedBearing,
                    finalSharedRangeKm,
                );
                childManifold = recenterQualificationManifold(
                    provisionalChild,
                    sharedBearing + 0.025,
                    finalSharedRangeKm,
                );
            } else {
                motherManifold = qualificationSystemManifold(
                    motherId,
                    coupled.mother,
                    motherClassification,
                    {
                        bearing: sharedBearing,
                        ...(immediateTransition || immediateMotherDeck
                            ? { rangeKm: 0 } : {}),
                        scale: 1.12,
                    },
                );
                childManifold = qualificationSystemManifold(
                    childId,
                    coupled.child,
                    target.classification,
                    {
                        bearing: sharedBearing + 0.025,
                        ...(immediateTransition ? { rangeKm: 0 } : {}),
                        scale: 0.82,
                    },
                );
            }
            const lineageAssignments: NonNullable<
                CloudScene["classifications"]
            > = [
                {
                    layerIndex: motherLayerIndex,
                    systemId: motherId,
                    relation: "mother",
                    classification: motherClassification,
                },
                {
                    ...assignment,
                    scope: "owner",
                    systemId: childId,
                    causalParent: {
                        layerIndex: motherLayerIndex,
                        systemId: motherId,
                    },
                    ...(relation === "mutatus" ? {
                        transitionProgress: 0.56,
                    } : {}),
                },
            ];
            if (sharedLineageRangeKm !== undefined) {
                const bounded = solveQualificationLineageEnvelope({
                    targetId: target.id,
                    relation,
                    parentId: motherId,
                    childId,
                    parent: {
                        layer: coupled.mother,
                        manifold: motherManifold,
                    },
                    child: {
                        layer: coupled.child,
                        manifold: childManifold,
                    },
                    sceneTemplate: scene,
                    parentLayerIndex: motherLayerIndex,
                    childLayerIndex: layerIndex,
                    assignments: lineageAssignments,
                });
                motherManifold = bounded.parent.manifold;
                childManifold = bounded.child.manifold;
            }
            scene.authoredSystems = [
                {
                    id: motherId,
                    layerIndex: motherLayerIndex,
                    layer: coupled.mother,
                    manifold: motherManifold,
                },
                {
                    id: childId,
                    layerIndex,
                    layer: coupled.child,
                    manifold: childManifold,
                },
            ];
            scene.classifications = lineageAssignments;
            classifications.unshift(motherClassification);
        } else {
            scene.classifications = [assignment];
        }
        phenomena.push(target.axis);
        if (target.precipitationKind) phenomena.push(target.precipitationKind);
        if (target.lifecycleStage) phenomena.push(target.lifecycleStage);
    } else if (target.kind === "surface-obscuration") {
        scene.fog = target.obscuration === "mist" ? 0.26
            : target.obscuration === "diamond-dust" ? 0.04 : 0.88;
        phenomena.push(target.obscuration);
    } else if (target.kind === "upper-atmospheric") {
        scene.noctilucent = target.upperCloud === "noctilucent" ? 0.82 : 0;
        scene.classifications = [{
            layerIndex: 2,
            systemIndex: 11,
            classification: classificationFromRendererSpecies("cirrus-fibratus"),
            upperAtmosphericCloud: target.upperCloud,
        }];
        phenomena.push(target.upperCloud);
    } else {
        const nextSystemIndex = [0, 0, 0];
        const assignments = [] as NonNullable<CloudScene["classifications"]>[number][];
        const authoredSystems: NonNullable<CloudScene["authoredSystems"]>[number][] = [];
        const authoredIdsByLevel: string[][] = [[], [], []];
        for (const [index, system] of target.systems.entries()) {
            const rendererSpecies = rendererSpeciesForClassification(system.classification);
            if (!rendererSpecies) continue;
            const level = CLOUD_GENUS_LEVEL[system.classification.genus];
            const layerIndex = level === "low" ? 0 : level === "middle" ? 1 : 2;
            const systemId = `${target.id}:system:${index}`;
            const authoredLayer = createLayer({
                genus: system.classification.genus,
                species: rendererSpecies,
                oktas: system.classification.genus === "nimbostratus" ? 8 : 4,
                baseAltitude: system.baseAltitudeKm * 1000,
                thickness: (system.topAltitudeKm - system.baseAltitudeKm) * 1000,
                convection: system.classification.genus === "cumulonimbus" ? 0.96 : 0.2,
                // Embedded pannus/fractus is condensate generated in the
                // parent's precipitation-moistened air, not an independent
                // precipitation source. Keep production owned by the Ns/Cb
                // parent instead of inheriting a genus-profile default.
                precipitation: system.classification.genus === "nimbostratus"
                    ? 0.78
                    : system.classification.genus === "cumulonimbus" ? 0.68 : 0,
                windSpeed: environment.windSpeedMetersPerSecond * (1 + index * 0.35),
                windDirection: seedForQualification(`${target.id}:${index}`)[0] * Math.PI * 2,
                organization: system.classification.genus === "nimbostratus" ||
                    system.classification.genus === "cirrostratus" ? "frontal" :
                    rendererSpecies.includes("lenticularis") ? "banded" : undefined,
            });
            scene.layers[layerIndex] = authoredLayer;
            authoredIdsByLevel[layerIndex].push(systemId);
            authoredSystems.push({
                id: systemId,
                layerIndex,
                layer: authoredLayer,
                manifold: qualificationSystemManifold(
                    systemId,
                    authoredLayer,
                    system.classification,
                    {
                        bearing: qualificationMultilayerBearing(
                            target.id,
                            index,
                            target.systems.length,
                            layerIndex,
                            system.relation,
                        ),
                        rangeKm: qualificationUsesImmediateLowDeck(authoredLayer)
                            ? 0
                            : layerIndex === 0 ? 18 + index * 7
                                : layerIndex === 1 ? 34 + index * 11
                                    : 54 + index * 16,
                    },
                ),
            });
            classifications.push(system.classification);
            assignments.push({
                layerIndex,
                systemId,
                classification: system.classification,
                relation: system.relation,
                ...(system.causalParent ? {
                    causalParent: {
                        ...system.causalParent,
                        ...(system.causalParent.systemId ? {} : {
                            systemId: authoredIdsByLevel[
                                system.causalParent.layerIndex
                            ]?.[system.causalParent.systemIndex ?? 0],
                        }),
                    },
                } : {}),
                ...(system.transitionProgress === undefined ? {} : {
                    transitionProgress: system.transitionProgress,
                }),
            });
            nextSystemIndex[layerIndex] += 1;
        }
        scene.classifications = assignments;
        scene.authoredSystems = authoredSystems;
        scene.convection = classifications.some(({ genus }) => genus === "cumulonimbus")
            ? 0.96 : scene.convection;
        scene.instability = scene.convection;
        phenomena.push("multilayer");
    }
    return {
        scene: constrainScene(scene),
        classifications,
        phenomena,
    };
};

/** Resolve a lazy matrix case into the physical inputs the sky system can execute. */
export function resolveWeatherQualificationCase(
    qualificationCase: WeatherQualificationCase,
): ResolvedWeatherQualificationState {
    const { target, environment } = qualificationCase;
    const { scene, classifications, phenomena } =
        sceneForQualification(qualificationCase);
    const twilightContribution = clamp(
        (environment.solarElevationDegrees + 18) / 18,
    );
    const moonContribution = environment.moonElevationDegrees > 0
        ? environment.moonIlluminatedFraction *
            Math.sin(environment.moonElevationDegrees * Math.PI / 180) : 0;
    const darkness = clamp(1 - twilightContribution * 0.96 -
        moonContribution * 0.22 - environment.artificialSkyglow * 0.72);
    const targetVisibility = target.kind === "surface-obscuration"
        ? (target.visibilityKm[0] + target.visibilityKm[1]) * 0.5
        : environment.surfaceVisibilityKm;
    const hydrometeors: HydrometeorSceneOverrides = {};
    hydrometeors.boundaryLayer = {
        surfaceTemperatureKelvin: environment.surfaceTemperatureKelvin,
        surfaceRelativeHumidity: environment.relativeHumidity,
        surfaceWindSpeed: environment.windSpeedMetersPerSecond,
    };
    if (target.kind === "cloud" && target.precipitationKind) {
        const level = CLOUD_GENUS_LEVEL[target.classification.genus];
        const hydrometeorRateMmHour = target.precipitationKind === "drizzle" ? 0.8
            : target.precipitationKind === "virga" ? 1.5
                : target.precipitationKind === "hail" ? 45
                    : target.precipitationKind === "shower" ? 24
                        : target.precipitationKind === "rain" ? 8
                            : target.precipitationKind === "snow" ? 4 : 3;
        hydrometeors.cloudPrecipitation = [{
            layerIndex: level === "low" ? 0 : level === "middle" ? 1 : 2,
            kind: target.precipitationKind,
            rateMmHour: hydrometeorRateMmHour,
        }];
        if (target.precipitationKind === "ice-pellets") {
            hydrometeors.phaseProfile = {
                warmLayerBottomKm: 0.65,
                warmLayerTopKm: 1.65,
                warmLayerTemperatureKelvin: 275.5,
                surfaceColdLayerDepthKm: 0.65,
            };
        }
    } else if (target.kind === "surface-obscuration") {
        const regionSeed = seedForQualification(`${target.id}:${environment.id}`);
        hydrometeors.surface = {
            phenomenon: target.obscuration,
            visibilityKm: targetVisibility,
            region: {
                id: `qualification-${target.id}`,
                centerEastKm: (regionSeed[0] - 0.5) * 18,
                centerNorthKm: 14 + regionSeed[1] * 18,
                majorRadiusKm: 16 + regionSeed[2] * 16,
                minorRadiusKm: 8 + regionSeed[3] * 9,
                orientation: regionSeed[0] * Math.PI,
                topAltitudeKm: (target.depthKm[0] + target.depthKm[1]) * 0.5,
                seed: regionSeed[2],
            },
        };
        hydrometeors.boundaryLayer = {
            ...hydrometeors.boundaryLayer,
            surfaceRelativeHumidity: Math.max(
                environment.relativeHumidity,
                target.obscuration === "fog" ? 0.95
                    : target.obscuration === "mist" ? 0.8
                        : target.obscuration === "ice-fog" ? 0.9 : 0.68,
            ),
        };
    }
    return {
        cloudScene: scene,
        classifications,
        atmosphere: {
            aerosolType: environment.aerosolType,
            aerosolOpticalDepth550: environment.aerosolOpticalDepth,
            aerosolAngstromExponent: environment.aerosolAngstromExponent,
            aerosolSingleScatteringAlbedo:
                environment.aerosolSingleScatteringAlbedo,
            stratosphericAerosolOpticalDepth:
                environment.stratosphericAerosolOpticalDepth,
            ozoneDobsonUnits: environment.ozoneDobsonUnits,
            relativeHumidity: environment.relativeHumidity,
            visibilityKm: targetVisibility,
        },
        illumination: {
            solarElevationDegrees: environment.solarElevationDegrees,
            lighting: environment.lighting,
            moonElevationDegrees: environment.moonElevationDegrees,
            moonIlluminatedFraction: environment.moonIlluminatedFraction,
            moonRelativeAzimuthDegrees: environment.moonRelativeAzimuthDegrees,
            artificialSkyglow: environment.artificialSkyglow,
            darkness,
        },
        surface: {
            temperatureKelvin: environment.surfaceTemperatureKelvin,
            albedo: environment.surfaceAlbedo,
            visibilityKm: targetVisibility,
            windSpeedMetersPerSecond: environment.windSpeedMetersPerSecond,
            boundaryLayer: environment.boundaryLayer,
            freezingLevelKm: environment.freezingLevelKm,
        },
        phenomena,
        hydrometeors,
        remainingRendererDependencies: rendererDependencyFor(target),
    };
}

export function validateQualificationEnvironment(
    environment: QualificationEnvironment,
): string[] {
    const issues: string[] = [];
    if (!Number.isFinite(environment.stratosphericTemperatureKelvin) ||
        environment.stratosphericTemperatureKelvin <= 0) {
        issues.push("stratospheric temperature must be finite and positive");
    }
    if (!Number.isFinite(environment.mesopauseTemperatureKelvin) ||
        environment.mesopauseTemperatureKelvin <= 0) {
        issues.push("mesopause temperature must be finite and positive");
    }
    if (environment.relativeHumidity < 0 || environment.relativeHumidity > 1) {
        issues.push("relative humidity must be in [0, 1]");
    }
    if (environment.aerosolOpticalDepth < 0 ||
        environment.aerosolOpticalDepth > 3) {
        issues.push("AOD550 must be in [0, 3]");
    }
    if (environment.aerosolSingleScatteringAlbedo < 0.7 ||
        environment.aerosolSingleScatteringAlbedo > 1) {
        issues.push("aerosol single-scattering albedo must be in [0.7, 1]");
    }
    if (environment.aerosolAngstromExponent < 0 ||
        environment.aerosolAngstromExponent > 2.6) {
        issues.push("Ångström exponent must be in [0, 2.6]");
    }
    if (environment.lighting === "twilight" &&
        (environment.solarElevationDegrees >= 0 ||
            environment.solarElevationDegrees < -18)) {
        issues.push("twilight requires the Sun 0-18 degrees below the horizon");
    }
    if ((environment.lighting === "moon" || environment.lighting === "moonless") &&
        environment.solarElevationDegrees > -12) {
        issues.push("night illumination requires at least nautical darkness");
    }
    if (environment.lighting === "moon" &&
        (environment.moonElevationDegrees <= 0 ||
            environment.moonIlluminatedFraction <= 0.02)) {
        issues.push("moonlight requires an illuminated Moon above the horizon");
    }
    if (environment.lighting === "moonless" &&
        environment.moonElevationDegrees > 0 &&
        environment.moonIlluminatedFraction > 0.08) {
        issues.push("moonless state cannot contain a bright Moon above the horizon");
    }
    if (environment.aerosolType === "maritime" &&
        environment.aerosolAngstromExponent > 1.15) {
        issues.push("maritime aerosol must retain a coarse-particle spectrum");
    }
    if (environment.aerosolType === "smoke" &&
        environment.aerosolAngstromExponent < 1.1) {
        issues.push("smoke aerosol must retain a fine-particle spectrum");
    }
    if (environment.aerosolType === "sulfate" &&
        environment.aerosolSingleScatteringAlbedo < 0.96) {
        issues.push("sulfate afterglow cannot use strongly absorbing aerosol");
    }
    return issues;
}

/** Reject impossible qualification entries instead of letting the GPU hide them. */
export function validateWeatherQualificationTarget(
    target: WeatherQualificationTarget,
): QualificationValidationIssue[] {
    const issues: QualificationValidationIssue[] = [];
    const issue = (code: string, message: string) =>
        issues.push({ targetId: target.id, code, message });
    if (target.environments.length === 0 ||
        target.environments.some((id) => !environmentById.has(id))) {
        issue("invalid-environment", "Every target requires known physical environments.");
    }
    if (target.perspectives.length === 0 ||
        target.perspectives.some((id) => !perspectiveById.has(id))) {
        issue("invalid-perspective", "Every target requires known camera perspectives.");
    }
    for (const environmentId of target.environments) {
        const environment = environmentById.get(environmentId);
        if (!environment) continue;
        for (const environmentIssue of validateQualificationEnvironment(environment)) {
            issue("invalid-physical-environment",
                `${environmentId}: ${environmentIssue}`);
        }
    }
    if (target.kind === "cloud") {
        const { classification } = target;
        const validSpecies = WMO_SPECIES_BY_GENUS[classification.genus] as readonly string[];
        if (classification.species !== null &&
            !validSpecies.includes(classification.species)) {
            issue("invalid-genus-species", "Species does not belong to its WMO genus.");
        }
        for (const variety of classification.varieties) {
            if (!CLOUD_VARIETY_GENERA[variety].includes(classification.genus)) {
                issue("invalid-variety-owner", `${variety} cannot qualify ${classification.genus}.`);
            }
        }
        for (const feature of classification.supplementaryFeatures) {
            if (!CLOUD_FEATURE_GENERA[feature].includes(classification.genus)) {
                issue("invalid-feature-owner", `${feature} cannot qualify ${classification.genus}.`);
            }
        }
        for (const accessory of classification.accessoryClouds) {
            if (!CLOUD_ACCESSORY_GENERA[accessory].includes(classification.genus)) {
                issue("invalid-accessory-owner", `${accessory} cannot qualify ${classification.genus}.`);
            }
        }
        if (target.precipitationKind) {
            const owners: readonly CloudGenus[] = Object.hasOwn(
                CLOUD_PRECIPITATION_GENERA, target.precipitationKind)
                ? CLOUD_PRECIPITATION_GENERA[
                    target.precipitationKind as CloudPrecipitationKind]
                : extendedPrecipitationGenera[
                    target.precipitationKind as keyof typeof extendedPrecipitationGenera];
            if (!owners?.includes(classification.genus)) {
                issue("invalid-precipitation-owner",
                    `${target.precipitationKind} cannot qualify ${classification.genus}.`);
            }
        }
        if (classification.supplementaryFeatures.includes("cauda") &&
            !classification.supplementaryFeatures.includes("murus")) {
            issue("cauda-without-murus", "Cauda requires its murus connection.");
        }
        if (classification.origin.kind === "special" &&
            !CLOUD_SPECIAL_ORIGIN_GENERA[classification.origin.designation]
                .includes(classification.genus)) {
            issue("invalid-special-origin-owner", "Special origin has an impossible genus.");
        }
        if (classification.origin.kind === "genitus" ||
            classification.origin.kind === "mutatus") {
            if (classification.origin.motherGenus === classification.genus) {
                issue("self-mother-cloud", "A cloud cannot transform from itself.");
            } else if (!CLOUD_MOTHER_GENUS_RELATIONS[classification.genus]
                [classification.origin.kind]
                .includes(classification.origin.motherGenus)) {
                issue("invalid-mother-cloud-relation",
                    "The child/mother genus direction is absent from the WMO table.");
            }
        }
    } else if (target.kind === "surface-obscuration") {
        if (target.obscuration === "fog" && target.visibilityKm[1] >= 1) {
            issue("fog-visibility", "WMO fog visibility must remain below 1 km.");
        }
        if (target.obscuration === "mist" && target.visibilityKm[0] < 1) {
            issue("mist-visibility", "WMO mist visibility must remain at or above 1 km.");
        }
        if (target.depthKm[0] <= 0 || target.depthKm[1] <= target.depthKm[0]) {
            issue("invalid-obscuration-depth", "Surface obscuration needs positive finite depth.");
        }
        if (target.obscuration === "ice-fog") {
            for (const environmentId of target.environments) {
                const environment = environmentById.get(environmentId);
                if (environment && (environment.surfaceTemperatureKelvin > 243.15 ||
                    environment.windSpeedMetersPerSecond > 2 ||
                    environment.surfaceVisibilityKm >= 0.05)) {
                    issue("invalid-ice-fog-environment",
                        "Ice fog requires very cold (at most -30 C), calm air and visibility commonly below 50 m.");
                }
            }
        }
    } else if (target.kind === "upper-atmospheric") {
        if (target.upperCloud === "noctilucent" &&
            (target.altitudeKm[0] < 80 || target.altitudeKm[1] > 85 ||
                target.season !== "summer" || target.solarDepressionDegrees[0] < 6 ||
                target.solarDepressionDegrees[1] > 16)) {
            issue("invalid-noctilucent-domain", "Noctilucent state is outside its mesopause summer-twilight domain.");
        }
        if (target.upperCloud !== "noctilucent" &&
            (target.altitudeKm[0] < 15 || target.altitudeKm[1] > 30 ||
                target.season !== "winter")) {
            issue("invalid-psc-domain", "Polar stratospheric cloud is outside its winter 15-30 km domain.");
        }
        for (const environmentId of target.environments) {
            const environment = environmentById.get(environmentId);
            if (!environment) continue;
            const depression = -environment.solarElevationDegrees;
            if (Math.abs(environment.latitude) < target.absoluteLatitudeDegrees[0] ||
                Math.abs(environment.latitude) > target.absoluteLatitudeDegrees[1] ||
                depression < target.solarDepressionDegrees[0] ||
                depression > target.solarDepressionDegrees[1] ||
                target.season === "summer" && environment.season < 0.7 ||
                target.season === "winter" && environment.season > 0.3) {
                issue("invalid-upper-atmospheric-environment",
                    "The linked latitude, season and solar depression cannot produce this upper cloud.");
            }
            const maximumPscTemperature =
                target.upperCloud === "nacreous" ||
                target.upperCloud === "polar-stratospheric-ice" ? 188.15
                    : target.upperCloud === "polar-stratospheric-nat" ? 195
                        : 198;
            if (target.upperCloud !== "noctilucent" &&
                environment.stratosphericTemperatureKelvin >
                    maximumPscTemperature) {
                issue("warm-nacreous-environment",
                    "The selected PSC particle class requires a colder stratosphere.");
            }
            if (target.upperCloud === "noctilucent" &&
                environment.mesopauseTemperatureKelvin > 153) {
                issue("warm-noctilucent-environment",
                    "Noctilucent ice requires the exceptionally cold polar-summer mesopause.");
            }
        }
    } else {
        if (target.systems.length < 2) {
            issue("not-multilayer", "A multilayer target must contain at least two systems.");
        }
        const nextSystemIndex = [0, 0, 0];
        const authoredOwners = target.systems.map((system) => {
            const level = CLOUD_GENUS_LEVEL[system.classification.genus];
            const layerIndex = level === "low" ? 0 : level === "middle" ? 1 : 2;
            return {
                ...system,
                layerIndex,
                systemIndex: nextSystemIndex[layerIndex]++,
            };
        });
        for (const system of authoredOwners) {
            if (system.topAltitudeKm <= system.baseAltitudeKm) {
                issue("invalid-layer-depth",
                    "Every multilayer owner needs positive finite depth.");
            }
            const causal = system.relation === "genitus" ||
                system.relation === "mutatus";
            const origin = system.classification.origin;
            if (causal) {
                if (origin.kind !== system.relation || !system.causalParent) {
                    issue("invalid-causal-system",
                        "A causal multilayer child needs matching origin and parent reference.");
                    continue;
                }
                const parent = authoredOwners.find((candidate) =>
                    candidate.layerIndex === system.causalParent!.layerIndex &&
                    (system.causalParent!.systemId !== undefined
                        ? false
                        : candidate.systemIndex ===
                            (system.causalParent!.systemIndex ?? 0)));
                if (!parent) {
                    issue("missing-causal-parent",
                        "The referenced mother owner is absent from the multilayer target.");
                    continue;
                }
                if (origin.motherGenus !== parent.classification.genus ||
                    !CLOUD_MOTHER_GENUS_RELATIONS[system.classification.genus]
                        [system.relation].includes(parent.classification.genus)) {
                    issue("invalid-causal-parent-genus",
                        "The linked owner does not satisfy the WMO mother-cloud table.");
                }
                const verticalOverlap = Math.min(system.topAltitudeKm,
                    parent.topAltitudeKm) - Math.max(system.baseAltitudeKm,
                    parent.baseAltitudeKm);
                if (verticalOverlap <= 0) {
                    issue("detached-causal-altitudes",
                        "A causal transition needs a shared vertical formation interface.");
                }
                if (system.relation === "mutatus" &&
                    (system.transitionProgress === undefined ||
                        system.transitionProgress <= 0 ||
                        system.transitionProgress >= 1)) {
                    issue("invalid-mutatus-progress",
                        "A curated mutatus pair needs progress strictly inside (0, 1).");
                }
            } else if (system.causalParent || system.transitionProgress !== undefined) {
                issue("causal-state-on-independent-owner",
                    "Only a genitus/mutatus child may carry causal state.");
            }
        }
        const independent = target.systems
            .filter((system) => system.relation === "independent")
            .sort((left, right) => left.baseAltitudeKm - right.baseAltitudeKm);
        for (let index = 0; index < independent.length; index += 1) {
            const system = independent[index];
            if (index > 0 && system.baseAltitudeKm < independent[index - 1].topAltitudeKm) {
                issue("overlapping-independent-layers", "Independent layers cannot occupy the same volume.");
            }
        }
    }
    return issues;
}

/** Yield one serial review job at a time; no browser or render work occurs here. */
export function* iterateWeatherQualificationCases(
    targetIds?: ReadonlySet<string>,
): Generator<WeatherQualificationCase> {
    for (const target of WEATHER_QUALIFICATION_TARGETS) {
        if (targetIds && !targetIds.has(target.id)) continue;
        for (const environmentId of target.environments) {
            const environment = environmentById.get(environmentId);
            if (!environment) continue;
            for (const perspectiveId of target.perspectives) {
                const perspective = perspectiveById.get(perspectiveId);
                if (!perspective) continue;
                yield {
                    id: `${target.id}--${environmentId}--${perspectiveId}`,
                    target,
                    environment,
                    perspective,
                };
            }
        }
    }
}

const countCases = () => {
    let count = 0;
    for (const _case of iterateWeatherQualificationCases()) count += 1;
    return count;
};

export const WEATHER_QUALIFICATION_SUMMARY = {
    targets: WEATHER_QUALIFICATION_TARGETS.length,
    cases: countCases(),
    byAxis: Object.fromEntries(
        ([
            "species", "variety", "supplementary-feature", "accessory-cloud",
            "precipitation", "convective-lifecycle", "mother-cloud",
            "special-origin", "surface-obscuration", "upper-atmospheric",
            "multilayer",
        ] as const).map((axis) => [axis,
            WEATHER_QUALIFICATION_TARGETS.filter((target) => target.axis === axis).length]),
    ),
    byImplementation: Object.fromEntries(([
        "packed", "operator-active", "transport-attached",
        "photographically-qualified", "not-representable",
    ] as const).map((status) => [status,
        WEATHER_QUALIFICATION_TARGETS.filter(
            (target) => target.implementation === status,
        ).length])),
    transportGaps: WEATHER_QUALIFICATION_TARGETS.filter((target) =>
        target.implementation === "packed" ||
        target.implementation === "operator-active" ||
        target.implementation === "not-representable").length,
    photographicGaps: WEATHER_QUALIFICATION_TARGETS.filter(
        (target) => target.implementation !== "photographically-qualified",
    ).length,
};

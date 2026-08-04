"use client";

import {
    Children,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    SKY_BLOOM_STYLES,
    Sky,
    SkyBloomStyle,
    SkyMotionStyle,
    SkyPreviewOptions,
    SkySnapshot,
} from "@/components/backgrounds/sky/sky";
import {
    PHASE_ORDER,
    SKY_FAMILIES,
    SkyAerosolType,
    SkyAtmosphere,
    SkyPhase,
    SkyRegion,
    SkySeason,
} from "@/components/backgrounds/sky/sky-palettes";

import {
    constrainScene,
    createLayer,
    EMPTY_LAYER,
    type CloudGenus,
    type CloudOrganization,
    type CloudScene,
} from "@/components/backgrounds/sky/cloud-scene";
import { createCloudSystemRuntime } from
    "@/components/backgrounds/sky/cloud-system-runtime";
import {
    type SkyDebugView,
    type SkyCloudComposition,
    type SkyCloudEditorialRegime,
    type SkyCloudPerspective,
    type SkyRendererPreference,
    type SkyRendererQuality,
    type SkyRendererStats,
} from "@/components/backgrounds/sky/renderer-types";
import type {
    HydrometeorPrecipitationKind,
    HydrometeorSceneOverrides,
} from "@/components/backgrounds/sky/hydrometeor-system";
import {
    WEATHER_QUALIFICATION_ENVIRONMENTS,
    WEATHER_QUALIFICATION_PERSPECTIVES,
    WEATHER_QUALIFICATION_TARGETS,
    resolveWeatherQualificationCase,
    type ResolvedWeatherQualificationState,
    type WeatherQualificationCase,
} from "@/components/backgrounds/sky/weather-qualification-matrix";
import styles from "./sky-lab.module.css";

const TIMEZONES = [
    "America/Los_Angeles",
    "America/Vancouver",
    "America/Denver",
    "America/Phoenix",
    "America/Chicago",
    "America/New_York",
    "America/Halifax",
    "America/Mexico_City",
    "America/Sao_Paulo",
    "Europe/London",
    "Europe/Paris",
    "Europe/Madrid",
    "Europe/Athens",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
    "Pacific/Honolulu",
] as const;

const ATMOSPHERES: SkyAtmosphere[] = [
    "crystal",
    "haze",
    "cirrus",
    "mist",
    "soft",
];
const MOTIONS: SkyMotionStyle[] = [
    "drift",
    "bloom",
    "tide",
    "crosswind",
    "thermal",
];
const REGIONS: SkyRegion[] = [
    "marine",
    "continental",
    "dry",
    "humid",
    "tropical",
    "polar",
];
const SEASONS: SkySeason[] = ["winter", "spring", "summer", "autumn"];
const AEROSOL_TYPES: SkyAerosolType[] = [
    "clean",
    "maritime",
    "dust",
    "smoke",
    "sulfate",
    "pollution",
];

const PHASE_LABELS: Record<SkyPhase, string> = {
    night: "Night",
    blueHourMorning: "Morning blue hour",
    preDawn: "Pre-dawn",
    beltOfVenus: "Belt of Venus",
    sunrise: "Sunrise",
    morning: "Morning",
    solarNoon: "Solar noon",
    day: "Afternoon",
    golden: "Golden hour",
    sunset: "Sunset",
    afterglow: "Afterglow",
    dusk: "Dusk",
    blueHourEvening: "Evening blue hour",
};

interface LabSettings {
    date: string;
    time: string;
    timezone: string;
    family: string;
    phase: "natural" | SkyPhase;
    atmosphere: "auto" | SkyAtmosphere;
    motion: "auto" | SkyMotionStyle;
    bloom: "auto" | SkyBloomStyle;
    region: "auto" | SkyRegion;
    season: "auto" | SkySeason;
    variant: "auto" | "-1" | "0" | "1";
    edgeDirection: "auto" | "original" | "flipped";
    manualGrade: boolean;
    hue: number;
    chroma: number;
    lightness: number;
    manualIntensity: boolean;
    contrast: number;
    saturation: number;
    edge: number;
    glow: number;
    haze: number;
    manualComposition: boolean;
    aerosolType: "auto" | SkyAerosolType;
    aerosol: number;
    humidity: number;
    aerosolSize: number;
    aerosolAbsorption: number;
    ozone: number;
    observerAltitude: number;
    inversion: number;
    stratosphericAerosol: number;
    groundAlbedo: number;
    cloudDensity: number;
    manualClouds: boolean;
    lowGenus: string;
    lowOktas: number;
    midGenus: string;
    midOktas: number;
    highGenus: string;
    highOktas: number;
    cloudConvection: number;
    cloudSeed: number;
    cloudTimeline: number;
    cloudInstability: number;
    cloudFog: number;
    cloudNoctilucent: number;
    hydrometeorPreset: string;
    weatherHydrometeorTarget: string;
    weatherHydrometeorEnvironment: string;
    weatherHydrometeorPerspective: string;
    lowBase: number;
    lowThickness: number;
    lowOptical: number;
    lowWind: number;
    lowDirection: number;
    lowShear: number;
    lowTurbulence: number;
    lowIce: number;
    lowPrecipitation: number;
    lowOrganization: CloudOrganization;
    lowLifecycle: number;
    lowOrganizationStrength: number;
    midBase: number;
    midThickness: number;
    midOptical: number;
    midWind: number;
    midDirection: number;
    midShear: number;
    midTurbulence: number;
    midIce: number;
    midPrecipitation: number;
    midOrganization: CloudOrganization;
    midLifecycle: number;
    midOrganizationStrength: number;
    highBase: number;
    highThickness: number;
    highOptical: number;
    highWind: number;
    highDirection: number;
    highShear: number;
    highTurbulence: number;
    highIce: number;
    highPrecipitation: number;
    highOrganization: CloudOrganization;
    highLifecycle: number;
    highOrganizationStrength: number;
    rendererPreference: SkyRendererPreference;
    rendererQuality: SkyRendererQuality;
    rendererDebugView: SkyDebugView;
    cloudResolutionScale: number;
    cloudUpdateRate: number;
    temporalClouds: boolean;
    cloudComposition: SkyCloudComposition;
    cloudPerspective: SkyCloudPerspective;
    cloudEditorialRegime: SkyCloudEditorialRegime;
    motionSpeed: number;
    motionAmount: number;
    bloomVisibility: number;
    bloomScale: number;
    starVisibility: number;
    stellarExposure: number;
    stellarGlow: number;
    moonVisibility: number;
    manualNightExposure: boolean;
    nightExposure: number;
    paused: boolean;
}

const localDate = (date: Date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");

const LOW_GENERA = [
    "clear",
    "cumulus",
    "stratocumulus",
    "stratus",
    "cumulonimbus",
];
const MID_GENERA = ["clear", "altocumulus", "altostratus", "nimbostratus"];
const HIGH_GENERA = ["clear", "cirrus", "cirrocumulus", "cirrostratus"];
const CLOUD_ORGANIZATIONS: CloudOrganization[] = [
    "unorganized",
    "isolated",
    "streets",
    "open-cell",
    "closed-cell",
    "frontal",
    "banded",
];

const CLOUD_PRESETS: Array<{
    label: string;
    values: Partial<LabSettings>;
}> = [
    { label: "Clear", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "clear", midOktas: 0, highGenus: "clear", highOktas: 0, cloudFog: 0 } },
    { label: "Fair cumulus", values: { manualClouds: true, lowGenus: "cumulus", lowOktas: 3, lowBase: 1.25, lowThickness: 1.6, lowOptical: 0.72, lowOrganization: "isolated", lowLifecycle: 0.42, lowOrganizationStrength: 0.55, cloudConvection: 0.46, cloudInstability: 0.5 } },
    { label: "Marine cells", values: { manualClouds: true, lowGenus: "stratocumulus", lowOktas: 6, lowBase: 0.75, lowThickness: 1.1, lowOptical: 0.68, lowTurbulence: 0.28, lowOrganization: "closed-cell", lowLifecycle: 0.55, lowOrganizationStrength: 0.78, cloudConvection: 0.12 } },
    { label: "High cirrus", values: { manualClouds: true, highGenus: "cirrus", highOktas: 4, highBase: 9.2, highThickness: 1.1, highOptical: 0.2, highIce: 1, highWind: 28, highOrganization: "banded", highLifecycle: 0.62, highOrganizationStrength: 0.56 } },
    { label: "Altocumulus", values: { manualClouds: true, midGenus: "altocumulus", midOktas: 5, midBase: 4.6, midThickness: 1.25, midOptical: 0.48, midIce: 0.3, midOrganization: "closed-cell", midOrganizationStrength: 0.68 } },
    { label: "Rain deck", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "nimbostratus", midOktas: 8, midBase: 1.8, midThickness: 4.2, midOptical: 0.96, midPrecipitation: 0.82, midOrganization: "frontal", midOrganizationStrength: 0.82, cloudInstability: 0.22 } },
    { label: "Thunderstorm", values: { manualClouds: true, lowGenus: "cumulonimbus", lowOktas: 4, lowBase: 0.9, lowThickness: 11.5, lowOptical: 1, lowIce: 0.45, lowPrecipitation: 0.92, lowOrganization: "isolated", lowLifecycle: 0.5, lowOrganizationStrength: 0.82, cloudConvection: 0.95, cloudInstability: 0.94 } },
    { label: "Radiation fog", values: { manualClouds: true, lowGenus: "stratus", lowOktas: 7, lowBase: 0.12, lowThickness: 0.45, lowOptical: 0.58, cloudFog: 0.82, cloudConvection: 0.02 } },
];

interface HydrometeorLabPreset {
    id: string;
    label: string;
    description: string;
    values: Partial<LabSettings>;
    overrides?: HydrometeorSceneOverrides;
}

const precipitationOverride = (
    layerIndex: number,
    kind: HydrometeorPrecipitationKind,
    surfaceTemperatureKelvin: number,
    surfaceRelativeHumidity: number,
    phaseProfile?: HydrometeorSceneOverrides["phaseProfile"],
): HydrometeorSceneOverrides => ({
    cloudPrecipitation: [{
        layerIndex,
        kind,
        rateMmHour: kind === "drizzle" ? 0.8
            : kind === "virga" ? 1.5
                : kind === "hail" ? 45
                    : kind === "shower" ? 24
                        : kind === "rain" ? 8
                            : kind === "snow" && surfaceTemperatureKelvin < 263
                                ? 1.2
                                : kind === "snow" ? 5
                                    : kind === "snow-grains" ? 1
                                        : kind === "snow-pellets" ? 6 : 5,
    }],
    boundaryLayer: {
        surfaceTemperatureKelvin,
        surfaceRelativeHumidity,
    },
    phaseProfile,
});

const surfaceMeteorOverride = (
    phenomenon: NonNullable<HydrometeorSceneOverrides["surface"]>["phenomenon"],
    visibilityKm: number,
    surfaceTemperatureKelvin: number,
    surfaceRelativeHumidity: number,
): HydrometeorSceneOverrides => ({
    surface: {
        phenomenon,
        visibilityKm,
        region: {
            id: `sky-lab-${phenomenon}`,
            centerEastKm: -6,
            centerNorthKm: 20,
            majorRadiusKm: 25,
            minorRadiusKm: 13,
            orientation: 0.42,
            topAltitudeKm: phenomenon === "diamond-dust" ? 0.72
                : phenomenon === "ice-fog" ? 0.16 : 0.28,
            seed: 0.417,
        },
    },
    boundaryLayer: {
        surfaceTemperatureKelvin,
        surfaceRelativeHumidity,
        surfaceWindSpeed: phenomenon === "diamond-dust" || phenomenon === "ice-fog"
            ? 0.7 : 1.8,
    },
});

const CLEAR_WEATHER: Partial<LabSettings> = {
    manualClouds: true,
    lowGenus: "clear",
    lowOktas: 0,
    midGenus: "clear",
    midOktas: 0,
    highGenus: "clear",
    highOktas: 0,
    cloudFog: 0,
};

const HYDROMETEOR_PRESETS: readonly HydrometeorLabPreset[] = [
    { id: "daily", label: "Automatic daily weather", description: "No authoring override; cloud systems choose their natural precipitation.", values: { manualClouds: false } },
    { id: "drizzle", label: "Drizzle · Stratus", description: "Sub-0.5 mm drops in a finite, uniform Stratus curtain.", values: { manualClouds: true, lowGenus: "stratus", lowOktas: 8, lowBase: 0.35, lowThickness: 0.65, lowOptical: 0.78, lowPrecipitation: 0.3, lowIce: 0, lowOrganization: "frontal", cloudConvection: 0.02, cloudFog: 0, manualComposition: true, humidity: 0.94 }, overrides: precipitationOverride(0, "drizzle", 280, 0.96) },
    { id: "stratiform-rain", label: "Rain · Nimbostratus", description: "Broad source-owned stratiform rain with coherent fall curtains.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "nimbostratus", midOktas: 8, midBase: 1.7, midThickness: 4.1, midOptical: 1, midPrecipitation: 0.72, midIce: 0.22, midOrganization: "frontal", cloudConvection: 0.08, cloudFog: 0, manualComposition: true, humidity: 0.9 }, overrides: precipitationOverride(1, "rain", 285, 0.91) },
    { id: "convective-rain", label: "Rain shower · Cumulonimbus", description: "Compact, intermittent downshear shower shafts.", values: { manualClouds: true, lowGenus: "cumulonimbus", lowOktas: 4, lowBase: 0.85, lowThickness: 11.5, lowOptical: 1, lowPrecipitation: 0.9, lowIce: 0.42, lowOrganization: "isolated", cloudConvection: 0.96, cloudInstability: 0.95, cloudFog: 0 }, overrides: precipitationOverride(0, "shower", 291, 0.78) },
    { id: "snow-crystals", label: "Snow · pristine crystals", description: "Cold, low-rate plates/columns with slow fall and visible flutter.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "nimbostratus", midOktas: 7, midBase: 1.4, midThickness: 3.4, midOptical: 0.9, midPrecipitation: 0.05, midIce: 0.88, midOrganization: "frontal", manualComposition: true, humidity: 0.82, groundAlbedo: 0.78 }, overrides: precipitationOverride(1, "snow", 258, 0.88) },
    { id: "snow-flakes", label: "Snow · aggregate flakes", description: "Warmer, higher-rate aggregates with broad habit flutter.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "nimbostratus", midOktas: 8, midBase: 1.35, midThickness: 3.8, midOptical: 0.96, midPrecipitation: 0.52, midIce: 0.72, midOrganization: "frontal", manualComposition: true, humidity: 0.92, groundAlbedo: 0.72 }, overrides: precipitationOverride(1, "snow", 269, 0.94) },
    { id: "hail", label: "Hail · Cumulonimbus", description: "Dense, fast hailstones confined to a deep convective owner.", values: { manualClouds: true, lowGenus: "cumulonimbus", lowOktas: 5, lowBase: 0.8, lowThickness: 12, lowOptical: 1, lowPrecipitation: 1, lowIce: 0.55, lowOrganization: "isolated", cloudConvection: 1, cloudInstability: 1, cloudFog: 0 }, overrides: precipitationOverride(0, "hail", 293, 0.74) },
    { id: "ice-pellets", label: "Ice pellets · Nimbostratus", description: "Snow melts in an elevated warm nose and refreezes near the surface.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "nimbostratus", midOktas: 8, midBase: 1.8, midThickness: 4, midOptical: 0.98, midPrecipitation: 0.58, midIce: 0.76, midOrganization: "frontal", manualComposition: true, humidity: 0.9, groundAlbedo: 0.55 }, overrides: precipitationOverride(1, "ice-pellets", 268, 0.92, { warmLayerBottomKm: 0.7, warmLayerTopKm: 1.7, warmLayerTemperatureKelvin: 276, surfaceColdLayerDepthKm: 0.7 }) },
    { id: "snow-grains", label: "Snow grains · Stratus", description: "Small opaque flat grains in a weak, uniform cold Stratus fall.", values: { manualClouds: true, lowGenus: "stratus", lowOktas: 8, lowBase: 0.3, lowThickness: 0.7, lowOptical: 0.82, lowPrecipitation: 0.16, lowIce: 0.82, lowOrganization: "frontal", cloudConvection: 0, cloudFog: 0, manualComposition: true, humidity: 0.93, groundAlbedo: 0.7 }, overrides: precipitationOverride(0, "snow-grains", 267, 0.95) },
    { id: "snow-pellets", label: "Snow pellets · convective", description: "Rimed graupel in finite Cumulonimbus shower groups.", values: { manualClouds: true, lowGenus: "cumulonimbus", lowOktas: 4, lowBase: 0.85, lowThickness: 9.8, lowOptical: 0.96, lowPrecipitation: 0.46, lowIce: 0.68, lowOrganization: "isolated", cloudConvection: 0.9, cloudInstability: 0.9, cloudFog: 0 }, overrides: precipitationOverride(0, "snow-pellets", 272, 0.84) },
    { id: "virga-liquid", label: "Virga · liquid", description: "Warm drops evaporate completely in dry sub-cloud air.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "altocumulus", midOktas: 5, midBase: 3.2, midThickness: 1.2, midOptical: 0.55, midPrecipitation: 0.3, midIce: 0.12, midOrganization: "closed-cell", manualComposition: true, humidity: 0.28 }, overrides: precipitationOverride(1, "virga", 289, 0.3) },
    { id: "virga-ice", label: "Virga · ice", description: "Ice fallstreaks sublimate before reaching the surface.", values: { manualClouds: true, lowGenus: "clear", lowOktas: 0, midGenus: "altocumulus", midOktas: 5, midBase: 4.6, midThickness: 1.4, midOptical: 0.48, midPrecipitation: 0.28, midIce: 0.86, midOrganization: "closed-cell", manualComposition: true, humidity: 0.24 }, overrides: precipitationOverride(1, "virga", 260, 0.27) },
    { id: "fog", label: "Fog · liquid", description: "Finite liquid bank with meteorological visibility below 1 km.", values: { ...CLEAR_WEATHER, cloudFog: 0.88, manualComposition: true, humidity: 0.98, haze: 1.2 }, overrides: surfaceMeteorOverride("fog", 0.32, 279, 0.99) },
    { id: "mist", label: "Mist · liquid", description: "Thin finite droplet veil with visibility at or above 1 km.", values: { ...CLEAR_WEATHER, cloudFog: 0.26, manualComposition: true, humidity: 0.88, haze: 1.1 }, overrides: surfaceMeteorOverride("mist", 4.5, 284, 0.9) },
    { id: "ice-fog", label: "Ice fog · arctic", description: "2–30 µm ice crystals in very cold, humid, calm surface air.", values: { ...CLEAR_WEATHER, cloudFog: 0.88, manualComposition: true, humidity: 0.96, groundAlbedo: 0.82, haze: 1.18 }, overrides: surfaceMeteorOverride("ice-fog", 0.04, 238, 0.97) },
    { id: "diamond-dust", label: "Diamond dust · clear air", description: "Sparse oriented plates in a finite cold-air basin with source glint.", values: { ...CLEAR_WEATHER, cloudFog: 0.04, manualComposition: true, humidity: 0.82, groundAlbedo: 0.86, haze: 0.72 }, overrides: surfaceMeteorOverride("diamond-dust", 9, 252, 0.84) },
] as const;

// The same arrow-steppable matrix now exercises orthogonal WMO morphology,
// upper-atmosphere owners, multilayer relations, and hydrometeors. Keeping one
// selector makes every assignment reproducible in a copied Lab URL.
const HYDROMETEOR_QUALIFICATION_TARGETS = WEATHER_QUALIFICATION_TARGETS;

/**
 * Builds an explicit three-layer scene from the manual controls, then runs the
 * same meteorological constraint pass production uses. Invalid combinations are
 * therefore corrected rather than rendered, so the laboratory cannot produce a
 * sky the daily generator could never reach.
 */
function buildManualScene(settings: LabSettings, seed: number): CloudScene {
    const make = (
        genus: string,
        oktas: number,
        base: number,
        thickness: number,
        opticalDepth: number,
        windSpeed: number,
        windDirection: number,
        shear: number,
        turbulence: number,
        iceFraction: number,
        precipitation: number,
        organization: CloudOrganization,
        lifecycle: number,
        organizationStrength: number,
    ) =>
        genus === "clear" || oktas <= 0
            ? { ...EMPTY_LAYER }
            : createLayer({
                  genus: genus as CloudGenus,
                  oktas,
                  baseAltitude: base * 1000,
                  thickness: thickness * 1000,
                  opticalDepth,
                  convection: settings.cloudConvection,
                  windSpeed,
                  windDirection: (windDirection * Math.PI) / 180,
                  shear,
                  turbulence,
                  iceFraction,
                  precipitation,
                  organization,
                  lifecycle,
                  organizationStrength,
              });

    return constrainScene({
        layers: [
            make(settings.lowGenus, settings.lowOktas, settings.lowBase, settings.lowThickness, settings.lowOptical, settings.lowWind, settings.lowDirection, settings.lowShear, settings.lowTurbulence, settings.lowIce, settings.lowPrecipitation, settings.lowOrganization, settings.lowLifecycle, settings.lowOrganizationStrength),
            make(settings.midGenus, settings.midOktas, settings.midBase, settings.midThickness, settings.midOptical, settings.midWind, settings.midDirection, settings.midShear, settings.midTurbulence, settings.midIce, settings.midPrecipitation, settings.midOrganization, settings.midLifecycle, settings.midOrganizationStrength),
            make(settings.highGenus, settings.highOktas, settings.highBase, settings.highThickness, settings.highOptical, settings.highWind, settings.highDirection, settings.highShear, settings.highTurbulence, settings.highIce, settings.highPrecipitation, settings.highOrganization, settings.highLifecycle, settings.highOrganizationStrength),
        ],
        totalOktas: 0,
        convection: settings.cloudConvection,
        instability: settings.cloudInstability,
        humidity: settings.humidity,
        fog: settings.cloudFog,
        noctilucent: settings.cloudNoctilucent,
        seed: [seed, (seed * 1.618) % 1, (seed * 2.414) % 1, (seed * 3.142) % 1],
    });
}

const DEFAULT_SETTINGS: LabSettings = {
    date: "2026-01-01",
    time: "12:00",
    timezone: "America/Los_Angeles",
    family: "auto",
    phase: "natural",
    atmosphere: "auto",
    motion: "auto",
    bloom: "auto",
    region: "auto",
    season: "auto",
    variant: "auto",
    edgeDirection: "auto",
    manualGrade: false,
    hue: 0,
    chroma: 1,
    lightness: 0,
    manualIntensity: false,
    contrast: 1,
    saturation: 1,
    edge: 1,
    glow: 1,
    haze: 1,
    manualComposition: false,
    aerosolType: "auto",
    aerosol: 0.35,
    humidity: 0.45,
    aerosolSize: 0.35,
    aerosolAbsorption: 0.08,
    ozone: 1,
    observerAltitude: 0.08,
    inversion: 0.1,
    stratosphericAerosol: 0.03,
    groundAlbedo: 0.24,
    cloudDensity: 1,
    manualClouds: false,
    lowGenus: "cumulus",
    lowOktas: 3,
    midGenus: "clear",
    midOktas: 0,
    highGenus: "clear",
    highOktas: 0,
    cloudConvection: 0.5,
    cloudSeed: 0.42,
    cloudTimeline: 0,
    cloudInstability: 0.5,
    cloudFog: 0,
    cloudNoctilucent: 0,
    hydrometeorPreset: "daily",
    weatherHydrometeorTarget: "none",
    weatherHydrometeorEnvironment: "clean-midday-side",
    weatherHydrometeorPerspective: "oblique-natural",
    lowBase: 1.2,
    lowThickness: 1.8,
    lowOptical: 0.78,
    lowWind: 8,
    lowDirection: 45,
    lowShear: 0.18,
    lowTurbulence: 0.46,
    lowIce: 0,
    lowPrecipitation: 0.08,
    lowOrganization: "isolated",
    lowLifecycle: 0.5,
    lowOrganizationStrength: 0.62,
    midBase: 4.2,
    midThickness: 1.3,
    midOptical: 0.5,
    midWind: 14,
    midDirection: 70,
    midShear: 0.28,
    midTurbulence: 0.28,
    midIce: 0.32,
    midPrecipitation: 0.04,
    midOrganization: "closed-cell",
    midLifecycle: 0.5,
    midOrganizationStrength: 0.5,
    highBase: 8.8,
    highThickness: 0.9,
    highOptical: 0.2,
    highWind: 24,
    highDirection: 95,
    highShear: 0.48,
    highTurbulence: 0.2,
    highIce: 1,
    highPrecipitation: 0,
    highOrganization: "unorganized",
    highLifecycle: 0.5,
    highOrganizationStrength: 0.42,
    rendererPreference: "auto",
    rendererQuality: "balanced",
    rendererDebugView: "final",
    cloudResolutionScale: 1,
    cloudUpdateRate: 2,
    temporalClouds: true,
    cloudComposition: "graphic",
    cloudPerspective: "telephoto",
    cloudEditorialRegime: "auto",
    motionSpeed: 1,
    motionAmount: 1,
    bloomVisibility: 1,
    bloomScale: 1,
    starVisibility: 1,
    stellarExposure: 1,
    stellarGlow: 1,
    moonVisibility: 1,
    manualNightExposure: false,
    nightExposure: 0,
    paused: false,
};

const currentDefaults = () => {
    const current = wallTimeInZone(new Date(), DEFAULT_SETTINGS.timezone);
    return {
        ...DEFAULT_SETTINGS,
        date: current.date,
        time: current.time,
    };
};

const getTimezoneOffset = (date: Date, timezone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return (
        Date.UTC(
            Number(value.year),
            Number(value.month) - 1,
            Number(value.day),
            Number(value.hour),
            Number(value.minute),
            Number(value.second),
        ) - date.getTime()
    );
};

const wallTimeToDate = (dateValue: string, timeValue: string, timezone: string) => {
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    const wallTime = Date.UTC(year, month - 1, day, hour, minute);
    let result = new Date(wallTime);

    for (let iteration = 0; iteration < 2; iteration += 1) {
        result = new Date(wallTime - getTimezoneOffset(result, timezone));
    }

    return result;
};

const wallTimeInZone = (date: Date, timezone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        date: `${value.year}-${value.month}-${value.day}`,
        time: `${value.hour}:${value.minute}`,
    };
};

const titleCase = (value: string) =>
    value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

const phaseForSolarElevation = (degrees: number): SkyPhase => {
    if (degrees >= 12) return "day";
    if (degrees >= 4) return "golden";
    if (degrees >= 0) return "sunset";
    if (degrees >= -6) return "afterglow";
    if (degrees >= -12) return "blueHourEvening";
    if (degrees >= -18) return "dusk";
    return "night";
};

const randomBetween = (min: number, max: number, precision = 2) =>
    Number((min + Math.random() * (max - min)).toFixed(precision));

const randomStepped = (min: number, max: number, step: number) => {
    const steps = Math.floor((max - min) / step);
    const precision = Math.max(0, String(step).split(".")[1]?.length ?? 0);
    return Number((min + Math.floor(Math.random() * (steps + 1)) * step).toFixed(precision));
};

const limit = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

const isOneOf = (choices: readonly string[], value: string) =>
    choices.includes(value);

const hydrateFromUrl = (defaults: LabSettings): LabSettings => {
    if (typeof window === "undefined") return defaults;
    const params = new URLSearchParams(window.location.search);
    if (!params.size) return defaults;

    const next = { ...defaults };
    const strings: (keyof LabSettings)[] = [
        "date",
        "time",
        "timezone",
        "family",
        "phase",
        "atmosphere",
        "motion",
        "bloom",
        "region",
        "season",
        "variant",
        "edgeDirection",
        "aerosolType",
        "lowGenus",
        "lowOrganization",
        "midGenus",
        "midOrganization",
        "highGenus",
        "highOrganization",
        "rendererPreference",
        "rendererQuality",
        "rendererDebugView",
        "cloudComposition",
        "cloudPerspective",
        "cloudEditorialRegime",
        "hydrometeorPreset",
        "weatherHydrometeorTarget",
        "weatherHydrometeorEnvironment",
        "weatherHydrometeorPerspective",
    ];
    const numbers: (keyof LabSettings)[] = [
        "hue",
        "chroma",
        "lightness",
        "contrast",
        "saturation",
        "edge",
        "glow",
        "haze",
        "aerosol",
        "humidity",
        "aerosolSize",
        "aerosolAbsorption",
        "ozone",
        "observerAltitude",
        "inversion",
        "stratosphericAerosol",
        "groundAlbedo",
        "cloudDensity",
        "lowOktas",
        "midOktas",
        "highOktas",
        "cloudConvection",
        "cloudSeed",
        "cloudTimeline",
        "cloudInstability",
        "cloudFog",
        "cloudNoctilucent",
        "lowBase",
        "lowThickness",
        "lowOptical",
        "lowWind",
        "lowDirection",
        "lowShear",
        "lowTurbulence",
        "lowIce",
        "lowPrecipitation",
        "lowLifecycle",
        "lowOrganizationStrength",
        "midBase",
        "midThickness",
        "midOptical",
        "midWind",
        "midDirection",
        "midShear",
        "midTurbulence",
        "midIce",
        "midPrecipitation",
        "midLifecycle",
        "midOrganizationStrength",
        "highBase",
        "highThickness",
        "highOptical",
        "highWind",
        "highDirection",
        "highShear",
        "highTurbulence",
        "highIce",
        "highPrecipitation",
        "highLifecycle",
        "highOrganizationStrength",
        "cloudResolutionScale",
        "cloudUpdateRate",
        "motionSpeed",
        "motionAmount",
        "bloomVisibility",
        "bloomScale",
        "starVisibility",
        "stellarExposure",
        "stellarGlow",
        "moonVisibility",
        "nightExposure",
    ];

    strings.forEach((key) => {
        const value = params.get(key);
        if (value !== null) Object.assign(next, { [key]: value });
    });
    numbers.forEach((key) => {
        const rawValue = params.get(key);
        if (rawValue === null) return;
        const value = Number(rawValue);
        if (Number.isFinite(value)) Object.assign(next, { [key]: value });
    });
    ["manualGrade", "manualIntensity", "manualComposition", "manualClouds", "manualNightExposure", "temporalClouds", "paused"].forEach((key) => {
        const value = params.get(key);
        if (value !== null) Object.assign(next, { [key]: value === "1" });
    });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date)) next.date = defaults.date;
    if (!/^\d{2}:\d{2}$/.test(next.time)) next.time = defaults.time;
    if (!isOneOf(TIMEZONES, next.timezone)) next.timezone = defaults.timezone;
    if (
        next.family !== "auto" &&
        !SKY_FAMILIES.some((family) => family.id === next.family)
    ) next.family = "auto";
    if (next.phase !== "natural" && !isOneOf(PHASE_ORDER, next.phase)) next.phase = "natural";
    if (next.atmosphere !== "auto" && !isOneOf(ATMOSPHERES, next.atmosphere)) next.atmosphere = "auto";
    if (next.motion !== "auto" && !isOneOf(MOTIONS, next.motion)) next.motion = "auto";
    if (next.bloom !== "auto" && !isOneOf(SKY_BLOOM_STYLES, next.bloom)) next.bloom = "auto";
    if (next.region !== "auto" && !isOneOf(REGIONS, next.region)) next.region = "auto";
    if (next.season !== "auto" && !isOneOf(SEASONS, next.season)) next.season = "auto";
    if (!isOneOf(["auto", "-1", "0", "1"], next.variant)) next.variant = "auto";
    if (!isOneOf(["auto", "original", "flipped"], next.edgeDirection)) next.edgeDirection = "auto";
    if (next.aerosolType !== "auto" && !isOneOf(AEROSOL_TYPES, next.aerosolType)) next.aerosolType = "auto";
    (["lowOrganization", "midOrganization", "highOrganization"] as const).forEach((key) => {
        if (!isOneOf(CLOUD_ORGANIZATIONS, next[key])) next[key] = defaults[key];
    });
    if (!isOneOf(["auto", "webgpu", "webgl2", "fallback"], next.rendererPreference)) next.rendererPreference = "auto";
    if (!isOneOf(["battery", "balanced", "high"], next.rendererQuality)) next.rendererQuality = "balanced";
    if (!isOneOf(["final", "coverage", "density", "transmittance", "depth", "velocity", "history", "lighting", "steps"], next.rendererDebugView)) next.rendererDebugView = "final";
    if (!isOneOf(["physical", "layered", "edge-framed", "graphic"], next.cloudComposition)) next.cloudComposition = "graphic";
    if (!isOneOf(["natural", "wide", "telephoto", "orthographic", "panoramic"], next.cloudPerspective)) next.cloudPerspective = "telephoto";
    if (!isOneOf(["auto", "distant", "nearby", "overhead"], next.cloudEditorialRegime)) next.cloudEditorialRegime = "auto";
    if (!HYDROMETEOR_PRESETS.some(({ id }) => id === next.hydrometeorPreset)) {
        next.hydrometeorPreset = "daily";
    }
    const qualificationTarget = HYDROMETEOR_QUALIFICATION_TARGETS.find(
        ({ id }) => id === next.weatherHydrometeorTarget,
    );
    if (!qualificationTarget) {
        next.weatherHydrometeorTarget = "none";
    } else {
        if (!qualificationTarget.environments.includes(
            next.weatherHydrometeorEnvironment,
        )) {
            next.weatherHydrometeorEnvironment = qualificationTarget.environments[0];
        }
        if (!qualificationTarget.perspectives.includes(
            next.weatherHydrometeorPerspective,
        )) {
            next.weatherHydrometeorPerspective = qualificationTarget.perspectives[0];
        }
    }

    next.hue = limit(next.hue, -12, 12);
    next.chroma = limit(next.chroma, 0.7, 1.3);
    next.lightness = limit(next.lightness, -0.08, 0.08);
    next.contrast = limit(next.contrast, 0.78, 1.28);
    next.saturation = limit(next.saturation, 0.7, 1.35);
    next.edge = limit(next.edge, 0.5, 1.5);
    next.glow = limit(next.glow, 0.55, 1.5);
    next.haze = limit(next.haze, 0.45, 1.65);
    next.aerosol = limit(next.aerosol, 0.015, 1);
    next.humidity = limit(next.humidity, 0, 1);
    next.aerosolSize = limit(next.aerosolSize, 0, 1);
    next.aerosolAbsorption = limit(next.aerosolAbsorption, 0, 1);
    next.ozone = limit(next.ozone, 0.65, 1.35);
    next.observerAltitude = limit(next.observerAltitude, 0, 1);
    next.inversion = limit(next.inversion, 0, 1);
    next.stratosphericAerosol = limit(next.stratosphericAerosol, 0, 1);
    next.groundAlbedo = limit(next.groundAlbedo, 0, 1);
    next.cloudDensity = limit(next.cloudDensity, 0, 2);
    next.lowOktas = limit(next.lowOktas, 0, 8);
    next.midOktas = limit(next.midOktas, 0, 8);
    next.highOktas = limit(next.highOktas, 0, 8);
    next.cloudConvection = limit(next.cloudConvection, 0, 1);
    next.cloudSeed = limit(next.cloudSeed, 0, 1);
    next.cloudTimeline = limit(next.cloudTimeline, -7200, 7200);
    next.cloudInstability = limit(next.cloudInstability, 0, 1);
    next.cloudFog = limit(next.cloudFog, 0, 1);
    next.cloudNoctilucent = limit(next.cloudNoctilucent, 0, 1);
    next.lowBase = limit(next.lowBase, 0.05, 4);
    next.lowThickness = limit(next.lowThickness, 0.1, 14);
    next.midBase = limit(next.midBase, 1.5, 9);
    next.midThickness = limit(next.midThickness, 0.1, 8);
    next.highBase = limit(next.highBase, 4, 16);
    next.highThickness = limit(next.highThickness, 0.08, 5);
    (["lowOptical", "lowShear", "lowTurbulence", "lowIce", "lowPrecipitation", "lowLifecycle", "lowOrganizationStrength", "midOptical", "midShear", "midTurbulence", "midIce", "midPrecipitation", "midLifecycle", "midOrganizationStrength", "highOptical", "highShear", "highTurbulence", "highIce", "highPrecipitation", "highLifecycle", "highOrganizationStrength"] as const).forEach((key) => {
        next[key] = limit(next[key], 0, 1);
    });
    (["lowWind", "midWind", "highWind"] as const).forEach((key) => {
        next[key] = limit(next[key], 0, 60);
    });
    (["lowDirection", "midDirection", "highDirection"] as const).forEach((key) => {
        next[key] = limit(next[key], 0, 359);
    });
    next.cloudResolutionScale = limit(next.cloudResolutionScale, 0.5, 1);
    next.cloudUpdateRate = limit(next.cloudUpdateRate, 1, 6);
    next.motionSpeed = limit(next.motionSpeed, 0.25, 3);
    next.motionAmount = limit(next.motionAmount, 0, 2);
    next.bloomVisibility = limit(next.bloomVisibility, 0, 2);
    next.bloomScale = limit(next.bloomScale, 0.5, 1.8);
    next.starVisibility = limit(next.starVisibility, 0, 2);
    next.stellarExposure = limit(next.stellarExposure, 0, 2.5);
    next.stellarGlow = limit(next.stellarGlow, 0, 2.5);
    next.moonVisibility = limit(next.moonVisibility, 0, 2);
    next.nightExposure = limit(next.nightExposure, -1, 1);

    return next;
};

interface SelectFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}

function SelectField({ label, value, onChange, children }: SelectFieldProps) {
    const optionValues: string[] = [];
    const collectOptions = (nodes: ReactNode) => {
        Children.forEach(nodes, (child) => {
            if (!isValidElement(child)) return;
            const element = child as ReactElement<{
                value?: string | number;
                children?: ReactNode;
            }>;
            if (element.type === "option") {
                optionValues.push(String(element.props.value ?? ""));
                return;
            }
            collectOptions(element.props.children);
        });
    };
    collectOptions(children);

    const cycle = (direction: -1 | 1) => {
        if (optionValues.length < 2) return;
        const currentIndex = Math.max(0, optionValues.indexOf(value));
        const nextIndex =
            (currentIndex + direction + optionValues.length) % optionValues.length;
        onChange(optionValues[nextIndex]);
    };

    return (
        <div className={styles.field}>
            <span>{label}</span>
            <div className={styles.selectStepper}>
                <button
                    type="button"
                    aria-label={`Previous ${label}`}
                    title={`Previous ${label}`}
                    onClick={() => cycle(-1)}
                >
                    ‹
                </button>
                <select
                    aria-label={label}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                >
                    {children}
                </select>
                <button
                    type="button"
                    aria-label={`Next ${label}`}
                    title={`Next ${label}`}
                    onClick={() => cycle(1)}
                >
                    ›
                </button>
            </div>
        </div>
    );
}

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    format?: (value: number) => string;
    onChange: (value: number) => void;
}

function Slider({
    label,
    value,
    min,
    max,
    step,
    disabled,
    format = (number) => number.toFixed(2),
    onChange,
}: SliderProps) {
    return (
        <label className={`${styles.slider} ${disabled ? styles.disabled : ""}`}>
            <span>
                {label}
                <output>{format(value)}</output>
            </span>
            <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </label>
    );
}

interface LayerControlKeys {
    genus: keyof LabSettings;
    oktas: keyof LabSettings;
    base: keyof LabSettings;
    thickness: keyof LabSettings;
    optical: keyof LabSettings;
    wind: keyof LabSettings;
    direction: keyof LabSettings;
    shear: keyof LabSettings;
    turbulence: keyof LabSettings;
    ice: keyof LabSettings;
    precipitation: keyof LabSettings;
    organization: keyof LabSettings;
    lifecycle: keyof LabSettings;
    organizationStrength: keyof LabSettings;
}

interface CloudLayerControlsProps {
    title: string;
    settings: LabSettings;
    keys: LayerControlKeys;
    genera: readonly string[];
    disabled: boolean;
    onChange: (key: keyof LabSettings, value: string | number) => void;
}

function CloudLayerControls({
    title,
    settings,
    keys,
    genera,
    disabled,
    onChange,
}: CloudLayerControlsProps) {
    const number = (key: keyof LabSettings) => settings[key] as number;
    return (
        <details className={styles.layerControls} open={title === "Low layer"}>
            <summary>{title}</summary>
            <SelectField
                label="WMO genus"
                value={settings[keys.genus] as string}
                onChange={(value) => onChange(keys.genus, value)}
            >
                {genera.map((genus) => (
                    <option key={genus} value={genus}>{titleCase(genus)}</option>
                ))}
            </SelectField>
            <Slider label="Coverage" value={number(keys.oktas)} min={0} max={8} step={0.5} disabled={disabled} format={(value) => `${value.toFixed(1)}/8`} onChange={(value) => onChange(keys.oktas, value)} />
            <div className={styles.twoColumn}>
                <Slider label="Base altitude" value={number(keys.base)} min={0.05} max={16} step={0.05} disabled={disabled} format={(value) => `${value.toFixed(2)} km`} onChange={(value) => onChange(keys.base, value)} />
                <Slider label="Thickness" value={number(keys.thickness)} min={0.08} max={14} step={0.05} disabled={disabled} format={(value) => `${value.toFixed(2)} km`} onChange={(value) => onChange(keys.thickness, value)} />
            </div>
            <Slider label="Optical depth" value={number(keys.optical)} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => onChange(keys.optical, value)} />
            <SelectField
                label="Mesoscale organization"
                value={settings[keys.organization] as string}
                onChange={(value) => onChange(keys.organization, value)}
            >
                {CLOUD_ORGANIZATIONS.map((organization) => (
                    <option key={organization} value={organization}>
                        {titleCase(organization)}
                    </option>
                ))}
            </SelectField>
            <div className={styles.twoColumn}>
                <Slider label="Lifecycle" value={number(keys.lifecycle)} min={0} max={1} step={0.01} disabled={disabled} format={(value) => value < 0.34 ? "Growing" : value < 0.67 ? "Mature" : "Dissipating"} onChange={(value) => onChange(keys.lifecycle, value)} />
                <Slider label="Organization strength" value={number(keys.organizationStrength)} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => onChange(keys.organizationStrength, value)} />
            </div>
            <div className={styles.twoColumn}>
                <Slider label="Wind speed" value={number(keys.wind)} min={0} max={60} step={0.5} disabled={disabled} format={(value) => `${value.toFixed(1)} m/s`} onChange={(value) => onChange(keys.wind, value)} />
                <Slider label="Wind direction" value={number(keys.direction)} min={0} max={359} step={1} disabled={disabled} format={(value) => `${Math.round(value)}°`} onChange={(value) => onChange(keys.direction, value)} />
            </div>
            <Slider label="Vertical shear" value={number(keys.shear)} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => onChange(keys.shear, value)} />
            <Slider label="Edge turbulence" value={number(keys.turbulence)} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => onChange(keys.turbulence, value)} />
            <Slider label="Ice fraction" value={number(keys.ice)} min={0} max={1} step={0.01} disabled={disabled} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => onChange(keys.ice, value)} />
            <Slider label="Precipitation / virga" value={number(keys.precipitation)} min={0} max={1} step={0.01} disabled={disabled} onChange={(value) => onChange(keys.precipitation, value)} />
        </details>
    );
}

export function SkyLab() {
    const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
    const [snapshot, setSnapshot] = useState<SkySnapshot | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [copied, setCopied] = useState(false);
    const [rendererStats, setRendererStats] = useState<SkyRendererStats | null>(null);

    useEffect(() => {
        setSettings(hydrateFromUrl(currentDefaults()));
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        const params = new URLSearchParams();
        Object.entries(settings).forEach(([key, value]) => {
            params.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
        });
        window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    }, [hydrated, settings]);

    const update = useCallback(
        <Key extends keyof LabSettings>(key: Key, value: LabSettings[Key]) => {
            setSettings((current) => ({ ...current, [key]: value }));
        },
        [],
    );
    const updateLayer = useCallback(
        (key: keyof LabSettings, value: string | number) => {
            setSettings((current) => ({ ...current, [key]: value }) as LabSettings);
        },
        [],
    );

    const previewDate = useMemo(
        () => wallTimeToDate(settings.date, settings.time, settings.timezone),
        [settings.date, settings.time, settings.timezone],
    );
    const manualCloudScene = useMemo(
        () => buildManualScene(settings, settings.cloudSeed),
        [settings],
    );
    const hydrometeorQualification = useMemo<
        ResolvedWeatherQualificationState | undefined
    >(() => {
        const target = HYDROMETEOR_QUALIFICATION_TARGETS.find(
            ({ id }) => id === settings.weatherHydrometeorTarget,
        );
        if (!target) return undefined;
        const environment = WEATHER_QUALIFICATION_ENVIRONMENTS.find(
            ({ id }) => id === settings.weatherHydrometeorEnvironment,
        );
        const perspective = WEATHER_QUALIFICATION_PERSPECTIVES.find(
            ({ id }) => id === settings.weatherHydrometeorPerspective,
        );
        if (!environment || !perspective ||
            !target.environments.includes(environment.id) ||
            !target.perspectives.includes(perspective.id)) return undefined;
        const qualificationCase: WeatherQualificationCase = {
            id: `${target.id}--${environment.id}--${perspective.id}`,
            target,
            environment,
            perspective,
        };
        return resolveWeatherQualificationCase(qualificationCase);
    }, [
        settings.weatherHydrometeorEnvironment,
        settings.weatherHydrometeorPerspective,
        settings.weatherHydrometeorTarget,
    ]);
    const qualificationEnvironment = WEATHER_QUALIFICATION_ENVIRONMENTS.find(
        ({ id }) => id === settings.weatherHydrometeorEnvironment,
    );
    const qualificationPerspective = WEATHER_QUALIFICATION_PERSPECTIVES.find(
        ({ id }) => id === settings.weatherHydrometeorPerspective,
    );
    const cloudValidation = useMemo(() => {
        if (!settings.manualClouds) return "Daily constrained weather state";
        const requested = [settings.lowGenus, settings.midGenus, settings.highGenus];
        const corrected = manualCloudScene.layers.map((layer) =>
            layer.present ? layer.genus : "clear",
        );
        const changed = requested
            .map((genus, index) => genus !== corrected[index] ? `${genus}→${corrected[index]}` : "")
            .filter(Boolean);
        return changed.length > 0
            ? `Constrained: ${changed.join(", ")}`
            : `${manualCloudScene.totalOktas.toFixed(1)}/8 combined cover · valid`;
    }, [manualCloudScene, settings.highGenus, settings.lowGenus, settings.manualClouds, settings.midGenus]);
    const morphologyStatus = useMemo(() => {
        const scene = hydrometeorQualification?.cloudScene ?? manualCloudScene;
        const runtime = createCloudSystemRuntime(scene);
        const assignments = scene.classifications ?? [];
        const upper = assignments.filter((entry) => entry.upperAtmosphericCloud);
        const modifiers = assignments.flatMap(({ classification }) => [
            ...classification.varieties,
            ...classification.supplementaryFeatures.filter(
                (feature) => feature !== "virga" && feature !== "praecipitatio",
            ),
            ...classification.accessoryClouds,
        ]);
        const labels = [...new Set(modifiers)];
        return `${runtime.systems.length} stable tropospheric owners · ` +
            `${assignments.length} classification assignments · ` +
            `${upper.length} upper-atmosphere owners` +
            (labels.length ? ` · ${labels.join(", ")}` : "") +
            (runtime.diagnostics.length
                ? ` · ${runtime.diagnostics.length} diagnostics` : "");
    }, [hydrometeorQualification, manualCloudScene]);

    const preview = useMemo<SkyPreviewOptions>(
        () => {
            const hydrometeorPreset = HYDROMETEOR_PRESETS.find(
                ({ id }) => id === settings.hydrometeorPreset,
            );
            const qualificationComposition = hydrometeorQualification &&
                qualificationEnvironment && qualificationPerspective ? {
                    aerosol: limit(
                        qualificationEnvironment.aerosolOpticalDepth / 0.28,
                        0.015,
                        1,
                    ),
                    humidity: qualificationEnvironment.relativeHumidity,
                    aerosolSize: limit(
                        1 - qualificationEnvironment.aerosolAngstromExponent / 2.6,
                        0,
                        1,
                    ),
                    aerosolAbsorption: limit(
                        (1 - qualificationEnvironment.aerosolSingleScatteringAlbedo) * 3,
                        0,
                        1,
                    ),
                    ozone: limit(
                        qualificationEnvironment.ozoneDobsonUnits / 310,
                        0.65,
                        1.35,
                    ),
                    observerAltitude: limit(
                        qualificationPerspective.observerAltitudeKm / 2.5,
                        0,
                        1,
                    ),
                    inversion: qualificationEnvironment.boundaryLayer === "stable"
                        ? 0.72 : qualificationEnvironment.boundaryLayer === "convective"
                            ? 0.08 : 0.28,
                    stratosphericAerosol: limit(
                        qualificationEnvironment.stratosphericAerosolOpticalDepth / 0.12,
                        0,
                        1,
                    ),
                    groundAlbedo: qualificationEnvironment.surfaceAlbedo,
                } : undefined;
            return ({
            date: previewDate,
            timezone: settings.timezone,
            viewAzimuth: hydrometeorQualification ? 180 : undefined,
            viewElevation: hydrometeorQualification
                ? qualificationPerspective?.viewElevationDegrees : undefined,
            horizontalFov: hydrometeorQualification
                ? qualificationPerspective?.horizontalFieldOfViewDegrees : undefined,
            verticalFov: hydrometeorQualification
                ? Math.min(120, Math.max(24,
                    (qualificationPerspective?.horizontalFieldOfViewDegrees ?? 70) * 0.68))
                : undefined,
            familyId: settings.family === "auto" ? undefined : settings.family,
            phase: hydrometeorQualification && qualificationEnvironment
                ? phaseForSolarElevation(qualificationEnvironment.solarElevationDegrees)
                : settings.phase === "natural" ? undefined : settings.phase,
            atmosphereStyle:
                settings.atmosphere === "auto" ? undefined : settings.atmosphere,
            motionStyle: settings.motion === "auto" ? undefined : settings.motion,
            region: settings.region === "auto" ? undefined : settings.region,
            season: settings.season === "auto" ? undefined : settings.season,
            variantShift:
                settings.variant === "auto"
                    ? undefined
                    : (Number(settings.variant) as -1 | 0 | 1),
            hueJitter: settings.manualGrade ? settings.hue : undefined,
            chromaJitter: settings.manualGrade ? settings.chroma : undefined,
            lightnessJitter: settings.manualGrade ? settings.lightness : undefined,
            flipEdges:
                settings.edgeDirection === "auto"
                    ? undefined
                    : settings.edgeDirection === "flipped",
            intensity: settings.manualIntensity
                ? {
                      contrast: settings.contrast,
                      saturation: settings.saturation,
                      edge: settings.edge,
                      glow: settings.glow,
                      haze: settings.haze,
                }
                : undefined,
            aerosolType: hydrometeorQualification && qualificationEnvironment
                ? qualificationEnvironment.aerosolType
                :
                settings.aerosolType === "auto"
                    ? undefined
                    : settings.aerosolType,
            composition: qualificationComposition ?? (settings.manualComposition
                ? {
                      aerosol: settings.aerosol,
                      humidity: settings.humidity,
                      aerosolSize: settings.aerosolSize,
                      aerosolAbsorption: settings.aerosolAbsorption,
                      ozone: settings.ozone,
                      observerAltitude: settings.observerAltitude,
                      inversion: settings.inversion,
                      stratosphericAerosol: settings.stratosphericAerosol,
                      groundAlbedo: settings.groundAlbedo,
                  }
                : undefined),
            cloudDensity: settings.cloudDensity,
            cloudScene: hydrometeorQualification?.cloudScene ??
                (settings.manualClouds ? manualCloudScene : undefined),
            hydrometeors: hydrometeorQualification?.hydrometeors ??
                hydrometeorPreset?.overrides,
            cloudTimeOffset: settings.cloudTimeline,
            rendererPreference: settings.rendererPreference,
            rendererQuality: settings.rendererQuality,
            rendererDebugView: settings.rendererDebugView,
            cloudResolutionScale: settings.cloudResolutionScale,
            cloudUpdateRate: settings.cloudUpdateRate,
            temporalClouds: settings.temporalClouds,
            cloudComposition: settings.cloudComposition,
            cloudPerspective: settings.cloudPerspective,
            cloudEditorialRegime: settings.cloudEditorialRegime,
            motionSpeed: settings.motionSpeed,
            motionAmount: settings.motionAmount,
            bloomStyle: settings.bloom === "auto" ? undefined : settings.bloom,
            bloomVisibility: settings.bloomVisibility,
            bloomScale: settings.bloomScale,
            starVisibility: settings.starVisibility,
            stellarExposure: settings.stellarExposure,
            stellarGlow: settings.stellarGlow,
            moonVisibility: settings.moonVisibility,
            nightExposure: settings.manualNightExposure
                ? settings.nightExposure
                : undefined,
            });
        },
        [
            hydrometeorQualification,
            manualCloudScene,
            previewDate,
            qualificationEnvironment,
            qualificationPerspective,
            settings,
        ],
    );

    const receiveSnapshot = useCallback((next: SkySnapshot) => {
        setSnapshot(next);
    }, []);

    const reset = () => setSettings(currentDefaults());
    const applyCloudPreset = (values: Partial<LabSettings>) => {
        setSettings((current) => ({
            ...current,
            ...values,
            hydrometeorPreset: "daily",
            weatherHydrometeorTarget: "none",
        }));
    };

    const selectHydrometeorPreset = (id: string) => {
        const preset = HYDROMETEOR_PRESETS.find((candidate) => candidate.id === id);
        if (!preset) return;
        setSettings((current) => ({
            ...current,
            ...preset.values,
            hydrometeorPreset: preset.id,
            weatherHydrometeorTarget: "none",
        }));
    };

    const selectWeatherHydrometeorTarget = (id: string) => {
        if (id === "none") {
            setSettings((current) => ({
                ...current,
                weatherHydrometeorTarget: "none",
            }));
            return;
        }
        const target = HYDROMETEOR_QUALIFICATION_TARGETS.find(
            (candidate) => candidate.id === id,
        );
        if (!target) return;
        setSettings((current) => ({
            ...current,
            hydrometeorPreset: "daily",
            weatherHydrometeorTarget: target.id,
            weatherHydrometeorEnvironment: target.environments[0],
            weatherHydrometeorPerspective: target.perspectives[0],
        }));
    };

    const useNow = () => {
        const current = wallTimeInZone(new Date(), settings.timezone);
        setSettings((value) => ({
            ...value,
            date: current.date,
            time: current.time,
            phase: "natural",
        }));
    };

    const randomize = () => {
        const start = new Date(new Date().getFullYear(), 0, 1).getTime();
        const end = new Date(new Date().getFullYear() + 1, 0, 0).getTime();
        const randomDate = new Date(start + Math.random() * (end - start));
        setSettings((value) => ({
            ...value,
            date: localDate(randomDate),
            time: `${String(Math.floor(Math.random() * 24)).padStart(2, "0")}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
            timezone: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
            family: SKY_FAMILIES[Math.floor(Math.random() * SKY_FAMILIES.length)].id,
            phase: Math.random() > 0.45
                ? "natural"
                : PHASE_ORDER[Math.floor(Math.random() * PHASE_ORDER.length)],
            atmosphere: ATMOSPHERES[Math.floor(Math.random() * ATMOSPHERES.length)],
            motion: MOTIONS[Math.floor(Math.random() * MOTIONS.length)],
            bloom: SKY_BLOOM_STYLES[Math.floor(Math.random() * SKY_BLOOM_STYLES.length)],
            region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
            season: SEASONS[Math.floor(Math.random() * SEASONS.length)],
            variant: (["-1", "0", "1"] as const)[Math.floor(Math.random() * 3)],
            edgeDirection: Math.random() > 0.5 ? "flipped" : "original",
            manualGrade: true,
            hue: randomStepped(-12, 12, 0.5),
            chroma: randomBetween(0.76, 1.24),
            lightness: randomStepped(-0.056, 0.056, 0.002),
            manualIntensity: true,
            contrast: randomBetween(0.84, 1.2),
            saturation: randomBetween(0.8, 1.26),
            edge: randomBetween(0.68, 1.35),
            glow: randomBetween(0.72, 1.34),
            haze: randomBetween(0.62, 1.48),
            manualComposition: true,
            aerosolType: AEROSOL_TYPES[Math.floor(Math.random() * AEROSOL_TYPES.length)],
            aerosol: randomStepped(0.03, 0.96, 0.01),
            humidity: randomStepped(0.02, 1, 0.01),
            aerosolSize: randomStepped(0.04, 0.96, 0.01),
            aerosolAbsorption: randomStepped(0, 0.72, 0.01),
            ozone: randomStepped(0.72, 1.28, 0.01),
            observerAltitude: randomStepped(0, 0.9, 0.01),
            inversion: randomStepped(0, 0.94, 0.01),
            stratosphericAerosol: randomStepped(0, 0.86, 0.01),
            groundAlbedo: randomStepped(0.08, 0.92, 0.01),
            cloudDensity: randomStepped(0.34, 1.8, 0.02),
            manualClouds: true,
            lowGenus: LOW_GENERA[Math.floor(Math.random() * LOW_GENERA.length)],
            lowOktas: randomStepped(0, 8, 0.5),
            midGenus: MID_GENERA[Math.floor(Math.random() * MID_GENERA.length)],
            midOktas: randomStepped(0, 6, 0.5),
            highGenus: HIGH_GENERA[Math.floor(Math.random() * HIGH_GENERA.length)],
            highOktas: randomStepped(0, 6, 0.5),
            cloudConvection: randomStepped(0, 1, 0.02),
            cloudSeed: randomStepped(0, 1, 0.001),
            cloudTimeline: randomStepped(-3600, 3600, 30),
            cloudInstability: randomStepped(0, 1, 0.02),
            cloudFog: randomStepped(0, 0.7, 0.01),
            cloudNoctilucent: Math.random() > 0.96 ? randomStepped(0.2, 1, 0.02) : 0,
            hydrometeorPreset: "daily",
            weatherHydrometeorTarget: "none",
            lowBase: randomStepped(0.15, 2.6, 0.05),
            lowThickness: randomStepped(0.25, 6, 0.05),
            lowOptical: randomStepped(0.1, 1, 0.01),
            lowWind: randomStepped(1, 22, 0.5),
            lowDirection: randomStepped(0, 355, 5),
            lowShear: randomStepped(0, 0.7, 0.01),
            lowTurbulence: randomStepped(0.05, 1, 0.01),
            lowIce: randomStepped(0, 0.3, 0.01),
            lowPrecipitation: randomStepped(0, 1, 0.01),
            lowOrganization: CLOUD_ORGANIZATIONS[Math.floor(Math.random() * CLOUD_ORGANIZATIONS.length)],
            lowLifecycle: randomStepped(0, 1, 0.01),
            lowOrganizationStrength: randomStepped(0, 1, 0.01),
            midBase: randomStepped(2.4, 7.2, 0.05),
            midThickness: randomStepped(0.3, 4.5, 0.05),
            midOptical: randomStepped(0.08, 0.92, 0.01),
            midWind: randomStepped(6, 36, 0.5),
            midDirection: randomStepped(0, 355, 5),
            midShear: randomStepped(0.08, 0.85, 0.01),
            midTurbulence: randomStepped(0.04, 0.72, 0.01),
            midIce: randomStepped(0.08, 0.72, 0.01),
            midPrecipitation: randomStepped(0, 0.82, 0.01),
            midOrganization: CLOUD_ORGANIZATIONS[Math.floor(Math.random() * CLOUD_ORGANIZATIONS.length)],
            midLifecycle: randomStepped(0, 1, 0.01),
            midOrganizationStrength: randomStepped(0, 1, 0.01),
            highBase: randomStepped(6.2, 13.5, 0.05),
            highThickness: randomStepped(0.15, 2.4, 0.05),
            highOptical: randomStepped(0.04, 0.45, 0.01),
            highWind: randomStepped(12, 52, 0.5),
            highDirection: randomStepped(0, 355, 5),
            highShear: randomStepped(0.2, 1, 0.01),
            highTurbulence: randomStepped(0.02, 0.48, 0.01),
            highIce: randomStepped(0.88, 1, 0.01),
            highPrecipitation: 0,
            highOrganization: CLOUD_ORGANIZATIONS[Math.floor(Math.random() * CLOUD_ORGANIZATIONS.length)],
            highLifecycle: randomStepped(0, 1, 0.01),
            highOrganizationStrength: randomStepped(0, 1, 0.01),
            motionSpeed: randomStepped(0.45, 2.25, 0.05),
            motionAmount: randomStepped(0.44, 1.76, 0.02),
            bloomVisibility: randomStepped(0.18, 1.7, 0.02),
            bloomScale: randomStepped(0.5, 1.8, 0.02),
            starVisibility: randomStepped(0.65, 1.45, 0.05),
            moonVisibility: randomStepped(0.65, 1.45, 0.05),
            manualNightExposure: Math.random() > 0.6,
            nightExposure: randomStepped(-1, 1, 0.05),
            paused: false,
        }));
    };

    const copyLink = async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    const familyLabel =
        SKY_FAMILIES.find((family) => family.id === snapshot?.familyId)?.label ??
        "Resolving…";
    const selectedQualificationTarget = HYDROMETEOR_QUALIFICATION_TARGETS.find(
        ({ id }) => id === settings.weatherHydrometeorTarget,
    );
    const validQualificationEnvironments = WEATHER_QUALIFICATION_ENVIRONMENTS.filter(
        ({ id }) => selectedQualificationTarget?.environments.includes(id),
    );
    const validQualificationPerspectives = WEATHER_QUALIFICATION_PERSPECTIVES.filter(
        ({ id }) => selectedQualificationTarget?.perspectives.includes(id),
    );

    return (
        <main className={styles.lab}>
            <Sky
                preview={preview}
                paused={settings.paused}
                onVisualChange={receiveSnapshot}
                onRendererStats={setRendererStats}
            />

            <section className={styles.panel} aria-label="Sky preview controls">
                <header className={styles.header}>
                    <div>
                        <p className={styles.eyebrow}>Unlisted utility</p>
                        <h1>Sky laboratory</h1>
                    </div>
                    <button className={styles.iconButton} onClick={randomize} title="Randomize everything" aria-label="Randomize everything">
                        ↻
                    </button>
                </header>

                <div className={styles.status}>
                    <strong>{familyLabel}</strong>
                    <span>
                        {titleCase(snapshot?.atmosphereStyle ?? "loading")} · {titleCase(snapshot?.motionStyle ?? "loading")} · {titleCase(snapshot?.bloomStyle ?? "loading")}
                    </span>
                </div>

                <div className={styles.astronomyStatus}>
                    <span>{snapshot?.lightingRegime ?? "Resolving lighting regime"}</span>
                    <span>{Math.round((snapshot?.darkness ?? 0) * 100)}% nocturnal adaptation</span>
                    <span>{Math.round((snapshot?.nightBlackout ?? 0) * 100)}% pristine blackout</span>
                    <span>{titleCase(snapshot?.aerosolType ?? "resolving aerosol")}</span>
                    <span>{Math.round((snapshot?.aerosol ?? 0) * 100)}% aerosol</span>
                    <span>{Math.round((snapshot?.humidity ?? 0) * 100)}% humidity</span>
                    <span>{Math.round((snapshot?.inversion ?? 0) * 100)}% inversion</span>
                    <span>{snapshot?.moonPhase ?? "Resolving lunar state"}</span>
                    <span>{Math.round((snapshot?.moonIllumination ?? 0) * 100)}% illuminated</span>
                    <span>{snapshot?.visibleStars ?? 0} visible catalogue stars</span>
                    <span>{rendererStats?.backend ?? "selecting renderer"}</span>
                    {rendererStats && (
                        <span>
                            {rendererStats.cloudWidth}×{rendererStats.cloudHeight} cloud · {rendererStats.textureMemoryMb.toFixed(1)} MB
                        </span>
                    )}
                    {rendererStats?.compositeMs !== null && rendererStats?.compositeMs !== undefined && (
                        <span>{rendererStats.compositeMs.toFixed(2)} ms CPU submission</span>
                    )}
                </div>

                {snapshot && (
                    <div className={styles.swatches} aria-label="Current palette">
                        {Object.entries(snapshot.palette).map(([name, color]) => (
                            <span key={name} title={`${titleCase(name)} — ${color}`} style={{ background: color }} />
                        ))}
                    </div>
                )}

                <fieldset>
                    <legend>Moment</legend>
                    <div className={styles.twoColumn}>
                        <label className={styles.field}>
                            <span>Date</span>
                            <input type="date" value={settings.date} onChange={(event) => update("date", event.target.value)} />
                        </label>
                        <label className={styles.field}>
                            <span>Time</span>
                            <input type="time" value={settings.time} onChange={(event) => update("time", event.target.value)} />
                        </label>
                    </div>
                    <SelectField label="Location / timezone" value={settings.timezone} onChange={(value) => update("timezone", value)}>
                        {TIMEZONES.map((timezone) => <option key={timezone}>{timezone}</option>)}
                    </SelectField>
                    <SelectField label="Palette phase" value={settings.phase} onChange={(value) => update("phase", value as LabSettings["phase"])}>
                        <option value="natural">Natural interpolation</option>
                        {PHASE_ORDER.map((phase) => <option key={phase} value={phase}>{PHASE_LABELS[phase]}</option>)}
                    </SelectField>
                </fieldset>

                <fieldset>
                    <legend>Daily character</legend>
                    <SelectField label="Sky family" value={settings.family} onChange={(value) => update("family", value)}>
                        <option value="auto">Seasonally weighted</option>
                        {SKY_FAMILIES.map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}
                    </SelectField>
                    <div className={styles.twoColumn}>
                        <SelectField label="Region bias" value={settings.region} onChange={(value) => update("region", value as LabSettings["region"])}>
                            <option value="auto">Automatic</option>
                            {REGIONS.map((region) => <option key={region} value={region}>{titleCase(region)}</option>)}
                        </SelectField>
                        <SelectField label="Season bias" value={settings.season} onChange={(value) => update("season", value as LabSettings["season"])}>
                            <option value="auto">Automatic</option>
                            {SEASONS.map((season) => <option key={season} value={season}>{titleCase(season)}</option>)}
                        </SelectField>
                    </div>
                    <div className={styles.twoColumn}>
                        <SelectField label="Atmosphere" value={settings.atmosphere} onChange={(value) => update("atmosphere", value as LabSettings["atmosphere"])}>
                            <option value="auto">Family default</option>
                            {ATMOSPHERES.map((atmosphere) => <option key={atmosphere} value={atmosphere}>{titleCase(atmosphere)}</option>)}
                        </SelectField>
                        <SelectField label="Motion" value={settings.motion} onChange={(value) => update("motion", value as LabSettings["motion"])}>
                            <option value="auto">Daily seeded</option>
                            {MOTIONS.map((motion) => <option key={motion} value={motion}>{titleCase(motion)}</option>)}
                        </SelectField>
                    </div>
                    <div className={styles.twoColumn}>
                        <SelectField label="Palette variant" value={settings.variant} onChange={(value) => update("variant", value as LabSettings["variant"])}>
                            <option value="auto">Daily seeded</option>
                            <option value="-1">Previous</option>
                            <option value="0">Core</option>
                            <option value="1">Next</option>
                        </SelectField>
                        <SelectField label="Edge direction" value={settings.edgeDirection} onChange={(value) => update("edgeDirection", value as LabSettings["edgeDirection"])}>
                            <option value="auto">Daily seeded</option>
                            <option value="original">Original</option>
                            <option value="flipped">Flipped</option>
                        </SelectField>
                    </div>
                </fieldset>

                <fieldset>
                    <legend>
                        Color grade
                        <label className={styles.toggle}>
                            <input type="checkbox" checked={settings.manualGrade} onChange={(event) => update("manualGrade", event.target.checked)} />
                            Manual
                        </label>
                    </legend>
                    <Slider label="Hue rotation" value={settings.hue} min={-12} max={12} step={0.5} disabled={!settings.manualGrade} format={(value) => `${value.toFixed(1)}°`} onChange={(value) => update("hue", value)} />
                    <Slider label="Chroma" value={settings.chroma} min={0.7} max={1.3} step={0.01} disabled={!settings.manualGrade} onChange={(value) => update("chroma", value)} />
                    <Slider label="Lightness" value={settings.lightness} min={-0.08} max={0.08} step={0.002} disabled={!settings.manualGrade} format={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(3)}`} onChange={(value) => update("lightness", value)} />
                </fieldset>

                <fieldset>
                    <legend>
                        Palette intensity
                        <label className={styles.toggle}>
                            <input type="checkbox" checked={settings.manualIntensity} onChange={(event) => update("manualIntensity", event.target.checked)} />
                            Manual
                        </label>
                    </legend>
                    <Slider label="Contrast" value={settings.contrast} min={0.78} max={1.28} step={0.01} disabled={!settings.manualIntensity} onChange={(value) => update("contrast", value)} />
                    <Slider label="Saturation" value={settings.saturation} min={0.7} max={1.35} step={0.01} disabled={!settings.manualIntensity} onChange={(value) => update("saturation", value)} />
                    <Slider label="Wrapped edges" value={settings.edge} min={0.5} max={1.5} step={0.01} disabled={!settings.manualIntensity} onChange={(value) => update("edge", value)} />
                    <Slider label="Horizon glow" value={settings.glow} min={0.55} max={1.5} step={0.01} disabled={!settings.manualIntensity} onChange={(value) => update("glow", value)} />
                    <Slider label="Atmospheric haze" value={settings.haze} min={0.45} max={1.65} step={0.01} disabled={!settings.manualIntensity} onChange={(value) => update("haze", value)} />
                </fieldset>

                <fieldset>
                    <legend>
                        Atmospheric composition
                        <label className={styles.toggle}>
                            <input type="checkbox" checked={settings.manualComposition} onChange={(event) => update("manualComposition", event.target.checked)} />
                            Manual
                        </label>
                    </legend>
                    <SelectField label="Aerosol species" value={settings.aerosolType} onChange={(value) => update("aerosolType", value as LabSettings["aerosolType"])}>
                        <option value="auto">Family default</option>
                        {AEROSOL_TYPES.map((type) => <option key={type} value={type}>{titleCase(type)}</option>)}
                    </SelectField>
                    <Slider label="Aerosol optical depth" value={settings.aerosol} min={0.015} max={1} step={0.005} disabled={!settings.manualComposition} onChange={(value) => update("aerosol", value)} />
                    <Slider label="Relative humidity" value={settings.humidity} min={0} max={1} step={0.01} disabled={!settings.manualComposition} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update("humidity", value)} />
                    <Slider label="Particle size" value={settings.aerosolSize} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("aerosolSize", value)} />
                    <Slider label="Aerosol absorption" value={settings.aerosolAbsorption} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("aerosolAbsorption", value)} />
                    <Slider label="Ozone column" value={settings.ozone} min={0.65} max={1.35} step={0.01} disabled={!settings.manualComposition} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("ozone", value)} />
                    <Slider label="Observer altitude" value={settings.observerAltitude} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("observerAltitude", value)} />
                    <Slider label="Boundary inversion" value={settings.inversion} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("inversion", value)} />
                    <Slider label="Stratospheric aerosol" value={settings.stratosphericAerosol} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("stratosphericAerosol", value)} />
                    <Slider label="Ground albedo" value={settings.groundAlbedo} min={0} max={1} step={0.01} disabled={!settings.manualComposition} onChange={(value) => update("groundAlbedo", value)} />
                </fieldset>

                <fieldset>
                    <legend>Texture and motion</legend>
                    <SelectField label="Solar bloom composition" value={settings.bloom} onChange={(value) => update("bloom", value as LabSettings["bloom"])}>
                        <option value="auto">Daily seeded</option>
                        {SKY_BLOOM_STYLES.map((bloom) => <option key={bloom} value={bloom}>{titleCase(bloom)}</option>)}
                    </SelectField>
                    <Slider label="Bloom visibility" value={settings.bloomVisibility} min={0} max={2} step={0.02} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("bloomVisibility", value)} />
                    <Slider label="Bloom scale" value={settings.bloomScale} min={0.5} max={1.8} step={0.02} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("bloomScale", value)} />
                    <Slider label="Star visibility" value={settings.starVisibility} min={0} max={2} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("starVisibility", value)} />
                    <Slider label="Stellar exposure" value={settings.stellarExposure} min={0} max={2.5} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("stellarExposure", value)} />
                    <Slider label="Stellar glow" value={settings.stellarGlow} min={0} max={2.5} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("stellarGlow", value)} />
                    <Slider label="Moon visibility" value={settings.moonVisibility} min={0} max={2} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("moonVisibility", value)} />
                    <label className={styles.checkRow}>
                        <input type="checkbox" checked={settings.manualNightExposure} onChange={(event) => update("manualNightExposure", event.target.checked)} />
                        Override natural night exposure
                    </label>
                    <Slider label="Night exposure" value={settings.nightExposure} min={-1} max={1} step={0.02} disabled={!settings.manualNightExposure} format={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`} onChange={(value) => update("nightExposure", value)} />
                    <Slider label="Cloud / mist density" value={settings.cloudDensity} min={0} max={2} step={0.02} disabled={settings.manualClouds} onChange={(value) => update("cloudDensity", value)} />
                </fieldset>

                <fieldset>
                    <legend>Renderer</legend>
                    <div className={styles.twoColumn}>
                        <SelectField label="Backend" value={settings.rendererPreference} onChange={(value) => update("rendererPreference", value as SkyRendererPreference)}>
                            <option value="auto">Automatic (production-safe)</option>
                            <option value="webgpu">Force WebGPU</option>
                            <option value="webgl2">Force WebGL2</option>
                            <option value="fallback">CSS fallback</option>
                        </SelectField>
                        <SelectField label="Quality tier" value={settings.rendererQuality} onChange={(value) => update("rendererQuality", value as SkyRendererQuality)}>
                            <option value="battery">Battery</option>
                            <option value="balanced">Balanced</option>
                            <option value="high">High</option>
                        </SelectField>
                    </div>
                    <SelectField label="Debug output" value={settings.rendererDebugView} onChange={(value) => update("rendererDebugView", value as SkyDebugView)}>
                        {([
                            "final", "coverage", "density", "transmittance",
                            "depth", "velocity", "history", "lighting", "steps",
                            "lighting-direct-sun", "lighting-exterior-diffuse",
                            "lighting-p1-cache", "lighting-atmosphere-composite",
                            "lighting-source-higher-order",
                            "lighting-atmosphere-shadow-loss",
                        ] as const).map((view) => (
                            <option key={view} value={view}>{titleCase(view)}</option>
                        ))}
                    </SelectField>
                    <SelectField label="Cloud composition" value={settings.cloudComposition} onChange={(value) => update("cloudComposition", value as SkyCloudComposition)}>
                        <option value="graphic">Editorial physical (production)</option>
                        <option value="layered">Layered bands</option>
                        <option value="edge-framed">Edge-framed physical</option>
                        <option value="physical">Physical camera</option>
                    </SelectField>
                    <SelectField label="Cloud perspective" value={settings.cloudPerspective} onChange={(value) => update("cloudPerspective", value as SkyCloudPerspective)}>
                        <option value="telephoto">Telephoto staging (production)</option>
                        <option value="natural">Natural perspective</option>
                        <option value="wide">Wide-angle depth</option>
                        <option value="orthographic">Orthographic graphic</option>
                        <option value="panoramic">Panoramic field</option>
                    </SelectField>
                    <SelectField label="Weather-system placement" value={settings.cloudEditorialRegime} onChange={(value) => update("cloudEditorialRegime", value as SkyCloudEditorialRegime)}>
                        <option value="auto">Genus-aware automatic (production)</option>
                        <option value="distant">Distant system or bank</option>
                        <option value="nearby">Nearby system</option>
                        <option value="overhead">Immediate or overhead</option>
                    </SelectField>
                    <Slider label="Cloud-buffer resolution" value={settings.cloudResolutionScale} min={0.5} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update("cloudResolutionScale", value)} />
                    <Slider label="Cloud transport cadence" value={settings.cloudUpdateRate} min={1} max={6} step={1} format={(value) => `${Math.round(value)} Hz`} onChange={(value) => update("cloudUpdateRate", value)} />
                    <label className={styles.checkRow}>
                        <input type="checkbox" checked={settings.temporalClouds} onChange={(event) => update("temporalClouds", event.target.checked)} />
                        Temporal reprojection and history
                    </label>
                    {rendererStats && (
                        <div
                            className={styles.rendererReadout}
                            data-cloud-budget-status={rendererStats.budgetStatus ?? "unavailable"}
                            data-cloud-gpu-ms={rendererStats.cloudUpdateMs ?? "unavailable"}
                            data-cloud-interval-ms={rendererStats.cloudIntervalMs ?? "unavailable"}
                            data-cloud-lighting-ms={rendererStats.cloudLightingMs ?? "unavailable"}
                            data-cloud-transport-ms={rendererStats.cloudTransportMs ?? "unavailable"}
                            data-cloud-cold-warmup-ms={rendererStats.coldCloudWarmupMs ?? "unavailable"}
                            data-cloud-cold-warmup-queue-ms={rendererStats.coldCloudWarmupQueueMs ?? "unavailable"}
                            data-cloud-cold-warmup-complete={rendererStats.coldCloudWarmupComplete ?? false}
                            data-cloud-first-update-ms={rendererStats.firstCloudUpdateMs ?? "unavailable"}
                            data-cloud-first-interval-ms={rendererStats.firstCloudIntervalMs ?? "unavailable"}
                            data-cloud-first-lighting-ms={rendererStats.firstCloudLightingMs ?? "unavailable"}
                            data-cloud-first-transport-ms={rendererStats.firstCloudTransportMs ?? "unavailable"}
                            data-cloud-projected-opacity={rendererStats.projectedOpacity ?? "unavailable"}
                            data-cloud-occupied-sky-fraction={rendererStats.occupiedSkyFraction ?? "unavailable"}
                            data-cloud-accepted-interval-fraction={rendererStats.acceptedIntervalFraction ?? "unavailable"}
                            data-cloud-mean-evaluated-step-fraction={rendererStats.meanEvaluatedStepFraction ?? "unavailable"}
                            data-cloud-gpu-p50-ms={rendererStats.cloudUpdateP50Ms ?? "unavailable"}
                            data-cloud-gpu-p95-ms={rendererStats.cloudUpdateP95Ms ?? "unavailable"}
                            data-cloud-gpu-max-ms={rendererStats.cloudUpdateMaxMs ?? "unavailable"}
                            data-cloud-timing-samples={rendererStats.cloudTimingSamples ?? 0}
                            data-cloud-unsafe-sample-count={rendererStats.cloudUnsafeSampleCount ?? 0}
                            data-cloud-stats-json={JSON.stringify(rendererStats)}
                            data-cloud-interleaved={rendererStats.interleavedTransport ?? false}
                            data-cloud-transport-pixel-fraction={rendererStats.transportPixelFraction ?? 1}
                        >
                            <span>{rendererStats.backend}</span>
                            <span>{rendererStats.width}×{rendererStats.height}</span>
                            <span>{rendererStats.cloudWidth}×{rendererStats.cloudHeight} cloud</span>
                            <span>{rendererStats.textureMemoryMb.toFixed(1)} MB</span>
                            <span>{rendererStats.historyValid ? "history valid" : "history warming"}</span>
                            {rendererStats.effectiveUpdateRate !== undefined && (
                                <span>
                                    {rendererStats.effectiveUpdateRate.toFixed(1)} Hz effective
                                    {rendererStats.requestedUpdateRate !== undefined &&
                                        ` / ${rendererStats.requestedUpdateRate.toFixed(1)} requested`}
                                </span>
                            )}
                            {rendererStats.cloudUpdateMs !== null && (
                                <span>{rendererStats.cloudUpdateMs.toFixed(2)} ms cloud GPU</span>
                            )}
                            {rendererStats.cloudIntervalMs !== null && rendererStats.cloudIntervalMs !== undefined &&
                                rendererStats.cloudLightingMs !== null && rendererStats.cloudLightingMs !== undefined &&
                                rendererStats.cloudTransportMs !== null && rendererStats.cloudTransportMs !== undefined && (
                                <span>
                                    {rendererStats.cloudIntervalMs.toFixed(2)} interval · {rendererStats.cloudLightingMs.toFixed(2)} light · {rendererStats.cloudTransportMs.toFixed(2)} transport ms
                                </span>
                            )}
                            {rendererStats.coldCloudWarmupComplete && (
                                <span>
                                    cold lighting warm-up
                                    {rendererStats.coldCloudWarmupMs !== null && rendererStats.coldCloudWarmupMs !== undefined
                                        ? ` ${rendererStats.coldCloudWarmupMs.toFixed(2)} ms GPU`
                                        : " complete"}
                                    {rendererStats.coldCloudWarmupQueueMs !== null && rendererStats.coldCloudWarmupQueueMs !== undefined
                                        ? ` · ${rendererStats.coldCloudWarmupQueueMs.toFixed(2)} ms queue`
                                        : ""}
                                </span>
                            )}
                            {rendererStats.firstCloudUpdateMs !== null && rendererStats.firstCloudUpdateMs !== undefined && (
                                <span>
                                    first transport {rendererStats.firstCloudUpdateMs.toFixed(2)} ms
                                    {rendererStats.firstCloudIntervalMs !== null && rendererStats.firstCloudIntervalMs !== undefined
                                        ? ` · ${rendererStats.firstCloudIntervalMs.toFixed(2)} interval`
                                        : ""}
                                    {rendererStats.firstCloudLightingMs !== null && rendererStats.firstCloudLightingMs !== undefined &&
                                        rendererStats.firstCloudTransportMs !== null && rendererStats.firstCloudTransportMs !== undefined
                                        ? ` · ${rendererStats.firstCloudLightingMs.toFixed(2)} light · ${rendererStats.firstCloudTransportMs.toFixed(2)} transport`
                                        : ""}
                                </span>
                            )}
                            {rendererStats.cloudUpdateP50Ms !== null && rendererStats.cloudUpdateP50Ms !== undefined &&
                                rendererStats.cloudUpdateP95Ms !== null && rendererStats.cloudUpdateP95Ms !== undefined && (
                                <span>
                                    {rendererStats.cloudUpdateP50Ms.toFixed(2)} ms p50 · {rendererStats.cloudUpdateP95Ms.toFixed(2)} ms p95 · {rendererStats.cloudTimingSamples ?? 0} samples
                                </span>
                            )}
                            {rendererStats.cloudUpdateMaxMs !== null && rendererStats.cloudUpdateMaxMs !== undefined && (
                                <span>
                                    {rendererStats.cloudUpdateMaxMs.toFixed(2)} ms max · {rendererStats.cloudUnsafeSampleCount ?? 0} unsafe samples
                                </span>
                            )}
                            {rendererStats.adapterInfo && (
                                <span>
                                    {[rendererStats.adapterInfo.vendor, rendererStats.adapterInfo.architecture, rendererStats.adapterInfo.device, rendererStats.adapterInfo.description]
                                        .filter(Boolean)
                                        .join(" · ") || "privacy-reduced adapter identity"}
                                </span>
                            )}
                            {rendererStats.projectedOpacity !== null && rendererStats.projectedOpacity !== undefined &&
                                rendererStats.occupiedSkyFraction !== null && rendererStats.occupiedSkyFraction !== undefined &&
                                rendererStats.acceptedIntervalFraction !== null && rendererStats.acceptedIntervalFraction !== undefined && (
                                <span>
                                    {(rendererStats.projectedOpacity * 100).toFixed(1)}% mean opacity · {(rendererStats.occupiedSkyFraction * 100).toFixed(1)}% occupied · {(rendererStats.acceptedIntervalFraction * 100).toFixed(1)}% intervals
                                </span>
                            )}
                            {rendererStats.meanEvaluatedStepFraction !== null && rendererStats.meanEvaluatedStepFraction !== undefined && (
                                <span>
                                    {(rendererStats.meanEvaluatedStepFraction * 144).toFixed(1)} mean density evaluations
                                </span>
                            )}
                            {rendererStats.viewSteps !== undefined && rendererStats.lightSteps !== undefined && (
                                <span>{rendererStats.viewSteps} view · {rendererStats.lightSteps} light steps</span>
                            )}
                            {rendererStats.interleavedTransport !== undefined && (
                                <span>
                                    {rendererStats.interleavedTransport
                                        ? `checkerboard transport · ${Math.round((rendererStats.transportPixelFraction ?? 0.5) * 100)}% marched`
                                        : "full-frame transport · 100% marched"}
                                </span>
                            )}
                            {rendererStats.budgetStatus && (
                                <span>{rendererStats.budgetStatus} budget · {Math.round((rendererStats.cadenceScale ?? 1) * 100)}% cadence</span>
                            )}
                            {rendererStats.gpuTimingMode && <span>{rendererStats.gpuTimingMode}</span>}
                        </div>
                    )}
                </fieldset>

                <fieldset>
                    <legend>Cloud system</legend>
                    <SelectField
                        label="Weather matrix target"
                        value={settings.weatherHydrometeorTarget}
                        onChange={selectWeatherHydrometeorTarget}
                    >
                        <option value="none">Manual / daily scene</option>
                        {HYDROMETEOR_QUALIFICATION_TARGETS.map((target) => (
                            <option key={target.id} value={target.id}>
                                {target.label}
                            </option>
                        ))}
                    </SelectField>
                    {selectedQualificationTarget && (
                        <>
                            <SelectField
                                label="Weather environment"
                                value={settings.weatherHydrometeorEnvironment}
                                onChange={(value) => update(
                                    "weatherHydrometeorEnvironment",
                                    value,
                                )}
                            >
                                {validQualificationEnvironments.map((environment) => (
                                    <option key={environment.id} value={environment.id}>
                                        {environment.label}
                                    </option>
                                ))}
                            </SelectField>
                            <SelectField
                                label="Review perspective"
                                value={settings.weatherHydrometeorPerspective}
                                onChange={(value) => update(
                                    "weatherHydrometeorPerspective",
                                    value,
                                )}
                            >
                                {validQualificationPerspectives.map((perspective) => (
                                    <option key={perspective.id} value={perspective.id}>
                                        {perspective.label}
                                    </option>
                                ))}
                            </SelectField>
                            <p className={styles.validationStatus}>
                                {selectedQualificationTarget.cues.join(" · ")}
                            </p>
                        </>
                    )}
                    <SelectField
                        label="Hydrometeor qualification"
                        value={settings.hydrometeorPreset}
                        onChange={selectHydrometeorPreset}
                    >
                        {HYDROMETEOR_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.label}
                            </option>
                        ))}
                    </SelectField>
                    <p className={styles.validationStatus}>
                        {HYDROMETEOR_PRESETS.find(
                            ({ id }) => id === settings.hydrometeorPreset,
                        )?.description}
                    </p>
                    <label className={styles.toggle}>
                        <input type="checkbox" checked={settings.manualClouds} onChange={(event) => update("manualClouds", event.target.checked)} />
                        <span>Manual cloud state</span>
                    </label>
                    <div className={styles.presetGrid} aria-label="Cloud preset gallery">
                        {CLOUD_PRESETS.map((preset) => (
                            <button key={preset.label} type="button" onClick={() => applyCloudPreset(preset.values)}>
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <p className={styles.validationStatus}>{cloudValidation}</p>
                    <p className={styles.validationStatus}>{morphologyStatus}</p>
                    <Slider label="Convection" value={settings.cloudConvection} min={0} max={1} step={0.02} disabled={!settings.manualClouds} onChange={(value) => update("cloudConvection", value)} />
                    <Slider label="Instability" value={settings.cloudInstability} min={0} max={1} step={0.02} disabled={!settings.manualClouds} onChange={(value) => update("cloudInstability", value)} />
                    <Slider label="Boundary fog" value={settings.cloudFog} min={0} max={1} step={0.01} disabled={!settings.manualClouds} onChange={(value) => update("cloudFog", value)} />
                    <Slider label="Noctilucent display" value={settings.cloudNoctilucent} min={0} max={1} step={0.01} disabled={!settings.manualClouds} onChange={(value) => update("cloudNoctilucent", value)} />
                    <Slider label="Deterministic seed" value={settings.cloudSeed} min={0} max={1} step={0.001} disabled={!settings.manualClouds} format={(value) => value.toFixed(3)} onChange={(value) => update("cloudSeed", value)} />
                    <Slider label="Weather timeline" value={settings.cloudTimeline} min={-7200} max={7200} step={30} format={(value) => `${value >= 0 ? "+" : ""}${Math.round(value / 60)} min`} onChange={(value) => update("cloudTimeline", value)} />
                    <CloudLayerControls
                        title="Low layer"
                        settings={settings}
                        genera={LOW_GENERA}
                        disabled={!settings.manualClouds}
                        onChange={updateLayer}
                        keys={{ genus: "lowGenus", oktas: "lowOktas", base: "lowBase", thickness: "lowThickness", optical: "lowOptical", wind: "lowWind", direction: "lowDirection", shear: "lowShear", turbulence: "lowTurbulence", ice: "lowIce", precipitation: "lowPrecipitation", organization: "lowOrganization", lifecycle: "lowLifecycle", organizationStrength: "lowOrganizationStrength" }}
                    />
                    <CloudLayerControls
                        title="Middle layer"
                        settings={settings}
                        genera={MID_GENERA}
                        disabled={!settings.manualClouds}
                        onChange={updateLayer}
                        keys={{ genus: "midGenus", oktas: "midOktas", base: "midBase", thickness: "midThickness", optical: "midOptical", wind: "midWind", direction: "midDirection", shear: "midShear", turbulence: "midTurbulence", ice: "midIce", precipitation: "midPrecipitation", organization: "midOrganization", lifecycle: "midLifecycle", organizationStrength: "midOrganizationStrength" }}
                    />
                    <CloudLayerControls
                        title="High layer"
                        settings={settings}
                        genera={HIGH_GENERA}
                        disabled={!settings.manualClouds}
                        onChange={updateLayer}
                        keys={{ genus: "highGenus", oktas: "highOktas", base: "highBase", thickness: "highThickness", optical: "highOptical", wind: "highWind", direction: "highDirection", shear: "highShear", turbulence: "highTurbulence", ice: "highIce", precipitation: "highPrecipitation", organization: "highOrganization", lifecycle: "highLifecycle", organizationStrength: "highOrganizationStrength" }}
                    />
                    <Slider label="Motion speed" value={settings.motionSpeed} min={0.25} max={3} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("motionSpeed", value)} />
                    <Slider label="Motion distance" value={settings.motionAmount} min={0} max={2} step={0.02} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("motionAmount", value)} />
                    <label className={styles.checkRow}>
                        <input type="checkbox" checked={settings.paused} onChange={(event) => update("paused", event.target.checked)} />
                        Pause all background motion
                    </label>
                </fieldset>

                <footer className={styles.actions}>
                    <button onClick={randomize}>Randomize</button>
                    <button onClick={useNow}>Now</button>
                    <button onClick={reset}>Reset</button>
                    <button className={styles.primary} onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
                </footer>
            </section>
        </main>
    );
}

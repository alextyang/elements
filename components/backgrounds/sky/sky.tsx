"use client";

import { CSSProperties, useEffect, useState } from "react";
import SunCalc from "suncalc";

import {
    calculateCelestialScene,
    lunarRelativeIrradiance,
    type CelestialScene,
} from "./astronomy";
import {
    AtmosphereCanvas,
    type SkyRadianceScene,
} from "./atmosphere-canvas";
import { CelestialCanvas } from "./celestial-canvas";
import {
    createDailyCloudScene,
    sceneFromLegacy,
    type CloudScene,
} from "./cloud-scene";
import styles from "./sky.module.css";
import {
    PHASE_ORDER,
    SKY_FAMILIES,
    SKY_PALETTES,
    SkyAerosolType,
    SkyAtmosphere,
    SkyFamily,
    SkyPalette,
    SkyPhase,
    SkyRegion,
    SkySeason,
} from "./sky-palettes";

export type SkyMotionStyle =
    | "drift"
    | "bloom"
    | "tide"
    | "crosswind"
    | "thermal";

export const SKY_BLOOM_STYLES = [
    "diffuse",
    "horizonBand",
    "sideVeil",
    "splitScatter",
    "softHalo",
    "quiet",
] as const;

export type SkyBloomStyle = (typeof SKY_BLOOM_STYLES)[number];

export interface SkyCompositionControls {
    aerosol: number;
    humidity: number;
    aerosolSize: number;
    aerosolAbsorption: number;
    ozone: number;
    observerAltitude: number;
    inversion: number;
    stratosphericAerosol: number;
    groundAlbedo: number;
}

export type SkyCloudType =
    | "none"
    | "cirrus"
    | "cirrocumulus"
    | "stratus"
    | "stratocumulus"
    | "cumulus"
    | "cumulonimbus";

export interface SkyPreviewOptions {
    date?: Date;
    timezone?: string;
    latitude?: number;
    longitude?: number;
    /** Compass bearing at the centre of a matched photographic view. */
    viewAzimuth?: number;
    /** Horizontal camera field of view in degrees. */
    horizontalFov?: number;
    /** Elevation at the centre of a matched photographic view. */
    viewElevation?: number;
    /** Vertical camera field of view in degrees. */
    verticalFov?: number;
    /** Use the Moon's physical angular diameter instead of the art-directed UI scale. */
    physicalMoonScale?: boolean;
    familyId?: string;
    atmosphereStyle?: SkyAtmosphere;
    motionStyle?: SkyMotionStyle;
    phase?: SkyPhase;
    region?: SkyRegion;
    season?: SkySeason;
    variantShift?: -1 | 0 | 1;
    hueJitter?: number;
    chromaJitter?: number;
    lightnessJitter?: number;
    flipEdges?: boolean;
    intensity?: Partial<SkyFamily["intensity"]>;
    cloudDensity?: number;
    /** Dominant measured cloud morphology for photographic matching. */
    cloudType?: SkyCloudType;
    /** Fractional cloud cover, independent of optical thickness. */
    cloudCoverage?: number;
    /** Relative cloud optical depth from transparent veil to opaque deck. */
    cloudOpticalDepth?: number;
    /**
     * Full meteorological cloud state. Overrides the legacy triple above and
     * the deterministic daily derivation. Used by Sky Lab and by any caller
     * that needs direct control of layering.
     */
    cloudScene?: CloudScene;
    motionSpeed?: number;
    motionAmount?: number;
    bloomStyle?: SkyBloomStyle;
    bloomVisibility?: number;
    bloomScale?: number;
    starVisibility?: number;
    moonVisibility?: number;
    /** Artistic camera adaptation for night only: -1 is extremely dark, +1 lifted. */
    nightExposure?: number;
    composition?: Partial<SkyCompositionControls>;
    aerosolType?: SkyAerosolType;
}

export interface SkySnapshot {
    palette: SkyPalette;
    familyId: string;
    atmosphereStyle: SkyAtmosphere;
    motionStyle: SkyMotionStyle;
    bloomStyle: SkyBloomStyle;
    moonPhase: string;
    moonIllumination: number;
    visibleStars: number;
    lightingRegime: string;
    darkness: number;
    nightBlackout: number;
    aerosolType: SkyAerosolType;
    aerosol: number;
    humidity: number;
    inversion: number;
    stratosphericAerosol: number;
}

interface SkyProps {
    preview?: SkyPreviewOptions;
    paused?: boolean;
    contained?: boolean;
    onVisualChange?: (snapshot: SkySnapshot) => void;
}

const PALETTE_KEYS: (keyof SkyPalette)[] = [
    "top",
    "upper",
    "middle",
    "horizon",
    "low",
    "left",
    "right",
    "glow",
    "haze",
    "cloud",
    "cloudWarm",
];

const TIMEZONE_COORDINATES: Record<string, [number, number]> = {
    "America/Los_Angeles": [34.0522, -118.2437],
    "America/Vancouver": [49.2827, -123.1207],
    "America/Denver": [39.7392, -104.9903],
    "America/Phoenix": [33.4484, -112.074],
    "America/Chicago": [41.8781, -87.6298],
    "America/New_York": [40.7128, -74.006],
    "America/Toronto": [43.6532, -79.3832],
    "America/Halifax": [44.6488, -63.5752],
    "America/Mexico_City": [19.4326, -99.1332],
    "America/Sao_Paulo": [-23.5505, -46.6333],
    "Europe/London": [51.5072, -0.1276],
    "Europe/Paris": [48.8566, 2.3522],
    "Europe/Berlin": [52.52, 13.405],
    "Europe/Rome": [41.9028, 12.4964],
    "Europe/Madrid": [40.4168, -3.7038],
    "Europe/Athens": [37.9838, 23.7275],
    "Africa/Cairo": [30.0444, 31.2357],
    "Africa/Johannesburg": [-26.2041, 28.0473],
    "Asia/Dubai": [25.2048, 55.2708],
    "Asia/Kolkata": [19.076, 72.8777],
    "Asia/Bangkok": [13.7563, 100.5018],
    "Asia/Shanghai": [31.2304, 121.4737],
    "Asia/Hong_Kong": [22.3193, 114.1694],
    "Asia/Tokyo": [35.6762, 139.6503],
    "Asia/Seoul": [37.5665, 126.978],
    "Australia/Perth": [-31.9523, 115.8613],
    "Australia/Sydney": [-33.8688, 151.2093],
    "Pacific/Auckland": [-36.8509, 174.7645],
    "Pacific/Honolulu": [21.3099, -157.8581],
};

const TIMEZONE_REGIONS: Partial<Record<string, SkyRegion>> = {
    "America/Los_Angeles": "marine",
    "America/Vancouver": "marine",
    "America/Denver": "continental",
    "America/Phoenix": "dry",
    "America/Chicago": "continental",
    "America/New_York": "humid",
    "America/Toronto": "continental",
    "America/Halifax": "marine",
    "America/Mexico_City": "dry",
    "America/Sao_Paulo": "humid",
    "Europe/London": "marine",
    "Europe/Paris": "continental",
    "Europe/Berlin": "continental",
    "Europe/Rome": "marine",
    "Europe/Madrid": "dry",
    "Europe/Athens": "marine",
    "Africa/Cairo": "dry",
    "Africa/Johannesburg": "dry",
    "Asia/Dubai": "dry",
    "Asia/Kolkata": "tropical",
    "Asia/Bangkok": "tropical",
    "Asia/Shanghai": "humid",
    "Asia/Hong_Kong": "tropical",
    "Asia/Tokyo": "humid",
    "Asia/Seoul": "continental",
    "Australia/Perth": "dry",
    "Australia/Sydney": "marine",
    "Pacific/Auckland": "marine",
    "Pacific/Honolulu": "tropical",
};

interface ResolvedAtmosphericComposition extends SkyCompositionControls {
    aerosolType: SkyAerosolType;
    aerosolTint: [number, number, number];
}

interface SkyVisual {
    palette: SkyPalette;
    radiance: SkyRadianceScene;
    familyId: string;
    atmosphereStyle: SkyAtmosphere;
    motionStyle: SkyMotionStyle;
    celestial: CelestialScene;
    highCloudOpacity: number;
    lowCloudOpacity: number;
    mistOpacity: number;
    cloudOffset: number;
    cloudHeight: number;
    nightDepth: number;
    lightingRegime: string;
    composition: ResolvedAtmosphericComposition;
    motionDirection: "alternate" | "alternate-reverse";
    baseDuration: number;
    edgeDuration: number;
    horizonDuration: number;
    mistDuration: number;
    highCloudDuration: number;
    lowCloudDuration: number;
    motionX: number;
    motionY: number;
    animationDelay: number;
    saturationLow: number;
    edgeOpacityLow: number;
    edgeOpacityHigh: number;
    airglowOpacityLow: number;
    airglowOpacityHigh: number;
    bloomStyle: SkyBloomStyle;
    bloomOpacity: number;
    bloomBandOpacity: number;
    bloomX: number;
    bloomY: number;
    bloomWidth: number;
    bloomHeight: number;
    bloomSecondaryX: number;
    bloomSecondaryY: number;
    bloomSecondaryWidth: number;
    bloomSecondaryHeight: number;
    bloomSecondaryStrength: number;
    bloomCoreStop: number;
    bloomMidStop: number;
    bloomFadeStop: number;
    bloomTilt: number;
    bloomPrimary: string;
    bloomSecondary: string;
    bloomBand: string;
}

interface Keyframe {
    at: number;
    palette: SkyPalette;
}

const clamp = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

/**
 * Parses a palette colour into scene-linear RGB.
 *
 * Cloud ambient and ground-bounce terms are consumed by the shader as linear
 * radiance, so the sRGB transfer function has to be inverted here. Passing the
 * display-encoded value straight through would make ambient light roughly twice
 * as bright as intended in the midtones.
 */
const parseSkyColor = (value: string): [number, number, number] => {
    const toLinear = (channel: number) =>
        channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;

    const numeric = value.match(/[\d.]+/g)?.map(Number);
    if (value.startsWith("rgb") && numeric && numeric.length >= 3) {
        return [
            toLinear(numeric[0] / 255),
            toLinear(numeric[1] / 255),
            toLinear(numeric[2] / 255),
        ];
    }
    const hex = value.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [
            toLinear(Number.parseInt(hex.slice(0, 2), 16) / 255),
            toLinear(Number.parseInt(hex.slice(2, 4), 16) / 255),
            toLinear(Number.parseInt(hex.slice(4, 6), 16) / 255),
        ];
    }
    return [0, 0, 0];
};

const smoothstep = (value: number) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
};

const PHASE_SOLAR_ALTITUDE: Record<SkyPhase, number> = {
    night: -22,
    blueHourMorning: -11,
    preDawn: -7.5,
    beltOfVenus: -4,
    sunrise: -0.6,
    morning: 11,
    solarNoon: 54,
    day: 38,
    golden: 7,
    sunset: -0.6,
    afterglow: -3.5,
    dusk: -6.5,
    blueHourEvening: -11,
};

const AEROSOL_TINTS: Record<SkyAerosolType, [number, number, number]> = {
    clean: [0.91, 0.94, 1],
    maritime: [0.94, 0.95, 0.9],
    dust: [0.9, 0.68, 0.43],
    smoke: [0.68, 0.55, 0.46],
    sulfate: [0.91, 0.88, 0.94],
    pollution: [0.79, 0.69, 0.57],
};

const resolveAtmosphericComposition = ({
    family,
    atmosphere,
    randomValues,
    override,
    aerosolTypeOverride,
}: {
    family: SkyFamily;
    atmosphere: SkyAtmosphere;
    randomValues: number[];
    override?: Partial<SkyCompositionControls>;
    aerosolTypeOverride?: SkyAerosolType;
}): ResolvedAtmosphericComposition => {
    const optics = family.optics;
    const aerosolType = aerosolTypeOverride ?? optics.aerosolType ?? "clean";
    const styleBias = {
        crystal: { aerosol: -0.06, humidity: -0.08, inversion: -0.08 },
        cirrus: { aerosol: -0.01, humidity: 0.02, inversion: -0.02 },
        haze: { aerosol: 0.12, humidity: 0.04, inversion: 0.13 },
        mist: { aerosol: 0.04, humidity: 0.1, inversion: 0.08 },
        soft: { aerosol: 0.05, humidity: 0.08, inversion: 0.05 },
    }[atmosphere];
    const observerAltitude = clamp(
        override?.observerAltitude ??
            (optics.observerAltitude ?? 0.08) + (randomValues[2] - 0.5) * 0.08,
    );
    const aerosol = clamp(
        override?.aerosol ??
            (optics.aerosol +
                styleBias.aerosol +
                (randomValues[25] - 0.5) * 0.12) *
                (1 - observerAltitude * 0.24),
        0.015,
        1,
    );
    const humidity = clamp(
        override?.humidity ??
            (optics.humidity +
                styleBias.humidity +
                (randomValues[26] - 0.5) * 0.1) *
                (1 - observerAltitude * 0.14),
    );

    return {
        aerosolType,
        aerosolTint: AEROSOL_TINTS[aerosolType],
        aerosol,
        humidity,
        aerosolSize: clamp(
            override?.aerosolSize ??
                (optics.aerosolSize ?? 0.3) + (randomValues[27] - 0.5) * 0.08,
        ),
        aerosolAbsorption: clamp(
            override?.aerosolAbsorption ??
                (optics.aerosolAbsorption ?? 0.04) +
                    (randomValues[28] - 0.5) * 0.04,
        ),
        ozone: clamp(
            override?.ozone ??
                (optics.ozone ?? 1) + (randomValues[29] - 0.5) * 0.1,
            0.65,
            1.35,
        ),
        observerAltitude,
        inversion: clamp(
            override?.inversion ??
                (optics.inversion ?? 0.08) +
                    styleBias.inversion +
                    (randomValues[24] - 0.5) * 0.1,
        ),
        stratosphericAerosol: clamp(
            override?.stratosphericAerosol ??
                (optics.stratosphericAerosol ?? 0.03) +
                    (atmosphere === "cirrus" ? 0.025 : 0) +
                    (randomValues[30] - 0.5) * 0.04,
        ),
        groundAlbedo: clamp(
            override?.groundAlbedo ??
                (optics.groundAlbedo ?? 0.24) +
                    (randomValues[31] - 0.5) * 0.06,
        ),
    };
};

interface OklabColor {
    l: number;
    a: number;
    b: number;
}

const parseRgb = (color: string) => {
    if (color.startsWith("#")) {
        const value = color.slice(1);
        return [0, 2, 4].map((offset) =>
            Number.parseInt(value.slice(offset, offset + 2), 16),
        );
    }

    return (color.match(/[\d.]+/g) ?? ["0", "0", "0"])
        .slice(0, 3)
        .map(Number);
};

const srgbToLinear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value: number) => {
    const channel = clamp(value);
    return Math.round(
        255 *
            (channel <= 0.0031308
                ? channel * 12.92
                : 1.055 * channel ** (1 / 2.4) - 0.055),
    );
};

const toOklab = (color: string): OklabColor => {
    const [r, g, b] = parseRgb(color).map(srgbToLinear);
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);

    return {
        l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
        a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
        b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    };
};

const fromOklab = ({ l, a, b }: OklabColor) => {
    const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
    const linearL = lRoot ** 3;
    const linearM = mRoot ** 3;
    const linearS = sRoot ** 3;
    const r =
        4.0767416621 * linearL -
        3.3077115913 * linearM +
        0.2309699292 * linearS;
    const g =
        -1.2684380046 * linearL +
        2.6097574011 * linearM -
        0.3413193965 * linearS;
    const blue =
        -0.0041960863 * linearL -
        0.7034186147 * linearM +
        1.707614701 * linearS;

    return `rgb(${linearToSrgb(r)}, ${linearToSrgb(g)}, ${linearToSrgb(blue)})`;
};

const mixColor = (from: string, to: string, amount: number) => {
    const a = toOklab(from);
    const b = toOklab(to);
    const mix = (start: number, end: number) =>
        start + (end - start) * amount;

    return fromOklab({
        l: mix(a.l, b.l),
        a: mix(a.a, b.a),
        b: mix(a.b, b.b),
    });
};

const mixPalette = (
    from: SkyPalette,
    to: SkyPalette,
    amount: number,
): SkyPalette => {
    const result = {} as SkyPalette;
    PALETTE_KEYS.forEach((key) => {
        result[key] = mixColor(from[key], to[key], amount);
    });
    return result;
};

const toneColor = (
    source: string,
    tint: string,
    lightness: number,
    chromaScale: number,
    minimumLightness = 0.045,
) => {
    const original = toOklab(source);
    const cast = toOklab(tint);
    const a = original.a * 0.28 + cast.a * 0.72;
    const b = original.b * 0.28 + cast.b * 0.72;
    const chroma = Math.hypot(a, b);
    const maximumChroma = 0.068 * chromaScale;
    const scale = chroma > maximumChroma ? maximumChroma / chroma : 1;

    return fromOklab({
        l: clamp(lightness, minimumLightness, 0.48),
        a: a * scale,
        b: b * scale,
    });
};

interface PhysicalPaletteResult {
    palette: SkyPalette;
    darkness: number;
    moonlight: number;
    regime: string;
    blackout: number;
}

const applyPhysicalAtmosphere = ({
    source,
    family,
    atmosphere,
    composition,
    solarAltitude,
    moonAltitude,
    moonFraction,
    cloudDensity,
    randomValues,
    nightExposureOverride,
}: {
    source: SkyPalette;
    family: SkyFamily;
    atmosphere: SkyAtmosphere;
    composition: ResolvedAtmosphericComposition;
    solarAltitude: number;
    moonAltitude: number;
    moonFraction: number;
    cloudDensity: number;
    randomValues: number[];
    nightExposureOverride?: number;
}): PhysicalPaletteResult => {
    // Natural twilight is logarithmic: the night floor should not be reached
    // during civil twilight, then settles rapidly through nautical twilight.
    const darkness = smoothstep((-solarAltitude - 7) / 10.5);
    const moonAboveHorizon = smoothstep((moonAltitude + 1.5) / 12);
    const moonlight =
        darkness *
        moonAboveHorizon *
        lunarRelativeIrradiance(moonFraction);
    const optics = family.optics;
    const cloudy =
        cloudDensity *
        ({ crystal: 0.18, cirrus: 0.42, haze: 0.58, mist: 0.78, soft: 0.9 }[atmosphere]);
    const pristineSite = clamp(
        1 - composition.aerosol * 1.35 - optics.artificialGlow * 5.5,
    );
    const rareBlackNight =
        randomValues[20] < 0.065 &&
        pristineSite > 0.62 &&
        moonlight < 0.025;
    const naturalExposure = rareBlackNight
        ? -0.065 - randomValues[28] * 0.028
        : (randomValues[28] - 0.5) * 0.052;
    const nightExposure = clamp(
        nightExposureOverride ?? naturalExposure / 0.09,
        -1,
        1,
    );
    const exposureBias = nightExposure * 0.09;
    const blackout = clamp(
        ((-nightExposure - 0.52) / 0.48) *
            pristineSite *
            (1 - moonlight * 2) *
            darkness,
    );
    const naturalAirglow =
        (0.008 + randomValues[30] ** 2 * 0.026) *
        (1 - composition.aerosol * 0.48);
    const groundGlow =
        optics.artificialGlow *
        (0.52 + randomValues[31] * 0.78) *
        (1 + cloudy * 0.7);
    const humidityLift = composition.humidity * 0.018;
    const moonZenithLift = moonlight * (0.055 + composition.aerosol * 0.026);
    const moonHorizonLift = moonlight * (0.068 + composition.humidity * 0.045);
    const floor = clamp(
        optics.nightFloor + exposureBias + naturalAirglow + moonZenithLift,
        0.006,
        0.23,
    );
    const horizonLift =
        optics.horizonLift +
        humidityLift +
        groundGlow +
        moonHorizonLift;
    const overcastCompression = clamp(cloudy - 0.55) * 0.035;
    const darknessContrast = 0.88 + randomValues[22] * 0.34 +
        Math.max(0, -nightExposure) * 0.24;
    // A truly dark, pristine exposure must suppress the entire atmospheric
    // field rather than leave a conspicuous bright gradient at the horizon.
    // Moonlight, aerosol, humidity and artificial skyglow naturally prevent
    // this branch from engaging, so colorful and lifted nights remain common.
    const horizonTransmission = 1 - blackout * 0.82;
    const domeTransmission = 1 - blackout * 0.38;
    const top = floor + overcastCompression * 0.72 * domeTransmission;
    const upper =
        floor +
        (0.016 / darknessContrast + overcastCompression * 0.8) * domeTransmission;
    const middle =
        floor +
        (0.038 / darknessContrast + humidityLift + overcastCompression * 0.5) *
            domeTransmission;
    const horizon =
        floor +
        (0.062 * darknessContrast + horizonLift) * horizonTransmission;
    const low =
        floor +
        (0.073 * darknessContrast + horizonLift * 1.12) * horizonTransmission;
    const edgeVariation = (randomValues[24] - 0.5) * 0.025;
    const cloudLight =
        middle -
        0.018 * (1 - moonlight) +
        moonlight * (0.085 + composition.humidity * 0.035) +
        groundGlow * 0.72;
    const warmCloudLight =
        cloudLight + moonlight * 0.02 + groundGlow * 0.38;
    const chromaScale = clamp(
        0.58 + (1 - composition.humidity) * 0.2 + moonlight * 0.08,
        0.5,
        0.82,
    );
    const minimumLightness = clamp(
        0.005 + moonlight * 0.022 + groundGlow * 0.08,
        0.005,
        0.04,
    );
    const target: SkyPalette = {
        top: toneColor(source.top, optics.nightTint, top, chromaScale, minimumLightness),
        upper: toneColor(source.upper, optics.nightTint, upper, chromaScale, minimumLightness),
        middle: toneColor(source.middle, optics.nightTint, middle, chromaScale, minimumLightness),
        horizon: toneColor(source.horizon, optics.nightTint, horizon, chromaScale, minimumLightness),
        low: toneColor(source.low, optics.nightTint, low, chromaScale * 0.92, minimumLightness),
        left: toneColor(source.left, optics.nightTint, middle + 0.012 + edgeVariation, chromaScale, minimumLightness),
        right: toneColor(source.right, optics.nightTint, middle + 0.012 - edgeVariation, chromaScale, minimumLightness),
        glow: toneColor(source.glow, optics.nightTint, horizon + 0.028 + moonlight * 0.035, chromaScale * 0.72, minimumLightness),
        haze: toneColor(source.haze, optics.nightTint, middle + humidityLift + groundGlow * 0.45, chromaScale * 0.68, minimumLightness),
        cloud: toneColor(source.cloud, optics.nightTint, cloudLight, chromaScale * 0.42, minimumLightness),
        cloudWarm: toneColor(source.cloudWarm, optics.nightTint, warmCloudLight, chromaScale * 0.46, minimumLightness),
    };

    const moonlit = moonlight > 0.035;
    const clouded = cloudy > 0.7;
    const regime = moonlit
        ? clouded
            ? "Moonlit cloud deck"
            : `Moonlit ${optics.nightCharacter} sky`
        : clouded
          ? groundGlow > 0.045
              ? "Cloud-amplified skyglow"
              : "Moonless overcast"
          : groundGlow > 0.05
            ? `Low ${optics.nightCharacter} skyglow`
            : `${optics.nightCharacter[0].toUpperCase()}${optics.nightCharacter.slice(1)} moonless sky`;

    return {
        palette: mixPalette(source, target, darkness),
        darkness,
        moonlight,
        regime: darkness > 0.04 ? regime : "Solar atmosphere",
        blackout,
    };
};

const gradePalette = (
    source: SkyPalette,
    family: SkyFamily,
    hueJitter: number,
    chromaJitter: number,
    lightnessJitter: number,
) => {
    const result = {} as SkyPalette;
    const hueShift = ((family.grade.hueShift + hueJitter) * Math.PI) / 180;
    const chromaScale = family.grade.chroma * chromaJitter;

    PALETTE_KEYS.forEach((key) => {
        const color = toOklab(source[key]);
        const chroma = Math.hypot(color.a, color.b);
        const hue = Math.atan2(color.b, color.a) + hueShift;
        const gradedChroma = chroma * chromaScale;
        const contrastedLightness =
            0.62 + (color.l - 0.62) * family.intensity.contrast;
        result[key] = fromOklab({
            l: clamp(
                contrastedLightness +
                    family.grade.lightness +
                    lightnessJitter,
                0.025,
                0.985,
            ),
            a: gradedChroma * Math.cos(hue),
            b: gradedChroma * Math.sin(hue),
        });
    });

    return result;
};

// Palette families describe plausible air masses, not global color filters.
// These reference domes keep the high sky inside measured daylight/twilight
// families while the source palette still supplies the day's local character.
const CLEAR_DAY_REFERENCE: SkyPalette = {
    top: "#236cbb",
    upper: "#4b91ce",
    middle: "#7db5da",
    horizon: "#b6cdd7",
    low: "#d3d8d4",
    left: "#689fca",
    right: "#83b2d2",
    glow: "#f4e4c8",
    haze: "#c3cdd0",
    cloud: "#edf1ef",
    cloudWarm: "#ddd9d1",
};

const MOIST_DAY_REFERENCE: SkyPalette = {
    top: "#548ba7",
    upper: "#76a6b8",
    middle: "#9bbbc1",
    horizon: "#bec9c7",
    low: "#d4d2c9",
    left: "#86adb9",
    right: "#91b3bd",
    glow: "#e9dfca",
    haze: "#c4c7c1",
    cloud: "#e6e8e4",
    cloudWarm: "#d8d5ce",
};

const OVERCAST_DAY_REFERENCE: SkyPalette = {
    top: "#536775",
    upper: "#71818b",
    middle: "#919da2",
    horizon: "#adb4b2",
    low: "#bdbdb8",
    left: "#778994",
    right: "#87969c",
    glow: "#d1cec5",
    haze: "#adb2af",
    cloud: "#c9cdca",
    cloudWarm: "#c1bfba",
};

const DEEP_TWILIGHT_REFERENCE: SkyPalette = {
    top: "#07142c",
    upper: "#102d53",
    middle: "#315276",
    horizon: "#60768f",
    low: "#817f91",
    left: "#365b80",
    right: "#596987",
    glow: "#d38c70",
    haze: "#827f94",
    cloud: "#899cac",
    cloudWarm: "#9a9da3",
};

const CIVIL_TWILIGHT_REFERENCE: SkyPalette = {
    top: "#376fa7",
    upper: "#6595bd",
    middle: "#96b1c7",
    horizon: "#c4beb6",
    low: "#d4bea8",
    left: "#759bb9",
    right: "#a09cab",
    glow: "#f3be8d",
    haze: "#bca1ae",
    cloud: "#d5d9d8",
    cloudWarm: "#d8c6ba",
};

const FAMILY_SOLAR_CONSTRAINT: Record<
    string,
    { daylight: number; twilight: number }
> = {
    "crystal-azure": { daylight: 0.22, twilight: 0.22 },
    "marine-pearl": { daylight: 0.52, twilight: 0.42 },
    "lavender-alpenglow": { daylight: 0.54, twilight: 0.62 },
    "desert-apricot": { daylight: 0.3, twilight: 0.24 },
    "storm-slate": { daylight: 0.62, twilight: 0.55 },
    "smoky-copper": { daylight: 0.58, twilight: 0.38 },
    "humid-aqua": { daylight: 0.74, twilight: 0.52 },
    "winter-ice": { daylight: 0.34, twilight: 0.3 },
    "rose-afterglow": { daylight: 0.7, twilight: 0.58 },
    "violet-nocturne": { daylight: 0.76, twilight: 0.56 },
    "sage-haze": { daylight: 0.76, twilight: 0.58 },
    "cobalt-gold": { daylight: 0.28, twilight: 0.42 },
    "post-storm-cerulean": { daylight: 0.34, twilight: 0.34 },
    "coastal-silver": { daylight: 0.68, twilight: 0.58 },
    "saharan-veil": { daylight: 0.64, twilight: 0.48 },
    "volcanic-amethyst": { daylight: 0.64, twilight: 0.52 },
    "urban-amber-inversion": { daylight: 0.78, twilight: 0.66 },
    "monsoon-pewter": { daylight: 0.8, twilight: 0.72 },
};

const capColorChroma = (source: string, maximum: number) => {
    const color = toOklab(source);
    const chroma = Math.hypot(color.a, color.b);
    if (chroma <= maximum) return source;
    const scale = maximum / chroma;
    return fromOklab({
        l: color.l,
        a: color.a * scale,
        b: color.b * scale,
    });
};

const constrainSolarPalette = ({
    source,
    family,
    atmosphere,
    composition,
    solarAltitude,
    randomValues,
}: {
    source: SkyPalette;
    family: SkyFamily;
    atmosphere: SkyAtmosphere;
    composition: ResolvedAtmosphericComposition;
    solarAltitude: number;
    randomValues: number[];
}) => {
    const styleVeil = {
        crystal: 0,
        cirrus: 0.08,
        haze: 0.24,
        mist: 0.34,
        soft: 0.42,
    }[atmosphere];
    const moistureVeil = clamp(
        composition.humidity * 0.58 +
            composition.aerosol * 0.26 +
            styleVeil,
        0,
        1,
    );
    const overcast = clamp(
        (family.optics.nightCharacter === "overcast" ? 0.7 : 0) +
            (atmosphere === "soft" ? 0.18 : 0) +
            (atmosphere === "mist" ? 0.08 : 0),
    );
    const moistDay = mixPalette(
        CLEAR_DAY_REFERENCE,
        MOIST_DAY_REFERENCE,
        moistureVeil,
    );
    const dayReference = mixPalette(
        moistDay,
        OVERCAST_DAY_REFERENCE,
        overcast,
    );
    const twilightProgress = smoothstep((solarAltitude + 12) / 18);
    let twilightReference = mixPalette(
        DEEP_TWILIGHT_REFERENCE,
        CIVIL_TWILIGHT_REFERENCE,
        twilightProgress,
    );

    // Aerosol reddening belongs to the solar lobe. Humidity broadens and
    // whitens it; clean air preserves the narrower pink antisolar arch.
    const solarWarmth = clamp(
        0.28 +
            composition.aerosol * 0.52 +
            composition.aerosolAbsorption * 0.16 -
            composition.humidity * 0.16,
        0.18,
        0.76,
    );
    twilightReference = {
        ...twilightReference,
        glow: mixColor("#f1c3a0", "#ef8958", solarWarmth),
        haze: mixColor(
            "#b5a9b7",
            "#c98291",
            (1 - composition.humidity) * 0.56,
        ),
    };

    const daylight = smoothstep((solarAltitude + 1.5) / 14);
    const twilight =
        (1 - daylight) *
        smoothstep((solarAltitude + 14) / 8) *
        (1 - smoothstep((solarAltitude - 7) / 9));
    const constraint =
        FAMILY_SOLAR_CONSTRAINT[family.id] ??
        ({ daylight: 0.42, twilight: 0.36 } as const);
    const physicalReference = mixPalette(
        twilightReference,
        dayReference,
        daylight,
    );
    const roleWeight: Record<keyof SkyPalette, number> = {
        top: daylight > 0.5 ? 1 : 0.8,
        upper: daylight > 0.5 ? 0.94 : 0.74,
        middle: daylight > 0.5 ? 0.84 : 0.66,
        horizon: daylight > 0.5 ? 0.62 : 0.68,
        low: daylight > 0.5 ? 0.54 : 0.65,
        left: 0.7,
        right: 0.7,
        glow: daylight > 0.5 ? 0.44 : 0.68,
        haze: daylight > 0.5 ? 0.76 : 0.66,
        cloud: 0.64,
        cloudWarm: 0.64,
    };
    const chromaLimit: Record<keyof SkyPalette, number> = {
        top: 0.145,
        upper: 0.12,
        middle: 0.095,
        horizon: daylight > 0.5 ? 0.06 : 0.105,
        low: daylight > 0.5 ? 0.055 : 0.12,
        left: 0.1,
        right: 0.1,
        glow: daylight > 0.5 ? 0.085 : 0.14,
        haze: daylight > 0.5 ? 0.055 : 0.095,
        cloud: 0.04,
        cloudWarm: 0.045,
    };
    const solarPresence = smoothstep((solarAltitude + 15) / 6);
    const dailyVariation = 0.94 + (randomValues[23] - 0.5) * 0.12;
    // Clean twilight is predominantly blue away from the solar and antisolar
    // lobes. Enforce that neutral dome here; the shader adds warm scattering
    // only where Sun geometry supports it. This prevents a palette's artistic
    // warmth from becoming an implausible 360° magenta horizon.
    const cleanTwilightConstraint =
        twilight * (1 - moistureVeil) * (1 - overcast) * 0.34;
    const result = {} as SkyPalette;

    PALETTE_KEYS.forEach((key) => {
        const amount =
            solarPresence *
            roleWeight[key] *
            (daylight * constraint.daylight +
                twilight * constraint.twilight +
                cleanTwilightConstraint) *
            dailyVariation;
        const physicallyMixed = mixColor(
            source[key],
            physicalReference[key],
            clamp(amount, 0, 0.86),
        );
        const veilDesaturation = 1 - moistureVeil * (daylight * 0.22 + 0.08);
        result[key] = capColorChroma(
            physicallyMixed,
            chromaLimit[key] * veilDesaturation,
        );
    });

    return result;
};

const hashString = (value: string) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const seededRandom = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const localDateKey = (date: Date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");

const getCoordinates = (date: Date, timezone: string): [number, number] => {
    const known = TIMEZONE_COORDINATES[timezone];
    if (known) return known;

    // A graceful astronomical fallback for uncommon zones. The longitude
    // follows the browser's UTC offset while the temperate latitude preserves
    // believable day lengths without asking for location permission.
    return [35, -date.getTimezoneOffset() / 4];
};

const getSeason = (date: Date, latitude: number): SkySeason => {
    const northernMonth =
        (date.getMonth() + (latitude < 0 ? 6 : 0)) % 12;
    if (northernMonth === 11 || northernMonth <= 1) return "winter";
    if (northernMonth <= 4) return "spring";
    if (northernMonth <= 7) return "summer";
    return "autumn";
};

const getRegion = (timezone: string, latitude: number): SkyRegion => {
    const known = TIMEZONE_REGIONS[timezone];
    if (known) return known;
    const absoluteLatitude = Math.abs(latitude);
    if (absoluteLatitude < 24) return "tropical";
    if (absoluteLatitude > 58) return "polar";
    return "continental";
};

const weightedFamily = (
    randomValue: number,
    season: SkySeason,
    region: SkyRegion,
) => {
    const weights = SKY_FAMILIES.map(
        (family) =>
            family.seasonWeights[season] *
            (family.regionWeights[region] ?? 1),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = randomValue * total;

    for (let index = 0; index < SKY_FAMILIES.length; index += 1) {
        cursor -= weights[index];
        if (cursor <= 0) return SKY_FAMILIES[index];
    }

    return SKY_FAMILIES[SKY_FAMILIES.length - 1];
};

const chooseDailyPalettes = (
    date: Date,
    timezone: string,
    latitude: number,
    preview?: SkyPreviewOptions,
): {
    palettes: Record<SkyPhase, SkyPalette>;
    family: SkyFamily;
    randomValues: number[];
} => {
    const random = seededRandom(hashString(`${localDateKey(date)}:${timezone}`));
    const selectedFamily = preview?.familyId
        ? SKY_FAMILIES.find((candidate) => candidate.id === preview.familyId)
        : undefined;
    const baseFamily =
        selectedFamily ??
        weightedFamily(
            random(),
            preview?.season ?? getSeason(date, latitude),
            preview?.region ?? getRegion(timezone, latitude),
        );
    const family: SkyFamily = preview?.intensity
        ? {
              ...baseFamily,
              intensity: {
                  ...baseFamily.intensity,
                  ...preview.intensity,
              },
          }
        : baseFamily;
    const palettes = {} as Record<SkyPhase, SkyPalette>;
    const variantShift =
        preview?.variantShift ?? (Math.floor(random() * 3) - 1);
    const hueJitter =
        preview?.hueJitter ??
        (random() * 2 - 1) * family.grade.hueJitter;
    const chromaJitter =
        preview?.chromaJitter ??
        1 + (random() * 2 - 1) * family.grade.chromaJitter;
    const lightnessJitter =
        preview?.lightnessJitter ??
        (random() * 2 - 1) * family.grade.lightnessJitter;
    const flipEdges = preview?.flipEdges ?? random() > 0.5;

    PHASE_ORDER.forEach((phase) => {
        const choices = SKY_PALETTES[phase];
        const familyIndex = family.phaseIndices[phase];
        const index = familyIndex % choices.length;
        const graded = gradePalette(
            choices[index],
            family,
            hueJitter + variantShift * 1.15,
            chromaJitter * (1 + variantShift * 0.035),
            lightnessJitter + variantShift * 0.006,
        );
        palettes[phase] = flipEdges
            ? { ...graded, left: graded.right, right: graded.left }
            : graded;
    });

    return {
        palettes,
        family,
        randomValues: Array.from({ length: 32 }, () => random()),
    };
};

const chooseBloomStyle = (value: number): SkyBloomStyle => {
    // Quiet and diffuse scattering are deliberately most common. More
    // recognizable halos and split lobes remain occasional natural events.
    if (value < 0.3) return "quiet";
    if (value < 0.56) return "diffuse";
    if (value < 0.74) return "horizonBand";
    if (value < 0.86) return "sideVeil";
    if (value < 0.95) return "splitScatter";
    return "softHalo";
};

const getBloomGeometry = (
    style: SkyBloomStyle,
    randomValues: number[],
    sunX: number,
    sunY: number,
    scale: number,
) => {
    const y = clamp(46 + (sunY - 64) * 0.55, 34, 72);
    const side = sunX < 50 ? -1 : 1;
    const geometry = (() => {
        switch (style) {
            case "horizonBand":
                return {
                    width: 68 + randomValues[19] * 24,
                    height: 13 + randomValues[20] * 10,
                    secondaryX: 50 + side * (6 + randomValues[21] * 9),
                    secondaryY: y + 8,
                    secondaryWidth: 72 + randomValues[22] * 24,
                    secondaryHeight: 8 + randomValues[23] * 10,
                    secondaryStrength: 24 + randomValues[24] * 22,
                };
            case "sideVeil":
                return {
                    width: 34 + randomValues[19] * 20,
                    height: 56 + randomValues[20] * 29,
                    secondaryX: side < 0 ? -3 + randomValues[21] * 8 : 103 - randomValues[21] * 8,
                    secondaryY: 49 + randomValues[22] * 21,
                    secondaryWidth: 31 + randomValues[23] * 24,
                    secondaryHeight: 62 + randomValues[24] * 31,
                    secondaryStrength: 28 + randomValues[25] * 24,
                };
            case "splitScatter":
                return {
                    width: 22 + randomValues[19] * 18,
                    height: 27 + randomValues[20] * 23,
                    secondaryX: clamp(sunX - side * (17 + randomValues[21] * 16), 3, 97),
                    secondaryY: y + (randomValues[22] * 16 - 8),
                    secondaryWidth: 22 + randomValues[23] * 22,
                    secondaryHeight: 25 + randomValues[24] * 28,
                    secondaryStrength: 38 + randomValues[25] * 28,
                };
            case "softHalo":
                return {
                    width: 15 + randomValues[19] * 12,
                    height: 18 + randomValues[20] * 18,
                    secondaryX: clamp(sunX + side * (5 + randomValues[21] * 8), 2, 98),
                    secondaryY: y + (randomValues[22] * 8 - 4),
                    secondaryWidth: 31 + randomValues[23] * 17,
                    secondaryHeight: 29 + randomValues[24] * 25,
                    secondaryStrength: 18 + randomValues[25] * 24,
                };
            case "quiet":
                return {
                    width: 54 + randomValues[19] * 30,
                    height: 35 + randomValues[20] * 31,
                    secondaryX: 50 + (randomValues[21] * 18 - 9),
                    secondaryY: y + 8 + randomValues[22] * 11,
                    secondaryWidth: 62 + randomValues[23] * 26,
                    secondaryHeight: 18 + randomValues[24] * 21,
                    secondaryStrength: 12 + randomValues[25] * 15,
                };
            default:
                return {
                    width: 42 + randomValues[19] * 25,
                    height: 39 + randomValues[20] * 31,
                    secondaryX: clamp(sunX - side * (9 + randomValues[21] * 13), 0, 100),
                    secondaryY: y + (randomValues[22] * 18 - 4),
                    secondaryWidth: 45 + randomValues[23] * 29,
                    secondaryHeight: 29 + randomValues[24] * 34,
                    secondaryStrength: 21 + randomValues[25] * 26,
                };
        }
    })();

    return {
        x: style === "sideVeil" ? clamp(sunX + side * 8, 0, 100) : sunX,
        y,
        width: geometry.width * scale,
        height: geometry.height * scale,
        secondaryX: geometry.secondaryX,
        secondaryY: geometry.secondaryY,
        secondaryWidth: geometry.secondaryWidth * scale,
        secondaryHeight: geometry.secondaryHeight * scale,
        secondaryStrength: geometry.secondaryStrength,
        tilt: (randomValues[26] * 2 - 1) * (style === "horizonBand" ? 1.5 : 5.5),
    };
};

const timestamp = (date: Date | undefined, fallback: number) => {
    const value = date?.getTime();
    return Number.isFinite(value) ? (value as number) : fallback;
};

const between = (from: number, to: number, amount: number) =>
    from + (to - from) * amount;

const buildKeyframes = (
    date: Date,
    latitude: number,
    longitude: number,
    palettes: Record<SkyPhase, SkyPalette>,
    previousNight: SkyPalette,
): Keyframe[] => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const times = SunCalc.getTimes(date, latitude, longitude);
    const fallback = (hour: number) => start.getTime() + hour * 60 * 60 * 1000;
    const nauticalDawn = timestamp(times.nauticalDawn, fallback(5));
    const dawn = timestamp(times.dawn, fallback(5.75));
    const sunrise = timestamp(times.sunrise, fallback(6.2));
    const solarNoon = timestamp(times.solarNoon, fallback(12));
    const goldenHour = timestamp(times.goldenHour, fallback(17));
    const sunset = timestamp(times.sunset, fallback(18.75));
    const dusk = timestamp(times.dusk, fallback(19.35));
    const night = timestamp(times.night, fallback(20.4));

    return [
        // Carry yesterday's nocturne through midnight, then let it hand off
        // gradually to today's family before dawn. Tomorrow starts from this
        // day's night palette, so the date boundary can never flash or snap.
        { at: start.getTime(), palette: previousNight },
        {
            at: nauticalDawn,
            palette: palettes.blueHourMorning,
        },
        {
            at: between(nauticalDawn, dawn, 0.58),
            palette: palettes.preDawn,
        },
        { at: dawn, palette: palettes.beltOfVenus },
        { at: sunrise, palette: palettes.sunrise },
        {
            at: timestamp(times.goldenHourEnd, fallback(7.5)),
            palette: palettes.morning,
        },
        { at: solarNoon, palette: palettes.solarNoon },
        {
            at: between(solarNoon, goldenHour, 0.58),
            palette: palettes.day,
        },
        {
            at: goldenHour,
            palette: palettes.golden,
        },
        {
            at: timestamp(times.sunsetStart, fallback(18.5)),
            palette: palettes.sunset,
        },
        {
            at: sunset + 12 * 60 * 1000,
            palette: palettes.afterglow,
        },
        { at: dusk, palette: palettes.dusk },
        {
            at: between(dusk, night, 0.54),
            palette: palettes.blueHourEvening,
        },
        { at: night, palette: palettes.night },
        { at: end.getTime(), palette: palettes.night },
    ].sort((a, b) => a.at - b.at);
};

const interpolateKeyframes = (keyframes: Keyframe[], time: number) => {
    const nextIndex = keyframes.findIndex((keyframe) => keyframe.at >= time);
    if (nextIndex <= 0) return keyframes[0].palette;

    const from = keyframes[nextIndex - 1];
    const to = keyframes[nextIndex];
    const progress = smoothstep((time - from.at) / (to.at - from.at));
    return mixPalette(from.palette, to.palette, progress);
};

const calculateSky = (date: Date, preview?: SkyPreviewOptions): SkyVisual => {
    const timezone =
        preview?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "local";
    const [defaultLatitude, defaultLongitude] = getCoordinates(date, timezone);
    const latitude = preview?.latitude ?? defaultLatitude;
    const longitude = preview?.longitude ?? defaultLongitude;
    const daily = chooseDailyPalettes(date, timezone, latitude, preview);
    const previousDate = new Date(date);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDaily = chooseDailyPalettes(
        previousDate,
        timezone,
        latitude,
        preview,
    );
    const rawPalette = preview?.phase
        ? daily.palettes[preview.phase]
        : interpolateKeyframes(
              buildKeyframes(
                  date,
                  latitude,
                  longitude,
                  daily.palettes,
                  previousDaily.palettes.night,
              ),
              date.getTime(),
          );
    const sun = SunCalc.getPosition(date, latitude, longitude);
    const altitude = sun.altitude * (180 / Math.PI);
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const moonAltitude = moon.altitude * (180 / Math.PI);
    const moonIllumination = SunCalc.getMoonIllumination(date);
    const daylight = clamp((altitude + 8) / 11);
    const visualSolarAltitude = preview?.phase
        ? PHASE_SOLAR_ALTITUDE[preview.phase]
        : altitude;
    const visualDaylight = clamp((visualSolarAltitude + 8) / 11);
    const atmosphereStyle =
        preview?.atmosphereStyle ??
        daily.family.atmospheres[
            Math.floor(
                daily.randomValues[4] * daily.family.atmospheres.length,
            )
        ];
    const textureStrength = 0.72 + daily.randomValues[0] * 0.55;
    const textureByStyle = {
        crystal: { high: 0.03, low: 0.014, mist: 0.025 },
        haze: { high: 0.03, low: 0.018, mist: 0.2 },
        cirrus: { high: 0.16, low: 0.018, mist: 0.035 },
        mist: { high: 0.025, low: 0.13, mist: 0.14 },
        soft: { high: 0.12, low: 0.095, mist: 0.045 },
    }[atmosphereStyle];
    const motionStyles: SkyVisual["motionStyle"][] = [
        "drift",
        "bloom",
        "tide",
        "crosswind",
        "thermal",
    ];
    const motionStyle =
        preview?.motionStyle ??
        motionStyles[Math.floor(daily.randomValues[6] * motionStyles.length)];
    const useSun = visualDaylight > 0.05 || moonAltitude < -5;
    const celestial = useSun ? sun : moon;
    const celestialAltitude = useSun ? altitude : moonAltitude;
    const edgeOpacityByAtmosphere: Record<SkyAtmosphere, [number, number]> = {
        crystal: [0.44, 0.54],
        haze: [0.2, 0.29],
        cirrus: [0.31, 0.42],
        mist: [0.25, 0.35],
        soft: [0.23, 0.33],
    };
    const [edgeLow, edgeHigh] = edgeOpacityByAtmosphere[atmosphereStyle];
    const intensity = daily.family.intensity;
    const cloudDensity = preview?.cloudDensity ?? 1;
    const composition = resolveAtmosphericComposition({
        family: daily.family,
        atmosphere: atmosphereStyle,
        randomValues: daily.randomValues,
        override: preview?.composition,
        aerosolTypeOverride: preview?.aerosolType,
    });
    const solarPalette = constrainSolarPalette({
        source: rawPalette,
        family: daily.family,
        atmosphere: atmosphereStyle,
        composition,
        solarAltitude: visualSolarAltitude,
        randomValues: daily.randomValues,
    });
    const physicalAtmosphere = applyPhysicalAtmosphere({
        source: solarPalette,
        family: daily.family,
        atmosphere: atmosphereStyle,
        composition,
        solarAltitude: visualSolarAltitude,
        moonAltitude,
        moonFraction: moonIllumination.fraction,
        cloudDensity,
        randomValues: daily.randomValues,
        nightExposureOverride: preview?.nightExposure,
    });
    const palette = physicalAtmosphere.palette;
    const twilightEdgeEnvelope =
        0.68 +
        0.32 *
            (1 -
                smoothstep(
                    Math.abs(visualSolarAltitude + 1.5) / 14,
                ));
    const motionSpeed = preview?.motionSpeed ?? 1;
    const motionAmount = preview?.motionAmount ?? 1;
    const horizontalFov = clamp(preview?.horizontalFov ?? 241.2, 2, 300);
    const cameraProjection = preview?.viewAzimuth !== undefined;
    const viewElevation = clamp(preview?.viewElevation ?? 24, -10, 90);
    const verticalFov = clamp(preview?.verticalFov ?? 48, 2, 160);
    const sunCompassAzimuth =
        ((sun.azimuth * 180) / Math.PI + 540) % 360;
    const relativeSunAzimuth = preview?.viewAzimuth === undefined
        ? undefined
        : ((sunCompassAzimuth - preview.viewAzimuth + 540) % 360) - 180;
    const projectedSunX = relativeSunAzimuth === undefined
        ? 50 + Math.sin(sun.azimuth) * 47
        : 50 + (relativeSunAzimuth / horizontalFov) * 100;
    const sunX = clamp(projectedSunX, 2, 98);
    const projectedSunY = cameraProjection
        ? 50 - ((visualSolarAltitude - viewElevation) / verticalFov) * 100
        : 78 - Math.sin((visualSolarAltitude * Math.PI) / 180) * 69;
    const sunY = clamp(projectedSunY, 8, 84);
    const horizonGlow = clamp((18 - Math.abs(visualSolarAltitude)) / 18);
    const bloomStyle =
        preview?.bloomStyle ?? chooseBloomStyle(daily.randomValues[17]);
    const bloomScale =
        (preview?.bloomScale ?? 1) * (0.78 + daily.randomValues[18] * 0.54);
    const bloomGeometry = getBloomGeometry(
        bloomStyle,
        daily.randomValues,
        sunX,
        sunY,
        bloomScale,
    );
    const bloomVisibility = preview?.bloomVisibility ?? 1;
    const quietMultiplier = bloomStyle === "quiet" ? 0.3 : 1;
    const visibilitySeed = daily.randomValues[16] ** 2.55;
    const phaseVisibility =
        (0.025 + horizonGlow * 0.975) *
        (1 - physicalAtmosphere.darkness * 0.9);
    const bloomOpacity = clamp(
        (0.016 + visibilitySeed * 0.4) *
            phaseVisibility *
            intensity.glow *
            quietMultiplier *
            bloomVisibility,
        0,
        0.58,
    );
    const bloomBandOpacity = clamp(
        (0.012 + daily.randomValues[27] ** 2.3 * 0.16) *
            (0.24 + horizonGlow * 0.76) *
            intensity.haze *
            (bloomStyle === "horizonBand" ? 1.3 : 0.72) *
            bloomVisibility,
        0,
        0.28,
    );
    const bloomWarmth = 0.12 + daily.randomValues[29] * 0.5;
    const sideColor = daily.randomValues[30] > 0.5
        ? palette.left
        : palette.right;
    const atmosphericCloudiness = clamp(
        cloudDensity *
            ({ crystal: 0.08, cirrus: 0.26, haze: 0.38, mist: 0.55, soft: 0.68 }[
                atmosphereStyle
            ]),
        0,
        1,
    );
    const inferredCloudType: SkyCloudType = (() => {
        if (atmosphericCloudiness < 0.11) return "none";
        if (atmosphereStyle === "cirrus") {
            return daily.randomValues[23] > 0.72 ? "cirrocumulus" : "cirrus";
        }
        if (atmosphereStyle === "mist") {
            return daily.randomValues[23] > 0.68 ? "stratocumulus" : "stratus";
        }
        if (atmosphereStyle === "soft") {
            if (daily.randomValues[23] > 0.965 && cloudDensity > 1.25) {
                return "cumulonimbus";
            }
            return daily.randomValues[23] > 0.53 ? "cumulus" : "stratocumulus";
        }
        return atmosphereStyle === "haze" && atmosphericCloudiness > 0.52
            ? "stratus"
            : "none";
    })();
    const cloudType = preview?.cloudType ?? inferredCloudType;
    const cloudCoverage = clamp(
        preview?.cloudCoverage ?? atmosphericCloudiness * (0.68 + daily.randomValues[21] * 0.34),
    );
    const cloudOpticalDepth = clamp(
        preview?.cloudOpticalDepth ??
            atmosphericCloudiness *
                ({
                    none: 0.08,
                    cirrus: 0.28,
                    cirrocumulus: 0.42,
                    stratus: 0.66,
                    stratocumulus: 0.72,
                    cumulus: 0.78,
                    cumulonimbus: 1,
                }[cloudType]),
    );

    // Volumetric cloud state.
    //
    // A preview that names a legacy cloud type is routed through the
    // compatibility shim so every curated case in `data/sky-benchmark.json`
    // keeps resolving to the cloud it was matched against. Everything else
    // builds a full correlated multi-layer scene.
    const seasonFraction = (() => {
        const month = (date.getMonth() + (latitude < 0 ? 6 : 0)) % 12;
        // 0 at midwinter, 1 at midsummer.
        return 0.5 - 0.5 * Math.cos(((month + 0.5) / 12) * Math.PI * 2);
    })();
    const cloudSeed: [number, number, number, number] = [
        daily.randomValues[18],
        daily.randomValues[22],
        daily.randomValues[27],
        daily.randomValues[31],
    ];
    const usesLegacyCloud =
        preview?.cloudType !== undefined ||
        preview?.cloudCoverage !== undefined ||
        preview?.cloudOpticalDepth !== undefined;
    const cloudScene: CloudScene = preview?.cloudScene ??
        (usesLegacyCloud
            ? sceneFromLegacy(
                  cloudType,
                  cloudCoverage,
                  cloudOpticalDepth,
                  cloudSeed,
                  {
                      latitude,
                      season: seasonFraction,
                      humidity: composition.humidity,
                  },
              )
            : createDailyCloudScene({
                  random: daily.randomValues,
                  regime: atmosphereStyle,
                  density: cloudDensity,
                  latitude,
                  season: seasonFraction,
                  humidity: composition.humidity,
                  solarDepression: -visualSolarAltitude,
              }));

    const astronomicalScene = calculateCelestialScene({
        date,
        latitude,
        longitude,
        viewAzimuth: preview?.viewAzimuth,
        horizontalFov:
            preview?.viewAzimuth === undefined ? undefined : horizontalFov,
        viewElevation: cameraProjection ? viewElevation : undefined,
        verticalFov: cameraProjection ? verticalFov : undefined,
        physicalMoonScale: preview?.physicalMoonScale,
        haze: clamp(
            intensity.haze *
                (0.64 +
                    composition.aerosol * 0.42 +
                    composition.humidity * 0.14),
            0.42,
            1.7,
        ),
        cloudDensity,
        atmosphericVeil: atmosphericCloudiness,
        starVisibility: preview?.starVisibility,
        moonVisibility: preview?.moonVisibility,
    });
    const celestialScene: CelestialScene = preview?.phase
        ? {
              ...astronomicalScene,
              starsOpacity:
                  astronomicalScene.starsOpacity *
                  physicalAtmosphere.darkness,
          }
        : astronomicalScene;

    // Light reaching the clouds. These are the same physical quantities the
    // atmosphere pass already models, resolved once on the CPU so the cloud
    // march does not repeat the transmittance integral at every sample.
    // Kasten-Young relative optical airmass.
    //
    // The atmosphere pass uses a cheaper approximation that saturates near 1.9,
    // which is fine for the broad sky gradient but useless here: it never
    // reaches the long slant paths that redden a low Sun, so cloud lit at
    // sunset came out the same neutral grey as cloud lit at noon. The real
    // relation gives ~19 airmasses at 2 degrees elevation, and that is what
    // turns cloud bases orange.
    const sunElevationDegrees = Math.max(visualSolarAltitude, -4);
    const sunAirMass = Math.min(
        40,
        1 /
            (Math.sin((sunElevationDegrees * Math.PI) / 180) +
                0.50572 * (sunElevationDegrees + 6.07995) ** -1.6364),
    );
    const sunOpticalDepth =
        0.052 +
        composition.aerosol * (0.09 + composition.aerosolAbsorption * 0.045) +
        composition.humidity * 0.028;
    // Rayleigh optical depth scales roughly as the inverse fourth power of
    // wavelength, so a low Sun reaching cloud base is strongly reddened. This
    // is what colours sunset cloud, rather than a tint applied to the clouds.
    const sunTransmittance: [number, number, number] = [
        Math.exp(-sunOpticalDepth * sunAirMass * 0.72),
        Math.exp(-sunOpticalDepth * sunAirMass * 1.0),
        Math.exp(-sunOpticalDepth * sunAirMass * 1.62),
    ];
    // Airmass now supplies the dimming as the Sun sets, so this only needs to
    // close the source off below the horizon rather than double-count falloff.
    const sunAbove = clamp((visualSolarAltitude + 4) / 6);
    // Photon's scattering integral divides by the extinction coefficient, so
    // source radiance has to be an order of magnitude above the sky values used
    // elsewhere in this shader for a lit cloud edge to reach display white.
    // The airmass term above removes most of it again at low Sun.
    const sunStrength = 26 * sunAbove;
    const sunRadiance: [number, number, number] = [
        sunTransmittance[0] * sunStrength,
        sunTransmittance[1] * sunStrength,
        sunTransmittance[2] * sunStrength,
    ];

    // Moonlight uses the same transport path; only its magnitude differs.
    // Night visibility is handled by exposure, not by an invented blue tint.
    const moonStrength =
        celestialScene.moon.scatteringRadiance *
        0.38 *
        clamp((moonAltitude + 4) / 10);
    const moonRadiance: [number, number, number] = [
        celestialScene.moon.transmittance[0] * moonStrength,
        celestialScene.moon.transmittance[1] * moonStrength,
        celestialScene.moon.transmittance[2] * moonStrength,
    ];

    // Hemispheric skylight on cloud tops, taken from the palette's upper sky so
    // cloud ambient always agrees with the dome rendered behind it.
    const upperSky = parseSkyColor(palette.upper);
    const skyAmbientScale = 3.4 * (0.12 + sunAbove * 0.88) + moonStrength * 0.5;
    const cloudAmbient: [number, number, number] = [
        upperSky[0] * skyAmbientScale,
        upperSky[1] * skyAmbientScale,
        upperSky[2] * skyAmbientScale,
    ];

    // Ground bounce into cloud bases. Snow and desert return far more than
    // forest or ocean, which is why overcast bases differ so much by terrain.
    const groundScale =
        composition.groundAlbedo *
        1.9 *
        sunAbove *
        (1 - physicalAtmosphere.darkness * 0.8);
    const horizonColor = parseSkyColor(palette.horizon);
    const cloudGroundLight: [number, number, number] = [
        horizonColor[0] * groundScale,
        horizonColor[1] * groundScale,
        horizonColor[2] * groundScale,
    ];

    // Advection clock. Cloud fields evolve continuously across the 60-second
    // scene interval rather than resetting, so shape changes stay gradual.
    const cloudTime = date.getTime() / 1000;

    const shaderSunY = cameraProjection
        ? projectedSunY / 100
        : clamp(
              0.78 - Math.sin((visualSolarAltitude * Math.PI) / 180) * 0.69,
              0.03,
              1.12,
          );
    return {
        palette,
        radiance: {
            palette,
            sun: [projectedSunX / 100, shaderSunY],
            // Every atmospheric lunar term must use the exact same projection
            // as the textured disc. The former sine approximation could put
            // the aureole far beside the Moon at large azimuths.
            moon: [
                celestialScene.moon.x / 100,
                celestialScene.moon.y / 100,
            ],
            solarAltitude: visualSolarAltitude,
            nightDepth: physicalAtmosphere.darkness,
            nightBlackout: physicalAtmosphere.blackout,
            // Couple scattered sky radiance to the same attenuated source
            // irradiance as the visible Moon. A brilliant direct source must
            // produce a corresponding atmospheric response.
            moonlight: celestialScene.moon.scatteringRadiance,
            moonTransmittance: celestialScene.moon.transmittance,
            moonLightColor: celestialScene.moon.lightColor,
            aerosol: composition.aerosol,
            humidity: composition.humidity,
            aerosolSize: composition.aerosolSize,
            aerosolAbsorption: composition.aerosolAbsorption,
            ozone: composition.ozone,
            observerAltitude: composition.observerAltitude,
            inversion: composition.inversion,
            stratosphericAerosol: composition.stratosphericAerosol,
            groundAlbedo: composition.groundAlbedo,
            aerosolTint: composition.aerosolTint,
            horizontalFov,
            cameraProjection,
            viewElevation,
            verticalFov,
            cloudiness: atmosphericCloudiness,
            cloudScene,
            sunRadiance,
            moonRadiance,
            cloudAmbient,
            cloudGroundLight,
            // View and light march budgets. This pass is one-shot — it redraws
            // on scene change, roughly once a minute, not every frame — so it
            // can afford a high primary step count. That matters because the
            // march has no temporal history to hide undersampling behind, and
            // the per-pixel dither that prevents banding turns into visible
            // crosshatch if steps are too few. The light march stays short and
            // leans on the eight-octave approximation for interior transport.
            cloudQuality: [64, 6],
            cloudTime,
            edgeStrength: clamp(intensity.edge * 0.82, 0.45, 1.35),
            horizonStrength: clamp(intensity.haze * 0.88, 0.5, 1.45),
            airglowStrength: clamp(
                (0.18 + daily.randomValues[30] * 0.82) *
                    (1 - physicalAtmosphere.blackout * 0.96),
                0.006,
                1,
            ),
            seed: [
                daily.randomValues[18],
                daily.randomValues[22],
                daily.randomValues[27],
                daily.randomValues[31],
            ],
        },
        familyId: daily.family.id,
        atmosphereStyle,
        motionStyle,
        celestial: celestialScene,
        highCloudOpacity:
            textureByStyle.high *
            textureStrength *
            (0.62 +
                visualDaylight * 0.38 +
                physicalAtmosphere.moonlight * 0.3) *
            cloudDensity,
        lowCloudOpacity:
            textureByStyle.low *
            textureStrength *
            (0.64 +
                visualDaylight * 0.36 +
                physicalAtmosphere.moonlight * 0.34) *
            cloudDensity,
        mistOpacity:
            textureByStyle.mist *
            (0.8 + daily.randomValues[5] * 0.4) *
            intensity.haze *
            cloudDensity,
        cloudOffset: daily.randomValues[1] * 700,
        cloudHeight: 8 + daily.randomValues[2] * 24,
        nightDepth: physicalAtmosphere.darkness,
        lightingRegime: physicalAtmosphere.regime,
        composition,
        motionDirection:
            daily.randomValues[7] > 0.5 ? "alternate" : "alternate-reverse",
        baseDuration: (26 + daily.randomValues[8] * 20) / motionSpeed,
        edgeDuration: (54 + daily.randomValues[9] * 48) / motionSpeed,
        horizonDuration: (64 + daily.randomValues[10] * 58) / motionSpeed,
        mistDuration: (88 + daily.randomValues[12] * 76) / motionSpeed,
        highCloudDuration:
            (118 + daily.randomValues[14] * 86) / motionSpeed,
        lowCloudDuration:
            (172 + daily.randomValues[15] * 118) / motionSpeed,
        motionX: (1.2 + daily.randomValues[9] * 2.8) * motionAmount,
        motionY:
            (0.55 + daily.randomValues[10] * 1.5) *
            (0.78 +
                clamp((18 - Math.abs(celestialAltitude)) / 18) * 0.3) *
            motionAmount,
        animationDelay: -(12 + daily.randomValues[8] * 64),
        saturationLow:
            intensity.saturation *
            0.96 *
            (1 - composition.humidity * visualDaylight * 0.08) *
            (1 - physicalAtmosphere.darkness * 0.3) *
            between(
                1,
                daily.family.optics.twilightChroma,
                clamp(1 - Math.abs(visualSolarAltitude + 4.5) / 10) *
                    (1 - physicalAtmosphere.darkness),
            ),
        edgeOpacityLow: clamp(
            edgeLow * 0.54 *
                intensity.edge *
                twilightEdgeEnvelope *
                (1 - physicalAtmosphere.darkness * 0.54),
            0.025,
            0.3,
        ),
        edgeOpacityHigh: clamp(
            edgeHigh * 0.54 *
                intensity.edge *
                twilightEdgeEnvelope *
                (1 - physicalAtmosphere.darkness * 0.48),
            0.035,
            0.34,
        ),
        airglowOpacityLow: clamp(
            (0.075 + daily.randomValues[30] * 0.055) *
                intensity.edge *
                (0.65 + physicalAtmosphere.darkness * 0.35),
            0.045,
            0.16,
        ),
        airglowOpacityHigh: clamp(
            (0.12 + daily.randomValues[30] * 0.08) *
                intensity.edge *
                (0.68 + physicalAtmosphere.darkness * 0.32),
            0.07,
            0.25,
        ),
        bloomStyle,
        bloomOpacity,
        bloomBandOpacity,
        bloomX: bloomGeometry.x,
        bloomY: bloomGeometry.y,
        bloomWidth: bloomGeometry.width,
        bloomHeight: bloomGeometry.height,
        bloomSecondaryX: bloomGeometry.secondaryX,
        bloomSecondaryY: bloomGeometry.secondaryY,
        bloomSecondaryWidth: bloomGeometry.secondaryWidth,
        bloomSecondaryHeight: bloomGeometry.secondaryHeight,
        bloomSecondaryStrength: bloomGeometry.secondaryStrength,
        bloomCoreStop: 3 + daily.randomValues[21] * 15,
        bloomMidStop: 27 + daily.randomValues[22] * 20,
        bloomFadeStop: 70 + daily.randomValues[23] * 25,
        bloomTilt: bloomGeometry.tilt,
        bloomPrimary: mixColor(palette.glow, palette.cloudWarm, bloomWarmth),
        bloomSecondary: mixColor(palette.haze, sideColor, 0.18 + daily.randomValues[31] * 0.42),
        bloomBand: mixColor(palette.horizon, palette.cloudWarm, 0.22 + bloomWarmth * 0.42),
    };
};

export function Sky({
    preview,
    paused = false,
    contained = false,
    onVisualChange,
}: SkyProps = {}) {
    const [visual, setVisual] = useState<SkyVisual | null>(null);

    useEffect(() => {
        const updateSky = () => {
            const date = preview?.date
                ? new Date(preview.date)
                : new Date();

            // Local-only art direction hook: `?sky-time=06:15` previews a
            // moment and `?sky-date=2026-07-24` previews a daily character,
            // without allowing production visitors to override nature.
            if (!preview && process.env.NODE_ENV === "development") {
                const search = new URLSearchParams(window.location.search);
                const previewDate = search.get("sky-date");
                const dateMatch = previewDate?.match(
                    /^(\d{4})-(\d{2})-(\d{2})$/,
                );
                if (dateMatch) {
                    date.setFullYear(
                        Number(dateMatch[1]),
                        Number(dateMatch[2]) - 1,
                        Number(dateMatch[3]),
                    );
                }

                const preview = search.get("sky-time");
                const match = preview?.match(/^(\d{1,2}):(\d{2})$/);
                if (match) {
                    date.setHours(
                        clamp(Number(match[1]), 0, 23),
                        clamp(Number(match[2]), 0, 59),
                        0,
                        0,
                    );
                }
            }

            const next = calculateSky(date, preview);
            setVisual(next);
            onVisualChange?.({
                palette: next.palette,
                familyId: next.familyId,
                atmosphereStyle: next.atmosphereStyle,
                motionStyle: next.motionStyle,
                bloomStyle: next.bloomStyle,
                moonPhase: next.celestial.moon.phaseName,
                moonIllumination: next.celestial.moon.fraction,
                visibleStars:
                    next.celestial.starsOpacity > 0.02
                        ? next.celestial.stars.length
                        : 0,
                lightingRegime: next.lightingRegime,
                darkness: next.nightDepth,
                nightBlackout: next.radiance.nightBlackout,
                aerosolType: next.composition.aerosolType,
                aerosol: next.composition.aerosol,
                humidity: next.composition.humidity,
                inversion: next.composition.inversion,
                stratosphericAerosol: next.composition.stratosphericAerosol,
            });
            document
                .getElementById("theme-color")
                ?.setAttribute("content", next.palette.top);
        };

        updateSky();
        if (preview) return undefined;

        const interval = window.setInterval(updateSky, 60 * 1000);
        return () => window.clearInterval(interval);
    }, [onVisualChange, preview]);

    const palette = visual?.palette;
    const customProperties = {
        "--sky-top": palette?.top,
        "--sky-upper": palette?.upper,
        "--sky-middle": palette?.middle,
        "--sky-horizon": palette?.horizon,
        "--sky-low": palette?.low,
        "--sky-edge-left": palette?.left,
        "--sky-edge-right": palette?.right,
        "--sky-glow": palette?.glow,
        "--sky-haze": palette?.haze,
        "--sky-cloud": palette?.cloud,
        "--sky-cloud-warm": palette?.cloudWarm,
        "--cloud-opacity": visual?.highCloudOpacity ?? 0.04,
        "--cloud-low-opacity": visual?.lowCloudOpacity ?? 0.02,
        "--mist-opacity": visual?.mistOpacity ?? 0.03,
        "--cloud-offset": `${visual?.cloudOffset ?? 0}px`,
        "--cloud-low-offset": `${(visual?.cloudOffset ?? 0) * -0.6}px`,
        "--cloud-height": `${visual?.cloudHeight ?? 18}%`,
        "--bloom-opacity": visual?.bloomOpacity ?? 0.04,
        "--bloom-band-opacity": visual?.bloomBandOpacity ?? 0.025,
        "--bloom-x": `${visual?.bloomX ?? 50}%`,
        "--bloom-y": `${visual?.bloomY ?? 58}%`,
        "--bloom-width": `${visual?.bloomWidth ?? 48}%`,
        "--bloom-height": `${visual?.bloomHeight ?? 44}%`,
        "--bloom-secondary-x": `${visual?.bloomSecondaryX ?? 43}%`,
        "--bloom-secondary-y": `${visual?.bloomSecondaryY ?? 63}%`,
        "--bloom-secondary-width": `${visual?.bloomSecondaryWidth ?? 54}%`,
        "--bloom-secondary-height": `${visual?.bloomSecondaryHeight ?? 38}%`,
        "--bloom-secondary-strength": `${visual?.bloomSecondaryStrength ?? 32}%`,
        "--bloom-core-stop": `${visual?.bloomCoreStop ?? 10}%`,
        "--bloom-mid-stop": `${visual?.bloomMidStop ?? 38}%`,
        "--bloom-fade-stop": `${visual?.bloomFadeStop ?? 82}%`,
        "--bloom-tilt": `${visual?.bloomTilt ?? 0}deg`,
        "--bloom-primary": visual?.bloomPrimary ?? palette?.glow,
        "--bloom-secondary": visual?.bloomSecondary ?? palette?.haze,
        "--bloom-band": visual?.bloomBand ?? palette?.horizon,
        "--night-depth": visual?.nightDepth ?? 0,
        "--night-vignette": 0.05 + (visual?.nightDepth ?? 0) * 0.12,
        "--motion-direction": visual?.motionDirection ?? "alternate",
        "--base-duration": `${visual?.baseDuration ?? 34}s`,
        "--edge-duration": `${visual?.edgeDuration ?? 74}s`,
        "--horizon-duration": `${visual?.horizonDuration ?? 92}s`,
        "--mist-duration": `${visual?.mistDuration ?? 124}s`,
        "--cloud-high-duration": `${visual?.highCloudDuration ?? 150}s`,
        "--cloud-low-duration": `${visual?.lowCloudDuration ?? 210}s`,
        "--motion-x": `${visual?.motionX ?? 2.2}vmax`,
        "--motion-y": `${visual?.motionY ?? 1.1}vmax`,
        "--animation-delay": `${visual?.animationDelay ?? -24}s`,
        "--palette-saturation-low": visual?.saturationLow ?? 1.04,
        "--edge-opacity-low": visual?.edgeOpacityLow ?? 0.31,
        "--edge-opacity-high": visual?.edgeOpacityHigh ?? 0.41,
        "--airglow-opacity-low": visual?.airglowOpacityLow ?? 0.13,
        "--airglow-opacity-high": visual?.airglowOpacityHigh ?? 0.22,
    } as CSSProperties & Record<`--${string}`, string | number | undefined>;

    return (
        <div
            id="sky"
            className={`${styles.background} ${contained ? styles.contained : ""} ${styles[visual?.atmosphereStyle ?? "crystal"]} ${styles[`motion${(visual?.motionStyle ?? "drift").replace(/^./, (letter) => letter.toUpperCase())}`]} ${paused ? styles.paused : ""}`}
            style={customProperties}
            data-sky-family={visual?.familyId ?? "loading"}
            data-bloom-style={visual?.bloomStyle ?? "loading"}
            aria-hidden="true"
        >
            <div className={styles.base} />
            {visual && <AtmosphereCanvas scene={visual.radiance} />}
            <div className={styles.edgeColor} />
            <div className={styles.horizon} />
            {visual && <CelestialCanvas scene={visual.celestial} paused={paused} />}
            {/* The blurred CSS cloud layers are retired: cloud is now solved
                volumetrically in the atmosphere pass, in the same scene-linear
                space as the sky and celestial radiance. Keeping them would
                overlay flat gradient ellipses on top of lit cloud geometry. */}
            <div className={styles.atmosphere} />
            <div className={styles.grain} />
        </div>
    );
}

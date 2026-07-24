"use client";

import { CSSProperties, useEffect, useState } from "react";
import SunCalc from "suncalc";

import styles from "./sky.module.css";
import {
    PHASE_ORDER,
    SKY_PALETTES,
    SkyPalette,
    SkyPhase,
} from "./sky-palettes";

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

interface SkyVisual {
    palette: SkyPalette;
    atmosphereStyle: "crystal" | "haze" | "cirrus" | "mist" | "soft";
    motionStyle: "drift" | "bloom" | "tide" | "crosswind" | "thermal";
    sunX: number;
    sunY: number;
    sunOpacity: number;
    celestialSize: number;
    starsOpacity: number;
    highCloudOpacity: number;
    lowCloudOpacity: number;
    mistOpacity: number;
    cloudOffset: number;
    cloudHeight: number;
    horizonGlow: number;
    nightDepth: number;
    starRotation: number;
    motionDirection: "alternate" | "alternate-reverse";
    baseDuration: number;
    edgeDuration: number;
    horizonDuration: number;
    celestialDuration: number;
    mistDuration: number;
    starDuration: number;
    highCloudDuration: number;
    lowCloudDuration: number;
    motionX: number;
    motionY: number;
    animationDelay: number;
}

interface Keyframe {
    at: number;
    palette: SkyPalette;
}

const clamp = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

const smoothstep = (value: number) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
};

const hexToRgb = (hex: string) => {
    const value = hex.replace("#", "");
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
};

const mixColor = (from: string, to: string, amount: number) => {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    const mix = (start: number, end: number) =>
        Math.round(start + (end - start) * amount);

    return `rgb(${mix(a.r, b.r)}, ${mix(a.g, b.g)}, ${mix(a.b, b.b)})`;
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

const chooseDailyPalettes = (
    date: Date,
    timezone: string,
): {
    palettes: Record<SkyPhase, SkyPalette>;
    randomValues: number[];
} => {
    const random = seededRandom(hashString(`${localDateKey(date)}:${timezone}`));
    const palettes = {} as Record<SkyPhase, SkyPalette>;

    PHASE_ORDER.forEach((phase) => {
        const choices = SKY_PALETTES[phase];
        palettes[phase] = choices[Math.floor(random() * choices.length)];
    });

    return {
        palettes,
        randomValues: Array.from({ length: 16 }, () => random()),
    };
};

const timestamp = (date: Date | undefined, fallback: number) => {
    const value = date?.getTime();
    return Number.isFinite(value) ? value as number : fallback;
};

const buildKeyframes = (
    date: Date,
    latitude: number,
    longitude: number,
    palettes: Record<SkyPhase, SkyPalette>,
): Keyframe[] => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const times = SunCalc.getTimes(date, latitude, longitude);
    const fallback = (hour: number) => start.getTime() + hour * 60 * 60 * 1000;

    return [
        { at: start.getTime(), palette: palettes.night },
        {
            at: timestamp(times.nauticalDawn, fallback(5)),
            palette: palettes.preDawn,
        },
        { at: timestamp(times.dawn, fallback(6)), palette: palettes.sunrise },
        {
            at: timestamp(times.goldenHourEnd, fallback(7.5)),
            palette: palettes.morning,
        },
        { at: timestamp(times.solarNoon, fallback(12)), palette: palettes.day },
        {
            at: timestamp(times.goldenHour, fallback(17)),
            palette: palettes.golden,
        },
        {
            at: timestamp(times.sunsetStart, fallback(18.5)),
            palette: palettes.sunset,
        },
        { at: timestamp(times.dusk, fallback(19.5)), palette: palettes.dusk },
        { at: timestamp(times.night, fallback(21)), palette: palettes.night },
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

const calculateSky = (date: Date): SkyVisual => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    const [latitude, longitude] = getCoordinates(date, timezone);
    const daily = chooseDailyPalettes(date, timezone);
    const palette = interpolateKeyframes(
        buildKeyframes(date, latitude, longitude, daily.palettes),
        date.getTime(),
    );
    const sun = SunCalc.getPosition(date, latitude, longitude);
    const altitude = sun.altitude * (180 / Math.PI);
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const moonIllumination = SunCalc.getMoonIllumination(date);
    const moonAltitude = moon.altitude * (180 / Math.PI);
    const daylight = clamp((altitude + 8) / 11);
    const nearHorizon = 1 - clamp(Math.abs(altitude) / 24);
    const atmosphereStyles: SkyVisual["atmosphereStyle"][] = [
        "crystal",
        "haze",
        "cirrus",
        "mist",
        "soft",
    ];
    const atmosphereStyle =
        atmosphereStyles[
            Math.floor(daily.randomValues[4] * atmosphereStyles.length)
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
        motionStyles[Math.floor(daily.randomValues[6] * motionStyles.length)];
    const useSun = daylight > 0.05 || moonAltitude < -5;
    const celestial = useSun ? sun : moon;
    const celestialAltitude = useSun ? altitude : moonAltitude;
    const moonVisibility =
        clamp((moonAltitude + 5) / 14) *
        (0.35 + moonIllumination.fraction * 0.65);
    const celestialOpacity = useSun
        ? daylight * (0.12 + nearHorizon * 0.5)
        : (1 - daylight) * moonVisibility * 0.15;

    return {
        palette,
        atmosphereStyle,
        motionStyle,
        sunX: clamp(50 + Math.sin(celestial.azimuth) * 47, 2, 98),
        sunY: clamp(78 - Math.sin(celestial.altitude) * 69, 8, 84),
        sunOpacity: celestialOpacity,
        celestialSize: useSun
            ? 17 + nearHorizon * 5
            : 9 + moonIllumination.fraction * 6,
        starsOpacity: clamp((-altitude - 7) / 14) * 0.34,
        highCloudOpacity:
            textureByStyle.high * textureStrength * (0.76 + daylight * 0.24),
        lowCloudOpacity:
            textureByStyle.low * textureStrength * (0.76 + daylight * 0.24),
        mistOpacity:
            textureByStyle.mist * (0.8 + daily.randomValues[5] * 0.4),
        cloudOffset: daily.randomValues[1] * 700,
        cloudHeight: 8 + daily.randomValues[2] * 24,
        horizonGlow: clamp((18 - Math.abs(altitude)) / 18),
        nightDepth: 1 - daylight,
        starRotation: daily.randomValues[3] * 18 - 9,
        motionDirection:
            daily.randomValues[7] > 0.5 ? "alternate" : "alternate-reverse",
        baseDuration: 26 + daily.randomValues[8] * 20,
        edgeDuration: 54 + daily.randomValues[9] * 48,
        horizonDuration: 64 + daily.randomValues[10] * 58,
        celestialDuration: 10 + daily.randomValues[11] * 9,
        mistDuration: 88 + daily.randomValues[12] * 76,
        starDuration: 180 + daily.randomValues[13] * 160,
        highCloudDuration: 118 + daily.randomValues[14] * 86,
        lowCloudDuration: 172 + daily.randomValues[15] * 118,
        motionX: 1.2 + daily.randomValues[9] * 2.8,
        motionY:
            (0.55 + daily.randomValues[10] * 1.5) *
            (0.78 + clamp((18 - Math.abs(celestialAltitude)) / 18) * 0.3),
        animationDelay: -(12 + daily.randomValues[8] * 64),
    };
};

export function Sky() {
    const [visual, setVisual] = useState<SkyVisual | null>(null);

    useEffect(() => {
        const updateSky = () => {
            const date = new Date();

            // Local-only art direction hook: `?sky-time=06:15` previews a
            // moment and `?sky-date=2026-07-24` previews a daily character,
            // without allowing production visitors to override nature.
            if (process.env.NODE_ENV === "development") {
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

            const next = calculateSky(date);
            setVisual(next);
            document
                .getElementById("theme-color")
                ?.setAttribute("content", next.palette.top);
        };

        updateSky();
        const interval = window.setInterval(updateSky, 60 * 1000);
        return () => window.clearInterval(interval);
    }, []);

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
        "--sun-x": `${visual?.sunX ?? 50}%`,
        "--sun-y": `${visual?.sunY ?? 74}%`,
        "--sun-opacity": visual?.sunOpacity ?? 0,
        "--celestial-size": `${visual?.celestialSize ?? 18}vmax`,
        "--stars-opacity": visual?.starsOpacity ?? 0,
        "--cloud-opacity": visual?.highCloudOpacity ?? 0.04,
        "--cloud-low-opacity": visual?.lowCloudOpacity ?? 0.02,
        "--mist-opacity": visual?.mistOpacity ?? 0.03,
        "--cloud-offset": `${visual?.cloudOffset ?? 0}px`,
        "--cloud-low-offset": `${(visual?.cloudOffset ?? 0) * -0.6}px`,
        "--cloud-height": `${visual?.cloudHeight ?? 18}%`,
        "--horizon-glow": visual?.horizonGlow ?? 0.4,
        "--horizon-opacity": 0.5 + (visual?.horizonGlow ?? 0.4) * 0.42,
        "--night-depth": visual?.nightDepth ?? 0,
        "--night-vignette": 0.05 + (visual?.nightDepth ?? 0) * 0.12,
        "--star-rotation": `${visual?.starRotation ?? 0}deg`,
        "--motion-direction": visual?.motionDirection ?? "alternate",
        "--base-duration": `${visual?.baseDuration ?? 34}s`,
        "--edge-duration": `${visual?.edgeDuration ?? 74}s`,
        "--horizon-duration": `${visual?.horizonDuration ?? 92}s`,
        "--celestial-duration": `${visual?.celestialDuration ?? 14}s`,
        "--mist-duration": `${visual?.mistDuration ?? 124}s`,
        "--star-duration": `${visual?.starDuration ?? 240}s`,
        "--cloud-high-duration": `${visual?.highCloudDuration ?? 150}s`,
        "--cloud-low-duration": `${visual?.lowCloudDuration ?? 210}s`,
        "--motion-x": `${visual?.motionX ?? 2.2}vmax`,
        "--motion-y": `${visual?.motionY ?? 1.1}vmax`,
        "--animation-delay": `${visual?.animationDelay ?? -24}s`,
    } as CSSProperties & Record<`--${string}`, string | number | undefined>;

    return (
        <div
            id="sky"
            className={`${styles.background} ${styles[visual?.atmosphereStyle ?? "crystal"]} ${styles[`motion${(visual?.motionStyle ?? "drift").replace(/^./, (letter) => letter.toUpperCase())}`]}`}
            style={customProperties}
            aria-hidden="true"
        >
            <div className={styles.base} />
            <div className={styles.edgeColor} />
            <div className={styles.horizon} />
            <div className={styles.stars}>
                <div className={styles.starFieldFar} />
                <div className={styles.starFieldNear} />
            </div>
            <div className={styles.sun} />
            <div className={`${styles.clouds} ${styles.cloudsHigh}`} />
            <div className={`${styles.clouds} ${styles.cloudsLow}`} />
            <div className={styles.mistLayer} />
            <div className={styles.atmosphere} />
            <div className={styles.grain} />
        </div>
    );
}

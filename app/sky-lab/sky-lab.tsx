"use client";

import {
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
    SkyAtmosphere,
    SkyPhase,
    SkyRegion,
    SkySeason,
} from "@/components/backgrounds/sky/sky-palettes";

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
    cloudDensity: number;
    motionSpeed: number;
    motionAmount: number;
    bloomVisibility: number;
    bloomScale: number;
    starVisibility: number;
    moonVisibility: number;
    paused: boolean;
}

const localDate = (date: Date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-");

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
    cloudDensity: 1,
    motionSpeed: 1,
    motionAmount: 1,
    bloomVisibility: 1,
    bloomScale: 1,
    starVisibility: 1,
    moonVisibility: 1,
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
        "cloudDensity",
        "motionSpeed",
        "motionAmount",
        "bloomVisibility",
        "bloomScale",
        "starVisibility",
        "moonVisibility",
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
    ["manualGrade", "manualIntensity", "paused"].forEach((key) => {
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

    next.hue = limit(next.hue, -12, 12);
    next.chroma = limit(next.chroma, 0.7, 1.3);
    next.lightness = limit(next.lightness, -0.08, 0.08);
    next.contrast = limit(next.contrast, 0.78, 1.28);
    next.saturation = limit(next.saturation, 0.7, 1.35);
    next.edge = limit(next.edge, 0.5, 1.5);
    next.glow = limit(next.glow, 0.55, 1.5);
    next.haze = limit(next.haze, 0.45, 1.65);
    next.cloudDensity = limit(next.cloudDensity, 0, 2);
    next.motionSpeed = limit(next.motionSpeed, 0.25, 3);
    next.motionAmount = limit(next.motionAmount, 0, 2);
    next.bloomVisibility = limit(next.bloomVisibility, 0, 2);
    next.bloomScale = limit(next.bloomScale, 0.5, 1.8);
    next.starVisibility = limit(next.starVisibility, 0, 2);
    next.moonVisibility = limit(next.moonVisibility, 0, 2);

    return next;
};

interface SelectFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}

function SelectField({ label, value, onChange, children }: SelectFieldProps) {
    return (
        <label className={styles.field}>
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {children}
            </select>
        </label>
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

export function SkyLab() {
    const [settings, setSettings] = useState<LabSettings>(DEFAULT_SETTINGS);
    const [snapshot, setSnapshot] = useState<SkySnapshot | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [copied, setCopied] = useState(false);

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

    const previewDate = useMemo(
        () => wallTimeToDate(settings.date, settings.time, settings.timezone),
        [settings.date, settings.time, settings.timezone],
    );

    const preview = useMemo<SkyPreviewOptions>(
        () => ({
            date: previewDate,
            timezone: settings.timezone,
            familyId: settings.family === "auto" ? undefined : settings.family,
            phase: settings.phase === "natural" ? undefined : settings.phase,
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
            cloudDensity: settings.cloudDensity,
            motionSpeed: settings.motionSpeed,
            motionAmount: settings.motionAmount,
            bloomStyle: settings.bloom === "auto" ? undefined : settings.bloom,
            bloomVisibility: settings.bloomVisibility,
            bloomScale: settings.bloomScale,
            starVisibility: settings.starVisibility,
            moonVisibility: settings.moonVisibility,
        }),
        [previewDate, settings],
    );

    const receiveSnapshot = useCallback((next: SkySnapshot) => {
        setSnapshot(next);
    }, []);

    const reset = () => setSettings(currentDefaults());

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
            cloudDensity: randomStepped(0.34, 1.8, 0.02),
            motionSpeed: randomStepped(0.45, 2.25, 0.05),
            motionAmount: randomStepped(0.44, 1.76, 0.02),
            bloomVisibility: randomStepped(0.18, 1.7, 0.02),
            bloomScale: randomStepped(0.5, 1.8, 0.02),
            starVisibility: randomStepped(0.65, 1.45, 0.05),
            moonVisibility: randomStepped(0.65, 1.45, 0.05),
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

    return (
        <main className={styles.lab}>
            <Sky
                preview={preview}
                paused={settings.paused}
                onVisualChange={receiveSnapshot}
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
                    <span>{snapshot?.moonPhase ?? "Resolving lunar state"}</span>
                    <span>{Math.round((snapshot?.moonIllumination ?? 0) * 100)}% illuminated</span>
                    <span>{snapshot?.visibleStars ?? 0} visible catalogue stars</span>
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
                    <legend>Texture and motion</legend>
                    <SelectField label="Solar bloom composition" value={settings.bloom} onChange={(value) => update("bloom", value as LabSettings["bloom"])}>
                        <option value="auto">Daily seeded</option>
                        {SKY_BLOOM_STYLES.map((bloom) => <option key={bloom} value={bloom}>{titleCase(bloom)}</option>)}
                    </SelectField>
                    <Slider label="Bloom visibility" value={settings.bloomVisibility} min={0} max={2} step={0.02} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("bloomVisibility", value)} />
                    <Slider label="Bloom scale" value={settings.bloomScale} min={0.5} max={1.8} step={0.02} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("bloomScale", value)} />
                    <Slider label="Star visibility" value={settings.starVisibility} min={0} max={2} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("starVisibility", value)} />
                    <Slider label="Moon visibility" value={settings.moonVisibility} min={0} max={2} step={0.05} format={(value) => `${value.toFixed(2)}×`} onChange={(value) => update("moonVisibility", value)} />
                    <Slider label="Cloud / mist density" value={settings.cloudDensity} min={0} max={2} step={0.02} onChange={(value) => update("cloudDensity", value)} />
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

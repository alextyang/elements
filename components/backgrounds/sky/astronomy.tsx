import SunCalc from "suncalc";

import { HIPPARCOS_STARS } from "./star-catalog";
import { CAMERA_REFERENCE_HEADING_DEGREES } from "./camera-contract";
import {
    createLunarPhysicalEphemeris,
    createNightSkyCoordinateFrame,
    precessEquatorialJ2000,
    type LunarPhysicalEphemeris,
    type NightSkyCoordinateFrame,
} from "./celestial-ephemeris";
import {
    createLunarDiscRadianceContract,
    createLunarDiskPhotometricCalibration,
    createPhysicalSunDiscAtmosphereState,
    createPhysicalSunDiscState,
    createStellarRenderSample,
    DEFAULT_AIRGLOW_STATE,
    solarAngularRadiusRadians,
    solarDistanceAstronomicalUnits,
    type AirglowEmissionState,
    type ArtificialGroundLightSource,
    type GalacticRadianceState,
    type IntegratedStarlightState,
    type LunarDiscRadianceContract,
    type LunarDiskPhotometricCalibration,
    type PhysicalSunDiscAtmosphereState,
    type ZodiacalLightState,
} from "./celestial-physics";
import {
    atmosphereObserverTransmittanceToSpace,
    createPhysicalAtmosphereState,
    type AtmosphereVec3,
    type PhysicalAtmosphereState,
} from "./physical-atmosphere";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

/** Current mean total solar irradiance at 1 AU (NASA TSIS/SORCE). */
export const SOLAR_TOA_IRRADIANCE_W_M2 = 1361;

/**
 * Broadband full-Moon irradiance at the top of the atmosphere, expressed as
 * a fraction of the solar irradiance. The renderer keeps this ratio separate
 * from photographic adaptation: exposure may make a moonlit night legible,
 * but it must never make the Moon a second Sun inside radiative transport.
 */
export const FULL_MOON_TO_SOLAR_IRRADIANCE_RATIO = 2.4e-6;

const smoothstep = (value: number) => {
    const bounded = clamp(value);
    return bounded * bounded * (3 - 2 * bounded);
};

/** Kasten-Young 1989 relative optical air mass. */
export const opticalAirMass = (apparentAltitudeDegrees: number) => {
    if (apparentAltitudeDegrees <= -5) return 40;
    const altitude = Math.max(-4.9, apparentAltitudeDegrees);
    const sine = Math.sin(altitude * DEG);
    return clamp(
        1 /
            (sine +
                0.50572 * (altitude + 6.07995) ** -1.6364),
        1,
        40,
    );
};

/** Bennett's compact visible-light refraction approximation. */
export const apparentAltitude = (geometricAltitudeDegrees: number) => {
    if (geometricAltitudeDegrees <= -1) return geometricAltitudeDegrees;
    const safeAltitude = Math.max(-0.95, geometricAltitudeDegrees);
    const refractionArcMinutes =
        1.02 /
        Math.tan(
            (safeAltitude + 10.3 / (safeAltitude + 5.11)) * DEG,
        );
    return safeAltitude + clamp(refractionArcMinutes / 60, 0, 0.65);
};

export interface AtmosphericTransmissionInput {
    apparentAltitudeDegrees: number;
    /** Dry aerosol optical depth at 550 nm. */
    aerosolOpticalDepth550: number;
    /** Angstrom exponent: small smoke/sulfate is high, coarse dust/sea salt low. */
    angstromExponent: number;
    observerAltitudeKm?: number;
    ozoneScale?: number;
}

/**
 * Observer-path direct-beam transmittance for CPU visibility and exposure.
 * This is diagnostic/display state only; atmosphere transport receives the
 * unattenuated source and applies the same physical path on the GPU.
 */
export const directAtmosphericTransmittance = ({
    apparentAltitudeDegrees,
    aerosolOpticalDepth550,
    angstromExponent,
    observerAltitudeKm = 0,
    ozoneScale = 1,
}: AtmosphericTransmissionInput): [number, number, number] => {
    const airmass = opticalAirMass(apparentAltitudeDegrees);
    const rayleighAltitudeScale = Math.exp(-Math.max(0, observerAltitudeKm) / 8);
    const aerosolAltitudeScale = Math.exp(-Math.max(0, observerAltitudeKm) / 1.45);
    const wavelengths = [0.68, 0.55, 0.44] as const;
    const rayleighDepth = [0.0464, 0.1085, 0.2648] as const;
    const ozoneDepth = [0.003, 0.0105, 0.002] as const;
    return wavelengths.map((wavelength, index) => {
        const aerosolDepth =
            Math.max(0, aerosolOpticalDepth550) *
            (wavelength / 0.55) ** -clamp(angstromExponent, 0, 2.5) *
            aerosolAltitudeScale;
        const opticalDepth =
            rayleighDepth[index] * rayleighAltitudeScale +
            aerosolDepth +
            ozoneDepth[index] * clamp(ozoneScale, 0.4, 1.8);
        return Math.exp(-airmass * opticalDepth);
    }) as [number, number, number];
};

export interface SkyAdaptationInput {
    solarAltitudeDegrees: number;
    apparentLunarIrradiance?: number;
    artificialGlow?: number;
    cloudAmplification?: number;
}

export interface SkyAdaptationState {
    /** Hemispheric adaptation luminance in cd/m^2, before display tonemapping. */
    luminanceCdM2: number;
    /** Relative camera/eye exposure used by emissive celestial consumers. */
    exposureGain: number;
    /** Common scene-linear exposure multiplier after all radiative transport. */
    radiometricExposure: number;
    /** 0 photopic, 1 deeply scotopic, with a broad mesopic transition. */
    scotopicWeight: number;
}

const interpolateLogLuminance = (solarAltitudeDegrees: number) => {
    const knots: ReadonlyArray<readonly [number, number]> = [
        [-24, 0.00016],
        [-18, 0.0002],
        [-12, 0.012],
        [-6, 1.2],
        [0, 150],
        [10, 2_200],
        [45, 5_500],
        [90, 6_500],
    ];
    if (solarAltitudeDegrees <= knots[0][0]) return knots[0][1];
    if (solarAltitudeDegrees >= knots.at(-1)![0]) return knots.at(-1)![1];
    const upperIndex = knots.findIndex(([altitude]) => altitude >= solarAltitudeDegrees);
    const lower = knots[upperIndex - 1];
    const upper = knots[upperIndex];
    const progress =
        (solarAltitudeDegrees - lower[0]) / (upper[0] - lower[0]);
    return 10 **
        (Math.log10(lower[1]) +
            (Math.log10(upper[1]) - Math.log10(lower[1])) * progress);
};

/**
 * CIE-style adaptation state spanning photopic, mesopic and scotopic viewing.
 * It is intentionally smooth rather than an auto-exposure feedback loop, so
 * deterministic daily skies cannot pump when the Moon crosses cloud edges.
 */
export const calculateSkyAdaptation = ({
    solarAltitudeDegrees,
    apparentLunarIrradiance = 0,
    artificialGlow = 0,
    cloudAmplification = 0,
}: SkyAdaptationInput): SkyAdaptationState => {
    const solarSky = interpolateLogLuminance(solarAltitudeDegrees);
    const moonlitSky = Math.max(0, apparentLunarIrradiance) * 0.0032;
    const skyglow =
        Math.max(0, artificialGlow) *
        0.055 *
        (1 + clamp(cloudAmplification, 0, 1.5) * 1.35);
    const luminanceCdM2 = clamp(
        solarSky + moonlitSky + skyglow,
        0.00012,
        8_000,
    );
    const logLuminance = Math.log10(luminanceCdM2);
    const scotopicWeight = smoothstep((-1.1 - logLuminance) / 2.7);
    // A perceptual exposure domain, not a physical source multiplier. This
    // covers roughly six stops from daylight to a dark-adapted natural night.
    const exposureGain = clamp(
        (0.18 / Math.max(0.0012, luminanceCdM2)) ** 0.38,
        0.035,
        6.5,
    );
    // The physical atmosphere's normalized solar E=3.2 domain requires 3.25x
    // at the accepted 5,500 cd/m^2 daylight reference before its photographic
    // shoulder. Adaptation is relative to that calibration, never applied to
    // either TOA source independently.
    const radiometricExposure = clamp(
        3.25 *
            (5_500 / Math.max(0.00012, luminanceCdM2)) ** 0.58,
        2.7,
        82_000,
    );
    return {
        luminanceCdM2,
        exposureGain,
        radiometricExposure,
        scotopicWeight,
    };
};

/**
 * Disk-integrated lunar irradiance relative to the full Moon. The illuminated
 * fraction is not a brightness control: a quarter Moon is only about a tenth
 * as bright as a full Moon because the lunar regolith is strongly
 * back-scattering. This is the Krisciunas-Schaefer phase law, with a restrained
 * ROLO-inspired opposition enhancement inside seven degrees.
 */
export const lunarRelativeIrradiance = (fraction: number) => {
    const phaseAngle = Math.acos(clamp(fraction * 2 - 1, -1, 1)) / DEG;
    return createLunarDiskPhotometricCalibration(phaseAngle * DEG)
        .relativeIrradiance;
};

/** Phase- and distance-corrected lunar TOA irradiance, full Moon = 1. */
export const lunarTopOfAtmosphereIrradiance = (
    fraction: number,
    distanceKm = 384_400,
) => {
    const distanceScale = clamp(384_400 / Math.max(340_000, distanceKm), 0.88, 1.14);
    return lunarRelativeIrradiance(fraction) * distanceScale ** 2;
};

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

const normalizeRadians = (value: number) => {
    let normalized = value % TAU;
    if (normalized > Math.PI) normalized -= TAU;
    if (normalized < -Math.PI) normalized += TAU;
    return normalized;
};

const mixRgb = (
    from: [number, number, number],
    to: [number, number, number],
    amount: number,
) => {
    const mixed = from.map((channel, index) =>
        Math.round(channel + (to[index] - channel) * amount),
    );
    return `rgb(${mixed.join(", ")})`;
};

const STELLAR_COLOR_STOPS: Array<{
    bv: number;
    color: [number, number, number];
}> = [
    { bv: -0.32, color: [160, 195, 255] },
    { bv: 0, color: [205, 222, 255] },
    { bv: 0.3, color: [241, 245, 255] },
    { bv: 0.65, color: [255, 246, 229] },
    { bv: 1, color: [255, 222, 187] },
    { bv: 1.6, color: [255, 181, 126] },
    { bv: 2.25, color: [255, 151, 91] },
];

const colorForBv = (
    bv: number,
    horizonWarmth: number,
    apparentMagnitude: number,
) => {
    const safeBv = Number.isFinite(bv) ? bv : 0.65;
    const upperIndex = STELLAR_COLOR_STOPS.findIndex(
        (stop) => stop.bv >= safeBv,
    );
    const boundedUpperIndex =
        upperIndex < 0 ? STELLAR_COLOR_STOPS.length - 1 : upperIndex;
    const upper = STELLAR_COLOR_STOPS[boundedUpperIndex];
    const lower = STELLAR_COLOR_STOPS[Math.max(0, boundedUpperIndex - 1)];
    const progress = clamp(
        (safeBv - lower.bv) / Math.max(0.001, upper.bv - lower.bv),
    );
    const planckian = lower.color.map((channel, index) =>
        Math.round(channel + (upper.color[index] - channel) * progress),
    ) as [number, number, number];
    // Scotopic vision greatly weakens the colour of threshold stars. Only the
    // bright catalogue stars retain an obvious Planckian tint.
    const colorVisibility = clamp(
        (3.8 - apparentMagnitude) / 4.4,
        0.08,
        0.78,
    );
    const restrained = planckian.map((channel) =>
        Math.round(255 + (channel - 255) * colorVisibility),
    ) as [number, number, number];
    return mixRgb(
        restrained,
        [255, 202, 165],
        horizonWarmth * (0.05 + colorVisibility * 0.12),
    );
};

const projectHorizontal = (
    azimuth: number,
    altitude: number,
    viewAzimuth?: number,
    horizontalFov = 360,
    viewElevation?: number,
    verticalFov = 180,
) => {
    const relativeAzimuth = viewAzimuth === undefined
        ? normalizeRadians(azimuth)
        // SunCalc azimuth is south-zero; converting the public compass
        // heading to that frame subtracts the explicit 180° GPU reference.
        : normalizeRadians(
            azimuth - (viewAzimuth - CAMERA_REFERENCE_HEADING_DEGREES) * DEG,
        );
    return {
        x: 50 + (relativeAzimuth / (horizontalFov * DEG)) * 100,
        y: viewElevation === undefined
            ? 80 - (altitude / (Math.PI / 2)) * 72
            : 50 - ((altitude / DEG - viewElevation) / verticalFov) * 100,
    };
};

const directionForHorizontal = (
    azimuth: number,
    altitude: number,
    viewAzimuth?: number,
): [number, number, number] => {
    const relativeAzimuth = viewAzimuth === undefined
        ? normalizeRadians(azimuth)
        : normalizeRadians(
            azimuth - (viewAzimuth - CAMERA_REFERENCE_HEADING_DEGREES) * DEG,
        );
    const horizontal = Math.cos(altitude);
    return [
        Math.sin(relativeAzimuth) * horizontal,
        Math.sin(altitude),
        Math.cos(relativeAzimuth) * horizontal,
    ];
};

const horizontalPosition = (
    rightAscension: number,
    declination: number,
    localSiderealTime: number,
    latitude: number,
) => {
    const hourAngle = normalizeRadians(localSiderealTime - rightAscension);
    const altitude = Math.asin(
        Math.sin(latitude) * Math.sin(declination) +
            Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
    );
    const azimuth = Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(latitude) -
            Math.tan(declination) * Math.cos(latitude),
    );
    return { altitude, azimuth };
};

const localSiderealTime = (date: Date, longitude: number) => {
    const julianDate = date.getTime() / 86_400_000 + 2_440_587.5;
    const centuries = (julianDate - 2_451_545) / 36_525;
    const greenwich =
        280.46061837 +
        360.98564736629 * (julianDate - 2_451_545) +
        0.000387933 * centuries ** 2 -
        centuries ** 3 / 38_710_000;
    return normalizeDegrees(greenwich + longitude) * DEG;
};

const phaseName = (phase: number) => {
    if (phase < 0.03 || phase >= 0.97) return "New moon";
    if (phase < 0.22) return "Waxing crescent";
    if (phase < 0.28) return "First quarter";
    if (phase < 0.47) return "Waxing gibbous";
    if (phase < 0.53) return "Full moon";
    if (phase < 0.72) return "Waning gibbous";
    if (phase < 0.78) return "Last quarter";
    return "Waning crescent";
};

const nasaMoonFrameUrl = (date: Date) => {
    const year = date.getUTCFullYear();
    if (year !== 2026) return undefined;

    const firstHour = Date.UTC(year, 0, 1);
    const frame = Math.floor((date.getTime() - firstHour) / 3_600_000) + 1;
    if (frame < 1 || frame > 8_760) return undefined;

    // Version the proxy URL with the source resolution so old immutable CDN
    // entries from the former 216 px frames can never be reused.
    return `/api/moon/${frame}?source=730`;
};

export interface ProjectedStar {
    id: number;
    x: number;
    y: number;
    /** Unit direction in the renderer's east/up/view coordinate frame. */
    direction: [number, number, number];
    radius: number;
    opacity: number;
    /** Direct irradiance relative to the Sun after observer-path extinction. */
    radiance: number;
    /** Intrinsic integrated catalogue flux at the top of the atmosphere. */
    topOfAtmosphereFluxRgb: [number, number, number];
    /** Scene-linear flux after one atmosphere transmission and scintillation. */
    observerFluxRgb: [number, number, number];
    /** RGB direct-path atmosphere transmission, independent of detection. */
    transmittanceRgb: [number, number, number];
    /** Energy-normalized angular Moffat kernel parameters. */
    psfFwhmRadians: number;
    psfBeta: number;
    psfWingFraction: number;
    psfWingScale: number;
    psfSupportRadiusRadians: number;
    tipTiltArcseconds: [number, number];
    /** Mesopic detection confidence after sky, horizon, and glare extinction. */
    detection: number;
    /** Fraction of energy assigned to the wide atmospheric/optical PSF. */
    glow: number;
    /** Normalized atmospheric seeing path used to broaden the PSF. */
    seeing: number;
    color: string;
    bright: boolean;
    scintillation: number;
    chromaticScintillation: number;
    phaseOffset: number;
}

export interface MoonScene {
    visible: boolean;
    x: number;
    y: number;
    /** Unit direction in the renderer's east/up/view coordinate frame. */
    direction: [number, number, number];
    opacity: number;
    haloOpacity: number;
    earthshineOpacity: number;
    scale: number;
    physicalScale: boolean;
    horizontalFov: number;
    rotation: number;
    textureRotation: number;
    /** Full physical orientation/libration contract for LROC/LOLA registration. */
    ephemeris: LunarPhysicalEphemeris;
    diskPhotometry: LunarDiskPhotometricCalibration;
    /** One phase/distance target shared by NASA and analytic profile paths. */
    radianceContract: LunarDiscRadianceContract;
    atmosphericWarmth: number;
    /** Observer-path RGB transmittance. Never fold this back into a TOA source. */
    transmittance: [number, number, number];
    /** Phase/distance-corrected source irradiance before atmospheric transport. */
    topOfAtmosphereIrradiance: number;
    /** Calibrated disk-integrated source energy in scene-linear RGB. */
    topOfAtmosphereIrradianceRgb: [number, number, number];
    /** Irradiance reaching the observer after direct-beam atmospheric extinction. */
    groundIrradiance: number;
    groundIrradianceRgb: [number, number, number];
    /** @deprecated Use groundIrradiance; retained for display consumers. */
    irradiance: number;
    scatteringRadiance: number;
    altitude: number;
    psfSigma: number;
    psfWing: number;
    psfStretch: number;
    dispersion: number;
    /** @deprecated Always one. The shared final exposure owns display adaptation. */
    discRadianceScale: number;
    /** @deprecated Legacy local display multiplier. */
    exposure: number;
    photoUrl?: string;
    fraction: number;
    phase: number;
    phaseName: string;
    lightColor: string;
    shadowColor: string;
}

export interface SunScene extends PhysicalSunDiscAtmosphereState {
    visible: boolean;
    apparentAltitudeDegrees: number;
}

export interface NaturalNightScene {
    coordinateFrame: NightSkyCoordinateFrame;
    airglow: AirglowEmissionState;
    zodiacal: ZodiacalLightState;
    galactic: GalacticRadianceState;
    integratedStarlight: IntegratedStarlightState;
    /** Upward ground boundary source; never add this directly to screen color. */
    artificialGroundSource?: ArtificialGroundLightSource;
}

export interface CelestialScene {
    stars: ProjectedStar[];
    starsOpacity: number;
    stellarExposure: number;
    stellarGlow: number;
    backgroundLuminance: number;
    adaptationLuminance: number;
    /** Post-transport scene-linear multiplier, not EV. */
    adaptationExposure: number;
    scotopicWeight: number;
    perceptibleStars: number;
    limitingMagnitude: number;
    sun: SunScene;
    moon: MoonScene;
    naturalNight: NaturalNightScene;
}

interface CelestialInput {
    date: Date;
    latitude: number;
    longitude: number;
    viewAzimuth?: number;
    horizontalFov?: number;
    viewElevation?: number;
    verticalFov?: number;
    physicalMoonScale?: boolean;
    haze: number;
    cloudDensity: number;
    atmosphericVeil: number;
    /** Dry aerosol optical depth at 550 nm, shared with physical atmosphere. */
    aerosolOpticalDepth550?: number;
    aerosolAngstromExponent?: number;
    observerAltitudeKm?: number;
    ozoneScale?: number;
    /**
     * Exact optical state also bound to the physical-atmosphere LUT. When
     * omitted, a compatible fallback state is constructed from the legacy
     * scalar inputs; production should always supply the shared state.
     */
    physicalAtmosphereState?: PhysicalAtmosphereState;
    /** Mean 1-AU scene-linear solar irradiance before orbital-distance scaling. */
    solarTopOfAtmosphereIrradianceRgb?: [number, number, number];
    artificialGlow?: number;
    seeingQuality?: number;
    starVisibility?: number;
    stellarExposure?: number;
    stellarGlow?: number;
    moonVisibility?: number;
    solarAltitudeOverride?: number;
}

export const calculateCelestialScene = ({
    date,
    latitude,
    longitude,
    viewAzimuth,
    horizontalFov = 360,
    viewElevation,
    verticalFov = 180,
    physicalMoonScale = false,
    haze,
    cloudDensity,
    atmosphericVeil,
    aerosolOpticalDepth550 = 0.014 + Math.max(0, haze) * 0.038,
    aerosolAngstromExponent = 1.15,
    observerAltitudeKm = 0,
    ozoneScale = 1,
    physicalAtmosphereState,
    solarTopOfAtmosphereIrradianceRgb = [3.2, 3.2, 3.2],
    artificialGlow = 0,
    seeingQuality = 0.62,
    starVisibility = 1,
    stellarExposure = 1,
    stellarGlow = 1,
    moonVisibility = 1,
    solarAltitudeOverride,
}: CelestialInput): CelestialScene => {
    const sun = SunCalc.getPosition(date, latitude, longitude);
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const illumination = SunCalc.getMoonIllumination(date);
    const sunAltitude = solarAltitudeOverride ?? sun.altitude / DEG;
    const moonAltitude = moon.altitude / DEG;
    const sunDirection = directionForHorizontal(
        sun.azimuth,
        sunAltitude * DEG,
        viewAzimuth,
    );
    const moonDirection = directionForHorizontal(
        moon.azimuth,
        moon.altitude,
        viewAzimuth,
    );
    const toAtmosphereDirection = (
        direction: readonly [number, number, number],
    ): AtmosphereVec3 => [direction[0], direction[2], direction[1]];
    const atmosphereState = physicalAtmosphereState ??
        createPhysicalAtmosphereState({
            observerAltitudeKm,
            aerosolOpticalDepth550,
            aerosolAngstromExponent,
            ozoneColumnDobson: 300 * clamp(ozoneScale, 0.4, 1.8),
        });
    const moonTransmittance = atmosphereObserverTransmittanceToSpace(
        atmosphereState,
        toAtmosphereDirection(moonDirection),
        atmosphereState.observerAltitudeKm,
    ) as [number, number, number];
    const sunTransmittance = atmosphereObserverTransmittanceToSpace(
        atmosphereState,
        toAtmosphereDirection(sunDirection),
        atmosphereState.observerAltitudeKm,
    );
    const solarDistanceAu = solarDistanceAstronomicalUnits(date);
    const solarDistanceScale = 1 / (solarDistanceAu * solarDistanceAu);
    const solarIrradianceAtDistance = solarTopOfAtmosphereIrradianceRgb.map(
        (channel) => Math.max(0, channel) * solarDistanceScale,
    ) as [number, number, number];
    const physicalSunSource = createPhysicalSunDiscState(
        sunDirection,
        solarIrradianceAtDistance,
        solarAngularRadiusRadians(solarDistanceAu),
        undefined,
        undefined,
        solarDistanceAu,
    );
    const physicalSun = createPhysicalSunDiscAtmosphereState(
        physicalSunSource,
        sunTransmittance,
    );
    const night = smoothstep((-sunAltitude - 4.5) / 13.5);
    const moonAboveHorizon = smoothstep((moonAltitude + 1.2) / 8);
    const lunarEphemeris = createLunarPhysicalEphemeris({
        date,
        latitudeDegrees: latitude,
        longitudeDegrees: longitude,
        moonAzimuthRadians: moon.azimuth,
        moonAltitudeRadians: moon.altitude,
        sunAzimuthRadians: sun.azimuth,
        sunAltitudeRadians: sun.altitude,
        parallacticAngleRadians: moon.parallacticAngle,
        illuminatedFraction: illumination.fraction,
        moonDistanceKm: moon.distance,
    });
    const lunarDiskPhotometry = createLunarDiskPhotometricCalibration(
        lunarEphemeris.phaseAngleRadians,
        moon.distance,
    );
    const lunarToaIrradiance = lunarDiskPhotometry.relativeIrradiance;
    const photoUrl = nasaMoonFrameUrl(date);
    const fullMoonTopOfAtmosphereIrradianceRgb = solarIrradianceAtDistance.map(
        (channel, index) => channel * FULL_MOON_TO_SOLAR_IRRADIANCE_RATIO *
            ([1, 0.97, 0.91] as const)[index],
    ) as [number, number, number];
    const lunarRadianceContract = createLunarDiscRadianceContract(
        photoUrl ? "nasa-svs-phase-profile" : "analytic-hapke-profile",
        lunarEphemeris.apparentAngularRadiusRadians,
        fullMoonTopOfAtmosphereIrradianceRgb,
        lunarDiskPhotometry,
        moonTransmittance,
    );
    const meanMoonTransmittance =
        moonTransmittance[0] * 0.2126 +
        moonTransmittance[1] * 0.7152 +
        moonTransmittance[2] * 0.0722;
    const apparentLunarIrradiance =
        lunarToaIrradiance * meanMoonTransmittance * moonAboveHorizon;
    const adaptation = calculateSkyAdaptation({
        solarAltitudeDegrees: sunAltitude,
        apparentLunarIrradiance,
        artificialGlow,
        cloudAmplification: cloudDensity * atmosphericVeil,
    });
    const darkAdaptation = smoothstep(
        (-0.72 - Math.log10(adaptation.luminanceCdM2)) / 2.75,
    );
    const moonLightPenalty =
        moonAboveHorizon * apparentLunarIrradiance ** 0.36 * 1.62;
    const limitingMagnitude =
        -0.65 +
        darkAdaptation * 7.35 -
        moonLightPenalty -
        Math.max(0, haze - 0.38) * 0.64 -
        (clamp(starVisibility, 0, 2) - 1) * 0.9;
    // Keep the physical source flux independent from display exposure. This
    // lets the renderer form a stable PSF in HDR and tune visibility without
    // changing which catalogue stars exist in the scene.
    const stellarExposureGain = clamp(stellarExposure, 0, 2.5);
    const stellarGlowGain = clamp(stellarGlow, 0, 2.5);
    // Compact display-domain background term. Physical luminance remains
    // available separately on the scene for exposure-aware consumers.
    const backgroundLuminance = clamp(
        (Math.log10(adaptation.luminanceCdM2) + 4) / 7.9,
        0.0005,
        0.62,
    );
    const siderealTime = localSiderealTime(date, longitude);
    const latitudeRadians = latitude * DEG;
    const moonPoint = projectHorizontal(
        moon.azimuth,
        moon.altitude,
        viewAzimuth,
        horizontalFov,
        viewElevation,
        verticalFov,
    );
    const stars = HIPPARCOS_STARS.flatMap<ProjectedStar>((star) => {
        if (star.ra === 0 && star.dec === 0) return [];

        const apparentEquatorial = precessEquatorialJ2000(
            star.ra * DEG,
            star.dec * DEG,
            date,
        );
        const horizontal = horizontalPosition(
            apparentEquatorial.rightAscensionRadians,
            apparentEquatorial.declinationRadians,
            siderealTime,
            latitudeRadians,
        );
        const geometricAltitudeDegrees = horizontal.altitude / DEG;
        if (geometricAltitudeDegrees < -1) return [];
        const altitudeDegrees = apparentAltitude(geometricAltitudeDegrees);
        const airmass = opticalAirMass(altitudeDegrees);
        // V-band extinction relative to zenith. The same aerosol optical depth
        // feeds atmosphere transport; stars only need the extra slant path.
        const verticalOpticalDepth =
            0.1085 * Math.exp(-Math.max(0, observerAltitudeKm) / 8) +
            Math.max(0, aerosolOpticalDepth550) *
                Math.exp(-Math.max(0, observerAltitudeKm) / 1.45) +
            0.0105 * clamp(ozoneScale, 0.4, 1.8);
        const extinction =
            1.085736 * verticalOpticalDepth * Math.max(0, airmass - 1);
        const separation = Math.acos(
            clamp(
                Math.sin(horizontal.altitude) * Math.sin(moon.altitude) +
                    Math.cos(horizontal.altitude) *
                        Math.cos(moon.altitude) *
                        Math.cos(horizontal.azimuth - moon.azimuth),
                -1,
                1,
            ),
        );
        const moonGlareExtinction =
            moonAboveHorizon *
            apparentLunarIrradiance ** 0.34 *
            (Math.exp(-(separation / DEG) / 8.5) * 1.9 +
                0.34 / (1 + (separation / DEG / 22) ** 2));
        const directApparentMagnitude = star.mag + extinction;
        const apparentMagnitude = directApparentMagnitude + moonGlareExtinction;
        if (apparentMagnitude > limitingMagnitude + 0.18) return [];

        const projected = projectHorizontal(
            horizontal.azimuth,
            Math.max(0, altitudeDegrees) * DEG,
            viewAzimuth,
            horizontalFov,
            viewElevation,
            verticalFov,
        );
        const horizonFade = smoothHorizon(altitudeDegrees);
        const thresholdDistance = limitingMagnitude - apparentMagnitude;
        const thresholdProgress = clamp((thresholdDistance + 0.12) / 0.68);
        const thresholdFade =
            thresholdProgress * thresholdProgress * (3 - 2 * thresholdProgress);
        // Magnitudes are logarithmic flux measurements. A restrained power
        // compression maps their enormous range onto an emissive display while
        // preserving the hierarchy instead of keying brightness to the cutoff.
        const relativeFlux = 10 ** (-0.4 * (directApparentMagnitude + 1.46));
        const starTransmittanceRgb = directAtmosphericTransmittance({
            apparentAltitudeDegrees: altitudeDegrees,
            aerosolOpticalDepth550,
            angstromExponent: aerosolAngstromExponent,
            observerAltitudeKm,
            ozoneScale,
        });
        const seeingFwhmArcseconds = clamp(
            (0.68 + (1 - clamp(seeingQuality)) * 1.55) * airmass ** 0.6,
            0.45,
            9,
        );
        const stellarSample = createStellarRenderSample({
            visualMagnitude: star.mag,
            bv: star.bv,
            foregroundTransmittanceRgb: starTransmittanceRgb,
            timeSeconds: (date.getTime() % 86_400_000) / 1_000,
            seed: (star.id * 0.61803398875) % 1,
            relativeAirMass: airmass,
            apertureDiameterMm: 6.2,
            exposureSeconds: 1 / 60,
            observerAltitudeMetres: observerAltitudeKm * 1_000,
            seeingFwhmArcseconds,
            chromaticStrength: 0.72,
            turbulenceFrequencyHz: 0.82,
            psfBeta: 3.4,
            psfWingFraction: 0.038,
            psfWingScale: 5.4,
        });
        const detection = thresholdFade * horizonFade;
        const magnitudeBrightness = clamp(
            relativeFlux ** 0.31 * detection,
            0,
            1,
        );
        const radius = clamp(
            0.48 + relativeFlux ** 0.23 * 1.34,
            0.48,
            1.82,
        );
        const bright = star.mag < 1.6;
        const scintillationVisibility = clamp(
            (3.25 - apparentMagnitude) / 3.2,
        );
        const turbulentPath = clamp((airmass ** 1.75 - 1) / 12);
        const turbulence = 0.48 + (1 - clamp(seeingQuality)) * 0.9;
        const obscurationDamping = Math.exp(
            -Math.max(0, aerosolOpticalDepth550) * airmass * 0.72,
        );
        const scintillation = clamp(
            (0.008 + turbulentPath ** 0.72 * 0.3) *
                scintillationVisibility *
                turbulence *
                Math.exp(-Math.max(0, observerAltitudeKm) / 8) *
                obscurationDamping,
            0,
            0.31,
        );
        const chromaticScintillation =
            scintillation * turbulentPath ** 0.72 * 0.82;
        const brightSource = clamp((2.65 - apparentMagnitude) / 4.25);
        const glow = brightSource ** 2;
        const seeing = clamp(
            0.06 +
                turbulentPath ** 0.64 * 0.66 +
                (1 - clamp(seeingQuality)) * 0.22,
        );

        return [
            {
                id: star.id,
                x: projected.x,
                y: projected.y,
                direction: directionForHorizontal(
                    horizontal.azimuth,
                    altitudeDegrees * DEG,
                    viewAzimuth,
                ),
                radius,
                opacity: magnitudeBrightness,
                // Compatibility scalar. Detection is deliberately excluded;
                // it may cull a source but must never alter emitted flux.
                radiance: stellarSample.source.visualFluxRelativeToSun,
                topOfAtmosphereFluxRgb: [...stellarSample.source.topOfAtmosphereFluxRgb],
                observerFluxRgb: [...stellarSample.observerFluxRgb],
                transmittanceRgb: [...starTransmittanceRgb],
                psfFwhmRadians: stellarSample.angularPsf.fwhm,
                psfBeta: stellarSample.angularPsf.beta,
                psfWingFraction: stellarSample.angularPsf.wingFraction,
                psfWingScale: stellarSample.angularPsf.wingScale,
                psfSupportRadiusRadians:
                    stellarSample.angularSupportRadiusRadians,
                tipTiltArcseconds: [...stellarSample.turbulence.tipTiltArcseconds],
                detection,
                glow,
                seeing,
                color: colorForBv(
                    star.bv,
                    clamp((18 - altitudeDegrees) / 18),
                    apparentMagnitude,
                ),
                bright,
                scintillation,
                chromaticScintillation,
                phaseOffset: (star.id * 0.61803398875) % 1,
            },
        ];
    });

    const sunPoint = projectHorizontal(
        sun.azimuth,
        sun.altitude,
        viewAzimuth,
        horizontalFov,
        viewElevation,
        verticalFov,
    );
    let directionX = sunPoint.x - moonPoint.x;
    if (directionX > 50) directionX -= 100;
    if (directionX < -50) directionX += 100;
    const rotation =
        Math.atan2(sunPoint.y - moonPoint.y, directionX) / DEG;
    const moonHorizonFade = clamp((moonAltitude + 1.5) / 5.5);
    const darkness = clamp((-sunAltitude + 1) / 11);
    // Lunar surface brightness changes far less than its illuminated area.
    // Keeping the lit crescent locally bright avoids the common CG mistake of
    // dimming the entire Moon as its phase narrows.
    const daytimeOpacity = 0.11 + illumination.fraction * 0.14;
    const nighttimeOpacity = 0.82 + illumination.fraction * 0.13;
    const atmosphericClarity = clamp(
        1 - Math.max(0, haze - 0.72) * 0.12,
        0.58,
        1,
    );
    const lowAltitudeWarmth = clamp((16 - moonAltitude) / 16);
    const moonAirmass = opticalAirMass(moonAltitude);
    const distanceScale = clamp(384_400 / (moon.distance ?? 384_400), 0.88, 1.14);
    // Earthshine is a genuinely faint secondary exposure, not a shaded fill
    // for the geometrical lunar disc. It is most useful close to new Moon,
    // when Earth is nearly full as seen from the lunar surface, and rapidly
    // loses visual contrast as the sunlit crescent grows. The deliberately
    // narrow window also avoids the familiar but photographic/HDR-only look
    // of a plainly readable dark hemisphere beside a bright crescent.
    const earthshineWindowLinear = clamp((0.18 - illumination.fraction) / 0.145);
    const earthshineWindow =
        earthshineWindowLinear ** 2 * (3 - 2 * earthshineWindowLinear);
    const earthshineVariability =
        0.78 +
        0.14 * Math.sin(date.getTime() / 86_400_000 * 1.618 + latitude * 0.11) +
        0.08 * Math.sin(date.getTime() / 86_400_000 * 0.371 - longitude * 0.07);
    const seeingPath = clamp((moonAirmass - 1) / 7.5);
    // The unscattered lunar image keeps a narrow seeing/optical core. Aerosol
    // and thin-cloud energy belongs mostly in the additive PSF wing and sky
    // aureole; allowing it to inflate the core made ordinary humid nights look
    // like badly defocused photographs. Values are CSS-pixel sigmas and remain
    // stable across DPR and viewport sizes.
    const psfSigma = clamp(
        0.12 +
            seeingPath ** 0.68 * 0.34 +
            Math.max(0, haze - 0.78) * 0.06,
        0.12,
        0.66,
    );
    const psfWing = clamp(
        0.016 +
            seeingPath * 0.032 +
            Math.max(0, haze - 0.82) * 0.014,
        0.014,
        0.12,
    );
    const psfStretch = 1 + seeingPath * 0.09;
    // Broadband differential refraction is minute except close to the
    // horizon. Keeping it subpixel avoids a decorative RGB fringe while still
    // reproducing the slight zenith-directed chromatic softness of real
    // low-altitude lunar photographs.
    const dispersion = clamp(
        seeingPath ** 1.7 * (0.012 + lowAltitudeWarmth * 0.08),
        0,
        0.085,
    );

    const starsOpacity = clamp(
        night *
            darkAdaptation,
    );
    const perceptibleStars = stars.reduce(
        (count, star) =>
            count +
            (star.opacity * starsOpacity * stellarExposureGain > 0.018 ? 1 : 0),
        0,
    );
    const nightCoordinateFrame = createNightSkyCoordinateFrame(
        date,
        latitude,
        longitude,
        viewAzimuth,
    );
    const naturalVariability =
        0.5 + 0.5 * Math.sin(date.getTime() / 86_400_000 * 0.071 + latitude * 0.13);
    const naturalNight: NaturalNightScene = {
        coordinateFrame: nightCoordinateFrame,
        airglow: {
            ...DEFAULT_AIRGLOW_STATE,
            observerAltitudeKm,
            gravityWaveAmplitude: 0.045 + naturalVariability * 0.065,
            gravityWaveHorizontalScaleKm: 48 + naturalVariability * 96,
            gravityWaveDirection: [
                Math.cos(siderealTime * 0.37 + latitudeRadians),
                Math.sin(siderealTime * 0.37 + latitudeRadians),
            ],
            gravityWavePhase: siderealTime * 1.7,
        },
        zodiacal: {
            sunDirection,
            eclipticNorthDirection: nightCoordinateFrame.eclipticNorthDirection,
            radianceScale: 1.35e-10,
            solarSpectrumRgb: [1.06, 1, 0.91],
        },
        galactic: {
            galacticNorthDirection: nightCoordinateFrame.galacticNorthDirection,
            galacticCenterDirection: nightCoordinateFrame.galacticCenterDirection,
            radianceScale: 3.2e-10,
            calibratedMapWeight: 0,
            coolPlaneSpectrumRgb: [0.82, 0.92, 1.12],
            warmBulgeSpectrumRgb: [1.17, 1.01, 0.79],
        },
        integratedStarlight: {
            galacticNorthDirection: nightCoordinateFrame.galacticNorthDirection,
            galacticCenterDirection: nightCoordinateFrame.galacticCenterDirection,
            radianceScale: 1.05e-10,
            stellarPopulationSpectrumRgb: [0.96, 1, 1.04],
        },
        artificialGroundSource: artificialGlow > 0
            ? {
                centerGroundKm: [0, 0],
                radiusKm: 14 + clamp(artificialGlow, 0, 1) * 42,
                upwardRadianceRgb: [
                    artificialGlow * 0.055,
                    artificialGlow * 0.031,
                    artificialGlow * 0.014,
                ],
                upwardAnisotropy: 0.75,
            }
            : undefined,
    };

    return {
        stars,
        starsOpacity,
        stellarExposure: stellarExposureGain,
        stellarGlow: stellarGlowGain,
        backgroundLuminance,
        adaptationLuminance: adaptation.luminanceCdM2,
        adaptationExposure: adaptation.radiometricExposure,
        scotopicWeight: adaptation.scotopicWeight,
        perceptibleStars,
        limitingMagnitude,
        sun: {
            ...physicalSun,
            visible: sunTransmittance.some((channel) => channel > 1e-8),
            apparentAltitudeDegrees: apparentAltitude(sunAltitude),
        },
        naturalNight,
        moon: {
            visible: moonAltitude > -1.5 && moonVisibility > 0,
            x: moonPoint.x,
            y: moonPoint.y,
            direction: moonDirection,
            opacity:
                moonHorizonFade *
                (daytimeOpacity +
                    (nighttimeOpacity - daytimeOpacity) * darkness) *
                atmosphericClarity *
                clamp(moonVisibility, 0, 2),
            haloOpacity:
                clamp(
                    (0.012 + apparentLunarIrradiance ** 0.52 * 0.15) *
                        darkness *
                        moonHorizonFade *
                        (0.55 + haze * 0.16) *
                        clamp(moonVisibility, 0, 2),
                    0,
                    0.2,
                ),
            earthshineOpacity:
                earthshineWindow *
                darkness ** 1.8 *
                moonHorizonFade *
                atmosphericClarity *
                clamp(earthshineVariability, 0.62, 1) *
                adaptation.scotopicWeight ** 0.55 *
                0.0065,
            scale: distanceScale * (1 + lowAltitudeWarmth * 0.045),
            physicalScale: physicalMoonScale,
            horizontalFov,
            rotation,
            // The legacy WebGL canvas expects its historic parallactic-only
            // angle. The production compositor should consume `ephemeris`
            // directly so pole position, libration, and camera basis are not
            // collapsed into this compatibility scalar.
            textureRotation: -(moon.parallacticAngle / DEG),
            ephemeris: lunarEphemeris,
            diskPhotometry: lunarDiskPhotometry,
            radianceContract: lunarRadianceContract,
            atmosphericWarmth: lowAltitudeWarmth,
            transmittance: moonTransmittance,
            topOfAtmosphereIrradiance: lunarToaIrradiance,
            topOfAtmosphereIrradianceRgb: [
                ...lunarRadianceContract.topOfAtmosphereIrradianceRgb,
            ],
            groundIrradiance: apparentLunarIrradiance,
            groundIrradianceRgb: [
                ...lunarRadianceContract.observedDirectIrradianceRgb,
            ],
            irradiance: apparentLunarIrradiance,
            scatteringRadiance:
                apparentLunarIrradiance *
                darkness *
                clamp(moonVisibility, 0, 2),
            altitude: moonAltitude,
            psfSigma,
            psfWing,
            psfStretch,
            dispersion,
            discRadianceScale: 1,
            exposure: clamp(
                0.9 + darkness * 0.18 + adaptation.exposureGain ** 0.2 * 0.16,
                0.82,
                1.42,
            ),
            photoUrl,
            fraction: illumination.fraction,
            phase: illumination.phase,
            phaseName: phaseName(illumination.phase),
            lightColor: mixRgb(
                [246, 246, 232],
                [244, 178, 126],
                lowAltitudeWarmth * 0.62,
            ),
            shadowColor: mixRgb(
                [75, 87, 109],
                [103, 72, 65],
                lowAltitudeWarmth * 0.5,
            ),
        },
    };
};

const smoothHorizon = (altitude: number) => {
    const value = clamp((altitude + 0.75) / 8);
    return value * value * (3 - 2 * value);
};

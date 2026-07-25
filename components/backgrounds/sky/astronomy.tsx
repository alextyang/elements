import SunCalc from "suncalc";

import { HIPPARCOS_STARS } from "./star-catalog";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

/**
 * Disk-integrated lunar irradiance relative to the full Moon. The illuminated
 * fraction is not a brightness control: a quarter Moon is only about a tenth
 * as bright as a full Moon because the lunar regolith is strongly
 * back-scattering. This is the Krisciunas-Schaefer phase law, with a restrained
 * ROLO-inspired opposition enhancement inside seven degrees.
 */
export const lunarRelativeIrradiance = (fraction: number) => {
    const phaseAngle = Math.acos(clamp(fraction * 2 - 1, -1, 1)) / DEG;
    const phaseMagnitude =
        0.026 * phaseAngle + 4e-9 * phaseAngle ** 4;
    const oppositionProgress = clamp((7 - phaseAngle) / 7);
    const oppositionSurge = 1 + oppositionProgress ** 2 * 0.24;
    return clamp(
        (10 ** (-0.4 * phaseMagnitude) * oppositionSurge) / 1.24,
    );
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

const projectHorizontal = (azimuth: number, altitude: number) => ({
    x: 50 + (normalizeRadians(azimuth) / Math.PI) * 50,
    y: 80 - (altitude / (Math.PI / 2)) * 72,
});

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
    radius: number;
    opacity: number;
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
    opacity: number;
    haloOpacity: number;
    earthshineOpacity: number;
    scale: number;
    rotation: number;
    textureRotation: number;
    atmosphericWarmth: number;
    transmittance: [number, number, number];
    irradiance: number;
    scatteringRadiance: number;
    altitude: number;
    psfSigma: number;
    psfWing: number;
    psfStretch: number;
    dispersion: number;
    exposure: number;
    photoUrl?: string;
    fraction: number;
    phase: number;
    phaseName: string;
    lightColor: string;
    shadowColor: string;
}

export interface CelestialScene {
    stars: ProjectedStar[];
    starsOpacity: number;
    limitingMagnitude: number;
    moon: MoonScene;
}

interface CelestialInput {
    date: Date;
    latitude: number;
    longitude: number;
    haze: number;
    cloudDensity: number;
    atmosphericVeil: number;
    starVisibility?: number;
    moonVisibility?: number;
}

export const calculateCelestialScene = ({
    date,
    latitude,
    longitude,
    haze,
    cloudDensity,
    atmosphericVeil,
    starVisibility = 1,
    moonVisibility = 1,
}: CelestialInput): CelestialScene => {
    const sun = SunCalc.getPosition(date, latitude, longitude);
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const illumination = SunCalc.getMoonIllumination(date);
    const sunAltitude = sun.altitude / DEG;
    const moonAltitude = moon.altitude / DEG;
    const nightLinear = clamp((-sunAltitude - 3) / 15);
    const night = nightLinear * nightLinear * (3 - 2 * nightLinear);
    const moonAboveHorizon = clamp((moonAltitude + 1.5) / 8);
    const lunarIrradiance = lunarRelativeIrradiance(illumination.fraction);
    const moonLightPenalty =
        moonAboveHorizon * lunarIrradiance ** 0.38 * 1.48;
    const limitingMagnitude =
        -0.45 +
        night * 6.82 -
        moonLightPenalty -
        Math.max(0, haze - 0.48) * 0.72 -
        cloudDensity * 0.12 +
        (clamp(starVisibility, 0, 2) - 1) * 0.9;
    const siderealTime = localSiderealTime(date, longitude);
    const latitudeRadians = latitude * DEG;
    const moonPoint = projectHorizontal(moon.azimuth, moon.altitude);
    const stars = HIPPARCOS_STARS.flatMap<ProjectedStar>((star) => {
        if (star.ra === 0 && star.dec === 0) return [];

        const horizontal = horizontalPosition(
            star.ra * DEG,
            star.dec * DEG,
            siderealTime,
            latitudeRadians,
        );
        const altitudeDegrees = horizontal.altitude / DEG;
        if (altitudeDegrees < -0.75) return [];

        const airmass =
            altitudeDegrees <= 0
                ? 12
                : 1 /
                  (Math.sin(horizontal.altitude) +
                      0.50572 * (altitudeDegrees + 6.07995) ** -1.6364);
        const extinction =
            0.15 * Math.max(0, airmass - 1) * (0.78 + haze * 0.28);
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
            lunarIrradiance ** 0.34 *
            Math.exp(-(separation / DEG) / 11.5) *
            2.15;
        const apparentMagnitude =
            star.mag + extinction + moonGlareExtinction;
        if (apparentMagnitude > limitingMagnitude + 0.18) return [];

        const projected = projectHorizontal(
            horizontal.azimuth,
            Math.max(0, horizontal.altitude),
        );
        const horizonFade = smoothHorizon(altitudeDegrees);
        const thresholdDistance = limitingMagnitude - apparentMagnitude;
        const thresholdProgress = clamp((thresholdDistance + 0.12) / 0.68);
        const thresholdFade =
            thresholdProgress * thresholdProgress * (3 - 2 * thresholdProgress);
        // Magnitudes are logarithmic flux measurements. A restrained power
        // compression maps their enormous range onto an emissive display while
        // preserving the hierarchy instead of keying brightness to the cutoff.
        const relativeFlux = 10 ** (-0.4 * (apparentMagnitude + 1.46));
        const magnitudeBrightness = clamp(
            relativeFlux ** 0.31 * thresholdFade,
            0.012,
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
        const turbulentPath = clamp((airmass - 1) / 5.5);
        const scintillation = clamp(
            (0.01 + turbulentPath ** 0.68 * 0.25) *
                scintillationVisibility *
                (0.82 + haze * 0.16),
            0,
            0.29,
        );
        const chromaticScintillation =
            scintillation * turbulentPath ** 0.72 * 0.82;

        return [
            {
                id: star.id,
                x: projected.x,
                y: projected.y,
                radius,
                opacity: magnitudeBrightness * horizonFade,
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

    const sunPoint = projectHorizontal(sun.azimuth, sun.altitude);
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
        1 - Math.max(0, haze - 0.72) * 0.12 - cloudDensity * 0.065,
        0.58,
        1,
    );
    const lowAltitudeWarmth = clamp((16 - moonAltitude) / 16);
    const moonAirmass =
        moonAltitude <= 0
            ? 12
            : 1 /
              (Math.sin(moon.altitude) +
                  0.50572 * (moonAltitude + 6.07995) ** -1.6364);
    const aerosolDepth = 0.012 + haze * 0.018 + cloudDensity * 0.006;
    const transmittance = [0.026, 0.047, 0.092].map((rayleighDepth) =>
        Math.exp(-moonAirmass * (rayleighDepth + aerosolDepth)),
    ) as [number, number, number];
    const distanceScale = clamp(384_400 / (moon.distance ?? 384_400), 0.92, 1.08);
    const meanTransmittance =
        transmittance[0] * 0.2126 +
        transmittance[1] * 0.7152 +
        transmittance[2] * 0.0722;
    const apparentIrradiance = clamp(
        lunarIrradiance * distanceScale ** 2 * meanTransmittance,
        0,
        1.24,
    );
    // Earthshine is a genuinely faint secondary exposure, not a shaded fill
    // for the geometrical lunar disc. It is most useful close to new Moon,
    // when Earth is nearly full as seen from the lunar surface, and rapidly
    // loses visual contrast as the sunlit crescent grows. The deliberately
    // narrow window also avoids the familiar but photographic/HDR-only look
    // of a plainly readable dark hemisphere beside a bright crescent.
    const earthshineWindowLinear = clamp(
        (0.2 - illumination.fraction) / 0.16,
    );
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
            atmosphericVeil * 0.08 +
            Math.max(0, haze - 0.78) * 0.06,
        0.12,
        0.66,
    );
    const psfWing = clamp(
        0.016 +
            seeingPath * 0.032 +
            atmosphericVeil * 0.068 +
            Math.max(0, haze - 0.82) * 0.014,
        0.014,
        0.12,
    );
    const psfStretch = 1 + seeingPath * 0.09 + atmosphericVeil * 0.018;
    // Broadband differential refraction is minute except close to the
    // horizon. Keeping it subpixel avoids a decorative RGB fringe while still
    // reproducing the slight zenith-directed chromatic softness of real
    // low-altitude lunar photographs.
    const dispersion = clamp(
        seeingPath ** 1.7 * (0.012 + lowAltitudeWarmth * 0.08),
        0,
        0.085,
    );

    return {
        stars,
        starsOpacity: clamp(
            night *
                clamp(starVisibility, 0, 2) *
                (1 - clamp(cloudDensity / 3) * 0.1),
        ),
        limitingMagnitude,
        moon: {
            visible: moonAltitude > -1.5 && moonVisibility > 0,
            x: moonPoint.x,
            y: moonPoint.y,
            opacity:
                moonHorizonFade *
                (daytimeOpacity +
                    (nighttimeOpacity - daytimeOpacity) * darkness) *
                atmosphericClarity *
                clamp(moonVisibility, 0, 2),
            haloOpacity:
                clamp(
                    (0.02 + apparentIrradiance ** 0.52 * 0.14) *
                        darkness *
                        moonHorizonFade *
                        (0.55 + haze * 0.16 + clamp(cloudDensity / 3) * 0.1) *
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
                0.02,
            scale: distanceScale * (1 + lowAltitudeWarmth * 0.045),
            rotation,
            textureRotation: -(moon.parallacticAngle / DEG),
            atmosphericWarmth: lowAltitudeWarmth,
            transmittance,
            irradiance: apparentIrradiance,
            scatteringRadiance:
                apparentIrradiance *
                darkness *
                moonHorizonFade *
                clamp(moonVisibility, 0, 2),
            altitude: moonAltitude,
            psfSigma,
            psfWing,
            psfStretch,
            dispersion,
            exposure: 1.18 + darkness * 0.48,
            photoUrl: nasaMoonFrameUrl(date),
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

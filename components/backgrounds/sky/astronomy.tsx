import SunCalc from "suncalc";

import { HIPPARCOS_STARS } from "./star-catalog";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (value: number, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

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

const colorForBv = (bv: number, horizonWarmth: number) => {
    const color: [number, number, number] =
        bv < -0.18
            ? [190, 215, 255]
            : bv < 0.05
              ? [211, 227, 255]
              : bv < 0.42
                ? [239, 243, 255]
                : bv < 0.82
                  ? [255, 246, 226]
                  : bv < 1.28
                    ? [255, 222, 188]
                    : [255, 190, 143];
    const restrained = color.map((channel) =>
        Math.round(channel + (255 - channel) * 0.24),
    ) as [number, number, number];
    return mixRgb(restrained, [255, 190, 143], horizonWarmth * 0.2);
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

export interface ProjectedStar {
    id: number;
    x: number;
    y: number;
    radius: number;
    opacity: number;
    color: string;
    bright: boolean;
    scintillation: number;
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
    starVisibility?: number;
    moonVisibility?: number;
}

export const calculateCelestialScene = ({
    date,
    latitude,
    longitude,
    haze,
    cloudDensity,
    starVisibility = 1,
    moonVisibility = 1,
}: CelestialInput): CelestialScene => {
    const sun = SunCalc.getPosition(date, latitude, longitude);
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const illumination = SunCalc.getMoonIllumination(date);
    const sunAltitude = sun.altitude / DEG;
    const moonAltitude = moon.altitude / DEG;
    const night = clamp((-sunAltitude - 3) / 15);
    const moonAboveHorizon = clamp((moonAltitude + 1.5) / 8);
    const moonLightPenalty =
        moonAboveHorizon * illumination.fraction ** 1.45 * 0.95;
    const limitingMagnitude =
        -0.25 +
        night * 4.15 -
        moonLightPenalty -
        Math.max(0, haze - 0.85) * 0.34 -
        cloudDensity * 0.08 +
        (clamp(starVisibility, 0, 2) - 1) * 0.8;
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
            illumination.fraction ** 1.35 *
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
        const magnitudeBrightness = clamp(
            (limitingMagnitude - apparentMagnitude + 0.45) / 2.8,
            0.08,
            1,
        );
        const radius = clamp(1.82 - (star.mag + 1.2) * 0.29, 0.52, 2.15);
        const bright = star.mag < 1.6;
        const scintillation = bright
            ? clamp(
                  (airmass - 1) * 0.065 +
                      clamp((34 - altitudeDegrees) / 34) * 0.08,
                  0.015,
                  0.24,
              )
            : 0;

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
                ),
                bright,
                scintillation,
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
    const daytimeOpacity = 0.1 + illumination.fraction * 0.16;
    const nighttimeOpacity = 0.58 + illumination.fraction * 0.35;
    const atmosphericClarity = clamp(
        1 - Math.max(0, haze - 0.8) * 0.1 - cloudDensity * 0.025,
        0.68,
        1,
    );
    const lowAltitudeWarmth = clamp((16 - moonAltitude) / 16);
    const distanceScale = clamp(384_400 / (moon.distance ?? 384_400), 0.92, 1.08);

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
                    (0.014 + illumination.fraction * 0.082) *
                        darkness *
                        moonHorizonFade *
                        (0.72 + haze * 0.3 + clamp(cloudDensity / 3) * 0.22),
                    0,
                    0.16,
                ),
            earthshineOpacity:
                (0.025 + (1 - illumination.fraction) * 0.16) * darkness,
            scale: distanceScale * (1 + lowAltitudeWarmth * 0.045),
            rotation,
            textureRotation: -(moon.parallacticAngle / DEG),
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

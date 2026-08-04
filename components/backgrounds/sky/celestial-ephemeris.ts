/**
 * Deterministic astronomical coordinate and lunar-orientation helpers.
 *
 * Angles supplied to or returned from this module are radians unless the name
 * explicitly ends in `Degrees`.  The lunar orientation follows the US Naval
 * Observatory physical-ephemeris convention: position angles are measured
 * eastward from celestial north, and the on-screen zenith angle subtracts the
 * topocentric parallactic angle.  Optical libration uses the ecliptic geometry
 * of date plus the principal physical-libration terms; it is intended as the
 * registered LROC/LOLA fallback when an authoritative NASA SVS hourly frame is
 * unavailable.
 */

import { CAMERA_REFERENCE_HEADING_DEGREES } from "./camera-contract";

export type EphemerisVec2 = readonly [number, number];
export type EphemerisVec3 = readonly [number, number, number];

const PI = Math.PI;
const TAU = PI * 2;
const DEG = PI / 180;

const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const wrapRadians = (value: number) => {
    let result = value % TAU;
    if (result > PI) result -= TAU;
    if (result < -PI) result += TAU;
    return result;
};
const wrapDegrees = (value: number) => ((value % 360) + 360) % 360;
const normalize3 = (value: EphemerisVec3): EphemerisVec3 => {
    const length = Math.hypot(...value);
    return length > 1e-12
        ? [value[0] / length, value[1] / length, value[2] / length]
        : [0, 1, 0];
};

export const julianDate = (date: Date) =>
    date.getTime() / 86_400_000 + 2_440_587.5;

export const julianCenturiesSinceJ2000 = (date: Date) =>
    (julianDate(date) - 2_451_545) / 36_525;

/** IAU polynomial for mean obliquity, sufficient for the app's date range. */
export const meanObliquityRadians = (date: Date) => {
    const t = julianCenturiesSinceJ2000(date);
    const arcseconds = 84_381.406 - 46.836769 * t - 0.0001831 * t * t +
        0.0020034 * t ** 3 - 5.76e-7 * t ** 4 - 4.34e-8 * t ** 5;
    return arcseconds / 3_600 * DEG;
};

export const greenwichSiderealTimeRadians = (date: Date) => {
    const jd = julianDate(date);
    const t = (jd - 2_451_545) / 36_525;
    return wrapDegrees(
        280.46061837 + 360.98564736629 * (jd - 2_451_545) +
        0.000387933 * t * t - t ** 3 / 38_710_000,
    ) * DEG;
};

export interface EquatorialCoordinate {
    rightAscensionRadians: number;
    declinationRadians: number;
}

/** IAU 1976 precession from J2000, well below a rendered stellar PSF here. */
export const precessEquatorialJ2000 = (
    rightAscensionRadians: number,
    declinationRadians: number,
    date: Date,
): EquatorialCoordinate => {
    const t = julianCenturiesSinceJ2000(date);
    const arcsecondsToRadians = DEG / 3_600;
    const zeta = (
        2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3
    ) * arcsecondsToRadians;
    const z = (
        2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3
    ) * arcsecondsToRadians;
    const theta = (
        2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3
    ) * arcsecondsToRadians;
    const shiftedRa = rightAscensionRadians + zeta;
    const a = Math.cos(declinationRadians) * Math.sin(shiftedRa);
    const b = Math.cos(theta) * Math.cos(declinationRadians) *
        Math.cos(shiftedRa) - Math.sin(theta) * Math.sin(declinationRadians);
    const c = Math.sin(theta) * Math.cos(declinationRadians) *
        Math.cos(shiftedRa) + Math.cos(theta) * Math.sin(declinationRadians);
    return {
        rightAscensionRadians: wrapRadians(Math.atan2(a, b) + z),
        declinationRadians: Math.asin(clamp(c, -1, 1)),
    };
};

/**
 * Invert SunCalc's horizontal convention (azimuth zero at south, positive to
 * the west) into apparent equatorial coordinates.
 */
export const equatorialFromHorizontal = (
    azimuthRadians: number,
    altitudeRadians: number,
    latitudeRadians: number,
    localSiderealTimeRadians: number,
): EquatorialCoordinate => {
    const sinDeclination =
        Math.sin(latitudeRadians) * Math.sin(altitudeRadians) -
        Math.cos(latitudeRadians) * Math.cos(altitudeRadians) *
            Math.cos(azimuthRadians);
    const declinationRadians = Math.asin(clamp(sinDeclination, -1, 1));
    const cosDeclination = Math.max(1e-12, Math.cos(declinationRadians));
    const sinHourAngle = Math.sin(azimuthRadians) * Math.cos(altitudeRadians) /
        cosDeclination;
    const cosHourAngle = (
        Math.sin(altitudeRadians) * Math.cos(latitudeRadians) +
        Math.cos(altitudeRadians) * Math.sin(latitudeRadians) *
            Math.cos(azimuthRadians)
    ) / cosDeclination;
    const hourAngle = Math.atan2(sinHourAngle, cosHourAngle);
    return {
        rightAscensionRadians: wrapRadians(localSiderealTimeRadians - hourAngle),
        declinationRadians,
    };
};

export const eclipticFromEquatorial = (
    coordinate: EquatorialCoordinate,
    obliquityRadians: number,
) => {
    const { rightAscensionRadians: alpha, declinationRadians: delta } = coordinate;
    const longitudeRadians = Math.atan2(
        Math.sin(alpha) * Math.cos(obliquityRadians) +
            Math.tan(delta) * Math.sin(obliquityRadians),
        Math.cos(alpha),
    );
    const latitudeRadians = Math.asin(clamp(
        Math.sin(delta) * Math.cos(obliquityRadians) -
        Math.cos(delta) * Math.sin(obliquityRadians) * Math.sin(alpha),
        -1,
        1,
    ));
    return { longitudeRadians: wrapRadians(longitudeRadians), latitudeRadians };
};

const equatorialFromEcliptic = (
    longitudeRadians: number,
    latitudeRadians: number,
    obliquityRadians: number,
): EquatorialCoordinate => ({
    rightAscensionRadians: wrapRadians(Math.atan2(
        Math.sin(longitudeRadians) * Math.cos(obliquityRadians) -
            Math.tan(latitudeRadians) * Math.sin(obliquityRadians),
        Math.cos(longitudeRadians),
    )),
    declinationRadians: Math.asin(clamp(
        Math.sin(latitudeRadians) * Math.cos(obliquityRadians) +
        Math.cos(latitudeRadians) * Math.sin(obliquityRadians) *
            Math.sin(longitudeRadians),
        -1,
        1,
    )),
});

/** Compact Meeus/SunCalc geocentric ephemeris used by the scene owner. */
export const approximateSolarAndLunarEquatorial = (date: Date) => {
    const days = julianDate(date) - 2_451_545;
    const obliquity = meanObliquityRadians(date);
    const solarMeanAnomaly = (357.5291 + 0.98560028 * days) * DEG;
    const equationOfCenter = (
        1.9148 * Math.sin(solarMeanAnomaly) +
        0.0200 * Math.sin(2 * solarMeanAnomaly) +
        0.0003 * Math.sin(3 * solarMeanAnomaly)
    ) * DEG;
    const solarLongitude = wrapRadians(
        solarMeanAnomaly + equationOfCenter + 102.9372 * DEG + PI,
    );
    const lunarMeanLongitude = (218.316 + 13.176396 * days) * DEG;
    const lunarMeanAnomaly = (134.963 + 13.064993 * days) * DEG;
    const lunarArgumentLatitude = (93.272 + 13.229350 * days) * DEG;
    const lunarLongitude = wrapRadians(
        lunarMeanLongitude + 6.289 * DEG * Math.sin(lunarMeanAnomaly),
    );
    const lunarLatitude = 5.128 * DEG * Math.sin(lunarArgumentLatitude);
    return {
        sun: equatorialFromEcliptic(solarLongitude, 0, obliquity),
        moon: equatorialFromEcliptic(lunarLongitude, lunarLatitude, obliquity),
        moonEcliptic: {
            longitudeRadians: lunarLongitude,
            latitudeRadians: lunarLatitude,
        },
    };
};

/** Apparent position angle of `target` eastward from north around `origin`. */
export const equatorialPositionAngle = (
    origin: EquatorialCoordinate,
    target: EquatorialCoordinate,
) => {
    const deltaRa = target.rightAscensionRadians - origin.rightAscensionRadians;
    return wrapRadians(Math.atan2(
        Math.cos(target.declinationRadians) * Math.sin(deltaRa),
        Math.sin(target.declinationRadians) * Math.cos(origin.declinationRadians) -
            Math.cos(target.declinationRadians) *
                Math.sin(origin.declinationRadians) * Math.cos(deltaRa),
    ));
};

/**
 * Convert a J2000 equatorial direction into the renderer's east/up/view frame.
 */
export const equatorialToLocalDirection = (
    rightAscensionDegrees: number,
    declinationDegrees: number,
    date: Date,
    latitudeDegrees: number,
    longitudeDegrees: number,
    viewAzimuthDegrees?: number,
): EphemerisVec3 => {
    const latitude = latitudeDegrees * DEG;
    const apparent = precessEquatorialJ2000(
        rightAscensionDegrees * DEG,
        declinationDegrees * DEG,
        date,
    );
    const declination = apparent.declinationRadians;
    const localSidereal = greenwichSiderealTimeRadians(date) + longitudeDegrees * DEG;
    const hourAngle = wrapRadians(localSidereal - apparent.rightAscensionRadians);
    const altitude = Math.asin(clamp(
        Math.sin(latitude) * Math.sin(declination) +
        Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
        -1,
        1,
    ));
    const azimuth = Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(latitude) -
            Math.tan(declination) * Math.cos(latitude),
    );
    const relativeAzimuth = viewAzimuthDegrees === undefined
        ? wrapRadians(azimuth)
        // Keep the historical SunCalc/reference-heading conversion explicit:
        // CPU directions subtract the public heading in the camera-local
        // frame, while the renderer later applies the matching world yaw.
        : wrapRadians(
            azimuth -
                (viewAzimuthDegrees - CAMERA_REFERENCE_HEADING_DEGREES) * DEG,
        );
    const horizontal = Math.cos(altitude);
    return normalize3([
        Math.sin(relativeAzimuth) * horizontal,
        Math.sin(altitude),
        Math.cos(relativeAzimuth) * horizontal,
    ]);
};

export interface LunarEphemerisInput {
    date: Date;
    latitudeDegrees: number;
    longitudeDegrees: number;
    moonAzimuthRadians: number;
    moonAltitudeRadians: number;
    sunAzimuthRadians: number;
    sunAltitudeRadians: number;
    /** SunCalc topocentric parallactic angle. */
    parallacticAngleRadians: number;
    illuminatedFraction: number;
    moonDistanceKm?: number;
}

export interface LunarPhysicalEphemeris {
    moonEquatorial: EquatorialCoordinate;
    sunEquatorial: EquatorialCoordinate;
    /** Selenographic longitude of the sub-Earth point, east-positive. */
    subEarthLongitudeRadians: number;
    /** Selenographic latitude of the sub-Earth point, north-positive. */
    subEarthLatitudeRadians: number;
    /** Lunar north-pole position angle eastward from celestial north. */
    northPolePositionAngleRadians: number;
    /** Bright-limb position angle eastward from celestial north (USNO PAB). */
    brightLimbPositionAngleRadians: number;
    /** Lunar north-pole angle relative to the observer's zenith. */
    northPoleAngleFromZenithRadians: number;
    /** Bright-limb angle relative to the observer's zenith. */
    brightLimbAngleFromZenithRadians: number;
    /** Sun direction in disc coordinates: +x east, +y north, +z observer. */
    sunDirectionInDiscFrame: EphemerisVec3;
    phaseAngleRadians: number;
    apparentAngularRadiusRadians: number;
}

const lunarFundamentalArguments = (date: Date) => {
    const t = julianCenturiesSinceJ2000(date);
    const d = wrapDegrees(297.8501921 + 445267.1114034 * t -
        0.0018819 * t ** 2 + t ** 3 / 545868 - t ** 4 / 113065000) * DEG;
    const m = wrapDegrees(357.5291092 + 35999.0502909 * t -
        0.0001536 * t ** 2 + t ** 3 / 24490000) * DEG;
    const mp = wrapDegrees(134.9633964 + 477198.8675055 * t +
        0.0087414 * t ** 2 + t ** 3 / 69699 - t ** 4 / 14712000) * DEG;
    const f = wrapDegrees(93.2720950 + 483202.0175233 * t -
        0.0036539 * t ** 2 - t ** 3 / 3526000 + t ** 4 / 863310000) * DEG;
    const omega = wrapDegrees(125.0445479 - 1934.1362891 * t +
        0.0020754 * t ** 2 + t ** 3 / 467441 - t ** 4 / 60616000) * DEG;
    return { t, d, m, mp, f, omega };
};

const physicalLibrationCorrections = (
    date: Date,
    args: ReturnType<typeof lunarFundamentalArguments>,
) => {
    const { t, d, m, mp, f, omega } = args;
    const e = 1 - 0.002516 * t - 0.0000074 * t * t;
    const k1 = (119.75 + 131.849 * t) * DEG;
    const k2 = (72.56 + 20.186 * t) * DEG;
    const rho = (
        -0.02752 * Math.cos(mp) - 0.02245 * Math.sin(f) +
        0.00684 * Math.cos(mp - 2 * f) - 0.00293 * Math.cos(2 * f) -
        0.00085 * Math.cos(2 * f - 2 * d) - 0.00054 * Math.cos(mp - 2 * d) -
        0.00020 * Math.sin(mp + f) - 0.00020 * Math.cos(mp + 2 * f) -
        0.00020 * Math.cos(mp - f) + 0.00014 * Math.cos(mp + 2 * f - 2 * d)
    ) * DEG;
    const sigma = (
        -0.02816 * Math.sin(mp) + 0.02244 * Math.cos(f) -
        0.00682 * Math.sin(mp - 2 * f) - 0.00279 * Math.sin(2 * f) -
        0.00083 * Math.sin(2 * f - 2 * d) + 0.00069 * Math.sin(mp - 2 * d) +
        0.00040 * Math.cos(mp + f) - 0.00025 * Math.sin(2 * mp) -
        0.00023 * Math.sin(mp + 2 * f) + 0.00020 * Math.cos(mp - f) +
        0.00019 * Math.sin(mp - f) + 0.00013 * Math.sin(mp + 2 * f - 2 * d) -
        0.00010 * Math.cos(mp - 3 * f)
    ) * DEG;
    const tau = (
        0.02520 * e * Math.sin(m) + 0.00473 * Math.sin(2 * mp - 2 * f) -
        0.00467 * Math.sin(mp) + 0.00396 * Math.sin(k1) +
        0.00276 * Math.sin(2 * mp - 2 * d) + 0.00196 * Math.sin(omega) -
        0.00183 * Math.cos(mp - f) + 0.00115 * Math.sin(mp - 2 * d) -
        0.00096 * Math.sin(mp - d) + 0.00046 * Math.sin(2 * f - 2 * d) -
        0.00039 * Math.sin(mp - f) - 0.00032 * Math.sin(mp - m - d) +
        0.00027 * Math.sin(2 * mp - m - 2 * d) + 0.00023 * Math.sin(k2) -
        0.00014 * Math.sin(2 * d) + 0.00014 * Math.cos(2 * mp - 2 * f) -
        0.00012 * Math.sin(mp - 2 * f) - 0.00012 * Math.sin(2 * mp) +
        0.00011 * Math.sin(2 * mp - 2 * m - 2 * d)
    ) * DEG;
    return { rho, sigma, tau };
};

export const createLunarPhysicalEphemeris = ({
    date,
    latitudeDegrees,
    longitudeDegrees,
    moonAzimuthRadians,
    moonAltitudeRadians,
    sunAzimuthRadians,
    sunAltitudeRadians,
    parallacticAngleRadians,
    illuminatedFraction,
    moonDistanceKm = 384_400,
}: LunarEphemerisInput): LunarPhysicalEphemeris => {
    // Position angles and libration are geocentric physical-ephemeris
    // quantities. Topocentric azimuth/altitude remain caller-owned for camera
    // placement and the supplied parallactic angle handles local orientation.
    void latitudeDegrees;
    void longitudeDegrees;
    void moonAzimuthRadians;
    void moonAltitudeRadians;
    void sunAzimuthRadians;
    void sunAltitudeRadians;
    const compactEphemeris = approximateSolarAndLunarEquatorial(date);
    const moonEquatorial = compactEphemeris.moon;
    const sunEquatorial = compactEphemeris.sun;
    const moonEcliptic = compactEphemeris.moonEcliptic;
    const args = lunarFundamentalArguments(date);
    const inclination = 1.54242 * DEG;
    const w = wrapRadians(moonEcliptic.longitudeRadians - args.omega);
    const a = Math.atan2(
        Math.sin(w) * Math.cos(moonEcliptic.latitudeRadians) *
            Math.cos(inclination) -
            Math.sin(moonEcliptic.latitudeRadians) * Math.sin(inclination),
        Math.cos(w) * Math.cos(moonEcliptic.latitudeRadians),
    );
    const opticalLongitude = wrapRadians(a - args.f);
    const opticalLatitude = Math.asin(clamp(
        -Math.sin(w) * Math.cos(moonEcliptic.latitudeRadians) *
            Math.sin(inclination) -
            Math.sin(moonEcliptic.latitudeRadians) * Math.cos(inclination),
        -1,
        1,
    ));
    const { rho, sigma, tau } = physicalLibrationCorrections(date, args);
    const subEarthLongitudeRadians = wrapRadians(
        opticalLongitude - tau +
        (rho * Math.cos(a) + sigma * Math.sin(a)) * Math.tan(opticalLatitude),
    );
    const subEarthLatitudeRadians = clamp(
        opticalLatitude + sigma * Math.cos(a) - rho * Math.sin(a),
        -PI / 2,
        PI / 2,
    );

    // IAU mean lunar north pole (adequate for disc orientation; the physical
    // libration above supplies the much more visible surface registration).
    const t = julianCenturiesSinceJ2000(date);
    const lunarNorthPole: EquatorialCoordinate = {
        rightAscensionRadians: (269.9949 + 0.0031 * t) * DEG,
        declinationRadians: (66.5392 + 0.0130 * t) * DEG,
    };
    const northPolePositionAngleRadians = equatorialPositionAngle(
        moonEquatorial,
        lunarNorthPole,
    );
    const brightLimbPositionAngleRadians = equatorialPositionAngle(
        moonEquatorial,
        sunEquatorial,
    );
    const northPoleAngleFromZenithRadians = wrapRadians(
        northPolePositionAngleRadians - parallacticAngleRadians,
    );
    const brightLimbAngleFromZenithRadians = wrapRadians(
        brightLimbPositionAngleRadians - parallacticAngleRadians,
    );
    const phaseAngleRadians = Math.acos(clamp(
        illuminatedFraction * 2 - 1,
        -1,
        1,
    ));
    const transverse = Math.sin(phaseAngleRadians);
    const relativeBrightLimb = wrapRadians(
        brightLimbPositionAngleRadians - northPolePositionAngleRadians,
    );
    const sunDirectionInDiscFrame = normalize3([
        Math.sin(relativeBrightLimb) * transverse,
        Math.cos(relativeBrightLimb) * transverse,
        Math.cos(phaseAngleRadians),
    ]);

    return {
        moonEquatorial,
        sunEquatorial,
        subEarthLongitudeRadians,
        subEarthLatitudeRadians,
        northPolePositionAngleRadians,
        brightLimbPositionAngleRadians,
        northPoleAngleFromZenithRadians,
        brightLimbAngleFromZenithRadians,
        sunDirectionInDiscFrame,
        phaseAngleRadians,
        apparentAngularRadiusRadians: Math.asin(
            1_737.4 / clamp(moonDistanceKm, 340_000, 430_000),
        ),
    };
};

export interface NightSkyCoordinateFrame {
    eclipticNorthDirection: EphemerisVec3;
    galacticNorthDirection: EphemerisVec3;
    galacticCenterDirection: EphemerisVec3;
}

export const createNightSkyCoordinateFrame = (
    date: Date,
    latitudeDegrees: number,
    longitudeDegrees: number,
    viewAzimuthDegrees?: number,
): NightSkyCoordinateFrame => ({
    // J2000 IAU axes; equatorialToLocalDirection precesses them to date.
    eclipticNorthDirection: equatorialToLocalDirection(
        270,
        66.560708,
        date,
        latitudeDegrees,
        longitudeDegrees,
        viewAzimuthDegrees,
    ),
    galacticNorthDirection: equatorialToLocalDirection(
        192.85948,
        27.12825,
        date,
        latitudeDegrees,
        longitudeDegrees,
        viewAzimuthDegrees,
    ),
    galacticCenterDirection: equatorialToLocalDirection(
        266.4051,
        -28.936175,
        date,
        latitudeDegrees,
        longitudeDegrees,
        viewAzimuthDegrees,
    ),
});

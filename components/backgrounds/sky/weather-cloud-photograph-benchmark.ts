import SunCalc from "suncalc";

import {
    CLOUD_PHOTOGRAPH_CASES,
    type CloudPhotographCase,
    type EvaluationEnvironment,
} from "./cloud-photograph-benchmark";
import type { SkyPhase, SkyAerosolType } from "./sky-palettes";
import {
    WEATHER_QUALIFICATION_ENVIRONMENTS,
    WEATHER_QUALIFICATION_PERSPECTIVES,
    WEATHER_QUALIFICATION_TARGETS,
    resolveWeatherQualificationCase,
    type QualificationEnvironment,
    type QualificationPerspective,
    type WeatherQualificationCase,
} from "./weather-qualification-matrix";

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));

/** One explicit camera is used whenever the qualification lab is opened. */
export const DEFAULT_PRODUCTION_PERSPECTIVE_ID = "oblique-natural";

const phaseForSolarElevation = (degrees: number): SkyPhase => {
    if (degrees >= 12) return "day";
    if (degrees >= 4) return "golden";
    if (degrees >= 0) return "sunset";
    if (degrees >= -6) return "afterglow";
    if (degrees >= -12) return "blueHourEvening";
    if (degrees >= -18) return "dusk";
    return "night";
};

const dateCache = new Map<string, Date>();

/**
 * Find a deterministic real Sun geometry for the requested latitude, season,
 * and elevation. This avoids presenting a sunset palette under a noon source.
 */
const representativeDate = (environment: QualificationEnvironment): Date => {
    const cached = dateCache.get(environment.id);
    if (cached) return new Date(cached);
    const winterToSummerDay = 15 + Math.round(clamp(environment.season) * 181);
    const day = new Date(Date.UTC(2026, 0, winterToSummerDay, 0, 0, 0));
    const sunsetSide = environment.lighting === "back" ||
        environment.lighting === "twilight" ||
        environment.lighting === "moon" ||
        environment.lighting === "moonless";
    let best = day;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let minutes = 0; minutes < 24 * 60; minutes += 4) {
        if (sunsetSide && minutes < 12 * 60) continue;
        const candidate = new Date(day.getTime() + minutes * 60_000);
        const altitude = SunCalc.getPosition(
            candidate, environment.latitude, 0,
        ).altitude * 180 / Math.PI;
        const score = Math.abs(altitude - environment.solarElevationDegrees);
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    dateCache.set(environment.id, best);
    return new Date(best);
};

const viewAzimuthFor = (
    environment: QualificationEnvironment,
    date: Date,
): number => {
    const solarAzimuth = (SunCalc.getPosition(
        date, environment.latitude, 0,
    ).azimuth * 180 / Math.PI + 180 + 360) % 360;
    if (environment.lighting === "back" ||
        environment.lighting === "twilight") return solarAzimuth;
    if (environment.lighting === "front") return (solarAzimuth + 180) % 360;
    if (environment.lighting === "side") return (solarAzimuth + 90) % 360;
    return 180;
};

const environmentFor = (
    environment: QualificationEnvironment,
    perspective: QualificationPerspective,
    date: Date,
): EvaluationEnvironment => ({
    id: `${environment.id}--${perspective.id}`,
    label: `${environment.label} · ${perspective.label}`,
    description: `${environment.label}. ${perspective.purpose}`,
    date: date.toISOString(),
    latitude: environment.latitude,
    longitude: 0,
    viewAzimuth: viewAzimuthFor(environment, date),
    viewElevation: perspective.viewElevationDegrees,
    horizontalFov: perspective.horizontalFieldOfViewDegrees,
    verticalFov: Math.min(120, Math.max(24,
        perspective.horizontalFieldOfViewDegrees * 0.68)),
    perspective: perspective.range === "near" ? "wide"
        : perspective.range === "distant" ? "telephoto" : "natural",
    regime: perspective.range === "near" ? "nearby"
        : perspective.range === "distant" ? "distant" : "auto",
    familyId: environment.lighting === "moon" ||
        environment.lighting === "moonless" ? "violet-nocturne"
        : environment.lighting === "twilight" ? "rose-afterglow"
            : environment.lighting === "back" ? "cobalt-gold"
                : environment.relativeHumidity >= 0.78 ? "humid-aqua"
                    : "crystal-azure",
    atmosphereStyle: environment.relativeHumidity >= 0.88 ? "soft"
        : environment.aerosolOpticalDepth >= 0.3 ? "haze" : "crystal",
    aerosolType: environment.aerosolType as SkyAerosolType,
    composition: {
        aerosol: clamp(environment.aerosolOpticalDepth / 0.28, 0.015, 1),
        humidity: environment.relativeHumidity,
        aerosolSize: clamp(1 - environment.aerosolAngstromExponent / 2.6),
        aerosolAbsorption: clamp(
            (1 - environment.aerosolSingleScatteringAlbedo) * 3,
        ),
        ozone: clamp(environment.ozoneDobsonUnits / 310, 0.65, 1.35),
        observerAltitude: clamp(perspective.observerAltitudeKm / 2.5),
        inversion: environment.boundaryLayer === "stable" ? 0.72
            : environment.boundaryLayer === "convective" ? 0.08 : 0.28,
        stratosphericAerosol: clamp(
            environment.stratosphericAerosolOpticalDepth / 0.12,
        ),
        groundAlbedo: environment.surfaceAlbedo,
    },
    ...(environment.lighting === "moon" ? { nightExposure: -0.28 }
        : environment.lighting === "moonless" ? { nightExposure: -0.55 } : {}),
});

export const weatherQualificationCaseId = ({
    targetId,
    environmentId,
    perspectiveId,
}: {
    targetId: string;
    environmentId: string;
    perspectiveId: string;
}) => `${targetId}--${environmentId}--${perspectiveId}`;

export const approvedProductionPerspectiveId = (
    perspectiveId: string | null | undefined,
): string | undefined => WEATHER_QUALIFICATION_PERSPECTIVES.find(
    ({ id }) => id === perspectiveId,
)?.id;

export interface ProductionPerspectiveCamera {
    id: string;
    viewElevation: number;
    horizontalFov: number;
    verticalFov: number;
    observerAltitude: number;
    cloudPerspective: "natural";
    cloudEditorialRegime: "nearby" | "distant" | "auto";
}

/**
 * The one camera contract shared by the capture host and serial matrix.  Keep
 * target-native perspective ids out of this resolver: they identify a weather
 * case but must never change live camera geometry.
 */
export const resolveProductionPerspectiveCamera = (
    perspectiveId: string | null | undefined,
): ProductionPerspectiveCamera => {
    const approvedId = approvedProductionPerspectiveId(perspectiveId) ??
        DEFAULT_PRODUCTION_PERSPECTIVE_ID;
    const perspective = WEATHER_QUALIFICATION_PERSPECTIVES.find(
        ({ id }) => id === approvedId,
    ) ?? WEATHER_QUALIFICATION_PERSPECTIVES.find(
        ({ id }) => id === DEFAULT_PRODUCTION_PERSPECTIVE_ID,
    )!;
    return {
        id: perspective.id,
        viewElevation: perspective.viewElevationDegrees,
        horizontalFov: perspective.horizontalFieldOfViewDegrees,
        verticalFov: Math.min(120, Math.max(24,
            perspective.horizontalFieldOfViewDegrees * 0.68)),
        observerAltitude: clamp(perspective.observerAltitudeKm / 2.5),
        cloudPerspective: "natural",
        cloudEditorialRegime: perspective.range === "near" ? "nearby"
            : perspective.range === "distant" ? "distant" : "auto",
    };
};

export const productionPerspectiveCameraSignature = (
    perspectiveId: string | null | undefined,
): string => {
    const camera = resolveProductionPerspectiveCamera(perspectiveId);
    return [
        camera.viewElevation,
        camera.horizontalFov,
        camera.verticalFov,
        camera.observerAltitude,
        camera.cloudPerspective,
        camera.cloudEditorialRegime,
    ].join("|");
};

/** Apply one production camera without changing the selected weather state. */
export const applyProductionPerspectiveToCloudPhotographCase = <
    Case extends CloudPhotographCase,
>(
    benchmark: Case,
    perspectiveId: string | null | undefined,
): Case => {
    const approvedId = approvedProductionPerspectiveId(perspectiveId);
    if (!approvedId) return benchmark;
    const camera = resolveProductionPerspectiveCamera(approvedId);
    const perspective = WEATHER_QUALIFICATION_PERSPECTIVES.find(
        ({ id }) => id === camera.id,
    )!;
    const descriptivePerspective = perspective.range === "near" ? "wide"
        : perspective.range === "distant" ? "telephoto" : "natural";
    return {
        ...benchmark,
        environment: {
            ...benchmark.environment,
            label: `${benchmark.environment.label} · ${perspective.label}`,
            viewElevation: camera.viewElevation,
            horizontalFov: camera.horizontalFov,
            verticalFov: camera.verticalFov,
            perspective: descriptivePerspective,
            regime: camera.cloudEditorialRegime,
            composition: {
                ...benchmark.environment.composition,
                // Keep the descriptive environment contract identical to the
                // actual preview camera. Previously only the preview override
                // was corrected, leaving a hidden case-native observer height.
                observerAltitude: camera.observerAltitude,
            },
        },
        preview: {
            ...benchmark.preview,
            viewElevation: camera.viewElevation,
            horizontalFov: camera.horizontalFov,
            verticalFov: camera.verticalFov,
            composition: {
                ...benchmark.preview.composition,
                // Observer height is camera geometry. It must follow the one
                // globally selected production perspective just like FOV and
                // elevation, never the benchmark case that supplied weather.
                observerAltitude: camera.observerAltitude,
            },
            cloudPerspective: camera.cloudPerspective,
            cloudEditorialRegime: camera.cloudEditorialRegime,
        },
    };
};

/** Resolve one of the 3k+ lazy matrix permutations, never the whole matrix. */
export const resolveWeatherCloudPhotographCase = (
    caseId: string | null | undefined,
): CloudPhotographCase | undefined => {
    if (!caseId) return undefined;
    const [targetId, environmentId, perspectiveId, ...rest] = caseId.split("--");
    if (rest.length || !targetId || !environmentId || !perspectiveId) return undefined;
    const target = WEATHER_QUALIFICATION_TARGETS.find(({ id }) => id === targetId);
    const environment = WEATHER_QUALIFICATION_ENVIRONMENTS.find(
        ({ id }) => id === environmentId,
    );
    const perspective = WEATHER_QUALIFICATION_PERSPECTIVES.find(
        ({ id }) => id === perspectiveId,
    );
    if (!target || !environment || !perspective ||
        !target.environments.includes(environment.id) ||
        !target.perspectives.includes(perspective.id)) return undefined;
    const qualificationCase: WeatherQualificationCase = {
        id: caseId,
        target,
        environment,
        perspective,
    };
    const resolved = resolveWeatherQualificationCase(qualificationCase);
    const date = representativeDate(environment);
    const photographicEnvironment = environmentFor(environment, perspective, date);
    const primaryClassification = resolved.classifications[0] ??
        CLOUD_PHOTOGRAPH_CASES[0].classification;
    return {
        id: caseId,
        genus: primaryClassification.genus,
        species: target.kind === "cloud"
            ? (primaryClassification.species ?? primaryClassification.genus)
            : target.kind,
        classification: primaryClassification,
        title: target.label,
        referenceImage: "",
        source: target.source,
        credit: "WMO/weather production qualification matrix",
        cues: [...target.cues],
        environment: photographicEnvironment,
        preview: {
            date,
            timezone: "UTC",
            latitude: environment.latitude,
            longitude: 0,
            viewAzimuth: photographicEnvironment.viewAzimuth,
            viewElevation: perspective.viewElevationDegrees,
            horizontalFov: perspective.horizontalFieldOfViewDegrees,
            verticalFov: photographicEnvironment.verticalFov,
            familyId: photographicEnvironment.familyId,
            phase: phaseForSolarElevation(environment.solarElevationDegrees),
            atmosphereStyle: photographicEnvironment.atmosphereStyle,
            aerosolType: photographicEnvironment.aerosolType,
            composition: photographicEnvironment.composition,
            cloudScene: resolved.cloudScene,
            hydrometeors: resolved.hydrometeors,
            cloudComposition: "graphic",
            cloudPerspective: "natural",
            cloudEditorialRegime: photographicEnvironment.regime,
            rendererPreference: "webgpu",
            rendererQuality: "high",
            cloudResolutionScale: 1,
            temporalClouds: true,
            motionAmount: 0,
            nightExposure: photographicEnvironment.nightExposure,
        },
    };
};

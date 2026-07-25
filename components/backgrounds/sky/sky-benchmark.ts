import manifestData from "@/data/moon-benchmark.json";

import type { SkyPreviewOptions } from "./sky";
import type {
    SkyAerosolType,
    SkyAtmosphere,
} from "./sky-palettes";

export type MoonReferenceClass =
    | "atmosphericScene"
    | "contextualPhotograph"
    | "lunarDiscTruth";

export interface MoonBenchmarkCase {
    id: string;
    referenceClass: MoonReferenceClass;
    sourceId: string;
    source: {
        id: string;
        name: string;
        url: string;
        imageUrl: string;
        license: string;
        acknowledgement: string;
    };
    referenceImage: string;
    comparisonImage?: string;
    capture: {
        timestamp: string;
        localTimestamp?: string;
        timezone?: string;
        timestampConfidence: string;
        latitude: number;
        longitude: number;
        elevationMeters: number;
        viewDirection: string;
        viewAzimuth: number;
        viewElevation?: number;
        horizontalFov: number;
        verticalFov?: number;
        sourceHorizontalFov: number | null;
        sourceProjection: string;
        comparisonProjection: string;
        exposureMilliseconds: number | null;
        aperture?: number | null;
        iso?: number | null;
        focalLengthMillimeters?: number | null;
        focalLength35Millimeters?: number | null;
        sensor: string | null;
        sourceResolution: [number, number];
        opticalCenter?: [number, number];
        usableRadius?: number;
        calibrationUrl?: string;
    };
    astronomy: {
        solarAltitude: number;
        solarAzimuth: number;
        lunarAltitude: number;
        lunarAzimuth: number;
        lunarDistanceKilometers: number;
        lunarIllumination: number;
        lunarPhase: number;
        phaseClass: string;
        solarRegime: string;
        lunarAltitudeClass: string;
        ephemeris: string;
    };
    observed: {
        condition: string;
        cloudCoverage: number | null;
        cloudOpacity: number | null;
        imageStatistics: Record<string, number> | null;
        atmosphericClassificationConfidence: string;
    };
    renderer: {
        familyId: string;
        atmosphereStyle: SkyAtmosphere;
        aerosolType: SkyAerosolType;
        cloudDensity: number;
        composition: NonNullable<SkyPreviewOptions["composition"]>;
    };
    normalization?: {
        method: string;
        outputResolution: [number, number];
        outputHorizontalFov: number;
        sourceMoonDetection: {
            angleDegrees: number;
            radiusPixels: number;
            confidenceZ: number;
            contrast: number;
            highlight: number;
            localMean: number;
            surroundMean: number;
        };
        quality: "high" | "medium" | "low";
        caveat: string;
    };
}

export interface MoonBenchmarkManifest {
    version: number;
    generatedAt: string;
    methodology: string;
    sources: Array<Record<string, unknown>>;
    normalization?: Record<string, unknown>;
    summary: {
        caseCount: number;
        sourceCounts: Record<string, number>;
        phaseCounts: Record<string, number>;
        solarRegimeCounts: Record<string, number>;
        lunarAltitudeCounts: Record<string, number>;
        referenceClassCounts?: Record<string, number>;
        normalizationQualityCounts?: Record<string, number>;
    };
    cases: MoonBenchmarkCase[];
}

export const MOON_BENCHMARK = manifestData as unknown as MoonBenchmarkManifest;

export const previewForBenchmark = (
    benchmark: MoonBenchmarkCase,
): SkyPreviewOptions => {
    const sourceAspect = benchmark.capture.sourceResolution[0] /
        benchmark.capture.sourceResolution[1];
    const verticalFov = benchmark.capture.verticalFov ??
        benchmark.capture.horizontalFov / Math.max(0.4, sourceAspect);
    return {
        date: new Date(benchmark.capture.timestamp),
        timezone: "UTC",
        latitude: benchmark.capture.latitude,
        longitude: benchmark.capture.longitude,
        viewAzimuth: benchmark.capture.viewAzimuth,
        horizontalFov: benchmark.capture.horizontalFov,
        viewElevation: benchmark.capture.viewElevation ?? benchmark.astronomy.lunarAltitude,
        verticalFov,
        physicalMoonScale: true,
        familyId: benchmark.renderer.familyId,
        atmosphereStyle: benchmark.renderer.atmosphereStyle,
        aerosolType: benchmark.renderer.aerosolType,
        cloudDensity: benchmark.renderer.cloudDensity,
        cloudCoverage: benchmark.observed.cloudCoverage ?? undefined,
        cloudOpticalDepth: benchmark.observed.cloudOpacity ?? undefined,
        composition: benchmark.renderer.composition,
        motionAmount: 0,
    };
};

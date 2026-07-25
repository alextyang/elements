import manifestData from "@/data/sky-benchmark.json";
import type { SkyPreviewOptions } from "./sky";
import type { SkyAerosolType, SkyAtmosphere, SkyRegion } from "./sky-palettes";

export interface SkyPhotographCase {
    id: string;
    sourceId: string;
    source: { name: string; url: string; license: string; acknowledgement: string };
    referenceImage: string;
    capture: {
        timestamp: string;
        latitude: number;
        longitude: number;
        elevationMeters: number;
        viewDirection: string;
        viewAzimuth: number;
        horizontalFov: number;
        viewElevation?: number;
        verticalFov?: number;
        projection: string;
        sourceProjection?: string;
        normalizationQuality?: "high" | "medium" | "low";
        exposureMilliseconds?: number | null;
    };
    observed: {
        condition: string;
        phase: string;
        solarAltitude: number;
        solarAzimuth: number;
        lunarAltitude?: number;
        lunarIllumination?: number;
        lunarPhaseClass?: string;
        cloudCoverage: number | null;
        cloudOpacity: number | null;
        classificationAgreement: number | null;
        classificationCount: number | null;
        region: SkyRegion;
    };
    renderer: {
        familyId: string;
        atmosphereStyle: SkyAtmosphere;
        aerosolType: SkyAerosolType;
        cloudDensity: number;
        cloudType: NonNullable<SkyPreviewOptions["cloudType"]>;
        cloudCoverage: number;
        cloudOpticalDepth: number;
        composition: NonNullable<SkyPreviewOptions["composition"]>;
    };
}

export interface SkyPhotographManifest {
    version: number;
    generatedAt: string;
    methodology: string;
    sources: Array<Record<string, string | undefined>>;
    summary: {
        caseCount: number;
        conditionCounts: Record<string, number>;
        phaseCounts: Record<string, number>;
    };
    cases: SkyPhotographCase[];
}

export const SKY_PHOTOGRAPH_BENCHMARK = manifestData as SkyPhotographManifest;

export const previewForSkyPhotograph = (benchmark: SkyPhotographCase): SkyPreviewOptions => ({
    date: new Date(benchmark.capture.timestamp),
    timezone: "UTC",
    latitude: benchmark.capture.latitude,
    longitude: benchmark.capture.longitude,
    viewAzimuth: benchmark.capture.viewAzimuth,
    horizontalFov: benchmark.capture.horizontalFov,
    viewElevation: benchmark.capture.viewElevation,
    verticalFov: benchmark.capture.verticalFov,
    familyId: benchmark.renderer.familyId,
    atmosphereStyle: benchmark.renderer.atmosphereStyle,
    region: benchmark.observed.region,
    aerosolType: benchmark.renderer.aerosolType,
    cloudDensity: benchmark.renderer.cloudDensity,
    cloudType: benchmark.renderer.cloudType,
    cloudCoverage: benchmark.renderer.cloudCoverage,
    cloudOpticalDepth: benchmark.renderer.cloudOpticalDepth,
    composition: benchmark.renderer.composition,
    motionAmount: 0,
});

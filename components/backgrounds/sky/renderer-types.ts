export type SkyRendererPreference = "auto" | "webgpu" | "webgl2" | "fallback";

export type SkyRendererBackend = "webgpu" | "webgl2" | "fallback";

export type SkyRendererQuality = "battery" | "balanced" | "high";

import type { CloudScene } from "./cloud-scene";

/**
 * Art direction for volumetric cloud placement. `graphic` is the production
 * composition: genus-aware world-space weather systems with editorially chosen
 * ranges, while the older screen-space alternatives remain Lab comparisons.
 */
export type SkyCloudComposition =
    | "physical"
    | "layered"
    | "edge-framed"
    | "graphic";

/** Diagnostic cloud-only lens comparisons; production always uses `natural`. */
export type SkyCloudPerspective =
    | "natural"
    | "wide"
    | "telephoto"
    | "orthographic"
    | "panoramic";

/** Optional laboratory override for the physical weather-system domain. */
export type SkyCloudEditorialRegime =
    | "auto"
    | "distant"
    | "nearby"
    | "overhead";

export type SkyDebugView =
    | "final"
    | "coverage"
    | "density"
    | "transmittance"
    | "depth"
    | "velocity"
    | "history"
    | "lighting"
    | "steps"
    | "lighting-direct-sun"
    | "lighting-exterior-diffuse"
    | "lighting-p1-cache"
    | "lighting-atmosphere-composite"
    | "lighting-source-higher-order"
    | "lighting-atmosphere-shadow-loss";

export interface SkyRendererOptions {
    preference: SkyRendererPreference;
    quality: SkyRendererQuality;
    debugView: SkyDebugView;
    /** Multiplier applied to the quality tier's cloud-buffer resolution. */
    resolutionScale: number;
    /** Maximum expensive cloud-transport updates per second. */
    updateRate: number;
    temporal: boolean;
    cloudComposition: SkyCloudComposition;
    cloudPerspective: SkyCloudPerspective;
    cloudEditorialRegime: SkyCloudEditorialRegime;
}

export interface SkyRendererAdapterInfo {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
    isFallbackAdapter?: boolean;
}

export interface SkyRendererStats {
    /** Caller-owned identity of the exact scene whose pixels/stats were rendered. */
    sceneKey?: string;
    backend: SkyRendererBackend;
    quality: SkyRendererQuality;
    width: number;
    height: number;
    cloudWidth: number;
    cloudHeight: number;
    cloudUpdateMs: number | null;
    cloudIntervalMs?: number | null;
    cloudLightingMs?: number | null;
    cloudTransportMs?: number | null;
    /** First-use interval plus lighting-cache GPU time, before transport starts. */
    coldCloudWarmupMs?: number | null;
    /** Conservative wall time until the isolated first-use submission completed. */
    coldCloudWarmupQueueMs?: number | null;
    coldCloudWarmupComplete?: boolean;
    /** The first transport update after target creation, including interval and lighting. */
    firstCloudUpdateMs?: number | null;
    firstCloudIntervalMs?: number | null;
    firstCloudLightingMs?: number | null;
    firstCloudTransportMs?: number | null;
    /** Solid-angle-weighted mean opacity from the diagnostic cloud G-buffer. */
    projectedOpacity?: number | null;
    /** Solid-angle-weighted fraction whose cloud opacity is at least 2%. */
    occupiedSkyFraction?: number | null;
    /** Solid-angle-weighted fraction accepted by any cloud interval. */
    acceptedIntervalFraction?: number | null;
    /** Mean density evaluations as a fraction of the 144-step shader ceiling. */
    meanEvaluatedStepFraction?: number | null;
    /** Mean relative frame-to-frame change in occupied raw cloud radiance. */
    rawRadianceTemporalDelta?: number | null;
    /** Mean absolute frame-to-frame change in occupied raw transmittance. */
    rawTransmittanceTemporalDelta?: number | null;
    /** Mean relative change after temporal reconstruction. */
    resolvedRadianceTemporalDelta?: number | null;
    /** Mean relative distance between the current raw and resolved radiance. */
    rawResolvedRadianceResidual?: number | null;
    /** Fraction of eligible occupied samples whose consecutive history advanced. */
    historyAcceptanceFraction?: number | null;
    /** Occupied-pixel mean consecutive age, normalized to the 64-sample horizon. */
    stableHistoryAge?: number | null;
    /** Occupied-pixel mean confidence; each accepted update adds 0.085, rejection resets it. */
    persistentHistoryConfidence?: number | null;
    rawRadianceSpatialVariation?: number | null;
    resolvedRadianceSpatialVariation?: number | null;
    /** Adjacent-pixel variation measured on the full-resolution cloud output. */
    finalOutputAdjacentVariation?: number | null;
    /** Four-pixel scale-separated variation on the full-resolution output. */
    finalOutputScaleSeparatedVariation?: number | null;
    firstDepthTemporalDelta?: number | null;
    meanDepthTemporalDelta?: number | null;
    opticalDepthTemporalDelta?: number | null;
    reconstructionRawNonFiniteCount?: number | null;
    reconstructionResolvedNonFiniteCount?: number | null;
    /** Rolling transport timing from the last bounded sample window. */
    cloudUpdateP50Ms?: number | null;
    cloudUpdateP95Ms?: number | null;
    cloudUpdateMaxMs?: number | null;
    cloudTimingSamples?: number;
    /** Number of complete cloud transport submissions for the current scene. */
    transportUpdates?: number;
    /** Total measured transport submissions above the 32 ms hard-warning boundary. */
    cloudUnsafeSampleCount?: number;
    compositeMs: number | null;
    textureMemoryMb: number;
    historyValid: boolean;
    visible: boolean;
    /** Actual scheduled cadence after thermal/load adaptation. */
    effectiveUpdateRate?: number;
    requestedUpdateRate?: number;
    cadenceScale?: number;
    viewSteps?: number;
    lightSteps?: number;
    /** Whether the current transport state updates one checkerboard parity. */
    interleavedTransport?: boolean;
    /** Fraction of cloud-buffer pixels marched by the expensive pass. */
    transportPixelFraction?: number;
    budgetStatus?: "warming" | "nominal" | "throttled" | "unsafe" | "fallback";
    gpuTimingMode?: "timestamp-query" | "queue-completion" | "unavailable";
    adapterInfo?: SkyRendererAdapterInfo;
    lastError?: string;
}

export interface SkyQualityProfile {
    pixelBudget: number;
    cloudResolution: number;
    viewSteps: number;
    lightSteps: number;
    updateRate: number;
}

export const SKY_QUALITY_PROFILES: Record<SkyRendererQuality, SkyQualityProfile> = {
    battery: {
        pixelBudget: 1_200_000,
        cloudResolution: 0.24,
        viewSteps: 12,
        lightSteps: 3,
        updateRate: 1,
    },
    balanced: {
        pixelBudget: 2_100_000,
        cloudResolution: 0.48,
        viewSteps: 30,
        lightSteps: 6,
        updateRate: 2,
    },
    high: {
        pixelBudget: 3_100_000,
        cloudResolution: 0.62,
        viewSteps: 42,
        lightSteps: 12,
        updateRate: 4,
    },
};

export type SkyCloudSamplingMode = "profile" | "high-cloud-native";

export interface SkyCloudSamplingDecision {
    /** A high cloud or upper-atmosphere medium is visible in this scene. */
    highCloudActive: boolean;
    upperAtmosphereActive: boolean;
    /** Requested ratio before resolution/budget quantization. */
    requestedScale: number;
    /** Effective ratio used for the cloud transport extent. */
    effectiveScale: number;
    mode: SkyCloudSamplingMode;
    /** Stable scene-sensitive key used to invalidate extent/history. */
    signature: string;
}

const HIGH_CLOUD_GENERA = new Set(["cirrus", "cirrocumulus", "cirrostratus"]);

/**
 * Resolve a cloud transport extent from physical scene content. Thin upper
 * ice is spatially high-frequency (fibrils, cellular Ci/Cc, and Cs veils), so
 * high-quality qualification keeps at least 0.9x the native presentation
 * lattice. Battery and balanced tiers retain their historical lower-rate
 * extent and therefore keep their thermal envelope.
 */
export const resolveSkyCloudSampling = ({
    quality,
    resolutionScale,
    cloudScene,
    sceneKey = "",
}: {
    quality: SkyRendererQuality;
    resolutionScale: number;
    cloudScene: Pick<CloudScene, "layers" | "noctilucent" | "classifications">;
    sceneKey?: string;
}): SkyCloudSamplingDecision => {
    const highCloudActive = cloudScene.layers.some((layer) =>
        layer.present &&
        layer.coverage > 0.0005 &&
        layer.opticalDepth > 0.00001 &&
        HIGH_CLOUD_GENERA.has(layer.genus),
    );
    const upperAtmosphereActive = cloudScene.noctilucent > 0.0005 ||
        (cloudScene.classifications?.some((assignment) =>
            Boolean(assignment.upperAtmosphericCloud)) ?? false);
    const highCloudNative = quality === "high" &&
        (highCloudActive || upperAtmosphereActive);
    const profileScale = SKY_QUALITY_PROFILES[quality].cloudResolution *
        Math.min(1, Math.max(0.5, resolutionScale));
    const requestedScale = highCloudNative
        ? Math.max(profileScale, 0.9)
        : profileScale;
    const effectiveScale = Math.min(1, requestedScale);
    const layerSignature = cloudScene.layers.map((layer) => [
        layer.genus,
        layer.species,
        layer.present ? 1 : 0,
        Math.round(layer.coverage * 1000),
        Math.round(layer.opticalDepth * 1000),
    ].join(":")).join("|");
    const classificationSignature = (cloudScene.classifications ?? []).map((assignment) =>
        `${assignment.layerIndex}:${assignment.systemId ?? assignment.systemIndex ?? ""}:` +
        `${assignment.upperAtmosphericCloud ?? ""}`,
    ).join("|");
    return {
        highCloudActive,
        upperAtmosphereActive,
        requestedScale,
        effectiveScale,
        mode: highCloudNative ? "high-cloud-native" : "profile",
        signature: [sceneKey, quality, effectiveScale.toFixed(4),
            highCloudActive ? "high" : "no-high",
            upperAtmosphereActive ? "upper" : "no-upper",
            layerSignature, classificationSignature].join(";") ,
    };
};

export const DEFAULT_SKY_RENDERER_OPTIONS: SkyRendererOptions = {
    preference: "auto",
    quality: "balanced",
    debugView: "final",
    resolutionScale: 1,
    updateRate: SKY_QUALITY_PROFILES.balanced.updateRate,
    temporal: true,
    cloudComposition: "graphic",
    cloudPerspective: "natural",
    cloudEditorialRegime: "auto",
};

export const resolveSkyRendererOptions = (
    options?: Partial<SkyRendererOptions>,
): SkyRendererOptions => {
    const quality = options?.quality ?? DEFAULT_SKY_RENDERER_OPTIONS.quality;
    const profile = SKY_QUALITY_PROFILES[quality];
    return {
        ...DEFAULT_SKY_RENDERER_OPTIONS,
        ...options,
        quality,
        resolutionScale: Math.min(1, Math.max(0.5, options?.resolutionScale ?? 1)),
        updateRate: Math.min(6, Math.max(1, options?.updateRate ?? profile.updateRate)),
        temporal: options?.temporal ?? DEFAULT_SKY_RENDERER_OPTIONS.temporal,
    };
};

export const selectSkyRendererBackend = (
    preference: SkyRendererPreference,
): SkyRendererBackend => {
    if (preference === "fallback") return "fallback";
    const supportsWebGpu =
        typeof navigator !== "undefined" && "gpu" in navigator;
    if (preference === "auto") {
        return supportsWebGpu ? "webgpu" : "fallback";
    }
    if (preference === "webgpu") return supportsWebGpu ? "webgpu" : "fallback";
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        if (canvas.getContext("webgl2")) return "webgl2";
    }
    return "fallback";
};

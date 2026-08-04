"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";

import { Sky, type SkySnapshot } from "@/components/backgrounds/sky/sky";
import {
    CLOUD_QUALIFICATION_MIN_HISTORY_ACCEPTANCE_FRACTION,
    CLOUD_QUALIFICATION_MIN_PERSISTENT_HISTORY_CONFIDENCE,
    CLOUD_QUALIFICATION_MIN_STABLE_HISTORY_AGE,
    CLOUD_QUALIFICATION_TRANSPORT_UPDATES,
    isCloudReconstructionMature,
} from
    "@/components/backgrounds/sky/cloud-qualification-clock";
import {
    CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION,
    cloudPreviewHighCloudProfile,
    cloudLayersRequireVolumetricLightingEvidence,
    evaluateCloudPreviewHighCloudReadiness,
    evaluateCloudPreviewLightingReadiness,
    minimumHighCloudOccupiedSky,
} from
    "@/components/backgrounds/sky/cloud-preview-lighting-readiness";
import {
    CLOUD_PHOTOGRAPH_CASES,
    CLOUD_PHOTOGRAPH_SUMMARY,
    type CloudPhotographCase,
} from "@/components/backgrounds/sky/cloud-photograph-benchmark";
import {
    resolveOrthogonalCloudPhotographCase,
    type OrthogonalCloudPhotographCase,
} from "@/components/backgrounds/sky/cloud-photograph-orthogonal-benchmark";
import {
    CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS,
    CLOUD_MORPHOLOGY_PHOTOGRAPH_SUMMARY,
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS,
    MORPHOLOGY_PHOTOGRAPH_COVERAGES,
    MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS,
    MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES,
    cloudMorphologyPhotographCaseId,
    type MorphologyPhotographAxis,
} from "@/components/backgrounds/sky/cloud-morphology-photograph-qualification";
import {
    recipeForCloudSpecies,
    rendererSpeciesForClassification,
} from "@/components/backgrounds/sky/cloud-state-map";
import {
    DEFAULT_PRODUCTION_PERSPECTIVE_ID,
    approvedProductionPerspectiveId,
    applyProductionPerspectiveToCloudPhotographCase,
    productionPerspectiveCameraSignature,
    resolveWeatherCloudPhotographCase,
} from
    "@/components/backgrounds/sky/weather-cloud-photograph-benchmark";
import { WEATHER_QUALIFICATION_PERSPECTIVES } from
    "@/components/backgrounds/sky/weather-qualification-matrix";
import type {
    SkyDebugView,
    SkyRendererStats,
} from "@/components/backgrounds/sky/renderer-types";

import {
    CLOUD_CAPTURE_FAILURE_MESSAGE,
    CLOUD_CAPTURE_SHUTDOWN_ACK_MESSAGE,
    isCloudCaptureShutdownMessage,
} from "../cloud-preview-matrix/cloud-capture-protocol";

import styles from "../sky-benchmark/sky-benchmark.module.css";

type CaptureMode = "pair" | "render" | "reference" | "overlay";
type QualificationSet = "base" | "orthogonal" | "weather";

interface CloudLightVolumeReadiness {
    caseId: string;
    state: string;
    generation: number;
    selectedBricks: number;
    readyBricks: number;
    residentLayerMask: number;
    residual: number;
    residualTolerance: number;
    nonFiniteCount: number;
    energyViolationCount: number;
    occupiedCount: number;
    maximumFluence: string;
    maximumNumerator: string;
    maximumDenominator: string;
    maximumBoundary: string;
    maximumCandidate: string;
    nearStorageRailCount: number;
    transportNonFiniteCount: number;
    radianceNonFiniteCount: number;
    maximumTransmittanceChroma: number;
    failure: string;
}

const titleCase = (value: string) => value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());

// React warns (and the development overlay accumulates one issue per render)
// when a diagnostic is temporarily NaN during GPU initialization.  Capture
// attributes are a serialization boundary: publish only finite numbers, or an
// explicit unavailable sentinel which the capture harness already understands.
const finiteDataNumber = (
    value: number | null | undefined,
    fallback = "unavailable",
) => Number.isFinite(value) ? String(value) : fallback;

function StepSelect({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
}) {
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    const step = (offset: number) => onChange(
        options[(index + offset + options.length) % options.length]?.value ?? value,
    );
    return (
        <label>
            {label}
            <span className={styles.stepSelect}>
                <button type="button" aria-label={`Previous ${label}`} onClick={() => step(-1)}>‹</button>
                <select value={value} onChange={(event) => onChange(event.target.value)}>
                    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" aria-label={`Next ${label}`} onClick={() => step(1)}>›</button>
            </span>
        </label>
    );
}

const Reference = ({ benchmark }: { benchmark: CloudPhotographCase }) => (
    <div className={styles.reference} data-benchmark-reference>
        {/* The source photograph is deliberately shown without transforms. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={benchmark.referenceImage} alt={`${benchmark.title} reference`} referrerPolicy="no-referrer" />
    </div>
);

const Render = ({
    benchmark,
    debugView,
    ready,
    paused = false,
    onVisualChange,
    onRendererStats,
}: {
    benchmark: CloudPhotographCase;
    debugView: SkyDebugView;
    ready: boolean;
    paused?: boolean;
    onVisualChange?: (snapshot: SkySnapshot) => void;
    onRendererStats?: (stats: SkyRendererStats) => void;
}) => {
    const preview = useMemo(
        () => ({ ...benchmark.preview, rendererDebugView: debugView }),
        [benchmark.preview, debugView],
    );
    return (
        <div
            className={styles.render}
            data-benchmark-render
            data-cloud-render-ready={ready ? "true" : "false"}
            aria-busy={!ready}
        >
            <Sky
                preview={preview}
                rendererSceneKey={benchmark.id}
                paused={paused}
                contained
                onVisualChange={onVisualChange}
                onRendererStats={onRendererStats}
            />
        </div>
    );
};

const defaultOrthogonalTarget = CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.find(
    (target) => target.id === CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS[0],
) ?? CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS[0];
const DEFAULT_ORTHOGONAL_CASE_ID = cloudMorphologyPhotographCaseId({
    targetId: defaultOrthogonalTarget.id,
    environmentId: defaultOrthogonalTarget.environmentIds[0],
    perspectiveId: defaultOrthogonalTarget.perspectiveIds[0],
    coverageId: defaultOrthogonalTarget.coverageIds[0],
});

const benchmarkUrl = (
    caseId: string,
    capture: CaptureMode,
    debug: SkyDebugView,
    productionPerspective?: string,
    captureParameter: "case" | "weather" = "case",
) => `/cloud-photographs?${captureParameter}=${encodeURIComponent(caseId)}` +
    `&capture=${capture}&debug=${debug}` +
    (productionPerspective
        ? `&productionPerspective=${encodeURIComponent(productionPerspective)}`
        : "");

const RENDERER_DEBUG_VIEWS: readonly SkyDebugView[] = [
    "final",
    "coverage",
    "density",
    "transmittance",
    "depth",
    "velocity",
    "history",
    "lighting",
    "steps",
    "lighting-direct-sun",
    "lighting-exterior-diffuse",
    "lighting-p1-cache",
    "lighting-atmosphere-composite",
    "lighting-source-higher-order",
    "lighting-atmosphere-shadow-loss",
];

const RENDERER_DEBUG_LABELS: Partial<Record<SkyDebugView, string>> = {
    "lighting-direct-sun": "Lighting · direct Sun",
    "lighting-exterior-diffuse": "Lighting · exterior sky / ground",
    "lighting-p1-cache": "Lighting · P1 cache",
    "lighting-atmosphere-composite": "Lighting · atmosphere composite",
    "lighting-source-higher-order": "Lighting · source higher order",
    "lighting-atmosphere-shadow-loss": "Lighting · atmosphere shadow loss",
};

const rendererDebugLabel = (value: SkyDebugView) =>
    RENDERER_DEBUG_LABELS[value] ?? titleCase(value);

export function CloudPhotographBenchmark() {
    const search = useSearchParams();
    const router = useRouter();
    const requestedMode = search.get("capture") as CaptureMode | null;
    const requestedDebug = search.get("debug") as SkyDebugView | null;
    const debugView: SkyDebugView = RENDERER_DEBUG_VIEWS.includes(
        (requestedDebug ?? "") as SkyDebugView,
    )
        ? requestedDebug as SkyDebugView
        : "final";
    const mode: CaptureMode = ["pair", "render", "reference", "overlay"].includes(requestedMode ?? "")
        ? requestedMode as CaptureMode
        : "pair";
    const requestedWeather = search.get("weather");
    const requestedMatrixGeneration = search.get("matrixRun");
    const persistentCaptureSession = mode === "render" &&
        search.get("captureSession") === "persistent";
    const matrixGeneration = requestedMatrixGeneration === null
        ? undefined : Number(requestedMatrixGeneration);
    const requestedProductionPerspective = search.get("productionPerspective");
    const productionPerspective = approvedProductionPerspectiveId(
        requestedProductionPerspective,
    ) ?? DEFAULT_PRODUCTION_PERSPECTIVE_ID;
    const requested = search.get("case");
    // The orthogonal resolver performs four map lookups and creates one case;
    // it never advances the full qualification generator.
    const orthogonalBenchmark = useMemo(
        () => resolveOrthogonalCloudPhotographCase(requested),
        [requested],
    );
    const weatherBenchmark = useMemo(
        () => resolveWeatherCloudPhotographCase(requestedWeather),
        [requestedWeather],
    );
    const baseBenchmark = useMemo(
        () => CLOUD_PHOTOGRAPH_CASES.find((entry) => entry.id === requested) ??
            CLOUD_PHOTOGRAPH_CASES[0],
        [requested],
    );
    const qualificationSet: QualificationSet = weatherBenchmark
        ? "weather" : orthogonalBenchmark ? "orthogonal" : "base";
    const selectedBenchmark: CloudPhotographCase | OrthogonalCloudPhotographCase =
        weatherBenchmark ?? orthogonalBenchmark ?? baseBenchmark;
    // Capture progress updates rerender this component many times. Keep the
    // selected scene referentially stable or Render recreates its preview,
    // Sky recalculates the full physical scene, and the renderer's synchronous
    // stats callback can enter a CPU-bound redraw feedback loop.
    const benchmark = useMemo(
        () => applyProductionPerspectiveToCloudPhotographCase(
            selectedBenchmark,
            productionPerspective,
        ),
        [selectedBenchmark, productionPerspective],
    );
    const productionCameraSignature = productionPerspectiveCameraSignature(
        productionPerspective,
    );
    const morphologyCase = orthogonalBenchmark?.morphologyCase;
    const [overlayOpacity, setOverlayOpacity] = useState(0.5);
    const [visualResult, setVisualResult] = useState<{
        caseId: string;
        snapshot: SkySnapshot;
    }>();
    const [rendererResult, setRendererResult] = useState<{
        caseId: string;
        stats: SkyRendererStats;
    }>();
    const [cloudLightResult, setCloudLightResult] =
        useState<CloudLightVolumeReadiness>();
    const [captureShutdown, setCaptureShutdown] = useState(false);
    // Reset the parent-owned qualification state before Sky's passive effect
    // publishes the new visual snapshot. A passive reset can run after the
    // child's initial onVisualChange callback and erase the only immutable
    // snapshot for a paused capture, leaving an otherwise complete GPU frame
    // stuck in the `scene` readiness state forever.
    useLayoutEffect(() => {
        setCaptureShutdown(false);
        setVisualResult(undefined);
        setRendererResult(undefined);
        setCloudLightResult(undefined);
    }, [benchmark.id, matrixGeneration, productionPerspective]);

    useEffect(() => {
        if (mode !== "render" || !Number.isSafeInteger(matrixGeneration)) return;
        const receiveShutdown = (event: MessageEvent<unknown>) => {
            if (event.origin !== window.location.origin ||
                event.source !== window.parent ||
                !isCloudCaptureShutdownMessage(event.data) ||
                event.data.generation !== matrixGeneration) return;
            setCaptureShutdown(true);
        };
        window.addEventListener("message", receiveShutdown);
        return () => window.removeEventListener("message", receiveShutdown);
    }, [matrixGeneration, mode]);

    useEffect(() => {
        if (!captureShutdown || !Number.isSafeInteger(matrixGeneration)) return;
        // This effect runs only after React committed the renderer's unmount.
        // Yield one browser task so WebGPU effect cleanup (including
        // device.destroy()) completes before acknowledging the matrix host.
        const timer = window.setTimeout(() => {
            window.parent.postMessage({
                type: CLOUD_CAPTURE_SHUTDOWN_ACK_MESSAGE,
                generation: matrixGeneration,
            }, window.location.origin);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [captureShutdown, matrixGeneration]);

    useEffect(() => {
        const readCloudLightVolume = () => {
            const canvas = document.querySelector<HTMLCanvasElement>(
                '[data-benchmark-render] canvas[data-sky-renderer="webgpu"]',
            );
            if (!canvas) return;
            const renderedCaseId = canvas.dataset.cloudSceneKey;
            if (renderedCaseId !== benchmark.id) return;
            const next: CloudLightVolumeReadiness = {
                caseId: renderedCaseId,
                state: canvas.dataset.cloudLightVolumeState ?? "initializing",
                generation: Number(canvas.dataset.cloudLightVolumeGeneration ?? 0),
                selectedBricks: Number(
                    canvas.dataset.cloudLightVolumeSelectedBricks ?? 0,
                ),
                readyBricks: Number(
                    canvas.dataset.cloudLightVolumeReadyBricks ?? 0,
                ),
                residentLayerMask: Number(
                    canvas.dataset.cloudLightVolumeResidentLayerMask ?? 0,
                ),
                residual: Number(
                    canvas.dataset.cloudLightVolumeResidual ?? Number.NaN,
                ),
                residualTolerance: Number(
                    canvas.dataset.cloudLightVolumeResidualTolerance ?? Number.NaN,
                ),
                nonFiniteCount: Number(
                    canvas.dataset.cloudLightVolumeResidualNonFiniteCount ?? 0,
                ),
                energyViolationCount: Number(
                    canvas.dataset.cloudLightVolumeResidualEnergyViolationCount ?? 0,
                ),
                occupiedCount: Number(
                    canvas.dataset.cloudLightVolumeResidualOccupiedCount ?? 0,
                ),
                maximumFluence:
                    canvas.dataset.cloudLightVolumeMaximumFluence ?? "0,0,0",
                maximumNumerator:
                    canvas.dataset.cloudLightVolumeMaximumNumerator ?? "0,0,0",
                maximumDenominator:
                    canvas.dataset.cloudLightVolumeMaximumDenominator ?? "0,0,0",
                maximumBoundary:
                    canvas.dataset.cloudLightVolumeMaximumBoundary ?? "0,0,0",
                maximumCandidate:
                    canvas.dataset.cloudLightVolumeMaximumCandidate ?? "0,0,0",
                nearStorageRailCount: Number(
                    canvas.dataset.cloudLightVolumeNearStorageRailCount ?? 0),
                transportNonFiniteCount: Number(
                    canvas.dataset.cloudTransportNonFiniteCount ?? Number.NaN),
                radianceNonFiniteCount: Number(
                    canvas.dataset.cloudRadianceNonFiniteCount ?? Number.NaN),
                maximumTransmittanceChroma: Number(
                    canvas.dataset.cloudMaximumTransmittanceChroma ?? Number.NaN),
                failure: canvas.dataset.cloudLightVolumeResidualFailure ?? "unavailable",
            };
            setCloudLightResult((previous) => previous?.caseId === next.caseId &&
                previous.state === next.state &&
                previous.generation === next.generation &&
                previous.selectedBricks === next.selectedBricks &&
                previous.readyBricks === next.readyBricks &&
                previous.residentLayerMask === next.residentLayerMask &&
                Object.is(previous.residual, next.residual) &&
                Object.is(previous.residualTolerance, next.residualTolerance) &&
                previous.nonFiniteCount === next.nonFiniteCount &&
                previous.energyViolationCount === next.energyViolationCount &&
                previous.occupiedCount === next.occupiedCount &&
                previous.maximumFluence === next.maximumFluence &&
                previous.maximumNumerator === next.maximumNumerator &&
                previous.maximumDenominator === next.maximumDenominator &&
                previous.maximumBoundary === next.maximumBoundary &&
                previous.maximumCandidate === next.maximumCandidate &&
                previous.nearStorageRailCount === next.nearStorageRailCount &&
                Object.is(previous.transportNonFiniteCount,
                    next.transportNonFiniteCount) &&
                Object.is(previous.radianceNonFiniteCount,
                    next.radianceNonFiniteCount) &&
                Object.is(previous.maximumTransmittanceChroma,
                    next.maximumTransmittanceChroma) &&
                previous.failure === next.failure
                ? previous : next);
        };
        readCloudLightVolume();
        const observer = new MutationObserver(readCloudLightVolume);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [
                "data-cloud-light-volume-state",
                "data-cloud-scene-key",
                "data-cloud-light-volume-generation",
                "data-cloud-light-volume-selected-bricks",
                "data-cloud-light-volume-ready-bricks",
                "data-cloud-light-volume-resident-layer-mask",
                "data-cloud-light-volume-residual",
                "data-cloud-light-volume-residual-tolerance",
                "data-cloud-light-volume-residual-non-finite-count",
                "data-cloud-light-volume-residual-energy-violation-count",
                "data-cloud-light-volume-residual-occupied-count",
                "data-cloud-light-volume-maximum-fluence",
                "data-cloud-light-volume-maximum-numerator",
                "data-cloud-light-volume-maximum-denominator",
                "data-cloud-light-volume-maximum-boundary",
                "data-cloud-light-volume-maximum-candidate",
                "data-cloud-light-volume-near-storage-rail-count",
                "data-cloud-transport-non-finite-count",
                "data-cloud-radiance-non-finite-count",
                "data-cloud-maximum-transmittance-chroma",
                "data-cloud-light-volume-residual-failure",
            ],
            childList: true,
            subtree: true,
        });
        return () => observer.disconnect();
    }, [benchmark.id]);

    const familyCases = useMemo(
        () => CLOUD_PHOTOGRAPH_CASES.filter((entry) => entry.genus === baseBenchmark.genus),
        [baseBenchmark.genus],
    );
    const speciesOptions = useMemo(
        () => [...new Set(familyCases.map((entry) => entry.species))],
        [familyCases],
    );
    const baseEnvironments = useMemo(
        () => [...new Map(CLOUD_PHOTOGRAPH_CASES.map((entry) =>
            [entry.environment.id, entry.environment])).values()],
        [],
    );
    const rendererSpecies = rendererSpeciesForClassification(benchmark.classification);
    const rendererRecipe = rendererSpecies
        ? recipeForCloudSpecies(rendererSpecies)
        : undefined;
    const snapshot = visualResult?.caseId === benchmark.id
        ? visualResult.snapshot
        : undefined;
    const rendererStats = rendererResult?.caseId === benchmark.id
        ? rendererResult.stats
        : undefined;
    const cloudLight = cloudLightResult?.caseId === benchmark.id
        ? cloudLightResult
        : undefined;
    const cloudTransportMeasured = Boolean(
        cloudLight &&
        Number.isFinite(cloudLight.transportNonFiniteCount) &&
        Number.isFinite(cloudLight.radianceNonFiniteCount) &&
        Number.isFinite(cloudLight.maximumTransmittanceChroma)
    );
    const cloudTransportInvalid = Boolean(
        cloudTransportMeasured && cloudLight &&
        (cloudLight.transportNonFiniteCount !== 0 ||
            cloudLight.radianceNonFiniteCount !== 0)
    );
    // `residual-above-tolerance` is progress, not a terminal error: the
    // multigrid solver publishes it between bounded V-cycles while the light
    // volume remains in `warming`.  Only the renderer's terminal state may
    // reject a capture; otherwise cycle one would fail every scene that needs
    // the intended refinement cycles.
    const cloudLightFailed = Boolean(
        cloudLight && cloudLight.state === "failed",
    );
    const requiresTroposphericCloudEvidence = Boolean(
        benchmark.preview.cloudScene?.layers.some((layer) => layer.present),
    );
    const reconstructionMeasured = Boolean(
        rendererStats &&
        Number.isFinite(rendererStats.rawRadianceTemporalDelta) &&
        Number.isFinite(rendererStats.rawTransmittanceTemporalDelta) &&
        Number.isFinite(rendererStats.resolvedRadianceTemporalDelta) &&
        Number.isFinite(rendererStats.historyAcceptanceFraction) &&
        Number.isFinite(rendererStats.stableHistoryAge) &&
        Number.isFinite(rendererStats.persistentHistoryConfidence) &&
        rendererStats.reconstructionRawNonFiniteCount === 0 &&
        rendererStats.reconstructionResolvedNonFiniteCount === 0
    );
    const reconstructionMature = !requiresTroposphericCloudEvidence || Boolean(
        rendererStats && reconstructionMeasured && isCloudReconstructionMature({
            historyAcceptanceFraction:
                rendererStats.historyAcceptanceFraction,
            stableHistoryAge: rendererStats.stableHistoryAge,
            persistentHistoryConfidence:
                rendererStats.persistentHistoryConfidence,
        })
    );
    const requiresVolumetricLighting = cloudLayersRequireVolumetricLightingEvidence(
        benchmark.preview.cloudScene?.layers ?? [],
    );
    const exactOnlyCloudLightReady = Boolean(
        cloudLight &&
        cloudLight.generation > 0 &&
        cloudLight.state === "empty" &&
        !requiresVolumetricLighting &&
        cloudTransportMeasured &&
        cloudLight.transportNonFiniteCount === 0 &&
        cloudLight.radianceNonFiniteCount === 0 &&
        cloudLight.failure === "none"
    );
    const cachedCloudLightReady = Boolean(
        cloudLight &&
        cloudLight.generation > 0 &&
        cloudLight.state === "complete" &&
        cloudLight.readyBricks === cloudLight.selectedBricks &&
        (
            // A zero resident mask is a complete exact-only generation. It may
            // still contain ready direct/Beer brick grids, but no low-frequency
            // P1 texel is reachable; the analytic owner transport remains
            // authoritative and has no diffusion residual to qualify.
            cloudLight.residentLayerMask === 0 ||
            (cloudLight.residentLayerMask !== 0 &&
                cloudLight.selectedBricks > 0 &&
                Number.isFinite(cloudLight.residual) &&
                Number.isFinite(cloudLight.residualTolerance) &&
                cloudLight.residual <= cloudLight.residualTolerance &&
                cloudLight.nonFiniteCount === 0 &&
                cloudLight.energyViolationCount === 0 &&
                cloudLight.nearStorageRailCount === 0 &&
                cloudLight.occupiedCount > 0)
        ) &&
        cloudTransportMeasured &&
        cloudLight.transportNonFiniteCount === 0 &&
        cloudLight.radianceNonFiniteCount === 0 &&
        cloudLight.failure === "none"
    );
    const cloudLightReady = !requiresTroposphericCloudEvidence ||
        exactOnlyCloudLightReady || cachedCloudLightReady;
    const expectedCoverage = Math.max(
        0,
        ...(benchmark.preview.cloudScene?.layers ?? []).map((layer) =>
            layer.present ? layer.coverage : 0),
    );
    const minimumOccupiedSky = Math.max(0.0025, expectedCoverage * 0.02);
    const highCloudProfile = cloudPreviewHighCloudProfile(
        benchmark.preview.cloudScene?.layers ?? [],
    );
    const highCloudMinimumOccupiedSky = minimumHighCloudOccupiedSky(
        benchmark.preview.cloudScene?.layers ?? [],
    );
    const volumetricLighting = evaluateCloudPreviewLightingReadiness({
        requiresVolumetricLighting,
        rawRadianceSpatialVariation:
            rendererStats?.rawRadianceSpatialVariation,
        resolvedRadianceSpatialVariation:
            rendererStats?.resolvedRadianceSpatialVariation,
        selectedBricks: cloudLight?.selectedBricks ?? 0,
        readyBricks: cloudLight?.readyBricks ?? 0,
        residentLayerMask: cloudLight?.residentLayerMask ?? 0,
        occupiedP1Voxels: cloudLight?.occupiedCount ?? 0,
    });
    const highCloud = evaluateCloudPreviewHighCloudReadiness({
        profile: highCloudProfile,
        rawRadianceSpatialVariation:
            rendererStats?.rawRadianceSpatialVariation,
        resolvedRadianceSpatialVariation:
            rendererStats?.resolvedRadianceSpatialVariation,
        projectedOpacity: rendererStats?.projectedOpacity,
        occupiedSkyFraction: rendererStats?.occupiedSkyFraction,
        minimumOccupiedSkyFraction: highCloudMinimumOccupiedSky,
    });
    const handleVisualChange = useCallback((next: SkySnapshot) => {
        setVisualResult({ caseId: benchmark.id, snapshot: next });
    }, [benchmark.id]);
    const handleRendererStats = useCallback((next: SkyRendererStats) => {
        if (!next.sceneKey) return;
        setRendererResult({ caseId: next.sceneKey, stats: next });
    }, []);
    const renderReady = Boolean(
        snapshot &&
        rendererStats?.backend === "webgpu" &&
        !rendererStats.lastError &&
        cloudLightReady &&
        rendererStats.historyValid &&
        (rendererStats.transportUpdates ?? 0) >=
            CLOUD_QUALIFICATION_TRANSPORT_UPDATES &&
        reconstructionMature &&
        volumetricLighting.ready &&
        highCloud.ready &&
        (!requiresTroposphericCloudEvidence || (
            rendererStats.projectedOpacity !== null &&
            rendererStats.projectedOpacity !== undefined &&
            rendererStats.projectedOpacity > 0.00001 &&
            rendererStats.occupiedSkyFraction !== null &&
            rendererStats.occupiedSkyFraction !== undefined &&
            rendererStats.occupiedSkyFraction > minimumOccupiedSky
        ))
    );
    const readinessState = !snapshot
        ? "scene"
        : !rendererStats
            ? "renderer"
            : rendererStats.backend !== "webgpu" || rendererStats.lastError
                ? "failed"
                : cloudLightFailed
                    ? "failed"
                    : cloudTransportInvalid
                        ? "failed"
                        : !cloudLightReady
                            ? "lighting"
                            : !rendererStats.historyValid
                                ? "transport"
                                : (rendererStats.transportUpdates ?? 0) <
                                        CLOUD_QUALIFICATION_TRANSPORT_UPDATES
                                    ? "converging"
                                    : !requiresTroposphericCloudEvidence
                                        ? "ready"
                                        : !volumetricLighting.ready
                                            ? "lighting-evidence"
                                        : !highCloud.ready
                                            ? "high-cloud-evidence"
                                        : rendererStats.projectedOpacity === null ||
                                            rendererStats.projectedOpacity === undefined
                                            ? "measuring"
                                            : rendererStats.projectedOpacity <= 0.00001 ||
                                                (rendererStats.occupiedSkyFraction ?? 0) <= minimumOccupiedSky
                                                ? "empty"
                                                : !reconstructionMature
                                                    ? "reconstruction"
                                                    : "ready";
    const rendererFailure = rendererStats?.lastError;
    useEffect(() => {
        if (mode !== "render" || captureShutdown ||
            !Number.isSafeInteger(matrixGeneration) || !rendererFailure) return;
        window.parent.postMessage({
            type: CLOUD_CAPTURE_FAILURE_MESSAGE,
            generation: matrixGeneration,
            reason: rendererFailure,
        }, window.location.origin);
    }, [captureShutdown, matrixGeneration, mode, rendererFailure]);
    const replaceCase = (
        caseId: string,
        nextMode: CaptureMode = mode,
        nextDebug: SkyDebugView = debugView,
        nextProductionPerspective: string = productionPerspective,
        captureParameter: "case" | "weather" = "case",
    ) => router.replace(benchmarkUrl(
        caseId,
        nextMode,
        nextDebug,
        nextProductionPerspective,
        captureParameter,
    ), { scroll: false });

    useEffect(() => {
        if (!persistentCaptureSession) return undefined;
        type CaptureSwitchRequest = {
            caseId: string;
            captureParameter: "case" | "weather";
            productionPerspective: string;
        };
        type CaptureWindow = Window & {
            __elementsCloudPreviewCapture?: {
                switchCase: (request: CaptureSwitchRequest) => boolean;
            };
        };
        const captureWindow = window as CaptureWindow;
        const bridge = {
            switchCase: (request: CaptureSwitchRequest) => {
                if (!request || typeof request.caseId !== "string" ||
                    !["case", "weather"].includes(request.captureParameter) ||
                    request.productionPerspective !== productionPerspective) {
                    return false;
                }
                router.replace(
                    benchmarkUrl(
                        request.caseId,
                        "render",
                        "final",
                        productionPerspective,
                        request.captureParameter,
                    ) + "&captureSession=persistent",
                    { scroll: false },
                );
                return true;
            },
        };
        captureWindow.__elementsCloudPreviewCapture = bridge;
        return () => {
            if (captureWindow.__elementsCloudPreviewCapture === bridge) {
                delete captureWindow.__elementsCloudPreviewCapture;
            }
        };
    }, [persistentCaptureSession, productionPerspective, router]);
    const navigateBase = (
        nextGenus: string,
        nextSpecies: string,
        nextEnvironment: string,
        nextMode = mode,
    ) => {
        const entry = CLOUD_PHOTOGRAPH_CASES.find((item) =>
            item.genus === nextGenus && item.species === nextSpecies &&
            item.environment.id === nextEnvironment,
        ) ?? CLOUD_PHOTOGRAPH_CASES.find((item) =>
            item.genus === nextGenus && item.environment.id === nextEnvironment,
        ) ?? CLOUD_PHOTOGRAPH_CASES.find((item) => item.genus === nextGenus)
            ?? CLOUD_PHOTOGRAPH_CASES[0];
        replaceCase(entry.id, nextMode);
    };
    const navigateOrthogonal = ({
        targetId,
        environmentId,
        perspectiveId,
        coverageId,
        nextMode = mode,
    }: {
        targetId: string;
        environmentId?: string;
        perspectiveId?: string;
        coverageId?: string;
        nextMode?: CaptureMode;
    }) => {
        const target = CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.find(
            (candidate) => candidate.id === targetId,
        ) ?? defaultOrthogonalTarget;
        replaceCase(cloudMorphologyPhotographCaseId({
            targetId: target.id,
            environmentId: environmentId && target.environmentIds.includes(environmentId)
                ? environmentId : target.environmentIds[0],
            perspectiveId: perspectiveId && target.perspectiveIds.includes(perspectiveId)
                ? perspectiveId : target.perspectiveIds[0],
            coverageId: coverageId && target.coverageIds.some((id) => id === coverageId)
                ? coverageId : target.coverageIds[0],
        }), nextMode);
    };

    if (mode === "render") return (
        <main
            className={styles.capture}
            data-benchmark-case={benchmark.id}
            data-benchmark-kind={qualificationSet}
            data-production-perspective={productionPerspective}
            data-production-camera-signature={productionCameraSignature}
            data-cloud-debug-view={debugView}
            data-cloud-requested-scene-key={benchmark.id}
            data-cloud-render-state={readinessState}
            data-cloud-render-failure={rendererFailure ?? "none"}
            data-cloud-capture-shutdown={captureShutdown ? "complete" : "active"}
        >
            {!captureShutdown && <Render
                    benchmark={benchmark}
                    debugView={debugView}
                    ready={renderReady}
                    paused
                    onVisualChange={handleVisualChange}
                    onRendererStats={handleRendererStats}
                />}
            <output
                className={styles.captureReady}
                data-benchmark-ready={renderReady ? "ready" : "rendering"}
                data-cloud-scene-key={rendererStats?.sceneKey ?? "unavailable"}
                data-cloud-debug-view={debugView}
                data-cloud-render-state={readinessState}
                data-cloud-render-failure={rendererFailure ?? "none"}
                data-cloud-projected-opacity={finiteDataNumber(rendererStats?.projectedOpacity)}
                data-cloud-occupied-sky={finiteDataNumber(rendererStats?.occupiedSkyFraction)}
                data-cloud-minimum-occupied-sky={minimumOccupiedSky}
                data-cloud-transport-updates={rendererStats?.transportUpdates ?? 0}
                data-cloud-raw-radiance-temporal-delta={finiteDataNumber(rendererStats?.rawRadianceTemporalDelta)}
                data-cloud-raw-transmittance-temporal-delta={finiteDataNumber(rendererStats?.rawTransmittanceTemporalDelta)}
                data-cloud-resolved-radiance-temporal-delta={finiteDataNumber(rendererStats?.resolvedRadianceTemporalDelta)}
                data-cloud-raw-resolved-radiance-residual={finiteDataNumber(rendererStats?.rawResolvedRadianceResidual)}
                data-cloud-history-acceptance-fraction={finiteDataNumber(rendererStats?.historyAcceptanceFraction)}
                data-cloud-stable-history-age={finiteDataNumber(rendererStats?.stableHistoryAge)}
                data-cloud-persistent-history-confidence={finiteDataNumber(rendererStats?.persistentHistoryConfidence)}
                data-cloud-minimum-history-acceptance-fraction={CLOUD_QUALIFICATION_MIN_HISTORY_ACCEPTANCE_FRACTION}
                data-cloud-minimum-stable-history-age={CLOUD_QUALIFICATION_MIN_STABLE_HISTORY_AGE}
                data-cloud-minimum-persistent-history-confidence={CLOUD_QUALIFICATION_MIN_PERSISTENT_HISTORY_CONFIDENCE}
                data-cloud-reconstruction-mature={reconstructionMature ? "true" : "false"}
                data-cloud-requires-volumetric-lighting={requiresVolumetricLighting ? "true" : "false"}
                data-cloud-volumetric-lighting-ready={volumetricLighting.ready ? "true" : "false"}
                data-cloud-high-cloud-profile={highCloudProfile}
                data-cloud-high-cloud-ready={highCloud.ready ? "true" : "false"}
                data-cloud-high-cloud-spatial-structure-ready={highCloud.spatialStructureReady ? "true" : "false"}
                data-cloud-high-cloud-footprint-ready={highCloud.footprintReady ? "true" : "false"}
                data-cloud-minimum-high-cloud-occupied-sky={highCloudMinimumOccupiedSky}
                data-cloud-minimum-high-cloud-raw-radiance-spatial-variation={CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION}
                data-cloud-minimum-high-cloud-resolved-radiance-spatial-variation={CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION}
                data-cloud-direct-volume-ready={volumetricLighting.directVolumeReady ? "true" : "false"}
                data-cloud-resident-p1-ready={volumetricLighting.residentP1Ready ? "true" : "false"}
                data-cloud-minimum-raw-radiance-spatial-variation={CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION}
                data-cloud-minimum-resolved-radiance-spatial-variation={CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION}
                data-cloud-raw-radiance-spatial-variation={finiteDataNumber(rendererStats?.rawRadianceSpatialVariation)}
                data-cloud-resolved-radiance-spatial-variation={finiteDataNumber(rendererStats?.resolvedRadianceSpatialVariation)}
                data-cloud-first-depth-temporal-delta={finiteDataNumber(rendererStats?.firstDepthTemporalDelta)}
                data-cloud-mean-depth-temporal-delta={finiteDataNumber(rendererStats?.meanDepthTemporalDelta)}
                data-cloud-optical-depth-temporal-delta={finiteDataNumber(rendererStats?.opticalDepthTemporalDelta)}
                data-cloud-reconstruction-raw-non-finite-count={finiteDataNumber(rendererStats?.reconstructionRawNonFiniteCount)}
                data-cloud-reconstruction-resolved-non-finite-count={finiteDataNumber(rendererStats?.reconstructionResolvedNonFiniteCount)}
                data-cloud-light-volume-state={cloudLight?.state ?? "initializing"}
                data-cloud-light-volume-generation={cloudLight?.generation ?? 0}
                data-cloud-light-volume-selected-bricks={cloudLight?.selectedBricks ?? 0}
                data-cloud-light-volume-ready-bricks={cloudLight?.readyBricks ?? 0}
                data-cloud-light-volume-resident-layer-mask={cloudLight?.residentLayerMask ?? 0}
                data-cloud-light-volume-residual={finiteDataNumber(cloudLight?.residual)}
                data-cloud-light-volume-residual-tolerance={finiteDataNumber(cloudLight?.residualTolerance)}
                data-cloud-light-volume-residual-non-finite-count={cloudLight?.nonFiniteCount ?? 0}
                data-cloud-light-volume-residual-energy-violation-count={cloudLight?.energyViolationCount ?? 0}
                data-cloud-light-volume-residual-occupied-count={cloudLight?.occupiedCount ?? 0}
                data-cloud-light-volume-maximum-fluence={cloudLight?.maximumFluence ?? "0,0,0"}
                data-cloud-light-volume-maximum-numerator={cloudLight?.maximumNumerator ?? "0,0,0"}
                data-cloud-light-volume-maximum-denominator={cloudLight?.maximumDenominator ?? "0,0,0"}
                data-cloud-light-volume-maximum-boundary={cloudLight?.maximumBoundary ?? "0,0,0"}
                data-cloud-light-volume-maximum-candidate={cloudLight?.maximumCandidate ?? "0,0,0"}
                data-cloud-light-volume-near-storage-rail-count={cloudLight?.nearStorageRailCount ?? 0}
                data-cloud-transport-non-finite-count={finiteDataNumber(cloudLight?.transportNonFiniteCount)}
                data-cloud-radiance-non-finite-count={finiteDataNumber(cloudLight?.radianceNonFiniteCount)}
                data-cloud-maximum-transmittance-chroma={finiteDataNumber(cloudLight?.maximumTransmittanceChroma)}
                data-cloud-light-volume-residual-failure={cloudLight?.failure ?? "unavailable"}
            >
                {renderReady ? "ready" : readinessState}
            </output>
        </main>
    );
    if (mode === "reference") return (
        <main className={styles.capture} data-benchmark-case={benchmark.id}>
            <Reference benchmark={benchmark} />
        </main>
    );

    const genusOptions = [...new Set(CLOUD_PHOTOGRAPH_CASES.map((entry) => entry.genus))];
    const axisOptions = [...new Set(CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map(
        (target) => target.axis,
    ))];
    const selectedAxis = morphologyCase?.target.axis ?? axisOptions[0];
    const targetsForAxis = CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.filter(
        (target) => target.axis === selectedAxis,
    );
    const environmentOptions = morphologyCase
        ? morphologyCase.target.environmentIds.map((id) =>
            MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS.find((entry) => entry.id === id)!)
        : [];
    const perspectiveOptions = morphologyCase
        ? morphologyCase.target.perspectiveIds.map((id) =>
            MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES.find((entry) => entry.id === id)!)
        : [];
    const coverageOptions = morphologyCase
        ? morphologyCase.target.coverageIds.map((id) =>
            MORPHOLOGY_PHOTOGRAPH_COVERAGES.find((entry) => entry.id === id)!)
        : [];
    return (
        <main
            className={styles.page}
            data-benchmark-case={benchmark.id}
            data-benchmark-kind={qualificationSet}
            data-production-perspective={productionPerspective}
            data-production-camera-signature={productionCameraSignature}
            data-cloud-render-state={readinessState}
        >
            <section className={styles.viewer}>
                {mode === "overlay" ? (
                    <div className={styles.overlay}>
                        <Render benchmark={benchmark} debugView={debugView} ready={renderReady} onVisualChange={handleVisualChange} onRendererStats={handleRendererStats} />
                        <div className={styles.overlayReference} style={{ opacity: overlayOpacity }}><Reference benchmark={benchmark} /></div>
                    </div>
                ) : (
                    <div className={styles.pair}>
                        <figure><Reference benchmark={benchmark} /><figcaption>WMO photographic morphology target</figcaption></figure>
                        <figure><Render benchmark={benchmark} debugView={debugView} ready={renderReady} onVisualChange={handleVisualChange} onRendererStats={handleRendererStats} /><figcaption>Labeled renderer qualification state</figcaption></figure>
                    </div>
                )}
            </section>
            <aside className={styles.panel}>
                <header>
                    <p className={styles.eyebrow}>Unlisted photographic qualification</p>
                    <h1>Cloud family evidence</h1>
                    <p>{qualificationSet === "base"
                        ? `${CLOUD_PHOTOGRAPH_SUMMARY.references} labeled forms · ${CLOUD_PHOTOGRAPH_SUMMARY.environments} environments · ${CLOUD_PHOTOGRAPH_SUMMARY.cases} base renders`
                        : `${CLOUD_MORPHOLOGY_PHOTOGRAPH_SUMMARY.targets} orthogonal targets · one lazy current case`}</p>
                </header>
                <div className={styles.filters}>
                    <StepSelect label="Production perspective"
                        value={productionPerspective}
                        options={WEATHER_QUALIFICATION_PERSPECTIVES.map(
                            (perspective) => ({
                                value: perspective.id,
                                label: perspective.label,
                            }),
                        )}
                        onChange={(value) => replaceCase(
                            benchmark.id,
                            mode,
                            debugView,
                            value,
                            qualificationSet === "weather" ? "weather" : "case",
                        )} />
                    <StepSelect label="Qualification set" value={qualificationSet} options={[
                        { value: "base", label: "Base species" },
                        { value: "orthogonal", label: "Varieties & features" },
                    ]} onChange={(value) => replaceCase(value === "orthogonal"
                        ? DEFAULT_ORTHOGONAL_CASE_ID : CLOUD_PHOTOGRAPH_CASES[0].id)} />
                    {qualificationSet === "base" ? <>
                        <StepSelect label="Cloud genus" value={baseBenchmark.genus} options={genusOptions.map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => navigateBase(value, baseBenchmark.species, baseBenchmark.environment.id)} />
                        <StepSelect label="Species / regime" value={baseBenchmark.species} options={speciesOptions.map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => navigateBase(baseBenchmark.genus, value, baseBenchmark.environment.id)} />
                        <StepSelect label="Lighting environment" value={baseBenchmark.environment.id} options={baseEnvironments.map((value) => ({ value: value.id, label: value.label }))} onChange={(value) => navigateBase(baseBenchmark.genus, baseBenchmark.species, value)} />
                    </> : morphologyCase && <>
                        <StepSelect label="Morphology axis" value={selectedAxis} options={axisOptions.map((value) => ({ value, label: titleCase(value) }))} onChange={(value) => {
                            const target = CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.find(
                                (candidate) => candidate.axis === value as MorphologyPhotographAxis,
                            ) ?? defaultOrthogonalTarget;
                            navigateOrthogonal({ targetId: target.id });
                        }} />
                        <StepSelect label="Target" value={morphologyCase.target.id} options={targetsForAxis.map((target) => ({ value: target.id, label: target.label }))} onChange={(value) => navigateOrthogonal({
                            targetId: value,
                            environmentId: morphologyCase.environment.id,
                            perspectiveId: morphologyCase.perspective.id,
                            coverageId: morphologyCase.coverage.id,
                        })} />
                        <StepSelect label="Physical environment" value={morphologyCase.environment.id} options={environmentOptions.map((value) => ({ value: value.id, label: value.label }))} onChange={(value) => navigateOrthogonal({
                            targetId: morphologyCase.target.id,
                            environmentId: value,
                            perspectiveId: morphologyCase.perspective.id,
                            coverageId: morphologyCase.coverage.id,
                        })} />
                        <StepSelect label="Target resolver perspective" value={morphologyCase.perspective.id} options={perspectiveOptions.map((value) => ({ value: value.id, label: value.label }))} onChange={(value) => navigateOrthogonal({
                            targetId: morphologyCase.target.id,
                            environmentId: morphologyCase.environment.id,
                            perspectiveId: value,
                            coverageId: morphologyCase.coverage.id,
                        })} />
                        <StepSelect label="Coverage" value={morphologyCase.coverage.id} options={coverageOptions.map((value) => ({ value: value.id, label: value.label }))} onChange={(value) => navigateOrthogonal({
                            targetId: morphologyCase.target.id,
                            environmentId: morphologyCase.environment.id,
                            perspectiveId: morphologyCase.perspective.id,
                            coverageId: value,
                        })} />
                    </>}
                    <StepSelect label="View" value={mode} options={[{ value: "pair", label: "Side by side" }, { value: "overlay", label: "Reference overlay" }]} onChange={(value) => replaceCase(
                        benchmark.id,
                        value as CaptureMode,
                        debugView,
                        productionPerspective,
                        qualificationSet === "weather" ? "weather" : "case",
                    )} />
                        <StepSelect label="Renderer output" value={debugView} options={RENDERER_DEBUG_VIEWS.map((value) => ({ value, label: rendererDebugLabel(value) }))} onChange={(value) => replaceCase(
                            benchmark.id,
                            mode,
                            value as SkyDebugView,
                            productionPerspective,
                            qualificationSet === "weather" ? "weather" : "case",
                        )} />
                    {mode === "overlay" && <label>Reference opacity {Math.round(overlayOpacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} /></label>}
                </div>
                <dl className={styles.metadata}>
                    <div><dt>Identity</dt><dd>{benchmark.title}</dd></div>
                    {morphologyCase && <div><dt>Qualification axis</dt><dd>{titleCase(morphologyCase.target.axis)}</dd></div>}
                    {(benchmark.classification.varieties.length > 0 ||
                        benchmark.classification.supplementaryFeatures.length > 0 ||
                        benchmark.classification.accessoryClouds.length > 0) &&
                        <div><dt>WMO attributes</dt><dd>{[
                            ...benchmark.classification.varieties,
                            ...benchmark.classification.supplementaryFeatures,
                            ...benchmark.classification.accessoryClouds,
                        ].map(titleCase).join(" · ")}</dd></div>}
                    <div><dt>Environment</dt><dd>{benchmark.environment.description}</dd></div>
                    <div><dt>Camera</dt><dd>{titleCase(benchmark.environment.perspective)} · {benchmark.environment.horizontalFov}° · {benchmark.environment.viewElevation}° elevation</dd></div>
                    <div><dt>Placement</dt><dd>{titleCase(benchmark.environment.regime)}</dd></div>
                    {rendererRecipe && <>
                        <div><dt>Topology</dt><dd>{titleCase(rendererRecipe.macroTopology)}</dd></div>
                        <div><dt>Material</dt><dd>{titleCase(rendererRecipe.materialModel)}</dd></div>
                        <div><dt>Resolved scale</dt><dd>{rendererRecipe.elementScaleKm[0]}–{rendererRecipe.elementScaleKm[1]} km · {rendererRecipe.verticalAspect[0]}–{rendererRecipe.verticalAspect[1]} aspect</dd></div>
                        <div><dt>Density system</dt><dd>{rendererRecipe.densityOperators.map(titleCase).join(" · ")}</dd></div>
                        <div><dt>Organization</dt><dd>{rendererRecipe.organizationOperators.map(titleCase).join(" · ")}</dd></div>
                    </>}
                    <div><dt>Acceptance</dt><dd><ul className={styles.cueList}>{benchmark.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul></dd></div>
                    {snapshot && <div><dt>Result</dt><dd>{snapshot.lightingRegime} · {snapshot.visibleStars} stars</dd></div>}
                </dl>
                <footer>
                    <a href={benchmark.source} target="_blank" rel="noreferrer">WMO International Cloud Atlas</a>
                    {morphologyCase && <a href={morphologyCase.reference.taxonomyUrl} target="_blank" rel="noreferrer">WMO definition</a>}
                    <p>{benchmark.credit}. Reference is linked from its original source and is not bundled with the app.</p>
                </footer>
            </aside>
            <output
                className={styles.captureReady}
                data-benchmark-ready={renderReady ? "ready" : "rendering"}
                data-cloud-scene-key={rendererStats?.sceneKey ?? "unavailable"}
                data-cloud-render-state={readinessState}
                data-cloud-projected-opacity={finiteDataNumber(rendererStats?.projectedOpacity)}
                data-cloud-occupied-sky={finiteDataNumber(rendererStats?.occupiedSkyFraction)}
                data-cloud-transport-updates={rendererStats?.transportUpdates ?? 0}
                data-cloud-history-acceptance-fraction={finiteDataNumber(rendererStats?.historyAcceptanceFraction)}
                data-cloud-stable-history-age={finiteDataNumber(rendererStats?.stableHistoryAge)}
                data-cloud-persistent-history-confidence={finiteDataNumber(rendererStats?.persistentHistoryConfidence)}
                data-cloud-minimum-history-acceptance-fraction={CLOUD_QUALIFICATION_MIN_HISTORY_ACCEPTANCE_FRACTION}
                data-cloud-minimum-stable-history-age={CLOUD_QUALIFICATION_MIN_STABLE_HISTORY_AGE}
                data-cloud-minimum-persistent-history-confidence={CLOUD_QUALIFICATION_MIN_PERSISTENT_HISTORY_CONFIDENCE}
                data-cloud-reconstruction-mature={reconstructionMature ? "true" : "false"}
                data-cloud-light-volume-state={cloudLight?.state ?? "initializing"}
                data-cloud-light-volume-generation={cloudLight?.generation ?? 0}
                data-cloud-light-volume-selected-bricks={cloudLight?.selectedBricks ?? 0}
                data-cloud-light-volume-ready-bricks={cloudLight?.readyBricks ?? 0}
                data-cloud-light-volume-resident-layer-mask={cloudLight?.residentLayerMask ?? 0}
                data-cloud-light-volume-residual={finiteDataNumber(cloudLight?.residual)}
                data-cloud-light-volume-residual-tolerance={finiteDataNumber(cloudLight?.residualTolerance)}
                data-cloud-light-volume-residual-non-finite-count={cloudLight?.nonFiniteCount ?? 0}
                data-cloud-light-volume-residual-energy-violation-count={cloudLight?.energyViolationCount ?? 0}
                data-cloud-light-volume-residual-occupied-count={cloudLight?.occupiedCount ?? 0}
                data-cloud-light-volume-residual-failure={cloudLight?.failure ?? "unavailable"}
            >
                {renderReady ? "ready" : readinessState}
            </output>
        </main>
    );
}

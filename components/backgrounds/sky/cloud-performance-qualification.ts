export const CLOUD_DEVICE_QUALIFICATION_SCHEMA_VERSION = 1 as const;

export type CloudDeviceClass =
    | "high-end-discrete"
    | "mid-range-discrete"
    | "modern-integrated"
    | "battery-constrained"
    | "privacy-reduced-adapter";

export type CloudQualityTier = "battery" | "balanced" | "high";

export interface CloudPerformanceBudget {
    fullFrameP50Milliseconds: number;
    fullFrameP95Milliseconds: number;
    fullFrameMaximumMilliseconds: number;
    cloudTransportP95Milliseconds: number;
    initializationMaximumMilliseconds: number;
    memoryHighWaterMegabytes: number;
    maximumCadenceDegradationFraction: number;
    minimumHistoryAcceptanceFraction: number;
    minimumVisualEquivalenceScore: number;
}

export interface CloudStressScenario {
    id: string;
    label: string;
    requiredCapabilities: readonly string[];
    durationSeconds: number;
    cameraMotion: "static" | "rapid-rotation" | "long-distance-travel";
    ownerChurn: "none" | "moderate" | "heavy";
    expectedMinimumOwners: number;
    expectedMinimumFeatures: number;
    precipitation: boolean;
    lightning: boolean;
    deviceLoss: boolean;
}

export interface CloudPerformanceSample {
    frameMilliseconds: number;
    cloudTransportMilliseconds: number;
    historyAcceptanceFraction: number;
    memoryMegabytes: number;
    cadenceFraction: number;
    visualEquivalenceScore: number;
}

export interface CloudDeviceQualificationResult {
    schemaVersion: typeof CLOUD_DEVICE_QUALIFICATION_SCHEMA_VERSION;
    rendererRevision: string;
    adapterFingerprint: string;
    deviceClass: CloudDeviceClass;
    browser: string;
    qualityTier: CloudQualityTier;
    scenarioId: string;
    initializationMilliseconds: number;
    warmedSamples: readonly CloudPerformanceSample[];
    deviceLossRecovered: boolean | null;
    durationSeconds: number;
}

export interface CloudDeviceGateEvaluation {
    passed: boolean;
    p50Milliseconds: number;
    p95Milliseconds: number;
    maximumMilliseconds: number;
    cloudTransportP95Milliseconds: number;
    memoryHighWaterMegabytes: number;
    cadenceDegradationFraction: number;
    historyAcceptanceFraction: number;
    visualEquivalenceScore: number;
    reasons: readonly string[];
}

export const CLOUD_STRESS_SCENARIOS: readonly CloudStressScenario[] = [
    { id: "dense-multilayer", label: "Maximum dense multilayer",
        requiredCapabilities: ["ordered-owner-transport", "inter-system-shadows"],
        durationSeconds: 300, cameraMotion: "static", ownerChurn: "moderate",
        expectedMinimumOwners: 18, expectedMinimumFeatures: 8,
        precipitation: true, lightning: false, deviceLoss: false },
    { id: "multi-deep-convection", label: "Multiple deep-convective owners",
        requiredCapabilities: ["mixed-phase", "anvils", "cold-pools"],
        durationSeconds: 300, cameraMotion: "static", ownerChurn: "heavy",
        expectedMinimumOwners: 8, expectedMinimumFeatures: 12,
        precipitation: true, lightning: true, deviceLoss: false },
    { id: "high-ice-overcast-precip", label: "High ice over overcast precipitation",
        requiredCapabilities: ["high-ice", "overcast", "precipitation-depth-order"],
        durationSeconds: 300, cameraMotion: "static", ownerChurn: "moderate",
        expectedMinimumOwners: 12, expectedMinimumFeatures: 6,
        precipitation: true, lightning: false, deviceLoss: false },
    { id: "rapid-camera-rotation", label: "Rapid camera rotation",
        requiredCapabilities: ["history-invalidation", "disocclusion"],
        durationSeconds: 120, cameraMotion: "rapid-rotation", ownerChurn: "moderate",
        expectedMinimumOwners: 10, expectedMinimumFeatures: 6,
        precipitation: false, lightning: false, deviceLoss: false },
    { id: "long-distance-travel", label: "Long-distance camera travel",
        requiredCapabilities: ["world-space-owners", "streaming"],
        durationSeconds: 300, cameraMotion: "long-distance-travel", ownerChurn: "heavy",
        expectedMinimumOwners: 16, expectedMinimumFeatures: 10,
        precipitation: true, lightning: false, deviceLoss: false },
    { id: "owner-birth-death", label: "Repeated owner birth and death",
        requiredCapabilities: ["owner-events", "history-identity"],
        durationSeconds: 600, cameraMotion: "static", ownerChurn: "heavy",
        expectedMinimumOwners: 20, expectedMinimumFeatures: 12,
        precipitation: true, lightning: false, deviceLoss: false },
    { id: "heavy-feature-attachment", label: "Heavy feature attachment",
        requiredCapabilities: ["feature-buffer", "parent-ownership"],
        durationSeconds: 300, cameraMotion: "rapid-rotation", ownerChurn: "moderate",
        expectedMinimumOwners: 8, expectedMinimumFeatures: 32,
        precipitation: true, lightning: false, deviceLoss: false },
    { id: "lightning-precipitation", label: "Lightning and dense precipitation",
        requiredCapabilities: ["transient-invalidation", "hydrometeors"],
        durationSeconds: 300, cameraMotion: "static", ownerChurn: "moderate",
        expectedMinimumOwners: 6, expectedMinimumFeatures: 10,
        precipitation: true, lightning: true, deviceLoss: false },
    { id: "extended-thermal-memory", label: "Extended thermal and memory soak",
        requiredCapabilities: ["bounded-scheduling", "resource-reuse"],
        durationSeconds: 3_600, cameraMotion: "static", ownerChurn: "heavy",
        expectedMinimumOwners: 14, expectedMinimumFeatures: 16,
        precipitation: true, lightning: true, deviceLoss: false },
    { id: "device-loss-recovery", label: "Device loss and recovery",
        requiredCapabilities: ["device-loss", "resource-reconstruction"],
        durationSeconds: 180, cameraMotion: "rapid-rotation", ownerChurn: "moderate",
        expectedMinimumOwners: 10, expectedMinimumFeatures: 8,
        precipitation: true, lightning: false, deviceLoss: true },
] as const;

export const CLOUD_DEVICE_BUDGETS: Readonly<Record<
    CloudDeviceClass,
    Readonly<Record<CloudQualityTier, CloudPerformanceBudget>>
>> = {
    "high-end-discrete": {
        battery: { fullFrameP50Milliseconds: 8, fullFrameP95Milliseconds: 12,
            fullFrameMaximumMilliseconds: 24, cloudTransportP95Milliseconds: 2,
            initializationMaximumMilliseconds: 1_500, memoryHighWaterMegabytes: 640,
            maximumCadenceDegradationFraction: 0.08,
            minimumHistoryAcceptanceFraction: 0.9,
            minimumVisualEquivalenceScore: 0.9 },
        balanced: { fullFrameP50Milliseconds: 10, fullFrameP95Milliseconds: 16,
            fullFrameMaximumMilliseconds: 32, cloudTransportP95Milliseconds: 3,
            initializationMaximumMilliseconds: 1_800, memoryHighWaterMegabytes: 768,
            maximumCadenceDegradationFraction: 0.1,
            minimumHistoryAcceptanceFraction: 0.9,
            minimumVisualEquivalenceScore: 0.94 },
        high: { fullFrameP50Milliseconds: 14, fullFrameP95Milliseconds: 22,
            fullFrameMaximumMilliseconds: 40, cloudTransportP95Milliseconds: 5,
            initializationMaximumMilliseconds: 2_200, memoryHighWaterMegabytes: 1_024,
            maximumCadenceDegradationFraction: 0.12,
            minimumHistoryAcceptanceFraction: 0.88,
            minimumVisualEquivalenceScore: 0.97 },
    },
    "mid-range-discrete": {
        battery: { fullFrameP50Milliseconds: 12, fullFrameP95Milliseconds: 18,
            fullFrameMaximumMilliseconds: 32, cloudTransportP95Milliseconds: 3,
            initializationMaximumMilliseconds: 1_800, memoryHighWaterMegabytes: 512,
            maximumCadenceDegradationFraction: 0.1,
            minimumHistoryAcceptanceFraction: 0.88,
            minimumVisualEquivalenceScore: 0.88 },
        balanced: { fullFrameP50Milliseconds: 16, fullFrameP95Milliseconds: 24,
            fullFrameMaximumMilliseconds: 40, cloudTransportP95Milliseconds: 4.5,
            initializationMaximumMilliseconds: 2_200, memoryHighWaterMegabytes: 640,
            maximumCadenceDegradationFraction: 0.14,
            minimumHistoryAcceptanceFraction: 0.88,
            minimumVisualEquivalenceScore: 0.92 },
        high: { fullFrameP50Milliseconds: 22, fullFrameP95Milliseconds: 32,
            fullFrameMaximumMilliseconds: 55, cloudTransportP95Milliseconds: 7,
            initializationMaximumMilliseconds: 2_800, memoryHighWaterMegabytes: 896,
            maximumCadenceDegradationFraction: 0.18,
            minimumHistoryAcceptanceFraction: 0.84,
            minimumVisualEquivalenceScore: 0.95 },
    },
    "modern-integrated": {
        battery: { fullFrameP50Milliseconds: 16, fullFrameP95Milliseconds: 24,
            fullFrameMaximumMilliseconds: 40, cloudTransportP95Milliseconds: 4,
            initializationMaximumMilliseconds: 2_500, memoryHighWaterMegabytes: 384,
            maximumCadenceDegradationFraction: 0.16,
            minimumHistoryAcceptanceFraction: 0.86,
            minimumVisualEquivalenceScore: 0.86 },
        balanced: { fullFrameP50Milliseconds: 22, fullFrameP95Milliseconds: 32,
            fullFrameMaximumMilliseconds: 55, cloudTransportP95Milliseconds: 6,
            initializationMaximumMilliseconds: 3_000, memoryHighWaterMegabytes: 512,
            maximumCadenceDegradationFraction: 0.22,
            minimumHistoryAcceptanceFraction: 0.84,
            minimumVisualEquivalenceScore: 0.9 },
        high: { fullFrameP50Milliseconds: 30, fullFrameP95Milliseconds: 45,
            fullFrameMaximumMilliseconds: 80, cloudTransportP95Milliseconds: 10,
            initializationMaximumMilliseconds: 3_500, memoryHighWaterMegabytes: 640,
            maximumCadenceDegradationFraction: 0.3,
            minimumHistoryAcceptanceFraction: 0.8,
            minimumVisualEquivalenceScore: 0.93 },
    },
    "battery-constrained": {
        battery: { fullFrameP50Milliseconds: 24, fullFrameP95Milliseconds: 36,
            fullFrameMaximumMilliseconds: 64, cloudTransportP95Milliseconds: 7,
            initializationMaximumMilliseconds: 3_000, memoryHighWaterMegabytes: 320,
            maximumCadenceDegradationFraction: 0.28,
            minimumHistoryAcceptanceFraction: 0.82,
            minimumVisualEquivalenceScore: 0.84 },
        balanced: { fullFrameP50Milliseconds: 32, fullFrameP95Milliseconds: 48,
            fullFrameMaximumMilliseconds: 80, cloudTransportP95Milliseconds: 10,
            initializationMaximumMilliseconds: 3_500, memoryHighWaterMegabytes: 384,
            maximumCadenceDegradationFraction: 0.35,
            minimumHistoryAcceptanceFraction: 0.78,
            minimumVisualEquivalenceScore: 0.87 },
        high: { fullFrameP50Milliseconds: 45, fullFrameP95Milliseconds: 66,
            fullFrameMaximumMilliseconds: 95, cloudTransportP95Milliseconds: 14,
            initializationMaximumMilliseconds: 4_000, memoryHighWaterMegabytes: 512,
            maximumCadenceDegradationFraction: 0.42,
            minimumHistoryAcceptanceFraction: 0.74,
            minimumVisualEquivalenceScore: 0.9 },
    },
    "privacy-reduced-adapter": {
        battery: { fullFrameP50Milliseconds: 20, fullFrameP95Milliseconds: 30,
            fullFrameMaximumMilliseconds: 55, cloudTransportP95Milliseconds: 6,
            initializationMaximumMilliseconds: 3_000, memoryHighWaterMegabytes: 384,
            maximumCadenceDegradationFraction: 0.24,
            minimumHistoryAcceptanceFraction: 0.84,
            minimumVisualEquivalenceScore: 0.85 },
        balanced: { fullFrameP50Milliseconds: 28, fullFrameP95Milliseconds: 42,
            fullFrameMaximumMilliseconds: 72, cloudTransportP95Milliseconds: 9,
            initializationMaximumMilliseconds: 3_500, memoryHighWaterMegabytes: 512,
            maximumCadenceDegradationFraction: 0.32,
            minimumHistoryAcceptanceFraction: 0.8,
            minimumVisualEquivalenceScore: 0.89 },
        high: { fullFrameP50Milliseconds: 40, fullFrameP95Milliseconds: 60,
            fullFrameMaximumMilliseconds: 90, cloudTransportP95Milliseconds: 13,
            initializationMaximumMilliseconds: 4_000, memoryHighWaterMegabytes: 640,
            maximumCadenceDegradationFraction: 0.4,
            minimumHistoryAcceptanceFraction: 0.76,
            minimumVisualEquivalenceScore: 0.92 },
    },
};

const percentile = (values: readonly number[], fraction: number) => {
    if (values.length === 0) return Number.POSITIVE_INFINITY;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1),
    )];
};
const mean = (values: readonly number[]) => values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export const evaluateCloudDeviceQualification = (
    result: CloudDeviceQualificationResult,
    budget = CLOUD_DEVICE_BUDGETS[result.deviceClass][result.qualityTier],
): CloudDeviceGateEvaluation => {
    const frameTimes = result.warmedSamples.map(({ frameMilliseconds }) =>
        frameMilliseconds);
    const transportTimes = result.warmedSamples.map(
        ({ cloudTransportMilliseconds }) => cloudTransportMilliseconds,
    );
    const p50 = percentile(frameTimes, 0.5);
    const p95 = percentile(frameTimes, 0.95);
    const maximum = frameTimes.length > 0
        ? Math.max(...frameTimes)
        : Number.POSITIVE_INFINITY;
    const transportP95 = percentile(transportTimes, 0.95);
    const memory = Math.max(
        ...result.warmedSamples.map(({ memoryMegabytes }) => memoryMegabytes),
        0,
    );
    const cadenceDegradation = 1 - mean(
        result.warmedSamples.map(({ cadenceFraction }) => cadenceFraction),
    );
    const historyAcceptance = mean(result.warmedSamples.map(
        ({ historyAcceptanceFraction }) => historyAcceptanceFraction,
    ));
    const visualScores = result.warmedSamples.map(
        ({ visualEquivalenceScore }) => visualEquivalenceScore,
    );
    const visualEquivalence = visualScores.length > 0
        ? Math.min(...visualScores)
        : 0;
    const reasons: string[] = [];
    if (result.warmedSamples.length < 60) reasons.push("Fewer than 60 warmed samples.");
    if (p50 > budget.fullFrameP50Milliseconds) reasons.push("Full-frame p50 exceeds budget.");
    if (p95 > budget.fullFrameP95Milliseconds) reasons.push("Full-frame p95 exceeds budget.");
    if (maximum > budget.fullFrameMaximumMilliseconds) reasons.push("Maximum frame time exceeds budget.");
    if (transportP95 > budget.cloudTransportP95Milliseconds) reasons.push("Cloud transport p95 exceeds budget.");
    if (result.initializationMilliseconds > budget.initializationMaximumMilliseconds) reasons.push("Initialization exceeds budget.");
    if (memory > budget.memoryHighWaterMegabytes) reasons.push("Memory high-water mark exceeds budget.");
    if (cadenceDegradation > budget.maximumCadenceDegradationFraction) reasons.push("Cadence degradation exceeds budget.");
    if (historyAcceptance < budget.minimumHistoryAcceptanceFraction) reasons.push("History acceptance is below budget.");
    if (visualEquivalence < budget.minimumVisualEquivalenceScore) reasons.push("Visual equivalence is below budget.");
    const scenario = CLOUD_STRESS_SCENARIOS.find(({ id }) =>
        id === result.scenarioId);
    if (!scenario) reasons.push("Unknown stress scenario.");
    if (scenario?.deviceLoss && result.deviceLossRecovered !== true) {
        reasons.push("Device-loss recovery was not demonstrated.");
    }
    if (result.durationSeconds < (scenario?.durationSeconds ?? 0)) {
        reasons.push("Run duration is shorter than the stress scenario requirement.");
    }
    return {
        passed: reasons.length === 0,
        p50Milliseconds: p50,
        p95Milliseconds: p95,
        maximumMilliseconds: maximum,
        cloudTransportP95Milliseconds: transportP95,
        memoryHighWaterMegabytes: memory,
        cadenceDegradationFraction: cadenceDegradation,
        historyAcceptanceFraction: historyAcceptance,
        visualEquivalenceScore: visualEquivalence,
        reasons,
    };
};

export const CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type CloudQualificationCameraId =
    | "horizon-wide"
    | "oblique-natural"
    | "zenith-wide"
    | "distant-telephoto"
    | "near-uplook";
export type CloudQualificationLighting =
    | "front"
    | "side"
    | "back"
    | "diffuse"
    | "twilight"
    | "moon";
export type CloudBaselineArtifactKind =
    | "canonical-render"
    | "density-debug"
    | "owner-debug"
    | "material-debug"
    | "phase-debug"
    | "light-volume-debug"
    | "motion-sequence"
    | "lifecycle-sequence"
    | "timing-telemetry"
    | "reconstruction-telemetry";

export interface CloudArtifactReference {
    id: string;
    kind: CloudBaselineArtifactKind;
    uri: string;
    sha256: string;
    mediaType: string;
    width?: number;
    height?: number;
    frameCount?: number;
    durationSeconds?: number;
}

export interface CloudBaselineArtifactManifest {
    schemaVersion: typeof CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
    id: string;
    routeId: string;
    rendererRevision: string;
    rendererSchemaVersions: Record<string, number>;
    generatedAt: string;
    generationMode: "conditioned" | "free-running";
    sceneSeed: number;
    simulationFingerprint: string;
    simulationStep: number;
    cameraSignature: string;
    environmentId: string;
    exactCommand: string;
    artifacts: readonly CloudArtifactReference[];
}

export interface CloudInvariantObservation {
    invariantId: string;
    passed: boolean;
    severity: "critical" | "major" | "minor";
    measurement?: number;
    threshold?: number;
    note?: string;
}

export interface CloudStillQualificationEvidence {
    schemaVersion: typeof CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
    id: string;
    routeId: string;
    rendererRevision: string;
    seed: number;
    cameraId: CloudQualificationCameraId;
    cameraSignature: string;
    lighting: CloudQualificationLighting;
    referenceId: string;
    referenceLicense: string;
    referenceSource: string;
    strictReady: boolean;
    artifact: CloudArtifactReference;
    invariantObservations: readonly CloudInvariantObservation[];
    expertRating?: 1 | 2 | 3 | 4 | 5;
}

export interface CloudSequenceQualificationEvidence {
    schemaVersion: typeof CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
    id: string;
    routeId: string;
    rendererRevision: string;
    seed: number;
    kind: "camera-motion" | "lifecycle" | "long-run";
    startSimulationStep: number;
    endSimulationStep: number;
    cameraIds: readonly CloudQualificationCameraId[];
    artifact: CloudArtifactReference;
    deterministicReplayFingerprint: string;
    criticalBoiling: boolean;
    criticalGhosting: boolean;
    criticalFeatureDetachment: boolean;
    criticalCameraDependence: boolean;
    invariantObservations: readonly CloudInvariantObservation[];
}

export interface CloudBlindRecognitionReview {
    id: string;
    evidenceId: string;
    reviewerId: string;
    expectedGenus: string;
    expectedSpecies: string | null;
    selectedGenus: string;
    rankedSpecies: readonly string[];
    selectedFeatures: readonly string[];
    confidence01: number;
}

export interface CloudQualificationEvidenceBundle {
    schemaVersion: typeof CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION;
    routeId: string;
    rendererRevision: string;
    baselines: readonly CloudBaselineArtifactManifest[];
    stills: readonly CloudStillQualificationEvidence[];
    sequences: readonly CloudSequenceQualificationEvidence[];
    blindReviews: readonly CloudBlindRecognitionReview[];
}

export interface CloudQualificationPlanCase {
    id: string;
    routeId: string;
    seed: number;
    cameraId: CloudQualificationCameraId;
    lighting: CloudQualificationLighting;
    captureKinds: readonly ("still" | "camera-motion" | "lifecycle")[];
}

export interface CloudQualificationPlanOptions {
    seeds?: readonly number[];
    cameraIds?: readonly CloudQualificationCameraId[];
    lighting?: readonly CloudQualificationLighting[];
    includeMotion?: boolean;
    includeLifecycle?: boolean;
}

export interface CloudRecognitionMetrics {
    reviews: number;
    genusTop1Accuracy: number;
    speciesTop1Accuracy: number;
    speciesTop2Accuracy: number;
    genusConfusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
    speciesConfusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface CloudPhotographicGateResult {
    passed: boolean;
    genusTop1Accuracy: number;
    speciesTop1Accuracy: number;
    speciesTop2Accuracy: number;
    expertNearPhotorealisticFraction: number;
    criticalInvariantFailures: number;
    criticalTemporalFailures: number;
    missingSeeds: number;
    missingCameras: number;
    missingLightingModes: readonly CloudQualificationLighting[];
    reasons: readonly string[];
}

export interface CloudQualificationEvidenceIssue {
    code: string;
    subject: string;
    message: string;
}

const DEFAULT_SEEDS = [0x2ad34f11, 0x7f4a7c15, 0xb5297a4d] as const;
const DEFAULT_CAMERAS: readonly CloudQualificationCameraId[] = [
    "horizon-wide", "oblique-natural", "zenith-wide",
];
const DEFAULT_LIGHTING: readonly CloudQualificationLighting[] = [
    "side", "back", "twilight", "moon",
];

const unique = <Value>(values: readonly Value[]) => [...new Set(values)];
const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : 0;

export const buildIndependentCloudQualificationPlan = (
    routeIds: readonly string[],
    options: CloudQualificationPlanOptions = {},
): readonly CloudQualificationPlanCase[] => {
    const seeds = unique(options.seeds ?? DEFAULT_SEEDS);
    const cameras = unique(options.cameraIds ?? DEFAULT_CAMERAS);
    const lighting = unique(options.lighting ?? DEFAULT_LIGHTING);
    const captureKinds: ("still" | "camera-motion" | "lifecycle")[] = ["still"];
    if (options.includeMotion ?? true) captureKinds.push("camera-motion");
    if (options.includeLifecycle ?? true) captureKinds.push("lifecycle");
    return unique(routeIds).flatMap((routeId) => seeds.flatMap((seed) =>
        cameras.flatMap((cameraId) => lighting.map((light) => ({
            id: `${routeId}--${seed.toString(16)}--${cameraId}--${light}`,
            routeId,
            seed,
            cameraId,
            lighting: light,
            captureKinds,
        })))));
};

const confusion = (
    reviews: readonly CloudBlindRecognitionReview[],
    expected: (review: CloudBlindRecognitionReview) => string,
    selected: (review: CloudBlindRecognitionReview) => string,
) => {
    const matrix: Record<string, Record<string, number>> = {};
    for (const review of reviews) {
        const row = expected(review);
        const column = selected(review);
        matrix[row] ??= {};
        matrix[row][column] = (matrix[row][column] ?? 0) + 1;
    }
    return matrix;
};

export const computeCloudRecognitionMetrics = (
    reviews: readonly CloudBlindRecognitionReview[],
): CloudRecognitionMetrics => {
    const speciesReviews = reviews.filter(({ expectedSpecies }) =>
        expectedSpecies !== null);
    const genusCorrect = reviews.filter((review) =>
        review.expectedGenus === review.selectedGenus).length;
    const speciesTop1 = speciesReviews.filter((review) =>
        review.rankedSpecies[0] === review.expectedSpecies).length;
    const speciesTop2 = speciesReviews.filter((review) =>
        review.rankedSpecies.slice(0, 2).includes(review.expectedSpecies!)).length;
    return {
        reviews: reviews.length,
        genusTop1Accuracy: ratio(genusCorrect, reviews.length),
        speciesTop1Accuracy: ratio(speciesTop1, speciesReviews.length),
        speciesTop2Accuracy: ratio(speciesTop2, speciesReviews.length),
        genusConfusion: confusion(
            reviews,
            ({ expectedGenus }) => expectedGenus,
            ({ selectedGenus }) => selectedGenus,
        ),
        speciesConfusion: confusion(
            speciesReviews,
            ({ expectedSpecies }) => expectedSpecies!,
            ({ rankedSpecies }) => rankedSpecies[0] ?? "unclassified",
        ),
    };
};

export const evaluateCloudPhotographicGate = (
    bundle: CloudQualificationEvidenceBundle,
): CloudPhotographicGateResult => {
    const metrics = computeCloudRecognitionMetrics(bundle.blindReviews);
    const seeds = new Set(bundle.stills.map(({ seed }) => seed));
    const cameras = new Set(bundle.stills.map(({ cameraId }) => cameraId));
    const lighting = new Set(bundle.stills.map(({ lighting: value }) => value));
    const criticalInvariantFailures = [
        ...bundle.stills.flatMap(({ invariantObservations }) =>
            invariantObservations),
        ...bundle.sequences.flatMap(({ invariantObservations }) =>
            invariantObservations),
    ].filter(({ passed, severity }) => !passed && severity === "critical").length;
    const criticalTemporalFailures = bundle.sequences.filter((sequence) =>
        sequence.criticalBoiling || sequence.criticalGhosting ||
        sequence.criticalFeatureDetachment ||
        sequence.criticalCameraDependence).length;
    const rated = bundle.stills.filter(({ expertRating }) =>
        expertRating !== undefined);
    const expertFraction = ratio(
        rated.filter(({ expertRating }) => expertRating! >= 4).length,
        rated.length,
    );
    const missingLightingModes = DEFAULT_LIGHTING.filter((value) =>
        !lighting.has(value));
    const reasons: string[] = [];
    if (seeds.size < 3) reasons.push("Fewer than three independent seeds.");
    if (cameras.size < 3) reasons.push("Fewer than three independent cameras.");
    if (missingLightingModes.length > 0) {
        reasons.push(`Missing lighting modes: ${missingLightingModes.join(", ")}.`);
    }
    if (metrics.genusTop1Accuracy < 0.9) {
        reasons.push("Genus top-1 recognition is below 90%.");
    }
    if (metrics.speciesTop1Accuracy < 0.75) {
        reasons.push("Species/key-feature top-1 recognition is below 75%.");
    }
    if (metrics.speciesTop2Accuracy < 0.9) {
        reasons.push("Species/key-feature top-2 recognition is below 90%.");
    }
    if (expertFraction < 0.85) {
        reasons.push("Near-photorealistic expert rating is below 85%.");
    }
    if (criticalInvariantFailures > 0) {
        reasons.push(`${criticalInvariantFailures} critical invariant failures.`);
    }
    if (criticalTemporalFailures > 0) {
        reasons.push(`${criticalTemporalFailures} critical temporal failures.`);
    }
    if (!bundle.stills.every(({ strictReady }) => strictReady)) {
        reasons.push("At least one still is not strict-ready.");
    }
    if (!bundle.sequences.some(({ kind }) => kind === "camera-motion") ||
        !bundle.sequences.some(({ kind }) => kind === "lifecycle")) {
        reasons.push("Both camera-motion and lifecycle sequences are required.");
    }
    return {
        passed: reasons.length === 0,
        genusTop1Accuracy: metrics.genusTop1Accuracy,
        speciesTop1Accuracy: metrics.speciesTop1Accuracy,
        speciesTop2Accuracy: metrics.speciesTop2Accuracy,
        expertNearPhotorealisticFraction: expertFraction,
        criticalInvariantFailures,
        criticalTemporalFailures,
        missingSeeds: Math.max(0, 3 - seeds.size),
        missingCameras: Math.max(0, 3 - cameras.size),
        missingLightingModes,
        reasons,
    };
};

const validSha256 = (value: string) => /^[a-f0-9]{64}$/i.test(value);

export const validateCloudQualificationEvidenceBundle = (
    bundle: CloudQualificationEvidenceBundle,
): readonly CloudQualificationEvidenceIssue[] => {
    const issues: CloudQualificationEvidenceIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });
    if (bundle.schemaVersion !== CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION) {
        issue("unsupported-schema", bundle.routeId,
            `Expected evidence schema ${CLOUD_QUALIFICATION_EVIDENCE_SCHEMA_VERSION}.`);
    }
    for (const baseline of bundle.baselines) {
        if (baseline.routeId !== bundle.routeId ||
            baseline.rendererRevision !== bundle.rendererRevision) {
            issue("baseline-identity-mismatch", baseline.id,
                "Baseline route and renderer revision must match the bundle.");
        }
        const requiredKinds: readonly CloudBaselineArtifactKind[] = [
            "canonical-render", "density-debug", "owner-debug",
            "material-debug", "phase-debug", "light-volume-debug",
            "motion-sequence", "timing-telemetry", "reconstruction-telemetry",
        ];
        const kinds = new Set(baseline.artifacts.map(({ kind }) => kind));
        for (const kind of requiredKinds) {
            if (!kinds.has(kind)) {
                issue("missing-baseline-artifact", baseline.id,
                    `Missing required baseline artifact ${kind}.`);
            }
        }
    }
    const artifactReferences = [
        ...bundle.baselines.flatMap(({ artifacts }) => artifacts),
        ...bundle.stills.map(({ artifact }) => artifact),
        ...bundle.sequences.map(({ artifact }) => artifact),
    ];
    for (const artifact of artifactReferences) {
        if (!artifact.uri || !validSha256(artifact.sha256)) {
            issue("invalid-artifact-reference", artifact.id,
                "Artifact URI and SHA-256 digest are required.");
        }
    }
    for (const still of bundle.stills) {
        if (still.routeId !== bundle.routeId ||
            still.rendererRevision !== bundle.rendererRevision) {
            issue("still-identity-mismatch", still.id,
                "Still route and revision must match the bundle.");
        }
        if (still.invariantObservations.length === 0) {
            issue("missing-still-invariants", still.id,
                "Still evidence needs explicit invariant observations.");
        }
    }
    for (const sequence of bundle.sequences) {
        if (sequence.startSimulationStep >= sequence.endSimulationStep) {
            issue("invalid-sequence-range", sequence.id,
                "Sequence end step must follow its start step.");
        }
        if (!sequence.deterministicReplayFingerprint) {
            issue("missing-replay-fingerprint", sequence.id,
                "Sequence evidence needs a deterministic replay fingerprint.");
        }
    }
    const evidenceIds = new Set([
        ...bundle.stills.map(({ id }) => id),
        ...bundle.sequences.map(({ id }) => id),
    ]);
    for (const review of bundle.blindReviews) {
        if (!evidenceIds.has(review.evidenceId)) {
            issue("orphan-review", review.id,
                "Blind reviews must reference evidence in the same bundle.");
        }
        if (review.confidence01 < 0 || review.confidence01 > 1) {
            issue("invalid-review-confidence", review.id,
                "Review confidence must be in [0, 1].");
        }
    }
    return issues;
};

import qualificationManifestJson from "../../../data/cloud-photographic-qualification.json";
import {
    CLOUD_PHOTOGRAPH_CASES,
    type CloudPhotographCase,
} from "./cloud-photograph-benchmark";
import {
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS,
    resolveCloudMorphologyPhotographCase,
    type MorphologyFailureMode,
    type MorphologyPhotographTarget,
} from "./cloud-morphology-photograph-qualification";
import { resolveOrthogonalCloudPhotographCase } from "./cloud-photograph-orthogonal-benchmark";
import {
    WEATHER_QUALIFICATION_TARGETS,
    type WeatherQualificationAxis,
    type WeatherQualificationTarget,
} from "./weather-qualification-matrix";

/**
 * Compact, machine-readable photographic qualification layered over the full
 * lazy WMO/weather matrices. Importing this module performs no browser, image,
 * network, renderer, or GPU work.
 */

export type PhotographicInvariantDomain =
    | "formation"
    | "morphology"
    | "transport"
    | "lighting"
    | "evolution"
    | "weather";

export type QualificationSet = "base" | "orthogonal";
export type QualificationCoverage = "sparse" | "broken" | "extensive" | "overcast";
export type QualificationLighting = "front" | "side" | "back" | "diffuse" | "twilight" | "moon";
export type QualificationLifecycle = "incipient" | "growing" | "mature" | "precipitating" | "decaying";
export type QualificationPerspective =
    | "horizon-wide"
    | "oblique-natural"
    | "zenith-wide"
    | "distant-telephoto"
    | "near-uplook";

export interface PhotographicInvariantMetric {
    name: string;
    operator: "less-than-or-equal" | "greater-than-or-equal" | "equal";
    value: number;
}

export interface PhotographicInvariant {
    id: string;
    domain: PhotographicInvariantDomain;
    observable: string;
    rejects: readonly string[];
    metric?: PhotographicInvariantMetric;
}

export interface StrictPhotographicReadiness {
    minimumTransportUpdates: number;
    minimumHistoryAcceptanceFraction: number;
    minimumStableHistoryAge: number;
    minimumPersistentHistoryConfidence: number;
    minimumProjectedOpacity: number;
    requireWebGpu: boolean;
    requireCurrentCaseEvidence: boolean;
    requireCompleteLightVolume: boolean;
    requireFiniteTransport: boolean;
    requireHistoryValid: boolean;
    requireReconstructionMaturity: boolean;
    allowEmptyFrame: boolean;
}

export interface CorePhotographicQualificationCase {
    id: string;
    qualificationSet: QualificationSet;
    caseId: string;
    genus: string;
    species: string;
    perspective: QualificationPerspective;
    coverage: QualificationCoverage;
    lighting: QualificationLighting;
    lifecycle: QualificationLifecycle;
    expectedOccupiedSkyFraction: readonly [number, number];
    invariantIds: readonly string[];
}

export interface PhotographicReviewQueueEntry {
    stage: number;
    caseId: string;
    debugView: "final" | "transmittance";
    purpose: string;
    invariantIds: readonly string[];
}

interface PhotographicQualificationManifest {
    schemaVersion: number;
    taxonomy: {
        provider: string;
        classificationUrl: string;
        associatedFormsUrl: string;
    };
    strictReadiness: StrictPhotographicReadiness;
    invariants: readonly PhotographicInvariant[];
    coreCases: readonly CorePhotographicQualificationCase[];
    nextReviewQueue: readonly PhotographicReviewQueueEntry[];
}

const manifest = qualificationManifestJson as unknown as PhotographicQualificationManifest;

export const CLOUD_PHOTOGRAPHIC_QUALIFICATION_MANIFEST = manifest;
export const CLOUD_PHOTOGRAPHIC_INVARIANTS = manifest.invariants;
export const CLOUD_PHOTOGRAPHIC_STRICT_READINESS = manifest.strictReadiness;
export const CLOUD_PHOTOGRAPHIC_CORE_CASES = manifest.coreCases;
export const CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE = manifest.nextReviewQueue;

const invariantById = new Map(
    CLOUD_PHOTOGRAPHIC_INVARIANTS.map((invariant) => [invariant.id, invariant]),
);

const deduplicate = (values: readonly string[]): readonly string[] =>
    [...new Set(values)];

const COMMON_CLOUD_INVARIANTS = [
    "finite-world-support",
    "aperiodic-organization",
    "genus-angular-scale",
    "phase-appropriate-boundary",
    "neutral-passive-extinction",
    "atmosphere-coupled-radiance",
    "aerial-perspective-continuity",
] as const;

const BASE_LAYER_GENERA = new Set([
    "cirrocumulus", "cirrostratus", "altocumulus", "altostratus",
    "nimbostratus", "stratocumulus", "stratus",
]);

const CONVECTIVE_GENERA = new Set(["cumulus", "cumulonimbus"]);
const HIGH_ICE_GENERA = new Set(["cirrus", "cirrocumulus", "cirrostratus"]);

const baseInvariantIds = (qualificationCase: CloudPhotographCase): readonly string[] => {
    const values: string[] = [...COMMON_CLOUD_INVARIANTS];
    if (BASE_LAYER_GENERA.has(qualificationCase.genus)) {
        values.push("multiple-scattering-shadow-depth", "volumetric-negative-space");
    }
    if (CONVECTIVE_GENERA.has(qualificationCase.genus)) {
        values.push(
            "connected-parent-topology",
            "coherent-condensation-base",
            "multiple-scattering-shadow-depth",
            "lifecycle-structure",
        );
    }
    if (HIGH_ICE_GENERA.has(qualificationCase.genus)) {
        values.push("bounded-source-scattering");
    }
    if (qualificationCase.genus === "nimbostratus" ||
        qualificationCase.species.includes("precip")) {
        values.push("hydrometeor-parent-depth-order", "lifecycle-structure");
    }
    return deduplicate(values);
};

const morphologyFailureInvariants: Record<MorphologyFailureMode, readonly string[]> = {
    "fake-grid": ["aperiodic-organization"],
    "repeated-stamp": ["aperiodic-organization", "finite-world-support"],
    "screen-space-mask": ["finite-world-support", "volumetric-negative-space"],
    "detached-owner-feature": ["connected-parent-topology"],
    "wrong-relative-placement": ["connected-parent-topology", "multilayer-parallax-ordering"],
    "wrong-scale-hierarchy": ["genus-angular-scale"],
    "boundary-clipping": ["phase-appropriate-boundary", "finite-world-support"],
    "lighting-discontinuity": ["atmosphere-coupled-radiance", "bounded-source-scattering"],
    "atmosphere-color-mismatch": ["neutral-passive-extinction", "atmosphere-coupled-radiance"],
};

const morphologyInvariantIds = (
    target: MorphologyPhotographTarget,
): readonly string[] => {
    const values: string[] = [
        "finite-world-support",
        "genus-angular-scale",
        "phase-appropriate-boundary",
        "neutral-passive-extinction",
        "atmosphere-coupled-radiance",
    ];
    for (const failure of target.cues.flatMap((cue) => cue.rejects)) {
        values.push(...morphologyFailureInvariants[failure]);
    }
    if (target.axis === "upper-atmospheric") {
        values.push("upper-atmosphere-altitude-lighting");
    }
    if (target.axis === "exterior-boundary") {
        values.push("lifecycle-structure");
    }
    return deduplicate(values);
};

const WEATHER_AXIS_INVARIANTS: Record<WeatherQualificationAxis, readonly string[]> = {
    species: ["genus-angular-scale", "phase-appropriate-boundary"],
    variety: ["aperiodic-organization", "volumetric-negative-space"],
    "supplementary-feature": ["connected-parent-topology", "lifecycle-structure"],
    "accessory-cloud": ["connected-parent-topology", "multilayer-parallax-ordering"],
    precipitation: ["hydrometeor-parent-depth-order", "multiple-scattering-shadow-depth"],
    "convective-lifecycle": ["lifecycle-structure", "connected-parent-topology"],
    "mother-cloud": ["connected-parent-topology", "multilayer-parallax-ordering"],
    "special-origin": ["finite-world-support", "lifecycle-structure"],
    "surface-obscuration": ["surface-obscuration-continuity", "atmosphere-coupled-radiance"],
    "upper-atmospheric": ["upper-atmosphere-altitude-lighting", "aerial-perspective-continuity"],
    multilayer: ["multilayer-parallax-ordering", "aerial-perspective-continuity"],
};

const weatherInvariantIds = (
    target: WeatherQualificationTarget,
): readonly string[] => {
    const values: string[] = [
        "finite-world-support",
        "neutral-passive-extinction",
        "atmosphere-coupled-radiance",
        ...WEATHER_AXIS_INVARIANTS[target.axis],
    ];
    if (target.kind === "cloud") {
        values.push("genus-angular-scale", "phase-appropriate-boundary");
        if (target.lifecycleStage) values.push("lifecycle-structure");
        if (target.precipitationKind) values.push("hydrometeor-parent-depth-order");
    } else if (target.kind === "surface-obscuration") {
        values.push("surface-obscuration-continuity");
    } else if (target.kind === "upper-atmospheric") {
        values.push("upper-atmosphere-altitude-lighting");
    } else {
        values.push("multilayer-parallax-ordering");
    }
    return deduplicate(values);
};

export interface SpeciesPhotographicAuditRow {
    id: string;
    referenceId: string;
    genus: string;
    species: string;
    environmentId: string;
    perspective: string;
    referenceImage: string;
    source: string;
    expectedCues: readonly string[];
    invariantIds: readonly string[];
}

export interface MorphologyPhotographicAuditRow {
    id: string;
    axis: MorphologyPhotographTarget["axis"];
    designation: MorphologyPhotographTarget["designation"];
    environmentIds: readonly string[];
    perspectiveIds: readonly string[];
    coverageIds: readonly string[];
    expectedCues: readonly string[];
    invariantIds: readonly string[];
}

export interface WeatherPhotographicAuditRow {
    id: string;
    kind: WeatherQualificationTarget["kind"];
    axis: WeatherQualificationAxis;
    implementation: WeatherQualificationTarget["implementation"];
    environmentIds: readonly string[];
    perspectiveIds: readonly string[];
    expectedCues: readonly string[];
    invariantIds: readonly string[];
}

export const CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT: readonly SpeciesPhotographicAuditRow[] =
    CLOUD_PHOTOGRAPH_CASES.map((qualificationCase) => ({
        id: qualificationCase.id,
        referenceId: qualificationCase.id.split("--")[0],
        genus: qualificationCase.genus,
        species: qualificationCase.species,
        environmentId: qualificationCase.environment.id,
        perspective: qualificationCase.environment.perspective,
        referenceImage: qualificationCase.referenceImage,
        source: qualificationCase.source,
        expectedCues: qualificationCase.cues,
        invariantIds: baseInvariantIds(qualificationCase),
    }));

export const CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT:
readonly MorphologyPhotographicAuditRow[] =
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((target) => ({
        id: target.id,
        axis: target.axis,
        designation: target.designation,
        environmentIds: target.environmentIds,
        perspectiveIds: target.perspectiveIds,
        coverageIds: target.coverageIds,
        expectedCues: target.cues.map((cue) => cue.pass),
        invariantIds: morphologyInvariantIds(target),
    }));

export const CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT: readonly WeatherPhotographicAuditRow[] =
    WEATHER_QUALIFICATION_TARGETS.map((target) => ({
        id: target.id,
        kind: target.kind,
        axis: target.axis,
        implementation: target.implementation,
        environmentIds: target.environments,
        perspectiveIds: target.perspectives,
        expectedCues: target.cues,
        invariantIds: weatherInvariantIds(target),
    }));

export interface PhotographicQualificationIssue {
    code: string;
    subject: string;
    message: string;
}

const duplicates = (values: readonly string[]): readonly string[] => {
    const seen = new Set<string>();
    const duplicateValues = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicateValues.add(value);
        seen.add(value);
    }
    return [...duplicateValues];
};

const baseCaseById = new Map(
    CLOUD_PHOTOGRAPH_CASES.map((qualificationCase) => [qualificationCase.id, qualificationCase]),
);

const resolveManifestCase = (
    qualificationSet: QualificationSet,
    caseId: string,
) => qualificationSet === "base"
    ? baseCaseById.get(caseId)
    : resolveOrthogonalCloudPhotographCase(caseId);

export const validateCloudPhotographicQualificationMatrix = ():
readonly PhotographicQualificationIssue[] => {
    const issues: PhotographicQualificationIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });

    if (manifest.schemaVersion !== 1) {
        issue("unsupported-schema", "manifest", `Expected schema 1, received ${manifest.schemaVersion}.`);
    }
    for (const duplicate of duplicates(CLOUD_PHOTOGRAPHIC_INVARIANTS.map(({ id }) => id))) {
        issue("duplicate-invariant", duplicate, "Invariant identifiers must be unique.");
    }
    for (const invariant of CLOUD_PHOTOGRAPHIC_INVARIANTS) {
        if (invariant.observable.length < 80 || invariant.rejects.length < 3) {
            issue("weak-invariant", invariant.id,
                "Each invariant needs an explicit observable and at least three discriminating failure modes.");
        }
        if (invariant.metric && !Number.isFinite(invariant.metric.value)) {
            issue("invalid-invariant-metric", invariant.id, "Invariant metric must be finite.");
        }
    }

    for (const duplicate of duplicates(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ id }) => id))) {
        issue("duplicate-core-case", duplicate, "Core case identifiers must be unique.");
    }
    if (CLOUD_PHOTOGRAPHIC_CORE_CASES.length > 24) {
        issue("non-compact-core", "core", "The core visual matrix must remain at or below 24 images.");
    }
    for (const coreCase of CLOUD_PHOTOGRAPHIC_CORE_CASES) {
        const resolved = resolveManifestCase(coreCase.qualificationSet, coreCase.caseId);
        if (!resolved) {
            issue("unresolvable-core-case", coreCase.id, `No ${coreCase.qualificationSet} case resolves ${coreCase.caseId}.`);
            continue;
        }
        if (resolved.genus !== coreCase.genus) {
            issue("core-genus-mismatch", coreCase.id,
                `Manifest genus ${coreCase.genus} does not match resolved genus ${resolved.genus}.`);
        }
        const [minimum, maximum] = coreCase.expectedOccupiedSkyFraction;
        if (!(minimum >= 0 && maximum <= 1 && minimum < maximum)) {
            issue("invalid-occupied-range", coreCase.id,
                `Expected occupied-sky range ${minimum}..${maximum} is invalid.`);
        }
        for (const invariantId of coreCase.invariantIds) {
            if (!invariantById.has(invariantId)) {
                issue("unknown-invariant", coreCase.id, `Unknown invariant ${invariantId}.`);
            }
        }
    }

    const requiredCoreAxes: readonly {
        axis: string;
        actual: ReadonlySet<string>;
        expected: readonly string[];
    }[] = [
        { axis: "qualification-set", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ qualificationSet }) => qualificationSet)), expected: ["base", "orthogonal"] },
        { axis: "coverage", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ coverage }) => coverage)), expected: ["sparse", "broken", "extensive", "overcast"] },
        { axis: "lighting", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ lighting }) => lighting)), expected: ["front", "side", "back", "diffuse", "twilight", "moon"] },
        { axis: "lifecycle", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ lifecycle }) => lifecycle)), expected: ["incipient", "growing", "mature", "precipitating", "decaying"] },
        { axis: "perspective", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ perspective }) => perspective)), expected: ["horizon-wide", "oblique-natural", "zenith-wide", "distant-telephoto", "near-uplook"] },
        { axis: "genus", actual: new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map(({ genus }) => genus)), expected: ["cirrus", "cirrocumulus", "cirrostratus", "altocumulus", "altostratus", "nimbostratus", "stratocumulus", "stratus", "cumulus", "cumulonimbus"] },
    ];
    for (const { axis, actual, expected } of requiredCoreAxes) {
        const missing = expected.filter((value) => !actual.has(value));
        if (missing.length > 0) {
            issue("missing-core-axis-value", axis, `Missing compact-matrix values: ${missing.join(", ")}.`);
        }
    }

    const auditSets = [
        ["base", CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT],
        ["morphology", CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT],
        ["weather", CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT],
    ] as const;
    for (const [auditName, rows] of auditSets) {
        for (const row of rows) {
            if (row.expectedCues.length === 0) {
                issue("missing-expected-cue", `${auditName}:${row.id}`, "Audit row has no photographic discriminator.");
            }
            if (row.invariantIds.length < 3) {
                issue("insufficient-invariants", `${auditName}:${row.id}`, "Audit row needs at least three independent invariants.");
            }
            for (const invariantId of row.invariantIds) {
                if (!invariantById.has(invariantId)) {
                    issue("unknown-invariant", `${auditName}:${row.id}`, `Unknown invariant ${invariantId}.`);
                }
            }
        }
    }

    const baseReferenceIds = new Set(CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT.map(({ referenceId }) => referenceId));
    if (baseReferenceIds.size !== 32) {
        issue("base-reference-coverage", "base", `Expected 32 WMO reference identities, found ${baseReferenceIds.size}.`);
    }
    if (CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT.length !== CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.length) {
        issue("morphology-audit-coverage", "morphology", "Every orthogonal morphology target needs an audit row.");
    }
    if (CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT.length !== WEATHER_QUALIFICATION_TARGETS.length) {
        issue("weather-audit-coverage", "weather", "Every weather target needs an audit row.");
    }

    const stages = CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.map(({ stage }) => stage);
    if (stages.some((stage, index) => stage !== index)) {
        issue("non-serial-queue", "next-review", "Review stages must be contiguous and ordered from zero.");
    }
    if (CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.filter(({ debugView }) => debugView === "final").length > 5) {
        issue("excess-next-images", "next-review", "The next evidence queue may request at most five final-color images.");
    }
    for (const entry of CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE) {
        if (!baseCaseById.has(entry.caseId) && !resolveCloudMorphologyPhotographCase(entry.caseId)) {
            issue("unresolvable-queue-case", String(entry.stage), `No benchmark case resolves ${entry.caseId}.`);
        }
        if (entry.purpose.length < 60) {
            issue("weak-queue-purpose", String(entry.stage), "Each image must have a specific discriminatory purpose.");
        }
        for (const invariantId of entry.invariantIds) {
            if (!invariantById.has(invariantId)) {
                issue("unknown-invariant", String(entry.stage), `Unknown invariant ${invariantId}.`);
            }
        }
    }

    if (CLOUD_PHOTOGRAPHIC_STRICT_READINESS.minimumTransportUpdates < 64 ||
        CLOUD_PHOTOGRAPHIC_STRICT_READINESS.minimumHistoryAcceptanceFraction < 0.9 ||
        CLOUD_PHOTOGRAPHIC_STRICT_READINESS.minimumStableHistoryAge < 0.75 ||
        CLOUD_PHOTOGRAPHIC_STRICT_READINESS.minimumPersistentHistoryConfidence < 0.85 ||
        CLOUD_PHOTOGRAPHIC_STRICT_READINESS.allowEmptyFrame ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireWebGpu ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireCurrentCaseEvidence ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireCompleteLightVolume ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireFiniteTransport ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireHistoryValid ||
        !CLOUD_PHOTOGRAPHIC_STRICT_READINESS.requireReconstructionMaturity) {
        issue("weak-readiness", "strict-readiness", "Screenshot readiness must retain the measured WebGPU/light/transport contract.");
    }

    return issues;
};

export const CLOUD_PHOTOGRAPHIC_QUALIFICATION_ISSUES =
    validateCloudPhotographicQualificationMatrix();

const coreAxisValues = <K extends keyof CorePhotographicQualificationCase>(key: K) =>
    new Set(CLOUD_PHOTOGRAPHIC_CORE_CASES.map((entry) => entry[key])).size;

export const CLOUD_PHOTOGRAPHIC_QUALIFICATION_SUMMARY = {
    invariantCount: CLOUD_PHOTOGRAPHIC_INVARIANTS.length,
    speciesEnvironmentCases: CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT.length,
    speciesReferences: new Set(CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT.map(({ referenceId }) => referenceId)).size,
    morphologyTargets: CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT.length,
    weatherTargets: CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT.length,
    compactCoreCases: CLOUD_PHOTOGRAPHIC_CORE_CASES.length,
    nextReviewCaptures: CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.length,
    nextReviewFinalImages: CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.filter(
        ({ debugView }) => debugView === "final",
    ).length,
    coreAxisValues: {
        qualificationSets: coreAxisValues("qualificationSet"),
        genera: coreAxisValues("genus"),
        perspectives: coreAxisValues("perspective"),
        coverages: coreAxisValues("coverage"),
        lighting: coreAxisValues("lighting"),
        lifecycle: coreAxisValues("lifecycle"),
    },
    implementationGaps: CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT.filter(
        ({ implementation }) => implementation !== "photographically-qualified",
    ).length,
    validationIssues: CLOUD_PHOTOGRAPHIC_QUALIFICATION_ISSUES.length,
} as const;

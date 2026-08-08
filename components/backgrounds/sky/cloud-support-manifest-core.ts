export const CLOUD_SUPPORT_MATURITY_LEVELS = [
    {
        level: 0,
        id: "declared",
        label: "Declared",
        evidence: "The taxonomy or qualification route is explicitly catalogued.",
    },
    {
        level: 1,
        id: "compiled",
        label: "Compiled",
        evidence: "The route compiles into a valid cloud-system representation.",
    },
    {
        level: 2,
        id: "runtime-active",
        label: "Runtime active",
        evidence: "Distinct route state reaches the production runtime.",
    },
    {
        level: 3,
        id: "transport-active",
        label: "Transport active",
        evidence: "Distinct geometry, material, or weather state influences transport pixels.",
    },
    {
        level: 4,
        id: "dynamically-active",
        label: "Dynamically active",
        evidence: "The route evolves through a causal, persistent lifecycle.",
    },
    {
        level: 5,
        id: "strict-ready",
        label: "Strict ready",
        evidence: "A current render passes finite transport, lighting, and reconstruction readiness.",
    },
    {
        level: 6,
        id: "photograph-qualified",
        label: "Photograph qualified",
        evidence: "Independent views pass the route's photographic invariants.",
    },
    {
        level: 7,
        id: "time-qualified",
        label: "Time qualified",
        evidence: "Motion and lifecycle sequences pass temporal review.",
    },
    {
        level: 8,
        id: "device-qualified",
        label: "Device qualified",
        evidence: "The route passes the declared device, performance, and reliability matrix.",
    },
] as const;

export type CloudSupportMaturityLevel =
    (typeof CLOUD_SUPPORT_MATURITY_LEVELS)[number]["level"];
export type CloudSupportMaturityId =
    (typeof CLOUD_SUPPORT_MATURITY_LEVELS)[number]["id"];

export type CloudSupportCatalog = "base" | "orthogonal" | "weather";
export type CloudSupportSourceStatus =
    | "not-representable"
    | "packed"
    | "operator-active"
    | "transport-attached"
    | "photographically-qualified";

export interface CloudSupportClassificationSnapshot {
    genus: string;
    species: string | null;
    varieties: readonly string[];
    supplementaryFeatures: readonly string[];
    accessoryClouds: readonly string[];
    origin: unknown;
}

export interface CloudSupportQualificationDraft {
    caseCount: number;
    environments: readonly string[];
    perspectives: readonly string[];
    coverages?: readonly string[];
    invariantIds: readonly string[];
    cues: readonly string[];
}

export interface CloudSupportRouteDraft {
    id: string;
    catalog: CloudSupportCatalog;
    axis: string;
    kind: string;
    genus: string | null;
    designation: string;
    label: string;
    sourceStatus: CloudSupportSourceStatus;
    source: string;
    classification?: CloudSupportClassificationSnapshot;
    qualification: CloudSupportQualificationDraft;
    dynamicEvidence?: boolean;
    strictReadyEvidence?: boolean;
    timeEvidence?: boolean;
    deviceEvidence?: boolean;
}

export interface CloudSupportEvidence {
    declared: true;
    compiled: boolean;
    runtimeActive: boolean;
    transportActive: boolean;
    dynamicallyActive: boolean;
    strictReady: boolean;
    photographQualified: boolean;
    timeQualified: boolean;
    deviceQualified: boolean;
}

export type CloudSupportEvidenceStage = Exclude<
    keyof CloudSupportEvidence,
    "declared"
>;

export interface CloudSupportRoute extends Omit<
    CloudSupportRouteDraft,
    "dynamicEvidence" | "strictReadyEvidence" | "timeEvidence" |
    "deviceEvidence" | "qualification"
> {
    maturityLevel: CloudSupportMaturityLevel;
    maturityId: CloudSupportMaturityId;
    supportQualified: boolean;
    releaseQualified: boolean;
    evidence: CloudSupportEvidence;
    blockedEvidence: readonly CloudSupportEvidenceStage[];
    qualification: {
        caseCount: number;
        environments: readonly string[];
        perspectives: readonly string[];
        coverages: readonly string[];
        invariantIds: readonly string[];
        cues: readonly string[];
    };
}

export interface CloudSupportManifestInput {
    taxonomy: {
        provider: string;
        classificationUrl: string;
        associatedFormsUrl: string;
    };
    generatedFrom: readonly string[];
    expectedCounts: {
        base: number;
        orthogonal: number;
        weather: number;
        total: number;
        genera: number;
    };
    routes: readonly CloudSupportRouteDraft[];
}

export interface CloudSupportManifestIssue {
    code: string;
    subject: string;
    message: string;
}

const EVIDENCE_SEQUENCE = [
    "compiled",
    "runtimeActive",
    "transportActive",
    "dynamicallyActive",
    "strictReady",
    "photographQualified",
    "timeQualified",
    "deviceQualified",
] as const satisfies readonly CloudSupportEvidenceStage[];

const uniqueSorted = (values: readonly string[]) =>
    [...new Set(values)].sort((left, right) => left.localeCompare(right));

const countBy = (values: readonly string[]): Record<string, number> =>
    Object.fromEntries(uniqueSorted(values).map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
    ]));

const statusEvidence = (
    route: CloudSupportRouteDraft,
): CloudSupportEvidence => {
    const representable = route.sourceStatus !== "not-representable";
    const transportActive = route.sourceStatus === "operator-active" ||
        route.sourceStatus === "transport-attached" ||
        route.sourceStatus === "photographically-qualified";
    const photographQualified =
        route.sourceStatus === "photographically-qualified";
    return {
        declared: true,
        compiled: representable,
        runtimeActive: representable,
        transportActive,
        dynamicallyActive: route.dynamicEvidence ?? false,
        strictReady: route.strictReadyEvidence ?? photographQualified,
        photographQualified,
        timeQualified: route.timeEvidence ?? false,
        deviceQualified: route.deviceEvidence ?? false,
    };
};

const maturityFor = (evidence: CloudSupportEvidence) => {
    let reached = 0;
    for (const stage of EVIDENCE_SEQUENCE) {
        if (!evidence[stage]) break;
        reached += 1;
    }
    return CLOUD_SUPPORT_MATURITY_LEVELS[reached];
};

const blockedEvidenceFor = (
    evidence: CloudSupportEvidence,
): readonly CloudSupportEvidenceStage[] => {
    const blocked: CloudSupportEvidenceStage[] = [];
    let prerequisiteMissing = false;
    for (const stage of EVIDENCE_SEQUENCE) {
        if (!evidence[stage]) {
            prerequisiteMissing = true;
        } else if (prerequisiteMissing) {
            blocked.push(stage);
        }
    }
    return blocked;
};

const normalizeRoute = (draft: CloudSupportRouteDraft): CloudSupportRoute => {
    const evidence = statusEvidence(draft);
    const maturity = maturityFor(evidence);
    return {
        id: draft.id,
        catalog: draft.catalog,
        axis: draft.axis,
        kind: draft.kind,
        genus: draft.genus,
        designation: draft.designation,
        label: draft.label,
        sourceStatus: draft.sourceStatus,
        source: draft.source,
        ...(draft.classification ? { classification: draft.classification } : {}),
        maturityLevel: maturity.level,
        maturityId: maturity.id,
        supportQualified: maturity.level >= 6,
        releaseQualified: maturity.level === 8,
        evidence,
        blockedEvidence: blockedEvidenceFor(evidence),
        qualification: {
            caseCount: draft.qualification.caseCount,
            environments: uniqueSorted(draft.qualification.environments),
            perspectives: uniqueSorted(draft.qualification.perspectives),
            coverages: uniqueSorted(draft.qualification.coverages ?? []),
            invariantIds: uniqueSorted(draft.qualification.invariantIds),
            cues: uniqueSorted(draft.qualification.cues),
        },
    };
};

export const buildCloudSupportManifest = (input: CloudSupportManifestInput) => {
    const routes = input.routes.map(normalizeRoute)
        .sort((left, right) => left.id.localeCompare(right.id));
    return {
        schemaVersion: 1,
        taxonomy: input.taxonomy,
        generatedFrom: uniqueSorted(input.generatedFrom),
        policy: {
            supportClaimMaturityLevel: 6,
            releaseMaturityLevel: 8,
            cumulativeEvidence: true,
            note: "Later evidence is recorded but cannot skip an earlier maturity gate.",
        },
        expectedCounts: input.expectedCounts,
        maturityLevels: CLOUD_SUPPORT_MATURITY_LEVELS,
        summary: {
            routes: routes.length,
            genera: new Set(routes.flatMap(({ genus }) => genus ? [genus] : [])).size,
            catalogs: countBy(routes.map(({ catalog }) => catalog)),
            axes: countBy(routes.map(({ axis }) => axis)),
            sourceStatuses: countBy(routes.map(({ sourceStatus }) => sourceStatus)),
            maturity: countBy(routes.map(({ maturityId }) => maturityId)),
            transportActive: routes.filter(({ evidence }) =>
                evidence.transportActive).length,
            dynamicallyActive: routes.filter(({ evidence }) =>
                evidence.dynamicallyActive).length,
            strictReadyEvidence: routes.filter(({ evidence }) =>
                evidence.strictReady).length,
            photographicEvidence: routes.filter(({ evidence }) =>
                evidence.photographQualified).length,
            timeQualifiedEvidence: routes.filter(({ evidence }) =>
                evidence.timeQualified).length,
            deviceQualifiedEvidence: routes.filter(({ evidence }) =>
                evidence.deviceQualified).length,
            supportQualified: routes.filter(({ supportQualified }) =>
                supportQualified).length,
            releaseQualified: routes.filter(({ releaseQualified }) =>
                releaseQualified).length,
        },
        routes,
    } as const;
};

export type CloudSupportManifest = ReturnType<typeof buildCloudSupportManifest>;

const duplicates = (values: readonly string[]) => {
    const seen = new Set<string>();
    const duplicateValues = new Set<string>();
    for (const value of values) {
        if (seen.has(value)) duplicateValues.add(value);
        seen.add(value);
    }
    return [...duplicateValues];
};

const sameValues = (left: readonly string[], right: readonly string[]) =>
    left.length === right.length && left.every((value, index) =>
        value === right[index]);

export const validateCloudSupportManifest = (
    manifest: CloudSupportManifest,
): readonly CloudSupportManifestIssue[] => {
    const issues: CloudSupportManifestIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });

    if (manifest.schemaVersion !== 1) {
        issue("unsupported-schema", "manifest",
            `Expected schema 1, received ${manifest.schemaVersion}.`);
    }
    for (const duplicate of duplicates(manifest.routes.map(({ id }) => id))) {
        issue("duplicate-route", duplicate,
            "Support route identifiers must be unique.");
    }

    const actualCatalogs = manifest.summary.catalogs;
    for (const catalog of ["base", "orthogonal", "weather"] as const) {
        const expected = manifest.expectedCounts[catalog];
        const actual = actualCatalogs[catalog] ?? 0;
        if (actual !== expected) {
            issue("catalog-count-drift", catalog,
                `Expected ${expected} routes, received ${actual}.`);
        }
    }
    if (manifest.routes.length !== manifest.expectedCounts.total) {
        issue("total-count-drift", "routes",
            `Expected ${manifest.expectedCounts.total} routes, received ` +
            `${manifest.routes.length}.`);
    }
    if (manifest.summary.genera !== manifest.expectedCounts.genera) {
        issue("genus-count-drift", "genera",
            `Expected ${manifest.expectedCounts.genera} genera, received ` +
            `${manifest.summary.genera}.`);
    }

    for (const route of manifest.routes) {
        if (!route.id || !route.label || !route.designation || !route.source) {
            issue("incomplete-route-identity", route.id || "unnamed",
                "Every support route needs an ID, label, designation, and source.");
        }
        if (!Number.isInteger(route.qualification.caseCount) ||
            route.qualification.caseCount < 1) {
            issue("invalid-case-count", route.id,
                "Every support route must resolve at least one qualification case.");
        }
        if (route.qualification.environments.length === 0 ||
            route.qualification.perspectives.length === 0) {
            issue("missing-view-dimensions", route.id,
                "Every route must declare environment and perspective dimensions.");
        }
        if (route.qualification.invariantIds.length < 3) {
            issue("weak-invariant-coverage", route.id,
                "Every route must carry at least three photographic invariants.");
        }
        if (route.qualification.cues.length === 0) {
            issue("missing-acceptance-cues", route.id,
                "Every route must carry at least one acceptance cue.");
        }

        const maturity = maturityFor(route.evidence);
        if (maturity.level !== route.maturityLevel ||
            maturity.id !== route.maturityId) {
            issue("maturity-mismatch", route.id,
                "Stored maturity does not match cumulative evidence.");
        }
        const expectedBlocked = blockedEvidenceFor(route.evidence);
        if (!sameValues(expectedBlocked, route.blockedEvidence)) {
            issue("blocked-evidence-mismatch", route.id,
                "Blocked evidence does not match the first missing prerequisite.");
        }
        if (route.supportQualified !== (route.maturityLevel >= 6)) {
            issue("support-claim-mismatch", route.id,
                "Support qualification must begin at maturity level 6.");
        }
        if (route.releaseQualified !== (route.maturityLevel === 8)) {
            issue("release-claim-mismatch", route.id,
                "Release qualification requires maturity level 8.");
        }
    }
    return issues;
};

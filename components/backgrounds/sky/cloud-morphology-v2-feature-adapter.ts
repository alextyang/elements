import type {
    CloudMorphologyCompileRequest,
} from "./cloud-morphology-modifiers";
import type {
    CloudFeatureRecordV2,
} from "./cloud-system-abi-v2";
import type {
    CloudSystemRuntime,
    RuntimeCloudSystem,
} from "./cloud-system-runtime";
import type {
    CloudMaterialClass,
    CloudVec3,
} from "./cloud-physical-sample";

export type CloudMorphologyV2SemanticParity =
    | "exact-owner-state"
    | "semantic-only";

export interface CloudMorphologyV2FeatureIssue {
    code: string;
    severity: "warning" | "error";
    subject: string;
    message: string;
}

export interface CloudMorphologyV2OwnerFeatures {
    ownerIndex: number;
    ownerId: string;
    expectedSemanticIds: readonly string[];
    features: readonly Omit<CloudFeatureRecordV2,
        "featureId" | "parentOwnerNumericId">[];
    semanticComplete: boolean;
    operatorParityComplete: boolean;
    issues: readonly CloudMorphologyV2FeatureIssue[];
}

export interface CloudMorphologyV2Migration {
    schemaVersion: 1;
    owners: readonly CloudMorphologyV2OwnerFeatures[];
    featuresByOwner: ReadonlyMap<number,
        readonly Omit<CloudFeatureRecordV2,
            "featureId" | "parentOwnerNumericId">[]>;
    expectedSemanticFeatures: number;
    migratedSemanticFeatures: number;
    semanticComplete: boolean;
    operatorParityComplete: boolean;
    issues: readonly CloudMorphologyV2FeatureIssue[];
}

type FeatureBlend = "placement" | "warp" | "subtract" |
    "smooth-union" | "reuse" | "optical";

interface FeatureProfile {
    blend: FeatureBlend;
    material?: CloudMaterialClass;
    offset: CloudVec3;
    scale: CloudVec3;
    density: number;
    liquid: number;
    ice: number;
    precipitation: number;
}

const profile = (
    blend: FeatureBlend,
    offset: CloudVec3,
    scale: CloudVec3,
    overrides: Partial<Omit<FeatureProfile,
        "blend" | "offset" | "scale">> = {},
): FeatureProfile => ({
    blend,
    offset,
    scale,
    density: 1,
    liquid: 1,
    ice: 1,
    precipitation: 0,
    ...overrides,
});

/**
 * Parent-local semantic placement for every orthogonal WMO morphology axis.
 * These records preserve ownership, scale, material phase and causal placement.
 * Exact manifest operator parameters remain a separate parity gate.
 */
const FEATURE_PROFILES: Readonly<Record<string, FeatureProfile>> = Object.freeze({
    intortus: profile("warp", [0, 0.25, 0], [1, 0.7, 1], { ice: 1.35 }),
    vertebratus: profile("smooth-union", [0, 0.1, 0], [0.85, 0.55, 1], {
        material: "ice-cloud", liquid: 0, ice: 1.5,
    }),
    undulatus: profile("warp", [0, 0, 0], [1, 0.4, 1]),
    radiatus: profile("placement", [0, 0, 0], [1, 0.55, 1]),
    lacunosus: profile("subtract", [0, 0, 0], [0.65, 0.7, 0.65], {
        density: 0,
    }),
    duplicatus: profile("placement", [0, 0.18, 0], [1, 0.32, 1]),
    translucidus: profile("optical", [0, 0, 0], [1, 1, 1], { density: 0.65 }),
    perlucidus: profile("subtract", [0, 0, 0], [0.42, 0.8, 0.42], {
        density: 0,
    }),
    opacus: profile("optical", [0, 0, 0], [1, 1, 1], { density: 1.35 }),
    incus: profile("smooth-union", [0, 0.92, 0.22], [1.45, 0.18, 1.2], {
        material: "ice-cloud", liquid: 0, ice: 1.8,
    }),
    mamma: profile("smooth-union", [0, 0.58, 0.12], [0.65, 0.22, 0.65], {
        material: "mixed-phase-cloud", ice: 1.25,
    }),
    virga: profile("smooth-union", [0, -0.82, 0.12], [0.65, 0.8, 0.65], {
        material: "rain", density: 0.42, precipitation: 1.5,
    }),
    praecipitatio: profile("smooth-union", [0, -0.9, 0.15], [0.8, 0.95, 0.8], {
        material: "rain", density: 0.58, precipitation: 2,
    }),
    arcus: profile("smooth-union", [0, -0.5, 0.72], [1.2, 0.24, 0.42], {
        material: "liquid-cloud", liquid: 1.35,
    }),
    tuba: profile("smooth-union", [0, -0.82, 0], [0.22, 0.9, 0.22], {
        material: "mixed-phase-cloud", density: 0.72,
    }),
    asperitas: profile("warp", [0, -0.45, 0], [1, 0.32, 1]),
    fluctus: profile("warp", [0, 0.35, 0], [1, 0.45, 0.65]),
    cavum: profile("subtract", [0, 0, 0], [0.48, 1, 0.48], {
        density: 0, precipitation: 0.35,
    }),
    murus: profile("smooth-union", [0, -0.58, -0.1], [0.45, 0.35, 0.45], {
        material: "mixed-phase-cloud", density: 0.88,
    }),
    cauda: profile("smooth-union", [0, -0.68, 0.72], [0.42, 0.3, 0.95], {
        material: "mixed-phase-cloud", density: 0.68,
    }),
    pileus: profile("smooth-union", [0, 0.9, 0], [0.62, 0.12, 0.62], {
        material: "liquid-cloud", density: 0.52, liquid: 1.25,
    }),
    velum: profile("smooth-union", [0, 0.62, 0], [1.15, 0.12, 1.15], {
        material: "liquid-cloud", density: 0.4,
    }),
    pannus: profile("smooth-union", [0, -0.78, 0], [0.9, 0.32, 0.9], {
        material: "mixed-phase-cloud", density: 0.58, precipitation: 0.7,
    }),
    flumen: profile("smooth-union", [0, -0.58, -0.85], [0.5, 0.28, 1.2], {
        material: "mixed-phase-cloud", density: 0.66,
    }),
    "polar-stratospheric-sts": profile("optical", [0, 0, 0], [1, 1, 1], {
        material: "aerosol-condensation", density: 0.28, liquid: 0.25, ice: 0.25,
    }),
    "polar-stratospheric-nat": profile("optical", [0, 0, 0], [1, 1, 1], {
        material: "ice-cloud", density: 0.32, liquid: 0, ice: 1.35,
    }),
    "polar-stratospheric-ice": profile("optical", [0, 0, 0], [1, 1, 1], {
        material: "ice-cloud", density: 0.38, liquid: 0, ice: 1.6,
    }),
    nacreous: profile("optical", [0, 0, 0], [1, 1, 1], {
        material: "ice-cloud", density: 0.42, liquid: 0, ice: 1.7,
    }),
    noctilucent: profile("smooth-union", [0, 0, 0], [1, 0.22, 1], {
        material: "ice-cloud", density: 0.3, liquid: 0, ice: 1.8,
    }),
    flammagenitus: profile("reuse", [0, 0, 0], [1, 1, 1], {
        material: "aerosol-condensation", density: 0.75,
    }),
    homogenitus: profile("placement", [0, 0, 0], [1, 0.18, 1], {
        material: "ice-cloud", liquid: 0, ice: 1.3,
    }),
    homomutatus: profile("reuse", [0, 0, 0], [1, 0.4, 1], {
        material: "ice-cloud", liquid: 0, ice: 1.2,
    }),
    cataractagenitus: profile("placement", [0, -0.15, 0], [0.75, 0.7, 0.75], {
        material: "liquid-cloud", liquid: 1.4,
    }),
    silvagenitus: profile("placement", [0, -0.25, 0], [1, 0.45, 1], {
        material: "liquid-cloud", liquid: 1.25,
    }),
});

const add = (left: CloudVec3, right: CloudVec3): CloudVec3 => [
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
];
const scale = (value: CloudVec3, amount: number): CloudVec3 => [
    value[0] * amount,
    value[1] * amount,
    value[2] * amount,
];

const materialFor = (
    request: CloudMorphologyCompileRequest,
    selected?: CloudMaterialClass,
): CloudMaterialClass => {
    if (selected) return selected;
    if (request.phase === "ice") return "ice-cloud";
    if (request.phase === "mixed") return "mixed-phase-cloud";
    return "liquid-cloud";
};

const expectedSemanticIds = (
    request: CloudMorphologyCompileRequest,
): readonly string[] => {
    const classification = request.classification;
    const values: string[] = (classification ? [
        ...classification.varieties,
        ...classification.supplementaryFeatures,
        ...classification.accessoryClouds,
        ...(classification.origin.kind === "special"
            ? [classification.origin.designation] : []),
    ] : []).filter((value): value is string =>
        typeof value === "string" && value.length > 0);
    if (request.upperAtmosphericCloud) {
        values.push(request.upperAtmosphericCloud);
    }
    return [...new Set(values)];
};

const attachmentFor = (
    request: CloudMorphologyCompileRequest,
    value: FeatureProfile,
): CloudVec3 => {
    const parent = request.parent;
    let result = parent.centerKm;
    result = add(result, scale(
        parent.axisU,
        value.offset[0] * parent.halfExtentsKm[0],
    ));
    result = add(result, scale(
        parent.axisV,
        value.offset[1] * parent.halfExtentsKm[1],
    ));
    result = add(result, scale(
        parent.axisW,
        value.offset[2] * parent.halfExtentsKm[2],
    ));
    return result;
};

const lifecycleProgress = (request: CloudMorphologyCompileRequest) => ({
    incipient: 0.05,
    growing: 0.25,
    mature: 0.5,
    glaciating: 0.65,
    precipitating: 0.8,
    decaying: 0.95,
})[request.lifecycle];

const orientationFor = (request: CloudMorphologyCompileRequest) =>
    Math.atan2(request.parent.axisW[0], request.parent.axisW[2]);

const featureFor = (
    semanticId: string,
    request: CloudMorphologyCompileRequest,
    system: RuntimeCloudSystem,
    generation: number;
): Omit<CloudFeatureRecordV2, "featureId" | "parentOwnerNumericId"> | null => {
    const value = FEATURE_PROFILES[semanticId];
    if (!value) return null;
    const intensity = Math.max(0, request.intensity ?? 1);
    return {
        id: `${system.state.id}:morphology:${semanticId}`,
        parentOwnerId: system.state.id,
        kind: `${value.blend}:${semanticId}`,
        attachmentKm: attachmentFor(request, value),
        scaleKm: [
            Math.max(0.001, request.parent.halfExtentsKm[0] * value.scale[0]),
            Math.max(0.001, request.parent.halfExtentsKm[1] * value.scale[1]),
            Math.max(0.001, request.parent.halfExtentsKm[2] * value.scale[2]),
        ],
        orientationRadians: orientationFor(request),
        lifecycleProgress01: lifecycleProgress(request),
        active: intensity > 0,
        generation,
        materialClass: materialFor(request, value.material),
        densityMultiplier: value.density * intensity,
        liquidMultiplier: value.liquid,
        iceMultiplier: value.ice,
        precipitationMultiplier: value.precipitation,
        velocityOffsetKmPerSecond: [0, 0, 0],
        ageOffsetSeconds: 0,
    };
};

export const adaptCloudMorphologyRequestToV2Features = (
    request: CloudMorphologyCompileRequest,
    system: RuntimeCloudSystem,
    generation = 0,
    expectedOwnerIndex = request.parent.ownerIndex,
): CloudMorphologyV2OwnerFeatures => {
    const expected = expectedSemanticIds(request);
    const issues: CloudMorphologyV2FeatureIssue[] = [];
    if (request.parent.ownerIndex !== expectedOwnerIndex) {
        issues.push({
            code: "owner-index-mismatch",
            severity: "error",
            subject: system.state.id,
            message: `Morphology owner ${request.parent.ownerIndex} does not match runtime owner index ${expectedOwnerIndex}.`,
        });
    }
    const features = expected.flatMap((semanticId) => {
        const feature = featureFor(semanticId, request, system, generation);
        if (!feature) {
            issues.push({
                code: "unsupported-semantic-feature",
                severity: "error",
                subject: `${system.state.id}:${semanticId}`,
                message: `No V2 semantic feature profile exists for ${semanticId}.`,
            });
            return [];
        }
        return [feature];
    });
    const semanticComplete = issues.every(({ severity }) => severity !== "error") &&
        features.length === expected.length;
    const operatorParityComplete = expected.length === 0;
    if (semanticComplete && !operatorParityComplete) {
        issues.push({
            code: "manifest-operator-parity-pending",
            severity: "warning",
            subject: system.state.id,
            message: "V2 records preserve semantic ownership and physical placement, but exact legacy manifest operator parity still requires GPU comparison evidence.",
        });
    }
    return {
        ownerIndex: request.parent.ownerIndex,
        ownerId: system.state.id,
        expectedSemanticIds: expected,
        features,
        semanticComplete,
        operatorParityComplete,
        issues,
    };
};

export const adaptCloudRuntimeMorphologyV2 = (
    runtime: CloudSystemRuntime,
): CloudMorphologyV2Migration => {
    const requestByOwner = new Map(runtime.morphologyRequests.map((request) => [
        request.parent.ownerIndex,
        request,
    ]));
    const owners: CloudMorphologyV2OwnerFeatures[] = [];
    const issues: CloudMorphologyV2FeatureIssue[] = [];
    for (let ownerIndex = 0; ownerIndex < runtime.systems.length; ownerIndex += 1) {
        const system = runtime.systems[ownerIndex];
        const request = requestByOwner.get(ownerIndex);
        if (!request) {
            owners.push({
                ownerIndex,
                ownerId: system.state.id,
                expectedSemanticIds: [],
                features: [],
                semanticComplete: true,
                operatorParityComplete: true,
                issues: [],
            });
            continue;
        }
        const owner = adaptCloudMorphologyRequestToV2Features(
            request,
            system,
            0,
            ownerIndex,
        );
        owners.push(owner);
        issues.push(...owner.issues);
    }
    for (const request of runtime.morphologyRequests) {
        if (!runtime.systems[request.parent.ownerIndex]) {
            issues.push({
                code: "missing-runtime-owner",
                severity: "error",
                subject: String(request.parent.ownerIndex),
                message: "Morphology request has no matching runtime owner.",
            });
        }
    }
    const featuresByOwner = new Map(owners.map((owner) => [
        owner.ownerIndex,
        owner.features,
    ]));
    const expectedSemanticFeatures = owners.reduce((sum, owner) =>
        sum + owner.expectedSemanticIds.length, 0);
    const migratedSemanticFeatures = owners.reduce((sum, owner) =>
        sum + owner.features.length, 0);
    return {
        schemaVersion: 1,
        owners,
        featuresByOwner,
        expectedSemanticFeatures,
        migratedSemanticFeatures,
        semanticComplete: issues.every(({ severity }) => severity !== "error") &&
            owners.every(({ semanticComplete }) => semanticComplete),
        operatorParityComplete: owners.every(
            ({ operatorParityComplete }) => operatorParityComplete,
        ),
        issues,
    };
};

export const createCloudMorphologyV2FeatureResolver = (
    migration: CloudMorphologyV2Migration,
) => (_system: RuntimeCloudSystem, ownerIndex: number) =>
    migration.featuresByOwner.get(ownerIndex) ?? [];

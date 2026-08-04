import {
    CLOUD_GENUS_CODE,
    CLOUD_GENUS_LEVEL,
    CLOUD_SPECIES_CODE,
    type CloudAuthoredSystemState,
    type CloudLayerState,
    type CloudLayerIndex,
    type CloudScene,
    type CloudSpecies,
} from "./cloud-scene";
import {
    CLOUD_MOTHER_GENUS_RELATIONS,
    CLOUD_RENDERER_RECIPES,
    CLOUD_TOPOLOGY_EXEMPLARS,
    CLOUD_TOPOLOGY_EXEMPLARS_PER_SPECIES,
    classificationFromRendererSpecies,
    compileCloudSystem,
    rendererSpeciesForClassification,
    selectCloudTopologyExemplar,
    type CloudClassification,
    type CloudLifecycleStage,
    type CloudOrganizationState,
    type CloudPrecipitationKind,
    type CloudSystemExtent,
    type CloudSystemState,
    type CloudTopologyExemplar,
    type CompiledCloudSystem,
} from "./cloud-state-map";
import {
    CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS,
    deriveCloudMorphologyRequirements,
    indexCloudMorphologyAssignments,
    resolveCloudMorphologyAssignment,
    type CloudMorphologyClassificationAssignment,
    type CloudMorphologyCompileRequest,
    type CloudMorphologyOwnerGeometry,
} from "./cloud-morphology-modifiers";
import {
    qualifyCloudLayerFamilyAdmissibility,
    qualifyUpperAtmosphericSceneState,
} from "./cloud-family-admissibility";
import {
    applyCloudCrossOwnerCausalRelationship,
    adaptCloudFamilyProduction,
    type CloudFamilyProductionMetadata,
} from "./cloud-family-production-adapter";
import {
    validateCloudSpecialOriginSource,
    type CloudSpecialOriginSource,
} from "./cloud-special-origin-source";
import {
    LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS,
    lowLayeredCloudTopologyVariantSignature,
    qualifyLowLayeredSystemDomain,
    samplePannusUnderdeckState,
    type CloudSystemPlacementMode,
    type LowLayeredCloudRepresentation,
} from "./low-layered-cloud-physical-foundation";
import { qualifyLowLayeredLayout } from
    "./low-layered-cloud-topology-qualification";
import {
    UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
    selectUpperTopologyVariant,
} from "./upper-atmospheric-cloud-foundation";
import { HIGH_CLOUD_TOPOLOGY_VARIANTS } from
    "./high-cloud-physical-foundation";
import {
    cloudAtlasMaterialOccupancyFactorFor,
} from "./cloud-atlas-material-profile";

/** Maximum production population: twelve finite owners in each WMO level. */
export const CLOUD_SYSTEM_MAX_COUNT = 36;
export const CLOUD_SYSTEM_VEC4_STRIDE = 16;
export const CLOUD_SYSTEM_HEADER_VEC4S = 1;
export const CLOUD_SYSTEM_BUFFER_FLOATS =
    (CLOUD_SYSTEM_HEADER_VEC4S +
        CLOUD_SYSTEM_MAX_COUNT * CLOUD_SYSTEM_VEC4_STRIDE) * 4;

/** Temporary layout consumed by the current CloudFeature WGSL declaration. */
export const CLOUD_FEATURE_SLOTS_PER_LAYER = 12;
export const CLOUD_FEATURE_VEC4_STRIDE = 8;
export const CLOUD_FEATURE_COUNT = CLOUD_FEATURE_SLOTS_PER_LAYER * 3;
export const CLOUD_FEATURE_BUFFER_FLOATS =
    CLOUD_FEATURE_COUNT * CLOUD_FEATURE_VEC4_STRIDE * 4;

/**
 * Storage-buffer ABI. The leading vec4 is [count, stride, capacity, dropped].
 * Every following record is exactly 256 bytes and naturally vec4 aligned.
 */
export const CLOUD_SYSTEM_VEC4_LAYOUT = {
    identity: 0,
    horizontalExtent: 1,
    verticalExtent: 2,
    formationLevels: 3,
    capAndShear: 4,
    opticalMaterial: 5,
    thermodynamics: 6,
    kinematics: 7,
    lifecycle: 8,
    lifecycleTendencies: 9,
    organizationPrimary: 10,
    organizationSecondary: 11,
    precipitation: 12,
    classificationMasks: 13,
    deterministicSeeds: 14,
    buoyancyAndTurbulence: 15,
} as const;

export interface RuntimeCloudSystem {
    layerIndex: number;
    systemIndex: number;
    seeds: readonly [number, number, number, number];
    /** Stable causal macroshape selected from scene/day and owner identity. */
    topologyExemplar: CloudTopologyExemplar;
    /** Existing atlas selector lane; adding it does not alter the packed GPU ABI. */
    atlasDeterministicVariant: number;
    state: CloudSystemState;
    compiled: CompiledCloudSystem;
    /** Foundation state that materially produced geometry and microphysics. */
    familyProduction?: CloudFamilyProductionMetadata;
    /** Explicit scene assignment, when one resolved before recipe fallback. */
    morphologyAssignment?: CloudMorphologyClassificationAssignment;
}

export interface PackedCloudSystems {
    data: Float32Array;
    count: number;
    capacity: number;
    dropped: number;
}

export interface CloudSystemRuntime {
    signature: string;
    systems: readonly RuntimeCloudSystem[];
    diagnostics: readonly string[];
    packedSystemData: PackedCloudSystems;
    /** Compatibility projection; remove after WGSL consumes packedSystemData. */
    legacyFeatureData: Float32Array;
    /** Manifest-independent records compiled after the validated asset loads. */
    morphologyRequests: readonly CloudMorphologyCompileRequest[];
    /** Maps morphology owner index back to a tropospheric layer; -1 is upper atmosphere. */
    morphologyOwnerLayers: readonly number[];
    /** Production-camera composition diagnostics; never feeds generation. */
    compositionQualifications: readonly CloudFrameCompositionQualification[];
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const lerp = (low: number, high: number, amount: number) =>
    low + (high - low) * amount;
const midpoint = (range: readonly [number, number]) =>
    (range[0] + range[1]) * 0.5;

interface NormalizedSystemPlacement {
    /** Bearing in the scene's fixed Earth-local weather domain, in radians. */
    angle: number;
    /** Multiplicative range within the topology's meteorological distance band. */
    rangeScale: number;
    /** Stable owner-scale class; keeps one readable tree and unequal companions. */
    sizeScale: number;
}

/**
 * Product sky scenes use a stable view-local meteorological tangent frame:
 * zero bearing is the physical forward meridian of that authored domain.
 * Fibratus qualification is deliberately expressed in this world frame, not
 * in pixels or in a per-frame camera transform.
 */
export const CIRRUS_FIBRATUS_QUALIFIED_MERIDIAN_RADIANS = 0;

/**
 * World-space radial strata used by a sparse Ci-fibratus field. At the normal
 * 8--11 km altitude these resolve to roughly 20, 40 and 70 km horizontal
 * range: a foreground formation, a readable middle field and fine remote
 * fibres. Further owners live elsewhere on the dome and preserve the complete
 * camera-independent weather population.
 */
export const CIRRUS_FIBRATUS_RADIAL_STRATA = [0.15, 0.30, 0.58] as const;

export interface CloudPopulationProjectionOptions {
    /** Earth-local bearing clockwise from north. Omit to sample the full dome. */
    azimuthRadians?: number;
    /** Centre elevation above the astronomical horizon. */
    elevationRadians?: number;
    horizontalFovRadians?: number;
    verticalFovRadians?: number;
    sampleCount?: number;
}

export interface CloudPopulationProjection {
    /** Fraction of the sampled solid angle intersecting at least one owner. */
    supportFraction: number;
    /** Owners intersected by at least one of the deterministic sample rays. */
    visibleOwnerCount: number;
    sampledRays: number;
}

export interface CloudFrameProjectionOptions extends
    Required<Pick<CloudPopulationProjectionOptions,
        "azimuthRadians" | "elevationRadians" |
        "horizontalFovRadians" | "verticalFovRadians">> {
    horizontalSamples?: number;
    verticalSamples?: number;
    /** Sub-pixel sample offset; qualification exercises the full [-0.5, .5] range. */
    jitterPixels?: readonly [horizontal: number, vertical: number];
}

/**
 * One fixed production perspective for composition qualification. Runtime
 * population never receives this value; it is only the stable reference used
 * by the read-only acceptance record and by the canonical audit.
 */
export const CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS:
    CloudFrameProjectionOptions = {
        azimuthRadians: 0,
        elevationRadians: 27 * Math.PI / 180,
        horizontalFovRadians: 64 * Math.PI / 180,
        verticalFovRadians: 43.52 * Math.PI / 180,
    };

export interface CloudOwnerFrameProjection {
    ownerIndex: number;
    supportedFraction: number;
    supportedShare: number;
    bounds: Readonly<{
        minimumX: number;
        maximumX: number;
        minimumY: number;
        maximumY: number;
    }>;
    edgeContacts: Readonly<{
        left: boolean;
        right: boolean;
        top: boolean;
        bottom: boolean;
        count: number;
        leftRunFraction: number;
        rightRunFraction: number;
        topRunFraction: number;
        bottomRunFraction: number;
        interiorSupportFraction: number;
    }>;
    projectedHorizontalSpanRadians: number;
    projectedVerticalSpanRadians: number;
    /** Physical family element/fibre diameter at this owner's slant range. */
    projectedElementWidthRadians: number;
    horizontalRangeKm: number;
}

export interface CloudFrameProjection {
    /**
     * Geometric finite-owner envelope support only. This is not atlas density
     * or optical material occupancy; those remain a separate morphology and
     * transport qualification stage.
     */
    supportFraction: number;
    negativeSkyFraction: number;
    visibleOwnerCount: number;
    sampledRays: number;
    ownerProjections: readonly CloudOwnerFrameProjection[];
    /** Union of owner contacts with the four natural frame boundaries. */
    edgeContacts: Readonly<{
        left: boolean;
        right: boolean;
        top: boolean;
        bottom: boolean;
        count: number;
        robustCount: number;
    }>;
}

/**
 * Camera-independent amount bands. These are deliberately broad physical
 * intervals rather than a universal `coverage * constant`: sparse fields can
 * remain isolated, while broken/extensive/overcast sheets get progressively
 * stronger lower bounds on projected solid-angle support.
 */
export const CLOUD_FRAME_COMPOSITION_BANDS = {
    sparse: { maximumCoverage: 0.32, support: [0.04, 0.32] },
    broken: { maximumCoverage: 0.56, support: [0.10, 0.78] },
    extensive: { maximumCoverage: 0.875, support: [0.20, 0.95] },
    overcast: { maximumCoverage: 1, support: [0.58, 1] },
} as const;

/**
 * Species-qualified support envelopes for the small, finite high-cloud
 * packets.  These are physical owner-domain contracts, not a camera or
 * opacity adjustment: the natural photographic qualification uses the same
 * finite-world projection and therefore must retain these tighter upper
 * bounds than the generic amount bands.
 */
export const HIGH_CLOUD_PHYSICAL_SUPPORT_CONTRACTS = Object.freeze({
    "cirrus-spissatus": [0.07, 0.16],
    "cirrus-castellanus": [0.058, 0.08],
    "cirrus-floccus": [0.04, 0.10],
    "cirrocumulus-castellanus": [0.045, 0.075],
    "cirrocumulus-floccus": [0.025, 0.065],
} as const);

export type CloudFrameCompositionSemantic =
    | "immediate-overcast"
    | "immediate-broken-field"
    | "distant-finite-sheet"
    | "partial-finite-field"
    | "isolated-finite-owner";

export interface CloudFrameCompositionContract {
    semantic: CloudFrameCompositionSemantic;
    authoredCoverage: number;
    authoredOktas: number;
    expectedSupport: readonly [number, number];
    minimumVisibleOwners: number;
    minimumEdgeContacts: number;
    requireAllFrameEdges: boolean;
    cameraInsideRequired: boolean;
}

export interface CloudFrameCompositionQualification {
    layerIndex: number;
    representation: string;
    contract: CloudFrameCompositionContract;
    projection: CloudFrameProjection;
    /** Material sky support after authored broken-field coverage is applied. */
    materialSupportFraction: number;
    materialEvidence: CloudFrameMaterialOccupancyEvidence;
    /** Camera-independent radial spacing audit for the complete owner set. */
    population: CloudWorldPopulationCompositionCheck;
    cameraInside: boolean;
    valid: boolean;
    violations: readonly string[];
}

export interface CloudFrameMaterialOccupancyEvidence {
    supportFraction: number;
    ownerFractions: readonly number[];
    occupiedSamples: number;
    sampledRays: number;
    source: "generated-atlas-profile" | "atlas-production-projection";
}

export interface CloudWorldPopulationCompositionCheck {
    ownerCount: number;
    radialRangeKm: readonly [minimum: number, maximum: number];
    radialCoefficientOfVariation: number;
    minimumPairwiseSpacingKm: number;
    maximumPairwiseSpacingKm: number;
    radialBandCount: number;
    maximumRadialClusterFraction: number;
    maximumAngularGapRadians: number;
    ringLike: boolean;
}

const setVector = (
    target: Float32Array,
    vectorIndex: number,
    values: readonly number[],
) => target.set(values, vectorIndex * 4);

const hashText = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const mulberry32 = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };
};

const rounded = (value: number) => Math.round(value * 100_000) / 100_000;

const cloudLayerPhysicalSignatureState = (layer: CloudLayerState) => ({
    genus: layer.genus,
    species: layer.species,
    present: layer.present,
    baseAltitude: rounded(layer.baseAltitude),
    thickness: rounded(layer.thickness),
    coverage: rounded(layer.coverage),
    oktas: rounded(layer.oktas),
    opticalDepth: rounded(layer.opticalDepth),
    towerAmount: rounded(layer.towerAmount),
    anvilAmount: rounded(layer.anvilAmount),
    iceFraction: rounded(layer.iceFraction),
    detailStrength: rounded(layer.detailStrength),
    windSpeed: rounded(layer.windSpeed),
    windDirection: rounded(layer.windDirection),
    shear: rounded(layer.shear),
    turbulence: rounded(layer.turbulence),
    precipitation: rounded(layer.precipitation),
    organization: layer.organization,
    lifecycle: rounded(layer.lifecycle),
    organizationStrength: rounded(layer.organizationStrength),
});

const cloudSystemPhysicalSignatureState = (scene: CloudScene) => ({
    seed: scene.seed.map(rounded),
    convection: rounded(scene.convection),
    instability: rounded(scene.instability),
    humidity: rounded(scene.humidity),
    layers: scene.layers.map(cloudLayerPhysicalSignatureState),
    ...(scene.authoredSystems ? {
        authoredSystems: scene.authoredSystems.map((system) => ({
            id: system.id,
            layerIndex: system.layerIndex,
            layer: cloudLayerPhysicalSignatureState(system.layer),
            manifold: Object.fromEntries(Object.entries(system.manifold).map(
                ([key, value]) => [key, rounded(value)],
            )),
        })),
    } : {}),
});

/** Stable meteorological identity; intentionally excludes every camera option. */
export const cloudSystemSceneSignature = (scene: CloudScene) => JSON.stringify({
    physical: cloudSystemPhysicalSignatureState(scene),
    latitude: scene.latitude === undefined ? null : rounded(scene.latitude),
    season: scene.season === undefined ? null : rounded(scene.season),
    solarDepression: scene.solarDepression === undefined
        ? null : rounded(scene.solarDepression),
    stratosphericTemperatureKelvin:
        scene.stratosphericTemperatureKelvin === undefined
            ? null : rounded(scene.stratosphericTemperatureKelvin),
    mesopauseTemperatureKelvin:
        scene.mesopauseTemperatureKelvin === undefined
            ? null : rounded(scene.mesopauseTemperatureKelvin),
    classifications: (scene.classifications ?? []).map((assignment) => ({
        layerIndex: assignment.layerIndex,
        systemId: assignment.systemId ?? null,
        systemIndex: assignment.systemIndex ?? null,
        scope: assignment.scope ?? "owner",
        relation: assignment.relation ?? "independent",
        causalParent: assignment.causalParent ?? null,
        transitionProgress: assignment.transitionProgress ?? null,
        sourceId: assignment.sourceId ?? null,
        upperAtmosphericCloud: assignment.upperAtmosphericCloud ?? null,
        classification: assignment.classification,
    })),
    specialOriginSources: (scene.specialOriginSources ?? []).map((source) => ({
        id: source.id,
        designation: source.designation,
        kind: source.kind,
        geometry: source.geometry,
        emission: source.emission,
        composition: source.composition,
        birthTimeSeconds: rounded(source.birthTimeSeconds),
        ageSeconds: rounded(source.ageSeconds),
        activeLifetimeSeconds: rounded(source.activeLifetimeSeconds),
        advectionSpeedMps: rounded(source.advectionSpeedMps),
        advectionDirection: rounded(source.advectionDirection),
    })),
});

/** Owner identity is invariant under orthogonal classification edits. */
const cloudSystemOwnerSignature = (scene: CloudScene) =>
    JSON.stringify(cloudSystemPhysicalSignatureState(scene));

const pushFamilyDiagnostics = (
    diagnostics: string[],
    prefix: string,
    issues: readonly { code: string; message: string }[],
) => {
    for (const issue of issues) {
        diagnostics.push(`${prefix}:${issue.code}:${issue.message}`);
    }
};

const indexSpecialOriginSources = (
    scene: CloudScene,
    diagnostics: string[],
) => {
    const indexed = new Map<string, CloudSpecialOriginSource>();
    for (const source of scene.specialOriginSources ?? []) {
        if (indexed.has(source.id)) {
            diagnostics.push(`source:${source.id}:duplicate-special-origin-source:` +
                "special-origin source ids must be unique");
            continue;
        }
        const issues = validateCloudSpecialOriginSource(source);
        if (issues.length > 0) {
            diagnostics.push(...issues.map((issue) =>
                `source:${source.id}:${issue.code}:${issue.message}`));
            continue;
        }
        indexed.set(source.id, source);
    }
    return indexed;
};

const authoredSystemForAssignment = (
    scene: CloudScene,
    assignment: CloudMorphologyClassificationAssignment,
) => {
    const atLevel = (scene.authoredSystems ?? []).filter(
        ({ layerIndex }) => layerIndex === assignment.layerIndex,
    );
    if (assignment.systemId !== undefined) {
        return atLevel.find(({ id }) => id === assignment.systemId);
    }
    if (assignment.scope !== "layer" && assignment.systemIndex !== undefined) {
        return atLevel[assignment.systemIndex];
    }
    return undefined;
};

const admissibleMorphologyAssignments = (
    scene: CloudScene,
    diagnostics: string[],
    specialOriginSources: ReadonlyMap<string, CloudSpecialOriginSource>,
) => (scene.classifications ?? []).filter((assignment) => {
    const layerIndex = assignment.layerIndex;
    const aggregateLayer = scene.layers[layerIndex];
    const authoredSystem = authoredSystemForAssignment(scene, assignment);
    const layer = authoredSystem?.layer ?? aggregateLayer;
    if (!Number.isInteger(layerIndex) || !layer) {
        diagnostics.push(
            `assignment:${layerIndex}:invalid-layer-index:` +
            "classification owner is outside the low/middle/high tuple",
        );
        return false;
    }
    const expectedLevel = layerIndex === 0 ? "low"
        : layerIndex === 1 ? "middle" : "high";
    const assignedLevel = CLOUD_GENUS_LEVEL[assignment.classification.genus];
    if (assignedLevel !== expectedLevel) {
        diagnostics.push(
            `assignment:${layerIndex}:classification-level-mismatch:` +
            `${assignment.classification.genus} belongs to ${assignedLevel}, ` +
            `not ${expectedLevel}`,
        );
        return false;
    }
    if (
        layer.present && layer.genus !== "clear" &&
        layer.genus !== assignment.classification.genus
    ) {
        diagnostics.push(
            `assignment:${layerIndex}:classification-genus-layer-mismatch:` +
            `${assignment.classification.genus} cannot classify a ${layer.genus} layer`,
        );
        return false;
    }
    const origin = assignment.classification.origin;
    const relation = assignment.relation ?? "independent";
    const causalRelation = relation === "genitus" || relation === "mutatus";
    const causalOrigin = origin.kind === "genitus" || origin.kind === "mutatus";
    if (causalRelation !== causalOrigin ||
        causalRelation && origin.kind !== relation) {
        diagnostics.push(
            `assignment:${layerIndex}:causal-relation-origin-mismatch:` +
            `${relation} does not match origin ${origin.kind}`,
        );
        return false;
    }
    if (causalOrigin && !assignment.causalParent) {
        diagnostics.push(
            `assignment:${layerIndex}:missing-causal-parent-reference:` +
            `${origin.kind} requires a materialized mother-cloud owner`,
        );
        return false;
    }
    if (causalOrigin && !CLOUD_MOTHER_GENUS_RELATIONS[
        assignment.classification.genus
    ][origin.kind].includes(origin.motherGenus)) {
        diagnostics.push(
            `assignment:${layerIndex}:invalid-mother-cloud-relation:` +
            `${origin.motherGenus} cannot produce ` +
            `${assignment.classification.genus} ${origin.kind}`,
        );
        return false;
    }
    if (assignment.causalParent) {
        if (!causalRelation) {
            diagnostics.push(
                `assignment:${layerIndex}:parent-without-causal-relation:` +
                "only genitus/mutatus assignments may reference a parent",
            );
            return false;
        }
        const parent = assignment.causalParent;
        if (!Number.isInteger(parent.layerIndex) || parent.layerIndex < 0 ||
            parent.layerIndex > 2 ||
            parent.systemIndex !== undefined &&
                (!Number.isInteger(parent.systemIndex) || parent.systemIndex < 0) ||
            parent.systemId !== undefined && !parent.systemId.trim()) {
            diagnostics.push(
                `assignment:${layerIndex}:invalid-causal-parent-reference:` +
                "parent reference must identify a finite layer owner",
            );
            return false;
        }
        const sameIndex = parent.layerIndex === layerIndex &&
            parent.systemIndex !== undefined &&
            parent.systemIndex === (assignment.systemIndex ?? 0);
        const sameId = parent.layerIndex === layerIndex &&
            parent.systemId !== undefined &&
            parent.systemId === assignment.systemId;
        if (sameIndex || sameId) {
            diagnostics.push(
                `assignment:${layerIndex}:self-causal-parent:` +
                "a cloud owner cannot reference itself as mother",
            );
            return false;
        }
    }
    if (assignment.transitionProgress !== undefined &&
        (relation !== "mutatus" || !Number.isFinite(assignment.transitionProgress) ||
            assignment.transitionProgress <= 0 || assignment.transitionProgress >= 1)) {
        diagnostics.push(
            `assignment:${layerIndex}:invalid-mutatus-progress:` +
            "transition progress is valid only for mutatus and must be inside (0, 1)",
        );
        return false;
    }
    if (assignment.sourceId !== undefined) {
        if (origin.kind !== "special") {
            diagnostics.push(
                `assignment:${layerIndex}:source-without-special-origin:` +
                "only a special-origin cloud may reference an emission source",
            );
            return false;
        }
        const source = specialOriginSources.get(assignment.sourceId);
        if (!source) {
            diagnostics.push(
                `assignment:${layerIndex}:missing-special-origin-source:` +
                `${assignment.sourceId} is not an admissible source`,
            );
            return false;
        }
        const sourceIssues = validateCloudSpecialOriginSource(
            source,
            assignment.classification.genus,
        );
        if (source.designation !== origin.designation || sourceIssues.length > 0) {
            diagnostics.push(
                `assignment:${layerIndex}:special-origin-source-mismatch:` +
                (source.designation !== origin.designation
                    ? `${source.designation} cannot drive ${origin.designation}`
                    : sourceIssues.map((issue) => issue.message).join("; ")),
            );
            return false;
        }
    } else if (origin.kind === "special") {
        diagnostics.push(
            `assignment:${layerIndex}:missing-special-origin-source:` +
            `${origin.designation} requires a finite sourceId`,
        );
        return false;
    }
    return true;
});

const resolvedSpeciesForLayer = (
    layer: CloudLayerState,
): Exclude<CloudSpecies, "generic"> => {
    if (layer.species !== "generic") return layer.species;
    switch (layer.genus) {
        case "cirrus": return "cirrus-fibratus";
        case "cirrocumulus": return "cirrocumulus-stratiformis";
        case "cirrostratus": return "cirrostratus-nebulosus";
        case "altocumulus": return "altocumulus-stratiformis";
        case "altostratus": return "altostratus-opacus";
        case "nimbostratus": return "nimbostratus-praecipitatio";
        case "stratocumulus": return "stratocumulus-stratiformis";
        case "stratus": return "stratus-nebulosus";
        case "cumulus":
            if (layer.towerAmount > 0.66 || layer.thickness > 2400) {
                return "cumulus-congestus";
            }
            if (layer.towerAmount > 0.32 || layer.thickness > 900) {
                return "cumulus-mediocris";
            }
            return "cumulus-humilis";
        case "cumulonimbus":
            // Incus is a supplementary feature of the already-glaciated
            // capillatus phase; it cannot precede the calvus transition.
            if (layer.anvilAmount > 0.52 && layer.lifecycle >= 0.56) {
                return "cumulonimbus-capillatus-incus";
            }
            if (layer.lifecycle >= 0.46) return "cumulonimbus-capillatus";
            return "cumulonimbus-calvus";
        case "clear":
            throw new Error("A clear layer does not compile a cloud system.");
    }
};

const lifecycleStageFor = (
    progress: number,
    classification: CloudClassification,
    precipitation: number,
): CloudLifecycleStage => {
    if (progress < 0.14) return "incipient";
    if (progress < 0.38) return "growing";
    if (progress > 0.84) return "decaying";
    if (precipitation > 0.42) return "precipitating";
    if (classification.genus === "cumulonimbus" && progress > 0.56) {
        return "glaciating";
    }
    return "mature";
};

const precipitationKindFor = (
    species: Exclude<CloudSpecies, "generic">,
    amount: number,
    iceFraction: number,
    classification?: CloudClassification,
): CloudPrecipitationKind => {
    if (species === "cumulus-humilis" || species === "cumulus-mediocris") {
        return "none";
    }
    if (classification?.supplementaryFeatures.includes("virga")) return "virga";
    if (species === "nimbostratus-praecipitatio") {
        return iceFraction > 0.72 ? "snow" : "rain";
    }
    if (amount < 0.08) return "none";
    if (species.includes("floccus") || species === "cirrus-uncinus") return "virga";
    if (species === "stratus-nebulosus") {
        return "drizzle";
    }
    if (species.startsWith("stratocumulus")) {
        return iceFraction > 0.72 ? "snow" : amount < 0.3 ? "drizzle" : "rain";
    }
    if (species.startsWith("cumulonimbus")) return "shower";
    return amount < 0.3 ? "virga" : "rain";
};

const systemCountFor = (
    species: Exclude<CloudSpecies, "generic">,
    topology: CompiledCloudSystem["macroTopology"],
    coverage: number,
) => {
    const amount = clamp(coverage);
    // These atlas slots already contain complete mesoscale formations. Tiling
    // them with the generic cloudlet budget turns cell colonies into grids,
    // continuous decks into overlapping cards, and the usually solitary
    // volutus into a fence of tubes.
    if (species === "stratus-nebulosus" ||
        species === "nimbostratus-praecipitatio") return 1;
    if (species === "cirrostratus-fibratus" ||
        species === "cirrostratus-nebulosus") {
        // A basic Cs species is one continuous frontal veil. Two generated
        // high-cover owners both contain the observer and are consequently
        // integrated over the same camera rays by the sheet marcher, doubling
        // the authored optical depth and turning a transparent ice veil into
        // a solid card. Truly superposed duplicatus layers must arrive as
        // explicit authored owners instead of being inferred from oktas.
        return 1;
    }
    if (species === "stratocumulus-stratiformis") {
        // One atlas owner is already a complete mesoscale formation. Repeating
        // it to satisfy coverage creates clone grids rather than more weather.
        return 1;
    }
    if (species === "stratocumulus-volutus") {
        return 1 + (amount >= 0.68 ? 1 : 0);
    }
    if (species === "stratocumulus-lenticularis") {
        return Math.min(3, 1 + Math.round(amount * 2));
    }
    if (species === "stratocumulus-castellanus" ||
        species === "stratocumulus-floccus") {
        return Math.min(3, 1 + Math.round(amount * 2));
    }
    if (species === "cirrus-spissatus") {
        // The materialized Spissatus atlas slot is already one complete
        // generating region containing three independent, depth-bearing ice
        // patches. Counting those patches again as world owners cloned the
        // entire three-body formation seven times in the natural benchmark:
        // distant clones collapsed to pale dots while the near clones formed
        // a deterministic radial packet. Until distinct materialized
        // mesoscale exemplars exist, amount changes this finite owner's
        // physical envelope and optical depth; it must not tile the same
        // complete formation. A second Spissatus field must arrive as an
        // explicit authored owner, like a duplicatus veil.
        return 1;
    }
    if (species === "stratus-fractus") {
        return Math.min(8, 4 + Math.round(amount * 6));
    }
    if (topology === "deep-storm-complex") {
        return 1 + (amount >= 0.62 ? 1 : 0) + (amount >= 0.88 ? 1 : 0);
    }
    if (topology === "layered-veil" || topology === "precipitating-sheet" ||
        topology === "boundary-layer-sheet") return amount >= 0.74 ? 2 : 1;
    if (species === "altocumulus-lenticularis") {
        // A three-okta orographic train is several complete lenses spread
        // through the finite wave packet.  One additional owner at moderate
        // cover keeps the authored field discoverable from ordinary oblique
        // bearings without stretching an individual lens into a sheet.
        return Math.min(8, 4 + Math.round(amount * 8));
    }
    if (topology === "wave-lens-train" || topology === "roll-tube") {
        // A wave packet is a finite train of distinct lenses/rolls, not one
        // enormous stretched owner.  Four to six owners keep a two/three-okta
        // lenticular field discoverable from ordinary ground viewpoints while
        // preserving clear air around the packet.
        return Math.min(6, 3 + Math.round(amount * 8));
    }
    if (topology === "fragment-field") return Math.min(12, 6 + Math.round(amount * 8));
    if (topology === "ice-streamer-field") {
        // Cirrus owners are complete streamers or small coherent families.
        // Treating every streak as an owner produced crowded crossings and a
        // contrail-like grid, especially for the sparse mare's-tail species.
        const base = species === "cirrus-uncinus" ? 3 : 4;
        return Math.min(9, base + Math.round(amount * 6));
    }
    if (topology === "thermal-field") {
        if (species === "cumulus-congestus") {
            // One owner already contains a complete source-connected thermal
            // genealogy. At partial cover, six to eight complete owners made
            // the sky read as a row of repeated stickers rather than a few
            // physically distinct growing cells.
            return Math.min(5, 1 + Math.round(amount * 4));
        }
        if (species === "cumulus-mediocris") {
            return Math.min(10, 5 + Math.round(amount * 7));
        }
        if (species === "cumulus-humilis") {
            return Math.min(12, 6 + Math.round(amount * 9));
        }
        return Math.min(12, 5 + Math.round(amount * 9));
    }
    return Math.min(12, 5 + Math.round(amount * 9));
};

const wrappedAngleDistance = (left: number, right: number) => {
    const difference = Math.abs(left - right) % (Math.PI * 2);
    return Math.min(difference, Math.PI * 2 - difference);
};

const wrapAngle = (angle: number) => {
    const wrapped = (angle + Math.PI) % (Math.PI * 2);
    return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
};

/**
 * The generated Cu atlas plus its legal displaced boundary occupies about
 * fifty-two percent of the horizontal owner ellipse. The remainder is the
 * deliberately empty, finite weather-system domain and must not be treated as
 * cloud when rejecting neighbouring owners.
 */
export const THERMAL_OWNER_CONDENSATION_FOOTPRINT_FRACTION = 0.52;
export const THERMAL_OWNER_MINIMUM_ANGULAR_GAP_RADIANS = 0.018;
export const CONGESTUS_OWNER_WORLD_CLEARANCE_FRACTION = 0.62;

export interface ThermalOwnerAngularFootprint {
    bearingRadians: number;
    halfWidthRadians: number;
    rangeKm: number;
}

/**
 * Resolve the observer-space interval occupied by a finite Cu condensation
 * footprint from its physical world ellipse. This is not a camera/frustum
 * operation: the observer is the fixed Earth-local origin used by placement
 * and the renderer. Sampling the small analytic ellipse accounts for range,
 * orientation, anisotropy and the radial perspective of nearby owners.
 */
export const estimateThermalOwnerAngularFootprint = (
    extent: CloudSystemExtent,
): ThermalOwnerAngularFootprint => {
    const rangeKm = Math.max(0.001, Math.hypot(
        extent.centerEastKm,
        extent.centerNorthKm,
    ));
    const bearingRadians = Math.atan2(
        extent.centerEastKm,
        extent.centerNorthKm,
    );
    const downwindEast = Math.cos(extent.orientation);
    const downwindNorth = Math.sin(extent.orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const majorRadiusKm = Math.max(0.001,
        extent.majorRadiusKm * THERMAL_OWNER_CONDENSATION_FOOTPRINT_FRACTION +
        extent.boundaryTransitionKm);
    const minorRadiusKm = Math.max(0.001,
        extent.minorRadiusKm * THERMAL_OWNER_CONDENSATION_FOOTPRINT_FRACTION +
        extent.boundaryTransitionKm);
    let halfWidthRadians = 0;
    // Sixty-four boundary samples keep the interval error well below the
    // independent one-degree physical gap while remaining trivial at authoring
    // time (at most twelve Cu owners per level).
    for (let sample = 0; sample < 64; sample += 1) {
        const angle = sample / 64 * Math.PI * 2;
        const east = extent.centerEastKm +
            downwindEast * Math.cos(angle) * majorRadiusKm +
            crosswindEast * Math.sin(angle) * minorRadiusKm;
        const north = extent.centerNorthKm +
            downwindNorth * Math.cos(angle) * majorRadiusKm +
            crosswindNorth * Math.sin(angle) * minorRadiusKm;
        halfWidthRadians = Math.max(
            halfWidthRadians,
            wrappedAngleDistance(Math.atan2(east, north), bearingRadians),
        );
    }
    return { bearingRadians, halfWidthRadians, rangeKm };
};

const extentAtBearing = (
    extent: CloudSystemExtent,
    bearingRadians: number,
): CloudSystemExtent => {
    const rangeKm = Math.hypot(extent.centerEastKm, extent.centerNorthKm);
    return {
        ...extent,
        centerEastKm: Math.sin(bearingRadians) * rangeKm,
        centerNorthKm: Math.cos(bearingRadians) * rangeKm,
    };
};

const thermalOwnerAngularClearance = (
    candidate: CloudSystemExtent,
    existing: readonly CloudSystemExtent[],
) => {
    if (existing.length === 0) return Number.POSITIVE_INFINITY;
    const footprint = estimateThermalOwnerAngularFootprint(candidate);
    let clearance = Number.POSITIVE_INFINITY;
    for (const priorExtent of existing) {
        const prior = estimateThermalOwnerAngularFootprint(priorExtent);
        clearance = Math.min(
            clearance,
            wrappedAngleDistance(
                footprint.bearingRadians,
                prior.bearingRadians,
            ) - footprint.halfWidthRadians - prior.halfWidthRadians -
            THERMAL_OWNER_MINIMUM_ANGULAR_GAP_RADIANS,
        );
    }
    return clearance;
};

/**
 * Keep separate Cu weather owners separate in the only projection common to
 * every possible camera: their physical bearing from the Earth-local origin.
 * The closest feasible bearing wins, so this is a rejection/relocation gate on
 * the authored population rather than screen-space composition or masking.
 */
const separateThermalOwnerExtent = (
    extent: CloudSystemExtent,
    existing: readonly CloudSystemExtent[],
): CloudSystemExtent => {
    if (existing.length === 0 ||
        thermalOwnerAngularClearance(extent, existing) >= 0) return extent;
    const originalBearing = Math.atan2(
        extent.centerEastKm,
        extent.centerNorthKm,
    );
    const angularStep = 0.0125;
    const stepCount = Math.ceil(Math.PI / angularStep);
    let best = extent;
    let bestClearance = thermalOwnerAngularClearance(extent, existing);
    let bestOffset = 0;
    for (let step = 1; step <= stepCount; step += 1) {
        const offset = step * angularStep;
        let feasible: CloudSystemExtent | undefined;
        let feasibleClearance = Number.NEGATIVE_INFINITY;
        for (const direction of [1, -1] as const) {
            const candidate = extentAtBearing(
                extent,
                wrapAngle(originalBearing + direction * offset),
            );
            const clearance = thermalOwnerAngularClearance(candidate, existing);
            if (clearance > bestClearance + 1e-9 ||
                (Math.abs(clearance - bestClearance) <= 1e-9 &&
                    offset < bestOffset)) {
                best = candidate;
                bestClearance = clearance;
                bestOffset = offset;
            }
            if (clearance >= 0 && clearance > feasibleClearance) {
                feasible = candidate;
                feasibleClearance = clearance;
            }
        }
        if (feasible) return feasible;
    }
    // A physically over-subscribed horizon should still degrade to the
    // maximum-clearance configuration deterministically, never an arbitrary
    // collinear pile-up.
    return best;
};

const congestusOwnerEquivalentCondensationRadius = (
    extent: CloudSystemExtent,
) => Math.sqrt(
    Math.max(0.001,
        extent.majorRadiusKm * THERMAL_OWNER_CONDENSATION_FOOTPRINT_FRACTION +
        extent.boundaryTransitionKm) *
    Math.max(0.001,
        extent.minorRadiusKm * THERMAL_OWNER_CONDENSATION_FOOTPRINT_FRACTION +
        extent.boundaryTransitionKm),
);

export const congestusOwnerWorldClearance = (
    candidate: CloudSystemExtent,
    existing: readonly CloudSystemExtent[],
) => {
    if (existing.length === 0) return Number.POSITIVE_INFINITY;
    const candidateRadius = congestusOwnerEquivalentCondensationRadius(candidate);
    let clearance = Number.POSITIVE_INFINITY;
    for (const prior of existing) {
        const centerDistance = Math.hypot(
            candidate.centerEastKm - prior.centerEastKm,
            candidate.centerNorthKm - prior.centerNorthKm,
        );
        const protectedDistance = CONGESTUS_OWNER_WORLD_CLEARANCE_FRACTION * (
            candidateRadius + congestusOwnerEquivalentCondensationRadius(prior)
        );
        clearance = Math.min(clearance, centerDistance - protectedDistance);
    }
    return clearance;
};

/**
 * Reject only physically colliding Congestus source cores. Distinct systems at
 * different ranges are allowed to occlude in angular projection, as real
 * cloud groups do; preventing that occlusion created an artificial row of
 * isolated silhouettes around the observer.
 */
const separateCongestusOwnerExtent = (
    extent: CloudSystemExtent,
    existing: readonly CloudSystemExtent[],
): CloudSystemExtent => {
    if (existing.length === 0 ||
        congestusOwnerWorldClearance(extent, existing) >= 0) return extent;
    const originalBearing = Math.atan2(
        extent.centerEastKm,
        extent.centerNorthKm,
    );
    const angularStep = 0.0125;
    const stepCount = Math.ceil(Math.PI / angularStep);
    let best = extent;
    let bestClearance = congestusOwnerWorldClearance(extent, existing);
    for (let step = 1; step <= stepCount; step += 1) {
        const offset = step * angularStep;
        for (const direction of [1, -1] as const) {
            const candidate = extentAtBearing(
                extent,
                wrapAngle(originalBearing + direction * offset),
            );
            const clearance = congestusOwnerWorldClearance(candidate, existing);
            if (clearance > bestClearance) {
                best = candidate;
                bestClearance = clearance;
            }
            if (clearance >= 0) return candidate;
        }
    }
    return best;
};

/**
 * Build an aperiodic, camera-blind population in the scene's complete
 * Earth-local weather domain. The old `(slot + .5) / count` placement exposed the owner
 * population as equally spaced rows whenever several cloud systems shared a
 * layer.  A deterministic best-candidate process gives every system a real
 * exclusion neighbourhood while still allowing the clustering appropriate to
 * thermals, storm complexes and frontal systems.
 *
 * Coordinates are normalized here and converted to kilometres only after the
 * species recipe has selected its physical altitude/range. This preserves the
 * same meteorological world if the camera or output aspect ratio changes.
 */
const createSystemPlacements = (
    count: number,
    topology: CompiledCloudSystem["macroTopology"],
    coverage: number,
    signature: string,
    layerIndex: number,
    species?: CloudSpecies,
    requestedOrganization?: CloudLayerState["organization"],
    organizationOrientation = 0,
): readonly NormalizedSystemPlacement[] => {
    if (count <= 0) return [];
    const random = mulberry32(hashText(
        `${signature}:world-population:${layerIndex}:${topology}`,
    ));
    const candidates = Array.from({ length: Math.max(192, count * 72) }, () => {
        // Populate the complete Earth-local weather horizon. Coverage is an
        // amount on the celestial dome, not the fraction of one convenient
        // camera sector. Editorial cameras can therefore discover a different
        // but equally physical part of the same persistent field.
        const angle = lerp(-Math.PI, Math.PI, random());
        return { angle, rangeScale: random(), sizeScale: 1 };
    });

    const point = ({ angle, rangeScale }: NormalizedSystemPlacement) => [
        Math.sin(angle) * rangeScale,
        Math.cos(angle) * rangeScale,
    ] as const;
    const selected: NormalizedSystemPlacement[] = [];

    if (species === "cirrus-fibratus") {
        // A fibratus owner contains a complete, sparse fibre family. Giving
        // the nearest family the same 20--28 km span as every distant owner
        // produced one clipped brush stroke over most of a natural-FOV frame.
        // These are finite kilometre-scale formations at genuine unequal
        // ranges and spans. Additional middle/distant families flank the
        // qualified meridian and occupy separate elevation planes: they raise
        // actual fine-fibre evidence without widening a fibre or turning one
        // owner into a screen-space stamp.
        // Nothing depends on screen coordinates, opacity or the active camera;
        // a camera orbit simply reprojects this same finite weather population.
        const bearingOffsets = [
            -0.14, 0.20, -0.56,
            0.48, -0.42, -0.10, -2.36, Math.PI, 0.98,
        ] as const;
        const rangeTargets = [
            ...CIRRUS_FIBRATUS_RADIAL_STRATA,
            0.30, 0.45, 0.42, 0.18, 0.36, 0.28,
        ] as const;
        const formationScales = [
            0.62, 0.82, 0.62,
            1.45, 1.45, 1.45, 0.96, 1.22, 1.10,
        ] as const;
        for (let index = 0; index < count; index += 1) {
            const targetAngle = wrapAngle(
                CIRRUS_FIBRATUS_QUALIFIED_MERIDIAN_RADIANS +
                bearingOffsets[index % bearingOffsets.length] +
                (random() - 0.5) * (index < 3 ? 0.045 : 0.09),
            );
            const targetRange = clamp(
                rangeTargets[index % rangeTargets.length] +
                (random() - 0.5) * 0.025,
                0.04,
                0.98,
            );
            let best: NormalizedSystemPlacement | undefined;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const candidate of candidates) {
                if (selected.includes(candidate)) continue;
                const score = wrappedAngleDistance(
                    candidate.angle,
                    targetAngle,
                ) * 0.72 + Math.abs(candidate.rangeScale - targetRange) * 0.28;
                if (score < bestScore) {
                    best = candidate;
                    bestScore = score;
                }
            }
            if (!best) break;
            best.sizeScale = formationScales[index % formationScales.length];
            selected.push(best);
        }
        return selected;
    }

    const anchorAngle = (random() - 0.5) * (
        topology === "deep-storm-complex" ? 0.42 : 0.68
    );
    const organizedThermal = topology === "thermal-field" &&
        (requestedOrganization === "streets" ||
            requestedOrganization === "banded");
    const anchorRangeTarget = organizedThermal
        // A street packet extends on both sides of this point in the
        // normalized weather disk. Give its physical anchor enough forward
        // range that wind-aligned rows remain on the same meteorological
        // hemisphere instead of crossing the observer.
        ? 0.62
        : species === "cumulus-congestus" ? 0.10
        // Cc castellanus/floccus are high, shallow packets of sub-degree
        // turrets or detached tufts.
        // The generic high-cloud near anchor can fall almost overhead, where
        // it misses an ordinary oblique view, while its companions begin much
        // farther away.  A 13%-of-band anchor is still a genuine 14--18 km
        // ground range at the species' normal 7--9 km altitude: close enough
        // to resolve the common base, but far enough to retain sub-degree
        // elements and a believable ground-view projection.
        : species === "cirrocumulus-castellanus" ||
            species === "cirrocumulus-floccus" ? 0.13
        // Complete uncinus and spissatus owners respectively contain a
        // hook/fallstreak family and several dense patches. The generic
        // 3.5%-of-band streamer anchor put either large finite formation almost
        // overhead and, for Spissatus, physically inside its own horizontal
        // envelope. These remain camera-independent middle-distance radial
        // strata at genuine 8--10 km high-cloud altitude.
        : species === "cirrus-uncinus" ? 0.16
        : species === "cirrus-spissatus" ? 0.18
        : topology === "ice-streamer-field"
        ? 0.035
        : layerIndex === 2 && (topology === "cellular-cloudlet-field" ||
            topology === "castellated-deck" || topology === "floccus-field" ||
            topology === "wave-lens-train")
            ? 0.08
        : species === "altocumulus-floccus"
            // One atlas owner is a complete detached mixed-phase tuft packet.
            // Put the first packet in the foreground radial stratum allowed by
            // the 2–40 km family span, rather than leaving all sparse material
            // near the lower edge of a natural oblique camera.
            ? 0.07
        : topology === "thermal-field" || topology === "fragment-field"
                ? 0.18 : 0.26;
    let anchor = candidates[0];
    let anchorScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
        const rangeWeight = species === "cirrocumulus-castellanus" ||
            species === "cirrocumulus-floccus" ||
            species === "cirrus-uncinus" ||
            species === "altocumulus-floccus" ? 0.42 : 0.22;
        const score = wrappedAngleDistance(candidate.angle, anchorAngle) *
            (1 - rangeWeight) +
            Math.abs(candidate.rangeScale - anchorRangeTarget) * rangeWeight;
        if (score < anchorScore) {
            anchor = candidate;
            anchorScore = score;
        }
    }
    if (species === "altocumulus-floccus" ||
        species === "cirrus-spissatus") {
        // Preserve the selected aperiodic bearing while materializing the
        // species' foreground radial stratum exactly. Candidate density is
        // intentionally finite; otherwise a nearby angle match can quantize
        // this sparse packet several kilometres outside its target band.
        anchor.rangeScale = anchorRangeTarget;
    }
    anchor.sizeScale = topology === "thermal-field"
        ? 1.30
        // A Ci castellanus atlas owner is one finite crenellated line, not one
        // turret.  Give the nearest packet the upper end of the recipe's
        // observed formation-span range so its common base survives ordinary
        // ground projection.  This remains a camera-blind kilometre scale:
        // orbiting the camera reveals the same physical owner.
        : species === "cirrus-castellanus" ? 1.20
            // Spissatus is a dense finite ice-patch field. Keep its nearest
            // authored patch family in the upper part of the 3--36 km
            // formation envelope so the natural oblique frame resolves more
            // than one compact body without changing fibre/patch scale.
            : species === "cirrus-spissatus" ? 1
            // Uncinus is a sparse hook/fallstreak family. Slightly enlarge
            // the complete foreground streamer envelope so the three visible
            // owners clear the 0.10 natural-frame support floor without
            // turning any one hook into a plate.
            : species === "cirrus-uncinus" ? 1.08
            // Ci floccus is a detached ice-tuft population. Use the upper
            // end of its finite formation span for the foreground tuft while
            // retaining the small atlas element scale.
            : species === "cirrus-floccus" ? 1.30
            // One Cc atlas owner is a whole tiny-turret packet, but the
            // species' recipe scale is deliberately the individual element
            // scale.  Use the upper half of its observed 0.8--10 km formation
            // span for the nearest packet without enlarging any turret.
            : species === "cirrocumulus-castellanus" ? 1.60
                // Cc floccus is a detached tuft packet. A modestly larger
                // complete foreground owner keeps the two visible tufts
                // resolvable without widening any individual ice element.
                : species === "cirrocumulus-floccus" ? 1.30
                : species === "altocumulus-floccus" ? 1.75
                    // The Ac castellanus anchor is one finite common-base
                    // line.  A modest family-scale lift keeps that complete
                    // line readable at ordinary middle-layer ranges while
                    // remaining inside the 2–36 km formation envelope.
                    : species === "altocumulus-castellanus" ? 1.40 : 1;
    selected.push(anchor);

    if (
        topology === "thermal-field" &&
        (requestedOrganization === "streets" || requestedOrganization === "banded")
    ) {
        const along = [
            Math.cos(organizationOrientation),
            Math.sin(organizationOrientation),
        ] as const;
        const cross = [-along[1], along[0]] as const;
        const rows = coverage >= 0.68 && count >= 8 ? 3 : 2;
        const columns = Math.ceil(count / rows);
        const anchorRow = Math.floor((rows - 1) * 0.5);
        const anchorColumn = Math.floor((columns - 1) * 0.5);
        const anchorSlot = anchorColumn * rows + anchorRow;
        const anchorPoint = point(anchor);
        const alongCoordinates = new Array<number>(columns).fill(0);
        for (let column = anchorColumn + 1; column < columns; column += 1) {
            alongCoordinates[column] = alongCoordinates[column - 1] +
                (0.15 + coverage * 0.045) *
                (0.84 + random() * 0.32);
        }
        for (let column = anchorColumn - 1; column >= 0; column -= 1) {
            alongCoordinates[column] = alongCoordinates[column + 1] -
                (0.15 + coverage * 0.045) *
                (0.84 + random() * 0.32);
        }
        const crossCoordinates = new Array<number>(rows).fill(0);
        for (let row = anchorRow + 1; row < rows; row += 1) {
            crossCoordinates[row] = crossCoordinates[row - 1] +
                (0.095 + coverage * 0.025) *
                (0.88 + random() * 0.24);
        }
        for (let row = anchorRow - 1; row >= 0; row -= 1) {
            crossCoordinates[row] = crossCoordinates[row + 1] -
                (0.095 + coverage * 0.025) *
                (0.88 + random() * 0.24);
        }

        const slots = Array.from({ length: count }, (_, index) => {
            if (index === anchorSlot) {
                return { index, eastOffset: 0, northOffset: 0 };
            }
            const row = index % rows;
            const column = Math.floor(index / rows);
            // Unequal cumulative gaps retain recognisable wind-parallel
            // streets without exposing a periodic lattice at large scale.
            // These are kilometre-independent coordinates in the persistent
            // world disk; no camera or screen quantity participates.
            const alongOffset = alongCoordinates[column] +
                (random() - 0.5) * 0.014;
            const crossOffset = crossCoordinates[row] +
                (random() - 0.5) * 0.010;
            return {
                index,
                eastOffset: along[0] * alongOffset +
                    cross[0] * crossOffset,
                northOffset: along[1] * alongOffset +
                    cross[1] * crossOffset,
            };
        });

        // Fit the whole aperiodic packet into the normalized meteorological
        // disk with one common scale. Per-owner radial clamping would bend the
        // outer rows and collapse their physical gaps into an arc.
        let packetScale = 1;
        const packetInsideWorldDisk = (scale: number) => slots.every((slot) => {
            const east = anchorPoint[0] + slot.eastOffset * scale;
            const north = anchorPoint[1] + slot.northOffset * scale;
            const radius = Math.hypot(east, north);
            return radius >= 0.08 && radius <= 0.94;
        });
        while (packetScale > 0.2 &&
            !packetInsideWorldDisk(packetScale)) packetScale *= 0.92;

        const placementForSlot = (
            slot: typeof slots[number],
            ownerOrdinal: number,
        ): NormalizedSystemPlacement => {
            if (slot.index === anchorSlot) return anchor;
            const east = anchorPoint[0] + slot.eastOffset * packetScale;
            const north = anchorPoint[1] + slot.northOffset * packetScale;
            return {
                angle: Math.atan2(east, north),
                rangeScale: Math.hypot(east, north),
                sizeScale: [0.72, 0.88, 0.58, 0.79, 0.64][
                    (ownerOrdinal - 1) % 5
                ],
            };
        };
        // Keep the selected forward owner as ordinal zero. The remaining
        // owners occupy real parallel streets around it rather than absolute
        // wind-axis coordinates around the observer.
        const orderedSlots = [
            slots[anchorSlot],
            ...slots.filter(({ index }) => index !== anchorSlot),
        ];
        return orderedSlots.map(placementForSlot);
    }

    // Squall lines and mesoscale convective bands organize complete storm
    // owners along a finite, curved world-space axis. They are not a mask over
    // an unchanged cluster. Unequal range and angular increments keep the
    // owner line aperiodic while preserving a physically coherent wall.
    if (
        topology === "deep-storm-complex" &&
        (requestedOrganization === "banded" || requestedOrganization === "streets") &&
        count > 1
    ) {
        for (let index = 1; index < count; index += 1) {
            const side = index % 2 === 0 ? -1 : 1;
            const rank = Math.ceil(index / 2);
            const along = side * rank / Math.max(1, Math.ceil((count - 1) / 2));
            selected.push({
                angle: anchor.angle + along * (0.22 + coverage * 0.16) +
                    along * Math.abs(along) * 0.045 + (random() - 0.5) * 0.018,
                rangeScale: clamp(
                    anchor.rangeScale + along * 0.17 +
                    Math.abs(along) * 0.09 + (random() - 0.5) * 0.025,
                    0.06,
                    0.96,
                ),
                sizeScale: 1,
            });
        }
        return selected;
    }

    // One readable formation and several separated companions must coexist in
    // an ordinary view. These are still world-space systems: the cluster is
    // fixed around Earth-local north and does not know where a camera points.
    // Ac floccus atlas packets are intentionally sparse internally. Four
    // unequal finite formations in real radial strata provide a natural tuft
    // group; enlarging one owner would turn its detached lineage into a blob.
    const clusteredCompanions = species === "altocumulus-floccus"
        ? Math.min(count - 1, 3)
        : species === "altocumulus-lenticularis"
            ? Math.min(count - 1, 3)
        : species === "cirrus-spissatus"
            ? Math.min(count - 1, 3)
        : species === "cirrus-castellanus"
            ? Math.min(count - 1, 4)
        : species === "cirrocumulus-castellanus" ||
            species === "cirrocumulus-floccus"
            ? Math.min(count - 1, 4)
        : topology === "thermal-field"
        ? Math.min(count - 1, 3)
        : topology === "fragment-field" ? Math.min(count - 1, 1)
        : topology === "ice-streamer-field" ? Math.min(count - 1, 2)
            : topology === "cellular-cloudlet-field" ||
                topology === "castellated-deck" || topology === "floccus-field"
                ? Math.min(count - 1, 2)
                : 0;
    const clusterRadius = species === "altocumulus-lenticularis"
        // A lenticular wave train is a finite family of complete lens owners,
        // not a single angular packet.  Its aperiodic companions may occupy
        // the adjacent windward sector so ordinary world bearings can reveal
        // the same physical train from both side/front views without making
        // any one owner wider or consulting the active camera.
        ? lerp(0.78, 1.08, clamp(coverage))
        : species === "altocumulus-castellanus"
            // A common-base Ac castellanus line spans a finite windward
            // sector, so its companion packets can occupy the adjacent
            // bearing needed to frame both sides of a natural horizon view.
            ? lerp(0.56, 0.68, clamp(coverage))
        : lerp(0.38, 0.58, clamp(coverage));

    while (selected.length <= clusteredCompanions) {
        const companionIndex = selected.length - 1;
        const companionRangeTargets = species === "cumulus-congestus"
            // A small Cu population needs genuine weather depth. Three
            // systems at nearly the same range read as pasted silhouettes and
            // cannot produce the near/middle/distant occlusion of a real
            // convective field. These are radial strata in the persistent
            // world, not camera distances; candidate selection still supplies
            // day-seeded bearing and bounded range variation inside each band.
            ? [0.46, 0.96, 0.72]
            : topology === "ice-streamer-field"
            ? species === "cirrus-uncinus" ? [0.30, 0.50]
                : species === "cirrus-spissatus" ? [0.40, 0.48, 0.56, 0.64]
                : [0.14, 0.36]
            : species === "cirrocumulus-castellanus" ? [0.22, 0.24, 0.32, 0.42]
            : species === "altocumulus-floccus" ? [0.21, 0.37, 0.52]
            : species === "altocumulus-lenticularis" ||
                species === "altocumulus-castellanus"
                ? [0.22, 0.40, 0.60]
            : layerIndex === 2 &&
                (species === "cirrus-castellanus" ||
                    species === "cirrocumulus-floccus")
                // Small high-cloud packets remain finite formations, but a
                // 0.42 outer companion falls below the 27-degree ground-view
                // elevation band. Keep the second companion in the authored
                // near/middle stratum so the complete packet—not a screen
                // mask—contributes its real solid angle.
                ? [0.18, 0.24, 0.28, 0.34]
                : layerIndex === 2 ? [0.18, 0.42]
                : [0.38, 0.62, 0.94];
        const targetRange = companionRangeTargets[
            Math.min(companionIndex, companionRangeTargets.length - 1)
        ];
        let best: NormalizedSystemPlacement | undefined;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const candidate of candidates) {
            if (selected.includes(candidate) ||
                wrappedAngleDistance(candidate.angle, anchorAngle) > clusterRadius) {
                continue;
            }
            const candidatePoint = point(candidate);
            let nearest = Number.POSITIVE_INFINITY;
            for (const owner of selected) {
                const ownerPoint = point(owner);
                nearest = Math.min(nearest, Math.hypot(
                    candidatePoint[0] - ownerPoint[0],
                    candidatePoint[1] - ownerPoint[1],
                ));
            }
            // Stratified radial targets preserve near, middle and far systems
            // with a tiny bounded owner budget. Pure best-candidate area
            // sampling spends nearly every record at the outer radius because
            // most of a disk's area is there, leaving high cloud on the horizon.
            const radialFit = Math.abs(candidate.rangeScale - targetRange);
            const score = nearest * (topology === "thermal-field" ? 0.42 : 0.18) -
                radialFit * 1.20 + random() * 0.01;
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        if (!best) break;
        if (species === "cirrocumulus-floccus" && companionIndex === 0) {
            // Detached Cc floccus packets share a formation history but do
            // not occupy one projected stack. A small deterministic bearing
            // offset keeps the two nearest finite owners spatially distinct
            // while remaining inside the same world-space packet.
            best.angle = wrapAngle(best.angle + 0.62);
        }
        if (species === "cirrus-spissatus" && companionIndex === 1) {
            // A dense Spissatus field is a set of finite, independently
            // advected ice-patch families rather than one angular pile. Keep
            // the third near/middle owner in the same persistent weather
            // population but on the adjacent Earth-local bearing. This
            // protects a readable foreground body without filling the natural
            // production meridian with overlapping owner envelopes.
            best.angle = wrapAngle(best.angle - 0.70);
        }
        if ((species === "cirrus-castellanus" ||
            species === "cirrocumulus-castellanus") &&
            companionIndex === 2) {
            // Keep the outer near-packet owner from landing directly behind
            // its common-base neighbours in the production meridian. This is
            // a fixed Earth-local bearing offset, not a camera-space nudge.
            best.angle = wrapAngle(best.angle + 0.12);
        }
        if (species === "cirrus-castellanus" && companionIndex === 3) {
            // Preserve a finite four-owner common-base line in the forward
            // meridian while placing its outermost companion in a distinct
            // world bearing.  The offset is fixed in the meteorological
            // domain, so it cannot become a camera-space visibility nudge.
            best.angle = wrapAngle(best.angle + 0.65);
        }
        best.sizeScale = topology === "thermal-field"
            ? [0.95, 0.80, 0.68][Math.min(companionIndex, 2)]
            // Unequal but correlated spans are characteristic of a natural
            // castellanus line.  The two nearby companions taper in physical
            // size rather than repeating the anchor or gaining screen-space
            // opacity; remote owners retain the unscaled recipe extent.
                : species === "cirrus-castellanus"
                ? [1.12, 0.90, 0.90, 0.90][Math.min(companionIndex, 3)]
                // Correlated Cc packets become physically smaller with range
                // instead of repeating one formation.  The hierarchy affects
                // only each finite common-base envelope; embedded turret
                // diameter remains governed by the high-cloud foundation.
                : species === "cirrocumulus-castellanus"
                    ? [1.30, 1.00, 1.00, 1.00][Math.min(companionIndex, 3)]
                : species === "cirrus-spissatus"
                    ? [0.72, 0.68, 0.68][Math.min(companionIndex, 2)]
                : species === "cirrus-floccus"
                    ? [0.68, 0.68, 0.68, 0.68][Math.min(companionIndex, 3)]
                : species === "cirrocumulus-floccus"
                    ? [0.65, 0.65, 0.65, 0.65][Math.min(companionIndex, 3)]
                : species === "altocumulus-floccus"
                    // Multipliers compensate each independently seeded
                    // formation envelope, producing descending 14/11/10/9 km
                    // spans without changing the species' element diameter.
                    ? [1.45, 1.20, 1.35][Math.min(companionIndex, 2)]
                : 1;
        selected.push(best);
    }

    while (selected.length < count) {
        let best: NormalizedSystemPlacement | undefined;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const candidate of candidates) {
            if (selected.includes(candidate)) continue;
            const candidatePoint = point(candidate);
            let nearest = Number.POSITIVE_INFINITY;
            for (const owner of selected) {
                const ownerPoint = point(owner);
                const dx = candidatePoint[0] - ownerPoint[0];
                const dz = candidatePoint[1] - ownerPoint[1];
                nearest = Math.min(nearest, Math.hypot(dx, dz));
            }

            // The anchor cluster provides readable local composition; the
            // remainder supplies cloud amount around the dome with blue-noise
            // exclusion. It cannot collapse into a ring or angular lattice.
            let score = nearest;
            if (topology === "fragment-field") {
                // Fractus is a distributed boundary-layer population. Mix
                // genuinely near and middle-distance groups around the whole
                // horizon instead of spending every non-anchor owner on the
                // outside of the sampling disk.
                const radialTargets = [0.14, 0.56, 0.24, 0.84, 0.36, 0.68, 0.18, 0.96];
                const target = radialTargets[
                    (selected.length - 1) % radialTargets.length
                ];
                score = nearest * 0.62 -
                    Math.abs(candidate.rangeScale - target) * 0.48 +
                    random() * 0.035;
            } else if (topology === "thermal-field") {
                score = nearest * 0.88 + random() * 0.055;
            } else if (topology === "ice-streamer-field") {
                // Preserve a coherent shear family while distributing the
                // remaining finite streamers through real atmospheric depth.
                // This avoids both a near-camera clump and an outer ring.
                const radialTargets = [0.08, 0.2, 0.36, 0.54, 0.74, 0.94];
                const target = radialTargets[
                    Math.min(selected.length, radialTargets.length - 1)
                ];
                score = nearest * 0.58 -
                    Math.abs(candidate.rangeScale - target) * 0.42 +
                    random() * 0.025;
            } else if (topology === "deep-storm-complex") {
                // A mature complex may contain a readable nearer cell and a
                // distinctly more remote cell or line segment, never clones.
                score = nearest * 0.74 +
                    Math.abs(candidate.rangeScale - selected[0].rangeScale) * 0.26;
            } else {
                score = nearest + random() * 0.045;
            }
            // Keep some radial depth variation. A ring of equally distant
            // owners is just as recognizable as evenly spaced azimuth slots.
            score += Math.abs(candidate.rangeScale - selected[0].rangeScale) * 0.09;
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        if (!best) break;
        if (topology === "thermal-field") {
            best.sizeScale = [0.60, 0.78, 0.66, 0.88][selected.length % 4];
        }
        selected.push(best);
    }
    return selected;
};

const organizationFor = (
    layer: CloudLayerState,
    compiled: Pick<CompiledCloudSystem, "macroTopology" | "geometry">,
    random: () => number,
    classification?: CloudClassification,
): CloudOrganizationState => {
    const scale = Math.max(0.12, compiled.geometry.elementScaleKm);
    const orientation = layer.windDirection;
    const varieties = classification?.varieties ?? [];
    const bandOrganization = (): Extract<CloudOrganizationState,
        { kind: "banded" }> => ({
        kind: "banded",
        bandSpacingKm: clamp(
            scale * (0.72 + random() * 0.58),
            0.1,
            150,
        ),
        bandWidthFraction: clamp(
            0.18 + layer.organizationStrength * 0.28 + random() * 0.08,
            0.1,
            0.62,
        ),
        lengthKm: clamp(
            scale * (2.8 + layer.organizationStrength * 5.2 + random() * 2.4),
            0.5,
            480,
        ),
        curvature: (random() - 0.5) *
            (0.08 + layer.organizationStrength * 0.34),
        orientation,
    });

    // These WMO varieties are not decorative labels: each requires a
    // physically compatible mesoscale owner organization. Resolve that
    // organization before canonical validation and before packing so the
    // morphology operator refines a real wave/band/cellular field rather than
    // painting an unrelated pattern over a frontal shield or point process.
    // Radiatus wins over undulatus when both are authored because straight,
    // world-parallel bands also satisfy undulatus' coherent-band constraint;
    // perspective alone creates their apparent convergence.
    if (varieties.includes("radiatus")) return bandOrganization();
    if (varieties.includes("lacunosus")) {
        return {
            kind: "cellular",
            topology: "lacunar",
            meanCellDiameterKm: clamp(scale * (1.5 + random()), 0.1, 100),
            wallWidthFraction: clamp(
                0.10 + layer.organizationStrength * 0.18 + random() * 0.05,
                0.08,
                0.42,
            ),
            centerJitter: 0.28 + random() * 0.42,
            anisotropy: 1 + layer.shear * 2.4,
            orientation,
        };
    }
    if (varieties.includes("undulatus")) {
        const wavelengthKm = clamp(
            scale * (0.72 + random() * 0.58),
            0.5,
            24,
        );
        return {
            kind: "wave-packet",
            wavelengthKm,
            packetLengthKm: clamp(
                wavelengthKm * (4.2 + random() * 5.8),
                3,
                150,
            ),
            crestCount: 4 + Math.floor(random() * 8),
            orientation,
        };
    }
    const requestedBand = layer.organization === "streets" ||
        layer.organization === "banded";
    const bandCompatible = compiled.macroTopology !== "wave-lens-train" &&
        compiled.macroTopology !== "roll-tube";
    if (requestedBand && bandCompatible) {
        // Streets and broad bands organize complete owners. Stretching an
        // unrelated noise basis inside every owner loses the finite spacing,
        // length and curvature which make the formation meteorological.
        return bandOrganization();
    }
    switch (compiled.macroTopology) {
        case "cellular-cloudlet-field":
            return {
                kind: "cellular",
                topology: layer.organization === "open-cell" ? "open"
                    : layer.organization === "closed-cell" ? "closed" : "lacunar",
                meanCellDiameterKm: clamp(scale * (1.5 + random()), 0.1, 100),
                wallWidthFraction: 0.12 + layer.organizationStrength * 0.22,
                centerJitter: 0.18 + random() * 0.44,
                anisotropy: 1 + layer.shear * 3.5,
                orientation,
            };
        case "layered-veil":
        case "precipitating-sheet":
        case "boundary-layer-sheet":
            return {
                kind: "frontal-shield",
                alongFrontLengthKm: Math.max(30, scale * (2.2 + random())),
                crossFrontDepthKm: Math.max(12, scale * (0.72 + random() * 0.42)),
                leadingTransitionKm: Math.max(1, scale * 0.08),
                trailingTransitionKm: Math.max(1.5, scale * 0.13),
                orientation,
            };
        case "wave-lens-train":
        case "roll-tube":
            return {
                kind: "wave-packet",
                wavelengthKm: Math.max(0.4, scale * (0.72 + random() * 0.45)),
                packetLengthKm: Math.max(2, scale * (1.4 + random() * 1.2)),
                crestCount: 1 + Math.floor(random() * 4),
                orientation,
            };
        case "deep-storm-complex":
            return {
                kind: "storm-complex",
                inflowRadiusKm: Math.max(3, scale * 0.35),
                updraftRadiusKm: Math.max(1.2, scale * 0.16),
                outflowRadiusKm: Math.max(4, scale * (0.38 + layer.anvilAmount * 0.5)),
                propagationDirection: orientation + layer.shear * 0.35,
            };
        default:
            return {
                kind: "point-process",
                distribution: layer.organizationStrength > 0.48 ? "clustered" : "poisson-disk",
                meanSpacingKm: Math.max(0.25, scale * (0.76 + random() * 0.5)),
                minimumSeparationKm: Math.max(0.08, scale * 0.34),
                clusterRadiusKm: Math.max(0.3, scale * (1.3 + random())),
                anisotropy: 1 + layer.shear * 4,
                orientation,
            };
    }
};

const orientedEllipseRadialBoundaryKm = (
    bearing: number,
    majorRadiusKm: number,
    minorRadiusKm: number,
    orientation: number,
) => {
    const radialEast = Math.sin(bearing);
    const radialNorth = Math.cos(bearing);
    const majorEast = Math.cos(orientation);
    const majorNorth = Math.sin(orientation);
    const majorProjection = radialEast * majorEast +
        radialNorth * majorNorth;
    const minorProjection = radialEast * -majorNorth +
        radialNorth * majorEast;
    const inverseRadiusSquared =
        majorProjection * majorProjection /
            (majorRadiusKm * majorRadiusKm) +
        minorProjection * minorProjection /
            (minorRadiusKm * minorRadiusKm);
    return 1 / Math.sqrt(Math.max(1e-9, inverseRadiusSquared));
};

const compositionBandForCoverage = (
    coverage: number,
): readonly [number, number] => {
    const amount = clamp(coverage);
    if (amount <= CLOUD_FRAME_COMPOSITION_BANDS.sparse.maximumCoverage) {
        return CLOUD_FRAME_COMPOSITION_BANDS.sparse.support;
    }
    if (amount <= CLOUD_FRAME_COMPOSITION_BANDS.broken.maximumCoverage) {
        return CLOUD_FRAME_COMPOSITION_BANDS.broken.support;
    }
    if (amount <= CLOUD_FRAME_COMPOSITION_BANDS.extensive.maximumCoverage) {
        return CLOUD_FRAME_COMPOSITION_BANDS.extensive.support;
    }
    return CLOUD_FRAME_COMPOSITION_BANDS.overcast.support;
};

const isAttachedOrConvectiveFeature = (
    classification?: CloudClassification,
) => {
    if (!classification) return false;
    if (classification.accessoryClouds.length > 0) return true;
    return classification.supplementaryFeatures.some((feature) =>
        feature === "incus" || feature === "mamma" || feature === "arcus" ||
        feature === "tuba" || feature === "murus" || feature === "cauda",
    );
};

/**
 * Resolve composition semantics from physical layer state and morphology. The
 * result is independent of the selected camera; the production frame is only
 * used later to measure the same owner population against this contract.
 */
export const cloudFrameCompositionContractFor = ({
    layer,
    layerIndex,
    species,
    macroTopology,
    classification,
    lowLayeredPlacement,
    ownerCount,
}: {
    layer: CloudLayerState;
    layerIndex: number;
    species?: string;
    macroTopology?: CompiledCloudSystem["macroTopology"];
    classification?: CloudClassification;
    lowLayeredPlacement?: CloudSystemPlacementMode;
    /** Population cardinality keeps a solitary convective showcase isolated. */
    ownerCount?: number;
}): CloudFrameCompositionContract => {
    const coverage = clamp(layer.coverage);
    const sheet = macroTopology === "layered-veil" ||
        macroTopology === "precipitating-sheet" ||
        macroTopology === "boundary-layer-sheet";
    const immediateOvercast = lowLayeredPlacement === "immediate-overcast" ||
        (sheet && coverage >= 0.72 && layerIndex <= 1);
    const immediateBroken = lowLayeredPlacement === "immediate-broken-field";
    const attachedFeature = isAttachedOrConvectiveFeature(classification);
    const convective = (species ?? "").startsWith("cumulus-") ||
        (species ?? "").startsWith("cumulonimbus-");
    const populationField = !attachedFeature && coverage >= 0.30 &&
        (!convective || ownerCount === undefined || ownerCount > 1);
    const broadAmount = coverage >= 0.56 && populationField && !convective;
    const moderateAmount = coverage >= 0.30 && populationField;
    const distantSheet = sheet && !attachedFeature &&
        !immediateOvercast && !immediateBroken &&
        layerIndex > 0;
    const semantic: CloudFrameCompositionSemantic = immediateOvercast
        ? "immediate-overcast"
        : immediateBroken
            ? "immediate-broken-field"
            : distantSheet
                ? "distant-finite-sheet"
            : (broadAmount || moderateAmount) &&
                (sheet || layerIndex > 0 || moderateAmount)
                ? "partial-finite-field"
                : "isolated-finite-owner";
    const fieldSemantic = semantic === "partial-finite-field" ||
        semantic === "distant-finite-sheet";
    const edgeFramedField = fieldSemantic && (sheet || layerIndex === 1);
    const amountBand = compositionBandForCoverage(coverage);
    const partialSupportUpper = Math.min(
        1,
        Math.max(amountBand[1], coverage + 0.12),
    );
    const sparseHumilis = species === "cumulus-humilis" && coverage <= 0.45;
    const speciesSupport = species === undefined
        ? undefined
        : HIGH_CLOUD_PHYSICAL_SUPPORT_CONTRACTS[
            species as keyof typeof HIGH_CLOUD_PHYSICAL_SUPPORT_CONTRACTS
        ];
    const expectedSupport = semantic === "immediate-overcast"
        ? [0.90, 1] as const
        : semantic === "immediate-broken-field"
            ? [coverage, 1] as const
        : fieldSemantic ? [sparseHumilis ? 0.04 :
            speciesSupport?.[0] ?? amountBand[0],
            speciesSupport?.[1] ?? partialSupportUpper] as const
            : [0, 1] as const;
    return {
        semantic,
        authoredCoverage: coverage,
        authoredOktas: Math.max(0, layer.oktas),
        expectedSupport,
        minimumVisibleOwners: sparseHumilis ? 3 :
            semantic === "isolated-finite-owner" ? 1 :
                semantic === "partial-finite-field" ? 1 : 1,
        minimumEdgeContacts: edgeFramedField ? 2 : 0,
        requireAllFrameEdges: semantic === "immediate-overcast" ||
            semantic === "immediate-broken-field",
        cameraInsideRequired: semantic === "immediate-overcast" ||
            semantic === "immediate-broken-field",
    };
};

const extentFor = (
    layer: CloudLayerState,
    compiled: Pick<CompiledCloudSystem, "macroTopology" | "geometry">,
    layerIndex: number,
    placement: NormalizedSystemPlacement,
    random: () => number,
    species?: Exclude<CloudSpecies, "generic">,
) => {
    const scale = compiled.geometry.elementScaleKm;
    let majorRadiusKm = Math.max(0.2, scale * (0.38 + random() * 0.32));
    let minorRadiusKm = Math.max(0.2, majorRadiusKm * (0.38 + random() * 0.34));
    switch (compiled.macroTopology) {
        case "layered-veil":
        case "precipitating-sheet":
        case "boundary-layer-sheet": {
            const immediateDeck = layer.coverage >= 0.72;
            majorRadiusKm = immediateDeck
                ? clamp(scale * (1.05 + layer.coverage * 0.72), 55, 320)
                : clamp(scale * (0.58 + layer.coverage * 0.68), 24, 250);
            minorRadiusKm = immediateDeck
                ? clamp(majorRadiusKm * (0.58 + random() * 0.22), 32, 210)
                : clamp(majorRadiusKm * (0.28 + random() * 0.22), 10, 120);
            break;
        }
        case "deep-storm-complex":
            // The recipe element scale includes the full storm/anvil system
            // wavelength and can exceed 60 km.  Reusing it as an ellipse
            // radius flattened a 12 km tower into a screen-wide pancake.  The
            // visible owner footprint is instead coupled to geometric depth;
            // the storm topology constructs its asymmetric anvil inside it.
            {
            const depthKm = Math.max(2, layer.thickness / 1000);
            majorRadiusKm = clamp(
                depthKm * (0.52 + layer.anvilAmount * 0.42) *
                    (0.84 + random() * 0.28),
                4,
                18,
            );
            minorRadiusKm = clamp(
                depthKm * (0.34 + layer.coverage * 0.18) *
                    (0.86 + random() * 0.26),
                3,
                12,
            );
            break;
            }
        case "ice-streamer-field":
            if (species === "cirrus-spissatus") {
                // Spissatus is a population of compact, optically dense ice
                // patches, not a long streamer family. Reusing Fibratus and
                // Uncinus owner anisotropy stretches each finite patch several
                // kilometres downwind while leaving only the layer's few
                // hundred metres of condensate depth, producing white cards
                // in an ordinary oblique view. Preserve comparable plan area
                // and the WMO 3--36 km formation span, but place it in a much
                // rounder dense-patch envelope whose vertical extent remains
                // the independently authored 1.4 km layer depth.
                majorRadiusKm = clamp(
                    scale * (0.42 + layer.coverage * 0.38) *
                        (0.82 + random() * 0.36) * placement.sizeScale,
                    3.4,
                    16,
                );
                minorRadiusKm = Math.max(0.8,
                    majorRadiusKm * (0.48 + random() * 0.20) *
                        Math.sqrt(placement.sizeScale));
            } else {
                majorRadiusKm = clamp(
                    scale * (0.62 + layer.coverage * 0.62) *
                        (0.76 + random() * 0.48) * placement.sizeScale,
                    4.5,
                    44,
                );
                minorRadiusKm = Math.max(0.24,
                    majorRadiusKm * (0.14 + random() * 0.18) *
                        Math.sqrt(placement.sizeScale));
            }
            break;
        case "cellular-cloudlet-field":
            majorRadiusKm = clamp(
                Math.max(layerIndex === 0 ? 7.5 : layerIndex === 1 ? 6 : 6.5,
                    scale * (2.5 + layer.coverage * 3.2)) * (0.72 + random() * 0.56),
                4.5,
                38,
            );
            minorRadiusKm = majorRadiusKm * (0.52 + random() * 0.30);
            break;
        case "castellated-deck":
        case "floccus-field":
            majorRadiusKm = clamp(
                Math.max(layerIndex === 2 ? 1.4 : 2,
                    scale * (1.25 + layer.coverage * 1.9)) *
                    (0.78 + random() * 0.42) * placement.sizeScale,
                1.2,
                18,
            );
            minorRadiusKm = majorRadiusKm * (
                species === "cirrus-castellanus"
                    ? 0.54 + random() * 0.16
                    : species === "cirrocumulus-floccus"
                        ? 0.44 + random() * 0.20
                        : 0.48 + random() * 0.31);
            break;
        case "wave-lens-train":
            majorRadiusKm = clamp(
                scale * (0.72 + layer.coverage * 0.38) * (0.82 + random() * 0.38),
                layerIndex === 2 ? 7 : layerIndex === 1 ? 10 : 3.5,
                48,
            );
            minorRadiusKm = Math.max(0.2, majorRadiusKm *
                (layerIndex === 2 ? 0.30 + random() * 0.18 : 0.34 + random() * 0.20));
            break;
        case "roll-tube":
            majorRadiusKm = clamp(scale * (0.34 + random() * 0.24), 4, 42);
            minorRadiusKm = Math.max(0.25, layer.thickness / 1000 * (0.48 + random() * 0.24));
            break;
        case "fragment-field":
            majorRadiusKm = clamp(
                scale * (0.72 + layer.coverage * 0.82) * (0.72 + random() * 0.62),
                0.55,
                4.2,
            );
            minorRadiusKm = Math.max(0.2, majorRadiusKm * (0.30 + random() * 0.34));
            break;
        case "thermal-field":
            majorRadiusKm = clamp(
                scale * (0.50 + layer.coverage * 0.58) *
                    (0.78 + random() * 0.46) * placement.sizeScale,
                0.42,
                6.8,
            );
            minorRadiusKm = majorRadiusKm * (0.62 + random() * 0.28);
            break;
        default:
            majorRadiusKm = clamp(scale * (0.75 + random() * 0.7), 0.35, 6.5);
            minorRadiusKm = majorRadiusKm * (0.58 + random() * 0.30);
    }

    const altitudeKm = layer.baseAltitude / 1000;
    const altitudeRange = layerIndex === 0
        ? 6 + altitudeKm * 5.2
        : layerIndex === 1
            ? 13 + altitudeKm * 5.0
            : 20 + altitudeKm * 5.2;
    const baseRange = compiled.macroTopology === "deep-storm-complex"
        ? Math.max(altitudeRange,
            (altitudeKm + layer.thickness / 1000) * 1.62)
        : altitudeRange;
    const sheet = compiled.macroTopology === "layered-veil" ||
        compiled.macroTopology === "precipitating-sheet" ||
        compiled.macroTopology === "boundary-layer-sheet";
    const immediateDeck = sheet && layer.coverage >= 0.72;
    const highAperiodicField = layerIndex === 2 && !sheet &&
        compiled.macroTopology !== "deep-storm-complex";
    const sectorAngle = placement.angle;
    const orientationJitter = compiled.macroTopology === "ice-streamer-field"
        ? 0.13
        : compiled.macroTopology === "deep-storm-complex"
            ? 0.16
            : compiled.macroTopology === "cellular-cloudlet-field"
                ? 0.76
                : compiled.macroTopology === "layered-veil" ? 0.16 : 0.48;
    const orientation = layer.windDirection +
        (random() - 0.5) * orientationJitter;
    const boundaryTransitionKm = clamp(
        Math.min(majorRadiusKm, minorRadiusKm) *
            (0.16 + compiled.geometry.supportBandFraction * 0.42),
        0.02,
        200,
    );
    const radialBand = compiled.macroTopology === "deep-storm-complex"
        ? [0.92, 2.65] as const
        : sheet ? [0.82, 1.58] as const
            : layerIndex === 0 && compiled.macroTopology === "cellular-cloudlet-field"
                ? [0.18, 1.12] as const
            : layerIndex === 0 && compiled.macroTopology === "fragment-field"
                    ? [0.12, 1.02] as const
            : compiled.macroTopology === "thermal-field"
                ? [0.62, 1.92] as const
            : highAperiodicField ? [0.015, 1.82] as const
                : [0.62, 1.72] as const;
    const minimumClearance = compiled.macroTopology === "thermal-field"
        ? majorRadiusKm * 2.25
        : compiled.macroTopology === "roll-tube"
            // A finite horizontal roll is a long, narrow ellipse. Its
            // observer-facing radial boundary is not its axial length: solve
            // the oriented ellipse intersection along the Earth-local
            // bearing. This is the exact outside-observer condition and
            // preserves an ordinary low-cloud range when a tube crosses the
            // view obliquely.
            ? orientedEllipseRadialBoundaryKm(
                sectorAngle,
                majorRadiusKm,
                minorRadiusKm,
                orientation,
            ) + boundaryTransitionKm * 1.08
        : compiled.macroTopology === "fragment-field"
            ? layerIndex === 0 ? minorRadiusKm * 0.35 : majorRadiusKm * 1.45
            : compiled.macroTopology === "ice-streamer-field"
                ? species === "cirrus-spissatus"
                    ? orientedEllipseRadialBoundaryKm(
                        sectorAngle,
                        majorRadiusKm,
                        minorRadiusKm,
                        orientation,
                    ) + boundaryTransitionKm * 1.08
                    : minorRadiusKm * 0.22
            : compiled.macroTopology === "cellular-cloudlet-field"
                ? layerIndex === 2 ? minorRadiusKm * 0.45
                    : layerIndex === 0 ? minorRadiusKm * 0.28
                        : majorRadiusKm * 1.2
                : compiled.macroTopology === "deep-storm-complex"
                    ? majorRadiusKm * 1.18
                    : sheet ? majorRadiusKm * 1.12
                        : majorRadiusKm * 0.95;
    const ordinaryRangeKm = clamp(
        baseRange * lerp(radialBand[0], radialBand[1], placement.rangeScale),
        Math.max(2.5, minimumClearance),
        layerIndex === 1 ? 280 : 220,
    );
    // Seven/eight-okta sheets are physically immediate ceilings. Their finite
    // shield contains the observer; partial sheets remain remote banks whose
    // trailing boundary cannot masquerade as overhead cloud.
    const rangeKm = immediateDeck
        ? Math.max(0.8, minorRadiusKm * lerp(0.16, 0.52, placement.rangeScale))
        : ordinaryRangeKm;
    // This is a fixed Earth-local world bearing, not a camera frustum. Camera
    // orbit therefore reveals and occludes systems naturally.
    const centerEastKm = Math.sin(sectorAngle) * rangeKm;
    const centerNorthKm = Math.cos(sectorAngle) * rangeKm;
    return {
        centerEastKm,
        centerNorthKm,
        majorRadiusKm,
        minorRadiusKm,
        orientation,
        boundaryTransitionKm,
    };
};

/**
 * Calibrate dense high/middle finite populations against their authored
 * amount without multiplying every owner or consulting a camera frustum.
 * The first shared increment only re-anchors complete middle-layer morphology
 * owners in their authored formation sector. It never widens an individual
 * foundation envelope; isolated convective and attached-feature owners retain
 * their original finite placement.
 */
const calibrateCompositionExtent = ({
    extent,
    layer,
    layerIndex,
    species,
    macroTopology,
    classification,
}: {
    extent: CloudSystemExtent;
    layer: CloudLayerState;
    layerIndex: number;
    species: Exclude<CloudSpecies, "generic">;
    macroTopology: CompiledCloudSystem["macroTopology"];
    classification?: CloudClassification;
}) => {
    if (layerIndex < 1) return extent;
    if (layerIndex !== 1) return extent;
    // Orthogonal morphology fields are the shared placement-calibration
    // increment. Base species retain their established foundation spans; the
    // next morphology-specific increment can widen their population sectors
    // with the same contract once its envelope is audited.
    const orthogonalVariety = classification?.varieties.some((variety) =>
        variety === "undulatus" || variety === "duplicatus",
    ) ?? false;
    if (!classification || (!orthogonalVariety &&
        classification.supplementaryFeatures.length === 0 &&
        classification.accessoryClouds.length === 0)) return extent;
    // Cirrus spissatus has a deliberately compact finite-patch contract. Its
    // production frame support is intentionally below broad-field bands; the
    // amount contract records that sparse semantics instead of widening the
    // physically bounded 3--16 km formation envelope.
    const contract = cloudFrameCompositionContractFor({
        layer,
        layerIndex,
        species,
        macroTopology,
        classification,
    });
    if (contract.semantic !== "partial-finite-field" &&
        contract.semantic !== "distant-finite-sheet") return extent;
    const radialRange = Math.hypot(
        extent.centerEastKm,
        extent.centerNorthKm,
    );
    if (radialRange <= 0.001) return extent;
    const amount = clamp(layer.coverage);
    const sheet = macroTopology === "layered-veil" ||
        macroTopology === "precipitating-sheet" ||
        macroTopology === "boundary-layer-sheet";
    const compositionExtent = classification.varieties.includes("undulatus") &&
        sheet
        // An As undulatus atlas owner is a finite wave/front bank. Keep one
        // complete bank near the lower end of its 30–600 km formation span so
        // a 3 km ground-view base can meet the fixed oblique horizon without
        // placing a 250 km plate at a one-degree elevation.
        ? (() => {
            const desiredSpanKm = 36 + amount * 8;
            const scale = clamp(
                desiredSpanKm / Math.max(1, extent.majorRadiusKm * 2),
                0.12,
                1,
            );
            return {
                ...extent,
                majorRadiusKm: extent.majorRadiusKm * scale,
                minorRadiusKm: Math.min(
                    extent.majorRadiusKm * scale,
                    extent.minorRadiusKm * scale,
                ),
            };
        })()
        : extent;
    // Partial finite owners are arranged in a bounded near/middle sector. The
    // target derives from the complete formation span and authored amount; it
    // never changes the owner's foundation radii or parks every family at one
    // camera-tangent distance.
    const formationClearance = sheet
        ? 0.92 + amount * 0.14
        : 0.78 + amount * 0.24;
    const targetRange = compositionExtent.majorRadiusKm * formationClearance +
        compositionExtent.minorRadiusKm * (0.22 + (1 - amount) * 0.18);
    const ratio = targetRange / radialRange;
    return {
        ...compositionExtent,
        centerEastKm: compositionExtent.centerEastKm * ratio,
        centerNorthKm: compositionExtent.centerNorthKm * ratio,
        // Undulatus is a finite wave/front bank.  Its long axis follows the
        // front (crosswind to the local shear), so the complete bank presents
        // a readable horizontal boundary from the fixed production meridian
        // while retaining the same world-space owner and extent.
        orientation: classification.varieties.includes("undulatus") && sheet
            ? extent.orientation + Math.PI * 0.5
            : extent.orientation,
    };
};

const reconcileGeneratedRollTubeExtent = (
    generated: CloudSystemExtent,
    adapted: CloudSystemExtent,
): CloudSystemExtent => {
    const bearing = Math.atan2(
        generated.centerEastKm,
        generated.centerNorthKm,
    );
    const generatedRangeKm = Math.hypot(
        generated.centerEastKm,
        generated.centerNorthKm,
    );
    // The low-family foundation may broaden the finite formation transition
    // after `extentFor` has placed it. Retain that physical boundary, but
    // re-apply the same exact radial-ellipse clearance to the final footprint.
    // A conservative support-plane distance is appropriate for a cloud bank;
    // for a narrow tube it mistakes axial length for observer clearance.
    const radialBoundaryKm = orientedEllipseRadialBoundaryKm(
        bearing,
        adapted.majorRadiusKm,
        adapted.minorRadiusKm,
        adapted.orientation,
    );
    const rangeKm = Math.max(
        generatedRangeKm,
        radialBoundaryKm + adapted.boundaryTransitionKm * 1.08,
    );
    return {
        ...adapted,
        centerEastKm: Math.sin(bearing) * rangeKm,
        centerNorthKm: Math.cos(bearing) * rangeKm,
    };
};

const EARTH_RADIUS_KM = 6371;

const horizontalRangeAtAltitude = (altitudeKm: number, elevation: number) => {
    const sine = Math.sin(elevation);
    const cosine = Math.cos(elevation);
    const radius = EARTH_RADIUS_KM + Math.max(0, altitudeKm);
    const discriminant = Math.max(0,
        radius * radius - EARTH_RADIUS_KM * EARTH_RADIUS_KM * cosine * cosine);
    const slantRange = -EARTH_RADIUS_KM * sine + Math.sqrt(discriminant);
    return Math.max(0, slantRange * cosine);
};

const rayIntersectsSystemProjection = (
    azimuth: number,
    elevation: number,
    system: RuntimeCloudSystem,
) => {
    if (elevation < 0 || elevation > Math.PI * 0.5) return false;
    const { extent } = system.state;
    const baseAltitude = system.state.physical.baseAltitudeKm;
    const topAltitude = baseAltitude + system.state.physical.geometricDepthKm;
    const startRange = horizontalRangeAtAltitude(baseAltitude, elevation);
    const endRange = horizontalRangeAtAltitude(topAltitude, elevation);
    const minimumRange = Math.min(startRange, endRange);
    const maximumRange = Math.max(startRange, endRange);
    const rayEast = Math.sin(azimuth);
    const rayNorth = Math.cos(azimuth);
    const downwindEast = Math.cos(extent.orientation);
    const downwindNorth = Math.sin(extent.orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const major = Math.max(0.001, extent.majorRadiusKm);
    const minor = Math.max(0.001, extent.minorRadiusKm);
    const originEast = -extent.centerEastKm;
    const originNorth = -extent.centerNorthKm;
    const rayDownwind = (rayEast * downwindEast + rayNorth * downwindNorth) / major;
    const rayCrosswind = (rayEast * crosswindEast + rayNorth * crosswindNorth) / minor;
    const originDownwind = (originEast * downwindEast + originNorth * downwindNorth) /
        major;
    const originCrosswind = (originEast * crosswindEast + originNorth * crosswindNorth) /
        minor;
    const quadratic = rayDownwind * rayDownwind + rayCrosswind * rayCrosswind;
    const linear = originDownwind * rayDownwind + originCrosswind * rayCrosswind;
    const closestRange = quadratic > 1e-9
        ? clamp(-linear / quadratic, minimumRange, maximumRange)
        : minimumRange;
    const downwind = originDownwind + rayDownwind * closestRange;
    const crosswind = originCrosswind + rayCrosswind * closestRange;
    return downwind * downwind + crosswind * crosswind <= 1;
};

const contiguousBoundaryRunFraction = (
    samples: ReadonlySet<number>,
    sampleCount: number,
) => {
    if (samples.size === 0) return 0;
    const ordered = [...samples].sort((left, right) => left - right);
    let longest = 1;
    let current = 1;
    for (let index = 1; index < ordered.length; index += 1) {
        current = ordered[index] === ordered[index - 1] + 1
            ? current + 1 : 1;
        longest = Math.max(longest, current);
    }
    return longest / Math.max(1, sampleCount);
};

/**
 * Sample the same rectilinear pinhole projection used by the production WGSL
 * and retain per-owner support. This function is qualification-only: its
 * result is never packed, uploaded or consulted by cloud generation.
 */
export function estimateCloudFrameProjection(
    systems: readonly RuntimeCloudSystem[],
    options: CloudFrameProjectionOptions,
): CloudFrameProjection {
    const horizontalSamples = Math.max(16,
        Math.floor(options.horizontalSamples ?? 96));
    const verticalSamples = Math.max(12,
        Math.floor(options.verticalSamples ?? 64));
    const jitterX = clamp(options.jitterPixels?.[0] ?? 0, -0.5, 0.5);
    const jitterY = clamp(options.jitterPixels?.[1] ?? 0, -0.5, 0.5);
    const tangentHorizontal = Math.tan(options.horizontalFovRadians * 0.5);
    const tangentVertical = Math.tan(options.verticalFovRadians * 0.5);
    const pitchCosine = Math.cos(options.elevationRadians);
    const pitchSine = Math.sin(options.elevationRadians);
    const ownerWeights = new Float64Array(systems.length);
    const bounds = systems.map(() => ({
        minimumX: 1,
        maximumX: 0,
        minimumY: 1,
        maximumY: 0,
        left: false,
        right: false,
        top: false,
        bottom: false,
        leftRows: new Set<number>(),
        rightRows: new Set<number>(),
        topColumns: new Set<number>(),
        bottomColumns: new Set<number>(),
        supportSamples: 0,
        interiorSamples: 0,
    }));
    let totalWeight = 0;
    let supportedWeight = 0;
    for (let y = 0; y < verticalSamples; y += 1) {
        const sampleY = clamp(
            (y + 0.5 + jitterY) / verticalSamples,
            0,
            1,
        );
        const ndcY = 1 - sampleY * 2;
        for (let x = 0; x < horizontalSamples; x += 1) {
            const sampleX = clamp(
                (x + 0.5 + jitterX) / horizontalSamples,
                0,
                1,
            );
            const ndcX = sampleX * 2 - 1;
            const localX = ndcX * tangentHorizontal;
            const localY = ndcY * tangentVertical;
            const inverseLength = 1 / Math.hypot(localX, localY, 1);
            const normalizedX = localX * inverseLength;
            const normalizedY = localY * inverseLength;
            const normalizedZ = inverseLength;
            const worldY = normalizedY * pitchCosine + normalizedZ * pitchSine;
            const worldZ = normalizedZ * pitchCosine - normalizedY * pitchSine;
            const elevation = Math.asin(clamp(worldY, -1, 1));
            const azimuth = options.azimuthRadians + Math.atan2(
                normalizedX,
                worldZ,
            );
            const weight = Math.max(0.001, Math.cos(elevation));
            totalWeight += weight;
            let supported = false;
            for (let ownerIndex = 0;
                ownerIndex < systems.length;
                ownerIndex += 1) {
                if (!rayIntersectsSystemProjection(
                    azimuth,
                    elevation,
                    systems[ownerIndex],
                )) continue;
                supported = true;
                ownerWeights[ownerIndex] += weight;
                const ownerBounds = bounds[ownerIndex];
                ownerBounds.supportSamples += 1;
                if (x > 0 && x < horizontalSamples - 1 &&
                    y > 0 && y < verticalSamples - 1) {
                    ownerBounds.interiorSamples += 1;
                }
                ownerBounds.minimumX = Math.min(ownerBounds.minimumX, sampleX);
                ownerBounds.maximumX = Math.max(ownerBounds.maximumX, sampleX);
                ownerBounds.minimumY = Math.min(ownerBounds.minimumY, sampleY);
                ownerBounds.maximumY = Math.max(ownerBounds.maximumY, sampleY);
                ownerBounds.left ||= x === 0;
                ownerBounds.right ||= x === horizontalSamples - 1;
                ownerBounds.top ||= y === 0;
                ownerBounds.bottom ||= y === verticalSamples - 1;
                if (x === 0) ownerBounds.leftRows.add(y);
                if (x === horizontalSamples - 1) ownerBounds.rightRows.add(y);
                if (y === 0) ownerBounds.topColumns.add(x);
                if (y === verticalSamples - 1) ownerBounds.bottomColumns.add(x);
            }
            if (supported) supportedWeight += weight;
        }
    }
    const supportFraction = totalWeight > 0 ? supportedWeight / totalWeight : 0;
    const ownerProjections: CloudOwnerFrameProjection[] = [];
    for (let ownerIndex = 0; ownerIndex < systems.length; ownerIndex += 1) {
        if (ownerWeights[ownerIndex] <= 0) continue;
        const system = systems[ownerIndex];
        const ownerBounds = bounds[ownerIndex];
        const horizontalRangeKm = Math.hypot(
            system.state.extent.centerEastKm,
            system.state.extent.centerNorthKm,
        );
        const middleAltitudeKm = system.state.physical.baseAltitudeKm +
            system.state.physical.geometricDepthKm * 0.5;
        const slantRangeKm = Math.hypot(horizontalRangeKm, middleAltitudeKm);
        const elementDiameterKm = Math.max(0.001,
            system.familyProduction?.elementScaleKm ??
                system.compiled.geometry.elementScaleKm);
        const edgeContacts = {
            left: ownerBounds.left,
            right: ownerBounds.right,
            top: ownerBounds.top,
            bottom: ownerBounds.bottom,
            count: Number(ownerBounds.left) + Number(ownerBounds.right) +
                Number(ownerBounds.top) + Number(ownerBounds.bottom),
            leftRunFraction: contiguousBoundaryRunFraction(
                ownerBounds.leftRows,
                verticalSamples,
            ),
            rightRunFraction: contiguousBoundaryRunFraction(
                ownerBounds.rightRows,
                verticalSamples,
            ),
            topRunFraction: contiguousBoundaryRunFraction(
                ownerBounds.topColumns,
                horizontalSamples,
            ),
            bottomRunFraction: contiguousBoundaryRunFraction(
                ownerBounds.bottomColumns,
                horizontalSamples,
            ),
            interiorSupportFraction: ownerBounds.interiorSamples /
                Math.max(1, ownerBounds.supportSamples),
        };
        ownerProjections.push({
            ownerIndex,
            supportedFraction: ownerWeights[ownerIndex] /
                Math.max(1e-9, totalWeight),
            supportedShare: ownerWeights[ownerIndex] /
                Math.max(1e-9, supportedWeight),
            bounds: {
                minimumX: ownerBounds.minimumX,
                maximumX: ownerBounds.maximumX,
                minimumY: ownerBounds.minimumY,
                maximumY: ownerBounds.maximumY,
            },
            edgeContacts,
            projectedHorizontalSpanRadians:
                (ownerBounds.maximumX - ownerBounds.minimumX) *
                options.horizontalFovRadians,
            projectedVerticalSpanRadians:
                (ownerBounds.maximumY - ownerBounds.minimumY) *
                options.verticalFovRadians,
            projectedElementWidthRadians: 2 * Math.atan2(
                elementDiameterKm * 0.5,
                Math.max(0.001, slantRangeKm),
            ),
            horizontalRangeKm,
        });
    }
    const edgeContacts = {
        left: ownerProjections.some((owner) => owner.edgeContacts.left),
        right: ownerProjections.some((owner) => owner.edgeContacts.right),
        top: ownerProjections.some((owner) => owner.edgeContacts.top),
        bottom: ownerProjections.some((owner) => owner.edgeContacts.bottom),
        count: 0,
        robustCount: 0,
    };
    edgeContacts.count = Number(edgeContacts.left) +
        Number(edgeContacts.right) + Number(edgeContacts.top) +
        Number(edgeContacts.bottom);
    const robustEdge = (
        side: "leftRunFraction" | "rightRunFraction" |
            "topRunFraction" | "bottomRunFraction",
    ) => ownerProjections.some((owner) =>
        owner.edgeContacts[side] >= 0.08 &&
        owner.edgeContacts.interiorSupportFraction >= 0.05);
    edgeContacts.robustCount = Number(robustEdge("leftRunFraction")) +
        Number(robustEdge("rightRunFraction")) +
        Number(robustEdge("topRunFraction")) +
        Number(robustEdge("bottomRunFraction"));
    return {
        supportFraction,
        negativeSkyFraction: 1 - supportFraction,
        visibleOwnerCount: ownerProjections.length,
        sampledRays: horizontalSamples * verticalSamples,
        ownerProjections,
        edgeContacts,
    };
}

const radicalInverseBaseTwo = (value: number) => {
    let bits = value >>> 0;
    bits = ((bits << 16) | (bits >>> 16)) >>> 0;
    bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
    bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
    bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
    bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
    return bits / 0x1_0000_0000;
};

/**
 * Deterministically estimate the angular support of finite weather owners.
 *
 * This is a qualification tool, not a density input: it may inspect a proposed
 * view, but neither it nor any projection value participates in generation.
 * Full-dome mode samples equal solid angles on the observer's hemisphere.
 */
export function estimateCloudPopulationProjection(
    systems: readonly RuntimeCloudSystem[],
    options: CloudPopulationProjectionOptions = {},
): CloudPopulationProjection {
    const sampleCount = Math.max(128, Math.floor(options.sampleCount ?? 4096));
    const frame = options.azimuthRadians !== undefined;
    const azimuthCenter = options.azimuthRadians ?? 0;
    const elevationCenter = options.elevationRadians ?? Math.PI * 0.25;
    const horizontalFov = options.horizontalFovRadians ?? Math.PI * 2;
    const verticalFov = options.verticalFovRadians ?? Math.PI * 0.5;
    const visibleOwners = new Set<number>();
    let supportedWeight = 0;
    let sampledWeight = 0;
    let validSamples = 0;
    for (let index = 0; index < sampleCount; index += 1) {
        let azimuth: number;
        let elevation: number;
        let weight = 1;
        if (frame) {
            const horizontal = (index + 0.5) / sampleCount;
            const vertical = radicalInverseBaseTwo(index);
            azimuth = azimuthCenter + (horizontal - 0.5) * horizontalFov;
            elevation = elevationCenter + (vertical - 0.5) * verticalFov;
            if (elevation < 0 || elevation > Math.PI * 0.5) continue;
            weight = Math.max(0.001, Math.cos(elevation));
        } else {
            const sineElevation = (index + 0.5) / sampleCount;
            elevation = Math.asin(sineElevation);
            azimuth = Math.PI * 2 * radicalInverseBaseTwo(index) - Math.PI;
        }
        validSamples += 1;
        sampledWeight += weight;
        let supported = false;
        for (let ownerIndex = 0; ownerIndex < systems.length; ownerIndex += 1) {
            if (!rayIntersectsSystemProjection(
                azimuth,
                elevation,
                systems[ownerIndex],
            )) continue;
            supported = true;
            visibleOwners.add(ownerIndex);
        }
        if (supported) supportedWeight += weight;
    }
    return {
        supportFraction: sampledWeight > 0 ? supportedWeight / sampledWeight : 0,
        visibleOwnerCount: visibleOwners.size,
        sampledRays: validSamples,
    };
}

export interface LowLayeredRuntimeQualification {
    representation: LowLayeredCloudRepresentation;
    placement: CloudSystemPlacementMode;
    supportFraction: number;
    horizonContactFraction: number;
    valid: boolean;
    violations: readonly string[];
}

/** Fraction of azimuths where some low-elevation ray reaches condensate. */
export const estimateLowCloudHorizonContactFraction = (
    systems: readonly RuntimeCloudSystem[],
    azimuthSamples = 720,
    elevationSamples = 18,
) => {
    let contacted = 0;
    for (let azimuthIndex = 0; azimuthIndex < azimuthSamples; azimuthIndex += 1) {
        const azimuth = (azimuthIndex + 0.5) / azimuthSamples * Math.PI * 2 -
            Math.PI;
        let contact = false;
        for (let elevationIndex = 0;
            elevationIndex < elevationSamples && !contact;
            elevationIndex += 1) {
            const elevation = (elevationIndex + 0.5) / elevationSamples *
                Math.PI / 18;
            contact = systems.some((system) => rayIntersectsSystemProjection(
                azimuth,
                elevation,
                system,
            ));
        }
        if (contact) contacted += 1;
    }
    return contacted / Math.max(1, azimuthSamples);
};

const observerInsideExtent = (extent: CloudSystemExtent) => {
    const downwindEast = Math.cos(extent.orientation);
    const downwindNorth = Math.sin(extent.orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const deltaEast = -extent.centerEastKm;
    const deltaNorth = -extent.centerNorthKm;
    const majorCoordinate = (
        deltaEast * downwindEast + deltaNorth * downwindNorth
    ) / Math.max(0.001, extent.majorRadiusKm);
    const minorCoordinate = (
        deltaEast * crosswindEast + deltaNorth * crosswindNorth
    ) / Math.max(0.001, extent.minorRadiusKm);
    return majorCoordinate ** 2 + minorCoordinate ** 2 < 1;
};

export const inspectCloudWorldPopulation = (
    systems: readonly RuntimeCloudSystem[],
): CloudWorldPopulationCompositionCheck => {
    const radialRanges = systems.map((system) => Math.hypot(
        system.state.extent.centerEastKm,
        system.state.extent.centerNorthKm,
    ));
    const minimum = radialRanges.length > 0 ? Math.min(...radialRanges) : 0;
    const maximum = radialRanges.length > 0 ? Math.max(...radialRanges) : 0;
    const mean = radialRanges.length > 0
        ? radialRanges.reduce((sum, value) => sum + value, 0) /
            radialRanges.length : 0;
    const variance = radialRanges.length > 0
        ? radialRanges.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            radialRanges.length : 0;
    const pairwiseDistances: number[] = [];
    for (let left = 0; left < systems.length; left += 1) {
        for (let right = left + 1; right < systems.length; right += 1) {
            pairwiseDistances.push(Math.hypot(
                systems[left].state.extent.centerEastKm -
                    systems[right].state.extent.centerEastKm,
                systems[left].state.extent.centerNorthKm -
                    systems[right].state.extent.centerNorthKm,
            ));
        }
    }
    const sortedRadii = [...radialRanges].sort((a, b) => a - b);
    let maximumRadialClusterFraction = 0;
    for (let start = 0; start < sortedRadii.length; start += 1) {
        let end = start;
        const clusterLimit = sortedRadii[start] * 1.12 + 0.5;
        while (end < sortedRadii.length && sortedRadii[end] <= clusterLimit) {
            end += 1;
        }
        maximumRadialClusterFraction = Math.max(
            maximumRadialClusterFraction,
            (end - start) / Math.max(1, sortedRadii.length),
        );
    }
    const bearings = systems.map((system) => Math.atan2(
        system.state.extent.centerEastKm,
        system.state.extent.centerNorthKm,
    )).sort((left, right) => left - right);
    let maximumAngularGapRadians = 0;
    for (let index = 0; index < bearings.length; index += 1) {
        const next = index + 1 < bearings.length
            ? bearings[index + 1] : bearings[0] + Math.PI * 2;
        maximumAngularGapRadians = Math.max(
            maximumAngularGapRadians,
            next - bearings[index],
        );
    }
    let radialBandCount = 0;
    for (let radiusIndex = 0; radiusIndex < sortedRadii.length; radiusIndex += 1) {
        const radius = sortedRadii[radiusIndex];
        if (radialBandCount === 0 ||
            radius > (sortedRadii[radiusIndex - 1] ?? 0) * 1.18) {
            radialBandCount += 1;
        }
    }
    const radialCoefficientOfVariation = mean > 0
        ? Math.sqrt(variance) / mean : 0;
    return {
        ownerCount: systems.length,
        radialRangeKm: [minimum, maximum],
        radialCoefficientOfVariation,
        minimumPairwiseSpacingKm: pairwiseDistances.length > 0
            ? Math.min(...pairwiseDistances) : 0,
        maximumPairwiseSpacingKm: pairwiseDistances.length > 0
            ? Math.max(...pairwiseDistances) : 0,
        radialBandCount,
        maximumRadialClusterFraction,
        maximumAngularGapRadians,
        ringLike: systems.length >= 4 && radialCoefficientOfVariation < 0.12 &&
            maximumAngularGapRadians < Math.PI * 1.15,
    };
};

/**
 * Read-only acceptance record for one layer's finite owner population. The
 * contract is authored in physical coverage/oktas and then measured against
 * the one fixed production perspective. No camera state is passed to cloud
 * generation, and this function never mutates systems.
 */
export const qualifyCloudFrameComposition = ({
    systems,
    layer,
    layerIndex,
    materialEvidence,
    species,
    macroTopology,
    classification,
    lowLayeredPlacement,
}: {
    systems: readonly RuntimeCloudSystem[];
    layer: CloudLayerState;
    layerIndex: number;
    materialEvidence?: CloudFrameMaterialOccupancyEvidence;
    species?: Exclude<CloudSpecies, "generic">;
    macroTopology?: CompiledCloudSystem["macroTopology"];
    classification?: CloudClassification;
    lowLayeredPlacement?: CloudSystemPlacementMode;
}): CloudFrameCompositionQualification => {
    const representative = systems[0];
    const resolvedSpecies = species ?? representative?.compiled.recipeId;
    const resolvedTopology = macroTopology ?? representative?.compiled.macroTopology;
    const resolvedClassification = classification ?? representative?.state.classification;
    const resolvedPlacement = lowLayeredPlacement ??
        representative?.familyProduction?.lowLayeredDomain?.placement;
    const contract = cloudFrameCompositionContractFor({
        layer,
        layerIndex,
        species: resolvedSpecies,
        macroTopology: resolvedTopology,
        classification: resolvedClassification,
        lowLayeredPlacement: resolvedPlacement,
        ownerCount: systems.length,
    });
    const projection = estimateCloudFrameProjection(
        systems,
        CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS,
    );
    const population = inspectCloudWorldPopulation(systems);
    const organizedRadialTopology = resolvedTopology === "wave-lens-train" ||
        resolvedTopology === "roll-tube" ||
        resolvedTopology === "cellular-cloudlet-field";
    const generatedMaterialEvidence = materialEvidence ?? (() => {
        const ownerFactors = projection.ownerProjections.map((owner) =>
            cloudAtlasMaterialOccupancyFactorFor(
                systems[owner.ownerIndex]?.compiled.recipeId,
            ));
        const weightedFactor = projection.ownerProjections.length > 0
            ? Math.min(1, projection.ownerProjections.reduce((sum, owner, index) =>
                sum + owner.supportedFraction * ownerFactors[index], 0) /
                Math.max(1e-9, projection.supportFraction))
            : 0;
        return {
            supportFraction: projection.supportFraction * weightedFactor,
            ownerFractions: projection.ownerProjections.map((owner, index) =>
                owner.supportedFraction * ownerFactors[index]),
            occupiedSamples: Math.round(
                projection.supportFraction * projection.sampledRays * weightedFactor,
            ),
            sampledRays: projection.sampledRays,
            source: "generated-atlas-profile" as const,
        };
    })();
    const materialSupportFraction = generatedMaterialEvidence.supportFraction;
    const qualifiedSupportFraction = contract.semantic ===
        "immediate-broken-field"
        ? materialSupportFraction
        : projection.supportFraction;
    const cameraInside = systems.some((system) =>
        observerInsideExtent(system.state.extent));
    const violations: string[] = [];
    if (projection.visibleOwnerCount < contract.minimumVisibleOwners) {
        violations.push(
            `visible-owners-below-${contract.minimumVisibleOwners}`,
        );
    }
    if (qualifiedSupportFraction < contract.expectedSupport[0]) {
        violations.push(
            `support-below-${contract.expectedSupport[0].toFixed(3)}`,
        );
    }
    if ((contract.semantic === "partial-finite-field" ||
        contract.semantic === "distant-finite-sheet") &&
        projection.supportFraction > contract.expectedSupport[1]) {
        violations.push(
            `support-above-${contract.expectedSupport[1].toFixed(3)}`,
        );
    }
    if ((contract.semantic === "partial-finite-field" ||
        contract.semantic === "distant-finite-sheet") &&
        population.ownerCount >= 5 &&
        population.maximumRadialClusterFraction >= 0.75 &&
        !organizedRadialTopology) {
        violations.push("world-population-radial-shell-concentration");
    }
    const qualifiedEdgeCount = contract.requireAllFrameEdges
        ? projection.edgeContacts.robustCount
        : projection.edgeContacts.count;
    if (qualifiedEdgeCount < contract.minimumEdgeContacts) {
        violations.push(
            `edge-contacts-below-${contract.minimumEdgeContacts}`,
        );
    }
    if (contract.requireAllFrameEdges &&
        projection.edgeContacts.robustCount < 4) {
        violations.push("frame-edges-not-all-contacted");
    }
    if (contract.cameraInsideRequired && !cameraInside) {
        violations.push("observer-outside-immediate-domain");
    }
    return {
        layerIndex,
        representation: representative?.familyProduction?.representation ??
            resolvedSpecies ?? `layer-${layerIndex}`,
        contract,
        projection,
        materialSupportFraction,
        materialEvidence: generatedMaterialEvidence,
        population,
        cameraInside,
        valid: violations.length === 0,
        violations,
    };
};

/**
 * CPU acceptance gate for the complete low-layered world population. It uses
 * the same physical ray/ellipse projection as the renderer qualification,
 * never a screen mask, and couples the selected foundation variants to the
 * aperiodic topology validator.
 */
export const qualifyLowLayeredRuntimePopulation = (
    systems: readonly RuntimeCloudSystem[],
): readonly LowLayeredRuntimeQualification[] => {
    const groups = new Map<
        LowLayeredCloudRepresentation,
        RuntimeCloudSystem[]
    >();
    for (const system of systems) {
        if (system.familyProduction?.family !== "low-layered") continue;
        // Wet pannus is qualified in its parent Ns accessory domain below;
        // treating it as independent dry Stratus would sever its ownership.
        if (system.familyProduction.pannusUnderdeck) continue;
        const representation = system.familyProduction.representation as
            LowLayeredCloudRepresentation;
        const group = groups.get(representation) ?? [];
        group.push(system);
        groups.set(representation, group);
    }
    return [...groups.entries()].map(([representation, owners]) => {
        const domainMetadata = owners[0].familyProduction?.lowLayeredDomain;
        const placement = domainMetadata?.placement ?? "distant-finite-system";
        const fullDome = estimateCloudPopulationProjection(owners, {
            sampleCount: 4096,
        });
        // The projection integrates the finite owner domain. For an immediate
        // broken field, clear cells/corridors live inside that domain in the
        // generated atlas material. Apply the deterministic atlas occupancy
        // factor to the owner envelope; authored okta coverage remains the
        // contract expectation, not a substitute for material occupancy.
        const materialSupportFraction = placement === "immediate-broken-field"
            ? fullDome.supportFraction * Math.min(1, owners.reduce(
                (sum, owner) => sum + cloudAtlasMaterialOccupancyFactorFor(
                    owner.compiled.recipeId,
                ),
                0,
            ) / Math.max(1, owners.length))
            : fullDome.supportFraction;
        const horizonContactFraction =
            estimateLowCloudHorizonContactFraction(owners);
        const variants = LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation];
        const pannusParentIds = new Set(owners.map(({ state }) => state.id));
        const embeddedPannusOwners = representation === "nimbostratus-pannus"
            ? systems.filter((owner) =>
                owner.familyProduction?.family === "low-layered" &&
                owner.familyProduction.representation === "stratus-fractus" &&
                owner.morphologyAssignment?.relation === "embedded" &&
                pannusParentIds.has(
                    owner.familyProduction.pannusUnderdeck?.parentOwnerId ?? "",
                ))
            : [];
        // The Nimbostratus owner remains the parent shield. Pannus is the
        // separately materialized embedded fractus underdeck; validating the
        // shield as its own pannus owner would alias both density domains.
        const layoutOwners = representation === "nimbostratus-pannus" &&
            embeddedPannusOwners.length > 0
            ? embeddedPannusOwners : owners;
        const layout = qualifyLowLayeredLayout(
                representation,
                layoutOwners.map((owner, index) => {
                const variantId = representation === "nimbostratus-pannus"
                    ? owner.familyProduction?.pannusUnderdeck?.stage ??
                        variants[index % variants.length].id
                    : owner.familyProduction!.topologyVariantId;
                const variant = variants.find((candidate) =>
                    candidate.id === variantId) ?? variants[0];
                return {
                    variantId,
                    centerEastKm: owner.state.extent.centerEastKm,
                    centerNorthKm: owner.state.extent.centerNorthKm,
                    majorRadiusKm: owner.state.extent.majorRadiusKm,
                    minorRadiusKm: owner.state.extent.minorRadiusKm,
                    boundaryCorrelationId: `${variant.mechanism}:${owner.state.id}`,
                    topologySignature:
                        lowLayeredCloudTopologyVariantSignature(variant),
                    parentOwnerId: representation === "nimbostratus-pannus" &&
                        embeddedPannusOwners.length > 0
                        ? owner.familyProduction?.pannusUnderdeck?.parentOwnerId ??
                            null : null,
                };
                }),
            );
        const largest = [...owners].sort((left, right) =>
            right.state.extent.majorRadiusKm - left.state.extent.majorRadiusKm)[0];
        const cameraInside = owners.some((owner) =>
            observerInsideExtent(owner.state.extent));
        const domain = qualifyLowLayeredSystemDomain({
            representation,
            placement,
            boundaryMechanism: domainMetadata?.boundaryMechanism ??
                "entrainment-eroded",
            horizontalSpanKm: largest.state.extent.majorRadiusKm * 2,
            boundaryTransitionKm: largest.state.extent.boundaryTransitionKm,
            cameraInsideCondensateDomain: cameraInside,
            skyCoverageFraction: materialSupportFraction,
            horizonContactFraction,
            generatedFiniteSupport:
                domainMetadata?.generatedFiniteSupport ?? false,
            postDensityMaskWeight:
                domainMetadata?.postDensityMaskWeight ?? 1,
            locallyForcedFiniteSource: owners.every((owner) =>
                owner.familyProduction?.specialOrigin !== undefined),
            causallyAttachedFiniteSource: owners.every((owner) =>
                owner.familyProduction?.causalOrigin?.crossOwner === true),
        });
        const ownershipViolations = representation === "nimbostratus-pannus" &&
            embeddedPannusOwners.length === 0
            ? ["pannus-accessory-needs-parent-linked-wet-fragment-owner"]
            : [];
        const violations = [
            ...ownershipViolations,
            ...layout.violations,
            ...domain.violations,
        ];
        return {
            representation,
            placement,
            supportFraction: materialSupportFraction,
            horizonContactFraction,
            valid: violations.length === 0,
            violations,
        };
    });
};

const physicalStateFor = (
    scene: CloudScene,
    layer: CloudLayerState,
    species: Exclude<CloudSpecies, "generic">,
    random: () => number,
    classification?: CloudClassification,
    preserveAuthoredKinematics = false,
) => {
    const baseAltitudeKm = layer.baseAltitude / 1000;
    const geometricDepthKm = Math.max(0.02, layer.thickness / 1000);
    const topAltitudeKm = baseAltitudeKm + geometricDepthKm;
    const convective = species.startsWith("cumulus-") && species !== "cumulus-fractus" ||
        species.startsWith("cumulonimbus-");
    const deepConvective = species.startsWith("cumulonimbus-");
    const lapseRate = deepConvective ? 6.1 : convective ? 6.4 : 5.7;
    const baseTemperatureKelvin = clamp(288.15 - baseAltitudeKm * 6.15, 180, 315);
    const topTemperatureKelvin = clamp(
        baseTemperatureKelvin - geometricDepthKm * lapseRate,
        175,
        310,
    );
    const freezingLevelKm = clamp((288.15 - 273.15) / 6.15, 0, 20);
    const dropletEffectiveRadius = 8.5 + layer.opticalDepth * 6.5 +
        layer.precipitation * 7;
    const iceEffectiveRadius = 26 + layer.iceFraction * 38 +
        layer.precipitation * 28;
    const effectiveIce = clamp(layer.iceFraction * (1 - layer.towerAmount * 0.55));
    const targetOpticalDepth = layer.opticalDepth * 0.55 +
        layer.opticalDepth ** 2 * lerp(18, 4, effectiveIce);
    const liquidFraction = clamp(1 - layer.iceFraction);
    const liquidWaterPath = targetOpticalDepth * liquidFraction *
        2 * 1000 * (dropletEffectiveRadius * 1e-6) / 3;
    const iceWaterPath = targetOpticalDepth * (1 - liquidFraction) *
        2 * 917 * (iceEffectiveRadius * 1e-6) / 3;
    const precipitationKind = precipitationKindFor(
        species,
        layer.precipitation,
        layer.iceFraction,
        classification,
    );
    const inversionLimited = !deepConvective && (
        species.includes("stratiformis") || species.includes("nebulosus") ||
        species.startsWith("altostratus") || species.startsWith("nimbostratus") ||
        species === "cumulus-humilis" || species === "cumulus-mediocris"
    );
    const lfc = convective
        ? baseAltitudeKm + Math.min(0.12, geometricDepthKm * 0.04)
        : null;
    const equilibrium = lfc === null
        ? null
        : Math.max(lfc + 0.03, topAltitudeKm - geometricDepthKm * 0.015);
    const duplicatus = !preserveAuthoredKinematics &&
        (classification?.varieties.includes("duplicatus") ?? false);
    // Duplicatus is two or more genuinely superposed layers. Each finite
    // owner receives a slightly different level wind, rather than rendering a
    // displaced copy of one advected density field.
    const ownerWindSpeed = duplicatus
        ? layer.windSpeed * (0.9 + random() * 0.22) : layer.windSpeed;
    const ownerWindDirection = duplicatus
        ? layer.windDirection + (random() - 0.5) * 0.24 : layer.windDirection;

    return {
        baseAltitudeKm,
        geometricDepthKm,
        coverageOktas: layer.oktas,
        thermodynamics: {
            baseTemperatureKelvin,
            topTemperatureKelvin,
            relativeHumidity: clamp(0.94 + scene.humidity * 0.11, 0, 1.08),
            environmentalLapseRate: lapseRate,
            stabilityIndex: clamp(1 - scene.instability * 2, -1, 1),
            verticalVelocity: deepConvective
                ? 12 + scene.convection * 34
                : convective ? 1.2 + scene.convection * 8.5
                    : (random() - 0.5) * 0.8,
            entrainment: deepConvective ? 0.08 + random() * 0.12
                : convective ? 0.16 + random() * 0.24 : 0.04 + random() * 0.10,
        },
        kinematics: {
            windSpeed: ownerWindSpeed,
            windDirection: ownerWindDirection,
            verticalShear: clamp(Math.max(
                layer.windSpeed * layer.shear / geometricDepthKm,
                duplicatus ? 1.15 : 0,
                classification?.supplementaryFeatures.includes("fluctus")
                    // Kelvin-Helmholtz billows require a resolved unstable
                    // shear layer; the labeled morphology cannot survive a
                    // weak genus-default velocity gradient.
                    ? 3.2 : 0,
            ), 0, 50),
            turbulenceIntegralScaleKm: clamp(
                geometricDepthKm * (0.08 + layer.turbulence * 0.52),
                0.005,
                30,
            ),
            turbulenceDissipation: clamp(
                0.00001 + layer.turbulence ** 3 * 0.16,
                0.000001,
                1,
            ),
        },
        condensate: {
            liquidWaterPath: clamp(liquidWaterPath, 0, 5),
            iceWaterPath: clamp(iceWaterPath, 0, 3),
            liquidFraction,
            dropletEffectiveRadius,
            iceEffectiveRadius,
        },
        precipitation: {
            kind: precipitationKind,
            rate: precipitationKind === "none" ? 0
                : precipitationKind === "drizzle" ? layer.precipitation * 2.5
                    : precipitationKind === "virga" ? layer.precipitation * 4
                        : precipitationKind === "shower" ? layer.precipitation * 48
                            : layer.precipitation * 16,
            terminalVelocity: precipitationKind === "none" ? 0
                : precipitationKind === "snow" ? 1.2
                : precipitationKind === "drizzle" ? 1.8
                    : precipitationKind === "virga" ? 0.8 : 6.5,
            evaporationDepthKm: precipitationKind === "virga"
                ? clamp(baseAltitudeKm * (0.55 + random() * 0.35), 0.1, 10)
                : 0,
        },
        formation: {
            liftingCondensationLevelKm: baseAltitudeKm,
            levelOfFreeConvectionKm: lfc,
            equilibriumLevelKm: equilibrium,
            inversionBaseKm: inversionLimited ? topAltitudeKm : null,
            inversionStrengthKelvin: inversionLimited
                ? 0.5 + (1 - scene.instability) * 3.5 : 0,
            freezingLevelKm,
            shearLayerBaseKm: baseAltitudeKm,
            shearLayerTopKm: topAltitudeKm,
        },
    };
};

interface AuthoredSystemBuildRequest {
    readonly system: CloudAuthoredSystemState;
    /** Stable ordinal within this WMO level for index-based compatibility. */
    readonly systemIndex: number;
}

const buildLayerSystems = (
    scene: CloudScene,
    layer: CloudLayerState,
    layerIndex: number,
    ownerSignature: string,
    morphologyAssignments: ReadonlyMap<string, CloudMorphologyClassificationAssignment>,
    specialOriginSources: ReadonlyMap<string, CloudSpecialOriginSource>,
    diagnostics: string[],
    authored?: AuthoredSystemBuildRequest,
): RuntimeCloudSystem[] => {
    if (!layer.present || layer.coverage <= 0.001 || layer.genus === "clear") return [];
    const fallbackSpecies = resolvedSpeciesForLayer(layer);
    const fallbackClassification = classificationFromRendererSpecies(fallbackSpecies);
    const fallbackRecipe = CLOUD_RENDERER_RECIPES[fallbackSpecies];
    const count = authored ? 1 : systemCountFor(
        fallbackSpecies,
        fallbackRecipe.macroTopology,
        layer.coverage,
    );
    const placements = authored ? [] : createSystemPlacements(
        count,
        fallbackRecipe.macroTopology,
        layer.coverage,
        ownerSignature,
        layerIndex,
        fallbackSpecies,
        layer.organization,
        layer.windDirection,
    );
    const systems: RuntimeCloudSystem[] = [];
    for (let populationIndex = 0; populationIndex < count; populationIndex += 1) {
        const systemIndex = authored?.systemIndex ?? populationIndex;
        const seedValue = hashText(authored
            ? `${ownerSignature}:authored:${layerIndex}:${authored.system.id}`
            : `${ownerSignature}:${layerIndex}:${systemIndex}`);
        const systemId = authored?.system.id ??
            `cloud-${seedValue.toString(16)}-${layerIndex}-${systemIndex}`;
        let morphologyAssignment = resolveCloudMorphologyAssignment(
            morphologyAssignments,
            { layerIndex, systemId, systemIndex },
        );
        let assignedClassification = morphologyAssignment?.classification;
        let assignedSpecies = assignedClassification
            ? rendererSpeciesForClassification(assignedClassification)
            : undefined;
        if (assignedClassification && !assignedSpecies) {
            diagnostics.push(
                `assignment:${layerIndex}:${systemIndex}:missing-renderer-recipe:` +
                "canonical classification has no renderer species",
            );
            morphologyAssignment = undefined;
            assignedClassification = undefined;
        } else if (assignedClassification && assignedSpecies) {
            const qualification = qualifyCloudLayerFamilyAdmissibility({
                layer,
                layerIndex,
                rendererSpecies: assignedSpecies,
                classification: assignedClassification,
            });
            if (!qualification.legal) {
                pushFamilyDiagnostics(
                    diagnostics,
                    `assignment:${layerIndex}:${systemIndex}`,
                    qualification.issues,
                );
                morphologyAssignment = undefined;
                assignedClassification = undefined;
                assignedSpecies = undefined;
            }
        }
        const species = assignedSpecies ?? fallbackSpecies;
        const recipe = CLOUD_RENDERER_RECIPES[species];
        const fallbackHydrometeorFeatures =
            assignedClassification?.supplementaryFeatures.some((feature) =>
                feature === "virga" || feature === "praecipitatio")
                ? []
                : fallbackClassification.supplementaryFeatures.filter((feature) =>
                    feature === "virga" || feature === "praecipitatio");
        const classification: CloudClassification = assignedClassification
            ? {
                // The assignment is the canonical WMO identity. Historical
                // renderer recipe names such as `altostratus-opacus` are only
                // physical implementation keys and must not inject an
                // incompatible optical variety into an explicitly authored
                // Altostratus translucidus/perlucidus state.
                ...assignedClassification,
                varieties: [...assignedClassification.varieties],
                supplementaryFeatures: [
                    ...new Set([
                        ...assignedClassification.supplementaryFeatures,
                        ...fallbackHydrometeorFeatures,
                    ]),
                ],
                accessoryClouds: [...assignedClassification.accessoryClouds],
                origin: { ...assignedClassification.origin },
            } as CloudClassification
            : fallbackClassification;
        const random = mulberry32(seedValue);
        const selectedTopologyExemplar = selectCloudTopologyExemplar({
            species,
            sceneDaySeed: scene.seed,
            ownerSeed: seedValue,
        });
        // The first local Congestus group must actually expose the three
        // materialized macro genealogies. Independent modulo hashes can (and
        // did) choose the same turreted atlas for every visible owner. A
        // day-seeded phase preserves day-to-day variety while the owner
        // ordinal guarantees local structural breadth.
        const topologyExemplar = !authored && species === "cumulus-congestus"
            ? CLOUD_TOPOLOGY_EXEMPLARS[species][
                (hashText(`congestus-exemplar:${String(scene.seed)}`) +
                    populationIndex) % CLOUD_TOPOLOGY_EXEMPLARS_PER_SPECIES
            ]
            : selectedTopologyExemplar;
        // Keep four normalized lanes and the 16-vec4 GPU record intact. Lane
        // W now partitions the stochastic construction space by logical
        // exemplar, while retaining independent within-exemplar variation.
        const seeds = [
            random(), random(), random(),
            (topologyExemplar.ordinal + random()) /
                CLOUD_TOPOLOGY_EXEMPLARS_PER_SPECIES,
        ] as const;
        const randomAfterSeeds = mulberry32(seedValue ^ 0xa511e9b3);
        const generatedCumulus = !authored &&
            recipe.macroTopology === "thermal-field" &&
            (species === "cumulus-humilis" ||
                species === "cumulus-mediocris" ||
                species === "cumulus-congestus");
        // A cloud layer describes the meteorological population envelope, not
        // a command that every thermal must reach the same top. Successive Cu
        // owners represent parcels at different ages and entrainment states.
        // Tie that physical height/width phenotype to the deterministic
        // topology exemplar so it remains stable in world space and cannot
        // change with the camera or frame clock.
        const cumulusVerticalPhenotypes = species === "cumulus-humilis"
            ? [0.72, 0.90, 1.06]
            : species === "cumulus-mediocris"
                ? [0.74, 0.96, 1.18]
                : [0.92, 1.12, 0.82];
        const cumulusHorizontalPhenotypes = species === "cumulus-humilis"
            ? [1.17, 1.03, 0.91]
            : species === "cumulus-mediocris"
                ? [1.12, 1.00, 0.90]
                : [1.02, 0.86, 1.15];
        const cumulusVerticalScale = generatedCumulus
            ? cumulusVerticalPhenotypes[topologyExemplar.ordinal] *
                lerp(0.94, 1.06, seeds[0])
            : 1;
        const cumulusHorizontalScale = generatedCumulus
            ? cumulusHorizontalPhenotypes[topologyExemplar.ordinal] *
                lerp(0.94, 1.06, seeds[1])
            : 1;
        const cumulusPopulationScale = generatedCumulus &&
            species === "cumulus-congestus"
            ? [1.14, 0.96, 0.78, 0.88, 0.70][
                Math.min(populationIndex, 4)
            ]
            : 1;
        const ownerLayer: CloudLayerState = generatedCumulus
            ? {
                ...layer,
                thickness: Math.max(20,
                    layer.thickness * cumulusVerticalScale),
                towerAmount: clamp(layer.towerAmount *
                    lerp(0.92, 1.08, seeds[0])),
            }
            : layer;
        const provisional = {
            macroTopology: recipe.macroTopology,
            geometry: { elementScaleKm: midpoint(recipe.elementScaleKm) },
        };
        const generatedExtent: CloudSystemExtent = authored
            ? { ...authored.system.manifold }
            : extentFor(
                layer,
                {
                    ...provisional,
                    geometry: {
                        ...provisional.geometry,
                        baseAltitudeKm: layer.baseAltitude / 1000,
                        geometricDepthKm: Math.max(0.02, layer.thickness / 1000),
                        verticalAspect: midpoint(recipe.verticalAspect),
                        supportBandFraction: midpoint(recipe.boundarySupport),
                        extent: {
                            centerEastKm: 0,
                            centerNorthKm: 0,
                            majorRadiusKm: 1,
                            minorRadiusKm: 1,
                            orientation: layer.windDirection,
                            boundaryTransitionKm: 0.2,
                        },
                    },
                },
                layerIndex,
                placements[populationIndex],
                randomAfterSeeds,
                species,
            );
        const authoredExtent = generatedCumulus
            ? {
                ...generatedExtent,
                majorRadiusKm: generatedExtent.majorRadiusKm *
                    cumulusHorizontalScale * cumulusPopulationScale,
                // Congestus macro volumes already carry their own asymmetric
                // planform. Fair-weather Cu retains a somewhat broader range
                // of source ellipses, but neither path is allowed to collapse
                // an authored thermal genealogy into a narrow billboard.
                minorRadiusKm: generatedExtent.majorRadiusKm *
                    cumulusHorizontalScale * cumulusPopulationScale *
                    (species === "cumulus-congestus"
                        ? 0.78 + seeds[1] * 0.16
                        : 0.68 + seeds[1] * 0.20),
                boundaryTransitionKm: generatedExtent.boundaryTransitionKm *
                    cumulusHorizontalScale * cumulusPopulationScale,
            }
            : generatedExtent;
        const priorExtents = systems.map((system) => system.state.extent);
        const extent = !authored && species === "cumulus-congestus" &&
            layer.organization !== "streets" && layer.organization !== "banded"
            ? separateCongestusOwnerExtent(authoredExtent, priorExtents)
            : !authored && recipe.macroTopology === "thermal-field" &&
            layer.organization !== "streets" && layer.organization !== "banded"
            ? separateThermalOwnerExtent(
                authoredExtent,
                priorExtents,
            )
            : authoredExtent;
        const cumulusLifecycleOffsets = species === "cumulus-congestus"
            ? [0, -0.12, 0.12]
            : [-0.12, 0, 0.11];
        const unconstrainedLifecycleProgress = layer.lifecycle +
            (generatedCumulus
                ? cumulusLifecycleOffsets[topologyExemplar.ordinal] +
                    (seeds[2] - 0.5) * 0.16
                : (seeds[2] - 0.5) * 0.12);
        // A generated Cu population may contain younger companion phenotypes,
        // but owner-attached morphology has causal lifecycle bounds. Arcus
        // and pannus need active precipitation/cold-pool stages; pileus and
        // velum need at least a growing parent. Preserve those lower bounds
        // while retaining all height/width variation and camera-independent
        // placement.
        const precipitationDrivenMorphology =
            classification.supplementaryFeatures.includes("arcus") ||
            classification.accessoryClouds.includes("pannus");
        const growingAccessoryMorphology =
            classification.accessoryClouds.includes("pileus") ||
            classification.accessoryClouds.includes("velum");
        const morphologyLifecycleFloor = precipitationDrivenMorphology
            ? 0.38
            : growingAccessoryMorphology ? 0.14 : 0;
        const lifecycleProgress = clamp(Math.max(
            morphologyLifecycleFloor,
            unconstrainedLifecycleProgress,
        ));
        const precipitationKind = precipitationKindFor(
            species,
            layer.precipitation,
            layer.iceFraction,
            classification,
        );
        const state: CloudSystemState = {
            id: systemId,
            classification,
            physical: physicalStateFor(
                scene,
                ownerLayer,
                species,
                randomAfterSeeds,
                classification,
                authored !== undefined,
            ),
            extent,
            organization: organizationFor(
                layer,
                {
                    ...provisional,
                    geometry: {
                        ...provisional.geometry,
                        baseAltitudeKm: ownerLayer.baseAltitude / 1000,
                        geometricDepthKm: Math.max(0.02,
                            ownerLayer.thickness / 1000),
                        verticalAspect: midpoint(recipe.verticalAspect),
                        supportBandFraction: midpoint(recipe.boundarySupport),
                        extent,
                    },
                },
                randomAfterSeeds,
                classification,
            ),
            lifecycle: {
                stage: lifecycleStageFor(
                    lifecycleProgress,
                    classification,
                    layer.precipitation,
                ),
                stageProgress: lifecycleProgress,
                ageSeconds: lerp(
                    300,
                    species === "cumulus-humilis" ? 3_600
                        : species === "cumulus-mediocris" ? 5_400
                        : species === "cumulus-congestus" ? 7_200
                        : species.startsWith("cumulonimbus") ? 7_200 : 36_000,
                    lifecycleProgress,
                ),
                cloudTopRiseRate: lifecycleProgress < 0.48
                    ? ownerLayer.towerAmount * (4 + scene.convection * 32)
                    : -ownerLayer.towerAmount * (lifecycleProgress - 0.48) * 5,
                condensateTendency: clamp((0.52 - lifecycleProgress) *
                    (0.25 + layer.opticalDepth * 0.6), -1, 1),
                glaciationRate: layer.iceFraction *
                    (species.startsWith("cumulonimbus") ? 0.018 : 0.003),
                precipitationEfficiency: precipitationKind === "none" ? 0
                    : clamp(layer.precipitation * (0.45 + lifecycleProgress * 0.5)),
                outflowSpeed: species.startsWith("cumulonimbus")
                    ? 7 + layer.anvilAmount * 34
                    : classification.supplementaryFeatures.includes("arcus")
                        // Arcus on a strongly precipitating Cumulus parent is
                        // the visible leading edge of its finite cold pool.
                        // Preserve that actual gust-front velocity rather than
                        // granting outflow only to the Cumulonimbus recipe.
                        ? 3 + layer.precipitation * 22 : 0,
            },
        };
        const result = adaptCloudFamilyProduction({
            state,
            rendererSpecies: species,
            deterministicSeed: seedValue,
            topologyExemplar,
            ...(!authored && (species === "cirrus-fibratus" ||
                species === "cirrus-spissatus" ||
                species === "cirrus-castellanus" ||
                species === "cirrus-floccus" ||
                species === "altocumulus-castellanus" ||
                species === "cirrocumulus-castellanus" ||
                species === "cirrocumulus-floccus") ? {
                // The foundation declares four physical fibratus macroforms
                // while the reusable volume atlas has three anatomy lanes.
                // Cycle the independent ontology lane through the population;
                // lifecycle qualification may still reject an inadmissible
                // form for a genuinely young or decaying owner. Middle-layer
                // castellanus and Cc floccus use the same deterministic
                // formation-scale handoff so each complete packet remains
                // whole.
                ...(species === "cirrus-fibratus" ? {
                    foundationTopologyVariantOrdinal:
                        (hashText(`fibratus-foundation:${String(scene.seed)}`) +
                            populationIndex) %
                        HIGH_CLOUD_TOPOLOGY_VARIANTS["cirrus-fibratus"].length,
                } : {}),
                // The fixed production perspective needs the complete finite
                // near packet to occupy its documented formation envelope.
                // These are world-space size multipliers; remote companions
                // retain their independently sampled spans.
                formationScale: placements[populationIndex].sizeScale,
            } : {}),
            ...(authored ? { preserveAuthoredManifold: true } : {}),
            ...(morphologyAssignment?.sourceId ? {
                specialOriginSource: specialOriginSources.get(
                    morphologyAssignment.sourceId,
                ),
            } : {}),
        });
        if (result.compiled) {
            const adaptedExtent = !authored &&
                recipe.macroTopology === "roll-tube"
                ? reconcileGeneratedRollTubeExtent(
                    extent,
                    result.state.extent,
                )
                : result.state.extent;
            const runtimeExtent = !authored
                ? calibrateCompositionExtent({
                    extent: adaptedExtent,
                    layer: ownerLayer,
                    layerIndex,
                    species,
                    macroTopology: recipe.macroTopology,
                    classification,
                })
                : adaptedExtent;
            systems.push({
                layerIndex,
                systemIndex,
                seeds,
                topologyExemplar,
                atlasDeterministicVariant: topologyExemplar.ordinal,
                state: runtimeExtent === result.state.extent
                    ? result.state
                    : { ...result.state, extent: runtimeExtent },
                compiled: runtimeExtent === result.state.extent
                    ? result.compiled
                    : {
                        ...result.compiled,
                        geometry: {
                            ...result.compiled.geometry,
                            extent: runtimeExtent,
                        },
                    },
                ...(result.metadata ? { familyProduction: result.metadata } : {}),
                ...(morphologyAssignment ? { morphologyAssignment } : {}),
            });
        } else {
            diagnostics.push(...result.issues.map((issue) =>
                `${result.state.id}:${issue.path}:${issue.code}:${issue.message}`));
        }
    }
    return systems;
};

const pannusStageFor = (
    state: ReturnType<typeof samplePannusUnderdeckState>,
): NonNullable<CloudFamilyProductionMetadata["pannusUnderdeck"]>["stage"] =>
    state.washoutFraction > 0.46
        ? "washout-limited-pannus"
        : state.parentMergeFraction > 0.42
            ? "coalescing-pannus-underdeck"
            : "incipient-separated-pannus";

/**
 * Materialize pannus as a wet Stratus-fractus density owner below its Ns
 * shield. The shield remains the only parent cloud owner; rain/snow belongs to
 * hydrometeors and the accessory never aliases either density domain.
 */
const materializeNimbostratusPannusOwners = (
    scene: CloudScene,
    inputSystems: readonly RuntimeCloudSystem[],
    diagnostics: string[],
): RuntimeCloudSystem[] => {
    const systems = [...inputSystems];
    const parents = inputSystems.filter((system) =>
        system.familyProduction?.representation === "nimbostratus-pannus");
    for (const parent of parents) {
        const precipitationIntensity = clamp(Math.max(
            parent.state.lifecycle.precipitationEfficiency,
            parent.state.physical.precipitation.rate / 16,
        ));
        const relativeHumidity = clamp(Math.max(scene.humidity, 0.82));
        const turbulence = clamp(
            parent.state.physical.kinematics.turbulenceDissipation * 5e3,
        );
        const sampled = samplePannusUnderdeckState(
            precipitationIntensity,
            relativeHumidity,
            turbulence,
        );
        const stage = pannusStageFor(sampled);
        const authored = systems.findIndex((candidate) =>
            candidate.familyProduction?.representation === "stratus-fractus" &&
            candidate.morphologyAssignment?.relation === "embedded" &&
            candidate.familyProduction?.pannusUnderdeck === undefined);
        const pannusMetadata = {
            parentOwnerId: parent.state.id,
            stage,
            coverageFraction: sampled.coverageFraction,
            fragmentCountScale: sampled.fragmentCountScale,
            parentMergeFraction: sampled.parentMergeFraction,
            washoutFraction: sampled.washoutFraction,
        } as const;
        if (authored >= 0) {
            const owner = systems[authored];
            systems[authored] = {
                ...owner,
                familyProduction: owner.familyProduction ? {
                    ...owner.familyProduction,
                    topologyVariantId: stage,
                    pannusUnderdeck: pannusMetadata,
                } : owner.familyProduction,
            };
            continue;
        }

        const seedValue = hashText(`${parent.state.id}:wet-pannus`);
        const random = mulberry32(seedValue);
        const depthKm = clamp(
            parent.state.physical.geometricDepthKm * 0.08,
            0.12,
            0.48,
        );
        const mergeLiftKm = depthKm * sampled.parentMergeFraction * 0.75;
        const gapKm = Math.max(
            0,
            0.08 + (1 - sampled.parentMergeFraction) * 0.32 - mergeLiftKm,
        );
        const baseAltitudeKm = Math.max(
            0.03,
            parent.state.physical.baseAltitudeKm - gapKm - depthKm,
        );
        const coverageOktas = clamp(
            sampled.coverageFraction * 8,
            0.35,
            7.2,
        );
        const pannusMajorRadiusKm = clamp(
            parent.state.extent.majorRadiusKm *
                (0.45 + sampled.coverageFraction * 0.42),
            0.2,
            30,
        );
        const pannusMinorRadiusKm = clamp(
            parent.state.extent.minorRadiusKm *
                (0.40 + sampled.coverageFraction * 0.46),
            0.2,
            pannusMajorRadiusKm,
        );
        const classification = classificationFromRendererSpecies(
            "stratus-fractus",
        );
        const state: CloudSystemState = {
            ...parent.state,
            id: `${parent.state.id}:wet-pannus`,
            classification,
            physical: {
                ...parent.state.physical,
                baseAltitudeKm,
                geometricDepthKm: depthKm,
                coverageOktas,
                condensate: {
                    ...parent.state.physical.condensate,
                    liquidFraction: Math.max(
                        0.82,
                        parent.state.physical.condensate.liquidFraction,
                    ),
                    liquidWaterPath: parent.state.physical.condensate.liquidWaterPath *
                        (0.18 + sampled.coverageFraction * 0.42),
                    iceWaterPath: parent.state.physical.condensate.iceWaterPath * 0.04,
                },
                precipitation: {
                    ...parent.state.physical.precipitation,
                    kind: "none",
                    rate: 0,
                    terminalVelocity: 0,
                    evaporationDepthKm: 0,
                },
                formation: {
                    ...parent.state.physical.formation,
                    liftingCondensationLevelKm: baseAltitudeKm,
                    levelOfFreeConvectionKm: baseAltitudeKm + depthKm * 0.35,
                    equilibriumLevelKm: baseAltitudeKm + depthKm,
                    inversionBaseKm: baseAltitudeKm + depthKm,
                    shearLayerBaseKm: baseAltitudeKm,
                    shearLayerTopKm: baseAltitudeKm + depthKm,
                },
            },
            extent: {
                ...parent.state.extent,
                majorRadiusKm: pannusMajorRadiusKm,
                minorRadiusKm: pannusMinorRadiusKm,
                centerEastKm: parent.state.extent.centerEastKm +
                    (random() - 0.5) * parent.state.extent.minorRadiusKm * 0.18,
                centerNorthKm: parent.state.extent.centerNorthKm +
                    (random() - 0.5) * parent.state.extent.minorRadiusKm * 0.18,
                boundaryTransitionKm: Math.max(
                    pannusMajorRadiusKm * 0.008,
                    parent.state.extent.boundaryTransitionKm * 0.32,
                ),
            },
            organization: {
                kind: "point-process",
                distribution: "clustered",
                meanSpacingKm: Math.max(0.12, depthKm * 1.6),
                minimumSeparationKm: Math.max(0.05, depthKm * 0.38),
                clusterRadiusKm: Math.max(
                    0.3,
                    parent.state.extent.minorRadiusKm * 0.28,
                ),
                anisotropy: 1.2 + sampled.parentMergeFraction * 1.4,
                orientation: parent.state.extent.orientation,
            },
            lifecycle: {
                ...parent.state.lifecycle,
                stage: stage === "washout-limited-pannus" ? "decaying"
                    : stage === "coalescing-pannus-underdeck" ? "mature"
                        : "growing",
                condensateTendency: stage === "washout-limited-pannus"
                    ? -sampled.washoutFraction : sampled.fragmentCountScale,
                precipitationEfficiency: 0,
            },
        };
        const topologyExemplar = selectCloudTopologyExemplar({
            species: "stratus-fractus",
            sceneDaySeed: scene.seed,
            ownerSeed: seedValue,
        });
        const result = adaptCloudFamilyProduction({
            state,
            rendererSpecies: "stratus-fractus",
            deterministicSeed: seedValue,
            topologyExemplar,
            preserveAuthoredManifold: true,
        });
        if (!result.compiled || !result.metadata) {
            diagnostics.push(...result.issues.map((issue) =>
                `${state.id}:pannus-materialization:${issue.code}:${issue.message}`));
            continue;
        }
        systems.push({
            layerIndex: parent.layerIndex,
            systemIndex: parent.systemIndex,
            seeds: [random(), random(), random(), random()],
            topologyExemplar,
            atlasDeterministicVariant: topologyExemplar.ordinal,
            state: result.state,
            compiled: result.compiled,
            familyProduction: {
                ...result.metadata,
                topologyVariantId: stage,
                pannusUnderdeck: pannusMetadata,
            },
            morphologyAssignment: {
                layerIndex: parent.layerIndex,
                systemId: result.state.id,
                relation: "embedded",
                causalParent: {
                    layerIndex: parent.layerIndex,
                    systemId: parent.state.id,
                },
                classification,
            },
        });
    }
    return systems;
};

const lifecycleCode: Record<CloudLifecycleStage, number> = {
    incipient: 0,
    growing: 1,
    mature: 2,
    glaciating: 3,
    precipitating: 4,
    decaying: 5,
};

const precipitationCode: Record<CloudPrecipitationKind, number> = {
    none: 0,
    virga: 1,
    drizzle: 2,
    rain: 3,
    shower: 4,
    snow: 5,
    hail: 6,
};

const organizationVectors = (
    organization: CloudOrganizationState,
    coverageOktas: number,
) => {
    const coverageFraction = clamp(coverageOktas / 8);
    switch (organization.kind) {
        case "point-process": return [
            [0, organization.meanSpacingKm, organization.minimumSeparationKm,
                organization.clusterRadiusKm],
            [organization.anisotropy, organization.orientation,
                organization.distribution === "clustered" ? 1 : 0,
                coverageFraction],
        ] as const;
        case "cellular": return [
            [1, organization.meanCellDiameterKm, organization.wallWidthFraction,
                organization.centerJitter],
            [organization.anisotropy, organization.orientation,
                organization.topology === "open" ? 0
                    : organization.topology === "closed" ? 1 : 2,
                coverageFraction],
        ] as const;
        case "banded": return [
            [2, organization.bandSpacingKm, organization.bandWidthFraction,
                organization.lengthKm],
            [organization.curvature, organization.orientation, 3,
                coverageFraction],
        ] as const;
        case "frontal-shield": return [
            [3, organization.alongFrontLengthKm, organization.crossFrontDepthKm,
                organization.leadingTransitionKm],
            [organization.trailingTransitionKm, organization.orientation, 0,
                coverageFraction],
        ] as const;
        case "wave-packet": return [
            [4, organization.wavelengthKm, organization.packetLengthKm,
                organization.crestCount],
            [organization.orientation, 0, 0, coverageFraction],
        ] as const;
        case "storm-complex": return [
            [5, organization.inflowRadiusKm, organization.updraftRadiusKm,
                organization.outflowRadiusKm],
            [organization.propagationDirection, 0, 0, coverageFraction],
        ] as const;
    }
};

const bitMask = (values: readonly string[], vocabulary: readonly string[]) =>
    values.reduce((mask, value) => {
        const index = vocabulary.indexOf(value);
        return index < 0 ? mask : mask + 2 ** index;
    }, 0);

const varieties = ["intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
    "duplicatus", "translucidus", "perlucidus", "opacus"] as const;
const supplementary = ["incus", "mamma", "virga", "praecipitatio", "arcus", "tuba",
    "asperitas", "fluctus", "cavum", "murus", "cauda"] as const;
const accessories = ["pileus", "velum", "pannus", "flumen"] as const;

/** Pack a bounded active population for one WebGPU storage buffer. */
export function packCloudSystems(
    systems: readonly RuntimeCloudSystem[],
    capacity = CLOUD_SYSTEM_MAX_COUNT,
): PackedCloudSystems {
    const boundedCapacity = Math.max(1, Math.min(CLOUD_SYSTEM_MAX_COUNT,
        Math.floor(capacity)));
    const count = Math.min(systems.length, boundedCapacity);
    const dropped = Math.max(0, systems.length - count);
    const data = new Float32Array(
        (CLOUD_SYSTEM_HEADER_VEC4S + boundedCapacity * CLOUD_SYSTEM_VEC4_STRIDE) * 4,
    );
    setVector(data, 0, [count, CLOUD_SYSTEM_VEC4_STRIDE, boundedCapacity, dropped]);
    for (let index = 0; index < count; index += 1) {
        const system = systems[index];
        const { state, compiled } = system;
        const offset = CLOUD_SYSTEM_HEADER_VEC4S + index * CLOUD_SYSTEM_VEC4_STRIDE;
        const formation = compiled.formation;
        const organization = organizationVectors(
            state.organization,
            state.physical.coverageOktas,
        );
        setVector(data, offset + 0, [
            1,
            system.layerIndex,
            CLOUD_GENUS_CODE[state.classification.genus],
            CLOUD_SPECIES_CODE[compiled.recipeId],
        ]);
        setVector(data, offset + 1, [
            state.extent.centerEastKm,
            state.extent.centerNorthKm,
            state.extent.majorRadiusKm,
            state.extent.minorRadiusKm,
        ]);
        setVector(data, offset + 2, [
            compiled.geometry.baseAltitudeKm,
            compiled.geometry.geometricDepthKm,
            state.extent.orientation,
            state.extent.boundaryTransitionKm,
        ]);
        setVector(data, offset + 3, [
            formation.liftingCondensationLevelKm,
            formation.levelOfFreeConvectionKm ?? -1,
            formation.equilibriumLevelKm ?? -1,
            formation.freezingLevelKm,
        ]);
        setVector(data, offset + 4, [
            formation.inversionBaseKm ?? -1,
            formation.inversionStrengthKelvin,
            formation.shearLayerBaseKm,
            formation.shearLayerTopKm,
        ]);
        setVector(data, offset + 5, [
            compiled.material.extinctionKm,
            compiled.material.liquidFraction01,
            compiled.material.liquidEffectiveRadiusMicrons,
            compiled.material.iceEffectiveRadiusMicrons,
        ]);
        setVector(data, offset + 6, [
            compiled.thermodynamics.baseTemperatureKelvin,
            compiled.thermodynamics.topTemperatureKelvin,
            compiled.thermodynamics.relativeHumidity,
            compiled.thermodynamics.environmentalLapseRate,
        ]);
        setVector(data, offset + 7, [
            compiled.kinematics.windSpeed,
            compiled.kinematics.windDirection,
            compiled.kinematics.verticalShear,
            compiled.kinematics.turbulenceIntegralScaleKm,
        ]);
        setVector(data, offset + 8, [
            lifecycleCode[compiled.lifecycle.stage],
            compiled.lifecycle.stageProgress,
            compiled.lifecycle.ageSeconds,
            compiled.lifecycle.cloudTopRiseRate,
        ]);
        setVector(data, offset + 9, [
            compiled.lifecycle.condensateTendency,
            compiled.lifecycle.glaciationRate,
            compiled.lifecycle.precipitationEfficiency,
            compiled.lifecycle.outflowSpeed,
        ]);
        setVector(data, offset + 10, organization[0]);
        setVector(data, offset + 11, organization[1]);
        setVector(data, offset + 12, [
            precipitationCode[compiled.precipitation.kind],
            compiled.precipitation.rate,
            compiled.precipitation.terminalVelocity,
            compiled.precipitation.evaporationDepthKm,
        ]);
        setVector(data, offset + 13, [
            bitMask(compiled.features.varieties, varieties),
            bitMask(compiled.features.supplementary, supplementary),
            bitMask(compiled.features.accessories, accessories),
            compiled.features.hasSurfacePrecipitation ? 1 : 0,
        ]);
        setVector(data, offset + 14, system.seeds);
        setVector(data, offset + 15, [
            compiled.thermodynamics.stabilityIndex,
            compiled.thermodynamics.verticalVelocity,
            compiled.thermodynamics.entrainment,
            compiled.kinematics.turbulenceDissipation,
        ]);
    }
    return { data, count, capacity: boundedCapacity, dropped };
}

const featureKindFor = (compiled: CompiledCloudSystem) => {
    if (compiled.macroTopology === "ice-streamer-field" ||
        compiled.macroTopology === "castellated-deck" &&
            compiled.classification.genus === "cirrus" ||
        compiled.macroTopology === "floccus-field" &&
            compiled.classification.genus === "cirrus") return 1;
    if (compiled.macroTopology === "wave-lens-train") return 2;
    if (compiled.macroTopology === "thermal-field" ||
        compiled.macroTopology === "deep-storm-complex") return 3;
    if (compiled.macroTopology === "cellular-cloudlet-field" ||
        compiled.macroTopology === "castellated-deck" ||
        compiled.macroTopology === "floccus-field") return 4;
    if (compiled.macroTopology === "fragment-field") return 5;
    if (compiled.macroTopology === "roll-tube") return 6;
    return 0;
};

/** Project physical systems into the existing eight-vec4 feature ABI. */
export function packLegacyCloudFeatures(
    systems: readonly RuntimeCloudSystem[],
): Float32Array {
    const data = new Float32Array(CLOUD_FEATURE_BUFFER_FLOATS);
    const layerSlots = [0, 0, 0];
    for (const system of systems) {
        const featureKind = featureKindFor(system.compiled);
        if (featureKind === 0) continue;
        const slot = layerSlots[system.layerIndex];
        if (slot >= CLOUD_FEATURE_SLOTS_PER_LAYER) continue;
        layerSlots[system.layerIndex] += 1;
        const offset = (system.layerIndex * CLOUD_FEATURE_SLOTS_PER_LAYER + slot) *
            CLOUD_FEATURE_VEC4_STRIDE;
        const { state, compiled, seeds } = system;
        const species = CLOUD_SPECIES_CODE[compiled.recipeId];
        const extent = state.extent;
        const depthKm = compiled.geometry.geometricDepthKm;
        const axis = [Math.cos(extent.orientation), Math.sin(extent.orientation)] as const;
        const normalizedTop = clamp(
            compiled.thermodynamics.verticalVelocity > 10
                ? 0.90 + seeds[0] * 0.08
                : 0.34 + seeds[0] * 0.55,
        );
        const common = {
            identity: [featureKind, system.layerIndex, species, 1],
            center: [extent.centerEastKm, extent.centerNorthKm, 0,
                extent.majorRadiusKm + extent.minorRadiusKm * 2.2],
            axis: [axis[0], axis[1], extent.majorRadiusKm, extent.minorRadiusKm],
            variation: [...seeds],
        };
        let shape: readonly number[] = [normalizedTop, 0.12, 0.2, 0.8];
        let extra0: readonly number[] = [0, 0, 0, 0];
        let extra1: readonly number[] = [0, 0, 0, 0];
        let extra2: readonly number[] = [0, 0, 0, 0];
        if (featureKind === 1) {
            const uncinus = compiled.recipeId === "cirrus-uncinus";
            const compact = compiled.recipeId === "cirrus-castellanus" ||
                compiled.recipeId === "cirrus-floccus";
            const centerHeight = uncinus ? 0.76 + seeds[1] * 0.12
                : 0.38 + seeds[1] * 0.32;
            common.center[2] = centerHeight;
            shape = [centerHeight, compact ? 0.13 + seeds[2] * 0.16
                : 0.035 + seeds[2] * 0.075, 0.14 + seeds[3] * 0.34, 0.72 + seeds[0] * 0.26];
            extra0 = [uncinus ? 2 + Math.floor(seeds[1] * 2)
                : compact ? 1 + Math.floor(seeds[1] * 3) : 3 + Math.floor(seeds[1] * 5),
                depthKm * (uncinus ? 0.58 : 0.38), 0.55 + seeds[2], 0.42 + seeds[3] * 0.5];
            extra1 = [state.physical.coverageOktas / 8, state.lifecycle.stageProgress,
                state.physical.kinematics.turbulenceIntegralScaleKm,
                state.physical.kinematics.verticalShear];
        } else if (featureKind === 2) {
            common.axis[0] = Math.cos(extent.orientation + Math.PI * 0.5);
            common.axis[1] = Math.sin(extent.orientation + Math.PI * 0.5);
            const centerHeight = 0.42 + seeds[0] * 0.18;
            common.center[2] = centerHeight;
            shape = [centerHeight, 0.035 + seeds[1] * 0.09,
                0.04 + seeds[2] * 0.13, 0.72 + seeds[3] * 0.25];
            extra0 = [slot, layerSlots[system.layerIndex],
                state.physical.coverageOktas / 8,
                state.organization.kind === "wave-packet" ?
                    state.organization.crestCount / 4 : 0.5];
            extra1 = [state.lifecycle.stageProgress,
                state.physical.kinematics.turbulenceIntegralScaleKm,
                state.physical.kinematics.verticalShear,
                state.organization.kind === "wave-packet" ? state.organization.crestCount : 1];
        } else if (featureKind === 3) {
            const storm = compiled.macroTopology === "deep-storm-complex";
            common.center[2] = 0;
            shape = [normalizedTop, state.lifecycle.stageProgress, storm ? 1 : 0,
                system.systemIndex === 0 ? 0.86 + seeds[0] * 0.14 : 0.38 + seeds[0] * 0.22];
            const anvilDownwind = storm && compiled.recipeId !== "cumulonimbus-calvus"
                ? extent.majorRadiusKm * (1.0 + seeds[1] * 0.55) : 0;
            const anvilWidth = storm && compiled.recipeId !== "cumulonimbus-calvus"
                ? extent.majorRadiusKm * (1.35 + seeds[2] * 0.70) : 0;
            extra0 = [extent.majorRadiusKm * (0.48 + seeds[0] * 0.38),
                anvilDownwind, anvilWidth, depthKm * (0.07 + seeds[3] * 0.05)];
            extra1 = [state.physical.coverageOktas / 8,
                clamp(state.physical.thermodynamics.verticalVelocity / 46),
                storm ? clamp(state.lifecycle.outflowSpeed / 40) : 0,
                state.organization.kind === "storm-complex" ? 1 : 0.5];
            extra2 = [...seeds];
        } else if (featureKind === 4) {
            const castellanus = compiled.recipeId.includes("castellanus");
            const floccus = compiled.recipeId.includes("floccus");
            shape = [castellanus ? 0.68 + seeds[0] * 0.26
                : floccus ? 0.48 + seeds[0] * 0.28 : 0.30 + seeds[0] * 0.28,
                state.lifecycle.stageProgress,
                state.organization.kind === "cellular" ? state.organization.centerJitter : 0.4,
                0.68 + seeds[1] * 0.32];
            extra0 = [castellanus ? 4 + Math.floor(seeds[1] * 3)
                : floccus ? 4 + Math.floor(seeds[1] * 4)
                    : compiled.classification.genus === "cirrocumulus"
                        ? 9 + Math.floor(seeds[1] * 2) : 6 + Math.floor(seeds[1] * 3),
                state.physical.coverageOktas / 8,
                state.physical.kinematics.turbulenceIntegralScaleKm,
                state.physical.kinematics.verticalShear];
            extra1 = [compiled.classification.genus === "stratocumulus" ? 0.58 : 0.18,
                1 - compiled.material.liquidFraction01,
                compiled.geometry.supportBandFraction, 0];
            extra2 = [...seeds];
        } else if (featureKind === 5) {
            common.center[2] = 0;
            shape = [0.24 + seeds[0] * 0.42, 0.08 + seeds[1] * 0.10,
                0.34 + seeds[2] * 0.56, 0.62 + seeds[3] * 0.32];
            extra0 = [state.physical.coverageOktas / 8,
                state.physical.kinematics.turbulenceIntegralScaleKm,
                state.physical.kinematics.verticalShear,
                state.lifecycle.stageProgress];
        } else if (featureKind === 6) {
            common.axis[0] = Math.cos(extent.orientation + Math.PI * 0.5);
            common.axis[1] = Math.sin(extent.orientation + Math.PI * 0.5);
            shape = [0.42 + seeds[0] * 0.12,
                extent.minorRadiusKm * (0.70 + seeds[1] * 0.24),
                0.10 + seeds[2] * 0.18, 0.72 + seeds[3] * 0.26];
            extra0 = [state.physical.coverageOktas / 8,
                state.physical.kinematics.turbulenceIntegralScaleKm,
                state.physical.kinematics.verticalShear, 0];
        }
        [common.identity, common.center, common.axis, shape, common.variation,
            extra0, extra1, extra2].forEach((vector, vectorIndex) =>
            setVector(data, offset + vectorIndex, vector));
    }
    return data;
}

const morphologyPhaseFor = (
    system: RuntimeCloudSystem,
): CloudMorphologyCompileRequest["phase"] => {
    const liquid = system.compiled.material.liquidFraction01;
    return liquid >= 0.76 ? "liquid" : liquid <= 0.24 ? "ice" : "mixed";
};

const morphologyParentFor = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
): CloudMorphologyOwnerGeometry => {
    const { extent } = system.state;
    const base = system.compiled.geometry.baseAltitudeKm;
    const depth = system.compiled.geometry.geometricDepthKm;
    const top = base + depth;
    const middle = base + depth * 0.5;
    const downwind: readonly [number, number, number] = [
        Math.cos(extent.orientation), 0, Math.sin(extent.orientation),
    ];
    const crosswind: readonly [number, number, number] = [
        -downwind[2], 0, downwind[0],
    ];
    const up: readonly [number, number, number] = [0, 1, 0];
    const center: readonly [number, number, number] = [
        extent.centerEastKm, middle, extent.centerNorthKm,
    ];
    const offset = (
        alongCrosswind: number,
        altitude: number,
        alongDownwind: number,
    ): readonly [number, number, number] => [
        center[0] + crosswind[0] * alongCrosswind +
            downwind[0] * alongDownwind,
        altitude,
        center[2] + crosswind[2] * alongCrosswind +
            downwind[2] * alongDownwind,
    ];
    const leading = -extent.majorRadiusKm * 0.68;
    return {
        ownerIndex,
        centerKm: center,
        halfExtentsKm: [
            Math.max(0.04, extent.minorRadiusKm),
            Math.max(0.01, depth * 0.5),
            Math.max(0.04, extent.majorRadiusKm),
        ],
        axisU: crosswind,
        axisV: up,
        axisW: downwind,
        anchorsKm: {
            "parent-volume": center,
            "parent-filament-axis": offset(0, middle, 0),
            "parent-layer-midplane": center,
            "parent-upper-surface": offset(0, top, 0),
            "parent-underside": offset(0, base, 0),
            "anvil-underside": offset(0, base + depth * 0.72,
                extent.majorRadiusKm * 0.18),
            "parent-leading-lower-edge": offset(0, base + depth * 0.08, leading),
            "rain-free-base": offset(extent.minorRadiusKm * 0.34,
                base + depth * 0.05, -extent.majorRadiusKm * 0.12),
            "precipitation-core-edge": offset(-extent.minorRadiusKm * 0.38,
                base + depth * 0.12, extent.majorRadiusKm * 0.12),
            "parent-top": offset(0, top, extent.majorRadiusKm * 0.12),
            "parent-lower-environment": offset(0,
                Math.max(0, base - depth * 0.12), 0),
            "storm-inflow-sector": offset(extent.minorRadiusKm * 0.56,
                base + depth * 0.16, leading * 0.72),
        },
    };
};

const morphologyRequestForSystem = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
): CloudMorphologyCompileRequest => {
    const compiled = system.compiled;
    const organization = system.state.organization;
    const phase = morphologyPhaseFor(system);
    const precipitation = compiled.precipitation.kind;
    const requestedTuba = compiled.classification.supplementaryFeatures
        .includes("tuba");
    const requestedSupercellStructure =
        compiled.classification.supplementaryFeatures.includes("murus") ||
        compiled.classification.supplementaryFeatures.includes("cauda") ||
        compiled.classification.accessoryClouds.includes("flumen");
    const bulkShearMps = compiled.kinematics.verticalShear *
        compiled.geometry.geometricDepthKm;
    const strongRotation = compiled.classification.genus === "cumulonimbus" &&
        organization.kind === "storm-complex" &&
        requestedSupercellStructure && bulkShearMps >= 8;
    const resolvedVorticityS1 = strongRotation
        ? Math.max(0.002, bulkShearMps * 0.0018)
        : requestedTuba && compiled.thermodynamics.verticalVelocity > 0 &&
            bulkShearMps >= 3
            ? Math.max(0.0008, bulkShearMps * 0.0012) : 0;
    const requirements = deriveCloudMorphologyRequirements({
        organizationKind: organization.kind,
        organizationTopology: organization.kind === "cellular"
            ? organization.topology : undefined,
        phase,
        temperatureKelvin: compiled.thermodynamics.topTemperatureKelvin,
        relativeHumidity: compiled.thermodynamics.relativeHumidity,
        verticalVelocityMps: compiled.thermodynamics.verticalVelocity,
        verticalShearMps: compiled.kinematics.verticalShear,
        gradientRichardsonNumber: compiled.kinematics.verticalShear >= 3
            ? 0.18 : 0.55,
        vorticityS1: resolvedVorticityS1,
        precipitationKind: precipitation,
        outflowSpeedMps: compiled.lifecycle.outflowSpeed,
        cloudyUnderside: compiled.material.extinctionKm > 0.08,
        subcloudDetrainmentOrSublimation: precipitation !== "none" ||
            compiled.lifecycle.stage === "decaying",
        settlingOrEvaporation: precipitation === "virga" ||
            compiled.lifecycle.stage === "decaying",
        stormComplex: organization.kind === "storm-complex",
        supercell: strongRotation,
        mesocyclone: strongRotation,
        rainFreeUpdraftBase: strongRotation,
        precipitationRegion: precipitation !== "none",
        supercellInflow: strongRotation,
        pseudoWarmFront: strongRotation,
        precipitationMoistenedLayer: precipitation !== "none",
        capillatusStage: compiled.classification.genus === "cumulonimbus" &&
            compiled.classification.species === "capillatus",
    });
    return {
        parent: morphologyParentFor(system, ownerIndex),
        logicalTopology: system.topologyExemplar,
        deterministicSeeds: system.seeds,
        classification: system.state.classification,
        phase,
        lifecycle: compiled.lifecycle.stage,
        requirements,
        environment: {
            temperatureKelvin: compiled.thermodynamics.topTemperatureKelvin,
            altitudeKm: compiled.geometry.baseAltitudeKm +
                compiled.geometry.geometricDepthKm * 0.5,
        },
        seed: hashText(`${system.state.id}:morphology`),
        intensity: 0.72 + system.seeds[3] * 0.28,
    };
};

const upperMorphologyRequests = (
    scene: CloudScene,
    firstOwnerIndex: number,
) => {
    const requests: CloudMorphologyCompileRequest[] = [];
    const diagnostics: string[] = [];
    const seen = new Set<string>();
    for (const assignment of scene.classifications ?? []) {
        const upper = assignment.upperAtmosphericCloud;
        if (!upper || seen.has(upper)) continue;
        seen.add(upper);
        const ownerIndex = firstOwnerIndex + requests.length;
        if (ownerIndex >= CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS) {
            diagnostics.push(
                `${upper}:morphology-owner-capacity:upper atmosphere exceeded ` +
                `${CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS} morphology owners`,
            );
            continue;
        }
        const upperState = qualifyUpperAtmosphericSceneState(scene, upper);
        if (!upperState.legal) {
            for (const violation of upperState.violations) {
                diagnostics.push(`${upper}:upper-admissibility:${violation}`);
            }
            continue;
        }
        const altitude = upperState.altitudeKm;
        const seed = hashText(`${cloudSystemOwnerSignature(scene)}:${upper}`);
        const random = mulberry32(seed);
        const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[
            upperState.representation
        ];
        const topology = selectUpperTopologyVariant(
            upperState.representation,
            seed,
        );
        const bearing = random() * Math.PI * 2;
        const horizontalRange = upper === "noctilucent"
            ? 420 + random() * 520 : 140 + random() * 360;
        const center = [
            Math.sin(bearing) * horizontalRange,
            altitude,
            Math.cos(bearing) * horizontalRange,
        ] as const;
        const tangent = [Math.cos(bearing), 0, -Math.sin(bearing)] as const;
        const radialHorizontal = [Math.sin(bearing), 0, Math.cos(bearing)] as const;
        const orientation = (random() - 0.5) * Math.PI;
        const axisU = [
            tangent[0] * Math.cos(orientation) + radialHorizontal[0] * Math.sin(orientation),
            0,
            tangent[2] * Math.cos(orientation) + radialHorizontal[2] * Math.sin(orientation),
        ] as const;
        const axisW = [
            -tangent[0] * Math.sin(orientation) + radialHorizontal[0] * Math.cos(orientation),
            0,
            -tangent[2] * Math.sin(orientation) + radialHorizontal[2] * Math.cos(orientation),
        ] as const;
        const spanKm = clamp(
            descriptor.formationSpanKm[0] +
                (descriptor.formationSpanKm[1] - descriptor.formationSpanKm[0]) *
                (0.18 + random() * 0.5),
            upper === "noctilucent" ? 120 : 20,
            upper === "noctilucent" ? 900 : 420,
        );
        const aspect = Math.sqrt(topology.formationAspectRatio[0] *
            topology.formationAspectRatio[1]);
        const halfMajor = spanKm * 0.5;
        const halfMinor = Math.max(
            upper === "noctilucent" ? 18 : 5,
            halfMajor / Math.sqrt(aspect),
        );
        const parent: CloudMorphologyOwnerGeometry = {
            ownerIndex,
            centerKm: center,
            // The modifier manifest expresses the actual thin condensate
            // thickness inside a much deeper admissible shell. Supplying the
            // physical half-shell here lets its 0.04/0.10 normalized vertical
            // support reach the 50 m–2 km / 100 m–3 km ranges without clipping
            // gravity-wave amplitude to an artificial one-kilometre parent.
            halfExtentsKm: [halfMajor, upper === "noctilucent" ? 2.5 : 7.5,
                halfMinor],
            axisU,
            axisV: [0, 1, 0],
            axisW,
            anchorsKm: { "tangent-shell": center },
        };
        const winter = upperState.season === "winter";
        const liquidOrNatPsc = upper === "polar-stratospheric" ||
            upper === "polar-stratospheric-sts" ||
            upper === "polar-stratospheric-nat";
        const requirements = deriveCloudMorphologyRequirements({
            phase: liquidOrNatPsc ? "mixed" : "ice",
            polarWinterVortex: upper !== "noctilucent" && winter,
            stratosphericColdPool: liquidOrNatPsc && winter,
            belowIceFrostPoint: (upper === "nacreous" ||
                upper === "polar-stratospheric-ice") && winter,
            polarSummerMesopause: upper === "noctilucent" && !winter,
            sunlitUpperLayer: upper === "noctilucent" &&
                (scene.solarDepression ?? 0) >= 6 &&
                (scene.solarDepression ?? 0) <= 16,
        });
        requests.push({
            parent,
            upperAtmosphericCloud: upper,
            phase: liquidOrNatPsc ? "mixed" : "ice",
            lifecycle: "mature",
            requirements,
            environment: {
                temperatureKelvin: upperState.temperatureKelvin,
                absoluteLatitudeDegrees: upperState.absoluteLatitudeDegrees,
                season: upperState.season,
                altitudeKm: altitude,
                solarDepressionDegrees: upperState.solarDepressionDegrees,
            },
            seed,
            intensity: upper === "noctilucent"
                ? clamp(scene.noctilucent || 0.72, 0.1, 1) : 0.72 + random() * 0.24,
            upperAtmosphericState: {
                stateId: upper,
                representation: upperState.representation,
                topologyVariantId: topology.id,
                formationAspectRatio: topology.formationAspectRatio,
                wavelengthKm: topology.wavelengthKm,
                composition: descriptor.composition,
                particleDiameterMicrons: descriptor.particleDiameterMicrons,
                polarizationBasis: "scalar-rgb-with-latent-stokes-mueller-basis",
            },
        });
    }
    return { requests, diagnostics };
};

export function createCloudMorphologyCompileRequests(
    scene: CloudScene,
    systems: readonly RuntimeCloudSystem[],
) {
    const tropospheric = systems.slice(0, CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS)
        .map((system, ownerIndex) => morphologyRequestForSystem(system, ownerIndex));
    const upper = upperMorphologyRequests(scene, tropospheric.length);
    return {
        requests: [...tropospheric, ...upper.requests],
        ownerLayers: [
            ...tropospheric.map((request) => systems[request.parent.ownerIndex].layerIndex),
            ...upper.requests.map(() => -1),
        ],
        diagnostics: upper.diagnostics,
    };
}

const resolveRuntimeOwnerReference = (
    systems: readonly RuntimeCloudSystem[],
    reference: NonNullable<CloudMorphologyClassificationAssignment["causalParent"]>,
) => systems.findIndex((system) =>
    system.layerIndex === reference.layerIndex &&
    (reference.systemId !== undefined
        ? system.state.id === reference.systemId
        : system.systemIndex === (reference.systemIndex ?? 0)));

const recompileRelatedOwner = (
    prior: RuntimeCloudSystem,
    state: CloudSystemState,
    diagnostics: string[],
) => {
    const result = compileCloudSystem(state);
    if (!result.compiled) {
        diagnostics.push(...result.issues.map((issue) =>
            `${state.id}:causal-recompile:${issue.path}:${issue.code}:` +
            issue.message));
        return undefined;
    }
    const priorGeometry = prior.compiled.geometry;
    return {
        ...prior,
        state,
        compiled: {
            ...result.compiled,
            geometry: {
                ...result.compiled.geometry,
                elementScaleKm: priorGeometry.elementScaleKm,
                verticalAspect: priorGeometry.verticalAspect,
                supportBandFraction: priorGeometry.supportBandFraction,
                extent: { ...state.extent },
            },
        },
    } satisfies RuntimeCloudSystem;
};

/** Resolve authored mother/child references after every family has materialized. */
const applyCrossOwnerCausalRelationships = (
    inputSystems: readonly RuntimeCloudSystem[],
    diagnostics: string[],
) => {
    const systems = [...inputSystems];
    const links: Array<{
        childIndex: number;
        parentIndex: number;
        assignment: CloudMorphologyClassificationAssignment;
    }> = [];
    for (const [childIndex, child] of systems.entries()) {
        const assignment = child.morphologyAssignment;
        if (!assignment?.causalParent) continue;
        const parentIndex = resolveRuntimeOwnerReference(
            systems,
            assignment.causalParent,
        );
        if (parentIndex < 0) {
            diagnostics.push(
                `assignment:${child.layerIndex}:${child.systemIndex}:` +
                "missing-causal-parent-owner:the referenced mother owner did not materialize",
            );
            continue;
        }
        links.push({ childIndex, parentIndex, assignment });
    }

    const parentByChild = new Map(links.map((link) =>
        [link.childIndex, link.parentIndex]));
    const cyclicOwners = new Set<number>();
    for (const link of links) {
        const path: number[] = [];
        const visited = new Map<number, number>();
        let cursor: number | undefined = link.childIndex;
        while (cursor !== undefined) {
            const priorIndex = visited.get(cursor);
            if (priorIndex !== undefined) {
                for (const owner of path.slice(priorIndex)) cyclicOwners.add(owner);
                break;
            }
            visited.set(cursor, path.length);
            path.push(cursor);
            cursor = parentByChild.get(cursor);
        }
    }
    if (cyclicOwners.size > 0) {
        diagnostics.push(
            `causal-lineage:cycle:${[...cyclicOwners].map((index) =>
                systems[index].state.id).join(",")}:mother-cloud lineage must be acyclic`,
        );
    }

    const mutatusParent = new Set<number>();
    const admissibleLinks = links.filter((link) => {
        if (cyclicOwners.has(link.childIndex) || cyclicOwners.has(link.parentIndex)) {
            return false;
        }
        if (link.assignment.relation === "mutatus") {
            if (mutatusParent.has(link.parentIndex)) {
                diagnostics.push(
                    `assignment:${systems[link.childIndex].layerIndex}:` +
                    `${systems[link.childIndex].systemIndex}:duplicate-mutatus-child:` +
                    "one owner cannot split the same internal transformation twice",
                );
                return false;
            }
            mutatusParent.add(link.parentIndex);
        }
        return true;
    });
    const lineageDepth = (link: typeof admissibleLinks[number]) => {
        let depth = 0;
        let cursor = link.parentIndex;
        while (parentByChild.has(cursor) && depth <= systems.length) {
            depth += 1;
            cursor = parentByChild.get(cursor)!;
        }
        return depth;
    };
    admissibleLinks.sort((left, right) =>
        lineageDepth(left) - lineageDepth(right));

    for (const link of admissibleLinks) {
        const relation = link.assignment.relation;
        if (relation !== "genitus" && relation !== "mutatus") continue;
        const parent = systems[link.parentIndex];
        const child = systems[link.childIndex];
        const relationship = applyCloudCrossOwnerCausalRelationship({
            parentState: parent.state,
            childState: child.state,
            relation,
            deterministicSeed: hashText(`${parent.state.id}:${child.state.id}`),
            transitionProgress: link.assignment.transitionProgress,
        });
        if (relationship.issues.length > 0 || !relationship.metadata) {
            diagnostics.push(...relationship.issues.map((issue) =>
                `assignment:${child.layerIndex}:${child.systemIndex}:` +
                `${issue.code}:${issue.message}`));
            continue;
        }
        const recompiledParent = recompileRelatedOwner(
            parent,
            relationship.parentState,
            diagnostics,
        );
        const recompiledChild = recompileRelatedOwner(
            child,
            relationship.childState,
            diagnostics,
        );
        if (!recompiledParent || !recompiledChild) continue;
        systems[link.parentIndex] = recompiledParent;
        systems[link.childIndex] = {
            ...recompiledChild,
            ...(recompiledChild.familyProduction ? {
                familyProduction: {
                    ...recompiledChild.familyProduction,
                    causalOrigin: relationship.metadata,
                },
            } : {}),
        };
    }
    return systems;
};

interface IndexedAuthoredSystem {
    readonly system: CloudAuthoredSystemState;
    readonly systemIndex: number;
}

const admissibleAuthoredSystems = (
    scene: CloudScene,
    diagnostics: string[],
): readonly IndexedAuthoredSystem[] => {
    const accepted: IndexedAuthoredSystem[] = [];
    const ids = new Set<string>();
    const counts = [0, 0, 0];
    for (const system of scene.authoredSystems ?? []) {
        const rawLayerIndex = system.layerIndex;
        if (!Number.isInteger(rawLayerIndex) || rawLayerIndex < 0 || rawLayerIndex > 2) {
            diagnostics.push(
                `authored-system:${system.id || "<empty>"}:invalid-layer-index:` +
                "owner is outside the low/middle/high WMO levels",
            );
            continue;
        }
        const layerIndex = rawLayerIndex as CloudLayerIndex;
        const systemIndex = counts[layerIndex]++;
        if (!system.id.trim()) {
            diagnostics.push(
                `authored-system:${layerIndex}:${systemIndex}:empty-system-id:` +
                "persistent owners require a non-empty stable id",
            );
            continue;
        }
        if (ids.has(system.id)) {
            diagnostics.push(
                `authored-system:${system.id}:duplicate-system-id:` +
                "persistent owner ids must be scene-unique",
            );
            continue;
        }
        ids.add(system.id);
        if (systemIndex >= CLOUD_FEATURE_SLOTS_PER_LAYER) {
            diagnostics.push(
                `authored-system:${system.id}:level-owner-budget-exceeded:` +
                `level ${layerIndex} is limited to ${CLOUD_FEATURE_SLOTS_PER_LAYER} finite owners`,
            );
            continue;
        }
        const expectedLevel = layerIndex === 0 ? "low"
            : layerIndex === 1 ? "middle" : "high";
        if (CLOUD_GENUS_LEVEL[system.layer.genus] !== expectedLevel) {
            diagnostics.push(
                `authored-system:${system.id}:genus-level-mismatch:` +
                `${system.layer.genus} cannot occupy ${expectedLevel} owner storage`,
            );
            continue;
        }
        if (!system.layer.present || system.layer.genus === "clear" ||
            system.layer.coverage <= 0.001) {
            diagnostics.push(
                `authored-system:${system.id}:inactive-owner:` +
                "an explicitly authored owner must carry present condensate",
            );
            continue;
        }
        const values = Object.values(system.manifold);
        if (values.length !== 6 || values.some((value) => !Number.isFinite(value)) ||
            system.manifold.majorRadiusKm < 0.2 ||
            system.manifold.minorRadiusKm < 0.2 ||
            system.manifold.boundaryTransitionKm < 0.02) {
            diagnostics.push(
                `authored-system:${system.id}:invalid-finite-manifold:` +
                "center, radii, orientation, and boundary transition must form a finite positive domain",
            );
            continue;
        }
        accepted.push({ system, systemIndex });
    }
    return accepted;
};

const runtimeCache = new Map<string, CloudSystemRuntime>();

/**
 * Compile a scene into stable finite cloud systems. This API cannot observe a
 * camera, canvas, FOV, projection, exposure, or editorial mode by design.
 */
export function createCloudSystemRuntime(scene: CloudScene): CloudSystemRuntime {
    const signature = cloudSystemSceneSignature(scene);
    const cached = runtimeCache.get(signature);
    if (cached) return cached;
    const diagnostics: string[] = [];
    const specialOriginSources = indexSpecialOriginSources(scene, diagnostics);
    const assignments = admissibleMorphologyAssignments(
        scene,
        diagnostics,
        specialOriginSources,
    );
    const morphologyAssignments = indexCloudMorphologyAssignments(
        assignments,
    );
    const ownerSignature = cloudSystemOwnerSignature(scene);
    const authoredSystems = admissibleAuthoredSystems(scene, diagnostics);
    const explicitlyAuthoredLevels = new Set(
        (scene.authoredSystems ?? []).map(({ layerIndex }) => layerIndex),
    );
    const independentlyProducedSystems = ([0, 1, 2] as const).flatMap(
        (layerIndex) => {
            const atLevel = authoredSystems.filter(
                ({ system }) => system.layerIndex === layerIndex,
            );
            const sourceStates: readonly IndexedAuthoredSystem[] = atLevel.length > 0
                ? atLevel
                : explicitlyAuthoredLevels.has(layerIndex) ? []
                    : [{
                        system: {
                            id: "",
                            layerIndex,
                            layer: scene.layers[layerIndex],
                            manifold: {
                                centerEastKm: 0,
                                centerNorthKm: 0,
                                majorRadiusKm: 1,
                                minorRadiusKm: 1,
                                orientation: 0,
                                boundaryTransitionKm: 0.2,
                            },
                        },
                        systemIndex: -1,
                    }];
            return sourceStates.flatMap(({ system, systemIndex }) => {
                const layer = system.layer;
                if (!layer.present || layer.genus === "clear" ||
                    layer.coverage <= 0.001) return [];
                const fallbackSpecies = resolvedSpeciesForLayer(layer);
                const qualification = qualifyCloudLayerFamilyAdmissibility({
                    layer,
                    layerIndex,
                    rendererSpecies: fallbackSpecies,
                });
                const prefix = systemIndex >= 0
                    ? `authored-system:${system.id}` : `layer:${layerIndex}`;
                if (!qualification.legal) {
                    pushFamilyDiagnostics(diagnostics, prefix, qualification.issues);
                    return [];
                }
                return buildLayerSystems(
                    scene,
                    layer,
                    layerIndex,
                    ownerSignature,
                    morphologyAssignments,
                    specialOriginSources,
                    diagnostics,
                    systemIndex >= 0 ? { system, systemIndex } : undefined,
                );
            });
        },
    );
    const causallyLinkedSystems = applyCrossOwnerCausalRelationships(
        independentlyProducedSystems,
        diagnostics,
    );
    const systems = materializeNimbostratusPannusOwners(
        scene,
        causallyLinkedSystems,
        diagnostics,
    );
    // Qualify low weather systems only after all altitude layers and their
    // cross-owner relationships exist. Pannus ownership cannot be established
    // correctly while compiling one layer in isolation.
    for (const qualification of qualifyLowLayeredRuntimePopulation(systems)) {
        if (qualification.valid) continue;
        diagnostics.push(...qualification.violations.map((violation) =>
            `low-layered-runtime:${qualification.representation}:` +
            `${qualification.placement}:${violation}`));
    }
    const admissibleScene = assignments === scene.classifications
        ? scene : { ...scene, classifications: assignments };
    const morphology = createCloudMorphologyCompileRequests(
        admissibleScene,
        systems,
    );
    diagnostics.push(...morphology.diagnostics);
    const packedSystemData = packCloudSystems(systems);
    const legacyFeatureData = packLegacyCloudFeatures(systems);
    const compositionQualifications = ([0, 1, 2] as const).flatMap(
        (layerIndex) => {
            const layer = scene.layers[layerIndex];
            if (!layer.present || layer.genus === "clear" ||
                layer.coverage <= 0.001) return [];
            return [qualifyCloudFrameComposition({
                systems: systems.filter((system) =>
                    system.layerIndex === layerIndex),
                layer,
                layerIndex,
            })];
        },
    );
    const runtime = {
        signature,
        systems,
        diagnostics,
        packedSystemData,
        legacyFeatureData,
        morphologyRequests: morphology.requests,
        morphologyOwnerLayers: morphology.ownerLayers,
        compositionQualifications,
    } satisfies CloudSystemRuntime;
    runtimeCache.set(signature, runtime);
    if (runtimeCache.size > 12) {
        runtimeCache.delete(runtimeCache.keys().next().value as string);
    }
    return runtime;
}

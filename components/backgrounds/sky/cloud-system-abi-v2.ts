import type {
    CloudMacroTopology,
    CloudMaterialModel,
    CloudSystemState,
} from "./cloud-state-map";
import type { CloudSpecies } from "./cloud-scene";
import {
    CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
    cloudStableNumericId,
    type CloudFeatureSampleInput,
    type CloudMaterialClass,
    type CloudVec3,
} from "./cloud-physical-sample";

export const CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION = 2 as const;
export const CLOUD_OWNER_RECORD_V2_FLOATS = 32 as const;
export const CLOUD_OWNER_RECORD_V2_UINTS = 8 as const;
export const CLOUD_FEATURE_RECORD_V2_FLOATS = 24 as const;
export const CLOUD_FEATURE_RECORD_V2_UINTS = 8 as const;

export type CloudLifecycleEventKind =
    | "birth"
    | "growth"
    | "merge"
    | "split"
    | "glaciation"
    | "precipitation-onset"
    | "feature-attach"
    | "feature-detach"
    | "decay"
    | "death";

export interface CloudOwnerRecordV2 {
    ownerId: number;
    sourceId: string;
    recipeId: Exclude<CloudSpecies, "generic">;
    macroTopology: CloudMacroTopology;
    materialModel: CloudMaterialModel;
    physicalFoundationAdapter: string;
    atlasRepresentation: string;
    centerKm: CloudVec3;
    horizontalRadiusKm: CloudVec3;
    baseAltitudeKm: number;
    geometricDepthKm: number;
    boundaryTransitionKm: number;
    orientationRadians: number;
    velocityKmPerSecond: CloudVec3;
    liquidWaterPathGramsPerSquareMetre: number;
    iceWaterPathGramsPerSquareMetre: number;
    liquidEffectiveRadiusMicrons: number;
    iceEffectiveRadiusMicrons: number;
    baseTemperatureKelvin: number;
    topTemperatureKelvin: number;
    relativeHumidity01: number;
    turbulenceDissipation: number;
    lifecycleAgeSeconds: number;
    lifecycleProgress01: number;
    precipitationRate: number;
    featureStart: number;
    featureCount: number;
    generation: number;
}

export interface CloudFeatureRecordV2 extends CloudFeatureSampleInput {
    featureId: number;
    parentOwnerNumericId: number;
    kind: string;
    attachmentKm: CloudVec3;
    scaleKm: CloudVec3;
    orientationRadians: number;
    lifecycleProgress01: number;
    active: boolean;
    generation: number;
    materialClass: CloudMaterialClass;
}

export interface CloudLifecycleEventV2 {
    id: string;
    step: number;
    simulationTimeSeconds: number;
    kind: CloudLifecycleEventKind;
    ownerIds: readonly number[];
    featureIds: readonly number[];
    parentEventIds: readonly string[];
    payload: Readonly<Record<string, number | string | boolean>>;
}

export interface CompiledCloudSystemV2 {
    schemaVersion: typeof CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION;
    physicalSampleSchemaVersion: typeof CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION;
    owner: CloudOwnerRecordV2;
    features: readonly CloudFeatureRecordV2[];
    events: readonly CloudLifecycleEventV2[];
}

export interface CompileCloudSystemV2Input {
    state: CloudSystemState;
    recipeId: Exclude<CloudSpecies, "generic">;
    macroTopology: CloudMacroTopology;
    materialModel: CloudMaterialModel;
    physicalFoundationAdapter: string;
    atlasRepresentation: string;
    features?: readonly Omit<CloudFeatureRecordV2,
        "featureId" | "parentOwnerNumericId">[];
    events?: readonly CloudLifecycleEventV2[];
    generation?: number;
}

export interface LegacyCompiledCloudSystemLike {
    sourceId: string;
    recipeId: Exclude<CloudSpecies, "generic">;
    macroTopology: CloudMacroTopology;
    materialModel: CloudMaterialModel;
}

export interface CloudSystemAbiIssue {
    code: string;
    subject: string;
    message: string;
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));

const velocityFor = (state: CloudSystemState): CloudVec3 => {
    const kinematics = state.physical.kinematics;
    const speed = Math.max(0, kinematics.windSpeed) / 1_000;
    return [
        Math.sin(kinematics.windDirection) * speed,
        state.physical.thermodynamics.verticalVelocity / 1_000,
        Math.cos(kinematics.windDirection) * speed,
    ];
};

export const compileCloudSystemV2 = (
    input: CompileCloudSystemV2Input,
): CompiledCloudSystemV2 => {
    const ownerId = cloudStableNumericId(input.state.id);
    const features = (input.features ?? []).map((feature, index) => ({
        ...feature,
        id: feature.id || `${input.state.id}:feature:${index}`,
        featureId: cloudStableNumericId(
            feature.id || `${input.state.id}:feature:${index}`,
        ),
        parentOwnerId: input.state.id,
        parentOwnerNumericId: ownerId,
    }));
    const physical = input.state.physical;
    const owner: CloudOwnerRecordV2 = {
        ownerId,
        sourceId: input.state.id,
        recipeId: input.recipeId,
        macroTopology: input.macroTopology,
        materialModel: input.materialModel,
        physicalFoundationAdapter: input.physicalFoundationAdapter,
        atlasRepresentation: input.atlasRepresentation,
        centerKm: [
            input.state.extent.centerEastKm,
            physical.baseAltitudeKm + physical.geometricDepthKm * 0.5,
            input.state.extent.centerNorthKm,
        ],
        horizontalRadiusKm: [
            input.state.extent.majorRadiusKm,
            physical.geometricDepthKm * 0.5,
            input.state.extent.minorRadiusKm,
        ],
        baseAltitudeKm: physical.baseAltitudeKm,
        geometricDepthKm: physical.geometricDepthKm,
        boundaryTransitionKm: input.state.extent.boundaryTransitionKm,
        orientationRadians: input.state.extent.orientation,
        velocityKmPerSecond: velocityFor(input.state),
        liquidWaterPathGramsPerSquareMetre:
            physical.condensate.liquidWaterPath,
        iceWaterPathGramsPerSquareMetre: physical.condensate.iceWaterPath,
        liquidEffectiveRadiusMicrons:
            physical.condensate.dropletEffectiveRadius,
        iceEffectiveRadiusMicrons: physical.condensate.iceEffectiveRadius,
        baseTemperatureKelvin: physical.thermodynamics.baseTemperatureKelvin,
        topTemperatureKelvin: physical.thermodynamics.topTemperatureKelvin,
        relativeHumidity01: clamp(physical.thermodynamics.relativeHumidity),
        turbulenceDissipation: Math.max(
            0,
            physical.kinematics.turbulenceDissipation,
        ),
        lifecycleAgeSeconds: Math.max(0, input.state.lifecycle.ageSeconds),
        lifecycleProgress01: clamp(input.state.lifecycle.stageProgress),
        precipitationRate: Math.max(0, physical.precipitation.rate),
        featureStart: 0,
        featureCount: features.length,
        generation: Math.max(0, Math.trunc(input.generation ?? 0)),
    };
    return {
        schemaVersion: CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION,
        physicalSampleSchemaVersion: CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
        owner,
        features,
        events: [...(input.events ?? [])],
    };
};

export const migrateCompiledCloudSystemV1 = (
    legacy: LegacyCompiledCloudSystemLike,
    state: CloudSystemState,
    options?: {
        physicalFoundationAdapter?: string;
        atlasRepresentation?: string;
    },
) => compileCloudSystemV2({
    state: { ...state, id: legacy.sourceId || state.id },
    recipeId: legacy.recipeId,
    macroTopology: legacy.macroTopology,
    materialModel: legacy.materialModel,
    physicalFoundationAdapter: options?.physicalFoundationAdapter ??
        "legacy-v1-adapter",
    atlasRepresentation: options?.atlasRepresentation ?? legacy.recipeId,
});

export const validateCompiledCloudSystemV2 = (
    compiled: CompiledCloudSystemV2,
): readonly CloudSystemAbiIssue[] => {
    const issues: CloudSystemAbiIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });

    if (compiled.schemaVersion !== CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION) {
        issue("unsupported-schema", "system",
            `Expected ABI ${CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION}.`);
    }
    if (compiled.physicalSampleSchemaVersion !==
        CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION) {
        issue("sample-schema-mismatch", "system",
            "Compiled owner and physical sample schemas disagree.");
    }
    if (!compiled.owner.ownerId || !compiled.owner.sourceId) {
        issue("missing-owner-identity", "owner",
            "Every compiled owner needs stable string and numeric identities.");
    }
    if (compiled.owner.featureStart !== 0 ||
        compiled.owner.featureCount !== compiled.features.length) {
        issue("feature-range-mismatch", "owner",
            "Owner feature range must cover the separate feature buffer.");
    }
    const featureIds = new Set<number>();
    for (const feature of compiled.features) {
        if (feature.parentOwnerId !== compiled.owner.sourceId ||
            feature.parentOwnerNumericId !== compiled.owner.ownerId) {
            issue("detached-feature", feature.id,
                "Feature ownership must match the compiled parent owner.");
        }
        if (featureIds.has(feature.featureId)) {
            issue("duplicate-feature-id", feature.id,
                "Feature numeric IDs must be unique within an owner.");
        }
        featureIds.add(feature.featureId);
    }
    for (const event of compiled.events) {
        if (!Number.isInteger(event.step) || event.step < 0 ||
            !Number.isFinite(event.simulationTimeSeconds) ||
            event.simulationTimeSeconds < 0) {
            issue("invalid-event-clock", event.id,
                "Lifecycle events need a finite non-negative step and time.");
        }
        if (event.ownerIds.length === 0 && event.featureIds.length === 0) {
            issue("unowned-event", event.id,
                "Lifecycle events must reference an owner or feature.");
        }
    }
    return issues;
};

const materialModelCode = (value: CloudMaterialModel): number => [
    "fibrous-ice",
    "granular-ice",
    "mixed-phase-cellular",
    "liquid-cellular",
    "mixed-phase-sheet",
    "liquid-sheet",
    "liquid-convective",
    "deep-mixed-phase",
].indexOf(value) + 1;

const topologyCode = (value: CloudMacroTopology): number => [
    "ice-streamer-field",
    "cellular-cloudlet-field",
    "layered-veil",
    "wave-lens-train",
    "castellated-deck",
    "floccus-field",
    "precipitating-sheet",
    "boundary-layer-sheet",
    "fragment-field",
    "thermal-field",
    "deep-storm-complex",
    "roll-tube",
].indexOf(value) + 1;

export interface PackedCloudSystemV2 {
    ownerFloats: Float32Array;
    ownerUints: Uint32Array;
    featureFloats: Float32Array;
    featureUints: Uint32Array;
    events: readonly CloudLifecycleEventV2[];
}

export const packCloudSystemV2 = (
    compiled: CompiledCloudSystemV2,
): PackedCloudSystemV2 => {
    const owner = compiled.owner;
    const ownerFloats = new Float32Array(CLOUD_OWNER_RECORD_V2_FLOATS);
    ownerFloats.set([
        ...owner.centerKm,
        ...owner.horizontalRadiusKm,
        owner.baseAltitudeKm,
        owner.geometricDepthKm,
        owner.boundaryTransitionKm,
        owner.orientationRadians,
        ...owner.velocityKmPerSecond,
        owner.liquidWaterPathGramsPerSquareMetre,
        owner.iceWaterPathGramsPerSquareMetre,
        owner.liquidEffectiveRadiusMicrons,
        owner.iceEffectiveRadiusMicrons,
        owner.baseTemperatureKelvin,
        owner.topTemperatureKelvin,
        owner.relativeHumidity01,
        owner.turbulenceDissipation,
        owner.lifecycleAgeSeconds,
        owner.lifecycleProgress01,
        owner.precipitationRate,
    ]);
    const ownerUints = new Uint32Array(CLOUD_OWNER_RECORD_V2_UINTS);
    ownerUints.set([
        compiled.schemaVersion,
        compiled.physicalSampleSchemaVersion,
        owner.ownerId,
        topologyCode(owner.macroTopology),
        materialModelCode(owner.materialModel),
        owner.featureStart,
        owner.featureCount,
        owner.generation,
    ]);

    const featureFloats = new Float32Array(
        compiled.features.length * CLOUD_FEATURE_RECORD_V2_FLOATS,
    );
    const featureUints = new Uint32Array(
        compiled.features.length * CLOUD_FEATURE_RECORD_V2_UINTS,
    );
    compiled.features.forEach((feature, index) => {
        const floatOffset = index * CLOUD_FEATURE_RECORD_V2_FLOATS;
        featureFloats.set([
            ...feature.attachmentKm,
            ...feature.scaleKm,
            feature.orientationRadians,
            feature.lifecycleProgress01,
            feature.densityMultiplier ?? 1,
            feature.liquidMultiplier ?? 1,
            feature.iceMultiplier ?? 1,
            feature.precipitationMultiplier ?? 1,
            ...(feature.velocityOffsetKmPerSecond ?? [0, 0, 0]),
            feature.ageOffsetSeconds ?? 0,
        ], floatOffset);
        const uintOffset = index * CLOUD_FEATURE_RECORD_V2_UINTS;
        featureUints.set([
            feature.featureId,
            feature.parentOwnerNumericId,
            feature.active ? 1 : 0,
            feature.generation,
            cloudStableNumericId(feature.kind),
            cloudStableNumericId(feature.materialClass),
            0,
            0,
        ], uintOffset);
    });
    return {
        ownerFloats,
        ownerUints,
        featureFloats,
        featureUints,
        events: compiled.events,
    };
};

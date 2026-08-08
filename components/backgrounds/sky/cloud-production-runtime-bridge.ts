import {
    compileCloudProductionFrameV1,
    type CloudProductionFrameV1,
} from "./cloud-production-frame";
import {
    createCloudProductionGpuUploadPlanV1,
    type CloudProductionGpuAuxiliaryCapacities,
    type CloudProductionGpuUploadPlanV1,
} from "./cloud-production-gpu-runtime";
import type { CloudProductionBufferCapacities } from
    "./cloud-production-buffers";
import {
    compileCloudSystemV2,
    validateCompiledCloudSystemV2,
    type CloudFeatureRecordV2,
    type CloudLifecycleEventV2,
    type CompiledCloudSystemV2,
} from "./cloud-system-abi-v2";
import type {
    CloudSystemRuntime,
    RuntimeCloudSystem,
} from "./cloud-system-runtime";

export type CloudRuntimeFeatureResolver = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    runtime: CloudSystemRuntime,
) => readonly Omit<CloudFeatureRecordV2,
    "featureId" | "parentOwnerNumericId">[];

export type CloudRuntimeEventResolver = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    runtime: CloudSystemRuntime,
) => readonly CloudLifecycleEventV2[];

export type CloudRuntimeGenerationResolver = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    runtime: CloudSystemRuntime,
) => number;

export interface CompileCloudSystemRuntimeProductionInput {
    runtime: CloudSystemRuntime;
    frameIndex: number;
    simulationTimeSeconds: number;
    previousFrame?: CloudProductionFrameV1 | null;
    bufferCapacities?: Partial<CloudProductionBufferCapacities>;
    gpuCapacities?: Partial<CloudProductionGpuAuxiliaryCapacities>;
    featureResolver?: CloudRuntimeFeatureResolver;
    eventResolver?: CloudRuntimeEventResolver;
    generationResolver?: CloudRuntimeGenerationResolver;
    /**
     * True only after every semantically occupied legacy feature slot has an
     * equivalent V2 child record. A resolver alone does not prove completeness.
     */
    legacyFeaturesFullyMigrated?: boolean;
}

export interface CloudRuntimeProductionMigrationSummary {
    runtimeOwners: number;
    v2Owners: number;
    migratedFeatures: number;
    migratedEvents: number;
    legacyFeatureSignalCount: number;
    pendingLegacyFeatureMigration: boolean;
    rendererMigrationComplete: boolean;
}

export interface CloudRuntimeProductionBridgeResult {
    schemaVersion: 1;
    systemsV2: readonly CompiledCloudSystemV2[];
    frame: CloudProductionFrameV1;
    uploadPlan: CloudProductionGpuUploadPlanV1;
    migration: CloudRuntimeProductionMigrationSummary;
    diagnostics: readonly string[];
    productionReady: boolean;
}

const nonZeroSignalCount = (values: Float32Array) => {
    let count = 0;
    for (const value of values) {
        if (Number.isFinite(value) && Math.abs(value) > 1e-8) count += 1;
    }
    return count;
};

export const runtimeCloudSystemToV2 = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    runtime: CloudSystemRuntime,
    options?: Pick<CompileCloudSystemRuntimeProductionInput,
        "featureResolver" | "eventResolver" | "generationResolver">,
): CompiledCloudSystemV2 => compileCloudSystemV2({
    state: system.state,
    recipeId: system.compiled.recipeId,
    macroTopology: system.compiled.macroTopology,
    materialModel: system.compiled.materialModel,
    physicalFoundationAdapter: "cloud-system-runtime-v1-bridge",
    atlasRepresentation: system.compiled.recipeId,
    features: options?.featureResolver?.(system, ownerIndex, runtime) ?? [],
    events: options?.eventResolver?.(system, ownerIndex, runtime) ?? [],
    generation: Math.max(
        0,
        Math.trunc(options?.generationResolver?.(
            system,
            ownerIndex,
            runtime,
        ) ?? 0),
    ),
});

export const compileCloudSystemRuntimeProductionV1 = (
    input: CompileCloudSystemRuntimeProductionInput,
): CloudRuntimeProductionBridgeResult => {
    const systemsV2 = input.runtime.systems.map((system, ownerIndex) =>
        runtimeCloudSystemToV2(system, ownerIndex, input.runtime, input));
    const diagnostics = [...input.runtime.diagnostics];
    for (const system of systemsV2) {
        for (const issue of validateCompiledCloudSystemV2(system)) {
            diagnostics.push(
                `v2:${system.owner.sourceId}:${issue.code}:${issue.message}`,
            );
        }
    }
    const frame = compileCloudProductionFrameV1({
        systems: systemsV2,
        frameIndex: input.frameIndex,
        simulationTimeSeconds: input.simulationTimeSeconds,
        previousFrame: input.previousFrame,
        capacities: input.bufferCapacities,
    });
    const uploadPlan = createCloudProductionGpuUploadPlanV1(
        frame,
        input.gpuCapacities,
    );
    const legacyFeatureSignalCount = nonZeroSignalCount(
        input.runtime.legacyFeatureData,
    );
    const migratedFeatures = systemsV2.reduce((sum, system) =>
        sum + system.features.length, 0);
    const migratedEvents = systemsV2.reduce((sum, system) =>
        sum + system.events.length, 0);
    const pendingLegacyFeatureMigration = legacyFeatureSignalCount > 0 &&
        input.legacyFeaturesFullyMigrated !== true;
    if (pendingLegacyFeatureMigration) {
        diagnostics.push(
            "v2:legacy-feature-data remains semantically occupied; " +
            "set legacyFeaturesFullyMigrated only after parity evidence passes.",
        );
    }
    const rendererMigrationComplete =
        !pendingLegacyFeatureMigration && frame.issues.length === 0 &&
        uploadPlan.complete;
    return {
        schemaVersion: 1,
        systemsV2,
        frame,
        uploadPlan,
        migration: {
            runtimeOwners: input.runtime.systems.length,
            v2Owners: systemsV2.length,
            migratedFeatures,
            migratedEvents,
            legacyFeatureSignalCount,
            pendingLegacyFeatureMigration,
            rendererMigrationComplete,
        },
        diagnostics,
        productionReady: rendererMigrationComplete && diagnostics.length === 0,
    };
};

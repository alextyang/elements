import {
    migrateCompiledCloudSystemV1,
    validateCompiledCloudSystemV2,
    type CompiledCloudSystemV2,
} from "./cloud-system-abi-v2";
import {
    compileCloudProductionFrameV1,
    type CloudProductionFrameV1,
} from "./cloud-production-frame";
import type {
    CloudSystemRuntime,
    RuntimeCloudSystem,
} from "./cloud-system-runtime";
import type { CloudProductionBufferCapacities } from
    "./cloud-production-buffers";

export type CloudRuntimeV2AdapterSeverity = "warning" | "error";

export interface CloudRuntimeV2AdapterIssue {
    code: string;
    severity: CloudRuntimeV2AdapterSeverity;
    subject: string;
    message: string;
}

export interface CloudRuntimeV2AdapterResult {
    schemaVersion: 1;
    runtimeSignature: string;
    systemsV2: readonly CompiledCloudSystemV2[];
    issues: readonly CloudRuntimeV2AdapterIssue[];
    complete: boolean;
    productionReady: boolean;
    legacyMorphologyAssignments: number;
}

export interface CloudRuntimeV2ShadowFrameResult extends
    CloudRuntimeV2AdapterResult {
    frame: CloudProductionFrameV1;
}

const physicalFoundationAdapterFor = (
    system: RuntimeCloudSystem,
): string => system.familyProduction
    ? "legacy-runtime-family-production"
    : "legacy-runtime-recipe";

const atlasRepresentationFor = (
    system: RuntimeCloudSystem,
): string => `${system.compiled.recipeId}:variant-` +
    `${Math.max(0, Math.trunc(system.atlasDeterministicVariant))}`;

export const adaptRuntimeCloudSystemV2 = (
    system: RuntimeCloudSystem,
): CompiledCloudSystemV2 => migrateCompiledCloudSystemV1(
    system.compiled,
    system.state,
    {
        physicalFoundationAdapter: physicalFoundationAdapterFor(system),
        atlasRepresentation: atlasRepresentationFor(system),
    },
);

/**
 * Converts the shipping runtime's stable finite owners into V2 shadow records.
 * Existing morphology modifiers remain observable migration warnings rather
 * than being silently dropped and called production-ready.
 */
export const adaptCloudSystemRuntimeV2 = (
    runtime: CloudSystemRuntime,
): CloudRuntimeV2AdapterResult => {
    const issues: CloudRuntimeV2AdapterIssue[] = runtime.diagnostics.map(
        (message, index) => ({
            code: "legacy-runtime-diagnostic",
            severity: "warning",
            subject: `runtime:${index}`,
            message,
        }),
    );
    const systemsV2 = runtime.systems.map((system) => {
        const migrated = adaptRuntimeCloudSystemV2(system);
        for (const issue of validateCompiledCloudSystemV2(migrated)) {
            issues.push({
                code: issue.code,
                severity: "error",
                subject: `${system.state.id}:${issue.subject}`,
                message: issue.message,
            });
        }
        if (system.morphologyAssignment) {
            issues.push({
                code: "legacy-morphology-buffer-required",
                severity: "warning",
                subject: system.state.id,
                message: "The owner still depends on the legacy morphology modifier buffer; V2 shadow migration cannot claim feature completeness.",
            });
        }
        return migrated;
    });
    const ownerIds = new Map<number, string>();
    for (const system of systemsV2) {
        const previous = ownerIds.get(system.owner.ownerId);
        if (previous) {
            issues.push({
                code: "duplicate-owner-id",
                severity: "error",
                subject: system.owner.sourceId,
                message: `Owner numeric identity collides with ${previous}.`,
            });
        } else {
            ownerIds.set(system.owner.ownerId, system.owner.sourceId);
        }
    }
    const legacyMorphologyAssignments = runtime.systems.filter(
        ({ morphologyAssignment }) => Boolean(morphologyAssignment),
    ).length;
    const complete = !issues.some(({ severity }) => severity === "error");
    return {
        schemaVersion: 1,
        runtimeSignature: runtime.signature,
        systemsV2,
        issues,
        complete,
        productionReady: complete && legacyMorphologyAssignments === 0,
        legacyMorphologyAssignments,
    };
};

export const compileCloudRuntimeV2ShadowFrame = (
    runtime: CloudSystemRuntime,
    input: {
        frameIndex: number;
        simulationTimeSeconds: number;
        previousFrame?: CloudProductionFrameV1 | null;
        capacities?: Partial<CloudProductionBufferCapacities>;
    },
): CloudRuntimeV2ShadowFrameResult => {
    const adapted = adaptCloudSystemRuntimeV2(runtime);
    const frame = compileCloudProductionFrameV1({
        systems: adapted.systemsV2,
        frameIndex: input.frameIndex,
        simulationTimeSeconds: input.simulationTimeSeconds,
        previousFrame: input.previousFrame,
        capacities: input.capacities ?? {
            owners: 36,
            features: 256,
            events: 1_024,
            eventReferences: 8_192,
        },
    });
    const frameIssues = frame.issues.map((issue) => ({
        code: issue.code,
        severity: "error" as const,
        subject: `${issue.domain}:${issue.subject}`,
        message: issue.message,
    }));
    const issues = [...adapted.issues, ...frameIssues];
    const complete = adapted.complete && frameIssues.length === 0;
    return {
        ...adapted,
        issues,
        complete,
        productionReady: complete &&
            adapted.legacyMorphologyAssignments === 0 &&
            frame.buffers.droppedOwners === 0 &&
            frame.buffers.droppedFeatures === 0 &&
            frame.buffers.droppedEvents === 0 &&
            frame.buffers.droppedEventReferences === 0,
        frame,
    };
};

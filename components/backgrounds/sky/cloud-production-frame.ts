import {
    buildCloudProductionBuffersV1,
    validateCloudProductionBuffersV1,
    type CloudProductionBufferCapacities,
    type CloudProductionBuffersV1,
} from "./cloud-production-buffers";
import {
    buildCloudOwnerSpatialIndexV1,
    validateCloudOwnerSpatialIndexV1,
    type CloudOwnerSpatialIndexV1,
} from "./cloud-owner-spatial-index";
import {
    buildCloudTemporalReconstructionPlanV1,
    validateCloudTemporalReconstructionPlanV1,
    type CloudTemporalReconstructionPlanV1,
} from "./cloud-temporal-reconstruction";
import type { CompiledCloudSystemV2 } from "./cloud-system-abi-v2";

export interface CloudProductionFrameIssue {
    domain: "buffers" | "spatial-index" | "temporal";
    code: string;
    subject: string;
    message: string;
}

export interface CloudProductionFrameV1 {
    schemaVersion: 1;
    frameIndex: number;
    simulationTimeSeconds: number;
    systems: readonly CompiledCloudSystemV2[];
    buffers: CloudProductionBuffersV1;
    spatialIndex: CloudOwnerSpatialIndexV1;
    temporal: CloudTemporalReconstructionPlanV1;
    issues: readonly CloudProductionFrameIssue[];
    fingerprint: string;
}

export interface CompileCloudProductionFrameInput {
    systems: readonly CompiledCloudSystemV2[];
    frameIndex: number;
    simulationTimeSeconds: number;
    previousFrame?: CloudProductionFrameV1 | null;
    capacities?: Partial<CloudProductionBufferCapacities>;
    spatialIndex?: {
        cellSizeKm?: number;
        maximumOwnersPerCell?: number;
        maximumCellsPerOwner?: number;
    };
}

const issuesFor = (
    domain: CloudProductionFrameIssue["domain"],
    issues: readonly { code: string; subject: string; message: string }[],
): readonly CloudProductionFrameIssue[] => issues.map((issue) => ({
    domain,
    ...issue,
}));

export const compileCloudProductionFrameV1 = (
    input: CompileCloudProductionFrameInput,
): CloudProductionFrameV1 => {
    const frameIndex = Number.isFinite(input.frameIndex)
        ? Math.max(0, Math.trunc(input.frameIndex)) : 0;
    const simulationTimeSeconds = Number.isFinite(input.simulationTimeSeconds)
        ? Math.max(0, input.simulationTimeSeconds) : 0;
    const buffers = buildCloudProductionBuffersV1(
        input.systems,
        input.capacities,
    );
    const systemsByOwner = new Map(input.systems.map((system) => [
        system.owner.ownerId,
        system,
    ]));
    const includedSystems = buffers.ownerOffsets.flatMap(({ ownerId }) => {
        const system = systemsByOwner.get(ownerId);
        return system ? [system] : [];
    });
    const spatialIndex = buildCloudOwnerSpatialIndexV1(
        includedSystems,
        input.spatialIndex,
    );
    const temporal = buildCloudTemporalReconstructionPlanV1(
        input.previousFrame?.systems ?? null,
        includedSystems,
        input.previousFrame?.simulationTimeSeconds ?? simulationTimeSeconds,
        simulationTimeSeconds,
    );
    const issues = [
        ...issuesFor("buffers", validateCloudProductionBuffersV1(buffers)),
        ...issuesFor(
            "spatial-index",
            validateCloudOwnerSpatialIndexV1(spatialIndex),
        ),
        ...issuesFor(
            "temporal",
            validateCloudTemporalReconstructionPlanV1(temporal),
        ),
    ];
    return {
        schemaVersion: 1,
        frameIndex,
        simulationTimeSeconds,
        systems: includedSystems,
        buffers,
        spatialIndex,
        temporal,
        issues,
        fingerprint: `${buffers.fingerprint}:${temporal.historyToken}`,
    };
};

export interface CloudProductionFrameSummaryV1 {
    schemaVersion: 1;
    frameIndex: number;
    simulationTimeSeconds: number;
    fingerprint: string;
    counts: {
        owners: number;
        features: number;
        events: number;
        spatialCells: number;
        historyDecisions: number;
        issues: number;
    };
    dropped: {
        owners: number;
        features: number;
        events: number;
        eventReferences: number;
        spatialMemberships: number;
    };
    history: {
        globalReset: boolean;
        reused: number;
        attenuated: number;
        invalidated: number;
        created: number;
        retired: number;
    };
    issues: readonly CloudProductionFrameIssue[];
}

export const cloudProductionFrameSummaryV1 = (
    frame: CloudProductionFrameV1,
): CloudProductionFrameSummaryV1 => {
    const actions = (action: string) => frame.temporal.decisions.filter(
        (decision) => decision.action === action,
    ).length;
    return {
        schemaVersion: 1,
        frameIndex: frame.frameIndex,
        simulationTimeSeconds: frame.simulationTimeSeconds,
        fingerprint: frame.fingerprint,
        counts: {
            owners: frame.buffers.ownerCount,
            features: frame.buffers.featureCount,
            events: frame.buffers.eventCount,
            spatialCells: frame.spatialIndex.cells.size,
            historyDecisions: frame.temporal.decisions.length,
            issues: frame.issues.length,
        },
        dropped: {
            owners: frame.buffers.droppedOwners,
            features: frame.buffers.droppedFeatures,
            events: frame.buffers.droppedEvents,
            eventReferences: frame.buffers.droppedEventReferences,
            spatialMemberships: frame.spatialIndex.droppedMemberships,
        },
        history: {
            globalReset: frame.temporal.globalReset,
            reused: actions("reuse"),
            attenuated: actions("attenuate"),
            invalidated: actions("invalidate"),
            created: actions("new"),
            retired: actions("retire"),
        },
        issues: frame.issues,
    };
};

const numberArray = (value: Float32Array | Uint32Array) => Array.from(value);

/**
 * Explicit diagnostic serialization. Production callers should upload typed
 * arrays directly; the JSON form is bounded and opt-in for API inspection.
 */
export const serializeCloudProductionFrameV1 = (
    frame: CloudProductionFrameV1,
    includeBuffers = false,
) => ({
    ...cloudProductionFrameSummaryV1(frame),
    ...(includeBuffers ? {
        buffers: {
            headerUints: numberArray(frame.buffers.headerUints),
            ownerFloats: numberArray(frame.buffers.ownerFloats),
            ownerUints: numberArray(frame.buffers.ownerUints),
            featureFloats: numberArray(frame.buffers.featureFloats),
            featureUints: numberArray(frame.buffers.featureUints),
            eventFloats: numberArray(frame.buffers.eventFloats),
            eventUints: numberArray(frame.buffers.eventUints),
            eventReferenceUints: numberArray(
                frame.buffers.eventReferenceUints,
            ),
        },
    } : {}),
});

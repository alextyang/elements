import {
    CLOUD_EVENT_RECORD_FLOATS,
    CLOUD_EVENT_RECORD_UINTS,
    CLOUD_PRODUCTION_BUFFERS_WGSL,
    type CloudProductionBuffersV1,
} from "./cloud-production-buffers";
import type { CloudOwnerSpatialIndexV1 } from "./cloud-owner-spatial-index";
import type { CloudProductionFrameV1 } from "./cloud-production-frame";
import type {
    CloudHistoryAction,
    CloudHistoryReason,
    CloudTemporalReconstructionPlanV1,
} from "./cloud-temporal-reconstruction";

export const CLOUD_PRODUCTION_GPU_SCHEMA_VERSION = 1 as const;
export const CLOUD_SPATIAL_CELL_RECORD_INTS = 4 as const;
export const CLOUD_TEMPORAL_DECISION_UINTS = 8 as const;
export const CLOUD_TEMPORAL_DECISION_FLOATS = 4 as const;

/** WebGPU numeric flags: COPY_DST | STORAGE. */
export const CLOUD_PRODUCTION_STORAGE_BUFFER_USAGE = 0x0008 | 0x0080;

export const CLOUD_PRODUCTION_GPU_BINDINGS = Object.freeze({
    headerUints: 0,
    ownerFloats: 1,
    ownerUints: 2,
    featureFloats: 3,
    featureUints: 4,
    eventFloats: 5,
    eventUints: 6,
    eventReferenceUints: 7,
    spatialHeaderUints: 8,
    spatialCellInts: 9,
    spatialOwnerReferences: 10,
    temporalHeaderUints: 11,
    temporalHeaderFloats: 12,
    temporalDecisionUints: 13,
    temporalDecisionFloats: 14,
} as const);

export interface CloudProductionGpuAuxiliaryCapacities {
    spatialCells: number;
    spatialOwnerReferences: number;
    temporalDecisions: number;
}

export const DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES:
CloudProductionGpuAuxiliaryCapacities = Object.freeze({
    spatialCells: 8_192,
    spatialOwnerReferences: 65_536,
    temporalDecisions: 128,
});

export interface CloudProductionGpuIssue {
    code: string;
    subject: string;
    message: string;
}

export interface PackedCloudSpatialIndexGpuV1 {
    headerUints: Uint32Array;
    cellInts: Int32Array;
    ownerReferenceUints: Uint32Array;
    cellCount: number;
    ownerReferenceCount: number;
    droppedCells: number;
    droppedOwnerReferences: number;
}

export interface PackedCloudTemporalPlanGpuV1 {
    headerUints: Uint32Array;
    headerFloats: Float32Array;
    decisionUints: Uint32Array;
    decisionFloats: Float32Array;
    decisionCount: number;
    droppedDecisions: number;
}

export interface CloudProductionGpuUploadPlanV1 {
    schemaVersion: typeof CLOUD_PRODUCTION_GPU_SCHEMA_VERSION;
    frameFingerprint: string;
    production: CloudProductionBuffersV1;
    spatial: PackedCloudSpatialIndexGpuV1;
    temporal: PackedCloudTemporalPlanGpuV1;
    complete: boolean;
    issues: readonly CloudProductionGpuIssue[];
}

const positiveInteger = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

const normalizedAuxiliaryCapacities = (
    value?: Partial<CloudProductionGpuAuxiliaryCapacities>,
): CloudProductionGpuAuxiliaryCapacities => ({
    spatialCells: positiveInteger(
        value?.spatialCells ??
            DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES.spatialCells,
        DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES.spatialCells,
    ),
    spatialOwnerReferences: positiveInteger(
        value?.spatialOwnerReferences ??
            DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES
                .spatialOwnerReferences,
        DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES
            .spatialOwnerReferences,
    ),
    temporalDecisions: positiveInteger(
        value?.temporalDecisions ??
            DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES.temporalDecisions,
        DEFAULT_CLOUD_PRODUCTION_GPU_AUXILIARY_CAPACITIES.temporalDecisions,
    ),
});

export const packCloudSpatialIndexGpuV1 = (
    index: CloudOwnerSpatialIndexV1,
    requested?: Partial<CloudProductionGpuAuxiliaryCapacities>,
): PackedCloudSpatialIndexGpuV1 => {
    const capacities = normalizedAuxiliaryCapacities(requested);
    const cells = [...index.cells.values()].sort((left, right) =>
        left.z - right.z || left.x - right.x);
    const selectedCells = cells.slice(0, capacities.spatialCells);
    const cellInts = new Int32Array(
        capacities.spatialCells * CLOUD_SPATIAL_CELL_RECORD_INTS,
    );
    const ownerReferenceUints = new Uint32Array(
        capacities.spatialOwnerReferences,
    );
    let ownerReferenceCount = 0;
    let droppedOwnerReferences = 0;
    let populatedCells = 0;

    for (const cell of selectedCells) {
        const available = Math.max(
            0,
            capacities.spatialOwnerReferences - ownerReferenceCount,
        );
        const references = cell.ownerIndices.slice(0, available);
        droppedOwnerReferences += cell.ownerIndices.length - references.length;
        const offset = populatedCells * CLOUD_SPATIAL_CELL_RECORD_INTS;
        cellInts.set([
            cell.x,
            cell.z,
            ownerReferenceCount,
            references.length,
        ], offset);
        ownerReferenceUints.set(references, ownerReferenceCount);
        ownerReferenceCount += references.length;
        populatedCells += 1;
        if (ownerReferenceCount >= capacities.spatialOwnerReferences) break;
    }
    const droppedCells = cells.length - populatedCells;
    const headerUints = new Uint32Array([
        CLOUD_PRODUCTION_GPU_SCHEMA_VERSION,
        populatedCells,
        ownerReferenceCount,
        droppedCells,
        droppedOwnerReferences + index.droppedMemberships,
        capacities.spatialCells,
        capacities.spatialOwnerReferences,
        0,
    ]);
    return {
        headerUints,
        cellInts,
        ownerReferenceUints,
        cellCount: populatedCells,
        ownerReferenceCount,
        droppedCells,
        droppedOwnerReferences: droppedOwnerReferences +
            index.droppedMemberships,
    };
};

const ACTION_CODE: Record<CloudHistoryAction, number> = {
    reuse: 1,
    attenuate: 2,
    invalidate: 3,
    new: 4,
    retire: 5,
};

const REASON_BIT: Record<CloudHistoryReason, number> = {
    "new-owner": 1 << 0,
    "retired-owner": 1 << 1,
    "schema-change": 1 << 2,
    "generation-change": 1 << 3,
    "topology-change": 1 << 4,
    "material-change": 1 << 5,
    "recipe-change": 1 << 6,
    "age-regression": 1 << 7,
    "unexpected-displacement": 1 << 8,
    "extent-change": 1 << 9,
    "condensate-change": 1 << 10,
    "phase-change": 1 << 11,
    "feature-set-change": 1 << 12,
    "critical-lifecycle-event": 1 << 13,
    "optical-lifecycle-event": 1 << 14,
};

const reasonMask = (reasons: readonly CloudHistoryReason[]) =>
    reasons.reduce((mask, reason) => mask | REASON_BIT[reason], 0) >>> 0;

export const packCloudTemporalPlanGpuV1 = (
    plan: CloudTemporalReconstructionPlanV1,
    frame: CloudProductionFrameV1,
    requested?: Partial<CloudProductionGpuAuxiliaryCapacities>,
): PackedCloudTemporalPlanGpuV1 => {
    const capacities = normalizedAuxiliaryCapacities(requested);
    const decisions = plan.decisions.slice(0, capacities.temporalDecisions);
    const generationByOwner = new Map(frame.systems.map(({ owner }) => [
        owner.ownerId,
        owner.generation,
    ]));
    const decisionUints = new Uint32Array(
        capacities.temporalDecisions * CLOUD_TEMPORAL_DECISION_UINTS,
    );
    const decisionFloats = new Float32Array(
        capacities.temporalDecisions * CLOUD_TEMPORAL_DECISION_FLOATS,
    );
    decisions.forEach((decision, index) => {
        const uintOffset = index * CLOUD_TEMPORAL_DECISION_UINTS;
        decisionUints.set([
            decision.ownerId,
            generationByOwner.get(decision.ownerId) ?? 0,
            ACTION_CODE[decision.action],
            reasonMask(decision.reasons),
            decision.previousOwnerIndex === null
                ? 0 : decision.previousOwnerIndex + 1,
            decision.nextOwnerIndex === null ? 0 : decision.nextOwnerIndex + 1,
            0,
            0,
        ], uintOffset);
        decisionFloats.set([
            decision.reuseWeight,
            0,
            0,
            0,
        ], index * CLOUD_TEMPORAL_DECISION_FLOATS);
    });
    const droppedDecisions = plan.decisions.length - decisions.length;
    return {
        headerUints: new Uint32Array([
            CLOUD_PRODUCTION_GPU_SCHEMA_VERSION,
            decisions.length,
            droppedDecisions,
            plan.globalReset ? 1 : 0,
            capacities.temporalDecisions,
            0,
            0,
            0,
        ]),
        headerFloats: new Float32Array([
            plan.previousTimeSeconds,
            plan.nextTimeSeconds,
            Math.max(0, plan.nextTimeSeconds - plan.previousTimeSeconds),
            0,
        ]),
        decisionUints,
        decisionFloats,
        decisionCount: decisions.length,
        droppedDecisions,
    };
};

export const createCloudProductionGpuUploadPlanV1 = (
    frame: CloudProductionFrameV1,
    capacities?: Partial<CloudProductionGpuAuxiliaryCapacities>,
): CloudProductionGpuUploadPlanV1 => {
    const spatial = packCloudSpatialIndexGpuV1(
        frame.spatialIndex,
        capacities,
    );
    const temporal = packCloudTemporalPlanGpuV1(
        frame.temporal,
        frame,
        capacities,
    );
    const issues: CloudProductionGpuIssue[] = frame.issues.map((issue) => ({
        code: issue.code,
        subject: `${issue.domain}:${issue.subject}`,
        message: issue.message,
    }));
    if (spatial.droppedCells > 0 || spatial.droppedOwnerReferences > 0) {
        issues.push({
            code: "spatial-capacity-truncation",
            subject: "spatial-index",
            message: "GPU spatial-index capacity dropped cells or owner references.",
        });
    }
    if (temporal.droppedDecisions > 0) {
        issues.push({
            code: "temporal-capacity-truncation",
            subject: "temporal",
            message: "GPU temporal-decision capacity dropped owner decisions.",
        });
    }
    const production = frame.buffers;
    const complete = issues.length === 0 &&
        production.droppedOwners === 0 &&
        production.droppedFeatures === 0 &&
        production.droppedEvents === 0 &&
        production.droppedEventReferences === 0;
    return {
        schemaVersion: CLOUD_PRODUCTION_GPU_SCHEMA_VERSION,
        frameFingerprint: frame.fingerprint,
        production,
        spatial,
        temporal,
        complete,
        issues,
    };
};

export interface CloudGpuBufferLike {
    readonly size: number;
    destroy(): void;
}

export interface CloudGpuQueueLike {
    writeBuffer(
        buffer: CloudGpuBufferLike,
        bufferOffset: number,
        data: ArrayBufferView,
    ): void;
}

export interface CloudGpuDeviceLike {
    readonly queue: CloudGpuQueueLike;
    createBuffer(descriptor: {
        label: string;
        size: number;
        usage: number;
    }): CloudGpuBufferLike;
}

export type CloudProductionGpuBufferName =
    keyof typeof CLOUD_PRODUCTION_GPU_BINDINGS;

export interface CloudProductionGpuResourcesV1 {
    schemaVersion: typeof CLOUD_PRODUCTION_GPU_SCHEMA_VERSION;
    buffers: Record<CloudProductionGpuBufferName, CloudGpuBufferLike>;
    byteLengths: Record<CloudProductionGpuBufferName, number>;
    destroyed: boolean;
    uploadedFrameFingerprint: string | null;
}

const uploadArrays = (
    plan: CloudProductionGpuUploadPlanV1,
): Record<CloudProductionGpuBufferName, ArrayBufferView> => ({
    headerUints: plan.production.headerUints,
    ownerFloats: plan.production.ownerFloats,
    ownerUints: plan.production.ownerUints,
    featureFloats: plan.production.featureFloats,
    featureUints: plan.production.featureUints,
    eventFloats: plan.production.eventFloats,
    eventUints: plan.production.eventUints,
    eventReferenceUints: plan.production.eventReferenceUints,
    spatialHeaderUints: plan.spatial.headerUints,
    spatialCellInts: plan.spatial.cellInts,
    spatialOwnerReferences: plan.spatial.ownerReferenceUints,
    temporalHeaderUints: plan.temporal.headerUints,
    temporalHeaderFloats: plan.temporal.headerFloats,
    temporalDecisionUints: plan.temporal.decisionUints,
    temporalDecisionFloats: plan.temporal.decisionFloats,
});

export const createCloudProductionGpuResourcesV1 = (
    device: CloudGpuDeviceLike,
    plan: CloudProductionGpuUploadPlanV1,
): CloudProductionGpuResourcesV1 => {
    const arrays = uploadArrays(plan);
    const buffers = {} as Record<
        CloudProductionGpuBufferName,
        CloudGpuBufferLike
    >;
    const byteLengths = {} as Record<CloudProductionGpuBufferName, number>;
    for (const name of Object.keys(CLOUD_PRODUCTION_GPU_BINDINGS) as
        CloudProductionGpuBufferName[]) {
        const byteLength = Math.max(4, arrays[name].byteLength);
        byteLengths[name] = byteLength;
        buffers[name] = device.createBuffer({
            label: `cloud-production-v1:${name}`,
            size: byteLength,
            usage: CLOUD_PRODUCTION_STORAGE_BUFFER_USAGE,
        });
    }
    return {
        schemaVersion: CLOUD_PRODUCTION_GPU_SCHEMA_VERSION,
        buffers,
        byteLengths,
        destroyed: false,
        uploadedFrameFingerprint: null,
    };
};

export const uploadCloudProductionGpuFrameV1 = (
    device: CloudGpuDeviceLike,
    resources: CloudProductionGpuResourcesV1,
    plan: CloudProductionGpuUploadPlanV1,
): readonly CloudProductionGpuIssue[] => {
    const issues: CloudProductionGpuIssue[] = [...plan.issues];
    if (resources.destroyed) {
        return [...issues, {
            code: "resources-destroyed",
            subject: "gpu-resources",
            message: "Destroyed cloud GPU resources cannot receive uploads.",
        }];
    }
    const arrays = uploadArrays(plan);
    for (const name of Object.keys(CLOUD_PRODUCTION_GPU_BINDINGS) as
        CloudProductionGpuBufferName[]) {
        const array = arrays[name];
        const buffer = resources.buffers[name];
        if (array.byteLength > buffer.size) {
            issues.push({
                code: "buffer-too-small",
                subject: name,
                message: `Upload needs ${array.byteLength} bytes; buffer has ${buffer.size}.`,
            });
            continue;
        }
        device.queue.writeBuffer(buffer, 0, array);
    }
    if (issues.length === 0) {
        resources.uploadedFrameFingerprint = plan.frameFingerprint;
    }
    return issues;
};

export const destroyCloudProductionGpuResourcesV1 = (
    resources: CloudProductionGpuResourcesV1,
) => {
    if (resources.destroyed) return;
    for (const buffer of Object.values(resources.buffers)) buffer.destroy();
    resources.destroyed = true;
    resources.uploadedFrameFingerprint = null;
};

export const CLOUD_PRODUCTION_GPU_WGSL = /* wgsl */ `
${CLOUD_PRODUCTION_BUFFERS_WGSL}

struct CloudSpatialHeaderV1 {
    schema_version: u32,
    cell_count: u32,
    owner_reference_count: u32,
    dropped_cell_count: u32,
    dropped_reference_count: u32,
    cell_capacity: u32,
    reference_capacity: u32,
    _padding: u32,
};

struct CloudSpatialCellV1 {
    x: i32,
    z: i32,
    owner_reference_start: i32,
    owner_reference_count: i32,
};

struct CloudTemporalHeaderV1 {
    schema_version: u32,
    decision_count: u32,
    dropped_decision_count: u32,
    global_reset: u32,
    decision_capacity: u32,
    _padding_0: u32,
    _padding_1: u32,
    _padding_2: u32,
};

struct CloudTemporalDecisionUintV1 {
    lanes: array<vec4<u32>, 2>,
};

struct CloudTemporalDecisionFloatV1 {
    values: vec4<f32>,
};
`;

// Keep the event record constants reachable by shader-assembly tests.
export const CLOUD_PRODUCTION_GPU_EVENT_RECORD_STRIDES = Object.freeze({
    floats: CLOUD_EVENT_RECORD_FLOATS,
    uints: CLOUD_EVENT_RECORD_UINTS,
});

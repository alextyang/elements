import {
    compileCloudProductionFrameV1,
    type CloudProductionFrameV1,
} from "./cloud-production-frame";
import {
    CLOUD_PRODUCTION_GPU_BINDINGS,
    createCloudProductionGpuResourcesV1,
    createCloudProductionGpuUploadPlanV1,
    destroyCloudProductionGpuResourcesV1,
    uploadCloudProductionGpuFrameV1,
    type CloudGpuDeviceLike,
    type CloudProductionGpuAuxiliaryCapacities,
    type CloudProductionGpuBufferName,
    type CloudProductionGpuIssue,
    type CloudProductionGpuResourcesV1,
    type CloudProductionGpuUploadPlanV1,
} from "./cloud-production-gpu-runtime";
import type { CloudProductionBufferCapacities } from
    "./cloud-production-buffers";
import type { CompiledCloudSystemV2 } from "./cloud-system-abi-v2";

export interface CloudProductionGpuSessionOptionsV1 {
    productionCapacities?: Partial<CloudProductionBufferCapacities>;
    auxiliaryCapacities?: Partial<CloudProductionGpuAuxiliaryCapacities>;
    spatialIndex?: {
        cellSizeKm?: number;
        maximumOwnersPerCell?: number;
        maximumCellsPerOwner?: number;
    };
    /** Fail closed rather than uploading an intentionally truncated frame. */
    allowTruncatedFrames?: boolean;
}

export interface CloudProductionGpuSessionUpdateV1 {
    systems: readonly CompiledCloudSystemV2[];
    frameIndex: number;
    simulationTimeSeconds: number;
}

export interface CloudProductionGpuSessionResultV1 {
    frame: CloudProductionFrameV1;
    uploadPlan: CloudProductionGpuUploadPlanV1;
    uploadIssues: readonly CloudProductionGpuIssue[];
    uploaded: boolean;
    resourcesCreated: boolean;
    uploadedFrameFingerprint: string | null;
}

export interface CloudProductionBindGroupEntryLike {
    binding: number;
    resource: {
        buffer: CloudProductionGpuResourcesV1["buffers"]
            [CloudProductionGpuBufferName];
    };
}

export interface CloudProductionGpuSessionSnapshotV1 {
    schemaVersion: 1;
    destroyed: boolean;
    frameCount: number;
    previousFrameFingerprint: string | null;
    uploadedFrameFingerprint: string | null;
    resourceCount: number;
}

/**
 * Persistent bridge for the live renderer. It keeps one fixed set of GPU
 * allocations, advances owner-aware temporal identity from the previous
 * production frame, and uploads only complete frames unless explicitly allowed.
 */
export class CloudProductionGpuSessionV1 {
    readonly schemaVersion = 1 as const;
    readonly #device: CloudGpuDeviceLike;
    readonly #options: CloudProductionGpuSessionOptionsV1;
    #previousFrame: CloudProductionFrameV1 | null = null;
    #resources: CloudProductionGpuResourcesV1 | null = null;
    #destroyed = false;
    #frameCount = 0;

    constructor(
        device: CloudGpuDeviceLike,
        options: CloudProductionGpuSessionOptionsV1 = {},
    ) {
        this.#device = device;
        this.#options = {
            ...options,
            productionCapacities: { ...options.productionCapacities },
            auxiliaryCapacities: { ...options.auxiliaryCapacities },
            spatialIndex: { ...options.spatialIndex },
        };
    }

    update(
        value: CloudProductionGpuSessionUpdateV1,
    ): CloudProductionGpuSessionResultV1 {
        if (this.#destroyed) {
            throw new Error(
                "Destroyed cloud production GPU session cannot update.",
            );
        }
        const frame = compileCloudProductionFrameV1({
            systems: value.systems,
            frameIndex: value.frameIndex,
            simulationTimeSeconds: value.simulationTimeSeconds,
            previousFrame: this.#previousFrame,
            capacities: this.#options.productionCapacities,
            spatialIndex: this.#options.spatialIndex,
        });
        const uploadPlan = createCloudProductionGpuUploadPlanV1(
            frame,
            this.#options.auxiliaryCapacities,
        );
        let resourcesCreated = false;
        if (!this.#resources) {
            this.#resources = createCloudProductionGpuResourcesV1(
                this.#device,
                uploadPlan,
            );
            resourcesCreated = true;
        }
        const permitUpload = uploadPlan.complete ||
            this.#options.allowTruncatedFrames === true;
        const uploadIssues: readonly CloudProductionGpuIssue[] = permitUpload
            ? uploadCloudProductionGpuFrameV1(
                this.#device,
                this.#resources,
                uploadPlan,
            )
            : [...uploadPlan.issues, {
                code: "incomplete-frame-rejected",
                subject: "gpu-session",
                message: "Incomplete cloud production frame was not uploaded.",
            }];
        const uploaded = permitUpload && uploadIssues.length === 0;
        if (uploaded) {
            this.#previousFrame = frame;
            this.#frameCount += 1;
        }
        return {
            frame,
            uploadPlan,
            uploadIssues,
            uploaded,
            resourcesCreated,
            uploadedFrameFingerprint:
                this.#resources.uploadedFrameFingerprint,
        };
    }

    bindGroupEntries(): readonly CloudProductionBindGroupEntryLike[] {
        if (this.#destroyed || !this.#resources) return [];
        return (Object.keys(CLOUD_PRODUCTION_GPU_BINDINGS) as
            CloudProductionGpuBufferName[])
            .map((name) => ({
                binding: CLOUD_PRODUCTION_GPU_BINDINGS[name],
                resource: { buffer: this.#resources!.buffers[name] },
            }))
            .sort((left, right) => left.binding - right.binding);
    }

    snapshot(): CloudProductionGpuSessionSnapshotV1 {
        return {
            schemaVersion: 1,
            destroyed: this.#destroyed,
            frameCount: this.#frameCount,
            previousFrameFingerprint: this.#previousFrame?.fingerprint ?? null,
            uploadedFrameFingerprint:
                this.#resources?.uploadedFrameFingerprint ?? null,
            resourceCount: this.#resources
                ? Object.keys(this.#resources.buffers).length : 0,
        };
    }

    destroy() {
        if (this.#destroyed) return;
        if (this.#resources) {
            destroyCloudProductionGpuResourcesV1(this.#resources);
        }
        this.#resources = null;
        this.#previousFrame = null;
        this.#destroyed = true;
    }
}

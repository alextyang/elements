import {
    CLOUD_PRODUCTION_GPU_BINDINGS,
    createCloudProductionGpuResourcesV1,
    destroyCloudProductionGpuResourcesV1,
    uploadCloudProductionGpuFrameV1,
    type CloudGpuDeviceLike,
    type CloudProductionGpuBufferName,
    type CloudProductionGpuIssue,
    type CloudProductionGpuResourcesV1,
    type CloudProductionGpuUploadPlanV1,
} from "./cloud-production-gpu-runtime";

export interface CloudProductionGpuControllerV1 {
    readonly schemaVersion: 1;
    readonly resources: CloudProductionGpuResourcesV1 | null;
    readonly uploadedFrameFingerprint: string | null;
    readonly uploadCount: number;
    readonly recreationCount: number;
    upload(plan: CloudProductionGpuUploadPlanV1): CloudProductionGpuControllerUpload;
    destroy(): void;
}

export interface CloudProductionGpuControllerUpload {
    uploaded: boolean;
    recreated: boolean;
    skippedUnchanged: boolean;
    issues: readonly CloudProductionGpuIssue[];
}

const requiredByteLengths = (
    plan: CloudProductionGpuUploadPlanV1,
): Record<CloudProductionGpuBufferName, number> => ({
    headerUints: plan.production.headerUints.byteLength,
    ownerFloats: plan.production.ownerFloats.byteLength,
    ownerUints: plan.production.ownerUints.byteLength,
    featureFloats: plan.production.featureFloats.byteLength,
    featureUints: plan.production.featureUints.byteLength,
    eventFloats: plan.production.eventFloats.byteLength,
    eventUints: plan.production.eventUints.byteLength,
    eventReferenceUints: plan.production.eventReferenceUints.byteLength,
    spatialHeaderUints: plan.spatial.headerUints.byteLength,
    spatialCellInts: plan.spatial.cellInts.byteLength,
    spatialOwnerReferences: plan.spatial.ownerReferenceUints.byteLength,
    temporalHeaderUints: plan.temporal.headerUints.byteLength,
    temporalHeaderFloats: plan.temporal.headerFloats.byteLength,
    temporalDecisionUints: plan.temporal.decisionUints.byteLength,
    temporalDecisionFloats: plan.temporal.decisionFloats.byteLength,
});

const resourcesFitPlan = (
    resources: CloudProductionGpuResourcesV1,
    plan: CloudProductionGpuUploadPlanV1,
) => {
    const required = requiredByteLengths(plan);
    return (Object.keys(CLOUD_PRODUCTION_GPU_BINDINGS) as
        CloudProductionGpuBufferName[]).every((name) =>
        resources.buffers[name].size >= Math.max(4, required[name]));
};

export const cloudProductionGpuBindGroupEntriesV1 = (
    resources: CloudProductionGpuResourcesV1,
) => (Object.entries(CLOUD_PRODUCTION_GPU_BINDINGS) as
    [CloudProductionGpuBufferName, number][]).map(([name, binding]) => ({
    binding,
    resource: { buffer: resources.buffers[name] },
}));

export const createCloudProductionGpuControllerV1 = (
    device: CloudGpuDeviceLike,
    options?: { allowIncompletePlans?: boolean },
): CloudProductionGpuControllerV1 => {
    let resources: CloudProductionGpuResourcesV1 | null = null;
    let uploadCount = 0;
    let recreationCount = 0;
    const controller: CloudProductionGpuControllerV1 = {
        schemaVersion: 1,
        get resources() { return resources; },
        get uploadedFrameFingerprint() {
            return resources?.uploadedFrameFingerprint ?? null;
        },
        get uploadCount() { return uploadCount; },
        get recreationCount() { return recreationCount; },
        upload(plan) {
            if (!plan.complete && options?.allowIncompletePlans !== true) {
                return {
                    uploaded: false,
                    recreated: false,
                    skippedUnchanged: false,
                    issues: [...plan.issues, {
                        code: "incomplete-upload-plan",
                        subject: "controller",
                        message: "Incomplete cloud frames are not uploaded by default.",
                    }],
                };
            }
            if (resources?.uploadedFrameFingerprint === plan.frameFingerprint) {
                return {
                    uploaded: false,
                    recreated: false,
                    skippedUnchanged: true,
                    issues: [],
                };
            }
            let recreated = false;
            if (!resources || !resourcesFitPlan(resources, plan)) {
                if (resources) destroyCloudProductionGpuResourcesV1(resources);
                resources = createCloudProductionGpuResourcesV1(device, plan);
                recreationCount += 1;
                recreated = true;
            }
            const issues = uploadCloudProductionGpuFrameV1(
                device,
                resources,
                plan,
            );
            if (issues.length === 0) uploadCount += 1;
            return {
                uploaded: issues.length === 0,
                recreated,
                skippedUnchanged: false,
                issues,
            };
        },
        destroy() {
            if (resources) destroyCloudProductionGpuResourcesV1(resources);
            resources = null;
        },
    };
    return controller;
};

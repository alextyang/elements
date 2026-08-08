import {
    CloudProductionGpuSessionV1,
    type CloudProductionBindGroupEntryLike,
    type CloudProductionGpuSessionResultV1,
    type CloudProductionGpuSessionSnapshotV1,
} from "./cloud-production-gpu-session";
import type { CloudGpuDeviceLike } from "./cloud-production-gpu-runtime";
import type { CloudShippingProductionRuntimeV1 } from
    "./cloud-shipping-production-runtime";

export interface CloudShippingGpuAttachmentSnapshotV1 {
    schemaVersion: 1;
    attachmentId: number;
    runtimeSignature: string | null;
    frameFingerprint: string | null;
    uploaded: boolean;
    uploadIssueCount: number;
    session: CloudProductionGpuSessionSnapshotV1;
}

export interface CloudShippingGpuAttachmentV1 {
    schemaVersion: 1;
    attachmentId: number;
    bindGroupEntries: () => readonly CloudProductionBindGroupEntryLike[];
    snapshot: () => CloudShippingGpuAttachmentSnapshotV1;
    destroy: () => void;
}

interface AttachmentState {
    id: number;
    session: CloudProductionGpuSessionV1;
    runtimeSignature: string | null;
    frameFingerprint: string | null;
    result: CloudProductionGpuSessionResultV1 | null;
    destroyed: boolean;
}

let latestRuntime: CloudShippingProductionRuntimeV1 | null = null;
let nextAttachmentId = 1;
const attachments = new Map<number, AttachmentState>();

const updateAttachment = (
    attachment: AttachmentState,
    runtime: CloudShippingProductionRuntimeV1,
) => {
    if (attachment.destroyed ||
        attachment.frameFingerprint === runtime.bridge.frame.fingerprint) {
        return;
    }
    const result = attachment.session.update({
        systems: runtime.bridge.systemsV2,
        frameIndex: runtime.frameIndex,
        simulationTimeSeconds: runtime.simulationTimeSeconds,
    });
    attachment.runtimeSignature = runtime.runtimeSignature;
    attachment.frameFingerprint = runtime.bridge.frame.fingerprint;
    attachment.result = result;
};

/**
 * Publish the camera-independent V2 frame to every live shipping GPU device.
 * This is called before camera/light/hydrometeor consumers inspect the runtime.
 */
export const registerCloudShippingProductionRuntimeV1 = (
    runtime: CloudShippingProductionRuntimeV1,
) => {
    latestRuntime = runtime;
    for (const attachment of attachments.values()) {
        updateAttachment(attachment, runtime);
    }
};

/**
 * Attach the production V2 session to a GPU device already owned by the sky
 * renderer. No adapter/device is requested here and no secondary renderer is
 * created. The caller owns the returned lifetime token.
 */
export const attachCloudShippingGpuDeviceV1 = (
    device: CloudGpuDeviceLike,
): CloudShippingGpuAttachmentV1 => {
    const id = nextAttachmentId;
    nextAttachmentId += 1;
    const state: AttachmentState = {
        id,
        session: new CloudProductionGpuSessionV1(device, {
            productionCapacities: {
                owners: 36,
                features: 288,
                events: 1_024,
                eventReferences: 8_192,
            },
            allowTruncatedFrames: false,
        }),
        runtimeSignature: null,
        frameFingerprint: null,
        result: null,
        destroyed: false,
    };
    attachments.set(id, state);
    if (latestRuntime) updateAttachment(state, latestRuntime);
    return {
        schemaVersion: 1,
        attachmentId: id,
        bindGroupEntries: () => state.destroyed
            ? [] : state.session.bindGroupEntries(),
        snapshot: () => ({
            schemaVersion: 1,
            attachmentId: id,
            runtimeSignature: state.runtimeSignature,
            frameFingerprint: state.frameFingerprint,
            uploaded: state.result?.uploaded ?? false,
            uploadIssueCount: state.result?.uploadIssues.length ?? 0,
            session: state.session.snapshot(),
        }),
        destroy: () => {
            if (state.destroyed) return;
            state.destroyed = true;
            state.session.destroy();
            attachments.delete(id);
        },
    };
};

export const cloudShippingGpuRegistrySnapshotV1 = () => ({
    schemaVersion: 1 as const,
    latestRuntimeSignature: latestRuntime?.runtimeSignature ?? null,
    latestFrameFingerprint: latestRuntime?.bridge.frame.fingerprint ?? null,
    attachmentCount: attachments.size,
    attachments: [...attachments.values()].map((state) => ({
        attachmentId: state.id,
        runtimeSignature: state.runtimeSignature,
        frameFingerprint: state.frameFingerprint,
        uploaded: state.result?.uploaded ?? false,
        uploadIssueCount: state.result?.uploadIssues.length ?? 0,
        session: state.session.snapshot(),
    })),
});

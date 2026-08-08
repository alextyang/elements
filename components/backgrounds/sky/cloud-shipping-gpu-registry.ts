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
    runtimeSignature: string;
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
    runtimeSignature: string;
    session: CloudProductionGpuSessionV1;
    frameFingerprint: string | null;
    result: CloudProductionGpuSessionResultV1 | null;
    destroyed: boolean;
}

let latestRuntimeSignature: string | null = null;
let nextAttachmentId = 1;
const runtimes = new Map<string, CloudShippingProductionRuntimeV1>();
const attachments = new Map<number, AttachmentState>();

const updateAttachment = (
    attachment: AttachmentState,
    runtime: CloudShippingProductionRuntimeV1,
) => {
    if (attachment.destroyed ||
        attachment.runtimeSignature !== runtime.runtimeSignature ||
        attachment.frameFingerprint === runtime.bridge.frame.fingerprint) {
        return;
    }
    const result = attachment.session.update({
        systems: runtime.bridge.systemsV2,
        frameIndex: runtime.frameIndex,
        simulationTimeSeconds: runtime.simulationTimeSeconds,
    });
    attachment.frameFingerprint = runtime.bridge.frame.fingerprint;
    attachment.result = result;
};

/**
 * Publish one camera-independent V2 frame only to GPU devices subscribed to
 * that exact runtime signature. Independent canvases can therefore render
 * different skies without overwriting each other's owner buffers.
 */
export const registerCloudShippingProductionRuntimeV1 = (
    runtime: CloudShippingProductionRuntimeV1,
) => {
    latestRuntimeSignature = runtime.runtimeSignature;
    runtimes.set(runtime.runtimeSignature, runtime);
    for (const attachment of attachments.values()) {
        updateAttachment(attachment, runtime);
    }
};

/** Exact shipping owner lookup for CPU-side pass setup. */
export const cloudShippingV2SystemForOwnerId = (
    runtimeSignature: string,
    ownerId: string,
) => runtimes.get(runtimeSignature)?.bridge.systemsV2.find(({ owner }) =>
    owner.sourceId === ownerId) ?? null;

/**
 * Index-preserving lookup used by passes whose storage ABI shares the runtime
 * owner order. A mismatch fails closed instead of cross-wiring two clouds.
 */
export const cloudShippingV2SystemForOwnerIndex = (
    runtimeSignature: string,
    ownerIndex: number,
    expectedOwnerId?: string,
) => {
    const system = runtimes.get(runtimeSignature)?
        .bridge.systemsV2[ownerIndex] ?? null;
    if (system && expectedOwnerId !== undefined &&
        system.owner.sourceId !== expectedOwnerId) {
        throw new Error(
            `Shipping V2 owner order mismatch at ${ownerIndex}: ` +
            `${system.owner.sourceId} != ${expectedOwnerId}.`,
        );
    }
    return system;
};

/**
 * Attach the production V2 session to a GPU device already owned by one sky
 * renderer and subscribe it to that renderer's immutable runtime signature.
 *
 * `runtimeSignature` is optional only for the current binding-24 migration:
 * JavaScript setup publishes the relevant runtime immediately before the
 * optical-owner upload, so the latest signature is captured once here. The
 * attachment remains permanently scoped after creation and cannot be updated
 * by another canvas. New consumers must pass their signature explicitly.
 */
export const attachCloudShippingGpuDeviceV1 = (
    device: CloudGpuDeviceLike,
    runtimeSignature?: string,
): CloudShippingGpuAttachmentV1 => {
    const resolvedRuntimeSignature = runtimeSignature ?? latestRuntimeSignature;
    if (!resolvedRuntimeSignature) {
        throw new Error("Cloud shipping GPU attachment requires a registered runtime.");
    }
    const id = nextAttachmentId;
    nextAttachmentId += 1;
    const state: AttachmentState = {
        id,
        runtimeSignature: resolvedRuntimeSignature,
        session: new CloudProductionGpuSessionV1(device, {
            productionCapacities: {
                owners: 36,
                features: 288,
                events: 1_024,
                eventReferences: 8_192,
            },
            allowTruncatedFrames: false,
        }),
        frameFingerprint: null,
        result: null,
        destroyed: false,
    };
    attachments.set(id, state);
    const runtime = runtimes.get(resolvedRuntimeSignature);
    if (runtime) updateAttachment(state, runtime);
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
    latestRuntimeSignature,
    runtimeCount: runtimes.size,
    attachmentCount: attachments.size,
    runtimes: [...runtimes.values()].map((runtime) => ({
        runtimeSignature: runtime.runtimeSignature,
        frameFingerprint: runtime.bridge.frame.fingerprint,
        ownerCount: runtime.bridge.systemsV2.length,
    })),
    attachments: [...attachments.values()].map((state) => ({
        attachmentId: state.id,
        runtimeSignature: state.runtimeSignature,
        frameFingerprint: state.frameFingerprint,
        uploaded: state.result?.uploaded ?? false,
        uploadIssueCount: state.result?.uploadIssues.length ?? 0,
        session: state.session.snapshot(),
    })),
});

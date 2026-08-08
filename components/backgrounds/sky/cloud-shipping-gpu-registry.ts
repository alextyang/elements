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
    /** Runtime namespace this renderer device is subscribed to. */
    selectedRuntimeSignature: string | null;
    /** Runtime most recently uploaded to this device. */
    runtimeSignature: string | null;
    frameFingerprint: string | null;
    uploaded: boolean;
    uploadIssueCount: number;
    session: CloudProductionGpuSessionSnapshotV1;
}

export interface CloudShippingGpuAttachmentV1 {
    schemaVersion: 1;
    attachmentId: number;
    /**
     * Retarget this renderer-owned device to another immutable world-runtime
     * namespace. Passing null disconnects it without destroying allocations.
     */
    selectRuntime: (runtimeSignature: string | null) => void;
    bindGroupEntries: () => readonly CloudProductionBindGroupEntryLike[];
    snapshot: () => CloudShippingGpuAttachmentSnapshotV1;
    destroy: () => void;
}

export interface AttachCloudShippingGpuDeviceOptionsV1 {
    /**
     * Exact immutable world-runtime namespace. When omitted, the attachment
     * captures the latest registered runtime once and does not follow later
     * unrelated registrations.
     */
    runtimeSignature?: string | null;
}

interface AttachmentState {
    id: number;
    session: CloudProductionGpuSessionV1;
    selectedRuntimeSignature: string | null;
    /** True only when the device attached before any runtime was available. */
    selectFirstRuntime: boolean;
    runtimeSignature: string | null;
    frameFingerprint: string | null;
    result: CloudProductionGpuSessionResultV1 | null;
    destroyed: boolean;
}

const MAXIMUM_REGISTERED_RUNTIMES = 32;
let latestRuntimeSignature: string | null = null;
let nextAttachmentId = 1;
const runtimes = new Map<string, CloudShippingProductionRuntimeV1>();
const attachments = new Map<number, AttachmentState>();

const selectedRuntimeSignatures = () => new Set(
    [...attachments.values()].flatMap(({ selectedRuntimeSignature }) =>
        selectedRuntimeSignature ? [selectedRuntimeSignature] : []),
);

const trimRuntimeCache = () => {
    if (runtimes.size <= MAXIMUM_REGISTERED_RUNTIMES) return;
    const retained = selectedRuntimeSignatures();
    if (latestRuntimeSignature) retained.add(latestRuntimeSignature);
    for (const signature of runtimes.keys()) {
        if (runtimes.size <= MAXIMUM_REGISTERED_RUNTIMES) break;
        if (!retained.has(signature)) runtimes.delete(signature);
    }
};

const updateAttachment = (
    attachment: AttachmentState,
    runtime: CloudShippingProductionRuntimeV1,
) => {
    if (attachment.destroyed ||
        attachment.selectedRuntimeSignature !== runtime.runtimeSignature ||
        (attachment.runtimeSignature === runtime.runtimeSignature &&
            attachment.frameFingerprint === runtime.bridge.frame.fingerprint)) {
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

const selectAttachmentRuntime = (
    attachment: AttachmentState,
    runtimeSignature: string | null,
) => {
    if (attachment.destroyed) return;
    attachment.selectFirstRuntime = false;
    if (attachment.selectedRuntimeSignature === runtimeSignature) {
        const current = runtimeSignature ? runtimes.get(runtimeSignature) : null;
        if (current) updateAttachment(attachment, current);
        return;
    }
    attachment.selectedRuntimeSignature = runtimeSignature;
    attachment.runtimeSignature = null;
    attachment.frameFingerprint = null;
    attachment.result = null;
    const runtime = runtimeSignature ? runtimes.get(runtimeSignature) : null;
    if (runtime) updateAttachment(attachment, runtime);
};

/**
 * Publish one camera-independent V2 frame to renderer devices subscribed to
 * that exact immutable world-runtime namespace. Other canvases are untouched.
 */
export const registerCloudShippingProductionRuntimeV1 = (
    runtime: CloudShippingProductionRuntimeV1,
) => {
    latestRuntimeSignature = runtime.runtimeSignature;
    // Refresh insertion order so the bounded cache evicts genuinely stale
    // namespaces rather than a currently active scene that recompiled.
    runtimes.delete(runtime.runtimeSignature);
    runtimes.set(runtime.runtimeSignature, runtime);
    for (const attachment of attachments.values()) {
        if (attachment.selectFirstRuntime &&
            attachment.selectedRuntimeSignature === null) {
            attachment.selectedRuntimeSignature = runtime.runtimeSignature;
            attachment.selectFirstRuntime = false;
        }
        updateAttachment(attachment, runtime);
    }
    trimRuntimeCache();
};

/**
 * Attach the production V2 session to a GPU device already owned by one sky
 * renderer. No adapter/device is requested here and no secondary renderer is
 * created. The attachment captures one runtime namespace instead of following
 * the process-global latest registration, preventing cross-canvas corruption.
 */
export const attachCloudShippingGpuDeviceV1 = (
    device: CloudGpuDeviceLike,
    options: AttachCloudShippingGpuDeviceOptionsV1 = {},
): CloudShippingGpuAttachmentV1 => {
    const id = nextAttachmentId;
    nextAttachmentId += 1;
    const explicitlySelected = Object.prototype.hasOwnProperty.call(
        options,
        "runtimeSignature",
    );
    const selectedRuntimeSignature = explicitlySelected
        ? options.runtimeSignature ?? null
        : latestRuntimeSignature;
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
        selectedRuntimeSignature,
        selectFirstRuntime: !explicitlySelected &&
            selectedRuntimeSignature === null,
        runtimeSignature: null,
        frameFingerprint: null,
        result: null,
        destroyed: false,
    };
    attachments.set(id, state);
    const selectedRuntime = selectedRuntimeSignature
        ? runtimes.get(selectedRuntimeSignature) : null;
    if (selectedRuntime) updateAttachment(state, selectedRuntime);
    return {
        schemaVersion: 1,
        attachmentId: id,
        selectRuntime: (runtimeSignature) =>
            selectAttachmentRuntime(state, runtimeSignature),
        bindGroupEntries: () => state.destroyed
            ? [] : state.session.bindGroupEntries(),
        snapshot: () => ({
            schemaVersion: 1,
            attachmentId: id,
            selectedRuntimeSignature: state.selectedRuntimeSignature,
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
            trimRuntimeCache();
        },
    };
};

export const cloudShippingGpuRegistrySnapshotV1 = () => ({
    schemaVersion: 1 as const,
    latestRuntimeSignature,
    registeredRuntimeCount: runtimes.size,
    registeredRuntimeSignatures: [...runtimes.keys()],
    attachmentCount: attachments.size,
    attachments: [...attachments.values()].map((state) => ({
        attachmentId: state.id,
        selectedRuntimeSignature: state.selectedRuntimeSignature,
        runtimeSignature: state.runtimeSignature,
        frameFingerprint: state.frameFingerprint,
        uploaded: state.result?.uploaded ?? false,
        uploadIssueCount: state.result?.uploadIssues.length ?? 0,
        session: state.session.snapshot(),
    })),
});

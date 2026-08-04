export const CLOUD_CAPTURE_SHUTDOWN_MESSAGE =
    "cloud-preview:capture-complete-shutdown" as const;
export const CLOUD_CAPTURE_SHUTDOWN_ACK_MESSAGE =
    "cloud-preview:renderer-shutdown" as const;
export const CLOUD_CAPTURE_FAILURE_MESSAGE =
    "cloud-preview:renderer-failure" as const;

export interface CloudCaptureShutdownMessage {
    type: typeof CLOUD_CAPTURE_SHUTDOWN_MESSAGE;
    generation: number;
}

export interface CloudCaptureShutdownAckMessage {
    type: typeof CLOUD_CAPTURE_SHUTDOWN_ACK_MESSAGE;
    generation: number;
}

export interface CloudCaptureFailureMessage {
    type: typeof CLOUD_CAPTURE_FAILURE_MESSAGE;
    generation: number;
    reason: string;
}

export const isCloudCaptureShutdownMessage = (
    value: unknown,
): value is CloudCaptureShutdownMessage => {
    if (!value || typeof value !== "object") return false;
    const message = value as Partial<CloudCaptureShutdownMessage>;
    return message.type === CLOUD_CAPTURE_SHUTDOWN_MESSAGE &&
        Number.isSafeInteger(message.generation) &&
        Number(message.generation) >= 0;
};

export const isCloudCaptureShutdownAckMessage = (
    value: unknown,
): value is CloudCaptureShutdownAckMessage => {
    if (!value || typeof value !== "object") return false;
    const message = value as Partial<CloudCaptureShutdownAckMessage>;
    return message.type === CLOUD_CAPTURE_SHUTDOWN_ACK_MESSAGE &&
        Number.isSafeInteger(message.generation) &&
        Number(message.generation) >= 0;
};

export const isCloudCaptureFailureMessage = (
    value: unknown,
): value is CloudCaptureFailureMessage => {
    if (!value || typeof value !== "object") return false;
    const message = value as Partial<CloudCaptureFailureMessage>;
    return message.type === CLOUD_CAPTURE_FAILURE_MESSAGE &&
        Number.isSafeInteger(message.generation) &&
        Number(message.generation) >= 0 &&
        typeof message.reason === "string";
};

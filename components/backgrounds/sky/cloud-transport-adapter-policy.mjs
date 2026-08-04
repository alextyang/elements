const normalizeAdapterField = (value) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

const SOFTWARE_ADAPTER_MARKERS = Object.freeze([
    "swiftshader",
    "software",
    "fallback",
    "llvmpipe",
    "lavapipe",
    "microsoft basic render",
    "warp renderer",
    "cpu rasterizer",
    "cpu renderer",
]);

const REDACTED_ARCHITECTURES = new Set([
    "",
    "unknown",
    "redacted",
    "unavailable",
    "masked",
]);

const containsAppleIdentity = (value) =>
    /(^|[^a-z0-9])apple([^a-z0-9]|$)/.test(value);

/**
 * Resolve only the command-granularity policy used by strict cloud capture.
 *
 * Chromium may redact `GPUAdapterInfo.architecture`, and different releases
 * have reported Apple as `Apple`, `Apple Inc.`, a device/description token, or
 * PCI vendor 0x106b. Explicit fallback/software evidence always wins. An
 * unrecognized non-Apple adapter remains on the bounded software schedule.
 */
export const resolveCloudTransportAdapterBackend = (adapterInfo) => {
    if (!adapterInfo || adapterInfo.isFallbackAdapter === true) {
        return "software-bounded";
    }
    const vendor = normalizeAdapterField(adapterInfo.vendor);
    const architecture = normalizeAdapterField(adapterInfo.architecture);
    const device = normalizeAdapterField(adapterInfo.device);
    const description = normalizeAdapterField(adapterInfo.description);
    const signature = [vendor, architecture, device, description]
        .filter(Boolean)
        .join(" ");
    if (SOFTWARE_ADAPTER_MARKERS.some((marker) =>
        signature.includes(marker))) {
        return "software-bounded";
    }
    const appleIdentity = vendor === "106b" || vendor === "0x106b" ||
        [vendor, architecture, device, description].some(containsAppleIdentity);
    if (!appleIdentity) return "software-bounded";

    const architectureCompatible = REDACTED_ARCHITECTURES.has(architecture) ||
        /(^|[^a-z0-9])metal([^a-z0-9]|$)/.test(architecture) ||
        containsAppleIdentity(architecture);
    return architectureCompatible
        ? "native-apple-metal"
        : "software-bounded";
};


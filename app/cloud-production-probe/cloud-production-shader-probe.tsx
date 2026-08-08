"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WebGpuCompilationMessageLike {
    message: string;
    type?: string;
    severity?: string;
    lineNum?: number;
    linePos?: number;
}

interface WebGpuShaderModuleLike {
    getCompilationInfo(): Promise<{
        messages: Iterable<WebGpuCompilationMessageLike>;
    }>;
}

interface WebGpuDeviceLike {
    pushErrorScope(filter: "validation"): void;
    popErrorScope(): Promise<{ message?: string } | null>;
    createShaderModule(descriptor: {
        label: string;
        code: string;
    }): WebGpuShaderModuleLike;
    destroy?(): void;
}

interface WebGpuAdapterLike {
    requestDevice(): Promise<WebGpuDeviceLike>;
}

interface WebGpuLike {
    requestAdapter(options?: {
        powerPreference?: "low-power" | "high-performance";
    }): Promise<WebGpuAdapterLike | null>;
}

type ProbeStatus = "idle" | "running" | "passed" | "failed" |
    "unavailable";

const PROBE_TIMEOUT_MS = 20_000;

const bounded = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(
            `${label} did not complete within ${PROBE_TIMEOUT_MS}ms.`,
        )), PROBE_TIMEOUT_MS);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        window.clearTimeout(timer);
    }
};

const isError = (message: WebGpuCompilationMessageLike) =>
    [message.type, message.severity].some((value) =>
        String(value ?? "").toLowerCase() === "error");

const formatMessage = (message: WebGpuCompilationMessageLike) => {
    const line = Number.isFinite(message.lineNum) &&
        (message.lineNum ?? 0) > 0 ? `:${message.lineNum}` : "";
    const column = line && Number.isFinite(message.linePos) &&
        (message.linePos ?? 0) > 0 ? `:${message.linePos}` : "";
    return `cloud-production-physical-sample${line}${column}: ` +
        message.message;
};

export function CloudProductionShaderProbe({
    shaderSource,
    shaderSha256,
}: {
    shaderSource: string;
    shaderSha256: string;
}) {
    const [status, setStatus] = useState<ProbeStatus>("idle");
    const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
    const runOrdinal = useRef(0);

    const run = useCallback(async () => {
        const ordinal = ++runOrdinal.current;
        setStatus("running");
        setDiagnostics([]);
        const gpu = (navigator as Navigator & { gpu?: WebGpuLike }).gpu;
        if (!gpu) {
            if (ordinal === runOrdinal.current) {
                setStatus("unavailable");
                setDiagnostics(["WebGPU is unavailable in this browser."]);
            }
            return;
        }
        let device: WebGpuDeviceLike | null = null;
        try {
            const adapter = await bounded(gpu.requestAdapter({
                powerPreference: "high-performance",
            }), "WebGPU adapter request");
            if (!adapter) throw new Error("No WebGPU adapter was returned.");
            device = await bounded(
                adapter.requestDevice(),
                "WebGPU device request",
            );
            device.pushErrorScope("validation");
            let module: WebGpuShaderModuleLike;
            try {
                module = device.createShaderModule({
                    label: "cloud-production-physical-sample-v1",
                    code: shaderSource,
                });
            } catch (error) {
                await device.popErrorScope().catch(() => null);
                throw error;
            }
            const compilationInfo = await bounded(
                module.getCompilationInfo(),
                "WGSL compilation diagnostics",
            );
            const validationError = await bounded(
                device.popErrorScope(),
                "WebGPU validation error scope",
            );
            const errors = [...compilationInfo.messages]
                .filter(isError)
                .map(formatMessage);
            if (validationError) {
                errors.push(validationError.message ??
                    "WebGPU validation error without a message.");
            }
            if (ordinal !== runOrdinal.current) return;
            setDiagnostics(errors);
            setStatus(errors.length === 0 ? "passed" : "failed");
        } catch (error) {
            if (ordinal !== runOrdinal.current) return;
            setStatus("failed");
            setDiagnostics([
                error instanceof Error ? error.message :
                    "Unknown WebGPU shader validation failure.",
            ]);
        } finally {
            device?.destroy?.();
        }
    }, [shaderSource]);

    useEffect(() => {
        void run();
        return () => {
            runOrdinal.current += 1;
        };
    }, [run]);

    const background = status === "passed" ? "#0f2d21" :
        status === "failed" ? "#3a1717" : "#161b26";
    const border = status === "passed" ? "#2c805f" :
        status === "failed" ? "#a84f4f" : "#3a4354";

    return <main style={{
        boxSizing: "border-box",
        minHeight: "100vh",
        padding: "48px 24px",
        background: "#090d15",
        color: "#e8eef9",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
    }}>
        <section style={{
            maxWidth: 880,
            margin: "0 auto",
        }}>
            <p style={{
                margin: "0 0 10px",
                color: "#8ea7cf",
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
            }}>Cloud renderer migration</p>
            <h1 style={{ margin: "0 0 14px", fontSize: 34 }}>
                Production physical-sample WGSL probe
            </h1>
            <p style={{
                margin: "0 0 28px",
                maxWidth: 760,
                color: "#b9c5d8",
                lineHeight: 1.6,
            }}>
                Compiles the generated V2 owner/feature decoder on this
                browser&apos;s real WebGPU adapter. This validates the standalone
                module contract; it does not qualify the shipping camera,
                light-volume, shadow, hydrometeor, or temporal pipelines.
            </p>

            <div
                data-cloud-production-shader-probe={status}
                data-cloud-production-shader-sha256={shaderSha256}
                style={{
                    padding: 20,
                    border: `1px solid ${border}`,
                    borderRadius: 14,
                    background,
                }}
            >
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                }}>
                    <strong style={{ fontSize: 18 }}>
                        {status === "idle" ? "Not started" :
                            status === "running" ? "Compiling…" :
                            status === "passed" ? "WGSL module passed" :
                            status === "unavailable" ? "WebGPU unavailable" :
                            "WGSL module failed"}
                    </strong>
                    <button type="button" onClick={() => void run()}
                        disabled={status === "running"} style={{
                            appearance: "none",
                            padding: "9px 14px",
                            border: "1px solid #7082a3",
                            borderRadius: 9,
                            background: "#202a3d",
                            color: "#f1f5ff",
                            cursor: status === "running" ? "wait" : "pointer",
                        }}>
                        Run again
                    </button>
                </div>
                {diagnostics.length > 0 ? <pre style={{
                    margin: "18px 0 0",
                    padding: 14,
                    overflowX: "auto",
                    borderRadius: 9,
                    background: "rgba(0, 0, 0, 0.28)",
                    color: "#ffd4d4",
                    whiteSpace: "pre-wrap",
                }}>{diagnostics.join("\n")}</pre> : null}
            </div>

            <dl style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                gap: "8px 18px",
                marginTop: 26,
                color: "#b9c5d8",
            }}>
                <dt>Shader bytes</dt>
                <dd style={{ margin: 0 }}>{shaderSource.length.toLocaleString()}</dd>
                <dt>Shader SHA-256</dt>
                <dd style={{
                    margin: 0,
                    overflowWrap: "anywhere",
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                }}>{shaderSha256}</dd>
                <dt>Validation</dt>
                <dd style={{ margin: 0 }}>
                    GPUShaderModule compilation info plus validation error scope
                </dd>
                <dt>Evidence level</dt>
                <dd style={{ margin: 0 }}>
                    Diagnostic only; no support maturity promotion
                </dd>
            </dl>
        </section>
    </main>;
}

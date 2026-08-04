import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
    cleanupGeneratedPlaywrightSessionDaemon,
    parseGeneratedPlaywrightDaemonPid,
} from "./lib/playwright-session-cleanup.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shaderPath = path.join(root, "components/backgrounds/sky/webgpu-shaders.ts");
const transpiledModules = new Map();
const loadTypeScriptModule = async (modulePath) => {
    const resolved = path.resolve(modulePath);
    if (transpiledModules.has(resolved)) return transpiledModules.get(resolved).exports;
    const source = await readFile(resolved, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: resolved,
    });
    const module = { exports: {} };
    transpiledModules.set(resolved, module);
    const dependencyRequests = [...compiled.outputText.matchAll(/require\("(\.[^"]+)"\)/g)]
        .map((match) => match[1]);
    const dependencies = new Map();
    for (const request of dependencyRequests) {
        const candidate = path.resolve(path.dirname(resolved), request);
        const dependencyPath = path.extname(candidate) ? candidate : `${candidate}.ts`;
        dependencies.set(request, await loadTypeScriptModule(dependencyPath));
    }
    const localRequire = (request) => dependencies.has(request)
        ? dependencies.get(request)
        : require(request);
    new Function("exports", "require", "module", compiled.outputText)(
        module.exports,
        localRequire,
        module,
    );
    return module.exports;
};
const shaderModule = { exports: await loadTypeScriptModule(shaderPath) };
const weatherSceneAbi = await loadTypeScriptModule(path.join(
    root,
    "components/backgrounds/sky/weather-scene-abi.ts",
));
const weatherSceneUniformBytes = weatherSceneAbi.WEATHER_SCENE_UNIFORM_BYTES;
const directionalCloudVisibility = await loadTypeScriptModule(path.join(
    root,
    "components/backgrounds/sky/directional-cloud-visibility.ts",
));
const directionalCloudVisibilityOwnerMaskBytes =
    directionalCloudVisibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES;
const directionalCloudVisibilityUniformBytes =
    directionalCloudVisibility.DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES;

const shaderNames = [
    "WEBGPU_ATMOSPHERE_SHADER",
    "WEBGPU_CLOUD_INTERVAL_SHADER",
    "WEBGPU_CLOUD_AUXILIARY_SHADER",
    "WEBGPU_CLOUD_COUPLING_SHADER",
    "WEBGPU_CLOUD_LAYER_SHADER",
    "WEBGPU_HYDROMETEOR_LAYER_SHADER",
    "WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER",
    "WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER",
    "WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER",
    "WEBGPU_CLOUD_METRICS_SHADER",
    "WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER",
    "WEBGPU_STAR_SHADER",
    "WEBGPU_STELLAR_GLOW_SHADER",
    "WEBGPU_MOON_SHADER",
    "WEBGPU_COMPOSITE_SHADER",
];
const shaders = Object.fromEntries(
    shaderNames.map((name) => {
        const code = shaderModule.exports[name];
        if (typeof code !== "string") throw new Error(`Missing shader export ${name}`);
        return [name, code];
    }),
);

// These are the exact composed strings consumed by sky-renderer-canvas.tsx,
// not the source snippets from which they are assembled. Keep a host-side
// fail-closed preflight as well as real GPU compilation: a stale or permissive
// browser must never turn an unresolved production helper or reserved WGSL ABI
// member into a passing validation run.
const productionComposedShaderContracts = [
    ["WEBGPU_CLOUD_AUXILIARY_SHADER",
        ["cloud_lighting_fragment", "cloud_coupling_shadow_compute"],
        ["weather_production_cloud_direct_radiance"]],
    ["WEBGPU_CLOUD_COUPLING_SHADER",
        ["cloud_coupling_shadow_compute"],
        ["cloud_coupling_filtered_macro_owner_sample"]],
    ["WEBGPU_CLOUD_LAYER_SHADER",
        ["cloud_fragment_physical_layer"],
        ["weather_production_cloud_direct_radiance"]],
    ["WEBGPU_HYDROMETEOR_LAYER_SHADER",
        ["hydrometeor_fragment_physical"],
        ["weather_production_cloud_direct_radiance"]],
    ["WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER",
        ["upper_atmosphere_fragment_physical"],
        ["weather_production_cloud_direct_radiance"]],
    ["WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER",
        ["cloud_layer_composite_fragment"], []],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER",
        ["cloud_lv_materialize_source_0_compute",
            "cloud_lv_materialize_source_1_compute",
        ],
        ["cloud_macro_owner_sample", "cloud_morphology_evaluate_owner"]],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER",
        ["cloud_lv_materialize_source_0_compute",
            "cloud_lv_materialize_source_1_compute",
        ],
        ["cloud_lv_query_source_world_medium",
            "cloud_lv_fibratus_transport_optics"]],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER",
        ["cloud_lv_direct_source_0_compute",
            "cloud_lv_direct_source_1_compute",
            "cloud_lv_clear_fluence_compute"], []],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER",
        ["cloud_lv_project_boundary_compute",
            "cloud_lv_materialize_medium_compute",
            "cloud_lv_materialize_medium_fine_compute"],
        ["cloud_macro_owner_sample", "cloud_morphology_evaluate_owner",
            "physical_source_irradiance_at"]],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER",
        ["cloud_lv_prolongate_medium_compute",
            "cloud_lv_restrict_medium_compute",
            "cloud_lv_smooth_compute",
            "cloud_lv_restrict_residual_compute",
            "cloud_lv_prolongate_compute",
            "cloud_lv_copy_fluence_compute",
            "cloud_lv_measure_residual_compute"], []],
    ["WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER",
        ["cloud_lv_materialize_lightning_transfer_compute"],
        ["weather_production_lightning_transfer_bounded"]],
];

// Chromium's WGSL frontends do not all validate unreachable function bodies
// at the same phase. Check the exact production strings structurally so a
// stale five-argument call cannot pass one browser and fail when Chrome/Dawn
// creates the shipping module.
const wgslCallArities = (source, functionName) => {
    const arities = [];
    const pattern = new RegExp(`\\b${functionName}\\s*\\(`, "g");
    for (const match of source.matchAll(pattern)) {
        const open = source.indexOf("(", match.index);
        let depth = 0;
        let segmentStart = open + 1;
        let closed = false;
        let count = 0;
        for (let offset = open; offset < source.length; offset += 1) {
            const character = source[offset];
            if (character === "(") depth += 1;
            if (character === ")") {
                depth -= 1;
                if (depth === 0) {
                    if (source.slice(segmentStart, offset).trim()) count += 1;
                    arities.push(count);
                    closed = true;
                    break;
                }
            } else if (character === "," && depth === 1) {
                if (source.slice(segmentStart, offset).trim()) count += 1;
                segmentStart = offset + 1;
            }
        }
        if (!closed) {
            throw new Error(`${functionName}: unbalanced WGSL call expression.`);
        }
    }
    return arities;
};

const stripWgslComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

// These checks run over every exact shader string exported to the renderer,
// rather than the TypeScript fragments from which the strings are assembled.
// Chrome/Dawn reserves both identifiers, including in code paths that another
// frontend may defer validating until pipeline creation. WGSL also does not
// permit assignment through a multi-component swizzle expression.
for (const [name, code] of Object.entries(shaders)) {
    const uncommentedCode = stripWgslComments(code);
    for (const reservedIdentifier of ["active", "shared"]) {
        if (new RegExp(`\\b${reservedIdentifier}\\b`).test(uncommentedCode)) {
            throw new Error(`${name}: reserved WGSL identifier ` +
                `'${reservedIdentifier}' remains in the exact composed module.`);
        }
    }
    if (/\.[xyzwrgba]{2,4}\s*(?:<<=|>>=|[+\-*/%&|^]=|=(?!=))/
        .test(uncommentedCode)) {
        throw new Error(`${name}: WGSL multi-component swizzle assignment ` +
            "remains in the exact composed module.");
    }
}

for (const [name, entryPoints, requiredFunctions] of
    productionComposedShaderContracts) {
    const code = shaders[name];
    const uncommentedCode = stripWgslComments(code);
    if (/cloud_lv_sample_owner_scattering_radiance\([\s\S]{0,220}?\bdiffusion\s*,\s*asymmetry\s*\)/
        .test(uncommentedCode)) {
        throw new Error(`${name}: cloud-light P1 sampling still uses the removed ` +
            "fifth asymmetry argument.");
    }
    const ownerSampleArities = wgslCallArities(
        uncommentedCode,
        "cloud_macro_owner_sample",
    );
    if (ownerSampleArities.some((arity) => arity !== 8)) {
        throw new Error(`${name}: cloud_macro_owner_sample expects 8 arguments; ` +
            `found ${ownerSampleArities.join(", ")}.`);
    }
    for (const functionName of [...entryPoints, ...requiredFunctions]) {
        const definition = new RegExp(`\\bfn\\s+${functionName}\\s*\\(`);
        if (!definition.test(code)) {
            throw new Error(`${name}: unresolved production function ` +
                `${functionName} in the exact composed shader.`);
        }
    }
}

const requestedPort = Number.parseInt(process.env.SKY_WEBGPU_VALIDATION_PORT ?? "0", 10);
const validationTimeoutMs = Number.parseInt(
    process.env.SKY_WEBGPU_VALIDATION_TIMEOUT_MS ?? "120000",
    10,
);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error("SKY_WEBGPU_VALIDATION_PORT must be an integer from 0 through 65535.");
}
if (!Number.isInteger(validationTimeoutMs) || validationTimeoutMs < 1000) {
    throw new Error("SKY_WEBGPU_VALIDATION_TIMEOUT_MS must be an integer of at least 1000ms.");
}
const payload = JSON.stringify(shaders).replaceAll("</script", "<\\/script");
const html = String.raw`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Elements WebGPU shader validation</title>
<style>
html { color-scheme: dark; font: 14px/1.5 ui-monospace, SFMono-Regular, monospace; background: #070a12; color: #dbe7ff; }
body { max-width: 920px; margin: 48px auto; padding: 0 24px; }
h1 { font: 600 24px/1.2 ui-sans-serif, system-ui; }
#summary { padding: 14px 16px; border-radius: 12px; background: #121827; }
[data-status="passed"] #summary { background: #09291d; color: #b6f7d9; }
[data-status="failed"] #summary { background: #351313; color: #ffd0d0; }
li { margin: 8px 0; white-space: pre-wrap; }
</style>
<body data-status="running">
<h1>Elements WebGPU shader validation</h1>
<p id="summary">Requesting a production-equivalent WebGPU device…</p>
<ol id="results"></ol>
<script>
const shaders = ${payload};
const results = document.querySelector("#results");
const summary = document.querySelector("#summary");
const validationTimeoutMs = ${validationTimeoutMs};
const shaderDiagnosticTimeoutMs = Math.min(validationTimeoutMs, 15_000);
let currentStage = "requesting WebGPU adapter";

function stage(name) {
    currentStage = name;
    summary.textContent = "Validating: " + name + "…";
}

function report(name, passed, detail = "") {
    const item = document.createElement("li");
    item.dataset.passed = String(passed);
    item.textContent = (passed ? "PASS" : "FAIL") + "  " + name + (detail ? "\n" + detail : "");
    results.append(item);
}

async function boundedWebGPUWait(promise, label) {
    let timeout;
    const deadline = new Promise((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error(
            label + " did not complete within " + shaderDiagnosticTimeoutMs + "ms.",
        )), shaderDiagnosticTimeoutMs);
    });
    try {
        return await Promise.race([promise, deadline]);
    } finally {
        window.clearTimeout(timeout);
    }
}

function isErrorSeverity(message) {
    return [message.type, message.severity].some(
        (severity) => String(severity ?? "").toLowerCase() === "error",
    );
}

function formatCompilationMessage(moduleName, message) {
    const line = Number.isFinite(message.lineNum) && message.lineNum > 0
        ? ":" + message.lineNum : "";
    const column = line && Number.isFinite(message.linePos) && message.linePos > 0
        ? ":" + message.linePos : "";
    const severity = String(message.type ?? message.severity ?? "error").toLowerCase();
    return moduleName + line + column + " [" + severity + "] " + message.message;
}

async function compilationErrors(moduleName, module) {
    if (typeof module.getCompilationInfo !== "function") {
        throw new Error(
            moduleName + ": GPUShaderModule.getCompilationInfo() is unavailable; " +
            "refusing to treat unchecked WGSL as valid.",
        );
    }
    const info = await boundedWebGPUWait(
        module.getCompilationInfo(),
        moduleName + " getCompilationInfo()",
    );
    if (!info?.messages || typeof info.messages[Symbol.iterator] !== "function") {
        throw new Error(moduleName + ": getCompilationInfo() returned invalid diagnostics.");
    }
    return [...info.messages].filter(isErrorSeverity);
}

async function validate() {
    stage("requesting WebGPU adapter");
    if (!navigator.gpu) throw new Error("WebGPU is unavailable in this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter was returned.");
    stage("requesting WebGPU device");
    const device = await adapter.requestDevice();
    const modules = {};

    async function withValidationErrorScope(name, operation) {
        device.pushErrorScope("validation");
        let value;
        let operationError = null;
        try {
            value = await operation();
        } catch (error) {
            operationError = error;
        }

        let scopedError = null;
        let scopePopError = null;
        try {
            scopedError = await boundedWebGPUWait(
                device.popErrorScope(),
                name + " validation error scope",
            );
        } catch (error) {
            scopePopError = error;
        }

        const failures = [operationError, scopedError, scopePopError]
            .filter(Boolean)
            .map((error) => error?.message ?? String(error));
        if (failures.length) throw new Error(name + ": " + failures.join("\n"));
        return value;
    }

    for (const [name, code] of Object.entries(shaders)) {
        stage("compiling " + name);
        try {
            modules[name] = await withValidationErrorScope(name, async () => {
                const module = device.createShaderModule({ label: name, code });
                const errors = await compilationErrors(name, module);
                if (errors.length) {
                    throw new Error(errors.map(
                        (error) => formatCompilationMessage(name, error),
                    ).join("\n"));
                }
                return module;
            });
            report(name, true);
        } catch (error) {
            report(name, false, error?.message ?? String(error));
            throw error;
        }
    }

    stage("uploading conservative weather hierarchy");
    device.pushErrorScope("validation");
    const weatherTexture = device.createTexture({
        label: "conservative weather hierarchy upload",
        size: [256, 256, 3],
        format: "rgba8unorm",
        mipLevelCount: 9,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    for (let layer = 0; layer < 3; layer += 1) {
        for (let mipLevel = 0, size = 256; mipLevel < 9; mipLevel += 1, size = Math.max(1, size >> 1)) {
            device.queue.writeTexture(
                { texture: weatherTexture, mipLevel, origin: [0, 0, layer] },
                new Uint8Array(size * size * 4),
                { bytesPerRow: size * 4 },
                [size, size, 1],
            );
        }
    }
    await device.queue.onSubmittedWorkDone();
    const weatherUploadError = await device.popErrorScope();
    if (weatherUploadError) {
        report("conservative hierarchy uploads", false, weatherUploadError.message);
        throw weatherUploadError;
    }
    report("conservative weather hierarchy upload", true);
    const rgba16 = [{ format: "rgba16float" }];
    const fullscreen = (module, entryPoint) => ({ module, entryPoint });
    const fragmentVisibility = GPUShaderStage.FRAGMENT;
    const computeVisibility = GPUShaderStage.COMPUTE;
    const readOnlyStorage = (minBindingSize) => ({
        visibility: fragmentVisibility,
        buffer: { type: "read-only-storage", minBindingSize },
    });
    const uniform = (minBindingSize) => ({
        visibility: fragmentVisibility,
        buffer: { type: "uniform", minBindingSize },
    });
    const sampled2d = {
        visibility: fragmentVisibility,
        texture: { sampleType: "float", viewDimension: "2d" },
    };
    const unfilterable2d = {
        visibility: fragmentVisibility,
        texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
    };
    const sampled2dArray = {
        visibility: fragmentVisibility,
        texture: { sampleType: "float", viewDimension: "2d-array" },
    };
    const sampled3d = {
        visibility: fragmentVisibility,
        texture: { sampleType: "float", viewDimension: "3d" },
    };
    const filteringSampler = {
        visibility: fragmentVisibility,
        sampler: { type: "filtering" },
    };
    const computeReadOnlyStorage = (minBindingSize) => ({
        visibility: computeVisibility,
        buffer: { type: "read-only-storage", minBindingSize },
    });
    const computeUniform = (minBindingSize) => ({
        visibility: computeVisibility,
        buffer: { type: "uniform", minBindingSize },
    });
    const computeSampled2dArray = {
        visibility: computeVisibility,
        texture: { sampleType: "float", viewDimension: "2d-array" },
    };
    const computeSampled3d = {
        visibility: computeVisibility,
        texture: { sampleType: "float", viewDimension: "3d" },
    };
    const computeUnfilterable3d = {
        visibility: computeVisibility,
        texture: { sampleType: "unfilterable-float", viewDimension: "3d" },
    };
    const computeUnfilterable2d = {
        visibility: computeVisibility,
        texture: { sampleType: "unfilterable-float", viewDimension: "2d" },
    };
    const computeFilteringSampler = {
        visibility: computeVisibility,
        sampler: { type: "filtering" },
    };
    const computeWriteOnlyStorage2dArray = {
        visibility: computeVisibility,
        storageTexture: {
            access: "write-only",
            format: "rgba16float",
            viewDimension: "2d-array",
        },
    };
    const entry = (binding, descriptor) => ({ binding, ...descriptor });
    const productionParameterBufferBytes = 54 * 16;

    // Explicit production layouts are intentional. Auto layouts remove
    // resources that an individual entry point dead-code-eliminates, allowing
    // a validator bind group to omit a production resource unnoticed until a
    // later shader edit activates it. These layouts make the application's
    // exact resource contract mandatory even on cold/empty validation data.
    const intervalBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud interval bind group layout",
        entries: [
            entry(0, readOnlyStorage(productionParameterBufferBytes)),
            entry(1, readOnlyStorage(21 * 16)),
        ],
    });
    const lightingBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud lighting bind group layout",
        entries: [
            entry(0, readOnlyStorage(productionParameterBufferBytes)),
            entry(1, readOnlyStorage(21 * 16)),
            entry(2, sampled3d), entry(3, sampled3d),
            entry(4, sampled2dArray), entry(5, filteringSampler),
            entry(7, sampled2d), entry(8, sampled2d),
            entry(15, readOnlyStorage(36 * 128)),
            entry(16, sampled3d), entry(17, sampled3d),
            entry(18, filteringSampler),
            entry(32, sampled3d),
            entry(19, readOnlyStorage((1 + 36 * 16) * 16)),
            entry(20, readOnlyStorage((1 + 36 * 5) * 16)),
            entry(23, readOnlyStorage(67 * 128)),
            entry(24, readOnlyStorage(36 * 4 * 16)),
            entry(25, uniform(256)),
            entry(30, unfilterable2d),
        ],
    });
    const sharedCloudReadOnlyStorage = {
        visibility: fragmentVisibility,
        buffer: { type: "read-only-storage" },
    };
    const sharedCloudUniform = {
        visibility: fragmentVisibility,
        buffer: { type: "uniform" },
    };
    // Exact application-owned layout mirrored from sky-renderer-canvas.tsx.
    // It is shared by all three cloud specializations and both finite-weather
    // pipelines; no layout extracted from an auto pipeline is reused.
    const cloudBindGroupEntries = [
        entry(0, sharedCloudReadOnlyStorage),
        entry(1, sharedCloudReadOnlyStorage),
        entry(2, sampled3d), entry(3, sampled3d),
        entry(4, sampled2dArray), entry(5, filteringSampler),
        entry(6, sampled2d), entry(7, sampled2d), entry(8, sampled2d),
        entry(9, sampled2d), entry(14, sampled2dArray),
        entry(15, sharedCloudReadOnlyStorage),
        entry(16, sampled3d), entry(17, sampled3d),
        entry(18, filteringSampler),
        entry(32, sampled3d),
        entry(19, sharedCloudReadOnlyStorage),
        entry(20, sharedCloudReadOnlyStorage),
        entry(21, sampled2d), entry(22, filteringSampler),
        entry(23, sharedCloudReadOnlyStorage),
        entry(24, sharedCloudReadOnlyStorage),
        entry(25, sharedCloudUniform), entry(26, sampled2d),
        entry(28, filteringSampler),
        entry(29, sharedCloudReadOnlyStorage),
        entry(30, unfilterable2d),
        entry(34, sharedCloudUniform),
        entry(35, sharedCloudUniform),
    ];
    const cloudBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud transport bind group layout",
        entries: cloudBindGroupEntries,
    });
    const intervalPipelineLayout = device.createPipelineLayout({
        label: "production cloud interval pipeline layout",
        bindGroupLayouts: [intervalBindGroupLayout],
    });
    const lightingPipelineLayout = device.createPipelineLayout({
        label: "production cloud lighting pipeline layout",
        bindGroupLayouts: [lightingBindGroupLayout],
    });
    const cloudLightViewEntries = [
        entry(0, sharedCloudUniform),
        entry(1, sampled3d),
        entry(2, sampled3d),
    ];
    const cloudLightViewBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud light-volume view bind group layout",
        entries: cloudLightViewEntries,
    });
    const coreMaxSampledTexturesPerShaderStage = 16;
    const cloudFragmentSampledTextureCount = [
        ...cloudBindGroupEntries,
        ...cloudLightViewEntries,
    ].filter((layoutEntry) =>
        (layoutEntry.visibility & fragmentVisibility) !== 0 &&
        layoutEntry.texture !== undefined).length;
    if (cloudFragmentSampledTextureCount > coreMaxSampledTexturesPerShaderStage) {
        throw new Error("Production cloud fragment requires " +
            cloudFragmentSampledTextureCount + " sampled textures; WebGPU core permits " +
            coreMaxSampledTexturesPerShaderStage + ".");
    }
    report("aggregate cloud fragment sampled-texture core limit", true,
        cloudFragmentSampledTextureCount + "/" +
            coreMaxSampledTexturesPerShaderStage);
    const layerCompositorBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud layer compositor bind group layout",
        entries: [
            entry(0, sampled2dArray),
            entry(1, sampled2dArray),
            entry(2, sampled2dArray),
            entry(3, readOnlyStorage(productionParameterBufferBytes)),
        ],
    });
    const layerCompositorPipelineLayout = device.createPipelineLayout({
        label: "production cloud layer compositor pipeline layout",
        bindGroupLayouts: [layerCompositorBindGroupLayout],
    });
    const layerCompositorSampledTextureCount = 3;
    if (layerCompositorSampledTextureCount >
        coreMaxSampledTexturesPerShaderStage) {
        throw new Error("Cloud layer compositor requires " +
            layerCompositorSampledTextureCount +
            " sampled textures; WebGPU core permits " +
            coreMaxSampledTexturesPerShaderStage + ".");
    }
    report("cloud layer compositor sampled-texture core limit", true,
        layerCompositorSampledTextureCount + "/" +
            coreMaxSampledTexturesPerShaderStage);
    const compositeFragmentSampledTextureCount = 13;
    if (compositeFragmentSampledTextureCount >
        coreMaxSampledTexturesPerShaderStage) {
        throw new Error("Production composite requires " +
            compositeFragmentSampledTextureCount +
            " sampled textures; WebGPU core permits " +
            coreMaxSampledTexturesPerShaderStage + ".");
    }
    report("aggregate composite sampled-texture core limit", true,
        compositeFragmentSampledTextureCount + "/" +
            coreMaxSampledTexturesPerShaderStage);
    const rgba16floatBytesPerSample = 8;
    const presentationBytesPerSample = 4;
    const cloudLayerAttachmentCount = 3;
    const cloudAttachmentCount = 4;
    const compositeAttachmentCount = 4;
    const coreMaxColorAttachments = 8;
    const coreMaxColorAttachmentBytesPerSample = 32;
    const cloudLayerAttachmentBytesPerSample =
        cloudLayerAttachmentCount * rgba16floatBytesPerSample;
    const cloudAttachmentBytesPerSample =
        cloudAttachmentCount * rgba16floatBytesPerSample;
    const compositeAttachmentBytesPerSample = presentationBytesPerSample +
        3 * rgba16floatBytesPerSample;
    if (cloudLayerAttachmentCount > coreMaxColorAttachments ||
        cloudAttachmentCount > coreMaxColorAttachments ||
        compositeAttachmentCount > coreMaxColorAttachments ||
        cloudLayerAttachmentBytesPerSample >
            coreMaxColorAttachmentBytesPerSample ||
        cloudAttachmentBytesPerSample >
            coreMaxColorAttachmentBytesPerSample ||
        compositeAttachmentBytesPerSample >
            coreMaxColorAttachmentBytesPerSample) {
        throw new Error("RGB camera-transport MRT exceeds WebGPU core limits.");
    }
    report("RGB camera-transport MRT core limit", true,
        cloudLayerAttachmentBytesPerSample + "/" +
            coreMaxColorAttachmentBytesPerSample + " layer bytes/sample; " +
        cloudAttachmentBytesPerSample + "/" +
            coreMaxColorAttachmentBytesPerSample + " cloud bytes/sample; " +
        compositeAttachmentBytesPerSample + "/" +
            coreMaxColorAttachmentBytesPerSample +
            " composite bytes/sample; 4/8 attachments");
    const cloudPipelineLayout = device.createPipelineLayout({
        label: "production cloud transport pipeline layout",
        bindGroupLayouts: [cloudBindGroupLayout, cloudLightViewBindGroupLayout],
    });
    const cloudCouplingShadowBindGroupLayout = device.createBindGroupLayout({
        label: "production cloud coupling shadow bind group layout",
        entries: [
            entry(0, computeReadOnlyStorage(productionParameterBufferBytes)),
            entry(1, computeReadOnlyStorage(21 * 16)),
            entry(2, computeSampled3d), entry(3, computeSampled3d),
            entry(5, computeFilteringSampler),
            entry(16, computeSampled3d), entry(17, computeUnfilterable3d),
            entry(18, computeFilteringSampler),
            entry(32, computeSampled3d),
            entry(19, computeReadOnlyStorage((1 + 36 * 16) * 16)),
            entry(20, computeReadOnlyStorage((1 + 36 * 5) * 16)),
            entry(23, computeReadOnlyStorage(67 * 128)),
            entry(24, computeReadOnlyStorage(36 * 4 * 16)),
            entry(25, computeUniform(256)),
            entry(30, computeUnfilterable2d),
            entry(31, computeWriteOnlyStorage2dArray),
            entry(34, computeUniform(
                ${directionalCloudVisibilityUniformBytes})),
            entry(36, computeReadOnlyStorage(
                ${directionalCloudVisibilityOwnerMaskBytes})),
        ],
    });
    const cloudCouplingShadowPipelineLayout = device.createPipelineLayout({
        label: "production cloud coupling shadow pipeline layout",
        bindGroupLayouts: [cloudCouplingShadowBindGroupLayout],
    });
    const descriptors = [
        ["atmosphere pipeline", {
            layout: "auto",
            vertex: fullscreen(modules.WEBGPU_ATMOSPHERE_SHADER, "fullscreen_vertex"),
            fragment: { module: modules.WEBGPU_ATMOSPHERE_SHADER, entryPoint: "atmosphere_fragment", targets: rgba16 },
            primitive: { topology: "triangle-list" },
        }],
        ["cloud layer 0 MRT pipeline", {
            layout: cloudPipelineLayout,
            vertex: fullscreen(modules.WEBGPU_CLOUD_LAYER_SHADER, "fullscreen_vertex"),
            fragment: {
                module: modules.WEBGPU_CLOUD_LAYER_SHADER,
                entryPoint: "cloud_fragment_physical_layer",
                targets: [
                { format: "rgba16float" }, { format: "rgba16float" },
                { format: "rgba16float" },
            ] },
            primitive: { topology: "triangle-list" },
        }],
        ["hydrometeor MRT pipeline", {
            layout: cloudPipelineLayout,
            vertex: fullscreen(
                modules.WEBGPU_HYDROMETEOR_LAYER_SHADER,
                "fullscreen_vertex",
            ),
            fragment: {
                module: modules.WEBGPU_HYDROMETEOR_LAYER_SHADER,
                entryPoint: "hydrometeor_fragment_physical",
                targets: [
                    { format: "rgba16float" }, { format: "rgba16float" },
                    { format: "rgba16float" },
                ],
            },
            primitive: { topology: "triangle-list" },
        }],
        ["upper atmosphere MRT pipeline", {
            layout: cloudPipelineLayout,
            vertex: fullscreen(
                modules.WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER,
                "fullscreen_vertex",
            ),
            fragment: {
                module: modules.WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER,
                entryPoint: "upper_atmosphere_fragment_physical",
                targets: [
                    { format: "rgba16float" }, { format: "rgba16float" },
                    { format: "rgba16float" },
                ],
            },
            primitive: { topology: "triangle-list" },
        }],
        ["cloud layer compositor MRT pipeline", {
            layout: layerCompositorPipelineLayout,
            vertex: fullscreen(
                modules.WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER,
                "fullscreen_vertex",
            ),
            fragment: {
                module: modules.WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER,
                entryPoint: "cloud_layer_composite_fragment",
                targets: [
                    { format: "rgba16float" }, { format: "rgba16float" },
                    { format: "rgba16float" }, { format: "rgba16float" },
                ],
            },
            primitive: { topology: "triangle-list" },
        }],
        ["cloud interval MRT pipeline", {
            layout: intervalPipelineLayout,
            vertex: fullscreen(modules.WEBGPU_CLOUD_INTERVAL_SHADER, "fullscreen_vertex"),
            fragment: {
                module: modules.WEBGPU_CLOUD_INTERVAL_SHADER,
                entryPoint: "cloud_interval_fragment",
                targets: [{ format: "rgba16float" }, { format: "rgba16float" }],
            },
            primitive: { topology: "triangle-list" },
        }],
        ["cloud lighting MRT pipeline", {
            layout: lightingPipelineLayout,
            vertex: fullscreen(
                modules.WEBGPU_CLOUD_AUXILIARY_SHADER,
                "fullscreen_vertex",
            ),
            fragment: {
                module: modules.WEBGPU_CLOUD_AUXILIARY_SHADER,
                entryPoint: "cloud_lighting_fragment",
                targets: [
                    { format: "rgba16float" },
                    { format: "rgba16float" },
                    { format: "rgba16float" },
                ],
            },
            primitive: { topology: "triangle-list" },
        }],
        ["star pipeline", {
            layout: "auto",
            vertex: {
                module: modules.WEBGPU_STAR_SHADER,
                entryPoint: "star_vertex",
                buffers: [
                    { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
                    { arrayStride: 80, stepMode: "instance", attributes: [
                        { shaderLocation: 1, offset: 0, format: "float32x3" },
                        { shaderLocation: 2, offset: 12, format: "float32" },
                        { shaderLocation: 3, offset: 16, format: "float32x3" },
                        { shaderLocation: 4, offset: 28, format: "float32" },
                        { shaderLocation: 5, offset: 32, format: "float32" },
                        { shaderLocation: 6, offset: 36, format: "float32" },
                        { shaderLocation: 7, offset: 40, format: "float32" },
                        { shaderLocation: 8, offset: 44, format: "float32" },
                        { shaderLocation: 9, offset: 48, format: "float32" },
                        { shaderLocation: 10, offset: 52, format: "float32" },
                        { shaderLocation: 11, offset: 56, format: "float32" },
                        { shaderLocation: 12, offset: 60, format: "float32" },
                        { shaderLocation: 13, offset: 64, format: "float32" },
                        { shaderLocation: 14, offset: 68, format: "float32" },
                        { shaderLocation: 15, offset: 72, format: "float32x2" },
                    ] },
                ],
            },
            fragment: { module: modules.WEBGPU_STAR_SHADER, entryPoint: "star_fragment", targets: [{
                format: "rgba16float",
                blend: { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } },
            }] },
            primitive: { topology: "triangle-list" },
        }],
        ["moon pipeline", {
            layout: "auto",
            vertex: { module: modules.WEBGPU_MOON_SHADER, entryPoint: "moon_vertex", buffers: [{
                arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
            }] },
            fragment: { module: modules.WEBGPU_MOON_SHADER, entryPoint: "moon_fragment", targets: [{
                format: "rgba16float",
                // Lunar radiance is an additive boundary contribution. Solar
                // occultation is already resolved in the atmosphere shader;
                // alpha replacement here would darken foreground in-scatter.
                blend: { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } },
            }] },
            primitive: { topology: "triangle-list" },
        }],
        ["composite pipeline", {
            layout: "auto",
            vertex: fullscreen(modules.WEBGPU_COMPOSITE_SHADER, "fullscreen_vertex"),
            fragment: { module: modules.WEBGPU_COMPOSITE_SHADER, entryPoint: "composite_fragment", targets: [
                { format: navigator.gpu.getPreferredCanvasFormat() },
                { format: "rgba16float" },
                { format: "rgba16float" },
                { format: "rgba16float" },
            ] },
            primitive: { topology: "triangle-list" },
        }],
    ];

    for (const entryPoint of ["glow_extract_fragment", "glow_downsample_fragment", "glow_blur_h_fragment", "glow_blur_v_fragment"]) {
        descriptors.push([entryPoint, {
            layout: "auto",
            vertex: fullscreen(modules.WEBGPU_STELLAR_GLOW_SHADER, "fullscreen_vertex"),
            fragment: { module: modules.WEBGPU_STELLAR_GLOW_SHADER, entryPoint, targets: rgba16 },
            primitive: { topology: "triangle-list" },
        }]);
    }

    const createdPipelines = {};
    for (const [name, descriptor] of descriptors) {
        stage("creating " + name);
        try {
            createdPipelines[name] = await withValidationErrorScope(name, () =>
                device.createRenderPipelineAsync({
                    label: name,
                    ...descriptor,
                }));
            report(name, true);
        } catch (error) {
            report(name, false, error?.message ?? String(error));
            throw error;
        }
    }

    stage("creating cloud coupling shadow compute pipeline");
    try {
        createdPipelines["cloud coupling shadow compute pipeline"] =
            await withValidationErrorScope(
                "cloud coupling shadow compute pipeline",
                () => device.createComputePipelineAsync({
                    label: "cloud coupling shadow compute pipeline",
                    layout: cloudCouplingShadowPipelineLayout,
                    compute: {
                        module: modules.WEBGPU_CLOUD_COUPLING_SHADER,
                        entryPoint: "cloud_coupling_shadow_compute",
                    },
                }),
            );
        report("cloud coupling shadow compute pipeline", true);
    } catch (error) {
        report("cloud coupling shadow compute pipeline", false,
            error?.message ?? String(error));
        throw error;
    }

    const cloudLightEntries = [
        ["cloud_lv_project_boundary_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER"],
        ["cloud_lv_materialize_medium_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER"],
        ["cloud_lv_materialize_medium_fine_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER"],
        ["cloud_lv_materialize_source_0_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER"],
        ["cloud_lv_materialize_source_1_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER"],
        ["cloud_lv_materialize_source_0_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER", " fibratus"],
        ["cloud_lv_materialize_source_1_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER", " fibratus"],
        ["cloud_lv_materialize_lightning_transfer_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER"],
        ["cloud_lv_direct_source_0_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER"],
        ["cloud_lv_direct_source_1_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER"],
        ["cloud_lv_clear_fluence_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER"],
        ["cloud_lv_prolongate_medium_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_restrict_medium_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_smooth_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_restrict_residual_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_prolongate_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_copy_fluence_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
        ["cloud_lv_measure_residual_compute",
            "WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER"],
    ];
    for (const [entryPoint, moduleName, variant = ""] of cloudLightEntries) {
        const name = "cloud light-volume " + entryPoint + variant;
        stage("creating " + name);
        try {
            createdPipelines[name] = await withValidationErrorScope(name, () =>
                device.createComputePipelineAsync({
                    label: name,
                    layout: "auto",
                    compute: {
                        module: modules[moduleName],
                        entryPoint,
                    },
                }));
            report(name, true);
        } catch (error) {
            report(name, false, error?.message ?? String(error));
            throw error;
        }
    }

    stage("creating cloud metrics compute pipeline");
    try {
        createdPipelines["cloud metrics compute pipeline"] =
            await withValidationErrorScope("cloud metrics compute pipeline", () =>
                device.createComputePipelineAsync({
                    label: "cloud metrics compute pipeline",
                    layout: "auto",
                    compute: {
                        module: modules.WEBGPU_CLOUD_METRICS_SHADER,
                        entryPoint: "cloud_metrics_compute",
                    },
                }));
        report("cloud metrics compute pipeline", true);
    } catch (error) {
        report("cloud metrics compute pipeline", false, error?.message ?? String(error));
        throw error;
    }

    stage("creating cloud reconstruction metrics compute pipeline");
    try {
        createdPipelines["cloud reconstruction metrics compute pipeline"] =
            await withValidationErrorScope(
                "cloud reconstruction metrics compute pipeline",
                () => device.createComputePipelineAsync({
                    label: "cloud reconstruction metrics compute pipeline",
                    layout: "auto",
                    compute: {
                        module: modules.WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER,
                        entryPoint: "cloud_reconstruction_metrics_compute",
                    },
                }),
            );
        report("cloud reconstruction metrics compute pipeline", true);
    } catch (error) {
        report("cloud reconstruction metrics compute pipeline", false,
            error?.message ?? String(error));
        throw error;
    }

    stage("creating production cloud bind groups");
    device.pushErrorScope("validation");
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    const parameterBuffer = device.createBuffer({
        size: productionParameterBufferBytes,
        usage: storageUsage,
    });
    const layerBuffer = device.createBuffer({ size: 21 * 16, usage: storageUsage });
    const cloudFeatureBuffer = device.createBuffer({ size: 36 * 128, usage: storageUsage });
    const cloudSystemBuffer = device.createBuffer({ size: (1 + 36 * 16) * 16, usage: storageUsage });
    const cloudMacroBindingBuffer = device.createBuffer({ size: (1 + 36 * 5) * 16, usage: storageUsage });
    const cloudOpticalStateBuffer = device.createBuffer({ size: 67 * 128, usage: storageUsage });
    const cloudOpticalOwnerBuffer = device.createBuffer({ size: 36 * 4 * 16, usage: storageUsage });
    const hydrometeorBuffer = device.createBuffer({ size: (1 + 96 * 16) * 16, usage: storageUsage });
    const weatherSceneUniformBuffer = device.createBuffer({
        size: ${weatherSceneUniformBytes},
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const physicalAtmosphereBuffer = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const cloudLightComputeUniformBuffer = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const cloudLightBrickBuffer = device.createBuffer({
        size: 6 * 19 * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const cloudLightSourceBuffer = device.createBuffer({
        size: 2 * 2 * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const cloudLightBoundaryBuffer = device.createBuffer({
        size: 6 * 6 * 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const cloudLightViewUniformBuffer = device.createBuffer({
        size: 32 + 6 * 19 * 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const directionalCloudVisibilityUniformBuffer = device.createBuffer({
        size: ${directionalCloudVisibilityUniformBytes},
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const directionalCloudVisibilityOwnerMaskBuffer = device.createBuffer({
        size: ${directionalCloudVisibilityOwnerMaskBytes},
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const cloudLightResidualBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
    });
    const sampledUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
    const renderSampledUsage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
    const baseVolume = device.createTexture({
        size: [8, 8, 8], dimension: "3d", format: "rgba8unorm", usage: sampledUsage,
    });
    const detailVolume = device.createTexture({
        size: [8, 8, 8], dimension: "3d", format: "rgba8unorm", usage: sampledUsage,
    });
    const atmosphereTransmittance = device.createTexture({
        size: [256, 64], format: "rgba16float", usage: sampledUsage,
    });
    const atmosphereMultipleScattering = device.createTexture({
        size: [32, 32], format: "rgba16float", usage: sampledUsage,
    });
    const intervalLowMiddle = device.createTexture({
        size: [8, 8], format: "rgba16float", usage: renderSampledUsage,
    });
    const intervalHighMask = device.createTexture({
        size: [8, 8], format: "rgba16float", usage: renderSampledUsage,
    });
    const lightingLayers = device.createTexture({
        label: "validation three-layer resolved cloud lighting",
        size: [4, 4, 3], format: "rgba16float", usage: renderSampledUsage,
    });
    const directionalCouplingAtlas = device.createTexture({
        size: [96, 96, 193], format: "rgba16float",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_DST,
    });
    const directionalCouplingAtlasView = directionalCouplingAtlas.createView({
        dimension: "2d-array",
        baseArrayLayer: 0,
        arrayLayerCount: 193,
    });
    const cloudMacroAtlas = device.createTexture({
        size: [8, 8, 8], dimension: "3d", format: "rgba8unorm", usage: sampledUsage,
    });
    const cloudMacroMajorants = device.createTexture({
        size: [2, 2, 2], dimension: "3d", format: "r8unorm", usage: sampledUsage,
    });
    const cloudHighIceSourceAtlas = device.createTexture({
        size: [8, 8, 8], dimension: "3d", format: "rgba8unorm", usage: sampledUsage,
    });
    const cloudOpticalPhase = device.createTexture({
        size: [8, 1], format: "rgba16float", usage: sampledUsage,
    });
    const cloudMorphologyModifiers = device.createTexture({
        size: [256, 10], format: "rgba32float", usage: sampledUsage,
    });
    const blueNoiseTexture = device.createTexture({
        size: [64, 64], format: "r8unorm", usage: sampledUsage,
    });
    const cloudLightUsage = GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST;
    const cloudLightTexture = (depth, label) => device.createTexture({
        label,
        size: [48, 32, depth],
        mipLevelCount: 4,
        dimension: "3d",
        format: "rgba16float",
        usage: cloudLightUsage,
    });
    const cloudLightMediumExtinction = cloudLightTexture(288,
        "validation cloud light extinction");
    const cloudLightMediumScattering = cloudLightTexture(288,
        "validation cloud light scattering");
    const cloudLightDirectSun = cloudLightTexture(288,
        "validation cloud light Sun Beer");
    const cloudLightDirectMoon = cloudLightTexture(288,
        "validation cloud light Moon Beer");
    const cloudLightFluenceScratch = cloudLightTexture(288,
        "validation cloud light scratch");
    const cloudLightPackedView = cloudLightTexture(1728,
        "validation cloud light packed view");
    const cloudLightLightning = cloudLightTexture(576,
        "validation cloud light double-bank lightning transfer");
    const volumeSampler = device.createSampler({
        magFilter: "linear", minFilter: "linear",
        addressModeU: "repeat", addressModeV: "repeat", addressModeW: "repeat",
    });
    const linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    const clampSampler = device.createSampler({
        magFilter: "linear", minFilter: "linear",
        addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
        addressModeW: "clamp-to-edge",
    });
    const commonDensityEntries = [
        { binding: 0, resource: { buffer: parameterBuffer } },
        { binding: 1, resource: { buffer: layerBuffer } },
        { binding: 2, resource: baseVolume.createView() },
        { binding: 3, resource: detailVolume.createView() },
        { binding: 4, resource: weatherTexture.createView() },
        { binding: 5, resource: volumeSampler },
        { binding: 15, resource: { buffer: cloudFeatureBuffer } },
        { binding: 16, resource: cloudMacroAtlas.createView() },
        { binding: 17, resource: cloudMacroMajorants.createView() },
        { binding: 18, resource: clampSampler },
        { binding: 32, resource: cloudHighIceSourceAtlas.createView() },
        { binding: 19, resource: { buffer: cloudSystemBuffer } },
        { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
        { binding: 30, resource: cloudMorphologyModifiers.createView() },
    ];
    const intervalBindGroup = device.createBindGroup({
        layout: intervalBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: parameterBuffer } },
            { binding: 1, resource: { buffer: layerBuffer } },
        ],
    });
    const lightingBindGroup = device.createBindGroup({
        layout: lightingBindGroupLayout,
        entries: [
            ...commonDensityEntries,
            { binding: 7, resource: intervalLowMiddle.createView() },
            { binding: 8, resource: intervalHighMask.createView() },
            { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
            { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
            { binding: 25, resource: { buffer: physicalAtmosphereBuffer } },
        ],
    });
    const cloudCouplingShadowBindGroup = device.createBindGroup({
        layout: cloudCouplingShadowBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: parameterBuffer } },
            { binding: 1, resource: { buffer: layerBuffer } },
            { binding: 2, resource: baseVolume.createView() },
            { binding: 3, resource: detailVolume.createView() },
            { binding: 5, resource: volumeSampler },
            { binding: 16, resource: cloudMacroAtlas.createView() },
            { binding: 17, resource: cloudMacroMajorants.createView() },
            { binding: 18, resource: clampSampler },
            { binding: 32, resource: cloudHighIceSourceAtlas.createView() },
            { binding: 19, resource: { buffer: cloudSystemBuffer } },
            { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
            { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
            { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
            { binding: 25, resource: { buffer: physicalAtmosphereBuffer } },
            { binding: 30, resource: cloudMorphologyModifiers.createView() },
            { binding: 31, resource: directionalCouplingAtlasView },
            ...(directional ? [{
                binding: 34,
                resource: { buffer: directionalCloudVisibilityUniformBuffer },
            }] : []),
            { binding: 36,
                resource: { buffer: directionalCloudVisibilityOwnerMaskBuffer } },
        ],
    });
    const cloudBindGroup = device.createBindGroup({
        layout: cloudBindGroupLayout,
        entries: [
            ...commonDensityEntries,
            { binding: 6, resource: atmosphereTransmittance.createView() },
            { binding: 7, resource: intervalLowMiddle.createView() },
            { binding: 8, resource: intervalHighMask.createView() },
            { binding: 9, resource: blueNoiseTexture.createView() },
            { binding: 14, resource: directionalCouplingAtlasView },
            { binding: 21, resource: cloudOpticalPhase.createView() },
            { binding: 22, resource: clampSampler },
            { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
            { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
            { binding: 25, resource: { buffer: physicalAtmosphereBuffer } },
            { binding: 26, resource: atmosphereMultipleScattering.createView() },
            { binding: 28, resource: clampSampler },
            { binding: 29, resource: { buffer: hydrometeorBuffer } },
            {
                binding: 34,
                resource: { buffer: directionalCloudVisibilityUniformBuffer },
            },
            { binding: 35, resource: { buffer: weatherSceneUniformBuffer } },
        ],
    });
    const cloudLightViewBindGroup = device.createBindGroup({
        layout: cloudLightViewBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: cloudLightViewUniformBuffer } },
            { binding: 1, resource: cloudLightPackedView.createView() },
            { binding: 2, resource: cloudLightPackedView.createView() },
        ],
    });
    const bindGroupError = await device.popErrorScope();
    if (bindGroupError) {
        report("production cloud bind groups", false, bindGroupError.message);
        throw bindGroupError;
    }
    report("production cloud bind groups", true);

    // Execute the same dependency-ordered cloud graph as the application. A
    // successful pipeline or bind-group creation does not prove that all
    // attachment formats, resource hazards, and entry-point execution agree.
    // This tiny deterministic scene keeps CI cost bounded while forcing the
    // interval, cached-lighting, and transport shaders through a real submit.
    const parameters = new Float32Array(54 * 4);
    const setVector = (target, index, values) => target.set(values, index * 4);
    setVector(parameters, 0, [8, 8, 17.25, 0]);
    setVector(parameters, 1, [0.68, 0.24, 0.34, 0.31]);
    setVector(parameters, 2, [0.15, 0.2, 0.45, 0.55]);
    setVector(parameters, 3, [12, 0.2, 0.5, 0.5]);
    setVector(parameters, 4, [2.2, 0, 1.6, 0]);
    setVector(parameters, 14, [0.17, 0.43, 0.71, 0.89]);
    setVector(parameters, 15, [4.5, 3.9, 3.2, 1]);
    setVector(parameters, 16, [0.025, 0.03, 0.04, 1]);
    setVector(parameters, 17, [0.12, 0.17, 0.24, 1]);
    setVector(parameters, 18, [0.08, 0.07, 0.055, 1]);
    setVector(parameters, 19, [0.4, 0.04, 0.2, 0]);
    setVector(parameters, 20, [0.1, 0.15, 8, 0]);
    setVector(parameters, 22, [0, 0, 0, 0]);
    setVector(parameters, 29, [2, 0, 0, 0]);
    setVector(parameters, 30, [0, 0, 0, 0]);
    setVector(parameters, 31, [2.2, 0, 1.6, 0]);
    setVector(parameters, 32, [2.2, 0, 1.6, 0]);
    setVector(parameters, 33, [0.58, 0.72, 0.38, 0]);
    setVector(parameters, 34, [-0.22, 0.46, 0.86, 0]);
    // p[53] is the append-only camera-yaw packet: current and previous yaw.
    // The validator scene uses the explicit 180° reference heading, so both
    // values are zero and preserve the legacy benchmark orientation.
    setVector(parameters, 53, [0, 0, 0, 0]);
    const layerValues = new Float32Array(18 * 4);
    setVector(layerValues, 0, [0.8, 1.35, 0.58, 1.25]);
    setVector(layerValues, 1, [0.15, 0.62, 0.05, 0.72]);
    setVector(layerValues, 2, [0.004, 0.002, 0.18, 0.32]);
    setVector(layerValues, 3, [0.06, 0, 1, 0.37]);
    setVector(layerValues, 4, [0.42, 1.176, 9, 0.034]);
    setVector(layerValues, 5, [1, 0.5, 0.45, 0.5]);
    const atmosphereUniforms = new Float32Array(64);
    setVector(atmosphereUniforms, 0, [6371, 6471, 8, 1.2]);
    setVector(atmosphereUniforms, 1, [0.005802, 0.013558, 0.0331, 0.76]);
    setVector(atmosphereUniforms, 2, [0.004, 0.004, 0.004, 0.001]);
    setVector(atmosphereUniforms, 3, [0.0004, 0.0004, 0.0004, 25]);
    setVector(atmosphereUniforms, 4, [0.00065, 0.001881, 0.000085, 15]);
    setVector(atmosphereUniforms, 5, [0.15, 0.15, 0.15, 1]);
    setVector(atmosphereUniforms, 6, [0.583, 0.382, 0.717, 1]);
    setVector(atmosphereUniforms, 7, [128000, 128000, 128000, 0.004675]);
    setVector(atmosphereUniforms, 8, [-0.221, 0.864, 0.462, 1]);
    setVector(atmosphereUniforms, 9, [12, 12, 12, 0.00452]);
    setVector(atmosphereUniforms, 10, [0, 0, 0, 0]);
    setVector(atmosphereUniforms, 11, [0, 100, 48, 32]);
    setVector(atmosphereUniforms, 12, [0, 0, 6371.001, 1]);
    device.queue.writeBuffer(parameterBuffer, 0, parameters);
    device.queue.writeBuffer(layerBuffer, 0, layerValues);
    device.queue.writeBuffer(physicalAtmosphereBuffer, 0, atmosphereUniforms);
    const cloudLightUniformBytes = new ArrayBuffer(64);
    const cloudLightUniformData = new DataView(cloudLightUniformBytes);
    [48, 32, 48, 6, 1, 0, 0, 48].forEach((value, index) =>
        cloudLightUniformData.setUint32(index * 4, value, true));
    [0.72, 1e-4, 65504, 0.02].forEach((value, index) =>
        cloudLightUniformData.setFloat32(32 + index * 4, value, true));
    [0, 1, 1, 0].forEach((value, index) =>
        cloudLightUniformData.setUint32(48 + index * 4, value, true));
    const cloudLightBricks = new Float32Array(6 * 19 * 4);
    const writeCloudLightTransform = (offset) => {
        cloudLightBricks.set([0, 6371.5, 0, 1], offset);
        cloudLightBricks.set([1, 0, 0, 0.06], offset + 4);
        cloudLightBricks.set([0, 1, 0, 0.05], offset + 8);
        cloudLightBricks.set([0, 0, 1, 0.06], offset + 12);
    };
    writeCloudLightTransform(0);
    writeCloudLightTransform(16);
    writeCloudLightTransform(32);
    cloudLightBricks.set([0, 0, 0, 1], 48);
    for (let face = 0; face < 6; face += 1) {
        cloudLightBricks[52 + face * 4 + 3] = 1;
    }
    const cloudLightViewBytes = new ArrayBuffer(32 + cloudLightBricks.byteLength);
    const cloudLightViewHeader = new DataView(cloudLightViewBytes);
    cloudLightViewHeader.setUint32(0, 1, true);
    cloudLightViewHeader.setUint32(4, 1, true);
    cloudLightViewHeader.setUint32(8, 1, true);
    cloudLightViewHeader.setUint32(12, 0, true);
    cloudLightViewHeader.setUint32(16, 1, true);
    cloudLightViewHeader.setUint32(20, 2, true);
    cloudLightViewHeader.setUint32(24, 3, true);
    cloudLightViewHeader.setUint32(28, 288, true);
    new Float32Array(cloudLightViewBytes, 32).set(cloudLightBricks);
    const cloudLightSources = new Float32Array(16);
    cloudLightSources.set([0.583, 0.717, 0.382, 1], 0);
    cloudLightSources.set([1, 1, 1, 0], 4);
    cloudLightSources.set([-0.221, 0.462, 0.864, 1], 8);
    cloudLightSources.set([0.01, 0.01, 0.01, 0], 12);
    device.queue.writeBuffer(cloudLightComputeUniformBuffer, 0,
        new Uint8Array(cloudLightUniformBytes));
    device.queue.writeBuffer(cloudLightBrickBuffer, 0, cloudLightBricks);
    device.queue.writeBuffer(cloudLightSourceBuffer, 0, cloudLightSources);
    device.queue.writeBuffer(cloudLightViewUniformBuffer, 0,
        new Uint8Array(cloudLightViewBytes));

    device.pushErrorScope("validation");
    const cloudTransportTarget = device.createTexture({
        size: [8, 8, 2], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const cloudTargets = Array.from({ length: 2 }, () => device.createTexture({
        size: [8, 8], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
    const cloudLayerPackets = Array.from({ length: 3 }, (_, packetIndex) =>
        device.createTexture({
            label: "validation cloud layer packet " + packetIndex,
            size: [8, 8, 5],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING,
        }));
    const transportArrayView = (texture) => texture.createView({
        dimension: "2d-array", baseArrayLayer: 0, arrayLayerCount: 2,
    });
    const transportLayerView = (texture, layer) => texture.createView({
        dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
    });
    const cloudMetricsBuffer = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const cloudReconstructionMetricsBuffer = device.createBuffer({
        // ReconstructionMetrics has eighteen atomic<u32> fields (72 bytes).
        // Keep the validator's storage binding at the same 16-byte-rounded
        // allocation used by the native renderer.
        size: 80,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
    });
    const cloudMetricsBindGroup = device.createBindGroup({
        layout: createdPipelines["cloud metrics compute pipeline"].getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: transportLayerView(cloudTransportTarget, 1) },
            { binding: 1, resource: intervalHighMask.createView() },
            { binding: 2, resource: { buffer: parameterBuffer } },
            { binding: 3, resource: { buffer: cloudMetricsBuffer } },
            { binding: 4, resource: cloudTargets[1].createView() },
        ],
    });
    const cloudLayerCompositorBindGroup = device.createBindGroup({
        layout: layerCompositorBindGroupLayout,
        entries: [
            { binding: 0, resource: cloudLayerPackets[0].createView({
                dimension: "2d-array",
            }) },
            { binding: 1, resource: cloudLayerPackets[1].createView({
                dimension: "2d-array",
            }) },
            { binding: 2, resource: cloudLayerPackets[2].createView({
                dimension: "2d-array",
            }) },
            { binding: 3, resource: { buffer: parameterBuffer } },
        ],
    });
    const compositeInputs = Array.from({ length: 6 }, () => device.createTexture({
        size: [8, 8], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
    const temporalTarget = device.createTexture({
        size: [8, 8], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const resolvedCloudTarget = device.createTexture({
        size: [8, 8, 2], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const resolvedCloudHistory = device.createTexture({
        size: [8, 8, 2], format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    const presentationTarget = device.createTexture({
        size: [8, 8], format: navigator.gpu.getPreferredCanvasFormat(),
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const compositeBindGroup = device.createBindGroup({
        layout: createdPipelines["composite pipeline"].getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: linearSampler },
            { binding: 1, resource: compositeInputs[0].createView() },
            { binding: 2, resource: transportArrayView(cloudTransportTarget) },
            { binding: 3, resource: transportArrayView(cloudTransportTarget) },
            { binding: 4, resource: cloudTargets[0].createView() },
            { binding: 5, resource: cloudTargets[0].createView() },
            { binding: 6, resource: cloudTargets[1].createView() },
            { binding: 7, resource: cloudTargets[1].createView() },
            { binding: 8, resource: { buffer: parameterBuffer } },
            { binding: 9, resource: compositeInputs[1].createView() },
            { binding: 10, resource: compositeInputs[2].createView() },
            { binding: 11, resource: compositeInputs[3].createView() },
            { binding: 12, resource: compositeInputs[4].createView() },
            { binding: 13, resource: compositeInputs[5].createView() },
            { binding: 14, resource: transportArrayView(resolvedCloudHistory) },
        ],
    });
    const cloudReconstructionMetricsBindGroup = device.createBindGroup({
        layout: createdPipelines["cloud reconstruction metrics compute pipeline"]
            .getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: transportLayerView(cloudTransportTarget, 0) },
            { binding: 1, resource: transportLayerView(cloudTransportTarget, 0) },
            { binding: 2, resource: transportLayerView(cloudTransportTarget, 1) },
            { binding: 3, resource: transportLayerView(cloudTransportTarget, 1) },
            { binding: 4, resource: cloudTargets[0].createView() },
            { binding: 5, resource: cloudTargets[0].createView() },
            { binding: 6, resource: temporalTarget.createView() },
            { binding: 7, resource: temporalTarget.createView() },
            { binding: 8, resource: transportArrayView(resolvedCloudTarget) },
            { binding: 9, resource: transportArrayView(resolvedCloudHistory) },
            { binding: 10, resource: { buffer: parameterBuffer } },
            { binding: 11, resource: { buffer: cloudReconstructionMetricsBuffer } },
        ],
    });
    const lightPipeline = (entryPoint) => createdPipelines[
        "cloud light-volume " + entryPoint];
    const lightExactGroup0 = (pipeline) => device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: parameterBuffer } },
            { binding: 2, resource: baseVolume.createView() },
            { binding: 3, resource: detailVolume.createView() },
            { binding: 5, resource: volumeSampler },
            { binding: 16, resource: cloudMacroAtlas.createView() },
            { binding: 17, resource: cloudMacroMajorants.createView() },
            { binding: 18, resource: clampSampler },
            { binding: 32, resource: cloudHighIceSourceAtlas.createView() },
            { binding: 19, resource: { buffer: cloudSystemBuffer } },
            { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
            { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
            { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
            { binding: 30, resource: cloudMorphologyModifiers.createView() },
        ],
    });
    const lightLightningGroup0 = (pipeline) => device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: parameterBuffer } },
            { binding: 2, resource: baseVolume.createView() },
            { binding: 3, resource: detailVolume.createView() },
            { binding: 5, resource: volumeSampler },
            { binding: 6, resource: atmosphereTexture.createView() },
            { binding: 16, resource: cloudMacroAtlas.createView() },
            { binding: 17, resource: cloudMacroMajorants.createView() },
            { binding: 18, resource: clampSampler },
            { binding: 32, resource: cloudHighIceSourceAtlas.createView() },
            { binding: 19, resource: { buffer: cloudSystemBuffer } },
            { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
            { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
            { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
            { binding: 25, resource: { buffer: physicalAtmosphereBuffer } },
            { binding: 26, resource: atmosphereTexture.createView() },
            { binding: 28, resource: clampSampler },
            { binding: 30, resource: cloudMorphologyModifiers.createView() },
            { binding: 35, resource: { buffer: weatherSceneUniformBuffer } },
        ],
    });
    const lightPhysicalGroup0 = (
        pipeline, directional, includeExactMedium = false,
    ) => device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            ...(includeExactMedium ? [
                { binding: 0, resource: { buffer: parameterBuffer } },
                { binding: 2, resource: baseVolume.createView() },
                { binding: 3, resource: detailVolume.createView() },
                { binding: 5, resource: volumeSampler },
                { binding: 16, resource: cloudMacroAtlas.createView() },
                { binding: 17, resource: cloudMacroMajorants.createView() },
                { binding: 18, resource: clampSampler },
                { binding: 32, resource: cloudHighIceSourceAtlas.createView() },
                { binding: 19, resource: { buffer: cloudSystemBuffer } },
                { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                { binding: 23, resource: { buffer: cloudOpticalStateBuffer } },
                { binding: 24, resource: { buffer: cloudOpticalOwnerBuffer } },
                { binding: 30, resource: cloudMorphologyModifiers.createView() },
            ] : []),
            { binding: 6, resource: atmosphereTransmittance.createView() },
            ...(directional ? [{
                binding: 14, resource: directionalCouplingAtlasView,
            }] : []),
            { binding: 25, resource: { buffer: physicalAtmosphereBuffer } },
            { binding: 28, resource: clampSampler },
            ...(directional ? [{
                binding: 34,
                resource: { buffer: directionalCloudVisibilityUniformBuffer },
            }] : []),
        ],
    });
    const encodeLightPass = (encoder, pipeline, group0, entries, dispatch) => {
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        if (group0) pass.setBindGroup(0, group0);
        pass.setBindGroup(2, device.createBindGroup({
            layout: pipeline.getBindGroupLayout(2), entries,
        }));
        pass.dispatchWorkgroups(...dispatch);
        pass.end();
    };
    stage("submitting isolated cold lighting graph");
    const warmupEncoder = device.createCommandEncoder({
        label: "isolated production cloud lighting warm-up validation",
    });
    const couplingShadowPass = warmupEncoder.beginComputePass({
        label: "production cloud coupling shadow validation",
    });
    couplingShadowPass.setPipeline(
        createdPipelines["cloud coupling shadow compute pipeline"]);
    couplingShadowPass.setBindGroup(0, cloudCouplingShadowBindGroup);
    couplingShadowPass.dispatchWorkgroups(48, 48, 6);
    couplingShadowPass.end();
    const lightUniformEntry = {
        binding: 0, resource: { buffer: cloudLightComputeUniformBuffer },
    };
    const lightBrickEntry = {
        binding: 1, resource: { buffer: cloudLightBrickBuffer },
    };
    const lightSourceEntry = {
        binding: 2, resource: { buffer: cloudLightSourceBuffer },
    };
    const lightBoundaryEntry = {
        binding: 12, resource: { buffer: cloudLightBoundaryBuffer },
    };
    const lightResidualEntry = {
        binding: 13, resource: { buffer: cloudLightResidualBuffer },
    };
    const additionalLightUniformBuffers = [];
    const lightUniformFor = (level, readPacked, writePacked) => {
        const bytes = cloudLightUniformBytes.slice(0);
        const view = new DataView(bytes);
        view.setUint32(16 + 2 * 4, 0, true);
        view.setUint32(16 + 3 * 4, Math.max(1, 48 >> level), true);
        [level, 1, readPacked ? 1 : 0, writePacked ? 1 : 0]
            .forEach((value, index) =>
                view.setUint32(48 + index * 4, value, true));
        const buffer = device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(buffer, 0, new Uint8Array(bytes));
        additionalLightUniformBuffers.push(buffer);
        return { binding: 0, resource: { buffer } };
    };
    const lightMipView = (texture, level) => texture.createView({
        dimension: "3d", baseMipLevel: level, mipLevelCount: 1,
    });
    const materialPipeline = lightPipeline("cloud_lv_materialize_medium_compute");
    encodeLightPass(warmupEncoder, materialPipeline,
        lightExactGroup0(materialPipeline), [
            lightUniformFor(1, false, false), lightBrickEntry,
            { binding: 3, resource: lightMipView(cloudLightMediumExtinction, 1) },
            { binding: 4, resource: lightMipView(cloudLightMediumScattering, 1) },
        ], [6, 4, 6]);
    const fineMaterialPipeline = lightPipeline(
        "cloud_lv_materialize_medium_fine_compute");
    encodeLightPass(warmupEncoder, fineMaterialPipeline,
        lightExactGroup0(fineMaterialPipeline), [
            lightUniformFor(0, false, false), lightBrickEntry,
            { binding: 3, resource: lightMipView(cloudLightMediumExtinction, 0) },
            { binding: 4, resource: lightMipView(cloudLightMediumScattering, 0) },
            { binding: 6, resource: lightMipView(cloudLightMediumExtinction, 1) },
        ], [12, 8, 12]);
    const prolongateMediumPipeline = lightPipeline(
        "cloud_lv_prolongate_medium_compute");
    encodeLightPass(warmupEncoder, prolongateMediumPipeline, undefined, [
        lightUniformFor(0, false, false),
        { binding: 3, resource: lightMipView(cloudLightMediumExtinction, 0) },
        { binding: 4, resource: lightMipView(cloudLightMediumScattering, 0) },
        { binding: 6, resource: lightMipView(cloudLightMediumExtinction, 1) },
        { binding: 7, resource: lightMipView(cloudLightMediumScattering, 1) },
    ], [12, 8, 12]);
    for (const [materializeEntryPoint, scanEntryPoint, output] of [
        ["cloud_lv_materialize_source_0_compute",
            "cloud_lv_direct_source_0_compute", cloudLightDirectSun],
        ["cloud_lv_materialize_source_1_compute",
            "cloud_lv_direct_source_1_compute", cloudLightDirectMoon],
    ]) {
        const materializePipeline = lightPipeline(materializeEntryPoint);
        encodeLightPass(warmupEncoder, materializePipeline,
            lightExactGroup0(materializePipeline), [
            lightUniformEntry, lightBrickEntry, lightSourceEntry,
            {
                binding: 6,
                resource: lightMipView(cloudLightMediumExtinction, 0),
            },
            { binding: 11, resource: lightMipView(cloudLightFluenceScratch, 0) },
        ], [12, 8, 48]);
        const scanPipeline = lightPipeline(scanEntryPoint);
        encodeLightPass(warmupEncoder, scanPipeline, undefined, [
            lightUniformEntry, lightBrickEntry, lightSourceEntry,
            { binding: 5, resource: lightMipView(output, 0) },
            { binding: 10, resource: lightMipView(cloudLightFluenceScratch, 0) },
        ], [6, 1, 6]);
    }
    const lightningPipeline = lightPipeline(
        "cloud_lv_materialize_lightning_transfer_compute");
    encodeLightPass(warmupEncoder, lightningPipeline,
        lightLightningGroup0(lightningPipeline), [
            lightUniformFor(2, false, false), lightBrickEntry,
            { binding: 14, resource: lightMipView(cloudLightLightning, 2) },
        ], [3, 2, 3]);
    const boundaryPipeline = lightPipeline("cloud_lv_project_boundary_compute");
    encodeLightPass(warmupEncoder, boundaryPipeline,
        lightPhysicalGroup0(boundaryPipeline, true, true),
        [lightUniformEntry, lightBrickEntry, lightSourceEntry,
            { binding: 8, resource: cloudLightDirectSun.createView() },
            { binding: 9, resource: cloudLightDirectMoon.createView() },
            lightBoundaryEntry], [1, 1, 1]);
    const restrictMediumPipeline = lightPipeline(
        "cloud_lv_restrict_medium_compute");
    for (let level = 1; level < 4; level += 1) {
        encodeLightPass(warmupEncoder, restrictMediumPipeline, undefined, [
            lightUniformFor(level, false, false),
            { binding: 3, resource: lightMipView(cloudLightMediumExtinction, level) },
            { binding: 4, resource: lightMipView(cloudLightMediumScattering, level) },
            { binding: 6, resource: lightMipView(cloudLightMediumExtinction, level - 1) },
            { binding: 7, resource: lightMipView(cloudLightMediumScattering, level - 1) },
        ], [Math.ceil((48 >> level) / 4), Math.ceil((32 >> level) / 4),
            Math.ceil((48 >> level) / 4)]);
    }
    const clearPipeline = lightPipeline("cloud_lv_clear_fluence_compute");
    encodeLightPass(warmupEncoder, clearPipeline, undefined, [
        lightUniformFor(0, false, true),
        { binding: 11, resource: lightMipView(cloudLightPackedView, 0) },
    ], [12, 8, 12]);

    const smoothPipeline = lightPipeline("cloud_lv_smooth_compute");
    const restrictResidualPipeline = lightPipeline(
        "cloud_lv_restrict_residual_compute");
    const smoothLevel = (level, iterations, startsPacked = true) => {
        for (let iteration = 0; iteration < iterations; iteration += 1) {
            const readPacked = startsPacked
                ? iteration % 2 === 0 : iteration % 2 === 1;
            const read = readPacked ? cloudLightPackedView : cloudLightFluenceScratch;
            const write = readPacked ? cloudLightFluenceScratch : cloudLightPackedView;
            encodeLightPass(warmupEncoder, smoothPipeline,
                lightPhysicalGroup0(smoothPipeline, false), [
                    lightUniformFor(level, readPacked, !readPacked),
                    lightBrickEntry, lightSourceEntry,
                    { binding: 6, resource: cloudLightMediumExtinction.createView() },
                    { binding: 7, resource: cloudLightMediumScattering.createView() },
                    { binding: 8, resource: lightMipView(cloudLightDirectSun, level) },
                    { binding: 9, resource: lightMipView(cloudLightDirectMoon, level) },
                    { binding: 10, resource: lightMipView(read, level) },
                    { binding: 11, resource: lightMipView(write, level) },
                    lightBoundaryEntry,
                ], [Math.ceil((48 >> level) / 4), Math.ceil((32 >> level) / 4),
                    Math.ceil((48 >> level) / 4)]);
        }
    };
    smoothLevel(0, 2);
    for (let level = 1; level < 4; level += 1) {
        const sourceLevel = level - 1;
        encodeLightPass(warmupEncoder, restrictResidualPipeline,
            lightPhysicalGroup0(restrictResidualPipeline, false), [
                lightUniformFor(level, true, false), lightBrickEntry,
                lightSourceEntry,
                { binding: 5, resource: lightMipView(cloudLightDirectSun, level) },
                { binding: 6, resource: cloudLightMediumExtinction.createView() },
                { binding: 7, resource: cloudLightMediumScattering.createView() },
                { binding: 8, resource: lightMipView(cloudLightDirectSun, sourceLevel) },
                { binding: 9, resource: lightMipView(cloudLightDirectMoon, sourceLevel) },
                { binding: 10, resource: lightMipView(cloudLightPackedView, sourceLevel) },
                lightBoundaryEntry,
            ], [Math.ceil((48 >> level) / 4), Math.ceil((32 >> level) / 4),
                Math.ceil((48 >> level) / 4)]);
        encodeLightPass(warmupEncoder, clearPipeline, undefined, [
            lightUniformFor(level, false, true),
            { binding: 11, resource: lightMipView(cloudLightPackedView, level) },
        ], [Math.ceil((48 >> level) / 4), Math.ceil((32 >> level) / 4),
            Math.ceil((48 >> level) / 4)]);
        smoothLevel(level, level === 3 ? 16 : 2);
    }
    const prolongatePipeline = lightPipeline("cloud_lv_prolongate_compute");
    const copyPipeline = lightPipeline("cloud_lv_copy_fluence_compute");
    for (let level = 2; level >= 0; level -= 1) {
        const dispatch = [Math.ceil((48 >> level) / 4),
            Math.ceil((32 >> level) / 4), Math.ceil((48 >> level) / 4)];
        encodeLightPass(warmupEncoder, prolongatePipeline, undefined, [
            lightUniformFor(level, true, false),
            { binding: 10, resource: cloudLightPackedView.createView() },
            { binding: 11, resource: lightMipView(cloudLightFluenceScratch, level) },
        ], dispatch);
        smoothLevel(level, 2, false);
        encodeLightPass(warmupEncoder, copyPipeline, undefined, [
            lightUniformFor(level, false, true),
            { binding: 10, resource: lightMipView(cloudLightFluenceScratch, level) },
            { binding: 11, resource: lightMipView(cloudLightPackedView, level) },
        ], dispatch);
    }
    const residualPipeline = lightPipeline("cloud_lv_measure_residual_compute");
    warmupEncoder.clearBuffer(cloudLightResidualBuffer);
    encodeLightPass(warmupEncoder, residualPipeline,
        lightPhysicalGroup0(residualPipeline, false), [
            lightUniformFor(0, true, false), lightBrickEntry, lightSourceEntry,
            { binding: 6, resource: cloudLightMediumExtinction.createView() },
            { binding: 7, resource: cloudLightMediumScattering.createView() },
            { binding: 8, resource: lightMipView(cloudLightDirectSun, 0) },
            { binding: 9, resource: lightMipView(cloudLightDirectMoon, 0) },
            { binding: 10, resource: lightMipView(cloudLightPackedView, 0) },
            lightBoundaryEntry, lightResidualEntry,
        ], [12, 8, 12]);
    warmupEncoder.copyTextureToTexture(
        { texture: cloudLightDirectSun, origin: [0, 0, 0] },
        { texture: cloudLightPackedView, origin: [0, 0, 1152] },
        [48, 32, 48]);
    warmupEncoder.copyTextureToTexture(
        { texture: cloudLightDirectMoon, origin: [0, 0, 0] },
        { texture: cloudLightPackedView, origin: [0, 0, 1440] },
        [48, 32, 48]);
    const intervalPass = warmupEncoder.beginRenderPass({ colorAttachments: [
        { view: intervalLowMiddle.createView(), clearValue: { r: 140, g: 0, b: 140, a: 0 }, loadOp: "clear", storeOp: "store" },
        { view: intervalHighMask.createView(), clearValue: { r: 140, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
    ] });
    intervalPass.setPipeline(createdPipelines["cloud interval MRT pipeline"]);
    intervalPass.setBindGroup(0, intervalBindGroup);
    intervalPass.draw(3);
    intervalPass.end();

    const lightingPass = warmupEncoder.beginRenderPass({
        colorAttachments: Array.from({ length: 3 }, (_, layer) => ({
            view: lightingLayers.createView({
                dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
            }),
            clearValue: { r: 80, g: 80, b: 80, a: 80 },
            loadOp: "clear",
            storeOp: "store",
        })),
    });
    lightingPass.setPipeline(createdPipelines["cloud lighting MRT pipeline"]);
    lightingPass.setBindGroup(0, lightingBindGroup);
    lightingPass.draw(3);
    lightingPass.end();
    device.queue.submit([warmupEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    report("isolated cold lighting submission", true);

    stage("submitting production cloud transport graph");
    const encoder = device.createCommandEncoder({
        label: "production cloud transport graph validation",
    });

    const neutralResolvedPass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: transportLayerView(resolvedCloudHistory, 0),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear", storeOp: "store",
            },
            {
                view: transportLayerView(resolvedCloudHistory, 1),
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
                loadOp: "clear", storeOp: "store",
            },
        ],
    });
    neutralResolvedPass.end();

    const packetClearValues = [
        { r: 0, g: 0, b: 0, a: 140 },
        { r: 1, g: 1, b: 1, a: 140 },
        { r: 0, g: 0, b: 0, a: 0 },
    ];
    for (let layerIndex = 0; layerIndex < 3; layerIndex += 1) {
        const cloudLayerPass = encoder.beginRenderPass({
            colorAttachments: cloudLayerPackets.map((texture, packetIndex) => ({
                view: texture.createView({
                    dimension: "2d",
                    baseArrayLayer: layerIndex,
                    arrayLayerCount: 1,
                }),
                clearValue: packetClearValues[packetIndex],
                loadOp: "clear",
                storeOp: "store",
            })),
        });
        cloudLayerPass.setPipeline(
            createdPipelines["cloud layer " + layerIndex + " MRT pipeline"]);
        cloudLayerPass.setBindGroup(0, cloudBindGroup);
        cloudLayerPass.setBindGroup(1, cloudLightViewBindGroup);
        cloudLayerPass.draw(3);
        cloudLayerPass.end();
    }
    for (const [packetLayer, pipelineName] of [
        [3, "hydrometeor MRT pipeline"],
        [4, "upper atmosphere MRT pipeline"],
    ]) {
        const weatherPass = encoder.beginRenderPass({
            colorAttachments: cloudLayerPackets.map((texture, packetIndex) => ({
                view: texture.createView({
                    dimension: "2d",
                    baseArrayLayer: packetLayer,
                    arrayLayerCount: 1,
                }),
                clearValue: packetClearValues[packetIndex],
                loadOp: "clear",
                storeOp: "store",
            })),
        });
        weatherPass.setPipeline(createdPipelines[pipelineName]);
        weatherPass.setBindGroup(0, cloudBindGroup);
        weatherPass.setBindGroup(1, cloudLightViewBindGroup);
        weatherPass.draw(3);
        weatherPass.end();
    }

    const cloudPass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: transportLayerView(cloudTransportTarget, 0),
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: "clear", storeOp: "store",
            },
            {
                view: transportLayerView(cloudTransportTarget, 1),
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
                loadOp: "clear", storeOp: "store",
            },
            {
                view: cloudTargets[0].createView(),
                clearValue: { r: 140, g: 140, b: 0, a: 0 },
                loadOp: "clear", storeOp: "store",
            },
            {
                view: cloudTargets[1].createView(),
                clearValue: { r: 0, g: 0, b: -1, a: 0 },
                loadOp: "clear", storeOp: "store",
            },
        ],
    });
    cloudPass.setPipeline(
        createdPipelines["cloud layer compositor MRT pipeline"]);
    cloudPass.setBindGroup(0, cloudLayerCompositorBindGroup);
    cloudPass.draw(3);
    cloudPass.end();
    const metricsPass = encoder.beginComputePass();
    metricsPass.setPipeline(createdPipelines["cloud metrics compute pipeline"]);
    metricsPass.setBindGroup(0, cloudMetricsBindGroup);
    metricsPass.dispatchWorkgroups(8, 5, 1);
    metricsPass.end();
    const compositePass = encoder.beginRenderPass({ colorAttachments: [
        {
            view: presentationTarget.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
        },
        {
            view: temporalTarget.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
        },
        {
            view: transportLayerView(resolvedCloudTarget, 0),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
        },
        {
            view: transportLayerView(resolvedCloudTarget, 1),
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            loadOp: "clear",
            storeOp: "store",
        },
    ] });
    compositePass.setPipeline(createdPipelines["composite pipeline"]);
    compositePass.setBindGroup(0, compositeBindGroup);
    compositePass.draw(3);
    compositePass.end();
    const reconstructionMetricsPass = encoder.beginComputePass();
    reconstructionMetricsPass.setPipeline(
        createdPipelines["cloud reconstruction metrics compute pipeline"]);
    reconstructionMetricsPass.setBindGroup(0, cloudReconstructionMetricsBindGroup);
    reconstructionMetricsPass.dispatchWorkgroups(8, 5, 1);
    reconstructionMetricsPass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const drawError = await device.popErrorScope();
    if (drawError) {
        report("submitted production cloud graph", false, drawError.message);
        throw drawError;
    }
    report("submitted production cloud graph", true);

    [weatherTexture, baseVolume, detailVolume,
        atmosphereTransmittance, atmosphereMultipleScattering,
        intervalLowMiddle, intervalHighMask, blueNoiseTexture, directionalCouplingAtlas,
        cloudMacroAtlas, cloudMacroMajorants, cloudOpticalPhase,
        cloudMorphologyModifiers,
        cloudLightMediumExtinction, cloudLightMediumScattering,
        cloudLightDirectSun, cloudLightDirectMoon,
        cloudLightFluenceScratch, cloudLightPackedView, lightingLayers,
        cloudLightLightning,
        cloudTransportTarget, ...cloudTargets, ...cloudLayerPackets,
        ...compositeInputs,
        temporalTarget, resolvedCloudTarget, resolvedCloudHistory,
        presentationTarget]
        .forEach((texture) => texture.destroy());
    parameterBuffer.destroy();
    directionalCloudVisibilityUniformBuffer.destroy();
    directionalCloudVisibilityOwnerMaskBuffer.destroy();
    layerBuffer.destroy();
    cloudFeatureBuffer.destroy();
    cloudSystemBuffer.destroy();
    cloudMacroBindingBuffer.destroy();
    cloudOpticalStateBuffer.destroy();
    cloudOpticalOwnerBuffer.destroy();
    hydrometeorBuffer.destroy();
    weatherSceneUniformBuffer.destroy();
    physicalAtmosphereBuffer.destroy();
    cloudLightComputeUniformBuffer.destroy();
    cloudLightBrickBuffer.destroy();
    cloudLightSourceBuffer.destroy();
    cloudLightBoundaryBuffer.destroy();
    cloudLightViewUniformBuffer.destroy();
    cloudLightResidualBuffer.destroy();
    additionalLightUniformBuffers.forEach((buffer) => buffer.destroy());
    cloudMetricsBuffer.destroy();
    cloudReconstructionMetricsBuffer.destroy();

    document.body.dataset.status = "passed";
    summary.textContent = "Passed: " + Object.keys(shaders).length +
        " shader modules and " + (descriptors.length + 3 + cloudLightEntries.length) +
        " production pipeline variants.";
    device.destroy();
}

const validationDeadline = new Promise((_, reject) => {
    window.setTimeout(() => {
        reject(new Error(
            "Timed out after " + validationTimeoutMs + "ms while " + currentStage + ". " +
            "The GPU driver or browser stopped completing WebGPU work.",
        ));
    }, validationTimeoutMs);
});

Promise.race([validate(), validationDeadline]).catch((error) => {
    document.body.dataset.status = "failed";
    summary.textContent = "Validation failed: " + error.message;
    console.error(error);
});
</script>
</body>
</html>`;

const server = createServer((request, response) => {
    if (request.url === "/favicon.ico") {
        response.writeHead(204).end();
        return;
    }
    response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
    });
    response.end(html);
});

const activeChildren = new Set();

function terminateProcessTree(child, signal = "SIGTERM") {
    if (!child?.pid || child.exitCode !== null) return;
    try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
    } catch {
        try {
            child.kill(signal);
        } catch {
            // The process already exited.
        }
    }
}

async function stopProcessTree(child) {
    if (!child?.pid || child.exitCode !== null) return;
    terminateProcessTree(child);
    await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) {
        terminateProcessTree(child, "SIGKILL");
        await Promise.race([
            new Promise((resolve) => child.once("exit", resolve)),
            new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
    }
}

function runCommand(command, args, { timeoutMs, label, inheritOutput = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: root,
            detached: process.platform !== "win32",
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        activeChildren.add(child);
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const append = (current, chunk) => (current + chunk).slice(-2_000_000);
        child.stdout.on("data", (chunk) => {
            stdout = append(stdout, chunk.toString());
            if (inheritOutput) process.stdout.write(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr = append(stderr, chunk.toString());
            if (inheritOutput) process.stderr.write(chunk);
        });
        const timeout = setTimeout(() => {
            timedOut = true;
            terminateProcessTree(child);
            setTimeout(() => terminateProcessTree(child, "SIGKILL"), 2_000).unref();
        }, timeoutMs);
        timeout.unref();
        child.once("error", (error) => {
            activeChildren.delete(child);
            clearTimeout(timeout);
            reject(Object.assign(
                new Error(`${label} could not start (${command}): ${error.message}`),
                { stdout, stderr },
            ));
        });
        child.once("exit", (code, signal) => {
            activeChildren.delete(child);
            clearTimeout(timeout);
            if (timedOut) {
                reject(Object.assign(new Error(
                    `${label} timed out after ${timeoutMs}ms.\n${stderr || stdout}`.trim(),
                ), { stdout, stderr }));
            } else if (code !== 0) {
                reject(Object.assign(new Error(
                    `${label} exited with ${signal ? `signal ${signal}` : `code ${code}`}.\n` +
                    `${stderr || stdout}`,
                ), { stdout, stderr }));
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

const processExists = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code === "EPERM";
    }
};

const waitForProcessExit = async (pid, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!processExists(pid)) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return !processExists(pid);
};

const inspectProcess = async (pid) => {
    if (!processExists(pid)) return undefined;
    if (process.platform === "win32") {
        const script = `(Get-CimInstance Win32_Process -Filter ` +
            `'ProcessId = ${pid}').CommandLine`;
        const result = await runCommand(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", script],
            { timeoutMs: 2_000, label: "Playwright daemon ownership check" },
        );
        const command = result.stdout.trim();
        return command ? { command, processGroupId: pid } : undefined;
    }
    const result = await runCommand(
        "ps",
        ["-p", String(pid), "-o", "pgid=", "-o", "command="],
        { timeoutMs: 2_000, label: "Playwright daemon ownership check" },
    ).catch(() => undefined);
    const match = result?.stdout.match(/^\s*(\d+)\s+([\s\S]+?)\s*$/);
    return match ? {
        processGroupId: Number(match[1]),
        command: match[2],
    } : undefined;
};

const terminateOwnedProcess = async (pid, processGroupId, signal) => {
    // cliDaemon is detached and therefore normally owns a process group with
    // pgid === pid. Kill that verified group to include its browser children;
    // otherwise signal only the exact captured daemon pid.
    const target = process.platform !== "win32" && processGroupId === pid
        ? -pid : pid;
    try {
        process.kill(target, signal);
    } catch (error) {
        if (error?.code !== "ESRCH") throw error;
    }
};

function startValidationServer() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve"], {
            cwd: root,
            detached: process.platform !== "win32",
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        activeChildren.add(child);
        let stderr = "";
        let stdout = "";
        let settled = false;
        const startupTimeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            terminateProcessTree(child);
            reject(new Error(
                `Validator server did not become ready within 10000ms.\n${stderr}`.trim(),
            ));
        }, 10_000);
        child.stderr.on("data", (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-100_000);
        });
        child.stdout.on("data", (chunk) => {
            stdout = (stdout + chunk.toString()).slice(-100_000);
            const match = stdout.match(/WebGPU shader validation: (http:\/\/[^\s]+)/);
            if (!settled && match) {
                settled = true;
                clearTimeout(startupTimeout);
                resolve({ child, url: match[1] });
            }
        });
        child.once("error", (error) => {
            activeChildren.delete(child);
            if (settled) return;
            settled = true;
            clearTimeout(startupTimeout);
            reject(new Error(`Validator server could not start: ${error.message}`));
        });
        child.once("exit", (code, signal) => {
            activeChildren.delete(child);
            if (settled) return;
            settled = true;
            clearTimeout(startupTimeout);
            reject(new Error(
                `Validator server exited before becoming ready with ` +
                `${signal ? `signal ${signal}` : `code ${code}`}.\n${stderr}`,
            ));
        });
    });
}

async function serve() {
    server.once("error", (error) => {
        console.error(`WebGPU validator server failed: ${error.message}`);
        process.exitCode = 1;
    });
    server.listen(requestedPort, "127.0.0.1", () => {
        const address = server.address();
        const activePort = typeof address === "object" && address ? address.port : requestedPort;
        console.log(`WebGPU shader validation: http://127.0.0.1:${activePort}`);
    });
}

async function orchestrate() {
    const bundledCli = path.join(
        process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
        "skills/playwright/scripts/playwright_cli.sh",
    );
    const playwrightCli = process.env.PWCLI ??
        (existsSync(bundledCli) ? bundledCli : "playwright-cli");
    const session = `sky-webgpu-validation-${process.pid}`;
    const { child: serverChild, url } = await startValidationServer();
    let interrupted = false;
    let browserOpened = false;
    let playwrightDaemonPid;
    const onSignal = () => {
        interrupted = true;
        for (const child of activeChildren) terminateProcessTree(child);
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    console.log(`WebGPU shader validation: ${url}`);
    try {
        try {
            const launch = await runCommand(
                playwrightCli,
                ["--session", session, "open", url],
                { timeoutMs: 30_000, label: "Playwright browser launch" },
            );
            playwrightDaemonPid = parseGeneratedPlaywrightDaemonPid(
                launch.stdout,
                session,
            );
        } catch (error) {
            playwrightDaemonPid = parseGeneratedPlaywrightDaemonPid(
                `${error?.stdout ?? ""}\n${error?.message ?? ""}`,
                session,
            );
            throw error;
        }
        browserOpened = true;
        const browserDeadlineMs = validationTimeoutMs + 15_000;
        const code = `async (page) => {
            await page.waitForFunction(
                () => document.body.dataset.status !== "running",
                undefined,
                { timeout: ${validationTimeoutMs + 5_000} },
            );
            const result = await page.evaluate(() => ({
                status: document.body.dataset.status,
                summary: document.querySelector("#summary")?.textContent ?? "No summary",
                failures: [...document.querySelectorAll("li[data-passed=false]")]
                    .map((item) => item.textContent),
            }));
            if (result.status !== "passed") {
                throw new Error(result.summary +
                    (result.failures.length ? "\\n" + result.failures.join("\\n") : ""));
            }
            return result.summary;
        }`;
        const result = await runCommand(
            playwrightCli,
            ["--session", session, "run-code", code],
            { timeoutMs: browserDeadlineMs, label: "WebGPU browser validation" },
        );
        const passed = result.stdout.match(/Passed: [^\n"]+/);
        console.log(passed?.[0].trim() ?? "WebGPU shader validation passed.");
    } finally {
        if (browserOpened) {
            await runCommand(
                playwrightCli,
                ["--session", session, "close"],
                { timeoutMs: 10_000, label: "Playwright browser cleanup" },
            ).catch((error) => console.warn(error.message));
        }
        const cleanup = await cleanupGeneratedPlaywrightSessionDaemon({
            session,
            pid: playwrightDaemonPid,
            inspect: inspectProcess,
            terminate: terminateOwnedProcess,
            waitForExit: waitForProcessExit,
        }).catch((error) => ({
            status: `cleanup-error: ${error.message}`,
        }));
        if (!["not-recorded", "already-exited", "terminated", "killed"]
            .includes(cleanup.status)) {
            console.warn(`Playwright session ${session}: ${cleanup.status}`);
        }
        await stopProcessTree(serverChild);
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
    }
    if (interrupted) throw new Error("WebGPU shader validation was interrupted.");
}

if (process.argv.includes("--preflight-only")) {
    console.log("Production-composed WGSL preflight passed for " +
        productionComposedShaderContracts.length + " critical modules.");
} else if (process.argv.includes("--serve")) {
    await serve();
} else {
    try {
        await orchestrate();
    } catch (error) {
        console.error(`WebGPU shader validation failed: ${error.message}`);
        process.exitCode = 1;
    }
}

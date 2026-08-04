import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import ts from "typescript";

const source = fs.readFileSync(
    new URL("../components/backgrounds/sky/renderer-types.ts", import.meta.url),
    "utf8",
);
const javascript = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const moduleObject = { exports: {} };
new Function("exports", "module", javascript)(moduleObject.exports, moduleObject);

const {
    DEFAULT_SKY_RENDERER_OPTIONS,
    SKY_QUALITY_PROFILES,
    resolveSkyRendererOptions,
    selectSkyRendererBackend,
} = moduleObject.exports;

test("renderer option resolution clamps manual workload controls", () => {
    assert.deepEqual(resolveSkyRendererOptions({
        quality: "high",
        resolutionScale: 4,
        updateRate: 120,
    }), {
        ...DEFAULT_SKY_RENDERER_OPTIONS,
        quality: "high",
        resolutionScale: 1,
        updateRate: 6,
    });
    assert.equal(resolveSkyRendererOptions({ resolutionScale: 0 }).resolutionScale, 0.5);
    assert.equal(resolveSkyRendererOptions({ updateRate: 0 }).updateRate, 1);
});

test("production cloud transport uses the shared physical camera", () => {
    assert.equal(DEFAULT_SKY_RENDERER_OPTIONS.cloudPerspective, "natural");
});

test("quality profiles retain the production-safe workload ordering", () => {
    const { battery, balanced, high } = SKY_QUALITY_PROFILES;
    assert.ok(battery.pixelBudget < balanced.pixelBudget);
    assert.ok(balanced.pixelBudget < high.pixelBudget);
    assert.ok(battery.cloudResolution < balanced.cloudResolution);
    assert.ok(balanced.cloudResolution < high.cloudResolution);
    assert.ok(battery.viewSteps < balanced.viewSteps);
    assert.ok(balanced.viewSteps < high.viewSteps);
    assert.ok(battery.lightSteps < balanced.lightSteps);
    assert.ok(balanced.lightSteps < high.lightSteps);
    assert.ok(battery.updateRate < balanced.updateRate);
    assert.ok(balanced.updateRate < high.updateRate);
});

test("automatic production policy selects WebGPU when the browser exposes it", () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: { gpu: {} },
        });
        assert.equal(selectSkyRendererBackend("auto"), "webgpu");
        assert.equal(selectSkyRendererBackend("webgpu"), "webgpu");
        assert.equal(selectSkyRendererBackend("fallback"), "fallback");
    } finally {
        if (navigatorDescriptor) {
            Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
        } else {
            delete globalThis.navigator;
        }
    }
});

test("automatic policy uses the legacy fallback when WebGPU is unavailable", () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
        Object.defineProperty(globalThis, "navigator", {
            configurable: true,
            value: {},
        });
        assert.equal(selectSkyRendererBackend("auto"), "fallback");
        assert.equal(selectSkyRendererBackend("webgpu"), "fallback");
    } finally {
        if (navigatorDescriptor) {
            Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
        } else {
            delete globalThis.navigator;
        }
    }
});

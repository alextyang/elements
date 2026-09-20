import assert from "node:assert/strict";
import test from "node:test";
import { assessWebGlPreviewFrame } from "./lib/cloud-preview-webgl-readiness.mjs";

const request = {
    caseId: "cb-calvus--day-oblique-natural",
    debugView: "final",
    productionPerspective: "oblique-natural",
    width: 800,
    height: 500,
    requireAppleMetal: true,
};
const frame = {
    renderer: "webgl2",
    benchmarkCase: request.caseId,
    sceneKey: request.caseId,
    frameSceneKey: request.caseId,
    debugView: "final",
    productionPerspective: "oblique-natural",
    productionCameraSignature: "fixed-production-camera",
    viewport: { width: 800, height: 500, devicePixelRatio: 1 },
    renderBounds: { width: 800, height: 500 },
    width: 800,
    height: 500,
    frameWidth: 800,
    frameHeight: 500,
    frameState: "complete",
    frameFailure: "none",
    programState: "linked",
    shaderSourceHash: "a".repeat(64),
    completedFrames: 1,
    contextLost: false,
    glError: 0,
    glVendor: "Google Inc. (Apple)",
    glRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)",
};

test("a completed native WebGL frame needs no WebGPU temporal-cache evidence", () => {
    assert.deepEqual(assessWebGlPreviewFrame(frame, request), {
        ready: true, failed: false, reason: "completed-webgl-frame",
    });
});

test("shader failure, lost context and GPU draw errors cannot become ready", () => {
    for (const changed of [
        { frameState: "failed", frameFailure: "shader-compile-error" },
        { contextLost: true },
        { glError: 1282 },
    ]) {
        const result = assessWebGlPreviewFrame({ ...frame, ...changed }, request);
        assert.equal(result.ready, false);
        assert.equal(result.failed, true);
    }
    for (const changed of [
        { programState: "compiling" }, { frameState: "submitted" },
        { shaderSourceHash: "" },
        { completedFrames: 0 }, { completedFrames: Number.NaN },
    ]) {
        const result = assessWebGlPreviewFrame({ ...frame, ...changed }, request);
        assert.equal(result.ready, false);
        assert.equal(result.failed, false);
    }
});

test("stale scene, changed camera and mismatched frame geometry wait for matching output", () => {
    for (const changed of [
        { benchmarkCase: "cu-humilis--day-oblique-natural" },
        { frameSceneKey: "cu-humilis--day-oblique-natural" },
        { sceneKey: "cu-humilis--day-oblique-natural" },
        { renderer: "webgpu" }, { debugView: "density" },
        { productionPerspective: "zenith" }, { productionCameraSignature: "" },
        { width: 1600 }, { frameHeight: 1000 },
        { viewport: { width: 800, height: 500, devicePixelRatio: 2 } },
        { renderBounds: { width: 800, height: 499 } },
    ]) {
        assert.equal(assessWebGlPreviewFrame({ ...frame, ...changed }, request)
            .ready, false, JSON.stringify(changed));
    }
});

test("native capture refuses software and non-Apple WebGL even after a successful draw", () => {
    for (const glRenderer of [
        "ANGLE SwiftShader Device", "llvmpipe (LLVM)", "Software Rasterizer",
        "ANGLE NVIDIA OpenGL", "",
    ]) {
        const result = assessWebGlPreviewFrame({ ...frame, glRenderer }, request);
        assert.equal(result.ready, false);
        assert.equal(result.failed, true);
    }
    assert.equal(assessWebGlPreviewFrame({
        ...frame, glVendor: "NVIDIA", glRenderer: "NVIDIA OpenGL",
    }, { ...request, requireAppleMetal: false }).ready, true);
});

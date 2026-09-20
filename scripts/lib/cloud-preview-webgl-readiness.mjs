/**
 * WebGL's live renderer completes one deterministic draw. It has no WebGPU
 * brick cache or temporal-history convergence contract. This gate establishes
 * a completed frame only; the image qualifier and photographic review remain
 * separate requirements.
 *
 * Keep this function self-contained: the capture CLI serializes it into its
 * browser driver, and the tests exercise the same policy with frame evidence.
 */
export function assessWebGlPreviewFrame(state, request) {
    const reject = (reason) => ({ ready: false, failed: true, reason });
    const wait = (reason) => ({ ready: false, failed: false, reason });
    if (!state) return wait("renderer-missing");
    if (state.frameState === "failed" || state.contextLost ||
        (state.frameFailure && state.frameFailure !== "none")) {
        return reject(state.frameFailure && state.frameFailure !== "none"
            ? state.frameFailure : state.contextLost
                ? "webgl-context-lost" : "webgl-frame-failed");
    }
    if (state.renderer !== "webgl2") return wait("active-renderer");
    if (state.benchmarkCase !== request.caseId ||
        state.sceneKey !== request.caseId ||
        state.frameSceneKey !== request.caseId) return wait("scene-key");
    if (state.debugView !== request.debugView ||
        state.productionPerspective !== request.productionPerspective ||
        !state.productionCameraSignature) return wait("production-camera");
    if (state.viewport?.width !== request.width ||
        state.viewport?.height !== request.height ||
        state.viewport?.devicePixelRatio !== 1 ||
        state.renderBounds?.width !== request.width ||
        state.renderBounds?.height !== request.height ||
        state.width !== request.width || state.height !== request.height ||
        state.frameWidth !== request.width ||
        state.frameHeight !== request.height) return wait("frame-size");
    if (state.programState !== "linked") return wait("shader-program");
    if (!/^[a-f0-9]{64}$/.test(state.shaderSourceHash ?? "")) {
        return wait("shader-source-identity");
    }
    if (state.frameState !== "complete" ||
        !Number.isSafeInteger(state.completedFrames) ||
        state.completedFrames < 1) return wait("draw-completion");
    if (state.glError !== 0) return reject("webgl-draw-error");
    const adapter = `${state.glVendor ?? ""} ${state.glRenderer ?? ""}`;
    if (!state.glRenderer) return reject("webgl-adapter-unavailable");
    if (/swiftshader|llvmpipe|software/i.test(adapter)) {
        return reject("software-webgl-adapter");
    }
    if (request.requireAppleMetal && !/apple.*metal|metal.*apple/i.test(adapter)) {
        return reject("non-apple-metal-webgl-adapter");
    }
    return { ready: true, failed: false, reason: "completed-webgl-frame" };
}

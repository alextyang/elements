import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const javascript = ts.transpileModule(readFileSync(new URL(
    "../components/backgrounds/sky/atmosphere-canvas.tsx", import.meta.url,
), "utf8"), {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
    },
}).outputText;

const cameraModule = { exports: {} };
new Function("exports", ts.transpileModule(readFileSync(new URL(
    "../components/backgrounds/sky/camera-contract.ts", import.meta.url,
), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(cameraModule.exports);

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

// Exercise the real renderer effect, capture method, and cleanup. GPU resources
// are tracked so a continuation cannot silently bind a deleted object; uploads
// and response decoding can be paused independently at their actual awaits.
function fixture(fetchResponse, digest = async () => new ArrayBuffer(32), options = {}) {
    const calls = [];
    const deleted = new Set();
    const textures = [];
    let contextLost = false;
    let bounds = { width: options.width ?? 2, height: options.height ?? 2 };
    const animationFrames = new Map();
    let nextAnimationFrame = 0;
    const requestAnimationFrame = (callback) => {
        const id = ++nextAnimationFrame;
        animationFrames.set(id, callback);
        if (!options.manualFrames) setImmediate(() => {
            const ready = animationFrames.get(id);
            animationFrames.delete(id);
            ready?.();
        });
        return id;
    };
    const cancelAnimationFrame = (id) => animationFrames.delete(id);
    const gl = new Proxy({
        NO_ERROR: 0,
        getError: () => 0,
        getExtension: () => ({}),
        getParameter: () => "fixture",
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getAttribLocation: () => 0,
        getUniformLocation: (_, name) => name,
        checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE",
        isContextLost: () => contextLost,
        fenceSync: () => ({}),
        clientWaitSync: () => "ALREADY_SIGNALED",
        createTexture: () => {
            const texture = {};
            textures.push(texture);
            return texture;
        },
        readPixels: (...args) => {
            const values = args.at(-1);
            calls.push(["readPixels", ...args]);
            values.fill(0);
            for (let offset = 3; offset < values.length; offset += 4) {
                values[offset] = values instanceof Uint8Array ? 255 : 0;
            }
            if (options.missingLivePixel && values instanceof Uint8Array) values[3] = 0;
            if (options.missingPlatePixel && values instanceof Float32Array) values[3] = -1;
        },
    }, {
        get(target, name) {
            if (name in target) return target[name];
            if (/^[A-Z_0-9]+$/.test(name)) return name;
            if (name.startsWith("create")) return () => ({});
            return (...args) => {
                calls.push([name, ...args]);
                if (name.startsWith("delete")) deleted.add(args[0]);
                if (name.startsWith("bind") || name === "useProgram") {
                    assert.ok(!args.some((arg) => deleted.has(arg)),
                        `${name} used a disposed resource`);
                }
            };
        },
    });
    const canvas = Object.assign(new EventTarget(), {
        width: 2, height: 2, dataset: {},
        getContext: () => gl,
        getBoundingClientRect: () => bounds,
    });
    const document = Object.assign(new EventTarget(), { hidden: false });
    const observers = [];
    class ResizeObserver {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
        disconnect() {}
    }
    const effects = [];
    const refs = [];
    const dependencies = {
        react: {
            useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; },
            useEffect: (callback) => effects.push(callback),
        },
        "react/jsx-runtime": { jsx: (_, props) => { props.ref.current = canvas; } },
        "./webgl-cloud-shader": {
            CLOUD_COMPOSITE: "", CLOUD_FUNCTIONS: "", CLOUD_UNIFORMS: "",
            packCloudLayers: () => ({ active: true }),
        },
        "./webgl-cloud-noise": {
            createCloudNoise: () => {
                const resources = Object.fromEntries(["base", "detail", "weather", "curl"]
                    .map((name) => [name, gl.createTexture()]));
                return { ...resources, dispose: () => Object.values(resources)
                    .forEach((texture) => gl.deleteTexture(texture)) };
            },
        },
        "./webgl-cloud-lighting": {
            createWebGlCloudLighting: () => {
                const texture = gl.createTexture();
                return {
                    updateAndBind: () => gl.bindTexture(gl.TEXTURE_2D, texture),
                    dispose: () => gl.deleteTexture(texture),
                };
            },
        },
        "./cloud-fibratus-source-field": { cloudSourceFloat16Bits: () => 0 },
        "./cloud-plate-scene": {
            CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION:
                "webgl-atmosphere-baked-fixed-lighting-v1",
        },
        "./camera-contract": cameraModule.exports,
        "./sky.module.css": { default: {} },
    };
    const uploads = [];
    const fetch = async (url, options) => {
        uploads.push({ url, options });
        return fetchResponse(url, options);
    };
    const module = { exports: {} };
    new Function("exports", "require", "window", "document", "ResizeObserver", "fetch", "crypto", "requestAnimationFrame", "cancelAnimationFrame", javascript)(
        module.exports, (name) => dependencies[name],
        { devicePixelRatio: 1 }, document, ResizeObserver, fetch, { subtle: { digest } },
        requestAnimationFrame, cancelAnimationFrame,
    );
    const scene = new Proxy({
        palette: new Proxy({}, { get: () => "#ffffff" }),
        sun: [0.5, 0.5], moon: [0.5, 0.5],
        sunDirection: [0, 1, 0], moonDirection: [0, 1, 0],
        moonLightColor: "#ffffff", cloudScene: { fog: 0, noctilucent: 0 },
        viewAzimuth: 55, viewElevation: 27, horizontalFov: 64, verticalFov: 43.52,
        cameraProjection: true,
    }, { get: (target, name) => target[name] ?? 0 });
    module.exports.AtmosphereCanvas({ scene, sceneKey: "fixture" });
    effects[0]();
    const cleanup = effects[1]();
    const capture = canvas.__elementsCloudPlateCapture;
    const completeFrame = canvas.__elementsWebGlFrameComplete;
    return {
        canvas, calls, deleted, textures, uploads, observers, cleanup, completeFrame,
        animationFrames,
        advanceFrame() {
            const entry = animationFrames.entries().next().value;
            assert.ok(entry, "a presentation boundary is pending");
            animationFrames.delete(entry[0]);
            entry[1]();
        },
        updateScene(patch, key = "fixture") {
            refs[1].current = new Proxy({ ...scene, ...patch }, { get: (target, name) => target[name] ?? 0 });
            refs[2].current = key;
            refs[3].current?.();
        },
        restoreScene() {
            refs[1].current = scene;
            refs[2].current = "fixture";
            refs[3].current?.();
        },
        resize(width, height) { bounds = { width, height }; observers[0].callback(); },
        setHidden(hidden) {
            document.hidden = hidden;
            document.dispatchEvent(new Event("visibilitychange"));
        },
        capture: () => capture({ sceneId: "fixture", frame: 0, samples: 1, token: "fixture" }),
        loseContext() {
            contextLost = true;
            canvas.dispatchEvent(new Event("webglcontextlost"));
        },
    };
}

const successfulResponse = (url) => ({
    ok: true,
    json: async () => ({ channel: new URL(url, "http://fixture").searchParams.get("channel") }),
});

async function until(predicate) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail("renderer did not reach the expected asynchronous boundary");
}

test("plate disposal aborts a pending upload and never touches retired GL state", async () => {
    const pending = deferred();
    const f = fixture((_, { signal }) => {
        signal.addEventListener("abort", () => pending.reject(new DOMException("aborted", "AbortError")));
        return pending.promise;
    });
    const capture = f.capture();
    await until(() => f.uploads.length === 1);
    assert.equal(f.uploads.length, 1);
    assert.ok(f.deleted.has(f.textures.at(-1)), "readback target is released before upload");
    f.cleanup();
    const afterCleanup = f.calls.length;
    await assert.rejects(capture, /capture canceled: renderer disposed or context lost/);
    f.observers[0].callback();
    assert.equal(f.calls.length, afterCleanup, "no late GL operations after cleanup");
    assert.equal(f.uploads.length, 1, "no later planes are uploaded");
    assert.equal(f.uploads[0].options.signal.aborted, true);
    await assert.rejects(f.capture(), /capture canceled/);
});

test("plate disposal during response decoding rejects even if the response ignores abort", async () => {
    const body = deferred();
    const decoding = deferred();
    const f = fixture(() => ({ ok: true, json: () => { decoding.resolve(); return body.promise; } }));
    const capture = f.capture();
    await decoding.promise;
    f.cleanup();
    const afterCleanup = f.calls.length;
    body.resolve({ channel: "radiance" });
    await assert.rejects(capture, /capture canceled/);
    assert.equal(f.calls.length, afterCleanup);
    assert.equal(f.uploads.length, 1);
});

test("context loss cancels plate continuation without resetting failed readiness", async () => {
    const pending = deferred();
    const f = fixture(() => pending.promise);
    const capture = f.capture();
    await until(() => f.uploads.length === 1);
    f.loseContext();
    const afterLoss = f.calls.length;
    pending.resolve(successfulResponse(f.uploads[0].url));
    await assert.rejects(capture, /capture canceled/);
    assert.equal(f.calls.length, afterLoss);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "failed");
    assert.equal(f.uploads[0].options.signal.aborted, true);
    f.cleanup();
});

test("a living renderer exports all five planes with the fixed-lighting convention", async () => {
    const f = fixture(successfulResponse);
    const result = await f.capture();
    assert.deepEqual(result.planes.map(({ channel }) => channel), [
        "radiance", "transmittance", "direct-response", "sky-response", "ground-response",
    ]);
    assert.equal(result.responseConvention, "webgl-atmosphere-baked-fixed-lighting-v1");
    assert.equal(f.uploads.length, 5);
    const readback = f.textures.at(-1);
    assert.equal(f.calls.filter(([name, resource]) =>
        name === "deleteTexture" && resource === readback).length, 1);
    f.cleanup();
});

test("late frame hashing cannot overwrite a replacement renderer's readiness", async () => {
    const digest = deferred();
    const hashing = deferred();
    const f = fixture(successfulResponse, () => { hashing.resolve(); return digest.promise; });
    const complete = f.completeFrame();
    await hashing.promise;
    f.cleanup();
    f.canvas.dataset.cloudWebglFrameState = "replacement-initializing";
    digest.resolve(new ArrayBuffer(32));
    await assert.rejects(complete, /renderer disposed or context lost/);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "replacement-initializing");
});

test("signaled fences cannot publish an incompletely rendered retained frame", async () => {
    const f = fixture(successfulResponse, undefined, { missingLivePixel: true });
    await assert.rejects(f.completeFrame(), /frame incomplete: 1 pixels were not rendered/);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 0);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "failed");
    assert.equal(f.canvas.dataset.cloudWebglCompletedFrames, "0");
    f.cleanup();
});

test("float plate coverage uses a negative sentinel, not valid zero depth", async () => {
    const f = fixture(successfulResponse, undefined, { missingPlatePixel: true });
    await assert.rejects(f.capture(), /plate incomplete/);
    assert.equal(f.uploads.length, 0);
    assert.ok(f.calls.some(([name, , , value]) =>
        name === "clearBufferfv" && value[3] === -1));
    f.cleanup();
});

test("cleanup during a tile presentation boundary cancels all later GPU work", async () => {
    const f = fixture(successfulResponse, undefined, { width: 33, height: 17, manualFrames: true });
    const complete = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    assert.equal(f.calls.filter(([name]) => name === "drawArrays").length, 1);
    f.cleanup();
    const afterCleanup = f.calls.length;
    await assert.rejects(complete, /capture canceled/);
    assert.equal(f.animationFrames.size, 0);
    assert.equal(f.calls.length, afterCleanup);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 0);
});

test("tiles retain global camera/UVs and coalesce live updates without starving a frame", async () => {
    const f = fixture(successfulResponse, undefined, { width: 33, height: 17, manualFrames: true });
    const firstCapture = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    f.updateScene({ cloudTime: 1 });
    f.updateScene({ cloudTime: 2 });
    assert.equal(f.canvas.width, 2, "partial target cannot resize or clear the visible frame");
    const uniforms = () => f.calls.filter(([name, location]) => name === "uniform1f" && location === "u_cloud_time");
    assert.deepEqual(uniforms().map((call) => call[2]), [0]);
    for (let tile = 0; tile < 6; tile += 1) {
        await until(() => f.animationFrames.size === 1);
        f.advanceFrame();
    }
    await firstCapture;
    await until(() => f.animationFrames.size === 1);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 1,
        "the first complete image stays visible during the next job");
    assert.equal(f.canvas.width, 33);
    assert.deepEqual(uniforms().map((call) => call[2]), [0, 2], "intermediate clock state is coalesced");
    assert.notEqual(f.canvas.dataset.cloudWebglFrameState, "complete", "older same-key scene cannot claim readiness");
    const latestCapture = f.completeFrame();
    for (let tile = 0; tile < 6; tile += 1) {
        await until(() => f.animationFrames.size === 1);
        f.advanceFrame();
    }
    await latestCapture;
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "complete");
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 2);
    const tiles = f.calls.filter(([name]) => name === "bufferData").slice(1, 7);
    const coverage = new Uint8Array(33 * 17);
    for (const [, , vertices] of tiles) {
        const x = Math.round((vertices[0] + 1) * 33 / 2);
        const y = Math.round((vertices[1] + 1) * 17 / 2);
        const right = Math.round((vertices[2] + 1) * 33 / 2);
        const top = Math.round((vertices[5] + 1) * 17 / 2);
        assert.ok(right - x <= 16 && top - y <= 16);
        for (let row = y; row < top; row += 1) for (let column = x; column < right; column += 1) {
            coverage[row * 33 + column] += 1;
        }
    }
    assert.ok(coverage.every((value) => value === 1), "every global pixel belongs to exactly one tile");
    assert.ok(f.calls.filter(([name]) => name === "viewport").every((call) =>
        call[1] === 0 && call[2] === 0 && call[3] === 33 && call[4] === 17));
    assert.ok(f.calls.filter(([name, location]) => name === "uniform4f" && location === "u_cloud_quality")
        .every((call) => call[2] === 1536 && call[3] === 24));
    f.cleanup();
});

test("resize retires a partial target before it can blit", async () => {
    const f = fixture(successfulResponse, undefined, { width: 33, height: 17, manualFrames: true });
    const complete = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    f.resize(17, 17);
    f.advanceFrame();
    await assert.rejects(complete, /viewport resized/);
    await until(() => f.animationFrames.size === 1);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 0);
    assert.notEqual(f.canvas.dataset.cloudWebglFrameState, "failed", "old cancellation cannot poison replacement");
    f.cleanup();
});

test("a resized capture hashing continuation cannot mark a newer job failed", async () => {
    const digest = deferred();
    const hashing = deferred();
    let hashes = 0;
    const f = fixture(successfulResponse, () => {
        if (++hashes > 1) return new ArrayBuffer(32);
        hashing.resolve();
        return digest.promise;
    });
    const complete = f.completeFrame();
    await hashing.promise;
    f.resize(3, 2);
    digest.resolve(new ArrayBuffer(32));
    await assert.rejects(complete, /viewport resized/);
    await until(() => f.calls.filter(([name]) => name === "blitFramebuffer").length === 2);
    assert.notEqual(f.canvas.dataset.cloudWebglFrameState, "failed");
    await f.completeFrame();
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "complete");
    assert.equal(f.canvas.dataset.cloudWebglFrameWidth, "3");
    f.cleanup();
});

test("same-key scene changes during hashing cannot publish the older snapshot", async () => {
    const digest = deferred();
    const hashing = deferred();
    const f = fixture(successfulResponse, () => { hashing.resolve(); return digest.promise; }, { manualFrames: true });
    const complete = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    f.advanceFrame();
    await hashing.promise;
    f.updateScene({ cloudTime: 20 });
    await until(() => f.animationFrames.size === 1);
    digest.resolve(new ArrayBuffer(32));
    await complete;
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "submitted");
    assert.equal(f.canvas.dataset.cloudWebglCompletedFrames, "0");
    f.cleanup();
});

test("queued captures share the latest live frame instead of rendering it repeatedly", async () => {
    const f = fixture(successfulResponse, undefined, { manualFrames: true });
    await until(() => f.animationFrames.size === 1);
    f.updateScene({ cloudTime: 99 });
    const first = f.completeFrame();
    const second = f.completeFrame();
    f.advanceFrame();
    await until(() => f.animationFrames.size === 1);
    f.advanceFrame();
    await Promise.all([first, second]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.animationFrames.size, 0);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 2);
    assert.deepEqual(f.calls.filter(([name, location]) => name === "uniform1f" && location === "u_cloud_time")
        .map((call) => call[2]), [0, 99]);
    f.cleanup();
});

test("hidden presentation cancels a tiled job and releases the queue for resumption", async () => {
    const f = fixture(successfulResponse, undefined, { manualFrames: true });
    const complete = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    f.setHidden(true);
    await assert.rejects(complete, /presentation unavailable while hidden/);
    assert.equal(f.animationFrames.size, 0);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 0);
    await new Promise((resolve) => setImmediate(resolve));
    f.setHidden(false);
    const resumed = f.completeFrame();
    await until(() => f.animationFrames.size === 1);
    f.advanceFrame();
    await resumed;
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "complete");
    f.cleanup();
});

test("a superseded queued capture cannot overwrite a restored immutable scene", async () => {
    const f = fixture(successfulResponse, undefined, { manualFrames: true });
    await until(() => f.animationFrames.size === 1);
    f.updateScene({ cloudTime: 99 });
    const obsolete = f.completeFrame();
    f.restoreScene();
    f.advanceFrame();
    await assert.rejects(obsolete, /scene was superseded/);
    await new Promise((resolve) => setImmediate(resolve));
    await f.completeFrame();
    assert.equal(f.animationFrames.size, 0);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 1);
    assert.deepEqual(f.calls.filter(([name, location]) => name === "uniform1f" && location === "u_cloud_time")
        .map((call) => call[2]), [0]);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "complete");
    f.cleanup();
});

test("a superseded in-flight capture cannot blit over the last good restored scene", async () => {
    const f = fixture(successfulResponse, undefined, { manualFrames: true });
    await until(() => f.animationFrames.size === 1);
    f.updateScene({ cloudTime: 99 });
    const obsolete = f.completeFrame();
    f.advanceFrame();
    await until(() => f.animationFrames.size === 1);
    f.restoreScene();
    f.advanceFrame();
    await assert.rejects(obsolete, /scene was superseded/);
    await new Promise((resolve) => setImmediate(resolve));
    await f.completeFrame();
    assert.equal(f.animationFrames.size, 0);
    assert.equal(f.calls.filter(([name]) => name === "blitFramebuffer").length, 1);
    assert.deepEqual(f.calls.filter(([name, location]) => name === "uniform1f" && location === "u_cloud_time")
        .map((call) => call[2]), [0, 99]);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "complete");
    f.cleanup();
});

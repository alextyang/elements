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

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

// Exercise the real renderer effect, capture method, and cleanup. GPU resources
// are tracked so a continuation cannot silently bind a deleted object; uploads
// and response decoding can be paused independently at their actual awaits.
function fixture(fetchResponse, digest = async () => new ArrayBuffer(32)) {
    const calls = [];
    const deleted = new Set();
    const textures = [];
    let contextLost = false;
    const gl = new Proxy({
        NO_ERROR: 0,
        getError: () => 0,
        getExtension: () => ({}),
        getParameter: () => "fixture",
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getAttribLocation: () => 0,
        checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE",
        isContextLost: () => contextLost,
        fenceSync: () => ({}),
        clientWaitSync: () => "ALREADY_SIGNALED",
        createTexture: () => {
            const texture = {};
            textures.push(texture);
            return texture;
        },
        readPixels: (...args) => args.at(-1).fill(0),
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
        getBoundingClientRect: () => ({ width: 2, height: 2 }),
    });
    const document = Object.assign(new EventTarget(), { hidden: false });
    const observers = [];
    class ResizeObserver {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
        disconnect() {}
    }
    const effects = [];
    const dependencies = {
        react: {
            useRef: (value) => ({ current: value }),
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
        "./camera-contract": {
            cameraYawRadiansFromViewAzimuth: () => 0,
            rotateDirectionByCameraYaw: (direction) => direction,
        },
        "./sky.module.css": { default: {} },
    };
    const uploads = [];
    const fetch = async (url, options) => {
        uploads.push({ url, options });
        return fetchResponse(url, options);
    };
    const module = { exports: {} };
    new Function("exports", "require", "window", "document", "ResizeObserver", "fetch", "crypto", javascript)(
        module.exports, (name) => dependencies[name],
        { devicePixelRatio: 1 }, document, ResizeObserver, fetch, { subtle: { digest } },
    );
    const scene = new Proxy({
        palette: new Proxy({}, { get: () => "#ffffff" }),
        sun: [0.5, 0.5], moon: [0.5, 0.5],
        sunDirection: [0, 1, 0], moonDirection: [0, 1, 0],
        moonLightColor: "#ffffff", cloudScene: { fog: 0, noctilucent: 0 },
    }, { get: (target, name) => target[name] ?? 0 });
    module.exports.AtmosphereCanvas({ scene, sceneKey: "fixture" });
    effects[0]();
    const cleanup = effects[1]();
    const capture = canvas.__elementsCloudPlateCapture;
    const completeFrame = canvas.__elementsWebGlFrameComplete;
    return {
        canvas, calls, deleted, textures, uploads, observers, cleanup, completeFrame,
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

test("plate disposal aborts a pending upload and never touches retired GL state", async () => {
    const pending = deferred();
    const f = fixture((_, { signal }) => {
        signal.addEventListener("abort", () => pending.reject(new DOMException("aborted", "AbortError")));
        return pending.promise;
    });
    const capture = f.capture();
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
    await assert.rejects(complete, /context lost or disposed/);
    assert.equal(f.canvas.dataset.cloudWebglFrameState, "replacement-initializing");
});

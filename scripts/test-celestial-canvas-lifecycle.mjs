import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as cameraContract from "../components/backgrounds/sky/camera-contract.ts";

const source = readFileSync(new URL(
    "../components/backgrounds/sky/celestial-canvas.tsx", import.meta.url,
), "utf8");
const javascript = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
    },
}).outputText;

// Run the actual effect with controllable image completion and animation queues.
// A deleted texture or inactive shader attribute is an error in this GL fixture,
// just as in WebGL; the fixture never consumes or clears errors on its behalf.
function fixture() {
    const images = [];
    class Image extends EventTarget {
        constructor() { super(); images.push(this); }
        finish() { this.dispatchEvent(new Event("load")); }
    }
    const uploads = [];
    const deletedTextures = new Set();
    const attributes = new Map();
    const pointers = [];
    let starData;
    let boundTexture;
    let draws = 0;
    const gl = new Proxy({
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getAttribLocation: (_, name) => {
            if (name === "a_opacity") return -1; // The linker removes this unused input.
            if (!attributes.has(name)) attributes.set(name, attributes.size);
            return attributes.get(name);
        },
        enableVertexAttribArray: (index) => assert.ok(index >= 0, "inactive attribute"),
        vertexAttribPointer: (index, size, type, normalized, stride, offset) => {
            assert.ok(index >= 0, "inactive attribute");
            pointers.push({ index, size, stride, offset });
        },
        bindTexture: (_, texture) => {
            assert.ok(!deletedTextures.has(texture), "upload references deleted texture");
            boundTexture = texture;
        },
        deleteTexture: (texture) => deletedTextures.add(texture),
        texImage2D: (...args) => {
            if (args.at(-1) instanceof Image) {
                uploads.push({ texture: boundTexture, image: args.at(-1) });
            }
        },
        bufferData: (_, data, usage) => {
            if (usage === "DYNAMIC_DRAW") starData = data;
        },
        clear: () => { draws += 1; },
    }, {
        get(target, key) {
            if (key in target) return target[key];
            if (/^[A-Z_0-9]+$/.test(key)) return key;
            if (key.startsWith("create")) return () => ({});
            return () => {};
        },
    });
    const canvas = {
        width: 800, height: 500,
        getContext: () => gl,
        getBoundingClientRect: () => ({ width: 800, height: 500 }),
    };
    const intervals = new Map();
    const frames = new Map();
    let nextId = 0;
    const window = {
        devicePixelRatio: 1,
        setInterval: (callback) => { intervals.set(++nextId, callback); return nextId; },
        clearInterval: (id) => intervals.delete(id),
        requestAnimationFrame: (callback) => { frames.set(++nextId, callback); return nextId; },
        cancelAnimationFrame: (id) => frames.delete(id),
    };
    const document = Object.assign(new EventTarget(), { hidden: false });
    const observers = [];
    class ResizeObserver {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
        disconnect() {}
    }
    const refs = [];
    let refIndex = 0;
    let effects = [];
    const react = {
        useRef: (value) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }),
        useEffect: (callback) => effects.push(callback),
    };
    const dependencies = {
        react,
        "react/jsx-runtime": { jsx: (_, props) => { props.ref.current = canvas; } },
        "./sky.module.css": { default: {} },
        "./camera-contract": cameraContract,
    };
    const module = { exports: {} };
    new Function("exports", "require", "Image", "window", "document", "ResizeObserver", javascript)(
        module.exports, (name) => dependencies[name], Image, window, document, ResizeObserver,
    );
    const scene = {
        moon: { visible: false, photoUrl: "/moon-first.png" },
        starsOpacity: 1, stellarExposure: 1, stellarGlow: 1,
        stars: [{
            x: 25, y: 50, radius: 2, opacity: 0.9, color: "rgb(255, 128, 64)",
            scintillation: 0.1, phaseOffset: 0.2, chromaticScintillation: 0.3,
            radiance: 0.4, detection: 0.5, glow: 0.6, seeing: 0.7,
        }],
    };
    const render = (nextScene = scene) => {
        refIndex = 0;
        effects = [];
        module.exports.CelestialCanvas({ scene: nextScene });
        effects[0]();
        effects[1]();
    };
    render();
    return {
        images, uploads, attributes, pointers, intervals, frames, observers, scene,
        render,
        mount: () => effects[2](),
        get starData() { return starData; },
        get draws() { return draws; },
    };
}

test("celestial effect replay detaches all Moon uploads before deleting textures", () => {
    const f = fixture();
    const cleanupFirst = f.mount();
    const staleImages = [...f.images];
    assert.equal(staleImages.length, 3);
    cleanupFirst();
    const cleanupSecond = f.mount();
    staleImages.forEach((image) => image.finish());
    assert.equal(f.uploads.length, 0);
    f.images.slice(3).forEach((image) => image.finish());
    assert.equal(f.uploads.length, 3, "the living effect still uploads all lunar textures");
    cleanupSecond();
});

test("replacing a lunar photograph detaches the previous image upload", () => {
    const f = fixture();
    const cleanup = f.mount();
    const oldPhoto = f.images.find((image) => image.src === "/moon-first.png");
    f.render({ ...f.scene, moon: { ...f.scene.moon, photoUrl: "/moon-next.png" } });
    oldPhoto.finish();
    assert.equal(f.uploads.length, 0);
    f.images.at(-1).finish();
    assert.equal(f.uploads.at(-1).image.src, "/moon-next.png");
    cleanup();
});

test("cleanup cancels queued scintillation and rejects late resize draws", () => {
    const f = fixture();
    const cleanup = f.mount();
    f.intervals.values().next().value();
    assert.equal(f.frames.size, 1);
    cleanup();
    assert.equal(f.frames.size, 0);
    assert.equal(f.intervals.size, 0);
    const draws = f.draws;
    f.observers[0].callback();
    assert.equal(f.draws, draws);
});

test("packed stellar attributes preserve radiance and geometry without unused opacity", () => {
    const f = fixture();
    const cleanup = f.mount();
    assert.ok(!f.attributes.has("a_opacity"));
    const expected = {
        a_position: [0.25, 0.5], a_size: [4.24], a_color: [1, 128 / 255, 64 / 255],
        a_scintillation: [0.1], a_phase: [0.2], a_chromatic: [0.3],
        a_radiance: [0.4], a_detection: [0.5], a_glow: [0.6], a_seeing: [0.7],
    };
    for (const [name, values] of Object.entries(expected)) {
        const pointer = f.pointers.find((item) =>
            item.index === f.attributes.get(name) && item.stride > 0);
        assert.equal(pointer.stride, f.starData.byteLength);
        const offset = pointer.offset / Float32Array.BYTES_PER_ELEMENT;
        values.forEach((value, index) =>
            assert.ok(Math.abs(f.starData[offset + index] - value) < 1e-6, name));
    }
    cleanup();
});

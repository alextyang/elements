import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as camera from "../components/backgrounds/sky/camera-contract.ts";
import { createWebGlFieldEvaluator } from "./lib/webgl-field-evaluation.mjs";

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url));

const state = camera.resolveSkyCamera();
const near = (actual, expected, tolerance = 1e-11) => actual.forEach((value, index) =>
    assert.ok(Math.abs(value - expected[index]) < tolerance,
        `${actual} != ${expected}`));

test("rectilinear rays and their inverse agree across the production image", () => {
    for (const heading of [0, 55, 180, 359]) {
        const view = camera.resolveSkyCamera({ viewAzimuth: heading });
        for (const u of [0, .1, .5, .9, 1]) for (const v of [0, .1, .5, .9, 1]) {
            const ray = camera.skyCameraRayDirection([u, v], view);
            near(camera.projectSkyDirectionToUv(ray, view), [u, v]);
            assert.ok(Math.abs(Math.hypot(...ray) - 1) < 1e-12);
        }
    }
});

test("straight world lines remain straight on the image plane", () => {
    const start = camera.skyCameraRayDirection([.15, .25], state).map(value => value * 2);
    const end = camera.skyCameraRayDirection([.85, .7], state).map(value => value * 7);
    const first = camera.projectSkyDirectionToUv(start, state);
    const last = camera.projectSkyDirectionToUv(end, state);
    for (const amount of [.1, .25, .5, .75, .9]) {
        const point = start.map((value, index) => value * (1 - amount) + end[index] * amount);
        const uv = camera.projectSkyDirectionToUv(point, state);
        const determinant = (uv[0] - first[0]) * (last[1] - first[1]) -
            (uv[1] - first[1]) * (last[0] - first[0]);
        assert.ok(Math.abs(determinant) < 1e-12);
    }
});

test("equal transverse spans shrink in inverse proportion to depth", () => {
    const forward = camera.skyCameraRayDirection([.5, .5], state);
    const right = camera.rotateDirectionByCameraYaw([1, 0, 0],
        camera.cameraYawRadiansFromViewAzimuth(state.viewAzimuth));
    const projectedWidth = depth => {
        const uv = [-.5, .5].map(offset => camera.projectSkyDirectionToUv(
            forward.map((value, index) => value * depth + right[index] * offset), state));
        return uv[1][0] - uv[0][0];
    };
    assert.ok(Math.abs(projectedWidth(5) / projectedWidth(10) - 2) < 1e-12);
});

test("the bounded default has no zenith fold and rejects directions behind the viewer", () => {
    for (let row = 0; row <= 40; row++) for (let column = 0; column <= 40; column++) {
        const ray = camera.skyCameraRayDirection([column / 40, row / 40], state);
        assert.ok(ray.every(Number.isFinite));
        assert.ok(ray[1] < .76);
    }
    const backwards = camera.skyCameraRayDirection([.5, .5], state).map(value => -value);
    assert.equal(camera.projectSkyDirectionToUv(backwards, state), null);
});

test("diagnostic overrides remain finite and below a 180-degree field", () => {
    assert.deepEqual(state, camera.PRODUCTION_SKY_CAMERA);
    assert.deepEqual(camera.resolveSkyCamera({ horizontalFov: NaN }), state);
    const diagnostic = camera.resolveSkyCamera({ viewAzimuth: -90, viewElevation: 72,
        horizontalFov: 241.2, verticalFov: 180 });
    assert.equal(diagnostic.viewAzimuth, 270);
    assert.equal(diagnostic.viewElevation, 72);
    assert.equal(diagnostic.horizontalFov, 160);
    assert.equal(diagnostic.verticalFov, 160);
    assert.ok(camera.skyCameraRayDirection([0, 0], diagnostic).every(Number.isFinite));
});

test("physical angular sizes use the same rectilinear focal length", () => {
    const angularRadius = .0045;
    const halfWidth = camera.skyCameraAngularRadiusPixels(angularRadius, 800, state);
    const source = camera.projectCameraLocalDirectionToUv([
        Math.sin(angularRadius), Math.cos(angularRadius) * Math.sin(27 * Math.PI / 180),
        Math.cos(angularRadius) * Math.cos(27 * Math.PI / 180),
    ], state);
    assert.ok(Math.abs((source[0] - .5) * 800 - halfWidth) < 1e-11);
});

test("off-axis angular-disc center and horizontal extent agree with the source rays", () => {
    const flat = camera.resolveSkyCamera({ viewAzimuth: 180, viewElevation: 0 });
    const azimuth = 25 * Math.PI / 180;
    const radius = .0045;
    const direction = angle => [Math.sin(angle), 0, Math.cos(angle)];
    const left = camera.projectCameraLocalDirectionToUv(direction(azimuth - radius), flat);
    const right = camera.projectCameraLocalDirectionToUv(direction(azimuth + radius), flat);
    const halfExtent = camera.skyCameraAngularRadiusPixels(radius, 800, flat, direction(azimuth));
    assert.ok(Math.abs((right[0] - left[0]) * 400 - halfExtent) < 1e-11);
    assert.ok(halfExtent > camera.skyCameraAngularRadiusPixels(radius, 800, flat));
    const center = camera.projectCameraLocalDirectionToUv(direction(azimuth), flat);
    near(camera.skyCameraRayDirection(center, flat), direction(azimuth));
});


test("the actual WebGL view shader agrees numerically with the shared camera", () => {
    const shader = readFileSync(resolve(sourceRoot, "atmosphere-canvas.tsx"), "utf8");
    const functionSource = shader.match(/vec3 view_direction\(vec2 uv\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(functionSource, "actual WebGL ray function is available");
    const evaluate = createWebGlFieldEvaluator(functionSource, "view_direction");
    for (const overrides of [{}, { viewAzimuth: 270, viewElevation: 48, horizontalFov: 70 }]) {
        const view = camera.resolveSkyCamera(overrides);
        const ray = evaluate({
            u_camera: [view.horizontalFov * Math.PI / 180,
                view.viewElevation * Math.PI / 180, view.verticalFov * Math.PI / 180,
                camera.cameraYawRadiansFromViewAzimuth(view.viewAzimuth)],
            sin: Math.sin, cos: Math.cos, tan: Math.tan,
        });
        for (const u of [0, .25, .5, .75, 1]) for (const v of [0, .25, .5, .75, 1]) {
            near(ray([u, v]), camera.skyCameraRayDirection([u, v], view));
        }
    }
});

// Evaluate the real calculation modules without starting React or a GPU renderer.
const calculationModules = new Map();
const loadCalculationModule = (modulePath) => {
    if (calculationModules.has(modulePath)) return calculationModules.get(modulePath).exports;
    const moduleObject = { exports: {} };
    calculationModules.set(modulePath, moduleObject);
    const source = readFileSync(modulePath, "utf8");
    let javascript = ts.transpileModule(source, { fileName: modulePath, compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
    } }).outputText;
    if (modulePath.endsWith("/sky.tsx")) javascript += "\nexports.calculateSky = calculateSky;\n";
    const localRequire = (specifier) => {
        if (specifier.endsWith(".css") || specifier === "./sky-renderer-canvas") return {};
        if (!specifier.startsWith(".")) return require(specifier);
        const root = resolve(dirname(modulePath), specifier);
        const target = [root, `${root}.ts`, `${root}.tsx`].find(path => existsSync(path));
        if (!target) throw new Error(`Missing calculation dependency ${specifier}`);
        return loadCalculationModule(target);
    };
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports, moduleObject, localRequire);
    return moduleObject.exports;
};

test("ordinary sky and photographic production cameras share resolved defaults", () => {
    const sky = loadCalculationModule(resolve(sourceRoot, "sky.tsx"));
    const photograph = loadCalculationModule(resolve(sourceRoot, "weather-cloud-photograph-benchmark.ts"));
    const date = new Date("2026-07-25T21:00:00.000Z");
    const defaultSky = sky.calculateSky(date);
    const explicitSky = sky.calculateSky(date, { ...camera.PRODUCTION_SKY_CAMERA });
    const benchmarkCamera = photograph.resolveProductionPerspectiveCamera("oblique-natural");
    for (const key of Object.keys(camera.PRODUCTION_SKY_CAMERA)) {
        assert.equal(defaultSky.radiance[key], benchmarkCamera[key], key);
        assert.equal(defaultSky.radiance[key], explicitSky.radiance[key], key);
    }
    assert.equal(defaultSky.radiance.cameraProjection, true);
    assert.deepEqual(defaultSky.celestial.camera, camera.PRODUCTION_SKY_CAMERA);
    assert.deepEqual(defaultSky.radiance.solarTopOfAtmosphereIrradiance,
        explicitSky.radiance.solarTopOfAtmosphereIrradiance);
    assert.deepEqual(defaultSky.radiance.moonTopOfAtmosphereIrradiance,
        explicitSky.radiance.moonTopOfAtmosphereIrradiance);
    assert.match(photograph.productionPerspectiveCameraSignature("oblique-natural"),
        /^rectilinear-v1\|55\|27\|64\|43\.52\|/);
});

test("real astronomical Moon and star centers use the ray inverse", () => {
    const astronomy = loadCalculationModule(resolve(sourceRoot, "astronomy.tsx"));
    const SunCalc = require("suncalc");
    const date = new Date("2026-07-30T06:20:00.000Z");
    const latitude = 34.0522;
    const longitude = -118.2437;
    const moon = SunCalc.getMoonPosition(date, latitude, longitude);
    const scene = astronomy.calculateCelestialScene({
        date, latitude, longitude,
        viewAzimuth: (moon.azimuth * 180 / Math.PI + 540) % 360,
        viewElevation: moon.altitude * 180 / Math.PI,
        haze: .1, cloudDensity: 0, atmosphericVeil: 0, solarAltitudeOverride: -22,
    });
    const projectedMoon = camera.projectCameraLocalDirectionToUv(scene.moon.direction, scene.camera);
    near(projectedMoon, [.5, .5]);
    near([scene.moon.x / 100, scene.moon.y / 100], projectedMoon);
    let visibleSources = 0;
    for (const star of scene.stars) {
        const projected = camera.projectCameraLocalDirectionToUv(star.direction, scene.camera);
        if (projected) {
            near([star.x / 100, star.y / 100], projected);
            visibleSources++;
        } else {
            assert.ok(star.x < 0 && star.y < 0);
        }
    }
    assert.ok(visibleSources > 0);
});

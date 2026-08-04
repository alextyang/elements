import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const compileCommonJs = (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const moduleObject = { exports: {} };
    new Function("exports", "module", javascript)(
        moduleObject.exports,
        moduleObject,
    );
    return moduleObject.exports;
};

const camera = compileCommonJs(
    "../components/backgrounds/sky/camera-contract.ts",
);

test("camera yaw keeps the explicit 180-degree benchmark reference", () => {
    assert.equal(camera.cameraYawRadiansFromViewAzimuth(undefined), 0);
    assert.equal(camera.cameraYawRadiansFromViewAzimuth(180), 0);
    assert.ok(Math.abs(
        camera.cameraYawRadiansFromViewAzimuth(270) - Math.PI / 2,
    ) < 1e-12);
    assert.ok(Math.abs(
        camera.cameraYawRadiansFromViewAzimuth(90) + Math.PI / 2,
    ) < 1e-12);
});

test("camera yaw rotates camera-local celestial directions into Earth-local rays", () => {
    const yaw = camera.cameraYawRadiansFromViewAzimuth(270);
    const rotated = camera.rotateDirectionByCameraYaw([0, 0, 1], yaw);
    // +Z at the 180-degree reference becomes +X at a 270-degree heading.
    assert.ok(Math.abs(rotated[0] - 1) < 1e-12);
    assert.ok(Math.abs(rotated[1]) < 1e-12);
    assert.ok(Math.abs(rotated[2]) < 1e-12);
    const roundTrip = camera.rotateDirectionByCameraYaw(
        rotated,
        -yaw,
    );
    assert.ok(Math.abs(roundTrip[0]) < 1e-12);
    assert.ok(Math.abs(roundTrip[2] - 1) < 1e-12);
});

test("camera yaw is included in shader and parameter ABI contracts", () => {
    const rendererSource = readFileSync(new URL(
        "../components/backgrounds/sky/sky-renderer-canvas.tsx",
        import.meta.url,
    ), "utf8");
    const shaderSource = readFileSync(new URL(
        "../components/backgrounds/sky/webgpu-shaders.ts",
        import.meta.url,
    ), "utf8");
    const validatorSource = readFileSync(new URL(
        "./validate-webgpu-shaders.mjs",
        import.meta.url,
    ), "utf8");
    assert.match(rendererSource, /new Float32Array\(54 \* 4\)/);
    assert.match(rendererSource, /setVector\(data, 53, \[\s*currentTransportYawRadians/);
    assert.match(shaderSource, /view_direction_for_camera\(input\.uv, p\[4\], p\[53\]\.x\)/);
    assert.match(shaderSource, /project_direction_to_camera\(\s*display_direction, p\[32\], p\[53\]\.y/);
    assert.match(shaderSource, /sin\(p\[53\]\.x - p\[53\]\.y\)/);
    assert.match(validatorSource, /const productionParameterBufferBytes = 54 \* 16/);
});


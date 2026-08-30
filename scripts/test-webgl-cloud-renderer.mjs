import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const shader = read("../components/backgrounds/sky/webgl-cloud-shader.ts");
const noise = read("../components/backgrounds/sky/webgl-cloud-noise.ts");
const atmosphere = read("../components/backgrounds/sky/atmosphere-canvas.tsx");
const renderer = read("../components/backgrounds/sky/sky-renderer-canvas.tsx");
const license = read("../components/backgrounds/sky/PHOTON-LICENSE.txt");

test("WebGL clouds use continuous world-space volume density", () => {
    assert.match(shader, /precision highp sampler3D/);
    assert.match(shader, /float cloud_density\(vec3 position/);
    assert.match(shader, /texture\(\s*u_cloud_base,/s);
    assert.match(shader, /texture\(\s*u_cloud_detail,/s);
    assert.match(shader, /cloud_ray_sphere\(origin, direction/);
    assert.match(shader, /for \(int index = 0; index < 64/);
    assert.doesNotMatch(shader, /cloud-volume-atlas|atlasDeterministicVariant/);
});

test("WebGL cloud noise is volumetric and reproducible", () => {
    assert.match(noise, /gl\.TEXTURE_3D/);
    assert.match(noise, /createCloudNoise/);
    assert.match(noise, /base: WebGLTexture/);
    assert.match(noise, /detail: WebGLTexture/);
    assert.match(noise, /weather: WebGLTexture/);
    assert.match(noise, /curl: WebGLTexture/);
});

test("AtmosphereCanvas integrates the volume at the physical camera", () => {
    assert.match(atmosphere, /\$\{CLOUD_UNIFORMS\}/);
    assert.match(atmosphere, /\$\{CLOUD_FUNCTIONS\}/);
    assert.match(atmosphere, /\$\{CLOUD_COMPOSITE\}/);
    assert.match(atmosphere, /createCloudNoise\(gl\)/);
    assert.match(atmosphere, /packCloudLayers\(/);
    assert.match(atmosphere, /current\.horizontalFov/);
    assert.match(atmosphere, /current\.viewElevation/);
    assert.match(atmosphere, /current\.verticalFov/);
    assert.match(atmosphere, /cameraYawRadiansFromViewAzimuth\(current\.viewAzimuth\)/);
    assert.match(atmosphere, /uniform\("u_cloud_quality"\),\s*64,\s*6,/s);
});

test("explicit WebGL2 mode has one volumetric owner and no CSS cloud doubles", () => {
    const branchStart = renderer.indexOf('if (backend === "webgl2")');
    const branch = renderer.slice(
        branchStart,
        renderer.indexOf("className={styles.legacyFallback}", branchStart),
    );
    assert.match(branch, /<AtmosphereCanvas scene=\{radiance\}/);
    assert.doesNotMatch(branch, /styles\.clouds|styles\.mistLayer/);
    assert.match(license, /Copyright .* Benjamin Stott/);
});

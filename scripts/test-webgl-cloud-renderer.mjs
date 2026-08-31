import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const shader = read("../components/backgrounds/sky/webgl-cloud-shader.ts");
const noise = read("../components/backgrounds/sky/webgl-cloud-noise.ts");
const atmosphere = read("../components/backgrounds/sky/atmosphere-canvas.tsx");
const renderer = read("../components/backgrounds/sky/sky-renderer-canvas.tsx");
const benchmark = read("../app/cloud-photographs/cloud-photograph-benchmark.tsx");
const license = read("../components/backgrounds/sky/PHOTON-LICENSE.txt");

test("WebGL clouds use continuous world-space volume density", () => {
    assert.match(shader, /precision highp sampler3D/);
    assert.match(shader, /float cloud_density\(vec3 position/);
    assert.match(shader, /texture\(\s*u_cloud_base,/s);
    assert.match(shader, /texture\(\s*u_cloud_detail,/s);
    assert.match(shader, /cloud_ray_sphere\(origin, direction/);
    assert.match(shader, /for \(int index = 0; index < 384/);
    assert.match(shader, /steps = clamp\(steps, 8, 384\)/);
    assert.match(shader, /min\(span \/ float\(steps\), 25\.0\)/);
    assert.match(shader, /for \(int i = 0; i < 12/);
    assert.match(shader, /const float dither = 0\.5/);
    assert.doesNotMatch(shader, /cloud_dither\(gl_FragCoord/);
    assert.match(shader, /float local_support = smoother/);
    assert.match(shader, /density \+= local_support \* layer\.towerAmount/);
    assert.match(shader, /density \+= local_support \* layer\.anvilAmount/);
    assert.doesNotMatch(shader, /density \+= layer\.(towerAmount|anvilAmount)/);
    assert.doesNotMatch(shader, /cloud-volume-atlas|atlasDeterministicVariant/);
});

test("WebGL clouds expose an affine scene-linear plate operator", () => {
    assert.match(shader, /uniform float u_cloud_output_mode/);
    assert.match(shader, /float firstDistance/);
    assert.match(shader, /clouds\.firstDistance/);
    assert.match(shader, /max\(clouds\.scattering, vec3\(0\.0\)\)/);
    assert.match(shader, /vec3\(saturate\(clouds\.transmittance\)\)/);
    assert.match(shader, /\* 0\.001/);
});

test("Congestus is a finite continuous species field", () => {
    assert.match(shader, /CLOUD_SPECIES_CODE/);
    assert.match(shader, /u_layer_morphology/);
    assert.match(shader, /float cloud_congestus_coverage\(/);
    assert.match(shader, /float group_envelope = along_envelope \* normal_envelope/);
    assert.match(shader, /float lineage = lineage_coarse/);
    assert.match(shader, /float family_a = 1\.0 - smoothstep/);
    assert.match(shader, /rising_threshold \+= \(1\.0 - family\)/);
    assert.match(shader, /float base_bridge = 0\.025/);
    assert.match(shader, /mix\(-0\.08, -0\.24/);
    assert.match(shader, /float rising_threshold = mix/);
    assert.doesNotMatch(shader, /ellipsoid|sphere_stamp|circle_stamp/i);
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
    assert.match(atmosphere, /uniform\("u_cloud_quality"\),\s*384,\s*12,/s);
    assert.match(atmosphere, /data-sky-renderer="webgl2"/);
    assert.match(atmosphere, /data-cloud-scene-key=\{sceneKey\}/);
});

test("AtmosphereCanvas exports little-endian rgba16float WebGL plates", () => {
    assert.match(atmosphere, /powerPreference: "high-performance"/);
    assert.match(atmosphere, /EXT_color_buffer_float/);
    assert.match(atmosphere, /gl\.RGBA32F/);
    assert.match(atmosphere, /gl\.readPixels\(/);
    assert.match(atmosphere, /cloudSourceFloat16Bits/);
    assert.match(atmosphere, /view\.setUint16\([\s\S]*true,/);
    assert.match(atmosphere, /__elementsCloudPlateCapture/);
    assert.match(atmosphere, /dataset\.cloudPlateExport = "available"/);
    assert.match(atmosphere, /\/api\/cloud-plates\/capture-plane/);
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

test("fixed-camera photograph benchmark can explicitly select WebGL2", () => {
    assert.match(benchmark, /search\.get\("rendererPreference"\)/);
    assert.match(benchmark, /requestedRendererPreference as SkyRendererPreference/);
    assert.match(benchmark, /preview:\s*\{[\s\S]*rendererPreference,/);
});

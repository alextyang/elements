import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-volume-filtering-wgsl.ts",
    import.meta.url,
), "utf8");

const angularPixelSpan = (camera, resolution) => camera[3] > 1.5
    ? Math.max(
        2 * Math.tan(camera[0] * 0.5) / Math.max(1, resolution[0]),
        2 * Math.tan(camera[2] * 0.5) / Math.max(1, resolution[1]),
    )
    : Math.max(
        Math.abs(camera[0]) / Math.max(1, resolution[0]),
        Math.abs(camera[2]) / Math.max(1, resolution[1]),
    );

const lodFor = (distance, frequency, textureSize, maximumMip, camera, resolution) =>
    Math.min(maximumMip, Math.max(0, Math.log2(Math.max(
        1,
        Math.max(0, distance) * angularPixelSpan(camera, resolution) *
            Math.max(0, frequency) * Math.max(1, textureSize),
    ))));

const rmsFrequency = (frequency) => Math.hypot(...frequency) /
    Math.sqrt(frequency.length);

test("WGSL volume filtering is analytic and legal inside density ray loops", () => {
    assert.match(source, /fn cloud_volume_angular_pixel_span/);
    assert.match(source, /fn cloud_volume_rms_world_frequency/);
    assert.match(source, /length\(frequency\) \* 0\.5773502691896258/);
    assert.match(source, /fn cloud_volume_lod_for_world_frequency/);
    assert.match(source, /2\.0 \* tan\(camera\.x \* 0\.5\) \/ resolution\.x/);
    assert.match(source, /log2\(max\(1\.0, texture_footprint\)\)/);
    assert.doesNotMatch(source, /dpdx|dpdy|fwidth|textureSample\(/);
});

test("anisotropic appearance bandwidth uses RMS frequency, not max-axis overfiltering", () => {
    const frequency = [3.55, 4.10, 1.52];
    const rms = rmsFrequency(frequency);
    const maxAxis = Math.max(...frequency);
    assert.ok(rms < maxAxis);
    assert.ok(rms > maxAxis * 0.7,
        "RMS bandwidth must remain a physical 3-D average, not a beauty bias");
    const camera = [64 * Math.PI / 180, 0, 46 * Math.PI / 180, 2];
    const maxLod = lodFor(80, maxAxis, 64, 6, camera, [800, 500]);
    const rmsLod = lodFor(80, rms, 64, 6, camera, [800, 500]);
    assert.ok(rmsLod < maxLod,
        "RMS projected bandwidth must preserve valid fine variance at distance");
    assert.ok(maxLod - rmsLod < 1,
        "RMS correction must stay within one mip, not sharpen arbitrarily");
});

test("near samples retain level zero and distant high frequencies prefilter", () => {
    const camera = [80 * Math.PI / 180, 40 * Math.PI / 180,
        80 * Math.PI / 180, 2];
    assert.equal(lodFor(0, 8, 128, 7, camera, [640, 640]), 0);
    assert.equal(lodFor(0.1, 0.1, 128, 7, camera, [640, 640]), 0);
    assert.ok(lodFor(12, 8, 128, 7, camera, [640, 640]) > 4);
    assert.equal(lodFor(1_000, 20, 128, 7, camera, [320, 320]), 7);
});

test("pixel footprint responds to projection and cloud render resolution", () => {
    const perspective = [90 * Math.PI / 180, 0, 60 * Math.PI / 180, 2];
    const panorama = [Math.PI, 0, Math.PI / 2, 1];
    assert.ok(angularPixelSpan(perspective, [400, 400]) >
        angularPixelSpan(perspective, [800, 800]));
    assert.equal(angularPixelSpan(panorama, [800, 400]), Math.PI / 800);
});

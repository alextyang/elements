import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
    cloudPlateFrameCount,
    cloudPlateTransportResidual,
    createCloudPlateBuildIdentity,
    minimumFiniteDepthFromRadiancePlane,
    validateCloudPlateScene,
} from "./lib/cloud-plate-pipeline.mjs";

const scene = {
    schemaVersion: 1,
    id: "continuous-storm",
    fixedCamera: { perspectiveId: "oblique-natural" },
    source: { captureParameter: "weather", caseId: "storm--day--wide" },
    timeline: {
        durationSeconds: 240,
        frameIntervalSeconds: 20,
        loop: true,
        crossfadeSeconds: 20,
    },
    render: {
        width: 1920,
        height: 1080,
        minimumTransportSamples: 1024,
        convergenceTarget: 0.002,
        minimumVolumeBounces: 1024,
        denoiser: "none",
        backend: "blender-cycles-metal",
    },
    offlineComposition: {
        sourceKind: "wdas-complex",
        sourceAssetId: "wdas-cloud",
        scatteringStrength: 1.35,
        radianceCalibration: 0.18,
        volumeInstances: [{
            id: "core-volume", componentId: "storm-core",
            target: [0, 0, 8], scale: [0.05, 0.05, 0.02],
            rotationDegrees: 0, scatteringMultiplier: 1,
            bottomFade: 0, phaseOffset: 0,
        }, {
            id: "anvil-volume", componentId: "storm-anvil",
            target: [0, 0, 11], scale: [0.09, 0.04, 0.02],
            rotationDegrees: 0, scatteringMultiplier: 0.35,
            bottomFade: 0.8, phaseOffset: 1.7,
        }],
    },
    groups: [{
        id: "storm-system",
        continuity: "shared-volume",
        components: [{
            id: "storm-core",
            continuityVolumeId: "storm-volume",
        }, {
            id: "storm-anvil",
            continuityVolumeId: "storm-volume",
        }],
    }],
};

test("cloud plate scenes enforce one fixed production camera and shared groups", () => {
    assert.deepEqual(validateCloudPlateScene(scene), []);
    assert.equal(cloudPlateFrameCount(scene.timeline), 12);
    assert.match(validateCloudPlateScene({
        ...scene,
        fixedCamera: { perspectiveId: "horizon-wide" },
    }).join(" "), /production-camera-must-be-oblique-natural/);
    assert.match(validateCloudPlateScene({
        ...scene,
        groups: [{
            ...scene.groups[0],
            components: [
                scene.groups[0].components[0],
                { ...scene.groups[0].components[1],
                    continuityVolumeId: "detached-blob" },
            ],
        }],
    }).join(" "), /split-group/);
});

test("build identity changes with samples, extent, renderer, or scene", () => {
    const base = createCloudPlateBuildIdentity({
        scene, rendererHash: "a".repeat(64), samples: 1024,
        width: 1920, height: 1080,
    });
    const changed = [
        { scene, rendererHash: "b".repeat(64), samples: 1024,
            width: 1920, height: 1080 },
        { scene, rendererHash: "a".repeat(64), samples: 2048,
            width: 1920, height: 1080 },
        { scene, rendererHash: "a".repeat(64), samples: 1024,
            width: 1280, height: 720 },
        { scene: { ...scene, id: "changed-storm" },
            rendererHash: "a".repeat(64), samples: 1024,
            width: 1920, height: 1080 },
        { scene, rendererHash: "a".repeat(64), samples: 1024,
            width: 1920, height: 1080, convergenceTarget: 0.01 },
    ].map(createCloudPlateBuildIdentity);
    assert.equal(new Set(changed.map(({ sceneHash }) => sceneHash)).size, 5);
    for (const value of changed) assert.notEqual(value.sceneHash, base.sceneHash);
});

test("radiance alpha carries the nearest finite cloud depth", () => {
    const directory = mkdtempSync(join(tmpdir(), "cloud-plate-test-"));
    try {
        const path = join(directory, "radiance.rgba16f");
        // Three RGBA16F texels. Alpha half values: +infinity, 4.0, 2.0.
        const bytes = Buffer.alloc(24);
        bytes.writeUInt16LE(0x7c00, 6);
        bytes.writeUInt16LE(0x4400, 14);
        bytes.writeUInt16LE(0x4000, 22);
        writeFileSync(path, bytes);
        assert.equal(minimumFiniteDepthFromRadiancePlane(path), 2);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("paired transport convergence compares radiance and transmittance RGB", () => {
    const firstRadiance = Buffer.alloc(8);
    const secondRadiance = Buffer.alloc(8);
    const firstTransmittance = Buffer.alloc(8);
    const secondTransmittance = Buffer.alloc(8);
    // Half float 0.5 -> 0x3800; 1.0 -> 0x3c00.
    for (const plane of [firstRadiance, secondRadiance]) {
        for (let offset = 0; offset < 6; offset += 2) {
            plane.writeUInt16LE(0x3800, offset);
        }
    }
    for (const plane of [firstTransmittance, secondTransmittance]) {
        for (let offset = 0; offset < 6; offset += 2) {
            plane.writeUInt16LE(0x3c00, offset);
        }
    }
    assert.equal(cloudPlateTransportResidual({
        previousRadiance: firstRadiance,
        previousTransmittance: firstTransmittance,
        currentRadiance: secondRadiance,
        currentTransmittance: secondTransmittance,
    }), 0);
    secondRadiance.writeUInt16LE(0x3c00, 0);
    assert.ok(cloudPlateTransportResidual({
        previousRadiance: firstRadiance,
        previousTransmittance: firstTransmittance,
        currentRadiance: secondRadiance,
        currentTransmittance: secondTransmittance,
    }) > 0);
});

test("thunderstorm production scene selects Cycles on Metal", () => {
    const definition = JSON.parse(readFileSync(join(
        process.cwd(), "data/cloud-plate-scenes/thunderstorm-mature.json",
    ), "utf8"));
    assert.equal(definition.render.backend, "blender-cycles-metal");
    assert.equal(definition.offlineComposition.volumeInstances.length, 1);
    assert.equal(
        definition.offlineComposition.precipitation.componentId,
        "storm-rain-core",
    );
    assert.deepEqual(validateCloudPlateScene(definition), []);
});

test("thunderstorm uses a pinned continuous authored field without primitive cloud blobs", () => {
    const assets = JSON.parse(readFileSync(join(
        process.cwd(), "data/cloud-plate-assets/wdas-cloud.json",
    ), "utf8"));
    const definition = JSON.parse(readFileSync(join(
        process.cwd(), "data/cloud-plate-scenes/thunderstorm-mature.json",
    ), "utf8"));
    const renderer = readFileSync(join(
        process.cwd(), "scripts/blender/render_cloud_plate.py",
    ), "utf8");
    const pipeline = readFileSync(join(
        process.cwd(), "scripts/lib/cloud-plate-pipeline.mjs",
    ), "utf8");
    const authored = JSON.parse(readFileSync(join(
        process.cwd(), "data/cloud-plate-assets/authored-vdb.json",
    ), "utf8"));
    assert.equal(assets.license, "CC-BY-SA-3.0");
    assert.deepEqual(
        assets.assets.map(({ quality }) => quality),
        ["canary", "review", "production"],
    );
    assert.equal(
        definition.offlineComposition.sourceKind,
        "authored-continuous-field",
    );
    assert.match(renderer, /CLOUD_PLATE_VOLUME_BOUNCES.*1024/);
    assert.match(renderer, /use_adaptive_sampling = False/);
    assert.match(renderer, /use_denoising = denoiser != "NONE"/);
    assert.match(renderer, /OPENIMAGEDENOISE/);
    assert.match(renderer, /CLOUD_VOLUME_SOURCE_MAP/);
    assert.match(pipeline, /qualifyCloudPlateImage/);
    assert.match(pipeline, /!imageEvidence\.qualification\.ready/);
    assert.ok(authored.assets.some(
        ({ id }) => id === "authored-cumulonimbus-capillatus-incus"));
    assert.deepEqual(
        definition.offlineComposition.volumeInstances.map(
            ({ sourceAssetId }) => sourceAssetId),
        ["authored-cumulonimbus-capillatus-incus"],
    );
    assert.match(renderer, /continuous rain and hail precipitation curtain/);
    assert.doesNotMatch(renderer, /primitive_(?:uv_)?sphere_add|primitive_cube_add|ellipsoid/);
});

test("live playback composes verified plates as affine transport", () => {
    const renderer = readFileSync(join(
        process.cwd(), "components/backgrounds/sky/sky-renderer-canvas.tsx",
    ), "utf8");
    const shader = readFileSync(join(
        process.cwd(), "components/backgrounds/sky/webgpu-shaders.ts",
    ), "utf8");
    assert.match(renderer, /await sha256Hex\(bytes\) !== plane\.sha256/);
    assert.match(renderer, /binding: 15,[\s\S]{0,140}cloudPlateFirstTexture/);
    assert.match(renderer, /binding: 16,[\s\S]{0,140}cloudPlateSecondTexture/);
    assert.match(renderer, /canvas\.dataset\.cloudPlateSceneHash\s*=\s*state\.manifest\.sceneHash/);
    assert.match(renderer, /canvas\.dataset\.cloudPlateExtent/);
    assert.match(renderer, /cloudPlateRequest.*Date\.now/);
    assert.match(shader, /let cloud_plate_playback = p\[53\]\.w > 0\.5/);
    assert.match(shader, /let optical_depth = mix\([\s\S]*-log\(first_transmittance\)[\s\S]*-log\(second_transmittance\)/);
    assert.match(shader, /cloud_scattering \+ background \* cloud_transmittance/);
});

test("an unconverged build cannot evict the stable live manifest", () => {
    const pipeline = readFileSync(join(
        process.cwd(), "scripts/lib/cloud-plate-pipeline.mjs",
    ), "utf8");
    assert.match(pipeline,
        /publishStable\s*=\s*productionContract\s*&&\s*completed\.size\s*>\s*0/);
    assert.match(pipeline, /qualityTier:\s*productionContract/);
    assert.match(
        pipeline,
        /if \(publishStable\) writeJsonAtomic\(stableManifestPath, manifest\)/,
    );
    assert.match(
        pipeline,
        /if \(publishContent\) writeJsonAtomic\(manifestPath, manifest\)/,
    );
    assert.match(
        pipeline,
        /backendRendererInputsHash = blenderExecutable[\s\S]*CLOUD_PLATE_RENDERER_INPUTS/,
    );
    assert.match(pipeline, /scripts\/blender\/render_cloud_plate\.py/);
    assert.doesNotMatch(pipeline, /"scripts\/blender",/);
});

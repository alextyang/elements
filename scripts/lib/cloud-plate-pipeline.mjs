import { createHash, randomBytes } from "node:crypto";
import {
    copyFileSync,
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import {
    contentHashForPaths,
    rendererContentHash,
    sha256,
    stableJson,
} from "./cloud-preview-generation.mjs";
import { qualifyCloudPlateImage } from
    "./cloud-plate-image-qualification.mjs";

export const CLOUD_PLATE_ASSET_SCHEMA_VERSION = 1;
export const CLOUD_PLATE_PIPELINE_VERSION = 1;
export const CLOUD_PLATE_CAPTURE_TOKEN = "local-cloud-plate-capture";

const CLOUD_PLATE_RENDERER_INPUTS = Object.freeze([
    "app/api/cloud-plates",
    "data/cloud-plate-assets",
    "scripts/blender/render_cloud_plate.py",
    "scripts/lib/cloud-plate-image-qualification.mjs",
    "scripts/lib/cloud-plate-pipeline.mjs",
    "scripts/lib/cloud-preview-image-qualification.mjs",
    "scripts/render-cloud-plates.mjs",
]);

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

export const cloudPlateFrameCount = (timeline) => Math.max(
    1,
    Math.floor(timeline.durationSeconds / timeline.frameIntervalSeconds) +
        (timeline.loop ? 0 : 1),
);

export const validateCloudPlateScene = (scene) => {
    const failures = [];
    if (scene?.schemaVersion !== 1) failures.push("unsupported-scene-schema");
    if (!SAFE_ID.test(scene?.id ?? "")) failures.push("invalid-scene-id");
    if (scene?.fixedCamera?.perspectiveId !== "oblique-natural") {
        failures.push("production-camera-must-be-oblique-natural");
    }
    if (!["case", "weather"].includes(scene?.source?.captureParameter) ||
        typeof scene?.source?.caseId !== "string" || !scene.source.caseId) {
        failures.push("invalid-source-case");
    }
    const timeline = scene?.timeline ?? {};
    if (!(timeline.durationSeconds > 0) || !(timeline.frameIntervalSeconds > 0) ||
        timeline.frameIntervalSeconds > timeline.durationSeconds ||
        !(timeline.crossfadeSeconds >= 0)) {
        failures.push("invalid-timeline");
    }
    const render = scene?.render ?? {};
    if (!Number.isInteger(render.width) || !Number.isInteger(render.height) ||
        render.width < 64 || render.height < 64 ||
        !Number.isInteger(render.minimumTransportSamples) ||
        render.minimumTransportSamples < 64 ||
        !["native-metal", "webgl2-local-gpu", "blender-cycles-metal"].includes(
            render.backend)) {
        failures.push("invalid-render-contract");
    }
    if (!(render.convergenceTarget > 0) || render.convergenceTarget > 1) {
        failures.push("invalid-convergence-target");
    }
    if (render.backend === "blender-cycles-metal" &&
        (!Number.isInteger(render.minimumVolumeBounces) ||
            render.minimumVolumeBounces < 1 ||
            !["none", "open-image-denoise"].includes(render.denoiser) ||
            !["none", "volume"].includes(render.pathGuiding) ||
            !["henyey-greenstein", "draine", "mie"].includes(
                render.phaseFunction) ||
            !["flat", "nishita"].includes(render.worldModel))) {
        failures.push("invalid-offline-quality-contract");
    }
    if (!Array.isArray(scene?.groups) || scene.groups.length === 0) {
        failures.push("scene-has-no-groups");
    }
    const groupIds = new Set();
    const componentIds = new Set();
    for (const group of scene?.groups ?? []) {
        if (!SAFE_ID.test(group.id ?? "") || groupIds.has(group.id)) {
            failures.push(`invalid-or-duplicate-group:${group.id ?? ""}`);
        }
        groupIds.add(group.id);
        if (group.continuity !== "shared-volume" ||
            !Array.isArray(group.components) || group.components.length === 0) {
            failures.push(`invalid-continuous-group:${group.id ?? ""}`);
            continue;
        }
        const volumes = new Set(group.components.map((value) =>
            value.continuityVolumeId));
        if (volumes.size !== 1) failures.push(`split-group:${group.id}`);
        for (const component of group.components) {
            if (!SAFE_ID.test(component.id ?? "") ||
                componentIds.has(component.id)) {
                failures.push(
                    `invalid-or-duplicate-component:${component.id ?? ""}`,
                );
            }
            componentIds.add(component.id);
        }
    }
    if (render.backend === "blender-cycles-metal") {
        const composition = scene?.offlineComposition;
        const vector3 = (value, positive = false) =>
            Array.isArray(value) && value.length === 3 &&
            value.every((entry) => Number.isFinite(entry) &&
                (!positive || entry > 0));
        if (!new Set(["wdas-complex", "authored-continuous-field"]).has(
                composition?.sourceKind) ||
            !SAFE_ID.test(composition?.sourceAssetId ?? "") ||
            !(composition?.scatteringStrength > 0) ||
            !(composition?.radianceCalibration > 0) ||
            !Array.isArray(composition?.volumeInstances) ||
            composition.volumeInstances.length === 0) {
            failures.push("invalid-offline-composition");
        } else {
            const volumeIds = new Set();
            for (const instance of composition.volumeInstances) {
                if (!SAFE_ID.test(instance?.id ?? "") ||
                    volumeIds.has(instance.id) ||
                    !componentIds.has(instance.componentId) ||
                    !vector3(instance.target) || !vector3(instance.scale, true) ||
                    !(instance.scatteringMultiplier > 0) ||
                    !(instance.bottomFade >= 0 && instance.bottomFade <= 1) ||
                    !Number.isFinite(instance.rotationDegrees) ||
                    !Number.isFinite(instance.phaseOffset)) {
                    failures.push(`invalid-offline-volume:${instance?.id ?? ""}`);
                }
                volumeIds.add(instance?.id);
            }
            const rain = composition.precipitation;
            if (rain && (!componentIds.has(rain.componentId) ||
                !vector3(rain.target) || !vector3(rain.dimensions, true) ||
                !(rain.densityScale > 0) ||
                !Number.isFinite(rain.rotationDegrees))) {
                failures.push("invalid-offline-precipitation");
            }
        }
    }
    return failures;
};

export const readCloudPlateScene = (path) => {
    const scene = JSON.parse(readFileSync(path, "utf8"));
    const failures = validateCloudPlateScene(scene);
    if (failures.length) {
        throw new Error(`Invalid cloud plate scene: ${failures.join(", ")}`);
    }
    return scene;
};

const writeJsonAtomic = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = join(
        dirname(path),
        `.${basename(path)}.${process.pid}.${randomBytes(5).toString("hex")}.tmp`,
    );
    let descriptor;
    try {
        descriptor = openSync(temporary, "wx", 0o644);
        writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
        closeSync(descriptor);
        descriptor = undefined;
        renameSync(temporary, path);
    } finally {
        if (descriptor !== undefined) {
            try { closeSync(descriptor); } catch {}
        }
        rmSync(temporary, { force: true });
    }
};

const copyAtomic = (source, destination) => {
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
        copyFileSync(source, temporary);
        renameSync(temporary, destination);
    } finally {
        rmSync(temporary, { force: true });
    }
};

export const sha256File = (path) => createHash("sha256")
    .update(readFileSync(path)).digest("hex");

const halfToNumber = (half) => {
    const sign = (half & 0x8000) ? -1 : 1;
    const exponent = (half >> 10) & 0x1f;
    const fraction = half & 0x03ff;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    if (exponent === 0x1f) return fraction ? Number.NaN : sign * Infinity;
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
};

export const minimumFiniteDepthFromRadiancePlane = (path) => {
    const bytes = readFileSync(path);
    let minimum = Number.POSITIVE_INFINITY;
    for (let offset = 6; offset + 1 < bytes.length; offset += 8) {
        const depth = halfToNumber(bytes.readUInt16LE(offset));
        if (depth > 0 && depth < 1_000 && depth < minimum) minimum = depth;
    }
    return Number.isFinite(minimum) ? minimum : 1_000;
};

export const cloudPlateTransportResidual = ({
    previousRadiance,
    previousTransmittance,
    currentRadiance,
    currentTransmittance,
    previousResponses = [],
    currentResponses = [],
}) => {
    const residual = (previous, current) => {
        if (previous.length !== current.length || previous.length % 8 !== 0) {
            throw new Error("Cloud plate convergence planes have incompatible sizes.");
        }
        let squareError = 0;
        let channels = 0;
        for (let texel = 0; texel < current.length; texel += 8) {
            for (let channel = 0; channel < 3; channel += 1) {
                const offset = texel + channel * 2;
                const first = halfToNumber(previous.readUInt16LE(offset));
                const second = halfToNumber(current.readUInt16LE(offset));
                if (!Number.isFinite(first) || !Number.isFinite(second)) {
                    throw new Error("Cloud plate convergence plane is non-finite.");
                }
                const difference = second - first;
                squareError += difference * difference;
                channels += 1;
            }
        }
        return Math.sqrt(squareError / Math.max(1, channels));
    };
    if (previousResponses.length !== currentResponses.length) {
        throw new Error("Cloud plate response bases have incompatible counts.");
    }
    return Math.max(
        residual(previousRadiance, currentRadiance),
        residual(previousTransmittance, currentTransmittance),
        ...currentResponses.map((plane, index) =>
            residual(previousResponses[index], plane)),
    );
};

const resolveBlenderExecutable = (repositoryRoot) => {
    const candidates = [
        process.env.CLOUD_PLATE_BLENDER_PATH,
        join(repositoryRoot, "output/tools/Blender.app/Contents/MacOS/Blender"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    const discovered = spawnSync("which", ["blender"], { encoding: "utf8" });
    const value = discovered.status === 0 ? discovered.stdout.trim() : "";
    if (value && existsSync(value)) return value;
    throw new Error(
        "Blender is required for blender-cycles-metal cloud plates. " +
        "Set CLOUD_PLATE_BLENDER_PATH or stage Blender.app in output/tools.",
    );
};

const blenderVersion = (executable) => {
    const result = spawnSync(executable, ["--version"], { encoding: "utf8" });
    if (result.status !== 0) {
        throw new Error(`Unable to read Blender version from ${executable}.`);
    }
    return result.stdout.split(/\r?\n/, 1)[0].trim();
};

const verifiedCloudVdbAssets = (repositoryRoot) => {
    const cghevenManifest = JSON.parse(readFileSync(join(
        repositoryRoot, "data/cloud-plate-assets/cgheven-vdb.json",
    ), "utf8"));
    const wdasManifest = JSON.parse(readFileSync(join(
        repositoryRoot, "data/cloud-plate-assets/wdas-cloud.json",
    ), "utf8"));
    const authoredManifest = JSON.parse(readFileSync(join(
        repositoryRoot, "data/cloud-plate-assets/authored-vdb.json",
    ), "utf8"));
    const cghevenRoot = process.env.CLOUD_VDB_ROOT ?? join(
        repositoryRoot, "output/tools/cloud-vdb",
    );
    const wdasRoot = process.env.CLOUD_WDAS_ROOT ?? join(
        repositoryRoot, "output/tools/wdas-cloud/wdas_cloud",
    );
    const authoredRoot = process.env.CLOUD_AUTHORED_VDB_ROOT ?? join(
        repositoryRoot, "output/cloud-plates/authored-vdb",
    );
    const failures = [];
    const verified = [];
    const paths = {};
    for (const asset of cghevenManifest.assets ?? []) {
        const path = join(cghevenRoot, `${asset.id}.vdb`);
        if (!existsSync(path) || sha256File(path) !== asset.vdbSha256) {
            failures.push(asset.id);
        } else {
            verified.push(`${asset.id}:${asset.vdbSha256}`);
            paths[asset.id] = path;
        }
    }
    for (const asset of wdasManifest.assets ?? []) {
        const path = join(wdasRoot, basename(asset.entry));
        if (!existsSync(path) || sha256File(path) !== asset.vdbSha256) {
            failures.push(asset.id);
        } else {
            verified.push(`${asset.id}:${asset.vdbSha256}`);
            paths[asset.id] = path;
        }
    }
    if (sha256File(join(repositoryRoot, authoredManifest.generator)) !==
        authoredManifest.generatorSourceSha256) {
        failures.push("authored-vdb-generator");
    }
    for (const asset of authoredManifest.assets ?? []) {
        const path = join(authoredRoot, asset.entry);
        if (!existsSync(path) || sha256File(path) !== asset.vdbSha256) {
            failures.push(asset.id);
        } else {
            verified.push(`${asset.id}:${asset.vdbSha256}`);
            paths[asset.id] = path;
        }
    }
    if (failures.length) {
        throw new Error(
            `Missing or invalid cloud VDB assets: ${failures.join(", ")}. ` +
            "Run npm run cloud:plates:bootstrap.",
        );
    }
    return {
        hash: sha256(verified.map((value) => `${value}\0`)),
        paths,
        manifests: { cghevenManifest, wdasManifest, authoredManifest },
    };
};

const run = (command, args, options) => new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
        if (code === 0) resolvePromise();
        else reject(new Error(
            `${command} exited ${code ?? signal ?? "without status"}.`,
        ));
    });
});

const planeDescriptor = ({
    channel,
    source,
    publicPath,
    publicUrl,
    width,
    height,
}) => {
    const byteLength = statSync(source).size;
    if (byteLength !== width * height * 8) {
        throw new Error(
            `${channel} plane has ${byteLength} bytes; expected ${width * height * 8}.`,
        );
    }
    const checksum = sha256File(source);
    copyAtomic(source, publicPath);
    if (sha256File(publicPath) !== checksum) {
        throw new Error(`Published ${channel} plane checksum mismatch.`);
    }
    return {
        channel,
        url: publicUrl,
        sha256: checksum,
        width,
        height,
        format: "rgba16float-le",
        byteLength,
    };
};

const manifestFrameIsUsable = (repositoryRoot, frame) => {
    if (!Number.isInteger(frame?.index) || !Array.isArray(frame?.operators) ||
        frame.operators.length === 0) return false;
    return frame.operators.every((operator) =>
        [operator.radiance, operator.transmittance,
            operator.directResponse, operator.skyResponse,
            operator.groundResponse].filter(Boolean).every((plane) => {
            if (!plane || !SHA256.test(plane.sha256 ?? "") ||
                !plane.url?.startsWith("/generated/cloud-plates/")) return false;
            const path = join(repositoryRoot, "public", plane.url);
            return existsSync(path) && statSync(path).size === plane.byteLength &&
                sha256File(path) === plane.sha256;
        }));
};

const readExistingManifest = (path, identity, repositoryRoot) => {
    if (!existsSync(path)) return [];
    try {
        const manifest = JSON.parse(readFileSync(path, "utf8"));
        if (manifest.schemaVersion !== CLOUD_PLATE_ASSET_SCHEMA_VERSION ||
            manifest.sceneId !== identity.sceneId ||
            manifest.sceneHash !== identity.sceneHash ||
            manifest.rendererHash !== identity.rendererHash) return [];
        return manifest.frames.filter((frame) =>
            Number.isInteger(frame.transportSamples) &&
            frame.transportSamples >= manifest.render.minimumTransportSamples &&
            Number.isFinite(frame.convergenceDelta) &&
            frame.convergenceDelta <= manifest.render.convergenceTarget &&
            manifestFrameIsUsable(repositoryRoot, frame));
    } catch {
        return [];
    }
};

export const createCloudPlateBuildIdentity = ({
    scene,
    rendererHash,
    samples,
    width,
    height,
    convergenceTarget = scene.render.convergenceTarget,
}) => {
    const definitionHash = sha256([stableJson(scene)]);
    const sceneHash = sha256([
        `pipeline:${CLOUD_PLATE_PIPELINE_VERSION}\0`,
        `definition:${definitionHash}\0`,
        `renderer:${rendererHash}\0`,
        `samples:${samples}\0`,
        `extent:${width}x${height}\0`,
        `convergence-target:${convergenceTarget}\0`,
    ]);
    return { sceneId: scene.id, sceneHash, definitionHash, rendererHash };
};

export const renderCloudPlateScene = async ({
    repositoryRoot,
    scenePath,
    baseUrl = "http://127.0.0.1:3000",
    requestedFrames,
    samples: sampleOverride,
    width: widthOverride,
    height: heightOverride,
    convergenceTarget: convergenceTargetOverride,
}) => {
    const scene = readCloudPlateScene(scenePath);
    if (scene.groups.length !== 1) {
        throw new Error(
            "The current vertical slice exports one jointly rendered continuous group; " +
            "multi-group isolation is not implemented yet.",
        );
    }
    const samples = sampleOverride ?? scene.render.minimumTransportSamples;
    const width = widthOverride ?? scene.render.width;
    const height = heightOverride ?? scene.render.height;
    const convergenceTarget = convergenceTargetOverride ??
        scene.render.convergenceTarget;
    const volumeBounces = Number.parseInt(
        process.env.CLOUD_PLATE_VOLUME_BOUNCES ?? "1024", 10,
    );
    const productionDenoiser = scene.render.denoiser === "none"
        ? "NONE" : "OPENIMAGEDENOISE";
    const denoiser = process.env.CLOUD_PLATE_DENOISER ?? productionDenoiser;
    const productionPathGuiding = scene.render.pathGuiding === "volume"
        ? "VOLUME" : "NONE";
    const pathGuiding = process.env.CLOUD_PLATE_PATH_GUIDING ??
        productionPathGuiding;
    const productionPhaseFunction = scene.render.phaseFunction
        .toUpperCase().replaceAll("-", "_");
    const phaseFunction = process.env.CLOUD_PLATE_PHASE_FUNCTION ??
        productionPhaseFunction;
    const productionWorldModel = scene.render.worldModel.toUpperCase();
    const worldModel = process.env.CLOUD_PLATE_WORLD_MODEL ??
        productionWorldModel;
    if (!Number.isSafeInteger(samples) || samples < 64 ||
        !Number.isSafeInteger(width) || width < 64 ||
        !Number.isSafeInteger(height) || height < 64 ||
        !(convergenceTarget > 0) || convergenceTarget > 1 ||
        !Number.isSafeInteger(volumeBounces) || volumeBounces < 1 ||
        !["NONE", "OPENIMAGEDENOISE"].includes(denoiser) ||
        !["NONE", "VOLUME"].includes(pathGuiding) ||
        !["HENYEY_GREENSTEIN", "DRAINE", "MIE"].includes(phaseFunction) ||
        !["FLAT", "NISHITA"].includes(worldModel)) {
        throw new Error("Samples and output dimensions are invalid.");
    }
    const blenderExecutable = scene.render.backend === "blender-cycles-metal"
        ? resolveBlenderExecutable(repositoryRoot)
        : undefined;
    const backendVersion = blenderExecutable
        ? blenderVersion(blenderExecutable)
        : scene.render.backend === "webgl2-local-gpu"
            ? "browser-webgl2"
            : "browser-webgpu";
    const verifiedAssets = blenderExecutable
        ? verifiedCloudVdbAssets(repositoryRoot)
        : undefined;
    const authoredAssetHash = blenderExecutable
        ? verifiedAssets.hash
        : "browser-procedural-assets";
    if (blenderExecutable && !scene.offlineComposition?.sourceAssetId) {
        throw new Error(
            `Blender scene ${scene.id} has no checksum-pinned authored volume source.`,
        );
    }
    const wdasQuality = samples < 256
        ? "eighth" : samples < 1024 ? "quarter" : "half";
    const sourceIds = blenderExecutable ? [...new Set(
        scene.offlineComposition.volumeInstances.map((instance) =>
            instance.sourceAssetId ?? scene.offlineComposition.sourceAssetId),
    )] : [];
    const volumeSourceMap = {};
    for (const sourceId of sourceIds) {
        const resolvedId = sourceId === "wdas-cloud"
            ? `wdas-cloud-${wdasQuality}` : sourceId;
        const path = verifiedAssets?.paths[resolvedId];
        if (!path) {
            throw new Error(
                `Blender scene ${scene.id} references unavailable VDB ${sourceId}.`,
            );
        }
        volumeSourceMap[sourceId] = path;
    }
    const primaryStormPath = volumeSourceMap[
        scene.offlineComposition?.sourceAssetId];
    const backendRendererInputsHash = blenderExecutable
        ? contentHashForPaths(repositoryRoot, CLOUD_PLATE_RENDERER_INPUTS)
        : sha256([
            rendererContentHash(repositoryRoot),
            contentHashForPaths(repositoryRoot, CLOUD_PLATE_RENDERER_INPUTS),
        ]);
    const rendererHash = sha256([
        backendRendererInputsHash,
        `backend:${scene.render.backend}\0`,
        `backend-version:${backendVersion}\0`,
        `authored-assets:${authoredAssetHash}\0`,
        `storm-source:${sourceIds.join(",")}\0`,
        `volume-bounces:${volumeBounces}\0`,
        `denoiser:${denoiser}\0`,
        `path-guiding:${pathGuiding}\0`,
        `phase-function:${phaseFunction}\0`,
        `world-model:${worldModel}\0`,
    ]);
    const identity = createCloudPlateBuildIdentity({
        scene, rendererHash, samples, width, height, convergenceTarget,
    });
    const productionContract =
        samples >= scene.render.minimumTransportSamples &&
        width >= scene.render.width && height >= scene.render.height &&
        convergenceTarget <= scene.render.convergenceTarget &&
        volumeBounces >= scene.render.minimumVolumeBounces &&
        denoiser === productionDenoiser &&
        pathGuiding === productionPathGuiding &&
        phaseFunction === productionPhaseFunction &&
        worldModel === productionWorldModel;
    const totalFrames = cloudPlateFrameCount(scene.timeline);
    const frameIndices = requestedFrames?.length
        ? [...new Set(requestedFrames)].sort((a, b) => a - b)
        : Array.from({ length: totalFrames }, (_, index) => index);
    if (frameIndices.some((index) =>
        !Number.isSafeInteger(index) || index < 0 || index >= totalFrames)) {
        throw new Error(`Frame indices must be between 0 and ${totalFrames - 1}.`);
    }
    const publicRoot = join(
        repositoryRoot, "public/generated/cloud-plates", scene.id,
        identity.sceneHash,
    );
    const manifestPath = join(publicRoot, "manifest.json");
    const stableManifestPath = join(
        repositoryRoot, "public/generated/cloud-plates", scene.id,
        "manifest.json",
    );
    const outputManifestPath = join(
        repositoryRoot, "output/cloud-plates/manifests",
        `${scene.id}-${identity.sceneHash}.json`,
    );
    const frames = readExistingManifest(
        manifestPath, identity, repositoryRoot,
    );
    const completed = new Map(frames.map((frame) => [frame.index, frame]));
    const makeManifest = (status) => ({
        schemaVersion: CLOUD_PLATE_ASSET_SCHEMA_VERSION,
        sceneId: scene.id,
        sceneHash: identity.sceneHash,
        rendererHash,
        definitionHash: identity.definitionHash,
        generatedAt: new Date().toISOString(),
        status,
        qualityTier: productionContract ? "production" : "review",
        backend: scene.render.backend,
        sourceAsset: scene.offlineComposition?.sourceAssetId === "wdas-cloud"
            ? {
                id: `wdas-cloud-${wdasQuality}`,
                license: "CC-BY-SA-3.0",
                attribution:
                    "Copyright 2017 Disney Enterprises, Inc.; cloud reference by Kevin Udy",
            } : {
                id: scene.offlineComposition?.sourceAssetId,
                license: "project-generated",
                attribution: "Elements continuous OpenVDB author",
            },
        sourceAssets: sourceIds.map((id) => ({
            id: id === "wdas-cloud" ? `wdas-cloud-${wdasQuality}` : id,
            sha256: sha256File(volumeSourceMap[id]),
        })),
        fixedCamera: scene.fixedCamera,
        timeline: scene.timeline,
        groups: scene.groups,
        render: {
            width, height, minimumTransportSamples: samples,
            convergenceTarget, volumeBounces, denoiser, pathGuiding,
            phaseFunction, worldModel,
            radianceCalibration:
                scene.offlineComposition?.radianceCalibration,
        },
        completedFrames: completed.size,
        totalFrames,
        frames: [...completed.values()].sort((a, b) => a.index - b.index),
    });
    const publishManifest = (
        status,
        {
            publishStable = productionContract && completed.size > 0,
            publishContent = completed.size > 0,
        } = {},
    ) => {
        const manifest = makeManifest(status);
        writeJsonAtomic(outputManifestPath, manifest);
        // A rejected first frame remains entirely in ignored staging.  There
        // is no reason to expose a hash-addressed public manifest with zero
        // qualified frames.
        if (publishContent) writeJsonAtomic(manifestPath, manifest);
        // A build with no accepted frames must never evict the last-known-good
        // scene from the stable live URL while its first convergence pair is
        // still rendering (or if that pair fails).
        if (publishStable) writeJsonAtomic(stableManifestPath, manifest);
        return manifest;
    };
    publishManifest(completed.size ? "partial" : "rendering", {
        publishStable: productionContract && completed.size > 0,
    });

    try {
        for (const frameIndex of frameIndices) {
            if (completed.has(frameIndex)) continue;
            const frameDirectory = join(
                repositoryRoot, "output/cloud-plates/staging", scene.id,
                String(frameIndex).padStart(5, "0"),
            );
            mkdirSync(frameDirectory, { recursive: true });
            const previewPath = join(frameDirectory, "preview.png");
            const metricsPath = join(frameDirectory, "capture-metrics.json");
            const timeSeconds = frameIndex * scene.timeline.frameIntervalSeconds;
            let frameSamples = samples;
            let convergenceDelta = Number.POSITIVE_INFINITY;
            let previousTransport;
            while (convergenceDelta > convergenceTarget) {
                rmSync(previewPath, { force: true });
                rmSync(metricsPath, { force: true });
                rmSync(join(frameDirectory, "radiance.rgba16f"), { force: true });
                rmSync(join(frameDirectory, "transmittance.rgba16f"), { force: true });
                rmSync(join(frameDirectory, "direct-response.rgba16f"), { force: true });
                rmSync(join(frameDirectory, "sky-response.rgba16f"), { force: true });
                rmSync(join(frameDirectory, "ground-response.rgba16f"), { force: true });
                if (scene.render.backend === "blender-cycles-metal") {
                    await run(blenderExecutable, [
                        "--background",
                        "--factory-startup",
                        "--python",
                        join(repositoryRoot, "scripts/blender/render_cloud_plate.py"),
                        "--",
                        scenePath,
                        String(frameIndex),
                        String(timeSeconds),
                        String(width),
                        String(height),
                        String(frameSamples),
                        String(convergenceTarget),
                        frameDirectory,
                        String(
                            (parseInt(identity.sceneHash.slice(0, 8), 16) +
                                frameIndex) % 2_147_483_647,
                        ),
                    ], {
                        cwd: repositoryRoot,
                        env: {
                            ...process.env,
                            CLOUD_STORM_VDB_PATH: primaryStormPath,
                            CLOUD_VOLUME_SOURCE_MAP:
                                JSON.stringify(volumeSourceMap),
                            CLOUD_STORM_SOURCE_KIND:
                                scene.offlineComposition.sourceKind,
                            CLOUD_STORM_SCATTERING_STRENGTH: String(
                                scene.offlineComposition.scatteringStrength,
                            ),
                            CLOUD_PLATE_VOLUME_BOUNCES: String(volumeBounces),
                            CLOUD_PLATE_DENOISER: denoiser,
                            CLOUD_PLATE_PATH_GUIDING: pathGuiding,
                            CLOUD_PLATE_PHASE_FUNCTION: phaseFunction,
                            CLOUD_PLATE_WORLD_MODEL: worldModel,
                        },
                    });
                } else {
                    await run("bash", [
                        join(repositoryRoot, "scripts/capture-cloud-preview.sh"),
                        scene.source.captureParameter,
                        scene.source.caseId,
                        previewPath,
                    ], {
                        cwd: repositoryRoot,
                        env: {
                            ...process.env,
                            CLOUD_PREVIEW_URL: baseUrl,
                            CLOUD_PREVIEW_CAPTURE_MODE: "native-metal-headless",
                            CLOUD_PREVIEW_RENDERER_PREFERENCE:
                                scene.render.backend === "webgl2-local-gpu"
                                    ? "webgl2"
                                    : "webgpu",
                            CLOUD_PREVIEW_TRANSPORT_UPDATES: String(frameSamples),
                            CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION: "1",
                            CLOUD_PREVIEW_CAPTURE_METRICS_PATH: metricsPath,
                            CLOUD_PREVIEW_PAGE_TIMEOUT_MS:
                                process.env.CLOUD_PLATE_FRAME_TIMEOUT_MS ?? "7200000",
                            CLOUD_PREVIEW_CAPTURE_STEP_TIMEOUT_MS: "120000",
                            CLOUD_PLATE_SCENE_ID: scene.id,
                            CLOUD_PLATE_FRAME_INDEX: String(frameIndex),
                            CLOUD_PLATE_TIME_OFFSET_SECONDS: String(timeSeconds),
                            CLOUD_PLATE_CAPTURE_TOKEN: CLOUD_PLATE_CAPTURE_TOKEN,
                            CLOUD_PLATE_WIDTH: String(width),
                            CLOUD_PLATE_HEIGHT: String(height),
                        },
                    });
                }
                const metrics = JSON.parse(readFileSync(metricsPath, "utf8"));
                if (scene.render.backend === "blender-cycles-metal" ||
                    scene.render.backend === "webgl2-local-gpu") {
                    const currentTransport = {
                        radiance: readFileSync(join(
                            frameDirectory, "radiance.rgba16f",
                        )),
                        transmittance: readFileSync(join(
                            frameDirectory, "transmittance.rgba16f",
                        )),
                        responses: scene.render.backend === "webgl2-local-gpu"
                            ? ["direct-response", "sky-response", "ground-response"]
                                .map((channel) => readFileSync(join(
                                    frameDirectory, `${channel}.rgba16f`,
                                )))
                            : [],
                    };
                    if (!previousTransport) {
                        previousTransport = currentTransport;
                        const previousSamples = frameSamples;
                        frameSamples *= 2;
                        process.stdout.write(
                            `Cloud plate frame ${frameIndex} establishing convergence ` +
                            `pair ${previousSamples} -> ${frameSamples} samples.\n`,
                        );
                        continue;
                    }
                    convergenceDelta = cloudPlateTransportResidual({
                        previousRadiance: previousTransport.radiance,
                        previousTransmittance: previousTransport.transmittance,
                        currentRadiance: currentTransport.radiance,
                        currentTransmittance: currentTransport.transmittance,
                        previousResponses: previousTransport.responses,
                        currentResponses: currentTransport.responses,
                    });
                    previousTransport = currentTransport;
                    writeJsonAtomic(metricsPath, {
                        ...metrics,
                        convergenceDelta,
                        convergenceMethod: "paired-transport-rms",
                    });
                } else {
                    convergenceDelta =
                        typeof metrics.convergenceDelta === "number" &&
                        Number.isFinite(metrics.convergenceDelta)
                            ? metrics.convergenceDelta
                            : Number.POSITIVE_INFINITY;
                }
                if (convergenceDelta > convergenceTarget) {
                    const previousSamples = frameSamples;
                    frameSamples *= 2;
                    if (!Number.isSafeInteger(frameSamples)) {
                        throw new Error(
                            `Frame ${frameIndex} exhausted the safe sample range.`,
                        );
                    }
                    process.stdout.write(
                        `Cloud plate frame ${frameIndex} residual ${
                            Number.isFinite(convergenceDelta)
                                ? convergenceDelta.toExponential(3)
                                : "unavailable"} exceeds ${
                            convergenceTarget}; retrying ${
                            previousSamples} -> ${frameSamples} samples.\n`,
                    );
                }
            }
            const imageEvidence = await qualifyCloudPlateImage({
                previewPath,
                transmittancePath: join(
                    frameDirectory, "transmittance.rgba16f"),
                width,
                height,
            });
            const convergedMetrics = JSON.parse(readFileSync(metricsPath, "utf8"));
            writeJsonAtomic(metricsPath, {
                ...convergedMetrics,
                imageQualification: imageEvidence.qualification,
            });
            if (!imageEvidence.qualification.ready) {
                throw new Error(
                    `Cloud plate frame ${frameIndex} failed image qualification: ` +
                    `${JSON.stringify(imageEvidence.qualification)}`,
                );
            }
            const publishedFrameDirectory = join(
                publicRoot, "frames", String(frameIndex).padStart(5, "0"),
            );
            const publicUrlRoot = `/generated/cloud-plates/${scene.id}/` +
                `${identity.sceneHash}/frames/${String(frameIndex).padStart(5, "0")}`;
            const radianceSource = join(frameDirectory, "radiance.rgba16f");
            const transmittanceSource = join(
                frameDirectory, "transmittance.rgba16f",
            );
            const radiancePlane = planeDescriptor({
                channel: "radiance",
                source: radianceSource,
                publicPath: join(publishedFrameDirectory, "radiance.rgba16f"),
                publicUrl: `${publicUrlRoot}/radiance.rgba16f`,
                width,
                height,
            });
            const transmittancePlane = planeDescriptor({
                channel: "transmittance",
                source: transmittanceSource,
                publicPath: join(publishedFrameDirectory, "transmittance.rgba16f"),
                publicUrl: `${publicUrlRoot}/transmittance.rgba16f`,
                width,
                height,
            });
            const responsePlanes = scene.render.backend === "webgl2-local-gpu"
                ? Object.fromEntries([
                    ["directResponse", "direct-response"],
                    ["skyResponse", "sky-response"],
                    ["groundResponse", "ground-response"],
                ].map(([field, channel]) => [field, planeDescriptor({
                    channel,
                    source: join(frameDirectory, `${channel}.rgba16f`),
                    publicPath: join(
                        publishedFrameDirectory,
                        `${channel}.rgba16f`,
                    ),
                    publicUrl: `${publicUrlRoot}/${channel}.rgba16f`,
                    width,
                    height,
                })]))
                : {};
            copyAtomic(previewPath, join(publishedFrameDirectory, "preview.png"));
            copyAtomic(metricsPath, join(
                publishedFrameDirectory, "capture-metrics.json",
            ));
            completed.set(frameIndex, {
                index: frameIndex,
                timeSeconds,
                transportSamples: frameSamples,
                convergenceDelta,
                lightingSignature: sha256([
                    identity.sceneHash, "\0", String(timeSeconds),
                ]),
                previewUrl: `${publicUrlRoot}/preview.png`,
                captureMetricsUrl: `${publicUrlRoot}/capture-metrics.json`,
                operators: [{
                    groupId: scene.groups[0].id,
                    firstDepthKm:
                        minimumFiniteDepthFromRadiancePlane(radianceSource),
                    radiance: radiancePlane,
                    transmittance: transmittancePlane,
                    ...responsePlanes,
                }],
            });
            publishManifest(completed.size === totalFrames ? "complete" : "partial");
        }
    } catch (error) {
        publishManifest(completed.size ? "partial" : "rendering", {
            publishStable: productionContract && completed.size > 0,
        });
        throw error;
    }
    return publishManifest(
        completed.size === totalFrames ? "complete" : "partial",
    );
};

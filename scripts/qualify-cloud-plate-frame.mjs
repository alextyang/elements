#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { qualifyCloudPlateImage } from
    "./lib/cloud-plate-image-qualification.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const directRender = process.argv[2] === "--render-dir";
const requestedFrame = directRender ? 0 : Number(process.argv[3] ?? 0);
let sceneId;
let sceneHash;
let previewPath;
let transmittancePath;
let sourceWidth;
let sourceHeight;
if (directRender) {
    const renderDirectory = resolve(root, process.argv[3]);
    previewPath = join(renderDirectory, "preview.png");
    transmittancePath = join(renderDirectory, "transmittance.rgba16f");
    const metadata = await sharp(previewPath).metadata();
    sourceWidth = metadata.width;
    sourceHeight = metadata.height;
    sceneId = "direct-render";
    sceneHash = null;
} else {
    const manifestPath = resolve(root, process.argv[2] ??
        "public/generated/cloud-plates/thunderstorm-mature/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const frame = manifest.frames.find(({ index }) => index === requestedFrame);
    if (!frame) throw new Error(`Frame ${requestedFrame} is not published.`);
    const operator = frame.operators[0];
    if (!operator) throw new Error(
        `Frame ${requestedFrame} has no transport operator.`);
    const publicPath = resolve(root, "public");
    previewPath = resolve(publicPath, frame.previewUrl.replace(/^\//, ""));
    transmittancePath = resolve(
        publicPath, operator.transmittance.url.replace(/^\//, ""));
    sourceWidth = operator.transmittance.width;
    sourceHeight = operator.transmittance.height;
    sceneId = manifest.sceneId;
    sceneHash = manifest.sceneHash;
}
const { qualification, metrics } = await qualifyCloudPlateImage({
    previewPath,
    transmittancePath,
    width: sourceWidth,
    height: sourceHeight,
});
process.stdout.write(`${JSON.stringify({
    sceneId,
    sceneHash,
    frame: requestedFrame,
    qualification,
    metrics,
}, null, 2)}\n`);
if (!qualification.ready) process.exitCode = 2;

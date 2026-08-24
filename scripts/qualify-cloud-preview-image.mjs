#!/usr/bin/env node

import { resolve } from "node:path";

import sharp from "sharp";

import {
    CLOUD_PREVIEW_IMAGE_QUALIFICATION_CONTRACT,
    cloudMaskFromCoverage,
    evaluateCloudPreviewImage,
    measureCloudPreviewImage,
} from "./lib/cloud-preview-image-qualification.mjs";

const imagePath = process.argv[2];
if (!imagePath) {
    process.stderr.write(
        "Usage: qualify-cloud-preview-image.mjs IMAGE " +
        "[--matte COVERAGE_PNG] [--profile artifact-and-texture|artifact-only]\n",
    );
    process.exit(2);
}

const matteArgumentIndex = process.argv.indexOf("--matte");
const mattePath = matteArgumentIndex >= 0
    ? process.argv[matteArgumentIndex + 1]
    : undefined;
if (matteArgumentIndex >= 0 && !mattePath) {
    process.stderr.write("--matte requires a coverage PNG path.\n");
    process.exit(2);
}
const profileArgumentIndex = process.argv.indexOf("--profile");
const profile = profileArgumentIndex >= 0
    ? process.argv[profileArgumentIndex + 1]
    : "artifact-and-texture";
if (profile !== "artifact-and-texture" && profile !== "artifact-only") {
    process.stderr.write("--profile must be artifact-and-texture or artifact-only.\n");
    process.exit(2);
}
if (profile === "artifact-and-texture" && !mattePath) {
    process.stderr.write("artifact-and-texture qualification requires --matte.\n");
    process.exit(2);
}

const analysis = (path) => sharp(resolve(path))
    .resize({ width: CLOUD_PREVIEW_IMAGE_QUALIFICATION_CONTRACT.analysisWidth })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
const { data, info } = await analysis(imagePath);
let cloudMask;
if (mattePath) {
    const matte = await analysis(mattePath);
    if (matte.info.width !== info.width || matte.info.height !== info.height) {
        throw new Error(
            `Cloud coverage matte dimensions ${matte.info.width}x${matte.info.height} ` +
            `do not match final image ${info.width}x${info.height}.`,
        );
    }
    cloudMask = cloudMaskFromCoverage({
        data: matte.data,
        width: matte.info.width,
        height: matte.info.height,
        channels: matte.info.channels,
    });
}
const result = evaluateCloudPreviewImage(measureCloudPreviewImage({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    cloudMask,
}), {
    requireScaleSeparatedStructure: profile === "artifact-and-texture",
    requireCloudMask: profile === "artifact-and-texture",
});
process.stdout.write(`Cloud preview image qualification: ${
    JSON.stringify(result)}\n`);
if (!result.ready) process.exitCode = 1;

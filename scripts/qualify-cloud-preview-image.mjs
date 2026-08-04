#!/usr/bin/env node

import { resolve } from "node:path";

import sharp from "sharp";

import {
    HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT,
    cloudMaskFromCoverage,
    evaluateHighCloudPreviewImage,
    measureCloudPreviewImage,
} from "./lib/cloud-preview-image-qualification.mjs";

const imagePath = process.argv[2];
if (!imagePath) {
    process.stderr.write(
        "Usage: qualify-cloud-preview-image.mjs IMAGE [--matte COVERAGE_PNG]\n",
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

const analysis = (path) => sharp(resolve(path))
    .resize({ width: HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT.analysisWidth })
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
const result = evaluateHighCloudPreviewImage(measureCloudPreviewImage({
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    cloudMask,
}), {
    requireScaleSeparatedStructure:
        !process.argv.slice(3).includes("--allow-smooth-veil"),
    requireCloudMask: Boolean(mattePath),
});
process.stdout.write(`Cloud preview high-cloud image qualification: ${
    JSON.stringify(result)}\n`);
if (!result.ready) process.exitCode = 1;

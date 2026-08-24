import { readFile } from "node:fs/promises";

import sharp from "sharp";

import {
    CLOUD_PREVIEW_IMAGE_QUALIFICATION_CONTRACT,
    evaluateCloudPreviewImage,
    measureCloudPreviewImage,
} from "./cloud-preview-image-qualification.mjs";

const halfToFloat = (bits) => {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x03ff;
    if (exponent === 0) {
        return sign * Math.pow(2, -14) * (fraction / 1024);
    }
    if (exponent === 0x1f) {
        return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
    }
    return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
};

export const qualifyCloudPlateImage = async ({
    previewPath,
    transmittancePath,
    width: sourceWidth,
    height: sourceHeight,
}) => {
    const analysisWidth = CLOUD_PREVIEW_IMAGE_QUALIFICATION_CONTRACT.analysisWidth;
    const analysisHeight = Math.round(
        sourceHeight * analysisWidth / sourceWidth,
    );
    const { data, info } = await sharp(previewPath)
        .resize(analysisWidth, analysisHeight, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const transmittance = await readFile(transmittancePath);
    const sourcePixels = sourceWidth * sourceHeight;
    if (transmittance.length !== sourcePixels * 8) {
        throw new Error("Transmittance plane dimensions do not match preview.");
    }
    const sourceMask = Buffer.alloc(sourcePixels);
    for (let pixel = 0; pixel < sourcePixels; pixel += 1) {
        const weight = Math.max(0, Math.min(1,
            1 - halfToFloat(transmittance.readUInt16LE(pixel * 8))));
        sourceMask[pixel] = Math.round(weight * 255);
    }
    const resizedMask = await sharp(sourceMask, { raw: {
        width: sourceWidth,
        height: sourceHeight,
        channels: 1,
    } }).resize(analysisWidth, analysisHeight, { fit: "fill" })
        .greyscale()
        .raw()
        .toBuffer();
    const cloudMask = Float64Array.from(
        resizedMask, (value) => value / 255);
    const metrics = measureCloudPreviewImage({
        data,
        width: info.width,
        height: info.height,
        channels: info.channels,
        cloudMask,
    });
    const qualification = evaluateCloudPreviewImage(metrics, {
            requireScaleSeparatedStructure: true,
            requireCloudMask: true,
        });
    return {
        // Transport plates cover a fixed production camera and are replayed
        // indefinitely. Unlike a localized preview prop, any detected broad
        // radial organization is therefore a hard publication failure.
        qualification: {
            ...qualification,
            ready: qualification.ready && !qualification.radialArtifact,
        },
        metrics,
    };
};

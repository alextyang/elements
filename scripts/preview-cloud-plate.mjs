#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const directory = resolve(process.argv[2] ?? "");
const output = resolve(process.argv[3] ?? join(directory, "preview-photographic.png"));
const radianceScale = Number(process.argv[4] ?? "1");
if (!(radianceScale > 0) || !Number.isFinite(radianceScale)) {
    throw new Error("Preview radiance scale must be finite and positive.");
}
const metrics = JSON.parse(readFileSync(join(directory, "capture-metrics.json"), "utf8"));
const radiance = readFileSync(join(directory, "radiance.rgba16f"));
const transmittance = readFileSync(join(directory, "transmittance.rgba16f"));
const { width, height } = metrics;

const halfToNumber = (half) => {
    const sign = (half & 0x8000) ? -1 : 1;
    const exponent = (half >> 10) & 0x1f;
    const fraction = half & 0x03ff;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    if (exponent === 0x1f) return fraction ? Number.NaN : sign * Infinity;
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
};

const displayEncode = (linear) => {
    const mapped = 1 - Math.exp(-4.0 * Math.max(0, linear));
    const srgb = mapped <= 0.0031308
        ? 12.92 * mapped
        : 1.055 * mapped ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
};

const pixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y += 1) {
    const horizon = y / Math.max(1, height - 1);
    const sky = [
        0.006 + 0.025 * horizon,
        0.020 + 0.060 * horizon,
        0.100 + 0.190 * horizon,
    ];
    for (let x = 0; x < width; x += 1) {
        const halfOffset = (y * width + x) * 8;
        const byteOffset = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
            const offset = halfOffset + channel * 2;
            const source = halfToNumber(radiance.readUInt16LE(offset));
            const transfer = halfToNumber(transmittance.readUInt16LE(offset));
            pixels[byteOffset + channel] = displayEncode(
                source * radianceScale + transfer * sky[channel],
            );
        }
        pixels[byteOffset + 3] = 255;
    }
}

await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(output);
process.stdout.write(`${output}\n`);

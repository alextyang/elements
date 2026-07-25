#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data", "moon-benchmark.json");
const OUTPUT_DIRECTORY = path.join(
    ROOT,
    "public",
    "sky-benchmark",
    "normalized",
);
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 800;

const DLR_POLYNOMIAL = [
    -659.3313686008262,
    0,
    0.00030768447846520974,
    4.043326832898669e-7,
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sourcePath = (url) => path.join(ROOT, "public", url.replace(/^\//, ""));

const luminanceAt = (image, x, y) => {
    const boundedX = clamp(Math.round(x), 0, image.width - 1);
    const boundedY = clamp(Math.round(y), 0, image.height - 1);
    const offset = (boundedY * image.width + boundedX) * image.channels;
    return (
        image.data[offset] * 0.2126 +
        image.data[offset + 1] * 0.7152 +
        image.data[offset + 2] * 0.0722
    ) / 255;
};

const samplePatch = (image, x, y, radius) => {
    const inner = [];
    const outer = [];
    const limit = Math.ceil(radius * 2.4);
    for (let dy = -limit; dy <= limit; dy += 1) {
        for (let dx = -limit; dx <= limit; dx += 1) {
            const distance = Math.hypot(dx, dy);
            if (distance > radius * 2.4) continue;
            const value = luminanceAt(image, x + dx, y + dy);
            if (distance <= radius) inner.push(value);
            else if (distance >= radius * 1.45) outer.push(value);
        }
    }
    inner.sort((left, right) => left - right);
    const innerHigh = inner[Math.round((inner.length - 1) * 0.82)] ?? 0;
    const innerMean = inner.reduce((sum, value) => sum + value, 0) /
        Math.max(1, inner.length);
    const outerMean = outer.reduce((sum, value) => sum + value, 0) /
        Math.max(1, outer.length);
    return {
        score: (innerHigh - outerMean) * 0.72 +
            Math.max(0, innerMean - outerMean) * 0.28,
        innerHigh,
        innerMean,
        outerMean,
    };
};

const dlrRadiusForZenith = (zenithDegrees) => {
    const target = zenithDegrees * Math.PI / 180;
    let low = 0;
    let high = 1_120;
    for (let iteration = 0; iteration < 28; iteration += 1) {
        const radius = (low + high) / 2;
        const z = DLR_POLYNOMIAL.reduce(
            (sum, coefficient, power) => sum + coefficient * radius ** power,
            0,
        );
        const angle = Math.atan2(radius, -z);
        if (angle < target) low = radius;
        else high = radius;
    }
    return (low + high) / 2;
};

const radialDistance = (entry, zenithDegrees) => {
    const bounded = clamp(zenithDegrees, 0, 90);
    if (entry.capture.sourceProjection === "calibratedFisheyePolynomial") {
        return dlrRadiusForZenith(bounded);
    }
    return entry.capture.usableRadius * bounded / 90;
};

const detectMoonAngle = (entry, image) => {
    const [centerX, centerY] = entry.capture.opticalCenter;
    const radius = radialDistance(entry, 90 - entry.astronomy.lunarAltitude);
    const patchRadius = entry.source.id === "eye2sky-oluol" ? 9 : 3.2;
    const samples = [];
    for (let angle = 0; angle < 360; angle += 0.5) {
        const radians = angle * Math.PI / 180;
        const x = centerX + Math.sin(radians) * radius;
        const y = centerY - Math.cos(radians) * radius;
        samples.push({ angle, ...samplePatch(image, x, y, patchRadius) });
    }
    samples.sort((left, right) => right.score - left.score);
    const best = samples[0];
    const baseline = samples.slice(Math.floor(samples.length * 0.2));
    const mean = baseline.reduce((sum, sample) => sum + sample.score, 0) /
        Math.max(1, baseline.length);
    const deviation = Math.sqrt(baseline.reduce(
        (sum, sample) => sum + (sample.score - mean) ** 2,
        0,
    ) / Math.max(1, baseline.length));
    const separation = ((best.angle - samples[1].angle + 540) % 360) - 180;
    return {
        sourceAngleDegrees: best.angle,
        sourceRadiusPixels: radius,
        confidenceZ: deviation > 0 ? (best.score - mean) / deviation : 0,
        contrast: best.score,
        runnerUpSeparationDegrees: Math.abs(separation),
        patch: {
            highlight: best.innerHigh,
            localMean: best.innerMean,
            surroundMean: best.outerMean,
        },
    };
};

const bilinear = (image, x, y, channel) => {
    const x0 = clamp(Math.floor(x), 0, image.width - 1);
    const y0 = clamp(Math.floor(y), 0, image.height - 1);
    const x1 = Math.min(image.width - 1, x0 + 1);
    const y1 = Math.min(image.height - 1, y0 + 1);
    const tx = x - Math.floor(x);
    const ty = y - Math.floor(y);
    const at = (sampleX, sampleY) =>
        image.data[(sampleY * image.width + sampleX) * image.channels + channel];
    const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
    const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
};

const normalizeFrame = (entry, image, detection) => {
    const output = Buffer.alloc(OUTPUT_WIDTH * OUTPUT_HEIGHT * 3);
    const [centerX, centerY] = entry.capture.opticalCenter;
    const fov = entry.capture.horizontalFov;
    const verticalFov = fov / (OUTPUT_WIDTH / OUTPUT_HEIGHT);
    const viewElevation = entry.astronomy.lunarAltitude;
    for (let y = 0; y < OUTPUT_HEIGHT; y += 1) {
        const altitude = clamp(
            viewElevation + (0.5 - y / (OUTPUT_HEIGHT - 1)) * verticalFov,
            0,
            90,
        );
        const sourceRadius = radialDistance(entry, 90 - altitude);
        for (let x = 0; x < OUTPUT_WIDTH; x += 1) {
            const relativeAzimuth = (x / (OUTPUT_WIDTH - 1) - 0.5) * fov;
            const sourceAngle =
                (detection.sourceAngleDegrees + relativeAzimuth) * Math.PI / 180;
            const sourceX = centerX + Math.sin(sourceAngle) * sourceRadius;
            const sourceY = centerY - Math.cos(sourceAngle) * sourceRadius;
            const outputOffset = (y * OUTPUT_WIDTH + x) * 3;
            output[outputOffset] = bilinear(image, sourceX, sourceY, 0);
            output[outputOffset + 1] = bilinear(image, sourceX, sourceY, 1);
            output[outputOffset + 2] = bilinear(image, sourceX, sourceY, 2);
        }
    }
    return output;
};

const main = async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const atmospheric = manifest.cases.filter(
        (entry) => entry.referenceClass === "atmosphericScene",
    );
    for (let index = 0; index < atmospheric.length; index += 1) {
        const entry = atmospheric[index];
        const { data, info } = await sharp(sourcePath(entry.referenceImage))
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const image = {
            data,
            width: info.width,
            height: info.height,
            channels: info.channels,
        };
        const detection = detectMoonAngle(entry, image);
        const normalized = normalizeFrame(entry, image, detection);
        const fileName = `${entry.id}.jpg`;
        await sharp(normalized, {
            raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3 },
        })
            .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
            .toFile(path.join(OUTPUT_DIRECTORY, fileName));
        entry.comparisonImage = `/sky-benchmark/normalized/${fileName}`;
        entry.capture.viewElevation = Number(entry.astronomy.lunarAltitude.toFixed(4));
        entry.capture.verticalFov = Number(
            (entry.capture.horizontalFov / (OUTPUT_WIDTH / OUTPUT_HEIGHT)).toFixed(4),
        );
        entry.normalization = {
            method: "moon-centered inverse fisheye resampling",
            outputResolution: [OUTPUT_WIDTH, OUTPUT_HEIGHT],
            outputHorizontalFov: entry.capture.horizontalFov,
            sourceMoonDetection: {
                angleDegrees: Number(detection.sourceAngleDegrees.toFixed(3)),
                radiusPixels: Number(detection.sourceRadiusPixels.toFixed(3)),
                confidenceZ: Number(detection.confidenceZ.toFixed(3)),
                contrast: Number(detection.contrast.toFixed(5)),
                highlight: Number(detection.patch.highlight.toFixed(5)),
                localMean: Number(detection.patch.localMean.toFixed(5)),
                surroundMean: Number(detection.patch.surroundMean.toFixed(5)),
            },
            quality: detection.confidenceZ >= 6 ? "high" :
                detection.confidenceZ >= 3 ? "medium" : "low",
            caveat:
                "Moon centering is recovered from a constrained radial search. Low-confidence cases remain useful for sky color/cloud context but are excluded from lunar-local pixel metrics.",
        };
        process.stdout.write(
            `[${index + 1}/${atmospheric.length}] ${entry.id} ` +
            `z=${detection.confidenceZ.toFixed(1)}\n`,
        );
    }
    manifest.normalization = {
        version: 1,
        outputResolution: [OUTPUT_WIDTH, OUTPUT_HEIGHT],
        method:
            "Inverse fisheye resampling into the same altitude/azimuth projection used by Elements, centered on the detected Moon and constrained by computed lunar altitude.",
        metricEligibility:
            "Atmospheric global metrics use all normalized frames. Lunar-local metrics require sourceMoonDetection.confidenceZ >= 3.",
    };
    manifest.summary.normalizationQualityCounts = Object.fromEntries(
        ["high", "medium", "low"].map((quality) => [
            quality,
            atmospheric.filter((entry) => entry.normalization.quality === quality).length,
        ]),
    );
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
};

await main();

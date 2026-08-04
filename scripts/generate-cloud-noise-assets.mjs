import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../public/assets/sky/", import.meta.url));
const encode = (value) => Math.max(0, Math.min(255, Math.round(value * 255)));
const saturate = (value) => Math.min(1, Math.max(0, value));
const fade = (value) => value * value * value * (value * (value * 6 - 15) + 10);
const mix = (low, high, amount) => low + (high - low) * amount;
const baseSize = 128;
const detailSize = 64;
const weatherSize = 256;
const base = new Uint8Array(baseSize ** 3 * 4);
const detail = new Uint8Array(detailSize ** 3 * 4);
const weather = new Uint8Array(weatherSize ** 2 * 4);

const hash = (x, y, z, seed) => {
    let value = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^
        Math.imul(z | 0, 0x2c1b3c6d) ^ Math.imul(seed | 0, 0x297a2d39);
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
};

const wrap = (value, period) => ((value % period) + period) % period;

const makeGradientGrid3 = (period, seed) => {
    const data = new Float32Array(period ** 3 * 3);
    for (let z = 0; z < period; z += 1) {
        for (let y = 0; y < period; y += 1) {
            for (let x = 0; x < period; x += 1) {
                const azimuth = hash(x, y, z, seed) * Math.PI * 2;
                const vertical = hash(x, y, z, seed + 17) * 2 - 1;
                const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
                const offset = ((z * period + y) * period + x) * 3;
                data[offset] = Math.cos(azimuth) * radial;
                data[offset + 1] = vertical;
                data[offset + 2] = Math.sin(azimuth) * radial;
            }
        }
    }
    return { period, data };
};

const gradientNoise3 = (x, y, z, grid) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const localX = x - x0;
    const localY = y - y0;
    const localZ = z - z0;
    const sample = (dx, dy, dz) => {
        const gx = wrap(x0 + dx, grid.period);
        const gy = wrap(y0 + dy, grid.period);
        const gz = wrap(z0 + dz, grid.period);
        const offset = ((gz * grid.period + gy) * grid.period + gx) * 3;
        return grid.data[offset] * (localX - dx) +
            grid.data[offset + 1] * (localY - dy) +
            grid.data[offset + 2] * (localZ - dz);
    };
    const ux = fade(localX);
    const uy = fade(localY);
    const uz = fade(localZ);
    const lower = mix(
        mix(sample(0, 0, 0), sample(1, 0, 0), ux),
        mix(sample(0, 1, 0), sample(1, 1, 0), ux),
        uy,
    );
    const upper = mix(
        mix(sample(0, 0, 1), sample(1, 0, 1), ux),
        mix(sample(0, 1, 1), sample(1, 1, 1), ux),
        uy,
    );
    return mix(lower, upper, uz) * 0.86 + 0.5;
};

const makeFeatureGrid3 = (period, seed) => {
    const data = new Float32Array(period ** 3 * 3);
    for (let z = 0; z < period; z += 1) {
        for (let y = 0; y < period; y += 1) {
            for (let x = 0; x < period; x += 1) {
                const offset = ((z * period + y) * period + x) * 3;
                data[offset] = hash(x, y, z, seed);
                data[offset + 1] = hash(x, y, z, seed + 29);
                data[offset + 2] = hash(x, y, z, seed + 61);
            }
        }
    }
    return { period, data };
};

const worley3 = (x, y, z, grid) => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const cellZ = Math.floor(z);
    let distanceSquared = 4;
    for (let dz = -1; dz <= 1; dz += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                const gx = wrap(cellX + dx, grid.period);
                const gy = wrap(cellY + dy, grid.period);
                const gz = wrap(cellZ + dz, grid.period);
                const offset = ((gz * grid.period + gy) * grid.period + gx) * 3;
                const deltaX = cellX + dx + grid.data[offset] - x;
                const deltaY = cellY + dy + grid.data[offset + 1] - y;
                const deltaZ = cellZ + dz + grid.data[offset + 2] - z;
                distanceSquared = Math.min(
                    distanceSquared,
                    deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ,
                );
            }
        }
    }
    return saturate(1 - Math.sqrt(distanceSquared) / 1.18);
};

const makeGradientGrid2 = (period, seed) => {
    const data = new Float32Array(period ** 2 * 2);
    for (let y = 0; y < period; y += 1) {
        for (let x = 0; x < period; x += 1) {
            const angle = hash(x, y, 0, seed) * Math.PI * 2;
            const offset = (y * period + x) * 2;
            data[offset] = Math.cos(angle);
            data[offset + 1] = Math.sin(angle);
        }
    }
    return { period, data };
};

const gradientNoise2 = (x, y, grid) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const localX = x - x0;
    const localY = y - y0;
    const sample = (dx, dy) => {
        const gx = wrap(x0 + dx, grid.period);
        const gy = wrap(y0 + dy, grid.period);
        const offset = (gy * grid.period + gx) * 2;
        return grid.data[offset] * (localX - dx) +
            grid.data[offset + 1] * (localY - dy);
    };
    const ux = fade(localX);
    const uy = fade(localY);
    return mix(
        mix(sample(0, 0), sample(1, 0), ux),
        mix(sample(0, 1), sample(1, 1), ux),
        uy,
    ) * 0.88 + 0.5;
};

const createConservativeBaseMaximumMips = (rgba, sourceSize) => {
    let previousSize = sourceSize;
    let previous = new Uint8Array(sourceSize ** 3);
    for (let index = 0; index < previous.length; index += 1) previous[index] = rgba[index * 4];
    const levels = [];
    while (previousSize > 1) {
        const size = Math.max(1, Math.floor(previousSize / 2));
        const data = new Uint8Array(size ** 3);
        const wrapPrevious = (value) => (value + previousSize) % previousSize;
        for (let z = 0; z < size; z += 1) {
            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    let maximum = 0;
                    for (let dz = -1; dz <= 2; dz += 1) {
                        for (let dy = -1; dy <= 2; dy += 1) {
                            for (let dx = -1; dx <= 2; dx += 1) {
                                const sourceX = wrapPrevious(x * 2 + dx);
                                const sourceY = wrapPrevious(y * 2 + dy);
                                const sourceZ = wrapPrevious(z * 2 + dz);
                                maximum = Math.max(maximum,
                                    previous[(sourceZ * previousSize + sourceY) * previousSize + sourceX]);
                            }
                        }
                    }
                    data[(z * size + y) * size + x] = maximum;
                }
            }
        }
        levels.push(data);
        previous = data;
        previousSize = size;
    }
    const packed = new Uint8Array(levels.reduce((sum, level) => sum + level.byteLength, 0));
    let offset = 0;
    for (const level of levels) {
        packed.set(level, offset);
        offset += level.byteLength;
    }
    return packed;
};

// Appearance filtering is deliberately an average, not the conservative
// maximum used for empty-space skipping. These offline tails let the browser
// upload a complete trilinear mip pyramid without performing millions of box
// filter operations on the UI thread during renderer initialization.
const createAverageVolumeMipTail = (rgba, sourceSize, channels = 4) => {
    let previousSize = sourceSize;
    let previous = rgba;
    const levels = [];
    while (previousSize > 1) {
        const size = Math.max(1, Math.ceil(previousSize / 2));
        const data = new Uint8Array(size ** 3 * channels);
        for (let z = 0; z < size; z += 1) {
            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const destination = ((z * size + y) * size + x) * channels;
                    for (let channel = 0; channel < channels; channel += 1) {
                        let sum = 0;
                        for (let dz = 0; dz < 2; dz += 1) {
                            const sourceZ = Math.min(previousSize - 1, z * 2 + dz);
                            for (let dy = 0; dy < 2; dy += 1) {
                                const sourceY = Math.min(previousSize - 1, y * 2 + dy);
                                for (let dx = 0; dx < 2; dx += 1) {
                                    const sourceX = Math.min(previousSize - 1, x * 2 + dx);
                                    const source = ((sourceZ * previousSize + sourceY) *
                                        previousSize + sourceX) * channels + channel;
                                    sum += previous[source];
                                }
                            }
                        }
                        data[destination + channel] = Math.round(sum / 8);
                    }
                }
            }
        }
        levels.push(data);
        previous = data;
        previousSize = size;
    }
    const packed = new Uint8Array(levels.reduce(
        (total, level) => total + level.byteLength,
        0,
    ));
    let offset = 0;
    for (const level of levels) {
        packed.set(level, offset);
        offset += level.byteLength;
    }
    return packed;
};

const baseGradients = [
    makeGradientGrid3(3, 101),
    makeGradientGrid3(6, 211),
    makeGradientGrid3(12, 307),
    makeGradientGrid3(24, 401),
];
const baseFeatures = [
    makeFeatureGrid3(4, 503),
    makeFeatureGrid3(8, 601),
    makeFeatureGrid3(16, 701),
];

for (let z = 0; z < baseSize; z += 1) {
    for (let y = 0; y < baseSize; y += 1) {
        for (let x = 0; x < baseSize; x += 1) {
            const u = x / baseSize;
            const v = y / baseSize;
            const w = z / baseSize;
            const perlin = saturate(
                gradientNoise3(u * 3, v * 3, w * 3, baseGradients[0]) * 0.5 +
                gradientNoise3(u * 6, v * 6, w * 6, baseGradients[1]) * 0.25 +
                gradientNoise3(u * 12, v * 12, w * 12, baseGradients[2]) * 0.16 +
                gradientNoise3(u * 24, v * 24, w * 24, baseGradients[3]) * 0.09,
            );
            const worleyLow = worley3(u * 4, v * 4, w * 4, baseFeatures[0]);
            const worleyMiddle = worley3(u * 8, v * 8, w * 8, baseFeatures[1]);
            const worleyHigh = worley3(u * 16, v * 16, w * 16, baseFeatures[2]);
            const worleyFbm = worleyLow * 0.625 + worleyMiddle * 0.25 + worleyHigh * 0.125;
            const perlinWorley = saturate(
                (perlin - (1 - worleyFbm) * 0.58) /
                Math.max(0.001, 1 - (1 - worleyFbm) * 0.58),
            );
            const offset = ((z * baseSize + y) * baseSize + x) * 4;
            base.set([
                encode(perlinWorley),
                encode(worleyLow),
                encode(worleyMiddle),
                encode(worleyHigh),
            ], offset);
        }
    }
}

const detailFeatures = [
    makeFeatureGrid3(5, 809),
    makeFeatureGrid3(10, 907),
    makeFeatureGrid3(20, 1009),
];
for (let z = 0; z < detailSize; z += 1) {
    for (let y = 0; y < detailSize; y += 1) {
        for (let x = 0; x < detailSize; x += 1) {
            const u = x / detailSize;
            const v = y / detailSize;
            const w = z / detailSize;
            const offset = ((z * detailSize + y) * detailSize + x) * 4;
            const low = worley3(u * 5, v * 5, w * 5, detailFeatures[0]);
            const middle = worley3(u * 10, v * 10, w * 10, detailFeatures[1]);
            const high = worley3(u * 20, v * 20, w * 20, detailFeatures[2]);
            detail.set([
                encode(low),
                encode(middle),
                encode(high),
                encode(low * 0.625 + middle * 0.25 + high * 0.125),
            ], offset);
        }
    }
}

const weatherGradients = [
    makeGradientGrid2(2, 1103),
    makeGradientGrid2(4, 1201),
    makeGradientGrid2(8, 1301),
    makeGradientGrid2(16, 1409),
];
const weatherNoise = (u, v, offset = 0) => saturate(
    gradientNoise2(u * 2 + offset, v * 2 + offset * 0.37, weatherGradients[0]) * 0.5 +
    gradientNoise2(u * 4 - offset * 0.23, v * 4 + offset, weatherGradients[1]) * 0.27 +
    gradientNoise2(u * 8 + offset * 0.41, v * 8 - offset * 0.19, weatherGradients[2]) * 0.15 +
    gradientNoise2(u * 16, v * 16, weatherGradients[3]) * 0.08,
);
const weatherStep = 1 / weatherSize;
for (let y = 0; y < weatherSize; y += 1) {
    for (let x = 0; x < weatherSize; x += 1) {
        const u = x / weatherSize;
        const v = y / weatherSize;
        const broad = weatherNoise(u, v, 0.73);
        const organization = weatherNoise(u, v, 2.91);
        const coverage = saturate(broad * 0.72 + organization * 0.28);
        const type = saturate(weatherNoise(u, v, 5.17) * 0.7 + broad * 0.3);
        const potentialLeft = weatherNoise(u - weatherStep, v, 8.41);
        const potentialRight = weatherNoise(u + weatherStep, v, 8.41);
        const potentialDown = weatherNoise(u, v - weatherStep, 8.41);
        const potentialUp = weatherNoise(u, v + weatherStep, 8.41);
        const curlX = saturate(0.5 + (potentialUp - potentialDown) * 2.8);
        const curlY = saturate(0.5 - (potentialRight - potentialLeft) * 2.8);
        const offset = (y * weatherSize + x) * 4;
        weather.set([encode(coverage), encode(type), encode(curlX), encode(curlY)], offset);
    }
}

await mkdir(outputDirectory, { recursive: true });
const baseMaximumMips = createConservativeBaseMaximumMips(base, baseSize);
const baseAverageMipTail = createAverageVolumeMipTail(base, baseSize);
const detailAverageMipTail = createAverageVolumeMipTail(detail, detailSize);
await Promise.all([
    writeFile(`${outputDirectory}cloud-base-rgba8-128.bin`, base),
    writeFile(`${outputDirectory}cloud-base-average-rgba8-mips-64.bin`, baseAverageMipTail),
    writeFile(`${outputDirectory}cloud-base-max-r8-mips-64.bin`, baseMaximumMips),
    writeFile(`${outputDirectory}cloud-detail-rgba8-64.bin`, detail),
    writeFile(`${outputDirectory}cloud-detail-average-rgba8-mips-32.bin`, detailAverageMipTail),
    writeFile(`${outputDirectory}cloud-weather-rgba8-256.bin`, weather),
]);
console.log(`Wrote ${(
    base.byteLength + baseAverageMipTail.byteLength + baseMaximumMips.byteLength +
    detail.byteLength + detailAverageMipTail.byteLength + weather.byteLength
) / 1048576} MiB of tileable Perlin-Worley cloud assets and conservative bounds.`);

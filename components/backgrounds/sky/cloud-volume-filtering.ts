export interface CloudVolumeMipLevel {
    readonly size: number;
    readonly data: Uint8Array;
}

const validateCloudVolumeMetadata = (
    size: number,
    channels: number,
) => {
    if (!Number.isInteger(size) || size < 1) {
        throw new Error("Cloud volume size must be a positive integer");
    }
    if (!Number.isInteger(channels) || channels < 1 || channels > 4) {
        throw new Error("Cloud volume channel count must be between one and four");
    }
};

const validateCloudVolume = (
    data: Uint8Array,
    size: number,
    channels: number,
) => {
    validateCloudVolumeMetadata(size, channels);
    if (data.byteLength !== size ** 3 * channels) {
        throw new Error(
            `Cloud volume byte length ${data.byteLength} does not match ` +
            `${size}^3 x ${channels}`,
        );
    }
};

/**
 * Builds an energy-preserving box-filtered mip chain for a cubic, tileable
 * cloud volume. Each level includes all channels and level zero aliases the
 * supplied immutable upload payload. The filter represents the voxel average,
 * rather than the conservative maximum used by empty-space majorants: it is
 * intended for band-limited appearance sampling only.
 */
export const createCloudVolumeAverageMips = (
    data: Uint8Array,
    size: number,
    channels = 4,
): readonly CloudVolumeMipLevel[] => {
    validateCloudVolume(data, size, channels);
    const levels: CloudVolumeMipLevel[] = [{ size, data }];
    let previous = data;
    let previousSize = size;

    while (previousSize > 1) {
        const nextSize = Math.max(1, Math.ceil(previousSize / 2));
        const next = new Uint8Array(nextSize ** 3 * channels);
        for (let z = 0; z < nextSize; z += 1) {
            for (let y = 0; y < nextSize; y += 1) {
                for (let x = 0; x < nextSize; x += 1) {
                    const destination = ((z * nextSize + y) * nextSize + x) * channels;
                    for (let channel = 0; channel < channels; channel += 1) {
                        let sum = 0;
                        let samples = 0;
                        for (let dz = 0; dz < 2; dz += 1) {
                            const sourceZ = Math.min(previousSize - 1, z * 2 + dz);
                            for (let dy = 0; dy < 2; dy += 1) {
                                const sourceY = Math.min(previousSize - 1, y * 2 + dy);
                                for (let dx = 0; dx < 2; dx += 1) {
                                    const sourceX = Math.min(previousSize - 1, x * 2 + dx);
                                    const source = ((sourceZ * previousSize + sourceY) *
                                        previousSize + sourceX) * channels + channel;
                                    sum += previous[source];
                                    samples += 1;
                                }
                            }
                        }
                        next[destination + channel] = Math.round(sum / samples);
                    }
                }
            }
        }
        levels.push({ size: nextSize, data: next });
        previous = next;
        previousSize = nextSize;
    }
    return levels;
};

export const cloudVolumeMipTailByteLength = (
    size: number,
    channels = 4,
) => {
    validateCloudVolumeMetadata(size, channels);
    let total = 0;
    let levelSize = size;
    while (levelSize > 1) {
        levelSize = Math.max(1, Math.ceil(levelSize / 2));
        total += levelSize ** 3 * channels;
    }
    return total;
};

/**
 * Reconstitutes zero-copy mip views from a separately shipped tail. Keeping
 * level zero in its long-lived asset avoids duplicating the largest volume in
 * the deployment while moving the expensive box filter entirely offline.
 */
export const unpackCloudVolumeMipTail = (
    levelZero: Uint8Array,
    tail: Uint8Array,
    size: number,
    channels = 4,
): readonly CloudVolumeMipLevel[] => {
    validateCloudVolume(levelZero, size, channels);
    const expectedTailBytes = cloudVolumeMipTailByteLength(size, channels);
    if (tail.byteLength !== expectedTailBytes) {
        throw new Error(
            `Cloud volume mip tail contains ${tail.byteLength} bytes; expected ` +
            `${expectedTailBytes}`,
        );
    }
    const levels: CloudVolumeMipLevel[] = [{ size, data: levelZero }];
    let levelSize = size;
    let offset = 0;
    while (levelSize > 1) {
        levelSize = Math.max(1, Math.ceil(levelSize / 2));
        const byteLength = levelSize ** 3 * channels;
        levels.push({
            size: levelSize,
            data: tail.subarray(offset, offset + byteLength),
        });
        offset += byteLength;
    }
    return levels;
};

/**
 * Explicit LOD for a repeated 3D noise lookup. `coordinateFootprint` is the
 * one-pixel footprint in texture coordinates after the caller's frequency
 * transform. A half-texel footprint stays at level zero; larger projected
 * footprints select the matching prefiltered scale continuously in WGSL.
 */
export const cloudVolumeLodForFootprint = (
    coordinateFootprint: number,
    textureSize: number,
    maximumMip: number,
) => Math.min(
    Math.max(0, maximumMip),
    Math.max(0, Math.log2(Math.max(1, coordinateFootprint * textureSize))),
);

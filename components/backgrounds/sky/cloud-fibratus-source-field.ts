import type { RuntimeCloudSystem } from "./cloud-system-runtime";
import type {
    CloudLightVolumeTransform,
    CloudLightVolumeVec3,
} from "./cloud-light-volume";
import type {
    CloudAtlasDimensions,
    CloudMacroVolumeEntry,
} from "./cloud-volume-atlas";

export const CLOUD_FIBRATUS_SOURCE_FIELD_QUADRATURE_SAMPLES = 8;
export const CLOUD_FIBRATUS_SOURCE_FIELD_BYTES_PER_TEXEL = 8;
const PLANET_RADIUS_KM = 6_371;
const HALF_FLOAT_MAXIMUM = 65_504;
const GAUSS_OFFSET = 0.5 / Math.sqrt(3);
const GAUSS_COORDINATES = [0.5 - GAUSS_OFFSET, 0.5 + GAUSS_OFFSET] as const;
// Source fields contain hundreds of thousands of half-float values. Reusing a
// single bit-cast view avoids creating two short-lived typed arrays per value,
// which can otherwise pin Chromium's renderer thread in garbage collection for
// dense volumes. Packing is synchronous, so the shared view is re-entrancy safe.
const FLOAT32_BIT_CAST = new Float32Array(1);
const UINT32_BIT_CAST = new Uint32Array(FLOAT32_BIT_CAST.buffer);

const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, value));

const finiteNonnegative = (value: number) =>
    Number.isFinite(value) && value >= 0;

const dot3 = (left: CloudLightVolumeVec3, right: CloudLightVolumeVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const sourceWorldPosition = (
    transform: CloudLightVolumeTransform,
    coordinate: CloudLightVolumeVec3,
): CloudLightVolumeVec3 => [
    transform.originKm[0] +
        transform.axes[0][0] * coordinate[0] * transform.cellSizeKm[0] +
        transform.axes[1][0] * coordinate[1] * transform.cellSizeKm[1] +
        transform.axes[2][0] * coordinate[2] * transform.cellSizeKm[2],
    transform.originKm[1] +
        transform.axes[0][1] * coordinate[0] * transform.cellSizeKm[0] +
        transform.axes[1][1] * coordinate[1] * transform.cellSizeKm[1] +
        transform.axes[2][1] * coordinate[2] * transform.cellSizeKm[2],
    transform.originKm[2] +
        transform.axes[0][2] * coordinate[0] * transform.cellSizeKm[0] +
        transform.axes[1][2] * coordinate[1] * transform.cellSizeKm[1] +
        transform.axes[2][2] * coordinate[2] * transform.cellSizeKm[2],
];

/** IEEE-754 binary16 packing for queue.writeTexture into rgba16float. */
export const cloudSourceFloat16Bits = (valueInput: number) => {
    const value = clamp(
        Number.isFinite(valueInput) ? valueInput : 0,
        -HALF_FLOAT_MAXIMUM,
        HALF_FLOAT_MAXIMUM,
    );
    FLOAT32_BIT_CAST[0] = value;
    const bits = UINT32_BIT_CAST[0];
    const sign = (bits >>> 16) & 0x8000;
    const exponent = (bits >>> 23) & 0xff;
    const mantissa = bits & 0x7fffff;
    if (exponent === 0xff) return sign | (mantissa === 0 ? 0x7c00 : 0x7e00);
    const halfExponent = exponent - 127 + 15;
    if (halfExponent >= 0x1f) return sign | 0x7bff;
    if (halfExponent <= 0) {
        if (halfExponent < -10) return sign;
        const normalized = mantissa | 0x800000;
        const shift = 14 - halfExponent;
        const rounded = (normalized + (1 << (shift - 1)) - 1 +
            ((normalized >>> shift) & 1)) >>> shift;
        return sign | rounded;
    }
    const roundedMantissa = mantissa + 0xfff + ((mantissa >>> 13) & 1);
    if ((roundedMantissa & 0x800000) !== 0) {
        const roundedExponent = halfExponent + 1;
        return sign | (roundedExponent >= 0x1f
            ? 0x7bff : roundedExponent << 10);
    }
    return sign | (halfExponent << 10) | (roundedMantissa >>> 13);
};

export interface CloudFibratusSourceFieldUpload {
    /** Padded rgba16float bytes, directly accepted by queue.writeTexture. */
    data: Uint16Array;
    bytesPerRow: number;
    rowsPerImage: number;
    size: readonly [number, number, number];
    /** Sum of cell-average density times physical cell volume. */
    integratedDensityKm3: number;
    /** RGB Beer depth through each source-aligned y column. */
    columnOpticalDepthRgb: Float32Array;
    occupiedCellCount: number;
    maximumDensity: number;
    quadratureSampleCount: number;
}

export interface CloudFibratusSourceFieldInput {
    dimensions: readonly [number, number, number];
    transform: CloudLightVolumeTransform;
    /** The same real empty x/z guard columns used by the direct grid. */
    guardCells?: number;
    extinctionRgbPerKm: CloudLightVolumeVec3;
    densityAtWorld: (worldPositionKm: CloudLightVolumeVec3) => number;
}

const alignTo = (value: number, alignment: number) =>
    Math.ceil(value / alignment) * alignment;

/**
 * Produces cell-average extinction for the existing source-material texture.
 * Two-point Gauss integration on each axis exactly integrates a trilinear
 * atlas cell and remains bounded when the Earth/formation transforms curve it.
 */
export const createCloudFibratusSourceField = ({
    dimensions,
    transform,
    guardCells = 2,
    extinctionRgbPerKm,
    densityAtWorld,
}: CloudFibratusSourceFieldInput): CloudFibratusSourceFieldUpload => {
    const [width, height, depth] = dimensions;
    if (dimensions.some((value) => !Number.isSafeInteger(value) || value < 1)) {
        throw new Error("Fibratus source-field dimensions must be positive integers.");
    }
    if (!Number.isSafeInteger(guardCells) || guardCells < 0 ||
        guardCells * 2 >= width || guardCells * 2 >= depth) {
        throw new Error("Fibratus source-field guard columns are invalid.");
    }
    if (transform.cellSizeKm.some((value) =>
        !Number.isFinite(value) || value <= 0)) {
        throw new Error("Fibratus source-field transform has invalid cell sizes.");
    }
    if (extinctionRgbPerKm.some((value) => !finiteNonnegative(value))) {
        throw new Error("Fibratus source-field extinction must be finite and nonnegative.");
    }

    const bytesPerRow = alignTo(
        width * CLOUD_FIBRATUS_SOURCE_FIELD_BYTES_PER_TEXEL,
        256,
    );
    const halfsPerRow = bytesPerRow / Uint16Array.BYTES_PER_ELEMENT;
    const data = new Uint16Array(halfsPerRow * height * depth);
    const columnOpticalDepthRgb = new Float32Array(width * depth * 3);
    const cellVolumeKm3 = transform.cellSizeKm[0] *
        transform.cellSizeKm[1] * transform.cellSizeKm[2];
    let integratedDensityKm3 = 0;
    let maximumDensity = 0;
    let occupiedCellCount = 0;
    let quadratureSampleCount = 0;

    for (let z = guardCells; z < depth - guardCells; z += 1) {
        for (let y = 0; y < height; y += 1) {
            for (let x = guardCells; x < width - guardCells; x += 1) {
                let densitySum = 0;
                for (const offsetZ of GAUSS_COORDINATES) {
                    for (const offsetY of GAUSS_COORDINATES) {
                        for (const offsetX of GAUSS_COORDINATES) {
                            const density = densityAtWorld(sourceWorldPosition(
                                transform,
                                [x + offsetX, y + offsetY, z + offsetZ],
                            ));
                            if (!Number.isFinite(density)) {
                                throw new Error(
                                    "Fibratus source density callback returned a non-finite value.",
                                );
                            }
                            densitySum += clamp(density, 0, 1);
                            quadratureSampleCount += 1;
                        }
                    }
                }
                const density = densitySum /
                    CLOUD_FIBRATUS_SOURCE_FIELD_QUADRATURE_SAMPLES;
                if (density <= 0) continue;
                occupiedCellCount += 1;
                maximumDensity = Math.max(maximumDensity, density);
                integratedDensityKm3 += density * cellVolumeKm3;
                const row = z * height + y;
                const texel = row * halfsPerRow + x * 4;
                for (let channel = 0; channel < 3; channel += 1) {
                    const extinction = density * extinctionRgbPerKm[channel];
                    data[texel + channel] = cloudSourceFloat16Bits(extinction);
                    const column = (z * width + x) * 3 + channel;
                    columnOpticalDepthRgb[column] +=
                        extinction * transform.cellSizeKm[1];
                }
                data[texel + 3] = cloudSourceFloat16Bits(density);
            }
        }
    }
    return {
        data,
        bytesPerRow,
        rowsPerImage: height,
        size: [width, height, depth],
        integratedDensityKm3,
        columnOpticalDepthRgb,
        occupiedCellCount,
        maximumDensity,
        quadratureSampleCount,
    };
};

export interface CloudFibratusAtlasDensitySamplerInput {
    atlasBytes: Uint8Array;
    atlasDimensions: CloudAtlasDimensions;
    volumeResolution: number;
    /** Packed signed-distance range from the atlas manifest. */
    sdfRangeVoxels?: number;
    volume: Pick<CloudMacroVolumeEntry, "xOffset" | "yOffset" | "zOffset">;
    system: Pick<RuntimeCloudSystem, "seeds" | "state" | "compiled">;
}

const trilinearAtlasChannel = (
    bytes: Uint8Array,
    dimensions: CloudAtlasDimensions,
    volume: Pick<CloudMacroVolumeEntry, "xOffset" | "yOffset" | "zOffset">,
    resolution: number,
    canonical: CloudLightVolumeVec3,
    channel: number,
) => {
    const coordinate = canonical.map((value) =>
        clamp(value, 0, 1) * (resolution - 1)) as [number, number, number];
    const low = coordinate.map(Math.floor) as [number, number, number];
    const high = low.map((value) => Math.min(resolution - 1, value + 1)) as
        [number, number, number];
    const amount = coordinate.map((value, axis) => value - low[axis]) as
        [number, number, number];
    let result = 0;
    for (let z = 0; z < 2; z += 1) for (let y = 0; y < 2; y += 1) {
        for (let x = 0; x < 2; x += 1) {
            const localX = x === 0 ? low[0] : high[0];
            const localY = y === 0 ? low[1] : high[1];
            const localZ = z === 0 ? low[2] : high[2];
            const atlasX = volume.xOffset + localX;
            const atlasY = volume.yOffset + localY;
            const atlasZ = volume.zOffset + localZ;
            const index = ((atlasZ * dimensions.height + atlasY) *
                dimensions.width + atlasX) * 4 + channel;
            const weight = (x === 0 ? 1 - amount[0] : amount[0]) *
                (y === 0 ? 1 - amount[1] : amount[1]) *
                (z === 0 ? 1 - amount[2] : amount[2]);
            result += bytes[index] / 255 * weight;
        }
    }
    return result;
};

/** CPU mirror of the plain Ci-fibratus atlas path, including physical shear. */
export const createCloudFibratusAtlasDensitySampler = ({
    atlasBytes,
    atlasDimensions,
    volumeResolution,
    sdfRangeVoxels = 12,
    volume,
    system,
}: CloudFibratusAtlasDensitySamplerInput) => {
    const expectedBytes = atlasDimensions.width * atlasDimensions.height *
        atlasDimensions.depthOrArrayLayers * 4;
    if (atlasBytes.byteLength !== expectedBytes) {
        throw new Error("Cloud macro atlas byte length does not match its dimensions.");
    }
    if (!Number.isSafeInteger(volumeResolution) || volumeResolution < 2) {
        throw new Error("Cloud macro volume resolution is invalid.");
    }
    if (!Number.isFinite(sdfRangeVoxels) || sdfRangeVoxels < 1) {
        throw new Error("Cloud macro signed-distance range is invalid.");
    }
    const extent = system.state.extent;
    const baseAltitudeKm = system.compiled.geometry.baseAltitudeKm;
    const geometricDepthKm = Math.max(
        0.02,
        system.compiled.geometry.geometricDepthKm,
    );
    const majorRadiusKm = Math.max(0.04, extent.majorRadiusKm);
    const minorRadiusKm = Math.max(0.04, extent.minorRadiusKm);
    const downwind: CloudLightVolumeVec3 = [
        Math.cos(extent.orientation), 0, Math.sin(extent.orientation),
    ];
    const crosswind: CloudLightVolumeVec3 = [-downwind[2], 0, downwind[0]];
    const shear = clamp(
        system.compiled.kinematics.verticalShear * 0.16,
        -0.42,
        0.42,
    );
    const sedimentation = clamp(
        system.compiled.precipitation.terminalVelocity /
            Math.max(2, system.compiled.kinematics.windSpeed),
        0,
        1.4,
    );

    return (worldPositionKm: CloudLightVolumeVec3) => {
        const altitudeKm = Math.hypot(...worldPositionKm) - PLANET_RADIUS_KM;
        const delta: CloudLightVolumeVec3 = [
            worldPositionKm[0] - extent.centerEastKm,
            0,
            worldPositionKm[2] - extent.centerNorthKm,
        ];
        const undeformed: CloudLightVolumeVec3 = [
            0.5 + dot3(delta, crosswind) / (2 * minorRadiusKm),
            (altitudeKm - baseAltitudeKm) / geometricDepthKm,
            0.5 + dot3(delta, downwind) / (2 * majorRadiusKm),
        ];
        if (undeformed.some((value) => value < -0.13 || value > 1.13)) return 0;
        const fallFraction = 1 - undeformed[1];
        const canonical: CloudLightVolumeVec3 = [
            undeformed[0] + (undeformed[1] - 0.5) * shear * 0.46 +
                Math.sin(undeformed[1] * Math.PI * 2 +
                    system.seeds[2] * Math.PI * 2) * fallFraction * 0.025,
            undeformed[1],
            undeformed[2] - fallFraction * sedimentation * 0.24,
        ];
        if (canonical.some((value) => value < -0.13 || value > 1.13)) return 0;
        const storageCanonical: CloudLightVolumeVec3 = [
            clamp(canonical[0], 0, 1),
            clamp(canonical[1], 0, 1),
            clamp(canonical[2], 0, 1),
        ];
        const density = trilinearAtlasChannel(
            atlasBytes,
            atlasDimensions,
            volume,
            volumeResolution,
            storageCanonical,
            0,
        );
        const signedDistanceSample = trilinearAtlasChannel(
            atlasBytes,
            atlasDimensions,
            volume,
            volumeResolution,
            storageCanonical,
            3,
        );
        const signedDistanceVoxels =
            (signedDistanceSample * 255 - 128) / 127 * sdfRangeVoxels +
            Math.hypot(
                canonical[0] - storageCanonical[0],
                canonical[1] - storageCanonical[1],
                canonical[2] - storageCanonical[2],
            ) * (volumeResolution - 1);
        return density > 0.0001 && signedDistanceVoxels < 0 ? density : 0;
    };
};

export interface CloudFibratusExtinctionInput {
    system: Pick<RuntimeCloudSystem, "compiled">;
    volume: Pick<CloudMacroVolumeEntry, "statistics">;
    /** Exact optics-table mixture for pure atlas ice, in m^2/kg. */
    massExtinctionRgbM2PerKg: CloudLightVolumeVec3;
}

/**
 * CPU mirror of cloud_owner_extinction_coefficient... followed by its
 * spectral normalization. Ci-fibratus' authoritative occupied atlas cells
 * are pure ice, so the geometric reference is the packed ice radius.
 */
export const resolveCloudFibratusExtinctionRgbPerKm = ({
    system,
    volume,
    massExtinctionRgbM2PerKg,
}: CloudFibratusExtinctionInput): CloudLightVolumeVec3 => {
    const targetExtinctionPerKm = Math.max(
        0,
        system.compiled.material.extinctionKm,
    );
    const verticalDensityPath = Math.max(
        0.002,
        volume.statistics.meanDensityPathVertical,
    );
    const iceRadiusMetres = Math.max(
        1e-7,
        system.compiled.material.iceEffectiveRadiusMicrons * 1e-6,
    );
    const geometricIceMassExtinction = 3 / (2 * 917 * iceRadiusMetres);
    const scale = targetExtinctionPerKm / verticalDensityPath /
        geometricIceMassExtinction;
    return [
        Math.max(0, massExtinctionRgbM2PerKg[0]) * scale,
        Math.max(0, massExtinctionRgbM2PerKg[1]) * scale,
        Math.max(0, massExtinctionRgbM2PerKg[2]) * scale,
    ];
};

/** Destination origin for one representative brick in the shared 3D atlas. */
export const cloudFibratusSourceFieldTextureOrigin = (
    brickIndex: number,
    depth: number,
) => {
    if (!Number.isSafeInteger(brickIndex) || brickIndex < 0 ||
        !Number.isSafeInteger(depth) || depth < 1) {
        throw new Error("Fibratus source-field texture origin is invalid.");
    }
    return [0, 0, brickIndex * depth] as const;
};

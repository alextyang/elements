import assert from "node:assert/strict";
import test from "node:test";

import {
    CLOUD_FIBRATUS_SOURCE_FIELD_QUADRATURE_SAMPLES,
    cloudFibratusSourceFieldTextureOrigin,
    cloudSourceFloat16Bits,
    createCloudFibratusAtlasDensitySampler,
    createCloudFibratusSourceField,
    resolveCloudFibratusExtinctionRgbPerKm,
} from "../components/backgrounds/sky/cloud-fibratus-source-field.ts";

const float16Number = (bits) => {
    const sign = (bits & 0x8000) === 0 ? 1 : -1;
    const exponent = (bits >>> 10) & 0x1f;
    const mantissa = bits & 0x3ff;
    if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
    if (exponent === 0x1f) return mantissa === 0
        ? sign * Number.POSITIVE_INFINITY : Number.NaN;
    return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
};

const identityTransform = {
    originKm: [0, 0, 0],
    axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    cellSizeKm: [1, 1, 1],
};

test("CPU source field is bounded, finite-volume conservative, and upload-ready", () => {
    let samples = 0;
    const field = createCloudFibratusSourceField({
        dimensions: [6, 4, 6],
        transform: identityTransform,
        guardCells: 1,
        extinctionRgbPerKm: [2, 3, 4],
        densityAtWorld: () => {
            samples += 1;
            return 1;
        },
    });
    assert.equal(samples, 4 * 4 * 4 *
        CLOUD_FIBRATUS_SOURCE_FIELD_QUADRATURE_SAMPLES);
    assert.equal(field.quadratureSampleCount, samples);
    assert.equal(field.occupiedCellCount, 64);
    assert.equal(field.integratedDensityKm3, 64);
    assert.equal(field.maximumDensity, 1);
    assert.equal(field.bytesPerRow, 256,
        "rgba16float rows are padded to WebGPU's writeTexture alignment");
    assert.equal(field.rowsPerImage, 4);
    assert.deepEqual(field.size, [6, 4, 6]);

    const interiorColumn = (1 * 6 + 1) * 3;
    assert.deepEqual(
        [...field.columnOpticalDepthRgb.slice(interiorColumn,
            interiorColumn + 3)],
        [8, 12, 16],
        "Beer depth is extinction times the exact source-axis cell length",
    );
    assert.deepEqual(
        [...field.columnOpticalDepthRgb.slice(0, 3)],
        [0, 0, 0],
        "real guard columns stay vacuum",
    );
    const halfsPerRow = field.bytesPerRow / 2;
    const interiorTexel = ((1 * 4 + 0) * halfsPerRow) + 1 * 4;
    assert.equal(float16Number(field.data[interiorTexel]), 2);
    assert.equal(float16Number(field.data[interiorTexel + 3]), 1);
    assert.equal(field.data[0], 0);
});

test("Sun/Moon source rotation preserves total condensate and optical depth", () => {
    const rotated = {
        originKm: [0, 0, 0],
        axes: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
        cellSizeKm: [1, 1, 1],
    };
    const common = {
        dimensions: [6, 4, 6],
        guardCells: 1,
        extinctionRgbPerKm: [0.5, 0.75, 1],
        densityAtWorld: () => 0.25,
    };
    const sun = createCloudFibratusSourceField({
        ...common,
        transform: identityTransform,
    });
    const moon = createCloudFibratusSourceField({
        ...common,
        transform: rotated,
    });
    assert.equal(sun.integratedDensityKm3, moon.integratedDensityKm3);
    assert.deepEqual(
        [...sun.columnOpticalDepthRgb],
        [...moon.columnOpticalDepthRgb],
    );
});

test("plain fibratus atlas sampler mirrors signed support and physical placement", () => {
    const resolution = 4;
    const atlasBytes = new Uint8Array(resolution ** 3 * 4);
    for (let texel = 0; texel < resolution ** 3; texel += 1) {
        atlasBytes[texel * 4] = 255;
        atlasBytes[texel * 4 + 2] = 255;
        // Zero UNORM alpha decodes to a strictly negative inside SDF.
        atlasBytes[texel * 4 + 3] = 0;
    }
    const system = {
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            extent: {
                centerEastKm: 0,
                centerNorthKm: 0,
                majorRadiusKm: 1,
                minorRadiusKm: 1,
                orientation: 0,
            },
        },
        compiled: {
            geometry: { baseAltitudeKm: 8, geometricDepthKm: 1 },
            kinematics: { verticalShear: 0, windSpeed: 20 },
            precipitation: { terminalVelocity: 0 },
        },
    };
    const densityAtWorld = createCloudFibratusAtlasDensitySampler({
        atlasBytes,
        atlasDimensions: {
            width: resolution,
            height: resolution,
            depthOrArrayLayers: resolution,
        },
        volumeResolution: resolution,
        volume: { xOffset: 0, yOffset: 0, zOffset: 0 },
        system,
    });
    assert.equal(densityAtWorld([0, 6_371 + 8.5, 0]), 1);
    assert.equal(densityAtWorld([1.04, 6_371 + 8.5, 0]), 1,
        "packed SDF continuation preserves valid support just outside canonical storage");
    assert.equal(densityAtWorld([10, 6_371 + 8.5, 0]), 0);

    const sourceField = createCloudFibratusSourceField({
        dimensions: [4, 4, 4],
        transform: {
            originKm: [-1, 6_371 + 8, -1],
            axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            cellSizeKm: [0.5, 0.25, 0.5],
        },
        guardCells: 0,
        extinctionRgbPerKm: [1, 1, 1],
        densityAtWorld,
    });
    assert.ok(Math.abs(sourceField.integratedDensityKm3 - 4) < 1e-9);
    assert.equal(sourceField.occupiedCellCount, 64);
});

test("fibratus spectral extinction mirrors pure-ice optical calibration", () => {
    const extinction = resolveCloudFibratusExtinctionRgbPerKm({
        system: {
            compiled: {
                material: {
                    extinctionKm: 0.12,
                    iceEffectiveRadiusMicrons: 50,
                },
            },
        },
        volume: { statistics: { meanDensityPathVertical: 0.03 } },
        massExtinctionRgbM2PerKg: [40, 30, 20],
    });
    const reference = 3 / (2 * 917 * 50e-6);
    const expected = [40, 30, 20].map((channel) =>
        0.12 / 0.03 * channel / reference);
    extinction.forEach((channel, index) => assert.ok(
        Math.abs(channel - expected[index]) < 1e-12,
    ));
});

test("half packing and representative-brick origin are deterministic", () => {
    for (const value of [0, 0.125, 1, 17.5, 65_504]) {
        const decoded = float16Number(cloudSourceFloat16Bits(value));
        assert.ok(Math.abs(decoded - value) <= Math.max(1e-4, value * 5e-4));
    }
    assert.equal(float16Number(cloudSourceFloat16Bits(Number.NaN)), 0);
    assert.deepEqual(cloudFibratusSourceFieldTextureOrigin(3, 48), [0, 0, 144]);
    assert.throws(() => cloudFibratusSourceFieldTextureOrigin(-1, 48), /invalid/);
});

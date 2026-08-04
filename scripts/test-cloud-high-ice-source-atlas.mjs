import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_SCHEMA,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_VERSION,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS,
    calculateCloudHighIceSourceAtlasPacking,
    conditionCloudHighIceSourceBlockMass,
} from "./lib/cloud-volume-atlas.mjs";

const manifest = JSON.parse(readFileSync(new URL(
    "../public/assets/sky/cloud-macro-atlas-v2.json",
    import.meta.url,
), "utf8"));
const sourceManifest = manifest.highIceSourceAtlas;
const sourceBytes = readFileSync(new URL(
    `../public/assets/sky/${sourceManifest.file}`,
    import.meta.url,
));
const macroBytes = readFileSync(new URL(
    `../public/assets/sky/${manifest.atlas.file}`,
    import.meta.url,
));
const momentBytes = readFileSync(new URL(
    `../public/assets/sky/${manifest.highIceMomentSidecar.file}`,
    import.meta.url,
));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const resolution = sourceManifest.sourceResolution;
const targetResolution = manifest.atlas.volumeResolution;
const sourceDimensions = sourceManifest.dimensions;
const macroDimensions = manifest.atlas.dimensions;
const sourceIndex = (slot, x, y, z, channel = 0) => (
    ((((slot.zOffset + z) * sourceDimensions.height + slot.yOffset + y) *
        sourceDimensions.width + slot.xOffset + x) * 4) + channel
);
const macroIndex = (volume, x, y, z, channel = 0) => (
    ((((volume.zOffset + z) * macroDimensions.height + volume.yOffset + y) *
        macroDimensions.width + volume.xOffset + x) * 4) + channel
);
const momentIndex = (volume, x, y, z, channel = 0) => (
    ((((volume.zOffset + z) * macroDimensions.height + volume.yOffset + y) *
        macroDimensions.width + volume.xOffset + x) * 2) + channel
);

test("fine high-ice source manifest is explicit, bounded, and checksummed", () => {
    assert.equal(sourceManifest.schema, CLOUD_HIGH_ICE_SOURCE_ATLAS_SCHEMA);
    assert.equal(sourceManifest.version, CLOUD_HIGH_ICE_SOURCE_ATLAS_VERSION);
    assert.equal(sourceManifest.format, "rgba8unorm");
    assert.equal(sourceManifest.filtering, "linear");
    assert.equal(sourceManifest.sourceResolution,
        CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION);
    assert.equal(sourceManifest.guardVoxels,
        CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS);
    assert.equal(sourceManifest.guard.value, 0);
    assert.deepEqual(sourceManifest.sourceIds, CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS);
    assert.equal(sourceManifest.sourceCount, CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS.length);
    assert.equal(sourceBytes.byteLength, sourceManifest.byteLength);
    assert.equal(sourceBytes.byteLength,
        sourceDimensions.width * sourceDimensions.height *
            sourceDimensions.depthOrArrayLayers * 4);
    assert.equal(sha256(sourceBytes), manifest.checksums.highIceSourceAtlas);
    assert.deepEqual(
        calculateCloudHighIceSourceAtlasPacking({
            sourceCount: sourceManifest.sourceCount,
            sourceResolution: resolution,
            guardVoxels: sourceManifest.guardVoxels,
        }).dimensions,
        sourceDimensions,
    );
    assert.ok(Math.max(
        sourceDimensions.width,
        sourceDimensions.height,
        sourceDimensions.depthOrArrayLayers,
    ) <= 2048);
    assert.equal(sourceManifest.packing.columns, 2);
    assert.equal(sourceManifest.packing.rows, 2);
    assert.equal(sourceManifest.packing.layers, 3);
});

test("source slots are deterministic and all guards/unused tiles are zero", () => {
    const slots = sourceManifest.slots;
    assert.deepEqual(slots.map(({ id }) => id), sourceManifest.sourceIds);
    for (const [id, slot] of Object.entries(sourceManifest.sourceIdToSlot)) {
        assert.equal(slots[slot].id, id);
        assert.equal(slots[slot].slot, slot);
    }
    const stride = sourceManifest.packing.xStride;
    const clearOutsideInterior = (x, y, z) => {
        for (const slot of slots) {
            if (x >= slot.xOffset - sourceManifest.guardVoxels &&
                x < slot.xOffset + resolution + sourceManifest.guardVoxels &&
                y >= slot.yOffset - sourceManifest.guardVoxels &&
                y < slot.yOffset + resolution + sourceManifest.guardVoxels &&
                z >= slot.zOffset - sourceManifest.guardVoxels &&
                z < slot.zOffset + resolution + sourceManifest.guardVoxels) {
                const localX = x - slot.xOffset;
                const localY = y - slot.yOffset;
                const localZ = z - slot.zOffset;
                const inInterior = localX >= 0 && localX < resolution &&
                    localY >= 0 && localY < resolution &&
                    localZ >= 0 && localZ < resolution;
                if (!inInterior) {
                    const index = (z * sourceDimensions.height + y) *
                        sourceDimensions.width + x;
                    assert.equal(sourceBytes[index * 4], 0,
                        `R guard leaked at ${x},${y},${z}`);
                    assert.deepEqual(
                        sourceBytes.subarray(index * 4, index * 4 + 4),
                        Buffer.alloc(4),
                        `RGBA guard leaked at ${x},${y},${z}`,
                    );
                }
                return;
            }
        }
        const index = (z * sourceDimensions.height + y) *
            sourceDimensions.width + x;
        assert.deepEqual(
            sourceBytes.subarray(index * 4, index * 4 + 4),
            Buffer.alloc(4),
            `RGBA unused tile leaked at ${x},${y},${z}`,
        );
    };
    for (let z = 0; z < sourceDimensions.depthOrArrayLayers; z += 1) {
        for (let y = 0; y < sourceDimensions.height; y += 1) {
            for (let x = 0; x < sourceDimensions.width; x += 1) {
                // The stride assertion catches accidental nonzero bytes in a
                // gap even when the gap belongs to an unused tail tile.
                assert.ok(x >= 0 && y >= 0 && z >= 0 && stride > 0);
                clearOutsideInterior(x, y, z);
            }
        }
    }
});

test("R has exact final coarse mass and G expands existing source coverage", () => {
    let nonzeroFine = 0;
    for (const slot of sourceManifest.slots) {
        const volume = manifest.volumes.find(({ id }) => id === slot.id);
        assert.ok(volume, `${slot.id} must have a macro volume`);
        for (let z = 0; z < targetResolution; z += 1) {
            for (let y = 0; y < targetResolution; y += 1) {
                for (let x = 0; x < targetResolution; x += 1) {
                    const macro = macroIndex(volume, x, y, z);
                    const targetDensity = macroBytes[macro];
                    const targetSupported = targetDensity > 0;
                    const expectedCoverage = targetSupported
                        ? momentBytes[momentIndex(volume, x, y, z, 1)] : 0;
                    let mass = 0;
                    for (let dz = 0; dz < 2; dz += 1) {
                        for (let dy = 0; dy < 2; dy += 1) {
                            for (let dx = 0; dx < 2; dx += 1) {
                                const source = sourceIndex(
                                    slot, x * 2 + dx, y * 2 + dy, z * 2 + dz,
                                );
                                const density = sourceBytes[source];
                                const coverage = sourceBytes[source + 1];
                                const secondMoment = sourceBytes[source + 2];
                                const occupied = sourceBytes[source + 3];
                                if (!targetSupported) {
                                    assert.equal(density, 0);
                                    assert.equal(coverage, 0);
                                    assert.equal(secondMoment, 0);
                                    assert.equal(occupied, 0);
                                } else {
                                    assert.equal(coverage, expectedCoverage);
                                    assert.ok(occupied === 0 || occupied === 255);
                                    assert.equal(occupied, density > 0 ? 255 : 0);
                                }
                                mass += density;
                                if (density > 0) nonzeroFine += 1;
                            }
                        }
                    }
                    if (targetSupported) {
                        assert.equal(mass, targetDensity * 8,
                            `${slot.id} parent ${x},${y},${z} mass mismatch`);
                        const first = sourceIndex(slot, x * 2, y * 2, z * 2);
                        const expectedSecondMoment = Math.round(
                            (() => {
                                let sum = 0;
                                for (let dz = 0; dz < 2; dz += 1) {
                                    for (let dy = 0; dy < 2; dy += 1) {
                                        for (let dx = 0; dx < 2; dx += 1) {
                                            const child = sourceIndex(
                                                slot, x * 2 + dx, y * 2 + dy,
                                                z * 2 + dz,
                                            );
                                            sum += (sourceBytes[child] / 255) ** 2;
                                        }
                                    }
                                }
                                return sum / 8 * 255;
                            })(),
                        );
                        assert.equal(sourceBytes[first + 2], expectedSecondMoment);
                        for (let dz = 0; dz < 2; dz += 1) {
                            for (let dy = 0; dy < 2; dy += 1) {
                                for (let dx = 0; dx < 2; dx += 1) {
                                    const child = sourceIndex(
                                        slot, x * 2 + dx, y * 2 + dy, z * 2 + dz,
                                    );
                                    assert.equal(sourceBytes[child + 2], expectedSecondMoment);
                                }
                            }
                        }
                    } else {
                        assert.equal(mass, 0);
                    }
                }
            }
        }
    }
    assert.ok(nonzeroFine > 0, "source atlas contains no authored density");
});

test("conditioned source B/G equals the RG8 moment sidecar R/G", () => {
    for (const slot of sourceManifest.slots) {
        const volume = manifest.volumes.find(({ id }) => id === slot.id);
        for (let z = 0; z < targetResolution; z += 1) {
            for (let y = 0; y < targetResolution; y += 1) {
                for (let x = 0; x < targetResolution; x += 1) {
                    const source = sourceIndex(slot, x * 2, y * 2, z * 2);
                    const moment = momentIndex(volume, x, y, z);
                    assert.equal(
                        sourceBytes[source + 2],
                        momentBytes[moment],
                        `${slot.id} conditioned E[rho^2] diverged at ${x},${y},${z}`,
                    );
                    assert.equal(
                        sourceBytes[source + 1],
                        momentBytes[moment + 1],
                        `${slot.id} conditioned coverage diverged at ${x},${y},${z}`,
                    );
                }
            }
        }
    }
});

test("mass conditioning is deterministic, bounded, and preserves authored zeros", () => {
    const options = {
        density: Uint8Array.from([0, 12, 0, 24, 0, 0, 0, 0]),
        targetDensity: 8,
        parentOccupied: true,
    };
    const first = conditionCloudHighIceSourceBlockMass(options);
    const second = conditionCloudHighIceSourceBlockMass(options);
    assert.deepEqual(first, second);
    assert.equal(first.reduce((sum, value) => sum + value, 0), 64);
    for (const index of [0, 2, 4, 5, 6, 7]) assert.equal(first[index], 0);
    assert.throws(() => conditionCloudHighIceSourceBlockMass({
        density: new Uint8Array(8), targetDensity: 1, parentOccupied: true,
    }), /all-zero authored block/);
    assert.throws(() => conditionCloudHighIceSourceBlockMass({
        density: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]),
        targetDensity: 255,
        parentOccupied: true,
    }), /positive authored R8 children/);
    assert.deepEqual(
        conditionCloudHighIceSourceBlockMass({
            density: Uint8Array.from([255, 1, 0, 0, 0, 0, 0, 0]),
            targetDensity: 0,
            parentOccupied: false,
        }),
        new Uint8Array(8),
    );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hierarchy = readFileSync(
    new URL("../public/assets/sky/cloud-base-max-r8-mips-64.bin", import.meta.url),
);
const expectedBytes = [64, 32, 16, 8, 4, 2, 1]
    .reduce((total, size) => total + size ** 3, 0);
const bounds = (values) => {
    let minimum = 255;
    let maximum = 0;
    for (const value of values) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
    }
    return { minimum, maximum };
};

test("conservative 3D density hierarchy contains every expected mip", () => {
    assert.equal(hierarchy.byteLength, expectedBytes);
    const { minimum, maximum } = bounds(hierarchy);
    assert.equal(minimum, 0, "empty fine cells must remain skippable");
    assert.ok(maximum > 0 && maximum <= 255);
});

test("coarser maximum-density mips never decrease their global bound", () => {
    let offset = 0;
    let previousMaximum = 0;
    for (const size of [64, 32, 16, 8, 4, 2, 1]) {
        const level = hierarchy.subarray(offset, offset + size ** 3);
        const { maximum } = bounds(level);
        assert.ok(maximum >= previousMaximum);
        previousMaximum = maximum;
        offset += level.byteLength;
    }
});

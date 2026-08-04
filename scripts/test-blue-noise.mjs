import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bytes = readFileSync(
    new URL("../public/assets/sky/blue-noise-r8-64.bin", import.meta.url),
);

test("blue-noise ranking tile is complete and uniformly distributed", () => {
    assert.equal(bytes.byteLength, 64 * 64);
    const histogram = new Uint16Array(256);
    for (const value of bytes) histogram[value] += 1;
    assert.equal(Math.min(...bytes), 0);
    assert.equal(Math.max(...bytes), 255);
    for (const count of histogram) assert.equal(count, 16);
});

test("blue-noise ranking avoids equal immediate neighbours including tile seams", () => {
    const size = 64;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const value = bytes[y * size + x];
            assert.notEqual(value, bytes[y * size + ((x + 1) % size)]);
            assert.notEqual(value, bytes[((y + 1) % size) * size + x]);
        }
    }
});

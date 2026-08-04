import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "public/assets/sky");
const size = 64;
const count = size * size;
const selected = new Uint8Array(count);
const ranks = new Uint16Array(count);
const minimumDistance = new Float64Array(count);
minimumDistance.fill(Number.POSITIVE_INFINITY);

const tieBreak = (index, rank) => {
    let value = (index + 1) ^ Math.imul(rank + 17, 0x9e3779b1);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    return (value >>> 0) / 0x1_0000_0000;
};

let selectedIndex = 19 * size + 37;
for (let rank = 0; rank < count; rank += 1) {
    if (rank > 0) {
        let bestDistance = -1;
        let bestTie = -1;
        for (let index = 0; index < count; index += 1) {
            if (selected[index]) continue;
            const distance = minimumDistance[index];
            const tie = tieBreak(index, rank);
            if (distance > bestDistance || (distance === bestDistance && tie > bestTie)) {
                bestDistance = distance;
                bestTie = tie;
                selectedIndex = index;
            }
        }
    }

    selected[selectedIndex] = 1;
    ranks[selectedIndex] = rank;
    const selectedX = selectedIndex % size;
    const selectedY = Math.floor(selectedIndex / size);
    for (let index = 0; index < count; index += 1) {
        if (selected[index]) continue;
        const x = index % size;
        const y = Math.floor(index / size);
        const directX = Math.abs(x - selectedX);
        const directY = Math.abs(y - selectedY);
        const dx = Math.min(directX, size - directX);
        const dy = Math.min(directY, size - directY);
        minimumDistance[index] = Math.min(
            minimumDistance[index],
            dx * dx + dy * dy,
        );
    }
}

const bytes = new Uint8Array(count);
for (let index = 0; index < count; index += 1) {
    bytes[index] = Math.min(255, Math.floor((ranks[index] / count) * 256));
}

await mkdir(outputDirectory, { recursive: true });
const output = path.join(outputDirectory, "blue-noise-r8-64.bin");
await writeFile(output, bytes);
console.log(`Generated ${output} (${bytes.byteLength} bytes)`);

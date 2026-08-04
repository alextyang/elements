import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-volume-filtering-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const source = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-volume-filtering.ts",
    import.meta.url,
), "utf8");
const modulePath = join(temporaryRoot, "cloud-volume-filtering.mjs");
writeFileSync(modulePath, ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText);
const filtering = await import(new URL(`file://${modulePath}`));
const digest = (data) => createHash("sha256").update(data).digest("hex");

test("3D average mips conserve a constant volume and terminate at one voxel", () => {
    const input = new Uint8Array(8 ** 3 * 4).fill(137);
    const levels = filtering.createCloudVolumeAverageMips(input, 8);
    assert.deepEqual(levels.map((level) => level.size), [8, 4, 2, 1]);
    assert.equal(levels[0].data, input);
    assert.ok(levels.every((level) => level.data.every((value) => value === 137)));
});

test("offline mip tails unpack into zero-copy GPU upload views", () => {
    const input = new Uint8Array(8 ** 3 * 4);
    for (let index = 0; index < input.length; index += 1) input[index] = index % 251;
    const generated = filtering.createCloudVolumeAverageMips(input, 8);
    const tail = new Uint8Array(generated.slice(1).reduce(
        (total, level) => total + level.data.byteLength,
        0,
    ));
    let offset = 0;
    for (const level of generated.slice(1)) {
        tail.set(level.data, offset);
        offset += level.data.byteLength;
    }
    assert.equal(
        tail.byteLength,
        filtering.cloudVolumeMipTailByteLength(8),
    );
    const unpacked = filtering.unpackCloudVolumeMipTail(input, tail, 8);
    assert.deepEqual(unpacked.map((level) => level.size), [8, 4, 2, 1]);
    assert.equal(unpacked[0].data, input);
    assert.equal(unpacked[1].data.buffer, tail.buffer);
    assert.deepEqual(
        unpacked.map((level) => [...level.data]),
        generated.map((level) => [...level.data]),
    );
});

test("shipped 3D appearance mip tails exactly match the offline box filter", () => {
    for (const [baseName, tailName, size] of [
        ["cloud-base-rgba8-128.bin", "cloud-base-average-rgba8-mips-64.bin", 128],
        ["cloud-detail-rgba8-64.bin", "cloud-detail-average-rgba8-mips-32.bin", 64],
    ]) {
        const levelZero = readFileSync(new URL(`../public/assets/sky/${baseName}`,
            import.meta.url));
        const shippedTail = readFileSync(new URL(`../public/assets/sky/${tailName}`,
            import.meta.url));
        const generated = filtering.createCloudVolumeAverageMips(
            new Uint8Array(levelZero.buffer, levelZero.byteOffset, levelZero.byteLength),
            size,
        );
        const generatedTail = Buffer.concat(generated.slice(1).map((level) =>
            Buffer.from(level.data.buffer, level.data.byteOffset, level.data.byteLength)));
        assert.equal(shippedTail.byteLength,
            filtering.cloudVolumeMipTailByteLength(size));
        assert.equal(digest(shippedTail), digest(generatedTail));
    }
});

test("3D average mips preserve channel energy", () => {
    const input = new Uint8Array(2 ** 3 * 4);
    for (let voxel = 0; voxel < 8; voxel += 1) {
        input.set([voxel * 8, 32 + voxel * 4, 255 - voxel * 8, 96], voxel * 4);
    }
    const levels = filtering.createCloudVolumeAverageMips(input, 2);
    assert.deepEqual([...levels.at(-1).data], [28, 46, 227, 96]);
});

test("appearance LOD remains sharp nearby and follows projected footprint", () => {
    assert.equal(filtering.cloudVolumeLodForFootprint(0, 128, 7), 0);
    assert.equal(filtering.cloudVolumeLodForFootprint(1 / 128, 128, 7), 0);
    assert.equal(filtering.cloudVolumeLodForFootprint(4 / 128, 128, 7), 2);
    assert.equal(filtering.cloudVolumeLodForFootprint(1024, 128, 3), 3);
});

test("invalid volume metadata is rejected", () => {
    assert.throws(() => filtering.createCloudVolumeAverageMips(new Uint8Array(7), 2));
    assert.throws(() => filtering.createCloudVolumeAverageMips(new Uint8Array(4), 0));
    assert.throws(() => filtering.unpackCloudVolumeMipTail(
        new Uint8Array(2 ** 3 * 4),
        new Uint8Array(1),
        2,
    ));
});

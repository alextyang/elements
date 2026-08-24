#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(
    repositoryRoot, "data/cloud-plate-assets/cgheven-vdb.json",
);
const wdasManifestPath = join(
    repositoryRoot, "data/cloud-plate-assets/wdas-cloud.json",
);
const targetRoot = join(repositoryRoot, "output/tools/cloud-vdb");
const wdasTargetRoot = join(repositoryRoot, "output/tools/wdas-cloud");

const sha256File = (path) => createHash("sha256")
    .update(readFileSync(path)).digest("hex");

const fetchAsset = async (asset, temporaryRoot) => {
    const target = join(targetRoot, `${asset.id}.vdb`);
    if (existsSync(target) && sha256File(target) === asset.vdbSha256) {
        process.stdout.write(`Verified ${asset.id}.vdb\n`);
        return;
    }
    const response = await fetch(asset.url);
    if (!response.ok) {
        throw new Error(`Download failed for ${asset.id}: HTTP ${response.status}`);
    }
    const archive = join(temporaryRoot, `${asset.id}.rar`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    if (sha256File(archive) !== asset.archiveSha256) {
        throw new Error(`Archive checksum mismatch for ${asset.id}.`);
    }
    const extractionRoot = join(temporaryRoot, asset.id);
    mkdirSync(extractionRoot, { recursive: true });
    const extraction = spawnSync("bsdtar", [
        "-xf", archive, "-C", extractionRoot,
    ], { encoding: "utf8" });
    if (extraction.status !== 0) {
        throw new Error(
            `bsdtar failed for ${asset.id}: ${extraction.stderr.trim()}`,
        );
    }
    const source = join(extractionRoot, asset.entry);
    if (!existsSync(source) || sha256File(source) !== asset.vdbSha256) {
        throw new Error(`VDB checksum mismatch for ${asset.id}.`);
    }
    mkdirSync(targetRoot, { recursive: true });
    const staged = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    copyFileSync(source, staged);
    renameSync(staged, target);
    process.stdout.write(`Installed ${asset.id}.vdb\n`);
};

const installWdasAssets = (manifest, temporaryRoot) => {
    const destinationRoot = join(wdasTargetRoot, "wdas_cloud");
    const missing = manifest.assets.filter((asset) => {
        const target = join(destinationRoot, asset.entry.split("/").at(-1));
        const valid = existsSync(target) && sha256File(target) === asset.vdbSha256;
        if (valid) process.stdout.write(`Verified ${asset.id}.vdb\n`);
        return !valid;
    });
    if (!missing.length) return;

    mkdirSync(wdasTargetRoot, { recursive: true });
    const archive = join(wdasTargetRoot, "wdas_cloud.zip");
    if (!existsSync(archive) || sha256File(archive) !== manifest.archiveSha256) {
        rmSync(archive, { force: true });
        const download = spawnSync("curl", [
            "-L", "--fail", "--silent", "--show-error", "--continue-at", "-",
            manifest.url, "-o", archive,
        ], { encoding: "utf8" });
        if (download.status !== 0) {
            throw new Error(`WDAS download failed: ${download.stderr.trim()}`);
        }
    }
    if (sha256File(archive) !== manifest.archiveSha256) {
        throw new Error("WDAS cloud archive checksum mismatch.");
    }
    const extractionRoot = join(temporaryRoot, "wdas-cloud");
    mkdirSync(extractionRoot, { recursive: true });
    const extraction = spawnSync("bsdtar", [
        "-xf", archive, "-C", extractionRoot,
        ...missing.map((asset) => asset.entry),
    ], { encoding: "utf8" });
    if (extraction.status !== 0) {
        throw new Error(`bsdtar failed for WDAS cloud: ${extraction.stderr.trim()}`);
    }
    mkdirSync(destinationRoot, { recursive: true });
    for (const asset of missing) {
        const source = join(extractionRoot, asset.entry);
        if (!existsSync(source) || sha256File(source) !== asset.vdbSha256) {
            throw new Error(`VDB checksum mismatch for ${asset.id}.`);
        }
        const target = join(destinationRoot, asset.entry.split("/").at(-1));
        const staged = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
        copyFileSync(source, staged);
        renameSync(staged, target);
        process.stdout.write(`Installed ${asset.id}.vdb\n`);
    }
};

const main = async () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const wdasManifest = JSON.parse(readFileSync(wdasManifestPath, "utf8"));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) ||
        wdasManifest.schemaVersion !== 1 || !Array.isArray(wdasManifest.assets)) {
        throw new Error("Unsupported cloud VDB asset manifest.");
    }
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-vdb-bootstrap-"));
    try {
        for (const asset of manifest.assets) {
            await fetchAsset(asset, temporaryRoot);
        }
        installWdasAssets(wdasManifest, temporaryRoot);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
};

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

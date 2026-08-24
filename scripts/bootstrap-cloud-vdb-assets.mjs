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
const authoredManifestPath = join(
    repositoryRoot, "data/cloud-plate-assets/authored-vdb.json",
);
const targetRoot = join(repositoryRoot, "output/tools/cloud-vdb");
const wdasTargetRoot = join(repositoryRoot, "output/tools/wdas-cloud");
const authoredTargetRoot = join(
    repositoryRoot, "output/cloud-plates/authored-vdb",
);

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

const installAuthoredAssets = (manifest) => {
    const generator = join(repositoryRoot, manifest.generator);
    if (!existsSync(generator) ||
        sha256File(generator) !== manifest.generatorSourceSha256) {
        throw new Error("Authored VDB generator checksum mismatch.");
    }
    const missing = manifest.assets.filter((asset) => {
        const target = join(authoredTargetRoot, asset.entry);
        const valid = existsSync(target) && sha256File(target) === asset.vdbSha256;
        if (valid) process.stdout.write(`Verified ${asset.id}.vdb\n`);
        return !valid;
    });
    if (!missing.length) return;
    const build = spawnSync(process.execPath, [
        join(repositoryRoot, "scripts/author-cloud-vdb.mjs"), "--build-only",
    ], { cwd: repositoryRoot, encoding: "utf8" });
    if (build.status !== 0) {
        throw new Error(`Authored VDB build failed: ${build.stderr.trim()}`);
    }
    const executable = join(
        repositoryRoot, "output/tools/cloud-vdb-author-build/cloud-vdb-author",
    );
    mkdirSync(authoredTargetRoot, { recursive: true });
    for (const asset of missing) {
        const target = join(authoredTargetRoot, asset.entry);
        const staged = `${target}.${process.pid}.${randomBytes(4)
            .toString("hex")}.tmp.vdb`;
        const authored = asset.authoring;
        const generation = spawnSync(executable, [
            "--genus", authored.genus,
            "--species", authored.species,
            "--output", staged,
            "--width", String(authored.width),
            "--depth", String(authored.depth),
            "--height", String(authored.height),
            "--voxel-size", String(authored.voxelSize),
            "--seed", String(authored.seed),
            "--evolution", String(authored.evolution),
        ], { cwd: repositoryRoot, encoding: "utf8" });
        if (generation.status !== 0) {
            rmSync(staged, { force: true });
            throw new Error(
                `Authored VDB generation failed for ${asset.id}: ` +
                `${generation.stderr.trim()}`,
            );
        }
        if (!existsSync(staged) || sha256File(staged) !== asset.vdbSha256) {
            rmSync(staged, { force: true });
            throw new Error(`Authored VDB checksum mismatch for ${asset.id}.`);
        }
        rmSync(target, { force: true });
        renameSync(staged, target);
        process.stdout.write(`Installed ${asset.id}.vdb\n`);
    }
};

const main = async () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const wdasManifest = JSON.parse(readFileSync(wdasManifestPath, "utf8"));
    const authoredManifest = JSON.parse(readFileSync(
        authoredManifestPath, "utf8"));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) ||
        wdasManifest.schemaVersion !== 1 || !Array.isArray(wdasManifest.assets) ||
        authoredManifest.schemaVersion !== 1 ||
        !Array.isArray(authoredManifest.assets)) {
        throw new Error("Unsupported cloud VDB asset manifest.");
    }
    const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-vdb-bootstrap-"));
    try {
        for (const asset of manifest.assets) {
            await fetchAsset(asset, temporaryRoot);
        }
        installWdasAssets(wdasManifest, temporaryRoot);
        installAuthoredAssets(authoredManifest);
    } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
    }
};

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

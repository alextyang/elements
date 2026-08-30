#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import sharp from "sharp";

import { qualifyCloudPlateImage } from
    "./lib/cloud-plate-image-qualification.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256File = (path) => createHash("sha256")
    .update(readFileSync(path)).digest("hex");

const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
    });
    if (result.status !== 0) {
        process.stderr.write(result.stdout ?? "");
        process.stderr.write(result.stderr ?? "");
        throw new Error(`${command} exited with status ${result.status}.`);
    }
    return result;
};

const resolveBlender = () => [
    process.env.CLOUD_PLATE_BLENDER_PATH,
    join(repositoryRoot, "output/tools/Blender.app/Contents/MacOS/Blender"),
    "/Applications/Blender.app/Contents/MacOS/Blender",
].filter(Boolean).find(existsSync);

const generatedVdb = ({ benchmark, candidate, workRoot }) => {
    const executable = join(
        repositoryRoot, "output/tools/cloud-vdb-author-build/cloud-vdb-author",
    );
    if (!existsSync(executable)) {
        run(process.execPath, ["scripts/author-cloud-vdb.mjs", "--build-only"]);
    }
    const output = join(workRoot, `${candidate.id}.vdb`);
    const authoring = benchmark.authoring;
    run(executable, [
        "--genus", authoring.genus,
        "--species", authoring.species,
        "--output", output,
        "--width", String(authoring.width),
        "--depth", String(authoring.depth),
        "--height", String(authoring.height),
        "--voxel-size", String(authoring.voxelSize),
        "--seed", String(candidate.seed),
        "--evolution", String(authoring.evolution),
    ]);
    return output;
};

const referenceVdb = (candidate) => {
    const manifest = JSON.parse(readFileSync(
        join(repositoryRoot, candidate.manifest), "utf8",
    ));
    const asset = manifest.assets.find(({ id }) => id === candidate.assetId);
    if (!asset) throw new Error(`Unknown reference ${candidate.assetId}.`);
    const root = process.env.CLOUD_VDB_ROOT ??
        join(repositoryRoot, "output/tools/cloud-vdb");
    const path = join(root, `${asset.id}.vdb`);
    if (!existsSync(path) || sha256File(path) !== asset.vdbSha256) {
        throw new Error(`Missing or invalid reference ${asset.id}.`);
    }
    return path;
};

const synthesizedVdb = ({ benchmark, candidate, workRoot }) => {
    const executable = join(
        repositoryRoot, "output/tools/cloud-vdb-author-build/cloud-vdb-synthesizer",
    );
    if (!existsSync(executable)) {
        run(process.execPath, ["scripts/author-cloud-vdb.mjs", "--build-only"]);
    }
    const synthesis = benchmark.synthesis;
    const manifest = JSON.parse(readFileSync(
        join(repositoryRoot, synthesis.manifest), "utf8",
    ));
    const root = process.env.CLOUD_VDB_ROOT ??
        join(repositoryRoot, "output/tools/cloud-vdb");
    const sources = synthesis.basisAssetIds.map((id) => {
        const asset = manifest.assets.find((value) => value.id === id);
        const path = join(root, `${id}.vdb`);
        if (!asset || !existsSync(path) || sha256File(path) !== asset.vdbSha256) {
            throw new Error(`Missing or invalid synthesis basis ${id}.`);
        }
        return path;
    });
    const output = join(workRoot, `${candidate.id}.vdb`);
    run(executable, [
        ...sources.flatMap((path) => ["--source", path]),
        "--output", output,
        "--width", String(synthesis.width),
        "--depth", String(synthesis.depth),
        "--height", String(synthesis.height),
        "--voxel-size", String(synthesis.voxelSize),
        "--seed", String(candidate.seed),
    ]);
    return output;
};

const makeScene = ({ method, benchmark, candidate }) => {
    const base = JSON.parse(readFileSync(
        join(repositoryRoot, benchmark.methodBenchmark), "utf8",
    ));
    return {
        schemaVersion: 1,
        id: `${benchmark.id}-${candidate.id}`,
        fixedCamera: base.fixedCamera,
        render: {
            width: method.width,
            height: method.height,
            phaseFunction: method.phaseFunction,
            worldModel: benchmark.lightingOverride.worldModel,
        },
        offlineComposition: {
            sourceKind: candidate.kind,
            sourceAssetId: candidate.id,
            axisConvention: candidate.axisConvention,
            scatteringStrength: candidate.scatteringStrength,
            radianceCalibration: base.render.radianceCalibration,
            volumeInstances: [{
                id: candidate.id,
                componentId: "benchmark-cloud",
                target: [0, 0, 7.4],
                scale: candidate.scale,
                rotationDegrees: -7,
                scatteringMultiplier: 1,
                detailStrength: 0,
                bottomFade: 0,
                phaseOffset: 0,
            }],
        },
        lighting: benchmark.lightingOverride,
    };
};

const contactSheet = async ({ results, width, height, destination }) => {
    const columns = 2;
    const labelHeight = 42;
    const rows = Math.ceil(results.length / columns);
    const composites = [];
    for (const [index, result] of results.entries()) {
        const left = index % columns * width;
        const top = Math.floor(index / columns) * (height + labelHeight);
        composites.push({ input: result.previewPath, left, top });
        composites.push({
            input: Buffer.from(
                `<svg width="${width}" height="${labelHeight}">` +
                `<rect width="100%" height="100%" fill="#101318"/>` +
                `<text x="18" y="28" fill="#f4f7fb" ` +
                `font-family="-apple-system,Arial" font-size="18">` +
                `${result.id}</text></svg>`,
            ),
            left,
            top: top + height,
        });
    }
    await sharp({ create: {
        width: columns * width,
        height: rows * (height + labelHeight),
        channels: 4,
        background: "#101318",
    } }).composite(composites).png().toFile(destination);
};

const main = async () => {
    const id = process.argv[2] ?? "cumulus-congestus";
    const benchmark = JSON.parse(readFileSync(join(
        repositoryRoot, "data/cloud-source-benchmarks", `${id}.json`,
    ), "utf8"));
    const blender = resolveBlender();
    if (!blender) throw new Error("Blender 5.2 or newer is required.");
    const workRoot = join(repositoryRoot, "output/cloud-source-benchmarks", id);
    const publicRoot = join(repositoryRoot, "public/cloud-source-benchmarks", id);
    mkdirSync(workRoot, { recursive: true });
    mkdirSync(publicRoot, { recursive: true });
    const method = benchmark.winningTransport;
    const results = [];
    for (const candidate of benchmark.candidates) {
        process.stdout.write(`Authoring and rendering ${candidate.id}...\n`);
        const sourcePath = candidate.kind === "generated-vdb"
            ? generatedVdb({ benchmark, candidate, workRoot })
            : candidate.kind === "synthesized-vdb"
                ? synthesizedVdb({ benchmark, candidate, workRoot })
                : referenceVdb(candidate);
        const scenePath = join(workRoot, `${candidate.id}.json`);
        writeFileSync(scenePath, `${JSON.stringify(makeScene({
            method, benchmark, candidate,
        }), null, 2)}\n`);
        const renderRoot = join(workRoot, `${candidate.id}-render`);
        mkdirSync(renderRoot, { recursive: true });
        run(blender, [
            "--background", "--factory-startup",
            "--python", join(repositoryRoot, "scripts/blender/render_cloud_plate.py"),
            "--", scenePath, "0", "0", String(method.width), String(method.height),
            String(method.samples), "0.002", renderRoot, String(candidate.seed ?? 7319),
        ], { env: {
            ...process.env,
            CLOUD_STORM_SOURCE_KIND: candidate.kind,
            CLOUD_STORM_VDB_PATH: sourcePath,
            CLOUD_VOLUME_SOURCE_MAP: JSON.stringify({ [candidate.id]: sourcePath }),
            CLOUD_STORM_SCATTERING_STRENGTH: String(candidate.scatteringStrength),
            CLOUD_PLATE_RENDER_METHOD: "CYCLES_VOLUME",
            CLOUD_PLATE_PHASE_FUNCTION: method.phaseFunction.toUpperCase(),
            CLOUD_PLATE_DENOISER: "NONE",
            CLOUD_PLATE_PATH_GUIDING: "NONE",
            CLOUD_PLATE_WORLD_MODEL:
                benchmark.lightingOverride.worldModel.toUpperCase(),
            CLOUD_PLATE_VOLUME_BOUNCES: String(method.volumeBounces),
        } });
        const previewPath = join(renderRoot, "preview.png");
        const publicPreview = join(publicRoot, `${candidate.id}.png`);
        copyFileSync(previewPath, publicPreview);
        const qualification = await qualifyCloudPlateImage({
            previewPath,
            transmittancePath: join(renderRoot, "transmittance.rgba16f"),
            width: method.width,
            height: method.height,
        });
        results.push({
            id: candidate.id,
            kind: candidate.kind,
            seed: candidate.seed,
            sourceSha256: sha256File(sourcePath),
            previewPath,
            previewUrl: `/cloud-source-benchmarks/${id}/${candidate.id}.png`,
            previewSha256: sha256File(publicPreview),
            metrics: JSON.parse(readFileSync(
                join(renderRoot, "capture-metrics.json"), "utf8",
            )),
            qualification,
        });
    }
    const comparisonPath = join(publicRoot, "comparison.png");
    await contactSheet({
        results, width: method.width, height: method.height,
        destination: comparisonPath,
    });
    const report = {
        schemaVersion: 1,
        benchmarkId: id,
        generatorSourceSha256: sha256File(join(
            repositoryRoot, "scripts/openvdb/cloud_vdb_author.cpp",
        )),
        winningTransport: method,
        lighting: benchmark.lightingOverride,
        comparisonUrl: `/cloud-source-benchmarks/${id}/comparison.png`,
        comparisonSha256: sha256File(comparisonPath),
        results: results.map(({ previewPath, ...result }) => result),
    };
    writeFileSync(
        join(publicRoot, "results.json"), `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify({
        benchmarkId: id,
        results: results.map(({ id: candidateId, metrics, qualification }) => ({
            id: candidateId,
            seconds: metrics.renderSeconds,
            ready: qualification.qualification.ready,
            radialArtifact: qualification.qualification.radialArtifact,
        })),
        comparisonPath,
    }, null, 2)}\n`);
};

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

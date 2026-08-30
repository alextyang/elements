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

const methodContract = Object.freeze({
    "mesh-isosurface": {
        renderMethod: "MESH_ISOSURFACE",
        phaseFunction: "HENYEY_GREENSTEIN",
        denoiser: "OPENIMAGEDENOISE",
    },
    "eevee-null-scattering": {
        renderMethod: "EEVEE_VOLUME",
        phaseFunction: "HENYEY_GREENSTEIN",
        denoiser: "NONE",
    },
    "cycles-henyey-greenstein": {
        renderMethod: "CYCLES_VOLUME",
        phaseFunction: "HENYEY_GREENSTEIN",
        denoiser: "OPENIMAGEDENOISE",
    },
    "cycles-draine": {
        renderMethod: "CYCLES_VOLUME",
        phaseFunction: "DRAINE",
        denoiser: "OPENIMAGEDENOISE",
    },
    "cycles-mie": {
        renderMethod: "CYCLES_VOLUME",
        phaseFunction: "MIE",
        denoiser: "OPENIMAGEDENOISE",
    },
    "cycles-mie-raw": {
        renderMethod: "CYCLES_VOLUME",
        phaseFunction: "MIE",
        denoiser: "NONE",
    },
});

const sha256File = (path) => createHash("sha256")
    .update(readFileSync(path)).digest("hex");

const parse = (args) => {
    const options = { id: "cumulus-congestus", methods: [] };
    for (let index = 0; index < args.length; index += 1) {
        const [name, inline] = args[index].split("=", 2);
        if (![
            "--id", "--method", "--samples", "--width", "--height",
        ].includes(name)) throw new Error(`Unknown option: ${args[index]}`);
        const value = inline ?? args[++index];
        if (!value) throw new Error(`${name} requires a value.`);
        if (name === "--id") options.id = value;
        if (name === "--method") options.methods.push(value);
        if (name === "--samples") options.samples = Number(value);
        if (name === "--width") options.width = Number(value);
        if (name === "--height") options.height = Number(value);
    }
    return options;
};

const resolveBlender = () => {
    const candidates = [
        process.env.CLOUD_PLATE_BLENDER_PATH,
        join(repositoryRoot, "output/tools/Blender.app/Contents/MacOS/Blender"),
        "/Applications/Blender.app/Contents/MacOS/Blender",
    ].filter(Boolean);
    const executable = candidates.find(existsSync);
    if (!executable) throw new Error("Blender 5.2 or newer is required.");
    return executable;
};

const sourcePathFor = (benchmark) => {
    const manifestPath = join(repositoryRoot, benchmark.source.manifest);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const asset = manifest.assets.find(({ id }) => id === benchmark.source.assetId);
    if (!asset) throw new Error(`Unknown source asset ${benchmark.source.assetId}.`);
    const root = process.env.CLOUD_VDB_ROOT ??
        join(repositoryRoot, "output/tools/cloud-vdb");
    const path = join(root, `${asset.id}.vdb`);
    if (!existsSync(path) || sha256File(path) !== asset.vdbSha256) {
        throw new Error(
            `Missing or invalid ${asset.id}. Run npm run cloud:plates:bootstrap.`,
        );
    }
    return { path, sha256: asset.vdbSha256 };
};

const makeScene = (benchmark, render) => ({
    schemaVersion: 1,
    id: `${benchmark.id}-method-benchmark`,
    fixedCamera: benchmark.fixedCamera,
    render: {
        width: render.width,
        height: render.height,
        phaseFunction: "mie",
        worldModel: benchmark.lighting.worldModel,
    },
    offlineComposition: {
        sourceKind: "benchmark-truth-volume",
        sourceAssetId: benchmark.source.assetId,
        axisConvention: benchmark.source.axisConvention,
        scatteringStrength: render.scatteringStrength,
        radianceCalibration: render.radianceCalibration,
        volumeInstances: [{
            id: "benchmark-cloud",
            componentId: "benchmark-cloud",
            target: [0, 0, 7.4],
            scale: [1.8, 1.8, 1.8],
            rotationDegrees: -7,
            scatteringMultiplier: 1,
            detailStrength: 0,
            bottomFade: 0,
            phaseOffset: 0,
        }],
    },
    lighting: benchmark.lighting,
});

const escapeXml = (value) => value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const contactSheet = async ({ results, width, height, destination }) => {
    const columns = 2;
    const labelHeight = 42;
    const rows = Math.ceil(results.length / columns);
    const canvas = sharp({
        create: {
            width: columns * width,
            height: rows * (height + labelHeight),
            channels: 4,
            background: "#101318",
        },
    });
    const composites = [];
    for (const [index, result] of results.entries()) {
        const left = (index % columns) * width;
        const top = Math.floor(index / columns) * (height + labelHeight);
        composites.push({ input: result.previewPath, left, top });
        composites.push({
            input: Buffer.from(
                `<svg width="${width}" height="${labelHeight}">` +
                `<rect width="100%" height="100%" fill="#101318"/>` +
                `<text x="18" y="28" fill="#f4f7fb" ` +
                `font-family="-apple-system,Arial" font-size="18">` +
                `${escapeXml(result.method)}</text></svg>`,
            ),
            left,
            top: top + height,
        });
    }
    await canvas.composite(composites).png().toFile(destination);
};

const main = async () => {
    const options = parse(process.argv.slice(2));
    const benchmarkPath = join(
        repositoryRoot, "data/cloud-render-benchmarks", `${options.id}.json`,
    );
    const benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8"));
    const methods = options.methods.length ? options.methods : benchmark.methods;
    for (const method of methods) {
        if (!methodContract[method]) throw new Error(`Unknown method ${method}.`);
    }
    const render = {
        ...benchmark.render,
        samples: options.samples ?? benchmark.render.samples,
        width: options.width ?? benchmark.render.width,
        height: options.height ?? benchmark.render.height,
    };
    const source = sourcePathFor(benchmark);
    const blender = resolveBlender();
    const workRoot = join(repositoryRoot, "output/cloud-render-benchmarks", options.id);
    const publicRoot = join(repositoryRoot, "public/cloud-render-benchmarks", options.id);
    mkdirSync(workRoot, { recursive: true });
    mkdirSync(publicRoot, { recursive: true });
    const scenePath = join(workRoot, "scene.json");
    writeFileSync(scenePath, `${JSON.stringify(makeScene(benchmark, render), null, 2)}\n`);

    const results = [];
    for (const method of methods) {
        const contract = methodContract[method];
        const output = join(workRoot, method);
        mkdirSync(output, { recursive: true });
        process.stdout.write(`Rendering ${method}...\n`);
        const invocation = spawnSync(blender, [
            "--background", "--factory-startup",
            "--python", join(repositoryRoot, "scripts/blender/render_cloud_plate.py"),
            "--", scenePath, "0", "0", String(render.width), String(render.height),
            String(render.samples), "0.002", output, "7319",
        ], {
            cwd: repositoryRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                CLOUD_STORM_SOURCE_KIND: "benchmark-truth-volume",
                CLOUD_STORM_VDB_PATH: source.path,
                CLOUD_VOLUME_SOURCE_MAP: JSON.stringify({
                    [benchmark.source.assetId]: source.path,
                }),
                CLOUD_STORM_SCATTERING_STRENGTH: String(
                    render.scatteringStrength,
                ),
                CLOUD_PLATE_RENDER_METHOD: contract.renderMethod,
                CLOUD_PLATE_PHASE_FUNCTION: contract.phaseFunction,
                CLOUD_PLATE_DENOISER: contract.denoiser,
                CLOUD_PLATE_PATH_GUIDING: "NONE",
                CLOUD_PLATE_WORLD_MODEL: benchmark.lighting.worldModel.toUpperCase(),
                CLOUD_PLATE_VOLUME_BOUNCES: String(render.volumeBounces),
            },
        });
        if (invocation.status !== 0) {
            process.stderr.write(invocation.stdout);
            process.stderr.write(invocation.stderr);
            throw new Error(`${method} failed with status ${invocation.status}.`);
        }
        const previewPath = join(output, "preview.png");
        const publicPreview = join(publicRoot, `${method}.png`);
        copyFileSync(previewPath, publicPreview);
        const metrics = JSON.parse(readFileSync(
            join(output, "capture-metrics.json"), "utf8",
        ));
        const imageQualification = await qualifyCloudPlateImage({
            previewPath,
            transmittancePath: join(output, "transmittance.rgba16f"),
            width: render.width,
            height: render.height,
        });
        results.push({
            method,
            previewPath,
            previewUrl: `/cloud-render-benchmarks/${options.id}/${method}.png`,
            previewSha256: sha256File(publicPreview),
            metrics,
            imageQualification,
        });
    }
    const sheetPath = join(publicRoot, "comparison.png");
    await contactSheet({
        results, width: render.width, height: render.height, destination: sheetPath,
    });
    const report = {
        schemaVersion: 1,
        benchmarkId: benchmark.id,
        species: benchmark.species,
        source: { ...benchmark.source, sha256: source.sha256 },
        fixedCamera: benchmark.fixedCamera,
        render,
        comparisonUrl: `/cloud-render-benchmarks/${options.id}/comparison.png`,
        comparisonSha256: sha256File(sheetPath),
        results: results.map(({ previewPath, ...result }) => result),
    };
    writeFileSync(
        join(publicRoot, "results.json"), `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(`${JSON.stringify({
        benchmarkId: report.benchmarkId,
        methods: results.map(({ method, metrics, imageQualification }) => ({
            method,
            renderSeconds: metrics.renderSeconds,
            ready: imageQualification.qualification.ready,
            failures: imageQualification.qualification.failures,
        })),
        comparison: sheetPath,
    }, null, 2)}\n`);
};

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

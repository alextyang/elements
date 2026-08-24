#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderCloudPlateScene } from "./lib/cloud-plate-pipeline.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const usage = () => process.stdout.write(`Usage:
  node scripts/render-cloud-plates.mjs [options]

Options:
  --scene ID|PATH       Scene id under data/cloud-plate-scenes (default thunderstorm-mature)
  --url URL             Running local renderer (default http://127.0.0.1:3000)
  --frame N             Render one frame; repeat for multiple frames
  --samples N           Override the scene's minimum sample count
  --width N             Override output width for canary renders
  --height N            Override output height for canary renders
  --convergence-target N Override measured RMS target for canary renders
`);

const parse = (values) => {
    const options = { scene: "thunderstorm-mature", frames: [] };
    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];
        if (argument === "--help" || argument === "-h") {
            options.help = true;
            continue;
        }
        const [name, inline] = argument.split("=", 2);
        if (!["--scene", "--url", "--frame", "--samples", "--width", "--height",
            "--convergence-target"]
            .includes(name)) throw new Error(`Unknown option: ${argument}`);
        const value = inline ?? values[++index];
        if (!value) throw new Error(`${name} requires a value.`);
        if (name === "--scene") options.scene = value;
        if (name === "--url") options.url = value;
        if (name === "--frame") options.frames.push(Number(value));
        if (name === "--samples") options.samples = Number(value);
        if (name === "--width") options.width = Number(value);
        if (name === "--height") options.height = Number(value);
        if (name === "--convergence-target") {
            options.convergenceTarget = Number(value);
        }
    }
    return options;
};

const main = async () => {
    const options = parse(process.argv.slice(2));
    if (options.help) { usage(); return; }
    const scenePath = options.scene.includes("/") || options.scene.endsWith(".json")
        ? resolve(repositoryRoot, options.scene)
        : join(repositoryRoot, "data/cloud-plate-scenes", `${options.scene}.json`);
    const manifest = await renderCloudPlateScene({
        repositoryRoot,
        scenePath,
        baseUrl: options.url,
        requestedFrames: options.frames,
        samples: options.samples,
        width: options.width,
        height: options.height,
        convergenceTarget: options.convergenceTarget,
    });
    process.stdout.write(`${JSON.stringify({
        sceneId: manifest.sceneId,
        sceneHash: manifest.sceneHash,
        status: manifest.status,
        completedFrames: manifest.completedFrames,
        totalFrames: manifest.totalFrames,
    }, null, 2)}\n`);
};

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
});

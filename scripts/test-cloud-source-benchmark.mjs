import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const benchmark = JSON.parse(readFileSync(
    "data/cloud-source-benchmarks/cumulus-congestus.json", "utf8",
));
const runner = readFileSync("scripts/render-cloud-source-benchmark.mjs", "utf8");

test("source benchmark fixes raw Mie transport and one camera", () => {
    assert.equal(benchmark.winningTransport.engine, "cycles");
    assert.equal(benchmark.winningTransport.phaseFunction, "mie");
    assert.equal(benchmark.winningTransport.denoiser, "none");
    assert.ok(benchmark.winningTransport.samples >= 16384);
    assert.equal(benchmark.methodBenchmark,
        "data/cloud-render-benchmarks/cumulus-congestus.json");
    assert.equal(benchmark.generativeAi, false);
    assert.deepEqual(benchmark.simulation, {
        backend: "blender-mantaflow",
        script: "scripts/blender/simulate_congestus.py",
        resolution: 64,
        frames: 90,
        captureFrame: 60,
        densityGrid: "density",
        axisConvention: "z-up",
    });
});

test("source benchmark compares truth to deterministic physical and procedural range", () => {
    const generated = benchmark.candidates.filter(({ kind }) =>
        kind === "generated-vdb");
    const synthesized = benchmark.candidates.filter(({ kind }) =>
        kind === "synthesized-vdb");
    const simulated = benchmark.candidates.filter(({ kind }) =>
        kind === "simulated-vdb");
    assert.ok(benchmark.candidates.some(({ kind }) => kind === "reference-vdb"));
    assert.equal(generated.length, 1);
    assert.equal(synthesized.length, 1);
    assert.equal(simulated.length, 3);
    assert.deepEqual(simulated.map(({ seed }) => seed).sort((a, b) => a - b),
        [9212, 9213, 9214]);
    assert.deepEqual(new Set(simulated.map(({ regime }) => regime)),
        new Set(["developing", "mature", "sheared"]));
    assert.ok(simulated.every(({ axisConvention }) =>
        axisConvention === "z-up"));
    assert.ok(simulated.every(({ scale }) =>
        scale.every((component) => component > 0)));
    assert.ok(simulated.every(({ detailStrength }) => detailStrength === 0));
    assert.match(runner, /cloud-vdb-author/);
    assert.match(runner, /cloud-vdb-synthesizer/);
    assert.match(runner, /simulate_congestus\.py/);
    assert.match(runner, /CLOUD_DENSITY_GRID/);
    assert.match(runner, /densityGrid/);
    assert.match(runner, /detailStrength: candidate\.detailStrength/);
    assert.match(runner, /CLOUD_CONVECTION_METRICS/);
    assert.match(runner, /candidate\.regime/);
    assert.match(runner, /sourceMetadata/);
    assert.match(runner, /CLOUD_SOURCE_CANDIDATES/);
    assert.match(runner, /CLOUD_SOURCE_SAMPLES/);
    assert.match(runner, /CLOUD_SOURCE_DENOISER/);
    assert.match(runner, /CLOUD_SOURCE_SIMULATION_RESOLUTION/);
    assert.match(runner, /CLOUD_SOURCE_SIMULATION_FRAMES/);
    assert.match(runner, /CLOUD_SOURCE_SIMULATION_CAPTURE_FRAME/);
    assert.match(runner, /hierarchicalPlume/);
    assert.match(runner, /exemplarSynthesis/);
    assert.match(runner, /mantaflowSimulation/);
    assert.match(runner, /radialArtifact/);
    assert.doesNotMatch(runner, /imagegen|diffusion|openai/i);
});

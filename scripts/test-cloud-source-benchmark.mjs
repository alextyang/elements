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
    assert.ok(benchmark.winningTransport.samples >= 4096);
    assert.equal(benchmark.methodBenchmark,
        "data/cloud-render-benchmarks/cumulus-congestus.json");
});

test("source benchmark compares truth to deterministic generative range", () => {
    const generated = benchmark.candidates.filter(({ kind }) =>
        kind === "generated-vdb");
    const synthesized = benchmark.candidates.filter(({ kind }) =>
        kind === "synthesized-vdb");
    assert.ok(benchmark.candidates.some(({ kind }) => kind === "reference-vdb"));
    assert.equal(generated.length, 1);
    assert.equal(synthesized.length, 3);
    assert.equal(new Set(synthesized.map(({ seed }) => seed)).size,
        synthesized.length);
    assert.match(runner, /cloud-vdb-author/);
    assert.match(runner, /cloud-vdb-synthesizer/);
    assert.match(runner, /generatorSourceSha256/);
    assert.match(runner, /radialArtifact/);
    assert.doesNotMatch(runner, /imagegen|diffusion|openai/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL(
    "../app/cloud-production-probe/page.tsx",
    import.meta.url,
), "utf8");
const probeSource = readFileSync(new URL(
    "../app/cloud-production-probe/cloud-production-shader-probe.tsx",
    import.meta.url,
), "utf8");

test("the probe compiles the generated production physical-sample shader", () => {
    assert.match(pageSource, /createCloudProductionPhysicalSampleWgsl/);
    assert.match(pageSource, /group: 0/);
    assert.match(pageSource, /force-static/);
    assert.doesNotMatch(pageSource, /fetch\(|writeFile|exec\(/);
});

test("the browser probe requires real WebGPU compilation diagnostics", () => {
    assert.match(probeSource, /navigator as Navigator & \{ gpu\?: WebGpuLike \}/);
    assert.match(probeSource, /requestAdapter/);
    assert.match(probeSource, /requestDevice/);
    assert.match(probeSource, /pushErrorScope\("validation"\)/);
    assert.match(probeSource, /createShaderModule/);
    assert.match(probeSource, /getCompilationInfo/);
    assert.match(probeSource, /popErrorScope/);
    assert.match(probeSource, /data-cloud-production-shader-probe/);
    assert.doesNotMatch(probeSource, /eval\(|new Function|innerHTML/);
});

test("the probe states its evidence boundary instead of promoting support", () => {
    assert.match(probeSource, /does not qualify the shipping camera/);
    assert.match(probeSource, /no support maturity promotion/);
    assert.match(probeSource, /Diagnostic only/);
});

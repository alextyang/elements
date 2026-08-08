import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL(
    "../.github/workflows/cloud-renderer-ci.yml",
    import.meta.url,
), "utf8");
const configuration = JSON.parse(readFileSync(new URL(
    "../.playwright/cli.config.json",
    import.meta.url,
), "utf8"));
const validator = readFileSync(new URL(
    "./validate-webgpu-shaders.mjs",
    import.meta.url,
), "utf8");

test("cloud CI installs a pinned real-browser validator before shader execution", () => {
    assert.match(workflow, /@playwright\/cli@0\.1\.17/);
    assert.match(workflow, /npx playwright install chromium --with-deps/);
    assert.match(workflow,
        /Install pinned browser validation runtime[\s\S]*Validate generated WebGPU shaders/);
    assert.doesNotMatch(workflow,
        /sky:validate-webgpu\s+--\s+--preflight-only/,
        "CI must not silently weaken the real GPU compilation gate");
});

test("CI Chromium explicitly enables the bounded software WebGPU adapter", () => {
    assert.equal(configuration.browser.browserName, "chromium");
    assert.equal(configuration.browser.launchOptions.headless, true);
    for (const argument of [
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
        "--use-angle=swiftshader",
        "--disable-vulkan-surface",
    ]) {
        assert.ok(configuration.browser.launchOptions.args.includes(argument),
            `missing ${argument}`);
    }
});

test("the validator fails closed when browser launch or WebGPU validation fails", () => {
    assert.match(validator, /playwrightCli/);
    assert.match(validator, /Playwright browser launch/);
    assert.match(validator, /navigator\.gpu/);
    assert.match(validator, /getCompilationInfo/);
    assert.match(validator, /process\.exitCode = 1/);
});

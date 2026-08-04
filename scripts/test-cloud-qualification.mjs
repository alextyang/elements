import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(
    path.join(root, "data", "cloud-qualification-scenarios.json"),
    "utf8",
));

test("cloud qualification matrix is deterministic and spans workload classes", () => {
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.tiers.map((tier) => tier.id), ["battery", "balanced", "high"]);
    assert.ok(manifest.defaultRepeats >= 3);
    assert.ok(manifest.defaultTimingSamples >= 4);
    assert.ok(manifest.scenarios.length >= 6);
    assert.equal(new Set(manifest.scenarios.map((scenario) => scenario.id)).size, manifest.scenarios.length);
    assert.ok(manifest.scenarios.some((scenario) => scenario.params.lowGenus === "cumulonimbus"));
    assert.ok(manifest.scenarios.some((scenario) => scenario.params.midGenus === "nimbostratus"));
    assert.ok(manifest.scenarios.some((scenario) => scenario.params.highGenus === "cirrus"));
    assert.ok(manifest.scenarios.some((scenario) => scenario.viewport.height > scenario.viewport.width));
    assert.ok(manifest.scenarios.some((scenario) => scenario.viewport.width / scenario.viewport.height > 2));
});

test("cloud qualification planner emits replayable cold reload jobs", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
        path.join(root, "scripts", "cloud-qualification.mjs"),
        "plan",
        "http://127.0.0.1:3999",
    ], {
        env: {
            ...process.env,
            CLOUD_QUALIFICATION_SCENARIO: "fair-cumulus-day",
            CLOUD_QUALIFICATION_TIER: "balanced",
            CLOUD_QUALIFICATION_REPEATS: "2",
            CLOUD_QUALIFICATION_SAMPLES: "3",
        },
    });
    const plan = JSON.parse(stdout);
    assert.equal(plan.jobs.length, 2);
    assert.equal(plan.jobs[0].timingSamples, 3);
    assert.match(plan.jobs[0].url, /rendererPreference=webgpu/);
    assert.match(plan.jobs[0].url, /rendererQuality=balanced/);
    assert.match(plan.jobs[0].url, /lowGenus=cumulus/);
    assert.notEqual(plan.jobs[0].id, plan.jobs[1].id);
});

test("cloud qualification report fails missing evidence and passes complete evidence", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "elements-cloud-qualification-"));
    const planPath = path.join(temporary, "plan.json");
    const rawPath = path.join(temporary, "raw.ndjson");
    const reportPath = path.join(temporary, "report.md");
    const { stdout } = await execFileAsync(process.execPath, [
        path.join(root, "scripts", "cloud-qualification.mjs"),
        "plan",
        "http://127.0.0.1:3999",
    ], {
        env: {
            ...process.env,
            CLOUD_QUALIFICATION_SCENARIO: "fair-cumulus-day",
            CLOUD_QUALIFICATION_TIER: "balanced",
            CLOUD_QUALIFICATION_REPEATS: "1",
            CLOUD_QUALIFICATION_SAMPLES: "1",
        },
    });
    const plan = JSON.parse(stdout);
    await writeFile(planPath, JSON.stringify(plan));
    await writeFile(rawPath, `${JSON.stringify({
        jobId: plan.jobs[0].id,
        userAgent: "qualification-test",
        stats: {
            backend: "webgpu",
            coldCloudWarmupComplete: true,
            coldCloudWarmupMs: 2,
            coldCloudWarmupQueueMs: 10,
            firstCloudUpdateMs: 3,
            cloudTimingSamples: 1,
            cloudUpdateP50Ms: 2,
            cloudUpdateP95Ms: 2,
            cloudUpdateMaxMs: 2,
            cloudUnsafeSampleCount: 0,
            cadenceScale: 1,
            budgetStatus: "nominal",
            adapterInfo: { description: "test adapter" },
        },
    })}\n`);
    const result = await execFileAsync(process.execPath, [
        path.join(root, "scripts", "cloud-qualification.mjs"),
        "report",
        rawPath,
        reportPath,
        planPath,
    ]);
    assert.match(result.stdout, /PASS: 1\/1/);
    assert.match(await readFile(reportPath, "utf8"), /Result: PASS/);

    await writeFile(rawPath, "");
    await assert.rejects(
        execFileAsync(process.execPath, [
            path.join(root, "scripts", "cloud-qualification.mjs"),
            "report",
            rawPath,
            reportPath,
            planPath,
        ]),
        (error) => error.code === 2,
    );
});

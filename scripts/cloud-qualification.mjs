import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "data", "cloud-qualification-scenarios.json");

const quantile = (values, amount) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))];
};

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const format = (value, digits = 2) => finite(value) ? value.toFixed(digits) : "—";

const readManifest = async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    if (manifest.schemaVersion !== 1) throw new Error("Unsupported cloud qualification manifest");
    if (!Array.isArray(manifest.scenarios) || !Array.isArray(manifest.tiers)) {
        throw new Error("Cloud qualification manifest is missing scenarios or tiers");
    }
    return manifest;
};

const matchesFilter = (id, filter) =>
    !filter || filter === "all" || filter.split(",").some((entry) => entry.trim() === id);

const buildPlan = async (baseUrl) => {
    const manifest = await readManifest();
    const repeats = Math.max(1, Number(process.env.CLOUD_QUALIFICATION_REPEATS || manifest.defaultRepeats));
    const timingSamples = Math.max(1, Number(process.env.CLOUD_QUALIFICATION_SAMPLES || manifest.defaultTimingSamples));
    const scenarioFilter = process.env.CLOUD_QUALIFICATION_SCENARIO || "all";
    const tierFilter = process.env.CLOUD_QUALIFICATION_TIER || "all";
    const commonParams = {
        rendererPreference: "webgpu",
        rendererDebugView: "coverage",
        cloudResolutionScale: "1",
        temporalClouds: "1",
        paused: "0",
        manualClouds: "1",
        lowGenus: "clear",
        lowOktas: "0",
        midGenus: "clear",
        midOktas: "0",
        highGenus: "clear",
        highOktas: "0",
        cloudFog: "0",
        cloudNoctilucent: "0"
    };
    const jobs = [];

    for (const scenario of manifest.scenarios.filter((entry) => matchesFilter(entry.id, scenarioFilter))) {
        for (const tier of manifest.tiers.filter((entry) => matchesFilter(entry.id, tierFilter))) {
            for (let repeat = 1; repeat <= repeats; repeat += 1) {
                const params = new URLSearchParams({
                    ...commonParams,
                    ...scenario.params,
                    rendererQuality: tier.id,
                    cloudUpdateRate: String(tier.updateRate),
                });
                jobs.push({
                    id: `${scenario.id}--${tier.id}--r${repeat}`,
                    scenarioId: scenario.id,
                    scenarioLabel: scenario.label,
                    tier: tier.id,
                    repeat,
                    viewport: scenario.viewport,
                    timingSamples,
                    timeoutMs: Math.max(30_000, timingSamples * 6_000),
                    limits: { ...manifest.globalLimits, ...tier.limits },
                    url: `${baseUrl.replace(/\/$/, "")}/sky-lab?${params}`,
                });
            }
        }
    }
    if (jobs.length === 0) throw new Error("Cloud qualification filters selected no jobs");
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        baseUrl,
        repeats,
        timingSamples,
        jobs,
    };
};

const evaluateRecord = (record, expected) => {
    const failures = [];
    const stats = record?.stats;
    if (!stats) return ["missing renderer statistics"];
    if (stats.backend !== "webgpu") failures.push(`backend was ${stats.backend ?? "missing"}`);
    if (stats.lastError) failures.push(`renderer error: ${stats.lastError}`);
    if (!stats.coldCloudWarmupComplete) failures.push("cold lighting warm-up did not complete");
    if (!finite(stats.coldCloudWarmupMs)) failures.push("cold lighting GPU timing missing");
    else if (stats.coldCloudWarmupMs > expected.limits.coldWarmupGpuMs) {
        failures.push(`cold lighting ${format(stats.coldCloudWarmupMs)} ms > ${expected.limits.coldWarmupGpuMs} ms`);
    }
    if (!finite(stats.coldCloudWarmupQueueMs)) failures.push("cold queue timing missing");
    else if (stats.coldCloudWarmupQueueMs > expected.limits.coldWarmupQueueMs) {
        failures.push(`cold queue ${format(stats.coldCloudWarmupQueueMs)} ms > ${expected.limits.coldWarmupQueueMs} ms`);
    }
    if (!finite(stats.firstCloudUpdateMs)) failures.push("first transport timing missing");
    else if (stats.firstCloudUpdateMs > expected.limits.firstTransportMs) {
        failures.push(`first transport ${format(stats.firstCloudUpdateMs)} ms > ${expected.limits.firstTransportMs} ms`);
    }
    if ((stats.cloudTimingSamples ?? 0) < expected.timingSamples) {
        failures.push(`${stats.cloudTimingSamples ?? 0}/${expected.timingSamples} warmed timing samples`);
    }
    if (!finite(stats.cloudUpdateP95Ms)) failures.push("warmed p95 timing missing");
    else if (stats.cloudUpdateP95Ms > expected.limits.p95Ms) {
        failures.push(`p95 ${format(stats.cloudUpdateP95Ms)} ms > ${expected.limits.p95Ms} ms`);
    }
    if (!finite(stats.cloudUpdateMaxMs)) failures.push("warmed maximum timing missing");
    else if (stats.cloudUpdateMaxMs > expected.limits.maxMs) {
        failures.push(`maximum ${format(stats.cloudUpdateMaxMs)} ms > ${expected.limits.maxMs} ms`);
    }
    if ((stats.cloudUnsafeSampleCount ?? 0) > expected.limits.unsafeSampleCount) {
        failures.push(`${stats.cloudUnsafeSampleCount} transport samples exceeded ${expected.limits.unsafeTransportMs} ms`);
    }
    if (!finite(stats.cadenceScale) || stats.cadenceScale < expected.limits.minimumCadenceScale) {
        failures.push(`cadence scale ${format(stats.cadenceScale, 3)} < ${expected.limits.minimumCadenceScale}`);
    }
    if (stats.budgetStatus === "unsafe" || stats.budgetStatus === "fallback") {
        failures.push(`budget status was ${stats.budgetStatus}`);
    }
    return failures;
};

const adapterLabel = (record) => {
    const info = record?.stats?.adapterInfo ?? {};
    const label = [info.vendor, info.architecture, info.device, info.description]
        .filter(Boolean)
        .join(" / ");
    return label || "privacy-reduced adapter identity";
};

const report = async (rawPath, markdownPath, planPath) => {
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    const raw = await readFile(rawPath, "utf8");
    const records = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const expectedById = new Map(plan.jobs.map((job) => [job.id, job]));
    const recordsById = new Map(records.map((record) => [record.jobId, record]));
    const evaluations = plan.jobs.map((expected) => {
        const record = recordsById.get(expected.id);
        return {
            expected,
            record,
            failures: record ? evaluateRecord(record, expected) : ["missing result"],
        };
    });
    const unexpected = records.filter((record) => !expectedById.has(record.jobId));
    const passed = evaluations.filter((entry) => entry.failures.length === 0).length;
    const failed = evaluations.length - passed;
    const adapter = records.length > 0 ? adapterLabel(records[0]) : "unavailable";
    const userAgents = [...new Set(records.map((record) => record.userAgent).filter(Boolean))];

    const groups = new Map();
    for (const evaluation of evaluations) {
        const key = `${evaluation.expected.scenarioId}::${evaluation.expected.tier}`;
        const group = groups.get(key) ?? [];
        group.push(evaluation);
        groups.set(key, group);
    }

    const lines = [
        "# Cloud qualification report",
        "",
        `Generated: ${new Date().toISOString()}`,
        `Adapter: ${adapter}`,
        `Browser: ${userAgents.join("; ") || "unavailable"}`,
        `Result: ${failed === 0 ? "PASS" : "FAIL"} (${passed}/${evaluations.length} reloads passed)`,
        "",
        "| Scenario | Tier | Reloads | Cold GPU p95 | Cold queue p95 | First transport p95 | Warm p50 | Warm p95 | Warm max | Min cadence | Result |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ];

    for (const entries of groups.values()) {
        const successfulRecords = entries.map((entry) => entry.record).filter(Boolean);
        const values = (key) => successfulRecords.map((record) => record.stats?.[key]).filter(Number.isFinite);
        const allSamples = successfulRecords.flatMap((record) => [record.stats?.cloudUpdateMaxMs]).filter(Number.isFinite);
        const minCadence = Math.min(...successfulRecords.map((record) => record.stats?.cadenceScale).filter(Number.isFinite));
        const failures = entries.flatMap((entry) => entry.failures);
        lines.push([
            entries[0].expected.scenarioLabel,
            entries[0].expected.tier,
            String(entries.length),
            `${format(quantile(values("coldCloudWarmupMs"), 0.95))} ms`,
            `${format(quantile(values("coldCloudWarmupQueueMs"), 0.95))} ms`,
            `${format(quantile(values("firstCloudUpdateMs"), 0.95))} ms`,
            `${format(quantile(values("cloudUpdateP50Ms"), 0.5))} ms`,
            `${format(quantile(values("cloudUpdateP95Ms"), 0.95))} ms`,
            `${format(allSamples.length ? Math.max(...allSamples) : null)} ms`,
            Number.isFinite(minCadence) ? `${(minCadence * 100).toFixed(0)}%` : "—",
            failures.length === 0 ? "PASS" : "FAIL",
        ].map((value) => ` ${value} `).join("|").replace(/^/, "|").replace(/$/, "|"));
    }

    if (failed > 0 || unexpected.length > 0) {
        lines.push("", "## Failures", "");
        for (const entry of evaluations.filter((item) => item.failures.length > 0)) {
            lines.push(`- ${entry.expected.id}: ${entry.failures.join("; ")}`);
        }
        for (const record of unexpected) lines.push(`- unexpected result: ${record.jobId}`);
    }

    lines.push(
        "",
        "## Interpretation",
        "",
        "A passing reload proves only the bounded cold-start and short warmed timing gate for the recorded adapter, browser, viewport, scene, and tier. It does not replace five-minute or extended thermal soaks, visual review, device-loss testing, or qualification on another device class.",
        "",
    );

    await writeFile(markdownPath, lines.join("\n"));
    const jsonPath = markdownPath.replace(/\.md$/i, ".json");
    await writeFile(jsonPath, JSON.stringify({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        adapter,
        userAgents,
        passed,
        failed,
        total: evaluations.length,
        evaluations: evaluations.map(({ expected, record, failures }) => ({
            jobId: expected.id,
            scenarioId: expected.scenarioId,
            tier: expected.tier,
            viewport: expected.viewport,
            limits: expected.limits,
            stats: record?.stats ?? null,
            failures,
        })),
    }, null, 2));
    process.stdout.write(`${failed === 0 ? "PASS" : "FAIL"}: ${passed}/${evaluations.length} reloads; ${markdownPath}\n`);
    if (failed > 0 && process.env.CLOUD_QUALIFICATION_ALLOW_FAILURES !== "1") process.exitCode = 2;
};

const command = process.argv[2];
if (command === "plan") {
    const baseUrl = process.argv[3] || "http://127.0.0.1:3000";
    process.stdout.write(`${JSON.stringify(await buildPlan(baseUrl), null, 2)}\n`);
} else if (command === "report") {
    const [rawPath, markdownPath, planPath] = process.argv.slice(3);
    if (!rawPath || !markdownPath || !planPath) {
        throw new Error("Usage: cloud-qualification.mjs report <raw.ndjson> <report.md> <plan.json>");
    }
    await report(rawPath, markdownPath, planPath);
} else {
    throw new Error("Usage: cloud-qualification.mjs <plan|report> ...");
}

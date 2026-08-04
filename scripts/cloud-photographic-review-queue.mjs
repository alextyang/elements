#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const manifestPath = join(repositoryRoot, "data", "cloud-photographic-qualification.json");
const strictHarnessPath = join(scriptDirectory, "review-cloud-render.sh");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const usage = () => {
    process.stdout.write(`Usage:
  node scripts/cloud-photographic-review-queue.mjs plan [--profile next|core]
  node scripts/cloud-photographic-review-queue.mjs run [--profile next|core] [--from-stage N] [--output PATH]

"plan" is the safe default and performs no browser, renderer, image, or file work.
"run" executes one capture at a time through review-cloud-render.sh. A failed
strict-readiness gate stops the queue immediately and no later image is taken.
`);
};

const parseArguments = (values) => {
    const result = {
        command: "plan",
        profile: "next",
        fromStage: 0,
        output: undefined,
    };
    let index = 0;
    if (values[0] && !values[0].startsWith("--")) {
        result.command = values[0];
        index = 1;
    }
    while (index < values.length) {
        const argument = values[index];
        const [name, inlineValue] = argument.split("=", 2);
        if (name === "--help" || name === "-h") {
            result.command = "help";
            index += 1;
            continue;
        }
        if (!["--profile", "--from-stage", "--output"].includes(name)) {
            throw new Error(`Unknown argument: ${argument}`);
        }
        const value = inlineValue ?? values[index + 1];
        if (!value || (!inlineValue && value.startsWith("--"))) {
            throw new Error(`${name} requires a value.`);
        }
        if (name === "--profile") result.profile = value;
        if (name === "--from-stage") result.fromStage = Number(value);
        if (name === "--output") result.output = value;
        index += inlineValue ? 1 : 2;
    }
    if (!["plan", "run", "help"].includes(result.command)) {
        throw new Error(`Unknown command: ${result.command}`);
    }
    if (!["next", "core"].includes(result.profile)) {
        throw new Error(`Unknown profile: ${result.profile}`);
    }
    if (!Number.isInteger(result.fromStage) || result.fromStage < 0) {
        throw new Error("--from-stage must be a non-negative integer.");
    }
    return result;
};

const queueForProfile = (profile) => profile === "next"
    ? manifest.nextReviewQueue.map((entry) => ({ ...entry }))
    : manifest.coreCases.map((entry, stage) => ({
        stage,
        caseId: entry.caseId,
        debugView: "final",
        purpose: `Compact WMO core case ${entry.id}: ${entry.genus} ${entry.species}; ` +
            `${entry.perspective}, ${entry.coverage}, ${entry.lighting}, ${entry.lifecycle}.`,
        invariantIds: entry.invariantIds,
        expectedOccupiedSkyFraction: entry.expectedOccupiedSkyFraction,
    }));

const validateQueue = (queue) => {
    const knownInvariants = new Set(manifest.invariants.map(({ id }) => id));
    for (const [index, entry] of queue.entries()) {
        if (entry.stage !== index) {
            throw new Error(`Queue stage ${entry.stage} is not contiguous at index ${index}.`);
        }
        if (!entry.caseId || !["final", "transmittance"].includes(entry.debugView)) {
            throw new Error(`Queue stage ${index} has an invalid case or debug view.`);
        }
        for (const invariantId of entry.invariantIds) {
            if (!knownInvariants.has(invariantId)) {
                throw new Error(`Queue stage ${index} references unknown invariant ${invariantId}.`);
            }
        }
    }
};

const timestamp = () => new Date().toISOString().replaceAll(":", "-").replace(".", "-");

const main = () => {
    const options = parseArguments(process.argv.slice(2));
    if (options.command === "help") {
        usage();
        return;
    }
    const fullQueue = queueForProfile(options.profile);
    validateQueue(fullQueue);
    const queue = fullQueue.filter(({ stage }) => stage >= options.fromStage);
    const plan = {
        schemaVersion: manifest.schemaVersion,
        profile: options.profile,
        strictReadiness: manifest.strictReadiness,
        totalProfileCaptures: fullQueue.length,
        firstStage: options.fromStage,
        captures: queue,
    };
    if (options.command === "plan") {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return;
    }

    const outputDirectory = resolve(options.output ?? join(
        repositoryRoot,
        "output",
        "cloud-photographic-qualification",
        `${options.profile}-${timestamp()}`,
    ));
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(join(outputDirectory, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
    const statusPath = join(outputDirectory, "status.ndjson");

    for (const entry of queue) {
        const startedAt = new Date().toISOString();
        process.stdout.write(
            `[${entry.stage + 1}/${fullQueue.length}] ${entry.caseId} · ${entry.debugView}\n`,
        );
        const result = spawnSync(
            "bash",
            [strictHarnessPath, entry.caseId, entry.debugView],
            {
                cwd: repositoryRoot,
                env: {
                    ...process.env,
                    CLOUD_REVIEW_OUTPUT: outputDirectory,
                    CLOUD_REVIEW_TRANSPORT_UPDATES: String(
                        manifest.strictReadiness.minimumTransportUpdates,
                    ),
                },
                encoding: "utf8",
                stdio: ["inherit", "pipe", "pipe"],
            },
        );
        if (result.stdout) process.stdout.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
        const record = {
            stage: entry.stage,
            caseId: entry.caseId,
            debugView: entry.debugView,
            startedAt,
            finishedAt: new Date().toISOString(),
            status: result.status === 0 ? "verified" : "rejected",
            exitCode: result.status,
            signal: result.signal,
            invariantIds: entry.invariantIds,
        };
        appendFileSync(statusPath, `${JSON.stringify(record)}\n`);
        if (result.error) throw result.error;
        if (result.status !== 0) {
            throw new Error(
                `Strict readiness rejected stage ${entry.stage}; later captures were not attempted.`,
            );
        }
    }
    process.stdout.write(`Verified serial review queue: ${outputDirectory}\n`);
};

try {
    main();
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
}

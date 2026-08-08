import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-evidence-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
for (const name of [
    "cloud-qualification-evidence",
    "cloud-performance-qualification",
]) {
    const output = ts.transpileModule(
        readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8"),
        { compilerOptions: { target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022 } },
    ).outputText;
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}
const evidence = await import(
    new URL(`file://${join(temporaryRoot, "cloud-qualification-evidence.mjs")}`)
);
const performance = await import(
    new URL(`file://${join(temporaryRoot, "cloud-performance-qualification.mjs")}`)
);

const digest = "a".repeat(64);
const artifact = (id, kind = "canonical-render") => ({
    id, kind, uri: `artifact://${id}`, sha256: digest, mediaType: "image/png",
});

test("qualification plans require independent seeds, cameras, lighting, and sequences", () => {
    const plan = evidence.buildIndependentCloudQualificationPlan(["base:cumulus:congestus"]);
    assert.equal(plan.length, 3 * 3 * 4);
    assert.equal(new Set(plan.map(({ seed }) => seed)).size, 3);
    assert.equal(new Set(plan.map(({ cameraId }) => cameraId)).size, 3);
    assert.equal(new Set(plan.map(({ lighting }) => lighting)).size, 4);
    assert.ok(plan.every(({ captureKinds }) =>
        captureKinds.includes("still") &&
        captureKinds.includes("camera-motion") &&
        captureKinds.includes("lifecycle")));
});

test("blind review produces explicit genus/species confusion and threshold metrics", () => {
    const reviews = Array.from({ length: 20 }, (_, index) => ({
        id: `review-${index}`,
        evidenceId: `still-${index}`,
        reviewerId: `reviewer-${index % 4}`,
        expectedGenus: "cumulus",
        expectedSpecies: "congestus",
        selectedGenus: index < 19 ? "cumulus" : "cumulonimbus",
        rankedSpecies: index < 16
            ? ["congestus", "mediocris"]
            : ["mediocris", "congestus"],
        selectedFeatures: [],
        confidence01: 0.8,
    }));
    const metrics = evidence.computeCloudRecognitionMetrics(reviews);
    assert.equal(metrics.genusTop1Accuracy, 0.95);
    assert.equal(metrics.speciesTop1Accuracy, 0.8);
    assert.equal(metrics.speciesTop2Accuracy, 1);
    assert.equal(metrics.genusConfusion.cumulus.cumulus, 19);
});

test("photographic gate enforces still, temporal, recognition, and expert evidence together", () => {
    const cameras = ["horizon-wide", "oblique-natural", "zenith-wide"];
    const lights = ["side", "back", "twilight", "moon"];
    const seeds = [1, 2, 3];
    const stills = seeds.flatMap((seed) => cameras.flatMap((cameraId) =>
        lights.map((lighting, index) => ({
            schemaVersion: 1,
            id: `still-${seed}-${cameraId}-${lighting}`,
            routeId: "base:cumulus:congestus",
            rendererRevision: "abc123",
            seed,
            cameraId,
            cameraSignature: `${cameraId}:v1`,
            lighting,
            referenceId: "wmo-cu-congestus",
            referenceLicense: "WMO photographic reference",
            referenceSource: "https://cloudatlas.wmo.int/",
            strictReady: true,
            artifact: artifact(`still-${seed}-${cameraId}-${lighting}`),
            invariantObservations: [{
                invariantId: "connected-parent-topology",
                passed: true,
                severity: "critical",
            }],
            expertRating: 4,
        }))));
    const reviews = stills.map((still, index) => ({
        id: `review-${index}`,
        evidenceId: still.id,
        reviewerId: `reviewer-${index % 5}`,
        expectedGenus: "cumulus",
        expectedSpecies: "congestus",
        selectedGenus: "cumulus",
        rankedSpecies: ["congestus", "mediocris"],
        selectedFeatures: [],
        confidence01: 0.92,
    }));
    const sequences = ["camera-motion", "lifecycle"].map((kind) => ({
        schemaVersion: 1,
        id: `sequence-${kind}`,
        routeId: "base:cumulus:congestus",
        rendererRevision: "abc123",
        seed: 1,
        kind,
        startSimulationStep: 1,
        endSimulationStep: 120,
        cameraIds: cameras,
        artifact: { ...artifact(`sequence-${kind}`), kind: "motion-sequence",
            mediaType: "video/mp4" },
        deterministicReplayFingerprint: digest,
        criticalBoiling: false,
        criticalGhosting: false,
        criticalFeatureDetachment: false,
        criticalCameraDependence: false,
        invariantObservations: [{
            invariantId: "lifecycle-structure", passed: true,
            severity: "critical",
        }],
    }));
    const bundle = {
        schemaVersion: 1,
        routeId: "base:cumulus:congestus",
        rendererRevision: "abc123",
        baselines: [],
        stills,
        sequences,
        blindReviews: reviews,
    };
    const gate = evidence.evaluateCloudPhotographicGate(bundle);
    assert.equal(gate.passed, true, gate.reasons.join("\n"));
    assert.deepEqual(evidence.validateCloudQualificationEvidenceBundle(bundle), []);

    const broken = structuredClone(bundle);
    broken.sequences[0].criticalGhosting = true;
    assert.equal(evidence.evaluateCloudPhotographicGate(broken).passed, false);
});

test("baseline manifests require every diagnostic artifact and reproducibility metadata", () => {
    const requiredKinds = [
        "canonical-render", "density-debug", "owner-debug", "material-debug",
        "phase-debug", "light-volume-debug", "motion-sequence",
        "timing-telemetry", "reconstruction-telemetry",
    ];
    const baseline = {
        schemaVersion: 1,
        id: "baseline-cu",
        routeId: "base:cumulus:congestus",
        rendererRevision: "abc123",
        rendererSchemaVersions: { physicalSample: 1, cloudSystem: 2 },
        generatedAt: "2026-08-08T15:00:00.000Z",
        generationMode: "conditioned",
        sceneSeed: 123,
        simulationFingerprint: digest,
        simulationStep: 120,
        cameraSignature: "oblique-natural:v1",
        environmentId: "day-oblique-natural",
        exactCommand: "npm run cloud:baseline -- --route base:cumulus:congestus",
        artifacts: requiredKinds.map((kind) => artifact(`baseline-${kind}`, kind)),
    };
    const bundle = {
        schemaVersion: 1,
        routeId: baseline.routeId,
        rendererRevision: baseline.rendererRevision,
        baselines: [baseline],
        stills: [], sequences: [], blindReviews: [],
    };
    assert.deepEqual(evidence.validateCloudQualificationEvidenceBundle(bundle), []);
    const incomplete = structuredClone(bundle);
    incomplete.baselines[0].artifacts.pop();
    assert.ok(evidence.validateCloudQualificationEvidenceBundle(incomplete).some(
        ({ code }) => code === "missing-baseline-artifact",
    ));
});

test("device qualification fails performance shortcuts that reduce visual equivalence", () => {
    assert.equal(performance.CLOUD_STRESS_SCENARIOS.length, 10);
    const samples = Array.from({ length: 120 }, () => ({
        frameMilliseconds: 10,
        cloudTransportMilliseconds: 2,
        historyAcceptanceFraction: 0.94,
        memoryMegabytes: 320,
        cadenceFraction: 0.96,
        visualEquivalenceScore: 0.95,
    }));
    const result = {
        schemaVersion: 1,
        rendererRevision: "abc123",
        adapterFingerprint: "adapter-hash",
        deviceClass: "high-end-discrete",
        browser: "Chromium WebGPU",
        qualityTier: "balanced",
        scenarioId: "dense-multilayer",
        initializationMilliseconds: 900,
        warmedSamples: samples,
        deviceLossRecovered: null,
        durationSeconds: 300,
    };
    assert.equal(performance.evaluateCloudDeviceQualification(result).passed, true);
    const degraded = structuredClone(result);
    degraded.warmedSamples[0].visualEquivalenceScore = 0.2;
    const gate = performance.evaluateCloudDeviceQualification(degraded);
    assert.equal(gate.passed, false);
    assert.ok(gate.reasons.some((reason) => reason.includes("Visual equivalence")));
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const manifestUrl = new URL("../data/cloud-photographic-qualification.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const queueSource = readFileSync(
    new URL("./cloud-photographic-review-queue.mjs", import.meta.url),
    "utf8",
);
const harnessSource = readFileSync(
    new URL("./review-cloud-render.sh", import.meta.url),
    "utf8",
);
const matrixSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-photographic-qualification-matrix.ts", import.meta.url),
    "utf8",
);

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-photo-matrix-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const moduleNames = [
    "cloud-scene",
    "cloud-state-map",
    "high-cloud-physical-foundation",
    "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "upper-atmospheric-cloud-foundation",
    "cloud-family-admissibility",
    "cloud-special-origin-source",
    "cloud-morphology-modifiers",
    "low-layered-cloud-topology-qualification",
    "cloud-family-production-adapter",
    "cloud-atlas-material-profile",
    "cloud-system-runtime",
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
    "cloud-photograph-orthogonal-benchmark",
    "weather-qualification-matrix",
    "cloud-photographic-qualification-matrix",
];

for (const name of moduleNames) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    let output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;
    output = output.replace(
        /from "\.\.\/\.\.\/\.\.\/data\/cloud-photographic-qualification\.json"/g,
        'from "./cloud-photographic-qualification-manifest.mjs"',
    );
    output = output.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}
writeFileSync(
    join(temporaryRoot, "cloud-photographic-qualification-manifest.mjs"),
    `export default ${JSON.stringify(manifest)};\n`,
);

const matrix = await import(
    new URL(`file://${join(temporaryRoot, "cloud-photographic-qualification-matrix.mjs")}`)
);

test("the compact core spans genus, camera, cover, illumination, and lifecycle without a screenshot explosion", () => {
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_CORE_CASES.length, 20);
    assert.deepEqual(matrix.CLOUD_PHOTOGRAPHIC_QUALIFICATION_SUMMARY.coreAxisValues, {
        qualificationSets: 2,
        genera: 10,
        perspectives: 5,
        coverages: 4,
        lighting: 6,
        lifecycle: 5,
    });
    assert.ok(matrix.CLOUD_PHOTOGRAPHIC_CORE_CASES.some(
        ({ qualificationSet }) => qualificationSet === "orthogonal",
    ));
    assert.ok(matrix.CLOUD_PHOTOGRAPHIC_CORE_CASES.every(
        ({ expectedOccupiedSkyFraction: [minimum, maximum] }) =>
            minimum >= 0 && minimum < maximum && maximum <= 1,
    ));
});

test("all existing photographic and weather targets receive explicit machine-readable expectations", () => {
    assert.equal(matrix.CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT.length, 160);
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_QUALIFICATION_SUMMARY.speciesReferences, 32);
    assert.equal(matrix.CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT.length, 28);
    // Cirrus/Cirrocumulus/Cirrostratus homomutatus coverage adds two valid
    // WMO targets beyond the former 214-row matrix.
    assert.equal(matrix.CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT.length, 216);
    for (const rows of [
        matrix.CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT,
        matrix.CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT,
        matrix.CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT,
    ]) {
        assert.ok(rows.every(({ expectedCues }) => expectedCues.length > 0));
        assert.ok(rows.every(({ invariantIds }) => invariantIds.length >= 3));
    }
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_QUALIFICATION_SUMMARY.implementationGaps,
        216,
        "CPU/operator/transport readiness must remain distinct from photographic evidence");
});

test("the invariant catalog catches topology, phase, transport, atmosphere, and weather failures", () => {
    const ids = new Set(matrix.CLOUD_PHOTOGRAPHIC_INVARIANTS.map(({ id }) => id));
    for (const required of [
        "finite-world-support",
        "aperiodic-organization",
        "connected-parent-topology",
        "coherent-condensation-base",
        "phase-appropriate-boundary",
        "neutral-passive-extinction",
        "atmosphere-coupled-radiance",
        "bounded-source-scattering",
        "aerial-perspective-continuity",
        "multiple-scattering-shadow-depth",
        "lifecycle-structure",
        "hydrometeor-parent-depth-order",
        "multilayer-parallax-ordering",
        "surface-obscuration-continuity",
        "upper-atmosphere-altitude-lighting",
    ]) assert.ok(ids.has(required), required);
    assert.equal(ids.size, matrix.CLOUD_PHOTOGRAPHIC_INVARIANTS.length);
    const neutralExtinction = matrix.CLOUD_PHOTOGRAPHIC_INVARIANTS.find(
        ({ id }) => id === "neutral-passive-extinction",
    );
    assert.deepEqual(neutralExtinction.metric, {
        name: "maximumTransmittanceChroma",
        operator: "less-than-or-equal",
        value: 0.025,
    });
});

test("the manifest and dynamic audits validate cleanly against current WMO benchmark identities", () => {
    assert.deepEqual(matrix.CLOUD_PHOTOGRAPHIC_QUALIFICATION_ISSUES, []);
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_QUALIFICATION_SUMMARY.validationIssues, 0);
    assert.equal(manifest.taxonomy.provider, "WMO International Cloud Atlas");
    assert.match(manifest.taxonomy.classificationUrl, /^https:\/\/cloudatlas\.wmo\.int\//);
    assert.doesNotMatch(matrixSource, /fetch\s*\(|new\s+Image\s*\(|<img\b|screenshot\s*\(/);
});

test("the next image set is gated by Cu correctness and then requests only four discriminating finals", () => {
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.length, 6);
    assert.deepEqual(
        matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.map(({ stage }) => stage),
        [0, 1, 2, 3, 4, 5],
    );
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE[0].debugView, "transmittance");
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE[0].caseId,
        "cu-congestus--day-oblique-natural");
    assert.equal(matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE[1].debugView, "final");
    assert.equal(
        matrix.CLOUD_PHOTOGRAPHIC_NEXT_REVIEW_QUEUE.slice(2)
            .filter(({ debugView }) => debugView === "final").length,
        4,
    );
});

test("the queue is serial, plan-only by default, and delegates every capture to strict readiness", () => {
    assert.match(queueSource, /command: "plan"/);
    assert.match(queueSource, /if \(options\.command === "plan"\)[\s\S]*return;/);
    assert.match(queueSource, /for \(const entry of queue\)[\s\S]*spawnSync\(/);
    assert.doesNotMatch(queueSource, /Promise\.all|spawn\(/);
    assert.match(queueSource, /review-cloud-render\.sh/);
    assert.match(queueSource, /if \(result\.status !== 0\)[\s\S]*later captures were not attempted/);
    assert.match(harnessSource, /data-benchmark-ready/);
    assert.match(harnessSource, /if \(evidence\.ready !== 'ready'\)[\s\S]*\.screenshot\(\{/);
    assert.equal(manifest.strictReadiness.minimumTransportUpdates, 64);
    assert.equal(manifest.strictReadiness.minimumHistoryAcceptanceFraction, 0.9);
    assert.equal(manifest.strictReadiness.minimumStableHistoryAge, 0.75);
    assert.equal(manifest.strictReadiness.minimumPersistentHistoryConfidence, 0.85);
    assert.equal(manifest.strictReadiness.requireReconstructionMaturity, true);
    assert.equal(manifest.strictReadiness.allowEmptyFrame, false);
});

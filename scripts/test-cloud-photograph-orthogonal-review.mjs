import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-orthogonal-review-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const moduleNames = [
    "cloud-scene",
    "cloud-state-map",
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
    "cloud-photograph-orthogonal-benchmark",
];
for (const name of moduleNames) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    let output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;
    for (const dependency of moduleNames) {
        output = output.replaceAll(`"./${dependency}"`, `"./${dependency}.mjs"`);
    }
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const benchmark = await import(new URL(
    `file://${join(temporaryRoot, "cloud-photograph-benchmark.mjs")}`,
));
const qualification = await import(new URL(
    `file://${join(temporaryRoot, "cloud-morphology-photograph-qualification.mjs")}`,
));
const orthogonal = await import(new URL(
    `file://${join(temporaryRoot, "cloud-photograph-orthogonal-benchmark.mjs")}`,
));
const adapterSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-photograph-orthogonal-benchmark.ts", import.meta.url),
    "utf8",
);
const routeSource = readFileSync(
    new URL("../app/cloud-photographs/cloud-photograph-benchmark.tsx", import.meta.url),
    "utf8",
);

const currentId =
    "feature-mamma--tropical-storm-backlight--near-uplook--broken";

test("the selected orthogonal URL resolves to one exact preview and classification assignment", () => {
    const selected = qualification.resolveCloudMorphologyPhotographCase(currentId);
    const review = orthogonal.resolveOrthogonalCloudPhotographCase(currentId);
    assert.ok(selected);
    assert.ok(review);
    assert.equal(review.id, currentId);
    assert.deepEqual(review.morphologyCase, selected);
    assert.deepEqual(review.preview.cloudScene.classifications,
        selected.classifications);
    assert.equal(review.preview.cloudScene.layers[selected.target.assignment.layerIndex].oktas,
        selected.coverage.oktas);
    assert.equal(review.preview.latitude, selected.environment.latitude);
    assert.equal(review.preview.longitude, selected.environment.longitude);
    assert.equal(review.preview.viewElevation,
        selected.perspective.viewElevationDegrees);
    assert.equal(review.preview.horizontalFov,
        selected.perspective.horizontalFieldOfViewDegrees);
    assert.equal(review.preview.cloudPerspective, "natural");
    assert.equal(review.referenceImage, selected.reference.imageUrl);
});

test("orthogonal resolution is lazy and never loads or enumerates reference images", () => {
    assert.doesNotMatch(adapterSource, /iterateCloudMorphologyPhotographCases|flatMap|fetch\s*\(|new\s+Image/);
    assert.equal(orthogonal.resolveOrthogonalCloudPhotographCase(null), undefined);
    assert.equal(orthogonal.resolveOrthogonalCloudPhotographCase(
        benchmark.CLOUD_PHOTOGRAPH_CASES[0].id), undefined);
});

test("the review route preserves every base case and emits stable capture URLs", () => {
    assert.equal(benchmark.CLOUD_PHOTOGRAPH_CASES.length,
        benchmark.CLOUD_PHOTOGRAPH_SUMMARY.references *
        benchmark.CLOUD_PHOTOGRAPH_SUMMARY.environments);
    assert.match(routeSource,
        /const qualificationSet:[\s\S]*?orthogonalBenchmark[\s\S]*?\? "orthogonal" : "base"/);
    assert.match(routeSource,
        /orthogonalBenchmark \?\? baseBenchmark/);
    assert.match(routeSource,
        /`\/cloud-photographs\?\$\{captureParameter\}=\$\{encodeURIComponent\(caseId\)\}`/);
    assert.match(routeSource, /productionPerspective=\$\{encodeURIComponent\(productionPerspective\)\}/);
    assert.match(routeSource,
        /resolveOrthogonalCloudPhotographCase\(requested\)/);
    assert.doesNotMatch(routeSource, /iterateCloudMorphologyPhotographCases/);
});

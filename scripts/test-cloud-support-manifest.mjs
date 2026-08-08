import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const manifestUrl = new URL(
    "../data/cloud-photographic-qualification.json",
    import.meta.url,
);
const photographicManifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-support-"));
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
    "cloud-support-manifest-core",
    "cloud-support-manifest",
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
    `export default ${JSON.stringify(photographicManifest)};\n`,
);

const support = await import(
    new URL(`file://${join(temporaryRoot, "cloud-support-manifest.mjs")}`)
);
const core = await import(
    new URL(`file://${join(temporaryRoot, "cloud-support-manifest-core.mjs")}`)
);

const manifest = support.CLOUD_SUPPORT_MANIFEST;

test("the support manifest joins every canonical and complete-weather route", () => {
    assert.deepEqual(support.CLOUD_SUPPORT_MANIFEST_ISSUES, []);
    assert.equal(manifest.summary.routes, 276);
    assert.equal(manifest.summary.genera, 10);
    assert.deepEqual(manifest.summary.catalogs, {
        base: 32,
        orthogonal: 28,
        weather: 216,
    });
    assert.equal(new Set(manifest.routes.map(({ id }) => id)).size, 276);
});

test("base identities retain all five photographic environments", () => {
    const base = manifest.routes.filter(({ catalog }) => catalog === "base");
    assert.equal(base.length, 32);
    assert.ok(base.every(({ qualification }) => qualification.caseCount === 5));
    assert.ok(base.every(({ sourceStatus }) =>
        sourceStatus === "transport-attached"));
});

test("current support claims stop at transport until causal evolution exists", () => {
    assert.equal(manifest.summary.dynamicallyActive, 0);
    assert.equal(manifest.summary.supportQualified, 0);
    assert.equal(manifest.summary.releaseQualified, 0);
    assert.ok(manifest.routes.every(({ maturityLevel }) => maturityLevel <= 3));
});

test("later evidence is visible but cannot skip a missing prerequisite", () => {
    const synthetic = core.buildCloudSupportManifest({
        taxonomy: {
            provider: "test",
            classificationUrl: "https://example.test/classification",
            associatedFormsUrl: "https://example.test/forms",
        },
        generatedFrom: ["test"],
        expectedCounts: {
            base: 1,
            orthogonal: 0,
            weather: 0,
            total: 1,
            genera: 1,
        },
        routes: [{
            id: "base:test:test",
            catalog: "base",
            axis: "species",
            kind: "cloud",
            genus: "test",
            designation: "test",
            label: "Test cloud",
            sourceStatus: "photographically-qualified",
            source: "https://example.test/source",
            qualification: {
                caseCount: 1,
                environments: ["day"],
                perspectives: ["oblique"],
                invariantIds: ["formation", "transport", "lighting"],
                cues: ["recognizable morphology"],
            },
        }],
    });
    const [route] = synthetic.routes;
    assert.equal(route.evidence.strictReady, true);
    assert.equal(route.evidence.photographQualified, true);
    assert.equal(route.maturityId, "transport-active");
    assert.deepEqual(route.blockedEvidence, [
        "strictReady",
        "photographQualified",
    ]);
    assert.equal(route.supportQualified, false);
    assert.deepEqual(core.validateCloudSupportManifest(synthetic), []);
});

test("the manifest endpoint remains read-only", () => {
    const apiSource = readFileSync(new URL(
        "../app/api/cloud-support/manifest/route.ts",
        import.meta.url,
    ), "utf8");
    assert.match(apiSource, /export function GET\(\)/);
    assert.doesNotMatch(apiSource,
        /export function (POST|PUT|PATCH|DELETE)|writeFile|unlink|rmSync/);
});

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
    transpileCloudPreviewModuleClosure,
} from "./lib/cloud-preview-scenarios.mjs";

const repositoryRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const sourceRoot = join(repositoryRoot, "components/backgrounds/sky");
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-composition-"));
const moduleNames = [
    "cloud-system-runtime",
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
    "cloud-photograph-orthogonal-benchmark",
];

transpileCloudPreviewModuleClosure({
    sourceRoot,
    temporaryRoot,
    rootModuleNames: moduleNames,
});

const runtimeModule = await import(pathToFileURL(
    join(temporaryRoot, "cloud-system-runtime.mjs"),
).href);
const benchmarkModule = await import(pathToFileURL(
    join(temporaryRoot, "cloud-photograph-benchmark.mjs"),
).href);
const morphologyModule = await import(pathToFileURL(
    join(temporaryRoot, "cloud-morphology-photograph-qualification.mjs"),
).href);
const orthogonalModule = await import(pathToFileURL(
    join(temporaryRoot, "cloud-photograph-orthogonal-benchmark.mjs"),
).href);

test.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const naturalCase = (referenceId) => {
    const result = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(({ id }) =>
        id === `${referenceId}--day-oblique-natural`);
    assert.ok(result, `missing natural benchmark ${referenceId}`);
    return result;
};

test("production composition qualification is camera-fixed and exposes edge union", () => {
    const benchmarkCase = naturalCase("ci-fibratus");
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const projection = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        runtimeModule.CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS,
    );
    const union = {
        left: projection.ownerProjections.some(({ edgeContacts }) => edgeContacts.left),
        right: projection.ownerProjections.some(({ edgeContacts }) => edgeContacts.right),
        top: projection.ownerProjections.some(({ edgeContacts }) => edgeContacts.top),
        bottom: projection.ownerProjections.some(({ edgeContacts }) => edgeContacts.bottom),
    };
    assert.deepEqual(projection.edgeContacts, {
        ...union,
        count: Object.values(union).filter(Boolean).length,
        robustCount: projection.edgeContacts.robustCount,
    });
    assert.ok(projection.ownerProjections.every(({ edgeContacts }) =>
        edgeContacts.interiorSupportFraction >= 0 &&
        edgeContacts.interiorSupportFraction <= 1));
    assert.deepEqual(
        runtimeModule.CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS,
        {
            azimuthRadians: 0,
            elevationRadians: 27 * Math.PI / 180,
            horizontalFovRadians: 64 * Math.PI / 180,
            verticalFovRadians: 43.52 * Math.PI / 180,
        },
    );
});

test("composition semantics preserve sparse owners and gate immediate decks", () => {
    const sparse = naturalCase("ci-spissatus");
    const sparseRuntime = runtimeModule.createCloudSystemRuntime(
        sparse.preview.cloudScene,
    );
    const sparseQualification = runtimeModule.qualifyCloudFrameComposition({
        systems: sparseRuntime.systems,
        layer: sparse.preview.cloudScene.layers[2],
        layerIndex: 2,
    });
    assert.equal(sparseQualification.contract.semantic, "partial-finite-field");
    assert.deepEqual(sparseQualification.contract.expectedSupport, [0.07, 0.16]);
    assert.equal(sparseRuntime.systems.length, 1,
        "one materialized Spissatus atlas family must compile to one world owner");
    assert.equal(sparseQualification.projection.visibleOwnerCount, 1,
        "the complete Spissatus formation must remain visible as one finite owner");
    assert.ok(sparseRuntime.systems.every(({ state }) =>
        state.extent.majorRadiusKm <= 16 &&
        state.extent.minorRadiusKm <= 8),
        "Spissatus owners must remain compact finite patches");
    assert.ok(sparseQualification.projection.ownerProjections.some(
        ({ supportedFraction }) => supportedFraction >= 0.04,
    ), "the native three-patch Spissatus formation needs readable finite support");

    const overcast = naturalCase("cs-nebulosus");
    const overcastRuntime = runtimeModule.createCloudSystemRuntime(
        overcast.preview.cloudScene,
    );
    const overcastQualification = runtimeModule.qualifyCloudFrameComposition({
        systems: overcastRuntime.systems,
        layer: overcast.preview.cloudScene.layers[2],
        layerIndex: 2,
    });
    assert.equal(overcastQualification.contract.semantic, "distant-finite-sheet");

    const lowScene = {
        ...sparse.preview.cloudScene,
        layers: sparse.preview.cloudScene.layers.map((layer, index) =>
            index === 0 ? {
                ...layer,
                genus: "stratus",
                species: "stratus-nebulosus",
                coverage: 1,
                oktas: 8,
            } : { ...layer, present: false, coverage: 0, oktas: 0 }),
        totalOktas: 8,
    };
    const lowRuntime = runtimeModule.createCloudSystemRuntime(lowScene);
    const lowQualification = runtimeModule.qualifyCloudFrameComposition({
        systems: lowRuntime.systems,
        layer: lowScene.layers[0],
        layerIndex: 0,
        lowLayeredPlacement: "immediate-overcast",
    });
    assert.equal(lowQualification.contract.semantic, "immediate-overcast");
    assert.equal(lowQualification.contract.expectedSupport[0], 0.9);
    assert.equal(lowQualification.contract.minimumEdgeContacts, 0);
    assert.equal(lowQualification.contract.requireAllFrameEdges, true);

    const brokenQualification = runtimeModule.qualifyCloudFrameComposition({
        systems: lowRuntime.systems,
        layer: { ...lowScene.layers[0], coverage: 0.625, oktas: 5 },
        layerIndex: 0,
        lowLayeredPlacement: "immediate-broken-field",
    });
    assert.equal(brokenQualification.contract.semantic, "immediate-broken-field");
    assert.equal(brokenQualification.contract.expectedSupport[0], 0.625);
    assert.equal(brokenQualification.materialEvidence.source,
        "generated-atlas-profile");
    assert.ok(brokenQualification.materialSupportFraction >= 0 &&
        brokenQualification.materialSupportFraction <=
            brokenQualification.projection.supportFraction,
        "broken-field material support must come from bounded atlas occupancy");
    const atlasEvidenceQualification = runtimeModule.qualifyCloudFrameComposition({
        systems: lowRuntime.systems,
        layer: { ...lowScene.layers[0], coverage: 0.625, oktas: 5 },
        layerIndex: 0,
        lowLayeredPlacement: "immediate-broken-field",
        materialEvidence: {
            supportFraction: 0.64,
            ownerFractions: [0.64],
            occupiedSamples: 64,
            sampledRays: 100,
            source: "atlas-production-projection",
        },
    });
    assert.equal(atlasEvidenceQualification.materialSupportFraction, 0.64);
    assert.equal(atlasEvidenceQualification.materialEvidence.source,
        "atlas-production-projection");
});

test("three-okta Cumulus humilis uses a sparse-body evidence floor", () => {
    const benchmark = naturalCase("cu-humilis");
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmark.preview.cloudScene,
    );
    const qualification = runtimeModule.qualifyCloudFrameComposition({
        systems: runtime.systems,
        layer: benchmark.preview.cloudScene.layers[0],
        layerIndex: 0,
    });
    assert.equal(qualification.contract.semantic, "partial-finite-field");
    assert.equal(qualification.contract.expectedSupport[0], 0.04);
    assert.equal(qualification.contract.minimumVisibleOwners, 3);
    assert.ok(qualification.projection.visibleOwnerCount >= 3);
    const visibleOwners = qualification.projection.ownerProjections.map(
        ({ ownerIndex }) => runtime.systems[ownerIndex],
    );
    assert.ok(visibleOwners.every(({ state }) =>
        state.physical.geometricDepthKm > 0.3 &&
        state.extent.minorRadiusKm <= state.extent.majorRadiusKm),
        "humilis support must come from finite tower/body owners");
    assert.ok(new Set(visibleOwners.map(({ state }) =>
        state.extent.majorRadiusKm.toFixed(2))).size >= 2,
        "humilis support must retain unequal physical tower bodies");
    assert.ok(qualification.valid,
        `sparse humilis composition failed: ${qualification.violations}`);
});

test("runtime publishes one read-only composition qualification per active layer", () => {
    const benchmarkCase = naturalCase("ci-fibratus");
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    assert.ok(Array.isArray(runtime.compositionQualifications));
    assert.equal(runtime.compositionQualifications.length, 1);
    const qualification = runtime.compositionQualifications[0];
    assert.equal(qualification.layerIndex, 2);
    assert.equal(typeof qualification.valid, "boolean");
    assert.ok(Number.isFinite(qualification.projection.supportFraction));
    assert.equal(qualification.population.ownerCount, runtime.systems.length);
    assert.ok(Number.isFinite(qualification.population.radialCoefficientOfVariation));
});

test("canonical 60-case composition audit is finite and category-complete", () => {
    const baseCases = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.filter(({ id }) =>
        id.endsWith("--day-oblique-natural"));
    const orthogonalCases = morphologyModule.CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS
        .map(({ id }) => {
            const morphologyCase = morphologyModule
                .iterateCloudMorphologyPhotographCases({
                    targetIds: [id],
                    smokeOnly: true,
                }).next().value;
            return orthogonalModule.resolveOrthogonalCloudPhotographCase(
                morphologyCase.id,
            );
        });
    const cases = [...baseCases, ...orthogonalCases];
    assert.equal(baseCases.length, 32);
    assert.equal(orthogonalCases.length, 28);
    assert.equal(cases.length, 60);
    const records = cases.map((entry) => {
        const runtime = runtimeModule.createCloudSystemRuntime(
            entry.preview.cloudScene,
        );
        const layerIndex = entry.morphologyCase?.target.assignment.layerIndex ??
            runtime.systems[0]?.layerIndex ?? 0;
        const qualification = runtimeModule.qualifyCloudFrameComposition({
            systems: runtime.systems.filter((system) =>
                system.layerIndex === layerIndex),
            layer: entry.preview.cloudScene.layers[layerIndex],
            layerIndex,
            classification: entry.classification,
        });
        assert.equal(runtime.diagnostics.length, 0, entry.id);
        assert.ok(Number.isFinite(qualification.projection.supportFraction));
        assert.ok(qualification.projection.edgeContacts.count >= 0 &&
            qualification.projection.edgeContacts.count <= 4);
        assert.ok(qualification.population.radialBandCount >= 0);
        return qualification;
    });
    assert.equal(records.length, 60);
    assert.ok(records.every(({ valid, violations }) => valid &&
        violations.length === 0),
    "every canonical finite owner population must satisfy its authored frame contract");
});

test("high-cloud completion keeps near packet support inside descriptor envelopes", () => {
    const bounds = {
        "ci-spissatus": { span: [3, 36], nearOwners: 1, support: [0.07, 0.16] },
        "ci-castellanus": { span: [1.2, 12], nearOwners: 4, support: [0.058, 0.08] },
        "ci-floccus": { span: [1, 14], nearOwners: 2, support: [0.04, 0.10] },
        "cc-castellanus": { span: [0.8, 10], nearOwners: 4, support: [0.045, 0.075] },
        "cc-floccus": { span: [0.8, 12], nearOwners: 4, support: [0.025, 0.065] },
    };
    for (const [referenceId, contract] of Object.entries(bounds)) {
        const benchmarkCase = naturalCase(referenceId);
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        const layer = benchmarkCase.preview.cloudScene.layers[2];
        const qualification = runtimeModule.qualifyCloudFrameComposition({
            systems: runtime.systems,
            layer,
            layerIndex: 2,
        });
        const nearOwners = runtime.systems.filter((system) =>
            Math.hypot(
                system.state.extent.centerEastKm,
                system.state.extent.centerNorthKm,
            ) < 60);
        assert.ok(nearOwners.length >= contract.nearOwners,
            `${referenceId} lost its finite near/middle packet`);
        assert.ok(runtime.systems.every((system) => {
            const span = system.familyProduction?.formationSpanKm ??
                system.state.extent.majorRadiusKm * 2;
            return span >= contract.span[0] - 1e-6 &&
                span <= contract.span[1] + 1e-6;
        }), `${referenceId} escaped its authored formation span`);
        assert.ok(qualification.projection.supportFraction >= contract.support[0] &&
            qualification.projection.supportFraction <= contract.support[1],
            `${referenceId} owner-envelope support escaped its contract: ` +
            `${qualification.projection.supportFraction}`);
    }
});

test("non-organized radial shells are surfaced as population residuals", () => {
    const benchmarkCase = naturalCase("ci-spissatus");
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const sourceSystem = runtime.systems[0];
    assert.ok(sourceSystem, "radial-shell fixture needs one finite source owner");
    // Spissatus now correctly compiles its complete three-patch atlas family
    // as one owner. Build an explicitly synthetic multi-owner shell here so
    // this population-residual test remains about its actual subject instead
    // of relying on a production species to contain clone owners.
    const shellSystems = Array.from({ length: 5 }, (_, index) => ({
        ...sourceSystem,
        systemIndex: index,
        state: {
            ...sourceSystem.state,
            extent: {
                ...sourceSystem.state.extent,
                centerEastKm: 95 + index * 0.5,
                centerNorthKm: 0,
            },
        },
    }));
    const qualification = runtimeModule.qualifyCloudFrameComposition({
        systems: shellSystems,
        layer: benchmarkCase.preview.cloudScene.layers[2],
        layerIndex: 2,
    });
    assert.ok(qualification.population.maximumRadialClusterFraction >= 0.75);
    assert.ok(qualification.violations.includes(
        "world-population-radial-shell-concentration",
    ));
});

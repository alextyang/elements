import assert from "node:assert/strict";
import test from "node:test";
import { runSpissatusDiagnostic } from "./diagnose-ci-spissatus-stochastic-field.mjs";

test("spissatus stochastic diagnostic emits a bounded structured contract", async () => {
    const diagnostic = await runSpissatusDiagnostic({ resolutions: [16, 24] });
    assert.equal(
        diagnostic.schema,
        "elements-ci-spissatus-stochastic-field-diagnostic",
    );
    assert.equal(diagnostic.version, 1);
    assert.deepEqual(diagnostic.bounded.resolutions, [16, 24]);
    assert.equal(diagnostic.bounded.atlasGenerationCalled, false);
    assert.equal(diagnostic.bounded.assetsWritten, false);
    assert.equal(diagnostic.bounded.rendererInvoked, false);
    assert.equal(diagnostic.source.volumeId, "ci-spissatus");
    assert.equal(diagnostic.source.primitiveKind, "spissatus-stochastic-field");
    assert.equal(diagnostic.source.seed, diagnostic.source.seedFromManifest);
    assert.match(diagnostic.source.builderAccess.caveat, /private/i);

    assert.equal(diagnostic.samples.length, 2);
    for (const sample of diagnostic.samples) {
        assert.ok(Number.isFinite(sample.latent.mean));
        assert.ok(Number.isFinite(sample.latent.coefficientOfVariation));
        assert.ok(Number.isFinite(sample.positiveIwc.skew));
        assert.ok(Number.isFinite(sample.support.occupiedFraction));
        assert.ok(sample.components.sixNeighbor.count >= 1);
        assert.equal(sample.projectedComponentPersistence.views.length, 3);
        assert.equal(sample.deepLineIntegrals.length, 3);
        assert.ok(Number.isFinite(sample.psdAliasProxy.aliasRiskScore));
        assert.ok(Number.isFinite(sample.boundary.rawEllipsoidPrior.fieldPearsonCorrelation));
    }

    assert.equal(diagnostic.convergence.baselineResolution, 24);
    assert.equal(diagnostic.convergence.retention.length, 2);
    assert.ok(diagnostic.convergence.retention[0].massRetentionVsHighestResolution > 0);
    assert.equal(
        diagnostic.convergence.retention[1].massRetentionVsHighestResolution,
        1,
    );
    assert.equal(diagnostic.ablation.available, false);
    assert.match(diagnostic.ablation.reason, /ablation hook/i);
    assert.equal(diagnostic.productionSourceAtlas.available, true);
    assert.equal(diagnostic.productionSourceAtlas.sourceResolution, 96);

    // Contract must be JSON-safe for CI capture and comparison.
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(diagnostic)));
});


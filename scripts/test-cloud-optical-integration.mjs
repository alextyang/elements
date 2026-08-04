import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-optical-integration-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const source = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-optical-integration.ts",
    import.meta.url,
), "utf8");
const modulePath = join(temporaryRoot, "cloud-optical-integration.mjs");
writeFileSync(modulePath, ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText);
const integration = await import(new URL(`file://${modulePath}`));

const midpointReference = (start, end, sampleCount, evaluator) => {
    const step = (end - start) / sampleCount;
    let opticalDepth = 0;
    for (let index = 0; index < sampleCount; index += 1) {
        opticalDepth += evaluator(start + (index + 0.5) * step) * step;
    }
    return opticalDepth;
};

test("dense Cu steps are bounded by optical depth rather than geometry", () => {
    const contract = integration.CLOUD_OPTICAL_INTEGRATION_CONTRACT;
    assert.equal(contract.maximumSegmentOpticalDepth, 0.2);
    assert.ok(contract.earlyOutOpticalDepth >= 12);
    assert.ok(contract.earlyOutOpticalDepth <= 16);
    assert.deepEqual([...contract.canonicalCumulusExtinctionKmInverse], [16, 20]);

    assert.equal(integration.cloudOpticalStepLengthKm(16, 9), 0.0125);
    assert.equal(integration.cloudOpticalStepLengthKm(20, 9), 0.01);
    assert.equal(integration.cloudOpticalStepLengthKm(1, 9), 0.1,
        "the morphology cap remains active in optically tenuous cells");
    assert.equal(integration.cloudOpticalStepLengthKm(0, 2.5), 2.5,
        "certified empty majorant cells are skipped in one operation");
});

test("majorant traversal skips empty space, enforces tau <= 0.2, and early-outs", () => {
    let densityLookups = 0;
    const result = integration.integrateCloudOpticalDepth({
        segments: [
            { startKm: 0, endKm: 2, extinctionMajorantKmInverse: 0 },
            { startKm: 2, endKm: 3, extinctionMajorantKmInverse: 20 },
            { startKm: 3, endKm: 9, extinctionMajorantKmInverse: 0 },
        ],
        extinctionAtKm: () => {
            densityLookups += 1;
            return 20;
        },
    });
    assert.equal(result.terminatedEarly, true);
    assert.ok(result.opticalDepth >= 14 && result.opticalDepth <= 14.2 + 1e-12);
    assert.ok(result.transmittance <= Math.exp(-14));
    assert.ok(result.maximumPotentialSegmentOpticalDepth <= 0.2 + 1e-12);
    assert.equal(result.skippedDistanceKm, 2);
    assert.equal(result.sampleCount, densityLookups);
    assert.ok(result.sampleCount >= 70 && result.sampleCount <= 71);
    assert.ok(result.terminationDistanceKm >= 2.7);
    assert.ok(result.terminationDistanceKm <= 2.71);
});

test("homogeneous slabs converge to analytic Beer-Lambert transmittance", () => {
    for (const extinction of [16, 18, 20]) {
        for (const targetOpticalDepth of [0.1, 1, 3, 10]) {
            const lengthKm = targetOpticalDepth / extinction;
            const segment = [{
                startKm: 0,
                endKm: lengthKm,
                extinctionMajorantKmInverse: extinction,
            }];
            const coarse = integration.integrateCloudOpticalDepth({
                segments: segment,
                extinctionAtKm: () => extinction,
                maximumSegmentOpticalDepth: 0.2,
            });
            const refined = integration.integrateCloudOpticalDepth({
                segments: segment,
                extinctionAtKm: () => extinction,
                maximumSegmentOpticalDepth: 0.1,
            });
            const expected = Math.exp(-targetOpticalDepth);
            assert.ok(Math.abs(coarse.transmittance / expected - 1) < 1e-12);
            assert.ok(Math.abs(refined.transmittance / expected - 1) < 1e-12);
            assert.ok(coarse.maximumPotentialSegmentOpticalDepth <= 0.2 + 1e-12);
            assert.ok(refined.maximumPotentialSegmentOpticalDepth <= 0.1 + 1e-12);
            assert.ok(refined.sampleCount >= coarse.sampleCount);
        }
    }
});

test("structured boundary integration refines below two percent error", () => {
    const start = 0;
    const end = 0.8;
    const extinction = (distanceKm) => 18 * (
        0.015 + 0.385 * Math.exp(-0.5 * ((distanceKm - 0.43) / 0.14) ** 2)
    );
    const exactOpticalDepth = midpointReference(start, end, 1_000_000, extinction);
    const segment = [{
        startKm: start,
        endKm: end,
        extinctionMajorantKmInverse: 18 * 0.4,
    }];
    const coarse = integration.integrateCloudOpticalDepth({
        segments: segment,
        extinctionAtKm: extinction,
        maximumSegmentOpticalDepth: 0.2,
    });
    const refined = integration.integrateCloudOpticalDepth({
        segments: segment,
        extinctionAtKm: extinction,
        maximumSegmentOpticalDepth: 0.1,
    });
    const coarseError = Math.abs(coarse.opticalDepth / exactOpticalDepth - 1);
    const refinedError = Math.abs(refined.opticalDepth / exactOpticalDepth - 1);
    assert.ok(coarseError < 0.02, `coarse optical-depth error ${coarseError}`);
    assert.ok(refinedError < 0.01, `refined optical-depth error ${refinedError}`);
    assert.ok(refinedError <= coarseError + 1e-12);
});

test("five-to-twenty metre perturbations remain continuous and converged", () => {
    const start = 0;
    const end = 0.8;
    const baseExtinction = (distanceKm, offsetKm) => 18 * (
        0.012 + 0.128 * Math.exp(
            -0.5 * ((distanceKm - 0.4 - offsetKm) / 0.17) ** 2,
        )
    );
    let previous = null;
    for (const offsetKm of [0, 0.005, 0.01, 0.02]) {
        const evaluator = (distanceKm) => baseExtinction(distanceKm, offsetKm);
        const result = integration.integrateCloudOpticalDepth({
            segments: [{
                startKm: start,
                endKm: end,
                extinctionMajorantKmInverse: 18 * 0.14,
            }],
            extinctionAtKm: evaluator,
        });
        const exactOpticalDepth = midpointReference(start, end, 500_000, evaluator);
        assert.ok(Math.abs(result.opticalDepth - exactOpticalDepth) < 0.0025);
        assert.ok(Math.abs(result.transmittance - Math.exp(-exactOpticalDepth)) < 0.001);
        if (previous) {
            assert.ok(Math.abs(result.transmittance - previous.transmittance) < 0.01,
                "a sub-pixel-scale perturbation must not create an order-one lighting jump");
        }
        previous = result;
    }
});

test("nonconservative extinction majorants fail loudly", () => {
    assert.throws(() => integration.integrateCloudOpticalDepth({
        segments: [{ startKm: 0, endKm: 1, extinctionMajorantKmInverse: 3 }],
        extinctionAtKm: () => 3.1,
    }), /exceeds conservative majorant/);
    assert.throws(() => integration.integrateCloudOpticalDepth({
        segments: [{ startKm: 1, endKm: 0, extinctionMajorantKmInverse: 3 }],
        extinctionAtKm: () => 1,
    }), /positive length/);
    assert.throws(() => integration.integrateCloudOpticalDepth({
        segments: [{ startKm: 0, endKm: 1, extinctionMajorantKmInverse: 3 }],
        extinctionAtKm: () => 1,
        earlyOutOpticalDepth: 11,
    }), /\[12, 16\]/);
});

test("phase orientation is explicit for sample-to-source directions", () => {
    assert.equal(integration.cloudScatteringCosine([0, 0, 2], [0, 0, 7]), 1,
        "looking toward the source is forward scattering");
    assert.equal(integration.cloudScatteringCosine([0, 0, 2], [0, 0, -7]), -1,
        "looking away from the source is backward scattering");
    assert.ok(Math.abs(integration.cloudScatteringCosine(
        [1, 0, 0], [0, 3, 0])) < 1e-15);
});

test("source-aligned slab Monte Carlo supplies a deterministic multi-scatter envelope", () => {
    const estimates = [0.5, 3, 10].map((opticalDepth, index) =>
        integration.estimateCloudHomogeneousSlabTransport({
            opticalDepth,
            singleScatteringAlbedo: 0.999,
            asymmetry: 0.85,
            photonCount: 30_000,
            seed: 0x13579bdf + index,
        }));
    for (let index = 0; index < estimates.length; index += 1) {
        const estimate = estimates[index];
        const total = estimate.directTransmittance + estimate.scatteredTransmittance +
            estimate.reflectance + estimate.absorption;
        assert.ok(Math.abs(total - 1) < 1e-12);
        assert.ok(estimate.maximumConservationError < 1e-12);
        assert.ok(Math.abs(estimate.directTransmittance - Math.exp(-[0.5, 3, 10][index])) <
            estimate.ninetyNinePercentHalfWidth * 1.5);
    }
    const totalTransmission = (value) =>
        value.directTransmittance + value.scatteredTransmittance;
    assert.ok(totalTransmission(estimates[0]) > totalTransmission(estimates[1]));
    assert.ok(totalTransmission(estimates[1]) > totalTransmission(estimates[2]));
    assert.ok(estimates[0].reflectance < estimates[1].reflectance);
    assert.ok(estimates[1].reflectance < estimates[2].reflectance);
    assert.ok(estimates[2].reflectance > 0.2,
        "an optically thick, nearly conservative cloud cannot collapse to black");
    assert.ok(estimates[2].multipleScatteredExitance > 0.4,
        "higher orders dominate thick-cloud exitance");

    const repeat = integration.estimateCloudHomogeneousSlabTransport({
        opticalDepth: 3,
        singleScatteringAlbedo: 0.999,
        asymmetry: 0.85,
        photonCount: 30_000,
        seed: 0x13579be0,
    });
    assert.deepEqual(repeat, estimates[1]);
});

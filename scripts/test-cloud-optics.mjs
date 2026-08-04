import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_OPTICS_ANGLE_SAMPLES,
    CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS,
    CLOUD_OPTICS_SCHEMA,
    CLOUD_OPTICS_VERSION,
    generateCloudOptics,
    halfToFloat,
    mieSphere,
} from "./lib/cloud-optics.mjs";
import {
    CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR,
    CLOUD_CAMERA_HIGH_ICE_GL2_NODE,
    CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT,
    CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS,
    CLOUD_FALLBACK_DIFFUSE_FAR_SEGMENT_COUNT,
    CLOUD_FALLBACK_DIFFUSE_MAX_HEMISPHERE_RAYS,
    CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
    CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES,
    CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS,
    CLOUD_CAMERA_DIRECT_OWNER_EVALUATION_CEILING,
    CLOUD_CAMERA_DIRECT_SOURCE_QUERY_CEILING,
    CLOUD_CAMERA_LOCAL_DIFFUSE_OWNER_EVALUATION_CEILING,
    CLOUD_CAMERA_LOCAL_DIFFUSE_TEXTURE_FETCH_CEILING,
    CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT,
    CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE,
    CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY,
    CLOUD_THIN_ICE_SPARSE_TAU_SCALE,
    cloudP1DiffusionValidity,
    cloudTransportOpticalDepth,
    cloudHemisphericDiffuseTransmittanceRgb,
    cloudUnresolvedFootprintPorosity,
    cloudUnresolvedFootprintOpticalDepth,
    cloudFallbackDiffuseProbeBudget,
    cloudOpticsPhaseTextureCoordinate,
    evaluateCloudDirectionalSkyPhaseBandCache,
    evaluateCloudFallbackDiffuseSourcePartition,
    evaluateCloudFallbackDiffuseHemisphereOpticalDepth,
    evaluateCloudAllOwnerLocalSdfDiffuseOpticalDepth,
    evaluateCloudLocalSdfDiffuseOpticalDepth,
    integrateCloudFiniteSupportOpticalDepth,
    integrateCloudFallbackDiffuseProbeRay,
    evaluateCloudPassiveMultipleScatteringBudget,
    evaluateCloudLocalDirectionalHigherOrderBudget,
    evaluateCloudSceneLinearSourcePartition,
    packCloudOpticsBlend,
    resolveCloudOpticsBlend,
    uploadCloudOptics,
} from "../components/backgrounds/sky/cloud-optics.ts";

const manifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-optics-v1.json", import.meta.url),
    "utf8",
));
const phaseBuffer = readFileSync(new URL(
    `../public/assets/sky/${manifest.phaseTexture.file}`,
    import.meta.url,
));
const parameterBuffer = readFileSync(new URL(
    `../public/assets/sky/${manifest.parameterBuffer.file}`,
    import.meta.url,
));
const phaseHalf = new Uint16Array(
    phaseBuffer.buffer,
    phaseBuffer.byteOffset,
    phaseBuffer.byteLength / 2,
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const integrateDecodedChannel = (row, channel) => {
    const width = manifest.phaseTexture.dimensions.width;
    let integral = 0;
    for (let index = 1; index < width; index += 1) {
        const theta0 = (index - 1) / (width - 1) * Math.PI;
        const theta1 = index / (width - 1) * Math.PI;
        const decode = (sample) => 2 ** halfToFloat(
            phaseHalf[(row * width + sample) * 4 + channel],
        );
        integral += 0.5 * (
            decode(index - 1) * Math.sin(theta0) +
            decode(index) * Math.sin(theta1)
        ) * (theta1 - theta0) * Math.PI * 2;
    }
    return integral;
};
const decodePhase = (rowId, channel, thetaRadians) => {
    const row = manifest.rows.find((candidate) => candidate.id === rowId);
    const width = manifest.phaseTexture.dimensions.width;
    const sample = Math.round(thetaRadians / Math.PI * (width - 1));
    return 2 ** halfToFloat(phaseHalf[(row.phaseRow * width + sample) * 4 + channel]);
};

test("cloud optics assets match their checksummed WebGPU contract", () => {
    assert.equal(manifest.schema, CLOUD_OPTICS_SCHEMA);
    assert.equal(manifest.version, CLOUD_OPTICS_VERSION);
    assert.equal(manifest.phaseTexture.format, "rgba16float");
    assert.equal(manifest.phaseTexture.encoding, "log2-phase-per-steradian");
    assert.equal(manifest.phaseTexture.dimensions.width, CLOUD_OPTICS_ANGLE_SAMPLES);
    assert.equal(manifest.phaseTexture.byteLength, phaseBuffer.byteLength);
    assert.equal(manifest.parameterBuffer.byteLength, parameterBuffer.byteLength);
    assert.equal(manifest.parameterBuffer.strideFloats, CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS);
    assert.equal(sha256(phaseBuffer), manifest.checksums.phaseTexture);
    assert.equal(sha256(parameterBuffer), manifest.checksums.parameterBuffer);
    assert.equal(manifest.rows.length, 67);
    assert.equal(new Set(manifest.rows.map((row) => row.id)).size, manifest.rows.length);
});

test("deterministic generator reproduces the production optical bytes", () => {
    const generated = generateCloudOptics();
    assert.equal(sha256(generated.phaseBytes), sha256(phaseBuffer));
    assert.equal(sha256(generated.parameterBytes), sha256(parameterBuffer));
    assert.deepEqual(generated.manifest, manifest);
});

test("quantized RGB phase rows remain nonnegative and normalized per steradian", () => {
    for (let row = 0; row < manifest.rows.length; row += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            const normalization = integrateDecodedChannel(row, channel);
            assert.ok(
                Math.abs(normalization - 1) < 0.003,
                `${manifest.rows[row].id} channel ${channel} integrates to ${normalization}`,
            );
            for (let angle = 0; angle < manifest.phaseTexture.dimensions.width; angle += 1) {
                const logPhase = halfToFloat(
                    phaseHalf[(row * manifest.phaseTexture.dimensions.width + angle) * 4 + channel],
                );
                assert.ok(Number.isFinite(logPhase));
                assert.ok(2 ** logPhase >= 0);
            }
        }
    }
});

test("extinction, albedo, moments and stable analytic lobes conserve energy", () => {
    for (const row of manifest.rows) {
        for (const extinction of row.massExtinctionRgbM2PerKg) {
            assert.ok(extinction > 5 && extinction < 700, `${row.id} extinction ${extinction}`);
        }
        for (const albedo of row.singleScatteringAlbedoRgb) {
            assert.ok(albedo > 0 && albedo <= 1, `${row.id} SSA ${albedo}`);
        }
        for (const g of row.asymmetryRgb) {
            assert.ok(g > 0.60 && g < 0.95, `${row.id} asymmetry ${g}`);
        }
        assert.ok(
            Math.max(...row.massExtinctionRgbM2PerKg) /
                Math.min(...row.massExtinctionRgbM2PerKg) < 1.08,
            `${row.id} visible extinction is not spectrally plausible`,
        );
        assert.ok(
            Math.max(...row.asymmetryRgb) - Math.min(...row.asymmetryRgb) < 0.04,
            `${row.id} visible phase moments are implausibly chromatic`,
        );
        const fit = row.analyticApproximation;
        assert.ok(fit.forwardG > 0 && fit.forwardG < 1);
        assert.ok(fit.draineG > -1 && fit.draineG < 1);
        assert.ok(fit.backwardG > -1 && fit.backwardG < 0);
        assert.ok(fit.draineWeight >= 0 && fit.backwardWeight >= 0);
        assert.ok(fit.draineWeight + fit.backwardWeight < 1);
        assert.ok(Number.isFinite(fit.rmsLog2) && fit.rmsLog2 < 1.6);
        assert.ok(row.angularFeatures.forwardTenDegreeEnergy > 0);
        assert.ok(row.angularFeatures.forwardTenDegreeEnergy < 1);
    }
});

test("refined HG-Draine fits retain weak structure and physical first moments", () => {
    const errors = manifest.rows.map((row) =>
        row.analyticApproximation.rmsLog2);
    assert.ok(Math.max(...errors) < 0.65,
        `worst refined phase fit is ${Math.max(...errors)} log2 RMS`);
    assert.ok(errors.reduce((sum, value) => sum + value, 0) / errors.length < 0.16);
    for (const row of manifest.rows) {
        const fit = row.analyticApproximation;
        assert.ok(fit.forwardG >= 0.55 && fit.forwardG <= 0.985);
        assert.ok(fit.draineAlpha >= 0 && fit.draineAlpha <= 300);
        assert.ok(fit.backwardG >= -0.9 && fit.backwardG <= -0.01);
        assert.ok(fit.draineWeight + fit.backwardWeight < 0.97);
    }
});

test("higher-order closure creates bounded interior transport and dark deep cores", () => {
    assert.equal(CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT, 5);
    for (const albedo of [
        [1, 1, 1],
        [0.999, 0.997, 0.992],
        [0.92, 0.8, 0.64],
    ]) {
        for (const opticalDepth of [0, 0.01, 0.1, 0.5, 1, 3, 10, 100]) {
            const budget = evaluateCloudPassiveMultipleScatteringBudget(
                albedo, opticalDepth);
            for (let channel = 0; channel < 3; channel += 1) {
                assert.ok(budget.firstOrderRgb[channel] >= 0);
                assert.ok(budget.higherOrderTransportRgb[channel] >= 0);
                assert.ok(budget.higherOrderTransportRgb[channel] <=
                    budget.higherOrderAvailableRgb[channel] + 1e-12);
                assert.ok(budget.totalTransportRgb[channel] <=
                    albedo[channel] + 1e-12);
            }
        }
    }
    const albedo = [0.999, 0.999, 0.999];
    const edge = evaluateCloudPassiveMultipleScatteringBudget(albedo, 0.01);
    const interior = evaluateCloudPassiveMultipleScatteringBudget(albedo, 1.5);
    const deepCore = evaluateCloudPassiveMultipleScatteringBudget(albedo, 100);
    assert.ok(interior.higherOrderTransportRgb[1] >
        edge.higherOrderTransportRgb[1] * 8,
    "higher orders must emerge after a finite first interaction");
    assert.ok(deepCore.totalTransportRgb[1] < interior.totalTransportRgb[1],
        "finite relaxed extinction must not turn deep cores into emissive fill");
});

test("sparse Cirrus footprint transport preserves mean tau and partial visibility", () => {
    assert.equal(CLOUD_THIN_ICE_SPARSE_TAU_SCALE, 0.14);
    assert.equal(CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY, 0.85);
    const porosity = 0.76;
    for (const tau of [1e-5, 0.001, 0.03, 0.1, 0.3, 0.65, 2, 8]) {
        const effective = cloudUnresolvedFootprintOpticalDepth(
            [tau, tau, tau], porosity);
        effective.forEach((value) => {
            assert.ok(Number.isFinite(value) && value >= 0);
            assert.ok(value <= tau + 1e-12,
                "unresolved heterogeneity cannot absorb more than the resolved slab");
        });
    }
    const differential = cloudUnresolvedFootprintOpticalDepth(
        [1e-5, 1e-5, 1e-5], porosity)[1] / 1e-5;
    assert.ok(Math.abs(differential - 1) < 2e-5,
        "mean-preserving fibres must retain the resolved thin-limit extinction");
    for (const tau of [0.03, 0.1, 0.3, 0.65]) {
        const effective = cloudUnresolvedFootprintOpticalDepth(
            [tau, tau, tau], porosity)[1];
        const transmission = Math.exp(-effective);
        assert.ok(transmission >= 0.70 && transmission <= 0.98,
            `thin/fibratus tau ${tau} should remain partially transmissive (${transmission})`);
    }
    const spectral = cloudUnresolvedFootprintOpticalDepth(
        [0.22, 0.34, 0.48], porosity);
    assert.ok(spectral[0] < spectral[1] && spectral[1] < spectral[2],
        "air-path RGB ordering must survive instead of becoming fixed cyan-white");
});

test("resolved high-ice variance preserves bounded porosity and Beer invariants", () => {
    const owners = [
        ["fibratus", 0.76, 0.56],
        ["uncinus", 0.58, 0.42],
        ["spissatus", 0.08, 0.22],
    ];
    for (const [label, ownerPorosity, varianceFloor] of owners) {
        const full = cloudUnresolvedFootprintPorosity(
            ownerPorosity, varianceFloor, 1);
        const filtered = cloudUnresolvedFootprintPorosity(
            ownerPorosity, varianceFloor, 0);
        assert.ok(full > 0,
            `${label} retains a meaningful local unresolved population prior`);
        assert.ok(full <= ownerPorosity + 1e-12 && full <=
            CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY + 1e-12);
        assert.equal(filtered, 0,
            `${label} becomes homogeneous when source correlation is fully filtered`);
        let previousEffective = Infinity;
        for (const variance of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
            const effective = cloudUnresolvedFootprintOpticalDepth(
                [0.8, 0.8, 0.8], ownerPorosity, variance, 1)[0];
            assert.ok(effective >= 0 && effective <= 0.8 + 1e-12);
            assert.ok(effective <= previousEffective + 1e-12,
                `${label} Beer depth must not increase with variance`);
            previousEffective = effective;
        }
    }
    for (const tau of [0, 1e-8, 0.01, 0.1, 1, 8]) {
        const homogeneous = cloudUnresolvedFootprintOpticalDepth(
            [tau, tau, tau], 0.76, 0, 1);
        homogeneous.forEach((value) => assert.ok(Math.abs(value - tau) <
            2e-10 * Math.max(1, tau), "zero variance is exact"));
    }
    const heterogeneousValidity = cloudP1DiffusionValidity(
        [0.8, 0.8, 0.8], [0.999, 0.999, 0.999], [0.82, 0.82, 0.82],
        0.8, 1,
    );
    const homogeneousValidity = cloudP1DiffusionValidity(
        [0.8, 0.8, 0.8], [0.999, 0.999, 0.999], [0.82, 0.82, 0.82],
        0, 0,
    );
    assert.ok(heterogeneousValidity <= homogeneousValidity + 1e-12,
        "local variance/correlation must gate P1 rather than add diffuse fill");
});

test("camera GL2 high-ice packet preserves analytic Beer and Jensen bounds", () => {
    assert.equal(CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT, 2);
    assert.ok(Math.abs(CLOUD_CAMERA_HIGH_ICE_GL2_NODE - 1 / Math.sqrt(3)) < 1e-15);
    assert.ok(Math.abs(CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR -
        1 / Math.sqrt(12)) < 1e-15);

    const integrateGl2Tau = (sigma, segmentLength, porosity, variance, correlation) => {
        const subsegmentLength = segmentLength / 2;
        let effectiveTau = 0;
        for (let node = 0; node < CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT; node += 1) {
            const resolvedTau = sigma * subsegmentLength;
            effectiveTau += cloudUnresolvedFootprintOpticalDepth(
                [resolvedTau, resolvedTau, resolvedTau],
                porosity,
                variance,
                correlation,
            )[0];
        }
        return effectiveTau;
    };

    // A homogeneous medium is invariant under the GL2 partition and exactly
    // reproduces Beer--Lambert, channel by channel.
    for (const [sigma, segmentLength] of [[0.3, 1.7], [2.5, 0.42], [18, 0.08]]) {
        const tau = integrateGl2Tau(sigma, segmentLength, 0.76, 0, 1);
        const expectedTau = sigma * segmentLength;
        assert.ok(Math.abs(tau - expectedTau) < 2e-12,
            `homogeneous GL2 tau ${tau} must equal ${expectedTau}`);
        assert.ok(Math.abs(Math.exp(-tau) - Math.exp(-expectedTau)) < 2e-12);
    }

    // The unresolved two-point closure is a convex Beer average. It can only
    // increase transmittance (and therefore reduce Beer-equivalent tau).
    for (const sigma of [0.05, 0.8, 6]) {
        const segmentLength = 0.63;
        const resolvedTau = sigma * segmentLength;
        const effectiveTau = integrateGl2Tau(
            sigma, segmentLength, 0.76, 0.9, 0.95);
        const transmission = Math.exp(-effectiveTau);
        assert.ok(effectiveTau >= -1e-12);
        assert.ok(effectiveTau <= resolvedTau + 1e-12,
            "Jensen closure cannot absorb more than resolved Beer");
        assert.ok(transmission >= Math.exp(-resolvedTau) - 1e-12);
        assert.ok(transmission <= 1 + 1e-12);
    }

    // A density-free cavity remains exactly clear, including after both
    // positive subnodes are evaluated.
    assert.equal(integrateGl2Tau(0, 3.2, 0.85, 1, 1), 0);
    assert.equal(Math.exp(-integrateGl2Tau(0, 3.2, 0.85, 1, 1)), 1);
});

test("only local ice depth creates directional higher orders", () => {
    const base = {
        singleScatteringAlbedoRgb: [0.999985, 0.999992, 0.999996],
        completeSourceVisibilityRgb: [0.12, 0.18, 0.26],
        unresolvedIcePorosity: 0.76,
    };
    const remoteShadowOnly = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        resolvedLocalOpticalDepthRgb: [0, 0, 0],
    });
    assert.deepEqual(remoteShadowOnly.higherOrderAvailableRgb, [0, 0, 0]);
    assert.deepEqual(remoteShadowOnly.higherOrderTransportRgb, [0, 0, 0]);

    const local = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        resolvedLocalOpticalDepthRgb: [0.24, 0.27, 0.31],
    });
    const effectiveLocal = cloudUnresolvedFootprintOpticalDepth(
        [0.24, 0.27, 0.31], base.unresolvedIcePorosity);
    const unobscured = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        completeSourceVisibilityRgb: effectiveLocal.map((tau) =>
            Math.exp(-tau)),
        resolvedLocalOpticalDepthRgb: [0.24, 0.27, 0.31],
    });
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(local.externalSourceVisibilityRgb[channel] >= 0 &&
            local.externalSourceVisibilityRgb[channel] <= 1);
        assert.ok(local.higherOrderTransportRgb[channel] >= 0);
        assert.ok(local.higherOrderTransportRgb[channel] <=
            local.higherOrderAvailableRgb[channel] + 1e-12);
        assert.ok(local.higherOrderTransportRgb[channel] <=
            unobscured.higherOrderTransportRgb[channel] + 1e-12,
        "external cloud shadow may attenuate local fill but never manufacture it");
    }
    const homogeneous = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        completeSourceVisibilityRgb: [1, 1, 1],
        resolvedLocalOpticalDepthRgb: [0.24, 0.27, 0.31],
        unresolvedIcePorosity: 0,
    });
    assert.ok(local.effectiveLocalOpticalDepthRgb[1] <
        homogeneous.effectiveLocalOpticalDepthRgb[1],
    "sparse footprints retain resolved holes instead of becoming matte slabs");

    const remoteTau = [0.17, 0.29, 0.43];
    const separated = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        completeSourceVisibilityRgb: effectiveLocal.map((tau, channel) =>
            Math.exp(-(tau + remoteTau[channel]))),
        resolvedLocalOpticalDepthRgb: [0.24, 0.27, 0.31],
    });
    separated.externalSourceVisibilityRgb.forEach((visibility, channel) =>
        assert.ok(Math.abs(visibility - Math.exp(-remoteTau[channel])) < 1e-12,
            "external attenuation must subtract the local Beer-equivalent depth"));

    const shallowCompleteVisibility = [0.82, 0.86, 0.9];
    const mismatchedFineLocal = evaluateCloudLocalDirectionalHigherOrderBudget({
        ...base,
        completeSourceVisibilityRgb: shallowCompleteVisibility,
        resolvedLocalOpticalDepthRgb: [1.8, 1.9, 2.0],
        unresolvedIcePorosity: 0,
    });
    mismatchedFineLocal.higherOrderAvailableRgb.forEach((available, channel) => {
        assert.ok(available <= base.singleScatteringAlbedoRgb[channel] ** 2 *
            (1 - shallowCompleteVisibility[channel]) + 1e-12,
        "a fine local depth cannot scatter more energy than the complete beam lost");
    });
});

test("scene-linear source partition applies direct, P1, and albedo exactly once", () => {
    const partition = evaluateCloudSceneLinearSourcePartition({
        singleScatteringAlbedoRgb: [0.8, 0.9, 1.0],
        directSources: [
            {
                incidentIrradianceRgb: [10, 20, 30],
                visibilityRgb: [0.5, 0.25, 0.1],
                phaseRgbPerSteradian: [2, 3, 4],
            },
            {
                incidentIrradianceRgb: [1, 2, 3],
                visibilityRgb: [1, 1, 1],
                phaseRgbPerSteradian: [0.5, 0.25, 0.125],
            },
        ],
        propagatedDiffuseIncidentRadianceRgb: [4, 5, 6],
    });
    for (const [actual, expected] of [
        [partition.directSingleScatteringRgb, [8.4, 13.95, 12.375]],
        [partition.propagatedDiffuseScatteringRgb, [3.2, 4.5, 6]],
        [partition.totalSourceRadianceRgb, [11.6, 18.45, 18.375]],
    ]) {
        actual.forEach((value, channel) =>
            assert.ok(Math.abs(value - expected[channel]) < 1e-12));
    }

    const noP1 = evaluateCloudSceneLinearSourcePartition({
        singleScatteringAlbedoRgb: [0.8, 0.9, 1],
        directSources: [{
            incidentIrradianceRgb: [1, 1, 1],
            visibilityRgb: [1, 1, 1],
            phaseRgbPerSteradian: [1, 1, 1],
        }],
        propagatedDiffuseIncidentRadianceRgb: [0, 0, 0],
    });
    assert.deepEqual(noP1.totalSourceRadianceRgb, [0.8, 0.9, 1]);
    assert.deepEqual(noP1.propagatedDiffuseScatteringRgb, [0, 0, 0]);
});

test("fallback atmosphere and ground fields are exhaustive and non-overlapping", () => {
    const onlyLowerAtmosphere = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [0.8, 0.9, 1],
        directionalAtmospherePhaseIntegralRgb: [2, 3, 4],
        upperAtmosphereMeanRadianceRgb: [0, 0, 0],
        lowerAtmosphereMeanRadianceRgb: [20, 30, 40],
        groundMeanRadianceRgb: [0, 0, 0],
        upperCloudOpticalDepth: 0,
        lowerCloudOpticalDepth: 0,
    });
    assert.deepEqual(
        onlyLowerAtmosphere.atmosphereDirectionalFirstOrderRgb,
        [1.6, 2.7, 4],
    );
    assert.deepEqual(onlyLowerAtmosphere.lowerAtmosphereHigherOrderRgb,
        [0, 0, 0]);
    assert.deepEqual(onlyLowerAtmosphere.totalDiffuseSourceRadianceRgb,
        [1.6, 2.7, 4],
        "lower-atmosphere first order is already in the full-sphere phase integral",
    );

    const noAtmosphere = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [0.8, 0.9, 1],
        directionalAtmospherePhaseIntegralRgb: [0, 0, 0],
        upperAtmosphereMeanRadianceRgb: [0, 0, 0],
        lowerAtmosphereMeanRadianceRgb: [0, 0, 0],
        groundMeanRadianceRgb: [2, 3, 4],
        upperCloudOpticalDepth: 0,
        lowerCloudOpticalDepth: 0,
    });
    assert.deepEqual(noAtmosphere.groundFirstAndHigherOrderRgb,
        [1.6, 2.7, 4]);
    assert.deepEqual(noAtmosphere.totalDiffuseSourceRadianceRgb,
        [1.6, 2.7, 4],
        "ground is excluded from the directional profile and retains first order",
    );
});

test("fallback diffuse uses hemispheric open-sky visibility", () => {
    const normalization = CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES.reduce(
        (sum, mu, index) =>
            sum + 2 * mu * CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS[index],
        0,
    );
    assert.ok(Math.abs(normalization - 1) < 1e-12);

    const tau = [0.32, 0.56, 0.91];
    const homogeneous = cloudHemisphericDiffuseTransmittanceRgb(tau, 0);
    const porous = cloudHemisphericDiffuseTransmittanceRgb(tau, 0.76);
    homogeneous.forEach((value, channel) => {
        assert.ok(value >= 0 && value <= 1);
        assert.ok(value < Math.exp(-tau[channel]),
            "hemispheric diffuse visibility must include longer slant paths");
        assert.ok(porous[channel] >= value,
            "sparse ice porosity must preserve open-sky visibility");
    });

    const partition = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [1, 1, 1],
        directionalAtmospherePhaseIntegralRgb: [0.7, 0.8, 0.9],
        upperAtmosphereMeanRadianceRgb: [1, 1, 1],
        lowerAtmosphereMeanRadianceRgb: [0, 0, 0],
        groundMeanRadianceRgb: [0, 0, 0],
        upperCloudOpticalDepth: tau,
        lowerCloudOpticalDepth: [0, 0, 0],
        unresolvedIcePorosity: 0,
    });
    partition.atmosphereFirstOrderTransmittanceRgb.forEach(
        (value, channel) => assert.ok(
            Math.abs(value - homogeneous[channel]) < 1e-12),
    );
});

const diffuseProbe = ({
    ray = 0,
    translation = 0,
    scale = 1,
    pathLengthKilometers = 5 + ray * 0.23,
    profile,
} = {}) => {
    const extinctionAt = profile ?? ((distance) => {
        const ownerBlend = 0.5 + 0.5 * Math.tanh(translation / 0.025);
        const firstOwner = 0.34 + 0.16 * Math.sin(
            distance * 1.31 + ray * 2.094 + translation * 3.7);
        const secondOwner = 0.29 + 0.14 * Math.cos(
            distance * 0.83 - ray * 1.71 + translation * 2.9);
        const density = Math.max(0,
            firstOwner * (1 - ownerBlend) + secondOwner * ownerBlend);
        return [0.93, 1, 1.08].map((spectral) =>
            density * spectral * scale);
    });
    return {
        pathLengthKilometers,
        localExtinctionRgbPerKilometer: extinctionAt(0),
        extinctionRgbPerKilometerAt: extinctionAt,
    };
};

test("analytic diffuse probes remain continuous under sub-cell owner translations", () => {
    const budget = cloudFallbackDiffuseProbeBudget(9);
    let previous;
    for (let sample = -40; sample <= 40; sample += 1) {
        const translation = sample * 0.001;
        const opticalDepth = evaluateCloudFallbackDiffuseHemisphereOpticalDepth(
            Array.from({ length: budget.hemisphereRayCount }, (_, ray) =>
                diffuseProbe({ ray, translation })),
            budget,
        );
        opticalDepth.forEach((value) => {
            assert.ok(Number.isFinite(value) && value >= 0 &&
                value <= CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH);
        });
        if (previous) {
            opticalDepth.forEach((value, channel) => assert.ok(
                Math.abs(value - previous[channel]) < 0.012,
                `sub-cell translation jumped in channel ${channel}`));
        }
        previous = opticalDepth;
    }
});

test("finite-support quadrature removes whole-shell midpoint hit/miss chunks", () => {
    const budget = cloudFallbackDiffuseProbeBudget(9);
    const pathLengthKilometers = 5;
    const compactWidth = 0.42;
    const translations = Array.from({ length: 121 }, (_, index) =>
        0.36 + index * 0.004);
    const profileFor = (translation) => (distance) => {
        const normalized = (distance - translation) / compactWidth;
        // Deliberately compact support: the test targets the estimator's
        // support-entry contract, not the atlas boundary reconstruction.
        const density = normalized > 0 && normalized < 1 ? 1 : 0;
        return [0.91, 1, 1.1].map((spectral) => density * spectral);
    };
    const old = translations.map((translation) =>
        integrateCloudFallbackDiffuseProbeRay({
            pathLengthKilometers,
            localExtinctionRgbPerKilometer: profileFor(translation)(0),
            extinctionRgbPerKilometerAt: profileFor(translation),
        }, budget)[1]);
    const finite = translations.map((translation) =>
        integrateCloudFiniteSupportOpticalDepth([{
            supportIntervalKilometers: [
                translation,
                translation + compactWidth,
            ],
            extinctionRgbPerKilometerAt: profileFor(translation),
        }], pathLengthKilometers, budget.nearFieldKilometers)[1]);
    const maximumStep = (values) => values.slice(1).reduce(
        (maximum, value, index) => Math.max(maximum,
            Math.abs(value - values[index])), 0);
    assert.ok(maximumStep(old) > 0.2,
        "the former shell midpoint estimator must expose its compact-lobe jump");
    assert.ok(maximumStep(finite) < 1e-9,
        "owner-relative quadrature must translate a compact lobe continuously");
    assert.ok(Math.min(...finite) > 0.15,
        "continuous support tracking must not make the compact lobe disappear");
});

test("camera cloud lighting has strict atlas-query and local-closure ceilings", () => {
    assert.equal(CLOUD_CAMERA_DIRECT_SOURCE_QUERY_CEILING, 2,
        "camera direct visibility queries at most Sun and Moon");
    assert.equal(CLOUD_CAMERA_DIRECT_OWNER_EVALUATION_CEILING, 0,
        "camera direct visibility must not retrace finite owners");
    assert.equal(CLOUD_CAMERA_LOCAL_DIFFUSE_TEXTURE_FETCH_CEILING, 0,
        "local diffuse visibility reuses the density atlas SDF");
    assert.equal(CLOUD_CAMERA_LOCAL_DIFFUSE_OWNER_EVALUATION_CEILING, 0,
        "local diffuse visibility must not traverse owner supports");
});

test("P1 residency is admitted only through continuous reduced transport depth", () => {
    assert.deepEqual(CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE, [0.2, 1]);
    assert.ok(Math.abs(
        cloudTransportOpticalDepth(0.34, 1, 0.84) - 0.34 * 0.16,
    ) < 1e-14);
    const thinIce = cloudP1DiffusionValidity(
        [0.34, 0.34, 0.34],
        [0.999, 0.999, 0.999],
        [0.84, 0.84, 0.84],
    );
    assert.equal(thinIce, 0,
        "transparent cirrus must keep resolved angular transport");
    const response = Array.from({ length: 101 }, (_, index) =>
        cloudP1DiffusionValidity(
            [index * 0.2, index * 0.2, index * 0.2],
            [0.998, 0.998, 0.998],
            [0.82, 0.82, 0.82],
        ));
    for (let index = 1; index < response.length; index += 1) {
        assert.ok(response[index] + 1e-12 >= response[index - 1]);
    }
    assert.ok(response.some((value) => value > 0 && value < 1),
        "the diffusion handoff must remain a continuous crossfade");
    assert.equal(response.at(-1), 1,
        "deep cloud must retain the qualified resident P1 solution");
    assert.equal(cloudP1DiffusionValidity(
        [Infinity, NaN, -1], [Infinity, NaN, -1], [Infinity, NaN, -1]), 0,
    "nonfinite inputs must fail closed without emitting radiance");
});

test("local SDF diffuse closure is compact, continuous, spectral, and passive", () => {
    const evaluate = (translation) => {
        // A compact cloud crosses the receiver continuously. Density and the
        // signed inward depth both vanish at the physical support boundary.
        const normalizedDistance = Math.abs(translation) / 0.42;
        const support = normalizedDistance < 1
            ? (1 - normalizedDistance) ** 2 * (1 + 2 * normalizedDistance)
            : 0;
        return evaluateCloudLocalSdfDiffuseOpticalDepth({
            density: support,
            spectralExtinctionRgbPerKilometer: [0.74, 0.79, 0.86],
            receiverAltitudeKilometers: 1.36,
            opticalBaseAltitudeKilometers: 0.9 + translation * 0.015,
            opticalGeometricDepthKilometers: 1.1 + support * 0.2,
            interiorDepthFraction: support * 0.16,
            encodedSdfRangeVoxels: 12,
        });
    };
    const translations = Array.from({ length: 337 }, (_, index) =>
        -0.63 + index * 1.26 / 336);
    const response = translations.map((translation) => evaluate(translation));
    for (const sample of response) {
        for (const opticalDepth of [sample.upperRgb, sample.lowerRgb]) {
            opticalDepth.forEach((value) => assert.ok(
                Number.isFinite(value) && value >= 0 &&
                    value <= CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH));
            assert.ok(opticalDepth[2] >= opticalDepth[1] &&
                opticalDepth[1] >= opticalDepth[0],
            "spectral extinction ordering must survive the local closure");
        }
    }
    for (let index = 1; index < response.length; index += 1) {
        for (const hemisphere of ["upperRgb", "lowerRgb"]) {
            response[index][hemisphere].forEach((value, channel) => assert.ok(
                Math.abs(value - response[index - 1][hemisphere][channel]) < 0.012,
                "sub-voxel support motion must not create an optical-depth step"));
        }
    }
    for (const index of [0, response.length - 1]) {
        assert.deepEqual(response[index].upperRgb, [0, 0, 0]);
        assert.deepEqual(response[index].lowerRgb, [0, 0, 0]);
    }
});

test("local SDF lighting consumes the atlas' complete encoded interior depth", () => {
    const common = {
        density: 0.9,
        spectralExtinctionRgbPerKilometer: [3, 3.2, 3.4],
        receiverAltitudeKilometers: 1.2,
        opticalBaseAltitudeKilometers: 0.5,
        opticalGeometricDepthKilometers: 1.4,
        interiorDepthFraction: 12 / 47,
    };
    const truncated = evaluateCloudLocalSdfDiffuseOpticalDepth({
        ...common,
        encodedSdfRangeVoxels: 6,
    });
    const encoded = evaluateCloudLocalSdfDiffuseOpticalDepth({
        ...common,
        encodedSdfRangeVoxels: 12,
    });
    for (const hemisphere of ["upperRgb", "lowerRgb"]) {
        encoded[hemisphere].forEach((value, channel) => {
            assert.ok(value > truncated[hemisphere][channel] * 1.5,
                "discarding half the measured inward range must not restore boundary fill");
            assert.ok(value <= common.density *
                common.spectralExtinctionRgbPerKilometer[channel] *
                common.opticalGeometricDepthKilometers,
            "the encoded local path must remain inside the owner's physical depth");
        });
    }
});

test("displaced density cannot inherit a fixed coarse-SDF dark plateau", () => {
    const samples = Array.from({ length: 101 }, (_, index) =>
        evaluateCloudLocalSdfDiffuseOpticalDepth({
            density: index / 100,
            spectralExtinctionRgbPerKilometer: [0.72, 0.79, 0.88],
            receiverAltitudeKilometers: 1.5,
            opticalBaseAltitudeKilometers: 0.5,
            opticalGeometricDepthKilometers: 2,
            // Deliberately fixed: this is the displaced-density/coarse-SDF
            // mismatch which produced visible macro-volume chunks.
            interiorDepthFraction: 0.31,
            encodedSdfRangeVoxels: 12,
        }));
    for (let index = 1; index < samples.length; index += 1) {
        for (const hemisphere of ["upperRgb", "lowerRgb"]) {
            samples[index][hemisphere].forEach((value, channel) => {
                const previous = samples[index - 1][hemisphere][channel];
                assert.ok(value + 1e-12 >= previous,
                    "increasing displaced density must not reduce local tau");
                assert.ok(value - previous < 0.025,
                    "fixed coarse SDF must not create a density-response step");
                if (index > 4) assert.ok(value > previous,
                    "the local path must not become a hard dark plateau");
            });
        }
    }
    assert.deepEqual(samples[0].upperRgb, [0, 0, 0]);
    assert.deepEqual(samples[0].lowerRgb, [0, 0, 0]);
});

test("all-owner local paths retain owner geometry and additive RGB Beer depth", () => {
    const owners = [{
        density: 0.78,
        spectralExtinctionRgbPerKilometer: [0.31, 0.37, 0.46],
        receiverAltitudeKilometers: 1.42,
        opticalBaseAltitudeKilometers: 0.82,
        opticalGeometricDepthKilometers: 1.25,
        interiorDepthFraction: 0.12,
        encodedSdfRangeVoxels: 12,
    }, {
        density: 0.43,
        spectralExtinctionRgbPerKilometer: [0.18, 0.24, 0.35],
        receiverAltitudeKilometers: 1.42,
        opticalBaseAltitudeKilometers: 1.18,
        opticalGeometricDepthKilometers: 3.8,
        interiorDepthFraction: 0.27,
        encodedSdfRangeVoxels: 12,
    }];
    const combined = evaluateCloudAllOwnerLocalSdfDiffuseOpticalDepth(owners);
    const reversed = evaluateCloudAllOwnerLocalSdfDiffuseOpticalDepth(
        [...owners].reverse());
    assert.deepEqual(combined, reversed,
        "owner order and strongest-owner identity must not affect local tau");
    const individual = owners.map(evaluateCloudLocalSdfDiffuseOpticalDepth);
    for (const hemisphere of ["upperRgb", "lowerRgb"]) {
        combined[hemisphere].forEach((value, channel) => assert.ok(
            Math.abs(value - individual.reduce((sum, sample) =>
                sum + sample[hemisphere][channel], 0)) < 1e-12,
            "all-owner RGB tau must equal the sum of owner-local sigma*length"));
    }
});

test("measured diffuse strata reject the old two-probe shelf response", () => {
    const budget = cloudFallbackDiffuseProbeBudget(9);
    const local = [0.72, 0.78, 0.84];
    const oldProbe = [0.61, 0.66, 0.71];
    const profile = (bandStrength) => (distance) => {
        if (distance <= 0.32 + 1e-8) {
            const amount = distance / 0.32;
            return local.map((value, channel) =>
                value * (1 - amount) + oldProbe[channel] * amount);
        }
        const farBand = Math.exp(-(((distance - 2.2) / 0.72) ** 4));
        return [0.42, 0.49, 0.58].map((value) =>
            value * farBand * bandStrength);
    };
    const legacyEstimate = (extinctionAt) => {
        const atReceiver = extinctionAt(0);
        const atOldProbe = extinctionAt(0.32);
        return atReceiver.map((value, channel) =>
            0.5 * (value + atOldProbe[channel]) * 5);
    };
    const response = [0, 0.25, 0.5, 0.75, 1].map((bandStrength) =>
        integrateCloudFallbackDiffuseProbeRay({
            pathLengthKilometers: 5,
            localExtinctionRgbPerKilometer: local,
            extinctionRgbPerKilometerAt: profile(bandStrength),
        }, budget));
    assert.deepEqual(legacyEstimate(profile(0)), legacyEstimate(profile(1)),
        "the legacy local+0.32 km estimator cannot observe the far band");
    for (let index = 1; index < response.length; index += 1) {
        response[index].forEach((value, channel) => assert.ok(
            value > response[index - 1][channel] + 1e-5,
            `far stratum must respond continuously in channel ${channel}`));
    }
    assert.ok(response.at(-1)[0] - response[0][0] > 0.2,
        "measured far density must materially change diffuse visibility");
});

test("analytic diffuse optical depth is monotone, spectral, and passive", () => {
    const budget = cloudFallbackDiffuseProbeBudget(10);
    let previousTau = [0, 0, 0];
    let previousTransmittance = [1, 1, 1];
    for (let step = 0; step <= 40; step += 1) {
        const scale = step / 10;
        const tau = evaluateCloudFallbackDiffuseHemisphereOpticalDepth(
            Array.from({ length: budget.hemisphereRayCount }, (_, ray) =>
                diffuseProbe({ ray, scale })),
            budget,
        );
        tau.forEach((value, channel) => {
            const transmittance = Math.exp(-value);
            assert.ok(value + 1e-12 >= previousTau[channel],
                `tau channel ${channel} must be monotone`);
            assert.ok(transmittance <= previousTransmittance[channel] + 1e-12,
                `Beer channel ${channel} must remain passive`);
            assert.ok(transmittance >= Math.exp(
                -CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH) - 1e-12);
            previousTau[channel] = value;
            previousTransmittance[channel] = transmittance;
        });
    }
    assert.ok(previousTau[2] > previousTau[1] &&
        previousTau[1] > previousTau[0],
    "RGB mass extinction must survive the hemisphere closure");

    const partition = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [0.91, 0.94, 0.97],
        directionalAtmospherePhaseIntegralRgb: [1.1, 1.2, 1.3],
        upperAtmosphereMeanRadianceRgb: [0.5, 0.7, 1],
        lowerAtmosphereMeanRadianceRgb: [0.2, 0.25, 0.3],
        groundMeanRadianceRgb: [0.12, 0.1, 0.08],
        upperCloudOpticalDepth: [0.4, 0.6, 0.9],
        lowerCloudOpticalDepth: [1.1, 1.3, 1.6],
    });
    partition.atmosphereFirstOrderTransmittanceRgb.forEach((value) =>
        assert.ok(value >= 0 && value <= 1));
    partition.atmosphereDirectionalFirstOrderRgb.forEach((value, channel) =>
        assert.ok(value <= [1.1, 1.2, 1.3][channel] *
            [0.91, 0.94, 0.97][channel] + 1e-12));
    partition.upperAtmosphereHigherOrderRgb.forEach((value, channel) =>
        assert.ok(value <= [0.5, 0.7, 1][channel] *
            [0.91, 0.94, 0.97][channel] + 1e-12));
    partition.lowerAtmosphereHigherOrderRgb.forEach((value, channel) =>
        assert.ok(value <= [0.2, 0.25, 0.3][channel] *
            [0.91, 0.94, 0.97][channel] + 1e-12));
    partition.groundFirstAndHigherOrderRgb.forEach((value, channel) =>
        assert.ok(value <= [0.12, 0.1, 0.08][channel] *
            [0.91, 0.94, 0.97][channel] + 1e-12));
});

test("diffuse probe budgets are bounded for every cloud family", () => {
    const sheetGenera = new Set([3, 5, 6, 8]);
    for (let genus = 1; genus <= 10; genus += 1) {
        for (const species of genus === 8 ? [0, 16] : [0]) {
            const budget = cloudFallbackDiffuseProbeBudget(genus, species);
            const sheet = sheetGenera.has(genus) && species !== 16;
            assert.equal(budget.hemisphereRayCount, sheet ? 1 : 3);
            assert.ok(budget.hemisphereRayCount <=
                CLOUD_FALLBACK_DIFFUSE_MAX_HEMISPHERE_RAYS);
            assert.equal(budget.farSegmentCount,
                CLOUD_FALLBACK_DIFFUSE_FAR_SEGMENT_COUNT);
            assert.ok(budget.nearFieldKilometers >= 0.08 &&
                budget.nearFieldKilometers <= 0.18);
            assert.equal(budget.maximumOpticalDepth,
                CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH);
            const maximumExtinctionQueries = 2 * budget.hemisphereRayCount *
                (1 + budget.farSegmentCount);
            assert.ok(maximumExtinctionQueries <= 24,
                `genus ${genus} exceeded its static diffuse sample budget`);
        }
    }
});

test("directional-sky phase cache is passive and continuous across altitude and material bands", () => {
    const cache = {
        lower: {
            lowRgb: [0.08, 0.12, 0.20],
            middleRgb: [0.12, 0.18, 0.29],
            highRgb: [0.22, 0.31, 0.46],
        },
        middle: {
            lowRgb: [0.18, 0.23, 0.34],
            middleRgb: [0.27, 0.35, 0.49],
            highRgb: [0.41, 0.53, 0.68],
        },
        upper: {
            lowRgb: [0.11, 0.20, 0.38],
            middleRgb: [0.19, 0.31, 0.55],
            highRgb: [0.33, 0.48, 0.79],
        },
    };
    const allEndpoints = [cache.lower, cache.middle, cache.upper].flatMap(
        (band) => [band.lowRgb, band.middleRgb, band.highRgb]);
    const ceiling = [0, 1, 2].map((channel) =>
        Math.max(...allEndpoints.map((value) => value[channel])));
    for (let altitudeIndex = 0; altitudeIndex <= 100; altitudeIndex += 1) {
        for (let materialIndex = 0; materialIndex <= 100; materialIndex += 1) {
            const g = CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[0] +
                materialIndex / 100 * (
                    CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[2] -
                    CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[0]);
            const value = evaluateCloudDirectionalSkyPhaseBandCache(
                cache, altitudeIndex / 100, [g, g, g]);
            value.forEach((channelValue, channel) => {
                assert.ok(Number.isFinite(channelValue) && channelValue >= 0);
                assert.ok(channelValue <= ceiling[channel] + 1e-12,
                    "convex cache lookup cannot create directional energy");
            });
        }
    }

    const epsilon = 1e-7;
    for (const altitude of [0.5 - epsilon, 0.5 + epsilon]) {
        const below = evaluateCloudDirectionalSkyPhaseBandCache(
            cache, altitude, [0.8 - epsilon, 0.8 - epsilon, 0.8 - epsilon]);
        const above = evaluateCloudDirectionalSkyPhaseBandCache(
            cache, altitude, [0.8 + epsilon, 0.8 + epsilon, 0.8 + epsilon]);
        above.forEach((value, channel) => assert.ok(
            Math.abs(value - below[channel]) < 2e-6,
            "material anchor boundary must be continuous"));
    }
    const altitudeBelow = evaluateCloudDirectionalSkyPhaseBandCache(
        cache, 0.5 - epsilon, [0.76, 0.81, 0.86]);
    const altitudeAbove = evaluateCloudDirectionalSkyPhaseBandCache(
        cache, 0.5 + epsilon, [0.76, 0.81, 0.86]);
    altitudeAbove.forEach((value, channel) => assert.ok(
        Math.abs(value - altitudeBelow[channel]) < 2e-6,
        "altitude band boundary must be continuous"));

    const [lowG, , highG] = CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS;
    for (const row of manifest.rows) {
        assert.ok(row.asymmetryRgb.every((value) =>
            value >= lowG && value <= highG),
        `${row.id} must remain inside the production phase cache anchors`);
    }
    const liquid = manifest.rows.find((row) => row.id === "liquid-r4");
    const ice = manifest.rows.find((row) => row.id === "ice-column-smooth-r10");
    const liquidResponse = evaluateCloudDirectionalSkyPhaseBandCache(
        cache, 0.6, liquid.asymmetryRgb);
    const iceResponse = evaluateCloudDirectionalSkyPhaseBandCache(
        cache, 0.6, ice.asymmetryRgb);
    assert.ok(liquidResponse.some((value, channel) =>
        Math.abs(value - iceResponse[channel]) > 1e-4),
    "liquid and ice asymmetry retain distinct directional-sky response");
});

test("five physical cloud-light regimes inherit atmosphere chroma linearly", () => {
    const regimes = [
        {
            name: "noon",
            directional: [0.82, 1.02, 1.48],
            upper: [0.62, 0.82, 1.28],
            lower: [0.17, 0.19, 0.22],
            ground: [0.16, 0.14, 0.11],
            tau: [0.7, 0.45],
            dominant: 2,
        },
        {
            name: "golden-hour backlight",
            directional: [1.76, 0.71, 0.19],
            upper: [0.92, 0.48, 0.24],
            lower: [0.38, 0.19, 0.1],
            ground: [0.31, 0.18, 0.1],
            tau: [0.55, 0.9],
            dominant: 0,
        },
        {
            name: "twilight",
            directional: [0.16, 0.2, 0.48],
            upper: [0.12, 0.18, 0.43],
            lower: [0.07, 0.08, 0.16],
            ground: [0.045, 0.04, 0.055],
            tau: [1.3, 0.8],
            dominant: 2,
        },
        {
            name: "moonlight",
            directional: [0.018, 0.028, 0.061],
            upper: [0.015, 0.025, 0.057],
            lower: [0.006, 0.009, 0.019],
            ground: [0.004, 0.005, 0.009],
            tau: [0.8, 0.55],
            dominant: 2,
        },
        {
            name: "precipitating overcast",
            directional: [0.19, 0.23, 0.28],
            upper: [0.17, 0.21, 0.26],
            lower: [0.075, 0.085, 0.1],
            ground: [0.045, 0.047, 0.05],
            tau: [8, 3.5],
            dominant: 2,
        },
    ];
    for (const regime of regimes) {
        const input = {
            singleScatteringAlbedoRgb: [0.997, 0.998, 0.999],
            directionalAtmospherePhaseIntegralRgb: regime.directional,
            upperAtmosphereMeanRadianceRgb: regime.upper,
            lowerAtmosphereMeanRadianceRgb: regime.lower,
            groundMeanRadianceRgb: regime.ground,
            upperCloudOpticalDepth: regime.tau[0],
            lowerCloudOpticalDepth: regime.tau[1],
        };
        const partition = evaluateCloudFallbackDiffuseSourcePartition(input);
        const components = [
            partition.atmosphereDirectionalFirstOrderRgb,
            partition.upperAtmosphereHigherOrderRgb,
            partition.lowerAtmosphereHigherOrderRgb,
            partition.groundFirstAndHigherOrderRgb,
        ];
        partition.totalDiffuseSourceRadianceRgb.forEach((value, channel) => {
            assert.ok(Number.isFinite(value) && value >= 0, regime.name);
            const sum = components.reduce((total, component) =>
                total + component[channel], 0);
            assert.ok(Math.abs(value - sum) < 1e-12, regime.name);
        });
        assert.equal(partition.totalDiffuseSourceRadianceRgb.indexOf(
            Math.max(...partition.totalDiffuseSourceRadianceRgb)),
        regime.dominant, `${regime.name} must inherit its incident-field hue`);

        const scale = 3.7;
        const scaled = evaluateCloudFallbackDiffuseSourcePartition({
            ...input,
            directionalAtmospherePhaseIntegralRgb:
                regime.directional.map((value) => value * scale),
            upperAtmosphereMeanRadianceRgb:
                regime.upper.map((value) => value * scale),
            lowerAtmosphereMeanRadianceRgb:
                regime.lower.map((value) => value * scale),
            groundMeanRadianceRgb:
                regime.ground.map((value) => value * scale),
        });
        assert.ok(Math.abs(scaled.atmosphereFirstOrderOpticalDepth -
            partition.atmosphereFirstOrderOpticalDepth) < 1e-12, regime.name);
        scaled.totalDiffuseSourceRadianceRgb.forEach((value, channel) =>
            assert.ok(Math.abs(value -
                partition.totalDiffuseSourceRadianceRgb[channel] * scale) < 1e-12,
            `${regime.name} transport must remain scene-linear`));
    }
});

test("neutral incident fields cannot acquire a cloud palette tint", () => {
    const neutral = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [0.998, 0.998, 0.998],
        directionalAtmospherePhaseIntegralRgb: [0.4, 0.4, 0.4],
        upperAtmosphereMeanRadianceRgb: [0.3, 0.3, 0.3],
        lowerAtmosphereMeanRadianceRgb: [0.15, 0.15, 0.15],
        groundMeanRadianceRgb: [0.1, 0.1, 0.1],
        upperCloudOpticalDepth: 1.2,
        lowerCloudOpticalDepth: 0.7,
    });
    assert.ok(Math.max(...neutral.totalDiffuseSourceRadianceRgb) -
        Math.min(...neutral.totalDiffuseSourceRadianceRgb) < 1e-12);

    const brightGround = evaluateCloudFallbackDiffuseSourcePartition({
        singleScatteringAlbedoRgb: [0.998, 0.998, 0.998],
        directionalAtmospherePhaseIntegralRgb: [0.4, 0.4, 0.4],
        upperAtmosphereMeanRadianceRgb: [0.3, 0.3, 0.3],
        lowerAtmosphereMeanRadianceRgb: [0.15, 0.15, 0.15],
        groundMeanRadianceRgb: [100, 60, 20],
        upperCloudOpticalDepth: 1.2,
        lowerCloudOpticalDepth: 0.7,
    });
    assert.equal(brightGround.atmosphereFirstOrderOpticalDepth,
        neutral.atmosphereFirstOrderOpticalDepth,
        "ground excluded from the atmosphere profile cannot bias its path tau");
});

test("ice habit signatures survive while roughness suppresses sharp halos", () => {
    const smoothRatio = decodePhase("ice-plate-smooth-r35", 1, 22 * Math.PI / 180) /
        decodePhase("ice-plate-smooth-r35", 1, 30 * Math.PI / 180);
    const moderateRatio = decodePhase("ice-plate-moderate-r35", 1, 22 * Math.PI / 180) /
        decodePhase("ice-plate-moderate-r35", 1, 30 * Math.PI / 180);
    const severeRatio = decodePhase("ice-plate-severe-r35", 1, 22 * Math.PI / 180) /
        decodePhase("ice-plate-severe-r35", 1, 30 * Math.PI / 180);
    assert.ok(smoothRatio > moderateRatio);
    assert.ok(moderateRatio > severeRatio);
    assert.ok(severeRatio > 1, "rough crystals retain a broad forward-side enhancement");
});

test("liquid Mie rows retain size-dependent rainbow, glory and silver lining", () => {
    const liquid = manifest.rows.filter((row) => row.phase === "liquid");
    const small = liquid.find((row) => row.effectiveRadiusMicrons === 4);
    const medium = liquid.find((row) => row.effectiveRadiusMicrons === 10);
    const large = liquid.find((row) => row.effectiveRadiusMicrons === 30);
    for (const row of liquid) {
        assert.ok(row.angularFeatures.rainbow.centerRadians > 2.30);
        assert.ok(row.angularFeatures.rainbow.centerRadians < 2.55);
        assert.ok(row.angularFeatures.rainbow.contrast > 2);
        assert.ok(row.angularFeatures.glory.centerRadians > 2.9);
        assert.ok(row.angularFeatures.glory.contrast > 1.4);
        assert.ok(row.angularFeatures.forwardTenDegreeEnergy > 0.35);
    }
    assert.ok(large.angularFeatures.rainbow.contrast > medium.angularFeatures.rainbow.contrast);
    assert.ok(medium.angularFeatures.rainbow.contrast > small.angularFeatures.rainbow.contrast);
    assert.ok(large.angularFeatures.glory.contrast > small.angularFeatures.glory.contrast);
});

test("sphere solver has the geometric-optics extinction limit and passive scattering", () => {
    const angles = Float64Array.from({ length: 128 }, (_, index) =>
        index / 127 * Math.PI);
    const result = mieSphere(
        10,
        0.55,
        1.333,
        Float64Array.from(angles, (angle) => Math.cos(angle)),
    );
    assert.ok(result.extinctionEfficiency > 1.7 && result.extinctionEfficiency < 2.5);
    assert.ok(Math.abs(result.scatteringEfficiency - result.extinctionEfficiency) < 1e-8);
    assert.ok([...result.intensity].every((value) => value >= 0 && Number.isFinite(value)));
});

test("mixed phase interpolation weights phase by scattering coefficient", () => {
    const blend = resolveCloudOpticsBlend(manifest, {
        iceFraction: 0.42,
        liquidEffectiveRadiusMicrons: 11.5,
        iceEffectiveRadiusMicrons: 43,
        iceHabit: "aggregate",
        iceRoughness: "moderate",
    });
    assert.equal(blend.rows.length, 4);
    for (const weights of blend.phaseWeightsRgb) {
        assert.ok(Math.abs(weights.reduce((sum, value) => sum + value, 0) - 1) < 1e-7);
        assert.ok(weights.every((value) => value >= 0 && value <= 1));
    }
    assert.ok(blend.massExtinctionRgbM2PerKg.every((value) => value > 0));
    assert.ok(blend.singleScatteringAlbedoRgb.every((value) => value > 0 && value <= 1));
    assert.ok(blend.asymmetryRgb.every((value) => value > 0.6 && value < 0.95));
    const packed = packCloudOpticsBlend(blend);
    assert.equal(packed.length, 32);
    assert.ok([...packed].every(Number.isFinite));
});

test("angular coordinate includes exact endpoints and reciprocal 1D direction", () => {
    const first = manifest.rows[0];
    assert.deepEqual(cloudOpticsPhaseTextureCoordinate(1, first.phaseRow, manifest), [
        0.5 / manifest.phaseTexture.dimensions.width,
        (first.phaseRow + 0.5) / manifest.phaseTexture.dimensions.height,
    ]);
    assert.deepEqual(cloudOpticsPhaseTextureCoordinate(-1, first.phaseRow, manifest), [
        (manifest.phaseTexture.dimensions.width - 0.5) / manifest.phaseTexture.dimensions.width,
        (first.phaseRow + 0.5) / manifest.phaseTexture.dimensions.height,
    ]);
    // Exchanging propagation directions leaves their scalar cosine unchanged;
    // a 1D randomly-oriented-particle phase table is reciprocal by construction.
    const incoming = [0.31, -0.72, 0.62];
    const outgoing = [-0.81, 0.42, 0.41];
    const dot = (left, right) => left.reduce((sum, value, index) =>
        sum + value * right[index], 0);
    assert.deepEqual(
        cloudOpticsPhaseTextureCoordinate(dot(incoming, outgoing), first.phaseRow, manifest),
        cloudOpticsPhaseTextureCoordinate(dot(outgoing, incoming), first.phaseRow, manifest),
    );
});

test("GPU upload uses filtering-safe alignment and binding formats", () => {
    const descriptors = { textures: [], buffers: [], samplers: [], writes: [] };
    const resource = () => ({ destroy() {} });
    const device = {
        createTexture(descriptor) {
            descriptors.textures.push(descriptor);
            return resource();
        },
        createBuffer(descriptor) {
            descriptors.buffers.push(descriptor);
            return resource();
        },
        createSampler(descriptor) {
            descriptors.samplers.push(descriptor);
            return resource();
        },
        queue: {
            writeTexture(destination, data, layout, size) {
                descriptors.writes.push({ destination, bytes: data.byteLength, layout, size });
            },
            writeBuffer(buffer, offset, data) {
                descriptors.writes.push({ buffer, offset, bytes: data.byteLength });
            },
        },
    };
    const uploaded = uploadCloudOptics(device, {
        manifest,
        phaseBytes: new Uint8Array(phaseBuffer.buffer, phaseBuffer.byteOffset, phaseBuffer.byteLength),
        parameterBytes: new Uint8Array(parameterBuffer.buffer, parameterBuffer.byteOffset, parameterBuffer.byteLength),
        rows: new Map(manifest.rows.map((row) => [row.id, row])),
    });
    assert.equal(descriptors.textures[0].format, "rgba16float");
    assert.equal(descriptors.textures[0].dimension, "2d");
    assert.equal(descriptors.writes[0].layout.bytesPerRow % 256, 0);
    assert.equal(descriptors.buffers[0].size, manifest.parameterBuffer.byteLength);
    assert.equal(descriptors.samplers[0].addressModeU, "clamp-to-edge");
    assert.equal(descriptors.samplers[0].minFilter, "linear");
    uploaded.destroy();
});

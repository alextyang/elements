import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const modules = new Map();
const compileCommonJs = (relativePath) => {
    let url = new URL(relativePath, import.meta.url);
    if (!/\.[cm]?[jt]sx?$/.test(url.pathname)) {
        url = new URL(`${url.href}.ts`);
    }
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const source = readFileSync(url, "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: url.pathname,
    }).outputText;
    const moduleObject = { exports: {} };
    modules.set(url.href, moduleObject);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (!specifier.startsWith(".")) {
                throw new Error(`Unexpected import ${specifier}`);
            }
            return compileCommonJs(new URL(specifier, url).pathname);
        },
    );
    return moduleObject.exports;
};

const radiative = compileCommonJs(
    "../components/backgrounds/sky/cloud-radiative-domain.ts",
);
const visibility = compileCommonJs(
    "../components/backgrounds/sky/directional-cloud-visibility.ts",
);
const webgpuShaderSource = readFileSync(new URL(
    "../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url), "utf8");
const shadowedAtmosphereWgslSource = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-shadowed-atmosphere-transport-wgsl.ts",
    import.meta.url), "utf8");
const morphologyShaderSource = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-morphology-modifiers-wgsl.ts",
    import.meta.url), "utf8");
const skyRendererSource = readFileSync(new URL(
    "../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url),
"utf8");
const shaderValidatorSource = readFileSync(new URL(
    "./validate-webgpu-shaders.mjs", import.meta.url), "utf8");

const near = (actual, expected, tolerance = 1e-6, label = "value") =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${label}: ${actual} != ${expected} within ${tolerance}`);
const vecNear = (actual, expected, tolerance = 1e-6, label = "vector") =>
    actual.forEach((value, index) =>
        near(value, expected[index], tolerance, `${label}[${index}]`));
const dot = (a, b) => a.reduce((sum, value, index) =>
    sum + value * b[index], 0);
const quantizeUnitFloat16 = (value) => {
    const bounded = Math.max(0, Math.min(1, value));
    if (bounded === 0) return 0;
    const exponent = Math.max(-14, Math.floor(Math.log2(bounded)));
    const step = exponent === -14 && bounded < 2 ** -14
        ? 2 ** -24 : 2 ** (exponent - 10);
    return Math.max(0, Math.min(1, Math.round(bounded / step) * step));
};

const ownerInput = (overrides = {}) => ({
    ownerIndex: 0,
    layerIndex: 0,
    id: "finite-cumulus",
    centerEastKm: 0,
    centerNorthKm: 12,
    majorRadiusKm: 4,
    minorRadiusKm: 2,
    orientationRadians: 0.37,
    boundaryTransitionKm: 0.4,
    baseAltitudeKm: 1.1,
    geometricDepthKm: 2.4,
    ...overrides,
});

const simpleDomain = (overrides = {}) => ({
    sourceIndex: 0,
    cascadeIndex: 0,
    minimumDepthKm: 0,
    maximumDepthKm: 31,
    inverseDepthSpanPerKm: 1 / 31,
    planeCenterKm: [0, 0],
    planeHalfExtentKm: 20,
    depthWarpReferenceExtentKm: 20,
    ownerIndices: [0],
    ...overrides,
});

const makeVisibilityGrid = (width, height, valueAt) => {
    const grid = new Float32Array(width * height * 32 * 3);
    for (let knot = 0; knot < 32; knot += 1) {
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const value = valueAt(x, y, knot);
                grid.set(value, ((knot * height + y) * width + x) * 3);
            }
        }
    }
    return grid;
};

test("32-knot coupling layout is exact, core-safe, and collision-free", () => {
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT, 32);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT, 193);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES,
        14_229_504);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES, 176);
    assert.deepEqual(visibility.DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP,
        [2, 2, 32]);
    assert.deepEqual(visibility.DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH,
        [48, 48, 6]);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_INVOCATIONS,
        128);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_WORKGROUP_STORAGE_BYTES,
        4_480);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUPS,
        13_824);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUP_CEILING,
        14_000);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_CEILING_BYTES,
        16 * 1024 * 1024);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT,
        428_544);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES,
        3_428_352);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_MEMORY_CEILING_BYTES,
        4 * 1024 * 1024);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_BYTES,
        17_657_856);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_CEILING_BYTES,
        20 * 1024 * 1024);
    assert.ok(visibility.DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_BYTES <=
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_TEXTURE_MEMORY_CEILING_BYTES);
    assert.ok(visibility.DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUPS <=
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH_WORKGROUP_CEILING);
    assert.ok(visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES <=
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_MEMORY_CEILING_BYTES);
    assert.ok(visibility.DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_BYTES <=
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_TOTAL_GPU_MEMORY_CEILING_BYTES);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_COUNT, 8);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LOOKUP_FETCH_CEILING, 8);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_CAMERA_EVENT_FETCH_CEILING,
        16,
        "one camera-cloud event has at most two eight-fetch atlas lookups");
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_MEDIUM_EVALUATIONS,
        0);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_EVALUATION_CEILING,
        0);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_SITES,
        27_426_816);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_CEILING,
        28_000_000);
    assert.deepEqual(visibility.validateDirectionalCloudVisibilityLayout(), {
        valid: true, reasons: [],
    });
    const layers = [];
    for (let source = 0; source < 2; source += 1) {
        for (let cascade = 0; cascade < 3; cascade += 1) {
            for (let knot = 0; knot < 32; knot += 1) {
                layers.push(visibility.directionalCloudVisibilityLayerIndex(
                    source, cascade, knot));
            }
        }
    }
    assert.deepEqual(layers, Array.from({ length: 192 }, (_, index) => index + 1));
    assert.throws(() => visibility.directionalCloudVisibilityLayerIndex(2, 0, 0),
        /out of range/);
});

test("lateral prefilter and linear tent weights preserve support and energy", () => {
    near(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE,
        1 / Math.sqrt(12), 1e-15);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLE_COUNT, 4);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_DEPTH_SAMPLE_COUNT, 2);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_HIGH_ICE_DEPTH_SAMPLE_COUNT, 4);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_MAXIMUM_DEPTH_SAMPLE_COUNT, 4);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SAMPLES_PER_DEPTH, 4);
    assert.equal(visibility.DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS, 2);
    const samples = visibility.createDirectionalCloudVisibilityLateralSamples(
        [4, -3], 2);
    assert.equal(samples.length, 4);
    near(samples.reduce((sum, sample) => sum + sample.weight, 0), 1, 1e-15);
    near(samples.reduce((sum, sample) =>
        sum + sample.planeCoordinateKm[0] * sample.weight, 0), 4, 1e-15);
    near(samples.reduce((sum, sample) =>
        sum + sample.planeCoordinateKm[1] * sample.weight, 0), -3, 1e-15);
    const quadraticMean = samples.reduce((sum, sample) => {
        const x = sample.planeCoordinateKm[0] - 4;
        const y = sample.planeCoordinateKm[1] + 3;
        return sum + (x * x + y * y) * sample.weight;
    }, 0);
    near(quadraticMean, 2 * 2 * 2 / 12, 1e-15,
        "square-footprint second moment");

    for (let fraction = 0; fraction <= 1; fraction += 1 / 64) {
        const weights = visibility.directionalCloudVisibilityLinearWeights(
            fraction);
        assert.ok(weights.every((weight) => weight >= 0 && weight <= 1));
        near(weights.reduce((sum, weight) => sum + weight, 0), 1, 1e-14,
            "linear partition of unity");
        near(weights[1], fraction, 1e-14,
            "hardware-linear fraction");
    }
    assert.throws(() => visibility.createDirectionalCloudVisibilityLateralSamples(
        [0, 0], 0), /out of range/);
});

test("producer quadrature keeps four coherent rays with separate Beer weights", () => {
    const center = [4, -3];
    const texelWidth = 2;
    const depthMidpoint = 11;
    const intervalLength = 4.5;
    const samples = visibility.createDirectionalCloudVisibilityProducerSamples(
        center, texelWidth, depthMidpoint, intervalLength);
    assert.equal(samples.length, 8);
    assert.deepEqual(samples.map((sample) => sample.depthNodeIndex),
        [0, 1, 0, 1, 0, 1, 0, 1]);
    assert.deepEqual(samples.map((sample) => sample.lateralNodeIndex),
        [0, 0, 1, 1, 2, 2, 3, 3]);
    for (let lateralNode = 0; lateralNode < 4; lateralNode += 1) {
        assert.deepEqual(samples.filter((sample) =>
            sample.lateralNodeIndex === lateralNode).map((sample) =>
            sample.depthNodeIndex), [0, 1]);
        near(samples.filter((sample) =>
            sample.lateralNodeIndex === lateralNode).reduce(
                (sum, sample) => sum + sample.weightKm, 0),
        intervalLength, 1e-14, "per-ray depth integral weight");
    }
    assert.ok(samples.every((sample) => sample.weightKm > 0 &&
        sample.visibilityWeight === 0.25 &&
        Math.abs(sample.planeCoordinateKm[0] - center[0]) < texelWidth / 2 &&
        Math.abs(sample.planeCoordinateKm[1] - center[1]) < texelWidth / 2));
    const moment = (evaluate) => samples.reduce((sum, sample) => {
        const x = sample.planeCoordinateKm[0] - center[0];
        const y = sample.planeCoordinateKm[1] - center[1];
        const z = sample.sourceDepthKm - depthMidpoint;
        return sum + evaluate(x, y, z) * sample.weightKm *
            sample.visibilityWeight;
    }, 0);
    near(moment(() => 1), intervalLength, 1e-14, "interval weight");
    near(moment((x) => x), 0, 1e-14, "lateral x centroid");
    near(moment((_, y) => y), 0, 1e-14, "lateral y centroid");
    near(moment((_, __, z) => z), 0, 1e-14, "depth centroid");
    near(moment((x) => x * x), intervalLength * texelWidth ** 2 / 12,
        1e-14, "lateral x second moment");
    near(moment((_, y) => y * y), intervalLength * texelWidth ** 2 / 12,
        1e-14, "lateral y second moment");
    near(moment((_, __, z) => z * z), intervalLength ** 3 / 12,
        1e-13, "depth second moment");
    near(moment((x, y) => x * y), 0, 1e-14, "xy mixed moment");
    near(moment((x, _, z) => x * z), 0, 1e-14,
        "xz mixed moment must vanish in each texel");
    near(moment((_, y, z) => y * z), 0, 1e-14,
        "yz mixed moment must vanish in each texel");

    for (const cascadeTexelWidth of [12 / 96, 128 / 96, 384 / 96]) {
        const cascadeSamples = visibility
            .createDirectionalCloudVisibilityProducerSamples(
                [0, 0], cascadeTexelWidth, 0, intervalLength);
        const tau = cascadeSamples.reduce((sum, sample) => {
            const [x, y] = sample.planeCoordinateKm;
            const z = sample.sourceDepthKm;
            return sum + (2 + 0.1 * x * z + 0.05 * y * z) *
                sample.weightKm * sample.visibilityWeight;
        }, 0);
        near(tau, 2 * intervalLength, 1e-13,
            "each cascade texel independently rejects mixed-moment gray bias");
    }

    const shifted = visibility.createDirectionalCloudVisibilityProducerSamples(
        [center[0] + 1e-4, center[1] - 2e-4], texelWidth,
        depthMidpoint, intervalLength);
    samples.forEach((sample, index) => {
        near(shifted[index].planeCoordinateKm[0] -
            sample.planeCoordinateKm[0], 1e-4, 1e-14,
        "continuous x translation");
        near(shifted[index].planeCoordinateKm[1] -
            sample.planeCoordinateKm[1], -2e-4, 1e-14,
        "continuous y translation");
    });
    assert.throws(() =>
        visibility.createDirectionalCloudVisibilityProducerSamples(
            center, texelWidth, depthMidpoint, 0),
    /out of range/);
});

test("aerial shadow quadrature resolves finite shafts without whole-stratum stamps", () => {
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT, 32);
    assert.equal(
        visibility.DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT, 160);
    near(visibility.DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE,
        1 / Math.sqrt(3), 1e-15);
    const distance = 160;
    const distributionPower = 1.3;
    const samples = visibility.createDirectionalCloudAerialShadowQuadrature(
        distance, distributionPower);
    assert.equal(samples.length, 64);
    assert.ok(samples.every((sample, index) =>
        sample.distanceKm > (index === 0 ? 0 : samples[index - 1].distanceKm) &&
        sample.distanceKm < distance && sample.weightKm > 0));
    const integratedDistance = samples.reduce(
        (sum, sample) => sum + sample.weightKm, 0);
    near(integratedDistance, distance, 0.03,
        "warped quadrature path length");

    // A four-kilometre shadow interval in the representative humid-wide path
    // was either missed or promoted to a 10.625 km slab by the former sixteen
    // quadratic point samples. Two-node interval quadrature bounds that error
    // without fading or masking the physical shaft.
    const shadowMinimum = 40;
    const shadowMaximum = 44;
    const resolvedShadowLength = samples.reduce((sum, sample) =>
        sum + (sample.distanceKm >= shadowMinimum &&
            sample.distanceKm <= shadowMaximum ? sample.weightKm : 0), 0);
    let legacyShadowLength = 0;
    for (let index = 0; index < 16; index += 1) {
        const nearDistance = distance * (index / 16) ** 2;
        const farDistance = distance * ((index + 1) / 16) ** 2;
        const sampleDistance = nearDistance +
            (farDistance - nearDistance) * 0.35;
        if (sampleDistance >= shadowMinimum &&
            sampleDistance <= shadowMaximum) {
            legacyShadowLength += farDistance - nearDistance;
        }
    }
    assert.ok(Math.abs(resolvedShadowLength - 4) < 1);
    assert.ok(Math.abs(legacyShadowLength - 4) > 5);

    // A hit at one embedded Gauss node remains a pointwise loss integrand. It
    // is retained by the bounded five-node Kronrod extension with its local
    // weight; it is never promoted to an interval-average source coefficient.
    const intervalMinimum = 40;
    const intervalMaximum = 45;
    const intervalCenter = 0.5 * (intervalMinimum + intervalMaximum);
    const intervalHalfLength = 0.5 *
        (intervalMaximum - intervalMinimum);
    const narrowHitDistance = intervalCenter - intervalHalfLength *
        visibility.DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE;
    const narrow = visibility.integrateDirectionalCloudAerialShadowLoss(
        distance, 1, (sampleDistance) => {
            const hit = Math.abs(sampleDistance - narrowHitDistance) < 1e-9;
            return {
                cameraTransmittance: hit ? [0.5, 0.4, 0.3] : [1, 1, 1],
                removedSourceCoefficient: hit ? [2, 2, 2] : [0, 0, 0],
                shadowAmount: hit ? 1 : 0,
                partiality: 0,
            };
        });
    const retainedNodeWeight = intervalHalfLength *
        0.4909090909090909;
    vecNear(narrow.loss, [retainedNodeWeight,
        retainedNodeWeight * 0.8, retainedNodeWeight * 0.6], 1e-10,
    "narrow shadow loss is weighted only at its camera depth");
    assert.equal(narrow.refinedIntervalCount, 1);
    assert.equal(narrow.sampleCount, 67,
        "one refined interval adds exactly three bounded samples");
    const worstCase = visibility.integrateDirectionalCloudAerialShadowLoss(
        distance, 1.3, () => ({
            cameraTransmittance: [1, 1, 1],
            removedSourceCoefficient: [1, 1, 1],
            shadowAmount: 0.5,
            partiality: 1,
        }));
    assert.equal(worstCase.refinedIntervalCount, 32);
    assert.equal(worstCase.sampleCount,
        visibility.DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT);
    assert.throws(() =>
        visibility.createDirectionalCloudAerialShadowQuadrature(-1, 1.3),
    /out of range/);
});

test("finite owner OBB is orthonormal, curved, deterministic, and morphology-inclusive", () => {
    const base = radiative.createCloudRadiativeOwnerDomain(ownerInput());
    const repeat = radiative.createCloudRadiativeOwnerDomain(ownerInput());
    assert.deepEqual(base, repeat);
    assert.equal(base.cornersRendererWorldKm.length, 8);
    assert.ok(base.centerRendererWorldKm[1] >
        radiative.CLOUD_RADIATIVE_PLANET_RADIUS_KM);
    base.axesRendererWorld.forEach((axis) => near(Math.hypot(...axis), 1, 1e-12));
    near(dot(base.axesRendererWorld[0], base.axesRendererWorld[1]), 0, 1e-12);
    near(dot(base.axesRendererWorld[0], base.axesRendererWorld[2]), 0, 1e-12);
    near(dot(base.axesRendererWorld[1], base.axesRendererWorld[2]), 0, 1e-12);

    const expanded = radiative.createCloudRadiativeOwnerDomain(ownerInput({
        morphologyBounds: {
            minimumKm: [-8, 0.4, 4],
            maximumKm: [18, 6.5, 28],
        },
    }));
    assert.ok(expanded.halfExtentKm.some((value, index) =>
        value > base.halfExtentKm[index]));
    for (const point of [
        [-8, 0.4, 4], [18, 0.4, 4], [-8, 6.5, 28], [18, 6.5, 28],
    ]) {
        const world = [
            point[0],
            Math.sqrt((6_371 + point[1]) ** 2 - point[0] ** 2 - point[2] ** 2),
            point[2],
        ];
        const delta = world.map((value, index) =>
            value - expanded.centerRendererWorldKm[index]);
        expanded.axesRendererWorld.forEach((axis, index) =>
            assert.ok(Math.abs(dot(delta, axis)) <=
                expanded.halfExtentKm[index] + 1e-8));
    }
});

test("invalid finite-owner inputs fail before they can truncate radiative support", () => {
    assert.deepEqual(radiative.validateCloudRadiativeOwnerInput(ownerInput({
        geometricDepthKm: -1,
    })).valid, false);
    assert.throws(() => radiative.createCloudRadiativeOwnerDomain(ownerInput({
        majorRadiusKm: Number.NaN,
    })), /Invalid cloud radiative owner/);
    assert.throws(() => radiative.createCloudRadiativeOwnerDomain(ownerInput({
        centerEastKm: 8_000,
    })), /local-earth-tangent-domain/);
});

test("source projections are finite at the horizon and far cascades enclose every owner", () => {
    const owners = radiative.createCloudRadiativeOwnerDomains([
        ownerInput(),
        ownerInput({
            ownerIndex: 1,
            layerIndex: 2,
            id: "distant-cirrus",
            centerEastKm: 310,
            centerNorthKm: 8,
            majorRadiusKm: 25,
            minorRadiusKm: 8,
            baseAltitudeKm: 10,
            geometricDepthKm: 1.2,
        }),
    ]);
    const input = {
        owners,
        observerAtmosphereWorldKm: [0, 0, 6_371.001],
        sourceDirectionsAtmosphere: [
            [1, 0, 1e-8],
            [-0.4, 0.916515138991168, 1e-7],
        ],
    };
    const set = visibility.createDirectionalCloudVisibilityDomains(input);
    assert.equal(set.validation.valid, true, set.validation.reasons.join(", "));
    assert.equal(set.domains.length, 6);
    assert.ok(set.domains.every((domain) => [
        domain.minimumDepthKm, domain.maximumDepthKm,
        domain.inverseDepthSpanPerKm, ...domain.planeCenterKm,
        domain.planeHalfExtentKm,
    ].every(Number.isFinite)));
    for (let source = 0; source < 2; source += 1) {
        const cascades = set.domains.filter((domain) =>
            domain.sourceIndex === source);
        assert.ok(cascades[0].planeHalfExtentKm < cascades[1].planeHalfExtentKm);
        assert.ok(cascades[1].planeHalfExtentKm < cascades[2].planeHalfExtentKm);
        assert.deepEqual(cascades[2].ownerIndices, [0, 1]);
        const basis = radiative.createCloudSourceAlignedBasis(
            input.sourceDirectionsAtmosphere[source]);
        const maximumOwnerCoordinate = Math.max(...owners.map((owner) => {
            const projection = radiative.projectCloudRadiativeOwnerDomain(
                owner, input.observerAtmosphereWorldKm, basis);
            return Math.max(...projection.planeMinimumKm.map(Math.abs),
                ...projection.planeMaximumKm.map(Math.abs));
        }));
        const farTexelWidth = 2 * cascades[2].planeHalfExtentKm /
            visibility.DIRECTIONAL_CLOUD_VISIBILITY_WIDTH;
        assert.ok(cascades[2].planeHalfExtentKm - maximumOwnerCoordinate >=
            visibility.DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_SUPPORT_TEXELS *
                farTexelWidth - 1e-9,
        "far exterior must cover the complete lateral filter support");
    }

    const reversed = visibility.createDirectionalCloudVisibilityDomains({
        ...input,
        owners: [...owners].reverse(),
    });
    assert.deepEqual(reversed.domains, set.domains,
        "owner input order cannot alter radiative domains");
});

test("adaptive near clips hand tied owners off continuously and never sample outside", () => {
    const observer = [0, 0, 6_371.001];
    const sources = [[0, 0, 1], [0.2, 0.1, 0.9746794344808963]];
    const domainsAt = (handoffKm, reverse = false) => {
        const owners = radiative.createCloudRadiativeOwnerDomains([
            ownerInput({
                ownerIndex: 0,
                id: "left-tied-cumulus",
                centerEastKm: -8 - handoffKm,
                centerNorthKm: 0,
                majorRadiusKm: 1.2,
                minorRadiusKm: 0.8,
                orientationRadians: 0,
            }),
            ownerInput({
                ownerIndex: 1,
                id: "right-tied-cumulus",
                centerEastKm: 8 - handoffKm,
                centerNorthKm: 0,
                majorRadiusKm: 1.2,
                minorRadiusKm: 0.8,
                orientationRadians: 0,
            }),
        ]);
        const set = visibility.createDirectionalCloudVisibilityDomains({
            owners: reverse ? [...owners].reverse() : owners,
            observerAtmosphereWorldKm: observer,
            sourceDirectionsAtmosphere: sources,
        });
        assert.equal(set.validation.valid, true, set.validation.reasons.join(", "));
        return set.domains.filter((domain) => domain.sourceIndex === 0);
    };
    const epsilon = 1e-3;
    const left = domainsAt(-epsilon);
    const tied = domainsAt(0);
    const right = domainsAt(epsilon);
    assert.deepEqual(domainsAt(0, true), tied,
        "owner order cannot choose a different near-clip winner");
    near(tied[0].planeCenterKm[0], 0, 1e-12,
        "equal-distance owners have an averaged centre");
    near((tied[0].planeCenterKm[0] - left[0].planeCenterKm[0]) / epsilon,
        (right[0].planeCenterKm[0] - tied[0].planeCenterKm[0]) / epsilon,
    2e-3, "near-centre first derivative through owner handoff");
    near((tied[0].planeHalfExtentKm - left[0].planeHalfExtentKm) / epsilon,
        (right[0].planeHalfExtentKm - tied[0].planeHalfExtentKm) / epsilon,
    2e-3, "near-extent first derivative through owner handoff");

    for (const domains of [left, tied, right]) {
        assert.deepEqual(domains[2].ownerIndices, [0, 1],
            "far support remains complete");
        assert.ok(domains.every((domain, index) => index === 0 ||
            domains[index - 1].ownerIndices.every((owner) =>
                domain.ownerIndices.includes(owner))),
        "cascade owner sets stay nested without double insertion");
        const active = domains.filter((domain) => domain.ownerIndices.length > 0);
        assert.ok(active.every((domain) =>
            domain.minimumDepthKm === active[0].minimumDepthKm &&
            domain.maximumDepthKm === active[0].maximumDepthKm),
        "lateral owner handoff cannot retime an existing source-depth field");

        for (const receiver of [[0, 0], [19, 0],
            [domains[0].planeCenterKm[0] +
                0.9 * domains[0].planeHalfExtentKm, 0]]) {
            const selection = visibility
                .resolveDirectionalCloudVisibilityCascadeSelection(
                    domains, receiver, 0);
            assert.ok(selection);
            const selected = domains[selection.cascadeIndex];
            assert.ok(Math.max(
                Math.abs(receiver[0] - selected.planeCenterKm[0]),
                Math.abs(receiver[1] - selected.planeCenterKm[1])) <=
                    selected.planeHalfExtentKm + 1e-9,
            "a valid receiver must be contained by its selected cascade");
            if (selection.nextCascadeIndex !== null) {
                const next = domains[selection.nextCascadeIndex];
                assert.ok(Math.max(
                    Math.abs(receiver[0] - next.planeCenterKm[0]),
                    Math.abs(receiver[1] - next.planeCenterKm[1])) <=
                        next.planeHalfExtentKm + 1e-9,
                "a blend fetch must also be contained by the next cascade");
            }
        }
    }

    const receiverDepth = 1.7;
    const texelCoordinate = (domain) =>
        ((0 - domain.planeCenterKm[0]) /
            (2 * domain.planeHalfExtentKm) + 0.5) *
                visibility.DIRECTIONAL_CLOUD_VISIBILITY_WIDTH - 0.5;
    assert.ok(Math.abs(texelCoordinate(right[0]) -
        texelCoordinate(left[0])) < 0.02,
    "small owner translation cannot step the lateral interpolation coordinate");
    assert.ok(Math.abs(
        visibility.directionalCloudVisibilityUnitAtDepth(right[0], receiverDepth) -
        visibility.directionalCloudVisibilityUnitAtDepth(left[0], receiverDepth)) <
            2e-4,
    "small owner translation cannot step the depth interpolation coordinate");
});

test("near core keeps a connected receiver owner in the finest source field", () => {
    const observer = [0, 0, 6_371];
    const source = [
        0.04923697036454922,
        -0.3330702618100658,
        0.9416155911236255,
    ];
    const owners = radiative.createCloudRadiativeOwnerDomains([
        ownerInput({
            ownerIndex: 0,
            layerIndex: 2,
            id: "oblique-near-spissatus",
            centerEastKm: 5.395809363958935,
            centerNorthKm: 20.961488344486355,
            majorRadiusKm: 7.525454768087189,
            minorRadiusKm: 5.104850940867603,
            orientationRadians: 2.9253061765981765,
            boundaryTransitionKm: 1.7221953943327784,
            baseAltitudeKm: 8.4,
            geometricDepthKm: 1.4,
        }),
    ]);
    const domains = visibility.createDirectionalCloudVisibilityDomains({
        owners,
        observerAtmosphereWorldKm: observer,
        sourceDirectionsAtmosphere: [source, [0, 0, 1]],
    }).domains.filter((domain) => domain.sourceIndex === 0);
    const projection = radiative.projectCloudRadiativeOwnerDomain(
        owners[0], observer,
        radiative.createCloudSourceAlignedBasis(source));
    for (const x of [
        projection.planeMinimumKm[0],
        projection.planeMaximumKm[0],
    ]) {
        for (const y of [
            projection.planeMinimumKm[1],
            projection.planeMaximumKm[1],
        ]) {
            assert.equal(
                visibility.resolveDirectionalCloudVisibilityCascadeSelection(
                    domains, [x, y], 0)?.cascadeIndex,
                0,
                "every corner of one near connected owner uses the finest cascade");
        }
    }
    const nearTexelKm = 2 * domains[0].planeHalfExtentKm /
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_WIDTH;
    const middleTexelKm = 2 * domains[1].planeHalfExtentKm /
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_WIDTH;
    assert.ok(nearTexelKm < middleTexelKm * 0.25,
        "near-owner direct visibility retains at least four times the lateral resolution");
});

test("source-aligned frames and domains remain continuous through high elevation", () => {
    const azimuth = 0.63;
    const directionAt = (up) => {
        const horizontal = Math.sqrt(1 - up * up);
        return [horizontal * Math.cos(azimuth),
            horizontal * Math.sin(azimuth), up];
    };
    const beforeDirection = directionAt(0.94 - 1e-6);
    const afterDirection = directionAt(0.94 + 1e-6);
    const before = radiative.createCloudSourceAlignedBasis(beforeDirection);
    const after = radiative.createCloudSourceAlignedBasis(afterDirection);
    for (const basis of [before, after]) {
        near(Math.hypot(...basis.rightAtmosphere), 1, 1e-12);
        near(Math.hypot(...basis.transverseAtmosphere), 1, 1e-12);
        near(dot(basis.directionToSourceAtmosphere, basis.rightAtmosphere),
            0, 1e-12);
        near(dot(basis.directionToSourceAtmosphere, basis.transverseAtmosphere),
            0, 1e-12);
    }
    assert.ok(Math.hypot(...before.rightAtmosphere.map((value, index) =>
        value - after.rightAtmosphere[index])) < 6e-6,
    "the former z=0.94 reference switch cannot roll the atlas");

    const owners = radiative.createCloudRadiativeOwnerDomains([ownerInput()]);
    const domainSet = (direction) =>
        visibility.createDirectionalCloudVisibilityDomains({
            owners,
            observerAtmosphereWorldKm: [0, 0, 6_371.001],
            sourceDirectionsAtmosphere: [direction, [0, 0.6, 0.8]],
        }).domains.filter((domain) => domain.sourceIndex === 0);
    const beforeDomains = domainSet(beforeDirection);
    const afterDomains = domainSet(afterDirection);
    beforeDomains.forEach((domain, index) => {
        assert.ok(Math.abs(domain.minimumDepthKm -
            afterDomains[index].minimumDepthKm) < 2e-4);
        assert.ok(Math.abs(domain.maximumDepthKm -
            afterDomains[index].maximumDepthKm) < 2e-4);
    });
});

test("finite-owner slab masks cull empty plane-depth work conservatively", () => {
    const owners = radiative.createCloudRadiativeOwnerDomains([
        ownerInput(),
        ownerInput({
            ownerIndex: 33,
            id: "overlapping-high-word-owner",
        }),
    ]);
    const domainSet = visibility.createDirectionalCloudVisibilityDomains({
        owners,
        observerAtmosphereWorldKm: [0, 0, 6_371.001],
        sourceDirectionsAtmosphere: [[0.4, 0.2, 0.8944271909999159],
            [-0.3, 0.7, 0.648074069840786]],
    });
    const input = {
        owners,
        domains: domainSet.domains,
        observerAtmosphereWorldKm: domainSet.observerAtmosphereWorldKm,
        sourceDirectionsAtmosphere: domainSet.sourceDirectionsAtmosphere,
    };
    const masks = visibility.createDirectionalCloudVisibilityOwnerMasks(input);
    const reversed = visibility.createDirectionalCloudVisibilityOwnerMasks({
        ...input, owners: [...owners].reverse(),
    });
    assert.equal(masks.byteLength,
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES);
    assert.deepEqual(masks, reversed,
        "owner input order cannot alter slab ownership");
    const summary = visibility.summarizeDirectionalCloudVisibilityOwnerMasks(
        masks);
    assert.ok(summary.activeSlabCount > 0);
    assert.equal(summary.ownerSlabAssociations,
        summary.activeSlabCount * 2,
        "coincident owners occupy the same conservative slabs");
    assert.equal(summary.ownerCandidateEvaluations,
        summary.hierarchyQuerySites * 2);
    assert.equal(summary.hierarchyQuerySites, 1_906_112,
        "qualified compact-Cu slab workload is a fixed regression ceiling");
    assert.equal(summary.ownerCandidateEvaluations, 3_812_224,
        "two coincident owners add work without expanding the active slab set");
    assert.ok(summary.hierarchyQuerySites <
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_PRODUCER_HIERARCHY_QUERY_SITES /
            10,
    "the compact Cu support must reject more than 90% of producer sites");

    let sawLowWord = false;
    let sawHighWord = false;
    for (let record = 0;
        record < visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT;
        record += 1) {
        sawLowWord ||= (masks[record * 2] & 1) !== 0;
        sawHighWord ||= (masks[record * 2 + 1] & 2) !== 0;
    }
    assert.equal(sawLowWord, true);
    assert.equal(sawHighWord, true);
    assert.equal(visibility.directionalCloudVisibilityOwnerMaskRecordIndex(
        0, 0, 0, 0, 0), 0);
    assert.equal(visibility.directionalCloudVisibilityOwnerMaskRecordIndex(
        1, 2, 47, 47, 30),
    visibility.DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_RECORD_COUNT - 1);
    assert.throws(() =>
        visibility.directionalCloudVisibilityOwnerMaskRecordIndex(
            0, 0, 0, 0, 31), /out of range/);
    assert.throws(() => visibility.summarizeDirectionalCloudVisibilityOwnerMasks(
        new Uint32Array(2)), /wrong byte length/);
});

test("renderer owns, updates, binds, and destroys the slab-mask buffer", () => {
    assert.match(skyRendererSource,
        /directionalCloudVisibilityOwnerMaskBuffer = device\.createBuffer\([\s\S]*?size: DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES[\s\S]*?BUFFER\.STORAGE \| BUFFER\.COPY_DST/);
    assert.match(skyRendererSource,
        /device\.queue\.writeBuffer\(\s*directionalCloudVisibilityOwnerMaskBuffer,[\s\S]*?createDirectionalCloudVisibilityOwnerMasks\(\{/);
    assert.match(skyRendererSource,
        /binding: 36,[\s\S]*?buffer: directionalCloudVisibilityOwnerMaskBuffer/);
    assert.match(skyRendererSource,
        /directionalCloudVisibilityOwnerMaskBuffer\.destroy\(\)/);
    assert.match(shaderValidatorSource,
        /entry\(36, computeReadOnlyStorage\([\s\S]*?directionalCloudVisibilityOwnerMaskBytes/);
    assert.match(shaderValidatorSource,
        /directionalCloudVisibilityOwnerMaskBuffer = device\.createBuffer\([\s\S]*?GPUBufferUsage\.STORAGE \| GPUBufferUsage\.COPY_DST/);
    assert.match(shaderValidatorSource,
        /binding: 36,[\s\S]*?directionalCloudVisibilityOwnerMaskBuffer/);
    assert.match(shaderValidatorSource,
        /directionalCloudVisibilityOwnerMaskBuffer\.destroy\(\)/);
});

test("the 176-byte uniform preserves six domains and translated plane clips", () => {
    const owners = radiative.createCloudRadiativeOwnerDomains([ownerInput()]);
    const set = visibility.createDirectionalCloudVisibilityDomains({
        owners,
        observerAtmosphereWorldKm: [0, 0, 6_371.001],
        sourceDirectionsAtmosphere: [[0.4, 0.2, 0.8944271909999159],
            [-0.3, 0.7, 0.648074069840786]],
    });
    const packed = visibility.packDirectionalCloudVisibilityUniform(
        [...set.domains].reverse(), 37);
    const repeat = visibility.packDirectionalCloudVisibilityUniform(
        set.domains, 37);
    assert.equal(packed.byteLength, 176);
    assert.deepEqual(packed, repeat);
    const unpacked = visibility.unpackDirectionalCloudVisibilityUniform(packed);
    assert.equal(unpacked.schema,
        visibility.DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA);
    assert.equal(unpacked.knotCount, 32);
    assert.equal(unpacked.cascadeCount, 3);
    assert.equal(unpacked.generation, 37);
    assert.equal(unpacked.sourceCount, 2);
    assert.equal(unpacked.layerCount, 193);
    assert.equal(unpacked.width, 96);
    assert.equal(unpacked.height, 96);
    unpacked.domains.forEach((domain, index) => {
        near(domain.minimumDepthKm, set.domains[index].minimumDepthKm, 2e-5);
        near(domain.maximumDepthKm, set.domains[index].maximumDepthKm, 2e-5);
        vecNear(domain.planeCenterKm, set.domains[index].planeCenterKm, 2e-5);
        near(domain.planeHalfExtentKm, set.domains[index].planeHalfExtentKm, 2e-5);
        near(domain.depthWarpReferenceExtentKm,
            set.domains[index].depthWarpReferenceExtentKm, 2e-5);
    });
    assert.equal(visibility.validateDirectionalCloudVisibilityDomains(
        set.domains).valid, true);
    const invalid = set.domains.map((domain, index) => index === 0
        ? { ...domain, inverseDepthSpanPerKm: 99 }
        : domain);
    assert.equal(visibility.validateDirectionalCloudVisibilityDomains(
        invalid).valid, false);
    assert.throws(() => visibility.packDirectionalCloudVisibilityUniform(
        invalid, 38), /Invalid visibility domains/);
});

test("one homogeneous RGB slab matches analytic receiver-depth Beer transport", () => {
    const domain = simpleDomain();
    const sigma = [0.2, 0.3, 0.4];
    const extinction = (depth) => depth >= 10 && depth <= 20
        ? sigma : [0, 0, 0];
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 25), [1, 1, 1], 1e-6, "sourceward");
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 15), [Math.exp(-1), Math.exp(-1.5), Math.exp(-2)],
    1e-6, "inside");
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 5), [Math.exp(-2), Math.exp(-3), Math.exp(-4)],
    1e-6, "behind");
    vecNear(visibility.sampleDirectionalCloudVisibilityTransmittance(
        knots, domain, 15), [Math.exp(-1), Math.exp(-1.5), Math.exp(-2)],
    1e-6, "Beer transmittance");
});

test("partial footprint coverage averages Beer visibility after four fixed rays", () => {
    const domain = simpleDomain();
    const extinction = (depth, lateralNodeIndex) =>
        depth >= 10 && depth <= 20 && lateralNodeIndex < 2
            ? [4, 4, 4] : [0, 0, 0];
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    const expected = 0.5 * (1 + Math.exp(-24));
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 5), [expected, expected, expected], 1e-6,
    "E[exp(-tau)] preserves half-clear coverage");
    assert.ok(expected > Math.exp(-20) * 100_000_000,
        "exp(-E[tau]) would create the rejected dark-grey footprint");
    const empty = visibility.buildDirectionalCloudVisibilityKnots(
        simpleDomain({ minimumDepthKm: 0, maximumDepthKm: 0,
            inverseDepthSpanPerKm: 0, ownerIndices: [] }), extinction);
    assert.ok(empty.every((value) => value === 1),
        "inactive domains are exactly clear visibility");
});

test("near-clear visibility remains clear after rgba16float storage", () => {
    const domain = simpleDomain();
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, (depth) => depth >= 10 && depth <= 20
            ? [1e-5, 2e-5, 4e-5] : [0, 0, 0]);
    const stored = visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 5).map(quantizeUnitFloat16);
    assert.ok(stored.every((value) => value >= 0.9995 && value <= 1),
        `near-clear half-float visibility cannot become a grey tile: ${stored}`);
});

test("two separated slabs never let a cloud behind the receiver shadow it", () => {
    const domain = simpleDomain();
    const sourceward = [0.25, 0.2, 0.15];
    const antiSource = [0.1, 0.2, 0.3];
    const extinction = (depth) => {
        if (depth >= 22 && depth <= 26) return sourceward;
        if (depth >= 8 && depth <= 12) return antiSource;
        return [0, 0, 0];
    };
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 28), [1, 1, 1], 1e-6);
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 16), [Math.exp(-1), Math.exp(-0.8), Math.exp(-0.6)], 1e-6,
    "receiver in transparent gap");
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 10), [Math.exp(-1.2), Math.exp(-1.2), Math.exp(-1.2)], 1e-6,
    "receiver inside anti-source slab");
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 4), [Math.exp(-1.4), Math.exp(-1.6), Math.exp(-1.8)], 1e-6,
    "receiver behind both slabs");
});

test("separated slabs stay on coherent lateral rays through the suffix scan", () => {
    const domain = simpleDomain();
    const extinction = (depth, lateralNodeIndex) => {
        if (lateralNodeIndex === 0 && depth >= 22 && depth <= 26) {
            return [1, 1, 1];
        }
        if (lateralNodeIndex === 1 && depth >= 8 && depth <= 12) {
            return [2, 2, 2];
        }
        return [0, 0, 0];
    };
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    const between = (3 + Math.exp(-4)) / 4;
    const behind = (2 + Math.exp(-4) + Math.exp(-8)) / 4;
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 16), [between, between, between], 1e-6,
    "only the sourceward fixed ray participates between slabs");
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 4), [behind, behind, behind], 1e-6,
    "independent lateral Beer products survive separated depths");
});

test("broad source-depth support is warped monotonically without reversing receiver-to-source tau", () => {
    const domain = simpleDomain({
        minimumDepthKm: -240,
        maximumDepthKm: 320,
        inverseDepthSpanPerKm: 1 / 560,
        planeHalfExtentKm: 20,
    });
    assert.equal(visibility.directionalCloudVisibilityUsesDepthWarp(domain), true);
    let previousDepth = -Infinity;
    for (let knot = 0; knot < 32; knot += 1) {
        const unit = knot / 31;
        const depth = visibility.directionalCloudVisibilityDepthAtUnit(domain, unit);
        assert.ok(depth > previousDepth);
        near(visibility.directionalCloudVisibilityUnitAtDepth(domain, depth),
            unit, 2e-12, "depth-warp inverse");
        previousDepth = depth;
    }
    near(visibility.directionalCloudVisibilityDepthAtUnit(domain, 0), -240,
        1e-12, "warped minimum endpoint");
    near(visibility.directionalCloudVisibilityDepthAtUnit(domain, 1), 320,
        1e-12, "warped maximum endpoint");
    const observerUnit = visibility.directionalCloudVisibilityUnitAtDepth(domain, 0);
    const observerInterval =
        visibility.directionalCloudVisibilityDepthAtUnit(domain,
            observerUnit + 1 / 62) -
        visibility.directionalCloudVisibilityDepthAtUnit(domain,
            observerUnit - 1 / 62);
    assert.ok(observerInterval < 560 / 31 * 0.35,
        "near-observer depth resolution must improve over a uniform broad span");

    const extinction = (depth) => {
        const density = 0.18 * Math.exp(-0.5 * ((depth - 4) / 1.8) ** 2) +
            0.03 * Math.exp(-0.5 * ((depth - 180) / 18) ** 2);
        return [density, density * 1.1, density * 1.2];
    };
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    vecNear(visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 321), [1, 1, 1], 1e-8,
    "a receiver sourceward of all finite support is clear");
    const nearReceiver = visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, 0);
    const behindReceiver = visibility.sampleDirectionalCloudVisibilityKnots(
        knots, domain, -241);
    assert.ok(behindReceiver.every((value, channel) =>
        value <= nearReceiver[channel] && value > 0),
    "moving anti-source can only reduce source visibility");
});

test("one source uses identical physical depth knots in every cascade", () => {
    const domains = [6, 64, 192].map((planeHalfExtentKm, cascadeIndex) =>
        simpleDomain({
            cascadeIndex,
            minimumDepthKm: -240,
            maximumDepthKm: 320,
            inverseDepthSpanPerKm: 1 / 560,
            planeHalfExtentKm,
            depthWarpReferenceExtentKm: 6,
        }));
    assert.ok(domains.every((domain) =>
        visibility.directionalCloudVisibilityUsesDepthWarp(domain)));
    for (let knot = 0; knot < 32; knot += 1) {
        const depths = domains.map((domain) =>
            visibility.directionalCloudVisibilityDepthAtUnit(
                domain, knot / 31));
        depths.slice(1).forEach((depth) => near(depth, depths[0], 1e-12,
            "source-wide physical knot"));
    }
    const extinction = (depth) => {
        const density = Math.exp(-0.5 * ((depth - 214.45) / 0.25) ** 2) /
            (Math.sqrt(2 * Math.PI) * 0.25);
        return [density, density * 1.1, density * 1.2];
    };
    const knotFields = domains.map((domain) =>
        visibility.buildDirectionalCloudVisibilityKnots(domain, extinction));
    assert.deepEqual(knotFields[1], knotFields[0],
        "middle cascade cannot independently miss or over-weight a narrow slab");
    assert.deepEqual(knotFields[2], knotFields[0],
        "far cascade cannot independently miss or over-weight a narrow slab");
    for (const receiverDepth of [15.2, 19.2, 48.64, 61.44]) {
        const values = domains.map((domain, index) =>
            visibility.sampleDirectionalCloudVisibilityKnots(
                knotFields[index], domain, receiverDepth));
        values.slice(1).forEach((value) => vecNear(value, values[0], 1e-7,
            "cascade blend-band visibility agreement"));
    }
});

test("a near-empty source retains a stable warp reference for its far cascade", () => {
    const owners = radiative.createCloudRadiativeOwnerDomains([
        ownerInput({ ownerIndex: 0, id: "far-east", centerEastKm: 120,
            centerNorthKm: 0 }),
        ownerInput({ ownerIndex: 1, id: "far-west", centerEastKm: -120,
            centerNorthKm: 0 }),
    ]);
    const set = visibility.createDirectionalCloudVisibilityDomains({
        owners,
        observerAtmosphereWorldKm: [0, 0, 6_371.001],
        sourceDirectionsAtmosphere: [
            [0.2, 0.1, 0.9746794344808963], [0, 0, 1],
        ],
    });
    assert.equal(set.validation.valid, true, set.validation.reasons.join(", "));
    const domains = set.domains.filter((domain) => domain.sourceIndex === 0);
    assert.deepEqual(domains[0].ownerIndices, []);
    assert.deepEqual(domains[1].ownerIndices, []);
    assert.deepEqual(domains[2].ownerIndices, [0, 1]);
    assert.equal(domains[0].inverseDepthSpanPerKm, 0);
    assert.equal(visibility.directionalCloudVisibilityUsesDepthWarp(domains[2]),
        true);
    domains.forEach((domain) => near(domain.depthWarpReferenceExtentKm,
        domains[0].planeHalfExtentKm, 1e-12,
    "inactive near record still owns the source-wide reference extent"));
    const packed = visibility.packDirectionalCloudVisibilityUniform(
        set.domains, 9);
    const unpacked = visibility.unpackDirectionalCloudVisibilityUniform(packed)
        .domains.filter((domain) => domain.sourceIndex === 0);
    unpacked.forEach((domain) => near(domain.depthWarpReferenceExtentKm,
        unpacked[0].planeHalfExtentKm, 1e-6,
    "WGSL-visible cascade-zero extent survives an empty near owner mask"));
});

test("overlapping owners add optical depth before Beer visibility independent of order", () => {
    const domain = simpleDomain();
    const fields = [
        (depth) => depth >= 6 && depth <= 18 ? [0.08, 0.1, 0.12] : [0, 0, 0],
        (depth) => depth >= 12 && depth <= 24 ? [0.04, 0.03, 0.02] : [0, 0, 0],
        (depth) => depth >= 15 && depth <= 17 ? [0.2, 0.1, 0.05] : [0, 0, 0],
    ];
    const combined = (ordered) => (depth) => ordered.reduce((sum, field) => {
        const value = field(depth);
        return sum.map((channel, index) => channel + value[index]);
    }, [0, 0, 0]);
    const forward = visibility.buildDirectionalCloudVisibilityKnots(
        domain, combined(fields));
    const reverse = visibility.buildDirectionalCloudVisibilityKnots(
        domain, combined([...fields].reverse()));
    assert.deepEqual(forward, reverse);
    for (let knot = 0; knot < 31; knot += 1) {
        for (let channel = 0; channel < 3; channel += 1) {
            assert.ok(forward[knot * 3 + channel] <=
                forward[(knot + 1) * 3 + channel] + 1e-7,
            "cumulative visibility must increase sourceward");
        }
    }
});

test("depth reconstruction is C1 and lateral reconstruction is continuous", () => {
    const width = 9;
    const height = 8;
    const grid = makeVisibilityGrid(width, height, (x, y, knot) => {
        const spatial = 0.45 + 0.08 * x + 0.035 * y +
            0.22 * Math.sin(x * 0.91 + y * 0.37);
        const remaining = (31 - knot) / 31;
        const tau = Math.max(0, spatial) * remaining ** 1.35;
        return [Math.exp(-tau), Math.exp(-tau * 1.17),
            Math.exp(-tau * 1.34)];
    });
    const domain = simpleDomain();
    const sampleLateral = (x) =>
        visibility.sampleDirectionalCloudVisibilityLateralGrid(
            grid, width, height, 11, [x, 3.27])[0];
    const epsilon = 1e-3;
    const lateralBoundary = 4;
    const lateralCenter = sampleLateral(lateralBoundary);
    near(sampleLateral(lateralBoundary - epsilon), lateralCenter, 2e-4,
        "left lateral limit");
    near(sampleLateral(lateralBoundary + epsilon), lateralCenter, 2e-4,
        "right lateral limit");
    const leftCellMidpoint = sampleLateral(lateralBoundary - 0.5);
    near(leftCellMidpoint,
        0.5 * (sampleLateral(lateralBoundary - 1) + lateralCenter), 1e-6,
        "lateral reconstruction follows the hardware-linear tent");

    const sampleDepth = (depth) =>
        visibility.sampleDirectionalCloudVisibilityGrid(
            grid, width, height, domain, [4.13, 3.27], depth)[0];
    const depthBoundary = 13;
    const depthCenter = sampleDepth(depthBoundary);
    near(sampleDepth(depthBoundary - epsilon), depthCenter, 2e-4,
        "lower depth limit");
    near(sampleDepth(depthBoundary + epsilon), depthCenter, 2e-4,
        "upper depth limit");
    const depthLeftSlope = (depthCenter -
        sampleDepth(depthBoundary - epsilon)) / epsilon;
    const depthRightSlope = (sampleDepth(depthBoundary + epsilon) -
        depthCenter) / epsilon;
    near(depthLeftSlope, depthRightSlope, 2e-3,
        "depth first derivative");

    let previousVisibility = 0;
    for (let depth = -1; depth <= 32; depth += 0.025) {
        const value = sampleDepth(depth);
        assert.ok(value >= -1e-7 && value <= 1 + 1e-7);
        assert.ok(value >= previousVisibility - 2e-6,
            `visibility must increase toward the source at depth ${depth}`);
        previousVisibility = value;
    }
});

test("prefiltered owner motion crosses texel boundaries without a shadow step", () => {
    const width = 8;
    const height = 8;
    const transition = (inner, outer, value) => {
        const unit = Math.max(0, Math.min(1,
            (outer - value) / (outer - inner)));
        return unit * unit * (3 - 2 * unit);
    };
    const gridAtOwnerX = (ownerX) => makeVisibilityGrid(
        width, height, (x, y, knot) => {
            const footprint = visibility
                .createDirectionalCloudVisibilityLateralSamples([x, y], 1)
                .reduce((sum, sample) => sum + sample.weight * transition(
                    1.05, 1.55,
                    Math.hypot(sample.planeCoordinateKm[0] - ownerX,
                        sample.planeCoordinateKm[1] - 3.1)), 0);
            const tau = 2.2 * footprint * (31 - knot) / 31;
            return [Math.exp(-tau), Math.exp(-tau * 1.08),
                Math.exp(-tau * 1.16)];
        });
    const domain = simpleDomain();
    const response = (ownerX) =>
        visibility.sampleDirectionalCloudVisibilityGrid(
            gridAtOwnerX(ownerX), width, height, domain,
            [3.72, 3.18], 10.4)[0];
    const motionBoundary = 4;
    const epsilon = 0.002;
    const left = response(motionBoundary - epsilon);
    const center = response(motionBoundary);
    const right = response(motionBoundary + epsilon);
    assert.ok(Math.max(Math.abs(center - left), Math.abs(right - center)) <
        0.003, "owner motion cannot expose a plane-cell shadow step");
    near((center - left) / epsilon, (right - center) / epsilon, 0.04,
        "owner-motion first derivative");
    assert.ok([left, center, right].every((value) =>
        value >= 0 && value <= 1));
});

test("cascade transitions blend visibility and the true far exterior is clear", () => {
    const domains = [20, 64, 200].map((extent, cascadeIndex) =>
        simpleDomain({ cascadeIndex, planeHalfExtentKm: extent }));
    const knotField = (value) => {
        const field = new Float32Array(32 * 3);
        for (let knot = 0; knot < 32; knot += 1) {
            field.set([value, value, value], knot * 3);
        }
        return field;
    };
    const columns = domains.map((domain, index) => ({
        domain,
        visibilityKnots: knotField([0.8, 0.5, 0.2][index]),
    }));
    const center = visibility.sampleDirectionalCloudVisibilityCascadeColumn(
        columns, [0, 0], 10);
    vecNear(center, [0.8, 0.8, 0.8]);
    const overlap = visibility.sampleDirectionalCloudVisibilityCascadeColumn(
        columns, [18, 0], 0);
    assert.ok(overlap[0] < 0.8 && overlap[0] > 0.5,
        "nested cascades blend visibility directly");
    vecNear(visibility.sampleDirectionalCloudVisibilityCascadeColumn(
        columns, [199.9, 0], 10), [0.2, 0.2, 0.2], 1e-6,
    "inside far support");
    vecNear(visibility.sampleDirectionalCloudVisibilityCascadeColumn(
        columns, [201, 0], 10), [1, 1, 1], 1e-6,
    "true exterior");
});

test("32 knots stay within the stated error against a 128-step reference", () => {
    const domain = simpleDomain({
        maximumDepthKm: 40,
        inverseDepthSpanPerKm: 1 / 40,
        planeHalfExtentKm: 64,
    });
    const gaussian = (depth, center, width, amplitude) =>
        amplitude * Math.exp(-0.5 * ((depth - center) / width) ** 2);
    const extinction = (depth) => [
        gaussian(depth, 9, 2.6, 0.12) + gaussian(depth, 27, 4.8, 0.055),
        gaussian(depth, 9.4, 2.8, 0.14) + gaussian(depth, 26, 5.1, 0.07),
        gaussian(depth, 10, 3.1, 0.17) + gaussian(depth, 25, 5.5, 0.09),
    ];
    const knots = visibility.buildDirectionalCloudVisibilityKnots(
        domain, extinction);
    let squaredError = 0;
    let count = 0;
    let maximumError = 0;
    for (let depth = -2; depth <= 42; depth += 0.25) {
        const approximate = visibility.sampleDirectionalCloudVisibilityTransmittance(
            knots, domain, depth);
        const reference = visibility.integrateDirectionalCloudVisibilityReference(
            domain, depth, extinction, 128);
        for (let channel = 0; channel < 3; channel += 1) {
            const error = Math.abs(approximate[channel] - reference[channel]);
            maximumError = Math.max(maximumError, error);
            squaredError += error * error;
            count += 1;
        }
    }
    assert.ok(maximumError <= 0.03, `maximum T error ${maximumError}`);
    assert.ok(Math.sqrt(squaredError / count) <= 0.01,
        `RMS T error ${Math.sqrt(squaredError / count)}`);
});

test("WGSL uses footprint integration and bounded reconstruction", () => {
    assert.match(webgpuShaderSource,
        /fn coupling_smooth_visibility_layer\([\s\S]*?textureSampleLevel\([\s\S]*?clamp\(uv/);
    assert.doesNotMatch(webgpuShaderSource,
        /fn coupling_smooth_visibility_layer\([\s\S]*?smooth_amount = amount \* amount/);
    assert.match(webgpuShaderSource,
        /fn coupling_monotone_tangent\([\s\S]*?previous_slope \* next_slope > vec3<f32>\(0\.0\)/);
    assert.match(webgpuShaderSource,
        /fn coupling_monotone_depth_visibility\([\s\S]*?clamp\(reconstructed,[\s\S]*?min\(lower_visibility, upper_visibility\),[\s\S]*?max\(lower_visibility, upper_visibility\)\)/);
    assert.match(webgpuShaderSource,
        /COUPLING_GL_NODES = array<f32, 2>\([\s\S]*?-0\.5773502692, 0\.5773502692/);
    assert.match(webgpuShaderSource,
        /for \(var lateral_index = 0u; lateral_index < 4u;[\s\S]*?for \(var quadrature = 0u; quadrature < 4u;[\s\S]*?if \(!refine_high_ice_depth && quadrature >= 2u\) \{ break; \}[\s\S]*?COUPLING_LATERAL_GL_OFFSETS\[lateral_index\]/);
    assert.match(webgpuShaderSource,
        /let interval_weight = depth_weight \* interval_length \* 0\.5;[\s\S]*?let resolved_interval_tau = coupling_sample\.extinction \*[\s\S]*?interval_weight;[\s\S]*?interval_tau \+=[\s\S]*?cloud_unresolved_footprint_optical_depth_signal\([\s\S]*?resolved_interval_tau/,
    "each positive source quadrature interval must accumulate its expected Beer optical depth");
    assert.match(webgpuShaderSource,
        /visibility_sum \+= exp\(-coupling_tau_scan_b\[scan_index\]\.rgb\) \* 0\.25/,
    "Beer visibility must be averaged after each coherent suffix scan");
    assert.doesNotMatch(webgpuShaderSource,
        /interval_length \* 0\.125|exp\(-coupling_cloud_source_/,
    "neither pre-Beer lateral averaging nor consumer re-exponentiation is allowed");
    assert.doesNotMatch(webgpuShaderSource,
        /COUPLING_LATERAL_ROTATIONS|lateral_rotation|invocation\.x & 1u/);
    assert.doesNotMatch(webgpuShaderSource, /pair_sample/);
    assert.doesNotMatch(webgpuShaderSource,
        /mix\(lower_visibility, upper_visibility, knot_fraction\)/);
    assert.doesNotMatch(webgpuShaderSource,
        /abs\(dot\(source_direction, local_up\)\) > 0\.94/);
    assert.match(webgpuShaderSource,
        /let inverse = 1\.0 \/ \(1\.0 \+ source_direction\.z\)/);
    assert.match(webgpuShaderSource,
        /plane_center_pairs: array<vec4<f32>, 3>/);
    assert.match(webgpuShaderSource,
        /fn coupling_visibility_depth_warp_reference_extent\([\s\S]*?coupling_visibility_domain\(source_index, 0u\)\.w/);
    assert.match(webgpuShaderSource,
        /fn coupling_visibility_depth_at_unit\([\s\S]*?coupling_visibility_depth_warp_enabled\(domain, source_index\)[\s\S]*?exp\(warped\) - exp\(-warped\)/);
    assert.match(webgpuShaderSource,
        /fn coupling_visibility_unit_at_depth\([\s\S]*?coupling_visibility_depth_warp_enabled\(domain, source_index\)[\s\S]*?coupling_visibility_asinh\(depth_km \/ scale_km\)/);
    // Guard the exact established atmosphere-to-renderer affine permutation.
    assert.match(webgpuShaderSource,
        /let point = vec3<f32>\(\s*atmosphere_point\.x, atmosphere_point\.z, atmosphere_point\.y\)/);
    assert.match(webgpuShaderSource,
        /@compute @workgroup_size\(2, 2, 32\)\s*fn cloud_coupling_shadow_compute/);
    const cascadeSampler = webgpuShaderSource.match(
        /fn coupling_cascade_visibility_at\([\s\S]*?\n}\n\nfn coupling_visibility_cascade_importance/,
    )?.[0] ?? "";
    assert.equal([...cascadeSampler.matchAll(
        /coupling_smooth_visibility_layer\(/g)].length, 4,
    "one bounded lateral fetch for each monotone depth knot");
    assert.match(cascadeSampler,
        /plane - plane_center\) \/ \(2\.0 \* extent\)/,
    "translated cascades must reconstruct in their own plane frame");
    const sourceSampler = webgpuShaderSource.match(
        /fn coupling_cloud_source_visibility_at\([\s\S]*?\n}\n\nfn coupling_cloud_source_transmittance_at/,
    )?.[0] ?? "";
    assert.doesNotMatch(sourceSampler,
        /receiver_distance_km|length\(relative\)/,
    "source-aligned cascades cannot introduce spherical receiver shells");
    assert.match(sourceSampler,
        /coupling_visibility_cascade_importance\(\s*plane, source_index/);
    assert.match(sourceSampler,
        /if \(blend_amount > 0\.0 && next_importance <= 1\.0\) \{[\s\S]*?let next_visibility = coupling_cascade_visibility_at[\s\S]*?mix\(current_visibility, next_visibility, blend_amount\)/,
    "the second four-fetch cascade lookup must be lazy and in-bounds");
    const aerialSampler = webgpuShaderSource.match(
        /fn coupling_cloud_source_aerial_transmittance_at\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    assert.match(aerialSampler,
        /far_cascade = COUPLING_SHADOW_CASCADE_COUNT - 1u/);
    assert.match(aerialSampler, /coupling_cascade_visibility_at\(/);
    assert.doesNotMatch(aerialSampler,
        /COUPLING_SHADOW_BLEND|near_importance|middle_importance/,
    "long aerial integration cannot expose view-dependent cascade transitions");
    assert.match(shadowedAtmosphereWgslSource,
        /cloud_transfer = clamp\([\s\S]*?coupling_cloud_source_aerial_transmittance_at\(/,
    "atmosphere loss uses one uniformly band-limited world-space visibility field");

    const atmosphereLoss = (shadowedAtmosphereWgslSource +
        webgpuShaderSource).match(
        /fn cloud_clear_segment_to_point_transmittance\([\s\S]*?\n}\n\n@fragment\s*fn atmosphere_fragment/,
    )?.[0] ?? "";
    assert.match(atmosphereLoss,
        /atmo_safe_div\(origin_boundary_transmittance,[\s\S]*?point_to_space/,
    "upward camera-to-node transfer uses observer-to-space / node-to-space");
    assert.match(atmosphereLoss,
        /let origin_boundary_transmittance = atmo_transmittance_to_space\(\s*start_world, boundary_direction\)/,
    "the invariant segment-origin boundary transfer is evaluated once per segment");
    assert.match(atmosphereLoss,
        /fn cloud_shadowed_atmosphere_loss_node\([\s\S]*?camera_transfer \* sample\.removed_source_coefficient/);
    assert.match(atmosphereLoss,
        /COUPLING_AERIAL_SHADOW_KRONROD_BASE_WEIGHT[\s\S]*?sample_a\.loss_integrand \+ sample_b\.loss_integrand/,
    "embedded refinement retains locally weighted base nodes");
    assert.match(atmosphereLoss,
        /let ground_throughput = cloud_clear_segment_to_point_transmittance\([\s\S]*?removed_radiance \+= ground_throughput/);
    assert.doesNotMatch(atmosphereLoss,
        /removed_source \* \(vec3<f32>\(1\.0\) - step_transmittance\)|sample_a\.removed_source_coefficient \* weight_a/,
    "no interval-averaged source coefficient path may remain");

    const producer = webgpuShaderSource.match(
        /\/\/ World-space source-aligned cascades are written by the same density[\s\S]*?\nfn lighting_for_layer\(/,
    )?.[0] ?? "";
    assert.match(producer,
        /@binding\(36\) var<storage, read> coupling_shadow_owner_masks|coupling_shadow_owner_masks\[record_index\]/);
    assert.match(producer,
        /fn cloud_coupling_filtered_macro_owner_sample\([\s\S]*?textureLoad\([\s\S]*?cloud_macro_majorants[\s\S]*?cloud_macro_volume_rgba/);
    const filteredMacroSample = producer.match(
        /fn cloud_coupling_filtered_macro_owner_sample\([\s\S]*?\n}\n\nfn cloud_coupling_filtered_owner_extinction/,
    )?.[0] ?? "";
    assert.match(filteredMacroSample,
        /lateral_filter_radius_km: f32,[\s\S]*?depth_filter_radius_km: f32[\s\S]*?let coupling_filter_radius_km = max\([\s\S]*?lateral_filter_radius_km[\s\S]*?cloud_morphology_cirrus_fibratus_subvoxel_density\([\s\S]*?coupling_filter_radius_km,[\s\S]*?ray_step_length_km[\s\S]*?ray_direction_owner_local\)/,
    "radiometric Cirrus shadows must footprint-filter the same physical fibre field as the camera");
    assert.match(producer,
        /let lateral_filter_radius_km = max\([\s\S]*?length\(plane_texel_width\) \* 0\.10206207261596575[\s\S]*?let quadrature_support_km = abs\(interval_length\)[\s\S]*?let depth_filter_radius_km = quadrature_support_km \*[\s\S]*?cloud_coupling_masked_extinction\(\s*point, owner_mask, lateral_filter_radius_km,[\s\S]*?depth_filter_radius_km,[\s\S]*?quadrature_support_km, ray_direction_renderer\)/,
    "producer filtering must preserve separate source-plane and receiver-depth support");
    assert.doesNotMatch(producer, /volume_filter_radius_km/,
    "anisotropic source support must not select an over-blurred isotropic texture mip");
    assert.match(filteredMacroSample,
        /cloud_resolved_high_ice_material\([\s\S]*?coupling_filter_radius_km,[\s\S]*?max\(0\.0, depth_filter_radius_km\),[\s\S]*?ray_direction_owner_local\)/,
    "every high-cloud DSM sample must filter the camera's stationary 3-D ice field along the source ray");
    assert.doesNotMatch(filteredMacroSample,
        /2\.0 \* minor_radius \/ 47\.0|geometric_depth \/ 47\.0/,
    "one fixed atlas-voxel blur cannot serve every source-plane cascade");
    assert.match(morphologyShaderSource,
        /fn cloud_morphology_cirrus_fibratus_subvoxel_density\([\s\S]*?let swept_cross_km = half_step_km[\s\S]*?let swept_vertical_km = half_step_km[\s\S]*?let covariance_cross = cross_radius_km \* cross_radius_km[\s\S]*?let covariance_cross_vertical =[\s\S]*?let covariance_determinant = max\([\s\S]*?let area_preservation = saturate\([\s\S]*?cross_radius_km \* vertical_radius_km\s*\/[\s\S]*?sqrt\(covariance_determinant\)/,
    "pixel-cone and finite-stratum fibre integration must preserve integrated condensate area");
    assert.doesNotMatch(filteredMacroSample,
        /potential_occupancy|filtered_occupancy|surface_material|surface_density/,
    "conservative displacement support cannot become radiometric extinction");
    assert.match(producer,
        /fn cloud_coupling_masked_extinction\([\s\S]*?firstTrailingBit\(low\)[\s\S]*?firstTrailingBit\(high\)/);
    assert.match(producer,
        /cloud_morphology_evaluate_owner\([\s\S]*?cloud_local_mass_extinction\(/);
    assert.match(producer,
        /plane = coupling_visibility_plane_center\([\s\S]*?coupling_visibility_depth_at_unit\(/,
    "producer plane and depth coordinates must mirror the translated consumer");
    assert.doesNotMatch(producer, /\bdensity_at\s*\(/,
        "cascade production cannot enter the procedural view-density graph");
    assert.doesNotMatch(producer,
        /\bcloud_spectral_extinction_coefficient_at\s*\(/,
    "cascade production must fuse density and material owner traversal");
    assert.doesNotMatch(producer,
        /\bcloud_macro_displaced_boundary_density\s*\(/,
    "cascade production must integrate out exterior procedural detail");
    assert.doesNotMatch(producer, /\bcloud_macro_sdf_normal\s*\(/);
});

test("visibility invalidation is deterministic and contains only physical dependencies", () => {
    const domains = [0, 1].flatMap((sourceIndex) => [0, 1, 2].map(
        (cascadeIndex) => simpleDomain({
            sourceIndex,
            cascadeIndex,
            planeHalfExtentKm: [20, 64, 192][cascadeIndex],
            ownerIndices: [2, 0, 1],
        })));
    const input = {
        cloudRuntimeSignature: "clouds-a",
        morphologySignature: "morph-a",
        extinctionSignature: "optics-a",
        advectionEpoch: 4,
        observerAtmosphereWorldKm: [0, 0, 6_371.001],
        sourceDirectionsAtmosphere: [[0.2, 0.4, 0.8944271909999159],
            [-0.4, 0.2, 0.8944271909999159]],
        domains,
    };
    const signature = visibility.createDirectionalCloudVisibilityInvalidationSignature(
        input);
    assert.match(signature,
        new RegExp(`"schema":${visibility.DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA}`),
        "visibility representation changes must invalidate prior tau atlases");
    assert.equal(signature,
        visibility.createDirectionalCloudVisibilityInvalidationSignature({
            ...input,
            domains: [...domains].reverse(),
        }));
    assert.notEqual(signature,
        visibility.createDirectionalCloudVisibilityInvalidationSignature({
            ...input, advectionEpoch: 5,
        }));
    assert.notEqual(signature,
        visibility.createDirectionalCloudVisibilityInvalidationSignature({
            ...input,
            sourceDirectionsAtmosphere: [[0.3, 0.4, 0.8660254037844386],
                input.sourceDirectionsAtmosphere[1]],
        }));
    assert.doesNotMatch(signature, /radiometry|exposure|palette|grade/);
});

test("generation publication is atomic and stale or failed work cannot replace active data", () => {
    let state = visibility.createDirectionalCloudVisibilityPublicationState({
        generation: 7,
        signature: "old",
        payload: "old-complete-atlas",
    });
    state = visibility.beginDirectionalCloudVisibilityGeneration(
        state, "new", "new-complete-atlas");
    const generation = state.pending.generation;
    for (let source = 0; source < 2; source += 1) {
        for (let cascade = 0; cascade < 3; cascade += 1) {
            if (source === 1 && cascade === 2) continue;
            state = visibility.completeDirectionalCloudVisibilitySourceCascade(
                state, generation, source, cascade);
        }
    }
    let publication = visibility.publishDirectionalCloudVisibilityGeneration(
        state, generation);
    assert.equal(publication.published, false);
    assert.equal(publication.state.active.payload, "old-complete-atlas");
    state = visibility.completeDirectionalCloudVisibilitySourceCascade(
        state, generation, 1, 2);
    publication = visibility.publishDirectionalCloudVisibilityGeneration(
        state, generation);
    assert.equal(publication.published, true);
    assert.equal(publication.state.active.payload, "new-complete-atlas");
    assert.equal(publication.state.pending, null);

    state = visibility.beginDirectionalCloudVisibilityGeneration(
        publication.state, "failed", "partial-atlas");
    const failedGeneration = state.pending.generation;
    for (let source = 0; source < 2; source += 1) {
        for (let cascade = 0; cascade < 3; cascade += 1) {
            state = visibility.completeDirectionalCloudVisibilitySourceCascade(
                state, failedGeneration, source, cascade,
                !(source === 0 && cascade === 1));
        }
    }
    publication = visibility.publishDirectionalCloudVisibilityGeneration(
        state, failedGeneration);
    assert.equal(publication.published, false);
    assert.equal(publication.state.active.payload, "new-complete-atlas");
    const stale = visibility.completeDirectionalCloudVisibilitySourceCascade(
        publication.state, generation, 0, 0);
    assert.equal(stale, publication.state);
    state = visibility.cancelDirectionalCloudVisibilityGeneration(
        publication.state, failedGeneration);
    assert.equal(state.pending, null);
    assert.equal(state.active.payload, "new-complete-atlas");
});

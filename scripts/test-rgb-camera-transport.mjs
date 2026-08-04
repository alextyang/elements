import assert from "node:assert/strict";
import test from "node:test";

const EPSILON = 1e-12;
const PHOTOPIC = [0.2126, 0.7152, 0.0722];
const GAUSS_WEIGHTS = [
    0.0235876682, 0.0534696629, 0.0800391643, 0.1015837134,
    0.1167462683, 0.1245735229, 0.1245735229, 0.1167462683,
    0.1015837134, 0.0800391643, 0.0534696629, 0.0235876682,
];
const vector = (operation, ...values) => [0, 1, 2].map((channel) =>
    operation(...values.map((value) => value[channel])));
const add = (first, second) => vector((a, b) => a + b, first, second);
const multiply = (first, second) => vector((a, b) => a * b, first, second);
const exp = (value) => value.map((channel) => Math.exp(channel));
const scale = (value, amount) => value.map((channel) => channel * amount);
const luminance = (value) => value.reduce(
    (sum, channel, index) => sum + channel * PHOTOPIC[index], 0);
const close = (actual, expected, tolerance = EPSILON) => actual.forEach(
    (value, channel) => assert.ok(
        Math.abs(value - expected[channel]) <= tolerance,
        `channel ${channel}: ${value} != ${expected[channel]}`,
    ));

const identity = () => ({ radiance: [0, 0, 0], transmittance: [1, 1, 1] });
const compose = (front, back) => ({
    radiance: add(front.radiance,
        multiply(front.transmittance, back.radiance)),
    transmittance: multiply(front.transmittance, back.transmittance),
});
const homogeneousSegment = (sigma, source, distance) => {
    const transmittance = exp(scale(sigma, -distance));
    return {
        radiance: multiply(source,
            transmittance.map((channel) => 1 - channel)),
        transmittance,
    };
};
const integrateCoefficients = (extinction, sourceCoefficient, distance) => {
    const transmittance = exp(scale(extinction, -distance));
    return {
        radiance: sourceCoefficient.map((coefficient, channel) =>
            extinction[channel] > 1e-12
                ? coefficient * (1 - transmittance[channel]) /
                    extinction[channel]
                : coefficient * distance),
        transmittance,
    };
};
const relativeWeather = (combined, clear, weatherTransmittance) => ({
    radiance: combined.radiance.map((value, channel) =>
        value - weatherTransmittance[channel] * clear.radiance[channel]),
    transmittance: [...weatherTransmittance],
});
const applyCoverage = (transport, coverage) => {
    const transmittance = transport.transmittance.map((channel) =>
        Math.exp(Math.log(Math.max(1e-4, channel)) * coverage));
    const radiance = transport.radiance.map((channel, index) => {
        const originalRemoval = 1 - transport.transmittance[index];
        return originalRemoval > 1e-9
            ? channel * (1 - transmittance[index]) / originalRemoval
            : 0;
    });
    return { radiance, transmittance };
};
const throughForegroundAir = (weather, air) => ({
    radiance: add(multiply(air.transmittance, weather.radiance),
        multiply(air.radiance,
            weather.transmittance.map((channel) => 1 - channel))),
    transmittance: weather.transmittance,
});
const integrateOrderedSheet = (extinction, sources, pathLength) => {
    let radiance = [0, 0, 0];
    let transmittance = [1, 1, 1];
    for (let node = 0; node < GAUSS_WEIGHTS.length; node += 1) {
        const distance = GAUSS_WEIGHTS[node] * pathLength;
        const segmentTransmittance = extinction[node].map((value) =>
            Math.exp(-value * distance));
        const removed = segmentTransmittance.map((value) => 1 - value);
        radiance = add(radiance, multiply(
            multiply(transmittance, sources[node]), removed));
        transmittance = multiply(transmittance, segmentTransmittance);
    }
    return { radiance, transmittance };
};
const transportOpacity = (transmittance) =>
    1 - Math.max(0, Math.min(1, luminance(transmittance)));
const transmittanceEdgeWeight = (reference, candidate) => {
    const referenceOpacity = transportOpacity(reference);
    const candidateOpacity = transportOpacity(candidate);
    const relativeOpacityDelta = Math.abs(referenceOpacity - candidateOpacity) /
        Math.max(0.04, referenceOpacity, candidateOpacity);
    const spectralDelta = Math.max(...reference.map((value, channel) =>
        Math.abs(value - candidate[channel])));
    return Math.exp(-relativeOpacityDelta * 7.5 - spectralDelta * 4);
};
const updatePopulationMoments = (state, sample) => {
    if (state.count === 0) return { mean: sample, variance: 0, count: 1 };
    const delta = sample - state.mean;
    const mean = state.mean + delta / (state.count + 1);
    return {
        mean,
        variance: Math.max(0,
            (state.count * state.variance + delta * (sample - mean)) /
                (state.count + 1)),
        count: state.count + 1,
    };
};
const filterVolumeRadiance = (center, neighbors, variance) => {
    const sigma = Math.sqrt(Math.max(0, variance));
    const centerLuminance = luminance(center.radiance);
    let weightSum = 4;
    let sum = scale(center.radiance, 4);
    for (const neighbor of neighbors) {
        const edgeWeight = transmittanceEdgeWeight(
            center.transmittance, neighbor.transmittance);
        const luminanceWeight = Math.exp(
            -Math.abs(luminance(neighbor.radiance) - centerLuminance) /
                Math.max(0.004, sigma * 2.8));
        const weight = neighbor.kernel * edgeWeight * luminanceWeight;
        sum = add(sum, scale(neighbor.radiance, weight));
        weightSum += weight;
    }
    const filtered = scale(sum, 1 / weightSum);
    const varianceStrength = variance / (variance + 0.0004);
    const opacity = transportOpacity(center.transmittance);
    const smoothUnit = Math.max(0, Math.min(1, (opacity - 0.02) / 0.28));
    const smoothstep = smoothUnit * smoothUnit * (3 - 2 * smoothUnit);
    const strength = varianceStrength * (0.52 + (0.78 - 0.52) * smoothstep);
    return center.radiance.map((value, channel) =>
        value * (1 - strength) + filtered[channel] * strength);
};

test("RGB homogeneous slabs reproduce analytic Beer transport", () => {
    const sigma = [0.12, 0.31, 0.79];
    const source = [2.4, 1.1, 0.37];
    const distance = 3.2;
    const segment = homogeneousSegment(sigma, source, distance);
    close(segment.transmittance, sigma.map((value) =>
        Math.exp(-value * distance)));
    close(segment.radiance, source.map((value, channel) =>
        value * (1 - segment.transmittance[channel])));
    assert.notEqual(segment.transmittance[0], segment.transmittance[2]);
});

test("affine RGB camera transports compose associatively with a neutral identity", () => {
    const first = homogeneousSegment([0.2, 0.3, 0.4], [1.0, 0.7, 0.5], 0.8);
    const second = homogeneousSegment([0.5, 0.2, 0.1], [0.2, 0.6, 1.1], 1.4);
    const third = homogeneousSegment([0.1, 0.4, 0.7], [0.8, 0.3, 0.2], 0.5);
    const left = compose(compose(first, second), third);
    const right = compose(first, compose(second, third));
    close(left.radiance, right.radiance);
    close(left.transmittance, right.transmittance);
    close(compose(identity(), first).radiance, first.radiance);
    close(compose(first, identity()).transmittance, first.transmittance);
});

test("coverage rescales an affine slab without inventing source radiance", () => {
    const slab = homogeneousSegment([0.3, 0.7, 1.1], [0.9, 0.6, 0.3], 1.0);
    const half = applyCoverage(slab, 0.5);
    close(half.transmittance, slab.transmittance.map(Math.sqrt));
    close(applyCoverage(slab, 0).radiance, [0, 0, 0]);
    close(applyCoverage(slab, 0).transmittance, [1, 1, 1]);
    close(applyCoverage(slab, 1).radiance, slab.radiance);
});

test("foreground-air relative operator equals explicit ordered composition", () => {
    const air = homogeneousSegment([0.03, 0.07, 0.15], [0.2, 0.3, 0.5], 4);
    const weather = homogeneousSegment([0.6, 0.8, 1.0], [1.2, 1.0, 0.8], 0.7);
    const backgroundBehindAir = [0.1, 0.2, 0.7];
    const clearBackground = add(air.radiance,
        multiply(air.transmittance, backgroundBehindAir));
    const relative = throughForegroundAir(weather, air);
    const relativeComposite = add(relative.radiance,
        multiply(relative.transmittance, clearBackground));
    const explicitlyOrdered = add(air.radiance, multiply(air.transmittance,
        add(weather.radiance,
            multiply(weather.transmittance, backgroundBehindAir))));
    close(relativeComposite, explicitlyOrdered);
});

test("relative weather may be negative while the completed combined scene is exact", () => {
    const clear = {
        radiance: [0.82, 0.94, 1.18],
        transmittance: [0.71, 0.66, 0.58],
    };
    const weatherTransmittance = [0.42, 0.51, 0.63];
    const combined = {
        // A cloud shadow removes more clear-air in-scattering than the local
        // weather returns. This is physical subtraction, not negative energy.
        radiance: [0.21, 0.31, 0.48],
        transmittance: multiply(
            clear.transmittance, weatherTransmittance),
    };
    const relative = relativeWeather(
        combined, clear, weatherTransmittance);
    assert.ok(relative.radiance.every((channel) => channel < 0));

    const boundary = [0.37, 0.56, 0.91];
    const completedRelative = add(relative.radiance, multiply(
        relative.transmittance,
        add(clear.radiance, multiply(clear.transmittance, boundary))));
    const completedCombined = add(combined.radiance,
        multiply(combined.transmittance, boundary));
    close(completedRelative, completedCombined);
    completedCombined.forEach((channel) => assert.ok(channel >= 0));
});

test("overlapping air and weather integrate one passive RGB extinction event", () => {
    const airExtinction = [0.016, 0.031, 0.074];
    const weatherExtinction = [0.48, 0.62, 0.91];
    const airSource = [0.005, 0.011, 0.026];
    const weatherSource = [0.19, 0.24, 0.31];
    const distance = 0.27;
    const combined = integrateCoefficients(
        add(airExtinction, weatherExtinction),
        add(airSource, weatherSource),
        distance,
    );
    const reversedInput = integrateCoefficients(
        add(weatherExtinction, airExtinction),
        add(weatherSource, airSource),
        distance,
    );
    close(combined.radiance, reversedInput.radiance);
    close(combined.transmittance, reversedInput.transmittance);

    const incidentCeiling = [1.0, 1.0, 1.0];
    const completed = add(combined.radiance,
        multiply(combined.transmittance, incidentCeiling));
    combined.transmittance.forEach((channel) =>
        assert.ok(channel >= 0 && channel <= 1));
    completed.forEach((channel) => {
        assert.ok(channel >= 0);
        assert.ok(channel <= 1 + EPSILON);
    });
});

test("shared temporal averaging keeps RGB transmittance passive", () => {
    const current = homogeneousSegment([0.1, 0.5, 0.9], [1, 1, 1], 1);
    const history = homogeneousSegment([0.8, 0.4, 0.2], [0.4, 0.7, 1.2], 1);
    const historyWeight = 0.83;
    const resolved = {
        radiance: current.radiance.map((value, channel) =>
            value * (1 - historyWeight) +
                history.radiance[channel] * historyWeight),
        transmittance: current.transmittance.map((value, channel) =>
            value * (1 - historyWeight) +
                history.transmittance[channel] * historyWeight),
    };
    resolved.transmittance.forEach((value) => assert.ok(value >= 0 && value <= 1));
    const metadata = luminance(resolved.transmittance);
    assert.ok(metadata >= 0 && metadata <= 1);
});

test("online cloud-radiance moments equal the analytic population moments", () => {
    const samples = [0.03, 0.48, 0.11, 0.82, 0.24, 0.39, 0.07, 0.56];
    const resolved = samples.reduce(updatePopulationMoments,
        { mean: 0, variance: 0, count: 0 });
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const variance = samples.reduce(
        (sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
    assert.ok(Math.abs(resolved.mean - mean) < 1e-15);
    assert.ok(Math.abs(resolved.variance - variance) < 1e-15);
    assert.equal(resolved.count, samples.length);
});

test("transmittance edge weights reject clear-to-cloud leakage but retain interiors", () => {
    const clear = [1, 1, 1];
    const cloud = [0.34, 0.35, 0.36];
    const firstInterior = [0.31, 0.32, 0.33];
    const secondInterior = [0.35, 0.36, 0.37];
    assert.ok(transmittanceEdgeWeight(clear, cloud) < 0.001);
    assert.ok(transmittanceEdgeWeight(cloud, clear) < 0.001,
        "the guide must be symmetric");
    assert.ok(transmittanceEdgeWeight(firstInterior, secondInterior) > 0.50,
        "ordinary dense-volume estimator noise remains filterable");
});

test("cloud-radiance moments are invariant to the completed sky behind them", () => {
    const cloudRadiance = 0.37;
    const backgrounds = [0.02, 0.6, 4.5, 18.0];
    const transmittances = [0.97, 0.72, 0.41, 0.08];
    const resolved = backgrounds.reduce((state, background, index) => {
        // The completed-scene sample varies strongly, but only intrinsic cloud
        // radiance belongs in the temporal moments used by the volume filter.
        assert.notEqual(cloudRadiance + transmittances[index] * background,
            cloudRadiance);
        return updatePopulationMoments(state, cloudRadiance);
    }, { mean: 0, variance: 0, count: 0 });
    assert.equal(resolved.mean, cloudRadiance);
    assert.equal(resolved.variance, 0);
});

test("variance filtering removes isolated grain without crossing a physical edge", () => {
    const clearNeighbors = Array.from({ length: 8 }, (_, index) => ({
        radiance: [0.002, 0.002, 0.002],
        transmittance: [0.995, 0.995, 0.995],
        kernel: index < 4 ? 2 : 1,
    }));
    const noisyInterior = filterVolumeRadiance({
        radiance: [0.16, 0.14, 0.12],
        transmittance: [0.994, 0.994, 0.994],
    }, clearNeighbors, 0.012);
    assert.ok(luminance(noisyInterior) < 0.105,
        "a high-variance isolated radiance sample must be attenuated");

    const cloudyNeighbors = Array.from({ length: 8 }, (_, index) => ({
        radiance: [0.72, 0.68, 0.61],
        transmittance: [0.28, 0.29, 0.30],
        kernel: index < 4 ? 2 : 1,
    }));
    const clearEdge = filterVolumeRadiance({
        radiance: [0.003, 0.003, 0.003],
        transmittance: [0.998, 0.998, 0.998],
    }, cloudyNeighbors, 0.012);
    assert.ok(luminance(clearEdge) < 0.00301,
        "cloud radiance cannot bleed across a clear-air transmittance edge");
});

test("replicated scalar transmittance is an exact migration baseline", () => {
    const scalar = 0.37;
    const background = [0.4, 0.7, 1.2];
    const radiance = [0.2, 0.1, 0.05];
    const rgb = add(radiance, multiply([scalar, scalar, scalar], background));
    const legacy = radiance.map((value, channel) =>
        value + scalar * background[channel]);
    close(rgb, legacy);
});

test("ordered sheet quadrature preserves homogeneous RGB slab transport", () => {
    const sigma = [0.19, 0.43, 0.87];
    const source = [1.7, 0.8, 0.31];
    const pathLength = 4.25;
    const ordered = integrateOrderedSheet(
        Array.from({ length: 12 }, () => sigma),
        Array.from({ length: 12 }, () => source),
        pathLength,
    );
    const analytic = homogeneousSegment(sigma, source, pathLength);
    close(ordered.transmittance, analytic.transmittance, 2e-9);
    close(ordered.radiance, analytic.radiance, 2e-9);
});

test("ordered sheet integration preserves physical front-to-back source order", () => {
    const extinction = Array.from({ length: 12 }, (_, node) => [
        0.18 + node * 0.025,
        0.27 + node * 0.018,
        0.41 - node * 0.012,
    ]);
    const sources = Array.from({ length: 12 }, (_, node) => node < 6
        ? [2.0, 0.15, 0.05]
        : [0.04, 0.24, 1.6]);
    const forward = integrateOrderedSheet(extinction, sources, 3.5);
    const reversed = integrateOrderedSheet(
        [...extinction].reverse(), [...sources].reverse(), 3.5);
    close(forward.transmittance, reversed.transmittance, 2e-9);
    assert.ok(Math.abs(forward.radiance[0] - reversed.radiance[0]) > 0.05);
    assert.ok(Math.abs(forward.radiance[2] - reversed.radiance[2]) > 0.05);
});

test("ordered sheet nodes cannot collapse to the maximum-extinction material", () => {
    const extinction = Array.from({ length: 12 }, (_, node) =>
        node === 11 ? [2.8, 2.4, 2.0] : [0.12, 0.2, 0.31]);
    const sources = Array.from({ length: 12 }, (_, node) =>
        node === 11 ? [0, 0, 0] : [0.7, 0.9, 1.2]);
    const ordered = integrateOrderedSheet(extinction, sources, 2.75);
    const maximumExtinctionSource = sources[11];
    const collapsed = multiply(maximumExtinctionSource,
        ordered.transmittance.map((value) => 1 - value));
    assert.ok(luminance(ordered.radiance) > 0.25);
    close(collapsed, [0, 0, 0]);
});

test("ordered sheet transport remains nonnegative and passive", () => {
    const extinction = Array.from({ length: 12 }, (_, node) => [
        0.03 + node * 0.11,
        0.08 + (11 - node) * 0.07,
        0.15 + (node % 4) * 0.16,
    ]);
    const sources = Array.from({ length: 12 }, (_, node) => [
        0.15 + node * 0.08,
        0.3 + (node % 5) * 0.12,
        0.2 + (11 - node) * 0.055,
    ]);
    const result = integrateOrderedSheet(extinction, sources, 5.0);
    result.transmittance.forEach((value) => assert.ok(value >= 0 && value <= 1));
    result.radiance.forEach((value, channel) => {
        const maximumSource = Math.max(...sources.map((source) => source[channel]));
        assert.ok(value >= 0);
        assert.ok(value <= maximumSource * (1 - result.transmittance[channel]) +
            EPSILON);
    });
});

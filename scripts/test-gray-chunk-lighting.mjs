import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PHOTOPIC = [0.2126, 0.7152, 0.0722];
const map3 = (operation, ...values) => [0, 1, 2].map((channel) =>
    operation(...values.map((value) => value[channel])));
const add = (left, right) => map3((a, b) => a + b, left, right);
const multiply = (left, right) => map3((a, b) => a * b, left, right);
const subtract = (left, right) => map3((a, b) => a - b, left, right);
const scale = (value, amount) => value.map((channel) => channel * amount);
const luminance = (value) => value.reduce(
    (sum, channel, index) => sum + channel * PHOTOPIC[index], 0);
const close = (actual, expected, tolerance = 1e-12) => actual.forEach(
    (value, channel) => assert.ok(
        Math.abs(value - expected[channel]) <= tolerance,
        `channel ${channel}: ${value} != ${expected[channel]}`,
    ));

const integrateCoefficients = (extinction, source, distance) => {
    const transmittance = extinction.map((value) => Math.exp(-value * distance));
    return {
        radiance: source.map((value, channel) => extinction[channel] > 1e-12
            ? value * (1 - transmittance[channel]) / extinction[channel]
            : value * distance),
        transmittance,
    };
};

const compose = (front, back) => ({
    radiance: add(front.radiance,
        multiply(front.transmittance, back.radiance)),
    transmittance: multiply(front.transmittance, back.transmittance),
});

const relativeWeather = (combined, clear, weatherTransmittance) => ({
    radiance: combined.radiance.map((value, channel) =>
        value - weatherTransmittance[channel] * clear.radiance[channel]),
    transmittance: [...weatherTransmittance],
});

const complete = (operator, boundary) => add(
    operator.radiance, multiply(operator.transmittance, boundary));

const identity = () => ({
    radiance: [0, 0, 0],
    transmittance: [1, 1, 1],
});

const maximumDifference = (left, right) => Math.max(
    ...left.map((value, channel) => Math.abs(value - right[channel])));

const spatialAtmosphere = (distance, cascadeBoundary = 7.37) => {
    const altitudeDensity = Math.exp(-distance / 10.5);
    const extinction = [0.012, 0.026, 0.061].map((value, channel) =>
        value * altitudeDensity * (1 + 0.08 * Math.sin(
            distance * (0.31 + channel * 0.07))));
    const transition = 1 / (1 + Math.exp(
        -(distance - cascadeBoundary) / 0.045));
    const visibility = 0.19 + 0.74 * transition;
    const diffuse = [0.0018, 0.0048, 0.0125].map((value) =>
        value * altitudeDensity);
    const unshadowedDirect = [0.0062, 0.0138, 0.025].map((value) =>
        value * altitudeDensity);
    const direct = scale(unshadowedDirect, visibility);
    const unshadowedSource = add(diffuse, unshadowedDirect);
    const source = add(diffuse, direct);
    return {
        extinction,
        source,
        unshadowedSource,
        removedSource: subtract(unshadowedSource, source),
    };
};

const spatialWeather = (distance, enabled = true) => {
    if (!enabled || distance < 5.2 || distance > 12.8) {
        return { extinction: [0, 0, 0], source: [0, 0, 0] };
    }
    const local = (distance - 5.2) / 7.6;
    const density = Math.sin(Math.PI * local) ** 2 *
        (0.72 + 0.28 * Math.sin(distance * 2.31) ** 2);
    const extinction = [0.42, 0.47, 0.55].map((value) => value * density);
    const source = [0.015, 0.024, 0.042].map((value) => value * density);
    return { extinction, source };
};

const integrateSpatialTransport = ({
    start = 0,
    end = 18,
    maximumStep = 0.0025,
    cascadeBoundary = 7.37,
    weather = false,
}) => {
    let transport = identity();
    let clearTransport = identity();
    let weatherTransmittance = [1, 1, 1];
    let cloudSourceRadiance = [0, 0, 0];
    let airProxyWeight = [0, 0, 0];
    let cloudWeightedAirProxy = [0, 0, 0];
    const stepCount = Math.max(1, Math.ceil((end - start) / maximumStep));
    const step = (end - start) / stepCount;
    for (let index = 0; index < stepCount; index += 1) {
        const distance = start + (index + 0.5) * step;
        const air = spatialAtmosphere(distance, cascadeBoundary);
        const cloud = spatialWeather(distance, weather);
        const combinedSource = add(air.source, cloud.source);
        const segment = integrateCoefficients(
            add(air.extinction, cloud.extinction),
            combinedSource,
            step,
        );
        const clearSegment = integrateCoefficients(
            air.extinction, air.source, step);
        const weatherStepTransmittance = cloud.extinction.map((value) =>
            Math.exp(-value * step));
        const airContribution = multiply(
            clearTransport.transmittance, clearSegment.radiance);
        const weatherMidpointTransmittance = multiply(
            weatherTransmittance, weatherStepTransmittance.map(Math.sqrt));
        airProxyWeight = add(airProxyWeight, airContribution);
        cloudWeightedAirProxy = add(cloudWeightedAirProxy,
            multiply(weatherMidpointTransmittance, airContribution));
        const cloudSourceShare = cloud.source.map((value, channel) =>
            Math.max(0, Math.min(1,
                value / Math.max(1e-12, combinedSource[channel]))));
        cloudSourceRadiance = add(cloudSourceRadiance, multiply(
            transport.transmittance,
            multiply(segment.radiance, cloudSourceShare)));
        transport = compose(transport, segment);
        clearTransport = compose(clearTransport, clearSegment);
        weatherTransmittance = multiply(
            weatherTransmittance, weatherStepTransmittance);
    }
    return {
        transport,
        clearTransport,
        weatherTransmittance,
        cloudSourceRadiance,
        airProxyWeight,
        cloudWeightedAirProxy,
    };
};

const relativeFromAirMoment = ({
    cloudSourceRadiance,
    exactSharedAir,
    cloudWeightedAirProxy,
    airProxyWeight,
    weatherTransmittance,
}) => {
    const k = weatherTransmittance.map((q, channel) => Math.max(q, Math.min(1,
        airProxyWeight[channel] > 1e-12
            ? cloudWeightedAirProxy[channel] / airProxyWeight[channel]
            : q)));
    return {
        radiance: add(cloudSourceRadiance, multiply(
            subtract(k, weatherTransmittance), exactSharedAir.radiance)),
        transmittance: [...weatherTransmittance],
        k,
    };
};

const gaussNodes = [
    -0.8611363115940526,
    -0.3399810435848563,
    0.3399810435848563,
    0.8611363115940526,
];
const gaussWeights = [
    0.3478548451374538,
    0.6521451548625461,
    0.6521451548625461,
    0.3478548451374538,
];

const oldMeanCoefficientShadowedSegment = ({
    start,
    end,
    cascadeBoundary,
}) => {
    const clear = (() => {
        let transport = identity();
        const stepCount = Math.ceil((end - start) / 0.00125);
        const step = (end - start) / stepCount;
        for (let index = 0; index < stepCount; index += 1) {
            const distance = start + (index + 0.5) * step;
            const air = spatialAtmosphere(distance, cascadeBoundary);
            transport = compose(transport, integrateCoefficients(
                air.extinction, air.unshadowedSource, step));
        }
        return transport;
    })();
    let meanExtinction = [0, 0, 0];
    let meanRemovedSource = [0, 0, 0];
    const center = (start + end) * 0.5;
    const halfLength = (end - start) * 0.5;
    for (let index = 0; index < gaussNodes.length; index += 1) {
        const distance = center + halfLength * gaussNodes[index];
        const air = spatialAtmosphere(distance, cascadeBoundary);
        const normalizedWeight = gaussWeights[index] * 0.5;
        meanExtinction = add(meanExtinction,
            scale(air.extinction, normalizedWeight));
        meanRemovedSource = add(meanRemovedSource,
            scale(air.removedSource, normalizedWeight));
    }
    const removed = integrateCoefficients(
        meanExtinction, meanRemovedSource, end - start);
    return {
        radiance: clear.radiance.map((value, channel) => Math.max(
            0, value - Math.min(value, removed.radiance[channel]))),
        transmittance: clear.transmittance,
    };
};

const allOwnerMaterial = (owners) => {
    const total = owners.reduce((sum, owner) => sum + owner.strength, 0);
    return owners.reduce((aggregate, owner) => add(
        aggregate, scale(owner.optics, owner.strength / total)), [0, 0, 0]);
};

test("three-owner optical crossover is continuous", () => {
    const primary = { id: "a", strength: 1, optics: [0.92, 0.96, 1.00] };
    const warm = { id: "b", strength: 0.5, optics: [1.00, 0.82, 0.62] };
    const cool = { id: "c", strength: 0.5, optics: [0.56, 0.78, 1.00] };
    const before = allOwnerMaterial([
        primary,
        { ...warm, strength: warm.strength + 1e-7 },
        { ...cool, strength: cool.strength - 1e-7 },
    ]);
    const after = allOwnerMaterial([
        primary,
        { ...warm, strength: warm.strength - 1e-7 },
        { ...cool, strength: cool.strength + 1e-7 },
    ]);
    const maximumJump = Math.max(...before.map((value, channel) =>
        Math.abs(value - after[channel])));
    assert.ok(maximumJump < 1e-5,
        `continuous owner strengths produced a ${maximumJump} material jump`);
    const shader = readFileSync(new URL(
        "../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
    "utf8");
    assert.match(shader,
        /spectral_extinction_density_sum\s*\+=\s*[\s\S]*?scattering_density_sum\s*\+=\s*[\s\S]*?scattering_asymmetry_density_sum\s*\+=/,
    "camera material must accumulate every overlapping optical owner");
    assert.match(shader,
        /unresolved_fraction\s*=\s*[\s\S]*?angular_detail_weight\s*=\s*[\s\S]*?aggregate_phase[\s\S]*?mix\(\s*aggregate_phase,\s*retained\.phase,\s*angular_detail_weight\)/,
    "strongest-two angular detail must fade before an omitted-owner crossover");
});

test("no-weather relative atmosphere is the affine identity", () => {
    const clear = integrateCoefficients(
        [0.015, 0.032, 0.071], [0.004, 0.011, 0.026], 18);
    const relative = relativeWeather(clear, clear, [1, 1, 1]);
    close(relative.radiance, [0, 0, 0]);
    close(relative.transmittance, [1, 1, 1]);
    const boundary = [0.18, 0.42, 1.1];
    close(complete(relative, complete(clear, boundary)),
        complete(clear, boundary));
});

test("constant-visibility atmosphere correction completes to nonnegative radiance", () => {
    const clear = integrateCoefficients(
        [0.018, 0.037, 0.079], [0.006, 0.014, 0.031], 12);
    const shadowedAir = integrateCoefficients(
        [0.018, 0.037, 0.079], [0.003, 0.007, 0.0155], 12);
    const cloud = integrateCoefficients(
        [0.58, 0.61, 0.66], [0.21, 0.23, 0.25], 0.9);
    const combined = compose(shadowedAir, cloud);
    const relative = relativeWeather(
        combined, clear, cloud.transmittance);
    const boundary = [0.22, 0.48, 1.25];
    const completed = complete(relative, complete(clear, boundary));
    close(completed, complete(combined, boundary), 1e-12);
    completed.forEach((channel) => assert.ok(
        Number.isFinite(channel) && channel >= 0,
        `completed radiance must remain physical, received ${channel}`));
});

test("spatially varying shadowed atmosphere composes as one affine operator", () => {
    const front = integrateSpatialTransport({ end: 6.125 }).transport;
    const middle = integrateSpatialTransport({
        start: 6.125,
        end: 11.375,
    }).transport;
    const back = integrateSpatialTransport({ start: 11.375 }).transport;
    const partitioned = compose(compose(front, middle), back);
    const whole = integrateSpatialTransport({ end: 18 }).transport;
    close(partitioned.radiance, whole.radiance, 2e-7);
    close(partitioned.transmittance, whole.transmittance, 2e-7);
});

test("varying visibility no-weather completion is the exact affine identity", () => {
    const clear = integrateSpatialTransport({
        maximumStep: 0.00125,
        cascadeBoundary: 8.143,
    }).transport;
    const partitionedClear = compose(
        integrateSpatialTransport({
            end: 8.143,
            maximumStep: 0.08,
            cascadeBoundary: 8.143,
        }).transport,
        integrateSpatialTransport({
            start: 8.143,
            maximumStep: 0.08,
            cascadeBoundary: 8.143,
        }).transport,
    );
    const correctedCombined = {
        radiance: add(partitionedClear.radiance,
            subtract(clear.radiance, partitionedClear.radiance)),
        transmittance: [...clear.transmittance],
    };
    const relative = relativeWeather(correctedCombined, clear, [1, 1, 1]);
    close(relative.radiance, [0, 0, 0], 1e-12);
    close(relative.transmittance, [1, 1, 1], 1e-12);
    const boundary = [0.13, 0.38, 1.07];
    close(complete(relative, complete(clear, boundary)),
        complete(clear, boundary), 1e-12);
});

test("occupied fine strata preserve the varying-visibility formal solution", () => {
    const boundary = [0.17, 0.44, 1.16];
    const exactClear = integrateSpatialTransport({
        maximumStep: 0.00125,
    }).transport;
    const exactCombined = integrateSpatialTransport({
        maximumStep: 0.00125,
        weather: true,
    });
    const exactRelative = relativeWeather(
        exactCombined.transport,
        exactClear,
        exactCombined.weatherTransmittance,
    );
    const exactCompleted = complete(
        exactRelative, complete(exactClear, boundary));

    for (const maximumStep of [0.08, 0.16, 0.24]) {
        const sampledClear = integrateSpatialTransport({ maximumStep }).transport;
        const sampledCombined = integrateSpatialTransport({
            maximumStep,
            weather: true,
        });
        const sampledRelative = relativeWeather(
            sampledCombined.transport,
            sampledClear,
            sampledCombined.weatherTransmittance,
        );
        const completedAgainstExactBackground = complete(
            sampledRelative, complete(exactClear, boundary));
        assert.ok(maximumDifference(
            completedAgainstExactBackground, exactCompleted) < 0.0025,
        `maximum ${maximumStep} km occupied strata exceeded the formal-solution tolerance`);
    }
});

test("depth-weighted air moment preserves front, back, and interleaved limits", () => {
    const exactSharedAir = {
        radiance: [0.3, 0.7, 1.1],
        transmittance: [0.8, 0.7, 0.6],
    };
    const q = [0.24, 0.31, 0.43];
    const weight = [0.2, 0.5, 0.9];
    const front = relativeFromAirMoment({
        cloudSourceRadiance: [0, 0, 0],
        exactSharedAir,
        cloudWeightedAirProxy: weight,
        airProxyWeight: weight,
        weatherTransmittance: q,
    });
    close(front.k, [1, 1, 1]);
    close(front.radiance, multiply(subtract([1, 1, 1], q),
        exactSharedAir.radiance));

    const back = relativeFromAirMoment({
        cloudSourceRadiance: [0, 0, 0],
        exactSharedAir,
        cloudWeightedAirProxy: multiply(q, weight),
        airProxyWeight: weight,
        weatherTransmittance: q,
    });
    close(back.k, q);
    close(back.radiance, [0, 0, 0]);

    const interleavedK = q.map((value) => value + (1 - value) * 0.37);
    const interleaved = relativeFromAirMoment({
        cloudSourceRadiance: [0.04, 0.03, 0.02],
        exactSharedAir,
        cloudWeightedAirProxy: multiply(interleavedK, weight),
        airProxyWeight: weight,
        weatherTransmittance: q,
    });
    interleaved.k.forEach((value, channel) => {
        assert.ok(value > q[channel] && value < 1);
        assert.ok(interleaved.radiance[channel] >= 0);
    });
});

test("air-moment cloud operator matches the spatial formal solution", () => {
    const boundary = [0.17, 0.44, 1.16];
    const exactSharedAir = integrateSpatialTransport({
        maximumStep: 0.00125,
    }).transport;
    const exactCombined = integrateSpatialTransport({
        maximumStep: 0.00125,
        weather: true,
    }).transport;
    const exactCompleted = complete(exactCombined, boundary);
    for (const maximumStep of [0.08, 0.16, 0.24]) {
        const proxy = integrateSpatialTransport({
            maximumStep,
            weather: true,
        });
        const relative = relativeFromAirMoment({
            ...proxy,
            exactSharedAir,
        });
        const completed = complete(
            relative, complete(exactSharedAir, boundary));
        assert.ok(maximumDifference(completed, exactCompleted) < 0.0025,
            `air-moment ${maximumStep} km proxy exceeded the formal-solution tolerance`);
        relative.radiance.forEach((value) => assert.ok(value >= 0));
    }
});

test("air-moment zero-weather path is exactly identity", () => {
    const exactSharedAir = integrateSpatialTransport({
        maximumStep: 0.00125,
    }).transport;
    const proxy = integrateSpatialTransport({ maximumStep: 0.24 });
    const relative = relativeFromAirMoment({ ...proxy, exactSharedAir });
    close(relative.radiance, [0, 0, 0], 1e-12);
    close(relative.transmittance, [1, 1, 1], 1e-12);
    close(relative.k, [1, 1, 1], 1e-12);
});

test("depth-weighted shared prefix removes the old mean-coefficient gray residual", () => {
    const cascadeBoundary = 2.43;
    const cloudNear = 5.2;
    const boundary = [0.17, 0.44, 1.16];
    const exactFront = integrateSpatialTransport({
        end: cloudNear,
        maximumStep: 0.00125,
        cascadeBoundary,
    }).transport;
    const oldFront = oldMeanCoefficientShadowedSegment({
        start: 0,
        end: cloudNear,
        cascadeBoundary,
    });
    const exactClearBack = integrateSpatialTransport({
        start: cloudNear,
        maximumStep: 0.00125,
        cascadeBoundary,
    }).transport;
    const exactCombinedBack = integrateSpatialTransport({
        start: cloudNear,
        maximumStep: 0.00125,
        cascadeBoundary,
        weather: true,
    });
    const exactClear = compose(exactFront, exactClearBack);
    const exactCombined = compose(exactFront, exactCombinedBack.transport);
    const exactRelative = relativeWeather(
        exactCombined,
        exactClear,
        exactCombinedBack.weatherTransmittance,
    );
    const exactCompleted = complete(
        exactRelative, complete(exactClear, boundary));

    const oldClear = compose(oldFront, exactClearBack);
    const oldCombined = compose(oldFront, exactCombinedBack.transport);
    const oldRelative = relativeWeather(
        oldCombined,
        oldClear,
        exactCombinedBack.weatherTransmittance,
    );
    const oldCompletedAgainstRenderedBackground = complete(
        oldRelative, complete(exactClear, boundary));
    const oldError = maximumDifference(
        oldCompletedAgainstRenderedBackground, exactCompleted);
    assert.ok(oldError > 2e-4,
        `fixture must expose the old prefix residual, received ${oldError}`);

    const sharedClear = compose(exactFront, exactClearBack);
    const sharedCombined = compose(exactFront, exactCombinedBack.transport);
    const sharedRelative = relativeWeather(
        sharedCombined,
        sharedClear,
        exactCombinedBack.weatherTransmittance,
    );
    const sharedCompleted = complete(
        sharedRelative, complete(exactClear, boundary));
    close(sharedCompleted, exactCompleted, 2e-12);
});

test("signed shadow correction completes exactly over the shared background", () => {
    const clear = integrateSpatialTransport({ maximumStep: 0.00125 }).transport;
    const combined = integrateSpatialTransport({
        maximumStep: 0.00125,
        weather: true,
    });
    const shadowRemovedCombined = {
        radiance: scale(combined.transport.radiance, 0.18),
        transmittance: [...combined.transport.transmittance],
    };
    const relative = relativeWeather(
        shadowRemovedCombined, clear, combined.weatherTransmittance);
    assert.ok(relative.radiance.some((value) => value < 0),
        "a spatial cloud shadow must retain its signed atmosphere correction");
    const boundary = [0.14, 0.41, 1.2];
    close(complete(relative, complete(clear, boundary)),
        complete(shadowRemovedCombined, boundary), 2e-12);
});

test("cascade transitions cannot create a dark-gray radiance plateau", () => {
    const boundary = [0.16, 0.43, 1.13];
    const completed = [];
    for (let index = 0; index <= 24; index += 1) {
        const cascadeBoundary = 6.8 + index * 0.05;
        const clear = integrateSpatialTransport({
            maximumStep: 0.01,
            cascadeBoundary,
        }).transport;
        const combined = integrateSpatialTransport({
            maximumStep: 0.01,
            cascadeBoundary,
            weather: true,
        });
        const relative = relativeFromAirMoment({
            ...combined,
            exactSharedAir: clear,
        });
        const radiance = complete(relative, complete(clear, boundary));
        radiance.forEach((value) => assert.ok(Number.isFinite(value) && value >= 0));
        completed.push(radiance);
    }
    const adjacentChanges = completed.slice(1).map((value, index) =>
        maximumDifference(value, completed[index]));
    assert.ok(Math.min(...adjacentChanges) > 1e-7,
        "moving a visibility boundary must not expose a constant gray stamp");
    assert.ok(Math.max(...adjacentChanges) < 0.001,
        "a cascade handoff must not create a visible radiance jump");
});

const temporalReconstructionConfidence = (current, previous) => {
    const currentPresent = current.opacity > 0.002;
    const previousPresent = previous.opacity > 0.002;
    const occupancyMatch = currentPresent === previousPresent ? 1 : 0;
    const firstDepthDelta = Math.abs(current.firstDepth - previous.firstDepth) /
        Math.max(1, Math.min(current.firstDepth, previous.firstDepth));
    const meanDepthDelta = Math.abs(current.meanDepth - previous.meanDepth) /
        Math.max(1, Math.min(current.meanDepth, previous.meanDepth));
    const opticalDelta = Math.abs(current.opticalDepth - previous.opticalDepth) /
        Math.max(0.08, current.opticalDepth, previous.opticalDepth);
    const layerMatch = Math.abs(current.layer - previous.layer) < 0.25 ? 1 : 0;
    const velocityDelta = Math.hypot(
        current.velocity[0] - previous.velocity[0],
        current.velocity[1] - previous.velocity[1]);
    const depthConfidence = Math.exp(
        -firstDepthDelta * 8 - meanDepthDelta * 4);
    const opticalConfidence = Math.exp(-opticalDelta * 5);
    const motionConfidence = Math.exp(-velocityDelta * 0.22);
    const emptyConfidence = currentPresent || previousPresent
        ? occupancyMatch * layerMatch : 1;
    return depthConfidence * opticalConfidence * motionConfidence *
        emptyConfidence;
};

test("temporal history rejects layer and depth discontinuities", () => {
    const stable = {
        opacity: 0.74,
        firstDepth: 8,
        meanDepth: 10,
        opticalDepth: 1.35,
        layer: 0,
        velocity: [0.004, -0.002],
    };
    assert.ok(temporalReconstructionConfidence(stable, {
        ...stable, firstDepth: 8.03, meanDepth: 10.05,
    }) > 0.9, "a stable owner interior must retain history");
    assert.ok(temporalReconstructionConfidence(stable, {
        ...stable, firstDepth: 31, meanDepth: 36,
    }) < 0.55, "a depth discontinuity must reject history");
    assert.equal(temporalReconstructionConfidence(stable, {
        ...stable, layer: 1,
    }), 0, "a layer-owner discontinuity must reject history");
    assert.ok(luminance([0.3, 0.3, 0.3]) > 0,
        "test fixture must exercise visible gray radiance");
});

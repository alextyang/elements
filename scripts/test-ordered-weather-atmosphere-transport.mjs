import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(
    tmpdir(), "elements-ordered-weather-atmosphere-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const source = readFileSync(new URL(
    "../components/backgrounds/sky/ordered-weather-atmosphere-transport.ts",
    import.meta.url,
), "utf8");
const modulePath = join(temporaryRoot, "ordered-weather-atmosphere-transport.mjs");
writeFileSync(modulePath, ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText);
const ordered = await import(new URL(`file://${modulePath}`));

const near = (actual, expected, tolerance = 1e-8, label = "value") =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${label}: ${actual} != ${expected} within ${tolerance}`);
const vecNear = (actual, expected, tolerance = 1e-8, label = "vector") =>
    actual.forEach((value, index) =>
        near(value, expected[index], tolerance, `${label}[${index}]`));
const rgbAdd = (a, b) => a.map((value, channel) => value + b[channel]);
const rgbMultiply = (a, b) => a.map((value, channel) => value * b[channel]);
const constantSample = (extinction, sourceFunction, albedo = [1, 1, 1]) => ({
    extinctionPerKm: extinction,
    scatteringPerKm: rgbMultiply(extinction, albedo),
    scatteredIncidentRadiance: sourceFunction,
});
const baseRay = (overrides = {}) => ({
    originKm: [0, 0, 0],
    direction: [0, 0, 2],
    nearKm: 0,
    farKm: 10,
    maximumStepKm: 0.5,
    minimumStepKm: 1e-5,
    absoluteTolerance: 1e-10,
    relativeTolerance: 1e-7,
    ...overrides,
});

test("affine RGB operators compose in camera-to-background order", () => {
    const front = {
        radiance: [0.2, 0.1, 0.05],
        transmittance: [0.5, 0.6, 0.7],
    };
    const back = {
        radiance: [0.8, 0.5, 0.3],
        transmittance: [0.2, 0.3, 0.4],
    };
    const composed = ordered.composeOrderedRgbTransport(front, back);
    vecNear(composed.radiance, [0.6, 0.4, 0.26]);
    vecNear(composed.transmittance, [0.1, 0.18, 0.28]);
    const background = [4, 3, 2];
    vecNear(
        ordered.applyOrderedRgbTransport(composed, background),
        ordered.applyOrderedRgbTransport(front,
            ordered.applyOrderedRgbTransport(back, background)),
    );
    assert.notDeepEqual(
        ordered.composeOrderedRgbTransport(front, back),
        ordered.composeOrderedRgbTransport(back, front),
        "radiance-bearing volume operators are not commutative",
    );
});

test("coupled transport is exactly recoverable relative to clear atmosphere", () => {
    const clearAtmosphere = {
        radiance: [0.3, 0.4, 0.5],
        transmittance: [0.8, 0.7, 0.6],
    };
    const weatherRelative = {
        radiance: [0.2, 0.1, 0.05],
        transmittance: [0.5, 0.6, 0.7],
    };
    const combined = ordered.composeOrderedRgbTransport(
        weatherRelative, clearAtmosphere);
    const recovered = ordered.relativeOrderedWeatherTransport(
        combined, clearAtmosphere, weatherRelative.transmittance);
    vecNear(recovered.radiance, weatherRelative.radiance, 2e-15);
    vecNear(recovered.transmittance, weatherRelative.transmittance, 2e-15);

    const boundary = [4.2, 2.1, 0.8];
    vecNear(
        ordered.applyOrderedRgbTransport(
            recovered,
            ordered.applyOrderedRgbTransport(clearAtmosphere, boundary),
        ),
        ordered.applyOrderedRgbTransport(combined, boundary),
        2e-15,
        "relative reconstruction",
    );
});

test("relative weather radiance remains signed when clouds shadow clear-air source", () => {
    const clearAtmosphere = {
        radiance: [1.2, 0.8, 0.5],
        transmittance: [0.7, 0.8, 0.9],
    };
    const weatherTransmittance = [0.5, 0.45, 0.4];
    const combined = {
        radiance: [0.45, 0.5, 0.25],
        transmittance: rgbMultiply(
            clearAtmosphere.transmittance, weatherTransmittance),
    };
    const relative = ordered.relativeOrderedWeatherTransport(
        combined, clearAtmosphere, weatherTransmittance);
    vecNear(relative.radiance, [-0.15, 0.14, 0.05], 2e-15);
    assert.ok(relative.radiance[0] < 0,
        "shadowed clear-air in-scattering must survive as a signed correction");

    const boundary = [2, 1.4, 0.8];
    vecNear(
        ordered.applyOrderedRgbTransport(
            relative,
            ordered.applyOrderedRgbTransport(clearAtmosphere, boundary),
        ),
        ordered.applyOrderedRgbTransport(combined, boundary),
        2e-15,
        "signed relative operator",
    );
    assert.throws(() => ordered.relativeOrderedWeatherTransport(
        {
            radiance: combined.radiance,
            transmittance: [0.2, 0.2, 0.2],
        },
        clearAtmosphere,
        weatherTransmittance,
    ), /combined transmittance/);
});

test("shadowed atmosphere baseline is composed once without double removal", () => {
    const unshadowedAtmosphere = {
        radiance: [1.3, 1.0, 0.7],
        transmittance: [0.82, 0.76, 0.69],
    };
    const shadowLoss = [0.24, 0.18, 0.11];
    const shadowedAtmosphere = {
        radiance: unshadowedAtmosphere.radiance.map((value, channel) =>
            value - shadowLoss[channel]),
        transmittance: unshadowedAtmosphere.transmittance,
    };
    const weatherRelative = {
        radiance: [0.31, 0.27, 0.21],
        transmittance: [0.46, 0.53, 0.61],
    };
    const combined = ordered.composeOrderedRgbTransport(
        weatherRelative, shadowedAtmosphere);
    const recovered = ordered.relativeOrderedWeatherTransport(
        combined, shadowedAtmosphere, weatherRelative.transmittance);
    const boundary = [2.4, 1.6, 0.9];
    vecNear(
        ordered.applyOrderedRgbTransport(
            recovered,
            ordered.applyOrderedRgbTransport(shadowedAtmosphere, boundary),
        ),
        ordered.applyOrderedRgbTransport(combined, boundary),
        2e-15,
        "shadowed-background affine reconstruction",
    );

    const wrongClearBaseline = ordered.relativeOrderedWeatherTransport(
        combined, unshadowedAtmosphere, weatherRelative.transmittance);
    const wronglyComposited = ordered.applyOrderedRgbTransport(
        wrongClearBaseline,
        ordered.applyOrderedRgbTransport(shadowedAtmosphere, boundary),
    );
    const expectedCombined = ordered.applyOrderedRgbTransport(combined, boundary);
    const expectedDoubleRemoval = rgbMultiply(
        weatherRelative.transmittance, shadowLoss);
    vecNear(
        wronglyComposited,
        expectedCombined.map((value, channel) =>
            value - expectedDoubleRemoval[channel]),
        2e-15,
        "unshadowed baseline double-removes cloud-shadow loss",
    );
});

test("shadowed prefix gaps and tail form one whole-ray relative baseline", () => {
    const air = [
        { radiance: [0.08, 0.1, 0.14], transmittance: [0.96, 0.95, 0.93] },
        { radiance: [0.11, 0.14, 0.18], transmittance: [0.94, 0.92, 0.89] },
        { radiance: [0.07, 0.09, 0.12], transmittance: [0.97, 0.96, 0.94] },
        { radiance: [0.1, 0.12, 0.16], transmittance: [0.95, 0.93, 0.9] },
        { radiance: [0.13, 0.17, 0.22], transmittance: [0.92, 0.89, 0.85] },
    ];
    const firstWeather = {
        radiance: [0.21, 0.18, 0.15],
        transmittance: [0.62, 0.68, 0.74],
    };
    const secondWeather = {
        radiance: [0.16, 0.14, 0.12],
        transmittance: [0.71, 0.76, 0.8],
    };
    const backgroundAtmosphere = air.reduce(
        (front, segment) => ordered.composeOrderedRgbTransport(front, segment),
        ordered.orderedTransportIdentity(),
    );
    const combined = [
        air[0],
        ordered.composeOrderedRgbTransport(firstWeather, air[1]),
        air[2],
        ordered.composeOrderedRgbTransport(secondWeather, air[3]),
        air[4],
    ].reduce(
        (front, segment) => ordered.composeOrderedRgbTransport(front, segment),
        ordered.orderedTransportIdentity(),
    );
    const weatherTransmittance = rgbMultiply(
        firstWeather.transmittance, secondWeather.transmittance);
    const relative = ordered.relativeOrderedWeatherTransport(
        combined, backgroundAtmosphere, weatherTransmittance);
    const boundary = [3.1, 1.9, 1.2];
    vecNear(
        ordered.applyOrderedRgbTransport(
            relative,
            ordered.applyOrderedRgbTransport(backgroundAtmosphere, boundary),
        ),
        ordered.applyOrderedRgbTransport(combined, boundary),
        3e-15,
        "whole-ray prefix/occupied/gap/tail reconstruction",
    );
});

test("one finite homogeneous RGB slab matches analytic emission-absorption", () => {
    const extinction = [0.2, 0.4, 0.8];
    const sourceFunction = [2, 1, 0.5];
    const result = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        farKm: 4,
        media: [{
            id: "rgb-slab",
            nearKm: 1,
            farKm: 3,
            maximumStepKm: 0.5,
            sample: () => constantSample(extinction, sourceFunction),
        }],
    }));
    const expectedT = extinction.map((value) => Math.exp(-value * 2));
    const expectedL = sourceFunction.map((value, channel) =>
        value * (1 - expectedT[channel]));
    vecNear(result.transport.transmittance, expectedT, 2e-15);
    vecNear(result.transport.radiance, expectedL, 2e-15);
    assert.ok(result.diagnostics.maximumAcceptedStepOpticalDepth <= 0.2 + 1e-12);
    assert.equal(result.diagnostics.reachedRefinementLimit, false);
});

test("finite events preserve exact atmosphere gaps and add coefficients in overlaps", () => {
    const airExtinction = [0.08, 0.1, 0.14];
    const airIncident = [0.3, 0.4, 0.5];
    const weatherExtinction = [0.5, 0.6, 0.7];
    const weatherIncident = [2.2, 1.8, 1.4];
    const exactCalls = [];
    const exactAir = (length) => ordered.integrateOrderedHomogeneousSegment(
        airExtinction,
        rgbMultiply(airExtinction, airIncident),
        length,
    );
    const result = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        atmosphere: {
            id: "air",
            maximumStepKm: 0.5,
            sample: () => constantSample(airExtinction, airIncident),
            segmentTransport: ({ nearKm, farKm }) => {
                exactCalls.push([nearKm, farKm]);
                return exactAir(farKm - nearKm);
            },
        },
        media: [{
            id: "rain-shaft",
            nearKm: 2,
            farKm: 4,
            maximumStepKm: 0.2,
            sample: () => constantSample(weatherExtinction, weatherIncident),
        }],
    }));
    const combinedExtinction = rgbAdd(airExtinction, weatherExtinction);
    const combinedSource = rgbAdd(
        rgbMultiply(airExtinction, airIncident),
        rgbMultiply(weatherExtinction, weatherIncident),
    );
    const expected = ordered.composeOrderedRgbTransport(
        exactAir(2),
        ordered.composeOrderedRgbTransport(
            ordered.integrateOrderedHomogeneousSegment(
                combinedExtinction, combinedSource, 2),
            exactAir(6),
        ),
    );
    vecNear(result.transport.radiance, expected.radiance, 2e-14);
    vecNear(result.transport.transmittance, expected.transmittance, 2e-14);
    assert.deepEqual(exactCalls, [[0, 2], [4, 10]],
        "the exact atmosphere path may only bypass certified weather-free gaps");
    assert.equal(result.diagnostics.exactAtmosphereSegmentCount, 2);
    assert.equal(result.diagnostics.boundedSpanCount, 1);
});

test("overlapping finite media are summed locally and input order is irrelevant", () => {
    const first = {
        id: "near-fog",
        nearKm: 1,
        farKm: 4,
        maximumStepKm: 0.25,
        sample: () => constantSample([0.2, 0.3, 0.4], [0.5, 0.6, 0.7]),
    };
    const second = {
        id: "fall-streak",
        nearKm: 3,
        farKm: 6,
        maximumStepKm: 0.25,
        sample: () => constantSample([0.7, 0.5, 0.3], [1.8, 1.4, 1.0]),
    };
    const forward = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        farKm: 7,
        media: [first, second],
    })).transport;
    const reversed = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        farKm: 7,
        media: [second, first],
    })).transport;
    assert.deepEqual(reversed, forward);

    const firstSource = rgbMultiply([0.2, 0.3, 0.4], [0.5, 0.6, 0.7]);
    const secondSource = rgbMultiply([0.7, 0.5, 0.3], [1.8, 1.4, 1.0]);
    const expected = ordered.composeOrderedRgbTransport(
        ordered.integrateOrderedHomogeneousSegment(
            [0.2, 0.3, 0.4], firstSource, 2),
        ordered.composeOrderedRgbTransport(
            ordered.integrateOrderedHomogeneousSegment(
                [0.9, 0.8, 0.7], rgbAdd(firstSource, secondSource), 1),
            ordered.integrateOrderedHomogeneousSegment(
                [0.7, 0.5, 0.3], secondSource, 2),
        ),
    );
    vecNear(forward.radiance, expected.radiance, 3e-14);
    vecNear(forward.transmittance, expected.transmittance, 3e-14);
});

const denseReference = ({ start, end, count, sample }) => {
    const stepKm = (end - start) / count;
    let transport = ordered.orderedTransportIdentity();
    for (let index = 0; index < count; index += 1) {
        const distanceKm = start + (index + 0.5) * stepKm;
        const value = sample(distanceKm);
        const scattering = value.scatteringPerKm ?? [0, 0, 0];
        const incident = value.scatteredIncidentRadiance ?? [0, 0, 0];
        const emission = value.emissionPerKm ?? [0, 0, 0];
        const source = rgbAdd(emission, rgbMultiply(scattering, incident));
        transport = ordered.composeOrderedRgbTransport(
            transport,
            ordered.integrateOrderedHomogeneousSegment(
                value.extinctionPerKm, source, stepKm),
        );
    }
    return transport;
};

test("adaptive heterogeneous integration converges to a dense ordered reference", () => {
    const sample = (distanceKm) => {
        const wave = Math.sin(distanceKm * 1.31) * 0.5 + 0.5;
        const extinction = [
            0.08 + 0.9 * wave,
            0.10 + 0.7 * wave,
            0.14 + 0.5 * wave,
        ];
        return {
            extinctionPerKm: extinction,
            scatteringPerKm: extinction.map((value) => value * 0.82),
            scatteredIncidentRadiance: [
                0.4 + 1.2 * Math.cos(distanceKm * 0.47) ** 2,
                0.5 + 0.8 * Math.sin(distanceKm * 0.38) ** 2,
                0.7 + 0.4 * Math.cos(distanceKm * 0.29) ** 2,
            ],
            emissionPerKm: [
                0.03 * Math.exp(-(((distanceKm - 4.3) / 0.8) ** 2)),
                0.01 * Math.exp(-(((distanceKm - 4.3) / 0.8) ** 2)),
                0.005 * Math.exp(-(((distanceKm - 4.3) / 0.8) ** 2)),
            ],
        };
    };
    const integrated = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        farKm: 8,
        maximumStepKm: 0.4,
        minimumStepKm: 0.0005,
        absoluteTolerance: 1e-9,
        relativeTolerance: 2e-5,
        media: [{
            id: "heterogeneous-mixed-phase-weather",
            nearKm: 0,
            farKm: 8,
            maximumStepKm: 0.4,
            sample: ({ distanceKm }) => sample(distanceKm),
        }],
    }));
    const reference = denseReference({ start: 0, end: 8, count: 80_000, sample });
    vecNear(integrated.transport.radiance, reference.radiance, 3e-5, "radiance");
    vecNear(integrated.transport.transmittance,
        reference.transmittance, 2e-7, "transmittance");
    assert.equal(integrated.diagnostics.reachedRefinementLimit, false);
    assert.ok(integrated.diagnostics.refinementCount > 0);
});

test("bounded nonemissive scattering remains passive under a radiance ceiling", () => {
    const ceiling = [4, 3, 2];
    const result = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        media: [{
            id: "passive-aerosol-and-rain",
            nearKm: 0.5,
            farKm: 9.5,
            maximumStepKm: 0.2,
            sample: ({ distanceKm }) => {
                const density = 0.1 + 1.4 * Math.sin(distanceKm * 0.7) ** 2;
                const extinction = [density, density * 0.8, density * 0.6];
                return constantSample(extinction, [
                    ceiling[0] * 0.72,
                    ceiling[1] * 0.61,
                    ceiling[2] * 0.83,
                ], [0.96, 0.94, 0.91]);
            },
        }],
    }));
    const output = ordered.applyOrderedRgbTransport(result.transport, ceiling);
    output.forEach((value, channel) => {
        assert.ok(value >= 0);
        assert.ok(value <= ceiling[channel] + 1e-10,
            `passive channel ${channel} gained radiance`);
        assert.ok(result.transport.transmittance[channel] >= 0 &&
            result.transport.transmittance[channel] <= 1);
    });
});

test("representative mean-depth wrapping fails for extended weather in air", () => {
    const airExtinction = [0.24, 0.32, 0.46];
    const airSourceFunction = [0.14, 0.18, 0.24];
    const weatherSample = (distanceKm) => {
        const frontal = Math.exp(-(((distanceKm - 2.0) / 0.55) ** 2));
        const trailing = Math.exp(-(((distanceKm - 7.4) / 0.9) ** 2));
        const extinction = [
            0.05 + 1.4 * frontal + 0.45 * trailing,
            0.06 + 1.2 * frontal + 0.38 * trailing,
            0.08 + 0.9 * frontal + 0.28 * trailing,
        ];
        return constantSample(extinction, [
            3.0 * frontal + 0.22,
            2.3 * frontal + 0.26,
            1.6 * frontal + 0.32,
        ], [0.98, 0.97, 0.95]);
    };
    const exact = ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        maximumStepKm: 0.15,
        atmosphere: {
            sample: () => constantSample(airExtinction, airSourceFunction),
            maximumStepKm: 0.15,
        },
        media: [{
            id: "extended-frontal-system",
            nearKm: 1,
            farKm: 9,
            maximumStepKm: 0.08,
            sample: ({ distanceKm }) => weatherSample(distanceKm),
        }],
    })).transport;

    // Mirror the old shader architecture: integrate weather alone, reduce it
    // to one opacity-weighted depth, wrap it in foreground air there, then put
    // that operator over a separately integrated clear-atmosphere background.
    const referenceCount = 120_000;
    const stepKm = 8 / referenceCount;
    let weather = ordered.orderedTransportIdentity();
    let weatherThroughput = [1, 1, 1];
    let weightedDepth = 0;
    let weight = 0;
    for (let index = 0; index < referenceCount; index += 1) {
        const distanceKm = 1 + (index + 0.5) * stepKm;
        const value = weatherSample(distanceKm);
        const source = rgbMultiply(
            value.scatteringPerKm, value.scatteredIncidentRadiance);
        const segment = ordered.integrateOrderedHomogeneousSegment(
            value.extinctionPerKm, source, stepKm);
        const visibleRemoval = weatherThroughput.map((throughput, channel) =>
            throughput * (1 - segment.transmittance[channel]));
        const contribution = visibleRemoval[0] * 0.2126 +
            visibleRemoval[1] * 0.7152 + visibleRemoval[2] * 0.0722;
        weightedDepth += distanceKm * contribution;
        weight += contribution;
        weather = ordered.composeOrderedRgbTransport(weather, segment);
        weatherThroughput = rgbMultiply(
            weatherThroughput, segment.transmittance);
    }
    const meanDepth = weightedDepth / weight;
    const airPrefix = ordered.integrateOrderedHomogeneousSegment(
        airExtinction,
        rgbMultiply(airExtinction, airSourceFunction),
        meanDepth,
    );
    const clearAir = ordered.integrateOrderedHomogeneousSegment(
        airExtinction,
        rgbMultiply(airExtinction, airSourceFunction),
        10,
    );
    const wrappedWeather = {
        radiance: weather.radiance.map((value, channel) =>
            airPrefix.transmittance[channel] * value +
            airPrefix.radiance[channel] * (1 - weather.transmittance[channel])),
        transmittance: weather.transmittance,
    };
    const representative = ordered.composeOrderedRgbTransport(
        wrappedWeather, clearAir);
    const relativeErrors = exact.radiance.map((value, channel) =>
        Math.abs(representative.radiance[channel] - value) /
            Math.max(1e-8, value));
    assert.ok(Math.max(...relativeErrors) > 0.12,
        `mean-depth approximation unexpectedly matched: ${relativeErrors}`);
    assert.ok(Math.max(...exact.transmittance.map((value, channel) =>
        Math.abs(value - representative.transmittance[channel]))) < 2e-5,
    "the failure is source placement/order, not Beer optical depth");
});

test("prefix transport inversion reconstructs a finite atmosphere segment", () => {
    const extinction = [0.1, 0.2, 0.3];
    const source = [0.04, 0.05, 0.06];
    const nearPrefix = ordered.integrateOrderedHomogeneousSegment(
        extinction, source, 2);
    const segment = ordered.integrateOrderedHomogeneousSegment(
        extinction, source, 3);
    const farPrefix = ordered.composeOrderedRgbTransport(nearPrefix, segment);
    const reconstructed = ordered.orderedRelativeTransportFromPrefixes(
        nearPrefix, farPrefix);
    vecNear(reconstructed.radiance, segment.radiance, 2e-15);
    vecNear(reconstructed.transmittance, segment.transmittance, 2e-15);
    assert.throws(() => ordered.orderedRelativeTransportFromPrefixes(
        { radiance: [0, 0, 0], transmittance: [0, 1, 1] }, farPrefix),
    /too opaque/);
});

test("invalid or non-passive local coefficient contracts fail loudly", () => {
    assert.throws(() => ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        atmosphere: {
            segmentTransport: () => ({
                radiance: [0, 0, 0],
                transmittance: [1, 1, 1],
            }),
        },
        media: [{
            id: "requires-local-air",
            nearKm: 1,
            farKm: 2,
            maximumStepKm: 0.1,
            sample: () => constantSample([1, 1, 1], [1, 1, 1]),
        }],
    })), /local atmosphere samples are required/);
    assert.throws(() => ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        media: [{
            id: "energy-gaining-albedo",
            nearKm: 1,
            farKm: 2,
            maximumStepKm: 0.1,
            sample: () => ({
                extinctionPerKm: [1, 1, 1],
                scatteringPerKm: [1.01, 1, 1],
                scatteredIncidentRadiance: [1, 1, 1],
            }),
        }],
    })), /scattering must not exceed extinction/);
    assert.throws(() => ordered.integrateOrderedWeatherAtmosphereRay(baseRay({
        media: [{
            id: "nonfinite-weather",
            nearKm: 1,
            farKm: 2,
            maximumStepKm: 0.1,
            sample: () => constantSample([Number.NaN, 1, 1], [1, 1, 1]),
        }],
    })), /finite components/);
});

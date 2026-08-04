import assert from "node:assert/strict";
import test from "node:test";
import {
    PHYSICAL_ATMOSPHERE_LUT_LAYOUT,
    PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY,
    PHYSICAL_ATMOSPHERE_UNIFORM_BYTES,
    PHYSICAL_ATMOSPHERE_UNIFORM_FLOATS,
    applyAtmosphereArtisticGrade,
    atmosphereSkyViewLutUv,
    atmosphereObserverTransmittanceToSpace,
    atmosphereTransmittanceBetween,
    atmosphereTransmittanceLutParameters,
    atmosphereTransmittanceLutUv,
    beerLambert,
    cornetteShanksPhase,
    createPhysicalAtmosphereGpuResources,
    createPhysicalAtmosphereState,
    integrateAtmosphereSegment,
    integrateAtmosphereViewRay,
    packPhysicalAtmosphereUniforms,
    physicalAtmosphereDirectionalLightingKey,
    physicalAtmosphereOpticalKey,
    physicalAtmosphereSkyKey,
    rayleighPhase,
    resolveAtmosphereSources,
    sampleAtmosphereMedium,
    transportTopOfAtmosphereSource,
    worldAltitudeDirectIrradiance,
} from "../components/backgrounds/sky/physical-atmosphere.ts";
import {
    PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL,
    PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL,
    PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL,
    PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL,
    PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL,
    physicalAtmosphereConsumerWgsl,
} from "../components/backgrounds/sky/physical-atmosphere-wgsl.ts";

const almostEqual = (left, right, tolerance = 1e-6) =>
    Math.abs(left - right) <= tolerance;
const assertVecNear = (left, right, tolerance = 1e-6) => {
    assert.equal(left.length, right.length);
    left.forEach((value, index) => assert.ok(
        almostEqual(value, right[index], tolerance),
        `channel ${index}: ${value} != ${right[index]}`,
    ));
};
const mean = (value) => value.reduce((sum, channel) => sum + channel, 0) / value.length;

const state = createPhysicalAtmosphereState();
const observer = [0, 0, state.bottomRadiusKm + state.observerAltitudeKm];
const sun = {
    kind: "sun",
    direction: [0.2, 0.1, 0.974679434],
    topOfAtmosphereRadiance: [1.0e7, 0.97e7, 0.91e7],
    angularRadiusRadians: 0.004675,
};
const moon = {
    kind: "moon",
    direction: [-0.4, 0.3, 0.8660254],
    topOfAtmosphereRadiance: [4200, 4500, 5000],
    angularRadiusRadians: 0.00452,
};

test("Earth state resolves physical coefficients and weather-dependent aerosols", () => {
    assert.equal(state.bottomRadiusKm, 6360);
    assert.equal(state.topRadiusKm, 6460);
    assert.deepEqual(state.rayleighScatteringKm, [0.005802, 0.013558, 0.0331]);
    assert.ok(state.mieScatteringKm.every((value) => value > 0));
    assert.ok(state.mieAbsorptionKm.every((value) => value >= 0));
    assert.ok(state.ozoneAbsorptionKm[1] > state.ozoneAbsorptionKm[0]);
    const dry = createPhysicalAtmosphereState({ aerosolType: "maritime", relativeHumidity: 0.2 });
    const humid = createPhysicalAtmosphereState({ aerosolType: "maritime", relativeHumidity: 0.94 });
    assert.ok(humid.aerosolOpticalDepth550 > dry.aerosolOpticalDepth550);
    assert.ok(mean(humid.mieScatteringKm) > mean(dry.mieScatteringKm));
    const dust = createPhysicalAtmosphereState({ aerosolType: "dust" });
    const sulfate = createPhysicalAtmosphereState({ aerosolType: "sulfate" });
    assert.notDeepEqual(dust.mieScatteringKm, sulfate.mieScatteringKm);
    assert.ok(dust.mieAbsorptionKm[2] > dust.mieAbsorptionKm[0]);
    const coarse = createPhysicalAtmosphereState({
        aerosolType: "clean",
        aerosolAngstromExponent: 0.2,
        aerosolSingleScatteringAlbedo: [0.72, 0.8, 0.9],
        aerosolAsymmetry: 0.88,
    });
    assert.equal(coarse.aerosolAngstromExponent, 0.2);
    assert.deepEqual(coarse.aerosolSingleScatteringAlbedo, [0.72, 0.8, 0.9]);
    assert.equal(coarse.mieAsymmetry, 0.88);
    assert.ok(coarse.mieAbsorptionKm[0] > coarse.mieAbsorptionKm[2]);
});

test("density profiles and medium coefficients are nonnegative and decay correctly", () => {
    const sea = sampleAtmosphereMedium(state, 0);
    const high = sampleAtmosphereMedium(state, 30);
    assert.equal(sea.rayleighDensity, 1);
    assert.ok(sea.mieDensity > 0.95 && sea.mieDensity <= 1,
        "the smooth mixing-layer profile approaches, but need not equal, unit sea-level density");
    assert.ok(high.rayleighDensity < sea.rayleighDensity);
    assert.ok(high.mieDensity < high.rayleighDensity);
    assert.ok(high.ozoneDensity > sea.ozoneDensity);
    for (const sample of [sea, high, sampleAtmosphereMedium(state, 100)]) {
        assert.ok([...sample.scattering, ...sample.absorption, ...sample.extinction]
            .every((value) => Number.isFinite(value) && value >= 0));
        sample.extinction.forEach((value, channel) =>
            assert.ok(value >= sample.scattering[channel]));
    }
});

test("tropospheric and stratospheric aerosol columns are conserved independently", () => {
    const columnState = createPhysicalAtmosphereState({
        aerosolType: "continental",
        aerosolOpticalDepth550: 0.18,
        relativeHumidity: 0.45,
        aerosolBoundaryLayerStrength: 0.78,
        aerosolBoundaryLayerHeightKm: 0.72,
        aerosolBoundaryLayerTransitionKm: 0.11,
        stratosphericAerosolOpticalDepth550: 0.09,
        stratosphericAerosolCenterAltitudeKm: 21,
        stratosphericAerosolWidthKm: 3.8,
    });
    const steps = 4096;
    const atmosphereHeight = columnState.topRadiusKm - columnState.bottomRadiusKm;
    const stepKm = atmosphereHeight / steps;
    let aerosolColumn550 = 0;
    for (let index = 0; index < steps; index += 1) {
        const sample = sampleAtmosphereMedium(columnState, (index + 0.5) * stepKm);
        const ozoneAbsorption = columnState.ozoneAbsorptionKm[1] * sample.ozoneDensity;
        aerosolColumn550 += Math.max(0,
            sample.extinction[1] - sample.rayleighScattering[1] - ozoneAbsorption) * stepKm;
    }
    assert.ok(Math.abs(aerosolColumn550 - 0.27) < 8e-4,
        `resolved 550 nm aerosol column drifted: ${aerosolColumn550}`);
    const stratosphericPeak = sampleAtmosphereMedium(columnState, 21);
    const belowLayer = sampleAtmosphereMedium(columnState, 8);
    assert.ok(mean(stratosphericPeak.stratosphericMieScattering) >
        mean(belowLayer.stratosphericMieScattering) * 100,
    "elevated aerosol must remain an actual elevated layer");
});

test("inversion reorganizes haze vertically without changing its optical column", () => {
    const common = {
        aerosolType: "maritime",
        aerosolOpticalDepth550: 0.16,
        relativeHumidity: 0.45,
    };
    const diffuse = createPhysicalAtmosphereState({
        ...common,
        aerosolBoundaryLayerStrength: 0,
    });
    const trapped = createPhysicalAtmosphereState({
        ...common,
        aerosolBoundaryLayerStrength: 0.9,
        aerosolBoundaryLayerHeightKm: 0.55,
        aerosolBoundaryLayerTransitionKm: 0.07,
    });
    const aerosolExtinction550 = (resolved, altitude) => {
        const sample = sampleAtmosphereMedium(resolved, altitude);
        return sample.mieScattering[1] +
            resolved.mieAbsorptionKm[1] * sample.mieDensity +
            resolved.stratosphericMieAbsorptionKm[1] * sample.stratosphericMieDensity;
    };
    assert.ok(aerosolExtinction550(trapped, 0.1) > aerosolExtinction550(diffuse, 0.1));
    assert.ok(aerosolExtinction550(trapped, 3) < aerosolExtinction550(diffuse, 3) * 0.21);
    const integrateColumn = (resolved) => {
        const step = 0.02;
        let column = 0;
        for (let altitude = step * 0.5; altitude < 100; altitude += step) {
            column += aerosolExtinction550(resolved, altitude) * step;
        }
        return column;
    };
    assert.ok(Math.abs(integrateColumn(diffuse) - integrateColumn(trapped)) < 4e-4);
});

test("ozone uses an equal-column smooth layer without density kinks", () => {
    const ozoneState = createPhysicalAtmosphereState({
        ozoneCenterAltitudeKm: 25,
        ozoneHalfWidthKm: 15,
    });
    const density = (altitude) => sampleAtmosphereMedium(ozoneState, altitude).ozoneDensity;
    const epsilon = 1e-3;
    assert.ok(Math.abs(density(25 - epsilon) - density(25 + epsilon)) < 1e-10);
    assert.ok(density(10) === 0 && density(40) === 0);
    assert.ok(density(10 + epsilon) < 2e-8 && density(40 - epsilon) < 2e-8,
        "raised-cosine support must meet the zero-density atmosphere smoothly");
    const step = 0.005;
    let column = 0;
    for (let altitude = 0.5 * step; altitude < 100; altitude += step) {
        column += density(altitude) * step;
    }
    assert.ok(Math.abs(column - ozoneState.ozoneHalfWidthKm) < 2e-5);
});

test("ozone Dobson column is invariant under valid profile geometry", () => {
    const profiles = [
        createPhysicalAtmosphereState({
            ozoneColumnDobson: 340,
            ozoneCenterAltitudeKm: 25,
            ozoneHalfWidthKm: 15,
        }),
        createPhysicalAtmosphereState({
            ozoneColumnDobson: 340,
            ozoneCenterAltitudeKm: 18,
            ozoneHalfWidthKm: 8,
        }),
        createPhysicalAtmosphereState({
            ozoneColumnDobson: 340,
            ozoneCenterAltitudeKm: 12,
            ozoneHalfWidthKm: 30,
        }),
    ];
    const integrateOzoneAbsorption = (resolved, channel) => {
        const steps = 20_000;
        const height = resolved.topRadiusKm - resolved.bottomRadiusKm;
        const stepKm = height / steps;
        let column = 0;
        for (let index = 0; index < steps; index += 1) {
            const sample = sampleAtmosphereMedium(
                resolved,
                (index + 0.5) * stepKm,
            );
            column += resolved.ozoneAbsorptionKm[channel] *
                sample.ozoneDensity * stepKm;
        }
        return column;
    };
    for (const channel of [0, 1, 2]) {
        const columns = profiles.map((profile) =>
            integrateOzoneAbsorption(profile, channel));
        const reference = columns[0];
        columns.slice(1).forEach((column) => assert.ok(
            Math.abs(column - reference) / reference < 2e-4,
            `ozone channel ${channel} column drifted: ${columns.join(", ")}`,
        ));
    }
});

test("Beer-Lambert transport is exact, monotone and bounded", () => {
    const extinction = [0.02, 0.04, 0.08];
    assertVecNear(beerLambert(extinction, 0), [1, 1, 1]);
    assertVecNear(beerLambert(extinction, 10), extinction.map((value) => Math.exp(-value * 10)));
    const near = beerLambert(extinction, 2);
    const far = beerLambert(extinction, 20);
    far.forEach((value, channel) => {
        assert.ok(value >= 0 && value <= 1);
        assert.ok(value < near[channel]);
    });
});

test("finite point-to-point transmittance is reciprocal and path monotone", () => {
    const a = [0, 0, state.bottomRadiusKm + 0.2];
    const b = [12, 1, state.bottomRadiusKm + 1.0];
    const c = [30, 2, state.bottomRadiusKm + 2.5];
    const ab = atmosphereTransmittanceBetween(state, a, b, 192);
    const ba = atmosphereTransmittanceBetween(state, b, a, 192);
    assertVecNear(ab, ba, 2e-6);
    const ac = atmosphereTransmittanceBetween(state, a, c, 256);
    ac.forEach((value, channel) => assert.ok(value < ab[channel]));
});

test("observer celestial transfer is the exact configured atmosphere path", () => {
    const direction = [0.31, 0.14, Math.sqrt(1 - 0.31 ** 2 - 0.14 ** 2)];
    const observerWorld = [
        0,
        0,
        state.bottomRadiusKm + state.observerAltitudeKm,
    ];
    assertVecNear(
        atmosphereObserverTransmittanceToSpace(
            state,
            direction,
            state.observerAltitudeKm,
            96,
        ),
        transportTopOfAtmosphereSource(state, observerWorld, {
            kind: "moon",
            direction,
            topOfAtmosphereRadiance: [1, 1, 1],
            angularRadiusRadians: 0.00452,
        }),
        1e-12,
    );
    assert.deepEqual(
        atmosphereObserverTransmittanceToSpace(state, [1, 0, -0.02]),
        [0, 0, 0],
        "a direct celestial path through the planet is fully blocked",
    );
});

test("transmittance parameterization round-trips and horizon split is continuous", () => {
    for (const radius of [state.bottomRadiusKm + 0.002, state.bottomRadiusKm + 8, state.topRadiusKm - 0.1]) {
        const tangent = -Math.sqrt(Math.max(0, 1 - (state.bottomRadiusKm / radius) ** 2));
        for (const mu of [Math.max(tangent + 0.01, -0.99), 0, 0.55, 1]) {
            const uv = atmosphereTransmittanceLutUv(state, radius, mu);
            const roundTrip = atmosphereTransmittanceLutParameters(state, uv);
            assert.ok(Math.abs(roundTrip.radiusKm - radius) < 1e-5);
            assert.ok(Math.abs(roundTrip.zenithCosine - mu) < 2e-5);
        }
    }
    const radius = state.bottomRadiusKm + state.observerAltitudeKm;
    const horizonCosine = -Math.sqrt(Math.max(0,
        1 - (state.bottomRadiusKm / radius) ** 2));
    const above = atmosphereSkyViewLutUv(state, state.observerAltitudeKm,
        horizonCosine + 1e-10, 0.2, false);
    const below = atmosphereSkyViewLutUv(state, state.observerAltitudeKm,
        horizonCosine - 1e-10, 0.2, true);
    assert.ok(Math.abs(above[1] - below[1]) < 2e-4,
        `horizon branches diverged: ${above[1]} vs ${below[1]}`);
});

test("Rayleigh and Cornette-Shanks phases are nonnegative and energy normalized", () => {
    const integratePhase = (phase) => {
        const steps = 100_000;
        let integral = 0;
        for (let index = 0; index < steps; index += 1) {
            const mu = -1 + 2 * (index + 0.5) / steps;
            const value = phase(mu);
            assert.ok(value >= 0 && Number.isFinite(value));
            integral += value * 2 / steps * 2 * Math.PI;
        }
        return integral;
    };
    assert.ok(Math.abs(integratePhase(rayleighPhase) - 1) < 2e-6);
    assert.ok(Math.abs(integratePhase((mu) => cornetteShanksPhase(state.mieAsymmetry, mu)) - 1) < 4e-5);
});

test("aerosol transport places the forward lobe toward the source", () => {
    const elevation = 0.42;
    const horizontal = Math.sqrt(1 - elevation ** 2);
    const toward = [horizontal, 0, elevation];
    const away = [-horizontal, 0, elevation];
    const directionalSun = { ...sun, direction: toward };
    const pointAt = (direction) => direction.map(
        (component, index) => observer[index] + component * 12,
    );
    const forward = integrateAtmosphereSegment(
        state, observer, pointAt(toward), [directionalSun], 64,
    );
    const backward = integrateAtmosphereSegment(
        state, observer, pointAt(away), [directionalSun], 64,
    );
    assert.ok(mean(forward.radiance) > mean(backward.radiance) * 2,
        "camera rays toward the Sun must contain the aerosol forward lobe");
});

test("Sun and Moon use the same TOA transport with no double attenuation", () => {
    const shared = {
        direction: [0.3, 0.1, Math.sqrt(0.9)],
        topOfAtmosphereRadiance: [100, 80, 60],
        angularRadiusRadians: 0.0046,
    };
    const sunlight = transportTopOfAtmosphereSource(state, observer, { kind: "sun", ...shared });
    const moonlight = transportTopOfAtmosphereSource(state, observer, { kind: "moon", ...shared });
    assertVecNear(sunlight, moonlight, 1e-9);
    const half = transportTopOfAtmosphereSource(state, observer, {
        kind: "moon",
        ...shared,
        topOfAtmosphereRadiance: shared.topOfAtmosphereRadiance.map((value) => value * 0.5),
    });
    assertVecNear(half, sunlight.map((value) => value * 0.5), 1e-9);
    const directTransmittance = sunlight.map((value, channel) =>
        value / shared.topOfAtmosphereRadiance[channel]);
    assert.ok(directTransmittance.every((value) => value > 0 && value <= 1));
});

test("day, twilight and lunar-night sources remain physically distinct", () => {
    const daylight = transportTopOfAtmosphereSource(state, observer, sun);
    assert.ok(daylight.every((value) => value > 0));
    const belowHorizonSun = {
        ...sun,
        direction: [Math.sqrt(1 - 0.05 ** 2), 0, -0.05],
    };
    assert.deepEqual(transportTopOfAtmosphereSource(state, observer, belowHorizonSun), [0, 0, 0]);
    const upperAir = [0, 0, state.bottomRadiusKm + 30];
    const twilight = integrateAtmosphereSegment(state, observer, upperAir, [belowHorizonSun], 48);
    assert.ok(mean(twilight.radiance) > 0, "upper twilight air must remain illuminated");
    const lunar = transportTopOfAtmosphereSource(state, observer, moon);
    assert.ok(lunar.every((value) => value > 0));
    assert.ok(mean(lunar) < mean(daylight));
    const noSources = integrateAtmosphereSegment(state, observer, upperAir, [], 24);
    assert.deepEqual(noSources.radiance, [0, 0, 0]);
    assert.ok(noSources.transmittance.every((value) => value > 0 && value <= 1));
});

test("one spherical transport equation spans noon, golden hour, twilight and night", () => {
    const clear = createPhysicalAtmosphereState({
        aerosolType: "clean",
        aerosolOpticalDepth550: 0.04,
        relativeHumidity: 0.35,
    });
    const sourceAtElevation = (vertical) => ({
        ...sun,
        direction: [Math.sqrt(Math.max(0, 1 - vertical * vertical)), 0, vertical],
    });
    const zenith = [0, 0, 1];
    const noon = integrateAtmosphereViewRay(clear, 0.002, zenith,
        [sourceAtElevation(0.8)], 128);
    const golden = integrateAtmosphereViewRay(clear, 0.002, zenith,
        [sourceAtElevation(0.08)], 128);
    const civilTwilight = integrateAtmosphereViewRay(clear, 0.002, zenith,
        [sourceAtElevation(-0.05)], 128);
    const moonlit = integrateAtmosphereViewRay(clear, 0.002, zenith, [moon], 128);
    const moonless = integrateAtmosphereViewRay(clear, 0.002, zenith, [], 128);
    assert.ok(mean(noon.radiance) > mean(golden.radiance));
    assert.ok(mean(golden.radiance) > mean(civilTwilight.radiance));
    assert.ok(mean(civilTwilight.radiance) > mean(moonlit.radiance));
    assert.ok(mean(moonlit.radiance) > 0);
    assert.deepEqual(moonless.radiance, [0, 0, 0],
        "moonless atmospheric scattering has no invented palette light; airglow/stars are celestial sources");
    for (const regime of [noon, golden, civilTwilight, moonlit, moonless]) {
        assert.ok([...regime.radiance, ...regime.transmittance].every(Number.isFinite));
        assert.ok(regime.transmittance.every((channel) => channel >= 0 && channel <= 1));
    }
});

test("observer altitude removes lower-air optical depth without changing TOA energy", () => {
    const hazy = createPhysicalAtmosphereState({
        aerosolType: "maritime",
        aerosolOpticalDepth550: 0.24,
        relativeHumidity: 0.86,
        aerosolBoundaryLayerStrength: 0.82,
        aerosolBoundaryLayerHeightKm: 0.8,
    });
    const seaPoint = [0, 0, hazy.bottomRadiusKm + 0.002];
    const alpinePoint = [0, 0, hazy.bottomRadiusKm + 2.4];
    const seaBeam = transportTopOfAtmosphereSource(hazy, seaPoint, sun);
    const alpineBeam = transportTopOfAtmosphereSource(hazy, alpinePoint, sun);
    alpineBeam.forEach((channel, index) => assert.ok(channel > seaBeam[index]));
    assert.deepEqual(sun.topOfAtmosphereRadiance, [1.0e7, 0.97e7, 0.91e7]);
});

test("world-altitude irradiance and finite aerial composition conserve sign and ordering", () => {
    const low = worldAltitudeDirectIrradiance(state, 0.01, sun);
    const high = worldAltitudeDirectIrradiance(state, 20, sun);
    assert.ok(low.every((value) => value >= 0));
    high.forEach((value, channel) => assert.ok(value > low[channel]));
    const segment = integrateAtmosphereSegment(
        state,
        observer,
        [8, 0, state.bottomRadiusKm + 1],
        [sun, moon],
        40,
    );
    assert.ok(segment.radiance.every((value) => value >= 0 && Number.isFinite(value)));
    assert.ok(segment.transmittance.every((value) => value >= 0 && value <= 1));
});

test("palette intent is a bounded post-physical residual and never changes optical LUT identity", () => {
    const neutral = createPhysicalAtmosphereState();
    const graded = createPhysicalAtmosphereState({
        grade: {
            exposureCompensationEv: 10,
            chromaResidual: [1, -1, 0.05],
            moodStrength: 1,
        },
    });
    assert.equal(physicalAtmosphereOpticalKey(neutral), physicalAtmosphereOpticalKey(graded));
    assert.deepEqual(graded.grade, {
        exposureCompensationEv: 1.5,
        chromaResidual: [0.12, -0.12, 0.05],
        moodStrength: 0.35,
    });
    const result = applyAtmosphereArtisticGrade([0.1, 0.2, 0.3], graded.grade);
    assert.ok(result.every((value) => value >= 0));
    assert.ok(result[0] / 0.1 < 3.1, "grade remains a residual, not source radiance");
});

test("uniform ABI contains two normalized TOA sources and fixed texture layouts", () => {
    const packed = packPhysicalAtmosphereUniforms(state, { sources: [moon, sun] });
    assert.equal(packed.length, PHYSICAL_ATMOSPHERE_UNIFORM_FLOATS);
    assert.equal(packed.byteLength, PHYSICAL_ATMOSPHERE_UNIFORM_BYTES);
    assert.ok([...packed].every(Number.isFinite));
    // Slots remain kind-stable even when input order is reversed.
    assertVecNear([...packed.slice(24, 27)], sun.direction, 1e-6);
    assertVecNear([...packed.slice(32, 35)], moon.direction, 1e-6);
    assertVecNear([...packed.slice(52, 55)], state.stratosphericMieScatteringKm, 1e-8);
    assert.equal(packed[55], state.stratosphericAerosolCenterAltitudeKm);
    assertVecNear([...packed.slice(56, 59)], state.stratosphericMieAbsorptionKm, 1e-8);
    assert.equal(packed[59], state.stratosphericAerosolWidthKm);
    assertVecNear([...packed.slice(60, 64)], [
        state.aerosolBoundaryLayerStrength,
        state.aerosolBoundaryLayerHeightKm,
        state.aerosolBoundaryLayerTransitionKm,
        state.stratosphericMieAsymmetry,
    ], 1e-6);
    const spectralGround = createPhysicalAtmosphereState({
        groundAlbedo: [-1, 0.23, 4],
    });
    assertVecNear(spectralGround.groundAlbedo, [0, 0.23, 0.95], 1e-6);
    const spectralPacked = packPhysicalAtmosphereUniforms(
        spectralGround,
        { sources: [sun, moon] },
    );
    assertVecNear([...spectralPacked.slice(20, 23)], [0, 0.23, 0.95], 1e-6);
    assert.equal(PHYSICAL_ATMOSPHERE_SOURCE_CAPACITY, 2);
    assert.deepEqual(PHYSICAL_ATMOSPHERE_LUT_LAYOUT.transmittance, {
        width: 256, height: 64, depthOrArrayLayers: 1, format: "rgba16float",
    });
    assert.deepEqual(PHYSICAL_ATMOSPHERE_LUT_LAYOUT.multipleScattering, {
        width: 32, height: 32, depthOrArrayLayers: 1, format: "rgba16float",
    });
    assert.deepEqual(PHYSICAL_ATMOSPHERE_LUT_LAYOUT.skyView, {
        width: 192, height: 108, depthOrArrayLayers: 2, format: "rgba16float",
    });
    assert.deepEqual(PHYSICAL_ATMOSPHERE_LUT_LAYOUT.directionalCoupling, {
        width: 96, height: 96, depthOrArrayLayers: 193, format: "rgba16float",
    });
});

test("optical, sky-view and source-radiance invalidation domains stay separate", () => {
    const lighting = { sources: [sun, moon] };
    const brighter = { sources: [
        { ...sun, topOfAtmosphereRadiance: sun.topOfAtmosphereRadiance.map((value) => value * 2) },
        moon,
    ] };
    assert.equal(physicalAtmosphereSkyKey(state, lighting), physicalAtmosphereSkyKey(state, brighter));
    assert.notEqual(
        physicalAtmosphereDirectionalLightingKey(state, lighting),
        physicalAtmosphereDirectionalLightingKey(state, brighter),
    );
    const moved = { sources: [{ ...sun, direction: [0.4, 0, Math.sqrt(0.84)] }, moon] };
    assert.notEqual(physicalAtmosphereSkyKey(state, lighting), physicalAtmosphereSkyKey(state, moved));
    assert.notEqual(
        physicalAtmosphereDirectionalLightingKey(state, lighting),
        physicalAtmosphereDirectionalLightingKey(state, moved),
    );
    const humid = createPhysicalAtmosphereState({ relativeHumidity: 0.9 });
    assert.notEqual(physicalAtmosphereOpticalKey(state), physicalAtmosphereOpticalKey(humid));
    const elevated = createPhysicalAtmosphereState({
        stratosphericAerosolOpticalDepth550: 0.08,
    });
    assert.notEqual(physicalAtmosphereOpticalKey(state), physicalAtmosphereOpticalKey(elevated));
    const inverted = createPhysicalAtmosphereState({
        aerosolBoundaryLayerStrength: 0.8,
        aerosolBoundaryLayerHeightKm: 0.6,
    });
    assert.notEqual(physicalAtmosphereOpticalKey(state), physicalAtmosphereOpticalKey(inverted));
});

test("WGSL exposes physical transfer APIs without palette-authored source radiance", () => {
    const shaders = [
        PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL,
        PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL,
        PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL,
        PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL,
        PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL,
    ];
    for (const shader of shaders) {
        assert.match(shader, /struct PhysicalAtmosphereUniforms/);
        assert.doesNotMatch(shader, /palette|gradient|sunsetColor|nightColor/i);
        assert.equal((shader.match(/@compute/g) ?? []).length, 1);
    }
    assert.match(PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL,
        /texture_storage_2d<rgba16float, write>/);
    assert.match(PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL, /vec3f\(1\.0\) - ratio/);
    assert.match(PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL,
        /texture_storage_2d_array<rgba16float, write>/);
    const consumer = physicalAtmosphereConsumerWgsl({ group: 2, uniformBinding: 7 });
    assert.match(consumer, /@group\(2\) @binding\(7\)/);
    assert.match(consumer, /fn physical_atmosphere_source_transmittance/);
    assert.match(consumer, /fn physical_atmosphere_sky_radiance/);
    assert.match(consumer, /fn physical_atmosphere_world_irradiance/);
    assert.match(consumer, /fn physical_atmosphere_segment/);
    assert.match(consumer, /fn physical_atmosphere_compose_segment/);
    assert.match(consumer, /atmo_source_solid_angle/);
    assert.match(consumer, /fn physical_atmosphere_apply_grade/);
    assert.match(consumer, /fn atmo_stratospheric_mie_density/);
    assert.match(consumer, /fn atmo_mie_phase_scattering/);
    assert.match(consumer, /let cos_theta = dot\(direction, source_direction\)/);
    assert.doesNotMatch(consumer, /dot\(-direction, source_direction\)/);
});

test("GPU resource graph dispatches bounded invalidation and cleans up idempotently", async () => {
    const records = {
        textures: [], buffers: [], samplers: [], modules: [], pipelines: [],
        bindGroups: [], writes: [], destroyed: 0, passes: [],
    };
    const resource = (descriptor) => ({
        descriptor,
        createView(viewDescriptor = {}) { return { owner: this, viewDescriptor }; },
        destroy() { records.destroyed += 1; },
    });
    const device = {
        createTexture(descriptor) {
            records.textures.push(descriptor);
            return resource(descriptor);
        },
        createBuffer(descriptor) {
            records.buffers.push(descriptor);
            return resource(descriptor);
        },
        createSampler(descriptor) {
            records.samplers.push(descriptor);
            return resource(descriptor);
        },
        createShaderModule(descriptor) {
            records.modules.push(descriptor);
            return descriptor;
        },
        async createComputePipelineAsync(descriptor) {
            records.pipelines.push(descriptor);
            return { descriptor, getBindGroupLayout(index) { return { descriptor, index }; } };
        },
        createBindGroup(descriptor) {
            records.bindGroups.push(descriptor);
            return descriptor;
        },
        queue: {
            writeBuffer(buffer, offset, data) {
                records.writes.push({ buffer, offset, bytes: data.byteLength });
            },
        },
    };
    const makeEncoder = () => ({
        beginComputePass(descriptor) {
            const record = { descriptor, dispatch: null };
            records.passes.push(record);
            return {
                setPipeline(pipeline) { record.pipeline = pipeline; },
                setBindGroup(index, bindGroup) { record.bindGroup = { index, bindGroup }; },
                dispatchWorkgroups(x, y, z) { record.dispatch = [x, y, z]; },
                end() { record.ended = true; },
            };
        },
    });
    const resources = await createPhysicalAtmosphereGpuResources(device, state, {
        sources: [sun, moon],
    });
    assert.equal(records.textures.length, 5);
    assert.equal(records.pipelines.length, 5);
    assert.deepEqual(records.pipelines.map((pipeline) => pipeline.compute.entryPoint), [
        "transmittance_compute",
        "multiple_scattering_compute",
        "irradiance_compute",
        "sky_view_compute",
        "directional_lighting_compute",
    ]);
    assert.equal(records.bindGroups.length, 5);
    assert.equal(records.writes.length, 1);
    assert.equal(records.samplers[0].addressModeU, "clamp-to-edge");
    assert.equal(records.samplers[0].minFilter, "linear");
    assert.equal(records.textures.find((texture) => texture.label.includes("skyView"))
        .size.depthOrArrayLayers, 2);
    const first = resources.encodePendingLutUpdates(makeEncoder());
    assert.deepEqual(first.passes, [
        "transmittance", "multiple-scattering", "irradiance", "sky-view",
        "directional-lighting",
    ]);
    assert.deepEqual(records.passes.map((pass) => pass.dispatch), [
        [32, 8, 1], [4, 4, 1], [8, 4, 1], [24, 14, 2], [12, 1, 1],
    ]);
    assert.deepEqual(resources.encodePendingLutUpdates(makeEncoder()).passes, []);

    const brighterSun = { ...sun, topOfAtmosphereRadiance: [2e7, 2e7, 2e7] };
    const brightnessUpdate = resources.update(state, { sources: [brighterSun, moon] });
    assert.deepEqual(brightnessUpdate, {
        opticalChanged: false,
        skyViewChanged: false,
        directionalLightingChanged: true,
        uniformChanged: true,
    });
    assert.deepEqual(resources.encodePendingLutUpdates(makeEncoder()).passes,
        ["directional-lighting"]);

    const directionUpdate = resources.update(state, {
        sources: [{ ...brighterSun, direction: [0.5, 0, Math.sqrt(0.75)] }, moon],
    });
    assert.equal(directionUpdate.skyViewChanged, true);
    assert.equal(directionUpdate.directionalLightingChanged, true);
    assert.deepEqual(resources.encodePendingLutUpdates(makeEncoder()).passes,
        ["sky-view", "directional-lighting"]);

    const hazy = createPhysicalAtmosphereState({
        aerosolType: "urban",
        relativeHumidity: 0.82,
    });
    assert.equal(resources.update(hazy, { sources: [sun, moon] }).opticalChanged, true);
    assert.deepEqual(resources.encodePendingLutUpdates(makeEncoder()).passes,
        ["transmittance", "multiple-scattering", "irradiance", "sky-view",
            "directional-lighting"]);
    const expectedMemory = Object.values(PHYSICAL_ATMOSPHERE_LUT_LAYOUT)
        .reduce((sum, layout) => sum + layout.width * layout.height *
            layout.depthOrArrayLayers * 8, 0);
    assert.equal(resources.textureMemoryBytes, expectedMemory);
    resources.destroy();
    resources.destroy();
    assert.equal(records.destroyed, 7);
    assert.throws(() => resources.update(state, { sources: [sun] }), /destroyed/);
});

test("partial GPU construction cleans resources when shader compilation fails", async () => {
    let destroyed = 0;
    const resource = () => ({
        createView() { return {}; },
        destroy() { destroyed += 1; },
    });
    const device = {
        createTexture: resource,
        createBuffer: resource,
        createSampler: resource,
        createShaderModule() { return {}; },
        async createComputePipelineAsync() { throw new Error("synthetic shader failure"); },
        createBindGroup() { throw new Error("must not reach bind groups"); },
        queue: { writeBuffer() {} },
    };
    await assert.rejects(
        createPhysicalAtmosphereGpuResources(device, state, { sources: [sun, moon] }),
        /synthetic shader failure/,
    );
    assert.equal(destroyed, 7);
});

test("source resolver remains kind-stable", () => {
    const [resolvedSun, resolvedMoon] = resolveAtmosphereSources([moon, sun]);
    assert.equal(resolvedSun.kind, "sun");
    assert.equal(resolvedMoon.kind, "moon");
    assert.ok(Math.abs(Math.hypot(...resolvedSun.direction) - 1) < 1e-7);
    assert.ok(Math.abs(Math.hypot(...resolvedMoon.direction) - 1) < 1e-7);
});

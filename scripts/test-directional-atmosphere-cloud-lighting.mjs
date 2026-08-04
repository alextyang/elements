import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import ts from "typescript";

const compileCommonJs = (relativePath, dependency = {}) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const moduleObject = { exports: {} };
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (Object.hasOwn(dependency, specifier)) return dependency[specifier];
            throw new Error(`Unexpected test import ${specifier}`);
        },
    );
    return moduleObject.exports;
};

const coupling = compileCommonJs(
    "../components/backgrounds/sky/directional-atmosphere-cloud-lighting.ts",
);
const wgslModule = compileCommonJs(
    "../components/backgrounds/sky/directional-atmosphere-cloud-lighting-wgsl.ts",
    { "./directional-atmosphere-cloud-lighting.ts": coupling },
);
const wgsl = wgslModule.DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL;

const radians = (degrees) => degrees * Math.PI / 180;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const dot = (left, right) => left.reduce((sum, value, index) =>
    sum + value * right[index], 0);
const add = (left, right) => left.map((value, index) => value + right[index]);
const scale = (value, amount) => value.map((component) => component * amount);
const mul = (left, right) => left.map((value, index) => value * right[index]);
const luminance = (rgb) => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const direction = (azimuthDegrees, elevationDegrees) => {
    const azimuth = radians(azimuthDegrees);
    const elevation = radians(elevationDegrees);
    const horizontal = Math.cos(elevation);
    return [Math.sin(azimuth) * horizontal, Math.sin(elevation),
        Math.cos(azimuth) * horizontal];
};
const sphericalGaussian = (axis, sampleDirection, sharpness) =>
    Math.exp(sharpness * (clamp(dot(axis, sampleDirection), -1, 1) - 1));

const fibonacciSphere = (sampleCount, radianceEvaluator) => {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const solidAngle = Math.PI * 4 / sampleCount;
    return Array.from({ length: sampleCount }, (_, index) => {
        const vertical = 1 - 2 * (index + 0.5) / sampleCount;
        const radius = Math.sqrt(Math.max(0, 1 - vertical * vertical));
        const azimuth = index * goldenAngle;
        const sampleDirection = [radius * Math.cos(azimuth), vertical,
            radius * Math.sin(azimuth)];
        return {
            direction: sampleDirection,
            radianceRgb: radianceEvaluator(sampleDirection),
            solidAngleSteradians: solidAngle,
        };
    });
};

const environments = {
    noon: {
        source: { kind: "sun", direction: direction(15, 65), enabled: true },
        radiance: (sampleDirection) => {
            const up = Math.max(0, sampleDirection[1]);
            const below = Math.max(0, -sampleDirection[1]);
            const broadSky = [0.13 + 0.13 * up, 0.27 + 0.22 * up,
                0.55 + 0.31 * up];
            const lowerAir = scale([0.08, 0.11, 0.16], below);
            const sunward = scale([0.72, 0.68, 0.58], sphericalGaussian(
                direction(15, 65), sampleDirection, 13));
            return add(add(broadSky, lowerAir), sunward);
        },
    },
    golden: {
        source: { kind: "sun", direction: direction(-35, 7), enabled: true },
        radiance: (sampleDirection) => {
            const elevation = Math.asin(clamp(sampleDirection[1], -1, 1));
            const horizon = Math.exp(-0.5 * (elevation / radians(11)) ** 2);
            const zenith = Math.max(0, sampleDirection[1]);
            const broadSky = [0.075 + 0.025 * zenith, 0.11 + 0.08 * zenith,
                0.19 + 0.19 * zenith];
            const horizonWarmth = scale([0.56, 0.205, 0.052], horizon);
            const sunward = scale([1.35, 0.50, 0.105], sphericalGaussian(
                direction(-35, 7), sampleDirection, 18));
            return add(add(broadSky, horizonWarmth), sunward);
        },
    },
    twilight: {
        source: { kind: "sun", direction: direction(-25, -8), enabled: true },
        radiance: (sampleDirection) => {
            const elevation = Math.asin(clamp(sampleDirection[1], -1, 1));
            const horizon = Math.exp(-0.5 * (elevation / radians(9)) ** 2);
            const solarArc = sphericalGaussian(
                direction(-25, -4), sampleDirection, 9);
            return add(
                [0.012, 0.022, 0.057],
                add(scale([0.09, 0.034, 0.018], horizon),
                    scale([0.075, 0.025, 0.012], solarArc)),
            );
        },
    },
    moonlight: {
        source: { kind: "moon", direction: direction(70, 42), enabled: true },
        radiance: (sampleDirection) => add(
            [0.0007, 0.00125, 0.0031],
            scale([0.007, 0.011, 0.024], sphericalGaussian(
                direction(70, 42), sampleDirection, 15)),
        ),
    },
    overcast: {
        source: { kind: "sun", direction: direction(20, 35), enabled: true },
        radiance: () => [0.135, 0.142, 0.151],
    },
};

const makeNode = (name, altitudeKm = 2, radianceScale = 1) => {
    const environment = environments[name];
    return coupling.prefilterDirectionalSkyRadiance({
        altitudeKm,
        localUpDirection: [0, 1, 0],
        samples: fibonacciSphere(4_096, (sampleDirection) =>
            scale(environment.radiance(sampleDirection), radianceScale)),
        sources: [environment.source],
        resolvedSourceDiscsExcluded: true,
    });
};

const nodes = Object.fromEntries(Object.keys(environments).map((name) =>
    [name, makeNode(name)]));

test("positive SRBF prefilter conserves radiance and creates no overcast stamp", () => {
    for (const [name, node] of Object.entries(nodes)) {
        assert.equal(node.validity.valid, true, `${name}: ${node.validity.reasons}`);
        assert.equal(node.lobes.filter(({ kind }) => kind === "diffuse").length, 14);
        assert.ok(Math.abs(node.quadratureSolidAngleSteradians - Math.PI * 4) < 1e-11);
        const lobeIntegral = node.lobes.reduce((sum, lobe) =>
            add(sum, lobe.integratedRadianceRgb), [0, 0, 0]);
        lobeIntegral.forEach((value, channel) => assert.ok(
            Math.abs(value - node.fullSphereRadianceIntegralRgb[channel]) < 2e-11,
            `${name} channel ${channel}`,
        ));
        for (const sampleDirection of [direction(0, 90), direction(0, 0),
            direction(90, 25), direction(180, -35), direction(260, 5)]) {
            assert.ok(coupling.evaluateDirectionalSkyNode(node, sampleDirection)
                .every((value) => Number.isFinite(value) && value >= 0));
        }
        node.upperHemisphereIrradianceRgb.forEach((value, channel) => {
            assert.ok(value <= node.upperHemisphereRadianceIntegralRgb[channel] + 1e-12);
        });
        node.lowerHemisphereIrradianceRgb.forEach((value, channel) => {
            assert.ok(value <= node.lowerHemisphereRadianceIntegralRgb[channel] + 1e-12);
        });
    }
    const overcastSource = nodes.overcast.lobes.find(({ kind }) => kind === "sunward");
    const overcastHorizon = nodes.overcast.lobes.find(({ kind }) => kind === "horizon");
    assert.ok(luminance(overcastSource.integratedRadianceRgb) < 1e-12,
        "source geometry alone must not emboss a sun lobe into overcast radiance");
    assert.ok(luminance(overcastHorizon.integratedRadianceRgb) < 1e-12,
        "horizon geometry alone must not emboss a band into isotropic radiance");

    const integrationDirections = fibonacciSphere(24_000, () => [0, 0, 0]);
    let reconstructed = [0, 0, 0];
    for (const sample of integrationDirections) {
        reconstructed = add(reconstructed, scale(
            coupling.evaluateDirectionalSkyNode(nodes.golden, sample.direction),
            sample.solidAngleSteradians,
        ));
    }
    reconstructed.forEach((value, channel) => assert.ok(
        Math.abs(value / nodes.golden.fullSphereRadianceIntegralRgb[channel] - 1) < 0.012,
        `numerical reconstruction channel ${channel}`,
    ));
});

test("noon, golden hour, twilight, moonlight, and overcast retain physical ordering", () => {
    const upperLuminance = Object.fromEntries(Object.entries(nodes).map(([name, node]) =>
        [name, luminance(node.upperHemisphereIrradianceRgb)]));
    assert.ok(upperLuminance.noon > upperLuminance.golden);
    assert.ok(upperLuminance.golden > upperLuminance.twilight);
    assert.ok(upperLuminance.twilight > upperLuminance.moonlight * 4);
    assert.ok(upperLuminance.overcast > upperLuminance.twilight);

    const goldenHorizon = coupling.evaluateDirectionalSkyNode(
        nodes.golden, direction(-35, 2));
    const noonHorizon = coupling.evaluateDirectionalSkyNode(
        nodes.noon, direction(-35, 2));
    assert.ok(goldenHorizon[0] / goldenHorizon[2] >
        noonHorizon[0] / noonHorizon[2] * 2.5);
    assert.ok(nodes.twilight.upperHemisphereIrradianceRgb[2] >
        nodes.twilight.upperHemisphereIrradianceRgb[1]);
    assert.ok(nodes.moonlight.upperHemisphereIrradianceRgb[2] >
        nodes.moonlight.upperHemisphereIrradianceRgb[0] * 2);
    assert.ok(nodes.moonlight.lobes.some(({ kind }) => kind === "moonward"));
    assert.ok(!nodes.moonlight.lobes.some(({ kind }) => kind === "sunward"));

    const overcastDirections = [direction(0, 90), direction(0, 0),
        direction(90, 0), direction(180, 0), direction(270, 0), direction(0, -90)];
    const overcastLevels = overcastDirections.map((sampleDirection) => luminance(
        coupling.evaluateDirectionalSkyNode(nodes.overcast, sampleDirection)));
    assert.ok(Math.max(...overcastLevels) / Math.min(...overcastLevels) < 1.18);
});

test("altitude profile interpolates radiance and keeps hemispheres separate", () => {
    const low = makeNode("noon", 0, 1);
    const high = makeNode("noon", 10, 0.62);
    const profile = coupling.createDirectionalSkyRadianceProfile([low, high]);
    assert.equal(profile.validity.valid, true);
    const sampleDirection = direction(45, 32);
    const lowSample = coupling.sampleDirectionalSkyRadianceProfile(
        profile, 0, sampleDirection);
    const highSample = coupling.sampleDirectionalSkyRadianceProfile(
        profile, 10, sampleDirection);
    const middle = coupling.sampleDirectionalSkyRadianceProfile(
        profile, 5, sampleDirection);
    middle.radianceRgb.forEach((value, channel) => assert.ok(
        Math.abs(value - (lowSample.radianceRgb[channel] +
            highSample.radianceRgb[channel]) * 0.5) < 1e-12));
    assert.notDeepEqual(middle.upperHemisphereIrradianceRgb,
        middle.lowerHemisphereIrradianceRgb);

    const invalid = coupling.createDirectionalSkyRadianceProfile([high, low]);
    assert.equal(invalid.validity.valid, false);
    assert.ok(invalid.validity.reasons.includes(
        "directional-sky-altitudes-must-be-strictly-increasing"));
});

const clearTransfer = () => coupling.createPassiveCloudTransfer([1, 1, 1]);
const shadowTransfer = () => coupling.createPassiveCloudTransfer(
    [0.035, 0.04, 0.05]);
const overcastDiffuseTransfer = () => coupling.createPassiveCloudTransfer(
    [0.12, 0.13, 0.15], [0.50, 0.48, 0.44]);

test("cloud-shadowed ground bounce remains Lambertian and passive", () => {
    const baseInput = {
        groundAlbedoRgb: [0.18, 0.15, 0.11],
        atmosphereUpperSkyIrradianceRgb: nodes.noon.upperHemisphereIrradianceRgb,
        diffuseCloudTransfer: clearTransfer(),
        directSources: [{
            atmosphereTransportedIrradianceRgb: [1.15, 1.06, 0.88],
            cloudTransfer: clearTransfer(),
        }],
        groundToSampleAtmosphereTransmittanceRgb: [0.91, 0.94, 0.97],
        groundViewFactor: 0.72,
    };
    const clear = coupling.evaluateCloudShadowedGroundBounce(baseInput);
    const shadowed = coupling.evaluateCloudShadowedGroundBounce({
        ...baseInput,
        diffuseCloudTransfer: overcastDiffuseTransfer(),
        directSources: [{ ...baseInput.directSources[0],
            cloudTransfer: shadowTransfer() }],
    });
    assert.equal(clear.validity.valid, true);
    assert.equal(shadowed.validity.valid, true);
    assert.ok(luminance(clear.reflectedGroundFluxRgb) >
        luminance(shadowed.reflectedGroundFluxRgb));
    for (const result of [clear, shadowed]) {
        result.reflectedGroundFluxRgb.forEach((value, channel) => {
            assert.ok(value <= result.incidentGroundIrradianceRgb[channel] + 1e-12);
            assert.ok(Math.abs(result.lambertianGroundRadianceRgb[channel] -
                value / Math.PI) < 1e-14);
            assert.ok(result.lowerHemisphereIrradianceAtSampleRgb[channel] <=
                value + 1e-12);
        });
    }
    const nonPassive = coupling.createPassiveCloudTransfer(
        [0.8, 0.8, 0.8], [0.5, 0.5, 0.5]);
    assert.equal(nonPassive.validity.valid, false);
    nonPassive.transmittanceRgb.forEach((value, channel) => assert.ok(
        value + nonPassive.scatteredTowardReceiverRgb[channel] <= 1 + 1e-12));
});

const aerialInput = (cloudTransfer) => ({
    medium: {
        extinctionRgbPerKm: [0.19, 0.165, 0.145],
        scatteringRgbPerKm: [0.15, 0.135, 0.12],
    },
    phaseIntegratedDiffuseRadianceRgb: [0.018, 0.028, 0.052],
    diffuseCloudTransfer: overcastDiffuseTransfer(),
    directSources: [{
        atmosphereTransportedIrradianceRgb: [1.15, 1.06, 0.88],
        phaseRgbPerSteradian: [0.22, 0.22, 0.22],
        cloudTransfer,
    }],
});

test("cloud transmittance creates shafts inside aerial transport, not a post effect", () => {
    const lit = coupling.evaluateCloudCoupledAerialSource(
        aerialInput(clearTransfer()));
    const shadowed = coupling.evaluateCloudCoupledAerialSource(
        aerialInput(shadowTransfer()));
    assert.equal(lit.validity.valid, true);
    assert.equal(shadowed.validity.valid, true);
    assert.ok(luminance(lit.sourceRadianceCoefficientRgbPerKm) >
        luminance(shadowed.sourceRadianceCoefficientRgbPerKm) * 3);
    assert.ok(luminance(shadowed.sourceRadianceCoefficientRgbPerKm) > 0,
        "shadowing direct light must not erase diffuse haze illumination");
    shadowed.sourceRadianceCoefficientRgbPerKm.forEach((value, channel) => {
        assert.ok(value <= shadowed.unshadowedSourceRadianceCoefficientRgbPerKm[channel]);
        assert.ok(Math.abs(shadowed.removedByCloudRgbPerKm[channel] -
            (shadowed.unshadowedSourceRadianceCoefficientRgbPerKm[channel] - value)) <
            1e-14);
    });

    const litStep = coupling.integrateCloudCoupledAerialStep(lit, 1.8);
    const shadowStep = coupling.integrateCloudCoupledAerialStep(shadowed, 1.8);
    assert.deepEqual(litStep.transmittanceRgb, shadowStep.transmittanceRgb,
        "cloud source visibility changes local in-scatter, not camera-path extinction");
    assert.ok(luminance(litStep.radianceRgb) > luminance(shadowStep.radianceRgb));

    const half = coupling.integrateCloudCoupledAerialStep(lit, 0.9);
    litStep.radianceRgb.forEach((value, channel) => assert.ok(
        Math.abs(value - (half.radianceRgb[channel] +
            half.transmittanceRgb[channel] * half.radianceRgb[channel])) < 1e-13));
    litStep.transmittanceRgb.forEach((value, channel) => assert.ok(
        Math.abs(value - half.transmittanceRgb[channel] ** 2) < 1e-14));
});

test("cache bounds and invalidation domains exclude exposure from physics", () => {
    const layout = coupling.DIRECTIONAL_LIGHTING_GPU_CACHE_LAYOUT;
    assert.ok(layout.totalBytes < 1024 * 1024);
    assert.equal(layout.cloudShadowCascades.sourceCount, 2);
    assert.equal(layout.cloudShadowCascades.cascadesPerSource, 3);
    assert.equal(layout.aerialCouplingFroxels.width, 32);
    assert.equal(layout.directionalRadiance.height, 12);

    const base = {
        atmosphereOpticalKey: "atmo-a",
        sourceGeometryKey: "geometry-a",
        sourceRadiometryKey: "radiometry-a",
        cloudFieldKey: "cloud-a",
        groundMaterialKey: "ground-a",
        cameraFroxelKey: "camera-a",
        exposureKey: "exposure-a",
    };
    const exposure = coupling.resolveDirectionalLightingInvalidation(base,
        { ...base, exposureKey: "exposure-b" });
    assert.deepEqual(exposure, {
        directionalSky: false,
        cloudShadowCascades: false,
        hemisphereIrradiance: false,
        groundBounce: false,
        aerialCouplingFroxels: false,
        exposureOnly: true,
    });
    const cloud = coupling.resolveDirectionalLightingInvalidation(base,
        { ...base, cloudFieldKey: "cloud-b" });
    assert.equal(cloud.directionalSky, false);
    assert.equal(cloud.cloudShadowCascades, true);
    assert.equal(cloud.groundBounce, true);
    assert.equal(cloud.aerialCouplingFroxels, true);
    const optical = coupling.resolveDirectionalLightingInvalidation(base,
        { ...base, atmosphereOpticalKey: "atmo-b" });
    assert.equal(optical.directionalSky, true);
    assert.equal(optical.hemisphereIrradiance, true);
    assert.equal(optical.cloudShadowCascades, false);
    assert.equal(optical.aerialCouplingFroxels, false);
});

test("CPU packing and binding-free WGSL preserve reference equations", () => {
    const fixture = coupling.DIRECTIONAL_LIGHTING_PARITY_FIXTURES;
    const expectedSg = Math.exp(fixture.sphericalGaussian.sharpness *
        (fixture.sphericalGaussian.cosine - 1));
    assert.equal(coupling.evaluateNormalizedSphericalGaussian(
        [0, 1, 0], [Math.sqrt(1 - fixture.sphericalGaussian.cosine ** 2),
            fixture.sphericalGaussian.cosine, 0],
        fixture.sphericalGaussian.sharpness,
    ), expectedSg);
    const packedSg = coupling.packDirectionalSkyRadianceLobe(nodes.noon.lobes[0]);
    const packedHorizon = coupling.packDirectionalSkyRadianceLobe(
        nodes.golden.lobes.find(({ kind }) => kind === "horizon"));
    assert.equal(packedSg.length, 8);
    assert.ok(packedSg[3] >= 0);
    assert.ok(packedHorizon[3] < 0);

    const scalarSource = {
        extinctionRgbPerKm: [fixture.aerial.extinctionPerKm,
            fixture.aerial.extinctionPerKm, fixture.aerial.extinctionPerKm],
        sourceRadianceCoefficientRgbPerKm: [fixture.aerial.sourceCoefficientPerKm,
            fixture.aerial.sourceCoefficientPerKm, fixture.aerial.sourceCoefficientPerKm],
        unshadowedSourceRadianceCoefficientRgbPerKm: [0.04, 0.04, 0.04],
        removedByCloudRgbPerKm: [0.005, 0.005, 0.005],
        validity: { valid: true, reasons: [] },
    };
    const scalarStep = coupling.integrateCloudCoupledAerialStep(
        scalarSource, fixture.aerial.distanceKm);
    const expectedTransmittance = Math.exp(-fixture.aerial.extinctionPerKm *
        fixture.aerial.distanceKm);
    assert.equal(scalarStep.transmittanceRgb[0], expectedTransmittance);
    assert.equal(scalarStep.radianceRgb[0], fixture.aerial.sourceCoefficientPerKm *
        (1 - expectedTransmittance) / fixture.aerial.extinctionPerKm);

    for (const functionName of [
        "coupling_directional_sky_lobe_radiance",
        "coupling_interpolate_hemisphere_irradiance",
        "coupling_cloud_shadowed_ground_bounce",
        "coupling_aerial_source",
        "coupling_integrate_aerial_step",
    ]) assert.ok(wgsl.includes(`fn ${functionName}`), functionName);
    assert.ok(!/@group\s*\(|@binding\s*\(/.test(wgsl));
    assert.ok(!/tone[_-]?map|exposure|palette|ambient[_-]?tint/i.test(wgsl));
    for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
        assert.equal(
            [...wgsl].filter((character) => character === open).length,
            [...wgsl].filter((character) => character === close).length,
            `unbalanced WGSL ${open}${close}`,
        );
    }
});

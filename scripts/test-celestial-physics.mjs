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
    const localRequire = (specifier) => {
        if (Object.hasOwn(dependency, specifier)) return dependency[specifier];
        throw new Error(`Unexpected test import ${specifier}`);
    };
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        localRequire,
    );
    return moduleObject.exports;
};

const physics = compileCommonJs(
    "../components/backgrounds/sky/celestial-physics.ts",
);
const wgslModule = compileCommonJs(
    "../components/backgrounds/sky/celestial-physics-wgsl.ts",
    { "./celestial-physics.ts": physics },
);
const wgsl = wgslModule.CELESTIAL_PHYSICS_WGSL;

const luminance = (rgb) =>
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const mean = (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

test("catalogue magnitude and B-V remain scene-linear source state", () => {
    const magnitudeZero = physics.createStellarSourceSample(0, 0.65);
    const magnitudeFive = physics.createStellarSourceSample(5, 0.65);
    assert.ok(Math.abs(
        magnitudeZero.visualFluxRelativeToSun /
            magnitudeFive.visualFluxRelativeToSun - 100,
    ) < 1e-10);
    assert.ok(Math.abs(luminance(magnitudeZero.spectralShapeRgb) - 1) < 1e-12);
    assert.ok(Math.abs(luminance(
        physics.stellarLinearRgbFromBv(-0.25),
    ) - 1) < 1e-12);
    assert.ok(Math.abs(luminance(
        physics.stellarLinearRgbFromBv(1.8),
    ) - 1) < 1e-12);
    const blue = physics.stellarLinearRgbFromBv(-0.25);
    const red = physics.stellarLinearRgbFromBv(1.8);
    assert.ok(blue[2] / blue[0] > red[2] / red[0]);

    const attenuated = physics.createStellarSourceSample(1.2, 0.4, [0.8, 0.6, 0.3]);
    assert.deepEqual(
        attenuated.topOfAtmosphereFluxRgb,
        physics.createStellarSourceSample(1.2, 0.4).topOfAtmosphereFluxRgb,
        "observer transmittance cannot mutate the catalogue TOA source",
    );
    assert.ok(attenuated.observerFluxRgb.every((channel, index) =>
        channel < attenuated.topOfAtmosphereFluxRgb[index]));
});

test("Moffat core and seeing wing are energy normalized", () => {
    const psf = physics.createEnergyNormalizedMoffatPsf(1.7, 3.35, 0.047, 5.2);
    const radius = psf.fwhm * 500;
    const steps = 200_000;
    let integral = 0;
    let priorRadius = 0;
    let priorDensity = physics.evaluateStellarPsf(0, psf) * 0;
    for (let index = 1; index <= steps; index += 1) {
        // Logarithmic radial quadrature resolves both the subpixel core and tail.
        const progress = index / steps;
        const currentRadius = radius * (Math.exp(progress * 12) - 1) /
            (Math.exp(12) - 1);
        const currentDensity = physics.evaluateStellarPsf(currentRadius, psf) *
            Math.PI * 2 * currentRadius;
        integral += (currentDensity + priorDensity) * 0.5 *
            (currentRadius - priorRadius);
        priorRadius = currentRadius;
        priorDensity = currentDensity;
    }
    assert.ok(Math.abs(integral - 1) < 2e-4, `integral ${integral}`);
    const support = physics.stellarPsfSupportRadius(psf, 0.999);
    assert.ok(Math.abs(physics.stellarPsfEncircledEnergy(support, psf) - 0.999) < 1e-9);
    assert.ok(physics.evaluateStellarPsf(0, psf) >
        physics.evaluateStellarPsf(psf.fwhm * 4, psf));
});

test("scintillation is correlated RGB flux while tip/tilt and seeing stay separate", () => {
    const low = physics.createStellarTurbulenceState({
        timeSeconds: 4.25,
        seed: 0.37,
        relativeAirMass: 1,
        apertureDiameterMm: 30,
        exposureSeconds: 0.1,
        seeingFwhmArcseconds: 0.8,
    });
    const high = physics.createStellarTurbulenceState({
        timeSeconds: 4.25,
        seed: 0.37,
        relativeAirMass: 8,
        apertureDiameterMm: 6,
        exposureSeconds: 1 / 60,
        seeingFwhmArcseconds: 2.2,
    });
    assert.ok(high.intensityRms > low.intensityRms);
    assert.ok(high.rgbGain.every((channel) => Number.isFinite(channel) && channel > 0));
    assert.ok(Math.abs(luminance(high.rgbGain) - high.commonIntensityGain) < 1e-12,
        "chromatic scintillation redistributes rather than adding flux");
    assert.ok(high.tipTiltArcseconds.every(Number.isFinite));
    assert.equal(high.seeingFwhmArcseconds, 2.2);
    assert.notEqual(high.tipTiltArcseconds[0], high.tipTiltArcseconds[1]);

    const gains = Array.from({ length: 512 }, (_, index) =>
        physics.createStellarTurbulenceState({
            timeSeconds: index * 0.173,
            seed: 2.7,
            relativeAirMass: 2,
            apertureDiameterMm: 20,
            exposureSeconds: 1 / 30,
        }).commonIntensityGain);
    assert.ok(mean(gains) > 0.9 && mean(gains) < 1.1);
});

test("production stellar record stays angular, normalized, and detection-free", () => {
    const sample = physics.createStellarRenderSample({
        visualMagnitude: 2.1,
        bv: 0.42,
        foregroundTransmittanceRgb: [0.72, 0.61, 0.44],
        timeSeconds: 12.4,
        seed: 7.3,
        relativeAirMass: 2.2,
        apertureDiameterMm: 7,
        exposureSeconds: 1 / 60,
        seeingFwhmArcseconds: 1.6,
    });
    assert.ok(sample.angularPsf.fwhm > 0 && sample.angularPsf.fwhm < 1e-4);
    assert.ok(sample.angularSupportRadiusRadians > sample.angularPsf.fwhm);
    assert.ok(sample.observerFluxRgb.every((channel) => channel > 0));
    assert.ok(!Object.hasOwn(sample, "detection"));
    assert.ok(!Object.hasOwn(sample, "exposure"));
    assert.ok(Math.abs(
        physics.stellarPsfEncircledEnergy(
            sample.angularSupportRadiusRadians,
            sample.angularPsf,
        ) - 0.9995,
    ) < 1e-9);
});

test("lunar photometry, limb and terminator preserve a nonnegative ordered layer", () => {
    const fullCalibration = physics.createLunarDiskPhotometricCalibration(0);
    const quarterCalibration = physics.createLunarDiskPhotometricCalibration(
        Math.PI / 2,
    );
    const crescentCalibration = physics.createLunarDiskPhotometricCalibration(
        Math.PI * 0.86,
    );
    assert.equal(fullCalibration.relativeIrradiance, 1);
    assert.ok(quarterCalibration.relativeIrradiance > 0.06 &&
        quarterCalibration.relativeIrradiance < 0.12);
    assert.ok(crescentCalibration.relativeIrradiance <
        quarterCalibration.relativeIrradiance);
    assert.ok(Math.abs(luminance(crescentCalibration.roloCalibrationRgb) - 1) < 1e-12);
    assert.ok(crescentCalibration.roloCalibrationRgb[0] >
        crescentCalibration.roloCalibrationRgb[2]);
    assert.ok(physics.createLunarDiskPhotometricCalibration(0, 356_500)
        .relativeIrradiance > physics.createLunarDiskPhotometricCalibration(
            0,
            406_700,
        ).relativeIrradiance);

    const full = physics.evaluateLunarSurface({
        surfaceNormal: [0, 0, 1],
        sunDirection: [0, 0, 1],
        observerDirection: [0, 0, 1],
        albedoRgb: [0.12, 0.115, 0.105],
        solarTopOfAtmosphereIrradianceRgb: [1, 0.97, 0.91],
        illuminatedFraction: 1,
    });
    const dark = physics.evaluateLunarSurface({
        surfaceNormal: [0, 0, 1],
        sunDirection: [1, 0, -0.02],
        observerDirection: [0, 0, 1],
        albedoRgb: [0.12, 0.115, 0.105],
        solarTopOfAtmosphereIrradianceRgb: [1, 0.97, 0.91],
        illuminatedFraction: 0.02,
    });
    assert.ok(luminance(full.directSolarRadianceRgb) >
        luminance(dark.directSolarRadianceRgb));
    assert.ok(dark.earthshineRatio > full.earthshineRatio);
    assert.ok(dark.earthshineRatio <= 0.000121);
    assert.ok(dark.incidenceCosine < 0,
        "signed incidence is retained for subpixel terminator antialiasing");
    assert.ok(dark.topOfAtmosphereRadianceRgb.every((channel) => channel >= 0));

    assert.ok(physics.sampleLunarDiscGeometry([0, 0], 0.002).limbCoverage > 0.999);
    assert.ok(physics.sampleLunarDiscGeometry([1.02, 0], 0.002).limbCoverage < 0.001);
    const edge = physics.sampleLunarDiscGeometry([1, 0], 0.002);
    assert.ok(edge.limbCoverage > 0.49 && edge.limbCoverage < 0.51);
    assert.ok(Math.abs(Math.hypot(...edge.surfaceNormal) - 1) < 1e-9);
    assert.ok(physics.lunarTerminatorCoverage(-0.02, 0.001) < 0.001);
    assert.ok(physics.lunarTerminatorCoverage(0.02, 0.001) > 0.999);

    const contribution = physics.createCelestialLayerContribution(
        [0, 0, 0], 1, [0.4, 0.5, 0.6]);
    assert.deepEqual(contribution.additiveObservedRadianceRgb, [0, 0, 0]);
    assert.equal(contribution.stellarOccultationCoverage, 1);
    const foreground = [0.12, 0.18, 0.25];
    const composed = physics.composeCelestialRay({
        foregroundRadianceRgb: foreground,
        foregroundTransmittanceRgb: [0.4, 0.5, 0.6],
    }, [0, 0, 0], [0, 0, 0], 1);
    assert.deepEqual(composed, foreground,
        "an unlit lunar body can occult stars but cannot alpha-darken foreground sky");
});

test("NASA and analytic lunar profiles share one disk-integrated phase target", () => {
    const photometry = physics.createLunarDiskPhotometricCalibration(
        Math.PI / 2,
        381_000,
    );
    const common = [7.68e-6, 7.45e-6, 6.99e-6];
    const transmittance = [0.74, 0.59, 0.36];
    const nasa = physics.createLunarDiscRadianceContract(
        "nasa-svs-phase-profile",
        0.00452,
        common,
        photometry,
        transmittance,
    );
    const analytic = physics.createLunarDiscRadianceContract(
        "analytic-hapke-profile",
        0.00452,
        common,
        photometry,
        transmittance,
    );
    assert.deepEqual(
        nasa.topOfAtmosphereIrradianceRgb,
        analytic.topOfAtmosphereIrradianceRgb,
        "profile choice cannot change lunar source energy",
    );
    assert.equal(nasa.phaseApplicationCount, 1);
    assert.equal(nasa.commonExposureScale, 1);
    assert.equal(
        physics.CELESTIAL_LUNAR_IMAGE_RADIANCE_CONTRACT.phaseApplicationCount,
        1,
    );
    const packedContract = physics.packLunarDiscRadianceContract(nasa);
    assert.equal(
        packedContract.length,
        physics.LUNAR_DISC_RADIANCE_ABI.floatCount,
    );
    assert.equal(packedContract[15], 0,
        "NASA and analytic profile kinds remain explicit in the packed ABI");
    assert.equal(packedContract[19], 1,
        "the packed lunar ABI carries exactly one phase application");
    const profileIntegral = [1.8e-5, 1.5e-5, 1.1e-5];
    const profile = physics.createLunarDiscProfileCalibration(
        nasa,
        profileIntegral,
    );
    profile.profileToTopOfAtmosphereRadianceScaleRgb.forEach((scale, channel) =>
        assert.ok(Math.abs(
            scale * profileIntegral[channel] /
                nasa.topOfAtmosphereIrradianceRgb[channel] - 1,
        ) < 1e-12));
    assert.deepEqual(
        nasa.observedDirectIrradianceRgb,
        nasa.topOfAtmosphereIrradianceRgb.map((channel, index) =>
            channel * transmittance[index]),
    );
    const zeroProfile = physics.createLunarDiscProfileCalibration(
        nasa,
        [0, 0, 0],
    );
    assert.deepEqual(
        physics.evaluateCalibratedLunarDiscProfile(
            [0.4, 0.5, 0.6],
            zeroProfile,
        ),
        [0, 0, 0],
        "an empty profile cannot invent lunar radiance",
    );
});

test("registered lunar elevation normals and ROLO calibration have explicit semantics", () => {
    assert.equal(physics.CELESTIAL_PHYSICS_ABI_VERSION, 3);
    assert.equal(
        physics.CELESTIAL_LUNAR_TEXTURE_CONTRACT.albedo,
        "linear-reflectance-rgb",
    );
    assert.equal(physics.CELESTIAL_LUNAR_TEXTURE_CONTRACT.uAddressMode,
        "repeat-longitude");
    assert.equal(physics.CELESTIAL_LUNAR_TEXTURE_CONTRACT.limbNormalPolicy,
        "fade-terrain-normal-to-geometric-normal");
    const packed = physics.packLunarPhotometry({ referenceAlbedo: 0.14 });
    assert.equal(packed.length, 8);
    assert.ok(Math.abs(packed[6] - 0.14) < 1e-7);
    assert.equal(packed[7], 0);
    const flat = physics.reconstructLunarSurfaceNormal({
        geometricNormal: [0, 0, 1],
        tangentDirection: [1, 0, 0],
        bitangentDirection: [0, 1, 0],
        elevationNormalTangentSpace: [0, 0, 1],
    });
    assert.deepEqual(flat, [0, 0, 1]);
    const eastSlope = physics.reconstructLunarSurfaceNormal({
        geometricNormal: [0, 0, 1],
        tangentDirection: [1, 0, 0],
        bitangentDirection: [0, 1, 0],
        elevationNormalTangentSpace: [0.5, 0, Math.sqrt(0.75)],
    });
    assert.ok(eastSlope[0] > 0.49 && eastSlope[2] > 0.86);
    assert.ok(Math.abs(Math.hypot(...eastSlope) - 1) < 1e-12);
    const degenerateBasis = physics.reconstructLunarSurfaceNormal({
        geometricNormal: [0, 1, 0],
        tangentDirection: [0, 1, 0],
        bitangentDirection: [0, 0, 1],
        elevationNormalTangentSpace: [0, 0, 0],
    });
    assert.ok(Math.abs(Math.hypot(...degenerateBasis) - 1) < 1e-12);
    assert.ok(degenerateBasis[1] > 0.999);

    const baseInput = {
        surfaceNormal: [0, 0, 1],
        sunDirection: [0, 0, 1],
        observerDirection: [0, 0, 1],
        albedoRgb: [0.12, 0.12, 0.12],
        solarTopOfAtmosphereIrradianceRgb: [1, 1, 1],
        illuminatedFraction: 1,
    };
    const reference = physics.evaluateLunarSurface(baseInput);
    const calibrated = physics.evaluateLunarSurface({
        ...baseInput,
        roloCalibrationRgb: [0.9, 1, 1.1],
    });
    assert.ok(calibrated.directSolarRadianceRgb[0] <
        reference.directSolarRadianceRgb[0]);
    assert.ok(calibrated.directSolarRadianceRgb[2] >
        reference.directSolarRadianceRgb[2]);
});

test("analytic lunar profile quadrature supplies one finite disk-energy normalization", () => {
    const photometry = physics.createLunarDiskPhotometricCalibration(
        Math.PI * 0.41,
    );
    const contract = physics.createLunarDiscRadianceContract(
        "analytic-hapke-profile",
        0.00452,
        [0.000004, 0.00000388, 0.00000364],
        photometry,
        [0.72, 0.58, 0.36],
    );
    const integral = physics.integrateAnalyticLunarDiscProfileSolidAngle({
        angularRadiusRadians: contract.angularRadiusRadians,
        sunDirectionInDiscFrame: [Math.sin(Math.PI * 0.41), 0,
            Math.cos(Math.PI * 0.41)],
        illuminatedFraction: photometry.illuminatedFraction,
        roloCalibrationRgb: photometry.roloCalibrationRgb,
        meanAlbedoRgb: [0.12, 0.12, 0.12],
        gridSize: 96,
    });
    assert.ok(integral.every((channel) => Number.isFinite(channel) && channel > 0));
    const calibration = physics.createLunarDiscProfileCalibration(
        contract,
        integral,
    );
    calibration.profileToTopOfAtmosphereRadianceScaleRgb.forEach(
        (scale, channel) => assert.ok(Math.abs(
            scale * integral[channel] -
                contract.topOfAtmosphereIrradianceRgb[channel],
        ) < 1e-16),
    );
});

test("lunar texture registration remains seam-safe and fades unresolved limb relief", () => {
    const center = physics.sampleLunarTextureCoordinates(
        [0, 0],
        1 / 1_024,
        0.31,
        -0.12,
        0.27,
    );
    assert.ok(Math.abs(center.textureUv[0] - (0.5 + 0.31 / (Math.PI * 2))) < 1e-9);
    assert.ok(Math.abs(center.textureUv[1] - (0.5 + 0.12 / Math.PI)) < 1e-9);
    assert.ok(center.terrainNormalReliability > 0.999);
    assert.ok(Math.abs(Math.hypot(...center.moonFixedDirection) - 1) < 1e-12);

    const limb = physics.sampleLunarTextureCoordinates(
        [1, 0],
        1 / 512,
        Math.PI - 0.01,
        0.08,
        -0.6,
    );
    assert.ok(limb.textureUv[0] >= 0 && limb.textureUv[0] < 1);
    assert.ok(limb.textureUv[1] >= 0 && limb.textureUv[1] <= 1);
    assert.ok(limb.textureFootprintRadians > center.textureFootprintRadians);
    assert.ok(limb.terrainNormalReliability < center.terrainNormalReliability);
    assert.ok(limb.limbCoverage > 0 && limb.limbCoverage <= 1);
});

test("lunar aureole is atmosphere-coupled, finite, and energy ordered", () => {
    const base = {
        lunarAngularRadiusRadians: 0.0046,
        moonTopOfAtmosphereIrradianceRgb: [2.4e-6, 2.32e-6, 2.18e-6],
        sourceToScatterTransmittanceRgb: [0.82, 0.72, 0.55],
        rayleighScatteringOpticalDepthRgb: [0.04, 0.08, 0.17],
        aerosolScatteringOpticalDepthRgb: [0.05, 0.055, 0.06],
        aerosolAsymmetry: 0.78,
        scatterToObserverTransmittanceRgb: [0.9, 0.84, 0.73],
        multipleScatteringRgb: [0.002, 0.0024, 0.003],
    };
    const near = physics.evaluateLunarAtmosphericAureole({
        ...base,
        angularSeparationRadians: 0.012,
    });
    const far = physics.evaluateLunarAtmosphericAureole({
        ...base,
        angularSeparationRadians: 0.32,
    });
    assert.ok(near.observedRadianceRgb.every(
        (channel) => Number.isFinite(channel) && channel >= 0,
    ));
    assert.ok(luminance(near.aerosolRadianceRgb) >
        luminance(far.aerosolRadianceRgb));
    assert.ok(near.effectiveScatteringAngleRadians > 0.012,
        "finite lunar solid angle regularizes the forward lobe");
    const vacuum = physics.evaluateLunarAtmosphericAureole({
        ...base,
        angularSeparationRadians: 0.012,
        rayleighScatteringOpticalDepthRgb: [0, 0, 0],
        aerosolScatteringOpticalDepthRgb: [0, 0, 0],
        multipleScatteringRgb: [0, 0, 0],
    });
    assert.deepEqual(vacuum.observedRadianceRgb, [0, 0, 0]);
});

test("canonical composition orders distant sky, Sun, Moon, atmosphere, then clouds", () => {
    assert.deepEqual([...physics.CELESTIAL_RADIANCE_ORDER], [
        "galactic-and-zodiacal-boundary",
        "catalogue-stars",
        "resolved-sun",
        "resolved-moon",
        "atmosphere-and-airglow",
        "clouds-and-hydrometeors",
        "shared-exposure-and-output-transform",
    ]);
    const sample = physics.composeCelestialAtmosphereOrder({
        extraAtmosphericDiffuseRadianceRgb: [1, 1, 1],
        stellarRadianceRgb: [0.5, 0.5, 0.5],
        sunDisc: { topOfAtmosphereRadianceRgb: [10, 8, 6], coverage: 0.5 },
        moonDisc: { topOfAtmosphereRadianceRgb: [0, 0, 0], coverage: 1 },
        atmosphereTransmittanceRgb: [0.4, 0.5, 0.6],
        atmosphereInscatteredRadianceRgb: [0.1, 0.2, 0.3],
        observedAirglowRadianceRgb: [0.01, 0.02, 0.03],
    });
    assert.deepEqual(sample.topOfAtmosphereBoundaryRadianceRgb, [0, 0, 0]);
    assert.deepEqual(sample.observedRadianceBeforeCloudsRgb, [0.11, 0.22, 0.32999999999999996]);
    assert.equal(sample.extraAtmosphericBackgroundTransmission, 0);
});

test("night radiance keeps shell, extraterrestrial and ground source classes distinct", () => {
    const airglow = physics.DEFAULT_AIRGLOW_STATE;
    const zenith = physics.evaluateAirglowRadiance(airglow, [0, 1, 0]);
    const horizon = physics.evaluateAirglowRadiance(airglow, [1, 0.025, 0]);
    assert.ok(horizon.relativePathLength > zenith.relativePathLength * 3);
    assert.ok(luminance(horizon.emissionRadianceRgb) >
        luminance(zenith.emissionRadianceRgb));

    const zodiacal = {
        sunDirection: [0.8, -0.5, 0.1],
        eclipticNorthDirection: [0, 0.25, 0.97],
        radianceScale: 2e-10,
        solarSpectrumRgb: [1.05, 1, 0.92],
    };
    const galactic = {
        galacticNorthDirection: [0.1, 0.9, 0.42],
        galacticCenterDirection: [0.2, 0.3, 0.93],
        radianceScale: 4e-10,
        calibratedMapWeight: 0,
        coolPlaneSpectrumRgb: [0.84, 0.94, 1.12],
        warmBulgeSpectrumRgb: [1.14, 1.02, 0.84],
    };
    const integratedStarlight = {
        galacticNorthDirection: galactic.galacticNorthDirection,
        galacticCenterDirection: galactic.galacticCenterDirection,
        radianceScale: 1.1e-10,
        stellarPopulationSpectrumRgb: [0.96, 1, 1.04],
    };
    const artificialSource = {
        centerGroundKm: [0, 0],
        radiusKm: 12,
        upwardRadianceRgb: [0.08, 0.045, 0.018],
        upwardAnisotropy: 1.2,
    };
    const sample = physics.evaluatePhysicalNightEmission({
        viewDirection: [0.2, 0.8, 0.5],
        airglow,
        zodiacal,
        galactic,
        integratedStarlight,
        artificialSource,
        groundPositionKm: [0, 0],
        groundUpwardDirection: [0, 1, 0],
    });
    assert.ok(luminance(sample.atmosphericEmissionRadianceRgb) > 0);
    assert.ok(luminance(sample.extraAtmosphericRadianceRgb) > 0);
    assert.ok(luminance(sample.groundUpwardRadianceRgb) > 0);
    assert.ok(luminance(sample.integratedStarlightRadianceRgb) > 0);
    assert.deepEqual(
        sample.extraAtmosphericRadianceRgb,
        sample.zodiacalLightRadianceRgb.map((channel, index) =>
            channel + sample.unresolvedGalacticRadianceRgb[index] +
                sample.integratedStarlightRadianceRgb[index]),
    );
    const farGround = physics.evaluateArtificialGroundEmission(
        artificialSource, [100, 100], [0, 1, 0]);
    assert.ok(luminance(farGround) < luminance(sample.groundUpwardRadianceRgb) * 1e-8);

    const transported = physics.transportNaturalNightSources({
        sources: sample,
        extraAtmosphericTransmittanceRgb: [0.8, 0.6, 0.3],
        airglowToObserverTransmittanceRgb: [0.92, 0.84, 0.68],
    });
    assert.deepEqual(transported.groundUpwardRadianceRgb,
        sample.groundUpwardRadianceRgb,
        "ground emission is forwarded to scattering rather than screen-added");
    assert.ok(transported.observedExtraAtmosphericRadianceRgb.every(
        (channel, index) => channel <= sample.extraAtmosphericRadianceRgb[index],
    ));
    assert.deepEqual(
        transported.observedDiffuseRadianceBeforeCloudsRgb,
        transported.observedExtraAtmosphericRadianceRgb.map((channel, index) =>
            channel + transported.observedAirglowRadianceRgb[index]),
    );
});

test("resolved solar disc integrates back to its TOA irradiance and has a normalized PSF", () => {
    const state = physics.createPhysicalSunDiscState([0, 1, 0], [1, 0.97, 0.91]);
    const steps = 25_000;
    const integrated = [0, 0, 0];
    for (let index = 0; index < steps; index += 1) {
        const theta0 = state.angularRadiusRadians * index / steps;
        const theta1 = state.angularRadiusRadians * (index + 1) / steps;
        const theta = (theta0 + theta1) * 0.5;
        const view = [Math.sin(theta), Math.cos(theta), 0];
        const sample = physics.evaluateSunDiscRadiance(state, view, 1e-10);
        const solidAngle = 2 * Math.PI * (Math.cos(theta0) - Math.cos(theta1));
        for (let channel = 0; channel < 3; channel += 1) {
            integrated[channel] += sample.topOfAtmosphereRadianceRgb[channel] * solidAngle;
        }
    }
    state.topOfAtmosphereIrradianceRgb.forEach((expected, channel) =>
        assert.ok(Math.abs(integrated[channel] / expected - 1) < 2e-5,
            `solar channel ${channel} integral ${integrated[channel]}`));
    assert.equal(
        physics.evaluateSunDiscRadiance(state, [1, 0, 0], 1e-6).coverage,
        0,
    );

    // The same normalized kernel contract is used for stellar seeing and the
    // compact solar optical PSF; it never changes total source energy.
    assert.ok(Math.abs(
        physics.stellarPsfEncircledEnergy(
            physics.stellarPsfSupportRadius(state.psf, 0.9999),
            state.psf,
        ) - 0.9999,
    ) < 1e-9);
});

test("solar ephemeris, limb normalization, atmosphere handoff, and exposure remain physical", () => {
    const perihelion = physics.solarDistanceAstronomicalUnits(
        new Date("2026-01-03T12:00:00Z"),
    );
    const aphelion = physics.solarDistanceAstronomicalUnits(
        new Date("2026-07-06T12:00:00Z"),
    );
    assert.ok(perihelion < aphelion);
    assert.ok(physics.solarAngularRadiusRadians(perihelion) >
        physics.solarAngularRadiusRadians(aphelion));
    const distanceScale = 1 / (perihelion * perihelion);
    const source = physics.createPhysicalSunDiscState(
        [0.2, 0.96, 0.1],
        [3.2 * distanceScale, 3.16 * distanceScale, 3.08 * distanceScale],
        physics.solarAngularRadiusRadians(perihelion),
        undefined,
        undefined,
        perihelion,
    );
    assert.ok(Math.abs(source.solidAngleSteradians -
        2 * Math.PI * (1 - Math.cos(source.angularRadiusRadians))) < 1e-15);
    assert.ok(source.centerTopOfAtmosphereRadianceRgb.every(
        (channel) => channel > 0));
    const resolved = physics.createPhysicalSunDiscAtmosphereState(
        source,
        [0.81, 0.67, 0.42],
    );
    assert.equal(resolved.commonExposureScale, 1);
    assert.equal(
        resolved.atmosphericGlareHandoff.owner,
        "physical-atmosphere-forward-scattering",
    );
    assert.deepEqual(
        resolved.observedDirectIrradianceRgb,
        source.topOfAtmosphereIrradianceRgb.map((channel, index) =>
            channel * [0.81, 0.67, 0.42][index]),
    );
    assert.ok(!Object.hasOwn(resolved, "exposure"));
    assert.ok(!Object.hasOwn(resolved.atmosphericGlareHandoff, "radiance"),
        "glare handoff is a physical source input, never an additive halo");
    const packed = physics.packPhysicalSunDiscAtmosphereState(resolved);
    assert.equal(
        packed.length,
        physics.PHYSICAL_SUN_DISC_RADIANCE_ABI.floatCount,
    );
    assert.equal(packed[15], 1,
        "the packed source cannot cancel the common final exposure");
    assert.equal(packed[19], 1,
        "glare ownership remains physical-atmosphere-only in the ABI");
});

test("CPU reference equations and reusable WGSL contract remain in parity", () => {
    const wgslStarFlux = (magnitude) =>
        10 ** (-0.4 * (magnitude - physics.CELESTIAL_PHYSICS_CONSTANTS.sunVisualMagnitude));
    const wgslMoffat = (radius, fwhm, beta) => {
        const boundedBeta = Math.max(physics.CELESTIAL_PHYSICS_CONSTANTS.minMoffatBeta, beta);
        const alpha = Math.max(1e-12, fwhm) /
            (2 * Math.sqrt(Math.max(1e-12, 2 ** (1 / Math.max(1.001, boundedBeta)) - 1)));
        return (boundedBeta - 1) / (Math.PI * alpha * alpha) *
            (1 + Math.max(0, radius) ** 2 / (alpha * alpha)) ** -boundedBeta;
    };
    for (const magnitude of [-1.46, 0, 2.3, 6.5]) {
        assert.equal(physics.stellarFluxRelativeToSun(magnitude), wgslStarFlux(magnitude));
    }
    for (const radius of [0, 0.2, 1, 8]) {
        assert.equal(
            physics.evaluateNormalizedMoffat(radius, 1.3, 3.2),
            wgslMoffat(radius, 1.3, 3.2),
        );
    }
    assert.ok(wgsl.includes("fn celestial_stellar_flux_relative_to_sun"));
    assert.ok(wgsl.includes("fn celestial_stellar_turbulence"));
    assert.ok(wgsl.includes("fn celestial_lunar_surface"));
    assert.ok(wgsl.includes("fn celestial_lunar_disk_relative_irradiance"));
    assert.ok(wgsl.includes("fn celestial_lunar_rolo_calibration_rgb"));
    assert.ok(wgsl.includes("fn celestial_lunar_surface_normal"));
    assert.ok(wgsl.includes("fn celestial_lunar_texture_coordinates"));
    assert.ok(wgsl.includes("fn celestial_calibrated_lunar_profile_radiance"));
    assert.ok(wgsl.includes("fn celestial_lunar_atmospheric_aureole"));
    assert.ok(wgsl.includes("fn celestial_layer_contribution"));
    assert.ok(wgsl.includes("fn celestial_compose_atmosphere_order"));
    assert.ok(wgsl.includes("fn celestial_airglow_radiance"));
    assert.ok(wgsl.includes("fn celestial_zodiacal_radiance"));
    assert.ok(wgsl.includes("fn celestial_galactic_radiance"));
    assert.ok(wgsl.includes("fn celestial_integrated_starlight_radiance"));
    assert.ok(wgsl.includes("fn celestial_artificial_ground_emission"));
    assert.ok(wgsl.includes("fn celestial_transport_natural_night_sources"));
    assert.ok(wgsl.includes("fn celestial_sun_disc_radiance"));
    assert.ok(wgsl.includes("struct CelestialLunarDiscRadiometry"));
    assert.ok(wgsl.includes("struct CelestialSunDiscRadiometry"));
    assert.ok(!/tone[_-]?map/i.test(wgsl));
    assert.ok(!/adaptation/i.test(wgsl));
    assert.ok(!/pre.?exposure/i.test(wgsl));

    const pairs = [["{", "}"], ["(", ")"], ["[", "]"]];
    for (const [open, close] of pairs) {
        assert.equal(
            [...wgsl].filter((character) => character === open).length,
            [...wgsl].filter((character) => character === close).length,
            `unbalanced WGSL ${open}${close}`,
        );
    }
});

test("WGSL source builder emits a complete physical entrypoint module", () => {
    const consumer = `
@compute @workgroup_size(1)
fn qualify_celestial() {
    _ = celestial_stellar_flux_relative_to_sun(0.0);
}`;
    const source = wgslModule.createCelestialPhysicsShaderSource({
        entryPointWgsl: consumer,
        label: "qualification\nmodule",
    });
    assert.ok(source.startsWith(wgsl));
    assert.ok(source.includes("// consumer: qualification_module"));
    assert.ok(source.includes("@compute @workgroup_size(1)"));
    assert.throws(
        () => wgslModule.createCelestialPhysicsShaderSource({ entryPointWgsl: "" }),
        /non-empty/,
    );
    assert.throws(
        () => wgslModule.createCelestialPhysicsShaderSource({
            entryPointWgsl: "fn helper() {}",
        }),
        /entry point/,
    );
});

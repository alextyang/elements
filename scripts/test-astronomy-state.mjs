import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import ts from "typescript";

const require = createRequire(import.meta.url);
const SunCalc = require("suncalc");

const compileCommonJs = (relativePath, dependency = {}) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const moduleObject = { exports: {} };
    const localRequire = (specifier) => dependency[specifier] ?? require(specifier);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        localRequire,
    );
    return moduleObject.exports;
};

const starCatalog = compileCommonJs(
    "../components/backgrounds/sky/star-catalog.ts",
);
const cameraContract = compileCommonJs(
    "../components/backgrounds/sky/camera-contract.ts",
);
const celestialEphemeris = compileCommonJs(
    "../components/backgrounds/sky/celestial-ephemeris.ts",
    { "./camera-contract": cameraContract },
);
const celestialPhysics = compileCommonJs(
    "../components/backgrounds/sky/celestial-physics.ts",
);
const physicalAtmosphere = compileCommonJs(
    "../components/backgrounds/sky/physical-atmosphere.ts",
    {
        "./physical-atmosphere-wgsl.ts": {
            PHYSICAL_ATMOSPHERE_DIRECTIONAL_LIGHTING_WGSL: "",
            PHYSICAL_ATMOSPHERE_IRRADIANCE_WGSL: "",
            PHYSICAL_ATMOSPHERE_MULTISCATTER_WGSL: "",
            PHYSICAL_ATMOSPHERE_SKY_VIEW_WGSL: "",
            PHYSICAL_ATMOSPHERE_TRANSMITTANCE_WGSL: "",
            physicalAtmosphereConsumerWgsl: () => "",
        },
        "./directional-cloud-visibility.ts": {
            DIRECTIONAL_CLOUD_VISIBILITY_HEIGHT: 96,
            DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT: 193,
            DIRECTIONAL_CLOUD_VISIBILITY_WIDTH: 96,
        },
    },
);
const astronomy = compileCommonJs(
    "../components/backgrounds/sky/astronomy.tsx",
    {
        "./star-catalog": starCatalog,
        "./camera-contract": cameraContract,
        "./celestial-ephemeris": celestialEphemeris,
        "./celestial-physics": celestialPhysics,
        "./physical-atmosphere": physicalAtmosphere,
    },
);
const skyPalettes = compileCommonJs(
    "../components/backgrounds/sky/sky-palettes.ts",
);
const composition = compileCommonJs(
    "../components/backgrounds/sky/atmospheric-composition.ts",
    { "./physical-atmosphere": physicalAtmosphere },
);

const mean = (values) =>
    values.reduce((total, value) => total + value, 0) / values.length;

test("lunar phase law is nonlinear, monotone, and source-distance aware", () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 1]
        .map(astronomy.lunarRelativeIrradiance);
    samples.slice(1).forEach((value, index) =>
        assert.ok(value >= samples[index]));
    assert.ok(samples[2] < 0.03, "a quarter-illuminated crescent is very faint");
    assert.ok(samples[3] > 0.06 && samples[3] < 0.12,
        "first/last quarter is about a tenth of full-Moon irradiance");
    assert.equal(samples.at(-1), 1);
    assert.ok(
        astronomy.lunarTopOfAtmosphereIrradiance(1, 356_500) >
            astronomy.lunarTopOfAtmosphereIrradiance(1, 406_700),
    );
    assert.ok(astronomy.FULL_MOON_TO_SOLAR_IRRADIANCE_RATIO < 3e-6);
});

test("catalogue coordinates precess from J2000 before horizontal projection", () => {
    const ra = 101.287155 * Math.PI / 180;
    const dec = -16.716116 * Math.PI / 180;
    const atEpoch = celestialEphemeris.precessEquatorialJ2000(
        ra,
        dec,
        new Date("2000-01-01T12:00:00Z"),
    );
    assert.ok(Math.abs(atEpoch.rightAscensionRadians - ra) < 1e-12);
    assert.ok(Math.abs(atEpoch.declinationRadians - dec) < 1e-12);
    const current = celestialEphemeris.precessEquatorialJ2000(
        ra,
        dec,
        new Date("2026-07-28T00:00:00Z"),
    );
    assert.ok(Math.abs(current.rightAscensionRadians - ra) > 0.001);
    assert.ok(Math.abs(current.declinationRadians - dec) > 0.0001);
});

test("airmass, refraction, and direct-beam transmission remain physical", () => {
    assert.ok(Math.abs(astronomy.opticalAirMass(90) - 1) < 0.001);
    assert.ok(astronomy.opticalAirMass(5) > astronomy.opticalAirMass(45));
    assert.ok(astronomy.apparentAltitude(0) > 0.45);

    const zenith = astronomy.directAtmosphericTransmittance({
        apparentAltitudeDegrees: 90,
        aerosolOpticalDepth550: 0.05,
        angstromExponent: 1.3,
    });
    const horizon = astronomy.directAtmosphericTransmittance({
        apparentAltitudeDegrees: 2,
        aerosolOpticalDepth550: 0.05,
        angstromExponent: 1.3,
    });
    const smoky = astronomy.directAtmosphericTransmittance({
        apparentAltitudeDegrees: 45,
        aerosolOpticalDepth550: 0.5,
        angstromExponent: 1.7,
    });
    const clear = astronomy.directAtmosphericTransmittance({
        apparentAltitudeDegrees: 45,
        aerosolOpticalDepth550: 0.03,
        angstromExponent: 1.3,
    });
    assert.ok(mean(horizon) < mean(zenith));
    assert.ok(mean(smoky) < mean(clear));
    assert.ok(horizon[0] > horizon[1] && horizon[1] > horizon[2],
        "long slant paths redden the direct lunar beam");
});

test("adaptation follows solar, lunar, artificial, and cloud-amplified luminance", () => {
    const day = astronomy.calculateSkyAdaptation({ solarAltitudeDegrees: 45 });
    const dark = astronomy.calculateSkyAdaptation({ solarAltitudeDegrees: -24 });
    const moonlit = astronomy.calculateSkyAdaptation({
        solarAltitudeDegrees: -24,
        apparentLunarIrradiance: 1,
    });
    const urbanCloud = astronomy.calculateSkyAdaptation({
        solarAltitudeDegrees: -24,
        artificialGlow: 0.12,
        cloudAmplification: 1,
    });
    assert.ok(day.luminanceCdM2 > moonlit.luminanceCdM2);
    assert.ok(moonlit.luminanceCdM2 > dark.luminanceCdM2);
    assert.ok(urbanCloud.luminanceCdM2 > moonlit.luminanceCdM2);
    assert.ok(dark.radiometricExposure > moonlit.radiometricExposure);
    assert.ok(moonlit.radiometricExposure > day.radiometricExposure);
    assert.ok(dark.scotopicWeight > 0.9 && day.scotopicWeight < 0.01);
});

const celestialInput = {
    latitude: 34.0522,
    longitude: -118.2437,
    haze: 0.45,
    cloudDensity: 0.1,
    atmosphericVeil: 0.05,
    aerosolOpticalDepth550: 0.04,
    aerosolAngstromExponent: 1.3,
    observerAltitudeKm: 0.1,
    ozoneScale: 1,
    solarAltitudeOverride: -22,
};

const findHighMoonDate = () => {
    const start = Date.UTC(2026, 0, 1);
    for (let hour = 0; hour < 24 * 40; hour += 1) {
        const date = new Date(start + hour * 3_600_000);
        const scene = astronomy.calculateCelestialScene({
            ...celestialInput,
            date,
        });
        if (scene.moon.altitude > 35 && scene.moon.fraction > 0.6) return date;
    }
    throw new Error("no high bright Moon found in qualification interval");
};

test("celestial sources remain separate from observer-path extinction", () => {
    const date = findHighMoonDate();
    const clear = astronomy.calculateCelestialScene({ ...celestialInput, date });
    const smoky = astronomy.calculateCelestialScene({
        ...celestialInput,
        date,
        haze: 1.5,
        aerosolOpticalDepth550: 0.65,
        aerosolAngstromExponent: 1.7,
    });
    const cloudy = astronomy.calculateCelestialScene({
        ...celestialInput,
        date,
        cloudDensity: 2.6,
        atmosphericVeil: 0.9,
    });
    assert.equal(
        clear.moon.topOfAtmosphereIrradiance,
        smoky.moon.topOfAtmosphereIrradiance,
    );
    assert.ok(smoky.moon.groundIrradiance < clear.moon.groundIrradiance);
    assert.deepEqual(cloudy.moon.transmittance, clear.moon.transmittance,
        "cloud occlusion is not aerosol extinction and belongs to cloud transport");
    assert.equal(cloudy.moon.opacity, clear.moon.opacity,
        "finite cloud attenuation belongs to the per-ray cloud operator");
    assert.equal(cloudy.starsOpacity, clear.starsOpacity,
        "finite clouds cannot globally attenuate catalogue stars twice");
    assert.equal(cloudy.limitingMagnitude, clear.limitingMagnitude,
        "finite clouds cannot alter the clear-gap detection threshold");
    assert.equal(cloudy.stars.length, clear.stars.length,
        "cloud cover must preserve sources for spatially resolved occultation");
    assert.ok(clear.moon.topOfAtmosphereIrradiance >= clear.moon.groundIrradiance);
});

test("star detection, scintillation, and earthshine obey night visibility", () => {
    const date = findHighMoonDate();
    const dark = astronomy.calculateCelestialScene({ ...celestialInput, date });
    const twilight = astronomy.calculateCelestialScene({
        ...celestialInput,
        date,
        solarAltitudeOverride: -7,
    });
    assert.ok(dark.perceptibleStars > twilight.perceptibleStars);
    assert.ok(dark.limitingMagnitude > twilight.limitingMagnitude);
    assert.ok(dark.stars.every((star) =>
        star.scintillation >= 0 && star.scintillation <= 0.31 &&
        star.seeing >= 0 && star.seeing <= 1));
    assert.ok(dark.stars.every((star) => star.radiance < 1e-8),
        "catalogue stars use solar-relative irradiance before common exposure");
    assert.ok(dark.moon.earthshineOpacity <= 0.0065);
    assert.ok(dark.moon.groundIrradiance <= dark.moon.topOfAtmosphereIrradiance);
    assert.equal(dark.moon.discRadianceScale, 1,
        "the Moon cannot cancel or bake the one common scene exposure");
    assert.equal(dark.moon.radianceContract.commonExposureScale, 1);
    assert.equal(dark.moon.radianceContract.phaseApplicationCount, 1);
});

test("Moon and Sun observer transfer come from the supplied physical atmosphere state", () => {
    const date = findHighMoonDate();
    const atmosphereState = physicalAtmosphere.createPhysicalAtmosphereState({
        observerAltitudeKm: 0.24,
        aerosolType: "smoke",
        aerosolOpticalDepth550: 0.42,
        aerosolBoundaryLayerStrength: 0.72,
        aerosolBoundaryLayerHeightKm: 0.68,
        aerosolBoundaryLayerTransitionKm: 0.14,
        aerosolAngstromExponent: 1.7,
        aerosolSingleScatteringAlbedo: [0.8, 0.84, 0.9],
        ozoneColumnDobson: 365,
    });
    const scene = astronomy.calculateCelestialScene({
        ...celestialInput,
        date,
        physicalAtmosphereState: atmosphereState,
        solarTopOfAtmosphereIrradianceRgb: [3.2, 3.16, 3.08],
    });
    const toAtmosphere = (direction) => [
        direction[0],
        direction[2],
        direction[1],
    ];
    assert.deepEqual(
        scene.moon.transmittance,
        physicalAtmosphere.atmosphereObserverTransmittanceToSpace(
            atmosphereState,
            toAtmosphere(scene.moon.direction),
            atmosphereState.observerAltitudeKm,
        ),
        "lunar direct transfer must be the same optical path as the atmosphere LUT",
    );
    assert.deepEqual(
        scene.sun.observerTransmittanceRgb,
        physicalAtmosphere.atmosphereObserverTransmittanceToSpace(
            atmosphereState,
            toAtmosphere(scene.sun.source.direction),
            atmosphereState.observerAltitudeKm,
        ),
        "solar direct transfer must be the same optical path as the atmosphere LUT",
    );
    assert.deepEqual(
        scene.moon.groundIrradianceRgb,
        scene.moon.radianceContract.topOfAtmosphereIrradianceRgb.map(
            (channel, index) => channel * scene.moon.transmittance[index],
        ),
    );
    assert.equal(scene.sun.commonExposureScale, 1);
    assert.equal(
        scene.sun.atmosphericGlareHandoff.owner,
        "physical-atmosphere-forward-scattering",
    );
});

test("scene exposes physical lunar ephemeris, stellar transport, and night axes", () => {
    const date = findHighMoonDate();
    const scene = astronomy.calculateCelestialScene({ ...celestialInput, date });
    const ephemeris = scene.moon.ephemeris;
    assert.ok(Math.abs(ephemeris.subEarthLongitudeRadians) < 0.18,
        "lunar optical libration remains inside its physical longitude envelope");
    assert.ok(Math.abs(ephemeris.subEarthLatitudeRadians) < 0.13,
        "lunar optical libration remains inside its physical latitude envelope");
    assert.ok(Number.isFinite(ephemeris.northPoleAngleFromZenithRadians));
    assert.ok(Number.isFinite(ephemeris.brightLimbAngleFromZenithRadians));
    assert.ok(Math.abs(Math.hypot(...ephemeris.sunDirectionInDiscFrame) - 1) < 1e-10);
    assert.ok(ephemeris.apparentAngularRadiusRadians > 0.004 &&
        ephemeris.apparentAngularRadiusRadians < 0.0052);
    assert.ok(Math.abs(
        scene.moon.diskPhotometry.relativeIrradiance -
            scene.moon.topOfAtmosphereIrradiance,
    ) < 1e-10);

    assert.ok(scene.stars.length > 0);
    for (const star of scene.stars.slice(0, 64)) {
        assert.ok(star.topOfAtmosphereFluxRgb.every((channel) => channel > 0));
        assert.ok(star.observerFluxRgb.every((channel) => channel > 0));
        assert.ok(star.transmittanceRgb.every(
            (channel) => channel >= 0 && channel <= 1,
        ));
        assert.ok(star.psfFwhmRadians > 0);
        assert.ok(star.psfSupportRadiusRadians > star.psfFwhmRadians);
        assert.ok(star.tipTiltArcseconds.every(Number.isFinite));
        assert.ok(Math.abs(
            star.radiance -
                10 ** (-0.4 * ((starCatalog.HIPPARCOS_STARS.find(
                    (catalogueStar) => catalogueStar.id === star.id,
                )?.mag ?? 0) + 26.74)),
        ) < 1e-20, "detection never scales intrinsic stellar energy");
    }

    const frame = scene.naturalNight.coordinateFrame;
    for (const direction of [
        frame.eclipticNorthDirection,
        frame.galacticNorthDirection,
        frame.galacticCenterDirection,
    ]) {
        assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-10);
    }
    assert.ok(scene.naturalNight.airglow.gravityWaveAmplitude >= 0.045);
    assert.ok(scene.naturalNight.zodiacal.radianceScale > 0);
    assert.ok(scene.naturalNight.galactic.radianceScale > 0);
    assert.ok(scene.naturalNight.integratedStarlight.radianceScale > 0);

    const illumination = SunCalc.getMoonIllumination(date);
    const angleDifference = Math.atan2(
        Math.sin(ephemeris.brightLimbPositionAngleRadians - illumination.angle),
        Math.cos(ephemeris.brightLimbPositionAngleRadians - illumination.angle),
    );
    assert.ok(Math.abs(angleDifference) < 0.02,
        "USNO bright-limb position angle agrees with the compact ephemeris");

    const later = astronomy.calculateCelestialScene({
        ...celestialInput,
        date: new Date(date.getTime() + 7 * 86_400_000),
    });
    assert.ok(Math.abs(
        later.moon.ephemeris.subEarthLongitudeRadians -
            ephemeris.subEarthLongitudeRadians,
    ) > 0.002, "optical libration evolves with the real lunar orbit");
    const sixHoursLater = astronomy.calculateCelestialScene({
        ...celestialInput,
        date: new Date(date.getTime() + 6 * 3_600_000),
    });
    const axisDot = frame.galacticCenterDirection.reduce(
        (sum, channel, index) =>
            sum + channel * sixHoursLater.naturalNight.coordinateFrame
                .galacticCenterDirection[index],
        0,
    );
    assert.ok(axisDot < 0.8,
        "the Galactic frame tracks sidereal time instead of a screen-space band");
});

test("all authored aerosol families resolve inside their physical envelopes", () => {
    for (const family of skyPalettes.SKY_FAMILIES) {
        const type = family.optics.aerosolType ?? "clean";
        const source = {
            aerosol: family.optics.aerosol,
            humidity: family.optics.humidity,
            aerosolSize: family.optics.aerosolSize ?? 0.3,
            aerosolAbsorption: family.optics.aerosolAbsorption ?? 0.04,
            ozone: family.optics.ozone ?? 1,
            observerAltitude: family.optics.observerAltitude ?? 0.08,
            inversion: family.optics.inversion ?? 0.08,
            stratosphericAerosol: family.optics.stratosphericAerosol ?? 0.03,
            groundAlbedo: family.optics.groundAlbedo ?? 0.24,
        };
        const state = composition.constrainPhysicalSkyComposition(source, type);
        const envelope = composition.AEROSOL_PHYSICAL_ENVELOPES[type];
        for (const [key, bounds] of [
            ["aerosol", envelope.aerosol],
            ["humidity", envelope.humidity],
            ["aerosolSize", envelope.size],
            ["aerosolAbsorption", envelope.absorption],
            ["stratosphericAerosol", envelope.stratosphere],
        ]) {
            assert.ok(state[key] >= bounds[0] && state[key] <= bounds[1],
                `${family.id} ${key} is outside ${type} envelope`);
        }
        assert.ok(composition.aerosolOpticalDepth550(state) >= 0.008);
    }
});

test("scene composition resolves continuous aerosol microphysics without palette colors", () => {
    const base = {
        aerosol: 0.45,
        humidity: 0.76,
        aerosolSize: 0.2,
        aerosolAbsorption: 0.3,
        ozone: 1.1,
        observerAltitude: 0.32,
        inversion: 0.78,
        stratosphericAerosol: 0.4,
        groundAlbedo: 0.24,
        groundAlbedoRgb: [0.08, 0.18, 0.31],
    };
    const smoke = composition.resolvePhysicalAtmosphereComposition(base, "smoke");
    const maritime = composition.resolvePhysicalAtmosphereComposition({
        ...base,
        aerosolSize: 0.78,
        aerosolAbsorption: 0.04,
    }, "maritime");
    assert.ok(smoke.aerosolOpticalDepth550 > 0);
    assert.ok(smoke.stratosphericAerosolOpticalDepth550 > 0);
    assert.equal(
        composition.aerosolOpticalDepth550(base),
        smoke.aerosolOpticalDepth550 + smoke.stratosphericAerosolOpticalDepth550,
    );
    assert.ok(smoke.aerosolBoundaryLayerStrength > 0.5);
    assert.ok(smoke.aerosolBoundaryLayerHeightKm < 1.1);
    assert.ok(smoke.aerosolSingleScatteringAlbedo[0] <
        maritime.aerosolSingleScatteringAlbedo[0]);
    assert.ok(maritime.aerosolAsymmetry > smoke.aerosolAsymmetry);
    assert.ok(smoke.aerosolAngstromExponent > maritime.aerosolAngstromExponent);
    assert.deepEqual(smoke.groundAlbedo, base.groundAlbedoRgb);
    assert.equal(Object.values(smoke).flat().every(Number.isFinite), true);
});

test("canonical composition state is reusable by celestial and renderer transport", () => {
    const source = {
        aerosol: 0.72,
        humidity: 0.68,
        aerosolSize: 0.34,
        aerosolAbsorption: 0.47,
        ozone: 1.12,
        observerAltitude: 0.18,
        inversion: 0.64,
        stratosphericAerosol: 0.12,
        groundAlbedo: 0.17,
        groundAlbedoRgb: [0.12, 0.16, 0.21],
    };
    const resolved = composition.resolvePhysicalAtmosphereComposition(
        source,
        "pollution",
    );
    const state = composition.createPhysicalAtmosphereStateFromComposition(
        source,
        "pollution",
    );
    assert.equal(state.aerosolType, "urban");
    assert.ok(state.aerosolOpticalDepth550 >=
        resolved.aerosolOpticalDepth550,
    "the shared state applies humidity growth once to the resolved dry column");
    assert.equal(state.relativeHumidity, resolved.relativeHumidity);
    assert.equal(state.observerAltitudeKm, resolved.observerAltitudeKm);
    assert.deepEqual(state.groundAlbedo, resolved.groundAlbedo);
    assert.deepEqual(state.aerosolSingleScatteringAlbedo,
        resolved.aerosolSingleScatteringAlbedo);
    assert.equal(state.ozoneCenterAltitudeKm, 25);
});

test("physical composition resolver constrains bypassed Lab extremes itself", () => {
    const resolved = composition.resolvePhysicalAtmosphereComposition({
        aerosol: -8,
        humidity: 3,
        aerosolSize: -2,
        aerosolAbsorption: 4,
        ozone: -5,
        observerAltitude: 9,
        inversion: -7,
        stratosphericAerosol: 4,
        groundAlbedo: 5,
        groundAlbedoRgb: [-2, 0.2, 7],
    }, "maritime");
    assert.ok(resolved.aerosolOpticalDepth550 >=
        composition.troposphericAerosolOpticalDepth550({ aerosol: 0.06 }));
    assert.ok(resolved.relativeHumidity >= 0.34 &&
        resolved.relativeHumidity <= 0.98);
    assert.ok(resolved.aerosolAngstromExponent >= 0 &&
        resolved.aerosolAngstromExponent <= 3);
    assert.ok(resolved.aerosolSingleScatteringAlbedo.every(
        (channel) => channel >= 0.65 && channel <= 0.9999));
    assert.ok(resolved.aerosolAsymmetry >= 0.45 &&
        resolved.aerosolAsymmetry <= 0.92);
    assert.ok(resolved.ozoneColumnDobson >= 230 &&
        resolved.ozoneColumnDobson <= 430);
    assert.ok(resolved.observerAltitudeKm <= 2.5);
    assert.deepEqual(resolved.groundAlbedo, [0, 0.2, 0.95]);
});

test("RGB ground reflectance preserves channels, bounds inputs, and accepts scalar scenes", () => {
    assert.deepEqual(
        composition.resolveGroundAlbedoRgb(0.27),
        [0.27, 0.27, 0.27],
        "legacy scalar albedo remains a neutral RGB boundary",
    );
    assert.deepEqual(
        composition.resolveGroundAlbedoRgb(0.2, [0.08, 0.19, 0.34]),
        [0.08, 0.19, 0.34],
        "an authored linear RGB surface spectrum remains channel-distinct",
    );
    assert.deepEqual(
        composition.resolveGroundAlbedoRgb(0.2, [-1, Number.NaN, 4]),
        [0, 0, 0.95],
        "every RGB channel is finite and bounded to physical reflectance",
    );

    const scalarScene = composition.constrainPhysicalSkyComposition({
        aerosol: 0.2,
        humidity: 0.4,
        aerosolSize: 0.2,
        aerosolAbsorption: 0.04,
        ozone: 1,
        observerAltitude: 0.1,
        inversion: 0.1,
        stratosphericAerosol: 0.02,
        groundAlbedo: 0.31,
    }, "clean");
    assert.deepEqual(scalarScene.groundAlbedoRgb, [0.31, 0.31, 0.31]);

    const rgbScene = composition.constrainPhysicalSkyComposition({
        ...scalarScene,
        groundAlbedoRgb: [0.11, 0.24, 0.37],
    }, "clean");
    assert.deepEqual(rgbScene.groundAlbedoRgb, [0.11, 0.24, 0.37]);
    assert.ok(rgbScene.groundAlbedoRgb.every(
        (channel) => channel >= 0 && channel <= 0.95,
    ));
});

test("lab extremes cannot create internally contradictory aerosol optics", () => {
    const impossible = {
        aerosol: -4,
        humidity: 2,
        aerosolSize: 0,
        aerosolAbsorption: 1,
        ozone: 9,
        observerAltitude: -3,
        inversion: 4,
        stratosphericAerosol: 1,
        groundAlbedo: 2,
    };
    const maritime = composition.constrainPhysicalSkyComposition(
        impossible,
        "maritime",
    );
    assert.ok(maritime.humidity >= 0.34);
    assert.ok(maritime.aerosolSize >= 0.42);
    assert.ok(maritime.aerosolAbsorption <= 0.16);
    assert.ok(maritime.stratosphericAerosol <= 0.14);
    assert.ok(maritime.groundAlbedo <= 0.92);
});

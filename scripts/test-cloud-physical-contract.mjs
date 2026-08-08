import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-physical-v2-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-system-abi-v2",
    "cloud-reference-transport",
    "cloud-weather-engine",
    "cloud-generated-physical-sampler",
]) {
    let output = ts.transpileModule(
        readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8"),
        {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ES2022,
            },
        },
    ).outputText;
    output = output.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const physical = await import(
    new URL(`file://${join(temporaryRoot, "cloud-physical-sample.mjs")}`)
);
const abi = await import(
    new URL(`file://${join(temporaryRoot, "cloud-system-abi-v2.mjs")}`)
);
const reference = await import(
    new URL(`file://${join(temporaryRoot, "cloud-reference-transport.mjs")}`)
);
const weather = await import(
    new URL(`file://${join(temporaryRoot, "cloud-weather-engine.mjs")}`)
);
const generatedSampler = await import(
    new URL(`file://${join(temporaryRoot, "cloud-generated-physical-sampler.mjs")}`)
);

const owner = {
    id: "test-convective-owner",
    classification: {
        genus: "cumulus", species: "congestus", varieties: [],
        supplementaryFeatures: [], accessoryClouds: [], origin: { kind: "natural" },
    },
    physical: {
        baseAltitudeKm: 0.8,
        geometricDepthKm: 4.2,
        coverageOktas: 4,
        thermodynamics: {
            baseTemperatureKelvin: 286,
            topTemperatureKelvin: 258,
            relativeHumidity: 0.96,
            environmentalLapseRate: 6.5,
            stabilityIndex: 0.22,
            verticalVelocity: 7.2,
            entrainment: 0.18,
        },
        kinematics: {
            windSpeed: 14,
            windDirection: 0.7,
            verticalShear: 12,
            turbulenceIntegralScaleKm: 0.8,
            turbulenceDissipation: 0.24,
        },
        condensate: {
            liquidWaterPath: 820,
            iceWaterPath: 190,
            liquidFraction: 0.81,
            dropletEffectiveRadius: 13,
            iceEffectiveRadius: 48,
        },
        precipitation: {
            kind: "shower",
            rate: 4.5,
            terminalVelocity: 7,
            evaporationDepthKm: 0,
        },
        formation: {
            liftingCondensationLevelKm: 0.8,
            levelOfFreeConvectionKm: 1.0,
            equilibriumLevelKm: 12,
            inversionBaseKm: null,
            inversionStrengthKelvin: 0,
            freezingLevelKm: 4.1,
            shearLayerBaseKm: 0.8,
            shearLayerTopKm: 5,
        },
    },
    extent: {
        centerEastKm: 2,
        centerNorthKm: 18,
        majorRadiusKm: 3,
        minorRadiusKm: 2.3,
        orientation: 0.4,
        boundaryTransitionKm: 0.45,
    },
    organization: {
        kind: "storm-complex",
        inflowRadiusKm: 4,
        updraftRadiusKm: 1.2,
        outflowRadiusKm: 5,
        propagationDirection: 0.4,
    },
    lifecycle: {
        stage: "precipitating",
        stageProgress: 0.62,
        ageSeconds: 2_400,
        cloudTopRiseRate: 7.2,
        condensateTendency: 0.4,
        glaciationRate: 0.2,
        precipitationEfficiency: 0.7,
        outflowSpeed: 5,
    },
};

const geometry = {
    support: 0.95,
    density: 0.72,
    signedDistanceKm: -0.24,
    gradient: [0.2, 0.9, -0.3],
    closestSurfaceKm: [2.1, 3.2, 18.4],
    inverseCurvatureKm: 0.8,
    seam01: 0.12,
    localAltitudeFraction01: 0.55,
};

test("one physical sample owns geometry, condensate, phase, motion, and precipitation", () => {
    const sample = physical.resolveCloudPhysicalSample({ owner, geometry });
    assert.deepEqual(physical.validateCloudPhysicalSample(sample), []);
    assert.equal(sample.ownerId, physical.cloudStableNumericId(owner.id));
    assert.equal(sample.featureId, 0);
    assert.ok(sample.density > 0);
    assert.ok(sample.liquidWaterContent > sample.iceWaterContent);
    assert.ok(sample.precipitationSource > 0);
    assert.ok(physical.cloudSampleExtinctionKm(sample) > 0);
    assert.ok(Math.abs(Math.hypot(...sample.gradient) - 1) < 1e-6);
});

test("overlapping owners share one mass-aware camera/light sample", () => {
    const liquid = physical.resolveCloudPhysicalSample({ owner, geometry });
    const iceOwner = structuredClone(owner);
    iceOwner.id = "test-ice-owner";
    iceOwner.physical.condensate.liquidWaterPath = 0;
    iceOwner.physical.condensate.iceWaterPath = 460;
    iceOwner.physical.condensate.liquidFraction = 0;
    const ice = physical.resolveCloudPhysicalSample({
        owner: iceOwner,
        geometry: { ...geometry, density: 0.4, signedDistanceKm: -0.1 },
    });
    const combined = physical.combineCloudPhysicalSamples([liquid, ice]);
    assert.deepEqual(physical.validateCloudPhysicalSample(combined), []);
    assert.ok(combined.liquidWaterContent > 0);
    assert.ok(combined.iceWaterContent > 0);
    assert.ok(combined.density >= Math.max(liquid.density, ice.density));
    assert.ok(combined.ownerId === liquid.ownerId || combined.ownerId === ice.ownerId);
});

test("features cannot escape their parent owner or create ownerless precipitation", () => {
    assert.throws(() => physical.resolveCloudPhysicalSample({
        owner,
        geometry,
        feature: {
            id: "foreign-feature",
            parentOwnerId: "another-owner",
            precipitationMultiplier: 2,
        },
    }), /not sampled owner/);

    const dryOwner = structuredClone(owner);
    dryOwner.physical.condensate.liquidWaterPath = 0;
    dryOwner.physical.condensate.iceWaterPath = 0;
    const sample = physical.resolveCloudPhysicalSample({ owner: dryOwner, geometry });
    assert.ok(physical.validateCloudPhysicalSample(sample).some(
        ({ code }) => code === "ownerless-precipitation",
    ));
});

test("ABI v2 keeps owner, features, and lifecycle events in versioned buffers", () => {
    const compiled = abi.compileCloudSystemV2({
        state: owner,
        recipeId: "cumulus-congestus",
        macroTopology: "thermal-field",
        materialModel: "liquid-convective",
        physicalFoundationAdapter: "specialized-deep-convection",
        atlasRepresentation: "cumulus-congestus",
        generation: 2,
        features: [{
            id: "test-pileus",
            parentOwnerId: owner.id,
            kind: "pileus",
            attachmentKm: [2, 5.1, 18],
            scaleKm: [2, 0.2, 1.5],
            orientationRadians: 0.4,
            lifecycleProgress01: 0.25,
            active: true,
            generation: 2,
            materialClass: "liquid-cloud",
        }],
        events: [{
            id: "birth-1",
            step: 0,
            simulationTimeSeconds: 0,
            kind: "birth",
            ownerIds: [physical.cloudStableNumericId(owner.id)],
            featureIds: [],
            parentEventIds: [],
            payload: { source: "conditioned" },
        }],
    });
    assert.deepEqual(abi.validateCompiledCloudSystemV2(compiled), []);
    assert.equal(compiled.schemaVersion, 2);
    assert.equal(compiled.owner.featureCount, 1);
    assert.equal(compiled.features[0].parentOwnerNumericId, compiled.owner.ownerId);
    const packed = abi.packCloudSystemV2(compiled);
    assert.equal(packed.ownerFloats.length, abi.CLOUD_OWNER_RECORD_V2_FLOATS);
    assert.equal(packed.ownerUints.length, abi.CLOUD_OWNER_RECORD_V2_UINTS);
    assert.equal(packed.featureFloats.length, abi.CLOUD_FEATURE_RECORD_V2_FLOATS);
    assert.equal(packed.featureUints.length, abi.CLOUD_FEATURE_RECORD_V2_UINTS);

    const migrated = abi.migrateCompiledCloudSystemV1({
        sourceId: owner.id,
        recipeId: "cumulus-congestus",
        macroTopology: "thermal-field",
        materialModel: "liquid-convective",
    }, owner);
    assert.deepEqual(abi.validateCompiledCloudSystemV2(migrated), []);
    assert.equal(migrated.owner.physicalFoundationAdapter, "legacy-v1-adapter");
});

test("strict reference transport samples the same physical callback for camera and light paths", () => {
    const ownerIds = new Set();
    const sampleAt = (position) => {
        const radial = Math.hypot(position[0], position[1] - 2.5, position[2] - 6);
        const inside = radial < 2.2;
        const sample = physical.resolveCloudPhysicalSample({
            owner,
            geometry: {
                ...geometry,
                support: inside ? 1 : 0,
                density: inside ? Math.max(0, 1 - radial / 2.2) : 0,
                signedDistanceKm: radial - 2.2,
                localAltitudeFraction01: Math.max(0, Math.min(1,
                    (position[1] - 0.8) / 4.2)),
            },
        });
        ownerIds.add(sample.ownerId);
        return sample;
    };
    const result = reference.renderCloudReferenceTransport({
        ray: {
            originKm: [0, 2.5, 0],
            direction: [0, 0, 1],
            minimumDistanceKm: 0,
            maximumDistanceKm: 12,
        },
        light: {
            directionToSource: [0.6, 0.12, -0.4],
            radiance: [8, 7.7, 7.1],
            angularRadiusRadians: 0.00465,
        },
        sample: sampleAt,
        environmentRadiance: () => [0.22, 0.34, 0.58],
        settings: {
            primarySamples: 96,
            lightSamples: 24,
            multipleScatteringOrders: 3,
            spectralIceTwilight: true,
        },
    });
    assert.equal(ownerIds.size, 1);
    assert.ok(result.opticalDepth > 0);
    assert.ok(result.radiance.every(Number.isFinite));
    assert.ok(result.transmittance.every((value) => value >= 0 && value <= 1));
    assert.ok(result.primarySamples >= 96);
    assert.ok(result.lightSamples > 0);
    assert.ok(result.firstSignificantDepthKm !== null);
});


test("weather-generated owners execute through the same physical and reference callback", () => {
    const simulation = weather.runCloudWeatherSimulation(
        weather.createCloudWeatherSimulation({
            mode: "conditioned",
            seed: 0x51a9,
            domain: weather.DEFAULT_CLOUD_WEATHER_DOMAIN,
            target: { genus: "cumulus", species: "congestus", ownerCount: 1 },
            fixedStepSeconds: 30,
            maxOwners: 1,
        }),
        12,
    );
    const generatedOwner = simulation.owners[0];
    const center = [
        generatedOwner.centerEastKm,
        generatedOwner.baseAltitudeKm + generatedOwner.geometricDepthKm * 0.5,
        generatedOwner.centerNorthKm,
    ];
    const sample = generatedSampler.sampleCloudWeatherSimulationPhysical(
        simulation,
        center,
    );
    assert.deepEqual(physical.validateCloudPhysicalSample(sample), []);
    assert.ok(sample.density > 0);
    assert.ok(sample.liquidWaterContent + sample.iceWaterContent > 0);

    const result = reference.renderCloudReferenceTransport({
        ray: {
            originKm: [center[0], center[1], center[2] -
                generatedOwner.radiusNorthKm * 2],
            direction: [0, 0, 1],
            minimumDistanceKm: 0,
            maximumDistanceKm: generatedOwner.radiusNorthKm * 4,
        },
        light: {
            directionToSource: [0.4, 0.7, -0.3],
            radiance: [7, 6.8, 6.4],
            angularRadiusRadians: 0.00465,
        },
        sample: (position) =>
            generatedSampler.sampleCloudWeatherSimulationPhysical(
                simulation, position),
        environmentRadiance: () => [0.18, 0.3, 0.52],
        settings: {
            primarySamples: 64,
            lightSamples: 12,
            multipleScatteringOrders: 2,
        },
    });
    assert.ok(result.opticalDepth > 0);
    assert.ok(result.radiance.some((value) => value > 0));
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-world-v2-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const source = readFileSync(new URL("cloud-world-frame.ts", sourceRoot), "utf8");
const output = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
writeFileSync(join(temporaryRoot, "cloud-world-frame.mjs"), output);
writeFileSync(join(temporaryRoot, "camera-contract.mjs"), `
export const normalizeCameraAngleRadians = value =>
  Math.atan2(Math.sin(value), Math.cos(value));
export const rotateDirectionByCameraYaw = ([x,y,z], yaw) => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  y,
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];
`);
writeFileSync(join(temporaryRoot, "cloud-morphology-modifiers.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-state-map.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-abi-v2.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-runtime.mjs"), `
export const packCloudSystems = (systems, capacity) => ({
  data: new Float32Array(0), count: systems.length, capacity, dropped: 0,
});
export const packLegacyCloudFeatures = () => new Float32Array(0);
`);
writeFileSync(join(temporaryRoot, "cloud-shipping-production-runtime.mjs"), `
export const compileCloudShippingProductionRuntimeV1 = runtime => ({
  schemaVersion: 1,
  runtimeSignature: runtime.signature,
  frameIndex: 0,
  simulationTimeSeconds: 0,
  bridge: {
    systemsV2: runtime.systems.map(system => ({
      owner: {
        sourceId: system.state.id,
        centerKm: [
          system.state.extent.centerEastKm,
          2,
          system.state.extent.centerNorthKm,
        ],
        horizontalRadiusKm: [4, 1, 3],
        baseAltitudeKm: 1,
        geometricDepthKm: 2,
        boundaryTransitionKm: 0.25,
        orientationRadians: system.state.extent.orientation,
        velocityKmPerSecond: [0.01, 0.002, 0.02],
        liquidWaterPathGramsPerSquareMetre: 300,
        iceWaterPathGramsPerSquareMetre: 100,
        liquidEffectiveRadiusMicrons: 12,
        iceEffectiveRadiusMicrons: 45,
        baseTemperatureKelvin: 282,
        topTemperatureKelvin: 260,
        relativeHumidity01: 0.95,
        turbulenceDissipation: 0.04,
        lifecycleAgeSeconds: 120,
        lifecycleProgress01: 0.6,
        precipitationRate: 3.5,
      },
    })),
    frame: { fingerprint: runtime.signature },
  },
});
`);

const world = await import(
    new URL(`file://${join(temporaryRoot, "cloud-world-frame.mjs")}`)
);

const legacyThermodynamics = {
    baseTemperatureKelvin: 290,
    topTemperatureKelvin: 270,
    relativeHumidity: 0.8,
    environmentalLapseRate: 6.5,
    stabilityIndex: 0.2,
    verticalVelocity: 0,
    entrainment: 0.1,
};
const legacyKinematics = {
    windSpeed: 1,
    windDirection: 0.4,
    verticalShear: 0.1,
    turbulenceIntegralScaleKm: 1,
    turbulenceDissipation: 0.01,
};
const legacyCondensate = {
    liquidWaterPath: 1,
    iceWaterPath: 0,
    liquidFraction: 1,
    dropletEffectiveRadius: 8,
    iceEffectiveRadius: 20,
};
const legacyPrecipitation = {
    kind: "rain",
    rate: 0.1,
    terminalVelocity: 6,
    evaporationDepthKm: 0,
};
const legacyLifecycle = {
    stage: "mature",
    stageProgress: 0.2,
    ageSeconds: 30,
    cloudTopRiseRate: 0,
    condensateTendency: 0,
    glaciationRate: 0,
    precipitationEfficiency: 0,
    outflowSpeed: 0,
};
const system = {
    state: {
        id: "owner-a",
        extent: {
            centerEastKm: 2,
            centerNorthKm: 5,
            majorRadiusKm: 2,
            minorRadiusKm: 1,
            orientation: 0.3,
            boundaryTransitionKm: 0.1,
        },
        organization: {
            kind: "point-process",
            distribution: "poisson-disk",
            meanSpacingKm: 2,
            minimumSeparationKm: 1,
            clusterRadiusKm: 3,
            anisotropy: 0.2,
            orientation: 0.3,
        },
        physical: {
            baseAltitudeKm: 0.8,
            geometricDepthKm: 1,
            coverageOktas: 4,
            thermodynamics: legacyThermodynamics,
            kinematics: legacyKinematics,
            condensate: legacyCondensate,
            precipitation: legacyPrecipitation,
            formation: {},
        },
        lifecycle: legacyLifecycle,
    },
    compiled: {
        geometry: {
            baseAltitudeKm: 0.8,
            geometricDepthKm: 1,
            elementScaleKm: 1,
            verticalAspect: 1,
            supportBandFraction: 0.2,
            extent: {
                centerEastKm: 2,
                centerNorthKm: 5,
                majorRadiusKm: 2,
                minorRadiusKm: 1,
                orientation: 0.3,
                boundaryTransitionKm: 0.1,
            },
        },
        material: {
            liquidWaterPathKgM2: 1,
            iceWaterPathKgM2: 0,
            liquidFraction01: 1,
            extinctionKm: 1,
            singleScatteringAlbedo: 0.999,
            asymmetryParameter: 0.85,
            liquidEffectiveRadiusMicrons: 8,
            iceEffectiveRadiusMicrons: 20,
        },
        thermodynamics: legacyThermodynamics,
        kinematics: legacyKinematics,
        lifecycle: legacyLifecycle,
        precipitation: legacyPrecipitation,
    },
};
const runtime = {
    signature: "base-runtime",
    systems: [system],
    packedSystemData: { data: new Float32Array(0), count: 1, capacity: 36, dropped: 0 },
    legacyFeatureData: new Float32Array(0),
    morphologyRequests: [],
    compositionQualifications: [],
};

const assertV2StatePropagated = embeddedSystem => {
    const owner = embeddedSystem.productionV2Owner;
    assert.equal(embeddedSystem.state.physical.baseAltitudeKm,
        owner.baseAltitudeKm);
    assert.equal(embeddedSystem.state.physical.geometricDepthKm,
        owner.geometricDepthKm);
    assert.equal(embeddedSystem.state.physical.condensate.liquidWaterPath,
        owner.liquidWaterPathGramsPerSquareMetre);
    assert.equal(embeddedSystem.state.physical.condensate.iceWaterPath,
        owner.iceWaterPathGramsPerSquareMetre);
    assert.equal(embeddedSystem.state.physical.condensate.liquidFraction, 0.75);
    assert.equal(embeddedSystem.state.physical.thermodynamics.topTemperatureKelvin,
        owner.topTemperatureKelvin);
    assert.equal(embeddedSystem.state.physical.precipitation.rate,
        owner.precipitationRate);
    assert.equal(embeddedSystem.state.lifecycle.ageSeconds,
        owner.lifecycleAgeSeconds);
    assert.equal(embeddedSystem.compiled.material.liquidEffectiveRadiusMicrons,
        owner.liquidEffectiveRadiusMicrons);
    assert.equal(embeddedSystem.compiled.material.iceEffectiveRadiusMicrons,
        owner.iceEffectiveRadiusMicrons);
};

test("zero-yaw shipping runtime pairs and propagates the exact V2 owner", () => {
    const embedded = world.embedCloudRuntimeInCameraWorld(runtime, 0);
    assert.equal(embedded.systems.length, 1);
    assert.equal(embedded.systems[0].productionRuntimeSignature, runtime.signature);
    assert.equal(embedded.systems[0].productionV2Owner.sourceId, "owner-a");
    assert.equal(
        embedded.systems[0].productionV2Owner,
        embedded.productionV2.bridge.systemsV2[0].owner,
    );
    assertV2StatePropagated(embedded.systems[0]);
    assert.equal(world.embedCloudRuntimeInCameraWorld(runtime, 0), embedded);
});

test("yaw embedding pairs transformed V2 state and keeps the result cached", () => {
    const yaw = Math.PI / 2;
    const embedded = world.embedCloudRuntimeInCameraWorld(runtime, yaw);
    assert.match(embedded.signature, /earth-frame-yaw=/);
    assert.equal(
        embedded.systems[0].productionRuntimeSignature,
        embedded.signature,
    );
    assert.equal(embedded.systems[0].productionV2Owner.sourceId, "owner-a");
    assert.equal(
        embedded.systems[0].productionV2Owner.centerKm[0],
        embedded.systems[0].state.extent.centerEastKm,
    );
    assert.equal(
        embedded.systems[0].productionV2Owner.centerKm[2],
        embedded.systems[0].state.extent.centerNorthKm,
    );
    assertV2StatePropagated(embedded.systems[0]);
    assert.equal(world.embedCloudRuntimeInCameraWorld(runtime, yaw), embedded);
});

test("radiative setup remains runtime-local rather than consulting a global registry", () => {
    const radiativeSource = readFileSync(
        new URL("cloud-radiative-domain.ts", sourceRoot),
        "utf8",
    );
    assert.match(radiativeSource, /cloudRadiativeOwnerInputFromRuntime/);
    assert.match(radiativeSource, /system\.state\.extent\.centerEastKm/);
    assert.match(radiativeSource, /system\.compiled\.geometry\.baseAltitudeKm/);
    assert.doesNotMatch(radiativeSource,
        /latestRuntime|cloudShippingV2SystemForOwner|cloud-shipping-gpu-registry/);
});

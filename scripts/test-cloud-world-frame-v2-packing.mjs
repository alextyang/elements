import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-v2-packed-world-"));
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
export const rotateDirectionByCameraYaw = ([x, y, z], yaw) => [
  x * Math.cos(yaw) + z * Math.sin(yaw), y,
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];
`);
writeFileSync(join(temporaryRoot, "cloud-morphology-modifiers.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-state-map.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-abi-v2.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-runtime.mjs"), `
export const packCloudSystems = (systems, capacity) => ({
  data: new Float32Array([
    systems[0]?.state.physical.condensate.liquidWaterPath ?? -1,
    systems[0]?.state.physical.condensate.iceWaterPath ?? -1,
    systems[0]?.state.physical.precipitation.rate ?? -1,
  ]),
  count: systems.length, capacity, dropped: 0,
});
export const packLegacyCloudFeatures = systems => new Float32Array([
  systems[0]?.compiled.material.liquidEffectiveRadiusMicrons ?? -1,
  systems[0]?.compiled.material.iceEffectiveRadiusMicrons ?? -1,
]);
`);
writeFileSync(join(temporaryRoot, "cloud-shipping-production-runtime.mjs"), `
export const compileCloudShippingProductionRuntimeV1 = runtime => ({
  runtimeSignature: runtime.signature,
  bridge: {
    systemsV2: runtime.systems.map(system => ({ owner: {
      sourceId: system.state.id,
      centerKm: [2, 2, 5], horizontalRadiusKm: [4, 1, 3],
      baseAltitudeKm: 1, geometricDepthKm: 2,
      boundaryTransitionKm: 0.25,
      orientationRadians: system.state.extent.orientation,
      velocityKmPerSecond: [0.01, 0.002, 0.02],
      liquidWaterPathGramsPerSquareMetre: 300,
      iceWaterPathGramsPerSquareMetre: 100,
      liquidEffectiveRadiusMicrons: 12,
      iceEffectiveRadiusMicrons: 45,
      baseTemperatureKelvin: 282, topTemperatureKelvin: 260,
      relativeHumidity01: 0.95, turbulenceDissipation: 0.04,
      lifecycleAgeSeconds: 120, lifecycleProgress01: 0.6,
      precipitationRate: 3.5,
    } })),
    frame: { fingerprint: runtime.signature },
  },
});
`);

const world = await import(new URL(
    `file://${join(temporaryRoot, "cloud-world-frame.mjs")}`,
));

const thermodynamics = {
    baseTemperatureKelvin: 290, topTemperatureKelvin: 270,
    relativeHumidity: 0.8, environmentalLapseRate: 6.5,
    stabilityIndex: 0.2, verticalVelocity: 0, entrainment: 0.1,
};
const kinematics = {
    windSpeed: 1, windDirection: 0.4, verticalShear: 0.1,
    turbulenceIntegralScaleKm: 1, turbulenceDissipation: 0.01,
};
const condensate = {
    liquidWaterPath: 1, iceWaterPath: 0, liquidFraction: 1,
    dropletEffectiveRadius: 8, iceEffectiveRadius: 20,
};
const precipitation = {
    kind: "rain", rate: 0.1, terminalVelocity: 6, evaporationDepthKm: 0,
};
const lifecycle = {
    stage: "mature", stageProgress: 0.2, ageSeconds: 30,
    cloudTopRiseRate: 0, condensateTendency: 0, glaciationRate: 0,
    precipitationEfficiency: 0, outflowSpeed: 0,
};
const extent = {
    centerEastKm: 2, centerNorthKm: 5, majorRadiusKm: 2,
    minorRadiusKm: 1, orientation: 0.3, boundaryTransitionKm: 0.1,
};
const system = {
    state: {
        id: "owner-a", extent,
        organization: {
            kind: "point-process", distribution: "poisson-disk",
            meanSpacingKm: 2, minimumSeparationKm: 1, clusterRadiusKm: 3,
            anisotropy: 0.2, orientation: 0.3,
        },
        physical: {
            baseAltitudeKm: 0.8, geometricDepthKm: 1, coverageOktas: 4,
            thermodynamics, kinematics, condensate, precipitation, formation: {},
        },
        lifecycle,
    },
    compiled: {
        geometry: {
            baseAltitudeKm: 0.8, geometricDepthKm: 1,
            elementScaleKm: 1, verticalAspect: 1,
            supportBandFraction: 0.2, extent,
        },
        material: {
            liquidWaterPathKgM2: 1, iceWaterPathKgM2: 0,
            liquidFraction01: 1, extinctionKm: 1,
            singleScatteringAlbedo: 0.999, asymmetryParameter: 0.85,
            liquidEffectiveRadiusMicrons: 8, iceEffectiveRadiusMicrons: 20,
        },
        thermodynamics, kinematics, lifecycle, precipitation,
    },
};
const runtime = {
    signature: "base-runtime", systems: [system],
    packedSystemData: {
        data: new Float32Array([1, 0, 0.1]), count: 1, capacity: 36, dropped: 0,
    },
    legacyFeatureData: new Float32Array([8, 20]),
    morphologyRequests: [], compositionQualifications: [],
};

test("shipping buffers are repacked after V2 owner synchronization", () => {
    const embedded = world.embedCloudRuntimeInCameraWorld(runtime, 0);
    assert.deepEqual([...embedded.packedSystemData.data], [300, 100, 3.5]);
    assert.deepEqual([...embedded.legacyFeatureData], [12, 45]);
    assert.notEqual(embedded.packedSystemData, runtime.packedSystemData);
    assert.equal(world.embedCloudRuntimeInCameraWorld(runtime, 0), embedded,
        "the repacked immutable runtime remains cacheable");
});

test("yaw runtimes also repack after owner pairing", () => {
    const embedded = world.embedCloudRuntimeInCameraWorld(runtime, Math.PI / 2);
    assert.deepEqual([...embedded.packedSystemData.data], [300, 100, 3.5]);
    assert.deepEqual([...embedded.legacyFeatureData], [12, 45]);
});

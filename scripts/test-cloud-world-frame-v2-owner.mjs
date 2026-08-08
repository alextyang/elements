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
        orientationRadians: system.state.extent.orientation,
      },
    })),
    frame: { fingerprint: runtime.signature },
  },
});
`);

const world = await import(
    new URL(`file://${join(temporaryRoot, "cloud-world-frame.mjs")}`)
);

const system = {
    state: {
        id: "owner-a",
        extent: {
            centerEastKm: 2,
            centerNorthKm: 5,
            orientation: 0.3,
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
            kinematics: { windDirection: 0.4 },
        },
    },
    compiled: {
        geometry: {
            extent: {
                centerEastKm: 2,
                centerNorthKm: 5,
                orientation: 0.3,
            },
        },
        kinematics: { windDirection: 0.4 },
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

test("zero-yaw shipping runtime pairs every legacy owner with its exact V2 owner", () => {
    const embedded = world.embedCloudRuntimeInCameraWorld(runtime, 0);
    assert.equal(embedded.systems.length, 1);
    assert.equal(embedded.systems[0].productionRuntimeSignature, runtime.signature);
    assert.equal(embedded.systems[0].productionV2Owner.sourceId, "owner-a");
    assert.equal(
        embedded.systems[0].productionV2Owner,
        embedded.productionV2.bridge.systemsV2[0].owner,
    );
    assert.equal(world.embedCloudRuntimeInCameraWorld(runtime, 0), embedded);
});

test("yaw embedding pairs the transformed owner and keeps the result cached", () => {
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
    assert.equal(world.embedCloudRuntimeInCameraWorld(runtime, yaw), embedded);
});

test("radiative setup consumes the paired owner rather than a global registry", () => {
    const radiativeSource = readFileSync(
        new URL("cloud-radiative-domain.ts", sourceRoot),
        "utf8",
    );
    assert.match(radiativeSource, /\.productionV2Owner \?\? null/);
    assert.match(radiativeSource, /source: v2Owner \? "v2-owner" : "legacy-runtime"/);
    assert.doesNotMatch(radiativeSource, /latestRuntime|cloudShippingV2SystemForOwner/);
});

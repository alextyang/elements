import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-indexed-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-pass-parity",
    "cloud-indexed-physical-sampler",
]) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}
writeFileSync(join(temporaryRoot, "cloud-production-frame.mjs"), "export {};\n");
writeFileSync(join(temporaryRoot, "cloud-weather-engine.mjs"), "export {};\n");
writeFileSync(join(temporaryRoot, "cloud-physical-sample.mjs"), `
export const combineCloudPhysicalSamples = samples => samples[0] ?? ({
 schemaVersion:1,support:0,density:0,gradient:[0,1,0],velocityKmPerSecond:[0,0,0],
 ageSeconds:0,liquidWaterContent:0,iceWaterContent:0,
 liquidEffectiveRadiusMicrons:10,iceEffectiveRadiusMicrons:35,
 precipitationSource:0,turbulence:0,temperatureKelvin:273.15,
 ownerId:1,featureId:0,materialClass:1,signedDistanceKm:Infinity,
 closestSurfaceKm:[0,0,0],inverseCurvatureKm:0,seam01:0,
});
export const validateCloudPhysicalSample = sample => sample.ownerId ? [] :
 [{code:"missing-owner",field:"ownerId",message:"missing"}];
`);
writeFileSync(join(temporaryRoot, "cloud-generated-physical-sampler.mjs"), `
export const calls = [];
const sample = (owner, position) => ({
 schemaVersion:1,support:1,density:.5,gradient:[0,1,0],velocityKmPerSecond:[0,0,0],
 ageSeconds:60,liquidWaterContent:.2,iceWaterContent:.1,
 liquidEffectiveRadiusMicrons:12,iceEffectiveRadiusMicrons:35,
 precipitationSource:0,turbulence:.2,temperatureKelvin:270,
 ownerId:owner.numericId,featureId:0,materialClass:2,signedDistanceKm:-.1,
 closestSurfaceKm:position,inverseCurvatureKm:.5,seam01:0,
});
export const sampleGeneratedCloudOwnerPhysical = (
 owner, _domain, _features, position,
) => {
 calls.push(owner.numericId); return sample(owner, position);
};
export const sampleCloudWeatherSimulationPhysical = (simulation, position) =>
 sample(simulation.owners.find(owner => owner.active), position);
`);

const generated = await import(
    new URL(`file://${join(temporaryRoot, "cloud-generated-physical-sampler.mjs")}`)
);
const indexed = await import(
    new URL(`file://${join(temporaryRoot, "cloud-indexed-physical-sampler.mjs")}`)
);

const simulation = {
    timeSeconds: 60,
    domain: { id: "test-domain" },
    owners: [
        { active:true,numericId:101 },
        { active:true,numericId:202 },
        { active:false,numericId:303 },
    ],
    features: [
        { active:true,numericId:1,parentOwnerNumericId:101 },
    ],
};
const frame = {
    systems: [
        { owner:{ ownerId:101 } },
        { owner:{ ownerId:202 } },
    ],
    spatialIndex: {
        cellSizeKm: 4,
        cells: new Map([
            ["0:0", { x:0,z:0,ownerIndices:[0,1] }],
            ["2:0", { x:2,z:0,ownerIndices:[1] }],
        ]),
        ownerBounds: [
            { ownerId:101,ownerIndex:0,minimumKm:[-2,0,-2],maximumKm:[2,6,2] },
            { ownerId:202,ownerIndex:1,minimumKm:[8,0,-2],maximumKm:[12,6,2] },
        ],
    },
};

test("point sampling evaluates only bounded owners from the occupied cell", () => {
    generated.calls.length = 0;
    const result = indexed.sampleIndexedCloudWeatherPhysicalV1(
        simulation, frame, [0,3,0],
    );
    assert.equal(result.totalOwners, 2);
    assert.equal(result.cellCandidates, 2);
    assert.equal(result.boundedCandidates, 1);
    assert.equal(result.evaluatedOwners, 1);
    assert.deepEqual(generated.calls, [101]);
    assert.equal(result.sample.ownerId, 101);
});

test("empty cells return a valid empty sample without owner evaluation", () => {
    generated.calls.length = 0;
    const result = indexed.sampleIndexedCloudWeatherPhysicalV1(
        simulation, frame, [40,3,40],
    );
    assert.equal(result.cellCandidates, 0);
    assert.equal(result.evaluatedOwners, 0);
    assert.deepEqual(generated.calls, []);
    assert.equal(result.sample.density, 0);
});

test("indexed qualification records parity and actual owner-evaluation reduction", () => {
    generated.calls.length = 0;
    const result = indexed.qualifyIndexedCloudWeatherSamplerV1(
        simulation,
        frame,
        [[0,3,0]],
    );
    assert.equal(result.parity.valid, true);
    assert.equal(result.positions, 1);
    assert.equal(result.fullOwnerEvaluations, 4);
    assert.equal(result.indexedOwnerEvaluations, 3);
    assert.equal(result.reductionFraction, 0.5);
});

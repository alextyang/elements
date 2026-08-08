import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-sample-bounds-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const physicalSource = readFileSync(
    new URL("cloud-physical-sample.ts", sourceRoot),
    "utf8",
);
const physicalOutput = ts.transpileModule(physicalSource, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
writeFileSync(join(temporaryRoot, "cloud-physical-sample.mjs"), physicalOutput);
writeFileSync(join(temporaryRoot, "cloud-state-map.mjs"), "");

const physical = await import(
    new URL(`file://${join(temporaryRoot, "cloud-physical-sample.mjs")}`)
);
const productionSource = readFileSync(
    new URL("cloud-production-physical-sample-wgsl.ts", sourceRoot),
    "utf8",
);

const owner = {
    id: "bounded-owner",
    physical: {
        geometricDepthKm: 2,
        thermodynamics: {
            baseTemperatureKelvin: 281,
            topTemperatureKelvin: 265,
            verticalVelocity: 2,
        },
        kinematics: {
            windSpeed: 12,
            windDirection: 0.4,
            turbulenceIntegralScaleKm: 0.5,
            turbulenceDissipation: 0.1,
        },
        condensate: {
            liquidWaterPath: 500,
            iceWaterPath: 100,
            liquidFraction: 0.8,
            dropletEffectiveRadius: 12,
            iceEffectiveRadius: 40,
        },
        precipitation: { rate: 0 },
    },
    lifecycle: { ageSeconds: 90 },
};
const geometry = {
    support: 1,
    density: 0.8,
    signedDistanceKm: -0.2,
    gradient: [0, 1, 0],
    closestSurfaceKm: [0, 2, 0],
    inverseCurvatureKm: 0.5,
    seam01: 0,
    localAltitudeFraction01: 0.5,
};

test("feature amplification cannot push the authoritative density above one", () => {
    const sample = physical.resolveCloudPhysicalSample({
        owner,
        geometry,
        feature: {
            id: "dense-feature",
            parentOwnerId: owner.id,
            densityMultiplier: 8,
        },
    });
    assert.equal(sample.density, 1);
    assert.deepEqual(physical.validateCloudPhysicalSample(sample), []);
});

test("the canonical empty sample is finite, unowned, and valid", () => {
    const sample = physical.combineCloudPhysicalSamples([]);
    assert.equal(sample.ownerId, 0);
    assert.equal(sample.featureId, 0);
    assert.equal(sample.support, 0);
    assert.equal(sample.density, 0);
    assert.equal(Number.isFinite(sample.signedDistanceKm), true);
    assert.deepEqual(physical.validateCloudPhysicalSample(sample), []);
});

test("packed CPU and WGSL decoders preserve the same bounded-density rule", () => {
    assert.match(productionSource,
        /const density = clamp\(\s*clamp\(geometry\.density\) \* support \* densityMultiplier,/);
    assert.match(productionSource,
        /let density = clamp\(\s*clamp\(geometry\.density, 0\.0, 1\.0\) \* support \* density_multiplier,[\s\S]*?0\.0,[\s\S]*?1\.0,/);
    assert.match(productionSource, /result\.owner_id = 0u;/);
    assert.match(productionSource, /result\.signed_distance_km = 1e20;/);
});

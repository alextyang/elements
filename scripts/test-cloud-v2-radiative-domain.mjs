import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const radiativeSource = readFileSync(new URL(
    "cloud-radiative-domain.ts", sourceRoot,
), "utf8");
const worldSource = readFileSync(new URL("cloud-world-frame.ts", sourceRoot),
    "utf8");
const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-v2-radiative-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const output = ts.transpileModule(radiativeSource, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
writeFileSync(join(temporaryRoot, "cloud-radiative-domain.mjs"), output);
writeFileSync(join(temporaryRoot, "cloud-morphology-modifiers.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-abi-v2.mjs"), "");
writeFileSync(join(temporaryRoot, "cloud-system-runtime.mjs"), "");

const radiative = await import(new URL(
    `file://${join(temporaryRoot, "cloud-radiative-domain.mjs")}`,
));

const legacySystem = {
    layerIndex: 1,
    state: {
        id: "owner-a",
        extent: {
            centerEastKm: 1,
            centerNorthKm: 2,
            majorRadiusKm: 3,
            minorRadiusKm: 4,
            orientation: 0.1,
            boundaryTransitionKm: 0.2,
        },
    },
    compiled: {
        geometry: {
            baseAltitudeKm: 5,
            geometricDepthKm: 6,
        },
    },
};
const v2Owner = {
    sourceId: "owner-a",
    centerKm: [11, 22, 33],
    horizontalRadiusKm: [7, 8, 9],
    orientationRadians: 0.7,
    boundaryTransitionKm: 0.8,
    baseAltitudeKm: 10,
    geometricDepthKm: 12,
};

test("shipping radiative domains use the directly attached V2 owner geometry", () => {
    const input = radiative.cloudRadiativeOwnerInputFromRuntime({
        ...legacySystem,
        productionV2Owner: v2Owner,
    }, 0);
    assert.equal(input.source, "v2-owner");
    assert.equal(input.centerEastKm, 11);
    assert.equal(input.centerNorthKm, 33);
    assert.equal(input.majorRadiusKm, 7);
    assert.equal(input.minorRadiusKm, 9);
    assert.equal(input.orientationRadians, 0.7);
    assert.equal(input.boundaryTransitionKm, 0.8);
    assert.equal(input.baseAltitudeKm, 10);
    assert.equal(input.geometricDepthKm, 12);
    assert.equal(radiative.validateCloudRadiativeOwnerInput(input).valid, true);
});

test("laboratory radiative callers retain an explicit legacy fallback", () => {
    const input = radiative.cloudRadiativeOwnerInputFromRuntime(
        legacySystem,
        0,
    );
    assert.equal(input.source, "legacy-runtime");
    assert.equal(input.centerEastKm, 1);
    assert.equal(input.centerNorthKm, 2);
    assert.equal(input.baseAltitudeKm, 5);
});

test("attached owner divergence fails closed", () => {
    assert.throws(() => radiative.cloudRadiativeOwnerInputFromRuntime({
        ...legacySystem,
        productionV2Owner: { ...v2Owner, sourceId: "wrong-owner" },
    }, 0), /V2 radiative owner mismatch/);
});

test("world-frame owners carry both registry namespace and matched V2 record", () => {
    assert.match(worldSource, /productionRuntimeSignature: string/);
    assert.match(worldSource, /productionV2Owner: CloudOwnerRecordV2 \| null/);
    assert.match(worldSource, /attachOwnerRecords/);
    assert.match(worldSource, /V2 world owner order mismatch/);
    assert.doesNotMatch(radiativeSource,
        /cloudShippingV2SystemFor|latestRuntimeSignature|cameraRangeKm|horizontalFieldOfView/);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const runtimeSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-generative-runtime.ts", import.meta.url),
    "utf8",
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-feature-world-frame-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const helperBlock = runtimeSource.match(
    /export const cloudWeatherFeatureAttachmentWorldKm[\s\S]*?\n};\n\nconst featureToV2/,
)?.[0].replace(/\n\nconst featureToV2$/, "") ?? "";
assert.notEqual(helperBlock, "", "missing feature world-frame helper");
const helperModule = ts.transpileModule(helperBlock, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText;
writeFileSync(join(temporaryRoot, "helper.mjs"), helperModule);
const { cloudWeatherFeatureAttachmentWorldKm } = await import(
    new URL(`file://${join(temporaryRoot, "helper.mjs")}`)
);

const owner = (orientationRadians) => ({
    centerEastKm: 10,
    centerNorthKm: -5,
    baseAltitudeKm: 1,
    geometricDepthKm: 4,
    radiusEastKm: 4,
    radiusNorthKm: 2,
    orientationRadians,
});
const feature = {
    attachmentFraction: [0.5, 0.25, -0.5],
};
const close = (actual, expected) => assert.ok(
    Math.abs(actual - expected) <= 1e-9,
    `${actual} != ${expected}`,
);

test("feature attachments include owner translation in the Earth-local frame", () => {
    const result = cloudWeatherFeatureAttachmentWorldKm(feature, owner(0));
    close(result[0], 12);
    close(result[1], 4);
    close(result[2], -6);
});

test("feature attachments rotate with their persistent parent owner", () => {
    const result = cloudWeatherFeatureAttachmentWorldKm(
        feature,
        owner(Math.PI / 2),
    );
    close(result[0], 11);
    close(result[1], 4);
    close(result[2], -3);
});

test("V2 compilation uses only the shared world-frame helper", () => {
    const featureBlock = runtimeSource.match(
        /const featureToV2[\s\S]*?\n\}\);\n\nconst eventToV2/,
    )?.[0] ?? "";
    assert.match(featureBlock,
        /attachmentKm: cloudWeatherFeatureAttachmentWorldKm\(feature, owner\)/);
    assert.doesNotMatch(featureBlock,
        /attachmentKm:\s*\[\s*feature\.attachmentFraction/);
});

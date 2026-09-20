import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

import { transpileCloudPreviewModuleClosure } from "./lib/cloud-preview-scenarios.mjs";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-production-camera-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
transpileCloudPreviewModuleClosure({
    sourceRoot: fileURLToPath(new URL("../components/backgrounds/sky/", import.meta.url)),
    temporaryRoot,
    rootModuleNames: ["weather-cloud-photograph-benchmark"],
});
// Camera tests keep real astronomy, including the lazy weather matrix's date
// resolution. The catalogue loader's zero-Sun stub is sufficient only for IDs.
const require = createRequire(import.meta.url);
writeFileSync(join(temporaryRoot, "suncalc.mjs"),
    `export { default } from ${JSON.stringify(pathToFileURL(require.resolve("suncalc")).href)};\n`);
const load = (name) => import(pathToFileURL(join(temporaryRoot, `${name}.mjs`)).href);
const [cameraModule, photographs, matrix] = await Promise.all([
    load("weather-cloud-photograph-benchmark"),
    load("cloud-photograph-benchmark"),
    load("weather-qualification-matrix"),
]);
const {
    DEFAULT_PRODUCTION_PERSPECTIVE_ID,
    applyProductionPerspectiveToCloudPhotographCase,
    productionPerspectiveCameraSignature,
    resolveProductionPerspectiveCamera,
    resolveWeatherCloudPhotographCase,
} = cameraModule;

const withoutObserver = ({ observerAltitude: _observer, ...composition } = {}) =>
    composition;
const withoutCamera = ({
    viewAzimuth: _azimuth, viewElevation: _elevation,
    horizontalFov: _horizontal, verticalFov: _vertical,
    cloudPerspective: _cloudPerspective, cloudEditorialRegime: _cloudRegime,
    perspective: _perspective, regime: _regime, label: _label,
    composition, ...weather
}) => ({ ...weather, composition: withoutObserver(composition) });

const assertProductionCamera = (original) => {
    const snapshot = structuredClone(original);
    const updated = applyProductionPerspectiveToCloudPhotographCase(
        original, DEFAULT_PRODUCTION_PERSPECTIVE_ID,
    );
    const camera = resolveProductionPerspectiveCamera(DEFAULT_PRODUCTION_PERSPECTIVE_ID);
    for (const value of [updated.environment, updated.preview]) {
        assert.equal(value.viewAzimuth, 55, original.id);
        assert.equal(value.viewElevation, camera.viewElevation, original.id);
        assert.equal(value.horizontalFov, camera.horizontalFov, original.id);
        assert.equal(value.verticalFov, camera.verticalFov, original.id);
        assert.equal(value.composition.observerAltitude, camera.observerAltitude, original.id);
    }
    assert.deepEqual(withoutCamera(updated.environment), withoutCamera(original.environment),
        `${original.id}: preserve environment astronomy and atmosphere`);
    assert.deepEqual(withoutCamera(updated.preview), withoutCamera(original.preview),
        `${original.id}: preserve preview astronomy, lighting, grading, renderer and weather`);
    assert.strictEqual(updated.preview.cloudScene, original.preview.cloudScene, original.id);
    assert.deepEqual(original, snapshot, `${original.id}: do not mutate the native case`);
};

test("the production signature includes one canonical 55-degree heading", () => {
    assert.equal(productionPerspectiveCameraSignature(DEFAULT_PRODUCTION_PERSPECTIVE_ID),
        "55|27|64|43.52|0.02|natural|auto");
    for (const nativePerspective of matrix.WEATHER_QUALIFICATION_PERSPECTIVES) {
        assert.equal(resolveProductionPerspectiveCamera(nativePerspective.id).viewAzimuth, 55);
        assert.equal(productionPerspectiveCameraSignature(nativePerspective.id),
            productionPerspectiveCameraSignature(DEFAULT_PRODUCTION_PERSPECTIVE_ID));
    }
});

test("all photographic environments use the same approved production camera", () => {
    const cases = photographs.CLOUD_PHOTOGRAPH_CASES;
    assert.ok(new Set(cases.map(({ environment }) => environment.viewAzimuth)).size > 1,
        "native environment headings must differ for this regression to be exercised");
    for (const benchmark of cases) assertProductionCamera(benchmark);
});

test("every lazy weather environment preserves its astronomy under the canonical camera", () => {
    for (const environment of matrix.WEATHER_QUALIFICATION_ENVIRONMENTS) {
        const target = matrix.WEATHER_QUALIFICATION_TARGETS.find(({ environments }) =>
            environments.includes(environment.id));
        assert.ok(target, `${environment.id}: environment has a qualification target`);
        const benchmark = resolveWeatherCloudPhotographCase(
            `${target.id}--${environment.id}--${target.perspectives[0]}`,
        );
        assert.ok(benchmark, environment.id);
        assertProductionCamera(benchmark);
    }
});

test("unapproved and diagnostic perspectives keep their original camera", () => {
    const benchmark = photographs.CLOUD_PHOTOGRAPH_CASES.find(({ environment }) =>
        environment.viewAzimuth !== 55);
    assert.ok(benchmark);
    for (const perspectiveId of [undefined, null, "", "horizon-wide", "near-uplook"]) {
        assert.strictEqual(applyProductionPerspectiveToCloudPhotographCase(
            benchmark, perspectiveId,
        ), benchmark);
    }
});

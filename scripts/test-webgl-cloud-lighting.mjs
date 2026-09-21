import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
    atmosphereTransmittanceToSpace,
    createPhysicalAtmosphereState,
} from "../components/backgrounds/sky/physical-atmosphere.ts";
import {
    WEBGL_CLOUD_TRANSMITTANCE_LAYOUT,
    buildWebGlCloudTransmittanceLut,
    createWebGlCloudLighting,
    sampleWebGlCloudTransmittance,
    webGlCloudMoonSourceIrradiance,
} from "../components/backgrounds/sky/webgl-cloud-lighting.ts";
import {
    CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION,
    cloudPlateManifestSupportsPhysicalPlayback,
    cloudPlateOperatorSupportsLiveRelighting,
    validateCloudPlateAssetManifest,
} from "../components/backgrounds/sky/cloud-plate-scene.ts";
import { cloudPlateCaptureResponseConvention } from "./lib/cloud-plate-pipeline.mjs";

const state = createPhysicalAtmosphereState();
const lut = buildWebGlCloudTransmittanceLut(state);
const sine = (degrees) => Math.sin(degrees * Math.PI / 180);
const reference = (atmosphere, height, degrees) =>
    atmosphereTransmittanceToSpace(
        atmosphere,
        [0, 0, atmosphere.bottomRadiusKm + height],
        [Math.cos(degrees * Math.PI / 180), 0, sine(degrees)],
        512,
    );
const lookup = (height, degrees) =>
    sampleWebGlCloudTransmittance(state, lut, height, sine(degrees));
const near = (actual, expected, tolerance = 0.002) =>
    actual.forEach((channel, index) => assert.ok(
        Math.abs(channel - expected[index]) < tolerance,
        `${actual} differs from ${expected} at channel ${index}`,
    ));

test("cloud lookup agrees with direct physical atmosphere integration", () => {
    assert.equal(lut.width, WEBGL_CLOUD_TRANSMITTANCE_LAYOUT.width);
    assert.equal(lut.height, WEBGL_CLOUD_TRANSMITTANCE_LAYOUT.height);
    assert.equal(lut.opticalDepth.byteLength, 128 * 64 * 16);
    for (const altitude of [0.001, 0.5, 2, 5, 12, 18, 82]) {
        for (const elevation of [-5, -2, -1, 0, 0.5, 2, 5, 15, 45, 90]) {
            near(lookup(altitude, elevation),
                reference(state, altitude, elevation));
        }
    }
});

test("vacuum transmits all unoccluded direct energy and still respects Earth", () => {
    const vacuum = {
        ...state,
        rayleighScatteringKm: [0, 0, 0],
        mieScatteringKm: [0, 0, 0],
        mieAbsorptionKm: [0, 0, 0],
        stratosphericMieScatteringKm: [0, 0, 0],
        stratosphericMieAbsorptionKm: [0, 0, 0],
        ozoneAbsorptionKm: [0, 0, 0],
    };
    const vacuumLut = buildWebGlCloudTransmittanceLut(vacuum);
    for (const altitude of [0.01, 1, 12]) {
        for (const elevation of [0, 2, 45, 90]) {
            assert.deepEqual(sampleWebGlCloudTransmittance(
                vacuum, vacuumLut, altitude, sine(elevation),
            ), [1, 1, 1]);
        }
    }
    assert.deepEqual(sampleWebGlCloudTransmittance(
        vacuum, vacuumLut, 0.5, sine(-2),
    ), [0, 0, 0]);
});

test("low Sun is dimmer and redder without tinting cloud material", () => {
    const overhead = lookup(2, 60);
    const sunset = lookup(2, 2);
    sunset.forEach((channel, index) => assert.ok(channel < overhead[index]));
    assert.ok(sunset[0] / sunset[2] > overhead[0] / overhead[2] * 2);
    assert.ok(overhead.every((channel) => channel > 0.7 && channel < 1));
});

test("high cloud remains Sun-lit after low cloud enters spherical Earth shadow", () => {
    assert.deepEqual(lookup(0.5, -2), [0, 0, 0]);
    const highCloud = lookup(12, -2);
    assert.ok(highCloud[0] > 0.1);
    assert.ok(highCloud[0] > highCloud[2] * 2);
    near(highCloud, reference(state, 12, -2));
    // The same source tests local zenith at the actual displaced sample.
    // Points 80 km toward/away from the Sun do not share the observer horizon.
    const angularOffset = 80 / (state.bottomRadiusKm + 2) * 180 / Math.PI;
    assert.deepEqual(lookup(2, -1.5 - angularOffset), [0, 0, 0]);
    assert.ok(lookup(2, -1.5 + angularOffset)[0] > 0);
});

test("twilight transports both sources at the sample without duplicating ambient", () => {
    // A deep cloud can simultaneously have a sunlit crown and a moonlit base.
    // Selecting one source at its midpoint cannot represent both regions.
    assert.deepEqual(lookup(1, -2), [0, 0, 0]);
    assert.ok(lookup(7, -2)[0] > 0);
    assert.ok(lookup(1, 30).every((value) => value > 0.5));
    const shader = readFileSync(new URL(
        "../components/backgrounds/sky/webgl-cloud-shader.ts", import.meta.url), "utf8");
    assert.doesNotMatch(shader, /moon_dominant|source_probe/);
    assert.match(shader, /cloud_source_transmittance\(\s*point, sun_direction/s);
    assert.match(shader, /cloud_source_transmittance\(\s*point, moon_direction/s);
    assert.match(shader, /luminance \+= cloud_scattering/);
    assert.match(shader, /u_cloud_ambient, u_cloud_ground_light, 1\.0/);
    assert.match(shader, /vec3\(0\.0\), vec3\(0\.0\), 0\.0\)/);
    assert.match(shader, /neutral_sky \*= ambient_weight/);
    assert.match(shader, /neutral_ground \*= ambient_weight/);
});

test("Moon source preserves WebGL units but removes both observer attenuations", () => {
    const source = webGlCloudMoonSourceIrradiance(0.35, -18, 1.4);
    near(source, [0.95 * 0.35 * 1.4, 0.95 * 0.35 * 1.4,
        0.95 * 0.35 * 1.4], 1e-12);
    const atmosphereAtCloud = lookup(12, 2);
    const onceAttenuated = source.map((channel, index) =>
        channel * atmosphereAtCloud[index]);
    const exactAtCloud = reference(state, 12, 2);
    near(onceAttenuated, exactAtCloud.map((value, index) =>
        value * source[index]));
    const observerTransmission = lookup(0.001, 2);
    const twiceAttenuated = onceAttenuated.map((value, index) =>
        value * observerTransmission[index]);
    assert.ok(onceAttenuated[2] > twiceAttenuated[2] * 3);
    assert.deepEqual(webGlCloudMoonSourceIrradiance(1, -18, 0), [0, 0, 0]);
    assert.deepEqual(webGlCloudMoonSourceIrradiance(0, -18, 1), [0, 0, 0]);
    assert.deepEqual(webGlCloudMoonSourceIrradiance(1, 20, 1), [0, 0, 0]);
    assert.deepEqual(webGlCloudMoonSourceIrradiance(1, -18, 1), [0.95, 0.95, 0.95]);
});

test("cloud lookup responds to the same aerosol and ozone composition as sky", () => {
    const polluted = createPhysicalAtmosphereState({
        aerosolType: "urban", aerosolOpticalDepth550: 0.7,
        ozoneColumnDobson: 450,
    });
    const pollutedLut = buildWebGlCloudTransmittanceLut(polluted);
    const transmitted = sampleWebGlCloudTransmittance(
        polluted, pollutedLut, 0.5, sine(12),
    );
    const clean = lookup(0.5, 12);
    transmitted.forEach((channel, index) => assert.ok(channel < clean[index]));
    near(transmitted, reference(polluted, 0.5, 12));
});

test("WebGL lookup retains one texture and invalidates only optical state", () => {
    const calls = [];
    const gl = new Proxy({
        createTexture: () => "texture",
        getUniformLocation: (_program, name) => name,
    }, {
        get(target, key) {
            if (key in target) return target[key];
            if (/^[A-Z_0-9]+$/.test(key)) return key === "TEXTURE0" ? 100 : key;
            return (...args) => calls.push([key, ...args]);
        },
    });
    const resource = createWebGlCloudLighting(gl, "program");
    resource.updateAndBind(state);
    resource.updateAndBind({ ...state, observerAltitudeKm: 5 });
    resource.updateAndBind({
        ...state, grade: { ...state.grade, exposureCompensationEv: 1 },
    });
    assert.equal(calls.filter(([name]) => name === "texImage2D").length, 2,
        "one neutral allocation and one optical upload, independent of observer/exposure");
    resource.updateAndBind({ ...state, ozoneAbsorptionKm: [0, 0, 0] });
    assert.equal(calls.filter(([name]) => name === "texImage2D").length, 3);
    assert.ok(calls.some(([name, unit]) => name === "activeTexture" && unit === 104));
    resource.updateAndBind(undefined);
    assert.deepEqual(calls.at(-1), ["uniform3f", "u_cloud_atmosphere", 0, 0, 0]);
    resource.dispose();
    assert.deepEqual(calls.at(-1), ["deleteTexture", "texture"]);
});

const plane = (channel) => ({
    channel, url: `/generated/cloud-plates/example/${channel}.rgba16f`,
    sha256: "a".repeat(64), width: 1, height: 1,
    format: "rgba16float-le", byteLength: 8,
});
const legacyOperator = {
    groupId: "cloud", firstDepthKm: 2,
    radiance: plane("radiance"), transmittance: plane("transmittance"),
    directResponse: plane("direct-response"),
    skyResponse: plane("sky-response"),
    groundResponse: plane("ground-response"),
};
const fixedOperator = {
    ...legacyOperator,
    responseConvention: CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION,
};
const manifestFor = (operator) => ({
    schemaVersion: 1, sceneId: "example", backend: "webgl2-local-gpu",
    sceneHash: "a".repeat(64), definitionHash: "b".repeat(64),
    rendererHash: "c".repeat(64), status: "complete",
    fixedCamera: { perspectiveId: "oblique-natural" },
    groups: [{ id: "cloud" }], completedFrames: 1, totalFrames: 1,
    render: { width: 1, height: 1, minimumTransportSamples: 32,
        convergenceTarget: 0.01 },
    frames: [{ index: 0, transportSamples: 64, convergenceDelta: 0.001,
        operators: [operator] }],
});

test("atmosphere-baked plate responses cannot use legacy live source weights", () => {
    assert.equal(cloudPlateOperatorSupportsLiveRelighting(legacyOperator), true);
    assert.equal(cloudPlateOperatorSupportsLiveRelighting(fixedOperator), false);
    assert.equal(cloudPlateOperatorSupportsLiveRelighting({
        ...legacyOperator, responseConvention: "unknown",
    }), false);
    assert.equal(cloudPlateOperatorSupportsLiveRelighting({
        ...legacyOperator, directResponse: undefined,
    }), false);
    assert.deepEqual(validateCloudPlateAssetManifest(manifestFor(fixedOperator)), []);
    assert.deepEqual(validateCloudPlateAssetManifest(manifestFor(legacyOperator)), []);
    assert.ok(validateCloudPlateAssetManifest(manifestFor({
        ...fixedOperator, responseConvention: "unknown",
    })).some((failure) => failure.startsWith("invalid-response-convention:")));
    assert.ok(validateCloudPlateAssetManifest({
        ...manifestFor(fixedOperator), backend: "native-metal",
    }).some((failure) => failure.startsWith("invalid-response-convention:")));
});

test("physical playback refuses fixed WebGL energy in any frame without changing legacy acceptance", () => {
    assert.equal(cloudPlateManifestSupportsPhysicalPlayback(manifestFor(legacyOperator)), true);
    assert.equal(cloudPlateManifestSupportsPhysicalPlayback(manifestFor(fixedOperator)), false);
    const mixed = manifestFor(legacyOperator);
    mixed.frames.push({ ...mixed.frames[0], index: 1, operators: [fixedOperator] });
    assert.equal(cloudPlateManifestSupportsPhysicalPlayback(mixed), false);
    assert.equal(cloudPlateManifestSupportsPhysicalPlayback(manifestFor({
        ...legacyOperator, responseConvention: "unknown",
    })), false);
});

test("actual physical manifest loader rejects incompatible energy before loading planes and clears old history", async () => {
    const source = readFileSync(new URL(
        "../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url), "utf8");
    const start = source.indexOf("const requestCloudPlateManifest = async (");
    const end = source.indexOf("\n            let intervalLowMiddle", start);
    assert.ok(start >= 0 && end > start);
    const loader = ts.transpileModule(source.slice(start, end), {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const fixture = (manifest) => {
        const canvas = { dataset: { cloudPlateScene: "old", cloudPlateSceneHash: "old", cloudPlateExtent: "old" } };
        const loads = [];
        const harness = runInNewContext(`(() => {
            let disposed = false;
            let cloudPlateRequestSerial = 0;
            let cloudPlatePlaybackState = { old: true };
            let cloudPlatePlaybackActive = true;
            let cloudPlateRelightable = true;
            let cloudPlateBlend = 0.7;
            let cloudTargetsNeedClear = false;
            let historyValid = true;
            let temporalNeedsClear = false;
            ${loader}
            return { request: requestCloudPlateManifest, state: () => ({
                cloudPlatePlaybackState, cloudPlatePlaybackActive,
                cloudPlateRelightable, cloudPlateBlend, cloudTargetsNeedClear,
                historyValid, temporalNeedsClear,
            }) };
        })()`, {
            canvas, URL, Date,
            window: { location: { href: "http://127.0.0.1:3000/" } },
            console: { warn() {} },
            fetch: async () => ({ ok: true, json: async () => manifest }),
            validateCloudPlateAssetManifest,
            cloudPlateManifestSupportsPhysicalPlayback,
            loadCloudPlatePair: async (...args) => loads.push(args),
        });
        return { canvas, loads, ...harness };
    };
    const rejected = fixture(manifestFor(fixedOperator));
    await rejected.request("/fixed-plate.json", 10);
    assert.equal(rejected.loads.length, 0);
    assert.equal(rejected.canvas.dataset.cloudPlatePlayback, "incompatible-radiance-domain");
    assert.equal(rejected.canvas.dataset.cloudPlateScene, undefined);
    assert.deepEqual({ ...rejected.state() }, {
        cloudPlatePlaybackState: null, cloudPlatePlaybackActive: false,
        cloudPlateRelightable: false, cloudPlateBlend: 0,
        cloudTargetsNeedClear: true, historyValid: false, temporalNeedsClear: true,
    });
    const legacy = fixture(manifestFor(legacyOperator));
    await legacy.request("/legacy-plate.json", 10);
    assert.equal(legacy.loads.length, 1);
    assert.equal(legacy.state().cloudPlatePlaybackState.manifest.frames[0].operators[0], legacyOperator);
});

test("new WebGL publication requires the exporter's exact response convention", () => {
    assert.equal(cloudPlateCaptureResponseConvention("webgl2-local-gpu", {
        cloudPlateExport: {
            responseConvention: CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION,
        },
    }), CLOUD_PLATE_FIXED_LIGHTING_RESPONSE_CONVENTION);
    for (const metrics of [{}, { cloudPlateExport: {} }, {
        cloudPlateExport: { responseConvention: "unknown" },
    }]) {
        assert.throws(() => cloudPlateCaptureResponseConvention(
            "webgl2-local-gpu", metrics,
        ), /refresh the renderer and recapture/);
    }
    assert.equal(cloudPlateCaptureResponseConvention("native-metal", {}), undefined);
    assert.equal(cloudPlateCaptureResponseConvention("blender-cycles-metal", {}), undefined);
});

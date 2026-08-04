import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import SunCalc from "suncalc";
import ts from "typescript";

const modules = new Map();
const compileCommonJs = (relativePath) => {
    const requested = new URL(relativePath, import.meta.url);
    const url = existsSync(requested) ? requested : [".ts", ".tsx", ".js", ".mjs"]
        .map((extension) => new URL(`${requested.href}${extension}`))
        .find((candidate) => existsSync(candidate));
    if (!url) throw new Error(`Unable to resolve ${requested.pathname}`);
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const source = readFileSync(url, "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: url.pathname,
    }).outputText;
    const moduleObject = { exports: {} };
    modules.set(url.href, moduleObject);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (!specifier.startsWith(".")) throw new Error(`Unexpected import ${specifier}`);
            return compileCommonJs(new URL(specifier, url).pathname);
        },
    );
    return moduleObject.exports;
};

const cloudLight = compileCommonJs(
    "../components/backgrounds/sky/cloud-light-volume.ts",
);
const cloudLightWgsl = compileCommonJs(
    "../components/backgrounds/sky/cloud-light-volume-wgsl.ts",
);
const cloudLightRuntime = compileCommonJs(
    "../components/backgrounds/sky/cloud-light-volume-runtime.ts",
);
const cloudSystemRuntime = compileCommonJs(
    "../components/backgrounds/sky/cloud-system-runtime.ts",
);
const cloudPhotographBenchmark = compileCommonJs(
    "../components/backgrounds/sky/cloud-photograph-benchmark.ts",
);
const cloudMacroAtlas = compileCommonJs(
    "../components/backgrounds/sky/cloud-volume-atlas.ts",
);
const cloudMorphology = compileCommonJs(
    "../components/backgrounds/sky/cloud-morphology-modifiers.ts",
);

const near = (actual, expected, tolerance, label = "value") => assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} within ${tolerance}`,
);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

test("internal diffusion faces require selected reciprocal sibling halos", () => {
    const exterior = cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR;
    const internal = cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL;
    const tile = (grid, faceBoundaryKind) => ({
        ownerIndex: 3,
        grid,
        counts: [2, 1, 1],
        faceBoundaryKind,
    });
    const left = tile([0, 0, 0], [
        internal, exterior, exterior, exterior, exterior, exterior,
    ]);
    const right = tile([1, 0, 0], [
        exterior, internal, exterior, exterior, exterior, exterior,
    ]);

    const complete = cloudLightRuntime
        .qualifyCloudLightVolumeInternalHaloTopology([left, right]);
    assert.equal(complete.valid, true, complete.reasons.join(", "));
    assert.deepEqual(complete.invalidOwnerIndices, []);

    const missing = cloudLightRuntime
        .qualifyCloudLightVolumeInternalHaloTopology([left]);
    assert.equal(missing.valid, false);
    assert.deepEqual(missing.invalidOwnerIndices, [3]);
    assert.match(missing.reasons[0], /face-0-missing-reciprocal-internal-halo/);

    const nonReciprocal = cloudLightRuntime
        .qualifyCloudLightVolumeInternalHaloTopology([
            left,
            tile([1, 0, 0], [
                exterior, exterior, exterior, exterior, exterior, exterior,
            ]),
        ]);
    assert.equal(nonReciprocal.valid, false);
    assert.deepEqual(nonReciprocal.invalidOwnerIndices, [3]);
});

test("production plan has explicit WebGPU memory and dispatch ceilings", () => {
    const plan = cloudLight.createCloudLightVolumePlan();
    assert.equal(plan.validation.valid, true, plan.validation.reasons.join(", "));
    assert.deepEqual(plan.atlasDimensions, [48, 32, 288]);
    assert.deepEqual(plan.packedAtlasDimensions, [48, 32, 1_728]);
    assert.equal(plan.memory.voxelCount, 442_368);
    assert.equal(plan.memory.mipVoxelCount, 505_440);
    assert.equal(plan.memory.mediumBytes, 8_087_040);
    assert.equal(plan.memory.directTransmittanceBytes, 8_087_040);
    assert.equal(plan.memory.fluenceScratchBytes, 4_043_520);
    assert.equal(plan.memory.lightningTransferBytes, 8_087_040);
    assert.equal(plan.memory.packedViewBankBytes, 12_130_560);
    assert.equal(plan.memory.totalTextureBytes, 52_565_760);
    assert.deepEqual(plan.dispatch.materializeWorkgroups, [12, 8, 12]);
    assert.deepEqual(plan.dispatch.sourceMaterializeWorkgroupsPerSource,
        [12, 8, 48]);
    assert.deepEqual(plan.dispatch.directWorkgroupsPerSource, [6, 1, 6]);
    assert.equal(plan.dispatch.exactMediumQueriesPerRefresh, 1_327_104);
    assert.equal(plan.dispatch.maximumBoundaryMediumQueriesPerBrick, 4_608);
    assert.deepEqual(plan.dispatch.multigridWorkgroupsByLevel, [
        [12, 8, 12], [6, 4, 6], [3, 2, 3], [2, 1, 2],
    ]);
    assert.equal(plan.dispatch.fineSmoothingVoxelUpdatesPerCycle, 368_640);
    assert.equal(plan.dispatch.coarseSmoothingVoxelUpdatesPerCycle, 54_144);
    assert.equal(plan.config.postSmoothIterations, 3,
        "odd post-smoothing must publish without a copy-only pass");
    assert.equal(plan.config.relaxation, 0.92);

    const slabUniform = cloudLight.packCloudLightVolumeUniforms(
        plan, 6, 3, 16, 8);
    const slabView = new DataView(
        slabUniform.buffer, slabUniform.byteOffset, slabUniform.byteLength);
    assert.deepEqual([0, 1, 2, 3].map((index) =>
        slabView.getUint32(16 + index * 4, true)), [6, 3, 16, 8]);

    assert.equal(cloudLight.createCloudLightVolumePlan({
        dimensions: [128, 128, 128], maxBricks: 32,
    }).validation.valid, false, "an atlas deeper than the 2048 core limit is rejected");
});

const blackEnvironment = {
    skyLobes: [],
    localUpDirection: [0, 1, 0],
    quadratureSampleCount: 256,
};
const sources = [
    {
        kind: "sun", directionToSource: [0.3, 0.9, -0.2],
        atmosphereTransportedIrradianceRgb: [1, 0.9, 0.8], active: true,
    },
    {
        kind: "moon", directionToSource: [-0.8, 0.4, 0.1],
        atmosphereTransportedIrradianceRgb: [0.01, 0.015, 0.03], active: true,
    },
];

test("direct source scheduling respects planet visibility and negligible daylight Moon", () => {
    const directionAtElevation = (degrees) => {
        const angle = degrees * Math.PI / 180;
        return [0, Math.sin(angle), Math.cos(angle)];
    };
    const support = [{ centerWorldKm: [0, 6_381, 0], radiusKm: 2 }];
    const solarToa = [3.2, 3.1, 3.0];
    const lunarToa = [7.5e-6, 7.2e-6, 6.8e-6];
    const daytime = cloudLightRuntime.resolveCloudLightVolumeSourceActivity([
        {
            kind: "sun", directionToSource: directionAtElevation(35),
            atmosphereTransportedIrradianceRgb: solarToa, active: true,
        },
        {
            kind: "moon", directionToSource: directionAtElevation(50),
            atmosphereTransportedIrradianceRgb: lunarToa, active: true,
        },
    ], support);
    assert.equal(daytime[0].active, true);
    assert.equal(daytime[1].active, false,
        "a ~2.4e-6 solar-ratio Moon must not build a daytime Beer volume");
    assert.deepEqual(daytime[0].atmosphereTransportedIrradianceRgb, solarToa);
    assert.deepEqual(daytime[1].atmosphereTransportedIrradianceRgb, lunarToa,
        "activity metadata must not pre-attenuate or erase lunar TOA radiometry");

    const twilight = cloudLightRuntime.resolveCloudLightVolumeSourceActivity([
        {
            kind: "sun", directionToSource: directionAtElevation(2),
            atmosphereTransportedIrradianceRgb: solarToa, active: true,
        },
        {
            kind: "moon", directionToSource: directionAtElevation(35),
            atmosphereTransportedIrradianceRgb: lunarToa, active: true,
        },
    ], support);
    assert.equal(twilight[1].active, true,
        "low-Sun atmosphere attenuation can make the Moon relevant at twilight");

    const belowObserverHorizon =
        cloudLightRuntime.resolveCloudLightVolumeSourceActivity([{
            kind: "sun", directionToSource: directionAtElevation(-2),
            atmosphereTransportedIrradianceRgb: solarToa, active: true,
        }], support);
    assert.equal(belowObserverHorizon[0].active, true,
        "high cloud support can see a disc below the sea-level horizon");

    const absent = cloudLightRuntime.resolveCloudLightVolumeSourceActivity([{
        kind: "sun", directionToSource: directionAtElevation(-12),
        atmosphereTransportedIrradianceRgb: solarToa, active: true,
    }], support);
    assert.equal(absent[0].active, false);

    const negligible = cloudLightRuntime.resolveCloudLightVolumeSourceActivity([{
        kind: "moon", directionToSource: directionAtElevation(45),
        atmosphereTransportedIrradianceRgb: [1e-12, 1e-12, 1e-12], active: true,
    }], support);
    assert.equal(negligible[0].active, false);

    const reversedPacked = cloudLight.packCloudLightVolumeSources([
        { ...daytime[1], active: false },
        { ...daytime[0], active: true },
    ]);
    assert.equal(reversedPacked[3], 1,
        "Sun activity must occupy fixed GPU source slot zero");
    assert.equal(reversedPacked[11], 0,
        "Moon activity must occupy fixed GPU source slot one");
});

test("owner bricks create independent source-aligned Beer domains", () => {
    const brick = cloudLight.createCloudLightVolumeBrick({
        ownerIndex: 7,
        centerKm: [12, 3, -4],
        halfExtentKm: [1.44, 0.8, 1.44],
        axes: [[0.8, 0, -0.6], [0, 1, 0], [0.6, 0, 0.8]],
        sources,
        environment: blackEnvironment,
        maximumExtinctionPerKm: 20,
    });
    assert.equal(brick.validation.valid, true, brick.validation.reasons.join(", "));
    sources.forEach((source, index) => near(
        dot(brick.directTransforms[index].axes[1], source.directionToSource) /
            Math.hypot(...source.directionToSource), 1, 1e-12,
        `source ${index} depth axis`,
    ));
    const ownerAxes = [[0.8, 0, -0.6], [0, 1, 0], [0.6, 0, 0.8]];
    const ownerCorners = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        ownerCorners.push([0, 1, 2].map((component) =>
            [12, 3, -4][component] +
            ownerAxes[0][component] * 1.44 * x +
            ownerAxes[1][component] * 0.8 * y +
            ownerAxes[2][component] * 1.44 * z));
    }
    for (const transform of brick.directTransforms) {
        for (const axisIndex of [0, 2]) {
            const projections = ownerCorners.map((corner) =>
                dot(corner, transform.axes[axisIndex]));
            const originProjection = dot(
                transform.originKm, transform.axes[axisIndex]);
            const cellSize = transform.cellSizeKm[axisIndex];
            near((Math.min(...projections) - originProjection) / cellSize,
                cloudLight.CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS, 1e-10,
                `source transverse axis ${axisIndex} leading guard`);
            near((Math.max(...projections) - originProjection) / cellSize,
                cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.dimensions[axisIndex] -
                    cloudLight.CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
                1e-10, `source transverse axis ${axisIndex} trailing guard`);
        }
    }
    const resolution = cloudLight.evaluateCloudLightVolumeResolution(brick, 0.05);
    near(resolution.maximumCellToMeanFreePathRatio, 1.2, 1e-12);
    assert.equal(resolution.resolvesDenseTransport, true,
        "60 m cells resolve a 50 m dense-cloud mean free path within the 1.5x contract");

    const packed = cloudLight.packCloudLightVolumeBricks([brick]);
    assert.equal(packed.data.length, 6 * 76);
    assert.equal(packed.data[48], 7);
    assert.equal(packed.data[49], 0);
    assert.equal(packed.data[51], 1);
    assert.equal(brick.samplingFlags, 0,
        "sampling reductions must be explicit rather than inferred");
    assert.deepEqual([55, 59, 63, 67, 71, 75].map((offset) =>
        packed.data[offset]), Array(6).fill(1));
    near(packed.data[50], 20 * Math.hypot(0.06, 0.05, 0.06), 1e-6);

    const view = cloudLight.packCloudLightVolumeViewUniforms(packed.data, 1);
    assert.equal(view.byteLength, 32 + 6 * 76 * 4);
    const header = new DataView(view.buffer, view.byteOffset, view.byteLength);
    assert.equal(header.getUint32(0, true), 1);
    assert.equal(header.getUint32(4, true), 1);
    assert.equal(header.getUint32(12, true), 0);
    assert.equal(header.getUint32(28, true), 288);

    const secondBankView = cloudLight.packCloudLightVolumeViewUniforms(
        packed.data, 1, undefined, 1, 0b101, [2, 3]);
    const secondBankHeader = new DataView(secondBankView.buffer,
        secondBankView.byteOffset, secondBankView.byteLength);
    assert.equal(secondBankHeader.getUint32(12, true), 864);
    assert.equal(secondBankHeader.getUint32(16, true), 0b101);
    assert.equal(secondBankHeader.getUint32(20, true), 2);
    assert.equal(secondBankHeader.getUint32(24, true), 3);
});

test("direct-field qualification checks every active stable source transform", () => {
    const elongated = cloudLight.createCloudLightVolumeBrick({
        ownerIndex: 4,
        centerKm: [0, 4, 0],
        halfExtentKm: [0.3, 0.2, 0.3],
        directDomain: {
            centerKm: [0, 4, 0],
            halfExtentKm: [4, 0.2, 0.2],
        },
        sources: [
            {
                kind: "sun", directionToSource: [1, 0, 0],
                atmosphereTransportedIrradianceRgb: [1, 1, 1], active: true,
            },
            {
                kind: "moon", directionToSource: [0, 1, 0],
                atmosphereTransportedIrradianceRgb: [0.01, 0.01, 0.01], active: true,
            },
        ],
        environment: blackEnvironment,
        maximumExtinctionPerKm: 4,
    });
    const bothActive = cloudLight.evaluateCloudLightVolumeDirectFieldResolution(
        elongated,
        [
            {
                kind: "sun", directionToSource: [1, 0, 0],
                atmosphereTransportedIrradianceRgb: [1, 1, 1], active: true,
            },
            {
                kind: "moon", directionToSource: [0, 1, 0],
                atmosphereTransportedIrradianceRgb: [0.01, 0.01, 0.01], active: true,
            },
        ],
        4,
    );
    assert.equal(bothActive.activeSourceMask, 0b11);
    assert.equal(bothActive.qualifiedSourceMask, 0b10,
        "the resolved Moon transform must not conceal the coarse Sun transform");
    assert.equal(bothActive.qualifiesActiveSources, false);
    assert.ok(bothActive.sourceMaximumCellOpticalDepth[0] >
        cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH);
    assert.ok(bothActive.sourceMaximumCellOpticalDepth[1] <=
        cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH);

    const moonOnly = cloudLight.evaluateCloudLightVolumeDirectFieldResolution(
        elongated,
        [
            {
                kind: "sun", directionToSource: [1, 0, 0],
                atmosphereTransportedIrradianceRgb: [1, 1, 1], active: false,
            },
            {
                kind: "moon", directionToSource: [0, 1, 0],
                atmosphereTransportedIrradianceRgb: [0.01, 0.01, 0.01], active: true,
            },
        ],
        4,
    );
    assert.equal(moonOnly.activeSourceMask, 0b10);
    assert.equal(moonOnly.qualifiedSourceMask, 0b10);
    assert.equal(moonOnly.qualifiesActiveSources, true,
        "inactive transforms are neutral and must not veto publication");
});

test("owner residency partitions optical depth without overlap", () => {
    const residentMask = cloudLight.createCloudLightVolumeOwnerMask(
        [0, 5, 31, 32, 35, -1, 36, Number.NaN]);
    assert.deepEqual(residentMask, [0x80000021, 0b1001]);
    for (const ownerIndex of [0, 5, 31, 32, 35]) {
        assert.equal(cloudLight.cloudLightVolumeOwnerMaskContains(
            residentMask, ownerIndex), true);
    }
    for (const ownerIndex of [-1, 1, 33, 34, 36, Number.NaN]) {
        assert.equal(cloudLight.cloudLightVolumeOwnerMaskContains(
            residentMask, ownerIndex), false);
    }

    const partition = cloudLight.partitionCloudLightVolumeOwnerOpticalDepth([
        { ownerIndex: 0, opticalDepthRgb: [0.4, 0.5, 0.6] },
        { ownerIndex: 7, opticalDepthRgb: [0.2, 0.3, 0.5] },
        { ownerIndex: 32, opticalDepthRgb: [0.1, 0.15, 0.2] },
        { ownerIndex: 34, opticalDepthRgb: [0.3, 0.25, 0.1] },
    ], residentMask);
    assert.deepEqual(partition.residentOpticalDepthRgb, [0.5, 0.65, 0.8]);
    assert.deepEqual(partition.missingOpticalDepthRgb, [0.5, 0.55, 0.6]);
    partition.totalOpticalDepthRgb.forEach((value, channel) => near(
        value,
        partition.residentOpticalDepthRgb[channel] +
            partition.missingOpticalDepthRgb[channel],
        1e-12,
        `additive optical depth channel ${channel}`,
    ));
    partition.totalTransmittanceRgb.forEach((value, channel) => near(
        value,
        partition.residentTransmittanceRgb[channel] *
            partition.missingTransmittanceRgb[channel],
        1e-12,
        `multiplicative Beer transport channel ${channel}`,
    ));
});

test("brick sampling metadata is backward-compatible and fails closed", () => {
    const filteredFlags =
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_FILTERED_DIFFUSE_L1_FLAG |
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG;
    const residentSourceFlag =
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG;
    const filtered = cloudLight.createCloudLightVolumeBrick({
        ownerIndex: 2,
        centerKm: [0, 6_372, 4],
        halfExtentKm: [0.8, 0.5, 0.9],
        sources,
        environment: blackEnvironment,
        samplingFlags: filteredFlags,
    });
    assert.equal(filtered.validation.valid, true,
        filtered.validation.reasons.join(", "));
    const packed = cloudLight.packCloudLightVolumeBricks([filtered]);
    assert.equal(packed.data[51], 1 + filteredFlags);
    assert.deepEqual(
        cloudLight.unpackCloudLightVolumeBrickMetadata(packed.data[51]),
        { schema: 1, samplingFlags: filteredFlags },
    );
    assert.deepEqual(cloudLight.unpackCloudLightVolumeBrickMetadata(
        1 + residentSourceFlag),
        { schema: 1, samplingFlags: residentSourceFlag },
        "complete-owner source resampling is an independent, recognized policy");
    assert.deepEqual(cloudLight.unpackCloudLightVolumeBrickMetadata(1),
        { schema: 1, samplingFlags: 0 },
        "the old schema-only payload remains exact");
    assert.equal(cloudLight.unpackCloudLightVolumeBrickMetadata(
        1 + filteredFlags + (1 << 12)).samplingFlags, 0,
    "unknown metadata bits cannot opt a brick into reduced sampling");
    assert.equal(cloudLight.unpackCloudLightVolumeBrickMetadata(
        1 + cloudLight.CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG,
    ).samplingFlags, 0,
    "paired-y metadata without filtered diffuse must fail closed");
    for (const malformed of [
        1 + filteredFlags + 0.25,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        -1,
        0x1_0000_0000 + 1 + filteredFlags,
    ]) {
        assert.equal(cloudLight.unpackCloudLightVolumeBrickMetadata(
            malformed).samplingFlags, 0,
        `malformed metadata ${malformed} cannot enable reduced sampling`);
    }
    assert.equal(cloudLight.packCloudLightVolumeBrickMetadata(
        0x1_0000_0000 + filteredFlags), 1,
    "flags that alias through JS bitwise conversion must fail closed");

    const invalidPartial = cloudLight.createCloudLightVolumeBrick({
        ownerIndex: 2,
        centerKm: [0, 6_372, 4],
        halfExtentKm: [0.8, 0.5, 0.9],
        sources,
        environment: blackEnvironment,
        samplingFlags: cloudLight.CLOUD_LIGHT_VOLUME_BRICK_PAIRED_DIRECT_Y_FLAG,
    });
    assert.equal(invalidPartial.validation.valid, false);
    assert.equal(invalidPartial.samplingFlags, 0);
    assert.ok(invalidPartial.validation.reasons.includes(
        "cloud-light-volume-paired-direct-requires-filtered-diffuse"));
});

test("WGSL brick metadata rejects malformed, unknown, and partial policies", () => {
    const compute = cloudLightWgsl.CLOUD_LIGHT_VOLUME_COMPUTE_WGSL;
    const decoder = compute.slice(
        compute.indexOf("fn cloud_lv_sampling_word"),
        compute.indexOf("fn cloud_lv_representative_brick_index"),
    );
    assert.match(decoder, /let raw = brick\.owner_atlas_tau_schema\.w/);
    assert.match(decoder,
        /raw >= 0\.0 && raw <= f32\(CLOUD_LV_KNOWN_METADATA_MASK\) &&\s*raw == floor\(raw\)/);
    assert.match(decoder,
        /\(word & ~CLOUD_LV_KNOWN_METADATA_MASK\) == 0u/);
    assert.match(decoder, /\(!paired \|\| filtered\)/);
    const paired = decoder.slice(
        decoder.indexOf("fn cloud_lv_paired_direct_y_safe"),
    );
    assert.match(paired, /cloud_lv_sampling_word_is_valid\(word\)/);
    assert.match(paired, /CLOUD_LV_FILTERED_MEDIUM_BIT/);
    assert.match(paired, /CLOUD_LV_PAIRED_DIRECT_Y_BIT/);
});

test("cached RGB Beer faces preserve center, sourceward, and downstream transport", () => {
    const extinction = Array.from({ length: 32 }, (_, index) => [
        0.08 + index * 0.001,
        0.17 + index * 0.002,
        0.31 + index * 0.003,
    ]);
    const cellKm = 0.075;
    const faces = cloudLight.integrateCloudLightVolumeBeerFaces(
        extinction, cellKm);
    const expectedAt = (centerY) => [0, 1, 2].map((channel) => {
        let opticalDepth = 0;
        const faceY = centerY + 0.5;
        for (let y = 31; y >= Math.ceil(faceY); y -= 1) {
            opticalDepth += extinction[y][channel] * cellKm;
        }
        const containing = Math.floor(faceY);
        const partial = Math.ceil(faceY) - faceY;
        if (partial > 0 && containing >= 0 && containing < 32) {
            opticalDepth += extinction[containing][channel] * cellKm *
                partial;
        }
        return Math.exp(-opticalDepth);
    });
    for (const centerY of [0, 7.25, 18.5, 31]) {
        const sampled = cloudLight.sampleCloudLightVolumeBeerFaces(
            faces, centerY);
        expectedAt(centerY).forEach((expected, channel) =>
            near(sampled[channel], expected, 1e-12,
                `center ${centerY} RGB ${channel}`));
    }
    assert.deepEqual(cloudLight.sampleCloudLightVolumeBeerFaces(faces, 32),
        [1, 1, 1], "the sourceward exterior is neutral");
    const downstream = cloudLight.sampleCloudLightVolumeBeerFaces(faces, -8);
    faces[0].forEach((expected, channel) =>
        near(downstream[channel], expected, 1e-14,
            `downstream exit RGB ${channel}`));
});

test("finite sheet owners use connected resident tiles and honest boundaries", () => {
    const sheetSystem = {
        layerIndex: 0,
        systemIndex: 0,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: "finite-frontal-sheet",
            extent: {
                centerEastKm: 5,
                centerNorthKm: 18,
                orientation: 0.35,
                minorRadiusKm: 4.2,
                majorRadiusKm: 7.5,
                boundaryTransitionKm: 0.2,
            },
        },
        compiled: {
            macroTopology: "layered-veil",
            geometry: { baseAltitudeKm: 1.8, geometricDepthKm: 1.1 },
            material: { extinctionKm: 2.4 },
        },
    };
    const config = cloudLight.createCloudLightVolumePlan({ maxBricks: 2 }).config;
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [sheetSystem],
        sources,
        lightingSignature: "sheet-light",
        config,
    });
    assert.equal(runtime.sheetOwnerCount, 1);
    assert.equal(runtime.selectedSheetOwnerCount, 1);
    assert.equal(runtime.excludedSheetOwnerCount, 0);
    assert.equal(runtime.candidateBricks.length, 2);
    assert.equal(runtime.bricks.length, 0,
        "an under-resolved owner must not materialize an unsampleable cache");
    assert.equal(runtime.exactMediumQueriesPerRefresh, 0);
    assert.equal(runtime.exactSamplingBrickCount, 0);
    assert.equal(runtime.filteredSamplingBrickCount, 0);
    assert.equal(runtime.filteredSamplingOwnerCount, 0);
    assert.ok(runtime.candidateBricks.every((brick) => brick.samplingFlags === 0),
        "partial owners must retain exact source-grid morphology outside resident tiles");
    assert.deepEqual(runtime.candidateBricks[0].directTransforms,
        runtime.candidateBricks[1].directTransforms,
        "sibling tiles share byte-identical full-owner source transforms");
    assert.equal(runtime.fullyResidentOwnerCount, 0);
    assert.equal(runtime.partiallyResidentOwnerCount, 1);
    assert.ok(runtime.requiredBrickCount > runtime.candidateBricks.length);
    assert.equal(runtime.residentLayerMask & 1, 0,
        "a partial spatial tile set must not replace whole-owner fallback lighting");
    assert.equal(cloudLight.cloudLightVolumeOwnerMaskContains(
        runtime.residentOwnerMask, 0), false,
    "an under-resolved complete-owner Beer field must retain exact tracing");
    assert.equal(runtime.directQualifiedOwnerCount, 0);
    assert.equal(runtime.exactCameraTracingOwnerCount, 1);
    assert.ok(runtime.directFieldQualifications[0]
        .maximumActiveSourceCellOpticalDepth >
        cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH);
    assert.ok(runtime.materializedCandidateCount <= config.maxBricks * 3);
    const boundaryKinds = runtime.candidateBricks.flatMap((brick) =>
        brick.faceBoundaryKind);
    assert.ok(boundaryKinds.includes(cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL),
        "the connected sheet tiles exchange one selected-neighbor halo");
    assert.ok(boundaryKinds.includes(cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED),
        "an omitted finite-sheet neighbor is explicit truncated Dirichlet, not sky");
    assert.ok(boundaryKinds.includes(cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR),
        "the actual finite sheet edge remains a physical exterior");
});

test("all stratiform topology families enter the shared resident solve", () => {
    const topologies = [
        "boundary-layer-sheet",
        "precipitating-sheet",
        "layered-veil",
    ];
    const systems = topologies.map((macroTopology, layerIndex) => ({
        layerIndex,
        systemIndex: layerIndex,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: `sheet-family-${layerIndex}`,
            extent: {
                centerEastKm: -8 + layerIndex * 8,
                centerNorthKm: 12 + layerIndex * 5,
                orientation: 0.2 * layerIndex,
                minorRadiusKm: 1,
                majorRadiusKm: 1.2,
                boundaryTransitionKm: 0.08,
            },
        },
        compiled: {
            macroTopology,
            geometry: {
                baseAltitudeKm: 0.7 + layerIndex * 2.5,
                geometricDepthKm: 0.6,
            },
            material: { extinctionKm: 1.4 + layerIndex },
        },
    }));
    const config = cloudLight.createCloudLightVolumePlan({ maxBricks: 3 }).config;
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems,
        sources,
        lightingSignature: "all-sheet-families",
        config,
    });
    assert.equal(runtime.sheetOwnerCount, 3);
    assert.equal(runtime.selectedSheetOwnerCount, 3);
    assert.equal(runtime.excludedSheetOwnerCount, 0);
    assert.equal(runtime.selectedOwnerCount, 3);
    assert.equal(runtime.fullyResidentOwnerCount, 0);
    assert.equal(runtime.partiallyResidentOwnerCount, 3);
    assert.ok(runtime.requiredBrickCount > runtime.bricks.length);
    assert.equal(runtime.residentLayerMask, 0,
        "one anchor tile per sheet owner is not whole-support residency");
    assert.deepEqual(runtime.residentOwnerMask, [0b111, 0],
        "all three sheet owners publish disjoint full-owner direct fields");
    assert.deepEqual(new Set(runtime.bricks.map((brick) => brick.ownerIndex)).size, 3);
});

test("a genuinely whole-support owner enables resident P1 transport", () => {
    const system = {
        layerIndex: 0,
        systemIndex: 0,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: "compact-whole-support-owner",
            extent: {
                centerEastKm: 0.4,
                centerNorthKm: 1.5,
                orientation: 0.2,
                minorRadiusKm: 0.24,
                majorRadiusKm: 0.34,
                boundaryTransitionKm: 0.03,
            },
        },
        compiled: {
            macroTopology: "parcel-thermal-tree",
            geometry: { baseAltitudeKm: 0.8, geometricDepthKm: 0.35 },
            material: { extinctionKm: 8 },
        },
    };
    const config = cloudLight.createCloudLightVolumePlan({ maxBricks: 1 }).config;
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [system], sources,
        lightingSignature: "compact-whole-support",
        config,
    });
    assert.equal(runtime.requiredBrickCount, 1);
    assert.equal(runtime.bricks.length, 1);
    assert.equal(runtime.fullyResidentOwnerCount, 1);
    assert.equal(runtime.partiallyResidentOwnerCount, 0);
    assert.equal(runtime.residentLayerMask, 1);
    assert.equal(runtime.bricks[0].samplingFlags,
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG |
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG);
    assert.deepEqual(runtime.residentOwnerMask, [1, 0]);
    assert.equal(runtime.directQualifiedOwnerCount, 1);
    assert.equal(runtime.exactCameraTracingOwnerCount, 0);
    assert.equal(runtime.directFieldQualifications[0].activeSourceMask, 0b11);
    assert.equal(runtime.directFieldQualifications[0].qualifiedSourceMask, 0b11);
    assert.ok(runtime.directFieldQualifications[0]
        .maximumActiveSourceCellOpticalDepth <=
        cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH,
    "a sufficiently resolved compact owner publishes both active source fields");
});

test("a fully tiled P1 owner stays invisible when its direct basis is coarse", () => {
    const system = {
        layerIndex: 0,
        systemIndex: 0,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: "compact-solve-wide-direct-owner",
            extent: {
                centerEastKm: 0.2,
                centerNorthKm: 6,
                orientation: 0.1,
                minorRadiusKm: 0.35,
                majorRadiusKm: 4,
                boundaryTransitionKm: 0.04,
            },
        },
        compiled: {
            macroTopology: "thermal-field",
            geometry: { baseAltitudeKm: 0.8, geometricDepthKm: 0.4 },
            material: { extinctionKm: 8 },
        },
    };
    const macroSupportByOwner = new Map([[0, {
        volumeId: "direct-resolution-contract",
        minimumCanonical: [0.47, 0.12, 0.47],
        maximumCanonical: [0.53, 0.88, 0.53],
        anchorCanonical: [0.5, 0.5, 0.5],
    }]]);
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [system],
        sources,
        lightingSignature: "coarse-direct-blocks-p1",
        macroSupportByOwner,
        config: cloudLight.createCloudLightVolumePlan({ maxBricks: 1 }).config,
    });
    assert.equal(runtime.fullyResidentOwnerCount, 1,
        "the compact conservative support must fit the diffusion solve");
    assert.equal(runtime.directQualifiedOwnerCount, 0);
    assert.equal(runtime.exactCameraTracingOwnerCount, 1);
    assert.deepEqual(runtime.residentOwnerMask, [0, 0]);
    assert.equal(runtime.residentLayerMask, 0,
        "P1 cannot become camera-visible on an under-resolved reduced beam");
    assert.ok(runtime.directFieldQualifications[0]
        .maximumActiveSourceCellOpticalDepth >
        cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH);
});

test("Cu congestus benchmark gives every owner support-bearing hybrid residency", () => {
    const benchmark = cloudPhotographBenchmark.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "cu-congestus--day-oblique-natural",
    );
    assert.ok(benchmark);
    const systemRuntime = cloudSystemRuntime.createCloudSystemRuntime(
        benchmark.preview.cloudScene,
    );
    assert.equal(systemRuntime.systems.length, 3);
    const manifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-macro-atlas-v2.json",
        import.meta.url,
    ), "utf8"));
    const atlasBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.atlas.file}`,
        import.meta.url,
    ));
    const majorantBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.majorants.file}`,
        import.meta.url,
    ));
    const loaded = {
        manifest,
        atlasBytes,
        majorantBytes,
        volumes: new Map(manifest.volumes.map((volume) => [volume.id, volume])),
    };
    const macroSupportByOwner = new Map(systemRuntime.systems.map(
        (system, ownerIndex) => {
            const volumeId = cloudMacroAtlas.selectCloudMacroVolumeId({
                genus: system.state.classification.genus,
                species: system.compiled.recipeId,
                supplementaryFeatures: system.compiled.features.supplementary,
                lifecycleStage: system.compiled.lifecycle.stage,
                deterministicVariant: system.systemIndex,
            });
            return [ownerIndex,
                cloudMacroAtlas.getCloudMacroConservativeSupport(loaded, volumeId)];
        },
    ));
    const morphologyManifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-morphology-modifiers-v1.json",
        import.meta.url,
    ), "utf8"));
    const morphology = cloudMorphology.packCloudMorphologyModifiers(
        morphologyManifest,
        systemRuntime.morphologyRequests,
    );
    assert.equal(morphology.recordCount, 0);
    assert.equal(morphology.inflatedBounds.size, 0);
    const oneActiveSource = sources.map((source, index) => ({
        ...source,
        active: index === 0,
    }));
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: systemRuntime.systems,
        sources: oneActiveSource,
        lightingSignature: "cu-congestus-exact-support-regression",
        morphologyBoundsByOwner: morphology.inflatedBounds,
        macroSupportByOwner,
    });
    assert.equal(runtime.selectedOwnerCount, 3);
    assert.equal(runtime.candidateBricks.length,
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks,
        "the connected Cu supports use the complete bounded brick budget");
    assert.equal(runtime.bricks.length, 0,
        "all coarse Cu direct fields stay exact-only without cache construction");
    assert.equal(runtime.candidateBrickCount, 47);
    assert.equal(runtime.requiredBrickCount, 26,
        "required residency follows the regenerated conservative Cu supports");
    assert.equal(runtime.fullyResidentOwnerCount, 2);
    assert.equal(runtime.partiallyResidentOwnerCount, 1);
    assert.equal(runtime.residentLayerMask, 0,
        "one whole owner cannot publish a layer-wide resident P1 field");
    assert.deepEqual(runtime.residentOwnerMask, [0, 0],
        "coarse full-owner Cu fields must fall back to exact same-layer tracing");
    assert.equal(runtime.directQualifiedOwnerCount, 0);
    assert.equal(runtime.exactCameraTracingOwnerCount, 3);
    assert.equal(runtime.directFieldQualifications.length, 3);
    for (const qualification of runtime.directFieldQualifications) {
        assert.equal(qualification.activeSourceMask, 0b1);
        assert.equal(qualification.qualifiedSourceMask, 0);
        assert.equal(qualification.qualifiesActiveSources, false);
        assert.ok(qualification.maximumActiveSourceCellOpticalDepth >
            cloudLight.CLOUD_LIGHT_VOLUME_MAXIMUM_DIRECT_CELL_OPTICAL_DEPTH,
        `Cu owner ${qualification.ownerIndex} unexpectedly passed direct resolution`);
    }
    assert.equal(runtime.exactMediumQueriesPerRefresh, 0,
        "an exact-only scene has no cache morphology workload");
    assert.equal(runtime.exactSamplingBrickCount, runtime.bricks.length);
    assert.equal(runtime.filteredSamplingBrickCount, 0);
    assert.equal(runtime.filteredSamplingOwnerCount, 0);
    assert.equal(runtime.candidateBricks.filter((brick) => brick.samplingFlags ===
        cloudLight.CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG).length,
    runtime.fullyResidentOwnerCount);
    assert.equal(runtime.brickKeys.length, 0);
    const dimensions = cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.dimensions;
    const toWorld = (system, canonical) => {
        const extent = system.state.extent;
        const downwind = [Math.cos(extent.orientation), Math.sin(extent.orientation)];
        const crosswind = [-downwind[1], downwind[0]];
        const crosswindKm = (canonical[0] - 0.5) * 2 * extent.minorRadiusKm;
        const downwindKm = (canonical[2] - 0.5) * 2 * extent.majorRadiusKm;
        const east = extent.centerEastKm + crosswind[0] * crosswindKm +
            downwind[0] * downwindKm;
        const north = extent.centerNorthKm + crosswind[1] * crosswindKm +
            downwind[1] * downwindKm;
        const altitude = system.compiled.geometry.baseAltitudeKm + canonical[1] *
            system.compiled.geometry.geometricDepthKm;
        const radius = 6_371 + altitude;
        return [east, Math.sqrt(Math.max(1,
            radius * radius - east * east - north * north)), north];
    };
    const ownersWithSupportAnchor = new Set();
    const wholeSupportOwners = new Set();
    for (const brick of runtime.candidateBricks) {
        const support = macroSupportByOwner.get(brick.ownerIndex);
        const anchor = toWorld(
            systemRuntime.systems[brick.ownerIndex],
            support.anchorCanonical,
        );
        const delta = anchor.map((value, axis) =>
            value - brick.diffusionTransform.originKm[axis]);
        const containsAnchor = brick.diffusionTransform.axes.every(
            (axis, dimension) => {
            const cell = dot(delta, axis) /
                brick.diffusionTransform.cellSizeKm[dimension];
                return cell >= -1e-6 &&
                    cell <= dimensions[dimension] + 1e-6;
            },
        );
        if (containsAnchor) ownersWithSupportAnchor.add(brick.ownerIndex);
        assert.ok(brick.maximumCellOpticalDepth <= 0.75,
            `owner ${brick.ownerIndex} exceeded the compact-cell tau gate`);
        assert.ok(brick.faceBoundaryKind.every((kind) => [
            cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_INTERNAL,
            cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR,
            cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_TRUNCATED,
        ].includes(kind)));
        const wholeSupport = brick.samplingFlags ===
            cloudLight.CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG;
        if (wholeSupport) {
            wholeSupportOwners.add(brick.ownerIndex);
            assert.deepEqual(brick.faceBoundaryKind,
                Array(6).fill(cloudLight.CLOUD_LIGHT_VOLUME_BOUNDARY_EXTERIOR));
            for (const u of [support.minimumCanonical[0],
                support.maximumCanonical[0]]) {
                for (const v of [support.minimumCanonical[1],
                    support.maximumCanonical[1]]) {
                    for (const w of [support.minimumCanonical[2],
                        support.maximumCanonical[2]]) {
                        const corner = toWorld(
                            systemRuntime.systems[brick.ownerIndex], [u, v, w]);
                        const cornerDelta = corner.map((value, axis) =>
                            value - brick.diffusionTransform.originKm[axis]);
                        brick.diffusionTransform.axes.forEach((axis, dimension) => {
                            const cell = dot(cornerDelta, axis) /
                                brick.diffusionTransform.cellSizeKm[dimension];
                            assert.ok(cell >= 2 - 1e-5 &&
                                cell <= dimensions[dimension] - 2 + 1e-5,
                            `owner ${brick.ownerIndex} support corner lost its ` +
                                `two-cell pad on axis ${dimension}: ${cell}`);
                        });
                    }
                }
            }
        }
    }
    assert.equal(ownersWithSupportAnchor.size, systemRuntime.systems.length,
        "every selected Cu owner needs at least one support-bearing anchor brick");
    assert.deepEqual([...wholeSupportOwners], [0, 2],
        "the regenerated Cu supports identify both owners that fit one padded exact domain");

    const repeated = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: systemRuntime.systems,
        sources: oneActiveSource,
        lightingSignature: "cu-congestus-exact-support-regression",
        morphologyBoundsByOwner: morphology.inflatedBounds,
        macroSupportByOwner,
    });
    assert.deepEqual(repeated.brickKeys, runtime.brickKeys);
    assert.equal(repeated.signature, runtime.signature,
        "hybrid whole-support/tiled selection must be deterministic");

    const opticallyOversizedSystems = systemRuntime.systems.map((system) => ({
        ...system,
        compiled: {
            ...system.compiled,
            material: {
                ...system.compiled.material,
                extinctionKm: system.compiled.material.extinctionKm * 4,
            },
        },
    }));
    const tiledFallback = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: opticallyOversizedSystems,
        sources: oneActiveSource,
        lightingSignature: "cu-congestus-optically-oversized-fallback",
        morphologyBoundsByOwner: morphology.inflatedBounds,
        macroSupportByOwner,
    });
    assert.equal(tiledFallback.brickKeys.length, 0);
    assert.ok(tiledFallback.requiredBrickCount >
        tiledFallback.candidateBricks.length);
    assert.equal(tiledFallback.fullyResidentOwnerCount, 0);
    assert.equal(tiledFallback.residentLayerMask, 0,
        "an under-resolved whole owner must retain partial tiled fallback");
    assert.deepEqual(tiledFallback.residentOwnerMask, [0, 0],
        "optically oversized direct fields must retain exact source tracing");
    assert.equal(tiledFallback.directQualifiedOwnerCount, 0);
    assert.equal(tiledFallback.exactCameraTracingOwnerCount, 3);
    for (const adaptiveBrick of runtime.candidateBricks) {
        const fallbackBrick = tiledFallback.candidateBricks.find((brick) =>
            brick.ownerIndex === adaptiveBrick.ownerIndex);
        assert.ok(fallbackBrick,
            `fallback lost owner ${adaptiveBrick.ownerIndex}`);
        assert.deepEqual(adaptiveBrick.directTransforms,
            fallbackBrick.directTransforms,
            "adaptive diffusion must retain the full-owner Beer domain");
    }
});

test("production day-oblique Ci fibratus qualifies every retained source owner", () => {
    const benchmark = cloudPhotographBenchmark.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-fibratus--day-oblique-natural",
    );
    assert.ok(benchmark);
    const systemRuntime = cloudSystemRuntime.createCloudSystemRuntime(
        benchmark.preview.cloudScene,
    );
    const manifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-macro-atlas-v2.json",
        import.meta.url,
    ), "utf8"));
    const atlasBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.atlas.file}`,
        import.meta.url,
    ));
    const majorantBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.majorants.file}`,
        import.meta.url,
    ));
    const loaded = {
        manifest,
        atlasBytes,
        majorantBytes,
        volumes: new Map(manifest.volumes.map((entry) => [entry.id, entry])),
    };
    const selectedVolumes = systemRuntime.systems.map((system) => {
        const volumeId = cloudMacroAtlas.selectCloudMacroVolumeId({
            genus: system.state.classification.genus,
            species: system.compiled.recipeId,
            supplementaryFeatures: system.compiled.features.supplementary,
            varieties: system.state.classification.varieties,
            lifecycleStage: system.compiled.lifecycle.stage,
            organizationRegime: system.familyProduction?.organizationRegime,
            placementRegime: system.familyProduction?.lowLayeredDomain?.placement,
            nimbostratusParentTopologyVariantId:
                system.familyProduction?.nimbostratusParentTopologyVariantId,
            deterministicVariant: system.atlasDeterministicVariant,
        });
        return loaded.volumes.get(volumeId);
    });
    assert.ok(selectedVolumes.every(Boolean));
    const macroVolumesByOwner = new Map(selectedVolumes.map(
        (entry, ownerIndex) => [ownerIndex, entry],
    ));
    const macroSupportByOwner = new Map(selectedVolumes.map(
        (entry, ownerIndex) => [ownerIndex,
            cloudMacroAtlas.getCloudMacroConservativeSupport(loaded, entry.id)],
    ));
    const morphologyManifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-morphology-modifiers-v1.json",
        import.meta.url,
    ), "utf8"));
    const morphology = cloudMorphology.packCloudMorphologyModifiers(
        morphologyManifest,
        systemRuntime.morphologyRequests,
    );

    const environment = benchmark.environment;
    const date = new Date(environment.date);
    const radians = Math.PI / 180;
    const normalizeRadians = (value) => {
        let normalized = value % (Math.PI * 2);
        if (normalized > Math.PI) normalized -= Math.PI * 2;
        if (normalized < -Math.PI) normalized += Math.PI * 2;
        return normalized;
    };
    const directionForHorizontal = (azimuth, altitude) => {
        const relativeAzimuth = normalizeRadians(
            azimuth - (environment.viewAzimuth - 180) * radians,
        );
        const horizontal = Math.cos(altitude);
        return [
            Math.sin(relativeAzimuth) * horizontal,
            Math.sin(altitude),
            Math.cos(relativeAzimuth) * horizontal,
        ];
    };
    const sun = SunCalc.getPosition(
        date, environment.latitude, environment.longitude);
    const moon = SunCalc.getMoonPosition(
        date, environment.latitude, environment.longitude);
    const productionSources = [
        {
            kind: "sun",
            directionToSource: directionForHorizontal(sun.azimuth, sun.altitude),
            atmosphereTransportedIrradianceRgb: [3.2, 3.2, 3.2],
            active: true,
        },
        {
            kind: "moon",
            directionToSource: directionForHorizontal(moon.azimuth, moon.altitude),
            // Daylight scheduling only needs the physically negligible ratio;
            // radiometry and direction are otherwise retained byte-for-byte.
            atmosphereTransportedIrradianceRgb: [1e-6, 1e-6, 1e-6],
            active: true,
        },
    ];
    const lightRuntime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: systemRuntime.systems,
        sources: productionSources,
        lightingSignature: benchmark.id,
        morphologyBoundsByOwner: morphology.inflatedBounds,
        macroSupportByOwner,
    });
    const retainedOwnerIndices = lightRuntime.bricks.map((brick) =>
        brick.ownerIndex);
    const eligibility = cloudLightRuntime
        .qualifyCloudLightVolumePlainFibratusSourcePath({
            systems: systemRuntime.systems,
            macroVolumesByOwner,
            morphology,
            retainedBricks: lightRuntime.bricks,
        });

    assert.deepEqual([...new Set(retainedOwnerIndices)], [0, 1, 2, 3, 4, 5],
        JSON.stringify({
            candidateBrickCount: lightRuntime.candidateBrickCount,
            selectedOwnerCount: lightRuntime.selectedOwnerCount,
            directFieldQualifications: lightRuntime.directFieldQualifications,
            residentOwnerMask: lightRuntime.residentOwnerMask,
            macroVolumes: selectedVolumes.map(({ id }) => id),
        }));
    assert.deepEqual(eligibility.eligibleOwnerIndices, [0, 1, 2, 3, 4, 5],
        JSON.stringify(eligibility.owners));
    assert.equal(eligibility.allRetainedOwnersSafe, true,
        eligibility.owners.map(({ ownerIndex, reasons }) =>
            `${ownerIndex}:${reasons.join("|")}`).join(", "));
    assert.ok(eligibility.owners.every(({ reasons }) => reasons.length === 0));
    assert.equal(lightRuntime.residentLayerMask, 0);
    assert.deepEqual(lightRuntime.residentOwnerMask, [0b111111, 0],
        "direct-only Beer owners remain published without resident source medium");
    assert.ok(lightRuntime.bricks.every(({ samplingFlags }) =>
        (samplingFlags &
            cloudLight.CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG) === 0));
});

test("morphology bounds expand the diffusion and full-owner Beer domain", () => {
    const system = {
        layerIndex: 1,
        systemIndex: 0,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: "morphology-owner",
            extent: {
                centerEastKm: 8,
                centerNorthKm: 20,
                orientation: 0,
                minorRadiusKm: 0.8,
                majorRadiusKm: 1.1,
                boundaryTransitionKm: 0.08,
            },
        },
        compiled: {
            macroTopology: "parcel-thermal-tree",
            geometry: { baseAltitudeKm: 2, geometricDepthKm: 1 },
            material: { extinctionKm: 8 },
        },
    };
    const base = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [system], sources, lightingSignature: "base",
    });
    const expanded = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [system], sources, lightingSignature: "expanded",
        morphologyBoundsByOwner: new Map([[0, {
            minimumKm: [5, 1.2, 17],
            maximumKm: [14, 5.5, 28],
        }]]),
    });
    const largestDirectCell = (runtime) => Math.max(
        ...runtime.candidateBricks[0].directTransforms[0].cellSizeKm);
    const diffusionLayout = (runtime) => runtime.candidateBricks.map((brick) => ({
        centerKm: brick.centerKm,
        halfExtentKm: brick.halfExtentKm,
    }));
    assert.notDeepEqual(diffusionLayout(expanded), diffusionLayout(base),
        "morphology support must alter diffusion residency, not only Beer scans");
    assert.ok(largestDirectCell(expanded) > largestDirectCell(base));
    for (const brick of expanded.candidateBricks) {
        assert.deepEqual(brick.directTransforms,
            expanded.candidateBricks[0].directTransforms,
            "every resident tile must scan the same full morphology owner domain");
    }
    assert.notEqual(expanded.signature, base.signature);
});

test("curved full-owner domains contain every authorized macro support corner", () => {
    const system = {
        layerIndex: 0,
        systemIndex: 0,
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: {
            id: "curved-frontal-owner",
            extent: {
                centerEastKm: 90,
                centerNorthKm: 145,
                orientation: 0.63,
                minorRadiusKm: 62,
                majorRadiusKm: 170,
                boundaryTransitionKm: 0.8,
            },
        },
        compiled: {
            macroTopology: "layered-veil",
            geometry: { baseAltitudeKm: 1.1, geometricDepthKm: 1.6 },
            material: { extinctionKm: 1.8 },
        },
    };
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: [system], sources, lightingSignature: "curved-support",
    });
    const extent = system.state.extent;
    const depth = system.compiled.geometry.geometricDepthKm;
    const downwind = [Math.cos(extent.orientation), Math.sin(extent.orientation)];
    const crosswind = [-downwind[1], downwind[0]];
    const toWorld = (east, altitude, north) => {
        const radius = 6_371 + altitude;
        return [east, Math.sqrt(Math.max(1,
            radius * radius - east * east - north * north)), north];
    };
    const corners = [];
    for (const crossSign of [-1, 1]) for (const downSign of [-1, 1]) {
        for (const altitude of [
            system.compiled.geometry.baseAltitudeKm - depth * 0.30,
            system.compiled.geometry.baseAltitudeKm + depth * 1.30,
        ]) {
            corners.push(toWorld(
                extent.centerEastKm + crosswind[0] *
                    extent.minorRadiusKm * 1.30 * crossSign +
                    downwind[0] * extent.majorRadiusKm * 1.30 * downSign,
                altitude,
                extent.centerNorthKm + crosswind[1] *
                    extent.minorRadiusKm * 1.30 * crossSign +
                    downwind[1] * extent.majorRadiusKm * 1.30 * downSign,
            ));
        }
    }
    for (const [sourceIndex, transform] of
        runtime.candidateBricks[0].directTransforms.entries()) {
        for (const [cornerIndex, corner] of corners.entries()) {
            const delta = corner.map((value, axis) =>
                value - transform.originKm[axis]);
            transform.axes.forEach((axis, dimension) => {
                const local = dot(delta, axis) / transform.cellSizeKm[dimension];
                assert.ok(local >= -1e-7 &&
                    local <= cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG
                        .dimensions[dimension] + 1e-7,
                `source ${sourceIndex} corner ${cornerIndex} dimension ${dimension}: ${local}`);
            });
        }
    }
});

test("broad Stratus macro support selects a curved-world light owner", () => {
    const benchmark = cloudPhotographBenchmark.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "st-nebulosus--day-oblique-natural",
    );
    assert.ok(benchmark);
    const systemRuntime = cloudSystemRuntime.createCloudSystemRuntime(
        benchmark.preview.cloudScene,
    );
    assert.equal(systemRuntime.systems.length, 1);
    const manifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-macro-atlas-v2.json",
        import.meta.url,
    ), "utf8"));
    const atlasBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.atlas.file}`,
        import.meta.url,
    ));
    const majorantBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.majorants.file}`,
        import.meta.url,
    ));
    const loaded = {
        manifest,
        atlasBytes,
        majorantBytes,
        volumes: new Map(manifest.volumes.map((volume) => [volume.id, volume])),
    };
    const macroSupportByOwner = new Map([[0,
        cloudMacroAtlas.getCloudMacroConservativeSupport(
            loaded, "st-nebulosus",
        ),
    ]]);
    const runtime = cloudLightRuntime.createCloudLightVolumeRuntime({
        systems: systemRuntime.systems,
        sources,
        lightingSignature: "st-nebulosus-curved-support-regression",
        macroSupportByOwner,
    });
    assert.equal(runtime.selectedOwnerCount, 1,
        "curved support must not leave the paused exact generation ownerless");
    assert.ok(runtime.requiredBrickCount > 0,
        "the full-depth atlas support must intersect at least one light tile");
    assert.equal(runtime.exactCameraTracingOwnerCount, 1,
        "the broad sheet remains on exact same-layer tracing when its coarse " +
        "direct field is under-resolved");
});

test("all 17 sky lobes project to conservative P1 face currents", () => {
    const radiance = [0.13, 0.27, 0.51];
    const lobes = Array.from({ length: 17 }, (_, index) => ({
        kind: "diffuse",
        axis: [0, 1, 0],
        shapeParameter: 0,
        integratedRadianceRgb: radiance.map((value) => value * 4 * Math.PI / 17),
        normalizationSteradians: 4 * Math.PI,
        marker: index,
    }));
    const projection = cloudLight.projectCloudLightEnvironmentToFaces({
        skyLobes: lobes,
        localUpDirection: [0, 1, 0],
        quadratureSampleCount: 16_384,
    }, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    assert.equal(projection.validation.valid, true, projection.validation.reasons);
    for (const face of projection.faceIrradianceRgb) {
        face.forEach((value, channel) => near(
            value, Math.PI * radiance[channel], 4e-4,
            `isotropic face channel ${channel}`,
        ));
    }

    const lower = cloudLight.projectCloudLightEnvironmentToFaces({
        skyLobes: [], localUpDirection: [0, 1, 0],
        lowerAtmosphereRadianceRgb: [0.2, 0.2, 0.2],
        groundRadianceRgb: [0.1, 0.1, 0.1],
        quadratureSampleCount: 16_384,
    }, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    near(lower.faceIrradianceRgb[2][0], 0, 1e-12, "upper face sees no lower field");
    near(lower.faceIrradianceRgb[3][0], Math.PI * 0.3, 4e-4,
        "lower face receives lower air and Lambertian ground");
});

test("transport coefficients retain absorption and reduced forward scattering", () => {
    const coefficients = cloudLight.evaluateCloudLightTransportCoefficients(20, 19.98, 0.85);
    near(coefficients.absorptionPerKm, 0.02, 1e-12);
    near(coefficients.reducedScatteringPerKm, 2.997, 1e-12);
    near(coefficients.transportExtinctionPerKm, 3.017, 1e-12);
    near(coefficients.diffusionKm, 1 / (3 * 3.017), 1e-12);
    assert.ok(cloudLight.marshakBoundaryCoefficient(
        coefficients.diffusionKm, 0.05) > 0);
});

test("analytic homogeneous slab satisfies the P1 equation and Marshak boundaries", () => {
    const input = {
        thicknessKm: 1.2,
        extinctionPerKm: 18,
        scatteringPerKm: 17.82,
        asymmetry: 0.84,
        sourceIrradiance: 1.7,
    };
    const coefficients = cloudLight.evaluateCloudLightTransportCoefficients(
        input.extinctionPerKm, input.scatteringPerKm, input.asymmetry);
    const phi = (x) => cloudLight.evaluateHomogeneousSlabDiffusion(input, x);
    for (const x of [0.12, 0.35, 0.7, 1.05]) {
        const h = 1e-4;
        const second = (phi(x + h) - 2 * phi(x) + phi(x - h)) / (h * h);
        const left = -coefficients.diffusionKm * second +
            coefficients.absorptionPerKm * phi(x);
        const right = input.scatteringPerKm * input.sourceIrradiance *
            Math.exp(-input.extinctionPerKm * x);
        near(left, right, Math.max(2e-5, right * 2e-4), `slab equation at ${x}`);
    }
    const h = 1e-5;
    const leftDerivative = (-3 * phi(0) + 4 * phi(h) - phi(2 * h)) / (2 * h);
    const rightDerivative = (3 * phi(input.thicknessKm) -
        4 * phi(input.thicknessKm - h) +
        phi(input.thicknessKm - 2 * h)) / (2 * h);
    near(phi(0) - 2 * coefficients.diffusionKm * leftDerivative, 0, 2e-6,
        "illuminated vacuum boundary");
    near(phi(input.thicknessKm) + 2 * coefficients.diffusionKm * rightDerivative,
        0, 2e-6, "far vacuum boundary");
});

test("canonical volume solve is nonnegative, linear, and spatially symmetric", () => {
    const dimensions = [5, 5, 5];
    const count = dimensions.reduce((product, value) => product * value, 1);
    const extinction = new Float64Array(count).fill(16);
    const scattering = new Float64Array(count).fill(15.92);
    const asymmetry = new Float64Array(count).fill(0.82);
    const direct = new Float64Array(count);
    const index = (x, y, z) => x + 5 * (y + 5 * z);
    direct[index(2, 2, 2)] = 1;
    const solve = (scale) => cloudLight.solveCloudLightGridReference({
        dimensions,
        cellSizeKm: [0.06, 0.06, 0.06],
        extinctionPerKm: extinction,
        scatteringPerKm: scattering,
        asymmetry,
        directIncidentIrradiance: Float64Array.from(direct, (value) => value * scale),
        faceIrradiance: [0, 0, 0, 0, 0, 0],
        iterations: 800,
        relaxation: 0.72,
    });
    const oneResult = solve(1);
    const twoResult = solve(2);
    const one = oneResult.fluence;
    const two = twoResult.fluence;
    assert.ok(oneResult.maximumNormalizedResidual <= 0.02,
        `normalized equation residual ${oneResult.maximumNormalizedResidual} exceeds 2%`);
    assert.equal(oneResult.nonFiniteCount, 0);
    assert.equal(oneResult.occupiedCount, count);
    for (let i = 0; i < count; i += 1) {
        assert.ok(Number.isFinite(one[i]) && one[i] >= 0);
        near(two[i], one[i] * 2, 2e-11, `linear voxel ${i}`);
    }
    near(one[index(1, 2, 2)], one[index(3, 2, 2)], 2e-12, "x symmetry");
    near(one[index(2, 1, 2)], one[index(2, 3, 2)], 2e-12, "y symmetry");
    near(one[index(2, 2, 1)], one[index(2, 2, 3)], 2e-12, "z symmetry");
    assert.ok(one[index(2, 2, 2)] > one[index(0, 0, 0)]);

    const zero = cloudLight.solveCloudLightGridReference({
        dimensions: [2, 2, 2], cellSizeKm: [0.05, 0.05, 0.05],
        extinctionPerKm: new Float64Array(8).fill(20),
        scatteringPerKm: new Float64Array(8).fill(19.9),
        asymmetry: new Float64Array(8).fill(0.85),
        directIncidentIrradiance: new Float64Array(8),
        faceIrradiance: [0, 0, 0, 0, 0, 0], iterations: 20,
    }).fluence;
    assert.deepEqual([...zero], Array(8).fill(0));
});

test("CPU reference inherits production occupancy and cycle defaults", () => {
    const dimensions = [8, 8, 8];
    const count = 8 ** 3;
    const extinction = new Float64Array(count);
    const scattering = new Float64Array(count);
    const asymmetry = new Float64Array(count);
    const direct = new Float64Array(count);
    extinction[0] =
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.emptyExtinctionThresholdPerKm *
        0.5;
    scattering[0] = extinction[0] * 0.9;
    direct[0] = 1;
    const defaults = cloudLight.solveCloudLightMultigridReference({
        dimensions,
        cellSizeKm: [0.05, 0.05, 0.05],
        extinctionPerKm: extinction,
        scatteringPerKm: scattering,
        asymmetry,
        directIncidentIrradiance: direct,
        faceIrradiance: [0, 0, 0, 0, 0, 0],
    });
    assert.equal(defaults.occupiedCount, 0,
        "default CPU occupancy must use the GPU uniform threshold");
    assert.equal(defaults.normalizedResidualByCycle.length,
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumVCycles);

    const explicitLowerThreshold = cloudLight.solveCloudLightMultigridReference({
        dimensions,
        cellSizeKm: [0.05, 0.05, 0.05],
        extinctionPerKm: extinction,
        scatteringPerKm: scattering,
        asymmetry,
        directIncidentIrradiance: direct,
        faceIrradiance: [0, 0, 0, 0, 0, 0],
        emptyExtinctionThresholdPerKm: 1e-8,
        vCycles: 1,
    });
    assert.equal(explicitLowerThreshold.occupiedCount, 1,
        "an explicit diagnostic threshold remains supported");
});

test("aggregation coarse action is exactly R A P on sparse fine topology", () => {
    const dimensions = [8, 8, 8];
    const coarseDimensions = dimensions.map((value) => value / 2);
    const fineIndex = (x, y, z) => x + 8 * (y + 8 * z);
    const coarseIndex = (x, y, z) => x + 4 * (y + 4 * z);
    const count = 8 ** 3;
    const active = new Uint8Array(count);
    const diffusion = new Float64Array(count);
    const absorption = new Float64Array(count);
    for (let z = 0; z < 8; z += 1) for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            const index = fineIndex(x, y, z);
            // Two disconnected, irregular condensate components cross several
            // aggregate boundaries without filling any enclosing coarse box.
            const first = (x - 2) ** 2 + (y - 2) ** 2 + (z - 2) ** 2 <= 5 &&
                (x + 2 * y + z) % 4 !== 0;
            const second = (x - 5) ** 2 + (y - 5) ** 2 + (z - 5) ** 2 <= 6 &&
                (2 * x + y + z) % 5 !== 0;
            active[index] = first || second ? 1 : 0;
            diffusion[index] = 0.028 + 0.003 * ((x + 2 * y + 3 * z) % 7);
            absorption[index] = 0.04 + 0.006 * ((3 * x + y + z) % 5);
        }
    }
    const coarse = Float64Array.from({ length: 4 ** 3 }, (_, index) =>
        Math.sin(index * 1.731) * 0.7 + Math.cos(index * 0.417) * 0.2);
    const prolongated = new Float64Array(count);
    for (let z = 0; z < 8; z += 1) for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            const index = fineIndex(x, y, z);
            if (active[index]) prolongated[index] = coarse[coarseIndex(
                Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2))];
        }
    }
    const offsets = [
        [1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 1],
        [0, -1, 0, 1], [0, 0, 1, 2], [0, 0, -1, 2],
    ];
    const cell = [0.05, 0.06, 0.07];
    const fineAction = new Float64Array(count);
    for (let z = 0; z < 8; z += 1) for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
            const index = fineIndex(x, y, z);
            if (!active[index]) continue;
            let action = absorption[index] * prolongated[index];
            for (const [dx, dy, dz, axis] of offsets) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;
                const inside = nx >= 0 && nx < 8 && ny >= 0 && ny < 8 &&
                    nz >= 0 && nz < 8;
                const neighbor = inside ? fineIndex(nx, ny, nz) : -1;
                if (inside && active[neighbor]) {
                    const harmonic = 2 * diffusion[index] * diffusion[neighbor] /
                        (diffusion[index] + diffusion[neighbor]);
                    const coefficient = harmonic / cell[axis] ** 2;
                    action += coefficient *
                        (prolongated[index] - prolongated[neighbor]);
                } else {
                    const coefficient = cloudLight.marshakBoundaryCoefficient(
                        diffusion[index], cell[axis]);
                    action += coefficient * prolongated[index];
                }
            }
            fineAction[index] = action;
        }
    }
    const restrictedFineAction = new Float64Array(4 ** 3);
    for (let z = 0; z < 4; z += 1) for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
            let sum = 0;
            for (let dz = 0; dz < 2; dz += 1) {
                for (let dy = 0; dy < 2; dy += 1) {
                    for (let dx = 0; dx < 2; dx += 1) {
                        sum += fineAction[fineIndex(
                            x * 2 + dx, y * 2 + dy, z * 2 + dz)];
                    }
                }
            }
            restrictedFineAction[coarseIndex(x, y, z)] = sum / 8;
        }
    }
    const aggregateAction = new Float64Array(4 ** 3);
    for (let z = 0; z < 4; z += 1) for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
            const center = coarseIndex(x, y, z);
            let action = 0;
            for (let fz = z * 2; fz < z * 2 + 2; fz += 1) {
                for (let fy = y * 2; fy < y * 2 + 2; fy += 1) {
                    for (let fx = x * 2; fx < x * 2 + 2; fx += 1) {
                        const index = fineIndex(fx, fy, fz);
                        if (!active[index]) continue;
                        action += absorption[index] * coarse[center];
                        for (const [dx, dy, dz, axis] of offsets) {
                            const nx = fx + dx;
                            const ny = fy + dy;
                            const nz = fz + dz;
                            const inside = nx >= 0 && nx < 8 && ny >= 0 &&
                                ny < 8 && nz >= 0 && nz < 8;
                            const neighbor = inside ? fineIndex(nx, ny, nz) : -1;
                            if (inside && active[neighbor]) {
                                const neighborCoarse = coarseIndex(
                                    Math.floor(nx / 2), Math.floor(ny / 2),
                                    Math.floor(nz / 2));
                                if (neighborCoarse === center) continue;
                                const harmonic = 2 * diffusion[index] *
                                    diffusion[neighbor] /
                                    (diffusion[index] + diffusion[neighbor]);
                                action += harmonic / cell[axis] ** 2 *
                                    (coarse[center] - coarse[neighborCoarse]);
                            } else {
                                action += cloudLight.marshakBoundaryCoefficient(
                                    diffusion[index], cell[axis]) * coarse[center];
                            }
                        }
                    }
                }
            }
            aggregateAction[center] = action / 8;
        }
    }
    for (let index = 0; index < aggregateAction.length; index += 1) {
        near(aggregateAction[index], restrictedFineAction[index], 2e-12,
            `RAP action ${index}`);
    }
    const matrixColumns = Array.from({ length: coarse.length }, (_, column) => {
        const basis = new Float64Array(coarse.length);
        basis[column] = 1;
        const fineBasis = new Float64Array(count);
        for (let z = 0; z < 8; z += 1) for (let y = 0; y < 8; y += 1) {
            for (let x = 0; x < 8; x += 1) {
                const index = fineIndex(x, y, z);
                if (active[index]) fineBasis[index] = basis[coarseIndex(
                    Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2))];
            }
        }
        const action = new Float64Array(coarse.length);
        for (let z = 0; z < 8; z += 1) for (let y = 0; y < 8; y += 1) {
            for (let x = 0; x < 8; x += 1) {
                const index = fineIndex(x, y, z);
                if (!active[index]) continue;
                let value = absorption[index] * fineBasis[index];
                for (const [dx, dy, dz, axis] of offsets) {
                    const nx = x + dx, ny = y + dy, nz = z + dz;
                    const inside = nx >= 0 && nx < 8 && ny >= 0 && ny < 8 &&
                        nz >= 0 && nz < 8;
                    const neighbor = inside ? fineIndex(nx, ny, nz) : -1;
                    if (inside && active[neighbor]) {
                        const harmonic = 2 * diffusion[index] * diffusion[neighbor] /
                            (diffusion[index] + diffusion[neighbor]);
                        value += harmonic / cell[axis] ** 2 *
                            (fineBasis[index] - fineBasis[neighbor]);
                    } else value += cloudLight.marshakBoundaryCoefficient(
                        diffusion[index], cell[axis]) * fineBasis[index];
                }
                action[coarseIndex(Math.floor(x / 2), Math.floor(y / 2),
                    Math.floor(z / 2))] += value / 8;
            }
        }
        return action;
    });
    let energy = 0;
    for (let row = 0; row < coarse.length; row += 1) {
        for (let column = 0; column < coarse.length; column += 1) {
            near(matrixColumns[column][row], matrixColumns[row][column], 2e-12,
                `RAP symmetry ${row},${column}`);
            energy += coarse[row] * matrixColumns[column][row] * coarse[column];
        }
    }
    assert.ok(energy > 0, `RAP energy must be positive, got ${energy}`);
});

test("aggregation V-cycles monotonically converge dense and disconnected media", () => {
    const dimensions = [16, 16, 16];
    const count = 16 ** 3;
    const index = (x, y, z) => x + 16 * (y + 16 * z);
    const createFields = (sparse, variant = 0) => {
        const extinction = new Float64Array(count);
        const scattering = new Float64Array(count);
        const asymmetry = new Float64Array(count);
        const direct = new Float64Array(count);
        for (let z = 0; z < 16; z += 1) for (let y = 0; y < 16; y += 1) {
            for (let x = 0; x < 16; x += 1) {
                const first = (x - (4.5 + variant % 3 * 0.5)) ** 2 / 18 +
                    (y - (5.5 + variant % 2 * 0.5)) ** 2 / 12 +
                    (z - (5 + (variant + 1) % 3 * 0.35)) ** 2 / 18 < 1;
                const second = (x - (10.5 + variant % 2 * 0.4)) ** 2 / 10 +
                    (y - (10 + (variant + 1) % 3 * 0.3)) ** 2 / 15 +
                    (z - (10.5 + variant % 3 * 0.3)) ** 2 / 10 < 1;
                const occupied = !sparse || ((first || second) &&
                    (x * 3 + y * 5 + z * 7 + variant * 2) % 11 !== 0);
                if (!occupied) continue;
                const slot = index(x, y, z);
                const density = sparse ? 0.55 + 0.45 *
                    Math.sin((x + 1 + variant) * (z + 2) * 0.19) ** 2 : 1;
                extinction[slot] = 16 * density;
                scattering[slot] = 15.84 * density;
                asymmetry[slot] = 0.83;
                direct[slot] = Math.exp(-0.08 * (15 - y));
            }
        }
        return { extinction, scattering, asymmetry, direct };
    };
    for (const sparse of [false, true]) {
        const ownerCount = sparse ? 6 : 1;
        for (let variant = 0; variant < ownerCount; variant += 1) {
            const fields = createFields(sparse, variant);
            const result = cloudLight.solveCloudLightMultigridReference({
                dimensions,
                cellSizeKm: [0.055, 0.05, 0.06],
                extinctionPerKm: fields.extinction,
                scatteringPerKm: fields.scattering,
                asymmetry: fields.asymmetry,
                directIncidentIrradiance: fields.direct,
                faceIrradiance: [0, 0, 0, 0, 0, 0],
                vCycles: 4,
                multigridLevels: 4,
            });
            assert.equal(result.nonFiniteCount, 0);
            assert.ok(result.occupiedCount > 0);
            for (const value of result.fluence) {
                assert.ok(Number.isFinite(value) && value >= 0,
                    "published fine-grid fluence must remain nonnegative");
            }
            result.normalizedResidualByCycle.forEach((residual, cycle) => {
                if (cycle > 0) assert.ok(residual <=
                    result.normalizedResidualByCycle[cycle - 1] + 1e-12,
                `${sparse ? "sparse" : "dense"} owner ${variant} cycle ` +
                    `${cycle + 1} regressed: ` +
                    result.normalizedResidualByCycle.join(", "));
            });
            assert.ok(result.maximumNormalizedResidual <= 0.02,
                `${sparse ? "sparse" : "dense"} owner ${variant} RAP ` +
                    `residuals: ${result.normalizedResidualByCycle.join(", ")}`);
        }
    }
});

test("current tiled atlas qualifies within the residual-gated cycle ceiling", () => {
    const manifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-macro-atlas-v2.json",
        import.meta.url,
    ), "utf8"));
    const atlasBytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.atlas.file}`,
        import.meta.url,
    ));
    assert.equal(manifest.atlas.volumeCount, manifest.volumes.length,
        "the packed atlas count must match its materialized volume table");
    assert.equal(manifest.atlas.volumeCount,
        cloudMacroAtlas.CLOUD_MACRO_VOLUME_IDS.length,
        "the packed atlas count must track the runtime volume ABI");
    assert.equal(cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumVCycles, 8,
        "production retains a bounded eight-cycle cross-brick refinement ceiling");

    // This is the broadest physical Cu exemplar selected by the three-owner
    // congestus benchmark. Reconstruct its conservative filterable support at
    // production light-volume resolution. The smooth cross-volume source
    // gradient represents the exact directional Beer field's long shadow mode
    // without embedding a hand-authored solver pattern.
    const volume = manifest.volumes.find(
        ({ id }) => id === "cu-congestus-multicell");
    assert.ok(volume);
    const dimensions = [48, 32, 48];
    const count = dimensions.reduce((product, value) => product * value, 1);
    const extinction = new Float64Array(count);
    const scattering = new Float64Array(count);
    const asymmetry = new Float64Array(count);
    const direct = new Float64Array(count);
    const supportDistanceVoxels =
        volume.exteriorBoundary.maximumOutwardDisplacementVoxels +
        volume.exteriorBoundary.interpolationHaloVoxels;
    const smoothstep = (value) => {
        const amount = Math.max(0, Math.min(1, value));
        return amount * amount * (3 - 2 * amount);
    };
    let occupied = 0;
    for (let z = 0; z < dimensions[2]; z += 1) {
        for (let y = 0; y < dimensions[1]; y += 1) {
            const atlasY = Math.round(y / (dimensions[1] - 1) * 47);
            for (let x = 0; x < dimensions[0]; x += 1) {
                const atlasIndex = (((volume.zOffset + z) *
                    manifest.atlas.dimensions.height + volume.yOffset + atlasY) *
                    manifest.atlas.dimensions.width + volume.xOffset + x) * 4;
                const index = x + dimensions[0] *
                    (y + dimensions[1] * z);
                const coreDensity = atlasBytes[atlasIndex] / 255;
                const signedDistanceVoxels =
                    (atlasBytes[atlasIndex + 3] - 128) / 127 * 12;
                let density = coreDensity;
                if (signedDistanceVoxels > 0 &&
                    signedDistanceVoxels <= supportDistanceVoxels) {
                    density = Math.max(density, 0.045 * Math.pow(
                        1 - signedDistanceVoxels / supportDistanceVoxels,
                        1.2,
                    ));
                }
                if (density <= 1e-5) continue;
                occupied += 1;
                extinction[index] = density * 18;
                scattering[index] = extinction[index] * 0.999;
                asymmetry[index] = 0.9;
                direct[index] = 0.01 + 0.99 * smoothstep(
                    (x - 12) / 24,
                );
            }
        }
    }
    const result = cloudLight.solveCloudLightMultigridReference({
        dimensions,
        cellSizeKm: [0.12, 0.084, 0.12],
        extinctionPerKm: extinction,
        scatteringPerKm: scattering,
        asymmetry,
        directIncidentIrradiance: direct,
        faceIrradiance: [0, 0, 0, 0, 0, 0],
        multigridLevels: 4,
    });
    assert.equal(occupied, 14_437,
        "fixture must remain tied to the final filtered multi-crown Cu support");
    assert.equal(result.occupiedCount, occupied);
    assert.equal(result.nonFiniteCount, 0);
    for (const value of result.fluence) {
        assert.ok(Number.isFinite(value) && value >= 0,
            "production Cu fluence must remain nonnegative");
    }
    assert.equal(result.normalizedResidualByCycle.length,
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maximumVCycles,
        "CPU reference must inherit the production residual-gated cycle ceiling");
    result.normalizedResidualByCycle.forEach((residual, cycle) => {
        if (cycle > 0) assert.ok(residual <=
            result.normalizedResidualByCycle[cycle - 1] + 1e-12,
        `Cu residual regressed: ${result.normalizedResidualByCycle.join(", ")}`);
    });
    assert.ok(result.normalizedResidualByCycle[0] >
        result.normalizedResidualByCycle[4],
        "the bounded Cu solve must materially reduce its initial residual");
    assert.ok(result.normalizedResidualByCycle[2] <= 0.02,
        "the production Cu field must qualify by cycle three: " +
            result.normalizedResidualByCycle.join(", "));
    assert.ok(result.normalizedResidualByCycle[4] <= 0.02,
        `bounded cycle ceiling failed: ${result.normalizedResidualByCycle.join(", ")}`);
});

test("all legal odd smoothing configurations finish in the published field", () => {
    for (const [pre, post, coarse] of [[1, 1, 3], [3, 3, 5]]) {
        const preParity = cloudLight.resolveCloudLightVolumeSmoothingParity(
            pre, "packed");
        const coarseParity = cloudLight.resolveCloudLightVolumeSmoothingParity(
            coarse, "packed");
        const postParity = cloudLight.resolveCloudLightVolumeSmoothingParity(
            post, "scratch");
        assert.equal(preParity.requiresScratchSeed, true);
        assert.equal(coarseParity.requiresScratchSeed, true);
        assert.equal(preParity.endsPacked, true);
        assert.equal(coarseParity.endsPacked, true);
        assert.equal(postParity.endsPacked, true);
    }
    const previousPost = cloudLight.resolveCloudLightVolumeSmoothingParity(
        2, "scratch");
    const productionPost = cloudLight.resolveCloudLightVolumeSmoothingParity(
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.postSmoothIterations,
        "scratch",
    );
    assert.equal(previousPost.endsPacked, false);
    assert.equal(productionPost.endsPacked, true);
    assert.equal(2 + Number(!previousPost.endsPacked),
        cloudLight.CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.postSmoothIterations +
            Number(!productionPost.endsPacked),
        "the third relaxation must replace, not add to, the publication pass");
});

test("P1 reconstruction is realizable after current limiting", () => {
    for (const direction of [[1, 0, 0], [-1, 0, 0], [0, 1, 0]]) {
        assert.ok(cloudLight.reconstructCloudLightP1Radiance(
            2, [50, -20, 4], direction) >= 0);
    }
    near(cloudLight.reconstructCloudLightP1Radiance(
        2, [0, 0, 0], [0, 1, 0]), 2 / (4 * Math.PI), 1e-14);
});

test("WGSL kernels expose isolated bounded passes and owner sampling", () => {
    const compute = cloudLightWgsl.CLOUD_LIGHT_VOLUME_COMPUTE_WGSL;
    const sample = cloudLightWgsl.CLOUD_LIGHT_VOLUME_SAMPLING_WGSL;
    // `active` is reserved by WGSL. Keep the generated source valid on the
    // browser compiler used by production, not only permissive test parsers.
    assert.doesNotMatch(compute, /\bactive\s*:/);
    assert.doesNotMatch(compute, /\blet\s+active\b/);
    assert.match(compute, /fn cloud_lv_materialize_medium_compute/);
    assert.match(compute, /fn cloud_lv_materialize_source_0_compute/);
    assert.match(compute, /fn cloud_lv_materialize_source_1_compute/);
    assert.match(compute, /fn cloud_lv_direct_source_0_compute/);
    assert.match(compute, /fn cloud_lv_direct_source_1_compute/);
    assert.match(compute, /fn cloud_lv_project_boundary_compute/);
    assert.match(compute, /fn cloud_lv_clear_fluence_compute/);
    assert.match(compute, /fn cloud_lv_restrict_medium_compute/);
    assert.match(compute, /fn cloud_lv_smooth_compute/);
    assert.match(compute, /fn cloud_lv_restrict_residual_compute/);
    assert.match(compute, /fn cloud_lv_prolongate_compute/);
    assert.match(compute, /fn cloud_lv_aggregate_equation_terms/);
    assert.match(compute, /Matrix-free cell-aggregation Galerkin operator/);
    assert.match(compute, /let fine_start = local \* aggregate_scale/);
    assert.match(compute, /if \(all\(neighbor_aggregate == local\)\) \{ continue; \}/);
    assert.match(compute,
        /let coarse = local \/ vec3<u32>\(2u\)[\s\S]*?cloud_lv_packed_load_at_mip/);
    assert.doesNotMatch(compute, /let coarse_center =/);
    assert.match(compute, /fn cloud_lv_measure_residual_compute/);
    assert.match(compute, /maximum_normalized_residual_bits/);
    assert.match(compute, /CLOUD_LV_BOUNDARY_TRUNCATED/);
    assert.match(compute, /cloud_lv_work_brick_index/);
    assert.match(compute, /fn cloud_lv_slab_local_z/);
    assert.match(compute, /fn cloud_lv_slab_contains/);
    const sourceMaterialize = compute.slice(
        compute.indexOf("fn cloud_lv_materialize_source_compute_impl"),
        compute.indexOf("fn cloud_lv_direct_source_compute_impl"),
    );
    const directScan = compute.slice(
        compute.indexOf("fn cloud_lv_direct_source_compute_impl"),
        compute.indexOf("fn cloud_lv_direct_trilinear"),
    );
    assert.match(sourceMaterialize, /@workgroup_size\(4, 4, 1\)/);
    assert.doesNotMatch(sourceMaterialize,
        /cloud_lv_representative_brick_index/,
        "source materialization relies on the host representative proof instead of a divergent per-invocation storage scan");
    assert.match(sourceMaterialize, /cloud_lv_query_world_medium\(/);
    assert.match(sourceMaterialize,
        /invocation\.y >= CLOUD_LV_HEIGHT/);
    assert.doesNotMatch(sourceMaterialize,
        /for \(var child_y = 0u; child_y < 2u/);
    assert.match(sourceMaterialize,
        /textureStore\(cloud_lv_fluence_write, atlas, vec4<f32>\(/);
    assert.match(directScan,
        /for \(var y = i32\(CLOUD_LV_HEIGHT\) - 1; y >= 0; y -= 1\)/);
    assert.match(directScan,
        /textureLoad\(\s*cloud_lv_fluence_read, representative_atlas, 0\)/);
    assert.match(directScan, /transmittance \*= half_step \* half_step/);
    assert.doesNotMatch(directScan, /cloud_lv_query_world_medium\(/);
    assert.match(compute, /face_y_input >= f32\(CLOUD_LV_HEIGHT\)/);
    assert.match(compute, /let face_y = max\(0\.0, face_y_input\)/);
    assert.match(sample, /fn cloud_lv_sample_direct_face_transmittance\(/);
    assert.match(compute, /for \(var face = 0u; face < 6u; face \+= 1u\)/);
    assert.match(compute, /2\.0 \* diffusion \* neighbor_diffusion/);
    assert.match(compute, /scattering \* incident_direct/);
    assert.match(compute, /coefficient \* 4\.0 \* max/);
    assert.doesNotMatch(compute, /cloud_passive_directional_multiple_scattering/);
    assert.match(sample, /@group\(1\) @binding\(0\)/);
    assert.match(sample, /@group\(1\) @binding\(1\).*cloud_lv_packed_view/s);
    assert.doesNotMatch(sample, /cloud_lv_sample_extinction/);
    assert.doesNotMatch(sample, /cloud_lv_sample_scattering/);
    assert.doesNotMatch(sample, /cloud_lv_sample_direct_0/);
    assert.doesNotMatch(sample, /cloud_lv_sample_direct_1/);
    assert.match(sample, /fn cloud_lv_sample_owner_direct_transmittance/);
    assert.match(sample, /fn cloud_lv_sample_layer_direct_transmittance/);
    assert.match(sample, /fn cloud_lv_layer_ready/);
    assert.match(sample, /fn cloud_lv_owner_resident/);
    assert.match(sample, /fn cloud_lv_owner_has_sample/);
    assert.match(sample, /fn cloud_lv_owner_sample_confidence/);
    assert.match(sample,
        /fn cloud_lv_sample_complete_owner_diffuse_safe/);
    assert.match(sample,
        /CLOUD_LV_SAMPLE_RESIDENT_SOURCE_MEDIUM_BIT: u32 = 1024u/);
    const confidence = sample.slice(
        sample.indexOf("fn cloud_lv_owner_sample_confidence"),
        sample.indexOf("fn cloud_lv_sample_packed_trilinear"),
    );
    assert.match(confidence,
        /!cloud_lv_layer_ready\(cloud_lv_sample_layer_index\(brick\)\)/,
        "mixed-residency layers must use one analytic higher-order closure");
    assert.match(confidence,
        /!cloud_lv_sample_complete_owner_diffuse_safe\(brick\)/,
        "partial owners must retain exact Beer but cannot expose box-shaped P1");
    assert.match(sample, /smoothstep\(0\.0, 2\.0/);
    assert.match(sample, /fn cloud_lv_sample_owner_scattering_radiance/);
    assert.match(sample, /maximum_current = phi\[channel\] \/ 3\.0/);
    assert.match(sample,
        /phi\[channel\] \+ 3\.0 \*\s*dot\(current, direction\)/);
    assert.doesNotMatch(sample,
        /3\.0 \*\s*clamp\(asymmetry_rgb/,
        "P1 reconstruction must not apply anisotropy after transport reduction");
    assert.doesNotMatch(sample,
        /cloud_lv_sample_owner_scattering_radiance\([\s\S]*?asymmetry_rgb/,
        "the solved P1 moments are sufficient for angular reconstruction");
    assert.match(sample, /owner_atlas_tau_schema\.x/);
    assert.match(sample, /ready_mask_count_schema_bank\.w/);

    const directCompute = compute.slice(
        compute.indexOf("fn cloud_lv_direct_trilinear"),
        compute.indexOf("fn cloud_lv_all_owner_direct_transmittance"),
    );
    const directSample = sample.slice(
        sample.indexOf("fn cloud_lv_sample_direct_face_transmittance"),
        sample.indexOf("fn cloud_lv_owner_has_sample"),
    );
    for (const direct of [directCompute, directSample]) {
        assert.match(direct, /let clear_x = clamp\(2\.0 \* min\(/);
        assert.match(direct, /let clear_z = clamp\(2\.0 \* min\(/);
        assert.match(direct,
            /let bounded = clamp\(result, vec3<f32>\(0\.0\), vec3<f32>\(1\.0\)\);\s*if \(guard_density >= 1\.0\) \{ return bounded; \}/,
        "interior source visibility must bypass a redundant Beer log/exp round trip");
        assert.match(direct,
            /exp\(log\(max\(vec3<f32>\(1e-30\), bounded\)\) \* guard_density\)/,
        "source visibility must reach clear air continuously in Beer space");
    }
    const sourceMaterializeGuard = sourceMaterialize.slice(
        sourceMaterialize.indexOf("let guard_column"),
        sourceMaterialize.indexOf("if (paired_y)"));
    assert.match(compute, /const CLOUD_LV_DIRECT_GUARD_X: u32 = 2u/);
    assert.match(compute, /const CLOUD_LV_DIRECT_GUARD_Z: u32 = 2u/);
    assert.match(sourceMaterializeGuard,
        /fine_local\.x < CLOUD_LV_DIRECT_GUARD_X/);
    assert.match(sourceMaterializeGuard,
        /fine_local\.z >= CLOUD_LV_DEPTH - CLOUD_LV_DIRECT_GUARD_Z/);
    assert.match(sourceMaterializeGuard,
        /textureStore\(cloud_lv_fluence_write,[\s\S]*?vec4<f32>\(0\.0\)\)/,
        "the exact full-owner Beer domain must contain stored empty guard columns");

    const ownerScattering = sample.slice(
        sample.indexOf("fn cloud_lv_sample_owner_scattering_radiance"),
        sample.indexOf("`;", sample.indexOf(
            "fn cloud_lv_sample_owner_scattering_radiance")),
    );
    assert.match(ownerScattering,
        /!cloud_lv_layer_ready\(cloud_lv_sample_layer_index\(brick\)\)/,
        "all P1 consumers must fail closed to the layer-coherent analytic path");

    const halo = compute.slice(
        compute.indexOf("fn cloud_lv_halo_sample"),
        compute.indexOf("fn cloud_lv_fine_equation_terms"),
    );
    assert.match(halo,
        /cloud_lv_owner_index\(sibling\) != current_owner/,
        "unrelated owners cannot become finite-volume sibling cells");
    assert.match(halo, /weighted_fluence \/ weight_sum/);
    assert.match(halo, /weighted_diffusion \/ weight_sum/);
    assert.doesNotMatch(halo,
        /return CloudLvHalo\(1u,[\s\S]{0,180}?sibling, level\)/,
        "overlapping siblings require a partition-of-unity halo, not first-hit selection");

    // A virtual clear face spans only the missing half cell. Interpolating
    // optical depth (not T) is continuous, monotone, and exactly clear at the
    // finite-domain boundary for every passive stored edge value.
    for (const stored of [1, 0.8, 0.2, 1e-6]) {
        const guarded = (center) => {
            const density = Math.max(0, Math.min(1, 2 * (center + 0.5)));
            const bounded = Math.max(0, Math.min(1, stored));
            if (density >= 1) return bounded;
            return Math.exp(Math.log(Math.max(1e-30, bounded)) * density);
        };
        assert.equal(guarded(-0.5), 1);
        assert.equal(guarded(0), stored,
            "interior guard must preserve the sampled value exactly");
        let previous = guarded(-0.5);
        for (let step = 1; step <= 100; step += 1) {
            const current = guarded(-0.5 + step * 0.005);
            assert.ok(current <= previous + 1e-14);
            previous = current;
        }
    }

    const custom = cloudLightWgsl.createCloudLightVolumeComputeWgsl({
        bindingGroup: 2,
        worldMediumFunctionWgsl: `fn cloud_lv_query_world_medium(
            position: vec3<f32>, owner: u32) -> CloudLvWorldMedium {
            return CloudLvWorldMedium(vec3<f32>(position.x), vec3<f32>(f32(owner)),
                vec3<f32>(0.8), 1.0);
        }`,
    });
    assert.match(custom, /vec3<f32>\(f32\(owner\)\)/);
    assert.match(custom, /@group\(2\) @binding\(12\)/);
});

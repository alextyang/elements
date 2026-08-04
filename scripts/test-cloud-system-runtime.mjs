import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";
import {
    analyzeCloudAtlasProductionPixelSilhouette,
    analyzeCloudAtlasProductionRadialSilhouette,
    analyzeCloudAtlasProductionPerspectiveProjection,
    decodeCloudAtlasVolume,
    projectCloudAtlasDensityProductionPerspective,
} from "./lib/cloud-atlas-projection-qualification.mjs";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-runtime-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "camera-contract",
    "cloud-scene",
    "cloud-state-map",
    "cloud-special-origin-source",
    "cloud-morphology-modifiers",
    "high-cloud-physical-foundation",
    "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "low-layered-cloud-topology-qualification",
    "upper-atmospheric-cloud-foundation",
    "cloud-family-admissibility",
    "cloud-family-production-adapter",
    "cloud-atlas-material-profile",
    "cloud-system-runtime",
    "cloud-world-frame",
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
    "cloud-photograph-orthogonal-benchmark",
]) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText
        .replaceAll('"./cloud-scene"', '"./cloud-scene.mjs"')
        .replaceAll('"./camera-contract"', '"./camera-contract.mjs"')
        .replaceAll('"./cloud-state-map"', '"./cloud-state-map.mjs"')
        .replaceAll('"./cloud-special-origin-source"',
            '"./cloud-special-origin-source.mjs"')
        .replaceAll('"./cloud-morphology-modifiers"',
            '"./cloud-morphology-modifiers.mjs"')
        .replaceAll('"./high-cloud-physical-foundation"',
            '"./high-cloud-physical-foundation.mjs"')
        .replaceAll('"./middle-cloud-physical-foundation"',
            '"./middle-cloud-physical-foundation.mjs"')
        .replaceAll('"./low-layered-cloud-physical-foundation"',
            '"./low-layered-cloud-physical-foundation.mjs"')
        .replaceAll('"./low-layered-cloud-topology-qualification"',
            '"./low-layered-cloud-topology-qualification.mjs"')
        .replaceAll('"./upper-atmospheric-cloud-foundation"',
            '"./upper-atmospheric-cloud-foundation.mjs"')
        .replaceAll('"./cloud-family-admissibility"',
            '"./cloud-family-admissibility.mjs"')
        .replaceAll('"./cloud-family-production-adapter"',
            '"./cloud-family-production-adapter.mjs"')
        .replaceAll('"./cloud-atlas-material-profile"',
            '"./cloud-atlas-material-profile.mjs"')
        .replaceAll('"./cloud-system-runtime"',
            '"./cloud-system-runtime.mjs"')
        .replaceAll('"./cloud-photograph-benchmark"',
            '"./cloud-photograph-benchmark.mjs"')
        .replaceAll('"./cloud-morphology-photograph-qualification"',
            '"./cloud-morphology-photograph-qualification.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const runtimeModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-system-runtime.mjs")}`)
);
const cameraModule = await import(
    new URL(`file://${join(temporaryRoot, "camera-contract.mjs")}`)
);
const cloudWorldFrameModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-world-frame.mjs")}`)
);
const sceneModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-scene.mjs")}`)
);
const stateMapModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-state-map.mjs")}`)
);
const morphologyModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-morphology-modifiers.mjs")}`)
);
const morphologyManifest = morphologyModule
    .validateCloudMorphologyModifierManifest(JSON.parse(readFileSync(
        new URL("../public/assets/sky/cloud-morphology-modifiers-v1.json",
            import.meta.url),
        "utf8",
    )));
const benchmarkModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-photograph-benchmark.mjs")}`)
);
const orthogonalBenchmarkModule = await import(
    new URL(`file://${join(
        temporaryRoot,
        "cloud-photograph-orthogonal-benchmark.mjs",
    )}`)
);
const rendererSource = readFileSync(
    new URL("../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url),
    "utf8",
);
const cloudMacroAtlasManifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-macro-atlas-v2.json", import.meta.url),
    "utf8",
));
const cloudMacroAtlasBytes = readFileSync(new URL(
    `../public/assets/sky/${cloudMacroAtlasManifest.atlas.file}`,
    import.meta.url,
));

const emptyLayer = () => ({
    genus: "clear",
    species: "generic",
    present: false,
    baseAltitude: 1200,
    thickness: 0,
    coverage: 0,
    oktas: 0,
    opticalDepth: 0,
    stratusBlend: 0,
    towerAmount: 0,
    anvilAmount: 0,
    iceFraction: 0,
    detailStrength: 0,
    windSpeed: 0,
    windDirection: 0,
    shear: 0,
    turbulence: 0,
    precipitation: 0,
    organization: "unorganized",
    lifecycle: 0.5,
    organizationStrength: 0,
});

const congestusLayer = {
    genus: "cumulus",
    species: "cumulus-congestus",
    present: true,
    baseAltitude: 920,
    thickness: 3900,
    coverage: 0.75,
    oktas: 6,
    opticalDepth: 0.86,
    stratusBlend: 0,
    towerAmount: 0.82,
    anvilAmount: 0,
    iceFraction: 0.08,
    detailStrength: 0.91,
    windSpeed: 10,
    windDirection: 0.73,
    shear: 0.24,
    turbulence: 0.68,
    precipitation: 0.22,
    organization: "isolated",
    lifecycle: 0.43,
    organizationStrength: 0.64,
};

const scene = {
    layers: [congestusLayer, emptyLayer(), emptyLayer()],
    totalOktas: 6,
    convection: 0.72,
    instability: 0.69,
    humidity: 0.66,
    fog: 0,
    noctilucent: 0,
    seed: [0.173, 0.821, 0.412, 0.663],
};

const degrees = (value) => value * Math.PI / 180;
const productionFrameOptions = {
    azimuthRadians: 0,
    elevationRadians: degrees(27),
    horizontalFovRadians: degrees(64),
    verticalFovRadians: degrees(64 * 0.68),
};

const qualificationSeed = (value) => {
    let state = 0x811c9dc5;
    const values = [];
    for (let index = 0; index < 4; index += 1) {
        for (const character of `${value}:${index}`) {
            state ^= character.charCodeAt(0);
            state = Math.imul(state, 0x01000193);
        }
        values.push((state >>> 0) / 0x1_0000_0000);
    }
    return values;
};

const sceneWithLayer = (layer, layerIndex = 0, overrides = {}) => {
    const layers = [emptyLayer(), emptyLayer(), emptyLayer()];
    layers[layerIndex] = layer;
    return {
        ...scene,
        ...overrides,
        layers,
        totalOktas: layer.oktas,
    };
};

const qualificationScene = ({
    targetId,
    classification,
    environment,
    layerRequest,
    sceneOverrides = {},
}) => {
    const layer = sceneModule.createLayer({
        latitude: environment.latitude,
        season: environment.season,
        ...layerRequest,
    });
    const layerIndex = classification.genus === "cirrus" ||
        classification.genus === "cirrocumulus" ||
        classification.genus === "cirrostratus" ? 2
        : classification.genus === "altocumulus" ||
            classification.genus === "altostratus" ||
            classification.genus === "nimbostratus" ? 1 : 0;
    const layers = [
        { ...sceneModule.EMPTY_LAYER },
        { ...sceneModule.EMPTY_LAYER },
        { ...sceneModule.EMPTY_LAYER },
    ];
    layers[layerIndex] = layer;
    return sceneModule.constrainScene({
        layers,
        totalOktas: layer.oktas,
        convection: environment.boundaryLayer === "convective" ? 0.38 : 0.08,
        instability: environment.boundaryLayer === "convective" ? 0.42 : 0.12,
        humidity: environment.relativeHumidity,
        fog: 0,
        noctilucent: 0,
        classifications: [{
            layerIndex,
            scope: "layer",
            classification,
            relation: "independent",
        }],
        latitude: environment.latitude,
        season: environment.season,
        solarDepression: 0,
        stratosphericTemperatureKelvin: 205,
        mesopauseTemperatureKelvin: 190,
        seed: qualificationSeed(targetId),
        ...sceneOverrides,
    });
};

const rangeOf = ({ state }) => Math.hypot(
    state.extent.centerEastKm,
    state.extent.centerNorthKm,
);

const projection = (runtime, options) =>
    runtimeModule.estimateCloudPopulationProjection(runtime.systems, {
        sampleCount: 8192,
        ...options,
    });

test("Cirrocumulus lenticularis lacunosus keeps its exact cellular lens producer", () => {
    const caseId =
        "variety-lacunosus--clean-side-day--zenith-wide--broken";
    const benchmarkCase = orthogonalBenchmarkModule
        .resolveOrthogonalCloudPhotographCase(caseId);
    assert.ok(benchmarkCase, caseId);
    const cloudRuntime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    assert.deepEqual(cloudRuntime.diagnostics, [], caseId);
    const owners = cloudRuntime.systems.filter(({ state }) =>
        state.classification.genus === "cirrocumulus" &&
        state.classification.species === "lenticularis" &&
        state.classification.varieties.includes("lacunosus"));
    assert.ok(owners.length > 0, `${caseId}: lacunosus anchor was discarded`);
    for (const owner of owners) {
        assert.equal(owner.state.organization.kind, "cellular", owner.state.id);
        assert.equal(owner.state.organization.topology, "lacunar", owner.state.id);
        assert.equal(owner.compiled.macroTopology, "wave-lens-train", owner.state.id);
        assert.equal(owner.familyProduction?.representation,
            "cirrocumulus-lenticularis", owner.state.id);
        assert.deepEqual(stateMapModule.validateCloudSystem(owner.state), [],
            owner.state.id);
    }

    const ordinaryCellularLens = structuredClone(owners[0].state);
    ordinaryCellularLens.classification.varieties = [];
    assert.ok(stateMapModule.validateCloudSystem(ordinaryCellularLens).some(
        ({ code }) => code === "incompatible-organization",
    ), "ordinary Cc lenticularis must remain incompatible with cellular layout");
    const closedLacunosusLens = structuredClone(owners[0].state);
    closedLacunosusLens.organization.topology = "closed";
    assert.ok(stateMapModule.validateCloudSystem(closedLacunosusLens).some(
        ({ code }) => code === "lacunosus-without-open-cells",
    ), "closed cells must not enter the exact lacunosus exception");

    const frame = runtimeModule.estimateCloudFrameProjection(owners, {
        azimuthRadians: 0,
        elevationRadians: degrees(72),
        horizontalFovRadians: degrees(84),
        verticalFovRadians: degrees(57),
    });
    assert.ok(frame.visibleOwnerCount > 0 && frame.supportFraction > 0,
        `${caseId}: exact cellular lens has no production-frame support`);
});

test("world systems are deterministic and independent of camera orbit or FOV", () => {
    const first = runtimeModule.createCloudSystemRuntime(structuredClone(scene));
    const cameraA = { azimuth: -1.2, elevation: 0.18, horizontalFov: 32 };
    const cameraB = { azimuth: 2.4, elevation: 1.1, horizontalFov: 118 };
    // Cameras may project the owners differently; neither can participate in
    // creating their physical center, extent, orientation, or formation state.
    assert.notDeepEqual(cameraA, cameraB);
    const second = runtimeModule.createCloudSystemRuntime(structuredClone(scene));
    const physicalRecord = (runtime) => runtime.systems.map((system) => ({
        id: system.state.id,
        extent: system.state.extent,
        formation: system.state.physical.formation,
        seeds: system.seeds,
    }));
    assert.deepEqual(physicalRecord(first), physicalRecord(second));
    assert.deepEqual(
        [...first.packedSystemData.data],
        [...second.packedSystemData.data],
    );
});

test("camera world embedding rigidly co-rotates owners, morphology, and production projection", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-spissatus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const base = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const originalCenter = [
        base.systems[0].state.extent.centerEastKm,
        base.systems[0].state.extent.centerNorthKm,
    ];
    const yaw = cameraModule.cameraYawRadiansFromViewAzimuth(
        benchmarkCase.environment.viewAzimuth,
    );
    assert.ok(Math.abs(yaw - degrees(-125)) < 1e-12);
    const embedded = cloudWorldFrameModule.embedCloudRuntimeInCameraWorld(
        base,
        yaw,
    );
    assert.equal(
        cloudWorldFrameModule.embedCloudRuntimeInCameraWorld(base, yaw),
        embedded,
        "one immutable base runtime/yaw pair should reuse one derived runtime",
    );
    assert.equal(
        cloudWorldFrameModule.embedCloudRuntimeInCameraWorld(base, 0),
        base,
        "the explicit 180-degree reference view must remain allocation-free",
    );
    assert.notEqual(embedded, base);
    assert.match(embedded.signature, /earth-frame-yaw=/);
    assert.deepEqual([
        base.systems[0].state.extent.centerEastKm,
        base.systems[0].state.extent.centerNorthKm,
    ], originalCenter, "embedding must not mutate the physical runtime cache");

    const close = (actual, expected, message, tolerance = 1e-10) =>
        assert.ok(Math.abs(actual - expected) <= tolerance,
            `${message}: expected ${expected}, received ${actual}`);
    const closeVector = (actual, expected, message) => actual.forEach(
        (value, index) => close(value, expected[index], `${message}[${index}]`),
    );
    for (let index = 0; index < base.systems.length; index += 1) {
        const source = base.systems[index];
        const target = embedded.systems[index];
        const rotatedCenter = cameraModule.rotateDirectionByCameraYaw([
            source.state.extent.centerEastKm,
            0,
            source.state.extent.centerNorthKm,
        ], yaw);
        close(target.state.extent.centerEastKm, rotatedCenter[0],
            `owner ${index} center east`);
        close(target.state.extent.centerNorthKm, rotatedCenter[2],
            `owner ${index} center north`);
        close(
            Math.hypot(target.state.extent.centerEastKm,
                target.state.extent.centerNorthKm),
            Math.hypot(source.state.extent.centerEastKm,
                source.state.extent.centerNorthKm),
            `owner ${index} range`,
        );
        const expectedOrientation =
            cloudWorldFrameModule.embedCloudOrientationInCameraWorld(
                source.state.extent.orientation,
                yaw,
            );
        close(target.state.extent.orientation, expectedOrientation,
            `owner ${index} state orientation`);
        close(target.compiled.geometry.extent.orientation, expectedOrientation,
            `owner ${index} compiled orientation`);
        close(
            target.state.physical.kinematics.windDirection,
            cloudWorldFrameModule.embedCloudOrientationInCameraWorld(
                source.state.physical.kinematics.windDirection,
                yaw,
            ),
            `owner ${index} physical wind`,
        );
        close(
            target.compiled.kinematics.windDirection,
            cloudWorldFrameModule.embedCloudOrientationInCameraWorld(
                source.compiled.kinematics.windDirection,
                yaw,
            ),
            `owner ${index} compiled wind`,
        );
        const sourceOrganization = source.state.organization;
        const targetOrganization = target.state.organization;
        if (sourceOrganization.kind === "storm-complex" &&
            targetOrganization.kind === "storm-complex") {
            close(targetOrganization.propagationDirection,
                cloudWorldFrameModule.embedCloudOrientationInCameraWorld(
                    sourceOrganization.propagationDirection, yaw),
                `owner ${index} storm propagation`);
        } else if (sourceOrganization.kind !== "storm-complex" &&
            targetOrganization.kind !== "storm-complex") {
            close(targetOrganization.orientation,
                cloudWorldFrameModule.embedCloudOrientationInCameraWorld(
                    sourceOrganization.orientation, yaw),
                `owner ${index} organization orientation`);
        } else {
            assert.fail(`owner ${index} organization kind changed during embedding`);
        }
    }

    assert.equal(embedded.morphologyRequests.length,
        base.morphologyRequests.length);
    embedded.morphologyRequests.forEach((request, index) => {
        const source = base.morphologyRequests[index].parent;
        const target = request.parent;
        closeVector(target.centerKm,
            cameraModule.rotateDirectionByCameraYaw(source.centerKm, yaw),
            `morphology ${index} center`);
        for (const axis of ["axisU", "axisV", "axisW"]) {
            closeVector(target[axis],
                cameraModule.rotateDirectionByCameraYaw(source[axis], yaw),
                `morphology ${index} ${axis}`);
        }
        for (const [name, anchor] of Object.entries(source.anchorsKm ?? {})) {
            closeVector(target.anchorsKm[name],
                cameraModule.rotateDirectionByCameraYaw(anchor, yaw),
                `morphology ${index} anchor ${name}`);
        }
    });

    const camera = {
        azimuthRadians: 0,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
        observerAltitudeKm:
            benchmarkCase.environment.composition.observerAltitude,
    };
    const baseFrame = runtimeModule.estimateCloudFrameProjection(
        base.systems,
        camera,
    );
    const embeddedFrame = runtimeModule.estimateCloudFrameProjection(
        embedded.systems,
        { ...camera, azimuthRadians: yaw },
    );
    close(embeddedFrame.supportFraction, baseFrame.supportFraction,
        "co-rotated production support", 1e-8);
    close(embeddedFrame.negativeSkyFraction, baseFrame.negativeSkyFraction,
        "co-rotated negative sky", 1e-8);
    assert.equal(embeddedFrame.visibleOwnerCount, baseFrame.visibleOwnerCount);
    assert.deepEqual(embeddedFrame.edgeContacts, baseFrame.edgeContacts);
});

test("production uploads are sourced from the physical runtime", () => {
    assert.match(rendererSource,
        /createCloudRuntimeForRadiance\(\s*current\.radiance/);
    assert.match(rendererSource,
        /embedCloudRuntimeInCameraWorld\(\s*createCloudSystemRuntime/);
    assert.match(rendererSource,
        /cloudRuntime\.packedSystemData\.data/);
    assert.match(rendererSource,
        /cloudRuntime\.legacyFeatureData/);
    assert.equal([
        ...rendererSource.matchAll(/createCameraAuthoredLegacyCloudFeatureData\s*=\s*\(/g),
    ].length, 1);
    assert.equal([
        ...rendererSource.matchAll(/createCameraAuthoredLegacyCloudFeatureData\(/g),
    ].length, 0);
});

test("several finite systems coexist in one altitude layer", () => {
    const runtime = runtimeModule.createCloudSystemRuntime(scene);
    assert.deepEqual(runtime.diagnostics, []);
    assert.ok(runtime.systems.length >= 4);
    assert.ok(runtime.systems.every((system) => system.layerIndex === 0));
    assert.equal(
        new Set(runtime.systems.map((system) =>
            system.state.physical.baseAltitudeKm)).size,
        1,
    );
    assert.ok(new Set(runtime.systems.map((system) =>
        `${system.state.extent.centerEastKm}:${system.state.extent.centerNorthKm}`)).size > 1);
});

test("family foundations materially drive runtime and exact packed values", () => {
    const cases = [
        {
            name: "Ci", family: "high", layerIndex: 2,
            layer: {
                ...congestusLayer, genus: "cirrus", species: "cirrus-fibratus",
                baseAltitude: 9_000, thickness: 900, iceFraction: 1,
                towerAmount: 0, precipitation: 0, organization: "banded",
            },
        },
        {
            name: "Cc", family: "high", layerIndex: 2,
            layer: {
                ...congestusLayer, genus: "cirrocumulus",
                species: "cirrocumulus-stratiformis", baseAltitude: 8_200,
                thickness: 600, iceFraction: 0.94, towerAmount: 0,
                precipitation: 0, organization: "closed-cell",
            },
        },
        {
            name: "Ac", family: "middle", layerIndex: 1,
            layer: {
                ...congestusLayer, genus: "altocumulus",
                species: "altocumulus-stratiformis", baseAltitude: 3_300,
                thickness: 1_000, iceFraction: 0.28, towerAmount: 0.08,
                precipitation: 0, organization: "closed-cell",
            },
        },
        {
            name: "As", family: "middle", layerIndex: 1,
            layer: {
                ...congestusLayer, genus: "altostratus",
                species: "altostratus-opacus", baseAltitude: 3_000,
                thickness: 2_300, iceFraction: 0.42, towerAmount: 0,
                precipitation: 0.1, organization: "frontal",
            },
        },
        {
            name: "Ns", family: "low-layered", layerIndex: 1,
            layer: {
                ...congestusLayer, genus: "nimbostratus",
                species: "nimbostratus-praecipitatio", baseAltitude: 800,
                thickness: 4_800, iceFraction: 0.34, towerAmount: 0,
                precipitation: 0.78, organization: "frontal",
            },
        },
        {
            name: "Sc", family: "low-layered", layerIndex: 0,
            layer: {
                ...congestusLayer, genus: "stratocumulus",
                species: "stratocumulus-stratiformis", baseAltitude: 700,
                thickness: 900, iceFraction: 0.03, towerAmount: 0.08,
                precipitation: 0.18, organization: "closed-cell",
            },
        },
        {
            name: "St", family: "low-layered", layerIndex: 0,
            layer: {
                ...congestusLayer, genus: "stratus",
                species: "stratus-nebulosus", baseAltitude: 180,
                thickness: 420, iceFraction: 0.01, towerAmount: 0,
                precipitation: 0.12, organization: "unorganized",
            },
        },
    ];
    for (const entry of cases) {
        const runtime = runtimeModule.createCloudSystemRuntime(
            sceneWithLayer(entry.layer, entry.layerIndex),
        );
        assert.deepEqual(runtime.diagnostics, [], entry.name);
        const owner = runtime.systems[0];
        assert.ok(owner, `${entry.name} produced no physical owner`);
        assert.equal(owner.familyProduction.family, entry.family, entry.name);
        assert.equal(owner.familyProduction.reachabilityQualified, true, entry.name);
        assert.ok(owner.familyProduction.topologyVariantId.length > 0, entry.name);
        if (entry.name === "St") {
            // Atlas x/z are normalized independently from y. Convert the
            // reconstructed Stratus support back through the canonical owner
            // radii before comparing it with the authored 0.42 km layer
            // depth; normalized voxel spans alone cannot establish this
            // physical aspect ratio.
            const stratusVolume = cloudMacroAtlasManifest.volumes.find(
                ({ id }) => id === "st-nebulosus",
            );
            const bounds = stratusVolume.statistics.occupiedBounds;
            const crosswindSpanKm = (bounds.maximum[0] - bounds.minimum[0]) *
                owner.state.extent.minorRadiusKm * 2;
            const downwindSpanKm = (bounds.maximum[2] - bounds.minimum[2]) *
                owner.state.extent.majorRadiusKm * 2;
            const physicalDepthKm = owner.state.physical.geometricDepthKm;
            assert.ok(crosswindSpanKm > physicalDepthKm &&
                downwindSpanKm > physicalDepthKm,
            `St reconstructed horizontal support must exceed its ${physicalDepthKm} km depth: ` +
                `${crosswindSpanKm.toFixed(3)} km x ${downwindSpanKm.toFixed(3)} km`);
        }
        assert.equal(
            owner.familyProduction.formationSpanKm,
            owner.state.extent.majorRadiusKm * 2,
            `${entry.name} formation span must define the finite owner domain`,
        );
        assert.equal(
            owner.compiled.geometry.elementScaleKm,
            owner.familyProduction.elementScaleKm,
            `${entry.name} element diameter must remain independent of formation span`,
        );
        assert.ok(
            owner.compiled.geometry.elementScaleKm <
                owner.familyProduction.formationSpanKm,
            `${entry.name} collapsed element diameter into formation span`,
        );
        const recipe = stateMapModule.CLOUD_RENDERER_RECIPES[owner.compiled.recipeId];
        assert.notEqual(
            owner.compiled.geometry.elementScaleKm,
            (recipe.elementScaleKm[0] + recipe.elementScaleKm[1]) * 0.5,
            `${entry.name} retained the data-only recipe midpoint`,
        );
        assert.equal(
            owner.compiled.material.liquidEffectiveRadiusMicrons,
            owner.state.physical.condensate.dropletEffectiveRadius,
            entry.name,
        );
        assert.equal(
            owner.compiled.material.iceEffectiveRadiusMicrons,
            owner.state.physical.condensate.iceEffectiveRadius,
            entry.name,
        );
        const record = (1 + 0 * runtimeModule.CLOUD_SYSTEM_VEC4_STRIDE) * 4;
        const packed = runtime.packedSystemData.data;
        assert.equal(packed[record + 6],
            Math.fround(owner.state.extent.majorRadiusKm), `${entry.name}/major`);
        assert.equal(packed[record + 7],
            Math.fround(owner.state.extent.minorRadiusKm), `${entry.name}/minor`);
        assert.equal(packed[record + 20],
            Math.fround(owner.compiled.material.extinctionKm), `${entry.name}/extinction`);
        assert.equal(packed[record + 21],
            Math.fround(owner.compiled.material.liquidFraction01), `${entry.name}/phase`);
        assert.equal(packed[record + 22],
            Math.fround(owner.compiled.material.liquidEffectiveRadiusMicrons),
            `${entry.name}/liquid-radius`);
        assert.equal(packed[record + 23],
            Math.fround(owner.compiled.material.iceEffectiveRadiusMicrons),
            `${entry.name}/ice-radius`);
    }
});

test("authored finite manifolds survive every shared family adapter exactly", () => {
    const cases = [
        {
            name: "Cirrus", layerIndex: 2,
            layer: {
                ...congestusLayer, genus: "cirrus", species: "cirrus-uncinus",
                baseAltitude: 9_200, thickness: 1_100, iceFraction: 1,
                coverage: 0.5, oktas: 4, towerAmount: 0,
                precipitation: 0, organization: "isolated",
            },
        },
        {
            name: "Cirrostratus", layerIndex: 2,
            layer: {
                ...congestusLayer, genus: "cirrostratus",
                species: "cirrostratus-nebulosus", baseAltitude: 8_300,
                thickness: 1_200, iceFraction: 1, coverage: 0.5, oktas: 4,
                towerAmount: 0, precipitation: 0, organization: "frontal",
            },
        },
        {
            name: "Altocumulus", layerIndex: 1,
            layer: {
                ...congestusLayer, genus: "altocumulus",
                species: "altocumulus-stratiformis", baseAltitude: 3_400,
                thickness: 950, iceFraction: 0.24, coverage: 0.5, oktas: 4,
                towerAmount: 0.08, precipitation: 0,
                organization: "closed-cell",
            },
        },
        {
            name: "Stratocumulus", layerIndex: 0,
            layer: {
                ...congestusLayer, genus: "stratocumulus",
                species: "stratocumulus-stratiformis", baseAltitude: 720,
                thickness: 880, iceFraction: 0.02, coverage: 0.5, oktas: 4,
                towerAmount: 0.06, precipitation: 0.12,
                organization: "closed-cell",
            },
        },
    ];
    for (const [caseIndex, entry] of cases.entries()) {
        const generated = runtimeModule.createCloudSystemRuntime(
            sceneWithLayer(entry.layer, entry.layerIndex),
        );
        assert.deepEqual(generated.diagnostics, [], `${entry.name}/generated`);
        const reference = generated.systems[0].state.extent;
        const preserveGeneratedPlacement = entry.layerIndex === 0;
        const manifold = {
            centerEastKm: preserveGeneratedPlacement
                ? reference.centerEastKm : -18 - caseIndex * 7,
            centerNorthKm: preserveGeneratedPlacement
                ? reference.centerNorthKm : 42 + caseIndex * 13,
            majorRadiusKm: reference.majorRadiusKm,
            minorRadiusKm: Math.max(0.2, reference.minorRadiusKm * 0.87),
            orientation: reference.orientation +
                (preserveGeneratedPlacement ? 0 : 0.11),
            boundaryTransitionKm: reference.boundaryTransitionKm,
        };
        const authored = runtimeModule.createCloudSystemRuntime(
            sceneWithLayer(entry.layer, entry.layerIndex, {
                authoredSystems: [{
                    id: `authored-${entry.name.toLowerCase()}`,
                    layerIndex: entry.layerIndex,
                    layer: entry.layer,
                    manifold,
                }],
            }),
        );
        assert.deepEqual(authored.diagnostics, [], entry.name);
        assert.equal(authored.systems.length, 1, entry.name);
        const owner = authored.systems[0];
        assert.deepEqual(owner.state.extent, manifold,
            `${entry.name} family adaptation replaced its authored world domain`);
        assert.deepEqual(owner.compiled.geometry.extent, manifold, entry.name);
        assert.equal(owner.familyProduction.formationSpanKm,
            manifold.majorRadiusKm * 2, entry.name);
        const record = 1 * 4;
        assert.deepEqual([
            authored.packedSystemData.data[record + 4],
            authored.packedSystemData.data[record + 5],
            authored.packedSystemData.data[record + 6],
            authored.packedSystemData.data[record + 7],
            authored.packedSystemData.data[record + 10],
            authored.packedSystemData.data[record + 11],
        ], [
            Math.fround(manifold.centerEastKm),
            Math.fround(manifold.centerNorthKm),
            Math.fround(manifold.majorRadiusKm),
            Math.fround(manifold.minorRadiusKm),
            Math.fround(manifold.orientation),
            Math.fround(manifold.boundaryTransitionKm),
        ], `${entry.name} packed record diverged from its authored manifold`);
    }
});

test("Cu and Cb retain their specialized production paths", () => {
    const cumulus = runtimeModule.createCloudSystemRuntime(scene);
    const cumulonimbus = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer,
        genus: "cumulonimbus",
        species: "cumulonimbus-capillatus-incus",
        baseAltitude: 700,
        thickness: 12_400,
        coverage: 0.875,
        oktas: 7,
        opticalDepth: 1,
        towerAmount: 0.96,
        anvilAmount: 0.92,
        iceFraction: 0.52,
        precipitation: 0.92,
        lifecycle: 0.72,
        organizationStrength: 0.96,
    }, 0, { convection: 1, instability: 0.98, humidity: 0.82 }));
    for (const runtime of [cumulus, cumulonimbus]) {
        assert.deepEqual(runtime.diagnostics, []);
        assert.ok(runtime.systems.every(({ familyProduction }) =>
            familyProduction === undefined));
        for (const owner of runtime.systems) {
            const recipe = stateMapModule.CLOUD_RENDERER_RECIPES[
                owner.compiled.recipeId
            ];
            assert.equal(owner.compiled.geometry.elementScaleKm,
                (recipe.elementScaleKm[0] + recipe.elementScaleKm[1]) * 0.5);
        }
    }
});

test("four-okta congestus creates a readable cluster and broad finite field", () => {
    const layer = { ...congestusLayer, coverage: 0.5, oktas: 4 };
    const runtime = runtimeModule.createCloudSystemRuntime(sceneWithLayer(layer));
    const frame = projection(runtime, {
        azimuthRadians: 0,
        elevationRadians: degrees(21),
        horizontalFovRadians: degrees(64),
        verticalFovRadians: degrees(42),
    });
    const dome = projection(runtime);
    assert.equal(runtime.systems.length, 3);
    assert.ok(frame.visibleOwnerCount >= 2,
        `expected a dominant tree and at least one separated companion, got ${frame.visibleOwnerCount}`);
    assert.ok(frame.supportFraction >= 0.14,
        `64×42° congestus support was only ${(frame.supportFraction * 100).toFixed(1)}%`);
    assert.ok(dome.supportFraction >= 0.07,
        `full-dome congestus support was only ${(dome.supportFraction * 100).toFixed(1)}%`);
    const angularScales = runtime.systems.map(({ state }) => {
        const range = Math.hypot(state.extent.centerEastKm, state.extent.centerNorthKm);
        return state.extent.majorRadiusKm / range;
    }).sort((a, b) => b - a);
    assert.ok(angularScales[0] > angularScales[1] * 1.22,
        "four-okta congestus needs one clearly dominant readable thermal tree");
    const ranges = runtime.systems.map(rangeOf).sort((a, b) => a - b);
    assert.ok(ranges.at(-1) > ranges[0] * 1.8,
        `congestus companions must span genuinely near and distant systems: ${ranges.join(",")}`);
});

test("partial-cover Cu protects world-space source cores while permitting real occlusion", () => {
    const layer = { ...congestusLayer, coverage: 0.5, oktas: 4 };
    const first = runtimeModule.createCloudSystemRuntime(sceneWithLayer(layer));
    const second = runtimeModule.createCloudSystemRuntime(sceneWithLayer(layer));
    const footprints = first.systems.map(({ state }) =>
        runtimeModule.estimateThermalOwnerAngularFootprint(state.extent));
    assert.deepEqual(
        second.systems.map(({ state }) => state.extent),
        first.systems.map(({ state }) => state.extent),
        "thermal footprint rejection must be deterministic",
    );
    let angularOverlap = false;
    for (let left = 0; left < footprints.length; left += 1) {
        for (let right = left + 1; right < footprints.length; right += 1) {
            const leftExtent = first.systems[left].state.extent;
            const rightExtent = first.systems[right].state.extent;
            assert.ok(runtimeModule.congestusOwnerWorldClearance(
                leftExtent, [rightExtent],
            ) >= -1e-9,
            `Cu owners ${left}/${right} overlap their protected source cores`);
            const rawDifference = Math.abs(
                footprints[left].bearingRadians - footprints[right].bearingRadians,
            ) % (Math.PI * 2);
            const separation = Math.min(
                rawDifference,
                Math.PI * 2 - rawDifference,
            );
            angularOverlap ||= separation <
                footprints[left].halfWidthRadians +
                footprints[right].halfWidthRadians;
        }
    }
    assert.ok(angularOverlap,
        "world-separated Cu owners should be allowed to occlude in projection");
    assert.deepEqual(
        [...new Set(first.systems.slice(0, 3).map((system) =>
            system.topologyExemplar.ordinal))].sort(),
        [0, 1, 2],
        "the local Cu group must expose every materialized thermal genealogy",
    );
});

test("cumulus species use distinct owner populations and physical scales", () => {
    const runtimeFor = (species, thickness, towerAmount) =>
        runtimeModule.createCloudSystemRuntime(sceneWithLayer({
            ...congestusLayer,
            species,
            thickness,
            towerAmount,
            coverage: 0.5,
            oktas: 4,
            precipitation: 0,
        }));
    const humilis = runtimeFor("cumulus-humilis", 650, 0.18);
    const mediocris = runtimeFor("cumulus-mediocris", 1_650, 0.46);
    const congestus = runtimeFor("cumulus-congestus", 3_900, 0.82);
    assert.ok(humilis.systems.length >= mediocris.systems.length);
    assert.ok(mediocris.systems.length >= congestus.systems.length);
    assert.deepEqual(
        [humilis.systems.length, mediocris.systems.length, congestus.systems.length],
        [11, 9, 3],
    );
    for (const runtime of [humilis, mediocris, congestus]) {
        const ranges = runtime.systems.map(rangeOf);
        const radialBands = new Set(ranges.map((range) => Math.floor(range / 4)));
        assert.ok(radialBands.size >= 3, "Cumulus owners need at least three depth bands");
        const radii = runtime.systems.map(({ state }) => state.extent.majorRadiusKm);
        assert.ok(Math.max(...radii) > Math.min(...radii) * 1.55,
            "Cumulus owners need unequal physical scales");
        const depths = runtime.systems.map(({ state }) =>
            state.physical.geometricDepthKm);
        assert.ok(Math.max(...depths) > Math.min(...depths) * 1.25,
            "Cumulus population members cannot all terminate at one cloud top");
        const aspectPhenotypes = runtime.systems.map(({ state }) =>
            state.physical.geometricDepthKm /
                Math.max(0.01, state.extent.majorRadiusKm * 2));
        assert.ok(Math.max(...aspectPhenotypes) >
            Math.min(...aspectPhenotypes) * 1.45,
        "Cumulus population needs broad aging parcels and narrow active parcels");
        const lifecycleProgress = runtime.systems.map(({ state }) =>
            state.lifecycle.stageProgress);
        assert.ok(Math.max(...lifecycleProgress) -
            Math.min(...lifecycleProgress) > 0.12,
        "Cumulus population needs deterministic nonuniform lifecycle ages");
        assert.ok(runtime.systems.every(({ state }) =>
            state.physical.precipitation.kind === "none" ||
            state.classification.species === "congestus"));
    }
    const congestusFootprints = congestus.systems.map(({ state }) =>
        runtimeModule.estimateThermalOwnerAngularFootprint(state.extent)
            .halfWidthRadians).sort((left, right) => right - left);
    assert.ok(congestusFootprints[0] > congestusFootprints[1] * 1.35,
        "a Cu congestus group needs one readable dominant owner, not equal stamps");
});

test("reported cloud amount increases physical owner population and support", () => {
    const sparse = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer, coverage: 0.25, oktas: 2,
    }));
    const extensive = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer, coverage: 0.875, oktas: 7,
    }));
    const broken = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer, coverage: 0.5, oktas: 4,
    }));
    assert.deepEqual(
        [sparse.systems.length, broken.systems.length, extensive.systems.length],
        [2, 3, 5],
        "Cu owner populations must grow from isolated through broken to extensive",
    );
    const sparseProjection = projection(sparse);
    const extensiveProjection = projection(extensive);
    assert.ok(extensive.systems.length > sparse.systems.length);
    assert.ok(extensiveProjection.supportFraction > sparseProjection.supportFraction * 1.18,
        `2→7 okta support did not grow: ${sparseProjection.supportFraction.toFixed(3)} → ${extensiveProjection.supportFraction.toFixed(3)}`);
});

test("mature storm complexes contain distinct readable and remote cells", () => {
    const storm = {
        ...congestusLayer,
        genus: "cumulonimbus",
        species: "cumulonimbus-capillatus-incus",
        baseAltitude: 700,
        thickness: 12400,
        coverage: 0.875,
        oktas: 7,
        opticalDepth: 1,
        towerAmount: 0.96,
        anvilAmount: 0.92,
        iceFraction: 0.52,
        precipitation: 0.92,
        lifecycle: 0.72,
        organizationStrength: 0.96,
    };
    const runtime = runtimeModule.createCloudSystemRuntime(sceneWithLayer(
        storm, 0, { convection: 1, instability: 0.98, humidity: 0.82 },
    ));
    const ranges = runtime.systems.map(rangeOf).sort((a, b) => a - b);
    assert.ok(runtime.systems.length >= 2, JSON.stringify(runtime.diagnostics));
    assert.ok(ranges.at(-1) / ranges[0] >= 1.35,
        `storm cell ranges were not distinct: ${ranges.map((value) => value.toFixed(1))}`);
    assert.ok(runtime.systems.some(({ state }) => {
        const range = Math.hypot(state.extent.centerEastKm, state.extent.centerNorthKm);
        return state.extent.majorRadiusKm / range >= 0.24;
    }), "storm complex lacks a readable angular owner");
});

test("cumulonimbus phases are lifecycle-legal and storm bands place whole owners", () => {
    const storm = {
        ...congestusLayer,
        genus: "cumulonimbus",
        species: "generic",
        baseAltitude: 700,
        thickness: 12_400,
        coverage: 0.875,
        oktas: 7,
        towerAmount: 0.96,
        anvilAmount: 0.94,
        iceFraction: 0.58,
        precipitation: 0.82,
        organization: "banded",
        organizationStrength: 0.94,
    };
    const classificationAt = (lifecycle) => runtimeModule.createCloudSystemRuntime(
        sceneWithLayer({ ...storm, lifecycle, organization: "isolated" }, 0,
            { convection: 1, instability: 0.98, humidity: 0.82 }),
    ).systems[0].state.classification;
    const calvus = classificationAt(0.42);
    const capillatus = classificationAt(0.50);
    const incus = classificationAt(0.62);
    assert.equal(calvus.species, "calvus");
    assert.equal(calvus.supplementaryFeatures.includes("incus"), false);
    assert.equal(capillatus.species, "capillatus");
    assert.equal(capillatus.supplementaryFeatures.includes("incus"), false);
    assert.equal(incus.species, "capillatus");
    assert.equal(incus.supplementaryFeatures.includes("incus"), true);

    const runtime = runtimeModule.createCloudSystemRuntime(sceneWithLayer(
        { ...storm, species: "cumulonimbus-capillatus-incus", lifecycle: 0.72 }, 0,
        { convection: 1, instability: 0.98, humidity: 0.82 },
    ));
    assert.ok(runtime.systems.length >= 2, JSON.stringify(runtime.diagnostics));
    assert.ok(runtime.systems.every(({ state }) => state.organization.kind === "banded"));
    const bearings = runtime.systems.map(({ state }) => Math.atan2(
        state.extent.centerEastKm, state.extent.centerNorthKm,
    ));
    assert.ok(Math.max(...bearings) - Math.min(...bearings) > 0.10,
        "storm wall must place separate world owners along its finite axis");
});

test("partial sheets remain remote banks while overcast shields contain the observer", () => {
    const sheet = {
        ...congestusLayer,
        genus: "altostratus",
        species: "altostratus-opacus",
        baseAltitude: 3000,
        thickness: 2300,
        coverage: 0.5,
        oktas: 4,
        opticalDepth: 0.78,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0.42,
        precipitation: 0.08,
        organization: "frontal",
        turbulence: 0.14,
        organizationStrength: 0.84,
    };
    const partial = runtimeModule.createCloudSystemRuntime(sceneWithLayer(sheet, 1));
    assert.ok(partial.systems.every((system) =>
        rangeOf(system) > system.state.extent.majorRadiusKm));
    const overcast = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...sheet, coverage: 1, oktas: 8,
    }, 1));
    const containsObserver = ({ state }) => {
        const extent = state.extent;
        const downwind = [Math.cos(extent.orientation), Math.sin(extent.orientation)];
        const crosswind = [-downwind[1], downwind[0]];
        const delta = [-extent.centerEastKm, -extent.centerNorthKm];
        const majorCoordinate = (delta[0] * downwind[0] + delta[1] * downwind[1]) /
            extent.majorRadiusKm;
        const minorCoordinate = (delta[0] * crosswind[0] + delta[1] * crosswind[1]) /
            extent.minorRadiusKm;
        return majorCoordinate ** 2 + minorCoordinate ** 2 < 1;
    };
    assert.ok(overcast.systems.some(containsObserver));
    assert.ok(projection(overcast).supportFraction >= 0.72,
        "an immediate overcast shield must span most of the celestial dome");
});

test("low-layered runtime enforces finite topology, legal optics, and exclusive placement", () => {
    const lowCases = [
        {
            species: "stratus-nebulosus", genus: "stratus",
            baseAltitude: 180, thickness: 420, precipitation: 0.12,
            organization: "unorganized", iceFraction: 0.01,
        },
        {
            species: "stratocumulus-stratiformis", genus: "stratocumulus",
            baseAltitude: 700, thickness: 900, precipitation: 0.16,
            organization: "closed-cell", iceFraction: 0.03,
        },
        {
            species: "nimbostratus-praecipitatio", genus: "nimbostratus",
            baseAltitude: 800, thickness: 4_800, precipitation: 0.82,
            organization: "frontal", iceFraction: 0.36,
        },
    ];
    for (const low of lowCases) {
        const make = (coverage, oktas) => runtimeModule.createCloudSystemRuntime(
            sceneWithLayer({
                ...congestusLayer,
                ...low,
                coverage,
                oktas,
                towerAmount: low.genus === "stratocumulus" ? 0.06 : 0,
                anvilAmount: 0,
                opticalDepth: low.genus === "nimbostratus" ? 1 : 0.72,
            }, low.genus === "nimbostratus" ? 1 : 0),
        );
        const distant = low.genus === "stratocumulus"
            ? make(0.25, 2) : make(0.5, 4);
        const immediate = make(0.875, 7);
        for (const [runtime, placement] of [
            [distant, "distant-finite-system"],
            [immediate, "immediate-overcast"],
        ]) {
            const qualifications = runtimeModule.qualifyLowLayeredRuntimePopulation(
                runtime.systems,
            );
            assert.deepEqual(runtime.diagnostics, [],
                `${low.species}/${placement}: ${JSON.stringify({
                    qualifications,
                    extents: runtime.systems.map(({ state }) => state.extent),
                })}`);
            assert.equal(qualifications.length, 1);
            assert.equal(qualifications[0].valid, true,
                `${low.species}/${placement}: ${qualifications[0].violations}`);
            assert.equal(qualifications[0].placement, placement);
            assert.ok(runtime.systems.every(({ familyProduction }) =>
                familyProduction.lowLayeredDomain.placement === placement &&
                familyProduction.lowLayeredDomain.generatedFiniteSupport === true &&
                familyProduction.lowLayeredDomain.postDensityMaskWeight === 0));
        }
        assert.ok(distant.systems.every((system) => {
            const extent = system.state.extent;
            return Math.hypot(extent.centerEastKm, extent.centerNorthKm) >
                extent.minorRadiusKm;
        }), `${low.species} distant bank must remain outside the observer`);
        assert.ok(immediate.systems.some((system) => {
            const extent = system.state.extent;
            return Math.hypot(extent.centerEastKm, extent.centerNorthKm) <
                extent.minorRadiusKm;
        }), `${low.species} immediate deck must contain the observer`);
        assert.ok(immediate.systems.every(({ state }) =>
            state.physical.condensate.liquidFraction >
                (low.genus === "nimbostratus" ? 0.1 : 0.9)));
        if (low.genus === "nimbostratus") {
            assert.ok(immediate.systems.every(({ state }) =>
                ["rain", "snow", "ice-pellets"].includes(
                    state.physical.precipitation.kind,
                )));
        }
    }
    const dryFractus = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer,
        genus: "stratus",
        species: "stratus-fractus",
        baseAltitude: 160,
        thickness: 360,
        coverage: 0.625,
        oktas: 5,
        precipitation: 0.04,
        organization: "unorganized",
        lifecycle: 0.9,
    }));
    assert.deepEqual(dryFractus.diagnostics, []);
    assert.ok(dryFractus.systems.every(({ state }) =>
        state.physical.precipitation.kind === "none"));
});

test("low volutus uses oriented radial clearance and intersects the fixed production camera", () => {
    const baseCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "sc-volutus--day-oblique-natural",
    );
    assert.ok(baseCase);
    const weatherTargetId = "species-stratocumulus-volutus";
    const weatherClassification = {
        genus: "stratocumulus",
        species: "volutus",
        varieties: [],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    };
    const weatherScene = qualificationScene({
        targetId: weatherTargetId,
        classification: weatherClassification,
        environment: {
            latitude: 34,
            season: 0.85,
            relativeHumidity: 0.34,
            boundaryLayer: "convective",
        },
        layerRequest: {
            genus: "stratocumulus",
            species: "stratocumulus-volutus",
            oktas: 6,
            baseAltitude: 750,
            thickness: 1_100,
            opticalDepth: 0.72,
            convection: 0.14,
            precipitation: 0,
            iceFraction: 0.05,
            windSpeed: 7,
            windDirection: qualificationSeed(weatherTargetId)[0] *
                Math.PI * 2,
            shear: 0.24,
            turbulence: 0.28,
            organization: "banded",
            lifecycle: 0.52,
            organizationStrength: 0.82,
        },
    });
    const cases = [
        ["base:sc-volutus", baseCase.preview.cloudScene],
        ["weather:species-stratocumulus-volutus", weatherScene],
    ];
    for (const [name, cloudScene] of cases) {
        const runtime = runtimeModule.createCloudSystemRuntime(cloudScene);
        const repeated = runtimeModule.createCloudSystemRuntime(
            structuredClone(cloudScene),
        );
        assert.deepEqual(
            runtime.systems.map(({ state }) => state.extent),
            repeated.systems.map(({ state }) => state.extent),
            `${name} world placement was not deterministic`,
        );
        const frame = runtimeModule.estimateCloudFrameProjection(
            runtime.systems,
            productionFrameOptions,
        );
        assert.ok(frame.visibleOwnerCount >= 1,
            `${name} has no owner above the fixed camera's 5.24° lower ray; ` +
            runtime.systems.map(({ state }) => JSON.stringify(state.extent)).join(";"));
        assert.ok(frame.supportFraction >= 0.001,
            `${name} fixed-camera support was only ${frame.supportFraction}`);

        let usesRadialThickness = false;
        for (const { state } of runtime.systems) {
            const extent = state.extent;
            const range = Math.hypot(
                extent.centerEastKm,
                extent.centerNorthKm,
            );
            const radialEast = extent.centerEastKm / range;
            const radialNorth = extent.centerNorthKm / range;
            const majorEast = Math.cos(extent.orientation);
            const majorNorth = Math.sin(extent.orientation);
            const majorProjection = radialEast * majorEast +
                radialNorth * majorNorth;
            const minorProjection = radialEast * -majorNorth +
                radialNorth * majorEast;
            const radialBoundary = 1 / Math.sqrt(
                majorProjection ** 2 / extent.majorRadiusKm ** 2 +
                minorProjection ** 2 / extent.minorRadiusKm ** 2,
            );
            assert.ok(range >= radialBoundary + extent.boundaryTransitionKm,
                `${name} roll support contains the observer`);
            usesRadialThickness ||= range < extent.majorRadiusKm * 0.8;
        }
        assert.ok(usesRadialThickness,
            `${name} still ranges every tube by its long axial radius`);
    }
});

test("Nimbostratus pannus materializes a parent-linked wet-fragment owner", () => {
    const pannusScene = sceneWithLayer({
        ...congestusLayer,
        genus: "nimbostratus",
        species: "nimbostratus-praecipitatio",
        baseAltitude: 900,
        thickness: 4_600,
        coverage: 0.875,
        oktas: 7,
        opticalDepth: 1,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0.38,
        precipitation: 0.86,
        organization: "frontal",
        lifecycle: 0.72,
    }, 1, { classifications: [{
        layerIndex: 1,
        scope: "layer",
        relation: "independent",
        classification: {
            genus: "nimbostratus",
            species: null,
            varieties: [],
            supplementaryFeatures: ["praecipitatio"],
            accessoryClouds: ["pannus"],
            origin: { kind: "natural" },
        },
    }] });
    pannusScene.humidity = 0.96;
    const runtime = runtimeModule.createCloudSystemRuntime(pannusScene);
    const parent = runtime.systems.find((owner) =>
        owner.familyProduction?.representation === "nimbostratus-pannus");
    assert.ok(parent, "the Nimbostratus shield remains the parent owner");
    const pannus = runtime.systems.find((owner) =>
        owner.familyProduction?.pannusUnderdeck?.parentOwnerId ===
            parent.state.id);
    assert.ok(pannus, `wet pannus is a separate materialized density owner: ${JSON.stringify({
        diagnostics: runtime.diagnostics,
        systems: runtime.systems.map((owner) => ({
            id: owner.state.id,
            representation: owner.familyProduction?.representation,
            pannus: owner.familyProduction?.pannusUnderdeck,
        })),
    })}`);
    assert.equal(pannus.compiled.recipeId, "stratus-fractus");
    assert.equal(pannus.morphologyAssignment.relation, "embedded");
    assert.ok(pannus.state.physical.baseAltitudeKm <
        parent.state.physical.baseAltitudeKm);
    assert.equal(pannus.state.physical.precipitation.kind, "none");
    assert.ok([
        "incipient-separated-pannus",
        "coalescing-pannus-underdeck",
        "washout-limited-pannus",
    ].includes(pannus.familyProduction.pannusUnderdeck.stage));
    const qualification = runtimeModule.qualifyLowLayeredRuntimePopulation(
        runtime.systems,
    ).find(({ representation }) => representation === "nimbostratus-pannus");
    assert.equal(qualification.valid, true, qualification.violations.join(","));
    assert.ok(!runtime.diagnostics.some((diagnostic) =>
        diagnostic.includes("pannus-accessory-needs-parent-linked")));
    assert.deepEqual(runtime.diagnostics, []);
});

test("Sc organization manifolds pack exact topology and coverage lanes", () => {
    const baseLayer = {
        ...congestusLayer,
        genus: "stratocumulus",
        species: "stratocumulus-stratiformis",
        baseAltitude: 680,
        thickness: 760,
        towerAmount: 0.06,
        anvilAmount: 0,
        iceFraction: 0.02,
        opticalDepth: 0.74,
        turbulence: 0.12,
        precipitation: 0.12,
        lifecycle: 0.62,
    };
    const cases = [
        {
            name: "closed distant", organization: "closed-cell",
            coverage: 0.25, oktas: 2, regime: "closed-cell",
            placement: "distant-finite-system", topology: 1,
            variant: "closed-cell-radiative-deck",
        },
        {
            name: "closed overhead", organization: "closed-cell",
            coverage: 0.875, oktas: 7, regime: "closed-cell",
            placement: "immediate-overcast", topology: 1,
            variant: "closed-cell-radiative-deck",
        },
        {
            name: "open field", organization: "open-cell",
            coverage: 0.5, oktas: 4, regime: "open-cell",
            placement: "immediate-broken-field", topology: 0,
            variant: "drizzling-open-cell-field",
        },
        {
            name: "street packet", organization: "banded",
            coverage: 0.5, oktas: 4, regime: "street",
            placement: "immediate-broken-field", topology: 3,
            variant: "finite-street-and-broken-deck",
        },
        {
            name: "transition mosaic", organization: "closed-cell",
            coverage: 0.5, oktas: 4, regime: "sparse-transition",
            placement: "immediate-broken-field", topology: 2,
            variant: "closed-open-transition-mosaic",
            classification: {
                genus: "stratocumulus",
                species: "stratiformis",
                varieties: ["lacunosus"],
                supplementaryFeatures: [],
                accessoryClouds: [],
                origin: { kind: "natural" },
            },
        },
    ];
    for (const entry of cases) {
        const overrides = entry.classification ? {
            classifications: [{
                layerIndex: 0,
                systemIndex: 0,
                classification: entry.classification,
            }],
        } : {};
        const runtime = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
            ...baseLayer,
            organization: entry.organization,
            coverage: entry.coverage,
            oktas: entry.oktas,
        }, 0, overrides));
        assert.deepEqual(runtime.diagnostics, [], entry.name);
        assert.equal(runtime.systems.length, 1,
            `${entry.name} must remain one complete mesoscale owner`);
        const owner = runtime.systems[0];
        assert.equal(owner.familyProduction.organizationRegime, entry.regime);
        assert.equal(owner.familyProduction.topologyVariantId, entry.variant);
        assert.equal(owner.familyProduction.lowLayeredDomain.placement,
            entry.placement);
        const packed = runtimeModule.packCloudSystems([owner]);
        const lane = 4 + runtimeModule.CLOUD_SYSTEM_VEC4_LAYOUT
            .organizationSecondary * 4;
        assert.equal(packed.data[lane + 2], entry.topology, entry.name);
        assert.ok(Math.abs(packed.data[lane + 3] - entry.oktas / 8) < 1e-6,
            `${entry.name} coverage lane`);
    }
});

test("cirrus forms a broad sparse high-level field at genuinely remote ranges", () => {
    const cirrus = {
        ...congestusLayer,
        genus: "cirrus",
        species: "cirrus-fibratus",
        baseAltitude: 9200,
        thickness: 900,
        coverage: 0.5,
        oktas: 4,
        opticalDepth: 0.34,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 1,
        precipitation: 0,
        windSpeed: 27,
        shear: 0.62,
        turbulence: 0.45,
        organization: "banded",
        organizationStrength: 0.62,
    };
    const high = runtimeModule.createCloudSystemRuntime(sceneWithLayer(cirrus, 2));
    const low = runtimeModule.createCloudSystemRuntime(sceneWithLayer({
        ...congestusLayer, coverage: 0.5, oktas: 4,
    }));
    const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    assert.ok(high.systems.length >= 7);
    const highMedianRange = median(high.systems.map(rangeOf));
    const lowMedianRange = median(low.systems.map(rangeOf));
    assert.ok(highMedianRange > lowMedianRange * 3,
        `high/low median range ratio was ${highMedianRange}/${lowMedianRange}`);
    assert.ok(Math.max(...high.systems.map(({ state }) => state.extent.majorRadiusKm)) >= 8);
    const highProjection = projection(high);
    // This measures complete finite owner ellipses, not filled cloud opacity.
    // Requiring seven percent from only seven sparse streamer formations was
    // satisfied by putting a 20--28 km owner almost on the observer, which is
    // exactly the clipped ribbon regression. A globally discoverable 1.5--6%
    // owner envelope plus the explicit production-frame ladder below is the
    // physically meaningful guard for fine fibratus.
    assert.ok(highProjection.supportFraction >= 0.015 &&
        highProjection.supportFraction <= 0.06,
        `cirrus field support was only ${(highProjection.supportFraction * 100).toFixed(1)}%; ` +
        high.systems.map((system) => {
            const extent = system.state.extent;
            return `${rangeOf(system).toFixed(1)}/${extent.majorRadiusKm.toFixed(1)}/${extent.minorRadiusKm.toFixed(1)}`;
        }).join(", "));
});

test("photographic benchmark environments preserve one physical owner population", () => {
    const casesByReference = new Map();
    for (const benchmarkCase of benchmarkModule.CLOUD_PHOTOGRAPH_CASES) {
        const referenceId = benchmarkCase.id.split("--")[0];
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        assert.deepEqual(runtime.diagnostics, [], benchmarkCase.id);
        assert.ok(runtime.systems.length >= 1 && runtime.systems.length <= 12,
            `${benchmarkCase.id} produced ${runtime.systems.length} owners`);
        const prior = casesByReference.get(referenceId);
        const physicalOwners = runtime.systems.map(({ state }) => ({
            extent: state.extent,
            organization: state.organization,
            classification: state.classification,
        }));
        if (prior) {
            assert.equal(runtime.signature, prior.signature,
                `${referenceId} regenerated between lighting environments`);
            assert.deepEqual(physicalOwners, prior.physicalOwners);
        } else {
            casesByReference.set(referenceId, {
                signature: runtime.signature,
                physicalOwners,
            });
            const amount = benchmarkCase.preview.cloudScene.totalOktas / 8;
            const support = projection(runtime, { sampleCount: 4096 }).supportFraction;
            const topology = runtime.systems[0].compiled.macroTopology;
            if (amount >= 0.875 && (topology === "layered-veil" ||
                topology === "precipitating-sheet" ||
                topology === "boundary-layer-sheet")) {
                assert.ok(support >= 0.70,
                    `${referenceId} overcast shield supported only ${(support * 100).toFixed(1)}% of the dome`);
            } else {
                assert.ok(support >= 0.0001,
                    `${referenceId} has no physically discoverable angular support (${support.toFixed(5)})`);
            }
        }
    }
    assert.equal(casesByReference.size, benchmarkModule.CLOUD_PHOTOGRAPH_SUMMARY.references);
});

test("photographic FOV is the only camera lens applied to production comparisons", () => {
    for (const benchmarkCase of benchmarkModule.CLOUD_PHOTOGRAPH_CASES) {
        assert.equal(benchmarkCase.preview.cloudPerspective, "natural",
            `${benchmarkCase.id} double-applies a cloud-only lens transform`);
        assert.equal(benchmarkCase.preview.horizontalFov,
            benchmarkCase.environment.horizontalFov);
        assert.equal(benchmarkCase.preview.verticalFov,
            benchmarkCase.environment.verticalFov);
    }
});

test("reported photographic failures have discoverable owners and expected broad-field frame support", () => {
    const expectations = [
        ["cb-capillatus-incus--golden-backlit-telephoto", 0.008, 1, false],
        ["ci-uncinus--day-oblique-natural", 0.008, 1, false],
        ["cc-stratiformis--day-oblique-natural", 0.02, 1, true],
        ["ac-lenticularis--day-oblique-natural", 0.006, 1, true],
        ["sc-stratiformis--humid-wide-nearby", 0.055, 1, true],
        ["st-fractus--humid-wide-nearby", 0.025, 1, true],
    ];
    for (const [id, minimumSupport, minimumOwners, requireFrame] of expectations) {
        const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
            (candidate) => candidate.id === id,
        );
        assert.ok(benchmarkCase, `missing benchmark ${id}`);
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        const frame = projection(runtime, {
            azimuthRadians: degrees(benchmarkCase.environment.viewAzimuth),
            elevationRadians: degrees(benchmarkCase.environment.viewElevation),
            horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
            verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
        });
        const measured = requireFrame ? frame : projection(runtime);
        assert.ok(measured.visibleOwnerCount >= minimumOwners,
            `${id} has ${measured.visibleOwnerCount} discoverable owners; ` +
            runtime.systems.map(({ state }) => {
                const bearing = Math.atan2(state.extent.centerEastKm,
                    state.extent.centerNorthKm) * 180 / Math.PI;
                return `${bearing.toFixed(0)}°/${rangeOf({ state }).toFixed(0)}km/` +
                    `${state.extent.majorRadiusKm.toFixed(1)}km`;
            }).join(", "));
        assert.ok(measured.supportFraction >= minimumSupport,
            `${id} physical support ${(measured.supportFraction * 100).toFixed(2)}% ` +
            `< ${(minimumSupport * 100).toFixed(2)}%`);
        if (id.startsWith("cb-")) {
            assert.ok(runtime.systems.every(({ state }) =>
                state.extent.majorRadiusKm <= 18 &&
                state.extent.minorRadiusKm <= 12),
            `${id} regressed to an implausible screen-wide storm slab`);
        }
        if (id.startsWith("ci-")) {
            assert.ok(frame.visibleOwnerCount <= 4,
                `${id} crowds ${frame.visibleOwnerCount} crossing streamer families into one view`);
            const orientations = runtime.systems.map(({ state }) =>
                state.extent.orientation);
            assert.ok(Math.max(...orientations) - Math.min(...orientations) <= 0.14,
                `${id} loses coherent shear orientation`);
        }
    }
});

test("production Cirrus castellanus keeps a readable finite common-base line in the natural frame", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-castellanus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const frame = projection(runtime, {
        // Cloud owners use the stable meteorological tangent-frame meridian;
        // astronomical azimuth affects illumination, not their world identity.
        azimuthRadians: 0,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
    });
    assert.ok(frame.supportFraction >= 0.058 &&
        frame.supportFraction <= 0.08,
    `Ci castellanus physical frame support was ${(frame.supportFraction * 100).toFixed(2)}%`);
    assert.ok(frame.visibleOwnerCount >= 2 && frame.visibleOwnerCount <= 4,
        `Ci castellanus exposed ${frame.visibleOwnerCount} owner packets`);
    assert.ok(1 - frame.supportFraction >= 0.92,
        `Ci castellanus retained only ${((1 - frame.supportFraction) * 100).toFixed(2)}% clear sky`);

    const anchor = runtime.systems[0];
    const firstCompanion = runtime.systems[1];
    assert.equal(anchor.compiled.recipeId, "cirrus-castellanus");
    assert.ok(anchor.state.extent.majorRadiusKm * 2 >= 9 &&
        anchor.state.extent.majorRadiusKm * 2 <= 11,
    "the nearest crenellated line escaped its physically credible 9–11 km span");
    assert.ok(firstCompanion.state.extent.majorRadiusKm * 2 >= 6,
        "the correlated companion line collapsed below a readable physical span");
    assert.ok(runtime.systems.slice(3).every(({ state }) =>
        state.extent.majorRadiusKm < anchor.state.extent.majorRadiusKm),
    "remote castellanus owners were inflated with the foreground line");
});

test("production Cirrocumulus castellanus resolves several tiny common-base packets in the natural frame", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "cc-castellanus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const frameOptions = {
        azimuthRadians: 0,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
    };
    const frame = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        frameOptions,
    );
    const jitteredFrames = [
        [-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5],
    ].map((jitterPixels) => runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        { ...frameOptions, jitterPixels },
    ));
    assert.ok(jitteredFrames.every(({ supportFraction }) =>
        supportFraction >= 0.045 && supportFraction <= 0.075),
    `Cc castellanus physical frame support was ${(frame.supportFraction * 100).toFixed(2)}%; ` +
        `visible=${frame.visibleOwnerCount}; ` +
        runtime.systems.map(({ state }, index) =>
            `${index}:${(state.extent.majorRadiusKm * 2).toFixed(2)}km@` +
            `${rangeOf({ state }).toFixed(1)}km`).join(", "));
    assert.ok(jitteredFrames.every(({ visibleOwnerCount }) =>
        visibleOwnerCount >= 3 && visibleOwnerCount <= 5),
        `Cc castellanus exposed ${frame.visibleOwnerCount} owner packets`);
    assert.ok(frame.ownerProjections.every(({ projectedElementWidthRadians }) =>
        projectedElementWidthRadians < degrees(1)),
    "a Cc turret exceeded the WMO sub-degree apparent-width discriminator");

    const anchor = runtime.systems[0];
    const firstCompanion = runtime.systems[1];
    const secondCompanion = runtime.systems[2];
    assert.equal(anchor.compiled.recipeId, "cirrocumulus-castellanus");
    assert.ok(anchor.state.extent.majorRadiusKm * 2 >= 6 &&
        anchor.state.extent.majorRadiusKm * 2 <= 8,
    "the nearest tiny-turret line escaped its credible 6–8 km foreground span");
    assert.ok(firstCompanion.state.extent.majorRadiusKm * 2 >= 4.5,
        "the correlated companion packet collapsed below a readable physical span");
    assert.ok(
        anchor.state.extent.majorRadiusKm >
            firstCompanion.state.extent.majorRadiusKm &&
        firstCompanion.state.extent.majorRadiusKm >=
            secondCompanion.state.extent.majorRadiusKm,
    "the three foreground common-base packets lost their unequal span hierarchy");
    assert.ok(rangeOf(anchor) >= 14 && rangeOf(anchor) <= 20,
        "the nearest packet escaped its physical middle-distance range");
    assert.ok(rangeOf(anchor) < rangeOf(firstCompanion) &&
        rangeOf(firstCompanion) < rangeOf(secondCompanion),
    "the Cc packet group lost its near/middle/far depth");
    assert.ok(runtime.systems.every(({ state }) =>
        state.extent.majorRadiusKm * 2 <= 10),
    "a Cc castellanus packet exceeded its physical 10 km formation envelope");
    assert.ok(runtime.systems.every(({ familyProduction }) =>
        familyProduction &&
        familyProduction.elementScaleKm >= 0.035 &&
        familyProduction.elementScaleKm <= 0.22),
    "formation-envelope coverage changed the species' sub-degree turret scale");
});

test("all eleven base high-cloud photographs retain finite natural-frame volume support", () => {
    const cases = [
        ["ci-fibratus", "cirrus-fibratus", "high", 0.12, 0.20, 3],
        ["ci-uncinus", "cirrus-uncinus", "high", 0.07, 0.16, 2],
        ["ci-spissatus", "cirrus-spissatus", "high", 0.07, 0.16, 1],
        ["ci-castellanus", "cirrus-castellanus", "high", 0.045, 0.10, 2],
        ["ci-floccus", "cirrus-floccus", "high", 0.04, 0.10, 2],
        ["cc-stratiformis", "cirrocumulus-stratiformis", "high", 0.18, 0.30, 3],
        ["cc-castellanus", "cirrocumulus-castellanus", "high", 0.04, 0.09, 3],
        ["cc-lenticularis", "cirrocumulus-lenticularis", "high", 0.055, 0.12, 1],
        ["cc-floccus", "cirrocumulus-floccus", "high", 0.025, 0.065, 2],
        ["cs-fibratus", "cirrostratus-fibratus", "upper", 0.84, 0.97, 1],
        ["cs-nebulosus", "cirrostratus-nebulosus", "upper", 0.98, 1, 1],
    ];
    for (const [
        referenceId,
        expectedSpecies,
        expectedFamily,
        minimumSupport,
        maximumSupport,
        minimumVisibleOwners,
    ] of cases) {
        const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
            ({ id }) => id === `${referenceId}--day-oblique-natural`,
        );
        assert.ok(benchmarkCase, `missing ${referenceId} natural benchmark`);
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        assert.deepEqual(runtime.diagnostics, [], referenceId);
        assert.equal(runtime.packedSystemData.count, runtime.systems.length,
            `${referenceId} loses finite owners before production marching`);
        assert.ok(runtime.systems.every(({ compiled, familyProduction }) =>
            compiled.recipeId === expectedSpecies &&
            familyProduction?.representation === expectedSpecies &&
            familyProduction.family === expectedFamily),
        `${referenceId} aliases its WMO species or physical family`);

        const frameOptions = {
            azimuthRadians: 0,
            elevationRadians: degrees(benchmarkCase.environment.viewElevation),
            horizontalFovRadians:
                degrees(benchmarkCase.environment.horizontalFov),
            verticalFovRadians:
                degrees(benchmarkCase.environment.verticalFov),
        };
        const frames = [
            [-0.5, -0.5], [0, 0], [0.5, 0.5],
        ].map((jitterPixels) => runtimeModule.estimateCloudFrameProjection(
            runtime.systems,
            { ...frameOptions, jitterPixels },
        ));
        assert.ok(frames.every(({ supportFraction }) =>
            supportFraction >= minimumSupport &&
            supportFraction <= maximumSupport + 1e-9),
        `${referenceId} natural-frame support escaped ` +
            `${minimumSupport}–${maximumSupport}: ` +
            frames.map(({ supportFraction }) => supportFraction).join(", "));
        assert.ok(frames.every(({ visibleOwnerCount }) =>
            visibleOwnerCount >= minimumVisibleOwners),
        `${referenceId} has no readable finite owner population`);
        assert.ok(frames.every(({ ownerProjections }) =>
            ownerProjections.some((owner) =>
                owner.supportedFraction >= 0.004 &&
                owner.projectedHorizontalSpanRadians >= degrees(2) &&
                owner.projectedVerticalSpanRadians >= degrees(1))),
        `${referenceId} survives only as sub-sample fragments`);

        if (referenceId.startsWith("ci-") ||
            referenceId.startsWith("cc-")) {
            assert.ok(frames.every(({ ownerProjections }) =>
                ownerProjections.every(({ edgeContacts }) =>
                    edgeContacts.count <= 2)),
            `${referenceId} regressed to a three-edge screen card`);
        }
        if (referenceId.startsWith("cc-")) {
            assert.ok(frames.every(({ ownerProjections }) =>
                ownerProjections.every(({ projectedElementWidthRadians }) =>
                    projectedElementWidthRadians < degrees(1))),
            `${referenceId} lost the WMO sub-degree element discriminator`);
        }
    }
});

test("all eleven high-cloud atlases retain production-scaled natural-frame anatomy", () => {
    const cases = [
        ["ci-fibratus", [
            ["ci-fibratus", 0],
            ["ci-fibratus-depth-shear", 1],
            ["ci-fibratus-split-source", 2],
        ]],
        ["ci-uncinus", [["ci-uncinus", 0]]],
        ["ci-spissatus", [["ci-spissatus", 0]]],
        ["ci-castellanus", [["ci-castellanus", 0]]],
        ["ci-floccus", [["ci-floccus", 0]]],
        ["cc-stratiformis", [
            ["cc-stratiformis", 0],
            ["cc-stratiformis-dispersive", 1],
        ]],
        ["cc-castellanus", [["cc-castellanus", 0]]],
        ["cc-lenticularis", [["cc-lenticularis", 0]]],
        ["cc-floccus", [["cc-floccus", 0]]],
        ["cs-fibratus", [["cs-fibratus", 0]]],
        ["cs-nebulosus", [["cs-veil", 0]]],
    ];
    const productionGates = {
        "ci-fibratus": { minimumVerticalDegrees: 1.6, minimumDepthKm: 0.20 },
        "ci-uncinus": { minimumVerticalDegrees: 4.5, minimumDepthKm: 0.40 },
        "ci-spissatus": { minimumVerticalDegrees: 4.0, minimumDepthKm: 1.0 },
        "ci-castellanus": { minimumVerticalDegrees: 3.0, minimumDepthKm: 0.60 },
        "ci-floccus": { minimumVerticalDegrees: 3.3, minimumDepthKm: 0.25 },
        "cc-stratiformis": { minimumVerticalDegrees: 6.0, minimumDepthKm: 0.13 },
        "cc-castellanus": { minimumVerticalDegrees: 5.0, minimumDepthKm: 0.35 },
        "cc-lenticularis": { minimumVerticalDegrees: 3.0, minimumDepthKm: 0.12 },
        "cc-floccus": { minimumVerticalDegrees: 5.0, minimumDepthKm: 0.18 },
        "cs-fibratus": { minimumVerticalDegrees: 35, minimumDepthKm: 1.0 },
        "cs-nebulosus": { minimumVerticalDegrees: 38, minimumDepthKm: 2.0 },
    };
    const diagnostics = [];
    for (const [referenceId, volumeVariants] of cases) {
        const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
            ({ id }) => id === `${referenceId}--day-oblique-natural`,
        );
        assert.ok(benchmarkCase, `missing ${referenceId} natural benchmark`);
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        const camera = {
            azimuthRadians: 0,
            elevationRadians: degrees(benchmarkCase.environment.viewElevation),
            horizontalFovRadians:
                degrees(benchmarkCase.environment.horizontalFov),
            verticalFovRadians:
                degrees(benchmarkCase.environment.verticalFov),
            observerAltitudeKm:
                benchmarkCase.environment.composition.observerAltitude,
        };
        const frame = runtimeModule.estimateCloudFrameProjection(
            runtime.systems,
            camera,
        );
        const frameOwners = new Map(frame.ownerProjections.map((owner) => [
            owner.ownerIndex,
            owner,
        ]));
        for (const [volumeId, physicalVariant] of volumeVariants) {
            const variantCount = volumeVariants.length;
            const candidates = runtime.systems.flatMap((system, ownerIndex) => {
                const frameOwner = frameOwners.get(ownerIndex);
                if (!frameOwner || system.atlasDeterministicVariant % variantCount !==
                    physicalVariant) return [];
                return [{ system, ownerIndex, frameOwner }];
            }).sort((left, right) =>
                left.frameOwner.edgeContacts.count -
                    right.frameOwner.edgeContacts.count ||
                right.frameOwner.supportedFraction -
                    left.frameOwner.supportedFraction);
            assert.ok(candidates.length > 0,
                `${referenceId}/${volumeId} lacks a visible production owner`);
            const { system, ownerIndex, frameOwner } = candidates[0];
            const decoded = decodeCloudAtlasVolume({
                atlas: cloudMacroAtlasBytes,
                manifest: cloudMacroAtlasManifest,
                volumeId,
            });
            const projection = projectCloudAtlasDensityProductionPerspective(
                decoded,
                {
                    owner: {
                        ...system.state.extent,
                        orientationRadians: system.state.extent.orientation,
                        baseAltitudeKm:
                            system.compiled.geometry.baseAltitudeKm,
                        geometricDepthKm:
                            system.compiled.geometry.geometricDepthKm,
                    },
                    camera,
                    outputResolution: 96,
                    samplesPerVoxel: 2,
                    densityThreshold:
                        cloudMacroAtlasManifest.occupancy.densityByteThreshold /
                        255,
                },
            );
            const result = analyzeCloudAtlasProductionPerspectiveProjection(
                projection,
                cloudMacroAtlasManifest.occupancy.densityByteThreshold / 255,
            );
            const productionPixelProjection = referenceId === "ci-spissatus"
                ? projectCloudAtlasDensityProductionPerspective(
                    decoded,
                    {
                        owner: {
                            ...system.state.extent,
                            orientationRadians:
                                system.state.extent.orientation,
                            baseAltitudeKm:
                                system.compiled.geometry.baseAltitudeKm,
                            geometricDepthKm:
                                system.compiled.geometry.geometricDepthKm,
                        },
                        camera,
                        outputWidth: 800,
                        outputHeight: 500,
                        samplesPerVoxel: 2,
                        densityThreshold:
                            cloudMacroAtlasManifest.occupancy
                                .densityByteThreshold / 255,
                    },
                )
                : null;
            const productionPixelSilhouette = productionPixelProjection === null
                ? null
                : analyzeCloudAtlasProductionPixelSilhouette(
                    productionPixelProjection,
                    cloudMacroAtlasManifest.occupancy.densityByteThreshold /
                        255,
                );
            const productionRadialSilhouette =
                productionPixelProjection === null
                    ? null
                    : analyzeCloudAtlasProductionRadialSilhouette(
                        productionPixelProjection,
                        cloudMacroAtlasManifest.occupancy
                            .densityByteThreshold / 255,
                    );
            diagnostics.push({
                referenceId,
                volumeId,
                ownerIndex,
                ownerScaleKm: [
                    system.state.extent.minorRadiusKm,
                    system.compiled.geometry.geometricDepthKm * 0.5,
                    system.state.extent.majorRadiusKm,
                ].map((value) => Number(value.toFixed(3))),
                ownerFrameSupport: Number(
                    frameOwner.supportedFraction.toFixed(4),
                ),
                spanDegrees: [
                    result.projectedHorizontalSpanRadians,
                    result.projectedVerticalSpanRadians,
                ].map((value) => Number((value * 180 / Math.PI).toFixed(3))),
                verticalToHorizontal: Number(
                    result.projectedVerticalToHorizontalRatio.toFixed(3),
                ),
                antiRibbonCompactness: Number(
                    result.antiRibbonCompactness.toFixed(3),
                ),
                compactness: Number(result.boundingCompactness.toFixed(3)),
                anisotropy: Number(result.anisotropy.toFixed(3)),
                edgeContact: Number(result.edgeContactFraction.toFixed(4)),
                components: result.componentCount,
                antiOval: Number(result.antiOvalScore.toFixed(3)),
                meanDepthKm: Number(result.meanOccupiedDepthKm.toFixed(3)),
                maximumDepthKm: Number(result.maximumOccupiedDepthKm.toFixed(3)),
                productionPixelSilhouette:
                    productionPixelSilhouette === null ? null : {
                        resolvedComponentCount:
                            productionPixelSilhouette.resolvedComponentCount,
                        minimumAffineEdgeReliefFraction: Number(
                            productionPixelSilhouette
                                .minimumAffineEdgeReliefFraction.toFixed(4),
                        ),
                        maximumStraightEdgeFraction: Number(
                            productionPixelSilhouette
                                .maximumStraightEdgeFraction.toFixed(4),
                        ),
                        minimumCentralThicknessCoefficientVariation: Number(
                            productionPixelSilhouette
                                .minimumCentralThicknessCoefficientVariation
                                .toFixed(4),
                        ),
                    },
                productionRadialSilhouette:
                    productionRadialSilhouette === null ? null : {
                        bestCenterPixels:
                            productionRadialSilhouette.bestCenterPixels,
                        centroidConicCoefficientVariation: Number(
                            productionRadialSilhouette
                                .centroidConicCoefficientVariation
                                .toFixed(4),
                        ),
                        contourRingPhaseCoherence: Number(
                            productionRadialSilhouette
                                .contourRingPhaseCoherence.toFixed(4),
                        ),
                        maximumPairwisePrincipalAxisSeparationDegrees:
                            Number(
                                productionRadialSilhouette
                                    .maximumPairwisePrincipalAxisSeparationDegrees
                                    .toFixed(2),
                            ),
                        radialEdgeVariationScore: Number(
                            productionRadialSilhouette
                                .radialEdgeVariationScore.toFixed(4),
                        ),
                        radialCoverageScore: Number(
                            productionRadialSilhouette
                                .radialCoverageScore.toFixed(4),
                        ),
                    },
            });
            assert.ok(result.occupiedSamples > 0,
                `${referenceId}/${volumeId} has no production-scaled support`);
            const gate = productionGates[referenceId];
            const verticalDegrees = result.projectedVerticalSpanRadians *
                180 / Math.PI;
            assert.ok(verticalDegrees >= gate.minimumVerticalDegrees,
                `${referenceId}/${volumeId} production vertical span ` +
                `${verticalDegrees.toFixed(2)}° < ` +
                `${gate.minimumVerticalDegrees.toFixed(2)}°`);
            assert.ok(result.maximumOccupiedDepthKm >= gate.minimumDepthKm,
                `${referenceId}/${volumeId} line-of-sight density depth ` +
                `${result.maximumOccupiedDepthKm.toFixed(3)} km < ` +
                `${gate.minimumDepthKm.toFixed(3)} km`);

            const continuousVeil = referenceId.startsWith("cs-");
            if (continuousVeil) {
                assert.ok(result.projectedHorizontalSpanRadians >=
                    camera.horizontalFovRadians * 0.98,
                `${referenceId} no longer crosses the complete natural frame`);
                assert.ok(result.edgeContactFraction >= 0.02 &&
                    result.edgeContactFraction <= 0.05,
                `${referenceId} must cross, but not collapse against, its frame boundary`);
                assert.equal(result.componentCount, 1,
                    `${referenceId} lost its continuous veil support`);
                assert.ok(result.boundingCompactness > 0.92,
                    `${referenceId} became a perforated/card-like veil`);
            } else {
                assert.ok(result.edgeContactFraction < 0.01,
                    `${referenceId}/${volumeId} is cropped in the natural frame`);
            }

            if (referenceId === "ci-fibratus") {
                assert.ok(result.componentCount >= 4 &&
                    result.boundingCompactness < 0.38 &&
                    result.anisotropy > 3,
                `${volumeId} lost its separated fine-fibre population`);
            } else if (referenceId === "ci-uncinus") {
                assert.ok(result.boundingCompactness < 0.12 &&
                    result.antiOvalScore > 0.75 && result.anisotropy > 6,
                "uncinus lost open hook/fallstreak negative space");
            } else if (referenceId === "ci-spissatus") {
                const spissatusProjectionViews = [0, 5, 18, 25, 60, 90, 135].map(
                    (azimuthDegrees) => {
                        // Exercise the volume from multiple owner-relative
                        // azimuths while keeping the finite formation centred
                        // in the production lens. Panning an absolute camera
                        // away from a solitary owner measures framing (and
                        // correctly loses bodies), not whether the same 3-D
                        // anatomy collapses when viewed from another bearing.
                        const viewOwner = {
                            ...system.state.extent,
                            orientationRadians:
                                system.state.extent.orientation +
                                degrees(azimuthDegrees),
                            baseAltitudeKm:
                                system.compiled.geometry.baseAltitudeKm,
                            geometricDepthKm:
                                system.compiled.geometry.geometricDepthKm,
                        };
                        const viewProjection =
                            projectCloudAtlasDensityProductionPerspective(
                                decoded,
                                {
                                    owner: viewOwner,
                                    camera,
                                    outputWidth: 800,
                                    outputHeight: 500,
                                    samplesPerVoxel: 2,
                                    densityThreshold:
                                        cloudMacroAtlasManifest.occupancy
                                            .densityByteThreshold / 255,
                                },
                            );
                        return {
                            azimuthDegrees,
                            silhouette: analyzeCloudAtlasProductionPixelSilhouette(
                                viewProjection,
                                cloudMacroAtlasManifest.occupancy
                                    .densityByteThreshold / 255,
                            ),
                            radial: analyzeCloudAtlasProductionRadialSilhouette(
                                viewProjection,
                                cloudMacroAtlasManifest.occupancy
                                    .densityByteThreshold / 255,
                            ),
                        };
                    },
                );
                const spissatusAzimuthViews = spissatusProjectionViews.filter(
                    ({ azimuthDegrees }) => azimuthDegrees <= 25,
                );
                const spissatusWideAzimuthViews = spissatusProjectionViews.filter(
                    ({ azimuthDegrees }) => azimuthDegrees >= 60,
                );
                // Resolved topology is a material-scale authority, not a count
                // of every one-pixel perimeter shred. A finite stochastic
                // excursion may present as one connected patch or split into
                // at most three persistent patch components as the view turns.
                // Subgrid dust is deliberately ignored by the projection
                // analyzer instead of being promoted to morphology.
                assert.ok(result.resolvedComponentCount >= 1 &&
                    result.resolvedComponentCount <= 3,
                "spissatus production mask must contain one-to-three resolved material patches");
                // Spissatus is one dense, irregular stochastic excursion. Its
                // authored broad patch can have a high ellipse overlap in a
                // single production bearing even while the native raster
                // retains finite edge relief and non-uniform depth. Keep a
                // material anti-oval floor, but require those independent
                // native shape cues in the same gate so a smooth oval cannot
                // pass merely by lowering the scalar threshold.
                assert.ok(result.antiRibbonCompactness > 0.22 &&
                    result.anisotropy < 4.5 && result.antiOvalScore > 0.14 &&
                    productionPixelSilhouette.minimumAffineEdgeReliefFraction >=
                        0.008 &&
                    productionPixelSilhouette.minimumCentralThicknessCoefficientVariation >=
                        0.02,
                "spissatus collapsed into a smooth, edge-on ribbon instead of dense patches: " +
                    JSON.stringify({
                        antiRibbonCompactness: result.antiRibbonCompactness,
                        anisotropy: result.anisotropy,
                        antiOvalScore: result.antiOvalScore,
                        boundingCompactness: result.boundingCompactness,
                        projectedVerticalToHorizontalRatio:
                            result.projectedVerticalToHorizontalRatio,
                        spansRadians: [
                            result.projectedHorizontalSpanRadians,
                            result.projectedVerticalSpanRadians,
                        ],
                    }));
                assert.ok(productionPixelSilhouette.resolvedComponentCount >= 1 &&
                    productionPixelSilhouette.resolvedComponentCount <= 3);
                assert.ok(productionRadialSilhouette.resolvedComponentCount >= 1 &&
                    productionRadialSilhouette.resolvedComponentCount <= 3);
                assert.ok(spissatusAzimuthViews.every(({ silhouette, radial }) =>
                    silhouette.resolvedComponentCount >= 1 &&
                    silhouette.resolvedComponentCount <= 3 &&
                    radial.resolvedComponentCount >= 1 &&
                    radial.resolvedComponentCount <= 3),
                "spissatus material topology must persist across fixed views: " +
                    JSON.stringify(spissatusAzimuthViews.map(({ azimuthDegrees,
                        silhouette, radial }) => ({
                        azimuthDegrees,
                        silhouetteComponents: silhouette.resolvedComponentCount,
                        radialComponents: radial.resolvedComponentCount,
                    }))));
                assert.ok(spissatusAzimuthViews.some(({ silhouette }) =>
                    silhouette.components.some(({ areaPixels,
                        boundingWidthPixels, boundingHeightPixels }) =>
                        areaPixels >= 32 && boundingWidthPixels >= 40 &&
                        boundingHeightPixels >= 24)),
                "spissatus has no persistent material-scale patch after dust filtering");
                const materialBounds = decoded.volume.statistics
                    .dominantComponentBounds
                    .filter((_, index) => decoded.volume.statistics
                        .dominantComponentFractions[index] >= 0.004);
                assert.ok(materialBounds.length >= 1 &&
                    materialBounds[0].maximum[1] - materialBounds[0].minimum[1] >= 0.35,
                "the dominant material Spissatus patch needs substantial authored 3-D depth, not a token screen-height patch");
                assert.ok(spissatusAzimuthViews.every(({ silhouette }) =>
                    silhouette.minimumAffineEdgeReliefFraction >= 0.008 &&
                    silhouette.maximumStraightEdgeFraction < 0.98 &&
                    silhouette.minimumCentralThicknessCoefficientVariation >= 0.02),
                "spissatus silhouette became an affine card or constant-thickness plate");
                assert.ok(spissatusAzimuthViews.every(({ radial }) =>
                    radial.radialEdgeVariationScore <= 0.20 &&
                    radial.radialCoverageScore <= 0.15 &&
                    (radial.resolvedComponentCount <= 1 ||
                        radial.maximumPairwisePrincipalAxisSeparationDegrees >= 25 ||
                        radial.contourRingPhaseCoherence < 0.82)),
                "spissatus projection contains broad radial evidence or lost axis separation");
                // Any three non-collinear points admit an exact circumcircle,
                // so a screen-grid conic fit is not a physical packet test.
                // Use the authored 3-D nearest-neighbour distribution and
                // angular entropy, then independently reject radial contour
                // evidence in every native projection above.
                assert.ok(decoded.volume.statistics
                    .ownerSpacingCoefficientVariation > 0.18 &&
                    decoded.volume.statistics.ownerAngularEntropy > 0.45,
                "spissatus lost its unequal, non-radial world-space packet");
                assert.ok(spissatusAzimuthViews.some(({ silhouette, radial }) =>
                    silhouette.minimumAffineEdgeReliefFraction >= 0.008 &&
                    silhouette.maximumStraightEdgeFraction < 0.98 &&
                    (radial.resolvedComponentCount <= 1 ||
                        radial.contourRingPhaseCoherence < 0.82)),
                "spissatus contours lost finite boundary relief or re-phased into a radial stamp");
                assert.ok(spissatusWideAzimuthViews.every(({ silhouette, radial }) =>
                    silhouette.resolvedComponentCount >= 1 &&
                    silhouette.resolvedComponentCount <= 3 &&
                    silhouette.components.some(({ areaPixels,
                        boundingWidthPixels, boundingHeightPixels }) =>
                        areaPixels >= 24 && boundingWidthPixels >= 32 &&
                        boundingHeightPixels >= 20) &&
                    silhouette.minimumAffineEdgeReliefFraction >= 0.004 &&
                    silhouette.maximumStraightEdgeFraction < 0.99 &&
                    radial.radialEdgeVariationScore <= 0.20 &&
                    radial.radialCoverageScore <= 0.15),
                "spissatus wide azimuths cannot collapse a visible remnant into a screen card or radial stamp");
            } else if (referenceId === "ci-castellanus") {
                assert.equal(result.componentCount, 1,
                    "Ci castellanus lost its common base");
                assert.ok(result.boundingCompactness > 0.40 &&
                    result.projectedVerticalToHorizontalRatio > 0.35,
                "Ci castellanus lost resolved crenellated vertical mass");
            } else if (referenceId === "ci-floccus") {
                assert.ok(result.componentCount >= 5 &&
                    result.antiOvalScore > 0.80 &&
                    result.boundingCompactness < 0.30,
                "Ci floccus lost detached ragged tuft support");
            } else if (referenceId === "cc-stratiformis") {
                assert.ok(result.componentCount >= 6 &&
                    result.antiOvalScore > 0.63 &&
                    result.boundingCompactness > 0.25 &&
                    result.boundingCompactness < 0.45,
                `${volumeId} lost its broken, aperiodic ripple grains`);
            } else if (referenceId === "cc-castellanus") {
                assert.equal(result.componentCount, 1,
                    "Cc castellanus lost its tiny common base");
                assert.ok(result.antiOvalScore > 0.50 &&
                    result.antiRibbonCompactness > 0.30,
                "Cc castellanus lost its resolved turret line");
            } else if (referenceId === "cc-lenticularis") {
                assert.ok(result.anisotropy > 4.5 &&
                    result.projectedVerticalToHorizontalRatio < 0.28 &&
                    result.boundingCompactness > 0.30,
                "Cc lenticularis lost its deliberate shallow laminar lens cue");
            } else if (referenceId === "cc-floccus") {
                assert.ok(result.componentCount >= 8 &&
                    result.antiOvalScore > 0.85 &&
                    result.boundingCompactness < 0.20,
                "Cc floccus lost its detached sub-degree tuft population");
            } else if (referenceId === "cs-fibratus") {
                assert.ok(result.antiOvalScore > 0.14,
                    "Cs fibratus lost its embedded fibrous veil structure");
            } else if (referenceId === "cs-nebulosus") {
                assert.ok(result.antiOvalScore < 0.12 &&
                    result.boundingCompactness > 0.98,
                "Cs nebulosus lost its smooth continuous veil cue");
            }
        }
    }
    if (process.env.CLOUD_PROJECTION_DIAGNOSTICS === "1") {
        console.log(JSON.stringify(diagnostics, null, 2));
    }
});

test("basic Cirrostratus is one transparent physical veil, not overlapping cards", () => {
    for (const referenceId of ["cs-fibratus", "cs-nebulosus"]) {
        const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
            ({ id }) => id === `${referenceId}--day-oblique-natural`,
        );
        assert.ok(benchmarkCase);
        const runtime = runtimeModule.createCloudSystemRuntime(
            benchmarkCase.preview.cloudScene,
        );
        assert.equal(runtime.systems.length, 1,
            `${referenceId} duplicated one continuous frontal veil`);
        const owner = runtime.systems[0];
        assert.equal(owner.compiled.macroTopology, "layered-veil");
        assert.equal(owner.state.organization.kind, "frontal-shield");
        assert.ok(owner.compiled.material.liquidFraction01 <= 0.02,
            `${referenceId} ceased to be an ice veil`);
        const verticalOpticalDepth =
            owner.compiled.material.extinctionKm *
            owner.compiled.geometry.geometricDepthKm;
        assert.ok(verticalOpticalDepth >= 0.12 &&
            verticalOpticalDepth <= 0.42,
        `${referenceId} vertical optical depth ${verticalOpticalDepth} ` +
            "cannot preserve the source through the benchmark veil");
    }
});

test("production Altocumulus floccus has a readable foreground tuft hierarchy", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ac-floccus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    assert.equal(runtime.systems.length, 10,
        "Ac floccus must retain its complete aperiodic owner population");
    const frames = [
        [-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5],
    ].map((jitterPixels) => runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        { ...productionFrameOptions, jitterPixels },
    ));
    const supports = frames.map(({ supportFraction }) => supportFraction);
    assert.ok(frames.every(({ supportFraction }) =>
        supportFraction >= 0.10 && supportFraction <= 0.14),
    `Ac floccus fixed-frame support varied from ` +
        `${(Math.min(...supports) * 100).toFixed(2)}% to ` +
        `${(Math.max(...supports) * 100).toFixed(2)}%`);
    assert.ok(frames.every(({ ownerProjections }) =>
        ownerProjections.filter(({ supportedFraction }) =>
            supportedFraction >= 0.003).length >= 3),
    "Ac floccus lacks three materially supported foreground packets");
    assert.ok(frames.every(({ supportFraction }) =>
        1 - supportFraction >= 0.85),
    "Ac floccus no longer preserves at least 85% clear sky");

    const foreground = runtime.systems.slice(0, 4);
    const ranges = foreground.map(rangeOf);
    const diameters = foreground.map(({ state }) =>
        state.extent.majorRadiusKm * 2);
    assert.ok(ranges[0] >= 22 && ranges[0] <= 25);
    assert.ok(ranges[1] >= 27 && ranges[1] <= 31);
    assert.ok(ranges[2] >= 32 && ranges[2] <= 37);
    assert.ok(ranges[3] >= 38 && ranges[3] <= 43);
    assert.ok(diameters[0] >= 13 && diameters[0] <= 15);
    assert.ok(diameters[1] >= 10 && diameters[1] <= 12);
    assert.ok(diameters[2] >= 9 && diameters[2] <= 11);
    assert.ok(diameters[3] >= 8.5 && diameters[3] <= 11);
    assert.equal(new Set(diameters.map((diameter) =>
        diameter.toFixed(2))).size, 4,
    "Ac floccus foreground packets repeated one formation span");
    assert.ok(runtime.systems.every(({ state }) =>
        state.extent.majorRadiusKm * 2 >= 2 &&
        state.extent.majorRadiusKm * 2 <= 40),
    "an Ac floccus packet escaped its 2–40 km family span contract");
});

test("production fibratus has a physical near/mid/far ladder without a clipped owner stamp", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-fibratus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    assert.equal(runtime.morphologyRequests.length, runtime.systems.length);
    for (const request of runtime.morphologyRequests) {
        const owner = runtime.systems[request.parent.ownerIndex];
        assert.deepEqual(request.deterministicSeeds, owner.seeds,
            "production morphology requests must carry the uploaded owner seeds");
    }
    const packedMorphology = morphologyModule.packCloudMorphologyModifiers(
        morphologyManifest,
        runtime.morphologyRequests,
    );
    assert.equal(packedMorphology.recordCount, 0);
    assert.equal(packedMorphology.fibratusDescriptorCount,
        packedMorphology.fibratusOwnerRanges.slice(0, runtime.systems.length)
            .reduce((sum, range) => sum + range.count, 0));
    assert.ok(packedMorphology.fibratusOwnerRanges
        .slice(0, runtime.systems.length)
        .every(({ count, dropped }) => count >= 6 && count <= 8 && dropped === 0),
    "every exact production fibratus owner must pack its complete anatomy");
    // Cloud owners inhabit the renderer's stable view-local meteorological
    // tangent frame. Camera azimuth zero is its physical forward meridian;
    // astronomical compass azimuth rotates the boundary sources, not density.
    const frameOptions = {
        azimuthRadians:
            runtimeModule.CIRRUS_FIBRATUS_QUALIFIED_MERIDIAN_RADIANS,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
    };
    const frame = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        { ...frameOptions, horizontalSamples: 96, verticalSamples: 64 },
    );
    assert.equal(runtime.systems.length, 6);
    assert.equal(frame.visibleOwnerCount, 6,
        `fibratus frame exposed ${frame.visibleOwnerCount} complete owners`);
    assert.ok(frame.supportFraction >= 0.14 && frame.supportFraction <= 0.17,
        `fibratus owner domains support ${(frame.supportFraction * 100).toFixed(1)}% of frame`);
    assert.ok(frame.negativeSkyFraction >= 0.82,
        "sparse fibratus needs substantial uninterrupted negative sky");
    assert.ok(frame.ownerProjections.every(({ edgeContacts }) =>
        edgeContacts.count < 3),
    "no fibratus owner may dominate three frame edges");
    assert.ok(Math.max(...frame.ownerProjections.map(({ supportedShare }) =>
        supportedShare)) < 0.45,
    "one near fibratus owner still dominates the complete projected formation");
    assert.ok(Math.max(...frame.ownerProjections.map(
        ({ projectedHorizontalSpanRadians }) => projectedHorizontalSpanRadians,
    )) < benchmarkCase.environment.horizontalFov * Math.PI / 180 * 0.58,
    "a fibratus formation still spans most of the frame like a clipped ribbon");
    assert.ok(frame.ownerProjections.some(({ edgeContacts }) =>
        edgeContacts.left || edgeContacts.right),
    "one remote physical fibratus formation should frame a horizontal edge");

    const visibleRanges = frame.ownerProjections.map(
        ({ horizontalRangeKm }) => horizontalRangeKm,
    ).sort((left, right) => left - right);
    assert.ok(visibleRanges.at(-1) / visibleRanges[0] > 3,
        `fibratus lacks real atmospheric depth: ${visibleRanges.join(",")}`);
    const scaleLadder = [...frame.ownerProjections].sort(
        (left, right) => left.horizontalRangeKm - right.horizontalRangeKm,
    );
    assert.ok(scaleLadder[0].projectedHorizontalSpanRadians >
        scaleLadder[1].projectedHorizontalSpanRadians * 1.08 &&
        scaleLadder[1].projectedHorizontalSpanRadians >
            scaleLadder.at(-1).projectedHorizontalSpanRadians * 2,
    `fibratus projected scale ladder collapsed: ${scaleLadder.map(
        ({ projectedHorizontalSpanRadians }) =>
            (projectedHorizontalSpanRadians * 180 / Math.PI).toFixed(1),
    ).join(",")}°`);
    const elementWidthsDegrees = frame.ownerProjections.map(
        ({ projectedElementWidthRadians }) =>
            projectedElementWidthRadians * 180 / Math.PI,
    );
    assert.ok(elementWidthsDegrees.every((width) => width >= 0.01 && width <= 0.8),
        `fibratus fibres leave the plausible sub-degree range: ${elementWidthsDegrees.join(",")}`);
});

test("fibratus production qualification is stable across render scale and half-pixel jitter", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-fibratus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const common = {
        azimuthRadians:
            runtimeModule.CIRRUS_FIBRATUS_QUALIFIED_MERIDIAN_RADIANS,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
    };
    const projections = [
        [72, 48],
        [96, 64],
        [144, 96],
    ].flatMap(([horizontalSamples, verticalSamples]) => [
        { horizontalSamples, verticalSamples, jitterPixels: [-0.5, 0.5] },
        { horizontalSamples, verticalSamples, jitterPixels: [0, 0] },
        { horizontalSamples, verticalSamples, jitterPixels: [0.5, -0.5] },
    ]).map((sampling) => runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        { ...common, ...sampling },
    ));
    const support = projections.map(({ supportFraction }) => supportFraction);
    assert.ok(Math.min(...support) >= 0.14 &&
        Math.max(...support) <= 0.17,
    `fibratus support escaped the qualified sparse range: ${support.join(",")}`);
    assert.ok(Math.max(...support) - Math.min(...support) < 0.012,
        `fibratus support is sample-grid sensitive: ${support.join(",")}`);
    assert.ok(projections.every(({ negativeSkyFraction }) =>
        negativeSkyFraction >= 0.82),
    "fibratus scale/jitter qualification lost its broad negative sky");
    assert.ok(projections.every(({ ownerProjections }) =>
        Math.max(...ownerProjections.map(({ supportedShare }) =>
            supportedShare)) < 0.45),
    "a fibratus owner dominates at an ordinary render scale or jitter");
    assert.equal(new Set(projections.map(({ visibleOwnerCount }) =>
        visibleOwnerCount)).size, 1,
    "fibratus owners pop at ordinary render scales or sub-pixel jitter");
    const edgeOwners = projections.map(({ ownerProjections }) =>
        ownerProjections.filter(({ edgeContacts }) =>
            edgeContacts.left || edgeContacts.right ||
            edgeContacts.top || edgeContacts.bottom)
            .map(({ ownerIndex }) => ownerIndex).join(","));
    assert.equal(new Set(edgeOwners).size, 1,
        `edge framing changes under sub-pixel jitter: ${edgeOwners.join(" / ")}`);
});

test("mature fibratus population materializes all four family macroforms over three atlas anatomies", () => {
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-fibratus--day-oblique-natural",
    );
    assert.ok(benchmarkCase);
    const matureLayer = {
        ...benchmarkCase.preview.cloudScene.layers[2],
        lifecycle: 0.62,
        coverage: 0.625,
        oktas: 5,
    };
    const runtime = runtimeModule.createCloudSystemRuntime(sceneWithLayer(
        matureLayer,
        2,
        {
            ...benchmarkCase.preview.cloudScene,
            seed: [0.271, 0.619, 0.843, 0.137],
        },
    ));
    const familyVariants = new Set(runtime.systems.map(
        ({ familyProduction }) => familyProduction?.topologyVariantId,
    ));
    assert.deepEqual([...familyVariants].sort(), [
        "convergent-bands",
        "entangled-shear",
        "irregular-curved",
        "straight-separated",
    ]);
    assert.ok(new Set(runtime.systems.map(
        ({ atlasDeterministicVariant }) => atlasDeterministicVariant)).size <= 3,
    "family macroform variety must not require duplicate atlas volumes");
    assert.ok(runtime.systems.every(({ familyProduction }) =>
        familyProduction.formationSpanKm >= 4 &&
        familyProduction.formationSpanKm <= 28),
    "physical near/far hierarchy must remain inside the fibratus span contract");
});

test("world owners form an aperiodic best-candidate population", () => {
    const runtime = runtimeModule.createCloudSystemRuntime(scene);
    const bearings = runtime.systems.map(({ state }) => Math.atan2(
        state.extent.centerEastKm,
        state.extent.centerNorthKm,
    )).sort((left, right) => left - right);
    const gaps = bearings.slice(1).map((bearing, index) =>
        bearing - bearings[index]);
    const ranges = runtime.systems.map(({ state }) => Math.hypot(
        state.extent.centerEastKm,
        state.extent.centerNorthKm,
    ));
    // A slot/ring layout has one repeated angular gap and one repeated range.
    // The physical point process must vary both while retaining finite spacing.
    assert.ok(new Set(gaps.map((gap) => gap.toFixed(2))).size >= 3);
    assert.ok(new Set(ranges.map((range) => range.toFixed(2))).size >= 4);
    let minimumSeparation = Number.POSITIVE_INFINITY;
    for (let first = 0; first < runtime.systems.length; first += 1) {
        for (let second = first + 1; second < runtime.systems.length; second += 1) {
            const a = runtime.systems[first].state.extent;
            const b = runtime.systems[second].state.extent;
            minimumSeparation = Math.min(minimumSeparation, Math.hypot(
                a.centerEastKm - b.centerEastKm,
                a.centerNorthKm - b.centerNorthKm,
            ));
        }
    }
    assert.ok(minimumSeparation > 0.08);
});

test("cloud streets retain finite physical band organization", () => {
    const streetScene = structuredClone(scene);
    streetScene.layers[0].organization = "streets";
    streetScene.layers[0].organizationStrength = 0.82;
    const runtime = runtimeModule.createCloudSystemRuntime(streetScene);
    assert.deepEqual(runtime.diagnostics, []);
    assert.ok(runtime.systems.every(({ state }) =>
        state.organization.kind === "banded"));
    assert.ok(runtime.systems.every(({ state }) =>
        state.organization.bandSpacingKm > 0 &&
        state.organization.lengthKm > state.organization.bandSpacingKm));
    const along = runtime.systems.map(({ state }) =>
        state.extent.centerEastKm * Math.cos(streetScene.layers[0].windDirection) +
        state.extent.centerNorthKm * Math.sin(streetScene.layers[0].windDirection));
    const cross = runtime.systems.map(({ state }) =>
        -state.extent.centerEastKm * Math.sin(streetScene.layers[0].windDirection) +
        state.extent.centerNorthKm * Math.cos(streetScene.layers[0].windDirection));
    const span = (values) => Math.max(...values) - Math.min(...values);
    assert.ok(span(along) > span(cross) * 1.25,
        `Cu streets must place complete owners along finite parallel rows; ` +
        `along=${span(along).toFixed(3)} cross=${span(cross).toFixed(3)}`);
    const alongGaps = along.sort((a, b) => a - b).slice(1).map((value, index) =>
        value - along[index]);
    assert.ok(Math.max(...alongGaps) - Math.min(...alongGaps) > 0.05,
        "Cu street spacing must remain aperiodic rather than a grid");
});

test("weather Cumulus radiatus streets remain anchored in the forward world disk", () => {
    const targetId = "variety-cumulus-radiatus";
    const classification = {
        genus: "cumulus",
        species: "congestus",
        varieties: ["radiatus"],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    };
    const cloudScene = qualificationScene({
        targetId,
        classification,
        environment: {
            latitude: 44,
            season: 0.78,
            relativeHumidity: 0.42,
            boundaryLayer: "convective",
        },
        layerRequest: {
            genus: "cumulus",
            species: "cumulus-congestus",
            oktas: 3,
            baseAltitude: 750,
            thickness: 4_500,
            opticalDepth: 0.72,
            convection: 0.56,
            precipitation: 0,
            iceFraction: 0.05,
            windSpeed: 7,
            windDirection: qualificationSeed(targetId)[0] * Math.PI * 2,
            shear: 0.92,
            turbulence: 0.72,
            organization: "banded",
            lifecycle: 0.52,
            organizationStrength: 0.82,
        },
        sceneOverrides: {
            convection: 0.62,
            instability: 0.58,
        },
    });
    const runtime = runtimeModule.createCloudSystemRuntime(cloudScene);
    const repeated = runtimeModule.createCloudSystemRuntime(
        structuredClone(cloudScene),
    );
    assert.deepEqual(
        runtime.systems.map(({ state }) => state.extent),
        repeated.systems.map(({ state }) => state.extent),
    );
    assert.ok(runtime.systems.length >= 3);
    assert.ok(runtime.systems.every(({ state }) =>
        state.organization.kind === "banded"));

    const windDirection = cloudScene.layers[0].windDirection;
    const along = runtime.systems.map(({ state }) =>
        state.extent.centerEastKm * Math.cos(windDirection) +
        state.extent.centerNorthKm * Math.sin(windDirection));
    const cross = runtime.systems.map(({ state }) =>
        -state.extent.centerEastKm * Math.sin(windDirection) +
        state.extent.centerNorthKm * Math.cos(windDirection));
    const span = (values) => Math.max(...values) - Math.min(...values);
    assert.ok(span(along) > span(cross) * 1.25,
        `radiatus lost wind alignment: along=${span(along).toFixed(2)} ` +
        `cross=${span(cross).toFixed(2)}`);

    let minimumGapKm = Number.POSITIVE_INFINITY;
    for (let first = 0; first < runtime.systems.length; first += 1) {
        const firstExtent = runtime.systems[first].state.extent;
        const firstRange = rangeOf(runtime.systems[first]);
        assert.ok(firstExtent.centerNorthKm > 0,
            `radiatus owner ${first} crossed behind its forward meridian`);
        assert.ok(firstRange >= firstExtent.majorRadiusKm * 2.25 - 1e-8,
            `radiatus owner ${first} intersects the observer`);
        for (let second = first + 1;
            second < runtime.systems.length;
            second += 1) {
            const secondExtent = runtime.systems[second].state.extent;
            minimumGapKm = Math.min(minimumGapKm, Math.hypot(
                firstExtent.centerEastKm - secondExtent.centerEastKm,
                firstExtent.centerNorthKm - secondExtent.centerNorthKm,
            ));
        }
    }
    assert.ok(minimumGapKm >= 0.5,
        `radiatus owner gaps collapsed to ${minimumGapKm.toFixed(3)} km`);

    const frame = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        productionFrameOptions,
    );
    assert.ok(frame.visibleOwnerCount >= 2,
        `radiatus exposes only ${frame.visibleOwnerCount} owners in production`);
    assert.ok(frame.supportFraction >= 0.02,
        `radiatus fixed-frame support was ${(frame.supportFraction * 100).toFixed(2)}%`);
});

test("orthogonal varieties resolve physically compatible owner organization", () => {
    const natural = (genus, species, variety) => ({
        genus,
        species,
        varieties: [variety],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    });
    const cases = [
        {
            name: "stratus undulatus",
            layer: {
                ...congestusLayer,
                genus: "stratus",
                species: "stratus-nebulosus",
                baseAltitude: 180,
                thickness: 420,
                towerAmount: 0,
                organization: "unorganized",
            },
            classification: natural("stratus", "nebulosus", "undulatus"),
            expected: (organization) => organization.kind === "wave-packet" &&
                organization.crestCount >= 4,
        },
        {
            name: "cumulus radiatus",
            layer: {
                ...congestusLayer,
                genus: "cumulus",
                species: "cumulus-humilis",
                thickness: 780,
                towerAmount: 0.24,
                organization: "isolated",
            },
            classification: natural("cumulus", "humilis", "radiatus"),
            expected: (organization) => organization.kind === "banded" &&
                organization.lengthKm > organization.bandSpacingKm,
        },
        {
            name: "stratocumulus lacunosus",
            layer: {
                ...congestusLayer,
                genus: "stratocumulus",
                species: "stratocumulus-stratiformis",
                thickness: 900,
                towerAmount: 0.08,
                organization: "closed-cell",
            },
            classification: natural(
                "stratocumulus", "stratiformis", "lacunosus",
            ),
            expected: (organization) => organization.kind === "cellular" &&
                organization.topology === "lacunar",
        },
    ];
    for (const entry of cases) {
        const classifiedScene = sceneWithLayer(entry.layer, 0, {
            classifications: [{
                layerIndex: 0,
                systemIndex: 0,
                classification: entry.classification,
            }],
        });
        const runtime = runtimeModule.createCloudSystemRuntime(classifiedScene);
        assert.deepEqual(runtime.diagnostics, [], entry.name);
        const owner = runtime.systems.find((system) => system.systemIndex === 0);
        assert.ok(owner, `${entry.name} lost its assigned owner`);
        assert.ok(entry.expected(owner.state.organization),
            `${entry.name} resolved ${JSON.stringify(owner.state.organization)}`);
        assert.deepEqual(owner.morphologyAssignment.classification,
            entry.classification);
    }
});

test("Altostratus duplicatus packs two persistent superposed layers with real parallax", () => {
    const classification = {
        genus: "altostratus",
        species: null,
        varieties: ["duplicatus"],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    };
    const aggregateLayer = {
        ...congestusLayer,
        genus: "altostratus",
        species: "altostratus-opacus",
        baseAltitude: 3_000,
        thickness: 2_400,
        coverage: 0.75,
        oktas: 6,
        towerAmount: 0,
        iceFraction: 0.42,
        precipitation: 0,
        organization: "frontal",
        windSpeed: 18,
        shear: 0.52,
    };
    const lowerLayer = {
        ...aggregateLayer,
        baseAltitude: 2_850,
        thickness: 1_180,
        windSpeed: 16,
        windDirection: 0.38,
    };
    const upperLayer = {
        ...aggregateLayer,
        baseAltitude: 4_320,
        thickness: 860,
        windSpeed: 23,
        windDirection: 0.71,
        shear: 0.68,
    };
    const authoredSystems = [
        {
            id: "as-duplicatus-lower",
            layerIndex: 1,
            layer: lowerLayer,
            manifold: {
                centerEastKm: -14, centerNorthKm: 36,
                majorRadiusKm: 48, minorRadiusKm: 24,
                orientation: 0.38, boundaryTransitionKm: 3.6,
            },
        },
        {
            id: "as-duplicatus-upper",
            layerIndex: 1,
            layer: upperLayer,
            manifold: {
                centerEastKm: 19, centerNorthKm: 63,
                majorRadiusKm: 34, minorRadiusKm: 15,
                orientation: 0.71, boundaryTransitionKm: 2.5,
            },
        },
    ];
    const duplicatusScene = sceneWithLayer(aggregateLayer, 1, {
        authoredSystems,
        classifications: authoredSystems.map(({ id }) => ({
            layerIndex: 1,
            systemId: id,
            classification,
        })),
    });
    const result = runtimeModule.createCloudSystemRuntime(duplicatusScene);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.systems.length, 2,
        "authored tier must suppress the aggregate generated population");
    assert.deepEqual(result.systems.map(({ state }) => state.id),
        ["as-duplicatus-lower", "as-duplicatus-upper"]);
    assert.ok(result.systems.every((owner) =>
        owner.morphologyAssignment?.systemId === owner.state.id &&
        owner.familyProduction?.representation === "altostratus-duplicatus"));
    assert.deepEqual(result.systems.map((owner) => [
        owner.state.physical.baseAltitudeKm,
        owner.state.physical.geometricDepthKm,
        owner.state.physical.kinematics.windSpeed,
        owner.state.physical.kinematics.windDirection,
    ]), [
        [2.85, 1.18, 16, 0.38],
        [4.32, 0.86, 23, 0.71],
    ]);
    assert.deepEqual(result.systems.map(({ state }) => [
        state.extent.centerEastKm, state.extent.centerNorthKm,
    ]), [[-14, 36], [19, 63]]);
    assert.deepEqual(
        result.systems.map(({ state }) => state.extent),
        authoredSystems.map(({ manifold }) => manifold),
        "family adaptation must preserve each complete authored finite manifold",
    );
    const apparentElevation = result.systems.map(({ state }) => Math.atan2(
        state.physical.baseAltitudeKm,
        Math.hypot(state.extent.centerEastKm, state.extent.centerNorthKm),
    ));
    assert.notEqual(apparentElevation[0], apparentElevation[1],
        "separate altitude/range manifolds must produce physical parallax");
    const packed = result.packedSystemData.data;
    for (const [index, owner] of result.systems.entries()) {
        const offset = (1 + index * runtimeModule.CLOUD_SYSTEM_VEC4_STRIDE) * 4;
        assert.equal(packed[offset + 1 * 4], owner.state.extent.centerEastKm);
        assert.equal(packed[offset + 1 * 4 + 1], owner.state.extent.centerNorthKm);
        assert.equal(packed[offset + 2 * 4],
            Math.fround(owner.state.physical.baseAltitudeKm));
        assert.equal(packed[offset + 2 * 4 + 1],
            Math.fround(owner.state.physical.geometricDepthKm));
        assert.equal(packed[offset + 7 * 4],
            Math.fround(owner.state.physical.kinematics.windSpeed));
    }
});

test("causal mother and embedded relations survive scene signatures and runtime assignment", () => {
    const classification = {
        genus: "stratus",
        species: "fractus",
        varieties: [],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    };
    const independent = sceneWithLayer({
        ...congestusLayer,
        genus: "stratus",
        species: "stratus-fractus",
        baseAltitude: 180,
        thickness: 360,
        towerAmount: 0,
        precipitation: 0,
    }, 0, { classifications: [{
        layerIndex: 0,
        systemIndex: 0,
        relation: "independent",
        classification,
    }] });
    const embedded = structuredClone(independent);
    embedded.classifications[0].relation = "embedded";
    assert.notEqual(
        runtimeModule.cloudSystemSceneSignature(independent),
        runtimeModule.cloudSystemSceneSignature(embedded),
    );
    const result = runtimeModule.createCloudSystemRuntime(embedded);
    const owner = result.systems.find((candidate) => candidate.systemIndex === 0);
    assert.equal(owner.morphologyAssignment.relation, "embedded");
});

test("genitus and mutatus labels without a material mother are rejected", () => {
    const baseLayer = {
        ...congestusLayer,
        genus: "stratus",
        species: "stratus-fractus",
        baseAltitude: 180,
        thickness: 420,
        towerAmount: 0,
        iceFraction: 0.01,
        precipitation: 0,
    };
    const classification = (origin) => ({
        genus: "stratus",
        species: "fractus",
        varieties: [],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin,
    });
    const make = (origin, relation) => runtimeModule.createCloudSystemRuntime(
        sceneWithLayer(baseLayer, 0, { classifications: [{
            layerIndex: 0,
            systemIndex: 0,
            relation,
            classification: classification(origin),
        }] }),
    );
    const naturalRuntime = make({ kind: "natural" }, "independent");
    const natural = naturalRuntime.systems.find((owner) => owner.systemIndex === 0);
    const genitus = make({ kind: "genitus", motherGenus: "cumulus" }, "genitus");
    const mutatus = make({ kind: "mutatus", motherGenus: "stratocumulus" }, "mutatus");
    assert.ok(natural);
    assert.equal(natural.familyProduction.causalOrigin, undefined);
    for (const causal of [genitus, mutatus]) {
        assert.ok(causal.diagnostics.some((diagnostic) =>
            diagnostic.includes("missing-causal-parent-reference")));
        assert.ok(causal.systems.every((owner) =>
            owner.familyProduction?.causalOrigin === undefined));
    }
});

test("classification assignments are rejected when authored at the wrong WMO level", () => {
    const low = {
        ...congestusLayer,
        genus: "stratus",
        species: "stratus-nebulosus",
        baseAltitude: 180,
        thickness: 420,
        towerAmount: 0,
        iceFraction: 0,
        precipitation: 0,
    };
    const invalid = sceneWithLayer(low, 0, { classifications: [{
        layerIndex: 0,
        systemIndex: 0,
        relation: "mother",
        classification: {
            genus: "cirrus",
            species: "fibratus",
            varieties: [],
            supplementaryFeatures: [],
            accessoryClouds: [],
            origin: { kind: "natural" },
        },
    }] });
    const result = runtimeModule.createCloudSystemRuntime(invalid);
    assert.ok(result.diagnostics.some((entry) =>
        entry.includes("classification-level-mismatch")));
    assert.ok(result.systems.length > 0);
    assert.ok(result.systems.every(({ state }) =>
        state.classification.genus === "stratus"));
    assert.ok(result.systems.every(({ morphologyAssignment }) =>
        morphologyAssignment === undefined));
});

test("family gate rejects impossible altitude, depth, and bulk phase", () => {
    const stratus = {
        ...congestusLayer,
        genus: "stratus",
        species: "stratus-nebulosus",
        baseAltitude: 8_000,
        thickness: 5_000,
        towerAmount: 0,
        iceFraction: 0,
        precipitation: 0,
    };
    const impossibleStratus = runtimeModule.createCloudSystemRuntime(
        sceneWithLayer(stratus),
    );
    assert.equal(impossibleStratus.systems.length, 0);
    assert.ok(impossibleStratus.diagnostics.some((entry) =>
        entry.includes("base-altitude-outside-family-envelope")));
    assert.ok(impossibleStratus.diagnostics.some((entry) =>
        entry.includes("geometric-depth-outside-family-envelope")));

    const liquidCirrus = {
        ...congestusLayer,
        genus: "cirrus",
        species: "cirrus-fibratus",
        baseAltitude: 9_000,
        thickness: 900,
        towerAmount: 0,
        iceFraction: 0.15,
        precipitation: 0,
    };
    const impossiblePhase = runtimeModule.createCloudSystemRuntime(
        sceneWithLayer(liquidCirrus, 2),
    );
    assert.equal(impossiblePhase.systems.length, 0);
    assert.ok(impossiblePhase.diagnostics.some((entry) =>
        entry.includes("phase-outside-family-envelope")));
});

test("upper-atmosphere owners require their real cold-phase temperature", () => {
    const carrier = {
        layerIndex: 2,
        systemIndex: 11,
        classification: {
            genus: "cirrus",
            species: "fibratus",
            varieties: [],
            supplementaryFeatures: [],
            accessoryClouds: [],
            origin: { kind: "natural" },
        },
    };
    const upperScene = (upperAtmosphericCloud, overrides) => ({
        ...scene,
        layers: [emptyLayer(), emptyLayer(), emptyLayer()],
        totalOktas: 0,
        classifications: [{ ...carrier, upperAtmosphericCloud }],
        ...overrides,
    });
    const warmNlc = runtimeModule.createCloudSystemRuntime(upperScene(
        "noctilucent",
        {
            latitude: 60,
            season: 0.9,
            solarDepression: 10,
            mesopauseTemperatureKelvin: 170,
        },
    ));
    assert.equal(warmNlc.morphologyRequests.length, 0);
    assert.ok(warmNlc.diagnostics.some((entry) =>
        entry.includes("mesopause-too-warm-for-noctilucent-ice")));

    const warmNacreous = runtimeModule.createCloudSystemRuntime(upperScene(
        "nacreous",
        {
            latitude: 70,
            season: 0.1,
            solarDepression: 7,
            stratosphericTemperatureKelvin: 205,
        },
    ));
    assert.equal(warmNacreous.morphologyRequests.length, 0);
    assert.ok(warmNacreous.diagnostics.some((entry) =>
        entry.includes("stratosphere-too-warm-for-selected-particle-class")));

    const coldNlc = runtimeModule.createCloudSystemRuntime(upperScene(
        "noctilucent",
        {
            latitude: 60,
            season: 0.9,
            solarDepression: 10,
            mesopauseTemperatureKelvin: 145,
        },
    ));
    assert.deepEqual(coldNlc.diagnostics, []);
    assert.equal(coldNlc.morphologyRequests.length, 1);
});

test("every production upper state has deterministic finite topology and particle provenance", () => {
    const carrier = {
        layerIndex: 2,
        systemIndex: 11,
        classification: {
            genus: "cirrus", species: "fibratus", varieties: [],
            supplementaryFeatures: [], accessoryClouds: [],
            origin: { kind: "natural" },
        },
    };
    const cases = [
        ["polar-stratospheric-sts", 196, "supercooled-ternary-solution"],
        ["polar-stratospheric-nat", 192, "nitric-acid-trihydrate"],
        ["polar-stratospheric-ice", 185, "stratospheric-water-ice"],
        ["nacreous", 185, "stratospheric-water-ice"],
        ["noctilucent", 145, "meteoric-smoke-nucleated-water-ice"],
    ];
    for (const [upperAtmosphericCloud, temperature, composition] of cases) {
        const noctilucent = upperAtmosphericCloud === "noctilucent";
        const authored = {
            ...scene,
            layers: [emptyLayer(), emptyLayer(), emptyLayer()],
            totalOktas: 0,
            noctilucent: noctilucent ? 0.82 : 0,
            latitude: noctilucent ? 62 : 70,
            season: noctilucent ? 0.9 : 0.1,
            solarDepression: noctilucent ? 10 : 7,
            stratosphericTemperatureKelvin: noctilucent ? 184 : temperature,
            mesopauseTemperatureKelvin: noctilucent ? temperature : 145,
            classifications: [{ ...carrier, upperAtmosphericCloud }],
        };
        const first = runtimeModule.createCloudSystemRuntime(authored);
        const second = runtimeModule.createCloudSystemRuntime(authored);
        assert.deepEqual(first.diagnostics, [], upperAtmosphericCloud);
        assert.deepEqual(first.morphologyRequests, second.morphologyRequests,
            upperAtmosphericCloud);
        assert.equal(first.morphologyRequests.length, 1, upperAtmosphericCloud);
        const request = first.morphologyRequests[0];
        assert.equal(request.upperAtmosphericState.stateId,
            upperAtmosphericCloud);
        assert.equal(request.upperAtmosphericState.composition, composition);
        assert.equal(request.upperAtmosphericState.polarizationBasis,
            "scalar-rgb-with-latent-stokes-mueller-basis");
        assert.ok(request.upperAtmosphericState.topologyVariantId.length > 4);
        assert.ok(request.parent.halfExtentsKm.every((value) =>
            Number.isFinite(value) && value > 0));
        const modifierId = morphologyModule.upperMorphologyModifierForState(
            upperAtmosphericCloud,
        );
        assert.ok(["polar-stratospheric", "nacreous", "noctilucent"]
            .includes(modifierId));
        const topologyIds = new Set();
        for (let variantSeed = 0; variantSeed < 48; variantSeed += 1) {
            const varied = runtimeModule.createCloudSystemRuntime({
                ...authored,
                seed: [variantSeed / 47, 0.17, 0.53, 0.89],
            });
            topologyIds.add(varied.morphologyRequests[0]
                .upperAtmosphericState.topologyVariantId);
        }
        assert.equal(topologyIds.size, 3,
            `${upperAtmosphericCloud}: every finite topology must be reachable`);
    }
});

test("formation manifolds preserve physical ordering", () => {
    const runtime = runtimeModule.createCloudSystemRuntime(scene);
    for (const { state } of runtime.systems) {
        const formation = state.physical.formation;
        assert.ok(formation.levelOfFreeConvectionKm >=
            formation.liftingCondensationLevelKm);
        assert.ok(formation.equilibriumLevelKm > formation.levelOfFreeConvectionKm);
        assert.ok(formation.shearLayerTopKm > formation.shearLayerBaseKm);
        assert.ok(formation.inversionBaseKm === null ||
            formation.inversionBaseKm >= state.physical.baseAltitudeKm);
    }
});

test("storage packing is aligned, count-bounded, and reports truncation", () => {
    const runtime = runtimeModule.createCloudSystemRuntime(scene);
    const packed = runtimeModule.packCloudSystems(runtime.systems, 2);
    assert.equal(packed.count, 2);
    assert.equal(packed.capacity, 2);
    assert.equal(packed.dropped, runtime.systems.length - 2);
    assert.equal(packed.data.length, (1 + 2 * 16) * 4);
    assert.deepEqual([...packed.data.slice(0, 4)], [2, 16, 2, packed.dropped]);
    assert.equal(packed.data.byteLength % 256, 16);
    assert.ok(Number.isFinite(packed.data.at(-1)));
});

test("every mapped species has broad, causal, classification-safe topology exemplars", () => {
    const catalogs = stateMapModule.CLOUD_TOPOLOGY_EXEMPLARS;
    const recipes = stateMapModule.CLOUD_RENDERER_RECIPES;
    const permittedConnectivity = {
        "thermal-field": ["single-connected"],
        "fragment-field": ["fragmented-population"],
        "cellular-cloudlet-field": ["cellular-colony"],
        "castellated-deck": ["cellular-colony", "fragmented-population"],
        "floccus-field": ["fragmented-population"],
        "ice-streamer-field": ["fragmented-population"],
        "layered-veil": ["continuous-sheet"],
        "precipitating-sheet": ["continuous-sheet"],
        "boundary-layer-sheet": ["continuous-sheet"],
        "wave-lens-train": ["finite-wave-packet"],
        "roll-tube": ["roll-tube"],
        "deep-storm-complex": ["single-connected"],
    };
    assert.deepEqual(Object.keys(catalogs).sort(), Object.keys(recipes).sort());
    for (const [species, recipe] of Object.entries(recipes)) {
        const exemplars = catalogs[species];
        assert.equal(exemplars.length, 3, `${species} exemplar breadth`);
        assert.equal(new Set(exemplars.map((item) => item.id)).size, 3);
        assert.equal(new Set(exemplars.map((item) => item.causalGeometry)).size, 3);
        assert.equal(new Set(exemplars.map((item) =>
            JSON.stringify(item.construction))).size, 3);
        for (const [ordinal, item] of exemplars.entries()) {
            assert.equal(item.species, species);
            assert.equal(item.ordinal, ordinal);
            assert.equal(item.macroTopology, recipe.macroTopology);
            assert.ok(permittedConnectivity[recipe.macroTopology].includes(
                item.connectivity),
            `${species}/${item.id} has impossible connectivity`);
            assert.ok(item.construction.macroElementCount[0] >= 2);
            assert.ok(item.construction.macroElementCount[1] >=
                item.construction.macroElementCount[0]);
        }
    }
});

test("scene/day topology selection is deterministic, owner-stable, and reaches all variants", () => {
    for (const species of Object.keys(stateMapModule.CLOUD_RENDERER_RECIPES)) {
        const select = (sceneDaySeed, ownerSeed = 7) =>
            stateMapModule.selectCloudTopologyExemplar({
                species, sceneDaySeed, ownerSeed,
            });
        assert.deepEqual(select([0.2, 0.4, 0.6, 0.8]),
            select([0.2, 0.4, 0.6, 0.8]));
        const breadth = new Set(Array.from({ length: 96 }, (_, seed) =>
            select(`2026-day-${seed}`, seed).id));
        assert.equal(breadth.size, 3, `${species} should reach every exemplar`);
    }
});

test("runtime carries the selected exemplar without changing the 16-vec4 GPU ABI", () => {
    const runtime = runtimeModule.createCloudSystemRuntime(scene);
    assert.ok(runtime.systems.length > 0);
    assert.equal(runtimeModule.CLOUD_SYSTEM_VEC4_STRIDE, 16);
    for (const system of runtime.systems) {
        assert.equal(system.topologyExemplar.species, system.compiled.recipeId);
        assert.equal(system.topologyExemplar.macroTopology,
            system.compiled.macroTopology);
        assert.equal(system.atlasDeterministicVariant,
            system.topologyExemplar.ordinal);
        assert.ok(system.seeds[3] >= system.topologyExemplar.ordinal / 3);
        assert.ok(system.seeds[3] < (system.topologyExemplar.ordinal + 1) / 3);
        if (system.familyProduction) {
            assert.equal(system.familyProduction.logicalTopologyExemplarId,
                system.topologyExemplar.id);
            assert.equal(system.familyProduction.logicalTopologyConnectivity,
                system.topologyExemplar.connectivity);
        } else {
            assert.ok(system.compiled.recipeId.startsWith("cumulus"),
                "only the specialized convective path omits family metadata");
        }
    }
    const troposphericRequests = runtime.morphologyRequests.filter((request) =>
        request.parent.ownerIndex < runtime.systems.length);
    assert.equal(troposphericRequests.length, runtime.systems.length);
    for (const request of troposphericRequests) {
        assert.deepEqual(request.logicalTopology,
            runtime.systems[request.parent.ownerIndex].topologyExemplar);
    }
});

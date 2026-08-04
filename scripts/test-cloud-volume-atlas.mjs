import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_EXTERIOR_DETAIL_CLASSES,
    CLOUD_MACRO_ATLAS_SCHEMA,
    CLOUD_MACRO_ATLAS_VERSION,
    CLOUD_MACRO_VOLUME_IDS,
    CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS,
    CLOUD_PROTECTED_CU_RECONSTRUCTION_SCALE,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS,
    CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION,
    CLOUD_MACRO_ATLAS_SEED,
    createCloudSpissatusStochasticModel,
    createCloudProtectedCuBaseContractWgsl,
    createCloudExteriorBoundaryChecksum,
    decodeCloudSignedDistanceVoxels,
    generateCloudMacroAtlas,
    evaluateCloudSpissatusStochasticField,
    reduceCloudMacroSource2x,
    resolveCloudExteriorBoundarySample,
    selectCloudExteriorDetailClass,
} from "./lib/cloud-volume-atlas.mjs";
import { CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL } from
    "../components/backgrounds/sky/cloud-volume-exterior-contract-wgsl.ts";
import {
    CLOUD_MACRO_FORMATION_CODE,
    CLOUD_MACRO_TOPOLOGY_CODE,
    CLOUD_MACRO_VOLUME_IDS as RUNTIME_VOLUME_IDS,
    cloudMacroVolumeCandidates,
    getCloudMacroConservativeSupport,
    getCloudHighIceSourceSampleTransform,
    packCloudAtlasForWebGPU,
    packCloudHighIceSourceAtlasForWebGPU,
    packCloudMajorantsForWebGPU,
    selectCloudMacroVolumeId,
    validateCloudMacroAtlasManifest,
} from "../components/backgrounds/sky/cloud-volume-atlas.ts";
import { WMO_CLOUD_SPECIES } from "../components/backgrounds/sky/cloud-scene.ts";

const manifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-macro-atlas-v2.json", import.meta.url),
    "utf8",
));
const atlas = readFileSync(new URL(`../public/assets/sky/${manifest.atlas.file}`, import.meta.url));
const majorants = readFileSync(
    new URL(`../public/assets/sky/${manifest.majorants.file}`, import.meta.url),
);
const highIceSourceAtlas = readFileSync(new URL(
    `../public/assets/sky/${manifest.highIceSourceAtlas.file}`,
    import.meta.url,
));
const rendererSource = readFileSync(new URL(
    "../components/backgrounds/sky/sky-renderer-canvas.tsx",
    import.meta.url,
), "utf8");
const atlasRuntimeSource = readFileSync(new URL(
    "../components/backgrounds/sky/cloud-volume-atlas.ts",
    import.meta.url,
), "utf8");
const loadedRuntimeAtlas = {
    manifest,
    atlasBytes: atlas,
    majorantBytes: majorants,
    highIceSourceAtlasBytes: highIceSourceAtlas,
    volumes: new Map(manifest.volumes.map((volume) => [volume.id, volume])),
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const PROTECTED_CU_SURFACE_BASELINE = Object.freeze({
    "cu-humilis": Object.freeze({
        normalSamples: 2626,
        axisDominant: 0.1370906321401371,
        latticeCrease: 0.11043412033511044,
        sharpCrease: 0.15325994919559696,
    }),
    "cu-mediocris": Object.freeze({
        normalSamples: 6559,
        axisDominant: 0.16420186003964019,
        latticeCrease: 0.10535142552218325,
        sharpCrease: 0.10630951717992983,
    }),
    "cu-congestus": Object.freeze({
        normalSamples: 10895,
        axisDominant: 0.1372189077558513,
        latticeCrease: 0.12042221202386416,
        sharpCrease: 0.14284281271943022,
    }),
    "cu-congestus-turreted": Object.freeze({
        normalSamples: 8742,
        axisDominant: 0.15305422100205904,
        latticeCrease: 0.1222832303820636,
        sharpCrease: 0.1310988367227383,
    }),
    "cu-congestus-multicell": Object.freeze({
        normalSamples: 14663,
        axisDominant: 0.1599263452226693,
        latticeCrease: 0.1081634044874855,
        sharpCrease: 0.14427356344575215,
    }),
});
const CONVECTIVE_BASELINE_BLOCKS = Object.freeze({
    "cu-humilis": ["2a866404ef5ce5a674d0f67ff1d243aaf6741f4c29a193c04d85ca2f09cfee28", "eca89bc6e8d8eaa6a8780eb71e7d4bc460aef970d11c3d27749e52c5b33b399a"],
    "cu-mediocris": ["3f514fbea9ecd82bd75970a733e1be9a00e172e3c0c64e07778cd73d10b990c4", "a0be6d934878f1624791d50a54fd0891415b481543fbf5c31c0be0997b8672db"],
    "cu-congestus": ["2bd0ca6667e30803b5c4f6ce1addd0c358bb62b596bd4c8ed6373f9727368a8b", "53ca0df05050c081ea2562bbc28c7b9e4c71a311d99b12047fdab0193fcbcc38"],
    "cb-calvus": ["9efac500b55b68ca1b4392deae1f233ec333398c1d9d3ac42f6ab6e22bb5c907", "8dc0a44823af7097e4ded8813d0aeb0289c9debc4fddc15017c39b8182b49d9f"],
    "cb-capillatus": ["ce03dfdf9387080d3ecaca15b804da069922bd572ab8a8f708a9dd89a820280f", "e3c6454e8feb767ea67fc24de35b2c4b613a8884ed606b31bdd1ba646807c70a"],
    "cb-capillatus-incus": ["e69230fabd7179eae0e9386914d03c0cc877f004a67ca3816a9eda8e6ee8c02d", "276cf0a17d6a99f6b31e48b54369ac357ff899912d1bb8eb3924f320bc51cd84"],
    "cb-dissipating": ["c39d8ef244b9cf507f52a3eb080f10847668da911d8390af0949295e6da7ba33", "04db8cdf383eea6cffb28ee9f972bf17075a7651be7a8391dc6d126a722e258e"],
    "cu-fractus": ["0e605400979b8d226e47f61fbdab65a1cb18ec727b452ada7bb3c3b5da4847f5", "7e88beebf0477369c0e42820a1ec46d08752a99813a4fec6db66dc0549d8ed95"],
    "cu-congestus-turreted": ["30a12286629d0fcc66f83aad71ed4d9401be10d79d923d1c0085e660dd8e7138", "85ed856a691f8cec653780f44201f8cba0a910a1379dff9318b011ef87a44028"],
    "cu-congestus-multicell": ["b2002c21eab94cec97d2ba710f82842a3f0a7a1ba0712b282d7fc6ab26fbc9db", "78366b96b2c79d276c5c624aef2f03eeb94f285e1c6ffee73b70b940b7719f6f"],
    "cb-calvus-multicell": ["18caf654adb5f8b29013b577cafb7261b6745d7c6e4732a934151170ef111f2c", "5dc32533c6b1efa7f22b0ca4b9b25ae27782bf1afa21ba069580d821f237a05a"],
    "cb-capillatus-sheared": ["079738510b2e8a928474d5102fb4fdc6988accd1f8d89be5c1cd270395ba447f", "3a5eb8d9e7688789776ca38ce80f122975a9461dfcf894819ef41b9258986f2a"],
    "cb-capillatus-incus-back-sheared": ["50f19f67540eb2f69e77d656193dc9b2d5eff20e19e225a5482fd3b5e1e1b036", "590e67ab2a35331c7f052d132cec9801e0e6b09eaa3339c5ab20d9e81d3d96c9"],
    "cb-dissipating-remnant": ["86025a81e6499586bc38ba6d85aaac2b889d5c8e2829d108d491f3587ca90399", "554dcaa15f8e4b8a187421e0aceabc54bbf5614cf89c55f974bc791550bfc720"],
});

const atlasSample = (volume, x, y, z) => {
    const { width, height } = manifest.atlas.dimensions;
    const index = (((volume.zOffset + z) * height + volume.yOffset + y) *
        width + volume.xOffset + x) * 4;
    return {
        density: atlas[index],
        detail: atlas[index + 1],
        phase: atlas[index + 2],
        signedDistance: atlas[index + 3],
    };
};

const meanVerticalDensityPath = (volume, densityAt) => {
    const resolution = manifest.atlas.volumeResolution;
    const sampleSpacing = 1 / (resolution - 1);
    const paths = [];
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let integral = 0;
            for (let y = 0; y < resolution; y += 1) {
                integral += densityAt(atlasSample(volume, x, y, z)) *
                    sampleSpacing;
            }
            if (integral > 0) paths.push(integral);
        }
    }
    return paths.reduce((sum, value) => sum + value, 0) /
        Math.max(1, paths.length);
};

const normalizedElevationProjection = (volume, horizontalAxis, size = 32) => {
    const resolution = manifest.atlas.volumeResolution;
    const projection = new Uint8Array(resolution * resolution);
    for (let horizontal = 0; horizontal < resolution; horizontal += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let depth = 0; depth < resolution; depth += 1) {
                const x = horizontalAxis === 0 ? horizontal : depth;
                const z = horizontalAxis === 0 ? depth : horizontal;
                if (atlasSample(volume, x, y, z).density <= 0) continue;
                projection[y * resolution + horizontal] = 1;
                break;
            }
        }
    }
    let minimumHorizontal = resolution;
    let maximumHorizontal = -1;
    let minimumY = resolution;
    let maximumY = -1;
    for (let y = 0; y < resolution; y += 1) {
        for (let horizontal = 0; horizontal < resolution; horizontal += 1) {
            if (!projection[y * resolution + horizontal]) continue;
            minimumHorizontal = Math.min(minimumHorizontal, horizontal);
            maximumHorizontal = Math.max(maximumHorizontal, horizontal);
            minimumY = Math.min(minimumY, y);
            maximumY = Math.max(maximumY, y);
        }
    }
    const normalized = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
        for (let horizontal = 0; horizontal < size; horizontal += 1) {
            const sourceHorizontal = Math.round(minimumHorizontal +
                horizontal / (size - 1) *
                    (maximumHorizontal - minimumHorizontal));
            const sourceY = Math.round(minimumY + y / (size - 1) *
                (maximumY - minimumY));
            normalized[y * size + horizontal] =
                projection[sourceY * resolution + sourceHorizontal];
        }
    }
    return normalized;
};

const binaryJaccard = (left, right) => {
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] && right[index]) intersection += 1;
        if (left[index] || right[index]) union += 1;
    }
    return intersection / Math.max(1, union);
};

const potentialDensityAt = (volume, x, y, z) => {
    const sample = atlasSample(volume, x, y, z);
    if (sample.density > 0) return sample.density;
    const detailClass = selectCloudExteriorDetailClass(
        volume.exteriorBoundary,
        sample.detail / 255,
        sample.phase / 255,
    );
    const definition = CLOUD_EXTERIOR_DETAIL_CLASSES[detailClass];
    const reach = definition.maximumCanonicalDisplacement *
        (manifest.atlas.volumeResolution - 1) * Math.max(...definition.axisScale) +
        volume.exteriorBoundary.interpolationHaloVoxels;
    const signedDistance = decodeCloudSignedDistanceVoxels(
        sample.signedDistance,
        manifest.atlas.channels.a.rangeVoxels,
    );
    return signedDistance >= 0 && signedDistance <= reach
        ? Math.ceil(definition.maximumExteriorDensity * 255)
        : 0;
};

const extractCanonicalAtlasBlock = (volume) => {
    const resolution = manifest.atlas.volumeResolution;
    const padding = manifest.atlas.paddingZ;
    const depth = resolution + padding * 2;
    const bytes = new Uint8Array(resolution * resolution * depth * 4);
    const { width, height } = manifest.atlas.dimensions;
    for (let localZ = -padding; localZ < resolution + padding; localZ += 1) {
        for (let y = 0; y < resolution; y += 1) {
            const source = (((volume.zOffset + localZ) * height +
                volume.yOffset + y) * width + volume.xOffset) * 4;
            const target = (((localZ + padding) * resolution + y) *
                resolution) * 4;
            bytes.set(atlas.subarray(source, source + resolution * 4), target);
        }
    }
    return bytes;
};

const extractCanonicalMajorantBlock = (volume) => {
    const grid = manifest.majorants.gridSize;
    const { width, height } = manifest.majorants.dimensions;
    const bytes = new Uint8Array(grid ** 3);
    for (let z = 0; z < grid; z += 1) {
        for (let y = 0; y < grid; y += 1) {
            const source = (((volume.majorantZOffset + z) * height +
                volume.majorantYOffset + y) * width + volume.majorantXOffset);
            const target = (z * grid + y) * grid;
            bytes.set(majorants.subarray(source, source + grid), target);
        }
    }
    return bytes;
};

test("macro atlas assets match the versioned manifest and checksums", () => {
    assert.equal(validateCloudMacroAtlasManifest(manifest), manifest);
    assert.equal(manifest.schema, CLOUD_MACRO_ATLAS_SCHEMA);
    assert.equal(manifest.version, CLOUD_MACRO_ATLAS_VERSION);
    assert.equal(atlas.byteLength, manifest.atlas.byteLength);
    assert.equal(majorants.byteLength, manifest.majorants.byteLength);
    assert.equal(
        highIceSourceAtlas.byteLength,
        manifest.highIceSourceAtlas.byteLength,
    );
    assert.equal(sha256(atlas), manifest.checksums.atlas);
    assert.equal(sha256(majorants), manifest.checksums.majorants);
    assert.equal(
        sha256(highIceSourceAtlas),
        manifest.checksums.highIceSourceAtlas,
    );
    assert.equal(
        createCloudExteriorBoundaryChecksum(manifest.exteriorBoundary, manifest.volumes),
        manifest.checksums.exteriorBoundary,
    );
    assert.equal(manifest.checksums.atlas, "0029ad79c731bb328c6331d3e30e86ca7f7bf33c61e899d2cc29519b3fa97002");
    assert.equal(manifest.checksums.majorants, "273e218aa74172acd444152d92d4e18574219e850d4ad4e8f12ba5470ad42d4f");
    assert.equal(manifest.checksums.exteriorBoundary, "ff79c944c284228500962fe96835c24a000ae2e41947edd43a9dac64f6c6ab92");
    assert.deepEqual(manifest.volumes.map((volume) => volume.id), CLOUD_MACRO_VOLUME_IDS);
    assert.deepEqual(RUNTIME_VOLUME_IDS, CLOUD_MACRO_VOLUME_IDS);
    assert.deepEqual(manifest.coordinateSystem.axes, {
        x: "crosswind",
        y: "altitude",
        z: "downwind",
    });
    assert.deepEqual(
        Object.fromEntries(Object.entries(manifest.atlas.channels).map(([key, value]) => [key, value.semantic])),
        {
            r: "macro-density",
            g: "detail-type",
            b: "ice-fraction",
            a: "conservative-signed-distance",
        },
    );
    assert.equal(manifest.atlas.volumeResolution, 48);
    assert.equal(manifest.atlas.volumeCount, 50);
    assert.ok(manifest.atlas.byteLength <= 24 * 1024 * 1024,
        "spatially tiled dense macro atlas must remain within its bounded GPU budget");
    assert.equal(manifest.atlas.packing.kind, "xz-tiled-canonical-volumes");
    assert.equal(manifest.atlas.packing.columns, 2);
    assert.ok(manifest.atlas.dimensions.depthOrArrayLayers <= 2048);
    assert.equal(manifest.majorants.semantic, "conservative-potential-density-majorant");
    assert.equal(manifest.highIceSourceAtlas.format, "rgba8unorm");
    assert.equal(manifest.highIceSourceAtlas.filtering, "linear");
    assert.equal(manifest.highIceSourceAtlas.sourceResolution,
        CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION);
    assert.deepEqual(manifest.highIceSourceAtlas.sourceIds,
        CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS);
    assert.equal(manifest.highIceSourceAtlas.layout,
        "xyz-tiled-canonical-source-volumes");
    assert.equal(manifest.highIceSourceAtlas.guardVoxels, 1);
    assert.match(manifest.highIceSourceAtlas.channels.r.decode, /density/);
    assert.match(manifest.highIceSourceAtlas.channels.g.decode, /coverage/);
    assert.match(manifest.highIceSourceAtlas.channels.b.decode, /secondMoment|E\[rho/i);
    assert.match(manifest.highIceSourceAtlas.channels.a.decode, /support|occupied/i);
    assert.equal(manifest.exteriorBoundary.schema, "elements-cloud-exterior-boundary");
    assert.equal(manifest.exteriorBoundary.version, 1);
});

test("high-ice source atlas slots map guarded texel centres without bleed", () => {
    const source = manifest.highIceSourceAtlas;
    const { width, height, depthOrArrayLayers: depth } = source.dimensions;
    const bytesPerTexel = 4;
    const at = (x, y, z, channel = 0) =>
        highIceSourceAtlas[(((z * height + y) * width + x) * bytesPerTexel) + channel];
    assert.equal(source.sourceCount, CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS.length);
    assert.equal(source.packing.dimensions.width, width);
    assert.equal(source.packing.dimensions.height, height);
    assert.equal(source.packing.dimensions.depthOrArrayLayers, depth);
    for (const slot of source.slots) {
        const transform = getCloudHighIceSourceSampleTransform(
            manifest,
            slot.id,
        );
        assert.deepEqual(transform?.scale, [
            (source.sourceResolution - 1) / width,
            (source.sourceResolution - 1) / height,
            (source.sourceResolution - 1) / depth,
        ]);
        assert.deepEqual(transform?.offset, [
            (slot.xOffset + 0.5) / width,
            (slot.yOffset + 0.5) / height,
            (slot.zOffset + 0.5) / depth,
        ]);
        assert.equal(transform?.slot, slot.slot);
        assert.equal(source.sourceIdToSlot[slot.id], slot.slot);
        assert.ok(slot.xOffset >= source.guardVoxels);
        assert.ok(slot.yOffset >= source.guardVoxels);
        assert.ok(slot.zOffset >= source.guardVoxels);
        assert.ok(slot.xOffset + source.sourceResolution + source.guardVoxels <= width);
        assert.ok(slot.yOffset + source.sourceResolution + source.guardVoxels <= height);
        assert.ok(slot.zOffset + source.sourceResolution + source.guardVoxels <= depth);
        // Every tile's six adjacent guard faces are clear at representative
        // corners.  The full binary checksum test above covers all rows.
        const x0 = slot.xOffset - 1;
        const x1 = slot.xOffset + source.sourceResolution;
        const y0 = slot.yOffset - 1;
        const y1 = slot.yOffset + source.sourceResolution;
        const z0 = slot.zOffset - 1;
        const z1 = slot.zOffset + source.sourceResolution;
        for (const [x, y, z] of [
            [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x0, y0, z1],
        ]) {
            for (let channel = 0; channel < 4; channel += 1) {
                assert.equal(at(x, y, z, channel), 0,
                    `${slot.id} guard channel ${channel} must be clear`);
            }
        }
    }
});

test("every emitted formation mechanism has one finite exhaustive runtime code", () => {
    const emitted = new Set(manifest.volumes.map(
        (volume) => volume.formation.mechanism,
    ));
    assert.deepEqual(
        [...emitted].sort(),
        Object.keys(CLOUD_MACRO_FORMATION_CODE).sort(),
        "the generated atlas and runtime formation ABI must be exhaustive",
    );
    for (const volume of manifest.volumes) {
        const code = CLOUD_MACRO_FORMATION_CODE[volume.formation.mechanism];
        assert.ok(Number.isFinite(code),
            `${volume.id}/${volume.formation.mechanism} must pack finitely`);
        assert.ok(Number.isInteger(code) && code > 0,
            `${volume.id}/${volume.formation.mechanism} must have a positive integer code`);
    }
    const cirrostratusFibratus = manifest.volumes.find(
        ({ id }) => id === "cs-fibratus",
    );
    assert.equal(
        cirrostratusFibratus.formation.mechanism,
        "frontal-ascent-sheet",
    );
    assert.doesNotMatch(rendererSource, /frontal-ice-ascent/);
    assert.match(rendererSource,
        /CLOUD_MACRO_FORMATION_CODE\[volume\.formation\.mechanism\]/);
    assert.match(rendererSource,
        /!Number\.isFinite\(formationCode\)/,
        "packing must reject an unsupported mechanism instead of emitting NaN");
});

test("every emitted atlas topology has one finite exhaustive runtime code", () => {
    const emitted = new Set(manifest.volumes.map(
        (volume) => volume.formation.topologyPolicy,
    ));
    assert.ok(emitted.size > 0, "the generated atlas must emit a topology policy");
    for (const volume of manifest.volumes) {
        const code = CLOUD_MACRO_TOPOLOGY_CODE[volume.formation.topologyPolicy];
        assert.ok(Number.isInteger(code) && code > 0,
            `${volume.id}/${volume.formation.topologyPolicy} must pack finitely`);
    }
    const spissatus = manifest.volumes.find(({ id }) => id === "ci-spissatus");
    assert.equal(spissatus.formation.topologyPolicy, "irregular-patch");
    assert.equal(CLOUD_MACRO_TOPOLOGY_CODE[spissatus.formation.topologyPolicy], 7);

    const malformed = structuredClone(manifest);
    malformed.volumes[0].formation.topologyPolicy = "unknown-topology";
    assert.throws(
        () => validateCloudMacroAtlasManifest(malformed),
        /invalid formation ABI/,
        "manifest validation must fail closed before an unknown topology packs as NaN",
    );
});

test("Cc, Cs, and Ci raw calibration quantifies the removed source floor", () => {
    const cases = [
        ["cc-stratiformis", 2.70, 2.90],
        ["cs-fibratus", 1.15, 1.30],
        ["ci-fibratus", 0.999, 1.001],
    ];
    for (const [id, minimumGain, maximumGain] of cases) {
        const volume = manifest.volumes.find((candidate) => candidate.id === id);
        assert.ok(volume, `${id} must exist`);
        const rawPath = meanVerticalDensityPath(
            volume,
            (sample) => sample.density / 255,
        );
        // This reproduces the former coupling-only high-cloud floor. It is a
        // regression diagnostic, not the current camera/source evaluator.
        const legacyFlooredPath = meanVerticalDensityPath(volume, (sample) => {
            const density = sample.density / 255;
            if (density <= 0.0001) return 0;
            if (id === "ci-fibratus") return density;
            const floor = id.startsWith("cs-")
                ? 0.30
                : 0.76 + (0.68 - 0.76) * (sample.phase / 255);
            return Math.max(density, floor);
        });
        assert.ok(Number.isFinite(rawPath) && rawPath > 0,
            `${id} shared raw path must remain finite`);
        assert.ok(Math.abs(
            rawPath - volume.statistics.meanDensityPathVertical,
        ) < 1e-12, `${id} raw atlas diagnostic must remain unchanged`);
        const gain = legacyFlooredPath / rawPath;
        assert.ok(gain >= minimumGain && gain <= maximumGain,
            `${id} legacy source/raw gain changed unexpectedly: ${gain}`);
    }
    assert.match(rendererSource,
        /volume\.statistics\.meanDensityPathVertical/);
});

test("topology exemplar coverage is explicit, bounded, and atlas-valid", () => {
    const contract = manifest.topologyExemplars;
    assert.equal(contract.schema, "elements-cloud-topology-exemplars");
    assert.equal(contract.version, 1);
    assert.equal(contract.logicalExemplarsPerSpecies, 3);
    assert.equal(contract.selection.cameraInvariant, true);
    assert.equal(contract.selection.frameTimeInvariant, true);
    assert.equal(contract.species.length, 32);
    assert.equal(contract.denseAssetBudget.maximumWidthSlices, 2048);
    assert.equal(contract.denseAssetBudget.maximumDepthSlices, 2048);
    assert.equal(contract.denseAssetBudget.usedWidthSlices,
        manifest.atlas.dimensions.width);
    assert.equal(contract.denseAssetBudget.usedDepthSlices,
        manifest.atlas.dimensions.depthOrArrayLayers);
    assert.equal(contract.denseAssetBudget.remainingDepthSlices,
        2048 - manifest.atlas.dimensions.depthOrArrayLayers);
    assert.ok(contract.denseAssetBudget.maximumAdditionalDenseVolumes >= 2);
    assert.equal(contract.denseAssetBudget.packingColumns, 2);
    const volumes = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    for (const entry of contract.species) {
        assert.equal(entry.logicalExemplarCount, 3);
        assert.ok(entry.materializedExemplarCount >= 1);
        assert.equal(entry.remainingLogicalExemplars,
            3 - entry.materializedExemplarCount);
        for (const id of entry.materializedVolumeIds) {
            const volume = volumes.get(id);
            assert.ok(volume, `${entry.rendererSpecies}/${id} must be in atlas bounds`);
            assert.equal(volume.classification.genus, entry.genus);
            assert.ok(volume.xOffset >= 0);
            assert.ok(volume.xOffset + manifest.atlas.volumeResolution <=
                manifest.atlas.dimensions.width);
            assert.ok(volume.yOffset >= 0);
            assert.ok(volume.yOffset + manifest.atlas.volumeResolution <=
                manifest.atlas.dimensions.height);
            assert.ok(volume.zOffset >= 0);
            assert.ok(volume.zOffset + manifest.atlas.volumeResolution <=
                manifest.atlas.dimensions.depthOrArrayLayers);
        }
    }
});

test("Sc organization manifolds are explicit, material, and atlas-selectable", () => {
    const contract = manifest.organizationManifolds;
    assert.equal(contract.schema, "elements-cloud-organization-manifolds");
    assert.equal(contract.version, 1);
    assert.equal(contract.rendererSpecies, "stratocumulus-stratiformis");
    assert.equal(contract.selection.seedRole, "within-manifold variation only");
    assert.equal(contract.manifolds.length, 5);
    const expected = [
        ["closed-cell", "distant-finite-system", "sc-stratiformis"],
        ["closed-cell", "immediate-overcast", "sc-stratiformis-closed-overhead"],
        ["open-cell", "immediate-broken-field", "sc-stratiformis-open-field"],
        ["street", "immediate-broken-field", "sc-stratiformis-street-packet"],
        ["sparse-transition", "immediate-broken-field", "sc-stratiformis-transition-mosaic"],
    ];
    assert.deepEqual(contract.manifolds.map(({ regime, placement, volumeId }) =>
        [regime, placement, volumeId]), expected);
    const checksums = new Set();
    for (const [organizationRegime, placementRegime, volumeId] of expected) {
        assert.equal(selectCloudMacroVolumeId({
            genus: "stratocumulus",
            species: "stratiformis",
            organizationRegime,
            placementRegime,
        }), volumeId);
        const volume = manifest.volumes.find(({ id }) => id === volumeId);
        assert.equal(volume.formation.stratocumulusOrganization.regime,
            organizationRegime);
        assert.equal(volume.formation.stratocumulusOrganization.placement,
            placementRegime);
        assert.equal(volume.formation.stratocumulusOrganization.postDensityMaskWeight,
            0);
        checksums.add(volume.statistics.foundationDensityChecksum);
    }
    assert.equal(checksums.size, 5,
        "every organization manifold must own distinct material anatomy");
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const overhead = byId.get("sc-stratiformis-closed-overhead");
    assert.equal(overhead.statistics.stratiformisCirculationCellSurfaceCount, 32);
    assert.equal(overhead.statistics.connectedComponentCount, 1);
    assert.equal(overhead.statistics.reconstructionScale4ConnectedComponentCount, 1);
    const open = byId.get("sc-stratiformis-open-field");
    assert.ok(open.statistics.stratiformisOpenWallArcCount >= 20);
    assert.equal(open.statistics.stratiformisCirculationCellSurfaceCount, 0);
    assert.ok(open.statistics.connectedComponentCount >= 3);
    const streets = byId.get("sc-stratiformis-street-packet");
    assert.ok(streets.statistics.stratiformisStreetCorridorCount >= 8);
    assert.equal(streets.statistics.stratiformisOpenWallArcCount, 0);
    assert.ok(streets.statistics.projectedTwoAxisPeriodicScore < 0.07);
    const transition = byId.get("sc-stratiformis-transition-mosaic");
    assert.ok(transition.statistics.stratiformisClosedCellPatchCount >= 6);
    assert.ok(transition.statistics.stratiformisOpenWallArcCount >= 6);
    for (const volume of [overhead, open, streets, transition]) {
        assert.equal(volume.statistics.stratiformisLegacyEllipsoidCount, 0);
        assert.equal(volume.statistics.stratiformisLegacyCapsuleCount, 0);
        assert.ok(volume.statistics.projectedOrthogonalGridScore < 0.10);
    }
});

test("spatial tiling appends dense anatomy slots without reindexing prior volumes", () => {
    const alternate = manifest.volumes.find(
        ({ id }) => id === "cc-stratiformis-dispersive",
    );
    assert.equal(alternate.index, 40);
    assert.equal(alternate.xOffset, 1);
    assert.equal(alternate.zOffset, 1001);
    assert.deepEqual(
        manifest.volumes.slice(0, 41).map(({ id, index }) => [id, index]),
        CLOUD_MACRO_VOLUME_IDS.slice(0, 41).map((id, index) => [id, index]),
        "append-only packing must preserve every prior index",
    );
    assert.deepEqual(
        manifest.volumes.slice(41).map(({ id, index }) => [id, index]),
        [
            ["ci-fibratus-split-source", 41],
            ["ci-fibratus-depth-shear", 42],
            ["sc-stratiformis-closed-overhead", 43],
            ["sc-stratiformis-open-field", 44],
            ["sc-stratiformis-street-packet", 45],
            ["sc-stratiformis-transition-mosaic", 46],
            ["ns-deepening-altostratus-shield", 47],
            ["ns-generating-cell-shield", 48],
            ["ns-thickened-low-deck-shield", 49],
        ],
    );
    const coverage = manifest.topologyExemplars.species.find(
        ({ rendererSpecies }) =>
            rendererSpecies === "cirrocumulus-stratiformis",
    );
    assert.deepEqual(coverage.materializedVolumeIds,
        ["cc-stratiformis", "cc-stratiformis-dispersive"]);
    const fibratusCoverage = manifest.topologyExemplars.species.find(
        ({ rendererSpecies }) => rendererSpecies === "cirrus-fibratus",
    );
    assert.deepEqual(fibratusCoverage.materializedVolumeIds, [
        "ci-fibratus",
        "ci-fibratus-split-source",
        "ci-fibratus-depth-shear",
    ]);
    assert.deepEqual(fibratusCoverage.ordinalVolumeIds, [
        "ci-fibratus",
        "ci-fibratus-depth-shear",
        "ci-fibratus-split-source",
    ]);
    assert.equal(fibratusCoverage.status, "dense-multi-exemplar");
    const canonical = manifest.volumes.find(
        ({ id }) => id === "cc-stratiformis",
    );
    let intersection = 0;
    let union = 0;
    let absoluteDifference = 0;
    let maximumMass = 0;
    const resolution = manifest.atlas.volumeResolution;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const left = atlasSample(canonical, x, y, z).density;
                const right = atlasSample(alternate, x, y, z).density;
                if (left > 0 && right > 0) intersection += 1;
                if (left > 0 || right > 0) union += 1;
                absoluteDifference += Math.abs(left - right);
                maximumMass += Math.max(left, right);
            }
        }
    }
    assert.ok(intersection / union < 0.20,
        "the alternate must not be a rotated-looking copy of one dense packet");
    assert.ok(absoluteDifference / maximumMass > 0.78,
        "the alternate needs materially different condensate support");
});

test("aperiodic family gates distinguish physical one-axis coherence from a two-axis grid", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    for (const id of ["cc-castellanus", "ac-castellanus", "sc-castellanus"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.projectedOneAxisPeriodicScore < 0.16, id);
        assert.ok(statistics.projectedTwoAxisPeriodicScore < 0.06, id);
        assert.ok(statistics.projectedOrthogonalGridScore < 0.10, id);
        assert.equal(statistics.reconstructionScale2ConnectedComponentCount, 1, id);
        assert.equal(statistics.reconstructionScale4ConnectedComponentCount, 1, id);
        assert.ok(statistics.reconstructionScale4MassRetention > 0.88, id);
    }
    for (const id of ["ac-volutus", "sc-volutus"]) {
        const statistics = byId.get(id).statistics;
        // The legacy axis-minus-diagonal score is intentionally high for a
        // single long roll. Harmonic and orthogonal scores must stay low.
        assert.ok(statistics.projectedOneAxisPeriodicScore < 0.11, id);
        assert.ok(statistics.projectedTwoAxisPeriodicScore < 0.055, id);
        assert.ok(statistics.projectedOrthogonalGridScore < 0.06, id);
        assert.equal(statistics.reconstructionScale4ConnectedComponentCount, 1, id);
        assert.ok(statistics.reconstructionScale4MassRetention > 0.92, id);
    }
});

test("thin high-cloud macro support survives two reconstruction footprints", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    for (const id of ["cc-stratiformis", "cc-stratiformis-dispersive"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.reconstructionScale2MassRetention > 0.82, id);
        assert.ok(statistics.reconstructionScale4MassRetention > 0.30, id);
        assert.ok(statistics.reconstructionScale4SourceSupportRetention > 0.22, id);
        assert.ok(statistics.reconstructionScale2ConnectedComponentCount >= 8, id);
        assert.ok(statistics.reconstructionScale4ConnectedComponentCount >= 3, id);
        assert.ok(statistics.reconstructionScale2LargestComponentFraction <= 0.38, id);
        assert.ok(statistics.reconstructionScale4LargestComponentFraction <= 0.60, id);
        assert.ok(statistics.projectedTwoAxisPeriodicScore < 0.07, id);
    }
    const floccus = byId.get("cc-floccus").statistics;
    assert.ok(floccus.reconstructionScale2MassRetention > 0.84);
    assert.ok(floccus.reconstructionScale4MassRetention > 0.60);
    assert.ok(floccus.reconstructionScale4SourceSupportRetention > 0.50);
    const lens = byId.get("cc-lenticularis").statistics;
    assert.ok(lens.reconstructionScale2MassRetention > 0.90);
    assert.ok(lens.reconstructionScale4MassRetention > 0.70);
    assert.ok(lens.reconstructionScale4SourceSupportRetention > 0.68);
    const uncinus = byId.get("ci-uncinus").statistics;
    assert.ok(uncinus.reconstructionScale2MassRetention > 0.88);
    assert.ok(uncinus.reconstructionScale4MassRetention > 0.52);
    assert.ok(uncinus.reconstructionScale4SourceSupportRetention > 0.35);
    assert.ok(uncinus.reconstructionScale2LargestComponentFraction > 0.48);
    assert.ok(uncinus.reconstructionScale4LargestComponentFraction > 0.27);
    assert.ok(uncinus.projectedTwoAxisPeriodicScore < 0.055);
    assert.ok(uncinus.occupiedBounds.minimum[0] > 0);
    assert.ok(uncinus.occupiedBounds.minimum[2] > 0);
    assert.ok(uncinus.occupiedBounds.maximum[0] < 1);
    assert.ok(uncinus.occupiedBounds.maximum[2] < 1);
});

test("base Cirrus atlas anatomy is finite 3D support, never legacy radial stamps", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const ids = [
        "ci-fibratus",
        "ci-uncinus",
        "ci-spissatus",
        "ci-floccus",
        "ci-castellanus",
    ];
    for (const id of ids) {
        const statistics = byId.get(id).statistics;
        assert.equal(statistics.cirrusLegacyCapsulePrimitiveCount, 0,
            `${id} cannot regress to capsule-chain ribbon stamps`);
        assert.equal(statistics.cirrusLegacyEllipsoidPrimitiveCount, 0,
            `${id} cannot regress to smooth radial ellipsoid stamps`);
        for (let axis = 0; axis < 3; axis += 1) {
            assert.ok(statistics.occupiedBounds.minimum[axis] > 0,
                `${id} is clipped at its minimum axis-${axis} atlas face`);
            assert.ok(statistics.occupiedBounds.maximum[axis] < 1,
                `${id} is clipped at its maximum axis-${axis} atlas face`);
        }
    }

    assert.equal(byId.get("ci-fibratus").statistics.cirrusSweptC2AnatomyCount, 12);
    assert.equal(byId.get("ci-uncinus").statistics.cirrusSweptC2AnatomyCount, 12);

    const spissatusVolume = byId.get("ci-spissatus");
    assert.equal(spissatusVolume.formation.topologyPolicy, "irregular-patch");
    assert.equal(
        spissatusVolume.formation.boundaryModel,
        "finite-envelope-prior-3d-lognormal-fractal-iwc-excursion",
    );
    const spissatus = spissatusVolume.statistics;
    assert.equal(spissatus.cirrusIcePatchSurfaceCount, 0,
        "Spissatus must not regress to analytic ice-patch surfaces");
    assert.equal(spissatus.cirrusSpissatusStochasticSourceFieldCount, 1,
        "Spissatus needs one finite stochastic source field, not stamped bodies");
    assert.ok(spissatus.cirrusSpissatusStochasticLayerCount >= 4,
        "Spissatus needs several height-dependent sheared source layers");
    assert.ok(spissatus.cirrusSpissatusStochasticSourceSiteCount >= 5,
        "Spissatus needs a finite generating-site history within its envelope");
    assert.ok(spissatus.cirrusSpissatusStochasticShearDisplacement > 0.24,
        "Spissatus source layers need measurable differential shear");
    assert.equal(
        spissatus.cirrusSpissatusStochasticIwcDistribution,
        "lognormal-multiscale-fractal",
    );
    assert.equal(
        spissatus.cirrusSpissatusStochasticSpectrum,
        "height-dependent-anisotropic-shear-spectrum",
    );
    assert.equal(
        spissatus.cirrusSpissatusStochasticFallstreakOrganization,
        "height-dependent-sedimentation-shear-displacement",
    );
    assert.equal(
        spissatus.cirrusSpissatusStochasticFibrousOrganization,
        "ridged-downwind-fibre-modulation",
    );
    assert.equal(
        spissatus.cirrusSpissatusStochasticEnvelopePrior,
        "finite-mesoscale-humidity-envelope",
    );
    assert.ok(spissatus.ownerSpacingCoefficientVariation > 0.18,
        "Spissatus generating sites need unequal packet spacing");
    assert.ok(spissatus.ownerAngularEntropy > 0.45,
        "Spissatus source directions cannot collapse to one aligned row");
    // Excursion-set topology is allowed to vary with the deterministic seed;
    // qualify one-to-three material-scale patch components and ignore
    // subgrid threshold islands rather than counting them as diversity.
    const materialComponentFractions = spissatus.dominantComponentFractions
        .filter((fraction) => fraction >= 0.004);
    assert.ok(spissatus.connectedComponentCount >= 1 &&
        materialComponentFractions.length >= 1 &&
        materialComponentFractions.length <= 3,
    "Spissatus needs one-to-three natural material excursion components");
    assert.ok(materialComponentFractions[0] > 0.75,
        "Spissatus dominant excursion patch must remain physically substantial");
    assert.ok(spissatus.reconstructionOriginalSourceComponentCount >= 1 &&
        spissatus.reconstructionSourceOccupiedVoxels /
            (CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION ** 3) > 0.02,
    "Spissatus fine IWC support must retain resolved material mass after dust culling");
    assert.ok(spissatus.removedDetachedVoxelFraction < 0.02,
        "Spissatus support cleanup must remain a small conservative repair");
    assert.ok(spissatus.reconstructionScale4MassRetention > 0.90,
        "Spissatus must retain optical mass through the 4x qualification reduction");
    assert.ok(spissatus.reconstructionSourceCleanupVoxelFraction < 0.01,
        "Spissatus source dust cleanup must be negligible and pre-reduction");
    assert.ok(spissatus.opticalDepthStructuredColumnFraction > 0.18,
        "Spissatus must retain multiscale interior optical-depth structure");
    assert.ok(spissatus.opticalDepthColumnCoefficientOfVariation > 0.045,
        "Spissatus interior columns cannot be uniformly milky");
    assert.ok(spissatus.deepInteriorDensitySampleCount >= 400,
        "Spissatus needs a resolved core independent of its silhouette");
    assert.ok(spissatus.deepInteriorDensityCoefficientOfVariation >= 0.16,
        "Spissatus deep-core density cannot remain a saturated solid");
    assert.ok(spissatus.deepInteriorNearUniformHighFraction <= 0.85,
        "Spissatus deep core cannot be explained by one high-density plateau");
    assert.ok(
        spissatus.deepInteriorDensityP90 - spissatus.deepInteriorDensityP10 >=
            0.12,
        "Spissatus deep core needs resolved optical-depth dynamic range",
    );
    assert.ok(spissatus.signedDistanceMeanNeighborNormalVariation > 0.12,
        "Spissatus excursion boundary needs resolved 3-D relief");
    assert.ok(spissatus.projectedFootprintHoleCount >= 1,
        "Spissatus projection needs enclosed clear-air channels");
    assert.ok(spissatus.projectedFootprintCompactness < 0.50,
        "Spissatus footprint must not collapse to a smooth oval stamp");
    assert.ok(Math.abs(spissatus.cirrusSpissatusStochasticLatentMean) < 0.08 &&
        spissatus.cirrusSpissatusStochasticLatentVariance > 0.005 &&
        Math.abs(spissatus.cirrusSpissatusStochasticLatentSkew) < 0.80 &&
        spissatus.cirrusSpissatusStochasticIwcMean > 0.70 &&
        spissatus.cirrusSpissatusStochasticIwcP99 > 1.30 &&
        spissatus.cirrusSpissatusStochasticIwcSaturationFraction < 0.25,
    "Spissatus stochastic latent/IWC moments must retain a calibrated right tail");

    const floccus = byId.get("ci-floccus").statistics;
    assert.equal(floccus.cirrusIceTuftSurfaceCount, 7,
        "Floccus needs a detached population of irregular tuft owners");
    assert.ok(floccus.cirrusSweptC2AnatomyCount >= 7,
        "Floccus needs physically attached sedimenting fallstreaks");
    assert.ok(floccus.connectedComponentCount >= 7);

    const castellanus = byId.get("ci-castellanus").statistics;
    assert.equal(castellanus.cirrusIcePatchSurfaceCount, 1,
        "Castellanus needs one finite common base");
    assert.equal(castellanus.cirrusIceTuftSurfaceCount, 6,
        "Castellanus needs unequal crenellated turret surfaces");
    assert.equal(castellanus.connectedComponentCount, 1);
});

test("Spissatus source-site, settling, and envelope ablations change the excursion", () => {
    const model = createCloudSpissatusStochasticModel();
    const primitive = model.primitives.find((candidate) =>
        candidate.kind === "spissatus-stochastic-field",
    );
    assert.ok(primitive);
    const variants = {
        active: primitive,
        noSites: { ...primitive, sourceSites: [] },
        noFallstreak: { ...primitive, fallstreakShear: [0, 0] },
        noEnvelopeWarp: { ...primitive, envelopeWarpScale: 0 },
    };
    const seed = CLOUD_MACRO_ATLAS_SEED;
    const signatures = {};
    const size = 20;
    for (const [name, candidate] of Object.entries(variants)) {
        let supportCount = 0;
        let supportSum = 0;
        for (let z = 0; z < size; z += 1) {
            for (let y = 0; y < size; y += 1) {
                for (let x = 0; x < size; x += 1) {
                    const geometry = evaluateCloudSpissatusStochasticField(
                        candidate,
                        [(x + 0.5) / size, (y + 0.5) / size, (z + 0.5) / size],
                        seed,
                    );
                    if (geometry.field <= 0) continue;
                    supportCount += 1;
                    supportSum += geometry.field;
                }
            }
        }
        signatures[name] = {
            supportCount,
            meanSupport: supportSum / Math.max(1, supportCount),
        };
    }
    const supportDelta = (name) => Math.abs(
        signatures.active.supportCount - signatures[name].supportCount,
    ) / (size ** 3);
    assert.ok(supportDelta("noSites") > 0.005,
        "source-site history must affect support rather than remain metadata-only");
    assert.ok(supportDelta("noFallstreak") > 0.001 ||
        Math.abs(
            signatures.active.meanSupport - signatures.noFallstreak.meanSupport,
        ) > 0.0005,
        "lower-layer settling displacement must affect support geometry");
    assert.ok(supportDelta("noEnvelopeWarp") > 0.001 ||
        Math.abs(
            signatures.active.meanSupport - signatures.noEnvelopeWarp.meanSupport,
        ) > 0.0001,
    "the finite envelope boundary must respond to its low-pass warp");
});

test("three materialized fibratus anatomies retain distinct aligned silhouettes", () => {
    const ids = [
        "ci-fibratus",
        "ci-fibratus-depth-shear",
        "ci-fibratus-split-source",
    ];
    const expected = [
        ["irregular-curved", 7, 5, 1, 2, "irregular-curved"],
        ["depth-shear", 8, 7, 3, 5, "entangled-shear"],
        ["split-source", 9, 4, 2, 4, "straight-separated"],
    ];
    for (let index = 0; index < ids.length; index += 1) {
        const volume = manifest.volumes.find(({ id }) => id === ids[index]);
        const statistics = volume.statistics;
        const [anatomy, primary, secondary, clusters, splits, foundation] =
            expected[index];
        assert.equal(statistics.cirrusFibratusAnatomyId, anatomy);
        assert.equal(statistics.cirrusFibratusPrimaryFibreCount, primary);
        assert.equal(statistics.cirrusFibratusSecondaryFibreCount, secondary);
        assert.equal(statistics.cirrusFibratusSourceClusterCount, clusters);
        assert.equal(statistics.cirrusFibratusSplitSourceCount, splits);
        assert.equal(volume.formation.physicalFoundation.topologyVariantId,
            foundation);
        assert.deepEqual(volume.formation.physicalFoundation.formationSpanKm,
            [4, 28]);
        assert.equal(statistics.cirrusUncinusHookCount, 0);
        assert.equal(statistics.cirrusCommaHeadLobeCount, 0);
        assert.equal(statistics.cirrusFibratusLegacyCapsuleCount, 0);
        assert.ok(statistics.reconstructionScale4ConnectedComponentCount >= 4,
            `${volume.id} loses its separated population at scale 4`);
        assert.ok(statistics.reconstructionScale4LargestComponentFraction < 0.58,
            `${volume.id} merges into one coarse brush stamp`);
        assert.ok(statistics.reconstructionScale4MassRetention > 0.30,
            `${volume.id} vanishes under the scale-4 footprint`);
        assert.ok(statistics.projectedTwoAxisPeriodicScore < 0.055);
        assert.ok(statistics.projectedOrthogonalGridScore < 0.10);
    }
    for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
            const leftVolume = manifest.volumes.find(({ id }) => id === ids[left]);
            const rightVolume = manifest.volumes.find(({ id }) => id === ids[right]);
            // Bounding-box normalization removes translation and uniform
            // formation scale before comparison. Low overlap therefore means
            // a genuinely different negative-space anatomy, not a moved copy.
            const crosswind = binaryJaccard(
                normalizedElevationProjection(leftVolume, 0, 48),
                normalizedElevationProjection(rightVolume, 0, 48),
            );
            const downwind = binaryJaccard(
                normalizedElevationProjection(leftVolume, 2, 48),
                normalizedElevationProjection(rightVolume, 2, 48),
            );
            assert.ok(crosswind < 0.24,
                `${ids[left]}/${ids[right]} crosswind silhouettes correlate ${crosswind}`);
            assert.ok(downwind < 0.46,
                `${ids[left]}/${ids[right]} downwind silhouettes correlate ${downwind}`);
            assert.ok((crosswind + downwind) * 0.5 < 0.30,
                `${ids[left]}/${ids[right]} aligned silhouette mean is too similar`);
        }
    }
});

test("every macro family exposes conservative support and a genuinely occupied core anchor", () => {
    const denominator = manifest.atlas.volumeResolution - 1;
    for (const volume of manifest.volumes) {
        const support = getCloudMacroConservativeSupport(
            loadedRuntimeAtlas,
            volume.id,
        );
        for (let axis = 0; axis < 3; axis += 1) {
            assert.ok(
                support.minimumCanonical[axis] <= support.anchorCanonical[axis] &&
                support.anchorCanonical[axis] <= support.maximumCanonical[axis],
                `${volume.id} anchor escaped conservative support on axis ${axis}`,
            );
            const potential = volume.statistics.exteriorPotentialBounds;
            if (potential) {
                assert.ok(support.minimumCanonical[axis] <=
                    potential.minimum[axis] / denominator);
                assert.ok(support.maximumCanonical[axis] >=
                    potential.maximum[axis] / denominator);
            }
        }
        const [x, y, z] = support.anchorCanonical.map((value) =>
            Math.round(value * denominator));
        assert.ok(
            atlasSample(volume, x, y, z).density >
                manifest.occupancy.densityByteThreshold,
            `${volume.id} residency anchor must be an authoritative occupied voxel`,
        );
        assert.ok(support.anchorDensity > 0);
    }
});

test("every Cu/Cb byte block and majorant matches its versioned reconstruction", () => {
    assert.deepEqual(
        Object.keys(CONVECTIVE_BASELINE_BLOCKS),
        manifest.volumes
            .filter((volume) => ["cumulus", "cumulonimbus"].includes(
                volume.classification.genus,
            ))
            .map((volume) => volume.id),
    );
    for (const [id, [atlasHash, majorantHash]] of Object.entries(
        CONVECTIVE_BASELINE_BLOCKS,
    )) {
        const volume = manifest.volumes.find((candidate) => candidate.id === id);
        assert.ok(volume, `${id} must retain its canonical slot`);
        assert.equal(
            sha256(extractCanonicalAtlasBlock(volume)),
            atlasHash,
            `${id} atlas bytes diverged from its versioned reconstruction`,
        );
        assert.equal(
            sha256(extractCanonicalMajorantBlock(volume)),
            majorantHash,
            `${id} majorants diverged from its versioned reconstruction`,
        );
    }
});

test("2x reduction preserves every fine support sample and optical block means", () => {
    const targetResolution = 16;
    const sourceResolution = targetResolution * 2;
    const sourceVoxelCount = sourceResolution ** 3;
    const density = new Uint8Array(sourceVoxelCount);
    const detail = new Uint8Array(sourceVoxelCount).fill(24);
    const phase = new Uint8Array(sourceVoxelCount);
    const precipitation = new Uint8Array(sourceVoxelCount);
    const occupied = new Uint8Array(sourceVoxelCount);
    const signedDistance = new Float32Array(sourceVoxelCount).fill(4);
    const setSupport = (x, y, z, densityByte, detailByte = 96) => {
        const index = (z * sourceResolution + y) * sourceResolution + x;
        density[index] = densityByte;
        detail[index] = detailByte;
        occupied[index] = 1;
        signedDistance[index] = -0.2;
    };
    for (const sample of [
        [1, 1, 1, 16],
        [2, 29, 17, 24],
        [15, 16, 31, 48],
        [30, 2, 28, 80],
    ]) setSupport(...sample);
    const fullBlockDensities = [32, 48, 64, 80, 96, 112, 128, 144];
    let fullBlockSample = 0;
    for (let dz = 0; dz < 2; dz += 1) {
        for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) {
                setSupport(
                    8 + dx,
                    8 + dy,
                    8 + dz,
                    fullBlockDensities[fullBlockSample++],
                    160,
                );
            }
        }
    }
    const reduced = reduceCloudMacroSource2x({
        density,
        detail,
        phase,
        precipitation,
        occupied,
        signedDistance,
        sourceResolution,
        targetResolution,
    });
    assert.equal(reduced.diagnostics.lostSourceSupportVoxels, 0);
    assert.equal(reduced.diagnostics.sourceOccupiedVoxels, 12);
    for (let z = 0; z < sourceResolution; z += 1) {
        for (let y = 0; y < sourceResolution; y += 1) {
            for (let x = 0; x < sourceResolution; x += 1) {
                const sourceIndex = (z * sourceResolution + y) * sourceResolution + x;
                if (!occupied[sourceIndex]) continue;
                const targetIndex = (
                    (Math.floor(z / 2) * targetResolution + Math.floor(y / 2)) *
                    targetResolution + Math.floor(x / 2)
                );
                assert.equal(reduced.occupied[targetIndex], 1);
                assert.ok(reduced.density[targetIndex] >= 16);
            }
        }
    }
    const fullBlockIndex = (4 * targetResolution + 4) * targetResolution + 4;
    assert.equal(
        reduced.density[fullBlockIndex],
        Math.round(fullBlockDensities.reduce((sum, value) => sum + value, 0) / 8),
        "fully covered blocks must retain their unnormalized optical-mass mean",
    );
    assert.equal(reduced.detail[fullBlockIndex], 160);
});

test("high-ice reduction never requests more mass than authored positive children can encode", () => {
    const targetResolution = 16;
    const sourceResolution = targetResolution * 2;
    const sourceVoxelCount = sourceResolution ** 3;
    const density = new Uint8Array(sourceVoxelCount);
    const authoredDensity = new Uint8Array(sourceVoxelCount);
    const detail = new Uint8Array(sourceVoxelCount);
    const phase = new Uint8Array(sourceVoxelCount);
    const precipitation = new Uint8Array(sourceVoxelCount);
    const occupied = new Uint8Array(sourceVoxelCount);
    const signedDistance = new Float32Array(sourceVoxelCount);
    const parentX = 5;
    const parentY = 7;
    const parentZ = 9;
    for (const dx of [0, 1]) {
        const sourceIndex = (
            ((parentZ * 2) * sourceResolution + parentY * 2) *
            sourceResolution + parentX * 2 + dx
        );
        density[sourceIndex] = 255;
        authoredDensity[sourceIndex] = 255;
        occupied[sourceIndex] = 1;
    }
    const reduced = reduceCloudMacroSource2x({
        density,
        authoredDensity,
        detail,
        phase,
        precipitation,
        occupied,
        signedDistance,
        sourceResolution,
        targetResolution,
    });
    const targetIndex = (
        (parentZ * targetResolution + parentY) * targetResolution + parentX
    );
    assert.equal(reduced.density[targetIndex], 63);
    assert.equal(reduced.density[targetIndex] * 8, 504);
    assert.ok(reduced.density[targetIndex] * 8 <= 2 * 255);
    assert.equal(reduced.diagnostics.massCapacityClampedTargetVoxels, 1);
    assert.equal(reduced.diagnostics.massCapacityRemovedBytes, 1);
});

test("protected Cu uses bounded 96^3 reconstruction without support loss or ABI growth", () => {
    assert.equal(CLOUD_PROTECTED_CU_RECONSTRUCTION_SCALE, 2);
    assert.deepEqual(
        manifest.offlineSourceReconstruction.protectedVolumeIds,
        CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS,
    );
    assert.equal(manifest.offlineSourceReconstruction.sourceResolution, 96);
    assert.deepEqual(manifest.atlas.dimensions, {
        width: 100,
        height: 48,
        depthOrArrayLayers: 1250,
    });
    assert.equal(manifest.atlas.byteLength, 100 * 48 * 1250 * 4);
    for (const id of CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS) {
        const statistics = manifest.volumes.find(
            (volume) => volume.id === id,
        ).statistics;
        assert.equal(statistics.reconstructionScale, 2, id);
        assert.equal(statistics.reconstructionSourceResolution, 96, id);
        assert.equal(statistics.reconstructionLostSourceSupportVoxels, 0, id);
        assert.equal(statistics.removedDetachedVoxelCount, 0, id);
        assert.equal(statistics.removedDetachedVoxelFraction, 0, id);
        assert.equal(
            statistics.reconstructionOriginalSourceOccupiedVoxels +
                statistics.reconstructionAddedConnectorVoxels,
            statistics.reconstructionSourceOccupiedVoxels,
            `${id} source repair must be additive only`,
        );
        assert.ok(
            statistics.reconstructionAddedConnectorVoxels <= 96 / 4,
            `${id} source connectivity repair escaped its local bound`,
        );
        assert.ok(statistics.reconstructionSourceOccupiedVoxels > 0, id);
        assert.ok(statistics.reconstructionPartiallyCoveredVoxels > 0, id);
        assert.match(statistics.reconstructionSourceSupportChecksum, /^[0-9a-f]{64}$/);
        assert.match(statistics.reconstructionSourceDensityChecksum, /^[0-9a-f]{64}$/);
        assert.ok(
            Math.abs(statistics.reconstructionDensityMassRatio - 1) < 0.03,
            `${id} reduction unexpectedly renormalized optical density`,
        );
        assert.ok(
            statistics.reconstructionPeakTypedArrayBytes <= 16 * 1024 * 1024,
            `${id} reconstruction working fields escaped the bounded allocation`,
        );
    }
});

test("protected Cu reconstruction reduces axis and lattice crease concentrations", () => {
    let baselineAxisDominantSamples = 0;
    let baselineNormalSamples = 0;
    let reconstructedAxisDominantSamples = 0;
    let reconstructedNormalSamples = 0;
    for (const id of CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS) {
        const statistics = manifest.volumes.find(
            (volume) => volume.id === id,
        ).statistics;
        const baseline = PROTECTED_CU_SURFACE_BASELINE[id];
        baselineAxisDominantSamples += baseline.axisDominant *
            baseline.normalSamples;
        baselineNormalSamples += baseline.normalSamples;
        reconstructedAxisDominantSamples +=
            statistics.signedDistanceAxisDominantNormalFraction *
            statistics.signedDistanceSurfaceNormalSampleCount;
        reconstructedNormalSamples +=
            statistics.signedDistanceSurfaceNormalSampleCount;
        assert.ok(
            statistics.signedDistanceLatticeCreaseNormalFraction <
                baseline.latticeCrease * 0.40,
            `${id} retained its 48^3 lattice-crease concentration`,
        );
        assert.ok(
            statistics.signedDistanceSharpNormalCreaseFraction <
                baseline.sharpCrease,
            `${id} retained its 48^3 sharp normal creases`,
        );
    }
    assert.ok(
        reconstructedAxisDominantSamples / reconstructedNormalSamples <
            baselineAxisDominantSamples / baselineNormalSamples,
        "the protected Cu set retained its pooled 48^3 axis-normal concentration",
    );
});

test("deterministic generator reproduces every byte and reconstruction hash", () => {
    const options = { resolution: 24, paddingZ: 1, brickSize: 4 };
    const first = generateCloudMacroAtlas(options);
    const second = generateCloudMacroAtlas(options);
    assert.deepEqual(first.atlas, second.atlas);
    assert.deepEqual(first.majorants, second.majorants);
    assert.deepEqual(first.manifest, second.manifest);
    for (const id of CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS) {
        const firstStatistics = first.manifest.volumes.find(
            (volume) => volume.id === id,
        ).statistics;
        const secondStatistics = second.manifest.volumes.find(
            (volume) => volume.id === id,
        ).statistics;
        assert.equal(
            firstStatistics.reconstructionSourceSupportChecksum,
            secondStatistics.reconstructionSourceSupportChecksum,
        );
        assert.equal(
            firstStatistics.reconstructionSourceDensityChecksum,
            secondStatistics.reconstructionSourceDensityChecksum,
        );
    }
});

test("generated shader contract preserves protected Cu base parity", () => {
    assert.equal(
        CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL.trim(),
        createCloudProtectedCuBaseContractWgsl(manifest.volumes).trim(),
        "checked-in WGSL contract must be regenerated with the atlas manifest",
    );
    const generatedBase = Number(
        CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL.match(
            /CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE: f32 = ([^;]+);/,
        )?.[1],
    );
    const protectedCuIds = [
        "cu-humilis",
        "cu-mediocris",
        "cu-congestus",
        "cu-congestus-turreted",
        "cu-congestus-multicell",
    ];
    for (const id of protectedCuIds) {
        const volume = manifest.volumes.find((candidate) => candidate.id === id);
        assert.ok(volume, `${id} must exist`);
        assert.equal(
            volume.exteriorBoundary.protectedBase.normalizedAltitude,
            7 / 47,
            `${id} manifest base must remain on voxel 7`,
        );
        assert.ok(Math.abs(
            generatedBase - volume.exteriorBoundary.protectedBase.normalizedAltitude,
        ) < 1e-8, `${id} shader and manifest protected bases diverged`);
    }
});

test("each canonical volume has empty guards and declared formation topology", () => {
    const { width, height } = manifest.atlas.dimensions;
    const sliceBytes = width * height * 4;
    for (const volume of manifest.volumes) {
        assert.ok(volume.statistics.occupancyFraction >= 0.0004);
        assert.ok(volume.statistics.occupancyFraction <= 0.46);
        assert.ok(volume.statistics.surfaceVoxelFraction > 0);
        assert.ok(volume.statistics.formationGroupCount >= 1);
        for (const field of [
            "meanDensityPathCrosswind",
            "meanDensityPathVertical",
            "meanDensityPathDownwind",
            "p90DensityPathVertical",
            "denseCoreFraction",
            "diluteFringeFraction",
            "projectedAxisAutocorrelationPeak",
            "projectedDiagonalAutocorrelationPeak",
            "projectedGridAutocorrelationScore",
            "projectedOrthogonalGridScore",
            "projectedCrosswindAutocorrelationPeak",
            "projectedDownwindAutocorrelationPeak",
        ]) {
            assert.ok(
                volume.statistics[field] >= 0 && volume.statistics[field] <= 1,
                `${volume.id} ${field} must remain normalized`,
            );
        }
        assert.ok(
            volume.statistics.p90DensityPathVertical >=
                volume.statistics.meanDensityPathVertical,
            `${volume.id} dense vertical path must bound its cloudy-column mean`,
        );
        assert.ok(volume.formation.mechanism.length > 0);
        assert.ok(volume.formation.materialModel.length > 0);
        const lowerGuard = atlas.subarray(
            (volume.zOffset - 1) * sliceBytes,
            volume.zOffset * sliceBytes,
        );
        const upperGuard = atlas.subarray(
            (volume.zOffset + manifest.atlas.volumeResolution) * sliceBytes,
            (volume.zOffset + manifest.atlas.volumeResolution + 1) * sliceBytes,
        );
        for (const guard of [lowerGuard, upperGuard]) {
            for (let index = 0; index < guard.length; index += 4) {
                assert.equal(guard[index], 0);
                assert.equal(guard[index + 1], 0);
                assert.equal(guard[index + 2], 0);
                assert.equal(guard[index + 3], 255, "guard SDF must remain outside the volume");
            }
        }
        for (let z = 0; z < manifest.atlas.volumeResolution; z += 1) {
            for (let y = 0; y < manifest.atlas.volumeResolution; y += 1) {
                for (const x of [volume.xOffset - 1,
                    volume.xOffset + manifest.atlas.volumeResolution]) {
                    const index = (((volume.zOffset + z) * height +
                        volume.yOffset + y) * width + x) * 4;
                    assert.deepEqual([...atlas.subarray(index, index + 4)],
                        [0, 0, 0, 255],
                    `${volume.id} X packing guard leaked a neighbouring slot`);
                }
            }
        }
    }
});

test("every non-Cu/Cb slot is bound to a physical foundation with separate element and formation scales", () => {
    const familyVolumes = manifest.volumes.filter((volume) =>
        !["cumulus", "cumulonimbus"].includes(volume.classification.genus));
    assert.equal(familyVolumes.length, 36);
    for (const volume of familyVolumes) {
        const foundation = volume.formation.physicalFoundation;
        assert.ok(foundation, `${volume.id} is missing its physical foundation binding`);
        assert.ok(foundation.representation.length > 0);
        assert.ok(foundation.topologyVariantId.length > 0);
        assert.ok(foundation.connectivity.length > 0);
        assert.ok(foundation.mechanism.length > 0);
        assert.ok(foundation.formationSpanKm[0] > 0);
        assert.ok(
            foundation.formationSpanKm[1] > foundation.formationSpanKm[0],
            `${volume.id} needs a nondegenerate formation-span range`,
        );
        assert.equal(
            volume.statistics.foundationPhysicalElementToFormationRatio,
            foundation.physicalElementToFormationRatio,
        );
        assert.equal(
            volume.statistics.foundationCanonicalElementFraction,
            foundation.canonicalElementFraction,
        );
        assert.match(volume.statistics.foundationDensityChecksum, /^[0-9a-f]{64}$/);
        assert.match(volume.statistics.foundationOccupancyChecksum, /^[0-9a-f]{64}$/);
        if (foundation.elementDiameterKm) {
            assert.ok(
                foundation.elementDiameterKm[1] <
                    foundation.formationSpanKm[1],
                `${volume.id} may not confuse one visible element with its weather system`,
            );
            assert.ok(
                foundation.physicalElementToFormationRatio > 0 &&
                    foundation.physicalElementToFormationRatio < 0.5,
            );
            assert.ok(
                foundation.canonicalElementFraction >= 0.034 &&
                    foundation.canonicalElementFraction <= 0.19,
                `${volume.id} reconstructible proxy escaped its declared 48^3 range`,
            );
        } else {
            assert.equal(foundation.physicalElementToFormationRatio, 0);
            assert.equal(foundation.canonicalElementFraction, 0);
        }
    }
    for (const volume of manifest.volumes.filter((candidate) =>
        ["cumulus", "cumulonimbus"].includes(candidate.classification.genus))) {
        assert.equal(
            volume.formation.physicalFoundation,
            undefined,
            `${volume.id} must stay on the isolated convective path`,
        );
    }
});

test("foundation families retain distinct topology, silhouettes, connectivity, and aperiodic placement", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const castellanusIds = [
        "ci-castellanus", "cc-castellanus",
        "ac-castellanus", "sc-castellanus",
    ];
    for (const id of castellanusIds) {
        const volume = byId.get(id);
        assert.equal(volume.statistics.commonBaseCount, 1,
            `${id} needs one physical common base`);
        assert.equal(volume.statistics.connectedComponentCount, 1,
            `${id} turrets must remain attached to their common base`);
        assert.ok(volume.statistics.largestComponentFraction > 0.999);
        assert.ok(
            volume.statistics.projectedOrthogonalGridScore < 0.22,
            `${id} may be linear but may not become a two-axis puff grid`,
        );
        assert.ok(
            volume.statistics.projectedMirrorSimilarity <
                volume.formation.physicalFoundation.maximumMirrorSimilarity + 0.26,
            `${id} crenellation is too bilaterally repetitive`,
        );
    }

    for (const id of ["ci-floccus", "cc-floccus", "ac-floccus", "sc-floccus"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.connectedComponentCount >= 3,
            `${id} must retain detached correlated tufts`);
        assert.ok(statistics.largestComponentFraction < 0.75,
            `${id} must not regress to a single oval population stamp`);
        assert.ok(statistics.projectedOrthogonalGridScore < 0.22,
            `${id} detached tufts must be aperiodic`);
        assert.ok(statistics.projectedMirrorSimilarity < 0.58,
            `${id} tuft field must remain asymmetrical`);
    }

    for (const id of [
        "cc-stratiformis", "ac-stratiformis", "sc-stratiformis",
    ]) {
        const volume = byId.get(id);
        if (id === "sc-stratiformis") {
            assert.equal(volume.statistics.connectedComponentCount, 1,
                "the materialized closed-cell Sc deck must be connected by cloudy walls");
            assert.equal(volume.statistics.removedDetachedVoxelFraction, 0,
                "the Sc deck must be authored connected, not repaired by island cleanup");
            assert.equal(volume.formation.topologyPolicy, "single-connected");
            assert.equal(volume.formation.boundaryModel,
                "finite-connected-inversion-closed-cell-deck");
            for (const axis of [0, 2]) {
                assert.ok(volume.statistics.occupiedBounds.minimum[axis] > 0);
                assert.ok(volume.statistics.occupiedBounds.maximum[axis] < 1,
                    "the Sc weather-system perimeter must end before the atlas face");
            }
            assert.ok(volume.statistics.stratiformisResolvedCellCount >= 24,
                "Sc stratiformis needs a resolved field, not a few hero puffs");
            assert.ok(
                volume.statistics.stratiformisNaturalNeighborEdgeCount >
                    volume.statistics.stratiformisResolvedCellCount - 1,
                "Sc circulation must contain loops beyond a spanning tree",
            );
            assert.ok(
                volume.statistics.stratiformisNaturalNeighborCycleRank >=
                    Math.ceil(volume.statistics.stratiformisResolvedCellCount * 0.14),
                "Sc circulation needs broad cellular cycle support",
            );
            assert.ok(
                volume.statistics.stratiformisMaterialEdgeCount >
                    volume.statistics.stratiformisResolvedCellCount - 1,
                "material Sc circulation must remain cyclic",
            );
            assert.ok(
                volume.statistics.stratiformisMaterialCycleRank >=
                    Math.ceil(volume.statistics.stratiformisResolvedCellCount * 0.14),
                "visible Sc circulation must not regress to a tree skeleton",
            );
            assert.ok(volume.statistics.stratiformisClearChannelCount >=
                volume.statistics.stratiformisResolvedCellCount,
            "Sc needs a distributed population of irregular clear channels");
            assert.equal(
                volume.statistics.stratiformisCirculationCellSurfaceCount,
                volume.statistics.stratiformisResolvedCellCount,
                "every Sc cell must be one C2 circulation surface",
            );
            assert.equal(
                volume.statistics.stratiformisCirculationRibbonSurfaceCount,
                volume.statistics.stratiformisMaterialEdgeCount,
                "every material graph edge must be a C2 wall ribbon",
            );
            assert.ok(
                volume.statistics.stratiformisColdPoolCavityCount >=
                    Math.ceil(
                        volume.statistics.stratiformisClearChannelCount * 0.24,
                    ),
                "a distributed subset of topology seams must remain clear",
            );
            assert.equal(volume.statistics.stratiformisLegacyEllipsoidCount, 0,
                "Sc cannot regress to daughter-oval anatomy");
            assert.equal(volume.statistics.stratiformisLegacyCapsuleCount, 0,
                "Sc cannot regress to capsule-throat anatomy");
            assert.ok(
                volume.statistics.stratiformisMinimumInteriorClearance >= 0.004,
                "Sc surfaces need topology-derived interior clearance",
            );
            assert.ok(
                volume.statistics.stratiformisMaximumUndersideAmplitude <=
                    0.002,
                "the inversion-bounded underside must remain nearly planar",
            );
            assert.ok(
                volume.statistics.stratiformisScale2ResolvedCellCount /
                    volume.statistics.stratiformisResolvedCellCount >= 0.72,
                "Sc source cells must survive scale-2 reconstruction",
            );
            assert.ok(
                volume.statistics.stratiformisScale4ResolvedCellCount /
                    volume.statistics.stratiformisResolvedCellCount >= 0.46,
                "Sc source cells must survive scale-4 reconstruction",
            );
            assert.ok(volume.statistics.stratiformisExteriorEdgeNoise <= 0.013);
            assert.ok(volume.statistics.stratiformisExteriorWarpStrength <= 0.018,
                "cellular exterior displacement must remain subordinate to the resolved topology");
            assert.ok(volume.statistics.reconstructionScale2MassRetention >= 0.86,
                "Sc condensate mass must survive scale-2 reconstruction");
            assert.ok(volume.statistics.reconstructionScale4MassRetention >= 0.68,
                "Sc condensate mass must survive scale-4 reconstruction");
            assert.equal(
                volume.statistics.reconstructionScale2ConnectedComponentCount,
                1,
            );
            assert.equal(
                volume.statistics.reconstructionScale4ConnectedComponentCount,
                1,
            );
        } else {
            assert.ok(volume.statistics.connectedComponentCount >= 2);
        }
        assert.ok(volume.statistics.cellularClusterCount >= 4);
        assert.ok(volume.statistics.projectedOrthogonalGridScore < 0.16,
            `${id} may not expose a two-axis lattice`);
        assert.ok(volume.statistics.ownerSpacingCoefficientVariation > 0.20,
            `${id} needs a natural element-spacing distribution`);
    }

    const boundaryModels = new Set([
        "cc-stratiformis", "ac-stratiformis", "sc-stratiformis",
        "cc-lenticularis", "ac-lenticularis", "sc-lenticularis",
        "cs-veil", "cs-fibratus", "as-opacus", "as-translucidus",
        "ns-precipitating", "st-nebulosus",
        "ns-deepening-altostratus-shield", "ns-generating-cell-shield",
        "ns-thickened-low-deck-shield",
    ].map((id) => byId.get(id).formation.boundaryModel));
    assert.equal(boundaryModels.size, 15,
        "foundation families may not collapse back into shared generic boundaries");

    const ccLens = byId.get("cc-lenticularis");
    const acLens = byId.get("ac-lenticularis");
    const scLens = byId.get("sc-lenticularis");
    assert.equal(ccLens.statistics.waveCrestCount, 2);
    assert.equal(ccLens.statistics.waveStackLayerCount, 3);
    assert.equal(ccLens.statistics.waveAsymmetricLaminarAlmondCount, 3);
    assert.equal(acLens.statistics.waveCrestCount, 1);
    assert.equal(acLens.statistics.waveStackLayerCount, 3);
    assert.equal(scLens.statistics.waveCrestCount, 1);
    assert.equal(scLens.statistics.waveStackLayerCount, 1);
    assert.ok(
        ccLens.statistics.occupancyFraction <
            acLens.statistics.occupancyFraction,
        "Cc and Ac lenses need genuinely different particle-scale macro support",
    );
});

test("continuous shields are finite, connected, mutually distinct physical volumes", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const sheetIds = [
        "cs-veil", "cs-fibratus", "as-opacus", "as-translucidus",
        "ns-precipitating", "st-nebulosus",
        "ns-deepening-altostratus-shield", "ns-generating-cell-shield",
        "ns-thickened-low-deck-shield",
    ];
    for (const id of sheetIds) {
        const volume = byId.get(id);
        const statistics = volume.statistics;
        assert.equal(statistics.connectedComponentCount, 1,
            `${id} must be one condensate-defined layer`);
        assert.ok(statistics.largestComponentFraction > 0.999);
        assert.ok(statistics.projectedMirrorSimilarity < 0.82,
            `${id} finite weather boundary cannot be a symmetric card`);
        assert.ok(statistics.projectedOrthogonalGridScore < 0.18,
            `${id} shield cannot contain a hidden repeated grid`);
        assert.ok(
            statistics.occupiedBounds.maximum[0] -
                statistics.occupiedBounds.minimum[0] < 0.99,
            `${id} must retain a finite crosswind boundary`,
        );
        assert.ok(
            statistics.occupiedBounds.maximum[2] -
                statistics.occupiedBounds.minimum[2] < 0.99,
            `${id} must retain a finite downwind boundary`,
        );
    }
    assert.equal(new Set(sheetIds.map((id) =>
        byId.get(id).statistics.foundationDensityChecksum)).size, sheetIds.length);
    assert.equal(new Set(sheetIds.map((id) =>
        byId.get(id).statistics.foundationOccupancyChecksum)).size, sheetIds.length);
    assert.ok(
        byId.get("ns-precipitating").statistics.occupancyFraction >
            byId.get("as-opacus").statistics.occupancyFraction * 1.45,
        "Ns must be a much deeper physical shield than As",
    );
    assert.ok(
        byId.get("cs-veil").statistics.occupancyFraction <
            byId.get("st-nebulosus").statistics.occupancyFraction,
        "Cs and St cannot be the same sheet at different altitude",
    );
    assert.equal(byId.get("as-translucidus").statistics.denseCoreFraction, 0);
    assert.ok(
        byId.get("as-translucidus").statistics.meanDensity <
            byId.get("as-opacus").statistics.meanDensity * 0.6,
        "As translucidus needs a distinct ground-glass opacity regime",
    );
    assert.ok(byId.get("cs-fibratus").statistics.streamlineCount >= 8);
    assert.ok(
        byId.get("cs-fibratus").statistics.meanDetailType >
            byId.get("cs-veil").statistics.meanDetailType,
        "Cs fibratus needs resolved embedded ice-fibre bundles",
    );
    for (const id of sheetIds) {
        assert.ok(
            byId.get(id).statistics.nearestFoundationVoxelJaccard < 0.72,
            `${id} remains too similar to ${byId.get(id).statistics.nearestFoundationVolumeId}`,
        );
    }
});

test("Stratus nebulosus fills its normalized physical layer with a top-loaded liquid profile", () => {
    const statistics = manifest.volumes.find((volume) =>
        volume.id === "st-nebulosus",
    ).statistics;
    const lower = statistics.occupiedBounds.minimum[1];
    const upper = statistics.occupiedBounds.maximum[1];
    // The authored sheet is centered at 0.50 with 0.90 normalized depth.
    // Low-frequency surface motion and the signed-density feather extend that
    // support by about two voxels, so the production bounds must still cover
    // at least 0.08..0.92 of the owner frame (41 of 48 vertical samples).
    assert.ok(lower <= 0.08, `Stratus base support is clipped at ${lower}`);
    assert.ok(upper >= 0.92, `Stratus top support is clipped at ${upper}`);
    assert.ok(upper - lower >= 0.84,
        "Stratus must occupy the complete authored base-to-top layer");
    assert.equal(statistics.connectedComponentCount, 1,
        "Stratus must remain one connected condensate deck");
    assert.ok(statistics.verticalDensityCenterOfMass > 0.50,
        "Stratus droplets must be top-loaded without a hard cap");
    assert.ok(statistics.upperThirdMassFraction >
        statistics.lowerThirdMassFraction,
    "Stratus upper third must carry more liquid mass than its lower third");
    assert.ok(statistics.lowerBoundaryRoughness < 0.05,
        "Stratus lower boundary must remain diffuse and fairly uniform");
    assert.ok(statistics.verticalProfileCoefficientVariation < 0.50,
        "Stratus must not expose a five-slice terrace profile");
});

test("every volume exposes a reachable signed exterior band without exceeding its SDF range", () => {
    const resolution = manifest.atlas.volumeResolution;
    const sdfRange = manifest.atlas.channels.a.rangeVoxels;
    for (const volume of manifest.volumes) {
        const boundary = volume.exteriorBoundary;
        assert.equal(boundary.schema, "elements-cloud-exterior-boundary");
        assert.equal(boundary.version, 1);
        assert.equal(boundary.volumeResolution, resolution);
        assert.ok(boundary.detailClasses.length > 0);
        assert.ok(boundary.detailClasses.every((id) => id in CLOUD_EXTERIOR_DETAIL_CLASSES));
        assert.ok(
            boundary.maximumOutwardDisplacementVoxels +
                boundary.interpolationHaloVoxels < sdfRange,
            `${volume.id} exterior support would clip against the encoded SDF band`,
        );
        assert.equal(
            boundary.visibleOwnerBoundsInflationCanonical,
            boundary.maximumOutwardDisplacementCanonical,
        );
        assert.equal(
            boundary.traversalOwnerBoundsInflationCanonical,
            boundary.maximumOutwardDisplacementCanonical +
                (boundary.interpolationHaloVoxels + boundary.majorantSampleHaloVoxels) /
                    (resolution - 1),
        );
        let potentialCount = 0;
        let directlyReachableCount = 0;
        let maximumPotential = 0;
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const sample = atlasSample(volume, x, y, z);
                    if (sample.density !== 0) continue;
                    const potential = potentialDensityAt(volume, x, y, z);
                    if (potential <= 0) continue;
                    potentialCount += 1;
                    maximumPotential = Math.max(maximumPotential, potential);
                    const resolved = resolveCloudExteriorBoundarySample({
                        boundary,
                        detailType: sample.detail / 255,
                        iceFraction: sample.phase / 255,
                        signedDistanceVoxels: decodeCloudSignedDistanceVoxels(
                            sample.signedDistance,
                            sdfRange,
                        ),
                        canonicalPosition: [
                            x / (resolution - 1),
                            y / (resolution - 1),
                            z / (resolution - 1),
                        ],
                        signedDistanceNormal: [1, 0, 0],
                    });
                    if (resolved.reachable) directlyReachableCount += 1;
                }
            }
        }
        assert.ok(potentialCount > 0, `${volume.id} has no exterior potential support`);
        assert.ok(directlyReachableCount > 0, `${volume.id} has no shader-reachable exterior samples`);
        assert.equal(potentialCount, volume.statistics.exteriorPotentialVoxels);
        assert.equal(maximumPotential, volume.statistics.exteriorMaximumDensityByte);
        assert.ok(volume.statistics.exteriorMaximumSignedDistanceVoxels <=
            boundary.maximumOutwardDisplacementVoxels + boundary.interpolationHaloVoxels + 0.1);

        const continuationClass = selectCloudExteriorDetailClass(boundary, 0.2, 0);
        const continuationDefinition = CLOUD_EXTERIOR_DETAIL_CLASSES[continuationClass];
        const continued = resolveCloudExteriorBoundarySample({
            boundary,
            detailType: 0.2,
            iceFraction: 0,
            signedDistanceVoxels: 0,
            canonicalPosition: [
                -continuationDefinition.maximumCanonicalDisplacement *
                    continuationDefinition.axisScale[0] * 0.25,
                0.5,
                0.5,
            ],
            signedDistanceNormal: [-1, 0, 0],
        });
        assert.ok(continued.domainContinuationVoxels > 0);
        assert.equal(continued.reachable, true, `${volume.id} must continue rather than clip at a storage face`);
    }
});

test("boundary classes, protected bases, and connected deep cores follow formation physics", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    assert.equal(
        selectCloudExteriorDetailClass(byId.get("cb-capillatus").exteriorBoundary, 0.82, 0.91),
        "ice-sedimentation",
    );
    assert.equal(
        selectCloudExteriorDetailClass(byId.get("cs-veil").exteriorBoundary, 0.82, 0.91),
        "stratiform-ragged",
    );
    assert.equal(
        selectCloudExteriorDetailClass(byId.get("cs-fibratus").exteriorBoundary, 0.90, 1),
        "ice-fibre",
    );
    assert.equal(
        selectCloudExteriorDetailClass(byId.get("cu-humilis").exteriorBoundary, 0.08, 0),
        "liquid-cauli",
    );
    assert.equal(
        selectCloudExteriorDetailClass(byId.get("st-fractus").exteriorBoundary, 0.54, 0),
        "liquid-scud",
    );

    const cauliBoundary = byId.get("cu-humilis").exteriorBoundary;
    const lateralCauli = resolveCloudExteriorBoundarySample({
        boundary: cauliBoundary,
        detailType: 0.08,
        iceFraction: 0,
        signedDistanceVoxels: 0,
        canonicalPosition: [0.5, 0.5, 0.5],
        signedDistanceNormal: [1, 0, 0],
    });
    const verticalCauli = resolveCloudExteriorBoundarySample({
        boundary: cauliBoundary,
        detailType: 0.08,
        iceFraction: 0,
        signedDistanceVoxels: 0,
        canonicalPosition: [0.5, 0.5, 0.5],
        signedDistanceNormal: [0, 1, 0],
    });
    assert.equal(lateralCauli.directionalAxisScale, 1);
    assert.equal(verticalCauli.directionalAxisScale, 1.15);
    assert.ok(Math.abs(
        verticalCauli.displacementVoxels / lateralCauli.displacementVoxels - 1.15,
    ) < 1e-12, "liquid-cauli reach must apply the declared vertical axis scale");

    const protectedCoreIds = manifest.volumes
        .filter((volume) => volume.formation.protectedConnectedCore)
        .map((volume) => volume.id);
    assert.deepEqual(protectedCoreIds, [
        "cu-congestus", "cb-calvus", "cb-capillatus", "cb-capillatus-incus",
        "cu-congestus-turreted", "cu-congestus-multicell",
        "cb-calvus-multicell", "cb-capillatus-sheared",
        "cb-capillatus-incus-back-sheared",
    ]);
    for (const id of [
        "cu-congestus", "cu-congestus-turreted", "cu-congestus-multicell",
    ]) {
        const core = byId.get(id).formation.protectedConnectedCore;
        assert.deepEqual(core.roles, ["root", "thermal-mass"]);
        assert.match(core.authoredSelection, /first dominant thermal head/);
        assert.doesNotMatch(core.authoredSelection, /junction/i,
            `${id} cannot advertise a hard-protected connector union`);
    }
    for (const id of [
        "cu-humilis", "cu-mediocris", "cb-dissipating",
        "st-fractus", "cu-fractus", "ci-fibratus",
    ]) {
        assert.equal(byId.get(id).formation.protectedConnectedCore, null);
    }

    for (const id of [
        "cu-humilis", "cu-mediocris", "cu-congestus",
        "cu-congestus-turreted", "cu-congestus-multicell",
        "cs-veil", "cs-fibratus",
        "as-opacus", "as-translucidus", "st-nebulosus",
    ]) {
        const boundary = byId.get(id).exteriorBoundary;
        assert.equal(boundary.protectedBase.downwardDisplacementScale, 0);
        const belowBase = boundary.protectedBase.normalizedAltitude -
            (boundary.protectedBase.featherVoxels + 1) / (boundary.volumeResolution - 1);
        const downward = resolveCloudExteriorBoundarySample({
            boundary,
            detailType: 0.2,
            iceFraction: id.startsWith("cs-") ? 1 : 0,
            signedDistanceVoxels: 0.25,
            canonicalPosition: [0.5, belowBase, 0.5],
            signedDistanceNormal: [0, -1, 0],
        });
        assert.equal(downward.reachable, false, `${id} must preserve its physical lower plane`);
        const lateral = resolveCloudExteriorBoundarySample({
            boundary,
            detailType: 0.2,
            iceFraction: id.startsWith("cs-") ? 1 : 0,
            signedDistanceVoxels: 0.25,
            canonicalPosition: [0.5, belowBase, 0.5],
            signedDistanceNormal: [1, 0, 0],
        });
        assert.equal(lateral.reachable, true, `${id} lateral silhouette must retain exterior detail`);
    }
});

test("formation families retain their meteorological topology invariants", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const extent = (id, axis) => {
        const bounds = byId.get(id).statistics.occupiedBounds;
        return bounds.maximum[axis] - bounds.minimum[axis];
    };
    const idsWithPrefix = (prefix) => manifest.volumes.filter((volume) => volume.id.startsWith(prefix));

    for (const volume of idsWithPrefix("ci-")) {
        assert.equal(volume.formation.mechanism === "sheared-ice-sedimentation" || volume.formation.mechanism === "elevated-convective-ice", true);
        assert.ok(volume.statistics.meanIceFraction > 0.98, `${volume.id} must be glaciated`);
        if (volume.id === "ci-castellanus") {
            assert.equal(volume.statistics.connectedComponentCount, 1,
                "Cirrus castellanus needs one crenellated common base");
        } else {
            assert.ok(volume.statistics.connectedComponentCount >= 2,
                `${volume.id} must remain a population, not one plate`);
        }
    }
    assert.ok(extent("ci-fibratus", 2) > extent("ci-fibratus", 1) * 1.35,
        "a multilevel fibratus field must remain horizontally longer than its complete altitude span");
    const fibratus = byId.get("ci-fibratus").statistics;
    assert.ok(fibratus.occupiedVoxels > 540, "fibratus filaments must survive 48^3 reconstruction");
    assert.ok(fibratus.meanOccupiedNeighborCount > 2.7, "fibratus must not collapse to one-voxel dust");
    assert.ok(fibratus.trilinearCoreFraction > 0.9, "fibratus needs a stable trilinear macro envelope");
    assert.ok(fibratus.connectedComponentCount >= 12 && fibratus.connectedComponentCount <= 28, "fibratus must remain a separated field of hair-like fibers");
    assert.equal(fibratus.cirrusFibratusPrimaryFibreCount, 7,
        "canonical fibratus needs seven distinct primary ice trajectories");
    assert.equal(fibratus.cirrusFibratusSecondaryFibreCount, 5,
        "canonical fibratus needs a subordinate detached wisp hierarchy");
    assert.equal(fibratus.cirrusFibratusSweptC2Count,
        fibratus.cirrusFibratusPrimaryFibreCount +
            fibratus.cirrusFibratusSecondaryFibreCount);
    assert.equal(fibratus.cirrusFibratusLegacyCapsuleCount, 0,
        "broad capsule chains regress fibratus to smooth ribbons");
    assert.ok(fibratus.cirrusFibratusMeanTerminalRadiusRatio > 0.30 &&
        fibratus.cirrusFibratusMeanTerminalRadiusRatio < 0.58);
    assert.ok(fibratus.cirrusFibratusHeadingSpread > 0.30);
    assert.ok(fibratus.cirrusFibratusLengthCoefficientVariation > 0.28);
    assert.ok(fibratus.cirrusFibratusMeanExcessCurvature > 0.03);
    assert.ok(fibratus.cirrusFibratusSourceAltitudeSpread > 0.30);
    assert.ok(fibratus.cirrusFibratusSourceDepthSpread > 0.12);
    assert.ok(fibratus.reconstructionScale2MassRetention > 0.88);
    assert.ok(fibratus.reconstructionScale4MassRetention > 0.40);
    assert.ok(fibratus.reconstructionScale2ConnectedComponentCount >= 10);
    assert.ok(fibratus.reconstructionScale4ConnectedComponentCount >= 5);
    assert.ok(fibratus.reconstructionScale2LargestComponentFraction < 0.40);
    assert.ok(fibratus.reconstructionScale4LargestComponentFraction < 0.45);
    assert.ok(fibratus.projectedTwoAxisPeriodicScore < 0.055);
    assert.ok(fibratus.projectedOrthogonalGridScore < 0.07);

    const uncinus = byId.get("ci-uncinus").statistics;
    assert.ok(uncinus.occupiedVoxels > 250, "uncinus hook heads and fallstreaks must survive reconstruction");
    assert.ok(uncinus.meanOccupiedNeighborCount > 2.7, "uncinus must not collapse to one-voxel dust");
    assert.ok(uncinus.trilinearCoreFraction > 0.94, "uncinus needs a stable trilinear macro envelope");
    assert.equal(uncinus.formationGroupCount, 2, "canonical uncinus must describe sparse mare's-tail groups, not a contrail bundle");
    assert.equal(uncinus.connectedComponentCount, 2, "each uncinus hook, head fan, neck and virga must reconstruct as one connected mare's-tail member");
    assert.equal(uncinus.dominantComponentFractions.length, 2);
    assert.ok(
        uncinus.dominantComponentFractions[0] > 0.55 &&
            uncinus.dominantComponentFractions[0] < 0.68 &&
            uncinus.dominantComponentFractions[1] > 0.32,
        "uncinus needs one dominant and one visibly unequal companion member",
    );
    assert.equal(uncinus.cirrusUncinusHookCount, 2);
    assert.equal(uncinus.cirrusCommaHeadLobeCount, 8, "uncinus heads must be resolved as attached fibre fans rather than round lobes");
    assert.equal(uncinus.cirrusUncinusConnectedHeadFiberCount, uncinus.cirrusCommaHeadLobeCount);
    assert.equal(uncinus.cirrusTaperedFallstreakCount, 2, "each canonical mare's-tail member needs one primary virga trajectory");
    assert.equal(uncinus.cirrusUncinusConnectedFallstreakCount, uncinus.cirrusTaperedFallstreakCount);
    assert.ok(uncinus.cirrusUncinusMeanHookArcLength > 0.11, "uncinus needs a legible curved hook rather than an oval generator");
    assert.ok(uncinus.cirrusUncinusMeanFallstreakLength > 0.45, "uncinus virga must be much longer than its compact hook");
    assert.ok(uncinus.cirrusUncinusFallstreakLengthRatio > 1.25, "the two mare's tails need distinct sedimentation lengths");
    assert.ok(uncinus.cirrusUncinusMeanFallstreakVerticalDrop > 0.30, "uncinus needs deep sedimenting ice-crystal virga");
    assert.ok(uncinus.cirrusMeanFallstreakTerminalRadiusRatio < 0.70, "uncinus fallstreaks must narrow as ice sediments");
    assert.ok(uncinus.cirrusMeanFallstreakTerminalDensityRatio < 0.23, "uncinus fallstreaks must optically fade rather than ending as blunt lines");
    assert.ok(uncinus.cirrusFallstreakDirectionSpread > 0.75, "uncinus members must vary in orientation instead of becoming parallel contrails");
    assert.ok(uncinus.occupancyFraction > 0.0045 && uncinus.occupancyFraction < 0.0065, "uncinus must remain sparse while preserving continuous hook-to-virga support");
    assert.ok(uncinus.surfaceVoxelFraction > 0.72, "uncinus must remain fibre-dominated rather than becoming a solid capsule");
    assert.ok(uncinus.projectedFootprintCompactness < 0.12, "uncinus must retain an open asymmetric footprint rather than an oval head");
    assert.ok(uncinus.verticalSilhouetteCompactness < 0.10, "uncinus must retain open hook-and-virga negative space");
    assert.ok(uncinus.projectedGridAutocorrelationScore < 0.12, "uncinus members must not form a repeated grid or comb");
    assert.ok(uncinus.meanPrecipitationStructure > 0.2, "uncinus needs sedimenting fallstreaks");
    const integratedDensity = (id) => {
        const statistics = byId.get(id).statistics;
        return statistics.occupancyFraction * statistics.meanDensity;
    };
    assert.ok(integratedDensity("ci-spissatus") > integratedDensity("ci-fibratus") * 3.5, "spissatus must carry substantially more condensate than reconstructible fibratus envelopes");
    assert.ok(integratedDensity("ci-uncinus") < integratedDensity("ci-fibratus"), "uncinus must remain sparse despite its long virga extent");

    for (const id of ["cc-stratiformis", "cc-castellanus", "cc-floccus", "ac-stratiformis", "ac-castellanus", "ac-floccus", "sc-stratiformis", "sc-castellanus", "sc-floccus"]) {
        const volume = byId.get(id);
        const arrangedInLines = id.endsWith("castellanus");
        // The canonical low castellanus view is a closer, larger-element
        // crenellated bank, so six unequal turrets cover more formation span
        // than the seven finer high/middle-altitude members.
        const minimumGroupCount = id === "sc-castellanus" ? 6 : 7;
        assert.ok(
            volume.statistics.formationGroupCount >= minimumGroupCount,
            `${id} needs an irregular cell-owner population`,
        );
        if (arrangedInLines || id === "sc-stratiformis") {
            assert.equal(volume.statistics.connectedComponentCount, 1,
                `${id} must retain its physically connected deck/base`);
        } else {
            assert.ok(volume.statistics.connectedComponentCount >= 2,
                `${id} must not collapse into one generic slab`);
        }
        assert.ok(
            volume.statistics.ownerSpacingCoefficientVariation > (arrangedInLines ? 0.10 : 0.05),
            `${id} owner spacing must not become a lattice`,
        );
        // WMO castellanus is explicitly arranged in lines, so direction entropy
        // is naturally lower than an aperiodic stratiform/floccus colony.  Its
        // much stronger interval-variance requirement rejects an actual grid.
        assert.ok(
            volume.statistics.ownerAngularEntropy > (arrangedInLines ? 0.28 : 0.65),
            `${id} nearest-owner directions must not become grid aligned`,
        );
        assert.ok(volume.statistics.formationBoundaryLobeCount >= 3, `${id} needs a finite irregular moisture-colony boundary`);
    }
    assert.ok(byId.get("cc-stratiformis").statistics.formationGroupCount > byId.get("cc-castellanus").statistics.formationGroupCount);
    assert.ok(byId.get("ac-stratiformis").statistics.meanIceFraction < byId.get("cc-stratiformis").statistics.meanIceFraction);
    for (const id of ["cc-stratiformis", "ac-stratiformis", "sc-stratiformis"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.cellularClusterCount >= 4, `${id} needs multiple irregular moisture colonies`);
        assert.ok(statistics.ownerSpacingCoefficientVariation > 0.3, `${id} cell spacing must span a natural scale distribution`);
        assert.ok(
            statistics.projectedAxisAutocorrelationPeak <
                (id === "cc-stratiformis" ? 0.28 :
                    id === "sc-stratiformis" ? 0.22 : 0.16),
            `${id} must reject axial lattice repetition`,
        );
        assert.ok(
            statistics.projectedGridAutocorrelationScore <
                (id === "cc-stratiformis" ? 0.18 : 0.1),
            `${id} must reject a repeated puff grid`,
        );
        if (id === "cc-stratiformis") {
            assert.ok(statistics.waveCrestCount >= 3,
                "Cc stratiformis needs a finite coherent gravity-wave packet");
            assert.ok(statistics.projectedOrthogonalGridScore < 0.1,
                "Cc wave coherence may be one-axis only, never a two-axis grid");
        }
    }
    assert.ok(byId.get("cc-stratiformis").statistics.denseCoreFraction < 0.02, "cirrocumulus must retain little or no optical shading");
    for (const prefix of ["cc", "ac", "sc"]) {
        assert.ok(
            extent(`${prefix}-castellanus`, 1) > extent(`${prefix}-stratiformis`, 1) * 1.45,
            `${prefix} castellanus must grow turrets above the stratiformis level`,
        );
        assert.ok(
            byId.get(`${prefix}-floccus`).statistics.connectedComponentCount >
                byId.get(`${prefix}-castellanus`).statistics.connectedComponentCount,
            `${prefix} floccus must break into a more fragmentary population than castellanus`,
        );
    }

    for (const id of [
        "cs-veil", "cs-fibratus", "as-opacus", "as-translucidus",
        "ns-precipitating", "st-nebulosus",
        "ns-deepening-altostratus-shield", "ns-generating-cell-shield",
        "ns-thickened-low-deck-shield",
    ]) {
        const volume = byId.get(id);
        assert.equal(volume.formation.topologyPolicy, "single-connected");
        assert.ok(volume.statistics.largestComponentFraction > 0.99, `${id} must be one condensate-defined sheet`);
        // Atlas coordinates are normalized independently on x/y/z. A
        // normalized span ordering is not a physical aspect-ratio test: the
        // runtime maps x/z through owner radii and y through geometric depth.
        // The canonical Stratus world-space check lives in the runtime test.
        assert.ok(volume.statistics.formationBoundaryLobeCount >= 2, `${id} needs formation-defined perimeter structure`);
    }
    for (const id of [
        "ns-precipitating", "ns-deepening-altostratus-shield",
        "ns-generating-cell-shield", "ns-thickened-low-deck-shield",
    ]) {
        assert.equal(byId.get(id).statistics.meanPrecipitationStructure, 0,
            `${id} R density must not contain a fall-region owner`);
    }
    assert.ok(extent("ns-precipitating", 1) > extent("as-opacus", 1) * 1.35,
        "nimbostratus must retain a deep parent condensate shield");
    assert.ok(byId.get("ns-precipitating").statistics.denseCoreFraction > 0.7, "nimbostratus must retain a deep optically dense body");
    assert.ok(byId.get("ns-precipitating").statistics.lowerBoundaryRoughness > 0.008,
        "nimbostratus needs an indefinite condensate base");
    assert.ok(byId.get("ns-precipitating").statistics.lowerBoundaryRange >= 0.02,
        "nimbostratus needs a physically indefinite parent-cloud base");

    for (const id of ["cc-lenticularis", "ac-lenticularis", "sc-lenticularis"]) {
        const volume = byId.get(id);
        assert.equal(volume.formation.topologyPolicy, "wave-packet");
        assert.ok(volume.statistics.formationGroupCount >= 1);
        assert.ok(extent(id, 1) < extent(id, 0) * 0.35, `${id} must retain a laminar lens aspect`);
    }
    const acLenticularis = byId.get("ac-lenticularis").statistics;
    assert.ok(acLenticularis.occupancyFraction > 0.012, "ordinary altocumulus lenticularis must not vanish during reconstruction");
    assert.ok(acLenticularis.meanDensityPathCrosswind > 0.18);
    assert.ok(acLenticularis.meanDensityPathDownwind > 0.08);
    assert.ok(acLenticularis.meanDensityPathVertical > 0.04);
    assert.equal(acLenticularis.connectedComponentCount, 1, "the primary altocumulus lens stack must read as one coherent wave cloud");
    const ccLenticularis = byId.get("cc-lenticularis").statistics;
    assert.ok(ccLenticularis.occupancyFraction > 0.001, "cirrocumulus lenses must remain visible at the canonical atlas resolution");
    assert.ok(ccLenticularis.meanDensityPathVertical > 0.006, "cirrocumulus lenses need multiple reconstructible vertical samples");
    for (const id of ["ac-volutus", "sc-volutus"]) {
        const volume = byId.get(id);
        assert.equal(volume.formation.topologyPolicy, "single-connected");
        assert.match(volume.formation.boundaryModel, /finite-.*vortex-roll/);
        assert.ok(volume.statistics.largestComponentFraction > 0.999);
        const horizontalMajor = Math.max(extent(id, 0), extent(id, 2));
        assert.ok(horizontalMajor > extent(id, 1) * 4,
            `${id} must be a finite horizontal tube`);
        assert.ok(volume.statistics.projectedPrincipalAspectRatio > 3,
            `${id} must not become a capsule-like cloudlet`);
    }
    for (const id of ["st-fractus", "cu-fractus"]) {
        const volume = byId.get(id);
        assert.equal(volume.formation.topologyPolicy, "fragmented-population");
        assert.ok(volume.statistics.connectedComponentCount >= 8);
        assert.ok(volume.statistics.largestComponentFraction < 0.35);
        assert.ok(volume.statistics.surfaceVoxelFraction > 0.58);
    }
});

test("conservative brick majorants bound displaced exterior support and interpolation halos", () => {
    const resolution = manifest.atlas.volumeResolution;
    const brickSize = manifest.majorants.brickSize;
    const grid = manifest.majorants.gridSize;
    for (const volume of manifest.volumes) {
        for (let bz = 0; bz < grid; bz += 1) {
            for (let by = 0; by < grid; by += 1) {
                for (let bx = 0; bx < grid; bx += 1) {
                    let actualMaximum = 0;
                    for (let z = Math.max(0, bz * brickSize - 1); z <= Math.min(resolution - 1, (bz + 1) * brickSize); z += 1) {
                        for (let y = Math.max(0, by * brickSize - 1); y <= Math.min(resolution - 1, (by + 1) * brickSize); y += 1) {
                            for (let x = Math.max(0, bx * brickSize - 1); x <= Math.min(resolution - 1, (bx + 1) * brickSize); x += 1) {
                                actualMaximum = Math.max(
                                    actualMaximum,
                                    potentialDensityAt(volume, x, y, z),
                                );
                            }
                        }
                    }
                    const majorantIndex = (
                        ((volume.majorantZOffset + bz) *
                            manifest.majorants.dimensions.height +
                            volume.majorantYOffset + by) *
                            manifest.majorants.dimensions.width +
                        volume.majorantXOffset + bx
                    );
                    assert.ok(
                        majorants[majorantIndex] >= actualMaximum,
                        `${volume.id} majorant ${bx},${by},${bz} does not bound potential density`,
                    );
                }
            }
        }
    }
});

test("lifecycle morphology grows vertically and glaciates into a broad anvil", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const extent = (volume, axis) =>
        volume.statistics.occupiedBounds.maximum[axis] -
        volume.statistics.occupiedBounds.minimum[axis];
    assert.ok(extent(byId.get("cu-mediocris"), 1) > extent(byId.get("cu-humilis"), 1));
    assert.ok(extent(byId.get("cu-congestus"), 1) > extent(byId.get("cu-mediocris"), 1));
    assert.ok(
        extent(byId.get("cb-capillatus-incus"), 2) > extent(byId.get("cb-capillatus"), 2),
        "incus must extend downwind beyond the capillatus crown",
    );
    assert.ok(
        extent(byId.get("cb-capillatus-incus"), 0) >= extent(byId.get("cb-capillatus"), 0) * 0.88,
        "incus must preserve the storm's broad crosswind crown",
    );
    assert.equal(byId.get("cu-congestus").statistics.meanIceFraction, 0);
    assert.ok(byId.get("cb-capillatus").statistics.meanIceFraction > 0.08);
    assert.ok(
        byId.get("cb-dissipating").statistics.meanDetailType >
            byId.get("cb-capillatus").statistics.meanDetailType,
    );
    assert.ok(byId.get("cu-humilis").statistics.cumulusNestedPulseCount >= 5,
        "humilis needs a restrained attached thermal hierarchy rather than a smooth oval");
    const congestusIds = [
        "cu-congestus", "cu-congestus-turreted", "cu-congestus-multicell",
    ];
    const congestusVolumes = congestusIds.map((id) => byId.get(id));
    assert.deepEqual(
        congestusVolumes.map((volume) => volume.classification.morphologyVariant),
        ["balanced", "turreted", "multicell"],
    );
    assert.equal(new Set(congestusVolumes.map((volume) => volume.seed)).size, 3);
    const aspect = (volume) => {
        const bounds = volume.statistics.occupiedBounds;
        const vertical = bounds.maximum[1] - bounds.minimum[1];
        const horizontal = Math.max(
            bounds.maximum[0] - bounds.minimum[0],
            bounds.maximum[2] - bounds.minimum[2],
        );
        return vertical / horizontal;
    };
    const humilis = byId.get("cu-humilis");
    const mediocris = byId.get("cu-mediocris");
    assert.ok(aspect(humilis) <= 0.85, "humilis must retain small, flattened vertical extent");
    assert.ok(aspect(mediocris) >= 1.1 && aspect(mediocris) <= 1.6,
        "mediocris must have moderate—not towering—vertical development");
    assert.ok(aspect(mediocris) > aspect(humilis) + 0.3,
        "humilis and mediocris cannot differ by scale alone");
    assert.equal(humilis.statistics.upperThirdMassFraction, 0);
    assert.ok(mediocris.statistics.upperThirdMassFraction < 0.025 &&
        mediocris.statistics.upperThirdMassFraction <
            byId.get("cu-congestus").statistics.upperThirdMassFraction * 0.08,
    "mediocris may retain moderate domes but not congestus-scale upper mass");
    assert.equal(humilis.statistics.hierarchyLevelCount, 2);
    assert.equal(mediocris.statistics.hierarchyLevelCount, 3);
    assert.ok(humilis.statistics.cumulusNestedPulseCount >= 5);
    assert.ok(mediocris.statistics.cumulusNestedPulseCount >= 14);
    assert.ok(mediocris.statistics.cumulusCuspCount >= 4,
        "mediocris needs small attached summit sproutings");
    assert.deepEqual([
        humilis.statistics.cumulusThermalChainCount,
        mediocris.statistics.cumulusThermalChainCount,
    ], [2, 3], "fair-weather Cu needs unequal source-connected thermal lineages");
    assert.deepEqual([
        humilis.statistics.cumulusDissipatingShoulderCount,
        mediocris.statistics.cumulusDissipatingShoulderCount,
    ], [1, 2], "fair-weather Cu needs simultaneous active and aging parcels");
    for (const volume of [humilis, mediocris]) {
        const statistics = volume.statistics;
        assert.equal(statistics.connectedComponentCount, 1,
            `${volume.id} must not retain detached buds or base voxels`);
        assert.equal(statistics.largestComponentFraction, 1);
        assert.ok(statistics.centralLclBaseRangeVoxels <= 4,
            `${volume.id} needs a coherent central lifting-condensation level; ` +
                `one conservative partial-coverage texel may retain 96^3 support`);
        assert.ok(statistics.centralLclBaseStdDevVoxels < 0.8,
            `${volume.id} central LCL cannot become a ragged shelf`);
        assert.ok(statistics.removedDetachedVoxelFraction < 0.01,
            `${volume.id} authoring cannot rely on removing a material fragment`);
    }
    assert.ok(humilis.statistics.projectedGridAutocorrelationScore < 0.35,
        "humilis anisotropy must not become a repeated axial pattern");
    assert.ok(mediocris.statistics.projectedGridAutocorrelationScore < 0.175,
        "mediocris must not expose repeated primitive spacing");
    const congestusProportionContracts = {
        balanced: {
            maximumPlanFootprintAspect: 2.70,
            lclToMiddleArea: [0.40, 0.60],
            baseToMiddleSpan: [0.58, 0.78],
            lowerThirdMass: [0.13, 0.20],
            trunkMinimumToMaximumWidth: [0.26, 0.48],
        },
        turreted: {
            // A one-cell companion-bud shift changes this coarse 48^3 PCA by
            // roughly 0.01. Keep the anti-row contract tight while admitting
            // that reconstruction quantization band.
            maximumPlanFootprintAspect: 2.76,
            lclToMiddleArea: [0.26, 0.42],
            baseToMiddleSpan: [0.54, 0.70],
            // A connected feeder and an older shoulder retain real lower-body
            // condensate; the former pencil-tower allowance underweighted it.
            lowerThirdMass: [0.12, 0.19],
            trunkMinimumToMaximumWidth: [0.26, 0.42],
        },
        multicell: {
            maximumPlanFootprintAspect: 2.80,
            lclToMiddleArea: [0.34, 0.50],
            baseToMiddleSpan: [0.58, 0.75],
            lowerThirdMass: [0.13, 0.23],
            // At 48 samples the merged body's narrowest reconstructed row
            // moves in roughly 0.015 ratio increments. Retain a material neck
            // while allowing that single-cell quantization band.
            trunkMinimumToMaximumWidth: [0.45, 0.68],
        },
    };
    for (const volume of congestusVolumes) {
        const statistics = volume.statistics;
        const morphology = volume.classification.morphologyVariant;
        const proportionContract = congestusProportionContracts[morphology];
        assert.ok(proportionContract,
            `${volume.id} needs an explicit morphology proportion contract`);
        const minimumAspect = morphology === "multicell" ? 1.20
            : morphology === "turreted" ? 1.45 : 1.50;
        assert.ok(aspect(volume) > minimumAspect,
            `${volume.id} needs morphology-relative great vertical extent`);
        // This PCA is measured on the x/z condensate footprint. It must catch
        // a line of cloned owners or a pencil root, but it says nothing about
        // vertical tower height (the occupied AABB `aspect` check above does).
        assert.ok(statistics.projectedPrincipalAspectRatio <=
            proportionContract.maximumPlanFootprintAspect,
        `${volume.id} plan footprint cannot collapse into an elongated row`);
        assert.ok(statistics.cumulusNestedPulseCount >= 20,
            `${volume.id} needs a resolved but bandwidth-limited bud hierarchy`);
        assert.ok(statistics.cumulusCuspCount >= 10,
            `${volume.id} needs a tertiary hard-cusp hierarchy`);
        assert.ok(statistics.cumulusCrownBranchCount >= 3,
            `${volume.id} crown must split into several connected buoyant heads`);
        const minimumLineageAnchors = morphology === "multicell" ? 4 : 3;
        assert.ok(statistics.cumulusCrownLineageAnchorCount >= minimumLineageAnchors,
            `${volume.id} crown heads must continue several late thermal lineages`);
        assert.ok(statistics.cumulusCrownMaximumSharedJunctionChildren <= 2,
            `${volume.id} crown cannot radiate from one visible fork junction`);
        assert.ok(statistics.cumulusThermalChainCount >= 2,
            `${volume.id} needs a dominant updraft and a source-connected feeder`);
        const maximumResolvedHeads = morphology === "multicell" ? 38 : 30;
        assert.ok(statistics.cumulusAuthoredResolvedThermalHeadCount <=
            maximumResolvedHeads,
        `${volume.id} must spend its atlas bandwidth on a few resolved thermal ` +
            `heads rather than a field of offset columns`);
        assert.ok(statistics.cumulusAuthoredCommunicatingNeckCount >= 20,
            `${volume.id} resolved heads need curved source-connected necks`);
        assert.equal(statistics.cumulusHardProtectedThermalHeadCount, 1,
            `${volume.id} may hard-protect only its first dominant thermal head`);
        assert.equal(statistics.cumulusHardProtectedJunctionCount, 0,
            `${volume.id} communicating junctions must remain entraining material`);
        assert.ok(statistics.cumulusDissipatingShoulderCount >= 2,
            `${volume.id} needs simultaneous hard and entraining lifecycle states`);
        assert.ok(statistics.cumulusCrownTopHeightVariation >= 0.08,
            `${volume.id} crown heads cannot terminate at one stamped height`);
        assert.ok(statistics.cumulusCrownShoulderPeakCount >= 2,
            `${volume.id} reconstructed crown cannot collapse to one smooth cap`);
        assert.ok(statistics.cumulusCrownFinePeakCount >=
            (morphology === "multicell" ? 1 : 2),
            `${volume.id} needs several raw-byte terminal crown peaks in both elevations`);
        assert.ok(statistics.cumulusCrownMaximumViewFinePeakCount >= 2,
            `${volume.id} needs a clearly articulated physical crown elevation`);
        assert.ok(statistics.cumulusCrownMediumPeakCount >= 1,
        `${volume.id} major cauliflower heads must survive radius-one filtering`);
        assert.ok(statistics.cumulusCrownCoarsePeakCount >= 1,
            `${volume.id} needs a dominant crown after radius-two filtering`);
        assert.ok(statistics.cumulusCrownConvexScaleBandCount >=
            (morphology === "turreted" ? 1 : 2),
        `${volume.id} must preserve nested convex heads at several reconstruction scales`);
        if (morphology !== "multicell") {
            assert.ok(statistics.cumulusCrownMinimumViewMaximumCleftDepthVoxels >= 1,
                `${volume.id} needs a resolved dry-air crown cleft in both elevations`);
            assert.ok(statistics.cumulusCrownMinimumViewMeanCleftDepthVoxels >= 1,
                `${volume.id} crown separation cannot be supplied by isolated noise tips`);
        } else {
            assert.ok(statistics.cumulusCrownMaximumViewMaximumCleftDepthVoxels >= 1,
                `${volume.id} needs a resolved three-dimensional crown cleft`);
        }
        assert.ok(statistics.cumulusFilteredCrownPeakCount >= 1,
            `${volume.id} dominant crown must survive a 2x box reconstruction`);
        if (morphology !== "balanced") {
            assert.ok(statistics.cumulusTrunkNeckCount >= 1,
                `${volume.id} needs at least one resolved pulse-to-neck transition`);
            assert.ok(statistics.cumulusMaximumViewDeepestNeckFraction > 0.16,
                `${volume.id} needs a materially narrower communicating neck`);
        } else {
            // A balanced genealogy still contains successive toroidal parcel
            // events. Permit a small number of irregular communicating necks;
            // the width, straight-side and periodicity contracts below reject
            // the old repeated shelf stack without erasing real pulse anatomy.
            assert.ok(statistics.cumulusTrunkNeckCount >= 1 &&
                statistics.cumulusTrunkNeckCount <= 3);
        }
        assert.ok(statistics.cumulusTrunkMinimumToMaximumWidthRatio >=
            proportionContract.trunkMinimumToMaximumWidth[0] &&
            statistics.cumulusTrunkMinimumToMaximumWidthRatio <=
                proportionContract.trunkMinimumToMaximumWidth[1],
        `${volume.id} needs readable thermal necks without a pinched pencil trunk ` +
            `or a constant-width column`);
        assert.ok(statistics.cumulusTowerWidthVariation > 0.13,
            `${volume.id} must show successive unequal thermal widths`);
        assert.ok(statistics.cumulusThermalEventSpacingVariation > 0.14,
            `${volume.id} thermal events must not occupy an evenly spaced vertical lattice`);
        assert.ok(statistics.cumulusMeanThermalVerticalAspect > 0.86,
            `${volume.id} dominant thermal heads cannot be authored as flat shelves`);
        assert.ok(statistics.cumulusDominantTrajectoryDrift > 0.04,
            `${volume.id} needs an asymmetric dominant updraft trajectory`);
        assert.ok(statistics.verticalSilhouetteCompactness < 0.42,
            `${volume.id} must remain articulated rather than oval`);
        assert.ok(statistics.verticalSilhouetteMirrorSimilarity < 0.88,
            `${volume.id} crown must remain asymmetrical`);
        assert.ok(statistics.surfaceVoxelFraction > 0.42 && statistics.surfaceVoxelFraction < 0.65,
            `${volume.id} needs resolved but coherent flank articulation`);
        assert.ok(statistics.cumulusVerticalBoundingBoxFillFraction < 0.64,
            `${volume.id} cannot reconstruct as a filled vertical rectangle`);
        assert.ok(statistics.cumulusVerticalBodyWidthVariation > 0.15,
            `${volume.id} needs a rendered pulse/neck width hierarchy`);
        assert.ok(statistics.cumulusMaximumStraightSideFraction < 0.42,
            `${volume.id} cannot retain a long straight pillar edge`);
        assert.ok(statistics.cumulusLclToMiddleAreaRatio >=
            proportionContract.lclToMiddleArea[0] &&
            statistics.cumulusLclToMiddleAreaRatio <=
                proportionContract.lclToMiddleArea[1],
        `${volume.id} needs a source-bearing LCL footprint that remains ` +
            `subordinate to the developing body`);
        assert.ok(statistics.cumulusLclFootprintFillFraction < 0.86,
            `${volume.id} LCL footprint must be an irregular lobe union, not a box`);
        const baseToMiddleSpan = statistics.baseHorizontalSpan /
            statistics.middleBodyHorizontalSpan;
        assert.ok(baseToMiddleSpan >= proportionContract.baseToMiddleSpan[0] &&
            baseToMiddleSpan <= proportionContract.baseToMiddleSpan[1],
        `${volume.id} must rise from a finite broad source without a pencil root ` +
            `or an over-wide shelf`);
        assert.ok(statistics.lowerThirdMassFraction >=
            proportionContract.lowerThirdMass[0] &&
            statistics.lowerThirdMassFraction <=
                proportionContract.lowerThirdMass[1],
        `${volume.id} needs enough lower-body condensate to support its crown ` +
            `without becoming bottom-heavy`);
        assert.ok(statistics.middleBodyHorizontalSpan >= statistics.baseHorizontalSpan * 0.72,
            `${volume.id} cannot collapse above a broad rectangular base`);
        const minimumCrownExpansion = morphology === "multicell" ? 1.05
            : morphology === "turreted" ? 1.02 : 1.12;
        assert.ok(statistics.crownToMiddleBodySpanRatio > minimumCrownExpansion &&
            statistics.crownToMiddleBodySpanRatio < 1.70,
            `${volume.id} crown width evolution must remain physically plausible`);
        assert.ok(statistics.middleSliceDominantComponentFraction >
            (morphology === "multicell" ? 0.80 : 0.84),
        `${volume.id} needs a dominant communicating thermal mass`);
        const minimumDenseCoreFraction = morphology === "turreted" ? 0.22
            : morphology === "balanced" ? 0.30 : 0.32;
        assert.ok(statistics.denseCoreFraction > minimumDenseCoreFraction,
            `${volume.id} needs an optically solid protected updraft`);
        assert.ok(statistics.denseCoreMeanDensity > 0.90, `${volume.id} protected core must remain opaque after interpolation`);
        assert.ok(statistics.denseCoreMassFraction >
            (morphology === "turreted" ? 0.50 : 0.60),
            `${volume.id} protected core must retain most optical mass`);
        assert.ok(statistics.diluteFringeFraction > 0.30 &&
            statistics.diluteFringeFraction <
                (morphology === "turreted" ? 0.46 : 0.40),
        `${volume.id} needs resolved partial-coverage boundary texels`);
        assert.ok(statistics.diluteFringeMassFraction > 0.04 &&
            statistics.diluteFringeMassFraction < 0.12,
        `${volume.id} partial-coverage fringe must remain optically subordinate`);
        assert.ok(statistics.centralLclBaseRangeVoxels <= 3,
            `${volume.id} central LCL must stay level while its perimeter entrains`);
        assert.ok(statistics.centralLclBaseStdDevVoxels < 0.95);
        assert.ok(statistics.convectiveEvaporatingFlankCount >= 6 &&
            statistics.convectiveEvaporatingFlankCount <= 7);
        // The three-head turreted phenotype has four unique inter-head cleft
        // pairs, six base bites, and one oblique trunk bay. Requiring a
        // twelfth cut would duplicate a valley solely to match the five-head
        // phenotypes rather than add distinct entrainment anatomy.
        const minimumEntrainmentCavities = morphology === "turreted" ? 11 : 12;
        assert.ok(statistics.entrainmentCavityCount >= minimumEntrainmentCavities,
            `${volume.id} needs resolved flank entrainment clefts as well as base bites`);
        assert.equal(statistics.convectiveBaseLobeCount, 3);
        assert.ok(statistics.convectiveCrownLobeCount >= 12);
        assert.ok(statistics.convectiveMergedBodyLobeCount >= 65,
            `${volume.id} needs connected pulse bridges beneath each resolved lobe`);
        assert.ok(statistics.cumulusAuthoredMinimumBudRadiusCanonical * 47 > 1.4,
            `${volume.id} cannot spend atlas bandwidth on sub-Nyquist buds`);
        assert.ok(statistics.cumulusAuthoredMaximumBudRadiusCanonical /
            statistics.cumulusAuthoredMinimumBudRadiusCanonical > 1.7,
        `${volume.id} needs a real bud radius spectrum rather than equal bubbles`);
        assert.ok(statistics.cumulusAuthoredMinimumNeckRadiusCanonical * 47 > 1.1,
            `${volume.id} communicating necks must survive trilinear reconstruction`);
        const minimumAuthoredCleftVoxels = morphology === "turreted" ? 1.8 : 2.2;
        assert.ok(statistics.cumulusAuthoredMaximumCleftDepthCanonical * 47 >
            minimumAuthoredCleftVoxels,
            `${volume.id} authored clefts must exceed exterior/filter uncertainty`);
        assert.ok(statistics.cumulusSubvoxelAliasDensityFraction <
            (morphology === "turreted" ? 0.15 : 0.11),
            `${volume.id} cannot hide significant condensate in rejected sub-voxel dust`);
        assert.ok(statistics.cumulusThinSurfaceVoxelFraction < 0.075,
            `${volume.id} surface cannot be dominated by voxel-width whiskers`);
        assert.ok(statistics.meanDetailType > 0.34 && statistics.meanDetailType < 0.68,
            `${volume.id} material must select coherent liquid-cauli relief rather than noisy turret displacement`);
        const clearCorner = atlasSample(volume, 0, 0, 0);
        assert.equal(selectCloudExteriorDetailClass(
            volume.exteriorBoundary,
            clearCorner.detail / 255,
            clearCorner.phase / 255,
        ), "liquid-cauli", `${volume.id} exterior shell must preserve the authored heads`);
        assert.equal(statistics.hierarchyLevelCount, 4);
        assert.equal(statistics.connectedComponentCount, 1,
            `${volume.id} must not contain detached buds`);
        assert.equal(statistics.largestComponentFraction, 1);
        assert.ok(statistics.removedDetachedVoxelFraction < 0.01,
            `${volume.id} authoring cannot rely on removing a material fragment`);
        assert.ok(statistics.projectedGridAutocorrelationScore < 0.15,
            `${volume.id} must reject grid-correlated pulse placement`);
    }
    assert.ok(
        Math.max(...congestusVolumes.map((volume) => volume.statistics.crownHorizontalSpan)) -
            // Absolute breadth still differs by nearly two atlas voxels; the
            // stronger morphology-relative expansion contracts above prevent
            // these differently scaled owners from becoming one silhouette.
            Math.min(...congestusVolumes.map((volume) => volume.statistics.crownHorizontalSpan)) > 0.035,
        "congestus owners need meaningfully different crown breadths",
    );
    assert.ok(
        Math.max(...congestusVolumes.map((volume) => volume.statistics.upperThirdMassFraction)) -
            Math.min(...congestusVolumes.map((volume) => volume.statistics.upperThirdMassFraction)) > 0.07,
        "congestus owners need distinct vertical mass distributions",
    );
    assert.ok(byId.get("cu-congestus").statistics.broadBaseThicknessFraction < 0.30,
        "balanced congestus cannot read as a deep rectangular shelf");
    assert.ok(byId.get("cu-congestus-turreted").statistics.broadBaseThicknessFraction < 0.30,
        "turreted congestus needs a shallow source layer beneath the tower");
    assert.ok(byId.get("cu-congestus-multicell").statistics.broadBaseThicknessFraction < 0.30,
        "even merged multicell congestus cannot become a stacked base plate");
    assert.ok(byId.get("cu-congestus").statistics.crownHorizontalSpan >
        byId.get("cu-congestus").statistics.middleBodyHorizontalSpan * 1.12,
    "balanced congestus needs the WMO cauliflower-like bulging crown");
  assert.ok(byId.get("cu-congestus-multicell").statistics.middleBodyHorizontalSpan >=
      byId.get("cu-congestus-turreted").statistics.middleBodyHorizontalSpan * 1.29,
    "multicell congestus must retain a broader merged middle than the narrow turreted form");
    const congestusWidthVariations = congestusVolumes.map((volume) =>
        volume.statistics.cumulusTowerWidthVariation);
    assert.ok(Math.max(...congestusWidthVariations) >
        mediocris.statistics.cumulusTowerWidthVariation * 1.15 &&
        Math.max(...congestusWidthVariations) -
            Math.min(...congestusWidthVariations) > 0.04,
    "congestus owners need a distinct source-scale pulse-width spectrum");
    for (let left = 0; left < congestusVolumes.length; left += 1) {
        for (let right = left + 1; right < congestusVolumes.length; right += 1) {
            for (const axis of [0, 2]) {
                const similarity = binaryJaccard(
                    normalizedElevationProjection(congestusVolumes[left], axis),
                    normalizedElevationProjection(congestusVolumes[right], axis),
                );
                assert.ok(similarity < 0.78,
                    `${congestusVolumes[left].id}/${congestusVolumes[right].id} ` +
                    `cannot reconstruct as the same normalized vertical stamp ` +
                    `(axis ${axis}, similarity ${similarity.toFixed(3)})`);
            }
        }
    }
    assert.ok(byId.get("cu-humilis").statistics.lowerThirdMassFraction > byId.get("cu-mediocris").statistics.lowerThirdMassFraction);
    assert.ok(byId.get("cu-mediocris").statistics.lowerThirdMassFraction > byId.get("cu-congestus").statistics.lowerThirdMassFraction);

    const calvus = byId.get("cb-calvus").statistics;
    const capillatus = byId.get("cb-capillatus").statistics;
    assert.ok(calvus.meanDetailType < capillatus.meanDetailType, "calvus needs a smoother transitional summit than capillatus");
    assert.ok(calvus.cumulonimbusCalvusBridgeCount >= 4, "calvus summit must be bridged by attached transition trajectories");
    assert.ok(capillatus.meanIceFraction > calvus.meanIceFraction * 1.5, "capillatus must advance the shared tower into a more glaciated crown");
    assert.ok(capillatus.meanDetailType > calvus.meanDetailType, "capillatus must replace the calvus dome with fibrous structure");
    assert.ok(calvus.occupancyFraction > byId.get("cu-congestus").statistics.occupancyFraction * 1.1, "calvus needs a massive continuous deep-convective body");
    assert.ok(capillatus.p90DensityPathVertical > 0.65, "capillatus needs a deep optically substantial column");
    assert.ok(calvus.largestComponentFraction > 0.999);
    assert.ok(capillatus.largestComponentFraction > 0.999);
    assert.ok(byId.get("cb-capillatus-incus").statistics.projectedMirrorSimilarity < 0.68, "incus must retain an asymmetric downwind storm/anvil footprint");
    const dissipating = byId.get("cb-dissipating").statistics;
    assert.ok(dissipating.denseCoreFraction < capillatus.denseCoreFraction * 0.45, "dissipating cumulonimbus must lose most of its protected dense core");
    assert.ok(dissipating.diluteFringeFraction > capillatus.diluteFringeFraction * 2, "dissipating cumulonimbus must become dominated by dilute fragments");
    assert.ok(dissipating.surfaceVoxelFraction > capillatus.surfaceVoxelFraction * 1.35, "dissipating cumulonimbus must expose a strongly eroded boundary");

    const cumulonimbusVolumes = manifest.volumes.filter((volume) =>
        volume.classification.genus === "cumulonimbus");
    for (const volume of cumulonimbusVolumes) {
        const statistics = volume.statistics;
        assert.equal(statistics.cumulonimbusLegacyEllipsoidCapCount, 0,
            `${volume.id} must not reintroduce a stamped summit cap`);
        assert.equal(statistics.cumulonimbusLegacyEllipsoidPlateCount, 0,
            `${volume.id} must not reintroduce a stacked anvil plate`);
        assert.ok(statistics.largestComponentFraction > 0.985,
            `${volume.id} must not contain a materially detached cloud fragment`);
        assert.ok(statistics.projectedGridAutocorrelationScore < 0.14,
            `${volume.id} must not expose repeated grid topology`);
        assert.ok(statistics.verticalSilhouetteCompactness < 0.43,
            `${volume.id} must remain articulated rather than an ellipsoid`);
    }
    for (const id of ["cb-capillatus", "cb-capillatus-sheared"]) {
        assert.ok(byId.get(id).statistics.cumulonimbusCrownTrajectoryCount >= 9,
            `${id} needs source-connected glaciation fibres`);
    }
    for (const id of ["cb-capillatus-incus", "cb-capillatus-incus-back-sheared"]) {
        assert.ok(byId.get(id).statistics.cumulonimbusAnvilTrajectoryCount >= 16,
            `${id} needs a trajectory-built connected outflow sheet`);
    }
    for (const id of ["cb-dissipating", "cb-dissipating-remnant"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.upperThirdMassFraction > statistics.lowerThirdMassFraction * 10,
            `${id} must lose lower liquid mass before persistent upper ice`);
        assert.ok(statistics.lowerThirdMassFraction < 0.03,
            `${id} lower tower decay must be physical rather than global noise erosion`);
    }
    for (const [baseId, variantId] of [
        ["cb-calvus", "cb-calvus-multicell"],
        ["cb-capillatus", "cb-capillatus-sheared"],
        ["cb-capillatus-incus", "cb-capillatus-incus-back-sheared"],
        ["cb-dissipating", "cb-dissipating-remnant"],
    ]) {
        assert.notEqual(byId.get(baseId).seed, byId.get(variantId).seed,
            `${baseId} requires a deterministic alternate topology`);
    }
});

test("deep-convection atlas encodes a finite source-connected storm topology", () => {
    const byId = new Map(manifest.volumes.map((volume) => [volume.id, volume]));
    const activeIds = [
        "cb-calvus", "cb-capillatus", "cb-capillatus-incus",
        "cb-calvus-multicell", "cb-capillatus-sheared",
        "cb-capillatus-incus-back-sheared",
    ];
    for (const id of activeIds) {
        const volume = byId.get(id);
        const statistics = volume.statistics;
        assert.equal(volume.formation.boundaryModel, "source-connected-advected-thermal-graph");
        assert.equal(
            volume.exteriorBoundary.protectedBase.mode,
            "protected-convective-condensation-base",
        );
        assert.equal(volume.exteriorBoundary.protectedBase.downwardDisplacementScale, 0);
        assert.equal(
            volume.formation.deepConvection.topology,
            "finite-source-connected-advected-thermal-graph",
        );
        assert.equal(
            statistics.cumulonimbusSourceConnectedTrajectoryCount,
            statistics.cumulonimbusTrajectoryCount,
            `${id} may not contain an authoring-time detached trajectory`,
        );
        assert.equal(
            statistics.cumulonimbusTopologyNodeCount -
                statistics.cumulonimbusTopologyEdgeCount,
            statistics.cumulonimbusTrajectoryCount,
            `${id} trajectory graph accounting must remain exact`,
        );
        assert.ok(statistics.cumulonimbusFeederTrajectoryCount >= 6,
            `${id} needs multiple inflow-owned feeder roots`);
        assert.ok(statistics.cumulonimbusMergedUpdraftTrajectoryCount >= 11,
            `${id} needs a dominant core plus attached entraining thermals`);
        assert.ok(statistics.cumulonimbusMinimumAttachmentRadiusVoxels >= 1.35,
            `${id} paths must survive 48^3 trilinear reconstruction`);
        assert.ok(statistics.cumulonimbusTrajectoryRadiusCoefficientOfVariation > 0.22,
            `${id} must reject equal-radius smoke stacks and repeated lobes`);
        assert.ok(statistics.cumulonimbusUniqueTrajectoryDirectionFraction >= 0.60,
            `${id} must reject axis/grid-aligned trajectory repetition`);
        assert.ok(statistics.projectedGridAutocorrelationScore < 0.12,
            `${id} must reject large-scale grid repetition`);
        assert.ok(statistics.verticalProfileCoefficientVariation > 0.34,
            `${id} must have an articulated vertical mass profile, not an oval`);
        assert.ok(statistics.cumulonimbusPrecipitationTrajectoryCount >= 1);
        assert.equal(
            statistics.cumulonimbusDowndraftTrajectoryCount,
            statistics.cumulonimbusPrecipitationTrajectoryCount,
        );
        assert.ok(statistics.cumulonimbusMinimumPrecipitationCoreSeparation >= 0.13,
            `${id} precipitation loading must stay offset from the protected updraft`);
        assert.ok(statistics.meanPrecipitationStructure > 0.02,
            `${id} needs measurable owned precipitation support`);
        assert.equal(statistics.connectedComponentCount, 1,
            `${id} authored condensate support must remain materially connected`);
    }

    for (const id of ["cb-calvus", "cb-calvus-multicell"]) {
        const statistics = byId.get(id).statistics;
        assert.equal(statistics.cumulonimbusGlaciationTransitionCount, 0);
        assert.equal(statistics.cumulonimbusAnvilTrajectoryCount, 0);
        assert.ok(statistics.cumulonimbusCalvusBridgeCount >= 9,
            `${id} needs a many-scale attached dome rather than one smooth cap`);
        assert.ok(statistics.cumulonimbusOvershootTrajectoryCount >= 2);
    }

    for (const id of ["cb-capillatus", "cb-capillatus-sheared"]) {
        const statistics = byId.get(id).statistics;
        assert.ok(statistics.cumulonimbusGlaciationTransitionCount >= 6,
            `${id} needs a continuous mixed-phase transition below the fibres`);
        assert.ok(statistics.cumulonimbusCrownTrajectoryCount >= 14,
            `${id} needs a genuinely fibrous glaciated crown`);
        assert.ok(statistics.crownHorizontalSpan > statistics.baseHorizontalSpan * 1.02,
            `${id} crown detrainment must spread beyond the protected base`);
    }

    const downwindIncus = byId.get("cb-capillatus-incus").statistics;
    const backShearedIncus = byId.get("cb-capillatus-incus-back-sheared").statistics;
    assert.equal(downwindIncus.cumulonimbusAnvilBranchDepth, 2);
    assert.equal(backShearedIncus.cumulonimbusAnvilBranchDepth, 2);
    assert.ok(downwindIncus.cumulonimbusAnvilTrajectoryCount >= 24);
    assert.ok(backShearedIncus.cumulonimbusAnvilTrajectoryCount >= 26);
    assert.ok(downwindIncus.cumulonimbusAnvilDownwindUpwindRatio > 3,
        "ordinary incus outflow must remain strongly downwind-biased");
    assert.ok(
        backShearedIncus.cumulonimbusAnvilDownwindUpwindRatio >= 0.8 &&
            backShearedIncus.cumulonimbusAnvilDownwindUpwindRatio <= 1.25,
        "back-sheared incus must retain substantial finite upwind outflow",
    );
    assert.ok(downwindIncus.projectedMirrorSimilarity < 0.69,
        "downwind incus must remain visibly asymmetric in its projected support");

    const pulseCalvus = byId.get("cb-calvus");
    const multicellCalvus = byId.get("cb-calvus-multicell");
    assert.equal(pulseCalvus.formation.deepConvection.organization, "pulse-cell");
    assert.equal(multicellCalvus.formation.deepConvection.organization, "multicell-cluster");
    assert.ok(
        multicellCalvus.statistics.baseHorizontalSpan >
            pulseCalvus.statistics.baseHorizontalSpan * 1.15,
        "multicell Calvus must retain a physically broader merger base than the pulse cell",
    );
    assert.ok(
        byId.get("cb-capillatus-sheared").statistics.projectedMirrorSimilarity <
            byId.get("cb-capillatus").statistics.projectedMirrorSimilarity * 0.75,
        "the sheared Capillatus owner must change storm geometry, not merely its seed",
    );

    for (const id of ["cb-dissipating", "cb-dissipating-remnant"]) {
        const statistics = byId.get(id).statistics;
        assert.equal(statistics.cumulonimbusFeederTrajectoryCount, 0,
            `${id} cannot retain a surface-fed inflow after decay`);
        assert.equal(statistics.cumulonimbusMergedUpdraftTrajectoryCount, 0,
            `${id} cannot retain a protected live updraft after decay`);
        assert.equal(statistics.cumulonimbusOvershootTrajectoryCount, 0,
            `${id} cannot generate a new overshoot over a dead tower`);
        assert.equal(
            byId.get(id).exteriorBoundary.protectedBase.mode,
            "unprotected-eroding-convective-remnant",
        );
        assert.equal(byId.get(id).exteriorBoundary.protectedBase.downwardDisplacementScale, 1);
        assert.ok(statistics.cumulonimbusRemnantTrajectoryCount >= 4);
        assert.ok(statistics.upperThirdMassFraction > 0.58,
            `${id} must be an upper-ice/anvil remnant`);
        assert.equal(statistics.lowerThirdMassFraction, 0,
            `${id} must have completely lost its lower liquid tower`);
    }
    assert.ok(
        byId.get("cb-dissipating-remnant").statistics.crownHorizontalSpan >
            byId.get("cb-dissipating").statistics.crownHorizontalSpan * 1.10,
        "the deterministic anvil-remnant owner must preserve a broader upper-ice outflow",
    );
});

test("convective lifecycle volumes retain clear interpolation margins", () => {
    const resolution = manifest.atlas.volumeResolution;
    for (const id of [
        "cu-humilis", "cu-mediocris", "cu-congestus",
        "cu-congestus-turreted", "cu-congestus-multicell",
        "cb-calvus", "cb-capillatus", "cb-capillatus-incus", "cb-dissipating",
        "cb-calvus-multicell", "cb-capillatus-sheared",
        "cb-capillatus-incus-back-sheared", "cb-dissipating-remnant",
    ]) {
        const volume = manifest.volumes.find((candidate) => candidate.id === id);
        let occupiedFaceVoxels = 0;
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    if (
                        x > 0 && x + 1 < resolution &&
                        y > 0 && y + 1 < resolution &&
                        z > 0 && z + 1 < resolution
                    ) continue;
                    if (atlasSample(volume, x, y, z).density >=
                        manifest.occupancy.densityByteThreshold) {
                        occupiedFaceVoxels += 1;
                    }
                }
            }
        }
        assert.equal(occupiedFaceVoxels, 0, `${id} must not expose a clipped atlas face`);
    }
});

test("classification lookup selects species, WMO veil/opacity states, incus, and decay templates", () => {
    assert.match(rendererSource,
        /varieties:\s*system\.state\.classification\.varieties/,
    "renderer atlas selection must retain orthogonal WMO variety state");
    assert.equal(selectCloudMacroVolumeId({ genus: "cirrus", species: "uncinus" }), "ci-uncinus");
    assert.deepEqual([0, 1, 2, 3].map((deterministicVariant) =>
        selectCloudMacroVolumeId({
            genus: "cirrus",
            species: "fibratus",
            deterministicVariant,
        })), [
        "ci-fibratus",
        "ci-fibratus-depth-shear",
        "ci-fibratus-split-source",
        "ci-fibratus",
    ], "logical topology ordinal must select its matching dense fibratus anatomy");
    assert.equal(selectCloudMacroVolumeId({ genus: "cirrostratus", species: "cirrostratus-nebulosus" }), "cs-veil");
    assert.equal(selectCloudMacroVolumeId({ genus: "cirrostratus", species: "cirrostratus-fibratus" }), "cs-fibratus");
    assert.equal(selectCloudMacroVolumeId({ genus: "altostratus" }), "as-opacus");
    assert.equal(selectCloudMacroVolumeId({
        genus: "altostratus",
        species: "altostratus-opacus",
        varieties: ["translucidus"],
    }), "as-translucidus");
    assert.equal(selectCloudMacroVolumeId({
        genus: "nimbostratus",
        nimbostratusParentTopologyVariantId: "deepening-altostratus-shield",
    }), "ns-deepening-altostratus-shield");
    assert.equal(selectCloudMacroVolumeId({
        genus: "nimbostratus",
        supplementaryFeatures: ["praecipitatio"],
        nimbostratusParentTopologyVariantId: "generating-cell-stratiform-shield",
    }), "ns-generating-cell-shield");
    assert.equal(selectCloudMacroVolumeId({
        genus: "nimbostratus",
        supplementaryFeatures: ["virga"],
        nimbostratusParentTopologyVariantId: "thickened-low-deck-nimbostratus",
    }), "ns-thickened-low-deck-shield");
    assert.match(rendererSource,
        /nimbostratusParentTopologyVariantId:\s*system\.familyProduction\?\.nimbostratusParentTopologyVariantId/,
        "renderer selection must consume the authoritative low-layer parent anatomy");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus", supplementaryFeatures: ["incus"] }), "cb-capillatus-incus");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus incus" }), "cb-capillatus-incus");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus", lifecycleStage: "decaying" }), "cb-dissipating");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "calvus", deterministicVariant: 1 }), "cb-calvus-multicell");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus", deterministicVariant: 1 }), "cb-capillatus-sheared");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus", supplementaryFeatures: ["incus"], deterministicVariant: 1 }), "cb-capillatus-incus-back-sheared");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulonimbus", species: "capillatus", lifecycleStage: "decaying", deterministicVariant: 1 }), "cb-dissipating-remnant");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulus", species: "fractus" }), "cu-fractus");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulus", species: "congestus", deterministicVariant: 0 }), "cu-congestus");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulus", species: "congestus", deterministicVariant: 1 }), "cu-congestus-turreted");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulus", species: "cumulus-congestus", deterministicVariant: 2 }), "cu-congestus-multicell");
    assert.equal(selectCloudMacroVolumeId({ genus: "cumulus", species: "congestus", deterministicVariant: 3 }), "cu-congestus");
    const available = new Set(CLOUD_MACRO_VOLUME_IDS);
    for (const species of WMO_CLOUD_SPECIES) {
        const genus = species.split("-")[0];
        assert.ok(
            available.has(selectCloudMacroVolumeId({ genus, species })),
            `${species} must resolve to an atlas template`,
        );
    }
});

test("stable scene/day selection reaches every materialized compatible macroshape", () => {
    const selections = [
        { genus: "cumulus", species: "congestus" },
        { genus: "cumulonimbus", species: "calvus" },
        { genus: "cumulonimbus", species: "capillatus" },
        { genus: "cumulonimbus", species: "capillatus", supplementaryFeatures: ["incus"] },
        { genus: "cumulonimbus", species: "capillatus", lifecycleStage: "decaying" },
        { genus: "cirrocumulus", species: "stratiformis" },
        { genus: "cirrus", species: "fibratus" },
    ];
    for (const selection of selections) {
        const candidates = cloudMacroVolumeCandidates(selection);
        const choose = (seed) => selectCloudMacroVolumeId({
            ...selection,
            deterministicSceneSeed: `2026-${seed}`,
            deterministicOwnerSeed: 41,
        });
        assert.equal(choose(17), choose(17));
        const reached = new Set(Array.from({ length: 128 }, (_, seed) =>
            choose(seed)));
        assert.deepEqual([...reached].sort(), [...candidates.volumeIds].sort());
        for (const id of reached) {
            const volume = manifest.volumes.find((entry) => entry.id === id);
            assert.equal(volume.classification.genus, selection.genus);
        }
    }
});

test("compact RGBA and R8 rows are repacked without crossing row or depth boundaries", () => {
    const dimensions = { width: 48, height: 3, depthOrArrayLayers: 2 };
    const rgba = Uint8Array.from({ length: 48 * 3 * 2 * 4 }, (_, index) => index % 251);
    const packedAtlas = packCloudAtlasForWebGPU(rgba, dimensions);
    assert.equal(packedAtlas.bytesPerRow, 256);
    assert.equal(packedAtlas.bytes.byteLength, 256 * 3 * 2);
    for (let z = 0; z < 2; z += 1) {
        for (let y = 0; y < 3; y += 1) {
            const sourceOffset = (z * 3 + y) * 192;
            const targetOffset = (z * 3 + y) * 256;
            assert.deepEqual(
                packedAtlas.bytes.subarray(targetOffset, targetOffset + 192),
                rgba.subarray(sourceOffset, sourceOffset + 192),
            );
            assert.ok(packedAtlas.bytes.subarray(targetOffset + 192, targetOffset + 256).every((value) => value === 0));
        }
    }
    const r8Dimensions = { width: 6, height: 2, depthOrArrayLayers: 2 };
    const r8 = Uint8Array.from({ length: 24 }, (_, index) => index + 1);
    const packedR8 = packCloudMajorantsForWebGPU(r8, r8Dimensions);
    assert.equal(packedR8.bytesPerRow, 256);
    for (let row = 0; row < 4; row += 1) {
        assert.deepEqual(packedR8.bytes.subarray(row * 256, row * 256 + 6), r8.subarray(row * 6, row * 6 + 6));
    }
    const rgba8Dimensions = { width: 64, height: 2, depthOrArrayLayers: 2 };
    const rgba8 = Uint8Array.from({ length: 64 * 2 * 2 * 4 }, (_, index) => index % 251);
    const packedRgba8 = packCloudHighIceSourceAtlasForWebGPU(rgba8, rgba8Dimensions);
    assert.equal(packedRgba8.bytesPerRow, 256);
    for (let row = 0; row < 4; row += 1) {
        assert.deepEqual(
            packedRgba8.bytes.subarray(row * 256, row * 256 + 256),
            rgba8.subarray(row * 256, row * 256 + 256),
        );
    }
});

test("runtime revalidates the atlas manifest and checksum-versions immutable payloads", () => {
    assert.match(
        atlasRuntimeSource,
        /fetch\(manifestUrl,\s*\{\s*cache:\s*"no-cache"/,
        "a regenerated manifest must not be hidden by a long-lived force-cache entry",
    );
    assert.match(
        atlasRuntimeSource,
        /url\.searchParams\.set\("sha256",\s*checksum\)/,
        "atlas payload URLs must change whenever their declared checksum changes",
    );
    assert.match(
        atlasRuntimeSource,
        /versionedAssetUrl\(\s*manifest\.atlas\.url,[\s\S]*?manifest\.checksums\.atlas/,
    );
    assert.match(
        atlasRuntimeSource,
        /versionedAssetUrl\(\s*manifest\.majorants\.url,[\s\S]*?manifest\.checksums\.majorants/,
    );
    assert.match(
        atlasRuntimeSource,
        /versionedAssetUrl\(\s*manifest\.highIceSourceAtlas\.url,[\s\S]*?manifest\.checksums\.highIceSourceAtlas/,
    );
    assert.match(atlasRuntimeSource, /packCloudHighIceSourceAtlasForWebGPU/);
    assert.match(atlasRuntimeSource, /packTextureRowsForWebGPU\(bytes, dimensions, 4\)/);
    assert.match(atlasRuntimeSource, /highIceSourceAtlasTexture/);
    assert.doesNotMatch(atlasRuntimeSource, /manifest\.highIceMomentSidecar\.url/);
    assert.match(rendererSource, /CLOUD_MACRO_BINDING_VEC4_STRIDE = 7/);
    assert.match(rendererSource, /binding:\s*32,[\s\S]*?highIceSourceAtlasTexture/);
    assert.doesNotMatch(rendererSource, /highIceMomentSidecarTexture/);
});

test("signed-distance channel has the documented inside/outside sign", () => {
    const resolution = manifest.atlas.volumeResolution;
    for (const volume of manifest.volumes) {
        let interiorSamples = 0;
        let exteriorSamples = 0;
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const { density, signedDistance } =
                        atlasSample(volume, x, y, z);
                    if (density >= manifest.occupancy.densityByteThreshold && signedDistance < 128) {
                        interiorSamples += 1;
                    }
                    if (density === 0 && signedDistance > 128) exteriorSamples += 1;
                }
            }
        }
        assert.ok(interiorSamples > 0, `${volume.id} has no negative interior SDF samples`);
        assert.ok(exteriorSamples > 0, `${volume.id} has no positive exterior SDF samples`);
    }
});

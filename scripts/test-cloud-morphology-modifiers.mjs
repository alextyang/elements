import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT as
        GENERATED_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT,
    CLOUD_MORPHOLOGY_MODIFIER_IDS as GENERATED_IDS,
    generateCloudMorphologyModifierManifest,
} from "./lib/cloud-morphology-modifiers.mjs";
import {
    CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT,
    CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS,
    CLOUD_MORPHOLOGY_BOUNDS_NUMERIC_MARGIN_KM,
    CLOUD_MORPHOLOGY_BYTES_PER_ROW,
    CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH as
        CLOUD_MORPHOLOGY_CPU_FINITE_ENVELOPE_REACH,
    CLOUD_MORPHOLOGY_HEADER_TEXELS,
    CLOUD_MORPHOLOGY_EXISTING_SUPPORT_ONLY_OPERATOR_CODES,
    CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS,
    CLOUD_MORPHOLOGY_MAX_RECORDS,
    CLOUD_MORPHOLOGY_MODIFIER_IDS,
    CLOUD_MORPHOLOGY_RECORD_TEXELS,
    CLOUD_MORPHOLOGY_TEXTURE_WIDTH,
    cloudCirrusFibratusCameraPixelFootprintRadiusKm,
    cloudMorphologyAssignmentKey,
    cloudMorphologyOperationMayChangeSupport,
    cloudMorphologyRecordMayChangeSupportAt,
    compileCloudMorphologyRecords,
    compileCloudCirrusFibratusPackedDescriptors,
    deriveCloudMorphologyRequirements,
    inflateCloudMorphologyBounds,
    indexCloudMorphologyAssignments,
    packCloudMorphologyModifiers,
    packCloudLogicalTopologyWord,
    qualifyCloudCirrusFibratusSubvoxelDensityOptimized,
    qualifyCloudCirrusFibratusSubvoxelDensityReference,
    qualifyCloudCirrusFibratusSubvoxelFibres,
    resolveCloudMorphologyAssignment,
    selectCloudMorphologyModifiers,
    validateCloudMorphologyModifierManifest,
} from "../components/backgrounds/sky/cloud-morphology-modifiers.ts";
import {
    CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_MAX_FIBRES,
    CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MAXIMUM,
    CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MINIMUM,
    CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MAXIMUM,
    CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MINIMUM,
    CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH,
    CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
} from
    "../components/backgrounds/sky/cloud-morphology-modifiers-wgsl.ts";
import {
    applyCloudMorphologyRecordReference,
    composeCloudMorphologyDensityReference,
    createCloudMorphologyReferenceEvaluation,
} from "../components/backgrounds/sky/cloud-morphology-evaluator.ts";
import {
    CLOUD_ACCESSORY_GENERA,
    CLOUD_FEATURE_GENERA,
    CLOUD_TOPOLOGY_EXEMPLARS,
    CLOUD_VARIETY_GENERA,
} from "../components/backgrounds/sky/cloud-state-map.ts";

const manifestPath = new URL(
    "../public/assets/sky/cloud-morphology-modifiers-v1.json",
    import.meta.url,
);
const manifest = validateCloudMorphologyModifierManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
);
const baseAtlasManifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-macro-atlas-v1.json", import.meta.url),
    "utf8",
));
const byId = new Map(manifest.modifiers.map((modifier) => [modifier.id, modifier]));
const requirements = (...values) => new Set(values);
const parent = (ownerIndex = 0) => ({
    ownerIndex,
    centerKm: [0, 4, 0],
    halfExtentsKm: [8, 4, 10],
    axisU: [1, 0, 0],
    axisV: [0, 1, 0],
    axisW: [0, 0, 1],
    anchorsKm: {
        "parent-volume": [0, 4, 0],
        "parent-filament-axis": [0, 6, 0],
        "parent-layer-midplane": [0, 4, 0],
        "parent-upper-surface": [0, 8, 0],
        "parent-underside": [0, 2, 0],
        "anvil-underside": [0, 9, 2],
        "parent-leading-lower-edge": [0, 2, -8],
        "rain-free-base": [2, 2, 0],
        "precipitation-core-edge": [-4, 2, 2],
        "parent-top": [0, 8, 0],
        "parent-lower-environment": [0, 1.5, 0],
        "storm-inflow-sector": [4, 2.5, -5],
        "tangent-shell": [0, 82, 0],
    },
});

const classification = ({
    genus = "altocumulus",
    species = "stratiformis",
    varieties = [],
    supplementaryFeatures = [],
    accessoryClouds = [],
} = {}) => ({
    genus,
    species,
    varieties,
    supplementaryFeatures,
    accessoryClouds,
    origin: { kind: "natural" },
});

const morphologyRecord = ({
    ownerIndex = 0,
    modifierId = "pileus",
    operatorCode = 18,
    operatorName = "add-cap-shell",
    blend = "smooth-union",
    blendCode = 1,
    centerKm = [0, 0, 0],
    axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    halfExtentsKm = [1, 1, 1],
} = {}) => ({
    modifierId,
    parentOwnerIndex: ownerIndex,
    operatorCode,
    operatorName,
    blend,
    blendCode,
    anchorCode: 1,
    flags: 0,
    seed: 0x1234abcd,
    intensity: 1,
    lifecycle: 0.5,
    centerKm,
    axes,
    halfExtentsKm,
    shape0: [0.3, 0.3, 0.2, 0.3],
    shape1: [0.2, 0.2, 0.2, 2],
});

const expectedRecordRadius = (record, component) =>
    CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH * record.axes.reduce(
        (sum, axis, axisIndex) => sum + Math.abs(axis[component]) *
            Math.max(1e-5, record.halfExtentsKm[axisIndex]),
        0,
    ) + CLOUD_MORPHOLOGY_BOUNDS_NUMERIC_MARGIN_KM;

const assertNear = (actual, expected, label) => assert.ok(
    Math.abs(actual - expected) <= 1e-12,
    `${label}: ${actual} != ${expected}`,
);

const assertFiniteEnvelopeShellContained = (record, bounds, label) => {
    for (const u of [-CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH,
        CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH]) {
        for (const v of [-CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH,
            CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH]) {
            for (const w of [-CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH,
                CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH]) {
                const local = [u, v, w];
                const corner = record.centerKm.map((center, component) =>
                    center + record.axes.reduce((sum, axis, axisIndex) =>
                        sum + axis[component] * local[axisIndex] *
                            Math.max(1e-5, record.halfExtentsKm[axisIndex]), 0));
                for (let component = 0; component < 3; component += 1) {
                    assert.ok(corner[component] > bounds.minimumKm[component],
                        `${label} shell corner escaped minimum ${component}`);
                    assert.ok(corner[component] < bounds.maximumKm[component],
                        `${label} shell corner escaped maximum ${component}`);
                }
            }
        }
    }
};

test("modifier manifest is deterministic, versioned, complete, and leaves the base atlas unchanged", () => {
    assert.deepEqual(manifest, generateCloudMorphologyModifierManifest());
    assert.deepEqual(CLOUD_MORPHOLOGY_MODIFIER_IDS, GENERATED_IDS);
    assert.deepEqual(manifest.modifiers.map((modifier) => modifier.id), GENERATED_IDS);
    assert.match(manifest.checksums.payload, /^[0-9a-f]{64}$/);
    assert.equal(
        baseAtlasManifest.checksums.atlas,
        "d9b3edb60f217580fa7c6c006cab32fdfeed3165c0025dcdeae01738de701141",
    );
    assert.equal(
        baseAtlasManifest.checksums.majorants,
        "7d828a7ace8ed3304e5055fc326fa702adbdd1b18b781e91f0cf3631c2c6578e",
    );
});

test("WMO ownership tables and every orthogonal category are represented exactly", () => {
    for (const [id, genera] of Object.entries(CLOUD_VARIETY_GENERA)) {
        assert.deepEqual(byId.get(id).constraints.genera, genera, `${id} variety genera drifted`);
    }
    for (const [id, genera] of Object.entries(CLOUD_FEATURE_GENERA)) {
        if (id === "virga" || id === "praecipitatio") continue;
        assert.deepEqual(byId.get(id).constraints.genera, genera, `${id} feature genera drifted`);
    }
    for (const [id, genera] of Object.entries(CLOUD_ACCESSORY_GENERA)) {
        assert.deepEqual(byId.get(id).constraints.genera, genera, `${id} accessory genera drifted`);
    }
    assert.equal(manifest.modifiers.filter((entry) => entry.category === "variety").length, 9);
    assert.equal(manifest.modifiers.filter((entry) => entry.category === "supplementary-feature").length, 9);
    assert.equal(manifest.modifiers.filter((entry) => entry.category === "accessory-cloud").length, 4);
    assert.equal(manifest.modifiers.filter((entry) => entry.category === "upper-atmospheric").length, 3);
    assert.deepEqual(manifest.provenance.excludedFromThisAsset, ["virga", "praecipitatio"]);
});

test("operators encode physical topology instead of generic labels, masks, or stamps", () => {
    for (const modifier of manifest.modifiers) {
        assert.equal(modifier.support.finite, true);
        assert.ok(modifier.physicalScale.horizontalExtentMeters[0] > 0);
        assert.ok(modifier.physicalScale.verticalExtentMeters[0] > 0);
        assert.ok(modifier.physicalScale.downwindExtentMeters[0] > 0);
        assert.ok(!modifier.representation.includes("mask"));
        assert.ok(!modifier.representation.includes("generic"));
        for (const operation of modifier.operators) {
            assert.equal(manifest.operatorCodes[operation.code], operation.opCode);
            assert.equal(manifest.operatorParameterLayouts[operation.code].length, 8);
        }
    }
    assert.equal(byId.get("lacunosus").operators[0].blend, "subtract");
    assert.equal(byId.get("cavum").operators[0].blend, "subtract");
    assert.ok(byId.get("cavum").operators[0].flags.includes("real-through-hole"));
    assert.equal(byId.get("mamma").support.anchor, "parent-underside");
    assert.ok(byId.get("mamma").operators[0].flags.includes("surface-attached"));
    assert.equal(byId.get("radiatus").operators[0].blend, "placement");
    assert.ok(byId.get("radiatus").operators[0].flags.includes("world-parallel"));
    assert.equal(byId.get("incus").operators[0].parameters.macroVolumeId,
        "cb-capillatus-incus");
    assert.equal(byId.get("incus").operators[0].parameters.independentStampForbidden, true);
});

test("population reference variations are aperiodic while organized trains remain nonuniform", () => {
    for (const id of ["lacunosus", "perlucidus", "mamma", "pannus", "asperitas",
        "polar-stratospheric", "nacreous", "noctilucent"]) {
        const topology = byId.get(id).referenceVariation.topology;
        assert.ok(topology.count >= 4, `${id} needs a population`);
        assert.ok(topology.orderedIntervalCoefficientVariation > 0.45,
            `${id} must not form a Cartesian grid`);
        assert.ok(topology.nearestDirectionEntropy > 0.48,
            `${id} nearest directions must not collapse to grid axes`);
    }
    for (const id of ["intortus", "vertebratus", "undulatus", "radiatus", "fluctus",
        "arcus", "cauda", "flumen"]) {
        const topology = byId.get(id).referenceVariation.topology;
        assert.ok(topology.orderedIntervalCoefficientVariation > 0.075,
            `${id} train intervals must not become mechanical repetition`);
    }
});

test("attached features preserve their meteorological relation to the parent", () => {
    assert.equal(byId.get("pileus").support.anchor, "parent-top");
    assert.equal(byId.get("velum").support.anchor, "parent-upper-surface");
    assert.equal(byId.get("murus").support.anchor, "rain-free-base");
    assert.equal(byId.get("cauda").support.anchor, "precipitation-core-edge");
    assert.deepEqual(byId.get("cauda").constraints.dependencies, ["murus"]);
    assert.equal(byId.get("flumen").support.anchor, "storm-inflow-sector");
    assert.ok(byId.get("flumen").operators[0].flags.includes("detached-from-murus"));
    assert.equal(byId.get("arcus").support.anchor, "parent-leading-lower-edge");
    assert.ok(byId.get("tuba").operators[0].flags.includes("no-ground-contact-assumption"));
});

test("upper atmosphere morphology uses true altitude shells and distinct material regimes", () => {
    const psc = byId.get("polar-stratospheric");
    const nacreous = byId.get("nacreous");
    const noctilucent = byId.get("noctilucent");
    assert.deepEqual(psc.support.altitudeKm, [15, 30]);
    assert.deepEqual(nacreous.support.altitudeKm, [15, 30]);
    assert.deepEqual(noctilucent.support.altitudeKm, [80, 85]);
    assert.equal(psc.support.frame, "earth-tangent-shell");
    assert.equal(noctilucent.operators[0].parameters.materialProfile,
        "pmc-water-ice-60-100nm");
    assert.ok(noctilucent.operators[0].parameters.spectralBandsMeters.length >= 3);
    assert.equal(nacreous.operators[0].parameters.materialProfile,
        "psc-ice-nacreous-10um");
    assert.ok(nacreous.operators[0].flags.includes("diffraction-material-required"));
});

test("selection rejects invalid parent, phase, environmental state, and dependencies", () => {
    const cauda = selectCloudMorphologyModifiers(manifest, {
        classification: classification({
            genus: "cumulonimbus",
            species: "capillatus",
            supplementaryFeatures: ["cauda"],
        }),
        phase: "mixed",
        lifecycle: "precipitating",
        requirements: requirements("storm-complex", "supercell-inflow", "precipitation-region"),
    });
    assert.equal(cauda.modifiers.length, 0);
    assert.ok(cauda.diagnostics.some((entry) =>
        entry.code === "missing-dependency:murus"));

    const wrongMamma = selectCloudMorphologyModifiers(manifest, {
        classification: classification({ genus: "stratus", species: "nebulosus",
            supplementaryFeatures: ["mamma"] }),
        phase: "liquid",
        lifecycle: "mature",
        requirements: requirements("cloudy-underside", "subcloud-detrainment-or-sublimation"),
    });
    assert.ok(wrongMamma.diagnostics.some((entry) => entry.code === "invalid-genus"));

    const warmNacreous = selectCloudMorphologyModifiers(manifest, {
        upperAtmosphericCloud: "nacreous",
        phase: "ice",
        lifecycle: "mature",
        requirements: requirements("polar-winter-vortex", "below-ice-frost-point"),
        environment: { temperatureKelvin: 195, absoluteLatitudeDegrees: 70,
            season: "winter", altitudeKm: 22, solarDepressionDegrees: 6 },
    });
    assert.ok(warmNacreous.diagnostics.some((entry) => entry.code === "temperature-domain"));
});

test("camera-independent classification assignments have stable system keys", () => {
    const first = { layerIndex: 1, systemId: "storm-a", classification: classification({
        genus: "cumulonimbus", species: "capillatus", supplementaryFeatures: ["incus"],
    }) };
    const second = { layerIndex: 2, systemIndex: 3, classification: classification() };
    const layerWide = { layerIndex: 0, scope: "layer",
        classification: classification() };
    assert.equal(cloudMorphologyAssignmentKey(first), "1:storm-a");
    assert.equal(cloudMorphologyAssignmentKey(second), "2:#3");
    assert.equal(cloudMorphologyAssignmentKey(layerWide), "0:*");
    const indexed = indexCloudMorphologyAssignments([first, second, layerWide]);
    assert.equal(indexed.get("1:storm-a"), first);
    assert.equal(resolveCloudMorphologyAssignment(indexed,
        { layerIndex: 1, systemId: "storm-a", systemIndex: 9 }), first);
    assert.equal(resolveCloudMorphologyAssignment(indexed,
        { layerIndex: 2, systemId: "missing", systemIndex: 3 }), second);
    assert.equal(resolveCloudMorphologyAssignment(indexed,
        { layerIndex: 0, systemId: "any-owner", systemIndex: 8 }), layerWide);
    assert.throws(() => indexCloudMorphologyAssignments([first, first]), /Duplicate/);
});

test("physical context derives the manifest's selection requirements", () => {
    const derived = deriveCloudMorphologyRequirements({
        organizationKind: "cellular",
        organizationTopology: "open",
        phase: "mixed",
        temperatureKelvin: 263,
        relativeHumidity: 0.9,
        verticalVelocityMps: 8,
        verticalShearMps: 6,
        gradientRichardsonNumber: 0.18,
        vorticityS1: 0.02,
        precipitationKind: "rain",
        outflowSpeedMps: 18,
        stormComplex: true,
        supercell: true,
        mesocyclone: true,
        rainFreeUpdraftBase: true,
        precipitationRegion: true,
        supercellInflow: true,
        pseudoWarmFront: true,
        precipitationMoistenedLayer: true,
        capillatusStage: true,
    });
    for (const token of [
        "open-cell-organization", "supercooled-liquid-layer",
        "vertical-shear-at-least-3-mps", "richardson-unstable-layer",
        "precipitation-driven-cold-pool", "positive-outflow-speed",
        "positive-convective-ascent", "resolved-vorticity", "storm-complex",
        "supercell-mesocyclone", "rain-free-updraft-base", "supercell-inflow",
        "precipitation-region", "relative-humidity-at-least-0.85",
        "pseudo-warm-front", "capillatus-stage",
    ]) assert.ok(derived.has(token), `missing ${token}`);
});

test("classification choices change packed records and preserve physical composition order", () => {
    const none = packCloudMorphologyModifiers(manifest, [{
        parent: parent(0),
        classification: classification({ genus: "cumulonimbus", species: "capillatus" }),
        phase: "mixed",
        lifecycle: "mature",
        requirements: requirements(),
        seed: 11,
    }]);
    assert.equal(none.recordCount, 0);
    assert.equal(none.inflatedBounds.size, 0,
        "an unchanged owner must not be round-tripped through a world AABB");

    const attached = packCloudMorphologyModifiers(manifest, [{
        parent: parent(0),
        classification: classification({
            genus: "cumulonimbus",
            species: "capillatus",
            supplementaryFeatures: ["mamma"],
            accessoryClouds: ["pileus"],
        }),
        phase: "mixed",
        lifecycle: "mature",
        requirements: requirements(
            "cloudy-underside", "subcloud-detrainment-or-sublimation",
            "positive-convective-ascent",
        ),
        seed: 11,
    }]);
    assert.equal(attached.recordCount, 2);
    assert.deepEqual(new Set(attached.records.map((record) => record.modifierId)),
        new Set(["mamma", "pileus"]));

    const ordered = compileCloudMorphologyRecords(manifest, [{
        parent: parent(3),
        classification: classification({
            varieties: ["opacus", "lacunosus", "duplicatus"],
        }),
        phase: "mixed",
        lifecycle: "mature",
        requirements: requirements("open-cell-organization"),
        seed: 22,
    }]);
    assert.equal(ordered.diagnostics.length, 0);
    assert.deepEqual(ordered.records.map((record) => record.blend),
        ["placement", "subtract", "optical"]);
});

test("texture packer preserves owner addressing, seed bits, and bounded record layout", () => {
    const packed = packCloudMorphologyModifiers(manifest, [
        {
            parent: parent(2),
            classification: classification({ genus: "cirrus", species: "fibratus",
                varieties: ["intortus"] }),
            phase: "ice", lifecycle: "mature", requirements: requirements(), seed: 0xfedcba98,
        },
        {
            parent: parent(5),
            classification: classification({ varieties: ["perlucidus"] }),
            phase: "mixed", lifecycle: "mature", requirements: requirements(), seed: 91,
        },
    ]);
    assert.equal(packed.width, CLOUD_MORPHOLOGY_TEXTURE_WIDTH);
    assert.equal(packed.bytesPerRow, CLOUD_MORPHOLOGY_BYTES_PER_ROW);
    assert.equal(packed.bytesPerRow % 256, 0);
    assert.equal(packed.data.byteLength, packed.bytesPerRow * packed.height);
    assert.equal(packed.data[0], 2);
    assert.equal(packed.data[1], CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS);
    assert.equal(packed.data[2], CLOUD_MORPHOLOGY_RECORD_TEXELS);
    assert.deepEqual(packed.ownerRanges[2], { ownerIndex: 2, offset: 0, count: 1, dropped: 0 });
    assert.deepEqual(packed.ownerRanges[5], { ownerIndex: 5, offset: 1, count: 1, dropped: 0 });
    assert.deepEqual(
        [...packed.data.slice((1 + 5) * 4, (1 + 5) * 4 + 4)],
        [1, 1, 0, 0],
    );
    const words = new Uint32Array(packed.data.buffer);
    const seedWord = (CLOUD_MORPHOLOGY_HEADER_TEXELS + 1) * 4 + 1;
    assert.equal(words[seedWord], packed.records[0].seed);
});

test("Ci fibratus packs immutable owner anatomy with bounded exact workload", () => {
    const topology = CLOUD_TOPOLOGY_EXEMPLARS["cirrus-fibratus"][1];
    const requests = Array.from({ length: 6 }, (_, ownerIndex) => ({
        parent: {
            ...parent(ownerIndex),
            halfExtentsKm: [1.4 + ownerIndex * 0.09, 0.4, 5.0 + ownerIndex * 0.2],
        },
        classification: classification({ genus: "cirrus", species: "fibratus" }),
        phase: "ice",
        lifecycle: "mature",
        requirements: requirements(),
        seed: 0x1729 + ownerIndex,
        logicalTopology: topology,
        deterministicSeeds: [
            0.11 + ownerIndex * 0.07,
            0.83 - ownerIndex * 0.04,
            0.27 + ownerIndex * 0.03,
            0.61,
        ],
    }));
    const packed = packCloudMorphologyModifiers(manifest, requests);
    assert.equal(packed.recordCount, 0,
        "plain fibratus must not fabricate generic modifier records");
    assert.equal(packed.fibratusDescriptorCount,
        packed.fibratusOwnerRanges.slice(0, 6).reduce(
            (sum, range) => sum + range.count, 0));
    assert.ok(packed.fibratusDescriptorCount >= 6 * 6);
    assert.ok(packed.fibratusDescriptorCount <= 6 * 8);
    assert.equal(packed.fibratusDescriptors.length,
        packed.fibratusDescriptorCount);
    for (const range of packed.fibratusOwnerRanges.slice(0, 6)) {
        assert.ok(range.count >= 6 && range.count <= 8);
        assert.equal(range.dropped, 0);
        const tableTexel = 1 + CLOUD_MORPHOLOGY_MAX_PARENT_OWNERS +
            range.ownerIndex;
        assert.deepEqual(
            [...packed.data.slice(tableTexel * 4, tableTexel * 4 + 3)],
            [range.offset, range.count, 0],
        );
        const members = packed.fibratusDescriptors.slice(
            range.offset, range.offset + range.count);
        assert.deepEqual(members.map(({ index }) => index),
            Array.from({ length: range.count }, (_, index) => index),
            "ascending union order is part of the density contract");
    }
    const usedTexels = CLOUD_MORPHOLOGY_HEADER_TEXELS +
        packed.recordCount * CLOUD_MORPHOLOGY_RECORD_TEXELS +
        packed.fibratusDescriptorCount *
            CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS;
    assert.ok(usedTexels <= CLOUD_MORPHOLOGY_HEADER_TEXELS +
        CLOUD_MORPHOLOGY_MAX_RECORDS * CLOUD_MORPHOLOGY_RECORD_TEXELS,
    "mixed payload must fit the renderer's exact allocation invariant");
    assert.deepEqual(
        compileCloudCirrusFibratusPackedDescriptors({
            topology,
            ownerIndex: 0,
            deterministicSeeds: requests[0].deterministicSeeds,
            ownerHalfExtentKm: requests[0].parent.halfExtentsKm,
        }),
        packed.fibratusDescriptors.slice(
            packed.fibratusOwnerRanges[0].offset,
            packed.fibratusOwnerRanges[0].offset +
                packed.fibratusOwnerRanges[0].count,
        ),
        "owner anatomy must be immutable and deterministic",
    );
});

test("packed Ci fibratus anatomy preserves randomized density, continuity, and energy", () => {
    const topology = CLOUD_TOPOLOGY_EXEMPLARS["cirrus-fibratus"][2];
    const common = {
        topology,
        ownerIndex: 3,
        deterministicSeeds: [0.31, 0.72, 0.19, 0.57],
        ownerHalfExtentKm: [1.6, 0.46, 5.8],
        macroDensity: 0.84,
        sdfVoxels: -0.23,
        requestedFilterRadiusKm: 0.045,
        rayStepLengthKm: 0.18,
        rayDirectionOwnerLocal: [0.18, 0.77, 0.61],
    };
    const packedDescriptors = compileCloudCirrusFibratusPackedDescriptors({
        topology,
        ownerIndex: common.ownerIndex,
        deterministicSeeds: common.deterministicSeeds,
        ownerHalfExtentKm: common.ownerHalfExtentKm,
    });
    assert.ok(packedDescriptors.length >= 6 && packedDescriptors.length <= 8);
    let state = 0x9137acdf;
    const random = () => {
        state = Math.imul(state ^ state >>> 15, 0x2c1b3c6d) >>> 0;
        state = Math.imul(state ^ state >>> 12, 0x297a2d39) >>> 0;
        return ((state ^ state >>> 15) >>> 0) / 0x1_0000_0000;
    };
    let baselineEnergy = 0;
    let packedEnergy = 0;
    let maximumError = 0;
    let baselineTransitions = 0;
    let packedTransitions = 0;
    let previousBaseline = false;
    let previousPacked = false;
    for (let sample = 0; sample < 512; sample += 1) {
        const canonical = [random(), random(), random()];
        const baseline = qualifyCloudCirrusFibratusSubvoxelDensityOptimized({
            ...common,
            canonical,
        }).density;
        const packed = qualifyCloudCirrusFibratusSubvoxelDensityOptimized({
            ...common,
            canonical,
            packedDescriptors,
        }).density;
        maximumError = Math.max(maximumError, Math.abs(baseline - packed));
        baselineEnergy += baseline;
        packedEnergy += packed;
        const baselineInside = baseline > 0.02;
        const packedInside = packed > 0.02;
        if (sample > 0) {
            baselineTransitions += Number(baselineInside !== previousBaseline);
            packedTransitions += Number(packedInside !== previousPacked);
        }
        previousBaseline = baselineInside;
        previousPacked = packedInside;
    }
    assert.ok(maximumError < 2e-5,
        `packed f32 anatomy diverged by ${maximumError}`);
    assert.ok(Math.abs(baselineEnergy - packedEnergy) < 5e-4,
        "descriptor quantization must preserve integrated condensate energy");
    assert.ok(Math.abs(baselineTransitions - packedTransitions) <= 1,
        "descriptor packing must not introduce support discontinuities");
});

test("owner headers transport logical exemplar construction as raw topology bits", () => {
    const logicalTopology = CLOUD_TOPOLOGY_EXEMPLARS[
        "altocumulus-stratiformis"
    ][2];
    const packed = packCloudMorphologyModifiers(manifest, [{
        parent: parent(4),
        logicalTopology,
        classification: classification({ varieties: ["perlucidus"] }),
        phase: "mixed",
        lifecycle: "mature",
        requirements: requirements(),
        seed: 0x12345678,
    }]);
    const words = new Uint32Array(packed.data.buffer);
    const topologyWord = words[(1 + 4) * 4 + 3];
    assert.equal(topologyWord, packCloudLogicalTopologyWord(logicalTopology));
    assert.equal(topologyWord & 3, logicalTopology.ordinal);
    assert.equal((topologyWord >>> 2) & 7,
        manifest.logicalTopologyConnectivityCodes[logicalTopology.connectivity]);
    assert.ok(((topologyWord >>> 9) & 63) >= 10,
        "macro element construction must survive owner-header packing");
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /fn cloud_morphology_owner_topology\(/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /result\.logical_topology = cloud_morphology_owner_topology\(parent_owner_index\)/);
});

test("Ci fibratus display reconstruction is finite, tapered, and topology driven", () => {
    const rendererContract =
        manifest.rendererContract.cirrusFibratusSubvoxelReconstruction;
    assert.deepEqual(
        rendererContract,
        GENERATED_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT,
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT)),
        GENERATED_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT,
    );
    assert.equal(
        rendererContract.maximumFibreCount,
        CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_MAX_FIBRES,
    );
    assert.deepEqual(rendererContract.terminalWidthRatio, [
        CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MINIMUM,
        CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MAXIMUM,
    ]);
    assert.deepEqual(rendererContract.terminalDensityRatio, [
        CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MINIMUM,
        CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MAXIMUM,
    ]);
    assert.ok(rendererContract.terminalWidthRatio[0] >= 0.25);
    assert.ok(rendererContract.terminalWidthRatio[1] <= 0.60);
    assert.ok(rendererContract.sourceCrossRadiusKm[1] <= 0.08);
    assert.ok(rendererContract.sourceVerticalRadiusKm[1] <= 0.06);

    const reconstruction = CLOUD_MORPHOLOGY_MODIFIERS_WGSL.match(
        /fn cloud_morphology_build_fibratus_descriptor[\s\S]*?fn cloud_morphology_curl_warp/,
    )?.[0] ?? "";
    assert.match(reconstruction, /species != 1 \|\| formation_mechanism != 3/);
    assert.match(reconstruction, /topology\.connectivity != 1u/);
    assert.match(reconstruction, /if \(sdf_voxels >= 0\.0\) \{ return 0\.0; \}/);
    assert.match(reconstruction,
        /topology\.macro_element_count \* 0\.45 \+ 3\.0/);
    assert.match(reconstruction, /topology\.branch_or_crest_count/);
    assert.match(reconstruction, /topology\.shear_coupling/);
    assert.match(reconstruction, /topology\.sedimentation_coupling/);
    assert.match(reconstruction, /let is_daughter = fibre_index >= primary_count/);
    assert.match(reconstruction, /let terminal_y_km = max/);
    assert.match(reconstruction, /let terminal_width_ratio = mix/);
    assert.match(reconstruction, /let terminal_density_ratio = mix/);
    assert.match(reconstruction, /let area_preservation = saturate/);
    assert.match(reconstruction, /let covariance_cross_vertical =/);
    assert.match(reconstruction, /let covariance_determinant = max/);
    assert.match(reconstruction, /let c2_derivative = 30\.0/);
    assert.match(reconstruction, /let tangent_cross_per_downwind =/);
    assert.match(reconstruction, /let swept_cross_km = half_step_km/);
    assert.match(reconstruction, /requested_filter_radius_km/);
    assert.match(reconstruction,
        /if \(macro_envelope <= 0\.0\) \{ return saturate\(residual_ice\); \}/);
    assert.match(reconstruction,
        /if \(amount <= -0\.025 \|\| amount >= 1\.025\) \{ continue; \}/);
    assert.match(reconstruction,
        /let maximum_covariance_cross =[\s\S]*?swept_cross_km \* swept_cross_km/);
    assert.match(reconstruction,
        /let maximum_covariance_vertical =[\s\S]*?swept_vertical_km \* swept_vertical_km/);
    assert.match(reconstruction,
        /delta_cross_km \* delta_cross_km >[\s\S]*?maximum_covariance_cross[\s\S]*?delta_vertical_km \* delta_vertical_km >[\s\S]*?maximum_covariance_vertical/);
    assert.doesNotMatch(reconstruction,
        /bow_x_reach_km|bow_y_reach_km|abs\(ray_direction_owner_local\.[xyz]\)/);
    assert.match(reconstruction, /let conservative_outer_radius = 1\.421/);
    assert.match(reconstruction, /let elliptical_distance_squared =/);
    assert.match(reconstruction,
        /if \(cross_section <= 0\.0\) \{ continue; \}/);
    assert.match(reconstruction, /let has_gap = is_daughter \|\| h8 < 0\.26/);
    assert.ok(
        reconstruction.indexOf("maximum_covariance_cross") <
            reconstruction.indexOf("let taper_amount = pow"),
        "the exact local-section cull must precede taper and ellipse work",
    );
    assert.ok(
        reconstruction.indexOf("if (cross_section <= 0.0) { continue; }") <
            reconstruction.indexOf("let density_taper = mix"),
        "empty ellipses must leave before density taper work",
    );
    assert.ok(
        reconstruction.indexOf("if (cross_section <= 0.0) { continue; }") <
            reconstruction.indexOf("let gap_centre = mix"),
        "empty ellipses must leave before sublimation-gap work",
    );
    assert.doesNotMatch(reconstruction,
        /\bp\[\d+\]|fwidth|textureSample|textureLoad|camera|screen-space-density/);
    assert.doesNotMatch(reconstruction, /sin\(|cos\(|atan/);
});

test("Ci fibratus camera footprint preserves continuous capture-scale fibres and energy", () => {
    const topology = CLOUD_TOPOLOGY_EXEMPLARS["cirrus-fibratus"][1];
    const ownerIndex = 0;
    const deterministicSeeds = [0.55, 0.95, 0.20, 0.66];
    const ownerHalfExtentKm = [1.4, 0.4, 5.0];
    const footprintAt = (distanceKm) =>
        cloudCirrusFibratusCameraPixelFootprintRadiusKm({
            distanceKm,
            horizontalFovRadians: 64 * Math.PI / 180,
            verticalFovRadians: 42 * Math.PI / 180,
            width: 480,
            height: 300,
        });
    const nearFootprint = footprintAt(16);
    const farFootprint = footprintAt(67);
    assert.ok(nearFootprint >= 0.018 && nearFootprint <= 0.022,
        `near capture footprint was ${nearFootprint} km`);
    assert.ok(farFootprint >= 0.078 && farFootprint <= 0.082,
        `far capture footprint was ${farFootprint} km`);
    assert.ok(farFootprint > nearFootprint * 4,
        "world footprint must follow perspective distance");

    const float = new Float32Array(1);
    const words = new Uint32Array(float.buffer);
    const floatBits = (value) => {
        float[0] = Math.fround(value);
        return words[0] >>> 0;
    };
    const hashCell = (x, y, z, seed) => {
        let value = seed >>> 0;
        value = (value ^ Math.imul(x, 0x9e3779b1)) >>> 0;
        value = (value ^ Math.imul(y, 0x85ebca77)) >>> 0;
        value = (value ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        value = Math.imul(value, 0x7feb352d) >>> 0;
        value = (value ^ value >>> 15) >>> 0;
        value = Math.imul(value, 0x846ca68b) >>> 0;
        value = (value ^ value >>> 16) >>> 0;
        return value / 0x1_0000_0000;
    };
    const ownerSeed = (
        floatBits(deterministicSeeds[0]) ^
        Math.imul(floatBits(deterministicSeeds[2]), 0x9e3779b1) ^
        Math.imul(ownerIndex, 0x85ebca77) ^
        Math.imul(topology.ordinal, 0xc2b2ae3d)
    ) >>> 0;
    const fract = (value) => value - Math.floor(value);
    const fibres = qualifyCloudCirrusFibratusSubvoxelFibres({
        topology,
        ownerIndex,
        deterministicSeeds,
        ownerHalfExtentKm,
    });
    let selected;
    let selectedHashes;
    for (const fibre of fibres.filter(({ daughter }) => !daughter)) {
        const h0 = hashCell(fibre.index, 0, topology.ordinal, ownerSeed);
        const h1 = hashCell(fibre.index, 1, topology.ordinal, ownerSeed);
        const h2 = hashCell(fibre.index, 2, topology.ordinal, ownerSeed);
        const h8 = fract(h2 * 0.671043606 + h1 * 0.463647609 + 0.887);
        if (h8 < 0.26) continue;
        selected = fibre;
        selectedHashes = {
            h4: fract(h1 * 0.618033989 + h2 * 0.414213562 + 0.271),
            h5: fract(h2 * 0.732050808 + h0 * 0.438447187 + 0.419),
        };
        break;
    }
    assert.ok(selected && selectedHashes,
        "qualification seed needs one primary without an authored gap");
    const rayDirectionOwnerLocal = [0, 0.82, 0.57];
    const pixelFilterRadiusKm = footprintAt(40);
    const continuitySamples = [];
    for (let sample = 0; sample < 96; sample += 1) {
        const t = 0.08 + sample / 95 * 0.78;
        const c2 = t ** 3 * (t * (t * 6 - 15) + 10);
        const bow = 4 * t * (1 - t);
        const centre = [
            selected.sourceKm[0] +
                (selected.terminalKm[0] - selected.sourceKm[0]) * c2 +
                (-0.085 + 0.17 * selectedHashes.h4) *
                    ownerHalfExtentKm[0] * bow,
            selected.sourceKm[1] +
                (selected.terminalKm[1] - selected.sourceKm[1]) * c2 +
                (-0.040 + 0.095 * selectedHashes.h5) *
                    ownerHalfExtentKm[1] * 2 * bow,
            selected.sourceKm[2] +
                (selected.terminalKm[2] - selected.sourceKm[2]) * t,
        ];
        // Each query centre uses a different sub-stratum offset, emulating the
        // progressive R2 jitter. The actual fibre remains inside the 240 m
        // segment even when the centre ray would have point-missed it.
        const offsetKm = (fract(sample * 0.754877666) - 0.5) * 0.22;
        const query = centre.map((value, component) => value +
            rayDirectionOwnerLocal[component] * offsetKm);
        const canonical = query.map((value, component) =>
            value / (ownerHalfExtentKm[component] * 2) + 0.5);
        continuitySamples.push(
            qualifyCloudCirrusFibratusSubvoxelDensityOptimized({
                topology,
                ownerIndex,
                deterministicSeeds,
                ownerHalfExtentKm,
                canonical,
                macroDensity: 0.86,
                sdfVoxels: -0.24,
                requestedFilterRadiusKm: pixelFilterRadiusKm,
                rayStepLengthKm: 0.24,
                rayDirectionOwnerLocal,
            }).density,
        );
    }
    assert.ok(Math.min(...continuitySamples) > 0.045,
        "an ungapped primary must not become temporal dotted/dashed support");
    const supportTransitions = continuitySamples.slice(1).reduce(
        (count, value, index) => count + Number(
            (value > 0.02) !== (continuitySamples[index] > 0.02)),
        0,
    );
    assert.equal(supportTransitions, 0,
        "capture-scale support must not acquire a periodic dash train");

    const common = {
        topology,
        ownerIndex,
        deterministicSeeds,
        ownerHalfExtentKm,
        macroDensity: 0.86,
        sdfVoxels: -0.24,
    };
    let intrinsicEnergy = 0;
    let filteredEnergy = 0;
    const verticalSamples = 64;
    const crossSamples = verticalSamples * 2;
    for (let y = 0; y < verticalSamples; y += 1) {
        for (let x = 0; x < crossSamples; x += 1) {
            const canonical = [
                (x + 0.5) / crossSamples,
                (y + 0.5) / verticalSamples,
                0.5,
            ];
            intrinsicEnergy +=
                qualifyCloudCirrusFibratusSubvoxelDensityOptimized({
                    ...common,
                    canonical,
                    requestedFilterRadiusKm: 0,
                }).density;
            filteredEnergy +=
                qualifyCloudCirrusFibratusSubvoxelDensityOptimized({
                    ...common,
                    canonical,
                    requestedFilterRadiusKm: pixelFilterRadiusKm,
                    rayStepLengthKm: 0.24,
                    rayDirectionOwnerLocal,
                }).density;
        }
    }
    const energyRatio = filteredEnergy / intrinsicEnergy;
    assert.ok(energyRatio >= 0.90 && energyRatio <= 1.04,
        `camera footprint changed integrated fibre energy by ${energyRatio}`);
});

test("Ci fibratus conservative misses preserve the reference density exactly within f32 tolerance", () => {
    const topologies = CLOUD_TOPOLOGY_EXEMPLARS["cirrus-fibratus"];
    const filterRadiiKm = [0, 0.003, 0.018, 0.09, 0.32];
    const materialStates = [
        { macroDensity: 0.001, sdfVoxels: -0.04 },
        { macroDensity: 0.025, sdfVoxels: -0.001 },
        { macroDensity: 0.18, sdfVoxels: -0.04 },
        { macroDensity: 0.86, sdfVoxels: -0.24 },
    ];
    const f32Tolerance = 2 ** -20;
    let state = 0x6d2b79f5;
    const random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 0x1_0000_0000;
    };
    const rejectionTotals = {
        longitudinal: 0,
        bounds: 0,
        ellipse: 0,
        zeroCrossSection: 0,
    };
    let comparisons = 0;
    for (const topology of topologies) {
        for (let variation = 0; variation < 5; variation += 1) {
            const seeds = [
                (variation * 0.137 + 0.11) % 1,
                (variation * 0.271 + 0.23) % 1,
                (variation * 0.419 + 0.37) % 1,
                (variation * 0.587 + 0.41) % 1,
            ];
            const ownerHalfExtentKm = [
                1.4 + variation * 0.31,
                0.28 + variation * 0.055,
                4.2 + variation * 0.73,
            ];
            const fibres = qualifyCloudCirrusFibratusSubvoxelFibres({
                topology,
                ownerIndex: variation + topology.ordinal * 17,
                deterministicSeeds: seeds,
                ownerHalfExtentKm,
            });
            const canonicalPoints = Array.from({ length: 28 }, () => [
                random(), random(), random(),
            ]);
            for (const fibre of fibres) {
                for (const point of [fibre.sourceKm, fibre.terminalKm]) {
                    canonicalPoints.push(point.map((value, component) =>
                        value / (ownerHalfExtentKm[component] * 2) + 0.5,
                    ));
                }
            }
            for (const requestedFilterRadiusKm of filterRadiiKm) {
                for (const material of materialStates) {
                    for (const canonical of canonicalPoints) {
                        const input = {
                            topology,
                            ownerIndex: variation + topology.ordinal * 17,
                            deterministicSeeds: seeds,
                            ownerHalfExtentKm,
                            canonical,
                            ...material,
                            requestedFilterRadiusKm,
                        };
                        const reference =
                            qualifyCloudCirrusFibratusSubvoxelDensityReference(
                                input,
                            );
                        const optimized =
                            qualifyCloudCirrusFibratusSubvoxelDensityOptimized(
                                input,
                            );
                        const tolerance = f32Tolerance * Math.max(
                            1, Math.abs(reference.density),
                        );
                        assert.ok(
                            Math.abs(reference.density - optimized.density) <=
                                tolerance,
                            `conservative miss changed density for ${topology.id} ` +
                                `seed ${variation}, filter ${requestedFilterRadiusKm}: ` +
                                `${reference.density} vs ${optimized.density}`,
                        );
                        if (material.macroDensity > 0.002) {
                            assert.equal(
                                optimized.contributingFibreCount,
                                reference.contributingFibreCount,
                                "a conservative rejection may not remove a " +
                                    `nonzero fibre (${topology.id}, seed ` +
                                    `${variation}, filter ` +
                                    `${requestedFilterRadiusKm}, point ` +
                                    `${canonical.join(",")})`,
                            );
                        }
                        rejectionTotals.longitudinal +=
                            optimized.longitudinalRejectCount;
                        rejectionTotals.bounds +=
                            optimized.boundingBoxRejectCount;
                        rejectionTotals.ellipse +=
                            optimized.squaredEllipseRejectCount;
                        rejectionTotals.zeroCrossSection +=
                            optimized.zeroCrossSectionRejectCount;
                        comparisons += 1;
                    }
                }
            }
        }
    }
    assert.ok(comparisons > 10_000);
    assert.ok(rejectionTotals.longitudinal > 0,
        "the exact longitudinal interval must reject sampled misses");
    assert.ok(rejectionTotals.bounds > 0,
        "the local projected-covariance bound must reject sampled misses");
    assert.ok(rejectionTotals.ellipse > 0,
        "the squared ellipse must reject local-bound survivors before sqrt");
    assert.ok(rejectionTotals.zeroCrossSection > 0,
        "the post-root zero cross-section guard must be exercised");
});

test("Ci fibratus fibre qualification preserves nonparallel fall and negative sky", () => {
    const topologies = CLOUD_TOPOLOGY_EXEMPLARS["cirrus-fibratus"];
    assert.equal(topologies.length, 3);
    const signatures = new Set();
    for (const topology of topologies) {
        for (let variation = 0; variation < 8; variation += 1) {
            const seeds = [
                (variation * 0.137 + 0.11) % 1,
                (variation * 0.271 + 0.23) % 1,
                (variation * 0.419 + 0.37) % 1,
                (variation * 0.587 + 0.41) % 1,
            ];
            const fibres = qualifyCloudCirrusFibratusSubvoxelFibres({
                topology,
                ownerIndex: variation + topology.ordinal * 11,
                deterministicSeeds: seeds,
                ownerHalfExtentKm: [2.0, 0.40, 6.0],
            });
            assert.ok(fibres.length >= 6 && fibres.length <= 8);
            const crosswindSlopes = [];
            const verticalSlopes = [];
            for (const fibre of fibres) {
                const dz = fibre.terminalKm[2] - fibre.sourceKm[2];
                const dx = fibre.terminalKm[0] - fibre.sourceKm[0];
                const drop = fibre.sourceKm[1] - fibre.terminalKm[1];
                assert.ok(dz > 1.5,
                    "a reconstructed fibre must retain a long finite trajectory");
                assert.ok(drop > 0.08,
                    "every fibratus trajectory must sediment instead of forming a horizontal comb");
                assert.ok(fibre.terminalWidthRatio >= 0.30 &&
                    fibre.terminalWidthRatio <= 0.58);
                assert.ok(fibre.terminalDensityRatio >= 0.34 &&
                    fibre.terminalDensityRatio <= 0.58);
                const aspect = Math.hypot(dx, drop, dz) /
                    (2 * Math.max(...fibre.sourceRadiiKm));
                assert.ok(aspect >= 8,
                    "individual fibres must remain filamentary at physical scale");
                crosswindSlopes.push(dx / dz);
                verticalSlopes.push(drop / dz);
                if (fibre.daughter) {
                    const parent = fibres.find((candidate) =>
                        !candidate.daughter &&
                        candidate.primaryLane === fibre.primaryLane);
                    assert.ok(parent);
                    assert.ok(Math.abs(
                        fibre.sourceKm[0] - parent.sourceKm[0],
                    ) < 0.50,
                    "a daughter must inherit one primary moisture lane");
                }
            }
            assert.ok(
                Math.max(...crosswindSlopes) -
                    Math.min(...crosswindSlopes) > 0.018,
                "differential shear must keep internal fibres nonparallel",
            );
            assert.ok(
                Math.max(...verticalSlopes) -
                    Math.min(...verticalSlopes) > 0.004,
                "particle fall-speed variation must survive reconstruction",
            );
            const primaries = fibres.filter(({ daughter }) => !daughter)
                .sort((left, right) => left.sourceKm[0] - right.sourceKm[0]);
            for (let index = 1; index < primaries.length; index += 1) {
                const left = primaries[index - 1];
                const right = primaries[index];
                const gap = right.sourceKm[0] - left.sourceKm[0] -
                    left.sourceRadiiKm[0] - right.sourceRadiiKm[0];
                assert.ok(gap > 0.08,
                    "primary source fibres must preserve real negative sky");
            }
            signatures.add(fibres.map((fibre) => [
                ...fibre.sourceKm, ...fibre.terminalKm,
            ].map((value) => value.toFixed(3)).join(",")).join("|"));
        }
    }
    assert.equal(signatures.size, topologies.length * 8,
        "topology ordinal and owner seed must not clone one brush silhouette");
});

test("upper-atmosphere records retain physical wave scales and distinct materials", () => {
    const psc = compileCloudMorphologyRecords(manifest, [{
        parent: parent(6),
        upperAtmosphericCloud: "polar-stratospheric",
        phase: "mixed",
        lifecycle: "mature",
        requirements: requirements("polar-winter-vortex", "stratospheric-cold-pool"),
        environment: { absoluteLatitudeDegrees: 72, season: "winter", altitudeKm: 22 },
        seed: 100,
    }]);
    const nacreous = compileCloudMorphologyRecords(manifest, [{
        parent: parent(7),
        upperAtmosphericCloud: "nacreous",
        phase: "ice",
        lifecycle: "mature",
        requirements: requirements("polar-winter-vortex", "below-ice-frost-point"),
        environment: { temperatureKelvin: 185, absoluteLatitudeDegrees: 72,
            season: "winter", altitudeKm: 22 },
        seed: 101,
    }]);
    const noctilucent = compileCloudMorphologyRecords(manifest, [{
        parent: parent(8),
        upperAtmosphericCloud: "noctilucent",
        phase: "ice",
        lifecycle: "mature",
        requirements: requirements("polar-summer-mesopause", "sunlit-upper-layer"),
        environment: { absoluteLatitudeDegrees: 62, season: "summer", altitudeKm: 82,
            solarDepressionDegrees: 10 },
        seed: 102,
    }]);
    for (const result of [psc, nacreous, noctilucent]) {
        assert.equal(result.diagnostics.length, 0);
        assert.equal(result.records.length, 1);
        assert.ok(result.records[0].shape0[0] > 0, "layer thickness must be physical");
        assert.ok(result.records[0].shape0[2] >= 4_000, "wave scale must remain in meters");
    }
    assert.equal(psc.records[0].shape1[3],
        manifest.materialProfileCodes["psc-nitric-acid-water"]);
    assert.equal(nacreous.records[0].shape1[3],
        manifest.materialProfileCodes["psc-ice-nacreous-10um"]);
    assert.equal(noctilucent.records[0].shape1[3],
        manifest.materialProfileCodes["pmc-water-ice-60-100nm"]);
    assert.notEqual(psc.records[0].shape1[3], nacreous.records[0].shape1[3]);
    assert.notEqual(nacreous.records[0].shape1[3], noctilucent.records[0].shape1[3]);
});

test("bound inflation includes additive support but ignores pure subtraction and optical remaps", () => {
    const base = parent(0);
    const attached = packCloudMorphologyModifiers(manifest, [{
        parent: base,
        classification: classification({ genus: "cumulonimbus", species: "calvus",
            accessoryClouds: ["pileus"] }),
        phase: "mixed", lifecycle: "growing",
        requirements: requirements("positive-convective-ascent"), seed: 8,
    }]);
    assert.ok(attached.inflatedBounds.get(0).maximumKm[1] > 8);

    const subtractive = packCloudMorphologyModifiers(manifest, [{
        parent: base,
        classification: classification({ supplementaryFeatures: ["cavum"] }),
        phase: "mixed", lifecycle: "mature",
        requirements: requirements("supercooled-liquid-layer"),
        environment: { temperatureKelvin: 263 }, seed: 4,
    }]);
    assert.equal(subtractive.inflatedBounds.has(0), false,
        "subtraction cannot extend the owner's conservative support");
});

test("axis-aligned and rotated bounds strictly contain the exact 1.04 envelope shell", () => {
    const square = morphologyRecord({
        centerKm: [11, -2, 7],
        halfExtentsKm: [2, 0.5, 3],
    });
    const inverseRootTwo = 1 / Math.sqrt(2);
    const rotated = morphologyRecord({
        centerKm: [-4, 9, 13],
        axes: [
            [inverseRootTwo, inverseRootTwo, 0],
            [-0.5, 0.5, inverseRootTwo],
            [0.5, -0.5, inverseRootTwo],
        ],
        halfExtentsKm: [2, 0.5, 3],
    });
    for (const [label, record] of [["axis-aligned", square], ["rotated", rotated]]) {
        const bounds = inflateCloudMorphologyBounds([parent(0)], [record]).get(0);
        assert.ok(bounds, `${label} support must create bounds`);
        for (let component = 0; component < 3; component += 1) {
            const radius = expectedRecordRadius(record, component);
            assertNear(bounds.minimumKm[component],
                record.centerKm[component] - radius,
                `${label} minimum ${component}`);
            assertNear(bounds.maximumKm[component],
                record.centerKm[component] + radius,
                `${label} maximum ${component}`);
        }
        assertFiniteEnvelopeShellContained(record, bounds, label);
    }
});

test("every support-changing operator expands bounds while subtract and optical never do", () => {
    const supportOperators = [
        ["creator", "pileus", 18, "add-cap-shell", "smooth-union", 1],
        ["warp", "intortus", 1, "warp-curl", "warp", 3],
        ["clone", "duplicatus", 6, "clone-layer", "placement", 4],
        ["reuse", "incus", 17, "reuse-base-macro", "reuse", 6],
        ["inflow", "flumen", 21, "add-inflow-band", "placement", 4],
    ];
    const owners = supportOperators.map((_, ownerIndex) => parent(ownerIndex));
    const records = supportOperators.map(([
        label, modifierId, operatorCode, operatorName, blend, blendCode,
    ], ownerIndex) => morphologyRecord({
        ownerIndex,
        modifierId,
        operatorCode,
        operatorName,
        blend,
        blendCode,
        centerKm: [ownerIndex * 7, ownerIndex + 2, -ownerIndex * 3],
        halfExtentsKm: [1 + ownerIndex * 0.1, 0.4, 1.5],
    }));
    const boundsByOwner = inflateCloudMorphologyBounds(owners, records);
    assert.equal(boundsByOwner.size, supportOperators.length);
    records.forEach((record, index) => {
        const label = supportOperators[index][0];
        const bounds = boundsByOwner.get(index);
        assert.ok(bounds, `${label} must reserve support`);
        assertFiniteEnvelopeShellContained(record, bounds, label);
    });

    const included = morphologyRecord({ ownerIndex: 0, centerKm: [0, 3, 0] });
    const subtract = morphologyRecord({
        ownerIndex: 0,
        modifierId: "cavum",
        operatorCode: 12,
        operatorName: "subtract-cavum",
        blend: "subtract",
        blendCode: 2,
        centerKm: [1_000, 1_000, 1_000],
        halfExtentsKm: [100, 100, 100],
    });
    const optical = morphologyRecord({
        ownerIndex: 0,
        modifierId: "translucidus",
        operatorCode: 7,
        operatorName: "remap-extinction",
        blend: "optical",
        blendCode: 5,
        centerKm: [-1_000, -1_000, -1_000],
        halfExtentsKm: [100, 100, 100],
    });
    const includedOnly = inflateCloudMorphologyBounds([parent(0)], [included]);
    const mixed = inflateCloudMorphologyBounds(
        [parent(0)], [included, subtract, optical]);
    assert.deepEqual(mixed, includedOnly,
        "far subtractive and optical records cannot enlarge an existing union");
    assert.equal(inflateCloudMorphologyBounds(
        [parent(0)], [subtract, optical]).size, 0,
    "subtractive and optical records cannot create support on their own");
});

test("WGSL contract uses the approved remaining texture slot and exact-address helpers", () => {
    assert.equal(CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH,
        CLOUD_MORPHOLOGY_CPU_FINITE_ENVELOPE_REACH,
        "CPU allocation and WGSL evaluation must share one finite reach");
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /@group\(0\) @binding\(30\)[\s\S]*texture_2d<f32>/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL, /textureLoad\(/);
    assert.doesNotMatch(CLOUD_MORPHOLOGY_MODIFIERS_WGSL, /sampler/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /fn cloud_morphology_owner_range/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /bitcast<u32>\(record\.identity\.y\)/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /placement -> warp -> subtract -> smooth-union -> reuse -> optical/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        new RegExp(`smoothstep\\(0\\.82,\\s*${CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH}`));
});

test("point-wise light support rejects only proven finite-envelope clear space", () => {
    assert.deepEqual(
        CLOUD_MORPHOLOGY_EXISTING_SUPPORT_ONLY_OPERATOR_CODES,
        [4, 5, 7, 8, 12],
    );
    for (let operatorCode = 1; operatorCode <= 22; operatorCode += 1) {
        assert.equal(
            cloudMorphologyOperationMayChangeSupport(operatorCode),
            ![4, 5, 7, 8, 12].includes(operatorCode),
            `operator ${operatorCode} support classification`,
        );
    }
    assert.equal(cloudMorphologyOperationMayChangeSupport(999), true,
        "unknown future operators must fail closed");

    const creator = morphologyRecord({
        operatorCode: 9,
        operatorName: "add-udder-lobes",
        centerKm: [3, 4, 5],
        axes: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
        halfExtentsKm: [2, 1, 4],
    });
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        creator, [3, 4, 5]), true);
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        creator, [3, 4, 5 + 2 * (CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH - 1e-6)]),
    true, "rotated point just inside the exact envelope stays exact");
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        creator, [3, 4, 5 + 2 * CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH]),
    false, "the exact smoothstep endpoint has zero modifier influence");
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        { ...creator, operatorCode: 12 }, [3, 4, 5]), false,
    "subtraction cannot create support even inside its envelope");
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        { ...creator, operatorCode: 999 }, [3, 4, 5]), true,
    "unknown operation inside its declared finite envelope stays exact");
    assert.equal(cloudMorphologyRecordMayChangeSupportAt(
        { ...creator, intensity: 0 }, [3, 4, 5]), false,
    "zero-strength records cannot affect support");
});

test("all 22 WGSL operators have reference-locked physical output semantics", () => {
    const baseRecord = {
        modifierId: "intortus",
        parentOwnerIndex: 0,
        operatorName: "reference",
        blend: "smooth-union",
        blendCode: 1,
        anchorCode: 1,
        flags: 0,
        seed: 123456789,
        intensity: 1,
        lifecycle: 0.45,
        centerKm: [0, 0, 0],
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        halfExtentsKm: [1, 1, 1],
        shape0: [0.3, 0.3, 0.2, 0.3],
        shape1: [0.2, 0.2, 0.2, 2],
    };
    const fixtures = [
        [1, [0, 0, 0.8], "base-x", 0.019760],
        [2, [-0.2, -0.1, -0.8], "add", 1],
        [3, [0.5, -0.8, 0.3], "base-y", -1.266539],
        [4, [-0.8, -0.8, -0.8], "coverage", 0],
        [5, [-0.8, -0.2, -0.8], "subtract", 1],
        [6, [-0.8, -0.8, -0.8], "placement", 0.9],
        [7, [-0.8, -0.8, -0.8], "optical", 0.3],
        [8, [-0.8, -0.8, -0.5], "coverage", 0.224],
        [9, [-0.8, -0.3, -0.8], "add", 1],
        [10, [0.2, -0.1, -0.5], "add", 0.999865],
        [11, [0.7, -0.8, 0], "base-y", -1.051323],
        [12, [-0.7, -0.2, 0.3], "subtract", 1],
        [13, [-0.8, -0.1, -0.5], "add", 0.855940],
        [14, [-0.4, -0.4, -0.1], "add", 0.3],
        [15, [-0.7, -0.7, 0.1], "add", 0.903762],
        [16, [-0.8, -0.2, -0.1], "add", 1],
        [17, [-0.8, -0.8, -0.8], "reuse", 1],
        [18, [-0.7, -0.2, -0.1], "add", 1],
        [19, [-0.7, -0.4, -0.7], "add", 1],
        [20, [-0.8, -0.4, 0.5], "add", 1],
        [21, [-0.8, -0.2, 0.1], "placement", 1],
        [22, [-0.8, -0.1, -0.8], "material", 0.763931],
    ];
    const values = (evaluation, point) => ({
        "base-x": evaluation.basePositionKm[0],
        "base-y": evaluation.basePositionKm[1],
        coverage: evaluation.baseCoverage,
        placement: evaluation.placementWeight,
        add: evaluation.additiveDensity,
        subtract: evaluation.subtractiveDensity,
        optical: evaluation.targetOpticalDepth,
        reuse: evaluation.reuseWeight,
        material: evaluation.materialWeight,
        unchanged: point,
    });
    for (const [operatorCode, point, channel, expected] of fixtures) {
        let record = { ...baseRecord, operatorCode };
        if (operatorCode === 17) record = { ...record, shape0: [6, 1, 1, 1] };
        if (operatorCode === 22) record = { ...record,
            halfExtentsKm: [20, 0.5, 20],
            shape0: [500, 100, 20_000, 0.2], shape1: [0.3, 0.1, 0.2, 3] };
        const evaluation = createCloudMorphologyReferenceEvaluation(point);
        applyCloudMorphologyRecordReference(evaluation, record, point);
        assert.ok(Math.abs(values(evaluation, point)[channel] - expected) <= 1e-5,
            `operator ${operatorCode} ${channel} drifted`);
        if (operatorCode === 17) assert.equal(evaluation.reuseMacroCode, 6);
        if (operatorCode === 22) assert.equal(evaluation.materialProfileCode, 3);
        assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
            new RegExp(`case CLOUD_MORPHOLOGY_OP_[A-Z_]+: \\{`, "g"));

        const outside = [3, 3, 3];
        const outsideEvaluation = createCloudMorphologyReferenceEvaluation(outside);
        applyCloudMorphologyRecordReference(outsideEvaluation, record, outside);
        assert.deepEqual(outsideEvaluation, createCloudMorphologyReferenceEvaluation(outside),
            `operator ${operatorCode} escaped its finite support`);
    }
    assert.equal((CLOUD_MORPHOLOGY_MODIFIERS_WGSL.match(
        /case CLOUD_MORPHOLOGY_OP_[A-Z_]+:/g) ?? []).length, 22);
    for (const field of [
        "base_position_km", "placement_position_km", "base_coverage",
        "placement_weight", "additive_density", "subtractive_density",
        "reuse_macro_code", "target_optical_depth", "material_profile_code",
        "optical_weight",
    ]) assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL, new RegExp(field));
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /fn cloud_morphology_evaluate_owner[\s\S]*local_index < 8u/);
});

test("ordered warps compose across both base and placed parent samples", () => {
    const point = [0.24, -0.31, 0.28];
    const baseRecord = {
        modifierId: "undulatus",
        parentOwnerIndex: 0,
        operatorName: "reference",
        blend: "warp",
        blendCode: 3,
        anchorCode: 1,
        flags: 0,
        seed: 9142,
        intensity: 1,
        lifecycle: 0.45,
        centerKm: [0, 0, 0],
        axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        halfExtentsKm: [1, 1, 1],
        shape0: [0.22, 0.18, 0.11, 0.16],
        shape1: [0.12, 0, 0, 0],
    };
    const clone = { ...baseRecord, operatorCode: 6, operatorName: "clone-layer",
        blend: "placement", blendCode: 4,
        shape0: [0.42, 0.16, -0.08, 5], shape1: [0.12, 0, 0, 0] };
    const wave = { ...baseRecord, operatorCode: 3, operatorName: "warp-wave" };
    const underside = { ...baseRecord, operatorCode: 11,
        operatorName: "displace-underside", seed: 2718,
        shape0: [4, 0.38, 0.19, 0.12], shape1: [0.5, 0, 0, 0] };
    const evaluation = createCloudMorphologyReferenceEvaluation(point);
    applyCloudMorphologyRecordReference(evaluation, clone, point);
    const placedBeforeWarp = [...evaluation.placementPositionKm];
    applyCloudMorphologyRecordReference(evaluation, wave, point);
    const baseAfterFirstWarp = [...evaluation.basePositionKm];
    const placedAfterFirstWarp = [...evaluation.placementPositionKm];
    applyCloudMorphologyRecordReference(evaluation, underside, point);
    assert.notDeepEqual(placedAfterFirstWarp, placedBeforeWarp,
        "warp must deform a duplicated layer sample too");
    assert.notDeepEqual(evaluation.basePositionKm, baseAfterFirstWarp,
        "later warp must compose instead of replacing the earlier source coordinate");
    assert.notDeepEqual(evaluation.placementPositionKm, placedAfterFirstWarp,
        "later warp must also compose on the placed coordinate");
    assert.equal(evaluation.placementWeight, 0.94);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /cloud_morphology_wave_warp\(placement_local/);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /cloud_morphology_underside_warp\(placement_local/);
});

test("density composition unions carriers before subtracting real clear space", () => {
    const evaluation = createCloudMorphologyReferenceEvaluation([0, 0, 0]);
    evaluation.baseCoverage = 0.8;
    evaluation.placementWeight = 0.5;
    evaluation.additiveDensity = 0.25;
    evaluation.reuseWeight = 0.4;
    evaluation.subtractiveDensity = 0.3;
    const density = composeCloudMorphologyDensityReference(
        evaluation, 0.6, 0.4, 0.5);
    // union = 1 - (1-.48)(1-.2)(1-.25)(1-.2) = .7504; subtraction = .7
    assert.ok(Math.abs(density - 0.52528) < 1e-8);
    evaluation.subtractiveDensity = 1;
    assert.equal(composeCloudMorphologyDensityReference(evaluation, 1, 1, 1), 0);
    assert.match(CLOUD_MORPHOLOGY_MODIFIERS_WGSL,
        /fn cloud_morphology_compose_density/);
});

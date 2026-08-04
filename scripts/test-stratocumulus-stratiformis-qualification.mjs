import assert from "node:assert/strict";
import test from "node:test";
import {
    analyzeStratocumulusStratiformisQualification,
    buildStratocumulusNaturalNeighborGraph,
    qualifyStratocumulusStratiformis,
} from "./lib/stratocumulus-stratiformis-qualification.mjs";
import {
    createStratocumulusStratiformisSurfaceModel,
    createStratocumulusStratiformisTopology,
    evaluateCloudCirculationSurface,
} from
    "./lib/cloud-volume-atlas.mjs";

const irregularCells = Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const centerX = column * 1.22 +
        Math.sin(index * 2.173 + row * 0.41) * 0.24;
    const centerY = row * 1.16 +
        Math.cos(index * 1.719 + column * 0.37) * 0.27;
    const baseHeight = 0.87 +
        Math.sin(index * 0.773 + row * 0.31) * 0.055;
    const thickness = 0.47 +
        (0.5 + 0.5 * Math.sin(index * 1.337 + column * 0.53)) * 0.18;
    return {
        centerX,
        centerY,
        baseHeight,
        topHeight: baseHeight + thickness,
    };
});

const irregularChannels = [
    [0.18, 1.6, 0.08], [0.27, 2.8, 0.42], [0.21, 2.2, 0.79],
    [0.36, 3.4, 1.14], [0.24, 1.9, 1.51], [0.31, 2.5, 1.92],
    [0.16, 1.3, 2.36], [0.29, 3.1, 2.77], [0.42, 2.0, 3.02],
].map(([width, length, orientationRadians]) => ({
    width, length, orientationRadians,
}));

const credibleObservation = () => ({
    cells: irregularCells.map((cell) => ({ ...cell })),
    clearChannels: irregularChannels.map((channel) => ({ ...channel })),
    multiscale: {
        1: { resolvedCellCount: 25, condensateMass: 100 },
        2: { resolvedCellCount: 22, condensateMass: 93 },
        4: { resolvedCellCount: 14, condensateMass: 78 },
    },
    surfaceReconstruction: {
        cellSurfaceCount: 25,
        circulationRibbonCount: 42,
        coldPoolCavityCount: 15,
        hierarchyLevelCount: 3,
        legacyEllipsoidCount: 0,
        legacyCapsuleCount: 0,
        minimumInteriorClearance: 0.02,
        maximumUndersideAmplitude: 0.0015,
    },
});

test("irregular resolved cell field satisfies the explicit stratiformis contract", () => {
    const qualification = qualifyStratocumulusStratiformis(credibleObservation());
    assert.equal(qualification.valid, true, qualification.violations.join(", "));
    assert.equal(qualification.metrics.resolvedCellCount, 25);
    assert.ok(qualification.metrics.verticalReliefToMedianThickness > 0.12);
    assert.ok(qualification.metrics.naturalNeighborGraph.cycleRank > 0);
    assert.ok(qualification.metrics.naturalNeighborGraph.cycleNodeFraction >= 0.5);
    assert.ok(qualification.metrics.clearChannels.orientationEntropy > 0.48);
});

test("production topology stays cellular, cyclic, irregular, and reconstructible", () => {
    for (const seed of [0x6e756269, 1, 0x12345678, 0xffffffff]) {
        const topology = createStratocumulusStratiformisTopology({ seed });
        const qualification = qualifyStratocumulusStratiformis(
            topology.qualificationObservation,
        );
        assert.equal(
            qualification.valid,
            true,
            `seed ${seed}: ${qualification.violations.join(", ")}`,
        );
        assert.ok(topology.cells.length >= 24);
        assert.ok(topology.domainCount >= 4);
        assert.ok(topology.edges.length > topology.cells.length - 1,
            "cellular circulation needs loops beyond a spanning tree");
        assert.ok(topology.cycleRank >= Math.ceil(topology.cells.length * 0.14));
        assert.ok(topology.materialEdges.length > topology.cells.length - 1);
        assert.ok(topology.materialCycleRank >=
            Math.ceil(topology.cells.length * 0.14));
        assert.ok(topology.coldPoolChannels.length >=
            Math.ceil(topology.clearChannels.length * 0.24));
        assert.ok(topology.cells.every((cell) =>
            cell.interiorClearance >= 0.004));
        assert.ok(topology.cells.every((cell) =>
            cell.planModes.length === 3 && cell.crownModes.length === 3));
        assert.equal(
            topology.qualificationObservation.surfaceReconstruction
                .legacyEllipsoidCount,
            0,
        );
        assert.equal(
            topology.qualificationObservation.surfaceReconstruction
                .legacyCapsuleCount,
            0,
        );
        assert.ok(qualification.metrics.scale2CellCountRetention >= 0.72);
        assert.ok(qualification.metrics.scale4CellCountRetention >= 0.46);
    }
});

test("production anatomy is entirely finite C2 cell and wall surfaces", () => {
    const source = createStratocumulusStratiformisSurfaceModel();
    const cells = source.model.primitives.filter((primitive) =>
        primitive.kind === "circulation-cell-surface");
    const ribbons = source.model.primitives.filter((primitive) =>
        primitive.kind === "circulation-ribbon-surface");
    assert.equal(cells.length, source.model.stratiformisResolvedCellCount);
    assert.equal(ribbons.length, source.model.stratiformisMaterialEdgeCount);
    assert.equal(source.model.primitives.filter((primitive) =>
        primitive.kind === "ellipsoid" || primitive.kind === "capsule").length, 0);
    assert.ok(source.model.cavities.every((primitive) =>
        primitive.kind === "circulation-ribbon-surface" &&
        primitive.role === "foundation-sc-cold-pool-clear-channel"));

    const cell = cells[0];
    const centerHeight = (cell.baseHeight + cell.topHeight) * 0.5;
    assert.ok(evaluateCloudCirculationSurface(cell, [
        cell.center[0], centerHeight, cell.center[1],
    ]) > 0);
    assert.ok(evaluateCloudCirculationSurface(cell, [
        cell.center[0], cell.baseHeight - 0.01, cell.center[1],
    ]) < 0);
    const ribbon = ribbons[0];
    assert.ok(evaluateCloudCirculationSurface(
        ribbon,
        ribbon.samples[Math.floor(ribbon.samples.length * 0.5)].point,
    ) > 0);
});

test("Gabriel natural-neighbor topology rejects a branch/MST silhouette", () => {
    const branch = [
        [0, 0], [0.9, 0], [2.1, 0], [3.0, 0], [4.4, 0], [5.2, 0],
        [6.5, 0],
    ].map(([centerX, centerY], index) => ({
        centerX, centerY, baseHeight: 0.9, topHeight: 1.4 + index * 0.01,
    }));
    const graph = buildStratocumulusNaturalNeighborGraph(branch);
    assert.equal(graph.cycleRank, 0);
    assert.equal(graph.cycleNodeFraction, 0);

    const input = credibleObservation();
    input.cells = branch;
    input.multiscale[1].resolvedCellCount = branch.length;
    input.multiscale[2].resolvedCellCount = 20;
    input.multiscale[4].resolvedCellCount = 12;
    const qualification = qualifyStratocumulusStratiformis(input);
    assert.equal(qualification.valid, false);
    assert.ok(qualification.violations.includes(
        "natural-neighbor-graph-is-a-tree-skeleton"));
});

test("uniform slab geometry and ruler-straight channel distribution remain visible gaps", () => {
    const input = credibleObservation();
    input.cells = input.cells.map((cell) => ({
        ...cell, baseHeight: 0.9, topHeight: 1.4,
    }));
    input.clearChannels = Array.from({ length: 25 }, (_, index) => ({
        width: 0.25, length: 2.0, orientationRadians: index % 2 * Math.PI * 0.5,
    }));
    const qualification = qualifyStratocumulusStratiformis(input);
    assert.equal(qualification.valid, false);
    assert.ok(qualification.violations.includes(
        "deck-is-an-unrelieved-horizontal-slab"));
    assert.ok(qualification.violations.includes(
        "cell-thickness-is-artificially-uniform"));
    assert.ok(qualification.violations.includes(
        "clear-channels-are-too-regular-or-grid-like"));
});

test("scale-2 and scale-4 retention are independent acceptance gates", () => {
    const scale2Loss = credibleObservation();
    scale2Loss.multiscale[2] = { resolvedCellCount: 17, condensateMass: 84 };
    let qualification = qualifyStratocumulusStratiformis(scale2Loss);
    assert.equal(qualification.valid, false);
    assert.ok(qualification.violations.includes(
        "scale-2-reconstruction-loses-cell-structure"));
    assert.ok(!qualification.violations.includes(
        "scale-4-reconstruction-loses-cell-structure"));

    const scale4Loss = credibleObservation();
    scale4Loss.multiscale[4] = { resolvedCellCount: 11, condensateMass: 64 };
    qualification = qualifyStratocumulusStratiformis(scale4Loss);
    assert.equal(qualification.valid, false);
    assert.ok(!qualification.violations.includes(
        "scale-2-reconstruction-loses-cell-structure"));
    assert.ok(qualification.violations.includes(
        "scale-4-reconstruction-loses-cell-structure"));
});

test("legacy oval/capsule anatomy and mask-like channel carving are rejected", () => {
    const legacy = credibleObservation();
    legacy.surfaceReconstruction.cellSurfaceCount = 20;
    legacy.surfaceReconstruction.circulationRibbonCount = 12;
    legacy.surfaceReconstruction.coldPoolCavityCount = 4;
    legacy.surfaceReconstruction.hierarchyLevelCount = 1;
    legacy.surfaceReconstruction.legacyEllipsoidCount = 50;
    legacy.surfaceReconstruction.legacyCapsuleCount = 24;
    legacy.surfaceReconstruction.minimumInteriorClearance = 0.001;
    legacy.surfaceReconstruction.maximumUndersideAmplitude = 0.012;
    const qualification = qualifyStratocumulusStratiformis(legacy);
    assert.equal(qualification.valid, false);
    assert.ok(qualification.violations.includes(
        "circulation-surface-reconstruction-is-incomplete"));
    assert.ok(qualification.violations.includes(
        "topology-derived-clearance-is-not-resolved"));
    assert.ok(qualification.violations.includes(
        "legacy-oval-or-warped-underside-anatomy-remains"));
});

test("analysis rejects inconsistent or nonphysical qualification observations", () => {
    const inconsistent = credibleObservation();
    inconsistent.multiscale[1].resolvedCellCount = 24;
    assert.throws(
        () => analyzeStratocumulusStratiformisQualification(inconsistent),
        /scale-1 resolvedCellCount must equal cells\.length/,
    );
    const impossible = credibleObservation();
    impossible.cells[0].topHeight = impossible.cells[0].baseHeight;
    assert.throws(
        () => analyzeStratocumulusStratiformisQualification(impossible),
        /topHeight must exceed baseHeight/,
    );
});

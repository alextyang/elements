import assert from "node:assert/strict";
import test from "node:test";
import {
    CLOUD_MACRO_ATLAS_SEED,
    createUpperMiddleCellularTopology,
    evaluateCloudSweptC2Support,
} from "./lib/cloud-volume-atlas.mjs";

const TARGETS = Object.freeze([
    "cc-stratiformis",
    "cc-stratiformis-dispersive",
    "cc-castellanus",
    "cc-floccus",
    "ac-stratiformis",
    "ac-castellanus",
    "ac-floccus",
]);

const topology = (volumeId, seed = CLOUD_MACRO_ATLAS_SEED) =>
    createUpperMiddleCellularTopology({ volumeId, seed });

test("Cc/Ac cellular source geometry uses only source-connected C2 sweeps", () => {
    for (const volumeId of TARGETS) {
        const model = topology(volumeId);
        assert.ok(
            model.primitives.length >= Math.ceil(model.groupCount * 1.5),
            `${volumeId} lost its nested source-connected anatomy`,
        );
        assert.ok(model.primitives.every((primitive) =>
            primitive.kind === "swept-c2"),
        `${volumeId} retained terminal ellipsoid/capsule grammar`);
        assert.ok(model.primitives.every((primitive) =>
            primitive.supportKind === "uniform-cubic-bspline-radius-sweep"),
        `${volumeId} has a non-C2 source support`);
        assert.ok(model.primitives.every((primitive) =>
            primitive.sourceConnected === true),
        `${volumeId} has a detached source support`);
        assert.equal(model.cellularTopology.terminalEllipsoidCount, 0, volumeId);
        assert.equal(model.cellularTopology.terminalCapsuleCount, 0, volumeId);
        assert.equal(
            model.cellularTopology.sourceConnectedSweepCount,
            model.primitives.length,
            volumeId,
        );
        assert.ok(model.cellularTopology.maximumHierarchyLevel >= 2, volumeId);
        assert.ok(model.cellularTopology.meanCenterlineExcessCurvature > 0.001,
            `${volumeId} centerlines collapsed to straight rails`);
        for (const primitive of model.primitives) {
            assert.ok(primitive.samples.length >= 6, volumeId);
            for (const sample of [primitive.samples[0], primitive.samples.at(-1)]) {
                assert.ok(Number.isFinite(evaluateCloudSweptC2Support(
                    primitive,
                    sample.point,
                )));
                assert.ok(evaluateCloudSweptC2Support(
                    primitive,
                    sample.point,
                ) > 0, `${volumeId}/${primitive.role} lost endpoint support`);
            }
        }
    }
});

test("stratiformis retains aperiodic domains, dry slots, and multiscale peaks", () => {
    for (const volumeId of [
        "cc-stratiformis",
        "cc-stratiformis-dispersive",
        "ac-stratiformis",
    ]) {
        for (const seedOffset of [0, 7919, 104729]) {
            const model = topology(volumeId, CLOUD_MACRO_ATLAS_SEED + seedOffset);
            const metrics = model.cellularTopology;
            assert.ok(metrics.domainCount >= 4, volumeId);
            assert.ok(metrics.naturalNeighborEdgeCount >= metrics.siteCount - 1,
                `${volumeId} lost its natural-neighbor topology`);
            assert.ok(metrics.naturalNeighborCycleRank >= 2,
                `${volumeId} collapsed to a tree`);
            assert.ok(metrics.clearSlotCount >= 4,
                `${volumeId} lost believable dry slots`);
            assert.ok(metrics.scale2PeakSurvival >= 0.90, volumeId);
            assert.ok(metrics.scale4PeakSurvival >= 0.50, volumeId);
            const activeStages = Object.values(metrics.lifecycleCounts)
                .filter((count) => count > 0).length;
            assert.ok(activeStages >= 2,
                `${volumeId} cloned one lifecycle stage across the field`);
        }
    }
    const cc = topology("cc-stratiformis");
    assert.equal(cc.cellularTopology.mechanism,
        "finite-refracting-gravity-wave");
    assert.ok(cc.crestCount >= 4);
    assert.match(cc.boundaryModel, /gravity-wave-grain-packet/);
    const ac = topology("ac-stratiformis");
    assert.equal(ac.cellularTopology.mechanism,
        "shallow-mixed-phase-thermal-colonies");
    assert.ok(ac.cellularTopology.materialEdgeCount >= 1,
        "Ac stratiformis must include some merged thermal colonies");
    assert.match(ac.boundaryModel, /shallow-mixed-phase-thermal-colonies/);
});

test("castellanus and floccus preserve different causal connectivity", () => {
    for (const prefix of ["cc", "ac"]) {
        const castellanus = topology(`${prefix}-castellanus`);
        const floccus = topology(`${prefix}-floccus`);
        assert.equal(castellanus.commonBaseCount, 1,
            `${prefix} castellanus lost its common source layer`);
        assert.equal(floccus.commonBaseCount, 0,
            `${prefix} floccus incorrectly retained a common base`);
        assert.ok(castellanus.cellularTopology.materialEdgeCount >=
            castellanus.groupCount - 1);
        assert.equal(floccus.cellularTopology.materialEdgeCount, 0);
        assert.ok(floccus.cellularTopology.clearSlotCount >= 3);
        assert.ok(floccus.primitives.some((primitive) =>
            primitive.role === "floccus-source-connected-sedimentation-tail"));
        assert.ok(castellanus.primitives.some((primitive) =>
            primitive.role.includes("buoyant") &&
            primitive.lifecycleStage === "growing"));
        assert.ok(Object.values(castellanus.cellularTopology.lifecycleCounts)
            .filter((count) => count > 0).length >= 2);
        assert.ok(Object.values(floccus.cellularTopology.lifecycleCounts)
            .filter((count) => count > 0).length >= 2);
    }
});

test("Cc and Ac use distinct resolved vertical morphology regimes", () => {
    for (const species of ["stratiformis", "castellanus", "floccus"]) {
        const cc = topology(`cc-${species}`).cellularTopology.verticalScaleRange;
        const ac = topology(`ac-${species}`).cellularTopology.verticalScaleRange;
        assert.ok(cc[0] >= 0.65 && cc[1] >= 0.95,
            `${species} Cirrocumulus collapsed toward a planar card`);
        assert.ok(ac[0] <= 0.40 && cc[0] > ac[0] + 0.25,
            `${species} reused one altitude-scaled vertical grammar`);
        assert.notDeepEqual(ac, cc, `${species} reused one altitude-scaled grammar`);
    }
});

test("upper/middle topology construction is deterministic across shared utilities", () => {
    for (const volumeId of TARGETS) {
        const left = topology(volumeId);
        const right = topology(volumeId);
        assert.deepEqual(left.cellularTopology, right.cellularTopology, volumeId);
        assert.deepEqual(left.ownerPoints, right.ownerPoints, volumeId);
        assert.deepEqual(left.primitives, right.primitives, volumeId);
    }
});

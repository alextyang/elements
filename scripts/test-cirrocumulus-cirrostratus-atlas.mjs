import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_ATLAS_PRODUCTION_OBLIQUE_VIEWS,
    analyzeCloudAtlasProductionObliqueVolume,
    cloudAtlasProjectionDistance,
} from "./lib/cloud-atlas-projection-qualification.mjs";

const manifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-macro-atlas-v2.json", import.meta.url),
    "utf8",
));
const atlas = readFileSync(new URL(
    `../public/assets/sky/${manifest.atlas.file}`,
    import.meta.url,
));
const ids = [
    "cc-stratiformis",
    "cc-stratiformis-dispersive",
    "cc-castellanus",
    "cc-lenticularis",
    "cc-floccus",
    "cs-fibratus",
    "cs-veil",
];
const analyses = new Map(ids.map((volumeId) => [
    volumeId,
    analyzeCloudAtlasProductionObliqueVolume({
        atlas,
        manifest,
        volumeId,
    }),
]));
const analysis = (id) => {
    const value = analyses.get(id);
    assert.ok(value, `${id} must have an emitted-byte atlas analysis`);
    return value;
};

const depthContracts = Object.freeze({
    "cc-stratiformis": {
        extent: 0.127, slices: 7, sigma: 0.024, determinant: 0.7e-6,
    },
    "cc-stratiformis-dispersive": {
        extent: 0.170, slices: 9, sigma: 0.032, determinant: 1.8e-6,
    },
    "cc-castellanus": {
        extent: 0.234, slices: 12, sigma: 0.046, determinant: 2.8e-6,
    },
    "cc-lenticularis": {
        extent: 0.127, slices: 7, sigma: 0.031, determinant: 0.15e-6,
    },
    "cc-floccus": {
        extent: 0.255, slices: 13, sigma: 0.036, determinant: 1.8e-6,
    },
    "cs-fibratus": {
        extent: 0.191, slices: 10, sigma: 0.034, determinant: 0.7e-6,
    },
    "cs-veil": {
        extent: 0.127, slices: 7, sigma: 0.028, determinant: 0.4e-6,
    },
});

test("owned high-cloud atlas bytes retain real three-dimensional support", () => {
    for (const [id, contract] of Object.entries(depthContracts)) {
        const geometry = analysis(id).geometry;
        assert.ok(
            geometry.occupiedExtent[1] >= contract.extent,
            `${id} vertical extent ${geometry.occupiedExtent[1]} regressed toward a card`,
        );
        assert.ok(
            geometry.activeSliceCount[1] >= contract.slices,
            `${id} occupies only ${geometry.activeSliceCount[1]} altitude slices`,
        );
        assert.ok(
            geometry.densityWeightedAxisStandardDeviation[1] >= contract.sigma,
            `${id} carries only token dilute support outside one sky plane`,
        );
        assert.ok(
            geometry.densityWeightedCovarianceDeterminant >= contract.determinant,
            `${id} density covariance is effectively rank two`,
        );
        const planSigma = Math.min(
            geometry.densityWeightedAxisStandardDeviation[0],
            geometry.densityWeightedAxisStandardDeviation[2],
        );
        assert.ok(
            geometry.densityWeightedAxisStandardDeviation[1] /
                Math.max(1e-9, planSigma) >= 0.11,
            `${id} vertical density variance collapsed relative to its plan support`,
        );
        assert.equal(
            Object.values(geometry.occupiedFaceCounts).reduce(
                (sum, value) => sum + value,
                0,
            ),
            0,
            `${id} is clipped by a canonical volume face`,
        );
        assert.ok(
            Math.min(
                ...geometry.occupiedBounds.minimum,
                ...geometry.occupiedBounds.maximum.map((value) => 1 - value),
            ) >= 0.02,
            `${id} has no interpolation-safe clear-air margin`,
        );
    }
});

test("owned high-cloud bytes survive independent coarse reconstruction", () => {
    const contracts = {
        "cc-stratiformis": {
            mass2: 0.88, mass4: 0.68, components4: 5, largest4: 0.50,
        },
        "cc-stratiformis-dispersive": {
            mass2: 0.91, mass4: 0.78, components4: 5, largest4: 0.58,
        },
        "cc-castellanus": {
            mass2: 0.95, mass4: 0.90, components4: 1, largest4: 1,
        },
        "cc-lenticularis": {
            mass2: 0.93, mass4: 0.79, components4: 2, largest4: 0.70,
        },
        "cc-floccus": {
            mass2: 0.87, mass4: 0.65, components4: 8, largest4: 0.28,
        },
        "cs-fibratus": {
            mass2: 0.95, mass4: 0.90, components4: 1, largest4: 1,
        },
        "cs-veil": {
            mass2: 0.96, mass4: 0.89, components4: 1, largest4: 1,
        },
    };
    for (const [id, contract] of Object.entries(contracts)) {
        const { 2: scale2, 4: scale4 } = analysis(id).reconstruction;
        assert.ok(scale2.massRetention >= contract.mass2, `${id}/2x mass`);
        assert.ok(scale4.massRetention >= contract.mass4, `${id}/4x mass`);
        assert.ok(
            scale4.connectedComponentCount >= contract.components4,
            `${id}/4x lost material formation members`,
        );
        assert.ok(
            scale4.largestComponentFraction <= contract.largest4,
            `${id}/4x lost its required clear-sky separation`,
        );
    }
});

test("Cirrocumulus natural oblique views remain volumetric and WMO-distinct", () => {
    const packetIds = [
        "cc-stratiformis",
        "cc-stratiformis-dispersive",
    ];
    for (const id of packetIds) {
        let componentSum = 0;
        for (const view of Object.values(analysis(id).views)) {
            componentSum += view.componentCount;
            assert.ok(view.occupiedFraction > 0.045 &&
                view.occupiedFraction < 0.09, `${id} oblique occupancy`);
            assert.ok(view.antiOvalScore > 0.30, `${id} became oval stamps`);
            assert.ok(view.multiscalePeakCount2 >= 5, `${id} lost grain peaks`);
            assert.ok(view.orthogonalGridScore < 0.11, `${id} became a grid`);
            assert.ok(view.spanV / view.spanU > 0.40,
                `${id} became an oblique card`);
        }
        assert.ok(componentSum >= 7, `${id} lost packet negative space`);
    }

    for (const view of Object.values(analysis("cc-castellanus").views)) {
        assert.equal(view.componentCount, 1,
            "the castellanus common source must stay continuous");
        assert.ok(view.multiscalePeakCount2 >= 3);
        assert.ok(view.antiOvalScore > 0.32);
        assert.ok(view.spanV / view.spanU > 0.50);
        assert.ok(view.orthogonalGridScore < 0.08);
    }

    for (const view of Object.values(analysis("cc-lenticularis").views)) {
        assert.ok(view.componentCount >= 1 && view.componentCount <= 2);
        assert.ok(view.antiOvalScore > 0.33,
            "the unequal almond stack became a smooth oval stamp");
        assert.ok(view.boundaryCurvatureVariation > 1);
        assert.ok(view.spanV / view.spanU > 0.45);
        assert.equal(view.orthogonalGridScore, 0);
    }

    for (const view of Object.values(analysis("cc-floccus").views)) {
        assert.ok(view.componentCount >= 4);
        assert.ok(view.antiOvalScore > 0.74);
        assert.ok(view.multiscalePeakCount2 >= 7);
        assert.ok(view.spanV / view.spanU > 0.45);
        assert.ok(view.orthogonalGridScore < 0.14);
    }
});

test("Cirrostratus keeps a nebulous veil distinct from finite depth fibres", () => {
    const veil = analysis("cs-veil");
    const fibratus = analysis("cs-fibratus");
    assert.equal(veil.volume.statistics.cirrostratusSurfaceModeCount, 4);
    assert.equal(veil.volume.statistics.cirrostratusThicknessModeCount, 3);
    assert.equal(veil.volume.statistics.cirrostratusEmbeddedFibreBundleCount, 0);
    assert.equal(fibratus.volume.statistics.cirrostratusSurfaceModeCount, 4);
    assert.equal(fibratus.volume.statistics.cirrostratusThicknessModeCount, 3);
    assert.equal(
        fibratus.volume.statistics.cirrostratusEmbeddedFibreBundleCount,
        8,
    );
    assert.ok(fibratus.volume.statistics.cirrostratusFibreAltitudeSpread >= 0.10);
    assert.ok(
        fibratus.geometry.occupiedExtent[1] >
            veil.geometry.occupiedExtent[1] + 0.04,
        "finite fibratus bundles do not materially alter veil depth",
    );
    for (const { id } of CLOUD_ATLAS_PRODUCTION_OBLIQUE_VIEWS) {
        const veilView = veil.views[id];
        const fibratusView = fibratus.views[id];
        for (const view of [veilView, fibratusView]) {
            assert.equal(view.componentCount, 1);
            assert.ok(view.occupiedFraction > 0.065 &&
                view.occupiedFraction < 0.09);
            assert.ok(view.spanV / view.spanU > 0.35,
                "Cirrostratus collapsed to a natural-view card");
            assert.ok(view.boundaryCurvatureVariation > 0.63);
            assert.ok(view.orthogonalGridScore < 0.04);
        }
        assert.ok(
            cloudAtlasProjectionDistance(veilView, fibratusView) >= 0.24,
            `${id} cannot distinguish Cs veil from Cs fibratus`,
        );
    }
});

test("authored source contracts reject generic Cc primitives", () => {
    for (const id of [
        "cc-stratiformis",
        "cc-stratiformis-dispersive",
        "cc-castellanus",
        "cc-floccus",
    ]) {
        const statistics = analysis(id).volume.statistics;
        assert.equal(statistics.cellularTerminalEllipsoidCount, 0);
        assert.equal(statistics.cellularTerminalCapsuleCount, 0);
        assert.ok(
            statistics.cellularSourceConnectedSweepCount >=
                statistics.formationGroupCount,
        );
    }
    const castellanus = analysis("cc-castellanus").volume.statistics;
    assert.equal(castellanus.commonBaseCount, 1);
    assert.ok(castellanus.cellularMaximumVerticalScale >= 0.94);

    const lenticularis = analysis("cc-lenticularis").volume.statistics;
    assert.equal(lenticularis.waveCrestCount, 2);
    assert.equal(lenticularis.waveStackLayerCount, 3);
    assert.equal(lenticularis.waveAsymmetricLaminarAlmondCount, 3);
});

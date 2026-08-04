import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    UPPER_MIDDLE_ATLAS_VOLUME_IDS,
    analyzeCloudAtlasProjection,
    analyzeUpperMiddleAtlasVolume,
    cloudAtlasProjectionDistance,
} from "./lib/cloud-atlas-projection-qualification.mjs";
import { generateCloudMacroAtlas } from "./lib/cloud-volume-atlas.mjs";

const installedManifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-macro-atlas-v2.json", import.meta.url),
    "utf8",
));
const installedIds = new Set(installedManifest.volumes.map(({ id }) => id));
const generated = UPPER_MIDDLE_ATLAS_VOLUME_IDS.every((id) => installedIds.has(id))
    ? null : generateCloudMacroAtlas();
const manifest = generated?.manifest ?? installedManifest;
const atlas = generated?.atlas ?? readFileSync(new URL(
    `../public/assets/sky/${installedManifest.atlas.file}`,
    import.meta.url,
));
const analyses = new Map(UPPER_MIDDLE_ATLAS_VOLUME_IDS.map((volumeId) => [
    volumeId,
    analyzeUpperMiddleAtlasVolume({ atlas, manifest, volumeId }),
]));
const analysis = (id) => {
    const result = analyses.get(id);
    assert.ok(result, `${id} must have a CPU projection analysis`);
    return result;
};

const syntheticProjection = (resolution, field) => {
    const maximum = new Float64Array(resolution ** 2);
    const integral = new Float64Array(resolution ** 2);
    for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            const value = field(x, y);
            integral[y * resolution + x] = value;
            maximum[y * resolution + x] = Math.min(1, value * 4);
        }
    }
    return { resolution, maximum, integral };
};

const gaussian = (x, y, centerX, centerY, sigma) => Math.exp(-(
    (x - centerX) ** 2 + (y - centerY) ** 2
) / (2 * sigma ** 2));

const segmentGaussian = (x, y, start, end, sigma = 0.7) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const denominator = Math.max(1e-9, dx * dx + dy * dy);
    const amount = Math.max(0, Math.min(1,
        ((x - start[0]) * dx + (y - start[1]) * dy) / denominator));
    const nearestX = start[0] + dx * amount;
    const nearestY = start[1] + dy * amount;
    return Math.exp(-(
        (x - nearestX) ** 2 + (y - nearestY) ** 2
    ) / (2 * sigma ** 2));
};

test("upper and middle macro volumes have finite uncut authored boundaries", () => {
    for (const id of UPPER_MIDDLE_ATLAS_VOLUME_IDS) {
        const result = analysis(id);
        assert.ok(result.ground.occupiedSamples > 0, `${id} has no ground projection`);
        assert.ok(result.sideCrosswind.occupiedSamples > 0, `${id} has no side projection`);
        assert.ok(result.boundaryFaces.horizontalFaceFraction < 0.01,
            `${id} condensate reaches a horizontal atlas face like a clipped mask`);
        assert.equal(result.boundaryFaces.verticalFaceFraction, 0,
            `${id} condensate reaches a vertical atlas face`);
        assert.ok(result.ground.edgeContactFraction < 0.012,
            `${id} plan silhouette is clipped by its canonical owner domain`);
    }
});

test("projection qualification separates oval stamps, cellular peaks, and grids", () => {
    const resolution = 48;
    const oval = analyzeCloudAtlasProjection(syntheticProjection(
        resolution,
        (x, y) => Math.exp(-(
            (x - 24) ** 2 / 140 + (y - 24) ** 2 / 55
        )),
    ), 0.15);
    const irregularCenters = [
        [7, 9], [13, 34], [19, 18], [24, 40], [31, 12],
        [38, 29], [42, 7], [34, 42], [9, 25], [26, 27],
        [43, 39], [17, 7], [5, 42], [39, 18], [21, 32],
        [30, 5], [12, 15], [44, 24], [7, 34], [35, 34],
        [26, 15], [16, 43], [42, 13], [29, 37], [11, 5],
    ];
    const irregular = analyzeCloudAtlasProjection(syntheticProjection(
        resolution,
        (x, y) => irregularCenters.reduce((maximum, [centerX, centerY]) =>
            Math.max(maximum, gaussian(x, y, centerX, centerY, 1.4)), 0),
    ), 0.10);
    const grid = analyzeCloudAtlasProjection(syntheticProjection(
        resolution,
        (x, y) => {
            let value = 0;
            for (let centerY = 8; centerY <= 40; centerY += 8) {
                for (let centerX = 8; centerX <= 40; centerX += 8) {
                    value = Math.max(
                        value,
                        gaussian(x, y, centerX, centerY, 1.4),
                    );
                }
            }
            return value;
        },
    ), 0.10);

    assert.ok(oval.ellipseSimilarity > 0.92,
        "a true smooth ellipse must trip the oval-stamp similarity gate");
    assert.ok(oval.multiscalePeakCount1 <= 1);
    assert.ok(irregular.antiOvalScore > 0.48,
        "an irregular cellular field cannot be accepted as one ellipse");
    assert.ok(irregular.boundaryCurvatureVariation > oval.boundaryCurvatureVariation);
    assert.ok(irregular.multiscalePeakCount4 >= 12,
        "aperiodic peaks must survive the 4x projection footprint");
    assert.ok(grid.orthogonalGridScore > 0.70,
        "the lag gate must expose an orthogonal lattice");
    assert.ok(irregular.orthogonalGridScore < 0.28,
        "aperiodic cellular sites must not read as a grid");
    assert.ok(grid.repeatLagContrast > irregular.repeatLagContrast + 0.30);
});

test("projection qualification exposes equal parallel ribbon populations", () => {
    const resolution = 48;
    const parallel = analyzeCloudAtlasProjection(syntheticProjection(
        resolution,
        (x, y) => Math.max(
            segmentGaussian(x, y, [5, 12], [42, 12]),
            segmentGaussian(x, y, [5, 24], [42, 24]),
            segmentGaussian(x, y, [5, 36], [42, 36]),
        ),
    ), 0.10);
    const aperiodic = analyzeCloudAtlasProjection(syntheticProjection(
        resolution,
        (x, y) => Math.max(
            segmentGaussian(x, y, [4, 10], [31, 14]),
            segmentGaussian(x, y, [9, 25], [43, 20]),
            segmentGaussian(x, y, [5, 39], [27, 31]),
            segmentGaussian(x, y, [30, 42], [44, 37]),
        ),
    ), 0.10);
    assert.ok(parallel.componentOrientationCoherence > 0.98);
    assert.ok(parallel.componentOrientationSpread < 0.02);
    assert.ok(parallel.componentLengthCoefficientVariation < 0.05);
    assert.ok(aperiodic.componentOrientationSpread > 0.04);
    assert.ok(aperiodic.componentLengthCoefficientVariation > 0.15);
});

test("previously omitted Cc/Ac species participate in projection gates", () => {
    for (const id of [
        "cc-stratiformis-dispersive", "cc-castellanus", "cc-floccus",
        "cc-lenticularis", "ac-volutus",
    ]) {
        const result = analysis(id);
        for (const projection of [
            result.ground,
            result.sideCrosswind,
            result.sideDownwind,
        ]) {
            for (const metric of [
                "antiOvalScore",
                "boundaryCurvatureVariation",
                "scale2PeakSurvival",
                "scale4PeakSurvival",
                "maximumAxisRepeatCorrelation",
                "maximumDiagonalRepeatCorrelation",
                "orthogonalGridScore",
                "repeatLagContrast",
            ]) assert.ok(Number.isFinite(projection[metric]), `${id}/${metric}`);
        }
    }
    assert.ok(analysis("cc-castellanus").ground.antiOvalScore > 0.30);
    assert.ok(analysis("cc-floccus").ground.antiOvalScore > 0.60);
    assert.ok(analysis("cc-castellanus").ground.boundaryCurvatureVariation > 0.78);
    assert.ok(analysis("cc-floccus").ground.scale2PeakSurvival > 0.60);
    assert.ok(analysis("cc-castellanus").ground.orthogonalGridScore < 0.16);
    assert.ok(analysis("cc-floccus").ground.orthogonalGridScore < 0.16);
    assert.ok(analysis("cc-stratiformis-dispersive").ground.scale2PeakSurvival > 0.70);
    const roll = analysis("ac-volutus").ground;
    assert.ok(roll.maximumAxisRepeatCorrelation > 0.45,
        "a coherent roll should retain its one-axis lag signature");
    assert.ok(roll.orthogonalGridScore < 0.15,
        "one coherent roll must not be mislabeled as a two-axis grid");
});

test("Cirrus species retain WMO-distinct streamer, hook, patch, and tuft silhouettes", () => {
    const fibratus = analysis("ci-fibratus");
    const fibratusStatistics = fibratus.volume.statistics;
    assert.equal(fibratusStatistics.cirrusFibratusPrimaryFibreCount, 7);
    assert.equal(fibratusStatistics.cirrusFibratusSecondaryFibreCount, 5);
    assert.equal(fibratusStatistics.cirrusFibratusSweptC2Count, 12);
    assert.equal(fibratusStatistics.cirrusFibratusLegacyCapsuleCount, 0,
        "fibratus cannot regress to a necklace of broad capsule ribbons");
    assert.ok(fibratusStatistics.cirrusFibratusMeanTerminalRadiusRatio > 0.30 &&
        fibratusStatistics.cirrusFibratusMeanTerminalRadiusRatio < 0.58,
    "fibratus needs unequal sublimating terminal taper without blunt ends");
    assert.ok(fibratusStatistics.cirrusFibratusHeadingSpread > 0.30);
    assert.ok(fibratusStatistics.cirrusFibratusLengthCoefficientVariation > 0.28);
    assert.ok(fibratusStatistics.cirrusFibratusMeanExcessCurvature > 0.03);
    assert.ok(fibratusStatistics.cirrusFibratusSourceAltitudeSpread > 0.30);
    assert.ok(fibratusStatistics.cirrusFibratusSourceDepthSpread > 0.12,
        "fibratus sources need genuine three-dimensional depth, not one sky plane");
    assert.ok(fibratusStatistics.reconstructionScale2MassRetention > 0.88);
    assert.ok(fibratusStatistics.reconstructionScale4MassRetention > 0.40);
    assert.ok(fibratusStatistics.reconstructionScale4ConnectedComponentCount >= 5);
    assert.ok(fibratusStatistics.reconstructionScale4LargestComponentFraction < 0.45,
        "coarse fibratus support must retain clear sky between fibre families");
    assert.ok(fibratusStatistics.projectedTwoAxisPeriodicScore < 0.055);
    assert.ok(fibratusStatistics.projectedOrthogonalGridScore < 0.07);
    // Differential-shear fibres may overlap in one plan projection while
    // remaining disconnected in the 3D atlas and clearly separated in an
    // orthogonal elevation. Do not mistake honest occlusion for fused support.
    assert.ok(fibratusStatistics.connectedComponentCount >= 12);
    assert.ok(fibratus.ground.componentCount >= 3);
    assert.ok(fibratus.ground.largestComponentFraction < 0.65);
    assert.ok(fibratus.ground.meanComponentAspectRatio > 2,
        "fibratus plan components need long fine trajectory silhouettes");
    assert.ok(fibratus.ground.boundaryCurvatureVariation > 1.1,
        "fibratus plan boundaries cannot regress to smooth radial strokes");
    assert.ok(fibratus.ground.componentAreaCoefficientVariation > 0.50);
    assert.ok(fibratus.ground.componentLengthCoefficientVariation > 0.35,
        "fibratus cannot expose aligned equal-length brush edges");
    assert.ok(fibratus.sideCrosswind.componentCount >= 6);
    assert.ok(fibratus.sideCrosswind.largestComponentFraction < 0.45);
    assert.ok(fibratus.sideCrosswind.boundingCompactness < 0.28,
        "fibratus may not collapse into one shared oval envelope");
    assert.ok(fibratus.sideDownwind.componentCount >= 3);
    assert.ok(fibratus.sideDownwind.largestComponentFraction < 0.65,
        "crosswind viewing must preserve negative sky between sedimenting fibres");
    assert.ok(fibratus.sideDownwind.componentLengthCoefficientVariation > 0.40);

    const uncinus = analysis("ci-uncinus");
    assert.equal(uncinus.volume.statistics.connectedComponentCount, 2);
    assert.equal(uncinus.volume.statistics.cirrusSweptC2AnatomyCount, 12);
    assert.equal(uncinus.volume.statistics.cirrusLegacyCapsulePrimitiveCount, 0);
    assert.equal(uncinus.volume.statistics.cirrusLegacyEllipsoidPrimitiveCount, 0);
    assert.equal(uncinus.ground.componentCount, 2);
    assert.ok(uncinus.sideCrosswind.spanV > 0.45,
        "uncinus requires a deep hook-to-fallstreak silhouette");
    assert.ok(uncinus.ground.boundingCompactness < 0.24,
        "uncinus needs open comma/fallstreak negative space");

    const spissatus = analysis("ci-spissatus");
    const spissatusStatistics = spissatus.volume.statistics;
    assert.equal(spissatusStatistics.cirrusIcePatchSurfaceCount, 0,
        "spissatus must not regress to authored oval ice-patch surfaces");
    assert.equal(spissatusStatistics.cirrusSpissatusStochasticSourceFieldCount, 1);
    assert.ok(spissatusStatistics.cirrusSpissatusStochasticLayerCount >= 4);
    assert.ok(spissatusStatistics.cirrusSpissatusStochasticSourceSiteCount >= 4);
    assert.equal(spissatus.volume.statistics.cirrusLegacyCapsulePrimitiveCount, 0);
    assert.equal(spissatus.volume.statistics.cirrusLegacyEllipsoidPrimitiveCount, 0);
    // One dominant connected excursion is physically valid: source-site
    // histories organize one dense patch with internal sheaves, while a
    // secondary material component is allowed to survive when the stochastic
    // support actually separates. Ignore subgrid islands rather than counting
    // them as independent bodies.
    const materialComponents = spissatusStatistics.dominantComponentFractions
        .filter((fraction) => fraction >= 0.004);
    assert.ok(materialComponents.length >= 1 && materialComponents.length <= 3,
        "spissatus must retain one-to-three material-scale patch components");
    assert.ok(materialComponents[0] > 0.75);
    assert.ok(spissatusStatistics.reconstructionOriginalSourceComponentCount >= 1);
    assert.ok(spissatusStatistics.reconstructionSourceCleanupVoxelFraction < 0.01,
        "subgrid threshold dust must be culled on the source lattice");
    assert.ok(spissatusStatistics.projectedFootprintCompactness < 0.50 &&
        spissatusStatistics.projectedFootprintHoleCount >= 1 &&
        spissatusStatistics.signedDistanceMeanNeighborNormalVariation > 0.12,
    "spissatus boundary must retain non-elliptic relief and natural negative space");
    assert.ok(spissatusStatistics.ownerSpacingCoefficientVariation > 0.18 &&
        spissatusStatistics.ownerAngularEntropy > 0.45,
    "spissatus lost its irregular, non-radial source-site organization");
    assert.ok(spissatus.sideCrosswind.spanV / spissatus.sideCrosswind.spanU > 0.32,
        "spissatus must retain resolved depth in crosswind elevation");
    assert.ok(spissatus.sideDownwind.spanV / spissatus.sideDownwind.spanU > 0.32,
        "spissatus must retain resolved depth in downwind elevation");
    assert.ok(Math.min(
        spissatus.sideCrosswind.boundaryCurvatureVariation,
        spissatus.sideDownwind.boundaryCurvatureVariation,
    ) > 0.72 && Math.max(
        spissatus.sideCrosswind.boundaryCurvatureVariation,
        spissatus.sideDownwind.boundaryCurvatureVariation,
    ) > 1.05,
    "spissatus needs irregular boundaries in both side views and strong relief in at least one");
    // The shallow-axis 48px canonical projection only owns the coarse oval
    // guard. The native 800x500 owner projection separately fits every upper
    // and lower edge and rejects affine production plates.
    // A dense Spissatus patch is optically thick by integrated ice path, not
    // because most of its voxels share one saturated byte.  Preserve a real
    // high-density tail while requiring the deep, silhouette-independent core
    // to remain dense and heterogeneous; the column comparison below is the
    // actual extinction guard against a dilute fibratus-like result.
    assert.ok(spissatusStatistics.denseCoreFraction > 0.16);
    assert.ok(spissatusStatistics.denseCoreMassFraction > 0.30,
        "spissatus must retain a substantial high-density mass tail");
    assert.ok(spissatusStatistics.deepInteriorDensitySampleCount >= 400);
    assert.ok(spissatusStatistics.deepInteriorDensityMean > 0.68);
    assert.ok(spissatusStatistics.deepInteriorDensityP90 > 0.84);
    assert.ok(
        spissatusStatistics.deepInteriorDensityCoefficientOfVariation >=
            0.16,
        "spissatus cannot recover dense-patch metrics with a uniform milky core",
    );
    assert.ok(spissatusStatistics.opticalDepthStructuredColumnFraction > 0.18 &&
        spissatusStatistics.opticalDepthColumnCoefficientOfVariation > 0.045,
    "spissatus needs inhomogeneous 3-D optical paths, not an edge-only patch");
    assert.ok(Math.abs(spissatusStatistics.cirrusSpissatusStochasticLatentMean) < 0.08 &&
        spissatusStatistics.cirrusSpissatusStochasticLatentVariance > 0.005 &&
        Math.abs(spissatusStatistics.cirrusSpissatusStochasticLatentSkew) < 0.80 &&
        spissatusStatistics.cirrusSpissatusStochasticIwcMean > 0.70 &&
        spissatusStatistics.cirrusSpissatusStochasticIwcP99 > 1.30,
    "spissatus latent IWC field lost its calibrated stochastic moments");
    assert.ok(spissatus.ground.meanIntegratedDensity >
        fibratus.ground.meanIntegratedDensity * 4.5,
    "spissatus must be optically much denser than fibratus");

    const floccus = analysis("ci-floccus");
    assert.equal(floccus.volume.statistics.cirrusIceTuftSurfaceCount, 7);
    assert.ok(floccus.volume.statistics.cirrusSweptC2AnatomyCount >= 7);
    assert.equal(floccus.volume.statistics.cirrusLegacyCapsulePrimitiveCount, 0);
    assert.equal(floccus.volume.statistics.cirrusLegacyEllipsoidPrimitiveCount, 0);
    assert.ok(floccus.volume.statistics.connectedComponentCount >= 6);
    assert.ok(floccus.ground.componentCount >= 4);
    assert.ok(floccus.ground.antiOvalScore > 0.75,
        "floccus tufts cannot read as a population of radial stamps");
    assert.ok(floccus.ground.largestComponentFraction < 0.42,
        "floccus needs detached unequal tufts, not one dominant puff");
    assert.ok(floccus.sideCrosswind.spanV > 0.42,
        "floccus needs ragged sedimenting undersides");

    const castellanus = analysis("ci-castellanus");
    assert.equal(castellanus.volume.statistics.connectedComponentCount, 1);
    assert.equal(castellanus.volume.statistics.cirrusIcePatchSurfaceCount, 1);
    assert.equal(castellanus.volume.statistics.cirrusIceTuftSurfaceCount, 6);
    assert.equal(castellanus.volume.statistics.cirrusLegacyCapsulePrimitiveCount, 0);
    assert.equal(castellanus.volume.statistics.cirrusLegacyEllipsoidPrimitiveCount, 0);
    assert.ok(castellanus.volume.statistics.commonBaseCount >= 1);
    assert.ok(castellanus.sideCrosswind.boundingCompactness > 0.42,
        "castellanus must preserve its common crenellated base");
    assert.ok(castellanus.sideCrosswind.spanV / castellanus.sideCrosswind.spanU > 0.28,
        "castellanus turrets need resolved vertical volume above their base");
    assert.ok(castellanus.sideCrosswind.boundaryCurvatureVariation > 1,
        "castellanus needs a scalloped turret silhouette, not an oval bank");

    const ids = [
        "ci-fibratus", "ci-fibratus-depth-shear",
        "ci-fibratus-split-source", "ci-uncinus", "ci-spissatus", "ci-floccus",
        "ci-castellanus",
    ];
    for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
            assert.ok(cloudAtlasProjectionDistance(
                analysis(ids[left]).ground,
                analysis(ids[right]).ground,
            ) > 0.64, `${ids[left]} and ${ids[right]} share a generic plan silhouette`);
            const sideThreshold = ids[left] === "ci-spissatus" &&
                ids[right] === "ci-floccus" ? 0.54 : 0.62;
            assert.ok(cloudAtlasProjectionDistance(
                analysis(ids[left]).sideCrosswind,
                analysis(ids[right]).sideCrosswind,
            ) > sideThreshold,
            `${ids[left]} and ${ids[right]} share a generic side silhouette`);
        }
    }
});

test("high-ice material retains resolved interior optical-depth hierarchy", () => {
    const hierarchyContracts = {
        "ci-spissatus": {
            structured: 0.80,
            enclosedClear: 0.20,
            coefficientVariation: 0.20,
        },
        "ci-castellanus": {
            structured: 0.70,
            enclosedClear: 0.10,
            coefficientVariation: 0.20,
        },
        "ci-floccus": {
            structured: 0.70,
            enclosedClear: 0.10,
            coefficientVariation: 0.20,
        },
        "cc-castellanus": {
            structured: 0.70,
            enclosedClear: 0.10,
            coefficientVariation: 0.20,
        },
        "cc-floccus": {
            structured: 0.65,
            enclosedClear: 0.10,
            coefficientVariation: 0.20,
        },
    };
    for (const [id, contract] of Object.entries(hierarchyContracts)) {
        const statistics = analysis(id).volume.statistics;
        assert.ok(
            statistics.opticalDepthStructuredColumnFraction >=
                contract.structured,
            `${id} interior optical depth is edge-only or uniformly milky`,
        );
        assert.ok(
            statistics.opticalDepthEnclosedClearColumnFraction >=
                contract.enclosedClear,
            `${id} lacks enclosed dry-air channels after reconstruction`,
        );
        assert.ok(
            statistics.opticalDepthColumnCoefficientOfVariation >=
                contract.coefficientVariation,
            `${id} optical columns collapsed to one smooth density level`,
        );
    }
});

test("fibratus atlas ordinals materialize different multi-view negative-space anatomy", () => {
    const variants = [
        analysis("ci-fibratus"),
        analysis("ci-fibratus-depth-shear"),
        analysis("ci-fibratus-split-source"),
    ];
    for (const variant of variants) {
        assert.ok(variant.volume.statistics.connectedComponentCount >= 12);
        assert.ok(variant.ground.componentCount >= 3);
        assert.ok(variant.sideCrosswind.componentCount >= 6);
        assert.ok(variant.sideDownwind.componentCount >= 3);
        assert.ok(variant.sideCrosswind.boundingCompactness < 0.24,
            `${variant.volume.id} became a shared envelope rather than fine fibres`);
        const lengthVariation = [
            variant.ground.componentLengthCoefficientVariation,
            variant.sideCrosswind.componentLengthCoefficientVariation,
            variant.sideDownwind.componentLengthCoefficientVariation,
        ];
        assert.ok(Math.max(...lengthVariation) > 0.40 &&
            lengthVariation.reduce((sum, value) => sum + value, 0) / 3 > 0.36,
        `${variant.volume.id} exposes equal-length brush marks in all views`);
    }
    for (let left = 0; left < variants.length; left += 1) {
        for (let right = left + 1; right < variants.length; right += 1) {
            for (const projection of ["ground", "sideCrosswind", "sideDownwind"]) {
                const distance = cloudAtlasProjectionDistance(
                    variants[left][projection],
                    variants[right][projection],
                );
                assert.ok(distance > 0.55,
                    `${variants[left].volume.id}/${variants[right].volume.id} ` +
                    `${projection} anatomy distance collapsed to ${distance}`);
            }
        }
    }
});

test("Cirrostratus is a finite high veil and Cirrocumulus is a finite wave packet", () => {
    const veil = analysis("cs-veil");
    assert.equal(veil.volume.statistics.connectedComponentCount, 1);
    assert.equal(veil.ground.componentCount, 1);
    assert.ok(veil.ground.spanU > 0.75 && veil.ground.spanV > 0.52);
    assert.ok(veil.sideCrosswind.spanV >= 0.075 &&
        veil.sideCrosswind.spanV < 0.24,
    "Cirrostratus needs a thin but reconstructible depth-bearing ice veil");
    assert.ok(veil.ground.meanIntegratedDensity > 0.003 &&
        veil.ground.meanIntegratedDensity < 0.018,
    "Cirrostratus must stay in its transparent veil opacity regime");
    const fibratus = analysis("cs-fibratus");
    assert.equal(fibratus.volume.statistics.connectedComponentCount, 1,
        "Cs fibratus fibres must remain embedded in continuous veil support");
    assert.ok(fibratus.volume.statistics.streamlineCount >= 8);
    assert.ok(fibratus.volume.statistics.meanDetailType >
        veil.volume.statistics.meanDetailType + 0.05,
    "Cs fibratus needs materially stronger ice-fibre structure than nebulosus");
    assert.ok(fibratus.ground.meanIntegratedDensity > 0.004 &&
        fibratus.ground.meanIntegratedDensity < 0.020);
    assert.ok(cloudAtlasProjectionDistance(
        fibratus.ground,
        veil.ground,
    ) > 0.25, "Cs fibratus and nebulosus cannot share one slab silhouette");

    const ripple = analysis("cc-stratiformis");
    assert.ok(ripple.volume.statistics.waveCrestCount >= 3,
        "Cirrocumulus stratiformis must be authored as finite wave crests");
    assert.ok(ripple.volume.statistics.formationGroupCount >= 18);
    assert.ok(ripple.ground.componentCount >= 5,
        "Cirrocumulus needs broken sub-degree grains/ripples");
    assert.ok(ripple.ground.largestComponentFraction < 0.32 &&
        ripple.ground.occupiedFraction < 0.28,
    "Cirrocumulus must retain material clear sky between its depth-bearing grains");
    assert.ok(ripple.ground.maximumRepeatCorrelation < 0.68,
        "Cirrocumulus wave crests need wavelength/phase drift, not periodic stripes");
    assert.ok(ripple.ground.antiOvalScore > 0.65,
        "Cirrocumulus grain packets cannot be a field of oval stamps");
    assert.ok(ripple.ground.boundaryCurvatureVariation > 0.70,
        "Cirrocumulus needs curved/scalloped finite packet boundaries");
    assert.ok(ripple.ground.scale2PeakSurvival > 0.45 &&
        ripple.ground.scale4PeakSurvival > 0.20,
    "Cirrocumulus grain peaks must survive coarse projection footprints");
    assert.ok(ripple.ground.orthogonalGridScore < 0.18,
        "Cirrocumulus phase coherence cannot collapse to a two-axis grid");
    assert.ok(ripple.sideCrosswind.spanV >= 0.14 &&
        ripple.sideCrosswind.spanV <= 0.22,
    "Cirrocumulus must be vertically resolved without becoming a deep convective layer");
    assert.ok(cloudAtlasProjectionDistance(veil.ground, ripple.ground) > 0.65,
        "Cirrostratus veil and Cirrocumulus ripple sheet must stay distinct");
});

test("Altocumulus species preserve layer, castle, tuft, and wave-lens topology", () => {
    const stratiformis = analysis("ac-stratiformis");
    assert.ok(stratiformis.volume.statistics.connectedComponentCount >= 2);
    assert.ok(stratiformis.ground.componentCount >= 4);
    assert.ok(stratiformis.ground.boundingCompactness < 0.34,
        "Ac stratiformis needs merged and separate elements with real gaps");
    assert.ok(stratiformis.ground.antiOvalScore > 0.65);
    assert.ok(stratiformis.ground.boundaryCurvatureVariation > 0.70);
    assert.ok(stratiformis.ground.scale2PeakSurvival > 0.42 &&
        stratiformis.ground.scale4PeakSurvival > 0.24);
    assert.ok(stratiformis.ground.orthogonalGridScore < 0.18);
    assert.ok(stratiformis.sideCrosswind.spanV >= 0.06 &&
        stratiformis.sideCrosswind.spanV < 0.18);

    const castellanus = analysis("ac-castellanus");
    assert.equal(castellanus.volume.statistics.connectedComponentCount, 1);
    assert.equal(castellanus.volume.statistics.commonBaseCount, 1);
    assert.ok(castellanus.sideCrosswind.spanV > 0.25,
        "Ac castellanus needs elevated convective turrets");
    assert.ok(castellanus.ground.anisotropy > 4,
        "Ac castellanus needs a finite crenellated line, not a puff field");
    assert.ok(castellanus.ground.antiOvalScore > 0.25);
    assert.ok(castellanus.ground.boundaryCurvatureVariation > 0.80);
    assert.ok(castellanus.ground.scale2PeakSurvival > 0.70);
    assert.ok(castellanus.ground.orthogonalGridScore < 0.18);

    const floccus = analysis("ac-floccus");
    assert.ok(floccus.volume.statistics.connectedComponentCount >= 6);
    assert.ok(floccus.ground.componentCount >= 3);
    assert.ok(floccus.ground.largestComponentFraction < 0.60,
        "Ac floccus needs detached unequal elevated-convective remnants");
    assert.ok(floccus.sideCrosswind.spanV > 0.20,
        "Ac floccus needs ragged, virga-bearing lower structure");
    assert.ok(floccus.ground.antiOvalScore > 0.50);
    assert.ok(floccus.ground.boundaryCurvatureVariation > 0.80);
    assert.ok(floccus.ground.scale2PeakSurvival > 0.65);
    assert.ok(floccus.ground.orthogonalGridScore < 0.18);

    const lens = analysis("ac-lenticularis");
    assert.equal(lens.volume.statistics.connectedComponentCount, 1);
    assert.ok(lens.volume.statistics.waveCrestCount >= 1);
    assert.ok(lens.volume.statistics.waveStackLayerCount >= 3);
    assert.ok(lens.ground.anisotropy > 1.8);
    assert.ok(lens.sideCrosswind.spanV < lens.sideCrosswind.spanU * 0.38,
        "Ac lenticularis needs a laminar finite wave aspect");

    const ids = [
        "ac-stratiformis", "ac-castellanus", "ac-floccus", "ac-lenticularis",
    ];
    for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
            assert.ok(cloudAtlasProjectionDistance(
                analysis(ids[left]).ground,
                analysis(ids[right]).ground,
            ) > 0.62, `${ids[left]} and ${ids[right]} are not WMO-distinct in plan`);
        }
    }
});

test("Altostratus retains a connected finite mixed-phase shield opacity regime", () => {
    const shield = analysis("as-opacus");
    assert.equal(shield.volume.statistics.connectedComponentCount, 1);
    assert.equal(shield.ground.componentCount, 1);
    assert.ok(shield.ground.spanU > 0.80 && shield.ground.spanV > 0.68);
    assert.ok(shield.sideCrosswind.spanV > 0.18 &&
        shield.sideCrosswind.spanV < 0.38,
    "Altostratus needs finite physical depth without becoming a low overcast slab");
    assert.ok(shield.ground.meanIntegratedDensity > 0.045 &&
        shield.ground.meanIntegratedDensity < 0.11,
    "The canonical Altostratus asset must support opacus extinction");
    assert.ok(shield.volume.statistics.denseCoreFraction > 0.5);
    assert.ok(shield.volume.statistics.meanIceFraction > 0.25 &&
        shield.volume.statistics.meanIceFraction < 0.72,
    "Altostratus needs vertically mixed liquid/ice support");
    assert.ok(cloudAtlasProjectionDistance(
        shield.ground,
        analysis("ac-lenticularis").ground,
    ) > 0.55, "Altostratus cannot read as an enlarged lenticular stamp");

    const translucent = analysis("as-translucidus");
    assert.equal(translucent.volume.statistics.connectedComponentCount, 1);
    assert.ok(translucent.sideCrosswind.spanV >= 0.14 &&
        translucent.sideCrosswind.spanV < shield.sideCrosswind.spanV,
    "As translucidus must be a shallower ground-glass shield than opacus");
    assert.equal(translucent.volume.statistics.denseCoreFraction, 0,
        "As translucidus cannot contain an opacus-like opaque core");
    assert.ok(translucent.ground.meanIntegratedDensity > 0.012 &&
        translucent.ground.meanIntegratedDensity <
            shield.ground.meanIntegratedDensity * 0.45,
    "As translucidus needs a distinct lower optical-mass regime");
    assert.ok(cloudAtlasProjectionDistance(
        translucent.sideCrosswind,
        shield.sideCrosswind,
    ) > 0.35, "As translucidus and opacus need distinct physical depths");
});

test("upper/middle canonical vertical placement remains physically ordered", () => {
    for (const id of [
        "ci-fibratus", "ci-fibratus-depth-shear",
        "ci-fibratus-split-source", "ci-uncinus", "ci-spissatus", "ci-floccus",
        "cs-veil", "cs-fibratus", "cc-stratiformis",
    ]) {
        assert.ok(analysis(id).sideCrosswind.centroidV >= 0.52,
            `${id} high-cloud support is vertically misplaced in its owner`);
    }
    for (const id of [
        "ac-stratiformis", "ac-castellanus", "ac-floccus",
        "ac-lenticularis", "as-opacus", "as-translucidus",
    ]) {
        assert.ok(analysis(id).sideCrosswind.centroidV >= 0.43 &&
            analysis(id).sideCrosswind.centroidV <= 0.70,
        `${id} middle-cloud support is vertically misplaced in its owner`);
    }
});

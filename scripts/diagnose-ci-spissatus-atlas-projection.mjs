/**
 * Read-only Cirrus spissatus atlas projection diagnostic.
 *
 * This script deliberately reads the installed atlas and benchmark/runtime
 * sources. It does not call an atlas generator, write public assets, mutate
 * renderer geometry, or update qualification hashes. The output is a compact
 * JSON record intended for comparing geometry iterations.
 */

import assert from "node:assert/strict";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import ts from "typescript";
import { cloudMaskFromCoverage } from "./lib/cloud-preview-image-qualification.mjs";
import {
    analyzeCloudAtlasProductionPerspectiveProjection,
    analyzeCloudAtlasProductionPixelSilhouette,
    analyzeCloudAtlasProductionRadialSilhouette,
    analyzeCloudAtlasProjection,
    cloudAtlasProjectionDistance,
    decodeCloudAtlasVolume,
    measureCloudAtlasScaleReconstruction,
    measureCloudAtlasVolumeGeometry,
    projectCloudAtlasDensity,
    projectCloudAtlasDensityProductionPerspective,
} from "./lib/cloud-atlas-projection-qualification.mjs";

const SOURCE_MODULES = [
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
    "cloud-photograph-benchmark",
    "cloud-morphology-photograph-qualification",
];

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(
    tmpdir(),
    "elements-ci-spissatus-projection-",
));

/**
 * Keep this bootstrap in lockstep with test-cloud-system-runtime.mjs. The
 * runtime is authored TypeScript, while this diagnostic remains directly
 * runnable by Node without a build or a renderer process.
 */
for (const name of SOURCE_MODULES) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    let output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;
    for (const dependency of SOURCE_MODULES) {
        output = output.replaceAll(
            `"./${dependency}"`,
            `"./${dependency}.mjs"`,
        );
    }
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const degrees = (value) => value * Math.PI / 180;

const pick = (record, keys) => Object.fromEntries(keys
    .filter((key) => Object.hasOwn(record, key))
    .map((key) => [key, record[key]]));

const projectionMetrics = (analysis) => ({
    ...pick(analysis, [
        "resolution",
        "width",
        "height",
        "occupiedSamples",
        "occupiedFraction",
        "boundingCompactness",
        "antiOvalScore",
        "boundaryRadialCoefficientVariation",
        "boundaryCurvatureVariation",
        "componentCount",
        "largestComponentFraction",
        "edgeContactFraction",
        "spanU",
        "spanV",
        "centroidU",
        "centroidV",
        "anisotropy",
        "maximumRepeatCorrelation",
        "maximumAxisRepeatCorrelation",
        "maximumDiagonalRepeatCorrelation",
        "orthogonalGridScore",
        "dominantRepeatLagU",
        "dominantRepeatLagV",
        "repeatLagContrast",
        "multiscalePeakCount1",
        "multiscalePeakCount2",
        "multiscalePeakCount4",
        "scale2PeakSurvival",
        "scale4PeakSurvival",
        "resolvedComponentCount",
        "componentOrientationCoherence",
        "componentOrientationSpread",
        "componentAreaCoefficientVariation",
        "componentWidthCoefficientVariation",
        "componentLengthCoefficientVariation",
        "meanComponentAspectRatio",
        "elongatedComponentFraction",
        "rowMassCoefficientVariation",
        "meanIntegratedDensity",
        "occupiedMeanIntegratedDensity",
        "projectedHorizontalSpanRadians",
        "projectedVerticalSpanRadians",
        "projectedVerticalToHorizontalRatio",
        "antiRibbonCompactness",
        "meanOccupiedDepthKm",
        "maximumOccupiedDepthKm",
        "occupiedDepthCoefficientVariation",
    ]),
    // This is intentionally a diagnostic label, not a qualification gate.
    // Any occupied sample on the projection boundary means the mask is
    // cropped, even when the production frame-owner sampler reports an
    // interior-only support estimate at its coarser sample grid.
    cropped: analysis.edgeContactFraction > 0,
});

const nativePixelComponentBounds = (analysis) => {
    const width = analysis.width;
    const height = analysis.height;
    const visited = new Uint8Array(analysis.mask.length);
    const components = [];
    for (let start = 0; start < analysis.mask.length; start += 1) {
        if (!analysis.mask[start] || visited[start]) continue;
        const queue = [start];
        const points = [];
        visited[start] = 1;
        while (queue.length > 0) {
            const current = queue.pop();
            const x = current % width;
            const y = Math.floor(current / width);
            points.push([x, y]);
            const neighbors = [
                x > 0 ? current - 1 : -1,
                x + 1 < width ? current + 1 : -1,
                y > 0 ? current - width : -1,
                y + 1 < height ? current + width : -1,
            ];
            for (const neighbor of neighbors) {
                if (neighbor >= 0 && analysis.mask[neighbor] &&
                    !visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
        }
        const minimumX = Math.min(...points.map(([x]) => x));
        const maximumX = Math.max(...points.map(([x]) => x));
        const minimumY = Math.min(...points.map(([, y]) => y));
        const maximumY = Math.max(...points.map(([, y]) => y));
        const minimumArea = Math.max(24, Math.round(width * height * 0.00012));
        if (points.length < minimumArea || maximumX - minimumX + 1 < 12 ||
            maximumY - minimumY + 1 < 6) continue;
        components.push({
            areaPixels: points.length,
            minimumX,
            maximumX,
            minimumY,
            maximumY,
            centroidX: points.reduce((sum, [x]) => sum + x, 0) /
                points.length,
            centroidY: points.reduce((sum, [, y]) => sum + y, 0) /
                points.length,
        });
    }
    components.sort((left, right) => right.areaPixels - left.areaPixels);
    return components;
};

const nativePixelMetrics = (analysis) => ({
    ...pick(analysis, [
        "width",
        "height",
        "resolvedComponentCount",
        "minimumAffineEdgeReliefFraction",
        "maximumStraightEdgeFraction",
        "minimumCentralThicknessCoefficientVariation",
    ]),
    components: (() => {
        const bounds = nativePixelComponentBounds(analysis);
        return analysis.components.map((component, index) => ({
            ...pick(component, [
                "areaPixels",
                "boundingWidthPixels",
                "boundingHeightPixels",
                "upperAffineEdgeReliefFraction",
                "lowerAffineEdgeReliefFraction",
                "minimumAffineEdgeReliefFraction",
                "meanAffineEdgeReliefFraction",
                "upperStraightEdgeFraction",
                "lowerStraightEdgeFraction",
                "maximumStraightEdgeFraction",
                "centralThicknessCoefficientVariation",
            ]),
            ...(bounds[index] ?? {}),
        }));
    })(),
});

const nativeRadialMetrics = (analysis) => ({
    ...pick(analysis, [
        "resolvedComponentCount",
        "bestCenterPixels",
        "centroidConicCoefficientVariation",
        "centroidConicFit",
        "contourRingPhaseCoherence",
        "maximumPairwisePrincipalAxisSeparationDegrees",
        "radialEdgeVariationScore",
        "radialCoverageScore",
    ]),
    components: analysis.components.map((component) => pick(component, [
        "areaPixels",
        "centroidPixels",
        "principalAxisDegrees",
        "principalAxisRatio",
        "ringTangentMisalignmentDegrees",
        "contourRingPhaseCoherence",
    ])),
});

const ownerProjection = (system) => ({
    ...system.state.extent,
    orientationRadians: system.state.extent.orientation,
    baseAltitudeKm: system.compiled.geometry.baseAltitudeKm,
    geometricDepthKm: system.compiled.geometry.geometricDepthKm,
});

/**
 * Rotate the whole authored world and the camera around the observer by the
 * same positive yaw. East/north coordinates use the same convention as the
 * production camera: +yaw maps the north-facing vector onto +east, so
 * x'=cos(yaw)x+sin(yaw)z and z'=-sin(yaw)x+cos(yaw)z. Because owner
 * orientation is measured from +east while camera azimuth is measured from
 * +north, the same world rotation subtracts yaw from owner orientation but
 * adds yaw to camera azimuth.
 */
const rotateOwnerAndCamera = (owner, camera, yawRadians) => {
    const cosine = Math.cos(yawRadians);
    const sine = Math.sin(yawRadians);
    return {
        owner: {
            ...owner,
            centerEastKm: cosine * owner.centerEastKm +
                sine * owner.centerNorthKm,
            centerNorthKm: -sine * owner.centerEastKm +
                cosine * owner.centerNorthKm,
            orientationRadians: owner.orientationRadians - yawRadians,
        },
        camera: {
            ...camera,
            azimuthRadians: camera.azimuthRadians + yawRadians,
        },
    };
};

const ownerSummary = (owner) => pick(owner, [
    "centerEastKm",
    "centerNorthKm",
    "majorRadiusKm",
    "minorRadiusKm",
    "orientationRadians",
    "baseAltitudeKm",
    "geometricDepthKm",
]);

const frameOwnerSummary = (frameOwner) => frameOwner ? {
    ...pick(frameOwner, [
        "ownerIndex",
        "supportedFraction",
        "supportedShare",
        "projectedHorizontalSpanRadians",
        "projectedVerticalSpanRadians",
        "projectedElementWidthRadians",
    ]),
    bounds: frameOwner.bounds,
    edgeContacts: frameOwner.edgeContacts,
} : null;

const isolatedDecodedComponent = (decoded, indices) => {
    const density = new Uint8Array(decoded.density.length);
    for (const index of indices) density[index] = decoded.density[index];
    return { ...decoded, density };
};

const sourceComponentNativeMetrics = (analysis) => {
    const metrics = nativePixelMetrics(analysis);
    return {
        ...pick(metrics, [
            "width",
            "height",
            "resolvedComponentCount",
            "minimumAffineEdgeReliefFraction",
            "maximumStraightEdgeFraction",
            "minimumCentralThicknessCoefficientVariation",
        ]),
        components: metrics.components.map((component) => pick(component, [
            "areaPixels",
            "minimumX",
            "maximumX",
            "minimumY",
            "maximumY",
            "centroidX",
            "centroidY",
            "boundingWidthPixels",
            "boundingHeightPixels",
            "minimumAffineEdgeReliefFraction",
            "meanAffineEdgeReliefFraction",
            "maximumStraightEdgeFraction",
            "centralThicknessCoefficientVariation",
        ])),
    };
};

const rectangularMaskGeometry = (mask, width, height) => {
    let occupiedPixels = 0;
    let minimumX = width;
    let maximumX = -1;
    let minimumY = height;
    let maximumY = -1;
    let centroidX = 0;
    let centroidY = 0;
    for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        occupiedPixels += 1;
        minimumX = Math.min(minimumX, x);
        maximumX = Math.max(maximumX, x);
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
        centroidX += x;
        centroidY += y;
    }
    const occupied = occupiedPixels > 0;
    return {
        occupiedPixels,
        occupiedFraction: occupiedPixels / Math.max(1, width * height),
        bounds: occupied ? {
            minimumX,
            maximumX,
            minimumY,
            maximumY,
        } : null,
        spanXPixels: occupied ? maximumX - minimumX + 1 : 0,
        spanYPixels: occupied ? maximumY - minimumY + 1 : 0,
        centroidPixels: occupied ? {
            x: centroidX / occupiedPixels,
            y: centroidY / occupiedPixels,
        } : null,
    };
};

const weightedMaskGeometry = (mask, width, height) => {
    let positivePixels = 0;
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let index = 0; index < mask.length; index += 1) {
        const weight = mask[index];
        if (weight <= 0) continue;
        const x = index % width;
        const y = Math.floor(index / width);
        positivePixels += 1;
        totalWeight += weight;
        weightedX += x * weight;
        weightedY += y * weight;
    }
    return {
        positivePixels,
        positiveFraction: positivePixels / Math.max(1, width * height),
        meanCoverage: totalWeight / Math.max(1, width * height),
        totalWeight,
        centroidPixels: totalWeight > 0 ? {
            x: weightedX / totalWeight,
            y: weightedY / totalWeight,
        } : null,
    };
};

const flipRasterRows = (values, width, height) => {
    const flipped = new values.constructor(values.length);
    for (let y = 0; y < height; y += 1) {
        const sourceOffset = y * width;
        const targetOffset = (height - 1 - y) * width;
        flipped.set(values.subarray(sourceOffset, sourceOffset + width),
            targetOffset);
    }
    return flipped;
};

const rendererAlignedProjection = (projection) => ({
    ...projection,
    // The CPU helper's production raster uses positive screenV downward,
    // while the renderer WGSL camera contract defines positive NDC-Y upward
    // before converting it to image rows. Keep the helper unchanged and make
    // this explicit coordinate-only flip at the comparison boundary.
    maximum: flipRasterRows(projection.maximum, projection.width,
        projection.height),
    integral: flipRasterRows(projection.integral, projection.width,
        projection.height),
    occupiedPathLengthKm: flipRasterRows(projection.occupiedPathLengthKm,
        projection.width, projection.height),
});

const maskOverlapMetrics = ({
    atlasMask,
    coverageMask,
    width,
    height,
    coverageThreshold,
}) => {
    assert.equal(atlasMask.length, coverageMask.length,
        "Atlas and coverage masks must share a raster");
    const coverageBinary = Uint8Array.from(
        coverageMask,
        (value) => value >= coverageThreshold ? 1 : 0,
    );
    let atlasPixels = 0;
    let coveragePixels = 0;
    let intersectionPixels = 0;
    let unionPixels = 0;
    let atlasOnlyPixels = 0;
    let coverageOnlyPixels = 0;
    let softIntersection = 0;
    let softUnion = 0;
    let atlasCoverageWeight = 0;
    let coverageWeight = 0;
    for (let index = 0; index < atlasMask.length; index += 1) {
        const atlasOccupied = atlasMask[index] ? 1 : 0;
        const coverageOccupied = coverageBinary[index] ? 1 : 0;
        const coverageWeightAtPixel = coverageMask[index];
        atlasPixels += atlasOccupied;
        coveragePixels += coverageOccupied;
        intersectionPixels += atlasOccupied && coverageOccupied ? 1 : 0;
        unionPixels += atlasOccupied || coverageOccupied ? 1 : 0;
        atlasOnlyPixels += atlasOccupied && !coverageOccupied ? 1 : 0;
        coverageOnlyPixels += coverageOccupied && !atlasOccupied ? 1 : 0;
        softIntersection += Math.min(atlasOccupied, coverageWeightAtPixel);
        softUnion += Math.max(atlasOccupied, coverageWeightAtPixel);
        coverageWeight += coverageWeightAtPixel;
        if (atlasOccupied) atlasCoverageWeight += coverageWeightAtPixel;
    }
    const atlasGeometry = rectangularMaskGeometry(atlasMask, width, height);
    const coverageGeometry = rectangularMaskGeometry(
        coverageBinary,
        width,
        height,
    );
    const centroidDistancePixels = atlasGeometry.centroidPixels &&
        coverageGeometry.centroidPixels
        ? Math.hypot(
            atlasGeometry.centroidPixels.x - coverageGeometry.centroidPixels.x,
            atlasGeometry.centroidPixels.y - coverageGeometry.centroidPixels.y,
        )
        : null;
    return {
        coverageThreshold,
        atlas: atlasGeometry,
        coverage: coverageGeometry,
        intersectionPixels,
        unionPixels,
        atlasOnlyPixels,
        coverageOnlyPixels,
        iou: intersectionPixels / Math.max(1, unionPixels),
        atlasRecall: intersectionPixels / Math.max(1, atlasPixels),
        coveragePrecision: intersectionPixels / Math.max(1, coveragePixels),
        centroidDistancePixels,
        softIntersection,
        softUnion,
        softIou: softIntersection / Math.max(1e-12, softUnion),
        coverageWeightWithinAtlas: atlasCoverageWeight /
            Math.max(1e-12, coverageWeight),
        meanCoverageOnAtlasPixels: atlasCoverageWeight /
            Math.max(1, atlasPixels),
    };
};

const captureStateSummary = (state) => state ? pick(state, [
    "sceneKey",
    "debugView",
    "productionPerspective",
    "productionCameraSignature",
    "benchmarkReady",
    "renderState",
    "projectedOpacity",
    "occupiedSky",
    "lightState",
    "requiresVolumetricLighting",
    "volumetricLightingReady",
    "directVolumeReady",
    "residentP1Ready",
    "reconstructionMature",
    "reconstructionRawNonFinite",
    "reconstructionResolvedNonFinite",
    "updates",
]) : null;

const parseProductionCameraSignature = (signature) => {
    const parts = String(signature ?? "").split("|");
    const [elevationDegrees, horizontalFovDegrees, verticalFovDegrees,
        compositionObserverAltitude] = parts.map(Number);
    if (![elevationDegrees, horizontalFovDegrees, verticalFovDegrees,
        compositionObserverAltitude].every(Number.isFinite)) {
        throw new Error(`Invalid production camera signature: ${signature}`);
    }
    return {
        signature,
        elevationDegrees,
        horizontalFovDegrees,
        verticalFovDegrees,
        compositionObserverAltitude,
        // Production composition stores altitude in units of the atmospheric
        // composition scale. The renderer's observerAltitudeKm contract
        // expands it by 2.5 before tracing rays.
        observerAltitudeKm: compositionObserverAltitude * 2.5,
    };
};

const readCoverageComparison = async ({
    coveragePath,
    coverageStatePath,
    rejectionPath,
    decoded,
    owner,
    camera,
    cameraSignature,
    threshold,
}) => {
    const common = {
        available: false,
        coveragePath,
        coverageStatePath,
        rejectionPath,
    };
    if (!existsSync(coveragePath)) return common;
    const coverageState = existsSync(coverageStatePath)
        ? JSON.parse(readFileSync(coverageStatePath, "utf8"))
        : null;
    const rejection = existsSync(rejectionPath)
        ? JSON.parse(readFileSync(rejectionPath, "utf8"))
        : null;
    const { data, info } = await sharp(coveragePath).raw().toBuffer({
        resolveWithObject: true,
    });
    const coverageMask = cloudMaskFromCoverage({
        data,
        width: info.width,
        height: info.height,
        channels: info.channels,
    });
    const rawNativeProjection = projectCloudAtlasDensityProductionPerspective(
        decoded,
        {
            owner,
            camera,
            outputWidth: info.width,
            outputHeight: info.height,
            samplesPerVoxel: 2,
            densityThreshold: threshold,
        },
    );
    const nativeProjection = rendererAlignedProjection(rawNativeProjection);
    const rawAtlasAnalysis = analyzeCloudAtlasProductionPixelSilhouette(
        rawNativeProjection,
        threshold,
    );
    const atlasAnalysis = analyzeCloudAtlasProductionPixelSilhouette(
        nativeProjection,
        threshold,
    );
    const rawAtlasRadialAnalysis = analyzeCloudAtlasProductionRadialSilhouette(
        rawNativeProjection,
        threshold,
    );
    const atlasRadialAnalysis = analyzeCloudAtlasProductionRadialSilhouette(
        nativeProjection,
        threshold,
    );
    const coverageProjection = {
        width: info.width,
        height: info.height,
        resolution: null,
        maximum: coverageMask,
        integral: coverageMask,
        occupiedPathLengthKm: new Float64Array(coverageMask.length),
    };
    const coverageThresholds = [0.01, 0.025, 0.05, 0.1, 0.2, 0.5];
    const coveragePixelAnalyses = Object.fromEntries(
        coverageThresholds.map((coverageThreshold) => {
            const pixel = analyzeCloudAtlasProductionPixelSilhouette(
                coverageProjection,
                coverageThreshold,
            );
            const radial = analyzeCloudAtlasProductionRadialSilhouette(
                coverageProjection,
                coverageThreshold,
            );
            return [String(coverageThreshold), {
                pixelSilhouette: nativePixelMetrics(pixel),
                radialSilhouette: nativeRadialMetrics(radial),
            }];
        }),
    );
    const atlasMaskGeometry = rectangularMaskGeometry(
        atlasAnalysis.mask,
        info.width,
        info.height,
    );
    const rawAtlasMaskGeometry = rectangularMaskGeometry(
        rawAtlasAnalysis.mask,
        info.width,
        info.height,
    );
    const coverageWeightedGeometry = weightedMaskGeometry(
        coverageMask,
        info.width,
        info.height,
    );
    const overlapByCoverageThreshold = Object.fromEntries(
        coverageThresholds.map((coverageThreshold) => [
            String(coverageThreshold),
            maskOverlapMetrics({
                atlasMask: atlasAnalysis.mask,
                coverageMask,
                width: info.width,
                height: info.height,
                coverageThreshold,
            }),
        ]),
    );
    const rawOverlapByCoverageThreshold = Object.fromEntries(
        coverageThresholds.map((coverageThreshold) => [
            String(coverageThreshold),
            maskOverlapMetrics({
                atlasMask: rawAtlasAnalysis.mask,
                coverageMask,
                width: info.width,
                height: info.height,
                coverageThreshold,
            }),
        ]),
    );
    const diagnosticCoverageThreshold = 0.5;
    const diagnosticCoverageKey = String(diagnosticCoverageThreshold);
    const diagnosticOverlap = overlapByCoverageThreshold[
        diagnosticCoverageKey
    ];
    const diagnosticCoveragePixel = coveragePixelAnalyses[
        diagnosticCoverageKey
    ].pixelSilhouette;
    const diagnosticCoverageRadial = coveragePixelAnalyses[
        diagnosticCoverageKey
    ].radialSilhouette;
    const boundsDelta = (left, right) => left && right ? {
        minimumX: Math.abs(left.minimumX - right.minimumX),
        maximumX: Math.abs(left.maximumX - right.maximumX),
        minimumY: Math.abs(left.minimumY - right.minimumY),
        maximumY: Math.abs(left.maximumY - right.maximumY),
    } : null;
    const atlasPredictsCoverageGeometry =
        diagnosticOverlap.iou >= 0.6 &&
        diagnosticOverlap.centroidDistancePixels <= 8 &&
        atlasAnalysis.resolvedComponentCount ===
            diagnosticCoveragePixel.resolvedComponentCount;
    const finalQualification = rejection?.qualification;
    return {
        available: true,
        coveragePath,
        coverageStatePath,
        rejectionPath,
        capture: {
            camera: cameraSignature,
            dimensions: {
                width: info.width,
                height: info.height,
                channels: info.channels,
            },
            state: captureStateSummary(coverageState),
            rejection: rejection ? {
                rendererRevision: rejection.rendererRevision,
                qualification: rejection.qualification,
            } : null,
        },
        atlas: {
            camera,
            densityThreshold: threshold,
            pixelSilhouette: nativePixelMetrics(atlasAnalysis),
            radialSilhouette: nativeRadialMetrics(atlasRadialAnalysis),
            maskGeometry: atlasMaskGeometry,
            rawProjectionMaskGeometry: rawAtlasMaskGeometry,
            rawProjectionPixelSilhouette: nativePixelMetrics(rawAtlasAnalysis),
            rawProjectionRadialSilhouette: nativeRadialMetrics(
                rawAtlasRadialAnalysis,
            ),
            softMaskMean: nativeProjection.maximum.reduce((sum, value) =>
                sum + value, 0) / Math.max(1, nativeProjection.maximum.length),
        },
        coverage: {
            softMask: coverageWeightedGeometry,
            analysesByThreshold: coveragePixelAnalyses,
        },
        overlapByCoverageThreshold,
        rawOverlapByCoverageThreshold,
        diagnosis: {
            coverageThreshold: diagnosticCoverageThreshold,
            atlasPredictsCoverageGeometry,
            geometryEvidence: {
                iou: diagnosticOverlap.iou,
                softIou: diagnosticOverlap.softIou,
                atlasRecall: diagnosticOverlap.atlasRecall,
                coveragePrecision: diagnosticOverlap.coveragePrecision,
                centroidDistancePixels: diagnosticOverlap.centroidDistancePixels,
                atlasComponentCount: atlasAnalysis.resolvedComponentCount,
                coverageComponentCount:
                    diagnosticCoveragePixel.resolvedComponentCount,
                atlasBounds: atlasMaskGeometry.bounds,
                coverageBounds: diagnosticOverlap.coverage.bounds,
                boundsDeltaPixels: boundsDelta(
                    atlasMaskGeometry.bounds,
                    diagnosticOverlap.coverage.bounds,
                ),
                atlasSpanPixels: {
                    x: atlasMaskGeometry.spanXPixels,
                    y: atlasMaskGeometry.spanYPixels,
                },
                coverageSpanPixels: {
                    x: diagnosticOverlap.coverage.spanXPixels,
                    y: diagnosticOverlap.coverage.spanYPixels,
                },
            },
            radialEvidence: {
                atlas: nativeRadialMetrics(atlasRadialAnalysis),
                coverage: diagnosticCoverageRadial,
                absoluteDelta: {
                    centroidConicFit: Math.abs(
                        atlasRadialAnalysis.centroidConicFit -
                            diagnosticCoverageRadial.centroidConicFit,
                    ),
                    contourRingPhaseCoherence: Math.abs(
                        atlasRadialAnalysis.contourRingPhaseCoherence -
                            diagnosticCoverageRadial.contourRingPhaseCoherence,
                    ),
                    radialEdgeVariationScore: Math.abs(
                        atlasRadialAnalysis.radialEdgeVariationScore -
                            diagnosticCoverageRadial.radialEdgeVariationScore,
                    ),
                    radialCoverageScore: Math.abs(
                        atlasRadialAnalysis.radialCoverageScore -
                            diagnosticCoverageRadial.radialCoverageScore,
                    ),
                },
            },
            finalImageQualification: finalQualification ? {
                radialArtifact: finalQualification.radialArtifact,
                radialExplainedVariance:
                    finalQualification.metrics?.radialExplainedVariance,
                radialExplainedCoverage:
                    finalQualification.metrics?.radialExplainedCoverage,
                cloudMaskResidualRms:
                    finalQualification.metrics?.cloudMaskResidualRms,
            } : null,
            attribution: {
                coverageGeometry: atlasPredictsCoverageGeometry
                    ? "atlas-predicted"
                    : "gpu-density-reconstruction-or-coverage-resolve",
                finalRadiance: finalQualification?.radialArtifact
                    ? atlasPredictsCoverageGeometry
                        ? "downstream-of-coverage-geometry (lighting or radiance reconstruction; coverage matte excludes final-color lighting)"
                        : "ambiguous-with-coverage-geometry-mismatch"
                    : "no-persisted-final-radial-artifact",
            },
            conclusion: atlasPredictsCoverageGeometry
                ? "The captured GPU coverage silhouette is substantially predicted by the CPU atlas projection; residual shape differences belong to GPU density reconstruction/coverage resolve, while any artifact present only in final radiance is downstream of this geometry (lighting or radiance reconstruction)."
                : "The captured GPU coverage silhouette diverges materially from the CPU atlas projection; investigate GPU density reconstruction/coverage resolve before attributing the visible distortion to final-color lighting.",
        },
        interpretation: {
            comparison: "CPU atlas density projection versus the captured GPU coverage matte; final-color lighting is excluded",
            atlasMask: "native projection maximum >= densityByteThreshold/255",
            coverageMask: "cloudMaskFromCoverage(coverage.png), with the documented 2/255 display dither floor removed",
            cameraContract: "owner and rays are rigidly embedded by cameraYawRadiansFromViewAzimuth(viewAzimuth), matching cloud-world-frame.ts and WGSL",
            rasterAlignment: "overlapByCoverageThreshold applies the documented CPU-to-WGSL vertical raster flip; rawOverlapByCoverageThreshold is the unflipped direct raster comparison",
        },
    };
};

/**
 * The shared helper exposes scale-1 component counts and aggregate bounds via
 * separate measurements. Add per-component bounds here so an iteration can
 * tell which emitted body changed, without consulting generator metadata.
 */
const measureThreeDComponentBounds = (decoded, densityThreshold) => {
    const { resolution, density } = decoded;
    const occupied = Uint8Array.from(
        density,
        (value) => value / 255 >= densityThreshold ? 1 : 0,
    );
    const visited = new Uint8Array(occupied.length);
    const stack = new Int32Array(occupied.length);
    const components = [];
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || visited[start]) continue;
        let read = 0;
        let write = 1;
        stack[0] = start;
        visited[start] = 1;
        const minimum = [resolution, resolution, resolution];
        const maximum = [-1, -1, -1];
        const indices = [];
        const binarySum = [0, 0, 0];
        const densitySum = [0, 0, 0];
        let densityWeight = 0;
        while (read < write) {
            const current = stack[read++];
            const z = Math.floor(current / (resolution * resolution));
            const remainder = current - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            indices.push(current);
            minimum[0] = Math.min(minimum[0], x);
            minimum[1] = Math.min(minimum[1], y);
            minimum[2] = Math.min(minimum[2], z);
            maximum[0] = Math.max(maximum[0], x);
            maximum[1] = Math.max(maximum[1], y);
            maximum[2] = Math.max(maximum[2], z);
            const weight = density[current] / 255;
            densityWeight += weight;
            binarySum[0] += x;
            binarySum[1] += y;
            binarySum[2] += z;
            densitySum[0] += x * weight;
            densitySum[1] += y * weight;
            densitySum[2] += z * weight;
            const append = (neighbor) => {
                if (!occupied[neighbor] || visited[neighbor]) return;
                visited[neighbor] = 1;
                stack[write++] = neighbor;
            };
            if (x > 0) append(current - 1);
            if (x + 1 < resolution) append(current + 1);
            if (y > 0) append(current - resolution);
            if (y + 1 < resolution) append(current + resolution);
            if (z > 0) append(current - resolution * resolution);
            if (z + 1 < resolution) append(current + resolution * resolution);
        }
        components.push({
            indices,
            occupiedVoxels: write,
            bounds: {
                minimum: minimum.map((value) => value / Math.max(1, resolution - 1)),
                maximum: maximum.map((value) => value / Math.max(1, resolution - 1)),
            },
            extent: maximum.map((value, axis) =>
                (value - minimum[axis]) / Math.max(1, resolution - 1)),
            binaryCentroid: binarySum.map((value) =>
                value / Math.max(1, write) / Math.max(1, resolution - 1)),
            densityWeightedCentroid: densitySum.map((value) =>
                value / Math.max(1e-12, densityWeight) /
                Math.max(1, resolution - 1)),
        });
    }
    components.sort((left, right) =>
        right.occupiedVoxels - left.occupiedVoxels,
    );
    const occupiedVoxels = components.reduce(
        (sum, component) => sum + component.occupiedVoxels,
        0,
    );
    return {
        connectedComponentCount: components.length,
        occupiedVoxels,
        largestComponentFraction: (components[0]?.occupiedVoxels ?? 0) /
            Math.max(1, occupiedVoxels),
        components: components.map((component) => ({
            ...component,
            occupiedFraction: component.occupiedVoxels /
                Math.max(1, occupiedVoxels),
        })),
    };
};

const inspectView = ({
    decoded,
    sourceComponents,
    owner,
    camera,
    threshold,
    azimuthDegrees,
}) => {
    const productionProjection = projectCloudAtlasDensityProductionPerspective(
        decoded,
        {
            owner,
            camera,
            outputResolution: 96,
            samplesPerVoxel: 2,
            densityThreshold: threshold,
        },
    );
    const productionAnalysis =
        analyzeCloudAtlasProductionPerspectiveProjection(
            productionProjection,
            threshold,
        );
    const nativeProjection = projectCloudAtlasDensityProductionPerspective(
        decoded,
        {
            owner,
            camera,
            outputWidth: 800,
            outputHeight: 500,
            samplesPerVoxel: 2,
            densityThreshold: threshold,
        },
    );
    const nativePixelAnalysis = analyzeCloudAtlasProductionPixelSilhouette(
        nativeProjection,
        threshold,
    );
    const nativeRadialAnalysis = analyzeCloudAtlasProductionRadialSilhouette(
        nativeProjection,
        threshold,
    );
    const sourceComponentViews = sourceComponents.map((sourceComponent, index) => {
        const componentProjection = projectCloudAtlasDensityProductionPerspective(
            isolatedDecodedComponent(decoded, sourceComponent.indices),
            {
                owner,
                camera,
                outputWidth: 800,
                outputHeight: 500,
                samplesPerVoxel: 2,
                densityThreshold: threshold,
            },
        );
        const componentAnalysis = analyzeCloudAtlasProductionPixelSilhouette(
            componentProjection,
            threshold,
        );
        const { indices, ...sourceSummary } = sourceComponent;
        return {
            sourceComponentIndex: index,
            source: sourceSummary,
            nativePixelSilhouette: sourceComponentNativeMetrics(
                componentAnalysis,
            ),
        };
    });
    return {
        ownerRelativeAzimuthDegrees: azimuthDegrees,
        ownerOrientationRadians: owner.orientationRadians,
        production: projectionMetrics(productionAnalysis),
        nativePixelSilhouette: nativePixelMetrics(nativePixelAnalysis),
        nativeRadialSilhouette: nativeRadialMetrics(nativeRadialAnalysis),
        sourceComponents: sourceComponentViews,
    };
};

const inspectYawInvariantPair = ({
    decoded,
    owner,
    camera,
    threshold,
    yawDegrees,
    yawRadians: suppliedYawRadians,
    viewAzimuthDegrees,
}) => {
    const yawRadians = suppliedYawRadians ?? degrees(yawDegrees);
    const rotated = rotateOwnerAndCamera(owner, camera, yawRadians);
    const project = (projectedOwner, projectedCamera) => {
        const productionProjection =
            projectCloudAtlasDensityProductionPerspective(decoded, {
                owner: projectedOwner,
                camera: projectedCamera,
                outputResolution: 96,
                samplesPerVoxel: 2,
                densityThreshold: threshold,
            });
        const nativeProjection =
            projectCloudAtlasDensityProductionPerspective(decoded, {
                owner: projectedOwner,
                camera: projectedCamera,
                outputWidth: 800,
                outputHeight: 500,
                samplesPerVoxel: 2,
                densityThreshold: threshold,
            });
        return {
            production: {
                projection: productionProjection,
                analysis: analyzeCloudAtlasProductionPerspectiveProjection(
                    productionProjection,
                    threshold,
                ),
            },
            native: {
                projection: nativeProjection,
                pixel: analyzeCloudAtlasProductionPixelSilhouette(
                    nativeProjection,
                    threshold,
                ),
                radial: analyzeCloudAtlasProductionRadialSilhouette(
                    nativeProjection,
                    threshold,
                ),
            },
        };
    };
    const baseline = project(owner, camera);
    const rotatedProjection = project(rotated.owner, rotated.camera);
    const productionMaskDistance = cloudAtlasProjectionDistance(
        baseline.production.analysis,
        rotatedProjection.production.analysis,
    );
    const nativeMaskDistance = cloudAtlasProjectionDistance(
        baseline.native.pixel,
        rotatedProjection.native.pixel,
    );
    assert.ok(productionMaskDistance <= 1e-9,
        `same-yaw production projection changed by ${productionMaskDistance}`);
    assert.ok(nativeMaskDistance <= 1e-9,
        `same-yaw native projection changed by ${nativeMaskDistance}`);
    const delta = (left, right) => Math.abs(left - right);
    const productionMetrics = [
        "occupiedSamples",
        "componentCount",
        "boundingCompactness",
        "antiOvalScore",
        "edgeContactFraction",
        "spanU",
        "spanV",
        "anisotropy",
        "antiRibbonCompactness",
        "projectedHorizontalSpanRadians",
        "projectedVerticalSpanRadians",
    ];
    const nativePixelMetricsToCompare = [
        "resolvedComponentCount",
        "minimumAffineEdgeReliefFraction",
        "maximumStraightEdgeFraction",
        "minimumCentralThicknessCoefficientVariation",
    ];
    const radialMetrics = [
        "resolvedComponentCount",
        "centroidConicCoefficientVariation",
        "contourRingPhaseCoherence",
        "maximumPairwisePrincipalAxisSeparationDegrees",
        "radialEdgeVariationScore",
        "radialCoverageScore",
    ];
    const compare = (left, right, keys) => Object.fromEntries(keys.map((key) => [
        key,
        {
            baseline: left[key],
            rotated: right[key],
            absoluteDelta: delta(left[key], right[key]),
        },
    ]));
    const reportedYawDegrees = yawDegrees ?? yawRadians * 180 / Math.PI;
    for (const key of [
        "occupiedSamples",
        "componentCount",
        "edgeContactFraction",
        "spanU",
        "spanV",
        "projectedHorizontalSpanRadians",
        "projectedVerticalSpanRadians",
    ]) {
        assert.equal(
            baseline.production.analysis[key],
            rotatedProjection.production.analysis[key],
            `same-yaw production ${key} changed`,
        );
    }
    assert.ok(
        Math.abs(
            baseline.production.analysis.anisotropy -
                rotatedProjection.production.analysis.anisotropy,
        ) < 1e-3,
        "same-yaw production anisotropy changed beyond floating-point tolerance",
    );
    for (const key of [
        "resolvedComponentCount",
        "minimumAffineEdgeReliefFraction",
        "maximumStraightEdgeFraction",
        "minimumCentralThicknessCoefficientVariation",
    ]) {
        assert.equal(
            baseline.native.pixel[key],
            rotatedProjection.native.pixel[key],
            `same-yaw native pixel ${key} changed`,
        );
    }
    for (const key of [
        "resolvedComponentCount",
        "centroidConicCoefficientVariation",
        "contourRingPhaseCoherence",
        "maximumPairwisePrincipalAxisSeparationDegrees",
        "radialEdgeVariationScore",
        "radialCoverageScore",
    ]) {
        assert.equal(
            baseline.native.radial[key],
            rotatedProjection.native.radial[key],
            `same-yaw native radial ${key} changed`,
        );
    }
    return {
        viewAzimuthDegrees,
        yawDegrees: reportedYawDegrees,
        yawRadians,
        transform: {
            centerEastKm: {
                baseline: owner.centerEastKm,
                rotated: rotated.owner.centerEastKm,
            },
            centerNorthKm: {
                baseline: owner.centerNorthKm,
                rotated: rotated.owner.centerNorthKm,
            },
            orientationRadians: {
                baseline: owner.orientationRadians,
                rotated: rotated.owner.orientationRadians,
            },
            cameraAzimuthRadians: {
                baseline: camera.azimuthRadians,
                rotated: rotated.camera.azimuthRadians,
            },
        },
        production: {
            maskDistance: productionMaskDistance,
            metrics: compare(
                baseline.production.analysis,
                rotatedProjection.production.analysis,
                productionMetrics,
            ),
        },
        native: {
            maskDistance: nativeMaskDistance,
            pixel: compare(
                baseline.native.pixel,
                rotatedProjection.native.pixel,
                nativePixelMetricsToCompare,
            ),
            radial: compare(
                baseline.native.radial,
                rotatedProjection.native.radial,
                radialMetrics,
            ),
        },
    };
};

let diagnostics;
try {
    const cameraContractModule = await import(pathToFileURL(join(
        temporaryRoot,
        "camera-contract.mjs",
    )).href);
    const runtimeModule = await import(pathToFileURL(join(
        temporaryRoot,
        "cloud-system-runtime.mjs",
    )).href);
    const benchmarkModule = await import(pathToFileURL(join(
        temporaryRoot,
        "cloud-photograph-benchmark.mjs",
    )).href);

    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        ({ id }) => id === "ci-spissatus--day-oblique-natural",
    );
    assert.ok(benchmarkCase, "missing ci-spissatus natural benchmark case");

    const manifest = JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-macro-atlas-v2.json",
        import.meta.url,
    ), "utf8"));
    const atlas = readFileSync(new URL(
        `../public/assets/sky/${manifest.atlas.file}`,
        import.meta.url,
    ));
    const threshold = manifest.occupancy.densityByteThreshold / 255;
    const volumeId = "ci-spissatus";
    const decoded = decodeCloudAtlasVolume({ atlas, manifest, volumeId });

    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const camera = {
        // The production qualification frame is source-centred. The
        // owner-relative azimuth sweep below changes only the authored owner
        // heading; panning the camera would measure framing, not anatomy.
        azimuthRadians: 0,
        elevationRadians: degrees(benchmarkCase.environment.viewElevation),
        horizontalFovRadians: degrees(benchmarkCase.environment.horizontalFov),
        verticalFovRadians: degrees(benchmarkCase.environment.verticalFov),
        observerAltitudeKm: benchmarkCase.environment.composition.observerAltitude,
    };
    const frame = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        camera,
    );
    const frameOwners = new Map(frame.ownerProjections.map((owner) => [
        owner.ownerIndex,
        owner,
    ]));
    const candidates = runtime.systems.flatMap((system, ownerIndex) => {
        const frameOwner = frameOwners.get(ownerIndex);
        if (!frameOwner || system.atlasDeterministicVariant !== 0) return [];
        return [{ system, ownerIndex, frameOwner }];
    }).sort((left, right) =>
        left.frameOwner.edgeContacts.count - right.frameOwner.edgeContacts.count ||
        right.frameOwner.supportedFraction - left.frameOwner.supportedFraction,
    );
    assert.ok(candidates.length > 0,
        "ci-spissatus has no visible production owner candidate");
    const candidate = candidates[0];
    const baseOwner = ownerProjection(candidate.system);

    const groundAnalysis = analyzeCloudAtlasProjection(
        projectCloudAtlasDensity(decoded, "ground"),
        threshold,
    );
    const geometry = measureCloudAtlasVolumeGeometry(decoded, threshold);
    const scaleOneConnectivity = measureCloudAtlasScaleReconstruction(decoded, {
        densityThreshold: threshold,
        scales: [1],
    })[1];
    const componentDetails = measureThreeDComponentBounds(decoded, threshold);
    const componentBounds = {
        ...componentDetails,
        components: componentDetails.components.map(({ indices, ...component }) =>
            component),
    };
    const viewAzimuths = [0, 5, 18, 25, 60, 90, 135];
    const views = Object.fromEntries(viewAzimuths.map((azimuthDegrees) => [
        String(azimuthDegrees), inspectView({
            decoded,
            sourceComponents: componentDetails.components,
            owner: {
                ...baseOwner,
                orientationRadians: baseOwner.orientationRadians +
                    degrees(azimuthDegrees),
            },
            camera,
            threshold,
            azimuthDegrees,
        }),
    ]));
    const baseView = views["0"];
    const viewAzimuthDegrees = benchmarkCase.environment.viewAzimuth;
    const cameraYawRadians = cameraContractModule
        .cameraYawRadiansFromViewAzimuth(viewAzimuthDegrees);
    const sameYawInvariance = inspectYawInvariantPair({
        decoded,
        owner: baseOwner,
        camera,
        threshold,
        viewAzimuthDegrees,
        yawDegrees: viewAzimuthDegrees - 180,
        yawRadians: cameraYawRadians,
    });

    // Compare the same CPU atlas projection against the already captured
    // native GPU coverage matte. This branch is read-only: it never launches
    // a renderer, reruns Playwright, or writes a replacement capture.
    const captureDirectory = fileURLToPath(new URL(
        "../output/playwright/cloud-previews/rejected-high-cloud/" +
        "ci-spissatus--day-oblique-natural--5ceec988c684c1ec/",
        import.meta.url,
    ));
    const coveragePath = process.env.CI_SPISSATUS_COVERAGE_PATH ?? join(
        captureDirectory,
        "coverage.png",
    );
    const coverageStatePath = process.env.CI_SPISSATUS_COVERAGE_STATE_PATH ??
        join(captureDirectory, "coverage.state.json");
    const rejectionPath = process.env.CI_SPISSATUS_REJECTION_PATH ?? join(
        captureDirectory,
        "rejection.json",
    );
    const rejection = existsSync(rejectionPath)
        ? JSON.parse(readFileSync(rejectionPath, "utf8"))
        : null;
    const captureSignature = rejection?.finalReadiness?.productionCameraSignature ??
        rejection?.coverageReadiness?.productionCameraSignature ??
        "27|64|43.52|0.02|natural|auto";
    const parsedCaptureCamera = parseProductionCameraSignature(captureSignature);
    const captureReferenceCamera = {
        // The authored cloud scene and the CPU helper use the benchmark's
        // explicit 180-degree reference view (zero local azimuth). The
        // renderer then embeds both owners and rays by camera yaw.
        azimuthRadians: 0,
        elevationRadians: degrees(parsedCaptureCamera.elevationDegrees),
        horizontalFovRadians: degrees(parsedCaptureCamera.horizontalFovDegrees),
        verticalFovRadians: degrees(parsedCaptureCamera.verticalFovDegrees),
        observerAltitudeKm: parsedCaptureCamera.observerAltitudeKm,
    };
    const captureYaw = cameraContractModule.cameraYawRadiansFromViewAzimuth(
        benchmarkCase.environment.viewAzimuth,
    );
    const captureTransform = rotateOwnerAndCamera(
        baseOwner,
        captureReferenceCamera,
        captureYaw,
    );
    const captureOwner = captureTransform.owner;
    const captureCamera = captureTransform.camera;
    const captureFrame = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        captureReferenceCamera,
    );
    const captureFrameOwner = captureFrame.ownerProjections.find((owner) =>
        owner.ownerIndex === candidate.ownerIndex);
    const coverageComparison = await readCoverageComparison({
        coveragePath,
        coverageStatePath,
        rejectionPath,
        decoded,
        owner: captureOwner,
        camera: captureCamera,
        cameraSignature: parsedCaptureCamera,
        threshold,
    });

    diagnostics = {
        diagnostic: "ci-spissatus-atlas-projection",
        readOnly: true,
        source: {
            volumeId,
            atlasFile: manifest.atlas.file,
            atlasResolution: decoded.resolution,
            densityByteThreshold: manifest.occupancy.densityByteThreshold,
            benchmarkCase: benchmarkCase.id,
            runtimeDiagnostics: runtime.diagnostics,
        },
        camera: {
            azimuthDegrees: camera.azimuthRadians * 180 / Math.PI,
            elevationDegrees: benchmarkCase.environment.viewElevation,
            horizontalFovDegrees: benchmarkCase.environment.horizontalFov,
            verticalFovDegrees: benchmarkCase.environment.verticalFov,
            observerAltitudeKm: camera.observerAltitudeKm,
            frameSupportFraction: frame.supportFraction,
            frameVisibleOwnerCount: frame.visibleOwnerCount,
            selectedOwnerIndex: candidate.ownerIndex,
            selectedOwnerFrame: frameOwnerSummary(candidate.frameOwner),
        },
        captureCamera: {
            ...parsedCaptureCamera,
            azimuthDegrees: captureCamera.azimuthRadians * 180 / Math.PI,
            elevationDegrees: parsedCaptureCamera.elevationDegrees,
            horizontalFovDegrees: parsedCaptureCamera.horizontalFovDegrees,
            verticalFovDegrees: parsedCaptureCamera.verticalFovDegrees,
            observerAltitudeKm: captureCamera.observerAltitudeKm,
            selectedOwnerFrame: frameOwnerSummary(captureFrameOwner),
        },
        captureOwner: ownerSummary(captureOwner),
        owner: ownerSummary(baseOwner),
        threeD: {
            geometry,
            connectivity: {
                ...scaleOneConnectivity,
                ...componentBounds,
            },
        },
        ground: projectionMetrics(groundAnalysis),
        production: baseView.production,
        nativePixelSilhouette: baseView.nativePixelSilhouette,
        nativeRadialSilhouette: baseView.nativeRadialSilhouette,
        sameYawInvariance,
        coverageComparison,
        views,
    };
} finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);

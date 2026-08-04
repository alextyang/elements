const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

export const HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT = Object.freeze({
    analysisWidth: 256,
    radialCenterSteps: 7,
    radialBins: 56,
    radialCoverageEnergyFraction: 0.9,
    minimumBroadBandRms: 0.012,
    maximumRadialExplainedVariance: 0.18,
    minimumRadialExplainedCoverage: 0.1,
    maximumFineToBroadRatioForRadialRejection: 0.38,
    minimumFineToBroadRatio: 0.4,
    minimumFineTextureFraction: 0.1,
    // The old texture fraction counts every matte pixel.  On sparse high
    // clouds that makes an antialiased silhouette look like material detail.
    // These local thresholds are deliberately expressed in display-linear
    // luminance units, just like the existing fine RMS gate.
    minimumCloudInteriorTextureFraction: 0.08,
    minimumCloudInteriorFineRms: 0.0035,
    minimumCloudInteriorFineToBroadRatio: 0.18,
    minimumCloudMaskResidualTextureFraction: 0.12,
    minimumCloudMaskResidualRms: 0.0025,
    minimumCloudMaskResidualFineToBroadRatio: 0.2,
    minimumCloudCoreSupportFraction: 0.0005,
    cloudEdgeBlurRadius: 2,
    // A renderer-owned 1-T matte must contain measurable cloud support. A
    // tiny dither residue from an empty coverage frame is not evidence.
    minimumCloudSupportFraction: 0.002,
});

/**
 * Convert the renderer's coverage debug PNG (1 - T, after display
 * encoding) into a soft cloud-support weight. The only removed floor is the
 * known one-byte display dither; no sky colour, edge, or geometry inference is
 * performed here.
 */
export const cloudMaskFromCoverage = ({
    data,
    width,
    height,
    channels,
}) => {
    if (!(width > 0 && height > 0 && channels >= 3) ||
        data.length < width * height * channels) {
        throw new Error("Cloud coverage matte pixels are incomplete.");
    }
    const mask = new Float64Array(width * height);
    const ditherFloor = 2 / 255;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
        const offset = pixel * channels;
        const luminance = (
            0.2126 * data[offset] +
            0.7152 * data[offset + 1] +
            0.0722 * data[offset + 2]
        ) / 255;
        mask[pixel] = Math.min(1, Math.max(0,
            (luminance - ditherFloor) / (1 - ditherFloor)));
    }
    return mask;
};

const boxBlurPass = (source, width, height, radius, horizontal) => {
    const target = new Float64Array(source.length);
    const major = horizontal ? height : width;
    const minor = horizontal ? width : height;
    for (let line = 0; line < major; line += 1) {
        let sum = 0;
        for (let offset = -radius; offset <= radius; offset += 1) {
            const coordinate = clamp(offset, 0, minor - 1);
            const index = horizontal
                ? line * width + coordinate
                : coordinate * width + line;
            sum += source[index];
        }
        for (let coordinate = 0; coordinate < minor; coordinate += 1) {
            const index = horizontal
                ? line * width + coordinate
                : coordinate * width + line;
            target[index] = sum / (radius * 2 + 1);
            const departing = clamp(coordinate - radius, 0, minor - 1);
            const arriving = clamp(coordinate + radius + 1, 0, minor - 1);
            const departingIndex = horizontal
                ? line * width + departing
                : departing * width + line;
            const arrivingIndex = horizontal
                ? line * width + arriving
                : arriving * width + line;
            sum += source[arrivingIndex] - source[departingIndex];
        }
    }
    return target;
};

const boxBlur = (source, width, height, radius) => boxBlurPass(
    boxBlurPass(source, width, height, radius, true),
    width,
    height,
    radius,
    false,
);

// The matte is renderer-owned support, not a segmentation mask.  We only use
// its local continuity to identify silhouette pixels.  This keeps the
// qualifier independent of sky colour and avoids introducing a second cloud
// detector in the image gate.
const cloudLocalSupport = (cloudMask, width, height, contract) => {
    if (!cloudMask) return undefined;
    const radius = Math.max(1, Math.floor(contract.cloudEdgeBlurRadius));
    const near = boxBlur(cloudMask, width, height, 1);
    const edgeBlur = boxBlur(cloudMask, width, height, radius);
    const coreWeight = new Float64Array(cloudMask.length);
    const edgeWeight = new Float64Array(cloudMask.length);
    const maskGradient = new Float64Array(cloudMask.length);
    let maskWeight = 0;
    let coreSupport = 0;
    let edgeSupport = 0;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            const weight = Math.max(0, cloudMask[index]);
            const left = cloudMask[y * width + Math.max(0, x - 1)];
            const right = cloudMask[y * width + Math.min(width - 1, x + 1)];
            const above = cloudMask[Math.max(0, y - 1) * width + x];
            const below = cloudMask[Math.min(height - 1, y + 1) * width + x];
            const gradient = Math.hypot((right - left) * 0.5,
                (below - above) * 0.5);
            // A broad local-vs-near matte change marks a silhouette even when
            // the alpha transition is several display pixels wide.  The
            // gradient term catches one-pixel fibres without making a full
            // binary support map a hard requirement.
            const edgeSignal = Math.abs(cloudMask[index] - edgeBlur[index]);
            const localEdge = clamp(edgeSignal * 4.0 + gradient * 1.5, 0, 1);
            const edge = weight * localEdge;
            const core = weight * (1 - localEdge);
            coreWeight[index] = core;
            edgeWeight[index] = edge;
            maskGradient[index] = gradient;
            maskWeight += weight;
            coreSupport += core;
            edgeSupport += edge;
        }
    }
    return {
        coreWeight,
        edgeWeight,
        maskFine: cloudMask.map((value, index) => value - near[index]),
        maskFineFar: cloudMask.map((value, index) => value - edgeBlur[index]),
        maskGradient,
        maskWeight,
        coreSupport,
        edgeSupport,
    };
};

const rootMeanSquare = (values, weights) => {
    if (!weights) {
        return Math.sqrt(
            values.reduce((sum, value) => sum + value * value, 0) /
                Math.max(1, values.length),
        );
    }
    let weightedEnergy = 0;
    let totalWeight = 0;
    for (let index = 0; index < values.length; index += 1) {
        const weight = Math.max(0, weights[index]);
        weightedEnergy += weight * values[index] * values[index];
        totalWeight += weight;
    }
    return Math.sqrt(weightedEnergy / Math.max(1e-12, totalWeight));
};

const measureRadialEvidence = (values, width, height, contract, weights) => {
    let totalEnergy = 0;
    if (weights) {
        for (let index = 0; index < values.length; index += 1) {
            const weight = Math.max(0, weights[index]);
            totalEnergy += weight * values[index] * values[index];
        }
    } else {
        totalEnergy = values.reduce(
            (sum, value) => sum + value * value, 0);
    }
    if (!(totalEnergy > 1e-12)) {
        return {
            explainedVariance: 0,
            explainedCoverage: 0,
        };
    }
    let maximum = 0;
    let maximumCoverage = 0;
    const steps = contract.radialCenterSteps;
    for (let centerYIndex = 0; centerYIndex < steps; centerYIndex += 1) {
        // Include a quarter-frame exterior margin: atmospheric cascade rings
        // commonly originate just outside the visible camera frustum.
        const centerY = (-0.25 + 1.5 * centerYIndex / (steps - 1)) * height;
        for (let centerXIndex = 0; centerXIndex < steps; centerXIndex += 1) {
            const centerX = (-0.25 + 1.5 * centerXIndex / (steps - 1)) * width;
            const maximumRadius = Math.hypot(
                Math.max(Math.abs(centerX), Math.abs(width - centerX)),
                Math.max(Math.abs(centerY), Math.abs(height - centerY)),
            );
            const sums = new Float64Array(contract.radialBins);
            const counts = weights
                ? new Float64Array(contract.radialBins)
                : new Uint32Array(contract.radialBins);
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const radius = Math.hypot(x - centerX, y - centerY);
                    const bin = Math.min(
                        contract.radialBins - 1,
                        Math.floor(radius / maximumRadius * contract.radialBins),
                    );
                    const index = y * width + x;
                    const value = values[index];
                    const weight = weights ? Math.max(0, weights[index]) : 1;
                    sums[bin] += weight * value;
                    counts[bin] += weight;
                }
            }
            let explainedEnergy = 0;
            const binEnergies = [];
            for (let bin = 0; bin < contract.radialBins; bin += 1) {
                if (counts[bin] > 0) {
                    const energy =
                        sums[bin] * sums[bin] / counts[bin];
                    explainedEnergy += energy;
                    binEnergies.push({
                        count: counts[bin],
                        energy,
                    });
                }
            }
            const explainedVariance = explainedEnergy / totalEnergy;
            if (explainedVariance > maximum) {
                maximum = explainedVariance;
                binEnergies.sort((left, right) =>
                    right.energy - left.energy);
                const coverageEnergy =
                    explainedEnergy *
                    contract.radialCoverageEnergyFraction;
                let accumulatedEnergy = 0;
                let coveredPixels = 0;
                for (const bin of binEnergies) {
                    if (accumulatedEnergy >= coverageEnergy) break;
                    accumulatedEnergy += bin.energy;
                    coveredPixels += bin.count;
                }
                maximumCoverage = weights
                    ? coveredPixels / Math.max(1e-12,
                        weights.reduce((sum, value) =>
                            sum + Math.max(0, value), 0))
                    : coveredPixels / values.length;
            }
        }
    }
    return {
        explainedVariance: maximum,
        explainedCoverage: maximumCoverage,
    };
};

export const measureCloudPreviewImage = ({
    data,
    width,
    height,
    channels,
    cloudMask,
}, contract = HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT) => {
    if (!(width > 0 && height > 0 && channels >= 3) ||
        data.length < width * height * channels) {
        throw new Error("Cloud preview image pixels are incomplete.");
    }
    if (cloudMask !== undefined &&
        (!(cloudMask instanceof Float64Array || cloudMask instanceof Float32Array) ||
            cloudMask.length !== width * height)) {
        throw new Error("Cloud preview cloud matte dimensions are incomplete.");
    }
    const luminance = new Float64Array(width * height);
    for (let pixel = 0; pixel < luminance.length; pixel += 1) {
        const offset = pixel * channels;
        luminance[pixel] = (
            0.2126 * data[offset] +
            0.7152 * data[offset + 1] +
            0.0722 * data[offset + 2]
        ) / 255;
    }
    const fineBlur = boxBlur(luminance, width, height, 1);
    const broadNear = boxBlur(luminance, width, height, 4);
    const broadFar = boxBlur(luminance, width, height, 18);
    const fine = new Float64Array(luminance.length);
    const broad = new Float64Array(luminance.length);
    const localSupport = cloudLocalSupport(
        cloudMask, width, height, contract);
    let fineTexturePixels = 0;
    let cloudSupportWeight = 0;
    for (let index = 0; index < luminance.length; index += 1) {
        fine[index] = luminance[index] - fineBlur[index];
        broad[index] = broadNear[index] - broadFar[index];
        const weight = cloudMask ? Math.max(0, cloudMask[index]) : 1;
        cloudSupportWeight += weight;
        if (Math.abs(fine[index]) >= 1.5 / 255) {
            fineTexturePixels += cloudMask ? weight : 1;
        }
    }
    const fineRms = rootMeanSquare(fine, cloudMask);
    const broadBandRms = rootMeanSquare(broad, cloudMask);
    const radialEvidence = measureRadialEvidence(
        broad, width, height, contract, cloudMask);
    const metrics = {
        fineRms,
        broadBandRms,
        fineTextureFraction: fineTexturePixels /
            Math.max(1e-12, cloudSupportWeight || luminance.length),
        fineToBroadRatio: fineRms / Math.max(1e-9, broadBandRms),
        radialExplainedVariance: radialEvidence.explainedVariance,
        radialExplainedCoverage: radialEvidence.explainedCoverage,
        cloudMaskUsed: cloudMask !== undefined,
        cloudSupportFraction: cloudSupportWeight / luminance.length,
    };
    if (!localSupport) return metrics;

    // Fit the part of the fine signal that can be explained by the matte's
    // own silhouette transition.  The residual is useful for genuinely thin
    // fibrils, where morphological erosion leaves no conventional core but
    // internal luminance variation is still independent of the edge.
    let maskEdgeEnergy = 0;
    let maskEdgeFineCovariance = 0;
    let maskEdgeFarEnergy = 0;
    let maskEdgeNearFar = 0;
    let maskEdgeFarFineCovariance = 0;
    let maskEdgeFineEnergy = 0;
    for (let index = 0; index < luminance.length; index += 1) {
        const edge = localSupport.edgeWeight[index];
        const maskEdge = localSupport.maskFine[index];
        const maskEdgeFar = localSupport.maskFineFar[index];
        maskEdgeEnergy += edge * maskEdge * maskEdge;
        maskEdgeFineCovariance += edge * fine[index] * maskEdge;
        maskEdgeFarEnergy += edge * maskEdgeFar * maskEdgeFar;
        maskEdgeNearFar += edge * maskEdge * maskEdgeFar;
        maskEdgeFarFineCovariance += edge * fine[index] * maskEdgeFar;
        maskEdgeFineEnergy += edge * fine[index] * fine[index];
    }
    // A broad matte transition can leave a different fine residual than a
    // one-pixel transition.  Fit both deterministic matte bases together so
    // this second-order silhouette mismatch cannot be mistaken for texture.
    const determinant = maskEdgeEnergy * maskEdgeFarEnergy -
        maskEdgeNearFar * maskEdgeNearFar;
    const edgeProjection = determinant > 1e-12
        ? (maskEdgeFineCovariance * maskEdgeFarEnergy -
            maskEdgeFarFineCovariance * maskEdgeNearFar) / determinant
        : maskEdgeFineCovariance / Math.max(1e-12, maskEdgeEnergy);
    const farEdgeProjection = determinant > 1e-12
        ? (maskEdgeFarFineCovariance * maskEdgeEnergy -
            maskEdgeFineCovariance * maskEdgeNearFar) / determinant
        : 0;
    let interiorFineEnergy = 0;
    let interiorBroadEnergy = 0;
    let interiorFinePixels = 0;
    let coreSupport = 0;
    let residualFineEnergy = 0;
    let residualBroadEnergy = 0;
    let residualFinePixels = 0;
    let residualWeight = 0;
    for (let index = 0; index < luminance.length; index += 1) {
        const core = localSupport.coreWeight[index];
        const edge = localSupport.edgeWeight[index];
        const maskEdge = localSupport.maskFine[index];
        const residual = fine[index] - edgeProjection * maskEdge -
            farEdgeProjection * localSupport.maskFineFar[index];
        const absFine = Math.abs(fine[index]);
        const absResidual = Math.abs(residual);
        interiorFineEnergy += core * fine[index] * fine[index];
        interiorBroadEnergy += core * broad[index] * broad[index];
        coreSupport += core;
        if (absFine >= 1.5 / 255) interiorFinePixels += core;
        residualFineEnergy += (core + edge) * residual * residual;
        residualBroadEnergy += (core + edge) * broad[index] * broad[index];
        residualWeight += core + edge;
        if (absResidual >= 1.5 / 255) residualFinePixels += core + edge;
    }
    const coreFraction = coreSupport / Math.max(1e-12, cloudSupportWeight);
    const interiorFineRms = Math.sqrt(interiorFineEnergy /
        Math.max(1e-12, coreSupport));
    const interiorBroadRms = Math.sqrt(interiorBroadEnergy /
        Math.max(1e-12, coreSupport));
    const residualRms = Math.sqrt(residualFineEnergy /
        Math.max(1e-12, residualWeight));
    const residualBroadRms = Math.sqrt(residualBroadEnergy /
        Math.max(1e-12, residualWeight));
    metrics.cloudCoreSupportFraction = coreSupport / luminance.length;
    metrics.cloudCoreFraction = coreFraction;
    metrics.cloudEdgeFraction = localSupport.edgeSupport /
        Math.max(1e-12, cloudSupportWeight);
    metrics.cloudEdgeFineFraction = Math.sqrt(maskEdgeFineEnergy /
        Math.max(1e-12, localSupport.edgeSupport));
    metrics.cloudInteriorFineRms = interiorFineRms;
    metrics.cloudInteriorBroadRms = interiorBroadRms;
    metrics.cloudInteriorFineToBroadRatio = interiorFineRms /
        Math.max(1e-9, interiorBroadRms);
    metrics.cloudInteriorTextureFraction = interiorFinePixels /
        Math.max(1e-12, coreSupport);
    metrics.cloudMaskResidualRms = residualRms;
    metrics.cloudMaskResidualFineToBroadRatio = residualRms /
        Math.max(1e-9, residualBroadRms);
    metrics.cloudMaskResidualTextureFraction = residualFinePixels /
        Math.max(1e-12, residualWeight);
    metrics.cloudMaskEdgeProjection = Number.isFinite(edgeProjection)
        ? edgeProjection : 0;
    return metrics;
};

export const evaluateHighCloudPreviewImage = (
    metrics,
    {
        contract = HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT,
        requireScaleSeparatedStructure = true,
        requireCloudMask = false,
    } = {},
) => {
    const baseFinite = [
        metrics.fineRms,
        metrics.broadBandRms,
        metrics.fineTextureFraction,
        metrics.fineToBroadRatio,
        metrics.radialExplainedVariance,
        metrics.radialExplainedCoverage,
    ].every(Number.isFinite);
    const cloudMaskUsed = metrics.cloudMaskUsed === true;
    const localMetricKeys = [
        "cloudCoreSupportFraction",
        "cloudCoreFraction",
        "cloudEdgeFraction",
        "cloudEdgeFineFraction",
        "cloudInteriorFineRms",
        "cloudInteriorBroadRms",
        "cloudInteriorFineToBroadRatio",
        "cloudInteriorTextureFraction",
        "cloudMaskResidualRms",
        "cloudMaskResidualFineToBroadRatio",
        "cloudMaskResidualTextureFraction",
        "cloudMaskEdgeProjection",
    ];
    const localEvidenceFinite = !cloudMaskUsed || localMetricKeys.every(
        (key) => Number.isFinite(metrics[key]));
    const finite = baseFinite && localEvidenceFinite;
    const cloudSupportReady = !requireCloudMask || (
        cloudMaskUsed &&
        Number.isFinite(metrics.cloudSupportFraction) &&
        metrics.cloudSupportFraction >= contract.minimumCloudSupportFraction
    );
    // High explained variance alone can be produced by a localized circular
    // foreground element. Cascade bands must also explain broad structure over
    // a material fraction of the frame.
    const radialArtifact = finite &&
        metrics.broadBandRms >= contract.minimumBroadBandRms &&
        metrics.radialExplainedVariance >=
            contract.maximumRadialExplainedVariance &&
        metrics.radialExplainedCoverage >=
            contract.minimumRadialExplainedCoverage &&
        metrics.fineToBroadRatio <=
            contract.maximumFineToBroadRatioForRadialRejection;
    // A volume may be optically thin, but its final pixels still need either
    // scale-separated detail relative to the macroshape or sufficiently broad
    // fine-detail support. This rejects smooth analytic plates whose only
    // high-frequency signal is their antialiased silhouette.
    const scaleSeparatedStructureReady = finite && (
        metrics.fineToBroadRatio >= contract.minimumFineToBroadRatio ||
        metrics.fineTextureFraction >= contract.minimumFineTextureFraction
    );
    // Keep the radial-artifact threshold itself unchanged. A cloud can have a
    // circular macro-support while still qualifying through the independent
    // cloud-local scale/detail gate; a smooth radial cloud cannot.
    const interiorMaterialReady = cloudMaskUsed && localEvidenceFinite &&
        metrics.cloudCoreSupportFraction >=
            contract.minimumCloudCoreSupportFraction &&
        metrics.cloudInteriorFineRms >= contract.minimumCloudInteriorFineRms &&
        metrics.cloudInteriorFineToBroadRatio >=
            contract.minimumCloudInteriorFineToBroadRatio &&
        metrics.cloudInteriorTextureFraction >=
            contract.minimumCloudInteriorTextureFraction;
    // Thin fibres can be edge-only at the display resolution.  Accept their
    // normalized residual only when enough of the fine signal survives the
    // matte-edge projection; a silhouette-only patch projects away instead.
    const thinMaterialReady = cloudMaskUsed && localEvidenceFinite &&
        metrics.cloudMaskResidualRms >= contract.minimumCloudMaskResidualRms &&
        metrics.cloudMaskResidualFineToBroadRatio >=
            contract.minimumCloudMaskResidualFineToBroadRatio &&
        metrics.cloudMaskResidualTextureFraction >=
            contract.minimumCloudMaskResidualTextureFraction;
    const cloudLocalStructureReady = !cloudMaskUsed
        ? scaleSeparatedStructureReady
        : scaleSeparatedStructureReady &&
            (interiorMaterialReady || thinMaterialReady);
    // With a renderer matte, silhouette-only evidence is never sufficient for
    // a structured high-cloud capture, even when the broad radial test is
    // quiet.  The explicit smooth-veil profile is the sole waiver for this
    // local material gate; radial-artifact rejection remains independent.
    const cloudLocalGateReady = !cloudMaskUsed ||
        cloudLocalStructureReady || !requireScaleSeparatedStructure;
    return {
        ready: finite && cloudSupportReady && cloudLocalGateReady &&
            (!radialArtifact || cloudLocalStructureReady) &&
            (!requireScaleSeparatedStructure || scaleSeparatedStructureReady),
        finite,
        cloudMaskUsed,
        cloudSupportReady,
        cloudLocalStructureReady,
        matteMissing: requireCloudMask && !cloudMaskUsed,
        radialArtifact,
        scaleSeparatedStructureReady,
        metrics,
    };
};

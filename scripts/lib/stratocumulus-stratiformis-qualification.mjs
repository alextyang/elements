/**
 * CPU-only qualification contract for a resolved Stratocumulus stratiformis
 * cell field.
 *
 * The atlas generator deliberately does not import this module. It is an
 * independent acceptance surface for a future extractor to populate from the
 * emitted density field. Keeping the observations explicit also makes the
 * topology tests deterministic: a renderer change cannot silently redefine
 * what counts as a cell, channel, or retained reconstruction feature.
 *
 * Cell coordinates and heights may use any one consistent physical unit.
 * A multiscale observation is made over the same physical footprint after a
 * scale-2 or scale-4 reconstruction/downsample. Condensate mass is measured in
 * consistent units and must account for voxel volume.
 */

export const STRATOCUMULUS_STRATIFORMIS_QUALIFICATION_CONTRACT = Object.freeze({
    // A production atlas exemplar must expose a field, not a handful of
    // hero puffs. Twenty-four cells still leave several resolvable circulation
    // domains after the canonical 48^3 source is reduced by four.
    minimumResolvedCellCount: 24,
    minimumVerticalReliefToMedianThickness: 0.12,
    maximumVerticalReliefToMedianThickness: 1.35,
    minimumThicknessCoefficientVariation: 0.075,
    maximumThicknessCoefficientVariation: 0.68,
    minimumNaturalNeighborCycleRankDensity: 0.14,
    minimumNaturalNeighborCycleNodeFraction: 0.50,
    maximumNaturalNeighborLeafFraction: 0.30,
    minimumClearChannelWidthCoefficientVariation: 0.10,
    minimumClearChannelLengthCoefficientVariation: 0.14,
    minimumClearChannelOrientationEntropy: 0.48,
    minimumScale2CellCountRetention: 0.72,
    minimumScale4CellCountRetention: 0.46,
    minimumScale2MassRetention: 0.86,
    minimumScale4MassRetention: 0.68,
    maximumUndersideReliefToMedianThickness: 0.32,
    minimumCirculationCellSurfaceFraction: 1,
    minimumCirculationRibbonToNaturalEdgeFraction: 0.78,
    minimumColdPoolCavityToChannelFraction: 0.24,
    minimumSurfaceHierarchyLevelCount: 3,
    maximumLegacyOvalOrCapsuleCount: 0,
    minimumTopologyInteriorClearance: 0.0039,
    maximumAnalyticUndersideAmplitude: 0.002,
});

const finite = (name, value) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
    return value;
};

const positive = (name, value) => {
    finite(name, value);
    if (!(value > 0)) throw new Error(`${name} must be positive`);
    return value;
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);

const median = (values) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) * 0.5;
};

const coefficientOfVariation = (values) => {
    const average = mean(values);
    if (values.length < 2 || average <= 1e-12) return 0;
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2))) /
        average;
};

const edgeKey = (left, right) => left < right
    ? `${left}:${right}` : `${right}:${left}`;

/**
 * Builds the Gabriel graph of cell-core centroids. Gabriel adjacency is a
 * conservative natural-neighbor relation: an edge exists only when the circle
 * having the two centroids as its diameter contains no third centroid. Unlike
 * k-nearest-neighbor graphs, it does not manufacture cycles by construction.
 */
export const buildStratocumulusNaturalNeighborGraph = (cells) => {
    const points = cells.map((cell, index) => {
        const x = finite(`cell ${index} centerX`, cell.centerX);
        const y = finite(`cell ${index} centerY`, cell.centerY);
        return { x, y };
    });
    for (let left = 0; left < points.length; left += 1) {
        for (let right = left + 1; right < points.length; right += 1) {
            if (Math.hypot(points[left].x - points[right].x,
                points[left].y - points[right].y) <= 1e-9) {
                throw new Error("resolved cell centroids must be unique");
            }
        }
    }

    const edges = [];
    for (let left = 0; left < points.length; left += 1) {
        for (let right = left + 1; right < points.length; right += 1) {
            const midpointX = (points[left].x + points[right].x) * 0.5;
            const midpointY = (points[left].y + points[right].y) * 0.5;
            const radiusSquared = (points[left].x - points[right].x) ** 2 * 0.25 +
                (points[left].y - points[right].y) ** 2 * 0.25;
            const tolerance = Math.max(1e-12, radiusSquared * 1e-10);
            const blocked = points.some((point, index) => index !== left &&
                index !== right &&
                (point.x - midpointX) ** 2 + (point.y - midpointY) ** 2 <
                    radiusSquared - tolerance);
            if (!blocked) edges.push([left, right]);
        }
    }

    const adjacency = Array.from({ length: points.length }, () => []);
    for (const [left, right] of edges) {
        adjacency[left].push(right);
        adjacency[right].push(left);
    }
    let connectedComponentCount = 0;
    const visited = new Uint8Array(points.length);
    for (let start = 0; start < points.length; start += 1) {
        if (visited[start]) continue;
        connectedComponentCount += 1;
        const stack = [start];
        visited[start] = 1;
        while (stack.length > 0) {
            const current = stack.pop();
            for (const neighbor of adjacency[current]) {
                if (visited[neighbor]) continue;
                visited[neighbor] = 1;
                stack.push(neighbor);
            }
        }
    }

    // Tarjan bridge detection identifies the nodes that genuinely participate
    // in cycles. Edge count alone would let a dense knot hide a tree-like deck.
    const discovery = new Int32Array(points.length).fill(-1);
    const low = new Int32Array(points.length).fill(-1);
    const bridges = new Set();
    let time = 0;
    const visit = (node, parent) => {
        discovery[node] = time;
        low[node] = time;
        time += 1;
        for (const neighbor of adjacency[node]) {
            if (neighbor === parent) continue;
            if (discovery[neighbor] >= 0) {
                low[node] = Math.min(low[node], discovery[neighbor]);
                continue;
            }
            visit(neighbor, node);
            low[node] = Math.min(low[node], low[neighbor]);
            if (low[neighbor] > discovery[node]) {
                bridges.add(edgeKey(node, neighbor));
            }
        }
    };
    for (let index = 0; index < points.length; index += 1) {
        if (discovery[index] < 0) visit(index, -1);
    }
    const cycleNodes = new Set();
    for (const [left, right] of edges) {
        if (bridges.has(edgeKey(left, right))) continue;
        cycleNodes.add(left);
        cycleNodes.add(right);
    }
    const cycleRank = Math.max(0,
        edges.length - points.length + connectedComponentCount);
    const leafCount = adjacency.filter((neighbors) => neighbors.length <= 1).length;
    return {
        edges,
        connectedComponentCount,
        cycleRank,
        cycleRankDensity: cycleRank / Math.max(1, points.length),
        cycleNodeFraction: cycleNodes.size / Math.max(1, points.length),
        leafFraction: leafCount / Math.max(1, points.length),
        meanDegree: edges.length * 2 / Math.max(1, points.length),
    };
};

const clearChannelMetrics = (channels) => {
    const widths = channels.map((channel, index) =>
        positive(`clear channel ${index} width`, channel.width));
    const lengths = channels.map((channel, index) =>
        positive(`clear channel ${index} length`, channel.length));
    const binCount = 8;
    const weights = new Float64Array(binCount);
    for (let index = 0; index < channels.length; index += 1) {
        const orientation = finite(`clear channel ${index} orientationRadians`,
            channels[index].orientationRadians);
        // Channel orientation is axial, so theta and theta + pi are equal.
        const axial = ((orientation % Math.PI) + Math.PI) % Math.PI;
        const bin = Math.min(binCount - 1, Math.floor(axial / Math.PI * binCount));
        weights[bin] += lengths[index];
    }
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let entropy = 0;
    for (const weight of weights) {
        if (weight <= 0) continue;
        const probability = weight / Math.max(1e-12, totalWeight);
        entropy -= probability * Math.log(probability);
    }
    return {
        count: channels.length,
        widthCoefficientVariation: coefficientOfVariation(widths),
        lengthCoefficientVariation: coefficientOfVariation(lengths),
        orientationEntropy: entropy / Math.log(binCount),
    };
};

const scaleObservation = (observations, scale) => {
    const observation = observations[String(scale)] ?? observations[scale];
    if (!observation) throw new Error(`missing scale-${scale} observation`);
    const resolvedCellCount = finite(`scale-${scale} resolvedCellCount`,
        observation.resolvedCellCount);
    if (!Number.isInteger(resolvedCellCount) || resolvedCellCount < 0) {
        throw new Error(`scale-${scale} resolvedCellCount must be a nonnegative integer`);
    }
    return {
        resolvedCellCount,
        condensateMass: positive(`scale-${scale} condensateMass`,
            observation.condensateMass),
    };
};

const nonnegativeInteger = (name, value) => {
    finite(name, value);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a nonnegative integer`);
    }
    return value;
};

const surfaceReconstructionMetrics = (surface) => {
    if (!surface) {
        throw new Error("qualification requires surfaceReconstruction");
    }
    return {
        cellSurfaceCount: nonnegativeInteger(
            "surfaceReconstruction.cellSurfaceCount",
            surface.cellSurfaceCount,
        ),
        circulationRibbonCount: nonnegativeInteger(
            "surfaceReconstruction.circulationRibbonCount",
            surface.circulationRibbonCount,
        ),
        coldPoolCavityCount: nonnegativeInteger(
            "surfaceReconstruction.coldPoolCavityCount",
            surface.coldPoolCavityCount,
        ),
        hierarchyLevelCount: nonnegativeInteger(
            "surfaceReconstruction.hierarchyLevelCount",
            surface.hierarchyLevelCount,
        ),
        legacyEllipsoidCount: nonnegativeInteger(
            "surfaceReconstruction.legacyEllipsoidCount",
            surface.legacyEllipsoidCount,
        ),
        legacyCapsuleCount: nonnegativeInteger(
            "surfaceReconstruction.legacyCapsuleCount",
            surface.legacyCapsuleCount,
        ),
        minimumInteriorClearance: positive(
            "surfaceReconstruction.minimumInteriorClearance",
            surface.minimumInteriorClearance,
        ),
        maximumUndersideAmplitude: positive(
            "surfaceReconstruction.maximumUndersideAmplitude",
            surface.maximumUndersideAmplitude,
        ),
    };
};

export const analyzeStratocumulusStratiformisQualification = (input) => {
    if (!input || !Array.isArray(input.cells) || !Array.isArray(input.clearChannels)) {
        throw new Error("qualification requires cells and clearChannels arrays");
    }
    const thicknesses = input.cells.map((cell, index) => {
        const base = finite(`cell ${index} baseHeight`, cell.baseHeight);
        const top = finite(`cell ${index} topHeight`, cell.topHeight);
        if (!(top > base)) throw new Error(`cell ${index} topHeight must exceed baseHeight`);
        return top - base;
    });
    const tops = input.cells.map((cell) => cell.topHeight);
    const bases = input.cells.map((cell) => cell.baseHeight);
    const medianThickness = median(thicknesses);
    const verticalRelief = input.cells.length === 0 ? 0 : Math.max(
        Math.max(...tops) - Math.min(...tops),
        Math.max(...bases) - Math.min(...bases),
    );
    const naturalNeighborGraph = buildStratocumulusNaturalNeighborGraph(input.cells);
    const channels = clearChannelMetrics(input.clearChannels);
    const surfaceReconstruction = surfaceReconstructionMetrics(
        input.surfaceReconstruction,
    );
    const native = scaleObservation(input.multiscale, 1);
    const scale2 = scaleObservation(input.multiscale, 2);
    const scale4 = scaleObservation(input.multiscale, 4);
    if (native.resolvedCellCount !== input.cells.length) {
        throw new Error("scale-1 resolvedCellCount must equal cells.length");
    }
    return {
        resolvedCellCount: input.cells.length,
        medianThickness,
        verticalRelief,
        verticalReliefToMedianThickness: verticalRelief /
            Math.max(1e-12, medianThickness),
        thicknessCoefficientVariation: coefficientOfVariation(thicknesses),
        undersideReliefToMedianThickness: input.cells.length === 0 ? 0 :
            (Math.max(...bases) - Math.min(...bases)) /
                Math.max(1e-12, medianThickness),
        naturalNeighborGraph,
        clearChannels: channels,
        surfaceReconstruction: {
            ...surfaceReconstruction,
            cellSurfaceFraction: surfaceReconstruction.cellSurfaceCount /
                Math.max(1, input.cells.length),
            circulationRibbonToNaturalEdgeFraction:
                surfaceReconstruction.circulationRibbonCount /
                    Math.max(1, naturalNeighborGraph.edges.length),
            coldPoolCavityToChannelFraction:
                surfaceReconstruction.coldPoolCavityCount /
                    Math.max(1, channels.count),
            legacyOvalOrCapsuleCount:
                surfaceReconstruction.legacyEllipsoidCount +
                surfaceReconstruction.legacyCapsuleCount,
        },
        scale2CellCountRetention: scale2.resolvedCellCount /
            Math.max(1, native.resolvedCellCount),
        scale4CellCountRetention: scale4.resolvedCellCount /
            Math.max(1, native.resolvedCellCount),
        scale2MassRetention: scale2.condensateMass / native.condensateMass,
        scale4MassRetention: scale4.condensateMass / native.condensateMass,
    };
};

export const qualifyStratocumulusStratiformis = (input) => {
    const metrics = analyzeStratocumulusStratiformisQualification(input);
    const contract = STRATOCUMULUS_STRATIFORMIS_QUALIFICATION_CONTRACT;
    const violations = [];
    if (metrics.resolvedCellCount < contract.minimumResolvedCellCount) {
        violations.push("insufficient-resolved-cell-population");
    }
    if (metrics.verticalReliefToMedianThickness <
        contract.minimumVerticalReliefToMedianThickness) {
        violations.push("deck-is-an-unrelieved-horizontal-slab");
    }
    if (metrics.verticalReliefToMedianThickness >
        contract.maximumVerticalReliefToMedianThickness) {
        violations.push("cell-relief-is-too-deep-for-stratocumulus");
    }
    if (metrics.thicknessCoefficientVariation <
        contract.minimumThicknessCoefficientVariation) {
        violations.push("cell-thickness-is-artificially-uniform");
    }
    if (metrics.thicknessCoefficientVariation >
        contract.maximumThicknessCoefficientVariation) {
        violations.push("cell-thickness-range-is-not-a-coherent-deck");
    }
    if (metrics.undersideReliefToMedianThickness >
        contract.maximumUndersideReliefToMedianThickness) {
        violations.push("condensation-underside-is-not-inversion-flat");
    }
    if (metrics.naturalNeighborGraph.cycleRankDensity <
        contract.minimumNaturalNeighborCycleRankDensity ||
        metrics.naturalNeighborGraph.cycleNodeFraction <
        contract.minimumNaturalNeighborCycleNodeFraction ||
        metrics.naturalNeighborGraph.leafFraction >
        contract.maximumNaturalNeighborLeafFraction) {
        violations.push("natural-neighbor-graph-is-a-tree-skeleton");
    }
    if (metrics.clearChannels.widthCoefficientVariation <
        contract.minimumClearChannelWidthCoefficientVariation ||
        metrics.clearChannels.lengthCoefficientVariation <
        contract.minimumClearChannelLengthCoefficientVariation ||
        metrics.clearChannels.orientationEntropy <
        contract.minimumClearChannelOrientationEntropy) {
        violations.push("clear-channels-are-too-regular-or-grid-like");
    }
    const surface = metrics.surfaceReconstruction;
    if (surface.cellSurfaceFraction <
            contract.minimumCirculationCellSurfaceFraction ||
        surface.circulationRibbonToNaturalEdgeFraction <
            contract.minimumCirculationRibbonToNaturalEdgeFraction ||
        surface.hierarchyLevelCount <
            contract.minimumSurfaceHierarchyLevelCount) {
        violations.push("circulation-surface-reconstruction-is-incomplete");
    }
    if (surface.coldPoolCavityToChannelFraction <
            contract.minimumColdPoolCavityToChannelFraction ||
        surface.minimumInteriorClearance <
            contract.minimumTopologyInteriorClearance) {
        violations.push("topology-derived-clearance-is-not-resolved");
    }
    if (surface.legacyOvalOrCapsuleCount >
            contract.maximumLegacyOvalOrCapsuleCount ||
        surface.maximumUndersideAmplitude >
            contract.maximumAnalyticUndersideAmplitude) {
        violations.push("legacy-oval-or-warped-underside-anatomy-remains");
    }
    if (metrics.scale2CellCountRetention < contract.minimumScale2CellCountRetention ||
        metrics.scale2MassRetention < contract.minimumScale2MassRetention) {
        violations.push("scale-2-reconstruction-loses-cell-structure");
    }
    if (metrics.scale4CellCountRetention < contract.minimumScale4CellCountRetention ||
        metrics.scale4MassRetention < contract.minimumScale4MassRetention) {
        violations.push("scale-4-reconstruction-loses-cell-structure");
    }
    return { valid: violations.length === 0, violations, metrics };
};

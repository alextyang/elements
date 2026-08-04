/**
 * Bounded Cirrus spissatus stochastic-source diagnostic.
 *
 * This harness samples the current finite spissatus source field directly. It
 * does not call `generateCloudMacroAtlas`, write a production asset, render a
 * frame, or modify the source module. The private model builder is exposed in
 * a short-lived data module so that the diagnostic can use the exact current
 * seed/primitive without copying the production source parameters. The normal
 * evaluator remains the public `evaluateCloudSpissatusStochasticField`
 * export.
 *
 * The JSON result is intentionally a diagnostic record rather than a gate:
 * the metrics are useful for comparing iterations, but no visual acceptance
 * claim is inferred from them.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DIAGNOSTIC_SCHEMA = "elements-ci-spissatus-stochastic-field-diagnostic";
const DIAGNOSTIC_VERSION = 1;
const DEFAULT_RESOLUTIONS = Object.freeze([24, 48, 96]);
const DEFAULT_VIEWS = Object.freeze([
    { id: "cross-altitude-oblique", direction: [1, 0.35, 0.20] },
    { id: "altitude-downwind-oblique", direction: [0.20, 1, 0.35] },
    { id: "downwind-cross-oblique", direction: [0.35, 0.20, 1] },
]);
const IWC_SATURATION_THRESHOLD = 1.85;

const clamp = (value, minimum = 0, maximum = 1) => Math.min(
    maximum,
    Math.max(minimum, value),
);

const finiteOrNull = (value) => Number.isFinite(value) ? value : null;

const sum = (values) => values.reduce((total, value) => total + value, 0);

const mean = (values) => values.length > 0 ? sum(values) / values.length : 0;

const variance = (values, average = mean(values)) => values.length > 0
    ? values.reduce((total, value) => total + (value - average) ** 2, 0) /
        values.length
    : 0;

const quantileSorted = (sorted, probability) => {
    if (sorted.length === 0) return null;
    const position = clamp(probability) * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    const amount = position - lower;
    return sorted[lower] * (1 - amount) + sorted[upper] * amount;
};

const quantile = (values, probability) => quantileSorted(
    [...values].sort((left, right) => left - right),
    probability,
);

const distribution = (values, saturationThreshold = null) => {
    const sorted = [...values].sort((left, right) => left - right);
    const average = mean(values);
    const varianceValue = variance(values, average);
    const standardDeviation = Math.sqrt(varianceValue);
    const skew = standardDeviation > 1e-12 && values.length > 0
        ? values.reduce(
            (total, value) => total + ((value - average) / standardDeviation) ** 3,
            0,
        ) / values.length
        : 0;
    return {
        count: values.length,
        mean: finiteOrNull(average),
        variance: finiteOrNull(varianceValue),
        standardDeviation: finiteOrNull(standardDeviation),
        coefficientOfVariation: finiteOrNull(standardDeviation /
            Math.max(1e-12, Math.abs(average))),
        skew: finiteOrNull(skew),
        quantiles: {
            p01: finiteOrNull(quantileSorted(sorted, 0.01)),
            p05: finiteOrNull(quantileSorted(sorted, 0.05)),
            p50: finiteOrNull(quantileSorted(sorted, 0.50)),
            p90: finiteOrNull(quantileSorted(sorted, 0.90)),
            p95: finiteOrNull(quantileSorted(sorted, 0.95)),
            p99: finiteOrNull(quantileSorted(sorted, 0.99)),
            maximum: finiteOrNull(quantileSorted(sorted, 1)),
        },
        tailFractions: {
            aboveP90: values.length > 0
                ? values.filter((value) => value >= quantileSorted(sorted, 0.90)).length /
                    values.length
                : 0,
            aboveP95: values.length > 0
                ? values.filter((value) => value >= quantileSorted(sorted, 0.95)).length /
                    values.length
                : 0,
            aboveP99: values.length > 0
                ? values.filter((value) => value >= quantileSorted(sorted, 0.99)).length /
                    values.length
                : 0,
        },
        ...(saturationThreshold === null ? {} : {
            saturationThreshold,
            saturationFraction: values.length > 0
                ? values.filter((value) => value >= saturationThreshold).length /
                    values.length
                : 0,
        }),
    };
};

const normalize = (vector) => {
    const length = Math.hypot(...vector);
    return length > 1e-12 ? vector.map((value) => value / length) : [0, 0, 1];
};

const dot = (left, right) => left[0] * right[0] + left[1] * right[1] +
    left[2] * right[2];

const cross = (left, right) => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];

const pearson = (left, right) => {
    if (left.length !== right.length || left.length === 0) return 0;
    const leftMean = mean(left);
    const rightMean = mean(right);
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftDelta = left[index] - leftMean;
        const rightDelta = right[index] - rightMean;
        numerator += leftDelta * rightDelta;
        leftEnergy += leftDelta * leftDelta;
        rightEnergy += rightDelta * rightDelta;
    }
    return numerator / Math.sqrt(Math.max(1e-20, leftEnergy * rightEnergy));
};

const index3 = (x, y, z, resolution) => (z * resolution + y) * resolution + x;

const decodeSeedAndManifest = (manifestPath) => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const volume = manifest.volumes?.find((candidate) =>
        candidate.id === "ci-spissatus");
    if (!volume || !Number.isInteger(volume.seed)) {
        throw new Error(`manifest has no integer ci-spissatus seed: ${manifestPath}`);
    }
    return { manifest, volume };
};

/**
 * Load the exact current private model builder without changing the checked-in
 * source.  The transformed module is a data URL and is garbage collectible;
 * no temporary file or generated asset is created.
 */
const loadCurrentModelApi = async () => {
    const sourceUrl = new URL("./lib/cloud-volume-atlas.mjs", import.meta.url);
    let source = readFileSync(sourceUrl, "utf8");
    if (!source.includes("const VOLUME_CONFIGS = [") ||
        !source.includes("const buildMacroModel = (config, seed) =>")) {
        throw new Error("cloud-volume-atlas.mjs private model contract changed");
    }
    source = source
        .replace("const VOLUME_CONFIGS = [", "export const VOLUME_CONFIGS = [")
        .replace(
            "const buildMacroModel = (config, seed) =>",
            "export const buildMacroModel = (config, seed) =>",
        )
        // A data URL has no relative base. Resolve only the four source
        // foundation imports; node: imports remain untouched.
        .replace(/from\s+"(\.\.?\/[^\"]+)"/g, (match, specifier) =>
            `from "${new URL(specifier, sourceUrl).href}"`,
        );
    const transformed = await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
    );
    const publicApi = await import("./lib/cloud-volume-atlas.mjs");
    return { transformed, publicApi };
};

const createRawEllipsoidPrior = (point, primitive) => {
    const dx = point[0] - primitive.center[0];
    const dz = point[2] - primitive.center[2];
    const cosine = Math.cos(primitive.rotation ?? 0);
    const sine = Math.sin(primitive.rotation ?? 0);
    const localX = dx * cosine + dz * sine;
    const localZ = -dx * sine + dz * cosine;
    const normalized = [
        localX / Math.max(1e-9, primitive.radii[0]),
        (point[1] - primitive.center[1]) / Math.max(1e-9, primitive.radii[1]),
        localZ / Math.max(1e-9, primitive.radii[2]),
    ];
    const radius = Math.hypot(...normalized);
    return { radius, inside: radius <= 1 ? 1 : 0 };
};

const componentSummary = (occupied, iwc, resolution) => {
    const labels = new Uint8Array(occupied.length);
    const queue = new Int32Array(occupied.length);
    const components = [];
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || labels[start]) continue;
        let head = 0;
        let tail = 0;
        let mass = 0;
        labels[start] = 1;
        queue[tail++] = start;
        while (head < tail) {
            const index = queue[head++];
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            mass += iwc[index];
            const visit = (neighbor) => {
                if (neighbor < 0 || !occupied[neighbor] || labels[neighbor]) return;
                labels[neighbor] = 1;
                queue[tail++] = neighbor;
            };
            if (x > 0) visit(index - 1);
            if (x + 1 < resolution) visit(index + 1);
            if (y > 0) visit(index - resolution);
            if (y + 1 < resolution) visit(index + resolution);
            if (z > 0) visit(index - resolution * resolution);
            if (z + 1 < resolution) visit(index + resolution * resolution);
        }
        components.push({ voxels: tail, mass });
    }
    components.sort((left, right) => right.voxels - left.voxels);
    const occupiedVoxels = components.reduce((total, component) =>
        total + component.voxels, 0);
    const occupiedMass = components.reduce((total, component) =>
        total + component.mass, 0);
    // A scale-aware dust threshold keeps tiny quantization islands visible in
    // the report without pretending that there is a physical dust definition.
    const dustVoxelThreshold = Math.max(8, Math.ceil(resolution ** 3 * 0.00002));
    const dust = components.filter((component) =>
        component.voxels <= dustVoxelThreshold);
    return {
        sixNeighbor: {
            count: components.length,
            occupiedVoxels,
            occupiedFraction: occupiedVoxels / occupied.length,
            largestVoxelFraction: components.length > 0
                ? components[0].voxels / Math.max(1, occupiedVoxels)
                : 0,
            largestMassFraction: components.length > 0
                ? components[0].mass / Math.max(1e-12, occupiedMass)
                : 0,
        },
        dust: {
            voxelThreshold: dustVoxelThreshold,
            componentCount: dust.length,
            voxelCount: dust.reduce((total, component) => total + component.voxels, 0),
            voxelFraction: dust.reduce((total, component) => total + component.voxels, 0) /
                Math.max(1, occupiedVoxels),
            mass: dust.reduce((total, component) => total + component.mass, 0),
            massFraction: dust.reduce((total, component) => total + component.mass, 0) /
                Math.max(1e-12, occupiedMass),
        },
        largestComponents: components.slice(0, 8).map((component) => ({
            voxels: component.voxels,
            mass: component.mass,
        })),
    };
};

const viewBasis = (direction) => {
    const d = normalize(direction);
    let up = [0, 1, 0];
    if (Math.abs(dot(d, up)) > 0.90) up = [1, 0, 0];
    const u = normalize(cross(d, up));
    const v = normalize(cross(u, d));
    const corners = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) {
        const point = [x, y, z];
        corners.push([dot(point, u), dot(point, v)]);
    }
    return {
        direction: d,
        u,
        v,
        minimumU: Math.min(...corners.map(([value]) => value)),
        maximumU: Math.max(...corners.map(([value]) => value)),
        minimumV: Math.min(...corners.map(([, value]) => value)),
        maximumV: Math.max(...corners.map(([, value]) => value)),
    };
};

const projectionComponents = (mask, resolution) => {
    const visited = new Uint8Array(mask.length);
    const components = [];
    const queue = new Int32Array(mask.length);
    for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;
        let head = 0;
        let tail = 0;
        visited[start] = 1;
        queue[tail++] = start;
        while (head < tail) {
            const index = queue[head++];
            const y = Math.floor(index / resolution);
            const x = index - y * resolution;
            const visit = (neighbor) => {
                if (neighbor < 0 || !mask[neighbor] || visited[neighbor]) return;
                visited[neighbor] = 1;
                queue[tail++] = neighbor;
            };
            if (x > 0) visit(index - 1);
            if (x + 1 < resolution) visit(index + 1);
            if (y > 0) visit(index - resolution);
            if (y + 1 < resolution) visit(index + resolution);
        }
        components.push(tail);
    }
    components.sort((left, right) => right - left);
    return components;
};

const projectView = (sampled, view, primitive) => {
    const projectionResolution = Math.max(16, Math.min(
        96,
        sampled.resolution,
    ));
    const basis = viewBasis(view.direction);
    const mask = new Uint8Array(projectionResolution ** 2);
    const lineIntegral = new Float64Array(projectionResolution ** 2);
    const n = sampled.resolution;
    const uSpan = Math.max(1e-9, basis.maximumU - basis.minimumU);
    const vSpan = Math.max(1e-9, basis.maximumV - basis.minimumV);
    let occupiedVoxels = 0;
    for (let z = 0; z < n; z += 1) {
        const normalizedZ = z / Math.max(1, n - 1);
        for (let y = 0; y < n; y += 1) {
            const normalizedY = y / Math.max(1, n - 1);
            for (let x = 0; x < n; x += 1) {
                const index = index3(x, y, z, n);
                if (!sampled.occupied[index]) continue;
                const normalizedX = x / Math.max(1, n - 1);
                const point = [normalizedX, normalizedY, normalizedZ];
                const projectedU = clamp(
                    (dot(point, basis.u) - basis.minimumU) / uSpan,
                );
                const projectedV = clamp(
                    (dot(point, basis.v) - basis.minimumV) / vSpan,
                );
                const targetX = Math.min(
                    projectionResolution - 1,
                    Math.max(0, Math.round(projectedU * (projectionResolution - 1))),
                );
                const targetY = Math.min(
                    projectionResolution - 1,
                    Math.max(0, Math.round(projectedV * (projectionResolution - 1))),
                );
                const target = targetY * projectionResolution + targetX;
                mask[target] = 1;
                // One canonical voxel step keeps line-integral values
                // comparable across resolutions. This is a voxelized ray
                // sum, not a renderer replacement.
                lineIntegral[target] += sampled.iwc[index] / n;
                occupiedVoxels += 1;
            }
        }
    }
    const nonzeroIntegrals = Array.from(lineIntegral).filter((value) => value > 0);
    const sortedIntegrals = [...nonzeroIntegrals].sort((left, right) => left - right);
    const components = projectionComponents(mask, projectionResolution);
    const projectedMass = sum(nonzeroIntegrals);
    const meanIntegral = mean(nonzeroIntegrals);
    const integralVariance = variance(nonzeroIntegrals, meanIntegral);
    const largest = components[0] ?? 0;
    return {
        id: view.id,
        direction: basis.direction,
        projectionResolution,
        occupiedVoxels,
        occupiedFraction: occupiedVoxels / Math.max(1, sampled.occupied.length),
        projectedPixelCount: nonzeroIntegrals.length,
        componentCount: components.length,
        largestComponentFraction: largest / Math.max(1, nonzeroIntegrals.length),
        projectedMass,
        lineIntegral: {
            count: nonzeroIntegrals.length,
            mean: meanIntegral,
            variance: integralVariance,
            coefficientOfVariation: Math.sqrt(integralVariance) /
                Math.max(1e-12, meanIntegral),
            quantiles: {
                p50: quantileSorted(sortedIntegrals, 0.50),
                p90: quantileSorted(sortedIntegrals, 0.90),
                p95: quantileSorted(sortedIntegrals, 0.95),
                p99: quantileSorted(sortedIntegrals, 0.99),
                maximum: quantileSorted(sortedIntegrals, 1),
            },
            fractionAboveP90: nonzeroIntegrals.length > 0
                ? nonzeroIntegrals.filter((value) => value >= quantileSorted(sortedIntegrals, 0.90)).length /
                    nonzeroIntegrals.length
                : 0,
        },
        // Kept private to the record and consumed for cross-resolution
        // persistence; never serialized in the public JSON.
        _mask: mask,
        _projectionResolution: projectionResolution,
    };
};

const projectionJaccard = (left, right) => {
    if (left._projectionResolution !== right._projectionResolution) return null;
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < left._mask.length; index += 1) {
        const leftValue = left._mask[index] > 0;
        const rightValue = right._mask[index] > 0;
        if (leftValue && rightValue) intersection += 1;
        if (leftValue || rightValue) union += 1;
    }
    return intersection / Math.max(1, union);
};

const lagCorrelation = (values, resolution, lag) => {
    const left = [];
    const right = [];
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x + lag < resolution; x += 1) {
                left.push(values[index3(x, y, z, resolution)]);
                right.push(values[index3(x + lag, y, z, resolution)]);
            }
        }
    }
    return pearson(left, right);
};

const psdAliasProxy = (sampled) => {
    const n = sampled.resolution;
    let energy = 0;
    let firstDifferenceEnergy = 0;
    for (let index = 0; index < sampled.iwc.length; index += 1) {
        const value = sampled.iwc[index];
        energy += value * value;
    }
    for (let z = 0; z < n; z += 1) {
        for (let y = 0; y < n; y += 1) {
            for (let x = 0; x < n; x += 1) {
                const index = index3(x, y, z, n);
                if (x + 1 < n) {
                    const delta = sampled.iwc[index] - sampled.iwc[index + 1];
                    firstDifferenceEnergy += delta * delta;
                }
                if (y + 1 < n) {
                    const delta = sampled.iwc[index] - sampled.iwc[index + n];
                    firstDifferenceEnergy += delta * delta;
                }
                if (z + 1 < n) {
                    const delta = sampled.iwc[index] - sampled.iwc[index + n * n];
                    firstDifferenceEnergy += delta * delta;
                }
            }
        }
    }
    let blockResidualEnergy = 0;
    let blockEnergy = 0;
    if (n % 2 === 0) {
        for (let z = 0; z < n; z += 2) {
            for (let y = 0; y < n; y += 2) {
                for (let x = 0; x < n; x += 2) {
                    let blockMean = 0;
                    for (let dz = 0; dz < 2; dz += 1) for (let dy = 0; dy < 2; dy += 1) {
                        for (let dx = 0; dx < 2; dx += 1) {
                            blockMean += sampled.iwc[index3(x + dx, y + dy, z + dz, n)];
                        }
                    }
                    blockMean /= 8;
                    for (let dz = 0; dz < 2; dz += 1) for (let dy = 0; dy < 2; dy += 1) {
                        for (let dx = 0; dx < 2; dx += 1) {
                            const delta = sampled.iwc[index3(x + dx, y + dy, z + dz, n)] - blockMean;
                            blockResidualEnergy += delta * delta;
                            blockEnergy += blockMean * blockMean;
                        }
                    }
                }
            }
        }
    }
    const rmsScale = Math.sqrt(Math.max(1e-20, energy / sampled.iwc.length));
    const residualRms = Math.sqrt(Math.max(0, blockResidualEnergy) /
        Math.max(1, sampled.iwc.length));
    const residualFraction = residualRms / Math.max(1e-12, rmsScale);
    const lag1 = lagCorrelation(sampled.iwc, n, 1);
    const lag2 = n >= 4 ? lagCorrelation(sampled.iwc, n, 2) : null;
    const lag4 = n >= 8 ? lagCorrelation(sampled.iwc, n, 4) : null;
    return {
        method: "nearest-neighbor-and-2x-block-residual-PSD-proxy",
        lagCorrelation: { lag1, lag2, lag4 },
        firstDifferenceRms: Math.sqrt(firstDifferenceEnergy /
            Math.max(1, sampled.iwc.length * 3)),
        block2ResidualRms: residualRms,
        block2ResidualFraction: residualFraction,
        block2MeanEnergy: blockEnergy / Math.max(1, sampled.iwc.length),
        aliasRiskScore: clamp(0.55 * residualFraction + 0.45 *
            (1 - clamp(lag1, -1, 1)) * 0.5),
        interpretation: "proxy only; no Fourier transform or renderer minification",
    };
};

const sampleField = (resolution, primitive, seed, evaluator) => {
    const voxelCount = resolution ** 3;
    const field = new Float32Array(voxelCount);
    const iwc = new Float32Array(voxelCount);
    const rawRadius = new Float32Array(voxelCount);
    const occupied = new Uint8Array(voxelCount);
    const rawPrior = new Uint8Array(voxelCount);
    const latentValues = [];
    const positiveIwcValues = [];
    const envelopeIwcValues = [];
    let envelopeVoxelCount = 0;
    let occupiedVoxelCount = 0;
    let envelopeMass = 0;
    let occupiedMass = 0;
    const layerMass = [0, 0, 0];
    const layerEnvelopeMass = [0, 0, 0];
    const priorValues = [];
    const fieldValues = [];
    const priorMarginValues = [];
    const supportValues = [];
    const occupiedBoundaryRadii = [];
    for (let z = 0; z < resolution; z += 1) {
        const normalizedZ = z / Math.max(1, resolution - 1);
        for (let y = 0; y < resolution; y += 1) {
            const normalizedY = y / Math.max(1, resolution - 1);
            for (let x = 0; x < resolution; x += 1) {
                const normalizedX = x / Math.max(1, resolution - 1);
                const index = index3(x, y, z, resolution);
                const point = [normalizedX, normalizedY, normalizedZ];
                const sample = evaluator(primitive, point, seed);
                const prior = createRawEllipsoidPrior(point, primitive);
                field[index] = sample.field;
                iwc[index] = sample.iwc;
                rawRadius[index] = prior.radius;
                rawPrior[index] = prior.inside;
                const isEnvelope = sample.envelope > 0 &&
                    Number.isFinite(sample.lognormalGaussian);
                const isOccupied = sample.field > 0;
                if (isEnvelope) {
                    envelopeVoxelCount += 1;
                    envelopeMass += sample.iwc;
                    envelopeIwcValues.push(sample.iwc);
                    latentValues.push(sample.lognormalGaussian);
                    layerEnvelopeMass[Math.min(2, Math.floor(normalizedY * 3))] += sample.iwc;
                }
                if (isOccupied) {
                    occupied[index] = 1;
                    occupiedVoxelCount += 1;
                    occupiedMass += sample.iwc;
                    positiveIwcValues.push(sample.iwc);
                    layerMass[Math.min(2, Math.floor(normalizedY * 3))] += sample.iwc;
                }
                priorValues.push(prior.inside);
                fieldValues.push(sample.field);
                priorMarginValues.push(1 - prior.radius);
                supportValues.push(isOccupied ? 1 : 0);
            }
        }
    }
    // Keep only boundary voxels with at least one clear six-neighbor. Their
    // raw ellipsoid radius spread is a compact, resolution-aware irregularity
    // statistic for the stochastic excursion boundary.
    for (let z = 0; z < resolution; z += 1) for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            const index = index3(x, y, z, resolution);
            if (!occupied[index]) continue;
            const clearNeighbor = (x === 0 || !occupied[index - 1]) ||
                (x + 1 === resolution || !occupied[index + 1]) ||
                (y === 0 || !occupied[index - resolution]) ||
                (y + 1 === resolution || !occupied[index + resolution]) ||
                (z === 0 || !occupied[index - resolution * resolution]) ||
                (z + 1 === resolution || !occupied[index + resolution * resolution]);
            if (clearNeighbor) occupiedBoundaryRadii.push(rawRadius[index]);
        }
    }
    const component = componentSummary(occupied, iwc, resolution);
    const projections = DEFAULT_VIEWS.map((view) => projectView({
        resolution,
        occupied,
        iwc,
    }, view, primitive));
    const projectionPersistence = projections.map((projection, index) => ({
        view: projection.id,
        largestComponentFraction: projection.largestComponentFraction,
        versusOtherViews: projections
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => ({ view: other.id, jaccard: projectionJaccard(projection, other) })),
    }));
    const occupiedPriorIntersection = supportValues.reduce(
        (total, value, index) => total + (value && priorValues[index] ? 1 : 0),
        0,
    );
    const occupiedPriorUnion = supportValues.reduce(
        (total, value, index) => total + (value || priorValues[index] ? 1 : 0),
        0,
    );
    const occupiedBoundaryMean = mean(occupiedBoundaryRadii);
    const occupiedBoundaryVariance = variance(
        occupiedBoundaryRadii,
        occupiedBoundaryMean,
    );
    const sortedBoundaryRadii = [...occupiedBoundaryRadii].sort((left, right) => left - right);
    const totalCells = Math.max(1, voxelCount);
    return {
        resolution,
        sampling: {
            points: voxelCount,
            coordinateDomain: "[0,1]^3 inclusive lattice",
            supportPredicate: "evaluateCloudSpissatusStochasticField(...).field > 0",
            envelopePredicate: "envelope > 0",
            massUnits: "sum(iwc) * voxel volume; reported normalized integral omits the common voxel-volume factor",
        },
        latent: distribution(latentValues),
        positiveIwc: distribution(positiveIwcValues, IWC_SATURATION_THRESHOLD),
        envelopeIwc: distribution(envelopeIwcValues, IWC_SATURATION_THRESHOLD),
        support: {
            envelopeVoxelCount,
            envelopeFraction: envelopeVoxelCount / totalCells,
            occupiedVoxelCount,
            occupiedFraction: occupiedVoxelCount / totalCells,
            // Both sums are also retained as normalized voxel-volume
            // integrals so convergence comparisons are resolution-independent.
            positiveIwcMass: occupiedMass,
            envelopeIwcMass: envelopeMass,
            positiveIwcIntegral: occupiedMass / totalCells,
            envelopeIwcIntegral: envelopeMass / totalCells,
            occupiedToEnvelopeMassFraction: occupiedMass / Math.max(1e-12, envelopeMass),
            occupiedToEnvelopeVoxelFraction: occupiedVoxelCount /
                Math.max(1, envelopeVoxelCount),
            layerMassFractions: {
                lower: layerMass[0] / Math.max(1e-12, occupiedMass),
                middle: layerMass[1] / Math.max(1e-12, occupiedMass),
                upper: layerMass[2] / Math.max(1e-12, occupiedMass),
            },
            envelopeLayerMassFractions: {
                lower: layerEnvelopeMass[0] / Math.max(1e-12, envelopeMass),
                middle: layerEnvelopeMass[1] / Math.max(1e-12, envelopeMass),
                upper: layerEnvelopeMass[2] / Math.max(1e-12, envelopeMass),
            },
        },
        components: component,
        projectedComponentPersistence: {
            views: projections.map(({ _mask, _projectionResolution, ...publicProjection }) =>
                publicProjection),
            pairwiseMaskJaccard: projectionPersistence,
        },
        deepLineIntegrals: projections.map((projection) => ({
            view: projection.id,
            direction: projection.direction,
            distribution: projection.lineIntegral,
        })),
        psdAliasProxy: psdAliasProxy({ resolution, iwc }),
        boundary: {
            rawEllipsoidPrior: {
                voxelFraction: mean(priorValues),
                fieldPearsonCorrelation: pearson(fieldValues, priorMarginValues),
                supportPearsonCorrelation: pearson(supportValues, priorValues),
                supportPriorJaccard: occupiedPriorIntersection /
                    Math.max(1, occupiedPriorUnion),
                supportPriorPrecision: occupiedPriorIntersection /
                    Math.max(1, occupiedVoxelCount),
                supportPriorRecall: occupiedPriorIntersection /
                    Math.max(1, priorValues.filter(Boolean).length),
            },
            boundaryVoxelCount: occupiedBoundaryRadii.length,
            rawRadiusMean: occupiedBoundaryMean,
            rawRadiusStandardDeviation: Math.sqrt(occupiedBoundaryVariance),
            rawRadiusCoefficientOfVariation: Math.sqrt(occupiedBoundaryVariance) /
                Math.max(1e-12, occupiedBoundaryMean),
            rawRadiusP10: quantileSorted(sortedBoundaryRadii, 0.10),
            rawRadiusP90: quantileSorted(sortedBoundaryRadii, 0.90),
            irregularityScore: clamp(
                Math.sqrt(occupiedBoundaryVariance) /
                    Math.max(1e-12, occupiedBoundaryMean),
                0,
                10,
            ),
            method: "six-neighbor occupied shell radial spread against unwarped ellipsoid prior",
        },
        _massForConvergence: occupiedMass / totalCells,
        _envelopeMassForConvergence: envelopeMass / totalCells,
        _occupiedFractionForConvergence: occupiedVoxelCount / totalCells,
    };
};

const sourceAtlasSummary = (manifest, manifestPath) => {
    const source = manifest.highIceSourceAtlas;
    const slot = source?.slots?.find((candidate) => candidate.id === "ci-spissatus");
    if (!source || !slot) {
        return { available: false, reason: "manifest has no ci-spissatus high-ice source slot" };
    }
    const filePath = resolve(manifestPath, "..", source.file);
    let bytes;
    try {
        bytes = readFileSync(filePath);
    } catch (error) {
        return { available: false, reason: `source atlas unreadable: ${error.message}` };
    }
    const dimensions = source.dimensions;
    const n = source.sourceResolution;
    const width = dimensions.width;
    const height = dimensions.height;
    const bytesPerVoxel = 4;
    let supportVoxels = 0;
    let densityMass = 0;
    let secondMomentMass = 0;
    let coverageMass = 0;
    let maximumDensity = 0;
    const packedRBytes = Buffer.alloc(n ** 3);
    let packedRIndex = 0;
    for (let z = 0; z < n; z += 1) for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
            const byteIndex = (((slot.zOffset + z) * height + slot.yOffset + y) * width +
                slot.xOffset + x) * bytesPerVoxel;
            const density = bytes[byteIndex] / 255;
            const coverage = bytes[byteIndex + 1] / 255;
            const secondMoment = bytes[byteIndex + 2] / 255;
            const occupied = bytes[byteIndex + 3] >= 128;
            packedRBytes[packedRIndex++] = bytes[byteIndex];
            supportVoxels += occupied ? 1 : 0;
            densityMass += density;
            secondMomentMass += secondMoment;
            coverageMass += coverage;
            maximumDensity = Math.max(maximumDensity, density);
        }
    }
    return {
        available: true,
        file: filePath,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        packedRChannelChecksumSha256: createHash("sha256").update(packedRBytes).digest("hex"),
        manifestSlotChecksumSha256: slot.checksum ?? null,
        manifestSlotChecksumSemantics:
            "manifest slot checksum covers the pre-conditioning authored source-density array; packed R is block-mass-conditioned and therefore has a distinct checksum",
        sourceResolution: n,
        supportVoxels,
        supportFraction: supportVoxels / n ** 3,
        densityMass,
        meanDensity: densityMass / n ** 3,
        meanSecondMoment: secondMomentMass / n ** 3,
        meanCoverage: coverageMass / n ** 3,
        maximumDensity,
        semantics: "production authored RGBA8 high-ice source tile; independent of direct field lattice coordinates",
    };
};

const parseResolutions = (value) => {
    if (value === undefined) return [...DEFAULT_RESOLUTIONS];
    const values = Array.isArray(value) ? value : String(value).split(",");
    const resolutions = [...new Set(values.map((candidate) => Number(candidate)))].sort((a, b) => a - b);
    if (resolutions.length < 1 || resolutions.some((value) =>
        !Number.isInteger(value) || value < 16 || value > 128)) {
        throw new Error("resolutions must be integers in [16,128]");
    }
    return resolutions;
};

export const runSpissatusDiagnostic = async ({
    manifestPath = resolve(new URL("../public/assets/sky/cloud-macro-atlas-v2.json", import.meta.url).pathname),
    resolutions = DEFAULT_RESOLUTIONS,
    seed = null,
} = {}) => {
    const normalizedResolutions = parseResolutions(resolutions);
    const { manifest, volume } = decodeSeedAndManifest(manifestPath);
    const { transformed, publicApi } = await loadCurrentModelApi();
    const config = transformed.VOLUME_CONFIGS.find((candidate) => candidate.id === "ci-spissatus");
    if (!config) throw new Error("current source has no ci-spissatus configuration");
    const activeSeed = seed === null ? volume.seed : Number(seed);
    if (!Number.isInteger(activeSeed)) throw new Error("seed must be an integer");
    const model = transformed.buildMacroModel(config, activeSeed);
    const primitive = model.primitives?.find((candidate) =>
        candidate.kind === "spissatus-stochastic-field");
    if (!primitive) throw new Error("current source has no spissatus stochastic primitive");
    const sampled = normalizedResolutions.map((resolution) => sampleField(
        resolution,
        primitive,
        activeSeed,
        publicApi.evaluateCloudSpissatusStochasticField,
    ));
    const baseline = sampled.at(-1);
    const convergence = sampled.map((sample) => ({
        resolution: sample.resolution,
        massRetentionVsHighestResolution: sample._massForConvergence /
            Math.max(1e-12, baseline._massForConvergence),
        envelopeMassRetentionVsHighestResolution: sample._envelopeMassForConvergence /
            Math.max(1e-12, baseline._envelopeMassForConvergence),
        occupiedFractionRatioVsHighestResolution: sample._occupiedFractionForConvergence /
            Math.max(1e-12, baseline._occupiedFractionForConvergence),
    }));
    const publicSamples = sampled.map(({ _massForConvergence, _envelopeMassForConvergence,
        _occupiedFractionForConvergence, ...sample }) => sample);
    return {
        schema: DIAGNOSTIC_SCHEMA,
        version: DIAGNOSTIC_VERSION,
        diagnostic: "ci-spissatus-stochastic-field",
        bounded: {
            resolutions: normalizedResolutions,
            maximumResolution: Math.max(...normalizedResolutions),
            atlasGenerationCalled: false,
            assetsWritten: false,
            rendererInvoked: false,
        },
        source: {
            sourceModule: "scripts/lib/cloud-volume-atlas.mjs",
            builderAccess: {
                mode: "read-only-instrumented-data-url",
                caveat: "buildMacroModel is private in the current module; the harness exposes it only in an in-memory transformed copy to recover the exact production primitive. No checked-in source is rewritten and no atlas generation is invoked.",
            },
            manifest: manifestPath,
            manifestSchema: manifest.schema ?? null,
            manifestVersion: manifest.version ?? null,
            volumeId: volume.id,
            seed: activeSeed,
            seedFromManifest: volume.seed,
            primitiveKind: primitive.kind,
            primitiveParameters: {
                center: primitive.center,
                radii: primitive.radii,
                rotation: primitive.rotation,
                sigma: primitive.sigma,
                excursionThreshold: primitive.excursionThreshold,
                excursionScale: primitive.excursionScale,
                envelopeScale: primitive.envelopeScale,
                smoothing: primitive.smoothing,
                layerCount: primitive.layers?.length ?? 0,
                sourceSiteCount: primitive.sourceSites?.length ?? 0,
            },
            modelMetadata: {
                sourceFieldCount: model.sourceFieldCount ?? null,
                sourceLayerCount: model.sourceLayerCount ?? null,
                sourceSiteCount: model.sourceSiteCount ?? null,
                sourceShearDisplacement: model.sourceShearDisplacement ?? null,
                sourceLatentMean: model.sourceLatentMean ?? null,
                sourceLatentVariance: model.sourceLatentVariance ?? null,
                sourceLatentSkew: model.sourceLatentSkew ?? null,
                sourceLatentStandardDeviationTarget:
                    model.sourceLatentStandardDeviationTarget ?? null,
                sourceIwcMean: model.sourceIwcMean ?? null,
                sourceIwcSaturationFraction: model.sourceIwcSaturationFraction ?? null,
                sourceSupportVarianceScale: primitive.supportVarianceScale ?? null,
                sourceSupportMeanOffset: primitive.supportMeanOffset ?? null,
                sourceSupportVarianceReference: primitive.supportVarianceReference ?? null,
                sourceEnvelopeWarpScale: model.sourceEnvelopeWarpScale ?? null,
                sourceIwcDistribution: model.sourceIwcDistribution ?? null,
                sourceSpectrum: model.sourceSpectrum ?? null,
                sourceFallstreakOrganization: model.sourceFallstreakOrganization ?? null,
                sourceFibrousOrganization: model.sourceFibrousOrganization ?? null,
                sourceEnvelopePrior: model.sourceEnvelopePrior ?? null,
            },
        },
        productionSourceAtlas: sourceAtlasSummary(manifest, manifestPath),
        samples: publicSamples,
        convergence: {
            baselineResolution: baseline.resolution,
            retention: convergence,
            interpretation: "integral retention is a direct primitive-sampling convergence diagnostic, not the production 2x byte reduction contract",
        },
        ablation: {
            available: false,
            reason: "The current public API exposes the stochastic evaluator but no supported parameterized ablation hook; private builder access is used only to recover the exact production primitive.",
        },
        methods: {
            latentPdf: "lognormalGaussian over envelope > 0",
            positiveIwcPdf: "iwc over field > 0",
            supportConnectivity: "six-neighbor occupied voxels",
            projectedComponents: "voxel splat into three fixed oblique orthographic bases, four-neighbor 2-D components",
            deepLineIntegrals: "positive-IWC voxel sums per projected pixel divided by native resolution",
            boundaryCorrelation: "Pearson/cross-overlap against the unwarped raw ellipsoid prior",
            psdAliasRisk: "lag correlation, nearest-neighbor difference, and 2x block residual proxy",
            privateBuilderCaveat: "The primitive-recovery path is a diagnostic workaround for the missing public model-builder export; ablation remains unavailable through a supported API.",
        },
    };
};

const isMain = process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
    const output = await runSpissatusDiagnostic({
        resolutions: process.argv.find((value) => value.startsWith("--resolutions="))?.split("=")[1],
    });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

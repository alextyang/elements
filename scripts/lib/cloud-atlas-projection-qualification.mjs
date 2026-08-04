/**
 * CPU-only qualification of the authored cloud macro atlas.
 *
 * These measurements intentionally operate on the emitted atlas bytes rather
 * than trusting generator metadata. They are cheap enough for unit tests and
 * catch the failure modes that matter in an uplooking sky: clipped formation
 * edges, repeated bands, generic oval/slab silhouettes, collapsed vertical
 * support, and an opacity regime inconsistent with the WMO cloud form.
 */

const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));

const mean = (values) => values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);

const coefficientOfVariation = (values) => {
    const average = mean(values);
    if (values.length < 2 || average <= 1e-9) return 0;
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2))) /
        average;
};

const measureProjectionRadialEvidence = (
    values,
    width,
    height,
    {
        centerSteps = 7,
        radialBins = 56,
        coverageEnergyFraction = 0.9,
    } = {},
) => {
    const totalEnergy = values.reduce(
        (sum, value) => sum + value * value,
        0,
    );
    if (!(totalEnergy > 1e-12)) {
        return { explainedVariance: 0, explainedCoverage: 0 };
    }
    let maximum = 0;
    let maximumCoverage = 0;
    for (let centerYIndex = 0; centerYIndex < centerSteps; centerYIndex += 1) {
        const centerY = (-0.25 + 1.5 * centerYIndex /
            (centerSteps - 1)) * height;
        for (let centerXIndex = 0; centerXIndex < centerSteps; centerXIndex += 1) {
            const centerX = (-0.25 + 1.5 * centerXIndex /
                (centerSteps - 1)) * width;
            const maximumRadius = Math.hypot(
                Math.max(Math.abs(centerX), Math.abs(width - centerX)),
                Math.max(Math.abs(centerY), Math.abs(height - centerY)),
            );
            const sums = new Float64Array(radialBins);
            const counts = new Uint32Array(radialBins);
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const radius = Math.hypot(x - centerX, y - centerY);
                    const bin = Math.min(
                        radialBins - 1,
                        Math.floor(radius / maximumRadius * radialBins),
                    );
                    const value = values[y * width + x];
                    sums[bin] += value;
                    counts[bin] += 1;
                }
            }
            let explainedEnergy = 0;
            const binEnergies = [];
            for (let bin = 0; bin < radialBins; bin += 1) {
                if (counts[bin] === 0) continue;
                const energy = sums[bin] * sums[bin] / counts[bin];
                explainedEnergy += energy;
                binEnergies.push({ count: counts[bin], energy });
            }
            const explainedVariance = explainedEnergy / totalEnergy;
            if (explainedVariance <= maximum) continue;
            maximum = explainedVariance;
            binEnergies.sort((left, right) => right.energy - left.energy);
            const coverageEnergy = explainedEnergy * coverageEnergyFraction;
            let accumulatedEnergy = 0;
            let coveredPixels = 0;
            for (const bin of binEnergies) {
                if (accumulatedEnergy >= coverageEnergy) break;
                accumulatedEnergy += bin.energy;
                coveredPixels += bin.count;
            }
            maximumCoverage = coveredPixels / values.length;
        }
    }
    return {
        explainedVariance: maximum,
        explainedCoverage: maximumCoverage,
    };
};

export const UPPER_MIDDLE_ATLAS_VOLUME_IDS = Object.freeze([
    "ci-fibratus", "ci-fibratus-split-source", "ci-fibratus-depth-shear",
    "ci-uncinus", "ci-spissatus", "ci-floccus",
    "ci-castellanus",
    "cs-veil", "cs-fibratus",
    "cc-stratiformis", "cc-stratiformis-dispersive",
    "cc-castellanus", "cc-floccus", "cc-lenticularis",
    "ac-stratiformis", "ac-castellanus", "ac-floccus",
    "ac-lenticularis", "ac-volutus",
    "as-opacus", "as-translucidus",
]);

/**
 * The production morphology camera is centred 27 degrees above the horizon.
 * A canonical atlas volume has no world-space heading, so qualification uses
 * three non-cardinal azimuths instead of choosing the one view that flatters
 * an authored shape.  These are orthographic local-volume approximations of
 * the production pinhole camera: at the scale of one finite owner the rays
 * are effectively parallel, while their vertical/horizontal mixing is the
 * same one that exposes flat cards, radial spokes and insufficient depth.
 */
export const CLOUD_ATLAS_PRODUCTION_OBLIQUE_VIEWS = Object.freeze([
    Object.freeze({
        id: "oblique-natural-23",
        elevationDegrees: 27,
        azimuthDegrees: 23,
    }),
    Object.freeze({
        id: "oblique-natural-79",
        elevationDegrees: 27,
        azimuthDegrees: 79,
    }),
    Object.freeze({
        id: "oblique-natural-137",
        elevationDegrees: 27,
        azimuthDegrees: 137,
    }),
]);

const index3 = (resolution, x, y, z) =>
    (z * resolution + y) * resolution + x;

export const decodeCloudAtlasVolume = ({ atlas, manifest, volumeId }) => {
    const volume = manifest.volumes.find((candidate) => candidate.id === volumeId);
    if (!volume) throw new Error(`Cloud atlas volume ${volumeId} is unavailable`);
    const resolution = manifest.atlas.volumeResolution;
    const width = manifest.atlas.dimensions.width;
    const height = manifest.atlas.dimensions.height;
    if (width < resolution || height < resolution) {
        throw new Error("Cloud atlas qualification requires complete canonical volume tiles");
    }
    const density = new Uint8Array(resolution ** 3);
    const detail = new Uint8Array(resolution ** 3);
    const phase = new Uint8Array(resolution ** 3);
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const source = ((((volume.zOffset + z) * height +
                    volume.yOffset + y) * width + volume.xOffset + x) * 4);
                const target = index3(resolution, x, y, z);
                density[target] = atlas[source];
                detail[target] = atlas[source + 1];
                phase[target] = atlas[source + 2];
            }
        }
    }
    return { volume, resolution, density, detail, phase };
};

const projectionCoordinates = (axis, u, v, depth) => {
    if (axis === "ground") return [u, depth, v];
    if (axis === "side-crosswind") return [u, v, depth];
    if (axis === "side-downwind") return [depth, v, u];
    throw new Error(`Unknown projection axis ${axis}`);
};

export const projectCloudAtlasDensity = (decoded, axis) => {
    const { resolution, density } = decoded;
    const maximum = new Float64Array(resolution ** 2);
    const integral = new Float64Array(resolution ** 2);
    for (let v = 0; v < resolution; v += 1) {
        for (let u = 0; u < resolution; u += 1) {
            let maximumDensity = 0;
            let integratedDensity = 0;
            for (let depth = 0; depth < resolution; depth += 1) {
                const [x, y, z] = projectionCoordinates(axis, u, v, depth);
                const sample = density[index3(resolution, x, y, z)] / 255;
                maximumDensity = Math.max(maximumDensity, sample);
                integratedDensity += sample;
            }
            const target = v * resolution + u;
            maximum[target] = maximumDensity;
            integral[target] = integratedDensity / resolution;
        }
    }
    return { axis, resolution, maximum, integral };
};

const sampleCloudAtlasDensityTrilinear = (decoded, x, y, z) => {
    if (x < 0 || x > 1 || y < 0 || y > 1 || z < 0 || z > 1) return 0;
    const { resolution, density } = decoded;
    const coordinateScale = resolution - 1;
    const scaledX = x * coordinateScale;
    const scaledY = y * coordinateScale;
    const scaledZ = z * coordinateScale;
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const z0 = Math.floor(scaledZ);
    const x1 = Math.min(resolution - 1, x0 + 1);
    const y1 = Math.min(resolution - 1, y0 + 1);
    const z1 = Math.min(resolution - 1, z0 + 1);
    const tx = scaledX - x0;
    const ty = scaledY - y0;
    const tz = scaledZ - z0;
    const sample = (sx, sy, sz) =>
        density[index3(resolution, sx, sy, sz)] / 255;
    const lower = (
        sample(x0, y0, z0) * (1 - tx) * (1 - ty) +
        sample(x1, y0, z0) * tx * (1 - ty) +
        sample(x0, y1, z0) * (1 - tx) * ty +
        sample(x1, y1, z0) * tx * ty
    );
    const upper = (
        sample(x0, y0, z1) * (1 - tx) * (1 - ty) +
        sample(x1, y0, z1) * tx * (1 - ty) +
        sample(x0, y1, z1) * (1 - tx) * ty +
        sample(x1, y1, z1) * tx * ty
    );
    return lower * (1 - tz) + upper * tz;
};

/**
 * Integrate one canonical density volume through a production-like natural
 * oblique view.  The fixed enclosing cube keeps occupancy comparable between
 * azimuths.  Two samples per source voxel prevent a one-voxel sheet from
 * disappearing merely because the qualification ray misses its centre.
 */
export const projectCloudAtlasDensityOblique = (
    decoded,
    {
        elevationDegrees = 27,
        azimuthDegrees = 23,
        outputResolution = decoded.resolution,
        samplesPerVoxel = 2,
    } = {},
) => {
    if (!Number.isInteger(outputResolution) || outputResolution < 16) {
        throw new Error("Oblique cloud projection resolution must be an integer >= 16");
    }
    if (!Number.isFinite(elevationDegrees) ||
        elevationDegrees <= 0 || elevationDegrees >= 90) {
        throw new Error("Oblique cloud projection elevation must be inside (0, 90)");
    }
    if (!Number.isFinite(azimuthDegrees)) {
        throw new Error("Oblique cloud projection azimuth must be finite");
    }
    if (!Number.isInteger(samplesPerVoxel) || samplesPerVoxel < 1 ||
        samplesPerVoxel > 8) {
        throw new Error("Oblique cloud projection samplesPerVoxel must be 1..8");
    }
    const elevation = elevationDegrees * Math.PI / 180;
    const azimuth = azimuthDegrees * Math.PI / 180;
    const horizontal = Math.cos(elevation);
    const direction = [
        horizontal * Math.cos(azimuth),
        Math.sin(elevation),
        horizontal * Math.sin(azimuth),
    ];
    const right = [Math.sin(azimuth), 0, -Math.cos(azimuth)];
    const screenUp = [
        -Math.sin(elevation) * Math.cos(azimuth),
        Math.cos(elevation),
        -Math.sin(elevation) * Math.sin(azimuth),
    ];
    const halfSpan = Math.sqrt(3) * 0.5;
    const depthStep = 1 / Math.max(
        1,
        (decoded.resolution - 1) * samplesPerVoxel,
    );
    const depthSampleCount = Math.ceil(halfSpan * 2 / depthStep) + 1;
    const actualDepthStep = halfSpan * 2 / Math.max(1, depthSampleCount - 1);
    const maximum = new Float64Array(outputResolution ** 2);
    const integral = new Float64Array(outputResolution ** 2);
    for (let v = 0; v < outputResolution; v += 1) {
        const screenV = (
            (v + 0.5) / outputResolution * 2 - 1
        ) * halfSpan;
        for (let u = 0; u < outputResolution; u += 1) {
            const screenU = (
                (u + 0.5) / outputResolution * 2 - 1
            ) * halfSpan;
            let maximumDensity = 0;
            let integratedDensity = 0;
            for (let depthIndex = 0;
                depthIndex < depthSampleCount;
                depthIndex += 1) {
                const depth = -halfSpan + depthIndex * actualDepthStep;
                const sample = sampleCloudAtlasDensityTrilinear(
                    decoded,
                    0.5 + right[0] * screenU +
                        screenUp[0] * screenV + direction[0] * depth,
                    0.5 + right[1] * screenU +
                        screenUp[1] * screenV + direction[1] * depth,
                    0.5 + right[2] * screenU +
                        screenUp[2] * screenV + direction[2] * depth,
                );
                maximumDensity = Math.max(maximumDensity, sample);
                integratedDensity += sample * actualDepthStep;
            }
            const target = v * outputResolution + u;
            maximum[target] = maximumDensity;
            integral[target] = integratedDensity;
        }
    }
    return {
        axis: "production-oblique-natural",
        elevationDegrees,
        azimuthDegrees,
        resolution: outputResolution,
        maximum,
        integral,
    };
};

const dot3 = (left, right) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const normalize3 = (value) => {
    const length = Math.hypot(value[0], value[1], value[2]);
    if (length <= 1e-12) {
        throw new Error("Cloud projection direction must have non-zero length");
    }
    return value.map((component) => component / length);
};

const rayBoxInterval = (origin, direction, halfExtents) => {
    let entry = Number.NEGATIVE_INFINITY;
    let exit = Number.POSITIVE_INFINITY;
    for (let axis = 0; axis < 3; axis += 1) {
        const halfExtent = halfExtents[axis];
        if (Math.abs(direction[axis]) <= 1e-12) {
            if (origin[axis] < -halfExtent || origin[axis] > halfExtent) {
                return null;
            }
            continue;
        }
        const first = (-halfExtent - origin[axis]) / direction[axis];
        const second = (halfExtent - origin[axis]) / direction[axis];
        entry = Math.max(entry, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
    }
    entry = Math.max(0, entry);
    return exit > entry ? [entry, exit] : null;
};

/**
 * Project emitted atlas density through the same world anisotropy carried by
 * one packed production owner. Unlike the canonical oblique diagnostic above,
 * this path never renormalizes horizontal radius, geometric depth, or camera
 * FOV to a cube. It therefore exposes a physically broad but vertically
 * unresolved owner as the ribbon that the production pinhole camera sees.
 *
 * Owner axes match cloud_macro_owner_sample in production WGSL:
 * x=crosswind/minor radius, y=geometric depth, z=downwind/major radius.
 * Positions are Earth-local kilometres; curvature is immaterial across one
 * finite high-cloud owner and the renderer uses the same tangent frame for its
 * local macro lookup.
 */
export const projectCloudAtlasDensityProductionPerspective = (
    decoded,
    {
        owner,
        camera,
        outputResolution = 96,
        outputWidth = outputResolution,
        outputHeight = outputResolution,
        samplesPerVoxel = 2,
        densityThreshold = 16 / 255,
    } = {},
) => {
    if (!owner || !camera) {
        throw new Error("Production cloud projection requires owner and camera records");
    }
    if (!Number.isInteger(outputWidth) || outputWidth < 32 ||
        !Number.isInteger(outputHeight) || outputHeight < 32) {
        throw new Error(
            "Production cloud projection dimensions must be integers >= 32",
        );
    }
    if (!Number.isInteger(samplesPerVoxel) || samplesPerVoxel < 1 ||
        samplesPerVoxel > 4) {
        throw new Error("Production cloud projection samplesPerVoxel must be 1..4");
    }
    if (!Number.isFinite(densityThreshold) || densityThreshold <= 0 ||
        densityThreshold >= 1) {
        throw new Error("Production cloud projection densityThreshold must be inside (0, 1)");
    }
    const finitePositive = (value, label) => {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`${label} must be finite and positive`);
        }
        return value;
    };
    const majorRadiusKm = finitePositive(
        owner.majorRadiusKm,
        "Production owner majorRadiusKm",
    );
    const minorRadiusKm = finitePositive(
        owner.minorRadiusKm,
        "Production owner minorRadiusKm",
    );
    const geometricDepthKm = finitePositive(
        owner.geometricDepthKm,
        "Production owner geometricDepthKm",
    );
    for (const [value, label] of [
        [owner.centerEastKm, "Production owner centerEastKm"],
        [owner.centerNorthKm, "Production owner centerNorthKm"],
        [owner.baseAltitudeKm, "Production owner baseAltitudeKm"],
        [owner.orientationRadians, "Production owner orientationRadians"],
        [camera.azimuthRadians, "Production camera azimuthRadians"],
        [camera.elevationRadians, "Production camera elevationRadians"],
        [camera.observerAltitudeKm ?? 0, "Production camera observerAltitudeKm"],
    ]) {
        if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
    }
    const horizontalFovRadians = finitePositive(
        camera.horizontalFovRadians,
        "Production camera horizontalFovRadians",
    );
    const verticalFovRadians = finitePositive(
        camera.verticalFovRadians,
        "Production camera verticalFovRadians",
    );
    if (horizontalFovRadians >= Math.PI || verticalFovRadians >= Math.PI) {
        throw new Error("Production camera FOV must be less than pi radians");
    }
    if (camera.elevationRadians <= 0 || camera.elevationRadians >= Math.PI / 2) {
        throw new Error("Production camera elevation must be inside (0, pi/2)");
    }

    const orientation = owner.orientationRadians;
    const downwind = [Math.cos(orientation), 0, Math.sin(orientation)];
    const crosswind = [-downwind[2], 0, downwind[0]];
    const up = [0, 1, 0];
    const ownerCenter = [
        owner.centerEastKm,
        owner.baseAltitudeKm + geometricDepthKm * 0.5,
        owner.centerNorthKm,
    ];
    const cameraPosition = [0, camera.observerAltitudeKm ?? 0, 0];
    const worldToOwner = (value) => [
        dot3(value, crosswind),
        dot3(value, up),
        dot3(value, downwind),
    ];
    const ownerRayOrigin = worldToOwner(cameraPosition.map(
        (value, axis) => value - ownerCenter[axis],
    ));
    const halfExtentsKm = [
        minorRadiusKm,
        geometricDepthKm * 0.5,
        majorRadiusKm,
    ];

    const cosElevation = Math.cos(camera.elevationRadians);
    const forward = normalize3([
        Math.sin(camera.azimuthRadians) * cosElevation,
        Math.sin(camera.elevationRadians),
        Math.cos(camera.azimuthRadians) * cosElevation,
    ]);
    const right = normalize3([
        Math.cos(camera.azimuthRadians),
        0,
        -Math.sin(camera.azimuthRadians),
    ]);
    const screenUp = normalize3([
        -Math.sin(camera.azimuthRadians) * Math.sin(camera.elevationRadians),
        Math.cos(camera.elevationRadians),
        -Math.cos(camera.azimuthRadians) * Math.sin(camera.elevationRadians),
    ]);
    const tangentHorizontal = Math.tan(horizontalFovRadians * 0.5);
    const tangentVertical = Math.tan(verticalFovRadians * 0.5);
    const maximum = new Float64Array(outputWidth * outputHeight);
    const integral = new Float64Array(outputWidth * outputHeight);
    const occupiedPathLengthKm = new Float64Array(outputWidth * outputHeight);
    const sourceScale = decoded.resolution - 1;

    for (let v = 0; v < outputHeight; v += 1) {
        const screenV = ((v + 0.5) / outputHeight * 2 - 1) *
            tangentVertical;
        for (let u = 0; u < outputWidth; u += 1) {
            const screenU = ((u + 0.5) / outputWidth * 2 - 1) *
                tangentHorizontal;
            const worldDirection = normalize3(forward.map((value, axis) =>
                value + right[axis] * screenU + screenUp[axis] * screenV));
            const ownerDirection = worldToOwner(worldDirection);
            const interval = rayBoxInterval(
                ownerRayOrigin,
                ownerDirection,
                halfExtentsKm,
            );
            if (!interval) continue;
            const [entry, exit] = interval;
            const canonicalTraversal = Math.max(...ownerDirection.map(
                (value, axis) => Math.abs(value) * (exit - entry) /
                    (2 * halfExtentsKm[axis]),
            ));
            const sampleCount = Math.max(2, Math.ceil(
                canonicalTraversal * sourceScale * samplesPerVoxel,
            ) + 1);
            const stepKm = (exit - entry) / Math.max(1, sampleCount - 1);
            let maximumDensity = 0;
            let integratedDensity = 0;
            let firstOccupiedDistance = Number.POSITIVE_INFINITY;
            let lastOccupiedDistance = Number.NEGATIVE_INFINITY;
            for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
                const distance = entry + sampleIndex * stepKm;
                const local = ownerRayOrigin.map((value, axis) =>
                    value + ownerDirection[axis] * distance);
                const sample = sampleCloudAtlasDensityTrilinear(
                    decoded,
                    0.5 + local[0] / (2 * halfExtentsKm[0]),
                    0.5 + local[1] / (2 * halfExtentsKm[1]),
                    0.5 + local[2] / (2 * halfExtentsKm[2]),
                );
                maximumDensity = Math.max(maximumDensity, sample);
                integratedDensity += sample * stepKm;
                if (sample >= densityThreshold) {
                    firstOccupiedDistance = Math.min(firstOccupiedDistance, distance);
                    lastOccupiedDistance = Math.max(lastOccupiedDistance, distance);
                }
            }
            const target = v * outputWidth + u;
            maximum[target] = maximumDensity;
            integral[target] = integratedDensity;
            if (lastOccupiedDistance >= firstOccupiedDistance) {
                occupiedPathLengthKm[target] = Math.max(
                    stepKm,
                    lastOccupiedDistance - firstOccupiedDistance + stepKm,
                );
            }
        }
    }
    return {
        axis: "production-perspective-world",
        resolution: outputWidth === outputHeight ? outputWidth : null,
        width: outputWidth,
        height: outputHeight,
        maximum,
        integral,
        occupiedPathLengthKm,
        owner: {
            ...owner,
            halfExtentsKm,
        },
        camera: {
            ...camera,
            observerAltitudeKm: camera.observerAltitudeKm ?? 0,
        },
    };
};

const angularSpanForProjectionMask = (
    mask,
    resolution,
    fovRadians,
    horizontal,
) => {
    let minimum = resolution;
    let maximum = -1;
    for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const coordinate = horizontal
            ? index % resolution
            : Math.floor(index / resolution);
        minimum = Math.min(minimum, coordinate);
        maximum = Math.max(maximum, coordinate);
    }
    if (maximum < minimum) return 0;
    const tangent = Math.tan(fovRadians * 0.5);
    const angleAtBoundary = (boundary) => Math.atan(
        (boundary / resolution * 2 - 1) * tangent,
    );
    return angleAtBoundary(maximum + 1) - angleAtBoundary(minimum);
};

/** Add world/FOV metrics to the existing emitted-density silhouette metrics. */
export const analyzeCloudAtlasProductionPerspectiveProjection = (
    projection,
    densityThreshold = 16 / 255,
) => {
    const analysis = analyzeCloudAtlasProjection(projection, densityThreshold);
    const occupiedDepths = [];
    for (let index = 0; index < projection.occupiedPathLengthKm.length; index += 1) {
        if (analysis.mask[index] && projection.occupiedPathLengthKm[index] > 0) {
            occupiedDepths.push(projection.occupiedPathLengthKm[index]);
        }
    }
    const horizontalSpanRadians = angularSpanForProjectionMask(
        analysis.mask,
        projection.resolution,
        projection.camera.horizontalFovRadians,
        true,
    );
    const verticalSpanRadians = angularSpanForProjectionMask(
        analysis.mask,
        projection.resolution,
        projection.camera.verticalFovRadians,
        false,
    );
    return {
        ...analysis,
        projectedHorizontalSpanRadians: horizontalSpanRadians,
        projectedVerticalSpanRadians: verticalSpanRadians,
        projectedVerticalToHorizontalRatio: verticalSpanRadians /
            Math.max(1e-9, horizontalSpanRadians),
        // A filled one-pixel strip can have perfect bounding compactness, so
        // compactness alone does not reject cards. This joint metric cannot be
        // high unless a silhouette is both materially filled and vertically
        // resolved relative to its angular width. Filament/lens species retain
        // their own deliberately low, species-qualified ranges in tests.
        antiRibbonCompactness: Math.min(
            analysis.boundingCompactness,
            verticalSpanRadians / Math.max(1e-9, horizontalSpanRadians),
        ),
        meanOccupiedDepthKm: mean(occupiedDepths),
        maximumOccupiedDepthKm: Math.max(0, ...occupiedDepths),
        occupiedDepthCoefficientVariation: coefficientOfVariation(occupiedDepths),
    };
};

const fitAffineProjectionProfile = (profile) => {
    const center = (profile.length - 1) * 0.5;
    const average = mean(profile);
    let coordinateVariance = 0;
    let covariance = 0;
    for (let index = 0; index < profile.length; index += 1) {
        const coordinate = index - center;
        coordinateVariance += coordinate ** 2;
        covariance += coordinate * (profile[index] - average);
    }
    const slope = covariance / Math.max(1e-9, coordinateVariance);
    const residuals = profile.map((value, index) =>
        value - average - slope * (index - center));
    return {
        slope,
        residuals,
        rootMeanSquareResidual: Math.sqrt(mean(
            residuals.map((value) => value ** 2),
        )),
    };
};

const productionPixelMaskComponents = (
    projection,
    densityThreshold,
    width,
    height,
) => {
    const mask = Uint8Array.from(
        projection.maximum,
        (value) => value >= densityThreshold ? 1 : 0,
    );
    const visited = new Uint8Array(mask.length);
    const components = [];
    for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;
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
                if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
        }
        components.push(points);
    }
    components.sort((left, right) => right.length - left.length);
    return { mask, components };
};

/**
 * Measure the silhouette at the actual production pixel aspect.
 *
 * The canonical 96x96 qualifier preserves angular spans, but its square
 * raster makes a 64x43.52 degree camera look vertically thicker than the
 * 800x500 native preview. A broad constant-thickness plate can consequently
 * pass global anisotropy and radial-curvature gates: its rounded corners
 * create high curvature variance even while one central face remains a long
 * affine edge. This measurement fits the central half of every resolved
 * component's upper and lower profiles, then reports both affine-edge relief
 * and the fraction still indistinguishable from a straight line.
 */
export const analyzeCloudAtlasProductionPixelSilhouette = (
    projection,
    densityThreshold = 16 / 255,
) => {
    const width = projection.width ?? projection.resolution;
    const height = projection.height ?? projection.resolution;
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 32 || height < 32 ||
        projection.maximum.length !== width * height) {
        throw new Error(
            "Production pixel silhouette requires a complete rectangular projection",
        );
    }
    const { mask, components } = productionPixelMaskComponents(
        projection,
        densityThreshold,
        width,
        height,
    );
    const minimumArea = Math.max(24, Math.round(width * height * 0.00012));
    const componentMetrics = [];
    for (const points of components) {
        if (points.length < minimumArea) continue;
        let minimumX = width;
        let maximumX = -1;
        let minimumY = height;
        let maximumY = -1;
        const columns = new Map();
        for (const [x, y] of points) {
            minimumX = Math.min(minimumX, x);
            maximumX = Math.max(maximumX, x);
            minimumY = Math.min(minimumY, y);
            maximumY = Math.max(maximumY, y);
            const column = columns.get(x);
            if (column) column.push(y);
            else columns.set(x, [y]);
        }
        const boundingWidth = maximumX - minimumX + 1;
        const boundingHeight = maximumY - minimumY + 1;
        if (boundingWidth < 12 || boundingHeight < 6) continue;
        let upper = [];
        let lower = [];
        for (let x = minimumX; x <= maximumX; x += 1) {
            const column = columns.get(x);
            if (!column) continue;
            upper.push(Math.min(...column));
            lower.push(Math.max(...column));
        }
        const smoothingRadius = Math.max(
            1,
            Math.round(boundingWidth * 0.018),
        );
        const smooth = (profile) => profile.map((_, index) => {
            let sum = 0;
            let count = 0;
            for (let offset = -smoothingRadius;
                offset <= smoothingRadius; offset += 1) {
                const sampleIndex = index + offset;
                if (sampleIndex < 0 || sampleIndex >= profile.length) continue;
                sum += profile[sampleIndex];
                count += 1;
            }
            return sum / Math.max(1, count);
        });
        upper = smooth(upper);
        lower = smooth(lower);
        const trim = Math.max(1, Math.round(upper.length * 0.25));
        upper = upper.slice(trim, upper.length - trim);
        lower = lower.slice(trim, lower.length - trim);
        if (upper.length < 7 || lower.length !== upper.length) continue;
        const upperFit = fitAffineProjectionProfile(upper);
        const lowerFit = fitAffineProjectionProfile(lower);
        const relief = [
            upperFit.rootMeanSquareResidual / boundingHeight,
            lowerFit.rootMeanSquareResidual / boundingHeight,
        ];
        const straightTolerance = Math.max(0.75, boundingHeight * 0.018);
        const straightFraction = (residuals) => residuals.filter(
            (value) => Math.abs(value) <= straightTolerance,
        ).length / residuals.length;
        const upperStraightFraction = straightFraction(upperFit.residuals);
        const lowerStraightFraction = straightFraction(lowerFit.residuals);
        const thickness = lower.map((value, index) => value - upper[index]);
        componentMetrics.push({
            areaPixels: points.length,
            boundingWidthPixels: boundingWidth,
            boundingHeightPixels: boundingHeight,
            upperAffineEdgeReliefFraction: relief[0],
            lowerAffineEdgeReliefFraction: relief[1],
            minimumAffineEdgeReliefFraction: Math.min(...relief),
            meanAffineEdgeReliefFraction: mean(relief),
            upperStraightEdgeFraction: upperStraightFraction,
            lowerStraightEdgeFraction: lowerStraightFraction,
            maximumStraightEdgeFraction: Math.max(
                upperStraightFraction,
                lowerStraightFraction,
            ),
            centralThicknessCoefficientVariation:
                coefficientOfVariation(thickness),
        });
    }
    return {
        width,
        height,
        resolvedComponentCount: componentMetrics.length,
        minimumAffineEdgeReliefFraction: componentMetrics.length > 0
            ? Math.min(...componentMetrics.map(
                ({ minimumAffineEdgeReliefFraction }) =>
                    minimumAffineEdgeReliefFraction,
            )) : 0,
        maximumStraightEdgeFraction: Math.max(
            0,
            ...componentMetrics.map(
                ({ maximumStraightEdgeFraction }) =>
                    maximumStraightEdgeFraction,
            ),
        ),
        minimumCentralThicknessCoefficientVariation:
            componentMetrics.length > 0
                ? Math.min(...componentMetrics.map(
                    ({ centralThicknessCoefficientVariation }) =>
                        centralThicknessCoefficientVariation,
                )) : 0,
        components: componentMetrics,
        mask,
    };
};

/**
 * Separate a shared radial layout from shared contour phase.
 *
 * Three cloud centroids may legitimately occupy one altitude arc. That is
 * distinct from all three bodies also aligning their long axes with the same
 * ring tangent. The former is measured by a fixed-grid common-radius fit; the
 * latter by each resolved contour's tangent/radial variance about that centre.
 */
export const analyzeCloudAtlasProductionRadialSilhouette = (
    projection,
    densityThreshold = 16 / 255,
) => {
    const width = projection.width ?? projection.resolution;
    const height = projection.height ?? projection.resolution;
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 32 || height < 32 ||
        projection.maximum.length !== width * height) {
        throw new Error(
            "Production radial silhouette requires a complete rectangular projection",
        );
    }
    const { mask, components } = productionPixelMaskComponents(
        projection,
        densityThreshold,
        width,
        height,
    );
    const minimumArea = Math.max(24, Math.round(width * height * 0.00012));
    const resolved = components.filter((points) => points.length >= minimumArea)
        .map((points) => {
            const centroid = [
                mean(points.map(([x]) => x)),
                mean(points.map(([, y]) => y)),
            ];
            let xx = 0;
            let yy = 0;
            let xy = 0;
            const boundary = [];
            for (const [x, y] of points) {
                const dx = x - centroid[0];
                const dy = y - centroid[1];
                xx += dx * dx;
                yy += dy * dy;
                xy += dx * dy;
                const index = y * width + x;
                if (x === 0 || x + 1 === width || y === 0 ||
                    y + 1 === height ||
                    !mask[index - 1] || !mask[index + 1] ||
                    !mask[index - width] || !mask[index + width]) {
                    boundary.push([x, y]);
                }
            }
            xx /= points.length;
            yy /= points.length;
            xy /= points.length;
            const trace = xx + yy;
            const discriminant = Math.hypot(xx - yy, 2 * xy);
            return {
                areaPixels: points.length,
                centroid,
                boundary,
                principalAxisRadians: 0.5 * Math.atan2(2 * xy, xx - yy),
                principalAxisRatio: Math.sqrt(
                    (trace + discriminant) /
                    Math.max(1e-9, trace - discriminant),
                ),
            };
        });
    if (resolved.length === 0) {
        return {
            resolvedComponentCount: 0,
            bestCenterPixels: [0, 0],
            centroidConicCoefficientVariation: 0,
            centroidConicFit: 0,
            contourRingPhaseCoherence: 0,
            maximumPairwisePrincipalAxisSeparationDegrees: 0,
            radialEdgeVariationScore: 0,
            radialCoverageScore: 0,
            components: [],
        };
    }
    const radialEdgeMask = new Uint8Array(mask.length);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            if (!mask[index]) continue;
            if (x === 0 || x + 1 === width || y === 0 || y + 1 === height ||
                !mask[index - 1] || !mask[index + 1] ||
                !mask[index - width] || !mask[index + width]) {
                radialEdgeMask[index] = 1;
            }
        }
    }
    const radialEdgeEvidence = measureProjectionRadialEvidence(
        radialEdgeMask,
        width,
        height,
    );
    const radialCoverageEvidence = measureProjectionRadialEvidence(
        mask,
        width,
        height,
    );
    let bestCenter = [0, 0];
    let minimumCentroidRadiusVariation = Number.POSITIVE_INFINITY;
    const steps = 7;
    for (let centerYIndex = 0; centerYIndex < steps; centerYIndex += 1) {
        const centerY = (-0.25 + 1.5 * centerYIndex / (steps - 1)) *
            height;
        for (let centerXIndex = 0; centerXIndex < steps;
            centerXIndex += 1) {
            const centerX = (-0.25 + 1.5 * centerXIndex / (steps - 1)) *
                width;
            const radii = resolved.map(({ centroid }) =>
                Math.hypot(
                    centroid[0] - centerX,
                    centroid[1] - centerY,
                ));
            const variation = coefficientOfVariation(radii);
            if (variation < minimumCentroidRadiusVariation) {
                minimumCentroidRadiusVariation = variation;
                bestCenter = [centerX, centerY];
            }
        }
    }
    let weightedRingPhase = 0;
    let totalBoundaryWeight = 0;
    const componentMetrics = resolved.map((component) => {
        const radial = [
            component.centroid[0] - bestCenter[0],
            component.centroid[1] - bestCenter[1],
        ];
        const inverseRadius = 1 / Math.max(1e-9, Math.hypot(...radial));
        radial[0] *= inverseRadius;
        radial[1] *= inverseRadius;
        const tangent = [-radial[1], radial[0]];
        let radialVariance = 0;
        let tangentVariance = 0;
        for (const point of component.boundary) {
            const dx = point[0] - component.centroid[0];
            const dy = point[1] - component.centroid[1];
            radialVariance += (dx * radial[0] + dy * radial[1]) ** 2;
            tangentVariance += (dx * tangent[0] + dy * tangent[1]) ** 2;
        }
        radialVariance /= Math.max(1, component.boundary.length);
        tangentVariance /= Math.max(1, component.boundary.length);
        const ringPhase = tangentVariance /
            Math.max(1e-9, tangentVariance + radialVariance);
        weightedRingPhase += ringPhase * component.boundary.length;
        totalBoundaryWeight += component.boundary.length;
        const tangentAngle = Math.atan2(tangent[1], tangent[0]);
        const axisDelta = Math.acos(Math.min(
            1,
            Math.abs(Math.cos(
                component.principalAxisRadians - tangentAngle,
            )),
        ));
        return {
            areaPixels: component.areaPixels,
            centroidPixels: component.centroid,
            principalAxisDegrees:
                component.principalAxisRadians * 180 / Math.PI,
            principalAxisRatio: component.principalAxisRatio,
            ringTangentMisalignmentDegrees: axisDelta * 180 / Math.PI,
            contourRingPhaseCoherence: ringPhase,
        };
    });
    let maximumAxisSeparation = 0;
    for (let index = 0; index < resolved.length; index += 1) {
        for (let other = index + 1; other < resolved.length; other += 1) {
            maximumAxisSeparation = Math.max(
                maximumAxisSeparation,
                Math.acos(Math.min(1, Math.abs(Math.cos(
                    resolved[index].principalAxisRadians -
                        resolved[other].principalAxisRadians,
                )))),
            );
        }
    }
    return {
        resolvedComponentCount: resolved.length,
        bestCenterPixels: bestCenter,
        centroidConicCoefficientVariation:
            minimumCentroidRadiusVariation,
        centroidConicFit: 1 - clamp(minimumCentroidRadiusVariation),
        contourRingPhaseCoherence: weightedRingPhase /
            Math.max(1, totalBoundaryWeight),
        maximumPairwisePrincipalAxisSeparationDegrees:
            maximumAxisSeparation * 180 / Math.PI,
        radialEdgeVariationScore: radialEdgeEvidence.explainedVariance,
        radialCoverageScore: radialCoverageEvidence.explainedCoverage,
        components: componentMetrics,
    };
};

/**
 * Geometry measurements are derived from emitted R8 density, never generator
 * metadata.  Both binary and density-weighted moments are useful: the former
 * catches a nominal two-voxel card, while the latter rejects a token dilute
 * layer added only to satisfy the occupied bounds.
 */
export const measureCloudAtlasVolumeGeometry = (
    decoded,
    densityThreshold = 16 / 255,
) => {
    const { resolution, density } = decoded;
    const minimum = [resolution, resolution, resolution];
    const maximum = [-1, -1, -1];
    const faceCounts = {
        xMinimum: 0,
        xMaximum: 0,
        yMinimum: 0,
        yMaximum: 0,
        zMinimum: 0,
        zMaximum: 0,
    };
    const activeSlices = [
        new Uint8Array(resolution),
        new Uint8Array(resolution),
        new Uint8Array(resolution),
    ];
    let occupiedVoxels = 0;
    let densityWeight = 0;
    const binarySum = [0, 0, 0];
    const densitySum = [0, 0, 0];
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const weight = density[index3(resolution, x, y, z)] / 255;
                if (weight < densityThreshold) continue;
                occupiedVoxels += 1;
                densityWeight += weight;
                const point = [x, y, z];
                for (let axis = 0; axis < 3; axis += 1) {
                    minimum[axis] = Math.min(minimum[axis], point[axis]);
                    maximum[axis] = Math.max(maximum[axis], point[axis]);
                    activeSlices[axis][point[axis]] = 1;
                    binarySum[axis] += point[axis];
                    densitySum[axis] += point[axis] * weight;
                }
                if (x === 0) faceCounts.xMinimum += 1;
                if (x === resolution - 1) faceCounts.xMaximum += 1;
                if (y === 0) faceCounts.yMinimum += 1;
                if (y === resolution - 1) faceCounts.yMaximum += 1;
                if (z === 0) faceCounts.zMinimum += 1;
                if (z === resolution - 1) faceCounts.zMaximum += 1;
            }
        }
    }
    const denominator = Math.max(1, resolution - 1);
    const binaryCentroid = binarySum.map((sum) =>
        sum / Math.max(1, occupiedVoxels));
    const densityCentroid = densitySum.map((sum) =>
        sum / Math.max(1e-12, densityWeight));
    const binaryVariance = [0, 0, 0];
    const densityVariance = [0, 0, 0];
    const densityCovariance = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    if (occupiedVoxels > 0) {
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const weight =
                        density[index3(resolution, x, y, z)] / 255;
                    if (weight < densityThreshold) continue;
                    const point = [x, y, z];
                    for (let left = 0; left < 3; left += 1) {
                        binaryVariance[left] += (
                            point[left] - binaryCentroid[left]
                        ) ** 2;
                        for (let rightAxis = 0; rightAxis < 3; rightAxis += 1) {
                            densityCovariance[left][rightAxis] +=
                                (point[left] - densityCentroid[left]) *
                                (point[rightAxis] - densityCentroid[rightAxis]) *
                                weight;
                        }
                    }
                }
            }
        }
    }
    for (let axis = 0; axis < 3; axis += 1) {
        binaryVariance[axis] /= Math.max(1, occupiedVoxels);
        densityVariance[axis] =
            densityCovariance[axis][axis] / Math.max(1e-12, densityWeight);
        for (let other = 0; other < 3; other += 1) {
            densityCovariance[axis][other] /=
                Math.max(1e-12, densityWeight) * denominator ** 2;
        }
    }
    const determinant =
        densityCovariance[0][0] * (
            densityCovariance[1][1] * densityCovariance[2][2] -
            densityCovariance[1][2] * densityCovariance[2][1]
        ) -
        densityCovariance[0][1] * (
            densityCovariance[1][0] * densityCovariance[2][2] -
            densityCovariance[1][2] * densityCovariance[2][0]
        ) +
        densityCovariance[0][2] * (
            densityCovariance[1][0] * densityCovariance[2][1] -
            densityCovariance[1][1] * densityCovariance[2][0]
        );
    const normalizePoint = (point) => point.map((value) =>
        value / denominator);
    return {
        occupiedVoxels,
        occupiedBounds: occupiedVoxels > 0
            ? {
                minimum: normalizePoint(minimum),
                maximum: normalizePoint(maximum),
            }
            : { minimum: [0, 0, 0], maximum: [0, 0, 0] },
        occupiedExtent: occupiedVoxels > 0
            ? maximum.map((value, axis) =>
                (value - minimum[axis]) / denominator)
            : [0, 0, 0],
        occupiedFaceCounts: faceCounts,
        occupiedFaceFraction: Object.values(faceCounts).reduce(
            (sum, value) => sum + value,
            0,
        ) / Math.max(1, occupiedVoxels),
        activeSliceCount: activeSlices.map((slices) =>
            slices.reduce((sum, value) => sum + value, 0)),
        binaryCentroid: normalizePoint(binaryCentroid),
        densityWeightedCentroid: normalizePoint(densityCentroid),
        binaryAxisStandardDeviation: binaryVariance.map((variance) =>
            Math.sqrt(Math.max(0, variance)) / denominator),
        densityWeightedAxisStandardDeviation: densityVariance.map((variance) =>
            Math.sqrt(Math.max(0, variance)) / denominator),
        densityWeightedCovariance: densityCovariance,
        densityWeightedCovarianceDeterminant: Math.max(0, determinant),
    };
};

const measureCloudAtlasConnectivity3d = (occupied, resolution) => {
    const visited = new Uint8Array(occupied.length);
    const stack = new Int32Array(occupied.length);
    const componentSizes = [];
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || visited[start]) continue;
        let read = 0;
        let write = 1;
        stack[0] = start;
        visited[start] = 1;
        while (read < write) {
            const current = stack[read++];
            const z = Math.floor(current / (resolution * resolution));
            const remainder = current - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
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
        componentSizes.push(write);
    }
    componentSizes.sort((left, right) => right - left);
    const occupiedVoxels = componentSizes.reduce(
        (sum, value) => sum + value,
        0,
    );
    return {
        occupiedVoxels,
        connectedComponentCount: componentSizes.length,
        largestComponentFraction:
            (componentSizes[0] ?? 0) / Math.max(1, occupiedVoxels),
    };
};

/**
 * Independent emitted-byte reconstruction gate.  It deliberately mirrors the
 * production atlas' conservative box footprint without consulting the
 * manifest statistics generated from the source model.
 */
export const measureCloudAtlasScaleReconstruction = (
    decoded,
    {
        densityThreshold = 16 / 255,
        scales = [2, 4],
    } = {},
) => {
    const { resolution, density } = decoded;
    const thresholdByte = Math.ceil(densityThreshold * 255);
    const sourceMass = density.reduce((sum, value) => sum + value, 0);
    let sourceOccupiedVoxels = 0;
    for (const value of density) {
        if (value >= thresholdByte) sourceOccupiedVoxels += 1;
    }
    const results = {};
    for (const scale of scales) {
        if (!Number.isInteger(scale) || scale < 1 ||
            resolution % scale !== 0) {
            throw new Error(
                `Cloud reconstruction scale ${scale} must divide ${resolution}`,
            );
        }
        const reducedResolution = resolution / scale;
        const reducedOccupied = new Uint8Array(reducedResolution ** 3);
        let retainedMass = 0;
        let retainedSourceVoxels = 0;
        for (let z = 0; z < reducedResolution; z += 1) {
            for (let y = 0; y < reducedResolution; y += 1) {
                for (let x = 0; x < reducedResolution; x += 1) {
                    let blockMass = 0;
                    let blockSourceVoxels = 0;
                    for (let dz = 0; dz < scale; dz += 1) {
                        for (let dy = 0; dy < scale; dy += 1) {
                            for (let dx = 0; dx < scale; dx += 1) {
                                const value = density[index3(
                                    resolution,
                                    x * scale + dx,
                                    y * scale + dy,
                                    z * scale + dz,
                                )];
                                blockMass += value;
                                if (value >= thresholdByte) {
                                    blockSourceVoxels += 1;
                                }
                            }
                        }
                    }
                    const average = Math.round(blockMass / scale ** 3);
                    if (average < thresholdByte) continue;
                    reducedOccupied[index3(
                        reducedResolution,
                        x,
                        y,
                        z,
                    )] = 1;
                    retainedMass += average * scale ** 3;
                    retainedSourceVoxels += blockSourceVoxels;
                }
            }
        }
        results[scale] = {
            scale,
            resolution: reducedResolution,
            massRetention: retainedMass / Math.max(1, sourceMass),
            sourceSupportRetention: retainedSourceVoxels /
                Math.max(1, sourceOccupiedVoxels),
            ...measureCloudAtlasConnectivity3d(
                reducedOccupied,
                reducedResolution,
            ),
        };
    }
    return results;
};

const connectedComponents2d = (mask, resolution) => {
    const visited = new Uint8Array(mask.length);
    const components = [];
    for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;
        const queue = [start];
        visited[start] = 1;
        let count = 0;
        while (queue.length > 0) {
            const current = queue.pop();
            count += 1;
            const x = current % resolution;
            const y = Math.floor(current / resolution);
            const neighbors = [
                x > 0 ? current - 1 : -1,
                x + 1 < resolution ? current + 1 : -1,
                y > 0 ? current - resolution : -1,
                y + 1 < resolution ? current + resolution : -1,
            ];
            for (const neighbor of neighbors) {
                if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
        }
        components.push(count);
    }
    return components.sort((left, right) => right - left);
};

/**
 * Component-scale morphology for filament and fallstreak qualification.
 *
 * Global anisotropy accepts both one natural fibre and ten perfectly parallel
 * ribbons.  Fibratus needs a population-level measurement: individual
 * components stay elongated, but their headings, widths, and lengths are not
 * exact clones.  Axial angles use doubled-angle circular statistics because a
 * fibre has no signed forward direction.
 */
const measureProjectionComponentMorphology = (mask, resolution) => {
    const visited = new Uint8Array(mask.length);
    const components = [];
    for (let start = 0; start < mask.length; start += 1) {
        if (!mask[start] || visited[start]) continue;
        const queue = [start];
        const points = [];
        visited[start] = 1;
        while (queue.length > 0) {
            const current = queue.pop();
            const x = current % resolution;
            const y = Math.floor(current / resolution);
            points.push([x, y]);
            const neighbors = [
                x > 0 ? current - 1 : -1,
                x + 1 < resolution ? current + 1 : -1,
                y > 0 ? current - resolution : -1,
                y + 1 < resolution ? current + resolution : -1,
            ];
            for (const neighbor of neighbors) {
                if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue.push(neighbor);
                }
            }
        }
        // One- and two-sample remnants do not contain a resolved orientation.
        if (points.length < 3) continue;
        const centerX = mean(points.map(([x]) => x));
        const centerY = mean(points.map(([, y]) => y));
        let covarianceXX = 0;
        let covarianceYY = 0;
        let covarianceXY = 0;
        for (const [x, y] of points) {
            covarianceXX += (x - centerX) ** 2;
            covarianceYY += (y - centerY) ** 2;
            covarianceXY += (x - centerX) * (y - centerY);
        }
        covarianceXX /= points.length;
        covarianceYY /= points.length;
        covarianceXY /= points.length;
        const trace = covarianceXX + covarianceYY;
        const discriminant = Math.sqrt(Math.max(
            0,
            (covarianceXX - covarianceYY) ** 2 + 4 * covarianceXY ** 2,
        ));
        const major = Math.max(0, (trace + discriminant) * 0.5);
        const minor = Math.max(0, (trace - discriminant) * 0.5);
        components.push({
            area: points.length,
            angle: 0.5 * Math.atan2(
                2 * covarianceXY,
                covarianceXX - covarianceYY,
            ),
            aspectRatio: Math.sqrt(Math.max(1, major) / Math.max(0.1, minor)),
            width: Math.sqrt(Math.max(0.1, minor)),
            length: Math.sqrt(Math.max(1, major)),
        });
    }
    if (components.length === 0) {
        return {
            resolvedComponentCount: 0,
            componentOrientationCoherence: 1,
            componentOrientationSpread: 0,
            componentAreaCoefficientVariation: 0,
            componentWidthCoefficientVariation: 0,
            componentLengthCoefficientVariation: 0,
            meanComponentAspectRatio: 1,
            elongatedComponentFraction: 0,
        };
    }
    const totalArea = components.reduce((sum, component) =>
        sum + component.area, 0);
    const axialCosine = components.reduce((sum, component) =>
        sum + Math.cos(component.angle * 2) * component.area, 0) /
        Math.max(1, totalArea);
    const axialSine = components.reduce((sum, component) =>
        sum + Math.sin(component.angle * 2) * component.area, 0) /
        Math.max(1, totalArea);
    const componentOrientationCoherence = Math.hypot(axialCosine, axialSine);
    return {
        resolvedComponentCount: components.length,
        componentOrientationCoherence,
        componentOrientationSpread: 1 - componentOrientationCoherence,
        componentAreaCoefficientVariation: coefficientOfVariation(
            components.map(({ area }) => area),
        ),
        componentWidthCoefficientVariation: coefficientOfVariation(
            components.map(({ width }) => width),
        ),
        componentLengthCoefficientVariation: coefficientOfVariation(
            components.map(({ length }) => length),
        ),
        meanComponentAspectRatio: mean(
            components.map(({ aspectRatio }) => aspectRatio),
        ),
        elongatedComponentFraction: components.filter(
            ({ aspectRatio }) => aspectRatio >= 2.4,
        ).length / components.length,
    };
};

const shiftedCorrelation = (values, resolution, dx, dy) => {
    let sumA = 0;
    let sumB = 0;
    let sumAA = 0;
    let sumBB = 0;
    let sumAB = 0;
    let count = 0;
    for (let y = Math.max(0, -dy); y < Math.min(resolution, resolution - dy); y += 1) {
        for (let x = Math.max(0, -dx); x < Math.min(resolution, resolution - dx); x += 1) {
            const a = values[y * resolution + x];
            const b = values[(y + dy) * resolution + x + dx];
            sumA += a;
            sumB += b;
            sumAA += a * a;
            sumBB += b * b;
            sumAB += a * b;
            count += 1;
        }
    }
    const covariance = sumAB - sumA * sumB / Math.max(1, count);
    const varianceA = sumAA - sumA * sumA / Math.max(1, count);
    const varianceB = sumBB - sumB * sumB / Math.max(1, count);
    return covariance / Math.sqrt(Math.max(1e-12, varianceA * varianceB));
};

const highPassProjection = (values, resolution, radius = 2) => {
    const output = new Float64Array(values.length);
    for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let localSum = 0;
            let localCount = 0;
            for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
                for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                    const sampleX = x + offsetX;
                    const sampleY = y + offsetY;
                    if (sampleX < 0 || sampleX >= resolution ||
                        sampleY < 0 || sampleY >= resolution) continue;
                    localSum += values[sampleY * resolution + sampleX];
                    localCount += 1;
                }
            }
            output[y * resolution + x] = values[y * resolution + x] -
                localSum / Math.max(1, localCount);
        }
    }
    return output;
};

const measureProjectionLagStructure = (values, resolution) => {
    // Broad finite envelopes correlate at every short lag even when no grid
    // exists. Remove that mesoscale trend before measuring repeated cellular
    // spacing; this leaves peaks, slots, and band grain as the lag signal.
    const residual = highPassProjection(values, resolution);
    const horizontal = [];
    const vertical = [];
    const diagonal = [];
    for (let lag = 2; lag <= Math.floor(resolution / 3); lag += 1) {
        horizontal.push({
            lag,
            correlation: shiftedCorrelation(residual, resolution, lag, 0),
        });
        vertical.push({
            lag,
            correlation: shiftedCorrelation(residual, resolution, 0, lag),
        });
        diagonal.push({
            lag,
            correlation: Math.max(
                shiftedCorrelation(residual, resolution, lag, lag),
                shiftedCorrelation(residual, resolution, lag, -lag),
            ),
        });
    }
    const strongest = (entries) => entries.reduce(
        (best, entry) => entry.correlation > best.correlation ? entry : best,
        { lag: 0, correlation: 0 },
    );
    const strongestHorizontal = strongest(horizontal);
    const strongestVertical = strongest(vertical);
    const strongestDiagonal = strongest(diagonal);
    const positiveMean = (entries) => mean(entries.map((entry) =>
        Math.max(0, entry.correlation)));
    return {
        maximumAxisRepeatCorrelation: clamp(Math.max(
            strongestHorizontal.correlation,
            strongestVertical.correlation,
        ), -1, 1),
        maximumDiagonalRepeatCorrelation: clamp(
            strongestDiagonal.correlation,
            -1,
            1,
        ),
        orthogonalGridScore: clamp(Math.min(
            Math.max(0, strongestHorizontal.correlation),
            Math.max(0, strongestVertical.correlation),
        ), 0, 1),
        dominantRepeatLagU: strongestHorizontal.lag / resolution,
        dominantRepeatLagV: strongestVertical.lag / resolution,
        repeatLagContrast: clamp(Math.max(
            strongestHorizontal.correlation - positiveMean(horizontal),
            strongestVertical.correlation - positiveMean(vertical),
        ), 0, 1),
    };
};

const downsampleProjection = (values, resolution, scale) => {
    const targetResolution = Math.max(1, Math.floor(resolution / scale));
    const output = new Float64Array(targetResolution ** 2);
    for (let targetY = 0; targetY < targetResolution; targetY += 1) {
        for (let targetX = 0; targetX < targetResolution; targetX += 1) {
            let sum = 0;
            let count = 0;
            for (let offsetY = 0; offsetY < scale; offsetY += 1) {
                for (let offsetX = 0; offsetX < scale; offsetX += 1) {
                    const sourceX = targetX * scale + offsetX;
                    const sourceY = targetY * scale + offsetY;
                    if (sourceX >= resolution || sourceY >= resolution) continue;
                    sum += values[sourceY * resolution + sourceX];
                    count += 1;
                }
            }
            output[targetY * targetResolution + targetX] =
                sum / Math.max(1, count);
        }
    }
    return { values: output, resolution: targetResolution };
};

const prefilterFineProjectionPeaks = (values, resolution) => {
    // The emitted density is quantized to R8.  On the native projection that
    // produces several one-texel extrema around one curved C2 grain, while the
    // 2x/4x footprints average those extrema away before peak detection.  A
    // single 3x3 box footprint makes the scale-1 denominator describe resolved
    // condensate maxima instead of byte-level stair steps.  Coarser projections
    // are already footprint filtered by downsampleProjection and must remain
    // untouched so genuine small grains can still fail reconstruction.
    const output = new Float64Array(values.length);
    for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let sum = 0;
            let count = 0;
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                const sampleY = y + offsetY;
                if (sampleY < 0 || sampleY >= resolution) continue;
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    const sampleX = x + offsetX;
                    if (sampleX < 0 || sampleX >= resolution) continue;
                    sum += values[sampleY * resolution + sampleX];
                    count += 1;
                }
            }
            output[y * resolution + x] = sum / Math.max(1, count);
        }
    }
    return output;
};

const countProjectionPeaks = (values, resolution) => {
    const maximum = values.reduce((best, value) => Math.max(best, value), 0);
    if (maximum <= 1e-9 || resolution < 3) return 0;
    const threshold = maximum * 0.17;
    let count = 0;
    for (let y = 1; y + 1 < resolution; y += 1) {
        for (let x = 1; x + 1 < resolution; x += 1) {
            const center = values[y * resolution + x];
            if (center < threshold) continue;
            let noLowerThanNeighbors = true;
            let strictlyHigher = false;
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                    if (offsetX === 0 && offsetY === 0) continue;
                    const neighbor = values[
                        (y + offsetY) * resolution + x + offsetX
                    ];
                    if (neighbor > center) noLowerThanNeighbors = false;
                    if (neighbor < center * 0.985) strictlyHigher = true;
                }
            }
            if (noLowerThanNeighbors && strictlyHigher) count += 1;
        }
    }
    return count;
};

const measureProjectionPeakSurvival = (values, resolution) => {
    const scale1 = countProjectionPeaks(
        prefilterFineProjectionPeaks(values, resolution),
        resolution,
    );
    const scale2Projection = downsampleProjection(values, resolution, 2);
    const scale4Projection = downsampleProjection(values, resolution, 4);
    const scale2 = countProjectionPeaks(
        scale2Projection.values,
        scale2Projection.resolution,
    );
    const scale4 = countProjectionPeaks(
        scale4Projection.values,
        scale4Projection.resolution,
    );
    return {
        multiscalePeakCount1: scale1,
        multiscalePeakCount2: scale2,
        multiscalePeakCount4: scale4,
        scale2PeakSurvival: Math.min(1, scale2 / Math.max(1, scale1)),
        scale4PeakSurvival: Math.min(1, scale4 / Math.max(1, scale1)),
    };
};

const measureProjectionOvalAndCurvature = ({
    mask,
    resolution,
    occupied,
    centroidU,
    centroidV,
    covarianceUU,
    covarianceVV,
    covarianceUV,
}) => {
    if (occupied.length < 4) {
        return {
            ellipseSimilarity: 1,
            antiOvalScore: 0,
            boundaryRadialCoefficientVariation: 0,
            boundaryCurvatureVariation: 0,
        };
    }
    const determinant = Math.max(
        1e-8,
        covarianceUU * covarianceVV - covarianceUV * covarianceUV,
    );
    const inverseUU = covarianceVV / determinant;
    const inverseVV = covarianceUU / determinant;
    const inverseUV = -covarianceUV / determinant;
    const distances = [];
    for (let v = 0; v < resolution; v += 1) {
        for (let u = 0; u < resolution; u += 1) {
            const du = u - centroidU;
            const dv = v - centroidV;
            distances.push({
                index: v * resolution + u,
                distance: du * du * inverseUU + 2 * du * dv * inverseUV +
                    dv * dv * inverseVV,
            });
        }
    }
    distances.sort((left, right) => left.distance - right.distance);
    const ellipseMask = new Uint8Array(mask.length);
    for (let index = 0; index < occupied.length; index += 1) {
        ellipseMask[distances[index].index] = 1;
    }
    let intersection = 0;
    let union = 0;
    for (let index = 0; index < mask.length; index += 1) {
        if (mask[index] || ellipseMask[index]) union += 1;
        if (mask[index] && ellipseMask[index]) intersection += 1;
    }
    const ellipseSimilarity = intersection / Math.max(1, union);

    const radialBins = new Float64Array(32);
    for (const index of occupied) {
        const u = index % resolution;
        const v = Math.floor(index / resolution);
        const boundary = u === 0 || v === 0 ||
            u === resolution - 1 || v === resolution - 1 ||
            !mask[index - 1] || !mask[index + 1] ||
            !mask[index - resolution] || !mask[index + resolution];
        if (!boundary) continue;
        const du = u - centroidU;
        const dv = v - centroidV;
        let angle = Math.atan2(dv, du);
        if (angle < 0) angle += Math.PI * 2;
        const bin = Math.min(31, Math.floor(angle / (Math.PI * 2) * 32));
        radialBins[bin] = Math.max(radialBins[bin], Math.hypot(du, dv));
    }
    // Fill empty angular bins from the nearest populated neighbors so broken
    // cellular fields register their real scalloped envelope without an
    // arbitrary zero-radius spike.
    for (let bin = 0; bin < radialBins.length; bin += 1) {
        if (radialBins[bin] > 0) continue;
        for (let distance = 1; distance < radialBins.length; distance += 1) {
            const left = radialBins[(bin - distance + radialBins.length) %
                radialBins.length];
            const right = radialBins[(bin + distance) % radialBins.length];
            if (left > 0 || right > 0) {
                radialBins[bin] = left > 0 && right > 0
                    ? (left + right) * 0.5 : Math.max(left, right);
                break;
            }
        }
    }
    const radialMean = mean(radialBins);
    const radialVariation = coefficientOfVariation(radialBins);
    const curvature = [];
    for (let bin = 0; bin < radialBins.length; bin += 1) {
        const previous = radialBins[(bin + radialBins.length - 1) %
            radialBins.length];
        const current = radialBins[bin];
        const next = radialBins[(bin + 1) % radialBins.length];
        curvature.push(Math.abs(previous - 2 * current + next) /
            Math.max(1e-6, radialMean));
    }
    return {
        ellipseSimilarity,
        antiOvalScore: 1 - ellipseSimilarity,
        boundaryRadialCoefficientVariation: radialVariation,
        boundaryCurvatureVariation: coefficientOfVariation(curvature),
    };
};

export const analyzeCloudAtlasProjection = (
    projection,
    densityThreshold = 16 / 255,
) => {
    const { resolution, maximum, integral } = projection;
    const mask = Uint8Array.from(maximum, (value) => value >= densityThreshold ? 1 : 0);
    const occupied = [];
    let minimumU = resolution;
    let maximumU = -1;
    let minimumV = resolution;
    let maximumV = -1;
    let edgeSamples = 0;
    let weight = 0;
    let weightedU = 0;
    let weightedV = 0;
    for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const u = index % resolution;
        const v = Math.floor(index / resolution);
        occupied.push(index);
        minimumU = Math.min(minimumU, u);
        maximumU = Math.max(maximumU, u);
        minimumV = Math.min(minimumV, v);
        maximumV = Math.max(maximumV, v);
        if (u === 0 || v === 0 || u === resolution - 1 || v === resolution - 1) {
            edgeSamples += 1;
        }
        const localWeight = integral[index] + maximum[index] * 0.08;
        weight += localWeight;
        weightedU += u * localWeight;
        weightedV += v * localWeight;
    }
    const centroidU = weightedU / Math.max(1e-9, weight);
    const centroidV = weightedV / Math.max(1e-9, weight);
    let covarianceUU = 0;
    let covarianceVV = 0;
    let covarianceUV = 0;
    for (const index of occupied) {
        const u = index % resolution;
        const v = Math.floor(index / resolution);
        const localWeight = integral[index] + maximum[index] * 0.08;
        covarianceUU += (u - centroidU) ** 2 * localWeight;
        covarianceVV += (v - centroidV) ** 2 * localWeight;
        covarianceUV += (u - centroidU) * (v - centroidV) * localWeight;
    }
    covarianceUU /= Math.max(1e-9, weight);
    covarianceVV /= Math.max(1e-9, weight);
    covarianceUV /= Math.max(1e-9, weight);
    const trace = covarianceUU + covarianceVV;
    const determinant = covarianceUU * covarianceVV - covarianceUV ** 2;
    const discriminant = Math.sqrt(Math.max(0, trace ** 2 * 0.25 - determinant));
    const eigenMajor = trace * 0.5 + discriminant;
    const eigenMinor = trace * 0.5 - discriminant;
    const components = connectedComponents2d(mask, resolution);
    const rowMasses = Array.from({ length: resolution }, (_, v) =>
        integral.slice(v * resolution, (v + 1) * resolution)
            .reduce((sum, value) => sum + value, 0));
    const lagStructure = measureProjectionLagStructure(integral, resolution);
    const peakSurvival = measureProjectionPeakSurvival(integral, resolution);
    // A smooth lens or shield has a correlated high-pass boundary but cannot
    // constitute a cellular grid. Require a resolved peak population before
    // reporting the orthogonal-grid gate, while retaining the raw axis and
    // diagonal correlations for wave/roll qualification.
    const cellularPeakGate = clamp(
        (peakSurvival.multiscalePeakCount1 - 3) / 7,
    );
    lagStructure.orthogonalGridScore *= cellularPeakGate;
    const ovalAndCurvature = measureProjectionOvalAndCurvature({
        mask,
        resolution,
        occupied,
        centroidU,
        centroidV,
        covarianceUU,
        covarianceVV,
        covarianceUV,
    });
    const componentMorphology = measureProjectionComponentMorphology(
        mask,
        resolution,
    );
    const boundingArea = maximumU >= minimumU
        ? (maximumU - minimumU + 1) * (maximumV - minimumV + 1) : 0;
    return {
        occupiedSamples: occupied.length,
        occupiedFraction: occupied.length / mask.length,
        boundingCompactness: occupied.length / Math.max(1, boundingArea),
        spanU: Math.max(0, maximumU - minimumU + 1) / resolution,
        spanV: Math.max(0, maximumV - minimumV + 1) / resolution,
        centroidU: centroidU / Math.max(1, resolution - 1),
        centroidV: centroidV / Math.max(1, resolution - 1),
        componentCount: components.length,
        largestComponentFraction: (components[0] ?? 0) / Math.max(1, occupied.length),
        edgeContactFraction: edgeSamples / Math.max(1, occupied.length),
        anisotropy: Math.sqrt(Math.max(1, eigenMajor) / Math.max(1e-9, eigenMinor)),
        maximumRepeatCorrelation: lagStructure.maximumAxisRepeatCorrelation,
        ...lagStructure,
        ...peakSurvival,
        ...ovalAndCurvature,
        ...componentMorphology,
        rowMassCoefficientVariation: coefficientOfVariation(
            rowMasses.filter((value) => value > 1e-7),
        ),
        meanIntegratedDensity: mean(integral),
        occupiedMeanIntegratedDensity: mean(
            occupied.map((index) => integral[index]),
        ),
        mask,
    };
};

export const measureCloudAtlasBoundaryFaces = (
    decoded,
    densityThreshold = 16 / 255,
) => {
    const { density, resolution } = decoded;
    let occupied = 0;
    let horizontalFaceOccupied = 0;
    let verticalFaceOccupied = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (density[index3(resolution, x, y, z)] / 255 < densityThreshold) continue;
                occupied += 1;
                if (x === 0 || x === resolution - 1 || z === 0 || z === resolution - 1) {
                    horizontalFaceOccupied += 1;
                }
                if (y === 0 || y === resolution - 1) verticalFaceOccupied += 1;
            }
        }
    }
    return {
        horizontalFaceFraction: horizontalFaceOccupied / Math.max(1, occupied),
        verticalFaceFraction: verticalFaceOccupied / Math.max(1, occupied),
    };
};

export const analyzeUpperMiddleAtlasVolume = (input) => {
    const decoded = decodeCloudAtlasVolume(input);
    const threshold = input.manifest.occupancy.densityByteThreshold / 255;
    const ground = analyzeCloudAtlasProjection(
        projectCloudAtlasDensity(decoded, "ground"), threshold,
    );
    const sideCrosswind = analyzeCloudAtlasProjection(
        projectCloudAtlasDensity(decoded, "side-crosswind"), threshold,
    );
    const sideDownwind = analyzeCloudAtlasProjection(
        projectCloudAtlasDensity(decoded, "side-downwind"), threshold,
    );
    return {
        volume: decoded.volume,
        ground,
        sideCrosswind,
        sideDownwind,
        boundaryFaces: measureCloudAtlasBoundaryFaces(decoded, threshold),
    };
};

export const analyzeCloudAtlasProductionObliqueVolume = (
    input,
    views = CLOUD_ATLAS_PRODUCTION_OBLIQUE_VIEWS,
) => {
    const decoded = decodeCloudAtlasVolume(input);
    const threshold = input.manifest.occupancy.densityByteThreshold / 255;
    const obliqueViews = Object.fromEntries(views.map((view) => [
        view.id,
        analyzeCloudAtlasProjection(
            projectCloudAtlasDensityOblique(decoded, view),
            threshold,
        ),
    ]));
    return {
        volume: decoded.volume,
        geometry: measureCloudAtlasVolumeGeometry(decoded, threshold),
        reconstruction: measureCloudAtlasScaleReconstruction(decoded, {
            densityThreshold: threshold,
        }),
        views: obliqueViews,
    };
};

export const cloudAtlasProjectionDistance = (left, right) => {
    if (left.mask.length !== right.mask.length) {
        throw new Error("Projection masks must share a resolution");
    }
    let union = 0;
    let intersection = 0;
    for (let index = 0; index < left.mask.length; index += 1) {
        if (left.mask[index] || right.mask[index]) union += 1;
        if (left.mask[index] && right.mask[index]) intersection += 1;
    }
    return 1 - intersection / Math.max(1, union);
};

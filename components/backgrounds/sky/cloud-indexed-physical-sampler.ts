import {
    sampleCloudWeatherSimulationPhysical,
    sampleGeneratedCloudOwnerPhysical,
} from "./cloud-generated-physical-sampler";
import {
    combineCloudPhysicalSamples,
    type CloudPhysicalSample,
    type CloudVec3,
} from "./cloud-physical-sample";
import {
    qualifyCloudPhysicalPassParity,
    type CloudPhysicalPassParityResult,
} from "./cloud-physical-pass-parity";
import type { CloudProductionFrameV1 } from "./cloud-production-frame";
import type {
    CloudWeatherFeature,
    CloudWeatherOwner,
    CloudWeatherSimulation,
} from "./cloud-weather-engine";

export interface CloudIndexedSampleResultV1 {
    sample: CloudPhysicalSample;
    totalOwners: number;
    cellCandidates: number;
    boundedCandidates: number;
    evaluatedOwners: number;
}

export interface CloudIndexedSamplerQualificationV1 {
    schemaVersion: 1;
    parity: CloudPhysicalPassParityResult;
    positions: number;
    fullOwnerEvaluations: number;
    indexedOwnerEvaluations: number;
    reductionFraction: number;
}

const cellKeyForPoint = (
    frame: CloudProductionFrameV1,
    positionKm: CloudVec3,
) => {
    const size = frame.spatialIndex.cellSizeKm;
    return `${Math.floor(positionKm[0] / size)}:` +
        `${Math.floor(positionKm[2] / size)}`;
};

const contains = (
    minimum: CloudVec3,
    maximum: CloudVec3,
    point: CloudVec3,
) => point.every((value, axis) =>
    value >= minimum[axis] && value <= maximum[axis]);

const featureMap = (
    features: readonly CloudWeatherFeature[],
): ReadonlyMap<number, readonly CloudWeatherFeature[]> => {
    const mutable = new Map<number, CloudWeatherFeature[]>();
    for (const feature of features.filter(({ active }) => active)) {
        const entries = mutable.get(feature.parentOwnerNumericId) ?? [];
        entries.push(feature);
        mutable.set(feature.parentOwnerNumericId, entries);
    }
    return mutable;
};

/**
 * Evaluates only owners whose conservative world-space bounds contain the
 * point. This is the CPU reference for tile/brick owner-list acceleration.
 */
export const sampleIndexedCloudWeatherPhysicalV1 = (
    simulation: CloudWeatherSimulation,
    frame: CloudProductionFrameV1,
    positionKm: CloudVec3,
): CloudIndexedSampleResultV1 => {
    const cell = frame.spatialIndex.cells.get(cellKeyForPoint(frame, positionKm));
    const cellCandidates = cell?.ownerIndices ?? [];
    const ownerById = new Map(simulation.owners
        .filter(({ active }) => active)
        .map((owner) => [owner.numericId, owner]));
    const featuresByOwner = featureMap(simulation.features);
    const boundedOwners: CloudWeatherOwner[] = [];
    for (const ownerIndex of cellCandidates) {
        const bounds = frame.spatialIndex.ownerBounds[ownerIndex];
        if (!bounds || !contains(bounds.minimumKm, bounds.maximumKm, positionKm)) {
            continue;
        }
        const system = frame.systems[ownerIndex];
        const owner = system ? ownerById.get(system.owner.ownerId) : undefined;
        if (owner) boundedOwners.push(owner);
    }
    const samples = boundedOwners.map((owner) =>
        sampleGeneratedCloudOwnerPhysical(
            owner,
            simulation.domain,
            featuresByOwner.get(owner.numericId) ?? [],
            positionKm,
        ));
    return {
        sample: combineCloudPhysicalSamples(samples),
        totalOwners: ownerById.size,
        cellCandidates: cellCandidates.length,
        boundedCandidates: boundedOwners.length,
        evaluatedOwners: samples.length,
    };
};

export const qualifyIndexedCloudWeatherSamplerV1 = (
    simulation: CloudWeatherSimulation,
    frame: CloudProductionFrameV1,
    positionsKm: readonly CloudVec3[],
): CloudIndexedSamplerQualificationV1 => {
    let indexedOwnerEvaluations = 0;
    const indexed = (positionKm: CloudVec3) => {
        const result = sampleIndexedCloudWeatherPhysicalV1(
            simulation,
            frame,
            positionKm,
        );
        indexedOwnerEvaluations += result.evaluatedOwners;
        return result.sample;
    };
    const full = (positionKm: CloudVec3) =>
        sampleCloudWeatherSimulationPhysical(simulation, positionKm);
    const parity = qualifyCloudPhysicalPassParity([
        { pass: "camera", sample: full },
        { pass: "light-volume", sample: indexed },
        { pass: "atmosphere-shadow", sample: indexed },
        { pass: "hydrometeor", sample: indexed },
        { pass: "reference", sample: full },
    ], positionsKm, {
        simulationTimeSeconds: simulation.timeSeconds,
    });
    const activeOwners = simulation.owners.filter(({ active }) => active).length;
    const fullOwnerEvaluations = positionsKm.length * activeOwners * 2;
    const totalComparableEvaluations = positionsKm.length * activeOwners * 3;
    return {
        schemaVersion: 1,
        parity,
        positions: positionsKm.length,
        fullOwnerEvaluations,
        indexedOwnerEvaluations,
        reductionFraction: totalComparableEvaluations > 0
            ? Math.max(0, 1 - indexedOwnerEvaluations /
                totalComparableEvaluations)
            : 0,
    };
};

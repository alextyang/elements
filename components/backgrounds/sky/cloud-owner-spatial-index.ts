import type { CloudVec3 } from "./cloud-physical-sample";
import type { CompiledCloudSystemV2 } from "./cloud-system-abi-v2";

export interface CloudOwnerBoundsV1 {
    ownerId: number;
    ownerIndex: number;
    minimumKm: CloudVec3;
    maximumKm: CloudVec3;
}

export interface CloudOwnerSpatialCellV1 {
    x: number;
    z: number;
    ownerIndices: readonly number[];
}

export interface CloudOwnerSpatialIndexV1 {
    schemaVersion: 1;
    cellSizeKm: number;
    maximumOwnersPerCell: number;
    ownerBounds: readonly CloudOwnerBoundsV1[];
    cells: ReadonlyMap<string, CloudOwnerSpatialCellV1>;
    droppedMemberships: number;
}

export interface CloudOwnerRayHitV1 {
    ownerId: number;
    ownerIndex: number;
    entryDistanceKm: number;
    exitDistanceKm: number;
}

export interface CloudOwnerSpatialIndexIssue {
    code: string;
    subject: string;
    message: string;
}

const cellKey = (x: number, z: number) => `${x}:${z}`;
const cellCoordinate = (value: number, cellSizeKm: number) =>
    Math.floor(value / cellSizeKm);

const boundsFor = (
    system: CompiledCloudSystemV2,
    ownerIndex: number,
): CloudOwnerBoundsV1 => {
    const center = system.owner.centerKm;
    const radius = system.owner.horizontalRadiusKm;
    const transition = Math.max(0, system.owner.boundaryTransitionKm);
    return {
        ownerId: system.owner.ownerId,
        ownerIndex,
        minimumKm: [
            center[0] - radius[0] - transition,
            system.owner.baseAltitudeKm - transition,
            center[2] - radius[2] - transition,
        ],
        maximumKm: [
            center[0] + radius[0] + transition,
            system.owner.baseAltitudeKm + system.owner.geometricDepthKm + transition,
            center[2] + radius[2] + transition,
        ],
    };
};

export const buildCloudOwnerSpatialIndexV1 = (
    systems: readonly CompiledCloudSystemV2[],
    options?: {
        cellSizeKm?: number;
        maximumOwnersPerCell?: number;
        maximumCellsPerOwner?: number;
    },
): CloudOwnerSpatialIndexV1 => {
    const cellSizeKm = Number.isFinite(options?.cellSizeKm) &&
        (options?.cellSizeKm ?? 0) > 0 ? options!.cellSizeKm! : 16;
    const maximumOwnersPerCell = Number.isFinite(options?.maximumOwnersPerCell) &&
        (options?.maximumOwnersPerCell ?? 0) > 0
        ? Math.trunc(options!.maximumOwnersPerCell!) : 32;
    const maximumCellsPerOwner = Number.isFinite(options?.maximumCellsPerOwner) &&
        (options?.maximumCellsPerOwner ?? 0) > 0
        ? Math.trunc(options!.maximumCellsPerOwner!) : 4_096;
    const ownerBounds = systems.map(boundsFor);
    const mutableCells = new Map<string, {
        x: number;
        z: number;
        ownerIndices: number[];
    }>();
    let droppedMemberships = 0;

    for (const bounds of ownerBounds) {
        const minimumX = cellCoordinate(bounds.minimumKm[0], cellSizeKm);
        const maximumX = cellCoordinate(bounds.maximumKm[0], cellSizeKm);
        const minimumZ = cellCoordinate(bounds.minimumKm[2], cellSizeKm);
        const maximumZ = cellCoordinate(bounds.maximumKm[2], cellSizeKm);
        let cellsForOwner = 0;
        outer: for (let z = minimumZ; z <= maximumZ; z += 1) {
            for (let x = minimumX; x <= maximumX; x += 1) {
                if (cellsForOwner >= maximumCellsPerOwner) {
                    droppedMemberships += (maximumX - x + 1) +
                        Math.max(0, maximumZ - z) * (maximumX - minimumX + 1);
                    break outer;
                }
                cellsForOwner += 1;
                const key = cellKey(x, z);
                const cell = mutableCells.get(key) ?? { x, z, ownerIndices: [] };
                if (cell.ownerIndices.length < maximumOwnersPerCell) {
                    cell.ownerIndices.push(bounds.ownerIndex);
                    mutableCells.set(key, cell);
                } else {
                    droppedMemberships += 1;
                }
            }
        }
    }

    const cells = new Map<string, CloudOwnerSpatialCellV1>();
    for (const [key, cell] of mutableCells) {
        cells.set(key, {
            x: cell.x,
            z: cell.z,
            ownerIndices: [...new Set(cell.ownerIndices)].sort((left, right) =>
                left - right),
        });
    }
    return {
        schemaVersion: 1,
        cellSizeKm,
        maximumOwnersPerCell,
        ownerBounds,
        cells,
        droppedMemberships,
    };
};

const rayBoxInterval = (
    origin: CloudVec3,
    direction: CloudVec3,
    bounds: CloudOwnerBoundsV1,
    maximumDistanceKm: number,
): readonly [number, number] | null => {
    let entry = 0;
    let exit = maximumDistanceKm;
    for (let axis = 0; axis < 3; axis += 1) {
        const component = direction[axis];
        if (Math.abs(component) < 1e-9) {
            if (origin[axis] < bounds.minimumKm[axis] ||
                origin[axis] > bounds.maximumKm[axis]) return null;
            continue;
        }
        const inverse = 1 / component;
        let near = (bounds.minimumKm[axis] - origin[axis]) * inverse;
        let far = (bounds.maximumKm[axis] - origin[axis]) * inverse;
        if (near > far) [near, far] = [far, near];
        entry = Math.max(entry, near);
        exit = Math.min(exit, far);
        if (entry > exit) return null;
    }
    return exit >= 0 && entry <= maximumDistanceKm
        ? [Math.max(0, entry), Math.min(maximumDistanceKm, exit)] : null;
};

const normalized = (value: CloudVec3): CloudVec3 => {
    const magnitude = Math.hypot(value[0], value[1], value[2]);
    if (magnitude <= 1e-9) throw new Error("Ray direction must be non-zero.");
    return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
};

const rayCandidateIndices = (
    index: CloudOwnerSpatialIndexV1,
    origin: CloudVec3,
    direction: CloudVec3,
    maximumDistanceKm: number,
): ReadonlySet<number> => {
    const candidates = new Set<number>();
    const cellSize = index.cellSizeKm;
    let cellX = cellCoordinate(origin[0], cellSize);
    let cellZ = cellCoordinate(origin[2], cellSize);
    const stepX = direction[0] > 1e-9 ? 1 : direction[0] < -1e-9 ? -1 : 0;
    const stepZ = direction[2] > 1e-9 ? 1 : direction[2] < -1e-9 ? -1 : 0;
    const nextBoundaryX = () => (cellX + (stepX > 0 ? 1 : 0)) * cellSize;
    const nextBoundaryZ = () => (cellZ + (stepZ > 0 ? 1 : 0)) * cellSize;
    let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY :
        (nextBoundaryX() - origin[0]) / direction[0];
    let tMaxZ = stepZ === 0 ? Number.POSITIVE_INFINITY :
        (nextBoundaryZ() - origin[2]) / direction[2];
    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY :
        cellSize / Math.abs(direction[0]);
    const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY :
        cellSize / Math.abs(direction[2]);
    const maximumSteps = Math.max(
        1,
        Math.ceil(maximumDistanceKm / cellSize * 3) + 8,
    );
    let distance = 0;

    for (let step = 0; step < maximumSteps &&
        distance <= maximumDistanceKm; step += 1) {
        const cell = index.cells.get(cellKey(cellX, cellZ));
        for (const ownerIndex of cell?.ownerIndices ?? []) {
            candidates.add(ownerIndex);
        }
        if (tMaxX < tMaxZ) {
            distance = tMaxX;
            tMaxX += tDeltaX;
            cellX += stepX;
        } else {
            distance = tMaxZ;
            tMaxZ += tDeltaZ;
            cellZ += stepZ;
        }
        if (stepX === 0 && stepZ === 0) break;
    }
    return candidates;
};

export const queryCloudOwnerRayV1 = (
    index: CloudOwnerSpatialIndexV1,
    originKm: CloudVec3,
    directionValue: CloudVec3,
    maximumDistanceKm: number,
): readonly CloudOwnerRayHitV1[] => {
    const direction = normalized(directionValue);
    const maximumDistance = Number.isFinite(maximumDistanceKm)
        ? Math.max(0, maximumDistanceKm) : 0;
    const candidates = rayCandidateIndices(
        index,
        originKm,
        direction,
        maximumDistance,
    );
    const hits: CloudOwnerRayHitV1[] = [];
    for (const ownerIndex of candidates) {
        const bounds = index.ownerBounds[ownerIndex];
        if (!bounds) continue;
        const interval = rayBoxInterval(
            originKm,
            direction,
            bounds,
            maximumDistance,
        );
        if (!interval) continue;
        hits.push({
            ownerId: bounds.ownerId,
            ownerIndex,
            entryDistanceKm: interval[0],
            exitDistanceKm: interval[1],
        });
    }
    return hits.sort((left, right) =>
        left.entryDistanceKm - right.entryDistanceKm ||
        left.ownerId - right.ownerId);
};

export const validateCloudOwnerSpatialIndexV1 = (
    index: CloudOwnerSpatialIndexV1,
): readonly CloudOwnerSpatialIndexIssue[] => {
    const issues: CloudOwnerSpatialIndexIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });
    if (index.schemaVersion !== 1) {
        issue("unsupported-schema", "index", "Expected spatial-index schema 1.");
    }
    const ownerIds = new Set<number>();
    for (const bounds of index.ownerBounds) {
        if (ownerIds.has(bounds.ownerId)) {
            issue("duplicate-owner-id", String(bounds.ownerId),
                "Spatial-index owner identities must be unique.");
        }
        ownerIds.add(bounds.ownerId);
        if (bounds.minimumKm.some((value, axis) =>
            value > bounds.maximumKm[axis])) {
            issue("invalid-bounds", String(bounds.ownerId),
                "Owner minimum bounds must not exceed maximum bounds.");
        }
    }
    for (const [key, cell] of index.cells) {
        if (cell.ownerIndices.length > index.maximumOwnersPerCell) {
            issue("cell-overflow", key,
                "Cell owner list exceeds the declared fixed maximum.");
        }
        if (new Set(cell.ownerIndices).size !== cell.ownerIndices.length) {
            issue("duplicate-cell-owner", key,
                "A cell must not contain duplicate owner indices.");
        }
        for (const ownerIndex of cell.ownerIndices) {
            if (!index.ownerBounds[ownerIndex]) {
                issue("unknown-owner-index", key,
                    `Cell references missing owner index ${ownerIndex}.`);
            }
        }
    }
    return issues;
};

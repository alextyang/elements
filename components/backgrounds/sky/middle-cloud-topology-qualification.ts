import {
    MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
    MIDDLE_CLOUD_TOPOLOGY_VARIANTS,
    middleCloudTopologySignatureDistance,
    middleCloudTopologyVariantSignature,
    type MiddleCloudRepresentation,
} from "./middle-cloud-physical-foundation";

export interface MiddleCloudTopologyInstance {
    readonly variantId: string;
    readonly centerEastKm: number;
    readonly centerNorthKm: number;
    readonly majorRadiusKm: number;
    readonly minorRadiusKm: number;
    readonly topologySignature: readonly number[];
}

export const MIDDLE_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT = Object.freeze({
    minimumVariantCount: 3,
    maximumVariantCount: 5,
    minimumVariantSignatureDistance: 0.028,
    maximumExactCloneFraction: 0.42,
    maximumRepeatedLagScore: 0.48,
    minimumNearestSpacingCoefficientVariation: 0.08,
});

const assertFinite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};
const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values: readonly number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) * 0.5;
};
const spacingVariation = (instances: readonly MiddleCloudTopologyInstance[]) => {
    if (instances.length < 3) return 0;
    const nearest = instances.map((instance, index) => Math.min(
        ...instances.filter((_, other) => other !== index).map((other) =>
            Math.hypot(
                instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm,
            )),
    ));
    const average = mean(nearest);
    return Math.sqrt(mean(nearest.map((value) => (value - average) ** 2))) /
        Math.max(1e-9, average);
};

/** Repeated world-space displacement score; shared band direction alone is safe. */
export const middleCloudRepeatedLagScore = (
    instances: readonly MiddleCloudTopologyInstance[],
    lagTolerance = 0.14,
) => {
    if (instances.length < 4) return 0;
    assertFinite("lag tolerance", lagTolerance);
    if (!(lagTolerance > 0 && lagTolerance <= 0.5)) {
        throw new Error("Lag tolerance must be in (0, 0.5]");
    }
    const nearest = instances.map((instance, index) => Math.min(
        ...instances.filter((_, other) => other !== index).map((other) =>
            Math.hypot(
                instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm,
            )),
    ));
    const scale = Math.max(1e-6, median(nearest));
    const bins = new Map<string, number>();
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            let east = (instances[right].centerEastKm - instances[left].centerEastKm) /
                scale;
            let north = (instances[right].centerNorthKm - instances[left].centerNorthKm) /
                scale;
            const distance = Math.hypot(east, north);
            if (distance < 0.45 || distance > 4.25) continue;
            if (east < 0 || (Math.abs(east) < 1e-12 && north < 0)) {
                east = -east;
                north = -north;
            }
            const key = `${Math.round(east / lagTolerance)}:${Math.round(north / lagTolerance)}`;
            bins.set(key, (bins.get(key) ?? 0) + 1);
        }
    }
    return Math.max(0, ...bins.values()) / Math.max(1, instances.length - 1);
};

const instanceSignature = (instance: MiddleCloudTopologyInstance) => {
    if (!(instance.majorRadiusKm > 0 && instance.minorRadiusKm > 0) ||
        instance.topologySignature.length === 0) {
        throw new Error("Owner radii must be positive and signature nonempty");
    }
    return [
        ...instance.topologySignature,
        Math.log(instance.majorRadiusKm),
        Math.log(instance.minorRadiusKm),
    ];
};

export const middleCloudExactCloneFraction = (
    instances: readonly MiddleCloudTopologyInstance[],
    tolerance = 0.025,
) => {
    if (instances.length < 2) return 0;
    const parents = instances.map((_, index) => index);
    const find = (index: number): number => {
        if (parents[index] !== index) parents[index] = find(parents[index]);
        return parents[index];
    };
    const signatures = instances.map(instanceSignature);
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            if (instances[left].variantId !== instances[right].variantId) continue;
            if (middleCloudTopologySignatureDistance(
                signatures[left], signatures[right],
            ) > tolerance) continue;
            const leftRoot = find(left);
            const rightRoot = find(right);
            if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
        }
    }
    const groups = new Map<number, number>();
    for (let index = 0; index < instances.length; index += 1) {
        const root = find(index);
        groups.set(root, (groups.get(root) ?? 0) + 1);
    }
    return Math.max(1, ...groups.values()) / instances.length;
};

export const qualifyMiddleCloudVariantSet = (
    representation: MiddleCloudRepresentation,
) => {
    const contract = MIDDLE_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT;
    const variants = MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation];
    const violations: string[] = [];
    if (variants.length < contract.minimumVariantCount ||
        variants.length > contract.maximumVariantCount) {
        violations.push("representation-must-have-three-to-five-topology-variants");
    }
    if (new Set(variants.map(({ id }) => id)).size !== variants.length) {
        violations.push("topology-variant-ids-must-be-unique");
    }
    let minimumPairwiseSignatureDistance = Infinity;
    for (let left = 0; left < variants.length; left += 1) {
        for (let right = left + 1; right < variants.length; right += 1) {
            minimumPairwiseSignatureDistance = Math.min(
                minimumPairwiseSignatureDistance,
                middleCloudTopologySignatureDistance(
                    middleCloudTopologyVariantSignature(variants[left]),
                    middleCloudTopologyVariantSignature(variants[right]),
                ),
            );
        }
    }
    if (minimumPairwiseSignatureDistance < contract.minimumVariantSignatureDistance) {
        violations.push("topology-variants-are-not-physically-distinct");
    }
    return {
        valid: violations.length === 0,
        variantCount: variants.length,
        minimumPairwiseSignatureDistance,
        violations,
    };
};

export const qualifyMiddleCloudLayout = (
    representation: MiddleCloudRepresentation,
    instances: readonly MiddleCloudTopologyInstance[],
) => {
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
    const repeatedPopulation = instances.length >= 4;
    const violations: string[] = [];
    if (instances.length === 0) violations.push("formation-has-no-owner");
    for (const instance of instances) {
        assertFinite("owner east", instance.centerEastKm);
        assertFinite("owner north", instance.centerNorthKm);
        for (const value of instance.topologySignature) {
            assertFinite("topology signature", value);
        }
    }
    const cloneFraction = middleCloudExactCloneFraction(instances);
    const repeatedLagScore = middleCloudRepeatedLagScore(instances);
    const nearestSpacingCoefficientVariation = spacingVariation(instances);
    if (repeatedPopulation && cloneFraction >
        MIDDLE_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT.maximumExactCloneFraction) {
        violations.push("too-many-exact-macroshape-clones");
    }
    if (repeatedPopulation && repeatedLagScore >
        MIDDLE_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT.maximumRepeatedLagScore) {
        violations.push("owner-layout-forms-a-repeated-grid");
    }
    if (repeatedPopulation && nearestSpacingCoefficientVariation <
        MIDDLE_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT
            .minimumNearestSpacingCoefficientVariation) {
        violations.push("owner-spacing-is-too-regular");
    }
    if (descriptor.elementKind === "continuous-layer" && instances.length > 3) {
        violations.push("continuous-altostratus-must-not-be-tiled-from-owner-stamps");
    }
    if (representation === "altocumulus-volutus" && instances.length !== 1) {
        violations.push("altocumulus-volutus-is-usually-one-solitary-roll");
    }
    return {
        valid: violations.length === 0,
        cloneFraction,
        repeatedLagScore,
        nearestSpacingCoefficientVariation,
        violations,
    };
};

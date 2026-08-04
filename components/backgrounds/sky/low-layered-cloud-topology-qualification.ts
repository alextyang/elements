import {
    LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
    LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS,
    lowLayeredCloudTopologySignatureDistance,
    lowLayeredCloudTopologyVariantSignature,
    type LowLayeredCloudRepresentation,
} from "./low-layered-cloud-physical-foundation";

export interface LowLayeredTopologyInstance {
    readonly variantId: string;
    readonly centerEastKm: number;
    readonly centerNorthKm: number;
    readonly majorRadiusKm: number;
    readonly minorRadiusKm: number;
    readonly boundaryCorrelationId: string;
    readonly topologySignature: readonly number[];
    /** Parent ID is required for pannus but forbidden as geometry aliasing. */
    readonly parentOwnerId: string | null;
}

export const LOW_LAYERED_TOPOLOGY_QUALIFICATION_CONTRACT = Object.freeze({
    minimumVariantCount: 3,
    maximumVariantCount: 5,
    minimumVariantSignatureDistance: 0.022,
    maximumExactCloneFraction: 0.4,
    maximumRepeatedLagScore: 0.46,
    minimumNearestSpacingCoefficientVariation: 0.09,
    maximumContinuousLayerOwnerCount: 3,
});

const finite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};
const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const median = (values: readonly number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) * 0.5;
};

const nearestSpacingVariation = (instances: readonly LowLayeredTopologyInstance[]) => {
    if (instances.length < 3) return 0;
    const nearest = instances.map((instance, index) => Math.min(
        ...instances.filter((_, other) => other !== index).map((other) =>
            Math.hypot(instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm)),
    ));
    const average = mean(nearest);
    return Math.sqrt(mean(nearest.map((value) => (value - average) ** 2))) /
        Math.max(1e-9, average);
};

/**
 * Measures repeated world-space displacement vectors. A shared wind direction
 * is valid; a repeated lattice period is not.
 */
export const lowLayeredRepeatedLagScore = (
    instances: readonly LowLayeredTopologyInstance[],
    tolerance = 0.14,
) => {
    if (instances.length < 4) return 0;
    finite("lag tolerance", tolerance);
    if (!(tolerance > 0 && tolerance <= 0.5)) {
        throw new Error("Lag tolerance must be in (0, 0.5]");
    }
    const nearest = instances.map((instance, index) => Math.min(
        ...instances.filter((_, other) => other !== index).map((other) =>
            Math.hypot(instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm)),
    ));
    const scale = Math.max(1e-6, median(nearest));
    const bins = new Map<string, number>();
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            let east = (instances[right].centerEastKm - instances[left].centerEastKm) / scale;
            let north = (instances[right].centerNorthKm - instances[left].centerNorthKm) / scale;
            const distance = Math.hypot(east, north);
            if (distance < 0.45 || distance > 4.5) continue;
            if (east < 0 || (Math.abs(east) < 1e-12 && north < 0)) {
                east = -east;
                north = -north;
            }
            const key = `${Math.round(east / tolerance)}:${Math.round(north / tolerance)}`;
            bins.set(key, (bins.get(key) ?? 0) + 1);
        }
    }
    return Math.max(0, ...bins.values()) / Math.max(1, instances.length - 1);
};

const instanceSignature = (instance: LowLayeredTopologyInstance) => {
    if (!(instance.majorRadiusKm > 0 && instance.minorRadiusKm > 0) ||
        instance.topologySignature.length === 0) {
        throw new Error("Owner radii must be positive and signature nonempty");
    }
    return [...instance.topologySignature,
        Math.log(instance.majorRadiusKm), Math.log(instance.minorRadiusKm)];
};

export const lowLayeredExactCloneFraction = (
    instances: readonly LowLayeredTopologyInstance[], tolerance = 0.022,
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
            if (lowLayeredCloudTopologySignatureDistance(
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

export const qualifyLowLayeredVariantSet = (
    representation: LowLayeredCloudRepresentation,
) => {
    const variants = LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation];
    const contract = LOW_LAYERED_TOPOLOGY_QUALIFICATION_CONTRACT;
    const violations: string[] = [];
    if (variants.length < contract.minimumVariantCount ||
        variants.length > contract.maximumVariantCount) {
        violations.push("representation-must-have-three-to-five-physical-topologies");
    }
    if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
        violations.push("topology-ids-must-be-unique");
    }
    let minimumPairwiseSignatureDistance = Infinity;
    for (let left = 0; left < variants.length; left += 1) {
        for (let right = left + 1; right < variants.length; right += 1) {
            minimumPairwiseSignatureDistance = Math.min(
                minimumPairwiseSignatureDistance,
                lowLayeredCloudTopologySignatureDistance(
                    lowLayeredCloudTopologyVariantSignature(variants[left]),
                    lowLayeredCloudTopologyVariantSignature(variants[right]),
                ),
            );
        }
    }
    if (minimumPairwiseSignatureDistance < contract.minimumVariantSignatureDistance) {
        violations.push("topology-variants-are-not-physically-distinct");
    }
    return { valid: violations.length === 0, minimumPairwiseSignatureDistance, violations };
};

export const qualifyLowLayeredLayout = (
    representation: LowLayeredCloudRepresentation,
    instances: readonly LowLayeredTopologyInstance[],
) => {
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
    const contract = LOW_LAYERED_TOPOLOGY_QUALIFICATION_CONTRACT;
    const violations: string[] = [];
    if (instances.length === 0) violations.push("formation-has-no-owner");
    for (const instance of instances) {
        finite("owner east", instance.centerEastKm);
        finite("owner north", instance.centerNorthKm);
        instance.topologySignature.forEach((value) => finite("signature", value));
    }
    const cloneFraction = lowLayeredExactCloneFraction(instances);
    const repeatedLagScore = lowLayeredRepeatedLagScore(instances);
    const spacingVariation = nearestSpacingVariation(instances);
    const repeatedPopulation = instances.length >= 4;
    if (repeatedPopulation && cloneFraction > contract.maximumExactCloneFraction) {
        violations.push("too-many-exact-macroshape-clones");
    }
    if (repeatedPopulation && repeatedLagScore > contract.maximumRepeatedLagScore) {
        violations.push("owner-layout-forms-a-repeated-grid");
    }
    if (repeatedPopulation && spacingVariation <
        contract.minimumNearestSpacingCoefficientVariation) {
        violations.push("owner-spacing-is-too-regular");
    }
    if (["continuous-boundary-layer", "deep-precipitation-shield"].includes(
        descriptor.elementKind,
    ) && instances.length > contract.maximumContinuousLayerOwnerCount) {
        violations.push("continuous-layer-cannot-be-built-from-tiled-owner-stamps");
    }
    if (representation === "stratocumulus-volutus" && instances.length > 4) {
        violations.push("volutus-allows-one-or-rare-few-successive-rolls-only");
    }
    if (representation === "nimbostratus-pannus") {
        if (instances.some((instance) => instance.parentOwnerId === null)) {
            violations.push("every-pannus-owner-needs-explicit-parent-shield");
        }
        if (instances.some((instance) =>
            instance.parentOwnerId === instance.boundaryCorrelationId)) {
            violations.push("pannus-cannot-alias-parent-density-owner");
        }
    }
    return { valid: violations.length === 0, cloneFraction, repeatedLagScore,
        nearestSpacingCoefficientVariation: spacingVariation, violations };
};

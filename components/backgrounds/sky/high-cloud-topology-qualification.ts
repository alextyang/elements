import {
    HIGH_CLOUD_TOPOLOGY_VARIANTS,
    highCloudTopologySignatureDistance,
    highCloudTopologyVariantSignature,
    type HighCloudSpecies,
} from "./high-cloud-physical-foundation";

export interface HighCloudTopologyInstance {
    readonly variantId: string;
    readonly centerEastKm: number;
    readonly centerNorthKm: number;
    readonly majorRadiusKm: number;
    readonly minorRadiusKm: number;
    /** Macroshape traits independent of position and camera orientation. */
    readonly topologySignature: readonly number[];
}

export const HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT = Object.freeze({
    minimumVariantCount: 3,
    maximumVariantCount: 5,
    minimumVariantSignatureDistance: 0.035,
    maximumExactCloneFraction: 0.42,
    maximumProjectedGridAutocorrelation: 0.48,
    minimumNearestSpacingCoefficientVariation: 0.08,
});

const assertFinite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};

const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const coefficientOfVariation = (values: readonly number[]) => {
    if (values.length < 2) return 0;
    const average = mean(values);
    if (!(average > 0)) return 0;
    const variance = mean(values.map((value) => (value - average) ** 2));
    return Math.sqrt(variance) / average;
};

const median = (values: readonly number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) * 0.5
        : sorted[middle];
};

export const highCloudNearestSpacingCoefficientVariation = (
    instances: readonly HighCloudTopologyInstance[],
) => {
    if (instances.length < 3) return 0;
    const nearest = instances.map((instance, index) => Math.min(
        ...instances
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => Math.hypot(
                instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm,
            )),
    ));
    return coefficientOfVariation(nearest);
};

/**
 * Point-process autocorrelation proxy. Repeated displacement vectors are
 * canonicalized, normalized by median nearest-neighbour spacing, and binned.
 * A rectangular lattice creates many identical lag vectors; a finite
 * aperiodic formation does not. One-dimensional bands are not penalized merely
 * for sharing an axis because spacing repetition, rather than orientation, is
 * measured.
 */
export const highCloudProjectedGridAutocorrelation = (
    instances: readonly HighCloudTopologyInstance[],
    lagTolerance = 0.14,
) => {
    if (instances.length < 4) return 0;
    assertFinite("lag tolerance", lagTolerance);
    if (!(lagTolerance > 0 && lagTolerance <= 0.5)) {
        throw new Error("Lag tolerance must be in (0, 0.5]");
    }
    const nearestDistances = instances.map((instance, index) => Math.min(
        ...instances
            .filter((_, otherIndex) => otherIndex !== index)
            .map((other) => Math.hypot(
                instance.centerEastKm - other.centerEastKm,
                instance.centerNorthKm - other.centerNorthKm,
            )),
    ));
    const spacing = Math.max(1e-6, median(nearestDistances));
    const bins = new Map<string, number>();
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            let east = (instances[right].centerEastKm -
                instances[left].centerEastKm) / spacing;
            let north = (instances[right].centerNorthKm -
                instances[left].centerNorthKm) / spacing;
            const distance = Math.hypot(east, north);
            if (distance > 4.25 || distance < 0.45) continue;
            if (east < 0 || (Math.abs(east) < 1e-12 && north < 0)) {
                east = -east;
                north = -north;
            }
            const key = `${Math.round(east / lagTolerance)}:${Math.round(north / lagTolerance)}`;
            bins.set(key, (bins.get(key) ?? 0) + 1);
        }
    }
    const peak = Math.max(0, ...bins.values());
    return peak / Math.max(1, instances.length - 1);
};

const normalizedInstanceSignature = (
    instance: HighCloudTopologyInstance,
): readonly number[] => {
    if (!(instance.majorRadiusKm > 0 && instance.minorRadiusKm > 0)) {
        throw new Error("Topology instance radii must be positive");
    }
    if (instance.topologySignature.length === 0) {
        throw new Error("Topology instance signature must not be empty");
    }
    return [
        ...instance.topologySignature,
        Math.log(instance.majorRadiusKm),
        Math.log(instance.minorRadiusKm),
    ];
};

export const highCloudExactCloneFraction = (
    instances: readonly HighCloudTopologyInstance[],
    distanceTolerance = 0.025,
) => {
    if (instances.length < 2) return 0;
    const parents = instances.map((_, index) => index);
    const find = (index: number): number => {
        if (parents[index] !== index) parents[index] = find(parents[index]);
        return parents[index];
    };
    const unite = (left: number, right: number) => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    };
    const signatures = instances.map(normalizedInstanceSignature);
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            if (instances[left].variantId !== instances[right].variantId) continue;
            if (highCloudTopologySignatureDistance(
                signatures[left], signatures[right],
            ) <= distanceTolerance) unite(left, right);
        }
    }
    const groupSizes = new Map<number, number>();
    for (let index = 0; index < instances.length; index += 1) {
        const root = find(index);
        groupSizes.set(root, (groupSizes.get(root) ?? 0) + 1);
    }
    return Math.max(1, ...groupSizes.values()) / instances.length;
};

export interface HighCloudVariantSetQualification {
    readonly valid: boolean;
    readonly variantCount: number;
    readonly minimumPairwiseSignatureDistance: number;
    readonly violations: readonly string[];
}

export const qualifyHighCloudVariantSet = (
    species: HighCloudSpecies,
): HighCloudVariantSetQualification => {
    const contract = HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT;
    const variants = HIGH_CLOUD_TOPOLOGY_VARIANTS[species];
    const violations: string[] = [];
    if (variants.length < contract.minimumVariantCount ||
        variants.length > contract.maximumVariantCount) {
        violations.push("species-must-have-three-to-five-topology-variants");
    }
    if (new Set(variants.map(({ id }) => id)).size !== variants.length) {
        violations.push("topology-variant-ids-must-be-unique");
    }
    let minimumPairwiseSignatureDistance = Infinity;
    for (let left = 0; left < variants.length; left += 1) {
        for (let right = left + 1; right < variants.length; right += 1) {
            minimumPairwiseSignatureDistance = Math.min(
                minimumPairwiseSignatureDistance,
                highCloudTopologySignatureDistance(
                    highCloudTopologyVariantSignature(variants[left]),
                    highCloudTopologyVariantSignature(variants[right]),
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

export interface HighCloudLayoutQualification {
    readonly valid: boolean;
    readonly cloneFraction: number;
    readonly projectedGridAutocorrelation: number;
    readonly nearestSpacingCoefficientVariation: number;
    readonly violations: readonly string[];
}

export const qualifyHighCloudLayout = (
    instances: readonly HighCloudTopologyInstance[],
): HighCloudLayoutQualification => {
    const contract = HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT;
    const violations: string[] = [];
    if (instances.length < 4) violations.push("too-few-instances-for-layout-qualification");
    for (const instance of instances) {
        assertFinite("owner east position", instance.centerEastKm);
        assertFinite("owner north position", instance.centerNorthKm);
        for (const component of instance.topologySignature) {
            assertFinite("topology signature component", component);
        }
    }
    const cloneFraction = highCloudExactCloneFraction(instances);
    const projectedGridAutocorrelation =
        highCloudProjectedGridAutocorrelation(instances);
    const nearestSpacingCoefficientVariation =
        highCloudNearestSpacingCoefficientVariation(instances);
    if (cloneFraction > contract.maximumExactCloneFraction) {
        violations.push("too-many-exact-macroshape-clones");
    }
    if (projectedGridAutocorrelation >
        contract.maximumProjectedGridAutocorrelation) {
        violations.push("projected-owner-layout-forms-a-repeated-grid");
    }
    if (nearestSpacingCoefficientVariation <
        contract.minimumNearestSpacingCoefficientVariation) {
        violations.push("owner-spacing-is-too-regular");
    }
    return {
        valid: violations.length === 0,
        cloneFraction,
        projectedGridAutocorrelation,
        nearestSpacingCoefficientVariation,
        violations,
    };
};

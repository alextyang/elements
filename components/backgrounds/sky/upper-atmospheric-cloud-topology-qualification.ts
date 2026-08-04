import {
    UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
    UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS,
    upperTopologySignature,
    upperTopologySignatureDistance,
    type UpperAtmosphericCloudRepresentation,
} from "./upper-atmospheric-cloud-foundation";

export interface UpperTopologyInstance {
    readonly variantId: string;
    readonly centerEastKm: number;
    readonly centerNorthKm: number;
    readonly altitudeKm: number;
    readonly majorRadiusKm: number;
    readonly minorRadiusKm: number;
    readonly orientationRadians: number;
    readonly topologySignature: readonly number[];
}

export const UPPER_TOPOLOGY_QUALIFICATION_CONTRACT = Object.freeze({
    minimumVariantCount: 3, maximumVariantCount: 5,
    minimumVariantSignatureDistance: 0.018,
    maximumCloneFraction: 0.42, maximumRepeatedLagScore: 0.48,
    minimumSpacingVariation: 0.08, maximumContinuousVeilOwners: 3,
});
const finite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
const median = (values: readonly number[]) => {
    if (values.length === 0) return 0;
    const valuesSorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(valuesSorted.length / 2);
    return valuesSorted.length % 2 ? valuesSorted[middle]
        : (valuesSorted[middle - 1] + valuesSorted[middle]) * 0.5;
};

export const upperRepeatedLagScore = (instances: readonly UpperTopologyInstance[], tolerance = 0.14) => {
    if (instances.length < 4) return 0;
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
            if (east < 0 || (Math.abs(east) < 1e-12 && north < 0)) { east = -east; north = -north; }
            const key = `${Math.round(east / tolerance)}:${Math.round(north / tolerance)}`;
            bins.set(key, (bins.get(key) ?? 0) + 1);
        }
    }
    return Math.max(0, ...bins.values()) / Math.max(1, instances.length - 1);
};

const instanceSignature = (instance: UpperTopologyInstance) => {
    if (!(instance.majorRadiusKm > 0 && instance.minorRadiusKm > 0) ||
        instance.topologySignature.length === 0) throw new Error("Invalid upper-cloud owner");
    return [...instance.topologySignature, Math.log(instance.majorRadiusKm),
        Math.log(instance.minorRadiusKm), Math.sin(instance.orientationRadians),
        Math.cos(instance.orientationRadians)];
};
export const upperExactCloneFraction = (instances: readonly UpperTopologyInstance[], tolerance = 0.022) => {
    if (instances.length < 2) return 0;
    const parents = instances.map((_, index) => index);
    const find = (index: number): number => {
        if (parents[index] !== index) parents[index] = find(parents[index]);
        return parents[index];
    };
    const signatures = instances.map(instanceSignature);
    for (let left = 0; left < instances.length; left += 1) {
        for (let right = left + 1; right < instances.length; right += 1) {
            if (instances[left].variantId !== instances[right].variantId ||
                upperTopologySignatureDistance(signatures[left], signatures[right]) > tolerance) continue;
            const l = find(left); const r = find(right);
            if (l !== r) parents[r] = l;
        }
    }
    const groups = new Map<number, number>();
    parents.forEach((_, index) => {
        const root = find(index); groups.set(root, (groups.get(root) ?? 0) + 1);
    });
    return Math.max(1, ...groups.values()) / instances.length;
};

export const qualifyUpperVariantSet = (representation: UpperAtmosphericCloudRepresentation) => {
    const variants = UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[representation];
    const contract = UPPER_TOPOLOGY_QUALIFICATION_CONTRACT;
    const violations: string[] = [];
    if (variants.length < contract.minimumVariantCount || variants.length > contract.maximumVariantCount) {
        violations.push("representation-needs-three-to-five-topologies");
    }
    if (new Set(variants.map(({ id }) => id)).size !== variants.length) violations.push("variant-ids-must-be-unique");
    let minimumPairwiseSignatureDistance = Infinity;
    for (let left = 0; left < variants.length; left += 1) {
        for (let right = left + 1; right < variants.length; right += 1) {
            minimumPairwiseSignatureDistance = Math.min(minimumPairwiseSignatureDistance,
                upperTopologySignatureDistance(upperTopologySignature(variants[left]),
                    upperTopologySignature(variants[right])));
        }
    }
    if (minimumPairwiseSignatureDistance < contract.minimumVariantSignatureDistance) {
        violations.push("topologies-not-physically-distinct");
    }
    return { valid: violations.length === 0, minimumPairwiseSignatureDistance, violations };
};

export const qualifyUpperLayout = (
    representation: UpperAtmosphericCloudRepresentation,
    instances: readonly UpperTopologyInstance[],
) => {
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
    const violations: string[] = [];
    if (instances.length === 0) violations.push("formation-has-no-owner");
    for (const instance of instances) {
        [instance.centerEastKm, instance.centerNorthKm, instance.altitudeKm,
            instance.majorRadiusKm, instance.minorRadiusKm, instance.orientationRadians,
            ...instance.topologySignature].forEach((value) => finite("owner value", value));
        if (instance.altitudeKm < descriptor.altitudeKm[0] || instance.altitudeKm > descriptor.altitudeKm[1]) {
            violations.push("owner-altitude-outside-physical-layer");
        }
    }
    const cloneFraction = upperExactCloneFraction(instances);
    const repeatedLagScore = upperRepeatedLagScore(instances);
    let spacingVariation = 0;
    if (instances.length >= 3) {
        const nearest = instances.map((instance, index) => Math.min(
            ...instances.filter((_, other) => other !== index).map((other) =>
                Math.hypot(instance.centerEastKm - other.centerEastKm,
                    instance.centerNorthKm - other.centerNorthKm)),
        ));
        const average = mean(nearest);
        spacingVariation = Math.sqrt(mean(nearest.map((value) => (value - average) ** 2))) /
            Math.max(1e-9, average);
    }
    if (instances.length >= 4 && cloneFraction >
        UPPER_TOPOLOGY_QUALIFICATION_CONTRACT.maximumCloneFraction) violations.push("too-many-cloned-topologies");
    if (instances.length >= 4 && repeatedLagScore >
        UPPER_TOPOLOGY_QUALIFICATION_CONTRACT.maximumRepeatedLagScore) violations.push("layout-is-periodic-grid");
    if (instances.length >= 4 && spacingVariation <
        UPPER_TOPOLOGY_QUALIFICATION_CONTRACT.minimumSpacingVariation) violations.push("owner-spacing-too-regular");
    if (["fibrous-veil", "continuous-veil", "superposed-veils", "wave-veil"].includes(
        descriptor.elementKind,
    ) && instances.length > UPPER_TOPOLOGY_QUALIFICATION_CONTRACT.maximumContinuousVeilOwners) {
        violations.push("continuous-veil-cannot-be-owner-stamp-field");
    }
    return { valid: violations.length === 0, cloneFraction, repeatedLagScore,
        nearestSpacingCoefficientVariation: spacingVariation, violations };
};

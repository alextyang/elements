import type {
    CloudWeatherEdgeKind,
    CloudWeatherOwner,
    CloudWeatherSimulation,
} from "./cloud-weather-engine";

export const CLOUD_INTERACTION_SCHEMA_VERSION = 1 as const;

export type CloudInteractionKind =
    | "ordered-overlap"
    | "radiative-shadow"
    | "precipitation-through-layer"
    | "cold-pool-influence"
    | "anvil-stabilization"
    | "lineage-continuity";

export interface CloudInteractionRecord {
    id: string;
    kind: CloudInteractionKind;
    sourceOwnerId: string;
    targetOwnerId: string;
    strength01: number;
    horizontalOverlap01: number;
    verticalOverlap01: number;
    verticalOrder: "source-above-target" | "target-above-source" | "overlapping";
    sourceAltitudeKm: readonly [base: number, top: number];
    targetAltitudeKm: readonly [base: number, top: number];
    causalEdgeKind?: CloudWeatherEdgeKind;
}

export interface CloudInteractionGraph {
    schemaVersion: typeof CLOUD_INTERACTION_SCHEMA_VERSION;
    simulationStep: number;
    simulationTimeSeconds: number;
    orderedOwnerIdsBottomToTop: readonly string[];
    interactions: readonly CloudInteractionRecord[];
}

export interface CloudInteractionIssue {
    code: string;
    subject: string;
    message: string;
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const topAltitudeKm = (owner: CloudWeatherOwner) =>
    owner.baseAltitudeKm + owner.geometricDepthKm;
const altitude = (owner: CloudWeatherOwner): readonly [number, number] => [
    owner.baseAltitudeKm,
    topAltitudeKm(owner),
];
const horizontalDistance = (left: CloudWeatherOwner, right: CloudWeatherOwner) =>
    Math.hypot(
        left.centerEastKm - right.centerEastKm,
        left.centerNorthKm - right.centerNorthKm,
    );
const horizontalOverlap = (left: CloudWeatherOwner, right: CloudWeatherOwner) => {
    const reach = Math.max(
        0.01,
        Math.min(
            left.radiusEastKm + right.radiusEastKm,
            left.radiusNorthKm + right.radiusNorthKm,
        ),
    );
    return clamp(1 - horizontalDistance(left, right) / reach);
};
const verticalOverlap = (left: CloudWeatherOwner, right: CloudWeatherOwner) => {
    const overlap = Math.max(0,
        Math.min(topAltitudeKm(left), topAltitudeKm(right)) -
        Math.max(left.baseAltitudeKm, right.baseAltitudeKm));
    return clamp(overlap / Math.max(
        0.01,
        Math.min(left.geometricDepthKm, right.geometricDepthKm),
    ));
};
const verticalOrder = (
    source: CloudWeatherOwner,
    target: CloudWeatherOwner,
): CloudInteractionRecord["verticalOrder"] => {
    if (source.baseAltitudeKm >= topAltitudeKm(target)) {
        return "source-above-target";
    }
    if (target.baseAltitudeKm >= topAltitudeKm(source)) {
        return "target-above-source";
    }
    return "overlapping";
};
const opticalStrength = (owner: CloudWeatherOwner) => {
    const areaSquareMetres = Math.PI * owner.radiusEastKm * 1_000 *
        owner.radiusNorthKm * 1_000;
    const pathGramsPerSquareMetre =
        (owner.liquidWaterMassKg + owner.iceWaterMassKg) * 1_000 /
        Math.max(1, areaSquareMetres);
    return clamp(1 - Math.exp(-pathGramsPerSquareMetre / 220));
};

const record = (
    simulation: CloudWeatherSimulation,
    kind: CloudInteractionKind,
    source: CloudWeatherOwner,
    target: CloudWeatherOwner,
    strength01: number,
    horizontalOverlap01: number,
    causalEdgeKind?: CloudWeatherEdgeKind,
): CloudInteractionRecord => ({
    id: `interaction:${simulation.step}:${kind}:${source.id}:${target.id}`,
    kind,
    sourceOwnerId: source.id,
    targetOwnerId: target.id,
    strength01: clamp(strength01),
    horizontalOverlap01: clamp(horizontalOverlap01),
    verticalOverlap01: verticalOverlap(source, target),
    verticalOrder: verticalOrder(source, target),
    sourceAltitudeKm: altitude(source),
    targetAltitudeKm: altitude(target),
    ...(causalEdgeKind ? { causalEdgeKind } : {}),
});

/**
 * Build camera-independent relationships for ordered composition, source
 * visibility, precipitation traversal, outflow forcing, and lineage material
 * continuity. Projection is allowed to cull these links, but not to change
 * their source, target, altitude order, or strength.
 */
export const buildCloudInteractionGraph = (
    simulation: CloudWeatherSimulation,
): CloudInteractionGraph => {
    const owners = simulation.owners.filter(({ active }) => active);
    const ownerById = new Map(simulation.owners.map((owner) => [owner.id, owner]));
    const interactions: CloudInteractionRecord[] = [];

    for (let leftIndex = 0; leftIndex < owners.length; leftIndex += 1) {
        const left = owners[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < owners.length;
            rightIndex += 1) {
            const right = owners[rightIndex];
            const overlap = horizontalOverlap(left, right);
            if (overlap <= 0) continue;
            const leftMidpoint = left.baseAltitudeKm +
                left.geometricDepthKm * 0.5;
            const rightMidpoint = right.baseAltitudeKm +
                right.geometricDepthKm * 0.5;
            const upper = leftMidpoint >= rightMidpoint ? left : right;
            const lower = upper === left ? right : left;
            interactions.push(record(
                simulation,
                "ordered-overlap",
                upper,
                lower,
                overlap,
                overlap,
            ));
            interactions.push(record(
                simulation,
                "radiative-shadow",
                upper,
                lower,
                overlap * opticalStrength(upper),
                overlap,
            ));
            if (upper.precipitationRateMillimetresPerHour > 0.05 &&
                upper.baseAltitudeKm >= lower.baseAltitudeKm) {
                interactions.push(record(
                    simulation,
                    "precipitation-through-layer",
                    upper,
                    lower,
                    overlap * clamp(
                        upper.precipitationRateMillimetresPerHour / 20,
                    ),
                    overlap,
                ));
            }
            if (upper.classification.genus === "cumulonimbus" &&
                upper.classification.supplementaryFeatures.includes("incus") &&
                upper.baseAltitudeKm < topAltitudeKm(lower)) {
                interactions.push(record(
                    simulation,
                    "anvil-stabilization",
                    upper,
                    lower,
                    overlap * clamp(
                        upper.iceWaterMassKg /
                        Math.max(1, upper.liquidWaterMassKg +
                            upper.iceWaterMassKg),
                    ),
                    overlap,
                ));
            }
        }
    }

    for (const source of owners) {
        if (source.coldPoolStrength01 <= 0.05) continue;
        const reachKm = source.radiusEastKm *
            (1.4 + source.coldPoolStrength01 * 2.8);
        for (const target of owners) {
            if (target.id === source.id || target.baseAltitudeKm > 3) continue;
            const influence = clamp(
                1 - horizontalDistance(source, target) /
                    Math.max(0.1, reachKm),
            ) * source.coldPoolStrength01;
            if (influence <= 0) continue;
            interactions.push(record(
                simulation,
                "cold-pool-influence",
                source,
                target,
                influence,
                horizontalOverlap(source, target),
                "cold-pool-influence",
            ));
        }
    }

    for (const edge of simulation.edges) {
        if (!["lineage", "merge", "split", "genitus", "mutatus"]
            .includes(edge.kind)) continue;
        const source = ownerById.get(edge.fromId);
        const target = ownerById.get(edge.toId);
        if (!source || !target) continue;
        interactions.push(record(
            simulation,
            "lineage-continuity",
            source,
            target,
            edge.strength01,
            horizontalOverlap(source, target),
            edge.kind,
        ));
    }

    return {
        schemaVersion: CLOUD_INTERACTION_SCHEMA_VERSION,
        simulationStep: simulation.step,
        simulationTimeSeconds: simulation.timeSeconds,
        orderedOwnerIdsBottomToTop: [...owners]
            .sort((left, right) => left.baseAltitudeKm - right.baseAltitudeKm)
            .map(({ id }) => id),
        interactions: [...new Map(interactions.map((interaction) =>
            [interaction.id, interaction])).values()],
    };
};

export const validateCloudInteractionGraph = (
    simulation: CloudWeatherSimulation,
    graph: CloudInteractionGraph,
): readonly CloudInteractionIssue[] => {
    const issues: CloudInteractionIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });
    const ownerById = new Map(simulation.owners.map((owner) => [owner.id, owner]));
    const featureById = new Map(simulation.features.map((feature) =>
        [feature.id, feature]));

    for (const feature of simulation.features) {
        const owner = ownerById.get(feature.parentOwnerId);
        if (!owner || owner.numericId !== feature.parentOwnerNumericId) {
            issue("orphan-feature", feature.id,
                "Every feature must retain its stable physical parent owner.");
        }
        if (feature.precipitationSourceKgPerSecond > 0 &&
            (!owner || owner.liquidWaterMassKg + owner.iceWaterMassKg <= 0)) {
            issue("ownerless-precipitation-feature", feature.id,
                "Precipitating features require parent condensate.");
        }
        if (!featureById.has(feature.id)) {
            issue("missing-feature-index", feature.id,
                "Feature index must contain every feature.");
        }
    }
    for (const owner of simulation.owners) {
        if (owner.precipitationRateMillimetresPerHour > 0 &&
            owner.liquidWaterMassKg + owner.iceWaterMassKg <= 0) {
            issue("ownerless-precipitation", owner.id,
                "Precipitation requires condensate in the same owner.");
        }
    }
    for (const interaction of graph.interactions) {
        const source = ownerById.get(interaction.sourceOwnerId);
        const target = ownerById.get(interaction.targetOwnerId);
        if (!source || !target) {
            issue("missing-interaction-owner", interaction.id,
                "Every interaction endpoint must resolve to an owner.");
            continue;
        }
        if (!Number.isFinite(interaction.strength01) ||
            interaction.strength01 < 0 || interaction.strength01 > 1) {
            issue("invalid-interaction-strength", interaction.id,
                "Interaction strength must be finite and in [0, 1].");
        }
        if ((interaction.kind === "radiative-shadow" ||
            interaction.kind === "precipitation-through-layer") &&
            interaction.verticalOrder === "target-above-source") {
            issue("inverted-vertical-interaction", interaction.id,
                "Shadows and precipitation may not travel upward to an owner.");
        }
        if (interaction.kind === "precipitation-through-layer" &&
            source.precipitationRateMillimetresPerHour <= 0) {
            issue("dry-precipitation-link", interaction.id,
                "Precipitation traversal requires an active source rate.");
        }
    }
    const orderedAltitudes = graph.orderedOwnerIdsBottomToTop.map((id) =>
        ownerById.get(id)?.baseAltitudeKm ?? Number.NaN);
    for (let index = 1; index < orderedAltitudes.length; index += 1) {
        if (orderedAltitudes[index] < orderedAltitudes[index - 1]) {
            issue("owner-altitude-order", "graph",
                "Ordered owner IDs must be bottom-to-top.");
            break;
        }
    }
    return issues;
};

/** Beer-style source attenuation used by both camera and light-volume adapters. */
export const cloudInteractionSourceTransmittance = (
    graph: CloudInteractionGraph,
    targetOwnerId: string,
) => Math.exp(-graph.interactions.filter((interaction) =>
    interaction.kind === "radiative-shadow" &&
    interaction.targetOwnerId === targetOwnerId)
    .reduce((opticalDepth, interaction) =>
        opticalDepth + interaction.strength01 * 2.5, 0));

import type { CompiledCloudSystemV2 } from "./cloud-system-abi-v2";

export type CloudHistoryAction =
    | "reuse"
    | "attenuate"
    | "invalidate"
    | "new"
    | "retire";

export type CloudHistoryReason =
    | "new-owner"
    | "retired-owner"
    | "schema-change"
    | "generation-change"
    | "topology-change"
    | "material-change"
    | "recipe-change"
    | "age-regression"
    | "unexpected-displacement"
    | "extent-change"
    | "condensate-change"
    | "phase-change"
    | "feature-set-change"
    | "critical-lifecycle-event"
    | "optical-lifecycle-event";

export interface CloudTemporalThresholds {
    maximumUnexpectedDisplacementRadii: number;
    maximumRelativeExtentChange: number;
    maximumCondensateLogChange: number;
    maximumPhaseFractionChange: number;
}

export const DEFAULT_CLOUD_TEMPORAL_THRESHOLDS: CloudTemporalThresholds =
    Object.freeze({
        maximumUnexpectedDisplacementRadii: 0.18,
        maximumRelativeExtentChange: 0.22,
        maximumCondensateLogChange: 0.65,
        maximumPhaseFractionChange: 0.24,
    });

export interface CloudOwnerHistoryDecision {
    ownerId: number;
    previousOwnerIndex: number | null;
    nextOwnerIndex: number | null;
    action: CloudHistoryAction;
    reuseWeight: number;
    reasons: readonly CloudHistoryReason[];
}

export interface CloudTemporalReconstructionPlanV1 {
    schemaVersion: 1;
    previousTimeSeconds: number;
    nextTimeSeconds: number;
    globalReset: boolean;
    decisions: readonly CloudOwnerHistoryDecision[];
    historyToken: string;
}

export interface CloudTemporalPlanIssue {
    code: string;
    subject: string;
    message: string;
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const relativeChange = (left: number, right: number) =>
    Math.abs(right - left) / Math.max(1e-6, Math.abs(left), Math.abs(right));
const waterPath = (system: CompiledCloudSystemV2) =>
    system.owner.liquidWaterPathGramsPerSquareMetre +
    system.owner.iceWaterPathGramsPerSquareMetre;
const iceFraction = (system: CompiledCloudSystemV2) => {
    const total = waterPath(system);
    return total > 1e-8
        ? system.owner.iceWaterPathGramsPerSquareMetre / total : 0;
};
const featureSet = (system: CompiledCloudSystemV2) => new Set(
    system.features.filter(({ active }) => active).map(({ featureId }) => featureId),
);
const sameSet = (left: ReadonlySet<number>, right: ReadonlySet<number>) =>
    left.size === right.size && [...left].every((value) => right.has(value));

const criticalEvents = new Set(["birth", "merge", "split", "death"]);
const opticalEvents = new Set([
    "glaciation", "precipitation-onset", "feature-attach", "feature-detach",
]);

const ownerMap = (systems: readonly CompiledCloudSystemV2[]) =>
    new Map(systems.map((system, index) => [
        system.owner.ownerId,
        { system, index },
    ]));

const historyTokenFor = (
    systems: readonly CompiledCloudSystemV2[],
): string => systems
    .map(({ owner }) => `${owner.ownerId}:${owner.generation}`)
    .sort()
    .join("|");

export const buildCloudTemporalReconstructionPlanV1 = (
    previous: readonly CompiledCloudSystemV2[] | null,
    next: readonly CompiledCloudSystemV2[],
    previousTimeSeconds: number,
    nextTimeSeconds: number,
    thresholds: CloudTemporalThresholds = DEFAULT_CLOUD_TEMPORAL_THRESHOLDS,
): CloudTemporalReconstructionPlanV1 => {
    const previousSystems = previous ?? [];
    const previousByOwner = ownerMap(previousSystems);
    const nextByOwner = ownerMap(next);
    const decisions: CloudOwnerHistoryDecision[] = [];
    const deltaSeconds = Math.max(0, nextTimeSeconds - previousTimeSeconds);
    const nextSchema = next[0];
    const schemaChange = Boolean(nextSchema) && previousSystems.some((system) =>
        system.schemaVersion !== nextSchema!.schemaVersion ||
        system.physicalSampleSchemaVersion !==
            nextSchema!.physicalSampleSchemaVersion);

    for (const [ownerId, nextEntry] of nextByOwner) {
        const previousEntry = previousByOwner.get(ownerId);
        if (!previousEntry) {
            decisions.push({
                ownerId,
                previousOwnerIndex: null,
                nextOwnerIndex: nextEntry.index,
                action: "new",
                reuseWeight: 0,
                reasons: ["new-owner"],
            });
            continue;
        }
        const before = previousEntry.system;
        const after = nextEntry.system;
        const reasons: CloudHistoryReason[] = [];
        let invalidate = schemaChange;
        let weight = 1;
        if (schemaChange) reasons.push("schema-change");
        if (before.owner.generation !== after.owner.generation) {
            reasons.push("generation-change");
            invalidate = true;
        }
        if (before.owner.macroTopology !== after.owner.macroTopology) {
            reasons.push("topology-change");
            invalidate = true;
        }
        if (before.owner.materialModel !== after.owner.materialModel) {
            reasons.push("material-change");
            invalidate = true;
        }
        if (before.owner.recipeId !== after.owner.recipeId) {
            reasons.push("recipe-change");
            invalidate = true;
        }
        if (after.owner.lifecycleAgeSeconds + 1e-6 <
            before.owner.lifecycleAgeSeconds) {
            reasons.push("age-regression");
            invalidate = true;
        }

        const expectedCenter = before.owner.centerKm.map((value, axis) =>
            value + before.owner.velocityKmPerSecond[axis] * deltaSeconds);
        const displacementResidual = Math.hypot(
            after.owner.centerKm[0] - expectedCenter[0],
            after.owner.centerKm[1] - expectedCenter[1],
            after.owner.centerKm[2] - expectedCenter[2],
        );
        const meanRadius = Math.max(
            0.05,
            (after.owner.horizontalRadiusKm[0] +
                after.owner.horizontalRadiusKm[1] +
                after.owner.horizontalRadiusKm[2]) / 3,
        );
        const displacementRadii = displacementResidual / meanRadius;
        if (displacementRadii >
            thresholds.maximumUnexpectedDisplacementRadii) {
            reasons.push("unexpected-displacement");
            weight *= clamp(1 - displacementRadii);
            if (displacementRadii > 0.75) invalidate = true;
        }

        const extentChange = Math.max(
            relativeChange(
                before.owner.horizontalRadiusKm[0],
                after.owner.horizontalRadiusKm[0],
            ),
            relativeChange(
                before.owner.horizontalRadiusKm[1],
                after.owner.horizontalRadiusKm[1],
            ),
            relativeChange(
                before.owner.horizontalRadiusKm[2],
                after.owner.horizontalRadiusKm[2],
            ),
            relativeChange(
                before.owner.geometricDepthKm,
                after.owner.geometricDepthKm,
            ),
        );
        if (extentChange > thresholds.maximumRelativeExtentChange) {
            reasons.push("extent-change");
            weight *= clamp(1 - extentChange);
        }

        const condensateLogChange = Math.abs(Math.log(
            (waterPath(after) + 1e-4) / (waterPath(before) + 1e-4),
        ));
        if (condensateLogChange > thresholds.maximumCondensateLogChange) {
            reasons.push("condensate-change");
            weight *= Math.exp(-condensateLogChange);
        }
        const phaseChange = Math.abs(iceFraction(after) - iceFraction(before));
        if (phaseChange > thresholds.maximumPhaseFractionChange) {
            reasons.push("phase-change");
            weight *= clamp(1 - phaseChange);
        }
        if (!sameSet(featureSet(before), featureSet(after))) {
            reasons.push("feature-set-change");
            weight *= 0.55;
        }
        const currentEvents = after.events.filter((event) =>
            event.simulationTimeSeconds > previousTimeSeconds + 1e-6 &&
            event.simulationTimeSeconds <= nextTimeSeconds + 1e-6);
        if (currentEvents.some(({ kind }) => criticalEvents.has(kind))) {
            reasons.push("critical-lifecycle-event");
            invalidate = true;
        } else if (currentEvents.some(({ kind }) => opticalEvents.has(kind))) {
            reasons.push("optical-lifecycle-event");
            weight *= 0.45;
        }

        const reuseWeight = invalidate ? 0 : clamp(weight);
        decisions.push({
            ownerId,
            previousOwnerIndex: previousEntry.index,
            nextOwnerIndex: nextEntry.index,
            action: invalidate ? "invalidate" :
                reuseWeight >= 0.92 ? "reuse" : "attenuate",
            reuseWeight,
            reasons,
        });
    }

    for (const [ownerId, previousEntry] of previousByOwner) {
        if (nextByOwner.has(ownerId)) continue;
        decisions.push({
            ownerId,
            previousOwnerIndex: previousEntry.index,
            nextOwnerIndex: null,
            action: "retire",
            reuseWeight: 0,
            reasons: ["retired-owner"],
        });
    }
    decisions.sort((left, right) => left.ownerId - right.ownerId);
    return {
        schemaVersion: 1,
        previousTimeSeconds,
        nextTimeSeconds,
        globalReset: schemaChange,
        decisions,
        historyToken: historyTokenFor(next),
    };
};

export const validateCloudTemporalReconstructionPlanV1 = (
    plan: CloudTemporalReconstructionPlanV1,
): readonly CloudTemporalPlanIssue[] => {
    const issues: CloudTemporalPlanIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });
    if (plan.schemaVersion !== 1) {
        issue("unsupported-schema", "plan", "Expected temporal-plan schema 1.");
    }
    if (plan.nextTimeSeconds < plan.previousTimeSeconds) {
        issue("time-regression", "plan",
            "Temporal reconstruction cannot run backward in simulation time.");
    }
    const ownerIds = new Set<number>();
    for (const decision of plan.decisions) {
        if (ownerIds.has(decision.ownerId)) {
            issue("duplicate-owner-decision", String(decision.ownerId),
                "Each owner must receive exactly one history decision.");
        }
        ownerIds.add(decision.ownerId);
        if (decision.reuseWeight < 0 || decision.reuseWeight > 1 ||
            !Number.isFinite(decision.reuseWeight)) {
            issue("invalid-reuse-weight", String(decision.ownerId),
                "History reuse weight must be finite and within [0, 1].");
        }
        if (["invalidate", "new", "retire"].includes(decision.action) &&
            decision.reuseWeight !== 0) {
            issue("invalidated-history-reused", String(decision.ownerId),
                "Invalid, new, and retired owners cannot retain history weight.");
        }
    }
    return issues;
};

export const CLOUD_TEMPORAL_IDENTITY_WGSL = /* wgsl */ `
struct CloudOwnerHistoryDecisionV1 {
    owner_id: u32,
    generation: u32,
    action: u32,
    reason_mask: u32,
    reuse_weight: f32,
    previous_owner_index: i32,
    next_owner_index: i32,
    _padding: u32,
};
`;

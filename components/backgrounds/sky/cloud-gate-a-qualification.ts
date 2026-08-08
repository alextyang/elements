import {
    sampleCloudWeatherSimulationPhysical,
} from "./cloud-generated-physical-sampler";
import {
    qualifyCloudPhysicalPassParity,
    type CloudPhysicalPassParityResult,
    type CloudPhysicalPassProvider,
} from "./cloud-physical-pass-parity";
import type { CloudVec3 } from "./cloud-physical-sample";
import type { CloudGenerativeRuntime } from "./cloud-generative-runtime";
import {
    compileCloudProductionFrameV1,
    type CloudProductionFrameV1,
} from "./cloud-production-frame";
import {
    createCloudProductionGpuUploadPlanV1,
    type CloudProductionGpuAuxiliaryCapacities,
    type CloudProductionGpuUploadPlanV1,
} from "./cloud-production-gpu-runtime";
import type {
    CloudProductionBufferCapacities,
} from "./cloud-production-buffers";
import type { CloudWeatherSimulation } from "./cloud-weather-engine";

export type CloudGateAComponent =
    | "geometry-material-sampling"
    | "owner-feature-event-buffers"
    | "camera-transport"
    | "light-volume"
    | "atmosphere-shadow"
    | "hydrometeors"
    | "temporal-reconstruction"
    | "reference-transport";

export type CloudGateAMigrationState =
    | "not-integrated"
    | "contract-ready"
    | "live-integrated"
    | "qualified";

export interface CloudGateAMigrationRecord {
    component: CloudGateAComponent;
    state: CloudGateAMigrationState;
    evidence: string;
}

/**
 * Truthful status of the current branch. Contract-ready modules do not close
 * Gate A until the shipping pass consumes them and parity evidence is captured.
 */
export const CURRENT_CLOUD_GATE_A_MIGRATION:
readonly CloudGateAMigrationRecord[] = Object.freeze([
    {
        component: "geometry-material-sampling",
        state: "contract-ready",
        evidence: "Generated owners and packed V2 records resolve CloudPhysicalSampleV1; remaining production morphology still needs migration.",
    },
    {
        component: "owner-feature-event-buffers",
        state: "contract-ready",
        evidence: "Fixed V2 production buffers, upload plans, and resource sessions exist but are not bound by the shipping renderer.",
    },
    {
        component: "camera-transport",
        state: "not-integrated",
        evidence: "The shipping camera march still consumes the legacy cloud-system ABI.",
    },
    {
        component: "light-volume",
        state: "not-integrated",
        evidence: "The shipping cloud light-volume graph still evaluates its existing morphology path.",
    },
    {
        component: "atmosphere-shadow",
        state: "not-integrated",
        evidence: "Directional atmospheric cloud visibility is not yet sourced from CloudPhysicalSampleV1.",
    },
    {
        component: "hydrometeors",
        state: "not-integrated",
        evidence: "The shipping hydrometeor pass is not yet driven by the packed parent-owned precipitation sample.",
    },
    {
        component: "temporal-reconstruction",
        state: "contract-ready",
        evidence: "Per-owner history decisions and GPU records exist but are not yet consumed by the shipping reprojection pass.",
    },
    {
        component: "reference-transport",
        state: "live-integrated",
        evidence: "The strict CPU reference path consumes the authoritative physical sample callback for camera and source rays.",
    },
]);

const migrationRank: Record<CloudGateAMigrationState, number> = {
    "not-integrated": 0,
    "contract-ready": 1,
    "live-integrated": 2,
    qualified: 3,
};

export interface CloudGateAQualificationInput {
    runtime: CloudGenerativeRuntime;
    samplePositionsKm?: readonly CloudVec3[];
    providers?: readonly CloudPhysicalPassProvider[];
    migration?: readonly CloudGateAMigrationRecord[];
    productionCapacities?: Partial<CloudProductionBufferCapacities>;
    auxiliaryCapacities?: Partial<CloudProductionGpuAuxiliaryCapacities>;
    maximumSamplePositions?: number;
}

export interface CloudGateAQualificationResult {
    schemaVersion: 1;
    contractReady: boolean;
    gateAReady: boolean;
    productionFrame: CloudProductionFrameV1;
    gpuUploadPlan: CloudProductionGpuUploadPlanV1;
    parity: CloudPhysicalPassParityResult;
    migration: readonly CloudGateAMigrationRecord[];
    blockers: readonly string[];
    summary: {
        activeOwners: number;
        activeFeatures: number;
        sampledPositions: number;
        parityPasses: number;
        liveIntegratedComponents: number;
        requiredComponents: number;
        productionFrameIssues: number;
        gpuUploadIssues: number;
        parityIssues: number;
    };
}

const uniquePositions = (
    positions: readonly CloudVec3[],
    maximum: number,
): readonly CloudVec3[] => {
    const seen = new Set<string>();
    const result: CloudVec3[] = [];
    for (const position of positions) {
        const key = position.map((value) =>
            Math.round(value * 1_000) / 1_000).join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(position);
        if (result.length >= maximum) break;
    }
    return result;
};

export const createCloudGateASamplePositions = (
    simulation: CloudWeatherSimulation,
    maximumPositions = 48,
): readonly CloudVec3[] => {
    const maximum = Number.isFinite(maximumPositions)
        ? Math.max(1, Math.trunc(maximumPositions)) : 48;
    const positions: CloudVec3[] = [];
    const owners = simulation.owners.filter(({ active }) => active)
        .sort((left, right) => left.numericId - right.numericId);
    for (const owner of owners) {
        const midAltitude = owner.baseAltitudeKm +
            owner.geometricDepthKm * 0.5;
        const east = owner.radiusEastKm * 0.32;
        const north = owner.radiusNorthKm * 0.32;
        const vertical = owner.geometricDepthKm * 0.28;
        positions.push(
            [owner.centerEastKm, midAltitude, owner.centerNorthKm],
            [owner.centerEastKm + east, midAltitude, owner.centerNorthKm],
            [owner.centerEastKm - east, midAltitude, owner.centerNorthKm],
            [owner.centerEastKm, midAltitude, owner.centerNorthKm + north],
            [owner.centerEastKm, midAltitude, owner.centerNorthKm - north],
            [owner.centerEastKm, midAltitude + vertical, owner.centerNorthKm],
            [owner.centerEastKm, midAltitude - vertical, owner.centerNorthKm],
        );
    }
    return uniquePositions(positions, maximum);
};

/**
 * Contract providers deliberately share one callback. They prove that every
 * pass can consume identical state, not that the shipping shader has migrated.
 */
export const createCloudGateAContractProviders = (
    simulation: CloudWeatherSimulation,
): readonly CloudPhysicalPassProvider[] => {
    const sample = (positionKm: CloudVec3) =>
        sampleCloudWeatherSimulationPhysical(simulation, positionKm);
    return [
        { pass: "camera", sample },
        { pass: "light-volume", sample },
        { pass: "atmosphere-shadow", sample },
        { pass: "hydrometeor", sample },
        { pass: "reference", sample },
    ];
};

const migrationBlockers = (
    migration: readonly CloudGateAMigrationRecord[],
): readonly string[] => {
    const byComponent = new Map(migration.map((record) => [
        record.component,
        record,
    ]));
    const blockers: string[] = [];
    for (const component of [
        "geometry-material-sampling",
        "owner-feature-event-buffers",
        "camera-transport",
        "light-volume",
        "atmosphere-shadow",
        "hydrometeors",
        "temporal-reconstruction",
        "reference-transport",
    ] as const) {
        const record = byComponent.get(component);
        if (!record) {
            blockers.push(`missing-migration-record:${component}`);
        } else if (migrationRank[record.state] <
            migrationRank["live-integrated"]) {
            blockers.push(`not-live-integrated:${component}`);
        }
    }
    return blockers;
};

export const qualifyCloudGateA = (
    input: CloudGateAQualificationInput,
): CloudGateAQualificationResult => {
    const simulationTimeSeconds = input.runtime.simulation.timeSeconds;
    const productionFrame = compileCloudProductionFrameV1({
        systems: input.runtime.systemsV2,
        frameIndex: input.runtime.simulation.step,
        simulationTimeSeconds,
        capacities: input.productionCapacities,
    });
    const gpuUploadPlan = createCloudProductionGpuUploadPlanV1(
        productionFrame,
        input.auxiliaryCapacities,
    );
    const positions = input.samplePositionsKm ??
        createCloudGateASamplePositions(
            input.runtime.simulation,
            input.maximumSamplePositions ?? 48,
        );
    const providers = input.providers ??
        createCloudGateAContractProviders(input.runtime.simulation);
    const parity = qualifyCloudPhysicalPassParity(
        providers,
        positions,
        { simulationTimeSeconds },
    );
    const migration = input.migration ?? CURRENT_CLOUD_GATE_A_MIGRATION;
    const blockers: string[] = [];
    if (input.runtime.systemsV2.length === 0) {
        blockers.push("no-active-compiled-owners");
    }
    if (positions.length === 0) blockers.push("no-physical-sample-positions");
    if (productionFrame.issues.length > 0) {
        blockers.push("production-frame-validation-failed");
    }
    if (!gpuUploadPlan.complete) blockers.push("gpu-upload-plan-incomplete");
    if (!parity.valid) blockers.push("physical-pass-parity-failed");
    const contractReady = blockers.length === 0;
    blockers.push(...migrationBlockers(migration));
    const liveIntegratedComponents = migration.filter(({ state }) =>
        migrationRank[state] >= migrationRank["live-integrated"]).length;
    return {
        schemaVersion: 1,
        contractReady,
        gateAReady: blockers.length === 0,
        productionFrame,
        gpuUploadPlan,
        parity,
        migration,
        blockers,
        summary: {
            activeOwners: input.runtime.systemsV2.length,
            activeFeatures: input.runtime.systemsV2.reduce((sum, system) =>
                sum + system.features.filter(({ active }) => active).length, 0),
            sampledPositions: positions.length,
            parityPasses: parity.passes.length,
            liveIntegratedComponents,
            requiredComponents: migration.length,
            productionFrameIssues: productionFrame.issues.length,
            gpuUploadIssues: gpuUploadPlan.issues.length,
            parityIssues: parity.issues.length,
        },
    };
};

export const cloudGateAQualificationSummary = (
    result: CloudGateAQualificationResult,
) => ({
    schemaVersion: result.schemaVersion,
    contractReady: result.contractReady,
    gateAReady: result.gateAReady,
    frameFingerprint: result.productionFrame.fingerprint,
    gpuUploadComplete: result.gpuUploadPlan.complete,
    parityValid: result.parity.valid,
    blockers: result.blockers,
    migration: result.migration,
    summary: result.summary,
});

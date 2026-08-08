import {
    adaptCloudRuntimeMorphologyV2,
    createCloudMorphologyV2FeatureResolver,
    type CloudMorphologyV2Migration,
} from "./cloud-morphology-v2-feature-adapter";
import {
    compileCloudSystemRuntimeProductionV1,
    type CloudRuntimeProductionBridgeResult,
} from "./cloud-production-runtime-bridge";
import type { CloudSystemRuntime } from "./cloud-system-runtime";

export interface CloudShippingProductionRuntimeV1 {
    schemaVersion: 1;
    runtimeSignature: string;
    frameIndex: number;
    simulationTimeSeconds: number;
    morphology: CloudMorphologyV2Migration;
    bridge: CloudRuntimeProductionBridgeResult;
    ownerFeatureEventBuffersLive: true;
    semanticFeatureMigrationComplete: boolean;
    manifestOperatorParityComplete: boolean;
    productionReady: boolean;
}

export interface CompileCloudShippingProductionRuntimeInputV1 {
    frameIndex?: number;
    simulationTimeSeconds?: number;
    previous?: CloudShippingProductionRuntimeV1 | null;
}

const cache = new WeakMap<CloudSystemRuntime, CloudShippingProductionRuntimeV1>();

const derivedSimulationTime = (runtime: CloudSystemRuntime) => Math.max(
    0,
    ...runtime.systems.map(({ state }) => state.lifecycle.ageSeconds),
);

/**
 * Shipping CPU boundary for the current renderer. Every finite owner is
 * translated to V2, every orthogonal morphology assignment receives a stable
 * parent-owned feature record, and the fixed production frame is retained on
 * the runtime before any camera/light consumer reads it.
 *
 * This deliberately does not claim manifest-operator or GPU-pass parity.
 */
export const compileCloudShippingProductionRuntimeV1 = (
    runtime: CloudSystemRuntime,
    input: CompileCloudShippingProductionRuntimeInputV1 = {},
): CloudShippingProductionRuntimeV1 => {
    if (!input.previous && input.frameIndex === undefined &&
        input.simulationTimeSeconds === undefined) {
        const cached = cache.get(runtime);
        if (cached) return cached;
    }
    const simulationTimeSeconds = Math.max(
        0,
        input.simulationTimeSeconds ?? derivedSimulationTime(runtime),
    );
    const frameIndex = Math.max(
        0,
        Math.trunc(input.frameIndex ?? simulationTimeSeconds / 30),
    );
    const morphology = adaptCloudRuntimeMorphologyV2(runtime);
    const bridge = compileCloudSystemRuntimeProductionV1({
        runtime,
        frameIndex,
        simulationTimeSeconds,
        previousFrame: input.previous?.bridge.frame,
        featureResolver: createCloudMorphologyV2FeatureResolver(morphology),
        legacyFeaturesFullyMigrated:
            morphology.operatorParityComplete,
        bufferCapacities: {
            owners: 36,
            features: 288,
            events: 1_024,
            eventReferences: 8_192,
        },
    });
    const result: CloudShippingProductionRuntimeV1 = {
        schemaVersion: 1,
        runtimeSignature: runtime.signature,
        frameIndex,
        simulationTimeSeconds,
        morphology,
        bridge,
        ownerFeatureEventBuffersLive: true,
        semanticFeatureMigrationComplete: morphology.semanticComplete,
        manifestOperatorParityComplete: morphology.operatorParityComplete,
        productionReady: bridge.productionReady &&
            morphology.semanticComplete &&
            morphology.operatorParityComplete,
    };
    if (!input.previous && input.frameIndex === undefined &&
        input.simulationTimeSeconds === undefined) {
        cache.set(runtime, result);
    }
    return result;
};

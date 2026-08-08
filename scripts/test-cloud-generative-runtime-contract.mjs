import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(
    new URL(`../${relative}`, import.meta.url),
    "utf8",
);

const physical = source("components/backgrounds/sky/cloud-physical-sample.ts");
const abi = source("components/backgrounds/sky/cloud-system-abi-v2.ts");
const engine = source("components/backgrounds/sky/cloud-weather-engine.ts");
const runtime = source("components/backgrounds/sky/cloud-generative-runtime.ts");
const reference = source("components/backgrounds/sky/cloud-reference-transport.ts");
const generatedSampler = source(
    "components/backgrounds/sky/cloud-generated-physical-sampler.ts",
);
const interactions = source(
    "components/backgrounds/sky/cloud-interaction-model.ts",
);
const evidence = source("components/backgrounds/sky/cloud-qualification-evidence.ts");
const performance = source("components/backgrounds/sky/cloud-performance-qualification.ts");
const api = source("app/api/cloud-generation/route.ts");

test("the authoritative sample preserves geometry, material, ownership, and WGSL parity", () => {
    for (const field of [
        "support", "density", "gradient", "velocityKmPerSecond", "ageSeconds",
        "liquidWaterContent", "iceWaterContent",
        "liquidEffectiveRadiusMicrons", "iceEffectiveRadiusMicrons",
        "precipitationSource", "turbulence", "temperatureKelvin",
        "ownerId", "featureId", "materialClass",
    ]) assert.match(physical, new RegExp(`\\b${field}\\b`));
    assert.match(physical, /combineCloudPhysicalSamples/);
    assert.match(physical, /CLOUD_PHYSICAL_SAMPLE_WGSL/);
    assert.match(physical, /ownerless-precipitation/);
});

test("ABI v2 separates owners, features, and lifecycle events with migration", () => {
    assert.match(abi, /CLOUD_SYSTEM_ABI_V2_SCHEMA_VERSION = 2/);
    assert.match(abi, /interface CloudOwnerRecordV2/);
    assert.match(abi, /interface CloudFeatureRecordV2/);
    assert.match(abi, /interface CloudLifecycleEventV2/);
    assert.match(abi, /migrateCompiledCloudSystemV1/);
    assert.match(abi, /packCloudSystemV2/);
    assert.match(abi, /detached-feature/);
});

test("conditioned and free-running generation compile through the same scene and V2 boundary", () => {
    assert.match(runtime, /createConditionedCloudRuntime/);
    assert.match(runtime, /createFreeRunningCloudRuntime/);
    assert.match(runtime, /generatedSimulationToCloudScene/);
    assert.match(runtime, /compileGeneratedSimulationV2/);
    assert.match(runtime, /compileCloudSystemV2/);
    assert.match(runtime, /buildCloudInteractionGraph/);
    assert.match(generatedSampler, /sampleCloudWeatherSimulationPhysical/);
    assert.match(generatedSampler, /resolveCloudPhysicalSample/);
    for (const kind of [
        "radiative-shadow", "precipitation-through-layer",
        "cold-pool-influence", "lineage-continuity",
    ]) assert.match(interactions, new RegExp(`"${kind}"`));
    assert.doesNotMatch(engine, /cameraRangeKm|horizontalFieldOfView|frameAzimuthBias/);
    assert.match(engine, /cloudWeatherSimulationFingerprint/);
    for (const process of [
        "condensation", "evaporation", "glaciation", "precipitation-onset",
        "merge", "split", "feature-attach", "death",
    ]) assert.match(engine, new RegExp(`"${process}"`));
});

test("the reference path and evidence gates reject renderer-only completion", () => {
    assert.match(reference, /STRICT_CLOUD_REFERENCE_TRANSPORT_SETTINGS/);
    assert.match(reference, /multipleScatteringOrders/);
    assert.match(reference, /environmentRadiance/);
    assert.match(evidence, /genusTop1Accuracy < 0\.9/);
    assert.match(evidence, /speciesTop1Accuracy < 0\.75/);
    assert.match(evidence, /speciesTop2Accuracy < 0\.9/);
    assert.match(evidence, /expertFraction < 0\.85/);
    assert.match(evidence, /criticalTemporalFailures/);
    assert.match(performance, /minimumVisualEquivalenceScore/);
    assert.match(performance, /CLOUD_STRESS_SCENARIOS/);
    assert.match(performance, /device-loss-recovery/);
});

test("the generation API is bounded and read-only", () => {
    assert.match(api, /export function GET\(\)/);
    assert.match(api, /export async function POST/);
    assert.match(api, /MAXIMUM_STEPS = 600/);
    assert.match(api, /MAXIMUM_OWNERS = 48/);
    assert.match(api, /validateCloudWeatherSimulation/);
    assert.match(api, /generated\.interactions/);
    assert.doesNotMatch(api, /writeFile|unlink|rmSync|exec\(/);
});

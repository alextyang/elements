import { NextRequest, NextResponse } from "next/server";

import {
    createConditionedCloudRuntime,
    createFreeRunningCloudRuntime,
} from "@/components/backgrounds/sky/cloud-generative-runtime";
import {
    compileCloudProductionFrameV1,
    serializeCloudProductionFrameV1,
} from "@/components/backgrounds/sky/cloud-production-frame";
import {
    DEFAULT_CLOUD_WEATHER_DOMAIN,
    cloudWeatherSimulationFingerprint,
    validateCloudWeatherSimulation,
    type CloudGenerationMode,
    type CloudWeatherDomain,
    type ConditionedCloudTarget,
} from "@/components/backgrounds/sky/cloud-weather-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAXIMUM_STEPS = 600;
const MAXIMUM_OWNERS = 48;
const MAXIMUM_FEATURES = 192;
const MAXIMUM_EVENTS = 1_024;
const MAXIMUM_EVENT_REFERENCES = 8_192;
const GENERA = new Set([
    "cirrus", "cirrocumulus", "cirrostratus", "altocumulus",
    "altostratus", "nimbostratus", "stratocumulus", "stratus",
    "cumulus", "cumulonimbus",
]);

interface CloudGenerationRequest {
    mode?: CloudGenerationMode;
    seed?: number;
    steps?: number;
    fixedStepSeconds?: number;
    domain?: Partial<CloudWeatherDomain>;
    forcing?: Record<string, number>;
    target?: ConditionedCloudTarget;
    includeSimulationState?: boolean;
    /** Diagnostic only: serializes fixed-capacity typed arrays into JSON. */
    includeProductionBuffers?: boolean;
}

const integer = (
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
) => Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(value as number)))
    : fallback;

const resolveDomain = (
    value: CloudGenerationRequest["domain"],
): CloudWeatherDomain => ({
    ...DEFAULT_CLOUD_WEATHER_DOMAIN,
    ...value,
    sounding: value?.sounding?.length
        ? value.sounding.map((level) => ({ ...level }))
        : DEFAULT_CLOUD_WEATHER_DOMAIN.sounding.map((level) => ({ ...level })),
});

const errorResponse = (message: string, status = 400) =>
    NextResponse.json({ error: message }, { status });

export function GET() {
    return NextResponse.json({
        schemaVersion: 1,
        modes: ["conditioned", "free-running"],
        sharedRepresentation: {
            physicalSampleSchemaVersion: 1,
            cloudSystemAbiVersion: 2,
            productionBufferSchemaVersion: 1,
            spatialIndexSchemaVersion: 1,
            temporalIdentitySchemaVersion: 1,
            cameraIndependent: true,
        },
        limits: {
            maximumSteps: MAXIMUM_STEPS,
            maximumOwners: MAXIMUM_OWNERS,
            maximumFeatures: MAXIMUM_FEATURES,
            maximumEvents: MAXIMUM_EVENTS,
            maximumEventReferences: MAXIMUM_EVENT_REFERENCES,
        },
        conditionedRequiredFields: ["mode", "seed", "target.genus"],
        freeRunningRequiredFields: ["mode", "seed"],
        diagnostics: {
            includeProductionBuffers:
                "Opt-in fixed-capacity GPU records; omitted by default.",
        },
    });
}

export async function POST(request: NextRequest) {
    let body: CloudGenerationRequest;
    try {
        body = await request.json() as CloudGenerationRequest;
    } catch {
        return errorResponse("Request body must be valid JSON.");
    }
    const mode = body.mode ?? "free-running";
    if (mode !== "conditioned" && mode !== "free-running") {
        return errorResponse(`Unsupported generation mode ${String(mode)}.`);
    }
    if (mode === "conditioned" &&
        (!body.target || !GENERA.has(body.target.genus))) {
        return errorResponse(
            "Conditioned generation requires a supported target genus.",
        );
    }
    const seed = integer(body.seed, 1, 0, 0xffff_ffff);
    const steps = integer(body.steps, 0, 0, MAXIMUM_STEPS);
    const fixedStepSeconds = integer(body.fixedStepSeconds, 30, 1, 300);
    const common = {
        seed,
        steps,
        fixedStepSeconds,
        domain: resolveDomain(body.domain),
        forcing: body.forcing,
        maxOwners: MAXIMUM_OWNERS,
        maxFeatures: MAXIMUM_FEATURES,
    };
    try {
        const generated = mode === "conditioned"
            ? createConditionedCloudRuntime({
                ...common,
                target: body.target!,
            })
            : createFreeRunningCloudRuntime(common);
        const validationIssues = validateCloudWeatherSimulation(
            generated.simulation,
        );
        const productionFrame = compileCloudProductionFrameV1({
            systems: generated.systemsV2,
            frameIndex: steps,
            simulationTimeSeconds: generated.simulation.timeSeconds,
            capacities: {
                owners: MAXIMUM_OWNERS,
                features: MAXIMUM_FEATURES,
                events: MAXIMUM_EVENTS,
                eventReferences: MAXIMUM_EVENT_REFERENCES,
            },
        });
        const response = {
            schemaVersion: 1,
            mode,
            seed,
            steps,
            fingerprint: cloudWeatherSimulationFingerprint(
                generated.simulation,
            ),
            summary: {
                timeSeconds: generated.simulation.timeSeconds,
                owners: generated.simulation.owners.length,
                activeOwners: generated.simulation.owners.filter(
                    ({ active }) => active,
                ).length,
                features: generated.simulation.features.length,
                activeFeatures: generated.simulation.features.filter(
                    ({ active }) => active,
                ).length,
                events: generated.simulation.events.length,
                interactions: generated.interactions.interactions.length,
                validationIssues: validationIssues.length,
                productionFrameIssues: productionFrame.issues.length,
                productionBufferFingerprint:
                    productionFrame.buffers.fingerprint,
                productionHistoryToken:
                    productionFrame.temporal.historyToken,
            },
            validationIssues,
            scene: generated.scene,
            systemsV2: generated.systemsV2,
            interactions: generated.interactions,
            productionFrame: serializeCloudProductionFrameV1(
                productionFrame,
                body.includeProductionBuffers === true,
            ),
            ...(body.includeSimulationState ? {
                simulation: generated.simulation,
            } : {}),
        };
        return NextResponse.json(response, {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message :
            "Cloud generation failed.";
        return errorResponse(message, 422);
    }
}

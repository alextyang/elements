import {
    validateCloudPhysicalSample,
    type CloudPhysicalSample,
    type CloudVec3,
} from "./cloud-physical-sample";

export type CloudPhysicalPassName =
    | "camera"
    | "light-volume"
    | "atmosphere-shadow"
    | "hydrometeor"
    | "reference";

export interface CloudPhysicalSamplingContext {
    simulationTimeSeconds: number;
    sourceDirection?: CloudVec3;
}

export type CloudPhysicalSampleProvider = (
    positionKm: CloudVec3,
    context: CloudPhysicalSamplingContext,
) => CloudPhysicalSample;

export interface CloudPhysicalPassProvider {
    pass: CloudPhysicalPassName;
    sample: CloudPhysicalSampleProvider;
}

export interface CloudPhysicalPassTolerance {
    absoluteDensity: number;
    relativeCondensate: number;
    relativeEffectiveRadius: number;
    absolutePrecipitationSource: number;
    absoluteTemperatureKelvin: number;
    absoluteVelocityKmPerSecond: number;
    absoluteGradient: number;
}

export const STRICT_CLOUD_PHYSICAL_PASS_TOLERANCE:
CloudPhysicalPassTolerance = Object.freeze({
    absoluteDensity: 1e-6,
    relativeCondensate: 1e-5,
    relativeEffectiveRadius: 1e-5,
    absolutePrecipitationSource: 1e-6,
    absoluteTemperatureKelvin: 1e-4,
    absoluteVelocityKmPerSecond: 1e-6,
    absoluteGradient: 1e-6,
});

export interface CloudPhysicalPassParityIssue {
    code: string;
    pass: CloudPhysicalPassName;
    sampleIndex: number;
    field: string;
    message: string;
    error: number;
    tolerance: number;
}

export interface CloudPhysicalPassParityResult {
    schemaVersion: 1;
    baselinePass: CloudPhysicalPassName;
    passes: readonly CloudPhysicalPassName[];
    sampleCount: number;
    maximumErrors: Readonly<Record<string, number>>;
    issues: readonly CloudPhysicalPassParityIssue[];
    valid: boolean;
}

const absoluteDifference = (left: number, right: number) =>
    Math.abs(left - right);
const relativeDifference = (left: number, right: number) =>
    Math.abs(left - right) / Math.max(1e-8, Math.abs(left), Math.abs(right));
const vectorMaximumDifference = (left: CloudVec3, right: CloudVec3) =>
    Math.max(
        Math.abs(left[0] - right[0]),
        Math.abs(left[1] - right[1]),
        Math.abs(left[2] - right[2]),
    );

export const qualifyCloudPhysicalPassParity = (
    providers: readonly CloudPhysicalPassProvider[],
    positionsKm: readonly CloudVec3[],
    context: CloudPhysicalSamplingContext,
    tolerance: CloudPhysicalPassTolerance =
        STRICT_CLOUD_PHYSICAL_PASS_TOLERANCE,
): CloudPhysicalPassParityResult => {
    const issues: CloudPhysicalPassParityIssue[] = [];
    const maximumErrors: Record<string, number> = {};
    const baseline = providers.find(({ pass }) => pass === "camera") ??
        providers[0];
    if (!baseline) {
        return {
            schemaVersion: 1,
            baselinePass: "camera",
            passes: [],
            sampleCount: positionsKm.length,
            maximumErrors,
            issues: [{
                code: "missing-provider",
                pass: "camera",
                sampleIndex: -1,
                field: "provider",
                message: "At least one physical sample provider is required.",
                error: 1,
                tolerance: 0,
            }],
            valid: false,
        };
    }
    const record = (
        code: string,
        pass: CloudPhysicalPassName,
        sampleIndex: number,
        field: string,
        error: number,
        maximum: number,
    ) => {
        maximumErrors[field] = Math.max(maximumErrors[field] ?? 0, error);
        if (error <= maximum) return;
        issues.push({
            code,
            pass,
            sampleIndex,
            field,
            message: `${field} diverged by ${error}; tolerance is ${maximum}.`,
            error,
            tolerance: maximum,
        });
    };

    positionsKm.forEach((position, sampleIndex) => {
        const expected = baseline.sample(position, context);
        for (const sampleIssue of validateCloudPhysicalSample(expected)) {
            issues.push({
                code: `invalid-baseline-${sampleIssue.code}`,
                pass: baseline.pass,
                sampleIndex,
                field: String(sampleIssue.field),
                message: sampleIssue.message,
                error: 1,
                tolerance: 0,
            });
        }
        for (const provider of providers) {
            if (provider === baseline) continue;
            const actual = provider.sample(position, context);
            for (const sampleIssue of validateCloudPhysicalSample(actual)) {
                issues.push({
                    code: `invalid-sample-${sampleIssue.code}`,
                    pass: provider.pass,
                    sampleIndex,
                    field: String(sampleIssue.field),
                    message: sampleIssue.message,
                    error: 1,
                    tolerance: 0,
                });
            }
            for (const [field, expectedId, actualId] of [
                ["ownerId", expected.ownerId, actual.ownerId],
                ["featureId", expected.featureId, actual.featureId],
                ["materialClass", expected.materialClass, actual.materialClass],
            ] as const) {
                record(
                    "identity-mismatch",
                    provider.pass,
                    sampleIndex,
                    field,
                    expectedId === actualId ? 0 : 1,
                    0,
                );
            }
            record("density-mismatch", provider.pass, sampleIndex, "support",
                absoluteDifference(expected.support, actual.support),
                tolerance.absoluteDensity);
            record("density-mismatch", provider.pass, sampleIndex, "density",
                absoluteDifference(expected.density, actual.density),
                tolerance.absoluteDensity);
            record("condensate-mismatch", provider.pass, sampleIndex,
                "liquidWaterContent", relativeDifference(
                    expected.liquidWaterContent,
                    actual.liquidWaterContent,
                ), tolerance.relativeCondensate);
            record("condensate-mismatch", provider.pass, sampleIndex,
                "iceWaterContent", relativeDifference(
                    expected.iceWaterContent,
                    actual.iceWaterContent,
                ), tolerance.relativeCondensate);
            record("radius-mismatch", provider.pass, sampleIndex,
                "liquidEffectiveRadiusMicrons", relativeDifference(
                    expected.liquidEffectiveRadiusMicrons,
                    actual.liquidEffectiveRadiusMicrons,
                ), tolerance.relativeEffectiveRadius);
            record("radius-mismatch", provider.pass, sampleIndex,
                "iceEffectiveRadiusMicrons", relativeDifference(
                    expected.iceEffectiveRadiusMicrons,
                    actual.iceEffectiveRadiusMicrons,
                ), tolerance.relativeEffectiveRadius);
            record("precipitation-mismatch", provider.pass, sampleIndex,
                "precipitationSource", absoluteDifference(
                    expected.precipitationSource,
                    actual.precipitationSource,
                ), tolerance.absolutePrecipitationSource);
            record("temperature-mismatch", provider.pass, sampleIndex,
                "temperatureKelvin", absoluteDifference(
                    expected.temperatureKelvin,
                    actual.temperatureKelvin,
                ), tolerance.absoluteTemperatureKelvin);
            record("velocity-mismatch", provider.pass, sampleIndex,
                "velocityKmPerSecond", vectorMaximumDifference(
                    expected.velocityKmPerSecond,
                    actual.velocityKmPerSecond,
                ), tolerance.absoluteVelocityKmPerSecond);
            record("gradient-mismatch", provider.pass, sampleIndex, "gradient",
                vectorMaximumDifference(expected.gradient, actual.gradient),
                tolerance.absoluteGradient);
        }
    });

    const passes = providers.map(({ pass }) => pass);
    for (const required of [
        "camera", "light-volume", "atmosphere-shadow", "hydrometeor",
    ] as const) {
        if (!passes.includes(required)) {
            issues.push({
                code: "missing-required-pass",
                pass: required,
                sampleIndex: -1,
                field: "provider",
                message: `${required} must consume the shared physical sample.`,
                error: 1,
                tolerance: 0,
            });
        }
    }
    return {
        schemaVersion: 1,
        baselinePass: baseline.pass,
        passes,
        sampleCount: positionsKm.length,
        maximumErrors,
        issues,
        valid: issues.length === 0,
    };
};

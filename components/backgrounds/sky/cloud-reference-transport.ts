import {
    cloudSampleExtinctionKm,
    type CloudPhysicalSample,
    type CloudVec3,
} from "./cloud-physical-sample";

export type CloudRgb = readonly [r: number, g: number, b: number];

export interface CloudReferenceRay {
    originKm: CloudVec3;
    direction: CloudVec3;
    minimumDistanceKm: number;
    maximumDistanceKm: number;
}

export interface CloudReferenceLight {
    directionToSource: CloudVec3;
    radiance: CloudRgb;
    angularRadiusRadians: number;
}

export interface CloudReferenceTransportSettings {
    primarySamples: number;
    lightSamples: number;
    multipleScatteringOrders: number;
    jitterSeed: number;
    minimumTransmittance: number;
    stepExpansion: number;
    spectralIceTwilight: boolean;
}

export interface CloudReferenceTransportContext {
    ray: CloudReferenceRay;
    light: CloudReferenceLight;
    sample: (positionKm: CloudVec3) => CloudPhysicalSample;
    environmentRadiance: (positionKm: CloudVec3, direction: CloudVec3) => CloudRgb;
    settings?: Partial<CloudReferenceTransportSettings>;
}

export interface CloudReferenceTransportResult {
    radiance: CloudRgb;
    transmittance: CloudRgb;
    opticalDepth: number;
    meanDepthKm: number;
    firstSignificantDepthKm: number | null;
    primarySamples: number;
    lightSamples: number;
    terminatedEarly: boolean;
    spectralIceTwilightApplied: boolean;
}

export const STRICT_CLOUD_REFERENCE_TRANSPORT_SETTINGS:
CloudReferenceTransportSettings = {
    primarySamples: 512,
    lightSamples: 96,
    multipleScatteringOrders: 4,
    jitterSeed: 0x5f3759df,
    minimumTransmittance: 1e-5,
    stepExpansion: 1,
    spectralIceTwilight: true,
};

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const add = (left: CloudRgb, right: CloudRgb): CloudRgb => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const multiply = (left: CloudRgb, right: CloudRgb): CloudRgb => [
    left[0] * right[0], left[1] * right[1], left[2] * right[2],
];
const scale = (value: CloudRgb, factor: number): CloudRgb => [
    value[0] * factor, value[1] * factor, value[2] * factor,
];
const point = (
    origin: CloudVec3,
    direction: CloudVec3,
    distance: number,
): CloudVec3 => [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
];
const dot = (left: CloudVec3, right: CloudVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const normalize = (value: CloudVec3): CloudVec3 => {
    const magnitude = Math.hypot(...value);
    return magnitude > 1e-8
        ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
        : [0, 1, 0];
};

const hash01 = (seed: number, index: number) => {
    let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
};

const henyeyGreenstein = (cosine: number, asymmetry: number) => {
    const g = clamp(asymmetry, -0.98, 0.98);
    const denominator = Math.max(
        1e-6,
        1 + g * g - 2 * g * clamp(cosine, -1, 1),
    );
    return (1 - g * g) /
        (4 * Math.PI * denominator * Math.sqrt(denominator));
};

const phaseFor = (sample: CloudPhysicalSample, sourceCosine: number) => {
    const total = sample.liquidWaterContent + sample.iceWaterContent;
    const iceFraction = total > 1e-8 ? sample.iceWaterContent / total : 0;
    const forward = henyeyGreenstein(
        sourceCosine,
        0.82 + iceFraction * 0.08,
    );
    const backward = henyeyGreenstein(
        sourceCosine,
        -0.25 + iceFraction * 0.08,
    );
    return forward * 0.88 + backward * 0.12;
};

const spectralIceTwilightScale = (
    sample: CloudPhysicalSample,
    directionToSource: CloudVec3,
): CloudRgb => {
    const total = sample.liquidWaterContent + sample.iceWaterContent;
    const iceFraction = total > 1e-8 ? sample.iceWaterContent / total : 0;
    const grazing = clamp(1 - Math.abs(directionToSource[1]));
    const strength = iceFraction * grazing * 0.08;
    return [1 + strength * 0.35, 1, 1 - strength * 0.22];
};

const lightTransmittance = (
    startKm: CloudVec3,
    direction: CloudVec3,
    sampleAt: CloudReferenceTransportContext["sample"],
    lightSamples: number,
    maxDistanceKm: number,
) => {
    const stepKm = maxDistanceKm / Math.max(1, lightSamples);
    let opticalDepth = 0;
    let evaluations = 0;
    for (let index = 0; index < lightSamples; index += 1) {
        const position = point(startKm, direction, (index + 0.5) * stepKm);
        const sample = sampleAt(position);
        evaluations += 1;
        if (sample.support <= 0 || sample.density <= 0) continue;
        opticalDepth += cloudSampleExtinctionKm(sample) * stepKm;
        if (opticalDepth >= 18) break;
    }
    return { transmittance: Math.exp(-opticalDepth), evaluations };
};

const higherOrderScattering = (
    environment: CloudRgb,
    direct: CloudRgb,
    albedo: number,
    opticalDepth: number,
    orders: number,
): CloudRgb => {
    let result: CloudRgb = [0, 0, 0];
    let energy = clamp(albedo) * (1 - Math.exp(-opticalDepth)) * 0.34;
    for (let order = 1; order <= orders; order += 1) {
        const source = order === 1 ? direct : environment;
        result = add(result, scale(source, energy));
        energy *= 0.42 * clamp(albedo);
    }
    return result;
};

export const renderCloudReferenceTransport = (
    context: CloudReferenceTransportContext,
): CloudReferenceTransportResult => {
    const settings = {
        ...STRICT_CLOUD_REFERENCE_TRANSPORT_SETTINGS,
        ...context.settings,
    };
    const direction = normalize(context.ray.direction);
    const sourceDirection = normalize(context.light.directionToSource);
    const raySpan = Math.max(
        0,
        context.ray.maximumDistanceKm - context.ray.minimumDistanceKm,
    );
    const primarySamples = Math.max(1, Math.trunc(settings.primarySamples));
    const baseStepKm = raySpan / primarySamples;
    let radiance: CloudRgb = [0, 0, 0];
    let transmittance: CloudRgb = [1, 1, 1];
    let opticalDepth = 0;
    let weightedDepth = 0;
    let weight = 0;
    let firstSignificantDepthKm: number | null = null;
    let lightEvaluations = 0;
    let terminatedEarly = false;
    let spectralApplied = false;

    for (let index = 0; index < primarySamples; index += 1) {
        const jitter = hash01(settings.jitterSeed, index);
        const distanceKm = context.ray.minimumDistanceKm +
            (index + jitter) * baseStepKm;
        const positionKm = point(context.ray.originKm, direction, distanceKm);
        const sample = context.sample(positionKm);
        if (sample.support <= 0 || sample.density <= 0) continue;

        const extinctionKm = cloudSampleExtinctionKm(sample);
        if (!(extinctionKm > 0)) continue;
        const stepKm = baseStepKm * Math.max(0.25, settings.stepExpansion);
        const stepOpticalDepth = extinctionKm * stepKm;
        const segmentTransmittance = Math.exp(-stepOpticalDepth);
        const segmentWeight = 1 - segmentTransmittance;
        const environment = context.environmentRadiance(positionKm, direction);
        const light = lightTransmittance(
            positionKm,
            sourceDirection,
            context.sample,
            Math.max(1, Math.trunc(settings.lightSamples)),
            Math.min(64, Math.max(8, raySpan * 0.5)),
        );
        lightEvaluations += light.evaluations;
        const phase = phaseFor(sample, dot(direction, sourceDirection));
        let direct = scale(
            context.light.radiance,
            light.transmittance * phase,
        );
        if (settings.spectralIceTwilight) {
            const spectralScale = spectralIceTwilightScale(
                sample,
                sourceDirection,
            );
            if (spectralScale.some((channel) => Math.abs(channel - 1) > 1e-6)) {
                spectralApplied = true;
            }
            direct = multiply(direct, spectralScale);
        }
        const albedo = clamp(0.985 - sample.precipitationSource * 0.0005,
            0.82, 0.9995);
        const higher = higherOrderScattering(
            environment,
            direct,
            albedo,
            stepOpticalDepth,
            Math.max(0, Math.trunc(settings.multipleScatteringOrders)),
        );
        const source = add(
            scale(direct, albedo),
            add(scale(environment, 0.08 * albedo), higher),
        );
        radiance = add(
            radiance,
            multiply(transmittance, scale(source, segmentWeight)),
        );
        transmittance = scale(transmittance, segmentTransmittance);
        opticalDepth += stepOpticalDepth;
        const opacity = 1 - transmittance[0];
        if (firstSignificantDepthKm === null && opacity >= 0.01) {
            firstSignificantDepthKm = distanceKm;
        }
        weightedDepth += distanceKm * segmentWeight;
        weight += segmentWeight;
        if (Math.max(...transmittance) <= settings.minimumTransmittance) {
            terminatedEarly = true;
            break;
        }
    }

    return {
        radiance,
        transmittance,
        opticalDepth,
        meanDepthKm: weight > 1e-8 ? weightedDepth / weight : 0,
        firstSignificantDepthKm,
        primarySamples,
        lightSamples: lightEvaluations,
        terminatedEarly,
        spectralIceTwilightApplied: spectralApplied,
    };
};

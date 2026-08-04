/**
 * Renderer-independent atmosphere <-> cloud directional-lighting contract.
 *
 * All values are scene-linear. Resolved source discs remain caller-owned TOA
 * sources; this module only represents transported sky radiance and passive
 * cloud transfer. No function applies exposure, grading, or tone mapping.
 */

export type DirectionalLightingVec3 = readonly [number, number, number];

export const DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA = 1;
export const DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT = 14;
export const DIRECTIONAL_SKY_MAX_SOURCE_LOBES = 2;
export const DIRECTIONAL_SKY_MAX_ALTITUDE_NODES = 12;
/**
 * Shared production altitude knots.  The nonlinear spacing resolves the
 * boundary layer and ordinary cloud deck first, then retains stratospheric
 * and mesospheric endpoints without growing the cache.
 */
export const DIRECTIONAL_SKY_ALTITUDE_NODES_KM = Object.freeze([
    0, 0.25, 0.75, 1.5, 2.5, 4, 6, 9, 13, 20, 40, 80,
] as const);

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));
const saturate = (value: number) => clamp(value, 0, 1);
const dot3 = (left: DirectionalLightingVec3, right: DirectionalLightingVec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const length3 = (value: DirectionalLightingVec3) =>
    Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value: DirectionalLightingVec3): DirectionalLightingVec3 => {
    const magnitude = length3(value);
    return magnitude > 1e-12
        ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
        : [0, 1, 0];
};
const cross3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
): DirectionalLightingVec3 => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];
const add3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
): DirectionalLightingVec3 => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const scale3 = (
    value: DirectionalLightingVec3,
    amount: number,
): DirectionalLightingVec3 => [
    value[0] * amount, value[1] * amount, value[2] * amount,
];
const mul3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
): DirectionalLightingVec3 => [
    left[0] * right[0], left[1] * right[1], left[2] * right[2],
];
const min3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
): DirectionalLightingVec3 => [
    Math.min(left[0], right[0]), Math.min(left[1], right[1]),
    Math.min(left[2], right[2]),
];
const max3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
): DirectionalLightingVec3 => [
    Math.max(left[0], right[0]), Math.max(left[1], right[1]),
    Math.max(left[2], right[2]),
];
const map3 = (
    value: DirectionalLightingVec3,
    evaluator: (component: number, channel: number) => number,
): DirectionalLightingVec3 => value.map(evaluator) as unknown as
    DirectionalLightingVec3;
const mix3 = (
    left: DirectionalLightingVec3,
    right: DirectionalLightingVec3,
    amount: number,
): DirectionalLightingVec3 => [
    left[0] + (right[0] - left[0]) * amount,
    left[1] + (right[1] - left[1]) * amount,
    left[2] + (right[2] - left[2]) * amount,
];
const finiteNonnegative3 = (value: DirectionalLightingVec3) =>
    value.every((component) => Number.isFinite(component) && component >= 0);
const luminance3 = (value: DirectionalLightingVec3) =>
    value[0] * 0.2126 + value[1] * 0.7152 + value[2] * 0.0722;
const bounded3 = (value: DirectionalLightingVec3): DirectionalLightingVec3 =>
    map3(value, (component) => clamp(component, 0, 1e12));
const boundedUnit3 = (value: DirectionalLightingVec3): DirectionalLightingVec3 =>
    map3(value, saturate);

export interface DirectionalLightingValidity {
    valid: boolean;
    reasons: readonly string[];
}

export type DirectionalSkySourceKind = "sun" | "moon";

export interface DirectionalSkySourceGeometry {
    kind: DirectionalSkySourceKind;
    direction: DirectionalLightingVec3;
    enabled: boolean;
    /** Geometry-only partition bandwidth; it never scales source radiometry. */
    reconstructionSharpness?: number;
}

export interface DirectionalRadianceQuadratureSample {
    direction: DirectionalLightingVec3;
    radianceRgb: DirectionalLightingVec3;
    solidAngleSteradians: number;
}

export type DirectionalSkyLobeKind =
    | "diffuse"
    | "sunward"
    | "moonward"
    | "horizon";

export interface DirectionalSkyRadianceLobe {
    kind: DirectionalSkyLobeKind;
    axis: DirectionalLightingVec3;
    /** Spherical-Gaussian sharpness, or horizon angular sigma in radians. */
    shapeParameter: number;
    integratedRadianceRgb: DirectionalLightingVec3;
    normalizationSteradians: number;
}

export interface DirectionalSkyRadianceNode {
    schema: typeof DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA;
    altitudeKm: number;
    localUpDirection: DirectionalLightingVec3;
    lobes: readonly DirectionalSkyRadianceLobe[];
    upperHemisphereIrradianceRgb: DirectionalLightingVec3;
    lowerHemisphereIrradianceRgb: DirectionalLightingVec3;
    upperHemisphereRadianceIntegralRgb: DirectionalLightingVec3;
    lowerHemisphereRadianceIntegralRgb: DirectionalLightingVec3;
    fullSphereRadianceIntegralRgb: DirectionalLightingVec3;
    quadratureSolidAngleSteradians: number;
    resolvedSourceDiscsExcluded: true;
    validity: DirectionalLightingValidity;
}

export interface DirectionalSkyPrefilterInput {
    altitudeKm: number;
    localUpDirection?: DirectionalLightingVec3;
    samples: readonly DirectionalRadianceQuadratureSample[];
    sources: readonly DirectionalSkySourceGeometry[];
    /** Must be true: direct Sun/Moon discs are retained as separate TOA sources. */
    resolvedSourceDiscsExcluded: boolean;
    diffuseSharpness?: number;
    horizonWidthRadians?: number;
}

/** Integral over 4pi of exp(k * (dot(axis, direction) - 1)). */
export const normalizedSphericalGaussianIntegral = (sharpnessInput: number) => {
    const sharpness = clamp(sharpnessInput, 0, 128);
    if (sharpness < 1e-6) return 4 * PI;
    return TAU * -Math.expm1(-2 * sharpness) / sharpness;
};

export const evaluateNormalizedSphericalGaussian = (
    axis: DirectionalLightingVec3,
    direction: DirectionalLightingVec3,
    sharpnessInput: number,
) => {
    const sharpness = clamp(sharpnessInput, 0, 128);
    return Math.exp(sharpness * (clamp(
        dot3(normalize3(axis), normalize3(direction)), -1, 1) - 1));
};

const horizonKernel = (
    localUp: DirectionalLightingVec3,
    direction: DirectionalLightingVec3,
    widthRadiansInput: number,
) => {
    const width = clamp(widthRadiansInput, PI / 360, PI * 0.45);
    const elevation = Math.asin(clamp(
        dot3(normalize3(localUp), normalize3(direction)), -1, 1));
    return Math.exp(-0.5 * (elevation / width) ** 2);
};

const horizonKernelIntegral = (widthRadians: number) => {
    const samples = 16_384;
    let integral = 0;
    for (let index = 0; index < samples; index += 1) {
        const verticalCosine = -1 + 2 * (index + 0.5) / samples;
        const elevation = Math.asin(verticalCosine);
        integral += Math.exp(-0.5 * (elevation / widthRadians) ** 2);
    }
    return Math.max(1e-12, integral * 2 / samples * TAU);
};

const tangentFrame = (upInput: DirectionalLightingVec3) => {
    const up = normalize3(upInput);
    const reference: DirectionalLightingVec3 = Math.abs(up[1]) < 0.86
        ? [0, 1, 0]
        : [1, 0, 0];
    const east = normalize3(cross3(reference, up));
    const north = normalize3(cross3(up, east));
    return { up, east, north };
};

const frameDirection = (
    frame: ReturnType<typeof tangentFrame>,
    elevationRadians: number,
    azimuthRadians: number,
): DirectionalLightingVec3 => normalize3(add3(
    scale3(frame.up, Math.sin(elevationRadians)),
    add3(
        scale3(frame.east, Math.cos(elevationRadians) * Math.cos(azimuthRadians)),
        scale3(frame.north, Math.cos(elevationRadians) * Math.sin(azimuthRadians)),
    ),
));

const fixedDiffuseAxes = (up: DirectionalLightingVec3) => {
    const frame = tangentFrame(up);
    const goldenAngle = PI * (3 - Math.sqrt(5));
    return Array.from({ length: DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT }, (_, index) => {
        const vertical = 1 - 2 * (index + 0.5) /
            DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT;
        return frameDirection(frame, Math.asin(vertical), index * goldenAngle);
    });
};

const addScaledEnergy = (
    target: DirectionalLightingVec3,
    source: DirectionalLightingVec3,
    scale: number,
): DirectionalLightingVec3 => [
    target[0] + source[0] * scale,
    target[1] + source[1] * scale,
    target[2] + source[2] * scale,
];

/**
 * Energy-conserving positive prefilter. Input quadrature energy is partitioned
 * among normalized SRBFs; unlike truncated SH, reconstruction cannot become
 * negative and the sum of lobe integrals exactly retains the input integral.
 */
export const prefilterDirectionalSkyRadiance = (
    input: DirectionalSkyPrefilterInput,
): DirectionalSkyRadianceNode => {
    const reasons: string[] = [];
    const up = normalize3(input.localUpDirection ?? [0, 1, 0]);
    if (length3(input.localUpDirection ?? [0, 1, 0]) < 1e-8) {
        reasons.push("directional-sky-local-up-is-empty");
    }
    if (!input.resolvedSourceDiscsExcluded) {
        reasons.push("resolved-source-discs-must-remain-separate-toa-sources");
    }
    if (!Number.isFinite(input.altitudeKm) || input.altitudeKm < 0 ||
        input.altitudeKm > 120) {
        reasons.push("directional-sky-altitude-is-outside-supported-shell");
    }
    if (input.samples.length < 16) reasons.push("directional-sky-quadrature-is-empty");
    if (input.sources.length > DIRECTIONAL_SKY_MAX_SOURCE_LOBES) {
        reasons.push("directional-sky-source-count-exceeds-bounded-layout");
    }
    if (new Set(input.sources.map(({ kind }) => kind)).size !== input.sources.length) {
        reasons.push("directional-sky-source-kinds-are-duplicated");
    }

    const diffuseSharpness = clamp(input.diffuseSharpness ?? 3.25, 0.25, 12);
    const horizonWidth = clamp(input.horizonWidthRadians ?? PI / 14,
        PI / 180, PI / 3);
    const axes = fixedDiffuseAxes(up);
    const diffuseEnergy: DirectionalLightingVec3[] = axes.map(() => [0, 0, 0]);
    const sources = input.sources.slice(0, DIRECTIONAL_SKY_MAX_SOURCE_LOBES).map(
        (source) => ({
            ...source,
            inputDirectionLength: length3(source.direction),
            direction: normalize3(source.direction),
            reconstructionSharpness: clamp(source.reconstructionSharpness ??
                (source.kind === "sun" ? 26 : 18), 4, 96),
        }),
    );
    for (const source of sources) {
        if (source.inputDirectionLength < 1e-8) {
            reasons.push(`${source.kind}-direction-is-empty`);
        }
    }
    const sourceEnergy: DirectionalLightingVec3[] = sources.map(() => [0, 0, 0]);
    let horizonEnergy: DirectionalLightingVec3 = [0, 0, 0];
    let upperIrradiance: DirectionalLightingVec3 = [0, 0, 0];
    let lowerIrradiance: DirectionalLightingVec3 = [0, 0, 0];
    let upperIntegral: DirectionalLightingVec3 = [0, 0, 0];
    let lowerIntegral: DirectionalLightingVec3 = [0, 0, 0];
    let totalIntegral: DirectionalLightingVec3 = [0, 0, 0];
    let solidAngle = 0;

    // Explicit lobes receive only measured angular contrast. Merely knowing
    // the source or horizon direction must not create a recognizable stamp in
    // an isotropic/overcast field.
    let globalLuminanceIntegral = 0;
    let validSolidAngle = 0;
    let horizonNearLuminance = 0;
    let horizonNearWeight = 0;
    const sourceNearLuminance = sources.map(() => 0);
    const sourceNearWeight = sources.map(() => 0);
    const sourceOuterLuminance = sources.map(() => 0);
    const sourceOuterWeight = sources.map(() => 0);
    for (const sample of input.samples) {
        if (!(sample.solidAngleSteradians > 0) ||
            !Number.isFinite(sample.solidAngleSteradians)) continue;
        const direction = normalize3(sample.direction);
        const radiance = bounded3(sample.radianceRgb);
        const sampleLuminance = luminance3(radiance);
        const weight = sample.solidAngleSteradians;
        globalLuminanceIntegral += sampleLuminance * weight;
        validSolidAngle += weight;
        const horizonWeight = horizonKernel(up, direction, horizonWidth * 1.55);
        horizonNearLuminance += sampleLuminance * weight * horizonWeight;
        horizonNearWeight += weight * horizonWeight;
        sources.forEach((source, index) => {
            if (!source.enabled) return;
            const near = evaluateNormalizedSphericalGaussian(
                source.direction, direction, source.reconstructionSharpness * 0.42);
            const outer = evaluateNormalizedSphericalGaussian(
                source.direction, direction, source.reconstructionSharpness * 0.08);
            sourceNearLuminance[index] += sampleLuminance * weight * near;
            sourceNearWeight[index] += weight * near;
            sourceOuterLuminance[index] += sampleLuminance * weight * outer;
            sourceOuterWeight[index] += weight * outer;
        });
    }
    const globalLuminance = globalLuminanceIntegral / Math.max(1e-12, validSolidAngle);
    const horizonAverage = horizonNearLuminance / Math.max(1e-12, horizonNearWeight);
    const horizonContrast = saturate(
        (horizonAverage - globalLuminance) / Math.max(1e-8, horizonAverage));
    const sourceContrasts = sources.map((_, index) => {
        const near = sourceNearLuminance[index] /
            Math.max(1e-12, sourceNearWeight[index]);
        const outer = sourceOuterLuminance[index] /
            Math.max(1e-12, sourceOuterWeight[index]);
        return saturate((near - outer) / Math.max(1e-8, near));
    });

    for (const sample of input.samples) {
        if (!(sample.solidAngleSteradians > 0) ||
            !Number.isFinite(sample.solidAngleSteradians)) {
            reasons.push("directional-sky-sample-solid-angle-is-invalid");
            continue;
        }
        if (!finiteNonnegative3(sample.radianceRgb)) {
            reasons.push("directional-sky-sample-radiance-is-invalid");
        }
        if (length3(sample.direction) < 1e-8) {
            reasons.push("directional-sky-sample-direction-is-empty");
        }
        const direction = normalize3(sample.direction);
        const radiance = bounded3(sample.radianceRgb);
        const weight = sample.solidAngleSteradians;
        const energy = scale3(radiance, weight);
        const verticalCosine = clamp(dot3(up, direction), -1, 1);
        totalIntegral = add3(totalIntegral, energy);
        solidAngle += weight;
        if (verticalCosine >= 0) {
            upperIntegral = add3(upperIntegral, energy);
            upperIrradiance = addScaledEnergy(
                upperIrradiance, radiance, weight * verticalCosine);
        } else {
            lowerIntegral = add3(lowerIntegral, energy);
            lowerIrradiance = addScaledEnergy(
                lowerIrradiance, radiance, weight * -verticalCosine);
        }

        const sourcePartitionWeights = sources.map((source, sourceIndex) => source.enabled
            ? 0.72 * sourceContrasts[sourceIndex] *
                evaluateNormalizedSphericalGaussian(
                source.direction, direction, source.reconstructionSharpness * 0.42)
            : 0);
        const horizonPartitionWeight = 0.46 * horizonContrast * horizonKernel(
            up, direction, horizonWidth * 1.55);
        const categoryTotal = 1 + horizonPartitionWeight +
            sourcePartitionWeights.reduce((sum, value) => sum + value, 0);
        const diffuseCategory = 1 / categoryTotal;
        const diffuseWeights = axes.map((axis) =>
            evaluateNormalizedSphericalGaussian(axis, direction, diffuseSharpness));
        const diffuseWeightTotal = Math.max(1e-12,
            diffuseWeights.reduce((sum, value) => sum + value, 0));
        diffuseWeights.forEach((basisWeight, index) => {
            diffuseEnergy[index] = addScaledEnergy(
                diffuseEnergy[index], energy,
                diffuseCategory * basisWeight / diffuseWeightTotal,
            );
        });
        horizonEnergy = addScaledEnergy(
            horizonEnergy, energy, horizonPartitionWeight / categoryTotal);
        sourcePartitionWeights.forEach((sourceWeight, index) => {
            sourceEnergy[index] = addScaledEnergy(
                sourceEnergy[index], energy, sourceWeight / categoryTotal);
        });
    }

    if (Math.abs(solidAngle - 4 * PI) > 4 * PI * 0.025) {
        reasons.push("directional-sky-quadrature-does-not-cover-full-sphere");
    }

    const lobes: DirectionalSkyRadianceLobe[] = axes.map((axis, index) => ({
        kind: "diffuse",
        axis,
        shapeParameter: diffuseSharpness,
        integratedRadianceRgb: diffuseEnergy[index],
        normalizationSteradians: normalizedSphericalGaussianIntegral(diffuseSharpness),
    }));
    lobes.push({
        kind: "horizon",
        axis: up,
        shapeParameter: horizonWidth,
        integratedRadianceRgb: horizonEnergy,
        normalizationSteradians: horizonKernelIntegral(horizonWidth),
    });
    sources.forEach((source, index) => lobes.push({
        kind: source.kind === "sun" ? "sunward" : "moonward",
        axis: source.direction,
        shapeParameter: source.reconstructionSharpness,
        integratedRadianceRgb: sourceEnergy[index],
        normalizationSteradians: normalizedSphericalGaussianIntegral(
            source.reconstructionSharpness),
    }));

    const reconstructedIntegral = lobes.reduce<DirectionalLightingVec3>(
        (sum, lobe) => add3(sum, lobe.integratedRadianceRgb), [0, 0, 0]);
    for (let channel = 0; channel < 3; channel += 1) {
        const tolerance = Math.max(1e-10, totalIntegral[channel] * 2e-12);
        if (Math.abs(reconstructedIntegral[channel] - totalIntegral[channel]) > tolerance) {
            reasons.push("directional-sky-prefilter-failed-energy-conservation");
            break;
        }
    }

    return {
        schema: DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA,
        altitudeKm: clamp(input.altitudeKm, 0, 120),
        localUpDirection: up,
        lobes,
        upperHemisphereIrradianceRgb: upperIrradiance,
        lowerHemisphereIrradianceRgb: lowerIrradiance,
        upperHemisphereRadianceIntegralRgb: upperIntegral,
        lowerHemisphereRadianceIntegralRgb: lowerIntegral,
        fullSphereRadianceIntegralRgb: totalIntegral,
        quadratureSolidAngleSteradians: solidAngle,
        resolvedSourceDiscsExcluded: true,
        validity: { valid: reasons.length === 0, reasons: [...new Set(reasons)] },
    };
};

export const evaluateDirectionalSkyLobe = (
    lobe: DirectionalSkyRadianceLobe,
    direction: DirectionalLightingVec3,
): DirectionalLightingVec3 => {
    const kernel = lobe.kind === "horizon"
        ? horizonKernel(lobe.axis, direction, lobe.shapeParameter)
        : evaluateNormalizedSphericalGaussian(
            lobe.axis, direction, lobe.shapeParameter);
    return scale3(
        lobe.integratedRadianceRgb,
        kernel / Math.max(1e-12, lobe.normalizationSteradians),
    );
};

export const evaluateDirectionalSkyNode = (
    node: DirectionalSkyRadianceNode,
    direction: DirectionalLightingVec3,
): DirectionalLightingVec3 => {
    if (!node.validity.valid) return [0, 0, 0];
    return node.lobes.reduce<DirectionalLightingVec3>(
        (radiance, lobe) => add3(radiance,
            evaluateDirectionalSkyLobe(lobe, direction)),
        [0, 0, 0],
    );
};

export interface DirectionalSkyRadianceProfile {
    schema: typeof DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA;
    nodes: readonly DirectionalSkyRadianceNode[];
    validity: DirectionalLightingValidity;
}

export const createDirectionalSkyRadianceProfile = (
    nodesInput: readonly DirectionalSkyRadianceNode[],
): DirectionalSkyRadianceProfile => {
    const reasons: string[] = [];
    if (nodesInput.length === 0) reasons.push("directional-sky-profile-is-empty");
    if (nodesInput.length > DIRECTIONAL_SKY_MAX_ALTITUDE_NODES) {
        reasons.push("directional-sky-profile-exceeds-bounded-altitude-layout");
    }
    for (let index = 0; index < nodesInput.length; index += 1) {
        if (!nodesInput[index].validity.valid) {
            reasons.push(`directional-sky-node-${index}-is-invalid`);
        }
        if (index > 0 && !(nodesInput[index].altitudeKm >
            nodesInput[index - 1].altitudeKm)) {
            reasons.push("directional-sky-altitudes-must-be-strictly-increasing");
        }
    }
    return {
        schema: DIRECTIONAL_ATMOSPHERE_CLOUD_SCHEMA,
        nodes: nodesInput.slice(0, DIRECTIONAL_SKY_MAX_ALTITUDE_NODES),
        validity: { valid: reasons.length === 0, reasons },
    };
};

export interface DirectionalSkyProfileSample {
    radianceRgb: DirectionalLightingVec3;
    upperHemisphereIrradianceRgb: DirectionalLightingVec3;
    lowerHemisphereIrradianceRgb: DirectionalLightingVec3;
}

export const sampleDirectionalSkyRadianceProfile = (
    profile: DirectionalSkyRadianceProfile,
    altitudeKm: number,
    direction: DirectionalLightingVec3,
): DirectionalSkyProfileSample => {
    if (!profile.validity.valid || profile.nodes.length === 0) {
        return { radianceRgb: [0, 0, 0], upperHemisphereIrradianceRgb: [0, 0, 0],
            lowerHemisphereIrradianceRgb: [0, 0, 0] };
    }
    let upperIndex = profile.nodes.findIndex((node) => node.altitudeKm >= altitudeKm);
    if (upperIndex < 0) upperIndex = profile.nodes.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const lower = profile.nodes[lowerIndex];
    const upper = profile.nodes[upperIndex];
    const amount = lower === upper ? 0 : saturate(
        (altitudeKm - lower.altitudeKm) /
        Math.max(1e-8, upper.altitudeKm - lower.altitudeKm));
    return {
        radianceRgb: mix3(
            evaluateDirectionalSkyNode(lower, direction),
            evaluateDirectionalSkyNode(upper, direction),
            amount,
        ),
        upperHemisphereIrradianceRgb: mix3(
            lower.upperHemisphereIrradianceRgb,
            upper.upperHemisphereIrradianceRgb,
            amount,
        ),
        lowerHemisphereIrradianceRgb: mix3(
            lower.lowerHemisphereIrradianceRgb,
            upper.lowerHemisphereIrradianceRgb,
            amount,
        ),
    };
};

// ---------------------------------------------------------------------------
// Passive cloud transfer and ground bounce
// ---------------------------------------------------------------------------

export interface PassiveCloudTransfer {
    transmittanceRgb: DirectionalLightingVec3;
    scatteredTowardReceiverRgb: DirectionalLightingVec3;
    absorptionOrOtherDirectionRgb: DirectionalLightingVec3;
    validity: DirectionalLightingValidity;
}

export const createPassiveCloudTransfer = (
    transmittanceInput: DirectionalLightingVec3,
    scatteredTowardReceiverInput: DirectionalLightingVec3 = [0, 0, 0],
): PassiveCloudTransfer => {
    const reasons: string[] = [];
    if (!finiteNonnegative3(transmittanceInput) ||
        !finiteNonnegative3(scatteredTowardReceiverInput)) {
        reasons.push("cloud-transfer-components-must-be-finite-and-nonnegative");
    }
    const transmittance = boundedUnit3(transmittanceInput);
    const scattered = boundedUnit3(scatteredTowardReceiverInput);
    const boundedTransmittance: number[] = [];
    const boundedScattered: number[] = [];
    const remainder: number[] = [];
    for (let channel = 0; channel < 3; channel += 1) {
        const total = transmittance[channel] + scattered[channel];
        if (total > 1 + 1e-7) reasons.push("cloud-transfer-exceeds-passive-energy-budget");
        const normalization = Math.max(1, total);
        boundedTransmittance.push(transmittance[channel] / normalization);
        boundedScattered.push(scattered[channel] / normalization);
        remainder.push(Math.max(0, 1 - total / normalization));
    }
    return {
        transmittanceRgb: boundedTransmittance as unknown as DirectionalLightingVec3,
        scatteredTowardReceiverRgb: boundedScattered as unknown as
            DirectionalLightingVec3,
        absorptionOrOtherDirectionRgb: remainder as unknown as DirectionalLightingVec3,
        validity: { valid: reasons.length === 0, reasons: [...new Set(reasons)] },
    };
};

const effectivePassiveTransfer = (
    transfer: PassiveCloudTransfer,
): DirectionalLightingVec3 => min3([1, 1, 1], add3(
    transfer.transmittanceRgb,
    transfer.scatteredTowardReceiverRgb,
));

export interface GroundBounceDirectSource {
    /** Already attenuated from TOA to ground by atmosphere exactly once. */
    atmosphereTransportedIrradianceRgb: DirectionalLightingVec3;
    cloudTransfer: PassiveCloudTransfer;
}

export interface CloudShadowedGroundBounceInput {
    groundAlbedoRgb: DirectionalLightingVec3;
    atmosphereUpperSkyIrradianceRgb: DirectionalLightingVec3;
    diffuseCloudTransfer: PassiveCloudTransfer;
    directSources: readonly GroundBounceDirectSource[];
    groundToSampleAtmosphereTransmittanceRgb: DirectionalLightingVec3;
    /** Projected solid-angle fraction of visible ground, in [0,1]. */
    groundViewFactor: number;
}

export interface CloudShadowedGroundBounceSample {
    incidentGroundIrradianceRgb: DirectionalLightingVec3;
    reflectedGroundFluxRgb: DirectionalLightingVec3;
    lambertianGroundRadianceRgb: DirectionalLightingVec3;
    lowerHemisphereIrradianceAtSampleRgb: DirectionalLightingVec3;
    validity: DirectionalLightingValidity;
}

export const evaluateCloudShadowedGroundBounce = (
    input: CloudShadowedGroundBounceInput,
): CloudShadowedGroundBounceSample => {
    const reasons: string[] = [];
    if (!finiteNonnegative3(input.groundAlbedoRgb) ||
        input.groundAlbedoRgb.some((value) => value > 1)) {
        reasons.push("ground-albedo-must-be-passive");
    }
    if (!finiteNonnegative3(input.atmosphereUpperSkyIrradianceRgb)) {
        reasons.push("upper-sky-irradiance-is-invalid");
    }
    if (!input.diffuseCloudTransfer.validity.valid ||
        input.directSources.some(({ cloudTransfer }) => !cloudTransfer.validity.valid)) {
        reasons.push("ground-bounce-cloud-transfer-is-invalid");
    }
    if (input.directSources.length > 2) {
        reasons.push("ground-bounce-source-count-exceeds-bounded-layout");
    }
    if (!finiteNonnegative3(input.groundToSampleAtmosphereTransmittanceRgb) ||
        input.groundToSampleAtmosphereTransmittanceRgb.some((value) => value > 1)) {
        reasons.push("ground-to-sample-transmittance-is-invalid");
    }
    if (!Number.isFinite(input.groundViewFactor) || input.groundViewFactor < 0 ||
        input.groundViewFactor > 1) {
        reasons.push("ground-view-factor-is-invalid");
    }
    let incident = mul3(
        bounded3(input.atmosphereUpperSkyIrradianceRgb),
        effectivePassiveTransfer(input.diffuseCloudTransfer),
    );
    for (const source of input.directSources.slice(0, 2)) {
        if (!finiteNonnegative3(source.atmosphereTransportedIrradianceRgb)) {
            reasons.push("ground-direct-source-irradiance-is-invalid");
        }
        incident = add3(incident, mul3(
            bounded3(source.atmosphereTransportedIrradianceRgb),
            source.cloudTransfer.transmittanceRgb,
        ));
    }
    const reflectedFlux = mul3(incident, boundedUnit3(input.groundAlbedoRgb));
    const groundRadiance = scale3(reflectedFlux, 1 / PI);
    const lowerAtSample = scale3(mul3(
        reflectedFlux,
        boundedUnit3(input.groundToSampleAtmosphereTransmittanceRgb),
    ), saturate(input.groundViewFactor));
    return {
        incidentGroundIrradianceRgb: incident,
        reflectedGroundFluxRgb: reflectedFlux,
        lambertianGroundRadianceRgb: groundRadiance,
        lowerHemisphereIrradianceAtSampleRgb: lowerAtSample,
        validity: { valid: reasons.length === 0, reasons: [...new Set(reasons)] },
    };
};

// ---------------------------------------------------------------------------
// Cloud transmittance injected into aerial perspective / fog transport
// ---------------------------------------------------------------------------

export interface CloudCoupledAerialMedium {
    extinctionRgbPerKm: DirectionalLightingVec3;
    scatteringRgbPerKm: DirectionalLightingVec3;
}

export interface CloudCoupledAerialDirectSource {
    /** Atmosphere-transported TOA irradiance at this world sample. */
    atmosphereTransportedIrradianceRgb: DirectionalLightingVec3;
    /** Normalized phase value toward the camera, in sr^-1. */
    phaseRgbPerSteradian: DirectionalLightingVec3;
    /** Only transmittance is used for the still-collimated direct source. */
    cloudTransfer: PassiveCloudTransfer;
}

export interface CloudCoupledAerialInput {
    medium: CloudCoupledAerialMedium;
    /** Integral of directional diffuse radiance times phase over solid angle. */
    phaseIntegratedDiffuseRadianceRgb: DirectionalLightingVec3;
    diffuseCloudTransfer: PassiveCloudTransfer;
    directSources: readonly CloudCoupledAerialDirectSource[];
}

export interface CloudCoupledAerialSourceSample {
    extinctionRgbPerKm: DirectionalLightingVec3;
    sourceRadianceCoefficientRgbPerKm: DirectionalLightingVec3;
    unshadowedSourceRadianceCoefficientRgbPerKm: DirectionalLightingVec3;
    removedByCloudRgbPerKm: DirectionalLightingVec3;
    validity: DirectionalLightingValidity;
}

export const evaluateCloudCoupledAerialSource = (
    input: CloudCoupledAerialInput,
): CloudCoupledAerialSourceSample => {
    const reasons: string[] = [];
    if (!finiteNonnegative3(input.medium.extinctionRgbPerKm) ||
        !finiteNonnegative3(input.medium.scatteringRgbPerKm)) {
        reasons.push("aerial-medium-coefficients-are-invalid");
    }
    for (let channel = 0; channel < 3; channel += 1) {
        if (input.medium.scatteringRgbPerKm[channel] >
            input.medium.extinctionRgbPerKm[channel] + 1e-9) {
            reasons.push("aerial-medium-scattering-exceeds-extinction");
            break;
        }
    }
    if (!finiteNonnegative3(input.phaseIntegratedDiffuseRadianceRgb)) {
        reasons.push("phase-integrated-diffuse-radiance-is-invalid");
    }
    if (!input.diffuseCloudTransfer.validity.valid ||
        input.directSources.some(({ cloudTransfer }) => !cloudTransfer.validity.valid)) {
        reasons.push("aerial-cloud-transfer-is-invalid");
    }
    if (input.directSources.length > 2) {
        reasons.push("aerial-source-count-exceeds-bounded-layout");
    }
    let unshadowedIncident = bounded3(input.phaseIntegratedDiffuseRadianceRgb);
    let coupledIncident = mul3(
        unshadowedIncident,
        effectivePassiveTransfer(input.diffuseCloudTransfer),
    );
    for (const source of input.directSources.slice(0, 2)) {
        if (!finiteNonnegative3(source.atmosphereTransportedIrradianceRgb) ||
            !finiteNonnegative3(source.phaseRgbPerSteradian)) {
            reasons.push("aerial-direct-source-is-invalid");
        }
        const direct = mul3(
            bounded3(source.atmosphereTransportedIrradianceRgb),
            bounded3(source.phaseRgbPerSteradian),
        );
        unshadowedIncident = add3(unshadowedIncident, direct);
        coupledIncident = add3(coupledIncident,
            mul3(direct, source.cloudTransfer.transmittanceRgb));
    }
    const scattering = min3(
        bounded3(input.medium.scatteringRgbPerKm),
        bounded3(input.medium.extinctionRgbPerKm),
    );
    const coupledCoefficient = mul3(scattering, coupledIncident);
    const unshadowedCoefficient = mul3(scattering, unshadowedIncident);
    return {
        extinctionRgbPerKm: bounded3(input.medium.extinctionRgbPerKm),
        sourceRadianceCoefficientRgbPerKm: coupledCoefficient,
        unshadowedSourceRadianceCoefficientRgbPerKm: unshadowedCoefficient,
        removedByCloudRgbPerKm: max3([0, 0, 0], [
            unshadowedCoefficient[0] - coupledCoefficient[0],
            unshadowedCoefficient[1] - coupledCoefficient[1],
            unshadowedCoefficient[2] - coupledCoefficient[2],
        ]),
        validity: { valid: reasons.length === 0, reasons: [...new Set(reasons)] },
    };
};

export interface CloudCoupledAerialStep {
    radianceRgb: DirectionalLightingVec3;
    transmittanceRgb: DirectionalLightingVec3;
}

export const integrateCloudCoupledAerialStep = (
    source: CloudCoupledAerialSourceSample,
    distanceKm: number,
): CloudCoupledAerialStep => {
    const distance = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
    const transmittance = map3(source.extinctionRgbPerKm,
        (extinction) => Math.exp(-extinction * distance));
    const radiance = [0, 1, 2].map((channel) => {
        const extinction = source.extinctionRgbPerKm[channel];
        if (extinction <= 1e-10) {
            return source.sourceRadianceCoefficientRgbPerKm[channel] * distance;
        }
        return source.sourceRadianceCoefficientRgbPerKm[channel] *
            (1 - transmittance[channel]) / extinction;
    }) as unknown as DirectionalLightingVec3;
    return { radianceRgb: radiance, transmittanceRgb: transmittance };
};

// ---------------------------------------------------------------------------
// Bounded cache layout and invalidation domains
// ---------------------------------------------------------------------------

const rgba16Bytes = 8;
const directionalRadianceBytes = 2 *
    (DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT + 1 + DIRECTIONAL_SKY_MAX_SOURCE_LOBES) *
    DIRECTIONAL_SKY_MAX_ALTITUDE_NODES * rgba16Bytes;
const hemisphereIrradianceBytes = 2 * DIRECTIONAL_SKY_MAX_ALTITUDE_NODES *
    rgba16Bytes;
const cloudShadowBytes = 2 * 3 * 128 * 128 * rgba16Bytes;
const aerialCouplingBytes = 32 * 18 * 16 * 2 * rgba16Bytes;

export const DIRECTIONAL_LIGHTING_GPU_CACHE_LAYOUT = Object.freeze({
    directionalRadiance: Object.freeze({
        format: "rgba16float",
        width: 2 * (DIRECTIONAL_SKY_DIFFUSE_LOBE_COUNT + 1 +
            DIRECTIONAL_SKY_MAX_SOURCE_LOBES),
        height: DIRECTIONAL_SKY_MAX_ALTITUDE_NODES,
        bytes: directionalRadianceBytes,
    }),
    hemisphereIrradiance: Object.freeze({
        format: "rgba16float", width: 2,
        height: DIRECTIONAL_SKY_MAX_ALTITUDE_NODES,
        bytes: hemisphereIrradianceBytes,
    }),
    cloudShadowCascades: Object.freeze({
        format: "rgba16float", sourceCount: 2, cascadesPerSource: 3,
        resolution: 128, bytes: cloudShadowBytes,
    }),
    aerialCouplingFroxels: Object.freeze({
        format: "rgba16float", width: 32, height: 18, depth: 16,
        sourceCount: 2, bytes: aerialCouplingBytes,
    }),
    totalBytes: directionalRadianceBytes + hemisphereIrradianceBytes +
        cloudShadowBytes + aerialCouplingBytes,
});

/** Two aligned RGBA texels; a negative shape value identifies a horizon lobe. */
export const packDirectionalSkyRadianceLobe = (
    lobe: DirectionalSkyRadianceLobe,
): Float32Array => new Float32Array([
    ...lobe.axis,
    lobe.kind === "horizon" ? -lobe.shapeParameter : lobe.shapeParameter,
    ...lobe.integratedRadianceRgb,
    lobe.normalizationSteradians,
]);

export interface DirectionalLightingDependencyKeys {
    atmosphereOpticalKey: string;
    sourceGeometryKey: string;
    sourceRadiometryKey: string;
    cloudFieldKey: string;
    groundMaterialKey: string;
    cameraFroxelKey: string;
    exposureKey: string;
}

export interface DirectionalLightingInvalidation {
    directionalSky: boolean;
    cloudShadowCascades: boolean;
    hemisphereIrradiance: boolean;
    groundBounce: boolean;
    aerialCouplingFroxels: boolean;
    exposureOnly: boolean;
}

export const resolveDirectionalLightingInvalidation = (
    previous: DirectionalLightingDependencyKeys | undefined,
    next: DirectionalLightingDependencyKeys,
): DirectionalLightingInvalidation => {
    if (!previous) return {
        directionalSky: true,
        cloudShadowCascades: true,
        hemisphereIrradiance: true,
        groundBounce: true,
        aerialCouplingFroxels: true,
        exposureOnly: false,
    };
    const optical = previous.atmosphereOpticalKey !== next.atmosphereOpticalKey;
    const sourceGeometry = previous.sourceGeometryKey !== next.sourceGeometryKey;
    const sourceRadiometry = previous.sourceRadiometryKey !== next.sourceRadiometryKey;
    const cloud = previous.cloudFieldKey !== next.cloudFieldKey;
    const ground = previous.groundMaterialKey !== next.groundMaterialKey;
    const camera = previous.cameraFroxelKey !== next.cameraFroxelKey;
    const exposure = previous.exposureKey !== next.exposureKey;
    const physicalChange = optical || sourceGeometry || sourceRadiometry || cloud ||
        ground || camera;
    return {
        directionalSky: optical || sourceGeometry || sourceRadiometry,
        cloudShadowCascades: sourceGeometry || cloud,
        hemisphereIrradiance: optical || sourceGeometry || sourceRadiometry,
        groundBounce: optical || sourceGeometry || sourceRadiometry || cloud || ground,
        aerialCouplingFroxels: sourceGeometry || cloud || camera,
        exposureOnly: exposure && !physicalChange,
    };
};

export const DIRECTIONAL_LIGHTING_PARITY_FIXTURES = Object.freeze({
    sphericalGaussian: Object.freeze({ cosine: 0.73, sharpness: 5.25 }),
    horizon: Object.freeze({ verticalCosine: 0.12, widthRadians: 0.18 }),
    aerial: Object.freeze({ extinctionPerKm: 0.24,
        sourceCoefficientPerKm: 0.035, distanceKm: 1.7 }),
});

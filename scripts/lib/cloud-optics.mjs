import { createHash } from "node:crypto";

/**
 * Deterministic, redistribution-safe cloud optical property generator.
 *
 * Liquid rows are calculated from a polydisperse Mie solution. Ice rows are
 * original, energy-normalized analytic approximations whose habit and
 * roughness controls are informed by the angular behavior reported by Yang et
 * al. (2013). No third-party numerical tables are embedded or redistributed.
 */

export const CLOUD_OPTICS_SCHEMA = "elements-cloud-optics";
export const CLOUD_OPTICS_VERSION = 1;
export const CLOUD_OPTICS_GENERATOR_VERSION = "1.1.0";
export const CLOUD_OPTICS_ANGLE_SAMPLES = 512;
export const CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS = 32;
export const CLOUD_OPTICS_LIQUID_RADII_MICRONS = [4, 6, 8, 10, 14, 20, 30];
export const CLOUD_OPTICS_ICE_RADII_MICRONS = [10, 20, 35, 55, 90];
export const CLOUD_OPTICS_ICE_HABITS = ["general", "aggregate", "plate", "column"];
export const CLOUD_OPTICS_ROUGHNESSES = ["smooth", "moderate", "severe"];

const PI = Math.PI;
const TAU = 2 * PI;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const mix = (low, high, amount) => low + (high - low) * amount;
const radians = (degrees) => degrees * PI / 180;

const WAVELENGTHS_MICRONS = [0.42, 0.46, 0.50, 0.54, 0.58, 0.63, 0.68];
const DROPLET_RADIUS_RATIOS = [0.42, 0.62, 0.82, 1.0, 1.2, 1.48, 1.9];
const EFFECTIVE_VARIANCE = 0.10;

const gaussian = (value, center, sigma) => {
    const distance = (value - center) / sigma;
    return Math.exp(-0.5 * distance * distance);
};

/** Smooth, positive camera-primary approximation used only for band integration. */
const visibleBandWeights = (wavelengthMicrons) => {
    // The Planck term supplies a smooth terrestrial daylight illuminant. The
    // response functions deliberately remain positive, avoiding negative RGB
    // radiances while tracking broad linear-display primaries.
    const c2 = 14387.76877;
    const temperature = 5778;
    const solar = 1 / (
        wavelengthMicrons ** 5 *
        Math.expm1(c2 / (wavelengthMicrons * temperature))
    );
    return [
        solar * (gaussian(wavelengthMicrons, 0.61, 0.058) + 0.12 * gaussian(wavelengthMicrons, 0.69, 0.035)),
        solar * gaussian(wavelengthMicrons, 0.545, 0.050),
        solar * (gaussian(wavelengthMicrons, 0.455, 0.046) + 0.08 * gaussian(wavelengthMicrons, 0.515, 0.055)),
    ];
};

// Original smooth fit to measured visible-water dispersion. Absorption by
// pure liquid water is negligible at cloud path lengths per scattering event;
// a small conservative absorption floor is applied when producing SSA.
const waterRefractiveIndex = (wavelengthMicrons) =>
    1.3262 + 0.00156 / wavelengthMicrons ** 2 + 0.000045 / wavelengthMicrons ** 4;

const gammaNumberDensity = (radius, effectiveRadius, variance = EFFECTIVE_VARIANCE) => {
    const exponent = 1 / variance - 3;
    return radius ** exponent * Math.exp(-radius / (effectiveRadius * variance));
};

const radiusQuadrature = (effectiveRadius) => {
    const radii = DROPLET_RADIUS_RATIOS.map((ratio) => ratio * effectiveRadius);
    return radii.map((radius, index) => {
        const lower = index === 0 ? radius * 0.72 : (radii[index - 1] + radius) * 0.5;
        const upper = index === radii.length - 1 ? radius * 1.20 : (radius + radii[index + 1]) * 0.5;
        return {
            radius,
            numberWeight: gammaNumberDensity(radius, effectiveRadius) * (upper - lower),
        };
    });
};

const complexDivide = (ar, ai, br, bi) => {
    const denominator = br * br + bi * bi;
    return [
        (ar * br + ai * bi) / denominator,
        (ai * br - ar * bi) / denominator,
    ];
};

/** Bohren-Huffman Mie coefficients for a nonabsorbing sphere. */
export const mieSphere = (radiusMicrons, wavelengthMicrons, refractiveIndex, cosines) => {
    const x = TAU * radiusMicrons / wavelengthMicrons;
    const mx = refractiveIndex * x;
    const order = Math.max(2, Math.round(x + 4 * Math.cbrt(x) + 2));
    const downwardOrder = Math.max(order + 16, Math.ceil(mx) + 16);
    const logarithmicDerivative = new Float64Array(downwardOrder + 1);
    for (let n = downwardOrder; n > 0; n -= 1) {
        const nx = n / mx;
        logarithmicDerivative[n - 1] = nx - 1 / (logarithmicDerivative[n] + nx);
    }

    const aReal = new Float64Array(order + 1);
    const aImag = new Float64Array(order + 1);
    const bReal = new Float64Array(order + 1);
    const bImag = new Float64Array(order + 1);
    let psiPrevious = Math.sin(x);
    let psi = Math.sin(x) / x - Math.cos(x);
    let chiPrevious = Math.cos(x);
    let chi = Math.cos(x) / x + Math.sin(x);
    let extinctionSum = 0;
    let scatteringSum = 0;

    for (let n = 1; n <= order; n += 1) {
        const nOverX = n / x;
        const da = logarithmicDerivative[n] / refractiveIndex + nOverX;
        const db = refractiveIndex * logarithmicDerivative[n] + nOverX;
        const [ar, ai] = complexDivide(
            da * psi - psiPrevious,
            0,
            da * psi - psiPrevious,
            -(da * chi - chiPrevious),
        );
        const [br, bi] = complexDivide(
            db * psi - psiPrevious,
            0,
            db * psi - psiPrevious,
            -(db * chi - chiPrevious),
        );
        aReal[n] = ar;
        aImag[n] = ai;
        bReal[n] = br;
        bImag[n] = bi;
        const weight = 2 * n + 1;
        extinctionSum += weight * (ar + br);
        scatteringSum += weight * (ar * ar + ai * ai + br * br + bi * bi);

        const psiNext = ((2 * n + 1) / x) * psi - psiPrevious;
        const chiNext = ((2 * n + 1) / x) * chi - chiPrevious;
        psiPrevious = psi;
        psi = psiNext;
        chiPrevious = chi;
        chi = chiNext;
    }

    const intensity = new Float64Array(cosines.length);
    for (let angleIndex = 0; angleIndex < cosines.length; angleIndex += 1) {
        const mu = cosines[angleIndex];
        let piPrevious = 0;
        let piCurrent = 1;
        let s1Real = 0;
        let s1Imag = 0;
        let s2Real = 0;
        let s2Imag = 0;
        for (let n = 1; n <= order; n += 1) {
            const tau = n * mu * piCurrent - (n + 1) * piPrevious;
            const weight = (2 * n + 1) / (n * (n + 1));
            s1Real += weight * (aReal[n] * piCurrent + bReal[n] * tau);
            s1Imag += weight * (aImag[n] * piCurrent + bImag[n] * tau);
            s2Real += weight * (aReal[n] * tau + bReal[n] * piCurrent);
            s2Imag += weight * (aImag[n] * tau + bImag[n] * piCurrent);
            const piNext = ((2 * n + 1) / n) * mu * piCurrent - ((n + 1) / n) * piPrevious;
            piPrevious = piCurrent;
            piCurrent = piNext;
        }
        intensity[angleIndex] = 0.5 * (
            s1Real * s1Real + s1Imag * s1Imag +
            s2Real * s2Real + s2Imag * s2Imag
        );
    }
    return {
        intensity,
        extinctionEfficiency: 2 * extinctionSum / (x * x),
        scatteringEfficiency: 2 * scatteringSum / (x * x),
    };
};

const integrateSphere = (values, angles) => {
    let integral = 0;
    for (let index = 1; index < angles.length; index += 1) {
        const theta0 = angles[index - 1];
        const theta1 = angles[index];
        integral += 0.5 * (
            values[index - 1] * Math.sin(theta0) +
            values[index] * Math.sin(theta1)
        ) * (theta1 - theta0) * TAU;
    }
    return integral;
};

const normalizePhase = (values, angles) => {
    const integral = integrateSphere(values, angles);
    if (!(integral > 0) || !Number.isFinite(integral)) {
        throw new Error("Phase function has no finite positive energy");
    }
    return Float64Array.from(values, (value) => Math.max(0, value / integral));
};

const phaseMoment = (values, angles, order = 1) => {
    const weighted = Float64Array.from(values, (value, index) =>
        value * Math.cos(angles[index]) ** order);
    return integrateSphere(weighted, angles);
};

const henyeyGreenstein = (mu, g) =>
    (1 - g * g) / (4 * PI * Math.max(1e-12, 1 + g * g - 2 * g * mu) ** 1.5);

const drainePhase = (mu, g, alpha) => {
    const denominator = 4 * PI * (
        3 + alpha * (1 + 2 * g * g)
    ) * Math.max(1e-12, 1 + g * g - 2 * g * mu) ** 1.5;
    return 3 * (1 - g * g) * (1 + alpha * mu * mu) / denominator;
};

const normalizedAngularGaussian = (angles, center, width) => normalizePhase(
    Float64Array.from(angles, (angle) => gaussian(angle, center, width)),
    angles,
);

const phaseEnergyBetween = (values, angles, low, high) => {
    const masked = Float64Array.from(values, (value, index) =>
        angles[index] >= low && angles[index] <= high ? value : 0);
    return integrateSphere(masked, angles);
};

const peakFeature = (values, angles, low, high, baselineOffset) => {
    let peakIndex = 0;
    let peak = -Infinity;
    for (let index = 0; index < angles.length; index += 1) {
        if (angles[index] >= low && angles[index] <= high && values[index] > peak) {
            peak = values[index];
            peakIndex = index;
        }
    }
    const baselineAngle = clamp(angles[peakIndex] - baselineOffset, 0, PI);
    const baselineIndex = Math.round(baselineAngle / PI * (angles.length - 1));
    const baseline = Math.max(1e-12, values[baselineIndex]);
    const half = baseline + (peak - baseline) * 0.5;
    let left = peakIndex;
    let right = peakIndex;
    while (left > 0 && values[left] > half) left -= 1;
    while (right < values.length - 1 && values[right] > half) right += 1;
    return {
        centerRadians: angles[peakIndex],
        widthRadians: Math.max(angles[1] - angles[0], angles[right] - angles[left]),
        contrast: peak / baseline,
        energy: phaseEnergyBetween(values, angles, low, high),
    };
};

const analyticMixture = (angles, parameters) => Float64Array.from(angles, (theta) => {
    const mu = Math.cos(theta);
    const remaining = 1 - parameters.draineWeight - parameters.backwardWeight;
    return remaining * henyeyGreenstein(mu, parameters.forwardG) +
        parameters.draineWeight * drainePhase(mu, parameters.draineG, parameters.draineAlpha) +
        parameters.backwardWeight * henyeyGreenstein(mu, parameters.backwardG);
});

const analyticMixtureLoss = (target, angles, parameters, targetG) => {
    if (
        parameters.draineWeight < 0 || parameters.backwardWeight < 0 ||
        parameters.draineWeight + parameters.backwardWeight >= 0.97
    ) return Number.POSITIVE_INFINITY;
    const approximation = analyticMixture(angles, parameters);
    let error = 0;
    let weightSum = 0;
    for (let index = 0; index < angles.length; index += 2) {
        // Solid-angle weighting prevents the diffraction spike from
        // overwhelming the fit, while sqrt(target) keeps sourceward cloud
        // edges important. Log error preserves the weak side/backscatter
        // structure which linear least squares erases.
        const angularWeight = Math.sin(angles[index]) + 0.002;
        const visualWeight = Math.sqrt(Math.min(
            64, target[index] / (1 / (4 * PI))));
        const delta = Math.log2(Math.max(1e-10, approximation[index])) -
            Math.log2(Math.max(1e-10, target[index]));
        const weight = angularWeight * (0.25 + visualWeight);
        error += delta * delta * weight;
        weightSum += weight;
    }
    // The first moment controls the angular broadening of every later
    // scattering order. Preserve it even when a slightly different lobe is
    // locally prettier in log space.
    const momentError = phaseMoment(approximation, angles) - targetG;
    return error / weightSum + momentError * momentError * 8;
};

const refineAnalyticMixture = (target, angles, initial, targetG) => {
    const bounds = {
        forwardG: [0.55, 0.985],
        draineG: [-0.2, 0.95],
        draineLogAlpha: [0, Math.log1p(300)],
        draineWeight: [0, 0.9],
        backwardG: [-0.9, -0.01],
        backwardWeight: [0, 0.16],
    };
    const toSearch = (parameters) => ({
        forwardG: parameters.forwardG,
        draineG: parameters.draineG,
        draineLogAlpha: Math.log1p(parameters.draineAlpha),
        draineWeight: parameters.draineWeight,
        backwardG: parameters.backwardG,
        backwardWeight: parameters.backwardWeight,
    });
    const fromSearch = (search) => ({
        forwardG: search.forwardG,
        draineG: search.draineG,
        draineAlpha: Math.expm1(search.draineLogAlpha),
        draineWeight: search.draineWeight,
        backwardG: search.backwardG,
        backwardWeight: search.backwardWeight,
    });
    let search = toSearch(initial);
    let best = fromSearch(search);
    let bestLoss = analyticMixtureLoss(target, angles, best, targetG);
    const steps = {
        forwardG: 0.035,
        draineG: 0.07,
        draineLogAlpha: 0.55,
        draineWeight: 0.055,
        backwardG: 0.08,
        backwardWeight: 0.012,
    };
    // Deterministic coordinate refinement makes the HG+Draine closure track
    // each generated Mie/ice row rather than snapping to a coarse parameter
    // grid. It is offline-only and changes no runtime cost.
    for (var refinement = 0; refinement < 7; refinement += 1) {
        for (const key of Object.keys(steps)) {
            for (const direction of [-1, 1]) {
                const candidateSearch = {
                    ...search,
                    [key]: clamp(
                        search[key] + steps[key] * direction,
                        bounds[key][0],
                        bounds[key][1],
                    ),
                };
                const candidate = fromSearch(candidateSearch);
                const loss = analyticMixtureLoss(
                    target, angles, candidate, targetG);
                if (loss < bestLoss) {
                    search = candidateSearch;
                    best = candidate;
                    bestLoss = loss;
                }
            }
        }
        for (const key of Object.keys(steps)) steps[key] *= 0.52;
    }
    return { ...best, loss: bestLoss };
};

const fitAnalyticMixture = (target, angles) => {
    const targetG = clamp(phaseMoment(target, angles), -0.2, 0.96);
    const backwardEnergy = phaseEnergyBetween(target, angles, radians(150), PI);
    const backwardWeight = clamp(backwardEnergy * 0.35, 0.002, 0.07);
    let best;
    const forwardCandidates = [0.78, 0.84, 0.88, 0.91, 0.94, 0.965];
    const draineCandidates = [0.35, 0.50, 0.62, 0.72, 0.80];
    const alphaCandidates = [1, 4, 12, 36, 100];
    const weightCandidates = [0.10, 0.18, 0.26, 0.34, 0.44];
    for (const forwardG of forwardCandidates) {
        for (const draineG of draineCandidates) {
            for (const draineAlpha of alphaCandidates) {
                for (const draineWeight of weightCandidates) {
                    if (draineWeight + backwardWeight >= 0.94) continue;
                    const parameters = {
                        forwardG,
                        draineG,
                        draineAlpha,
                        draineWeight,
                        backwardG: -0.28,
                        backwardWeight,
                    };
                    const loss = analyticMixtureLoss(
                        target, angles, parameters, targetG);
                    if (!best || loss < best.loss) best = { ...parameters, loss };
                }
            }
        }
    }
    best = refineAnalyticMixture(target, angles, best, targetG);
    return { ...best, rmsLog2: Math.sqrt(best.loss) };
};

const averageRgb = (phases) => Float64Array.from(phases[0], (_, index) =>
    (phases[0][index] + phases[1][index] + phases[2][index]) / 3);

const liquidOptics = (effectiveRadius, angles, cosines) => {
    const bandDifferential = [
        new Float64Array(angles.length),
        new Float64Array(angles.length),
        new Float64Array(angles.length),
    ];
    const extinctionNumerator = [0, 0, 0];
    const scatteringNumerator = [0, 0, 0];
    const bandWeightSums = [0, 0, 0];
    let massDenominator = 0;
    const quadrature = radiusQuadrature(effectiveRadius);
    for (const sample of quadrature) {
        const radiusMetres = sample.radius * 1e-6;
        massDenominator += sample.numberWeight * (4 / 3) * PI * radiusMetres ** 3 * 997;
    }
    for (const wavelength of WAVELENGTHS_MICRONS) {
        const sensorWeights = visibleBandWeights(wavelength);
        const differentialAtWavelength = new Float64Array(angles.length);
        let extinctionCrossSection = 0;
        let scatteringCrossSection = 0;
        for (const sample of quadrature) {
            const mie = mieSphere(
                sample.radius,
                wavelength,
                waterRefractiveIndex(wavelength),
                cosines,
            );
            const radiusMetres = sample.radius * 1e-6;
            const geometricArea = PI * radiusMetres * radiusMetres;
            extinctionCrossSection += sample.numberWeight * geometricArea * mie.extinctionEfficiency;
            scatteringCrossSection += sample.numberWeight * geometricArea * mie.scatteringEfficiency;
            // |S|²/k² is differential scattering cross section. Converting
            // microns to metres cancels during normalization; retain the
            // wavelength² factor to weight particle sizes correctly.
            const differentialScale = sample.numberWeight * (wavelength / TAU) ** 2;
            for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
                differentialAtWavelength[angleIndex] +=
                    mie.intensity[angleIndex] * differentialScale;
            }
        }
        for (let channel = 0; channel < 3; channel += 1) {
            const sensorWeight = sensorWeights[channel];
            bandWeightSums[channel] += sensorWeight;
            extinctionNumerator[channel] += sensorWeight * extinctionCrossSection;
            scatteringNumerator[channel] += sensorWeight * scatteringCrossSection;
            for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
                bandDifferential[channel][angleIndex] +=
                    sensorWeight * differentialAtWavelength[angleIndex];
            }
        }
    }
    const phaseRgb = bandDifferential.map((values) => normalizePhase(values, angles));
    const massExtinctionRgb = extinctionNumerator.map((value, channel) =>
        value / Math.max(1e-30, bandWeightSums[channel] * massDenominator));
    const singleScatteringAlbedoRgb = scatteringNumerator.map((value, channel) =>
        clamp(value / Math.max(1e-30, extinctionNumerator[channel]), 0, 0.9999995));
    const asymmetryRgb = phaseRgb.map((phase) => phaseMoment(phase, angles));
    return { phaseRgb, massExtinctionRgb, singleScatteringAlbedoRgb, asymmetryRgb };
};

const ICE_HABIT_PROPERTIES = {
    general: { forward: 0.835, halo22: 0.030, halo46: 0.007, area: 1.00 },
    aggregate: { forward: 0.795, halo22: 0.010, halo46: 0.002, area: 0.91 },
    plate: { forward: 0.855, halo22: 0.075, halo46: 0.018, area: 1.14 },
    column: { forward: 0.865, halo22: 0.055, halo46: 0.012, area: 1.06 },
};

const iceOptics = (effectiveRadius, habit, roughness, angles) => {
    const properties = ICE_HABIT_PROPERTIES[habit];
    const roughnessAmount = CLOUD_OPTICS_ROUGHNESSES.indexOf(roughness) / 2;
    const sizeAmount = clamp(Math.log(effectiveRadius / 10) / Math.log(9), 0, 1);
    const phaseRgb = [];
    for (let channel = 0; channel < 3; channel += 1) {
        const chromatic = (channel - 1) * 0.0015;
        const forwardG = clamp(
            properties.forward + sizeAmount * 0.035 - roughnessAmount * 0.055 + chromatic,
            0.70,
            0.93,
        );
        const haloSurvival = mix(1, 0.10, roughnessAmount);
        const halo22Weight = properties.halo22 * haloSurvival;
        const halo46Weight = properties.halo46 * haloSurvival;
        const backwardWeight = mix(0.018, 0.006, roughnessAmount);
        const broadWeight = 0.18 + roughnessAmount * 0.09;
        const forwardWeight = 1 - halo22Weight - halo46Weight - backwardWeight - broadWeight;
        const haloShift = (channel - 1) * radians(0.12);
        const halo22 = normalizedAngularGaussian(
            angles,
            radians(22) + haloShift,
            radians(mix(0.75, 3.8, roughnessAmount)),
        );
        const halo46 = normalizedAngularGaussian(
            angles,
            radians(46) + haloShift * 1.7,
            radians(mix(1.1, 5.2, roughnessAmount)),
        );
        const values = Float64Array.from(angles, (theta, index) => {
            const mu = Math.cos(theta);
            return forwardWeight * henyeyGreenstein(mu, forwardG) +
                broadWeight * drainePhase(mu, mix(0.54, 0.67, sizeAmount), mix(4, 22, sizeAmount)) +
                backwardWeight * henyeyGreenstein(mu, -0.30) +
                halo22Weight * halo22[index] +
                halo46Weight * halo46[index];
        });
        phaseRgb.push(normalizePhase(values, angles));
    }
    // Extinction paradox: large randomly oriented particles approach Qext=2.
    // Effective radius is an area/volume ratio, so this mass-specific form is
    // appropriate for a compact bulk renderer; habit area is an explicit fit.
    const baseMassExtinction = properties.area * 3 * 2 / (4 * 917 * effectiveRadius * 1e-6);
    const massExtinctionRgb = [
        baseMassExtinction * 0.998,
        baseMassExtinction,
        baseMassExtinction * 1.003,
    ];
    const singleScatteringAlbedoRgb = [0.999985, 0.999992, 0.999996];
    const asymmetryRgb = phaseRgb.map((phase) => phaseMoment(phase, angles));
    return { phaseRgb, massExtinctionRgb, singleScatteringAlbedoRgb, asymmetryRgb };
};

const floatToHalf = (value) => {
    const float = new Float32Array(1);
    const integer = new Uint32Array(float.buffer);
    float[0] = value;
    const bits = integer[0];
    const sign = (bits >>> 16) & 0x8000;
    let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
    let mantissa = bits & 0x7fffff;
    if (exponent <= 0) {
        if (exponent < -10) return sign;
        mantissa = (mantissa | 0x800000) >>> (1 - exponent);
        return sign | ((mantissa + 0x1000) >>> 13);
    }
    if (exponent >= 31) return sign | 0x7bff;
    if (mantissa & 0x1000) {
        mantissa += 0x2000;
        if (mantissa & 0x800000) {
            mantissa = 0;
            exponent += 1;
            if (exponent >= 31) return sign | 0x7bff;
        }
    }
    return sign | (exponent << 10) | (mantissa >>> 13);
};

export const halfToFloat = (half) => {
    const sign = (half & 0x8000) ? -1 : 1;
    const exponent = (half >>> 10) & 0x1f;
    const mantissa = half & 0x3ff;
    if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
    if (exponent === 31) return mantissa ? Number.NaN : sign * Infinity;
    return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
};

const summarizeAngularFeatures = (phase, angles, phaseClass) => ({
    rainbow: phaseClass === "liquid"
        ? peakFeature(phase, angles, radians(132), radians(144), radians(10))
        : { centerRadians: 0, widthRadians: 0, contrast: 1, energy: 0 },
    glory: phaseClass === "liquid"
        ? peakFeature(phase, angles, radians(168), PI, radians(10))
        : { centerRadians: 0, widthRadians: 0, contrast: 1, energy: 0 },
    forwardTenDegreeEnergy: phaseEnergyBetween(phase, angles, 0, radians(10)),
});

const encodeParameterRow = (target, offset, row) => {
    const { state, optics, analytic, angularFeatures, phaseRow } = row;
    const phaseClass = state.phase === "liquid" ? 0 : 1;
    const habitIndex = state.phase === "liquid" ? -1 : CLOUD_OPTICS_ICE_HABITS.indexOf(state.habit);
    const roughness = state.phase === "liquid" ? 0 : CLOUD_OPTICS_ROUGHNESSES.indexOf(state.roughness) / 2;
    target.set([
        phaseClass, state.effectiveRadiusMicrons, habitIndex, roughness,
        ...optics.massExtinctionRgb, phaseRow,
        ...optics.singleScatteringAlbedoRgb, phaseMoment(averageRgb(optics.phaseRgb), row.angles),
        analytic.forwardG, analytic.draineG, analytic.draineAlpha, analytic.draineWeight,
        analytic.backwardG, analytic.backwardWeight, analytic.rmsLog2,
        angularFeatures.forwardTenDegreeEnergy,
        angularFeatures.rainbow.centerRadians, angularFeatures.rainbow.widthRadians,
        angularFeatures.rainbow.contrast, angularFeatures.rainbow.energy,
        angularFeatures.glory.centerRadians, angularFeatures.glory.widthRadians,
        angularFeatures.glory.contrast, angularFeatures.glory.energy,
        ...optics.asymmetryRgb,
        CLOUD_OPTICS_VERSION,
    ], offset);
};

const createStateDefinitions = () => [
    ...CLOUD_OPTICS_LIQUID_RADII_MICRONS.map((effectiveRadiusMicrons) => ({
        id: `liquid-r${effectiveRadiusMicrons}`,
        phase: "liquid",
        effectiveRadiusMicrons,
    })),
    ...CLOUD_OPTICS_ICE_HABITS.flatMap((habit) =>
        CLOUD_OPTICS_ROUGHNESSES.flatMap((roughness) =>
            CLOUD_OPTICS_ICE_RADII_MICRONS.map((effectiveRadiusMicrons) => ({
                id: `ice-${habit}-${roughness}-r${effectiveRadiusMicrons}`,
                phase: "ice",
                habit,
                roughness,
                effectiveRadiusMicrons,
            })),
        ),
    ),
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const generateCloudOptics = ({ angleSamples = CLOUD_OPTICS_ANGLE_SAMPLES } = {}) => {
    if (!Number.isInteger(angleSamples) || angleSamples < 128 || angleSamples % 2 !== 0) {
        throw new Error("Cloud optical LUT needs an even angular resolution of at least 128");
    }
    const angles = Float64Array.from({ length: angleSamples }, (_, index) =>
        index / (angleSamples - 1) * PI);
    const cosines = Float64Array.from(angles, (angle) => Math.cos(angle));
    const definitions = createStateDefinitions();
    const rows = definitions.map((state, phaseRow) => {
        const optics = state.phase === "liquid"
            ? liquidOptics(state.effectiveRadiusMicrons, angles, cosines)
            : iceOptics(state.effectiveRadiusMicrons, state.habit, state.roughness, angles);
        const averagePhase = averageRgb(optics.phaseRgb);
        const analytic = fitAnalyticMixture(averagePhase, angles);
        const angularFeatures = summarizeAngularFeatures(averagePhase, angles, state.phase);
        return { state, phaseRow, optics, analytic, angularFeatures, angles };
    });

    const phaseHalf = new Uint16Array(angleSamples * rows.length * 4);
    const parameters = new Float32Array(rows.length * CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS);
    for (const row of rows) {
        for (let angleIndex = 0; angleIndex < angleSamples; angleIndex += 1) {
            const target = (row.phaseRow * angleSamples + angleIndex) * 4;
            for (let channel = 0; channel < 3; channel += 1) {
                phaseHalf[target + channel] = floatToHalf(clamp(
                    Math.log2(Math.max(2 ** -24, row.optics.phaseRgb[channel][angleIndex])),
                    -24,
                    24,
                ));
            }
            phaseHalf[target + 3] = floatToHalf(0);
        }
        encodeParameterRow(
            parameters,
            row.phaseRow * CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS,
            row,
        );
    }
    const phaseBytes = new Uint8Array(phaseHalf.buffer);
    const parameterBytes = new Uint8Array(parameters.buffer);
    const manifestRows = rows.map((row) => ({
        ...row.state,
        phaseRow: row.phaseRow,
        massExtinctionRgbM2PerKg: row.optics.massExtinctionRgb,
        singleScatteringAlbedoRgb: row.optics.singleScatteringAlbedoRgb,
        asymmetryRgb: row.optics.asymmetryRgb,
        analyticApproximation: row.analytic,
        angularFeatures: row.angularFeatures,
        validation: {
            normalizationRgb: row.optics.phaseRgb.map((phase) => integrateSphere(phase, angles)),
            minimumPhaseRgb: row.optics.phaseRgb.map((phase) => Math.min(...phase)),
        },
    }));
    const manifest = {
        schema: CLOUD_OPTICS_SCHEMA,
        version: CLOUD_OPTICS_VERSION,
        generatorVersion: CLOUD_OPTICS_GENERATOR_VERSION,
        phaseTexture: {
            url: "cloud-optics-phase-rgba16float-v1.bin",
            file: "cloud-optics-phase-rgba16float-v1.bin",
            format: "rgba16float",
            dimensions: { width: angleSamples, height: rows.length, depthOrArrayLayers: 1 },
            byteLength: phaseBytes.byteLength,
            encoding: "log2-phase-per-steradian",
            channels: { r: "red-band", g: "green-band", b: "blue-band", a: "reserved-zero" },
            angleMapping: {
                angleRadians: "index / (width - 1) * PI",
                sampleCoordinate: "(0.5 + acos(clamp(cosTheta,-1,1)) / PI * (width - 1)) / width",
            },
        },
        parameterBuffer: {
            url: "cloud-optics-parameters-f32-v1.bin",
            file: "cloud-optics-parameters-f32-v1.bin",
            format: "float32-little-endian",
            strideFloats: CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS,
            strideBytes: CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS * 4,
            byteLength: parameterBytes.byteLength,
            layout: {
                0: "phaseClass,effectiveRadiusMicrons,habitIndex,roughness",
                4: "massExtinctionRgbM2PerKg,phaseTextureRow",
                8: "singleScatteringAlbedoRgb,meanAsymmetry",
                12: "forwardG,draineG,draineAlpha,draineWeight",
                16: "backwardG,backwardWeight,analyticRmsLog2,forward10DegreeEnergy",
                20: "rainbowCenter,width,contrast,energy",
                24: "gloryCenter,width,contrast,energy",
                28: "asymmetryRgb,schemaVersion",
            },
        },
        integration: {
            wavelengthsMicrons: WAVELENGTHS_MICRONS,
            liquidEffectiveVariance: EFFECTIVE_VARIANCE,
            liquidRadiusQuadratureRatios: DROPLET_RADIUS_RATIOS,
            normalization: "integral over 4pi steradians equals one per RGB band",
            convention: "cosTheta=1 is zero-deflection forward scattering; negate a direction-to-light vector when forming the incident propagation vector",
        },
        rows: manifestRows,
        checksums: {
            algorithm: "SHA-256",
            phaseTexture: sha256(phaseBytes),
            parameterBuffer: sha256(parameterBytes),
        },
        provenance: {
            license: "Original generated numerical asset; repository license applies.",
            liquid: "Polydisperse Lorenz-Mie calculation implemented by this generator; Hansen modified-gamma size distribution with effective variance 0.10.",
            ice: "Original normalized multi-lobe approximation informed by Yang et al. (2013) habit/roughness behavior; not a substitute for the Yang/Baum numerical database.",
            analyticFit: "Energy-normalized HG + Draine + weak backward-HG closure with deterministic continuous parameter refinement and first-moment penalty.",
            references: [
                "https://doi.org/10.1175/JAS-D-12-039.1",
                "https://doi.org/10.1145/3587421.3595409",
                "https://www.libradtran.org/",
                "https://www.ea.com/news/physically-based-sky-atmosphere-and-cloud-rendering",
            ],
        },
        limitations: [
            "Ice phase functions are physically constrained analytic approximations, not full electromagnetic solutions.",
            "Random particle orientation is assumed; oriented plate/column halo arcs require a separate orientation model.",
            "The positive RGB band responses are display-oriented approximations rather than a full CIE spectral transform.",
            "Polarization and thermal-infrared absorption are outside this visible-light asset.",
            "Sub-degree diffraction structure is represented mainly by the analytic forward lobe because the LUT has finite angular resolution.",
        ],
    };
    return { manifest, phaseBytes, parameterBytes, rows, angles };
};

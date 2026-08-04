/**
 * Runtime contract for visible-light cloud single-scattering optical assets.
 *
 * The phase LUT stores log2(per-steradian phase) so a compact rgba16float
 * texture retains the narrow forward peak and weak backscatter simultaneously.
 * Extinction is mass-specific (m²/kg); density integration must therefore use
 * condensate mass density in kg/m³, never the renderer's unitless shape field.
 */

export const CLOUD_OPTICS_MANIFEST_URL = "/assets/sky/cloud-optics-v1.json";
export const CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS = 32;
export const CLOUD_OPTICS_PARAMETER_ROW_COUNT = 67;
export const CLOUD_OPTICS_PARAMETER_BUFFER_BYTES =
    CLOUD_OPTICS_PARAMETER_ROW_COUNT * CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS *
        Float32Array.BYTES_PER_ELEMENT;
export const CLOUD_OPTICS_BLEND_STRIDE_FLOATS = 32;
/** Phase texture, sampler, optical-state storage, per-system blend storage. */
export const CLOUD_OPTICS_GPU_BINDING_COUNT = 4;

/** Orders two through six in the bounded higher-order closure. */
export const CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT = 5;
/** Fraction of the remaining higher-order budget continued to the next order. */
export const CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION = 0.55;
/** Per-order relaxation of source-path extinction after angular diffusion. */
export const CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION = 0.58;
/** Optical-depth scale of the sparse member in the mean-preserving fibre mix. */
export const CLOUD_THIN_ICE_SPARSE_TAU_SCALE = 0.14;
/** Safety bound keeps the complementary dense member finite. */
export const CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY = 0.85;

/**
 * Positive two-node Gauss--Legendre abscissa on [-1, 1]. The camera packet
 * maps the pair at ±1/sqrt(3) into every occupied high-ice segment; source
 * visibility uses the same positive-node convention (with its own GL4 depth
 * refinement when a source interval contains resolved ice).
 */
export const CLOUD_CAMERA_HIGH_ICE_GL2_NODE = 1 / Math.sqrt(3);
export const CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT = 2;
/**
 * Standard deviation of a uniform subsegment of length ds.  Source and
 * camera high-ice footprints must use this exact value so axial filtering is
 * independent of whether a physical interval was split into GL nodes.
 */
export const CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR = 1 / Math.sqrt(12);

/**
 * Return the bounded sparse-member fraction used by the unresolved Beer
 * closure.  The texture-derived variance and along-ray correlation are
 * dimensionless, [0, 1] signals.  Multiplication is intentional: a sample
 * with no resolved contrast, or a contrast that is fully averaged by its
 * physical footprint, is exactly the homogeneous tau operator.
 */
export const cloudUnresolvedFootprintPorosity = (
    unresolvedIcePorosity: number,
    localVariance = 1,
    localCorrelation = 1,
) => {
    const porosity = Math.min(
        CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY,
        Math.max(0, Number.isFinite(unresolvedIcePorosity)
            ? unresolvedIcePorosity : 0),
    );
    const variance = finiteUnit(localVariance);
    const correlation = finiteUnit(localCorrelation);
    return Math.min(
        CLOUD_THIN_ICE_MAX_UNRESOLVED_POROSITY,
        porosity * variance * correlation,
    );
};

/**
 * P1 diffusion is not a first-collision model.  It becomes useful only after
 * the medium spans a meaningful fraction of a transport mean free path,
 * sigma_tr = sigma_t (1 - omega g).  The fade is deliberately continuous:
 * tenuous, strongly forward-scattering cirrus stays on resolved
 * single/higher-order transport, while optically deep cloud retains the
 * resident light volume.
 */
export const CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE =
    [0.2, 1.0] as const;

const finiteUnit = (value: number) => Math.min(1, Math.max(
    0, Number.isFinite(value) ? value : 0));

export const cloudTransportOpticalDepth = (
    extinctionOpticalDepth: number,
    singleScatteringAlbedo: number,
    asymmetry: number,
) => Math.max(0, Number.isFinite(extinctionOpticalDepth) ?
    extinctionOpticalDepth : 0) * Math.max(
    0,
    1 - finiteUnit(singleScatteringAlbedo) * Math.min(
        0.985, Math.max(-0.985, Number.isFinite(asymmetry) ? asymmetry : 0)),
);

export const cloudP1DiffusionValidity = (
    extinctionOpticalDepthRgb: readonly number[],
    singleScatteringAlbedoRgb: readonly number[],
    asymmetryRgb: readonly number[],
    unresolvedVariance = 0,
    unresolvedCorrelation = 0,
) => {
    const weights = [0.2126, 0.7152, 0.0722] as const;
    const transportDepth = weights.reduce((sum, weight, channel) =>
        sum + weight * cloudTransportOpticalDepth(
            extinctionOpticalDepthRgb[channel] ?? 0,
            singleScatteringAlbedoRgb[channel] ?? 0,
            asymmetryRgb[channel] ?? 0,
        ), 0);
    const [lower, upper] = CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE;
    const amount = finiteUnit((transportDepth - lower) / (upper - lower));
    const baseValidity = amount * amount * (3 - 2 * amount);
    // A high-variance, strongly correlated footprint retains directional
    // structure until it has reached a genuinely thick transport depth. A
    // homogeneous core remains eligible as soon as the ordinary P1 criterion
    // is met. This is a representation gate only; it adds no radiance.
    const heterogeneity = finiteUnit(unresolvedVariance) *
        finiteUnit(unresolvedCorrelation);
    const heterogeneousAmount = finiteUnit(
        (heterogeneity - 0.12) / (0.60 - 0.12));
    const heterogeneousFade = heterogeneousAmount * heterogeneousAmount *
        (3 - 2 * heterogeneousAmount);
    const thickAmount = finiteUnit(
        (transportDepth - lower * 1.2) / (upper * 1.35 - lower * 1.2));
    const thickFade = thickAmount * thickAmount * (3 - 2 * thickAmount);
    return baseValidity * (1 - heterogeneousFade +
        heterogeneousFade * thickFade);
};

/** Static budget for the nonresident analytic diffuse visibility closure. */
export const CLOUD_FALLBACK_DIFFUSE_MAX_HEMISPHERE_RAYS = 3;
/** Legacy CPU-regression strata after the short receiver-local interval. */
export const CLOUD_FALLBACK_DIFFUSE_FAR_SEGMENT_COUNT = 3;
/** Optical-depth clamp shared by the CPU reference and WGSL. */
export const CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH = 24;
/** Sun and Moon are the only directional camera-cloud source queries. */
export const CLOUD_CAMERA_DIRECT_SOURCE_QUERY_CEILING = 2;
/** The camera source never retraces finite owner morphology toward a light. */
export const CLOUD_CAMERA_DIRECT_OWNER_EVALUATION_CEILING = 0;
/** The local SDF diffuse closure reuses the density atlas sample's alpha. */
export const CLOUD_CAMERA_LOCAL_DIFFUSE_TEXTURE_FETCH_CEILING = 0;
/** The local SDF diffuse closure never traverses owner supports or cone rays. */
export const CLOUD_CAMERA_LOCAL_DIFFUSE_OWNER_EVALUATION_CEILING = 0;
/** Cosine-weighted mean direction of a hemisphere. */
export const CLOUD_FALLBACK_DIFFUSE_CONE_VERTICAL_COSINE = 2 / 3;
/** Legacy midpoint boundaries retained only to prove the former failure mode. */
export const CLOUD_FALLBACK_DIFFUSE_FAR_BOUNDARIES =
    [0, 0.18, 0.5, 1] as const;
/**
 * Fixed positive quadrature inside each finite cloud-owner support.  The
 * support moves with the meteorological owner, so a cloud entering a former
 * whole-shell midpoint cannot switch an entire kilometre-scale bin on or off.
 */
export const CLOUD_FINITE_SUPPORT_GAUSS_NODE_COUNT = 4;
export const CLOUD_FINITE_SUPPORT_GAUSS_NODES = [
    -0.8611363115940526,
    -0.3399810435848563,
    0.3399810435848563,
    0.8611363115940526,
] as const;
export const CLOUD_FINITE_SUPPORT_GAUSS_WEIGHTS = [
    0.3478548451374538,
    0.6521451548625461,
    0.6521451548625461,
    0.3478548451374538,
] as const;
/** Four-point Gauss-Legendre integral over hemisphere cosine mu in [0, 1]. */
export const CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES = [
    0.06943184420297371,
    0.33000947820757187,
    0.6699905217924281,
    0.9305681557970262,
] as const;
export const CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS = [
    0.1739274225687269,
    0.3260725774312731,
    0.3260725774312731,
    0.1739274225687269,
] as const;
/** Runtime population invariant: no WMO level owns more than twelve systems. */
export const CLOUD_FINITE_SUPPORT_MAX_OWNERS_PER_LAYER = 12;
/** The local material ABI resolves at most two overlapping optical owners. */
export const CLOUD_FINITE_SUPPORT_MAX_LOCAL_MATERIAL_OWNERS = 2;
export const CLOUD_FINITE_SUPPORT_MAX_DIRECT_SOURCES = 2;
/** Three cosine-cone directions in each of the upper and lower hemispheres. */
export const CLOUD_FINITE_SUPPORT_MAX_DIFFUSE_RAYS = 6;
/** A receiver-containing owner support is split once at the near-field limit. */
export const CLOUD_FINITE_SUPPORT_MAX_INTERVALS_PER_OWNER = 2;

export interface CloudFiniteSupportQueryBudgetInput {
    readonly layerOwnerCount: number;
    readonly localMaterialOwnerCount: number;
    readonly activeDirectSourceCount: number;
    readonly diffuseRayCount: number;
}

/**
 * Conservative ceiling on exact owner morphology/atlas evaluations performed
 * by one shaded sample. Support misses cost boundary arithmetic but no macro
 * query; this ceiling deliberately assumes every included support contains the
 * receiver and is therefore split into both quadrature intervals.
 */
export const cloudFiniteSupportOwnerQueryBudget = (
    input: CloudFiniteSupportQueryBudgetInput,
) => {
    const boundedInteger = (value: number, maximum: number) => Math.min(
        maximum,
        Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0),
    );
    const layerOwners = boundedInteger(
        input.layerOwnerCount, CLOUD_FINITE_SUPPORT_MAX_OWNERS_PER_LAYER);
    const localOwners = boundedInteger(
        input.localMaterialOwnerCount,
        CLOUD_FINITE_SUPPORT_MAX_LOCAL_MATERIAL_OWNERS);
    const directSources = boundedInteger(
        input.activeDirectSourceCount,
        CLOUD_FINITE_SUPPORT_MAX_DIRECT_SOURCES);
    const diffuseRays = boundedInteger(
        input.diffuseRayCount, CLOUD_FINITE_SUPPORT_MAX_DIFFUSE_RAYS);
    return CLOUD_FINITE_SUPPORT_GAUSS_NODE_COUNT *
        CLOUD_FINITE_SUPPORT_MAX_INTERVALS_PER_OWNER *
        (layerOwners * directSources + localOwners * diffuseRays);
};

export type CloudOpticalPhase = "liquid" | "ice";
export type CloudIceHabit = "general" | "aggregate" | "plate" | "column";
export type CloudParticleRoughness = "smooth" | "moderate" | "severe";
export const CLOUD_OPTICS_ICE_HABITS = [
    "general", "aggregate", "plate", "column",
] as const satisfies readonly CloudIceHabit[];
export const CLOUD_OPTICS_ROUGHNESSES = [
    "smooth", "moderate", "severe",
] as const satisfies readonly CloudParticleRoughness[];

export interface CloudOpticsAngularFeature {
    centerRadians: number;
    widthRadians: number;
    contrast: number;
    energy: number;
}

export interface CloudOpticsAnalyticApproximation {
    forwardG: number;
    draineG: number;
    draineAlpha: number;
    draineWeight: number;
    backwardG: number;
    backwardWeight: number;
    rmsLog2: number;
}

export interface CloudOpticsRow {
    id: string;
    phase: CloudOpticalPhase;
    effectiveRadiusMicrons: number;
    habit?: CloudIceHabit;
    roughness?: CloudParticleRoughness;
    phaseRow: number;
    massExtinctionRgbM2PerKg: [number, number, number];
    singleScatteringAlbedoRgb: [number, number, number];
    asymmetryRgb: [number, number, number];
    analyticApproximation: CloudOpticsAnalyticApproximation;
    angularFeatures: {
        rainbow: CloudOpticsAngularFeature;
        glory: CloudOpticsAngularFeature;
        forwardTenDegreeEnergy: number;
    };
    validation: {
        normalizationRgb: [number, number, number];
        minimumPhaseRgb: [number, number, number];
    };
}

export interface CloudOpticsManifest {
    schema: "elements-cloud-optics";
    version: 1;
    generatorVersion: string;
    phaseTexture: {
        url: string;
        file: string;
        format: "rgba16float";
        dimensions: { width: number; height: number; depthOrArrayLayers: 1 };
        byteLength: number;
        encoding: "log2-phase-per-steradian";
        channels: Record<string, string>;
        angleMapping: {
            angleRadians: string;
            sampleCoordinate: string;
        };
    };
    parameterBuffer: {
        url: string;
        file: string;
        format: "float32-little-endian";
        strideFloats: 32;
        strideBytes: 128;
        byteLength: number;
        layout: Record<string, string>;
    };
    integration: {
        wavelengthsMicrons: number[];
        liquidEffectiveVariance: number;
        liquidRadiusQuadratureRatios: number[];
        normalization: string;
        convention: string;
    };
    rows: CloudOpticsRow[];
    checksums: {
        algorithm: "SHA-256";
        phaseTexture: string;
        parameterBuffer: string;
    };
    provenance: Record<string, unknown>;
    limitations: string[];
}

export interface CloudPassiveMultipleScatteringBudget {
    firstOrderRgb: [number, number, number];
    higherOrderAvailableRgb: [number, number, number];
    higherOrderTransportRgb: [number, number, number];
    totalTransportRgb: [number, number, number];
}

export interface CloudLocalDirectionalHigherOrderBudget {
    resolvedLocalOpticalDepthRgb: [number, number, number];
    effectiveLocalOpticalDepthRgb: [number, number, number];
    externalSourceVisibilityRgb: [number, number, number];
    higherOrderAvailableRgb: [number, number, number];
    higherOrderTransportRgb: [number, number, number];
}

export interface CloudSceneLinearDirectSource {
    /** Atmosphere-transported source irradiance at the cloud sample. */
    incidentIrradianceRgb: readonly [number, number, number];
    /** Cloud-only Beer visibility from the sample to the source. */
    visibilityRgb: readonly [number, number, number];
    /** Normalized local phase density in inverse steradians. */
    phaseRgbPerSteradian: readonly [number, number, number];
}

export interface CloudSceneLinearSourcePartition {
    directSingleScatteringRgb: [number, number, number];
    propagatedDiffuseScatteringRgb: [number, number, number];
    totalSourceRadianceRgb: [number, number, number];
}

export interface CloudFallbackDiffuseSourcePartition {
    /** Photopic diagnostic corresponding to the RGB atmosphere transmittance. */
    atmosphereFirstOrderOpticalDepth: number;
    atmosphereFirstOrderTransmittanceRgb: [number, number, number];
    atmosphereDirectionalFirstOrderRgb: [number, number, number];
    upperAtmosphereHigherOrderRgb: [number, number, number];
    lowerAtmosphereHigherOrderRgb: [number, number, number];
    groundFirstAndHigherOrderRgb: [number, number, number];
    totalDiffuseSourceRadianceRgb: [number, number, number];
}

const finiteNonnegative = (value: number) =>
    Number.isFinite(value) ? Math.max(0, value) : 0;

export interface CloudFallbackDiffuseProbeBudget {
    readonly hemisphereRayCount: 1 | 3;
    readonly farSegmentCount: 3;
    readonly nearFieldKilometers: number;
    readonly maximumOpticalDepth: number;
}

/**
 * Family-specialized sampling budget mirrored by the production WGSL.
 *
 * Broad sheets need only their physical vertical column. Finite fibres,
 * cloudlets, fragments, and convective owners use a three-fold azimuthally
 * symmetric cone so no world-space lateral axis receives privileged energy.
 * The near interval is deliberately sub-cell scale; local extinction is never
 * extrapolated through the remaining owner/layer depth.
 */
export const cloudFallbackDiffuseProbeBudget = (
    genus: number,
    species = 0,
): CloudFallbackDiffuseProbeBudget => {
    const resolvedGenus = Number.isFinite(genus) ? Math.round(genus) : 0;
    const resolvedSpecies = Number.isFinite(species) ? Math.round(species) : 0;
    const sheet = resolvedGenus === 3 || resolvedGenus === 5 ||
        resolvedGenus === 6 || (resolvedGenus === 8 && resolvedSpecies !== 16);
    const thinIce = resolvedGenus >= 1 && resolvedGenus <= 3;
    const deepConvection = resolvedGenus === 9 || resolvedGenus === 10;
    return {
        hemisphereRayCount: sheet ? 1 : 3,
        farSegmentCount: CLOUD_FALLBACK_DIFFUSE_FAR_SEGMENT_COUNT,
        nearFieldKilometers: deepConvection ? 0.18 : thinIce ? 0.08 : 0.12,
        maximumOpticalDepth: CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
    };
};

type CloudRgb = readonly [number, number, number];

const finiteRgb = (rgb: readonly number[]): [number, number, number] =>
    [0, 1, 2].map((channel) => finiteNonnegative(rgb[channel])) as
        [number, number, number];

export interface CloudLocalSdfDiffuseOpticalDepthInput {
    readonly density: number;
    readonly spectralExtinctionRgbPerKilometer: CloudRgb;
    readonly receiverAltitudeKilometers: number;
    readonly opticalBaseAltitudeKilometers: number;
    readonly opticalGeometricDepthKilometers: number;
    readonly interiorDepthFraction: number;
    /** Positive inward-distance range encoded by the authoritative atlas. */
    readonly encodedSdfRangeVoxels: number;
}

export interface CloudLocalSdfDiffuseOpticalDepth {
    readonly upperRgb: [number, number, number];
    readonly lowerRgb: [number, number, number];
}

const smoothstep01 = (value: number) => {
    const bounded = Math.min(1, Math.max(0, value));
    return bounded * bounded * (3 - 2 * bounded);
};

/**
 * CPU reference for the production zero-query ambient visibility proxy.
 * Geometry and signed-distance depth are extinction-weighted moments over all
 * overlapping owners. Consequently an owner entering, leaving, or exchanging
 * rank changes the closure continuously and cannot toggle a remote ray hit.
 */
export const evaluateCloudLocalSdfDiffuseOpticalDepth = (
    input: CloudLocalSdfDiffuseOpticalDepthInput,
): CloudLocalSdfDiffuseOpticalDepth => {
    const density = Math.min(1, finiteNonnegative(input.density));
    const extinction = finiteRgb(input.spectralExtinctionRgbPerKilometer)
        .map((value) => density * value) as [number, number, number];
    const base = Number.isFinite(input.opticalBaseAltitudeKilometers)
        ? input.opticalBaseAltitudeKilometers : 0;
    const depth = Math.max(0.02,
        finiteNonnegative(input.opticalGeometricDepthKilometers));
    const altitude = Number.isFinite(input.receiverAltitudeKilometers)
        ? input.receiverAltitudeKilometers : base;
    const heightFraction = Math.min(1, Math.max(0,
        (altitude - base) / depth));
    const interiorDepthFraction = Math.min(1,
        finiteNonnegative(input.interiorDepthFraction));
    const macroVoxelKilometers = depth / 47;
    const boundaryReachKilometers = macroVoxelKilometers * (
        0.20 + (0.90 - 0.20) * Math.sqrt(density));
    // Match the production owner-local closure: displaced density gates the
    // coarse inward SDF continuously, while the atlas' own finite encoding
    // range supplies the exponential bound. A second, shorter cap would turn
    // optically deep nonresident interiors back into near-boundary samples.
    const unresolvedReachKilometers = boundaryReachKilometers +
        depth * interiorDepthFraction * smoothstep01(density) * 1.35;
    const encodedSdfRangeVoxels = Math.min(47, Math.max(
        1,
        Number.isFinite(input.encodedSdfRangeVoxels)
            ? input.encodedSdfRangeVoxels
            : 1,
    ));
    const reachCapKilometers =
        macroVoxelKilometers * encodedSdfRangeVoxels;
    const ambientReachKilometers = reachCapKilometers * (1 - Math.exp(
        -unresolvedReachKilometers / Math.max(1e-5, reachCapKilometers)));
    const upperLengthKilometers = Math.min(
        ambientReachKilometers, (1 - heightFraction) * depth);
    const lowerLengthKilometers = Math.min(
        ambientReachKilometers, heightFraction * depth);
    const opticalDepth = (lengthKilometers: number) => extinction.map(
        (value) => Math.min(
            CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
            value * lengthKilometers)) as [number, number, number];
    return {
        upperRgb: opticalDepth(upperLengthKilometers),
        lowerRgb: opticalDepth(lowerLengthKilometers),
    };
};

/**
 * Exact additive CPU reference for the production all-owner local path moment.
 * Each owner retains its own support geometry; RGB optical depths are summed,
 * never reconstructed from a scalar averaged slab.
 */
export const evaluateCloudAllOwnerLocalSdfDiffuseOpticalDepth = (
    owners: readonly CloudLocalSdfDiffuseOpticalDepthInput[],
): CloudLocalSdfDiffuseOpticalDepth => {
    const upperRgb: [number, number, number] = [0, 0, 0];
    const lowerRgb: [number, number, number] = [0, 0, 0];
    for (const owner of owners) {
        const opticalDepth = evaluateCloudLocalSdfDiffuseOpticalDepth(owner);
        for (let channel = 0; channel < 3; channel += 1) {
            upperRgb[channel] = Math.min(
                CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
                upperRgb[channel] + opticalDepth.upperRgb[channel]);
            lowerRgb[channel] = Math.min(
                CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
                lowerRgb[channel] + opticalDepth.lowerRgb[channel]);
        }
    }
    return { upperRgb, lowerRgb };
};

export interface CloudFallbackDiffuseRayProbe {
    readonly pathLengthKilometers: number;
    readonly localExtinctionRgbPerKilometer: CloudRgb;
    readonly extinctionRgbPerKilometerAt: (distanceKilometers: number) => CloudRgb;
}

export interface CloudFiniteSupportOpticalProbe {
    /** Conservative entry/exit of one physical owner on the probe ray. */
    readonly supportIntervalKilometers: readonly [number, number];
    /** Owner-only spectral extinction; overlaps are added by the caller. */
    readonly extinctionRgbPerKilometerAt: (distanceKilometers: number) => CloudRgb;
}

/**
 * CPU reference for the production finite-owner source/diffuse visibility
 * integral.  Each owner is integrated in its own moving support coordinate;
 * owner overlap is therefore additive in optical depth and never resolved by
 * a dominant-owner branch.  A receiver-containing support is split at the
 * short near-field distance so the first quadrature retains sub-cell detail.
 */
export const integrateCloudFiniteSupportOpticalDepth = (
    probes: readonly CloudFiniteSupportOpticalProbe[],
    pathLengthKilometers: number,
    nearFieldKilometers: number,
    maximumOpticalDepth = CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
): [number, number, number] => {
    const pathLength = finiteNonnegative(pathLengthKilometers);
    const nearField = finiteNonnegative(nearFieldKilometers);
    const maximumTau = finiteNonnegative(maximumOpticalDepth);
    const opticalDepth: [number, number, number] = [0, 0, 0];
    const integrateInterval = (
        probe: CloudFiniteSupportOpticalProbe,
        start: number,
        end: number,
    ) => {
        const halfLength = 0.5 * Math.max(0, end - start);
        if (halfLength <= 0) return;
        const center = 0.5 * (start + end);
        for (let sample = 0;
            sample < CLOUD_FINITE_SUPPORT_GAUSS_NODE_COUNT;
            sample += 1) {
            const distance = center + halfLength *
                CLOUD_FINITE_SUPPORT_GAUSS_NODES[sample];
            const extinction = finiteRgb(
                probe.extinctionRgbPerKilometerAt(distance));
            const weight = halfLength *
                CLOUD_FINITE_SUPPORT_GAUSS_WEIGHTS[sample];
            for (let channel = 0; channel < 3; channel += 1) {
                opticalDepth[channel] = Math.min(maximumTau,
                    opticalDepth[channel] + extinction[channel] * weight);
            }
        }
    };
    for (const probe of probes) {
        const rawStart = probe.supportIntervalKilometers[0];
        const rawEnd = probe.supportIntervalKilometers[1];
        if (!(Number.isFinite(rawStart) && Number.isFinite(rawEnd))) continue;
        const start = Math.min(pathLength, Math.max(0, rawStart));
        const end = Math.min(pathLength, Math.max(0, rawEnd));
        if (end <= start) continue;
        const nearEnd = start <= 1e-6
            ? Math.min(end, Math.max(start, nearField))
            : start;
        if (nearEnd > start) integrateInterval(probe, start, nearEnd);
        if (end > nearEnd) integrateInterval(probe, nearEnd, end);
    }
    return opticalDepth;
};

/**
 * CPU reference for one production diffuse-visibility ray.
 *
 * Only the first bounded interval uses receiver-local extinction. Every metre
 * after it belongs to one explicitly sampled stratum, so a dense local voxel
 * cannot paint a constant attenuation shelf through kilometres of clear air.
 */
export const integrateCloudFallbackDiffuseProbeRay = (
    probe: CloudFallbackDiffuseRayProbe,
    budget: CloudFallbackDiffuseProbeBudget,
): [number, number, number] => {
    const pathLength = finiteNonnegative(probe.pathLengthKilometers);
    if (pathLength <= 0) return [0, 0, 0];
    const localExtinction = finiteRgb(probe.localExtinctionRgbPerKilometer);
    const nearLength = Math.min(pathLength,
        finiteNonnegative(budget.nearFieldKilometers));
    const reachesExterior = nearLength >= pathLength;
    const nearExtinction = reachesExterior
        ? [0, 0, 0] as [number, number, number]
        : finiteRgb(probe.extinctionRgbPerKilometerAt(nearLength));
    const opticalDepth = [0, 1, 2].map((channel) =>
        0.5 * (localExtinction[channel] + nearExtinction[channel]) * nearLength,
    ) as [number, number, number];
    const remaining = Math.max(0, pathLength - nearLength);
    for (let segment = 0;
        segment < CLOUD_FALLBACK_DIFFUSE_FAR_SEGMENT_COUNT;
        segment += 1) {
        const lower = CLOUD_FALLBACK_DIFFUSE_FAR_BOUNDARIES[segment];
        const upper = CLOUD_FALLBACK_DIFFUSE_FAR_BOUNDARIES[segment + 1];
        const segmentLength = remaining * (upper - lower);
        if (segmentLength <= 0) continue;
        const distance = nearLength + remaining * 0.5 * (lower + upper);
        const extinction = finiteRgb(
            probe.extinctionRgbPerKilometerAt(distance));
        for (let channel = 0; channel < 3; channel += 1) {
            opticalDepth[channel] += extinction[channel] * segmentLength;
        }
    }
    return opticalDepth.map((value) => Math.min(
        budget.maximumOpticalDepth, finiteNonnegative(value))) as
        [number, number, number];
};

/** Angular mean of Beer transmittance, converted back to effective RGB tau. */
export const evaluateCloudFallbackDiffuseHemisphereOpticalDepth = (
    probes: readonly CloudFallbackDiffuseRayProbe[],
    budget: CloudFallbackDiffuseProbeBudget,
): [number, number, number] => {
    if (probes.length !== budget.hemisphereRayCount) {
        throw new Error(
            `Expected ${budget.hemisphereRayCount} diffuse rays; received ${probes.length}`,
        );
    }
    const rayOpticalDepths = probes.map((probe) =>
        integrateCloudFallbackDiffuseProbeRay(probe, budget));
    const meanTransmittance = [0, 1, 2].map((channel) =>
        rayOpticalDepths.reduce((sum, opticalDepth) => sum +
            Math.exp(-opticalDepth[channel]), 0) / probes.length,
    );
    const minimumTransmittance = Math.exp(-budget.maximumOpticalDepth);
    return meanTransmittance.map((value) => Math.min(
        budget.maximumOpticalDepth,
        -Math.log(Math.min(1, Math.max(minimumTransmittance, value))),
    )) as [number, number, number];
};

/**
 * Deterministic asymmetry anchors used by the production directional-sky
 * phase cache. The generated liquid/ice optical states currently occupy
 * g=[0.714, 0.866], leaving guard space at both ends for interpolation.
 */
export const CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS =
    [0.70, 0.80, 0.88] as const;

export interface CloudDirectionalSkyPhaseAnchors {
    readonly lowRgb: readonly [number, number, number];
    readonly middleRgb: readonly [number, number, number];
    readonly highRgb: readonly [number, number, number];
}

export interface CloudDirectionalSkyPhaseBandCache {
    readonly lower: CloudDirectionalSkyPhaseAnchors;
    readonly middle: CloudDirectionalSkyPhaseAnchors;
    readonly upper: CloudDirectionalSkyPhaseAnchors;
}

const mixFiniteNonnegative = (left: number, right: number, amount: number) =>
    finiteNonnegative(left) * (1 - amount) +
        finiteNonnegative(right) * amount;

const interpolateDirectionalSkyMaterialAnchors = (
    anchors: CloudDirectionalSkyPhaseAnchors,
    asymmetryRgb: readonly [number, number, number],
): [number, number, number] => {
    const [lowG, middleG, highG] = CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS;
    return [0, 1, 2].map((channel) => {
        const asymmetry = Math.min(highG, Math.max(
            lowG, Number.isFinite(asymmetryRgb[channel]) ?
                asymmetryRgb[channel] : lowG));
        if (asymmetry <= middleG) {
            return mixFiniteNonnegative(
                anchors.lowRgb[channel],
                anchors.middleRgb[channel],
                (asymmetry - lowG) / (middleG - lowG),
            );
        }
        return mixFiniteNonnegative(
            anchors.middleRgb[channel],
            anchors.highRgb[channel],
            (asymmetry - middleG) / (highG - middleG),
        );
    }) as [number, number, number];
};

/**
 * CPU contract for the WGSL cache lookup. Both altitude and material response
 * are piecewise-linear convex interpolations, so the lookup is continuous,
 * nonnegative, and cannot exceed the cached phase-integral endpoints.
 */
export const evaluateCloudDirectionalSkyPhaseBandCache = (
    cache: CloudDirectionalSkyPhaseBandCache,
    normalizedAltitude: number,
    asymmetryRgb: readonly [number, number, number],
): [number, number, number] => {
    const altitude = Math.min(1, Math.max(0,
        Number.isFinite(normalizedAltitude) ? normalizedAltitude : 0));
    const lowerBand = altitude <= 0.5;
    const first = lowerBand ? cache.lower : cache.middle;
    const second = lowerBand ? cache.middle : cache.upper;
    const bandAmount = lowerBand ? altitude * 2 : (altitude - 0.5) * 2;
    const altitudeAnchors: CloudDirectionalSkyPhaseAnchors = {
        lowRgb: [0, 1, 2].map((channel) => mixFiniteNonnegative(
            first.lowRgb[channel], second.lowRgb[channel], bandAmount,
        )) as [number, number, number],
        middleRgb: [0, 1, 2].map((channel) => mixFiniteNonnegative(
            first.middleRgb[channel], second.middleRgb[channel], bandAmount,
        )) as [number, number, number],
        highRgb: [0, 1, 2].map((channel) => mixFiniteNonnegative(
            first.highRgb[channel], second.highRgb[channel], bandAmount,
        )) as [number, number, number],
    };
    return interpolateDirectionalSkyMaterialAnchors(
        altitudeAnchors, asymmetryRgb);
};

/**
 * CPU reference for the production extinction-event source partition.
 *
 * `propagatedDiffuseIncidentRadianceRgb` is the P1/light-volume result. Its
 * boundary conditions already contain the sky and ground hemispheres and its
 * volume source already contains direct energy scattered into higher orders.
 * Therefore direct first order and propagated diffuse are added once, while
 * local single-scattering albedo is applied once to each path family.
 */
export const evaluateCloudSceneLinearSourcePartition = ({
    singleScatteringAlbedoRgb,
    directSources,
    propagatedDiffuseIncidentRadianceRgb,
}: {
    singleScatteringAlbedoRgb: readonly [number, number, number];
    directSources: readonly CloudSceneLinearDirectSource[];
    propagatedDiffuseIncidentRadianceRgb: readonly [number, number, number];
}): CloudSceneLinearSourcePartition => {
    const albedo = singleScatteringAlbedoRgb.map((value) =>
        Math.min(1, finiteNonnegative(value))) as [number, number, number];
    const directSingleScatteringRgb = [0, 1, 2].map((channel) =>
        directSources.reduce((sum, source) => sum +
            finiteNonnegative(source.incidentIrradianceRgb[channel]) *
            Math.min(1, finiteNonnegative(source.visibilityRgb[channel])) *
            albedo[channel] *
            finiteNonnegative(source.phaseRgbPerSteradian[channel]), 0),
    ) as [number, number, number];
    const propagatedDiffuseScatteringRgb = [0, 1, 2].map((channel) =>
        finiteNonnegative(propagatedDiffuseIncidentRadianceRgb[channel]) *
        albedo[channel],
    ) as [number, number, number];
    const totalSourceRadianceRgb = [0, 1, 2].map((channel) =>
        directSingleScatteringRgb[channel] +
        propagatedDiffuseScatteringRgb[channel],
    ) as [number, number, number];
    return {
        directSingleScatteringRgb,
        propagatedDiffuseScatteringRgb,
        totalSourceRadianceRgb,
    };
};

/**
 * CPU reference for the passive path-space closure used by WGSL.
 *
 * First-order energy is `omega * exp(-tau)`. Energy that has interacted at
 * least once is bounded by `omega² * (1-exp(-tau))`; normalized order weights
 * and relaxed Beer factors can only remove from that budget. Consequently the
 * directional phase integral of first plus higher orders never exceeds omega.
 */
export const evaluateCloudPassiveMultipleScatteringBudget = (
    singleScatteringAlbedoRgb: readonly number[],
    sourceOpticalDepth: number,
): CloudPassiveMultipleScatteringBudget => {
    const opticalDepth = Math.max(0, sourceOpticalDepth);
    const directTransfer = Math.exp(-opticalDepth);
    const firstOrderRgb = singleScatteringAlbedoRgb.map((value) =>
        Math.min(1, Math.max(0, value)) * directTransfer) as
        [number, number, number];
    const higherOrderAvailableRgb = singleScatteringAlbedoRgb.map((value) => {
        const albedo = Math.min(1, Math.max(0, value));
        return albedo * albedo * (1 - directTransfer);
    }) as [number, number, number];
    const higherOrderTransportRgb = [0, 1, 2].map((channel) => {
        const albedo = Math.min(1, Math.max(0,
            singleScatteringAlbedoRgb[channel]));
        let transport = 0;
        let orderWeight = 1 - CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
        let extinctionScale = CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        let orderSurvival = 1;
        for (let order = 0;
            order < CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT;
            order += 1) {
            transport += orderWeight * orderSurvival *
                Math.exp(-opticalDepth * extinctionScale);
            orderWeight *= CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
            extinctionScale *=
                CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
            orderSurvival *= albedo;
        }
        return higherOrderAvailableRgb[channel] * transport;
    }) as [number, number, number];
    const totalTransportRgb = firstOrderRgb.map((first, channel) =>
        first + higherOrderTransportRgb[channel]) as [number, number, number];
    return {
        firstOrderRgb,
        higherOrderAvailableRgb,
        higherOrderTransportRgb,
        totalTransportRgb,
    };
};

/**
 * Exact CPU reference for the shader's unresolved sparse-fibre path model.
 *
 * The two optical-depth members have an arithmetic mean equal to the resolved
 * optical depth. We return `-log(E[exp(-tau_i)])`, the Beer-equivalent depth of
 * that unresolved distribution. It is therefore passive, nonnegative, no
 * greater than the resolved homogeneous depth, and converges to the resolved
 * coefficient in the optically thin limit. It does not change condensate mass
 * or the camera/source extinction fields.
 */
export const cloudUnresolvedFootprintOpticalDepth = (
    resolvedOpticalDepthRgb: readonly number[],
    unresolvedIcePorosity: number,
    localVariance = 1,
    localCorrelation = 1,
): [number, number, number] => {
    const porosity = cloudUnresolvedFootprintPorosity(
        unresolvedIcePorosity,
        localVariance,
        localCorrelation,
    );
    const denseTauScale = (1 -
        porosity * CLOUD_THIN_ICE_SPARSE_TAU_SCALE) /
        Math.max(1e-4, 1 - porosity);
    return [0, 1, 2].map((channel) => {
        const tau = finiteNonnegative(resolvedOpticalDepthRgb[channel]);
        if (porosity <= 1e-12) return tau;
        const transmission =
            porosity * Math.exp(-tau * CLOUD_THIN_ICE_SPARSE_TAU_SCALE) +
            (1 - porosity) * Math.exp(-tau * denseTauScale);
        return -Math.log(Math.min(1, Math.max(Math.exp(-24), transmission)));
    }) as [number, number, number];
};

/**
 * Cosine-weighted open-sky transmittance for diffuse irradiance.
 *
 * A diffuse exterior field is an angular integral, not a vertical pencil ray.
 * The normalized first-order visibility is
 * `2 * integral_0^1 mu * exp(-tau(mu)) dmu`, where the sparse-ice footprint
 * model is evaluated on the actual slant optical depth `tau / mu`.
 */
export const cloudHemisphericDiffuseTransmittanceRgb = (
    resolvedOpticalDepthRgb: readonly number[],
    unresolvedIcePorosity: number,
): [number, number, number] => [0, 1, 2].map((channel) => {
    const tau = finiteNonnegative(resolvedOpticalDepthRgb[channel]);
    let transmittance = 0;
    for (let index = 0;
        index < CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES.length;
        index += 1) {
        const mu = CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES[index];
        const weight = CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS[index];
        const slantTau = cloudUnresolvedFootprintOpticalDepth(
            [tau / mu, tau / mu, tau / mu],
            unresolvedIcePorosity,
        )[0];
        transmittance += 2 * weight * mu * Math.exp(-slantTau);
    }
    return finiteUnit(transmittance);
}) as [number, number, number];

const evaluateCloudHemisphericDiffuseTransport = (
    singleScatteringAlbedoRgb: readonly [number, number, number],
    resolvedOpticalDepthRgb: readonly [number, number, number],
    unresolvedIcePorosity: number,
): CloudPassiveMultipleScatteringBudget => {
    const albedo = singleScatteringAlbedoRgb.map((value) =>
        finiteUnit(value)) as [number, number, number];
    const directTransfer = cloudHemisphericDiffuseTransmittanceRgb(
        resolvedOpticalDepthRgb,
        unresolvedIcePorosity,
    );
    const effectiveTau = cloudUnresolvedFootprintOpticalDepth(
        resolvedOpticalDepthRgb,
        unresolvedIcePorosity,
    );
    const firstOrderRgb = albedo.map((value, channel) =>
        value * directTransfer[channel]) as [number, number, number];
    const higherOrderAvailableRgb = albedo.map((value, channel) =>
        value * value * (1 - directTransfer[channel])) as
        [number, number, number];
    const higherOrderTransportRgb = [0, 1, 2].map((channel) => {
        let transport = 0;
        let orderWeight = 1 - CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
        let extinctionScale =
            CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        let orderSurvival = 1;
        for (let order = 0;
            order < CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT;
            order += 1) {
            transport += orderWeight * orderSurvival *
                Math.exp(-effectiveTau[channel] * extinctionScale);
            orderWeight *= CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
            extinctionScale *=
                CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
            orderSurvival *= albedo[channel];
        }
        return higherOrderAvailableRgb[channel] * transport;
    }) as [number, number, number];
    const totalTransportRgb = [0, 1, 2].map((channel) =>
        Math.min(albedo[channel],
            firstOrderRgb[channel] + higherOrderTransportRgb[channel])) as
        [number, number, number];
    return {
        firstOrderRgb,
        higherOrderAvailableRgb,
        higherOrderTransportRgb,
        totalTransportRgb,
    };
};

/**
 * Phase-integrated budget for receiver-local directional higher orders.
 * Complete DSM visibility attenuates external incident energy, while only the
 * receiver's finite-support depth can create local multiple scattering. A
 * remote shadow can therefore darken this source but can never create it.
 */
export const evaluateCloudLocalDirectionalHigherOrderBudget = ({
    singleScatteringAlbedoRgb,
    completeSourceVisibilityRgb,
    resolvedLocalOpticalDepthRgb,
    unresolvedIcePorosity,
}: {
    singleScatteringAlbedoRgb: readonly [number, number, number];
    completeSourceVisibilityRgb: readonly [number, number, number];
    resolvedLocalOpticalDepthRgb: readonly [number, number, number];
    unresolvedIcePorosity: number;
}): CloudLocalDirectionalHigherOrderBudget => {
    const resolvedLocal = finiteRgb(resolvedLocalOpticalDepthRgb);
    const effectiveLocal = cloudUnresolvedFootprintOpticalDepth(
        resolvedLocal, unresolvedIcePorosity);
    const albedo = singleScatteringAlbedoRgb.map((value) =>
        finiteUnit(value)) as [number, number, number];
    const completeVisibility = completeSourceVisibilityRgb.map((value) =>
        finiteUnit(value)) as [number, number, number];
    const completeTau = completeVisibility.map((value) =>
        -Math.log(Math.max(Math.exp(-24), value))) as
        [number, number, number];
    const externalSourceVisibilityRgb = completeTau.map((tau, channel) =>
        Math.exp(-Math.max(0, tau - effectiveLocal[channel]))) as
        [number, number, number];
    const higherOrderAvailableRgb = effectiveLocal.map((tau, channel) =>
        albedo[channel] ** 2 * Math.min(
            1 - completeVisibility[channel],
            (1 - Math.exp(-tau)) *
                externalSourceVisibilityRgb[channel],
        )) as [number, number, number];
    const higherOrderTransportRgb = effectiveLocal.map((tau, channel) => {
        let transport = 0;
        let orderWeight = 1 - CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
        let extinctionScale =
            CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        let orderSurvival = 1;
        for (let order = 0;
            order < CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT;
            order += 1) {
            transport += orderWeight * orderSurvival *
                Math.exp(-tau * extinctionScale);
            orderWeight *= CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION;
            extinctionScale *=
                CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
            orderSurvival *= albedo[channel];
        }
        return higherOrderAvailableRgb[channel] * transport;
    }) as [number, number, number];
    return {
        resolvedLocalOpticalDepthRgb: resolvedLocal,
        effectiveLocalOpticalDepthRgb: effectiveLocal,
        externalSourceVisibilityRgb,
        higherOrderAvailableRgb,
        higherOrderTransportRgb,
    };
};

const photopicRgb = (rgb: readonly number[]) =>
    finiteNonnegative(rgb[0]) * 0.2126 +
    finiteNonnegative(rgb[1]) * 0.7152 +
    finiteNonnegative(rgb[2]) * 0.0722;

/**
 * CPU reference for the nonresident atmosphere/ground diffuse partition.
 *
 * The directional coupling profile contains source-disc-free atmosphere
 * radiance over the complete sphere. Consequently its phase convolution owns
 * atmosphere first order once. Exact upper/lower irradiance supplies only the
 * unresolved higher orders; the separately evaluated Lambertian ground field
 * owns its complete first+higher closure. This is exhaustive without counting
 * lower-atmosphere radiance again as a ground-like first-order source.
 */
export const evaluateCloudFallbackDiffuseSourcePartition = ({
    singleScatteringAlbedoRgb,
    directionalAtmospherePhaseIntegralRgb,
    upperAtmosphereMeanRadianceRgb,
    lowerAtmosphereMeanRadianceRgb,
    groundMeanRadianceRgb,
    upperCloudOpticalDepth,
    lowerCloudOpticalDepth,
    unresolvedIcePorosity = 0,
}: {
    singleScatteringAlbedoRgb: readonly [number, number, number];
    /** Full-sphere integral of atmosphere radiance times the local phase. */
    directionalAtmospherePhaseIntegralRgb: readonly [number, number, number];
    /** Exact upper-hemisphere irradiance divided by pi. */
    upperAtmosphereMeanRadianceRgb: readonly [number, number, number];
    /** Exact lower-hemisphere atmosphere irradiance divided by pi. */
    lowerAtmosphereMeanRadianceRgb: readonly [number, number, number];
    /** Atmosphere-transported Lambertian ground radiance. */
    groundMeanRadianceRgb: readonly [number, number, number];
    upperCloudOpticalDepth: number | readonly [number, number, number];
    lowerCloudOpticalDepth: number | readonly [number, number, number];
    unresolvedIcePorosity?: number;
}): CloudFallbackDiffuseSourcePartition => {
    const opticalDepthRgb = (
        value: number | readonly [number, number, number],
    ): [number, number, number] => typeof value === "number"
        ? [finiteNonnegative(value), finiteNonnegative(value), finiteNonnegative(value)]
        : finiteRgb(value);
    const upperTau = opticalDepthRgb(upperCloudOpticalDepth);
    const lowerTau = opticalDepthRgb(lowerCloudOpticalDepth);
    const upperEnergy = photopicRgb(upperAtmosphereMeanRadianceRgb);
    const lowerEnergy = photopicRgb(lowerAtmosphereMeanRadianceRgb);
    const atmosphereEnergy = upperEnergy + lowerEnergy;
    const upperTransmittance = cloudHemisphericDiffuseTransmittanceRgb(
        upperTau,
        unresolvedIcePorosity,
    );
    const lowerTransmittance = cloudHemisphericDiffuseTransmittanceRgb(
        lowerTau,
        unresolvedIcePorosity,
    );
    const atmosphereFirstOrderTransmittanceRgb = [0, 1, 2].map((channel) => {
        const upperRadiance = finiteNonnegative(
            upperAtmosphereMeanRadianceRgb[channel]);
        const lowerRadiance = finiteNonnegative(
            lowerAtmosphereMeanRadianceRgb[channel]);
        const channelEnergy = upperRadiance + lowerRadiance;
        return channelEnergy > 1e-12
            ? (upperRadiance * upperTransmittance[channel] +
                lowerRadiance * lowerTransmittance[channel]) / channelEnergy
            : 0.5 * (upperTransmittance[channel] + lowerTransmittance[channel]);
    }) as [number, number, number];
    const photopicAtmosphereTransmittance = atmosphereEnergy > 1e-12
        ? photopicRgb([0, 1, 2].map((channel) =>
            (finiteNonnegative(upperAtmosphereMeanRadianceRgb[channel]) +
                finiteNonnegative(lowerAtmosphereMeanRadianceRgb[channel])) *
                atmosphereFirstOrderTransmittanceRgb[channel])) / atmosphereEnergy
        : photopicRgb(atmosphereFirstOrderTransmittanceRgb);
    const atmosphereFirstOrderOpticalDepth = -Math.log(Math.max(
        Math.exp(-CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH),
        Math.min(1, photopicAtmosphereTransmittance),
    ));
    const upperTransport = evaluateCloudHemisphericDiffuseTransport(
        singleScatteringAlbedoRgb,
        upperTau,
        unresolvedIcePorosity,
    );
    const lowerTransport = evaluateCloudHemisphericDiffuseTransport(
        singleScatteringAlbedoRgb,
        lowerTau,
        unresolvedIcePorosity,
    );
    const albedo = singleScatteringAlbedoRgb.map((value) =>
        Math.min(1, finiteNonnegative(value))) as [number, number, number];
    const atmosphereDirectionalFirstOrderRgb = [0, 1, 2].map((channel) =>
        finiteNonnegative(directionalAtmospherePhaseIntegralRgb[channel]) *
        albedo[channel] * atmosphereFirstOrderTransmittanceRgb[channel],
    ) as [number, number, number];
    const upperAtmosphereHigherOrderRgb = [0, 1, 2].map((channel) =>
        finiteNonnegative(upperAtmosphereMeanRadianceRgb[channel]) *
        upperTransport.higherOrderTransportRgb[channel],
    ) as [number, number, number];
    const lowerAtmosphereHigherOrderRgb = [0, 1, 2].map((channel) =>
        finiteNonnegative(lowerAtmosphereMeanRadianceRgb[channel]) *
        lowerTransport.higherOrderTransportRgb[channel],
    ) as [number, number, number];
    const groundFirstAndHigherOrderRgb = [0, 1, 2].map((channel) =>
        finiteNonnegative(groundMeanRadianceRgb[channel]) *
        lowerTransport.totalTransportRgb[channel],
    ) as [number, number, number];
    const totalDiffuseSourceRadianceRgb = [0, 1, 2].map((channel) =>
        atmosphereDirectionalFirstOrderRgb[channel] +
        upperAtmosphereHigherOrderRgb[channel] +
        lowerAtmosphereHigherOrderRgb[channel] +
        groundFirstAndHigherOrderRgb[channel],
    ) as [number, number, number];
    return {
        atmosphereFirstOrderOpticalDepth,
        atmosphereFirstOrderTransmittanceRgb,
        atmosphereDirectionalFirstOrderRgb,
        upperAtmosphereHigherOrderRgb,
        lowerAtmosphereHigherOrderRgb,
        groundFirstAndHigherOrderRgb,
        totalDiffuseSourceRadianceRgb,
    };
};

export interface LoadedCloudOptics {
    manifest: CloudOpticsManifest;
    phaseBytes: Uint8Array;
    parameterBytes: Uint8Array;
    rows: ReadonlyMap<string, CloudOpticsRow>;
}

interface GpuResourceLike {
    destroy?: () => void;
    createView?: (descriptor?: Record<string, unknown>) => unknown;
}

interface CloudOpticsGpuDevice {
    createTexture: (descriptor: Record<string, unknown>) => GpuResourceLike;
    createBuffer: (descriptor: Record<string, unknown>) => GpuResourceLike;
    createSampler: (descriptor: Record<string, unknown>) => GpuResourceLike;
    queue: {
        writeTexture: (
            destination: Record<string, unknown>,
            data: Uint8Array,
            dataLayout: Record<string, number>,
            size: Record<string, number>,
        ) => void;
        writeBuffer: (
            buffer: GpuResourceLike,
            bufferOffset: number,
            data: Uint8Array,
        ) => void;
    };
}

export interface UploadedCloudOptics {
    phaseTexture: GpuResourceLike;
    phaseSampler: GpuResourceLike;
    parameterBuffer: GpuResourceLike;
    manifest: CloudOpticsManifest;
    destroy: () => void;
}

const validateManifest = (candidate: unknown): CloudOpticsManifest => {
    if (!candidate || typeof candidate !== "object") {
        throw new Error("Cloud optics manifest is not an object");
    }
    const manifest = candidate as CloudOpticsManifest;
    if (manifest.schema !== "elements-cloud-optics" || manifest.version !== 1) {
        throw new Error(`Unsupported cloud optics ${manifest.schema}@${manifest.version}`);
    }
    if (
        manifest.phaseTexture?.format !== "rgba16float" ||
        manifest.phaseTexture?.encoding !== "log2-phase-per-steradian" ||
        manifest.parameterBuffer?.strideFloats !== CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS ||
        manifest.parameterBuffer?.strideBytes !== CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS * 4
    ) {
        throw new Error("Cloud optics manifest has an incompatible GPU layout");
    }
    const { width, height } = manifest.phaseTexture.dimensions;
    if (
        !Number.isInteger(width) || width < 128 ||
        height !== manifest.rows?.length ||
        manifest.phaseTexture.byteLength !== width * height * 8 ||
        manifest.parameterBuffer.byteLength !== height * CLOUD_OPTICS_PARAMETER_STRIDE_FLOATS * 4
    ) {
        throw new Error("Cloud optics byte lengths do not match the declared rows");
    }
    const ids = new Set<string>();
    for (const row of manifest.rows) {
        if (ids.has(row.id) || row.phaseRow < 0 || row.phaseRow >= height) {
            throw new Error(`Cloud optics row ${row.id} is duplicated or out of range`);
        }
        ids.add(row.id);
    }
    return manifest;
};

const fetchBytes = async (url: string, expectedBytes: number, signal?: AbortSignal) => {
    const response = await fetch(url, { cache: "force-cache", signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== expectedBytes) {
        throw new Error(`${url} contains ${bytes.byteLength} bytes; expected ${expectedBytes}`);
    }
    return bytes;
};

const sha256 = async (bytes: Uint8Array) => {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
};

let cachedOptics: Promise<LoadedCloudOptics> | undefined;

export const loadCloudOptics = ({
    manifestUrl = CLOUD_OPTICS_MANIFEST_URL,
    signal,
    verifyChecksums = true,
}: {
    manifestUrl?: string;
    signal?: AbortSignal;
    verifyChecksums?: boolean;
} = {}): Promise<LoadedCloudOptics> => {
    const cacheable = manifestUrl === CLOUD_OPTICS_MANIFEST_URL && !signal && verifyChecksums;
    if (cacheable && cachedOptics) return cachedOptics;
    const request = (async () => {
        const response = await fetch(manifestUrl, { cache: "force-cache", signal });
        if (!response.ok) throw new Error(`${manifestUrl} returned ${response.status}`);
        const manifest = validateManifest(await response.json());
        const baseUrl = new URL(manifestUrl, window.location.href);
        const [phaseBytes, parameterBytes] = await Promise.all([
            fetchBytes(new URL(manifest.phaseTexture.url, baseUrl).toString(), manifest.phaseTexture.byteLength, signal),
            fetchBytes(new URL(manifest.parameterBuffer.url, baseUrl).toString(), manifest.parameterBuffer.byteLength, signal),
        ]);
        if (verifyChecksums) {
            const [phaseChecksum, parameterChecksum] = await Promise.all([
                sha256(phaseBytes),
                sha256(parameterBytes),
            ]);
            if (phaseChecksum !== manifest.checksums.phaseTexture) {
                throw new Error("Cloud optical phase texture checksum mismatch");
            }
            if (parameterChecksum !== manifest.checksums.parameterBuffer) {
                throw new Error("Cloud optical parameter buffer checksum mismatch");
            }
        }
        return {
            manifest,
            phaseBytes,
            parameterBytes,
            rows: new Map(manifest.rows.map((row) => [row.id, row])),
        };
    })();
    if (cacheable) {
        cachedOptics = request.catch((error) => {
            cachedOptics = undefined;
            throw error;
        });
        return cachedOptics;
    }
    return request;
};

/** Uploads a filtering-safe phase LUT and a directly bindable state table. */
export const uploadCloudOptics = (
    device: CloudOpticsGpuDevice,
    loaded: LoadedCloudOptics,
    usage = {
        texture: 0x02 | 0x04, // GPUTextureUsage.COPY_DST | TEXTURE_BINDING
        buffer: 0x08 | 0x80, // GPUBufferUsage.COPY_DST | STORAGE
    },
): UploadedCloudOptics => {
    const { manifest } = loaded;
    const phaseTexture = device.createTexture({
        label: "cloud optical phase LUT (log2 per steradian)",
        size: manifest.phaseTexture.dimensions,
        dimension: "2d",
        format: manifest.phaseTexture.format,
        mipLevelCount: 1,
        usage: usage.texture,
    });
    device.queue.writeTexture(
        { texture: phaseTexture },
        loaded.phaseBytes,
        {
            offset: 0,
            bytesPerRow: manifest.phaseTexture.dimensions.width * 8,
            rowsPerImage: manifest.phaseTexture.dimensions.height,
        },
        manifest.phaseTexture.dimensions,
    );
    const parameterBuffer = device.createBuffer({
        label: "cloud optical state parameters",
        size: manifest.parameterBuffer.byteLength,
        usage: usage.buffer,
    });
    device.queue.writeBuffer(parameterBuffer, 0, loaded.parameterBytes);
    const phaseSampler = device.createSampler({
        label: "cloud optical phase LUT sampler",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "nearest",
    });
    return {
        phaseTexture,
        phaseSampler,
        parameterBuffer,
        manifest,
        destroy: () => {
            phaseTexture.destroy?.();
            parameterBuffer.destroy?.();
            phaseSampler.destroy?.();
        },
    };
};

const bracketRows = (
    rows: readonly CloudOpticsRow[],
    effectiveRadiusMicrons: number,
): { low: CloudOpticsRow; high: CloudOpticsRow; amount: number } => {
    const sorted = [...rows].sort((a, b) => a.effectiveRadiusMicrons - b.effectiveRadiusMicrons);
    if (!sorted.length) throw new Error("Cloud optical material has no radius rows");
    if (effectiveRadiusMicrons <= sorted[0].effectiveRadiusMicrons) {
        return { low: sorted[0], high: sorted[0], amount: 0 };
    }
    const last = sorted[sorted.length - 1];
    if (effectiveRadiusMicrons >= last.effectiveRadiusMicrons) {
        return { low: last, high: last, amount: 0 };
    }
    const highIndex = sorted.findIndex((row) => row.effectiveRadiusMicrons >= effectiveRadiusMicrons);
    const low = sorted[highIndex - 1];
    const high = sorted[highIndex];
    const amount = (
        Math.log(effectiveRadiusMicrons) - Math.log(low.effectiveRadiusMicrons)
    ) / (
        Math.log(high.effectiveRadiusMicrons) - Math.log(low.effectiveRadiusMicrons)
    );
    return { low, high, amount };
};

export interface CloudOpticsBlendInput {
    /** Condensate mass fraction in the ice phase, 0-1. */
    iceFraction: number;
    liquidEffectiveRadiusMicrons: number;
    iceEffectiveRadiusMicrons: number;
    iceHabit?: CloudIceHabit;
    iceRoughness?: CloudParticleRoughness;
}

export interface CloudOpticsBlend {
    rows: [number, number, number, number];
    /** Per-RGB scattering-coefficient weights; each channel sums to one. */
    phaseWeightsRgb: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];
    massExtinctionRgbM2PerKg: [number, number, number];
    singleScatteringAlbedoRgb: [number, number, number];
    asymmetryRgb: [number, number, number];
    resolved: {
        liquidEffectiveRadiusMicrons: number;
        iceEffectiveRadiusMicrons: number;
        iceHabit: CloudIceHabit;
        iceRoughness: CloudParticleRoughness;
        iceFraction: number;
    };
}

/**
 * Resolves radius interpolation and mixed phase without violating energy.
 * Phase weights use scattering coefficient, not a visual linear blend.
 */
export const resolveCloudOpticsBlend = (
    manifest: CloudOpticsManifest,
    input: CloudOpticsBlendInput,
): CloudOpticsBlend => {
    const iceHabit = input.iceHabit ?? "general";
    const iceRoughness = input.iceRoughness ?? "severe";
    const iceFraction = Math.min(1, Math.max(0, input.iceFraction));
    const liquid = bracketRows(
        manifest.rows.filter((row) => row.phase === "liquid"),
        input.liquidEffectiveRadiusMicrons,
    );
    const ice = bracketRows(
        manifest.rows.filter((row) =>
            row.phase === "ice" && row.habit === iceHabit && row.roughness === iceRoughness),
        input.iceEffectiveRadiusMicrons,
    );
    const selected = [liquid.low, liquid.high, ice.low, ice.high] as const;
    const massWeights = [
        (1 - iceFraction) * (1 - liquid.amount),
        (1 - iceFraction) * liquid.amount,
        iceFraction * (1 - ice.amount),
        iceFraction * ice.amount,
    ];
    const phaseWeightsRgb = [0, 1, 2].map((channel) => {
        const scattering = selected.map((row, index) =>
            massWeights[index] *
            row.massExtinctionRgbM2PerKg[channel] *
            row.singleScatteringAlbedoRgb[channel]);
        const total = scattering.reduce((sum, value) => sum + value, 0);
        return scattering.map((value) => total > 0 ? value / total : 0) as [number, number, number, number];
    }) as CloudOpticsBlend["phaseWeightsRgb"];
    const massExtinctionRgbM2PerKg = [0, 1, 2].map((channel) =>
        selected.reduce((sum, row, index) =>
            sum + massWeights[index] * row.massExtinctionRgbM2PerKg[channel], 0)) as [number, number, number];
    const singleScatteringAlbedoRgb = [0, 1, 2].map((channel) => {
        const scattering = selected.reduce((sum, row, index) =>
            sum + massWeights[index] * row.massExtinctionRgbM2PerKg[channel] *
                row.singleScatteringAlbedoRgb[channel], 0);
        return scattering / Math.max(1e-12, massExtinctionRgbM2PerKg[channel]);
    }) as [number, number, number];
    const asymmetryRgb = [0, 1, 2].map((channel) =>
        selected.reduce((sum, row, index) =>
            sum + phaseWeightsRgb[channel][index] * row.asymmetryRgb[channel], 0)) as [number, number, number];
    return {
        rows: selected.map((row) => row.phaseRow) as [number, number, number, number],
        phaseWeightsRgb,
        massExtinctionRgbM2PerKg,
        singleScatteringAlbedoRgb,
        asymmetryRgb,
        resolved: {
            liquidEffectiveRadiusMicrons: input.liquidEffectiveRadiusMicrons,
            iceEffectiveRadiusMicrons: input.iceEffectiveRadiusMicrons,
            iceHabit,
            iceRoughness,
            iceFraction,
        },
    };
};

/**
 * 32-float storage record for a cloud layer/system. Bind the phase texture and
 * sampler separately; this record contains all state-dependent mixing terms.
 */
export const packCloudOpticsBlend = (blend: CloudOpticsBlend) => new Float32Array([
    ...blend.rows,
    ...blend.phaseWeightsRgb[0],
    ...blend.phaseWeightsRgb[1],
    ...blend.phaseWeightsRgb[2],
    ...blend.massExtinctionRgbM2PerKg, 0,
    ...blend.singleScatteringAlbedoRgb, 0,
    ...blend.asymmetryRgb, 0,
    blend.resolved.liquidEffectiveRadiusMicrons,
    blend.resolved.iceEffectiveRadiusMicrons,
    blend.resolved.iceFraction,
    1,
]);

/** Exact WGSL coordinate for the endpoint-inclusive angular texture. */
export const cloudOpticsPhaseTextureCoordinate = (
    cosTheta: number,
    phaseRow: number,
    manifest: CloudOpticsManifest,
): [number, number] => {
    const { width, height } = manifest.phaseTexture.dimensions;
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    return [
        (0.5 + theta / Math.PI * (width - 1)) / width,
        (phaseRow + 0.5) / height,
    ];
};

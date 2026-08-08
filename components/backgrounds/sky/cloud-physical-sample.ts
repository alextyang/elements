import type {
    CloudMaterialModel,
    CloudSystemState,
} from "./cloud-state-map";

export type CloudVec3 = readonly [x: number, y: number, z: number];

export const CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION = 1 as const;

export const CLOUD_MATERIAL_CLASS_CODES = {
    "liquid-cloud": 1,
    "mixed-phase-cloud": 2,
    "ice-cloud": 3,
    "rain": 4,
    "snow": 5,
    "hail": 6,
    "aerosol-condensation": 7,
} as const;

export type CloudMaterialClass = keyof typeof CLOUD_MATERIAL_CLASS_CODES;

/**
 * Authoritative geometry handoff. Geometry describes bounded support and local
 * differential structure only; it does not invent optical coefficients.
 */
export interface CloudGeometrySample {
    support: number;
    density: number;
    signedDistanceKm: number;
    gradient: CloudVec3;
    closestSurfaceKm: CloudVec3;
    inverseCurvatureKm: number;
    seam01: number;
    localAltitudeFraction01: number;
}

export interface CloudFeatureSampleInput {
    id: string;
    parentOwnerId: string;
    materialClass?: CloudMaterialClass;
    densityMultiplier?: number;
    liquidMultiplier?: number;
    iceMultiplier?: number;
    precipitationMultiplier?: number;
    velocityOffsetKmPerSecond?: CloudVec3;
    ageOffsetSeconds?: number;
}

/**
 * Shared physical sample consumed by camera transport, light transport,
 * atmospheric shadows, hydrometeors, diagnostics, and reference transport.
 * All mass fields are local volumetric concentrations in g m^-3.
 */
export interface CloudPhysicalSample {
    schemaVersion: typeof CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION;
    support: number;
    density: number;
    gradient: CloudVec3;
    velocityKmPerSecond: CloudVec3;
    ageSeconds: number;
    liquidWaterContent: number;
    iceWaterContent: number;
    liquidEffectiveRadiusMicrons: number;
    iceEffectiveRadiusMicrons: number;
    precipitationSource: number;
    turbulence: number;
    temperatureKelvin: number;
    ownerId: number;
    featureId: number;
    materialClass: number;
    signedDistanceKm: number;
    closestSurfaceKm: CloudVec3;
    inverseCurvatureKm: number;
    seam01: number;
}

export interface ResolveCloudPhysicalSampleInput {
    owner: CloudSystemState;
    geometry: CloudGeometrySample;
    feature?: CloudFeatureSampleInput;
}

export interface CloudPhysicalSampleIssue {
    code: string;
    field: keyof CloudPhysicalSample | "feature" | "owner";
    message: string;
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));

const finite = (value: number, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;

const normalize = (value: CloudVec3): CloudVec3 => {
    const magnitude = Math.hypot(value[0], value[1], value[2]);
    return magnitude > 1e-8
        ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
        : [0, 1, 0];
};

/** Stable FNV-1a identifier; zero is reserved for "no feature". */
export const cloudStableNumericId = (value: string): number => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    const unsigned = hash >>> 0;
    return unsigned === 0 ? 1 : unsigned;
};

const materialClassFor = (
    materialModel: CloudMaterialModel,
    iceFraction: number,
): CloudMaterialClass => {
    if (materialModel === "fibrous-ice" || materialModel === "granular-ice" ||
        iceFraction >= 0.82) return "ice-cloud";
    if (materialModel === "deep-mixed-phase" ||
        materialModel === "mixed-phase-cellular" ||
        materialModel === "mixed-phase-sheet" ||
        iceFraction >= 0.18) return "mixed-phase-cloud";
    return "liquid-cloud";
};

const waterConcentration = (
    waterPathGramsPerSquareMetre: number,
    geometricDepthKm: number,
) => Math.max(0, waterPathGramsPerSquareMetre) /
    Math.max(1, geometricDepthKm * 1_000);

export const resolveCloudPhysicalSample = ({
    owner,
    geometry,
    feature,
}: ResolveCloudPhysicalSampleInput): CloudPhysicalSample => {
    if (feature && feature.parentOwnerId !== owner.id) {
        throw new Error(
            `Feature ${feature.id} is attached to ${feature.parentOwnerId}, ` +
            `not sampled owner ${owner.id}.`,
        );
    }

    const support = clamp(finite(geometry.support));
    const density = clamp(finite(geometry.density)) * support *
        Math.max(0, finite(feature?.densityMultiplier ?? 1, 1));
    const condensate = owner.physical.condensate;
    const liquidBase = waterConcentration(
        condensate.liquidWaterPath,
        owner.physical.geometricDepthKm,
    );
    const iceBase = waterConcentration(
        condensate.iceWaterPath,
        owner.physical.geometricDepthKm,
    );
    const liquidWaterContent = density * liquidBase *
        Math.max(0, finite(feature?.liquidMultiplier ?? 1, 1));
    const iceWaterContent = density * iceBase *
        Math.max(0, finite(feature?.iceMultiplier ?? 1, 1));
    const totalWater = liquidWaterContent + iceWaterContent;
    const iceFraction = totalWater > 1e-8 ? iceWaterContent / totalWater :
        clamp(1 - condensate.liquidFraction);

    const wind = owner.physical.kinematics;
    const direction = finite(wind.windDirection);
    const horizontalSpeedKmPerSecond = Math.max(0, finite(wind.windSpeed)) / 1_000;
    const verticalSpeedKmPerSecond = finite(
        owner.physical.thermodynamics.verticalVelocity,
    ) / 1_000;
    const featureVelocity = feature?.velocityOffsetKmPerSecond ?? [0, 0, 0];
    const velocity: CloudVec3 = [
        Math.sin(direction) * horizontalSpeedKmPerSecond + featureVelocity[0],
        verticalSpeedKmPerSecond + featureVelocity[1],
        Math.cos(direction) * horizontalSpeedKmPerSecond + featureVelocity[2],
    ];

    const altitudeFraction = clamp(finite(geometry.localAltitudeFraction01));
    const thermo = owner.physical.thermodynamics;
    const temperatureKelvin = thermo.baseTemperatureKelvin +
        (thermo.topTemperatureKelvin - thermo.baseTemperatureKelvin) *
        altitudeFraction;
    const precipitation = owner.physical.precipitation;
    const precipitationMultiplier = Math.max(
        0,
        finite(feature?.precipitationMultiplier ?? 1, 1),
    );
    const precipitationSource = density * Math.max(0, finite(precipitation.rate)) *
        precipitationMultiplier;
    const resolvedMaterial = feature?.materialClass ?? materialClassFor(
        owner.physical.condensate.liquidFraction <= 0.18
            ? "fibrous-ice"
            : owner.physical.condensate.liquidFraction < 0.82
                ? "deep-mixed-phase"
                : "liquid-convective",
        iceFraction,
    );

    return {
        schemaVersion: CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
        support,
        density,
        gradient: normalize(geometry.gradient),
        velocityKmPerSecond: velocity,
        ageSeconds: Math.max(
            0,
            finite(owner.lifecycle.ageSeconds) +
                finite(feature?.ageOffsetSeconds ?? 0),
        ),
        liquidWaterContent,
        iceWaterContent,
        liquidEffectiveRadiusMicrons: Math.max(
            0.1,
            finite(condensate.dropletEffectiveRadius, 10),
        ),
        iceEffectiveRadiusMicrons: Math.max(
            0.1,
            finite(condensate.iceEffectiveRadius, 35),
        ),
        precipitationSource,
        turbulence: clamp(
            finite(owner.physical.kinematics.turbulenceDissipation) /
                Math.max(1e-5, finite(owner.physical.kinematics.turbulenceIntegralScaleKm, 1)),
        ),
        temperatureKelvin: finite(temperatureKelvin, 273.15),
        ownerId: cloudStableNumericId(owner.id),
        featureId: feature ? cloudStableNumericId(feature.id) : 0,
        materialClass: CLOUD_MATERIAL_CLASS_CODES[resolvedMaterial],
        signedDistanceKm: finite(geometry.signedDistanceKm),
        closestSurfaceKm: geometry.closestSurfaceKm.map((component) =>
            finite(component)) as unknown as CloudVec3,
        inverseCurvatureKm: finite(geometry.inverseCurvatureKm),
        seam01: clamp(finite(geometry.seam01)),
    };
};

const numericFields: readonly (keyof CloudPhysicalSample)[] = [
    "schemaVersion", "support", "density", "ageSeconds",
    "liquidWaterContent", "iceWaterContent",
    "liquidEffectiveRadiusMicrons", "iceEffectiveRadiusMicrons",
    "precipitationSource", "turbulence", "temperatureKelvin",
    "ownerId", "featureId", "materialClass", "signedDistanceKm",
    "inverseCurvatureKm", "seam01",
];

export const validateCloudPhysicalSample = (
    sample: CloudPhysicalSample,
): readonly CloudPhysicalSampleIssue[] => {
    const issues: CloudPhysicalSampleIssue[] = [];
    const issue = (
        code: string,
        field: CloudPhysicalSampleIssue["field"],
        message: string,
    ) => issues.push({ code, field, message });

    if (sample.schemaVersion !== CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION) {
        issue("unsupported-schema", "schemaVersion",
            `Expected schema ${CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION}.`);
    }
    for (const field of numericFields) {
        if (!Number.isFinite(sample[field] as number)) {
            issue("non-finite", field, `${field} must be finite.`);
        }
    }
    for (const [field, vector] of [
        ["gradient", sample.gradient],
        ["velocityKmPerSecond", sample.velocityKmPerSecond],
        ["closestSurfaceKm", sample.closestSurfaceKm],
    ] as const) {
        if (vector.some((component) => !Number.isFinite(component))) {
            issue("non-finite-vector", field, `${field} must be finite.`);
        }
    }
    if (sample.support < 0 || sample.support > 1) {
        issue("out-of-range", "support", "Support must be in [0, 1].");
    }
    if (sample.density < 0 || sample.density > 1) {
        issue("out-of-range", "density", "Density must be in [0, 1].");
    }
    if (sample.liquidWaterContent < 0 || sample.iceWaterContent < 0) {
        issue("negative-condensate", "liquidWaterContent",
            "Liquid and ice condensate must be non-negative.");
    }
    if (sample.precipitationSource > 0 &&
        sample.liquidWaterContent + sample.iceWaterContent <= 0) {
        issue("ownerless-precipitation", "precipitationSource",
            "Precipitation requires condensate in the same physical sample.");
    }
    if (sample.ownerId === 0) {
        issue("missing-owner", "ownerId", "Owner ID zero is reserved.");
    }
    return issues;
};

export const cloudSampleExtinctionKm = (
    sample: CloudPhysicalSample,
): number => {
    const liquidRadiusMetres = sample.liquidEffectiveRadiusMicrons * 1e-6;
    const iceRadiusMetres = sample.iceEffectiveRadiusMicrons * 1e-6;
    const waterDensityKgPerM3 = sample.liquidWaterContent * 1e-3;
    const iceDensityKgPerM3 = sample.iceWaterContent * 1e-3;
    const liquidExtinctionPerMetre = liquidRadiusMetres > 0
        ? 3 * waterDensityKgPerM3 / (2 * 1_000 * liquidRadiusMetres)
        : 0;
    const iceExtinctionPerMetre = iceRadiusMetres > 0
        ? 3 * iceDensityKgPerM3 / (2 * 917 * iceRadiusMetres)
        : 0;
    return Math.max(0, (liquidExtinctionPerMetre + iceExtinctionPerMetre) * 1_000);
};

export const CLOUD_PHYSICAL_SAMPLE_WGSL = /* wgsl */ `
struct CloudPhysicalSampleV1 {
    support: f32,
    density: f32,
    gradient: vec3<f32>,
    velocity_km_s: vec3<f32>,
    age_seconds: f32,
    liquid_water_g_m3: f32,
    ice_water_g_m3: f32,
    liquid_radius_microns: f32,
    ice_radius_microns: f32,
    precipitation_source: f32,
    turbulence: f32,
    temperature_kelvin: f32,
    owner_id: u32,
    feature_id: u32,
    material_class: u32,
    signed_distance_km: f32,
    closest_surface_km: vec3<f32>,
    inverse_curvature_km: f32,
    seam_01: f32,
};
`;

/**
 * Mass-aware overlap composition for ordered multi-owner transport. Camera and
 * source rays can call this same function, preventing shadow/camera density
 * disagreement while retaining the dominant owner identity for diagnostics.
 */
export const combineCloudPhysicalSamples = (
    samples: readonly CloudPhysicalSample[],
): CloudPhysicalSample => {
    const active = samples.filter((sample) =>
        sample.support > 0 && sample.density > 0);
    if (active.length === 0) {
        return {
            schemaVersion: CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
            support: 0,
            density: 0,
            gradient: [0, 1, 0],
            velocityKmPerSecond: [0, 0, 0],
            ageSeconds: 0,
            liquidWaterContent: 0,
            iceWaterContent: 0,
            liquidEffectiveRadiusMicrons: 10,
            iceEffectiveRadiusMicrons: 35,
            precipitationSource: 0,
            turbulence: 0,
            temperatureKelvin: 273.15,
            ownerId: 1,
            featureId: 0,
            materialClass: CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"],
            signedDistanceKm: Number.POSITIVE_INFINITY,
            closestSurfaceKm: [0, 0, 0],
            inverseCurvatureKm: 0,
            seam01: 0,
        };
    }
    const weightFor = (sample: CloudPhysicalSample) => Math.max(
        1e-8,
        sample.liquidWaterContent + sample.iceWaterContent +
            sample.density * 0.001,
    );
    const totalWeight = active.reduce((sum, sample) =>
        sum + weightFor(sample), 0);
    const weighted = (selector: (sample: CloudPhysicalSample) => number) =>
        active.reduce((sum, sample) =>
            sum + selector(sample) * weightFor(sample), 0) / totalWeight;
    const weightedVector = (
        selector: (sample: CloudPhysicalSample) => CloudVec3,
    ): CloudVec3 => [0, 1, 2].map((axis) => active.reduce(
        (sum, sample) => sum + selector(sample)[axis] * weightFor(sample),
        0,
    ) / totalWeight) as unknown as CloudVec3;
    const dominant = [...active].sort((left, right) =>
        weightFor(right) - weightFor(left))[0];
    const closest = [...active].sort((left, right) =>
        left.signedDistanceKm - right.signedDistanceKm)[0];
    return {
        schemaVersion: CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
        support: 1 - active.reduce((clear, sample) =>
            clear * (1 - clamp(sample.support)), 1),
        density: 1 - active.reduce((clear, sample) =>
            clear * (1 - clamp(sample.density)), 1),
        gradient: normalize(weightedVector((sample) => sample.gradient)),
        velocityKmPerSecond: weightedVector((sample) =>
            sample.velocityKmPerSecond),
        ageSeconds: weighted((sample) => sample.ageSeconds),
        liquidWaterContent: active.reduce((sum, sample) =>
            sum + sample.liquidWaterContent, 0),
        iceWaterContent: active.reduce((sum, sample) =>
            sum + sample.iceWaterContent, 0),
        liquidEffectiveRadiusMicrons: weighted((sample) =>
            sample.liquidEffectiveRadiusMicrons),
        iceEffectiveRadiusMicrons: weighted((sample) =>
            sample.iceEffectiveRadiusMicrons),
        precipitationSource: active.reduce((sum, sample) =>
            sum + sample.precipitationSource, 0),
        turbulence: clamp(weighted((sample) => sample.turbulence)),
        temperatureKelvin: weighted((sample) => sample.temperatureKelvin),
        ownerId: dominant.ownerId,
        featureId: dominant.featureId,
        materialClass: dominant.materialClass,
        signedDistanceKm: closest.signedDistanceKm,
        closestSurfaceKm: closest.closestSurfaceKm,
        inverseCurvatureKm: weighted((sample) => sample.inverseCurvatureKm),
        seam01: clamp(weighted((sample) => sample.seam01)),
    };
};

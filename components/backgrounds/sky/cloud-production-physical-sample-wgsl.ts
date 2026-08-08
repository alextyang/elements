import {
    CLOUD_MATERIAL_CLASS_CODES,
    CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
    CLOUD_PHYSICAL_SAMPLE_WGSL,
    cloudStableNumericId,
    type CloudGeometrySample,
    type CloudPhysicalSample,
    type CloudVec3,
} from "./cloud-physical-sample";
import type { CloudProductionBuffersV1 } from "./cloud-production-buffers";
import {
    CLOUD_PRODUCTION_GPU_BINDINGS,
    CLOUD_PRODUCTION_GPU_WGSL,
} from "./cloud-production-gpu-runtime";
import {
    CLOUD_FEATURE_RECORD_V2_FLOATS,
    CLOUD_FEATURE_RECORD_V2_UINTS,
    CLOUD_OWNER_RECORD_V2_FLOATS,
    CLOUD_OWNER_RECORD_V2_UINTS,
} from "./cloud-system-abi-v2";

export const CLOUD_NO_FEATURE_INDEX_V1 = 0xffff_ffff;

export const CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2 = Object.freeze({
    centerEastKm: 0,
    centerAltitudeKm: 1,
    centerNorthKm: 2,
    radiusEastKm: 3,
    radiusAltitudeKm: 4,
    radiusNorthKm: 5,
    baseAltitudeKm: 6,
    geometricDepthKm: 7,
    boundaryTransitionKm: 8,
    orientationRadians: 9,
    velocityEastKmPerSecond: 10,
    velocityAltitudeKmPerSecond: 11,
    velocityNorthKmPerSecond: 12,
    liquidWaterPathGramsPerSquareMetre: 13,
    iceWaterPathGramsPerSquareMetre: 14,
    liquidEffectiveRadiusMicrons: 15,
    iceEffectiveRadiusMicrons: 16,
    baseTemperatureKelvin: 17,
    topTemperatureKelvin: 18,
    relativeHumidity01: 19,
    turbulenceDissipation: 20,
    lifecycleAgeSeconds: 21,
    lifecycleProgress01: 22,
    precipitationRate: 23,
} as const);

export const CLOUD_PRODUCTION_OWNER_UINT_LAYOUT_V2 = Object.freeze({
    abiSchemaVersion: 0,
    physicalSampleSchemaVersion: 1,
    ownerId: 2,
    topologyCode: 3,
    materialModelCode: 4,
    featureStart: 5,
    featureCount: 6,
    generation: 7,
} as const);

export const CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2 = Object.freeze({
    attachmentEastKm: 0,
    attachmentAltitudeKm: 1,
    attachmentNorthKm: 2,
    scaleEastKm: 3,
    scaleAltitudeKm: 4,
    scaleNorthKm: 5,
    orientationRadians: 6,
    lifecycleProgress01: 7,
    densityMultiplier: 8,
    liquidMultiplier: 9,
    iceMultiplier: 10,
    precipitationMultiplier: 11,
    velocityEastOffsetKmPerSecond: 12,
    velocityAltitudeOffsetKmPerSecond: 13,
    velocityNorthOffsetKmPerSecond: 14,
    ageOffsetSeconds: 15,
} as const);

export const CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2 = Object.freeze({
    featureId: 0,
    parentOwnerId: 1,
    enabled: 2,
    generation: 3,
    kindHash: 4,
    materialClassHash: 5,
} as const);

export const CLOUD_FEATURE_MATERIAL_HASHES = Object.freeze({
    "liquid-cloud": cloudStableNumericId("liquid-cloud"),
    "mixed-phase-cloud": cloudStableNumericId("mixed-phase-cloud"),
    "ice-cloud": cloudStableNumericId("ice-cloud"),
    rain: cloudStableNumericId("rain"),
    snow: cloudStableNumericId("snow"),
    hail: cloudStableNumericId("hail"),
    "aerosol-condensation": cloudStableNumericId("aerosol-condensation"),
} as const);

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const normalize = (value: CloudVec3): CloudVec3 => {
    const magnitude = Math.hypot(value[0], value[1], value[2]);
    return magnitude > 1e-8
        ? [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
        : [0, 1, 0];
};

const ownerMaterialClass = (materialModelCode: number): number => {
    if (materialModelCode === 1 || materialModelCode === 2) {
        return CLOUD_MATERIAL_CLASS_CODES["ice-cloud"];
    }
    if (materialModelCode === 3 || materialModelCode === 5 ||
        materialModelCode === 8) {
        return CLOUD_MATERIAL_CLASS_CODES["mixed-phase-cloud"];
    }
    return CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"];
};

const featureMaterialClass = (materialHash: number): number => {
    for (const [name, hash] of Object.entries(CLOUD_FEATURE_MATERIAL_HASHES)) {
        if (hash === materialHash) {
            return CLOUD_MATERIAL_CLASS_CODES[
                name as keyof typeof CLOUD_MATERIAL_CLASS_CODES
            ];
        }
    }
    return CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"];
};

export const resolvePackedCloudPhysicalSampleV1 = (
    buffers: CloudProductionBuffersV1,
    ownerIndex: number,
    geometry: CloudGeometrySample,
    featureIndex = CLOUD_NO_FEATURE_INDEX_V1,
): CloudPhysicalSample => {
    if (!Number.isInteger(ownerIndex) || ownerIndex < 0 ||
        ownerIndex >= buffers.ownerCount) {
        throw new RangeError(`Cloud owner index ${ownerIndex} is unavailable.`);
    }
    const ownerFloatOffset = ownerIndex * CLOUD_OWNER_RECORD_V2_FLOATS;
    const ownerUintOffset = ownerIndex * CLOUD_OWNER_RECORD_V2_UINTS;
    const ownerFloat = (field: number) =>
        buffers.ownerFloats[ownerFloatOffset + field];
    const ownerUint = (field: number) =>
        buffers.ownerUints[ownerUintOffset + field];
    const ownerId = ownerUint(CLOUD_PRODUCTION_OWNER_UINT_LAYOUT_V2.ownerId);

    let densityMultiplier = 1;
    let liquidMultiplier = 1;
    let iceMultiplier = 1;
    let precipitationMultiplier = 1;
    let velocityOffset: CloudVec3 = [0, 0, 0];
    let ageOffsetSeconds = 0;
    let featureId = 0;
    let materialClass = ownerMaterialClass(ownerUint(
        CLOUD_PRODUCTION_OWNER_UINT_LAYOUT_V2.materialModelCode,
    ));

    if (featureIndex !== CLOUD_NO_FEATURE_INDEX_V1 &&
        Number.isInteger(featureIndex) && featureIndex >= 0 &&
        featureIndex < buffers.featureCount) {
        const floatOffset = featureIndex * CLOUD_FEATURE_RECORD_V2_FLOATS;
        const uintOffset = featureIndex * CLOUD_FEATURE_RECORD_V2_UINTS;
        const featureFloat = (field: number) =>
            buffers.featureFloats[floatOffset + field];
        const featureUint = (field: number) =>
            buffers.featureUints[uintOffset + field];
        const enabled = featureUint(
            CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2.enabled,
        ) !== 0;
        const parentOwnerId = featureUint(
            CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2.parentOwnerId,
        );
        if (enabled && parentOwnerId === ownerId) {
            featureId = featureUint(
                CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2.featureId,
            );
            densityMultiplier = Math.max(0, featureFloat(
                CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2.densityMultiplier,
            ));
            liquidMultiplier = Math.max(0, featureFloat(
                CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2.liquidMultiplier,
            ));
            iceMultiplier = Math.max(0, featureFloat(
                CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2.iceMultiplier,
            ));
            precipitationMultiplier = Math.max(0, featureFloat(
                CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2
                    .precipitationMultiplier,
            ));
            velocityOffset = [
                featureFloat(CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2
                    .velocityEastOffsetKmPerSecond),
                featureFloat(CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2
                    .velocityAltitudeOffsetKmPerSecond),
                featureFloat(CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2
                    .velocityNorthOffsetKmPerSecond),
            ];
            ageOffsetSeconds = featureFloat(
                CLOUD_PRODUCTION_FEATURE_FLOAT_LAYOUT_V2.ageOffsetSeconds,
            );
            materialClass = featureMaterialClass(featureUint(
                CLOUD_PRODUCTION_FEATURE_UINT_LAYOUT_V2.materialClassHash,
            ));
        }
    }

    const support = clamp(geometry.support);
    const density = clamp(geometry.density) * support * densityMultiplier;
    const depthMetres = Math.max(1, ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.geometricDepthKm,
    ) * 1_000);
    const liquidWaterContent = density * ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
            .liquidWaterPathGramsPerSquareMetre,
    ) / depthMetres * liquidMultiplier;
    const iceWaterContent = density * ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
            .iceWaterPathGramsPerSquareMetre,
    ) / depthMetres * iceMultiplier;
    const altitudeFraction = clamp(geometry.localAltitudeFraction01);
    const baseTemperature = ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.baseTemperatureKelvin,
    );
    const topTemperature = ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.topTemperatureKelvin,
    );
    const precipitationSource = density * Math.max(0, ownerFloat(
        CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.precipitationRate,
    )) * precipitationMultiplier;

    return {
        schemaVersion: CLOUD_PHYSICAL_SAMPLE_SCHEMA_VERSION,
        support,
        density,
        gradient: normalize(geometry.gradient),
        velocityKmPerSecond: [
            ownerFloat(CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
                .velocityEastKmPerSecond) + velocityOffset[0],
            ownerFloat(CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
                .velocityAltitudeKmPerSecond) + velocityOffset[1],
            ownerFloat(CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
                .velocityNorthKmPerSecond) + velocityOffset[2],
        ],
        ageSeconds: Math.max(0, ownerFloat(
            CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.lifecycleAgeSeconds,
        ) + ageOffsetSeconds),
        liquidWaterContent,
        iceWaterContent,
        liquidEffectiveRadiusMicrons: Math.max(0.1, ownerFloat(
            CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
                .liquidEffectiveRadiusMicrons,
        )),
        iceEffectiveRadiusMicrons: Math.max(0.1, ownerFloat(
            CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2
                .iceEffectiveRadiusMicrons,
        )),
        precipitationSource,
        turbulence: clamp(ownerFloat(
            CLOUD_PRODUCTION_OWNER_FLOAT_LAYOUT_V2.turbulenceDissipation,
        )),
        temperatureKelvin: baseTemperature +
            (topTemperature - baseTemperature) * altitudeFraction,
        ownerId,
        featureId,
        materialClass,
        signedDistanceKm: geometry.signedDistanceKm,
        closestSurfaceKm: geometry.closestSurfaceKm,
        inverseCurvatureKm: geometry.inverseCurvatureKm,
        seam01: clamp(geometry.seam01),
    };
};

export interface CloudProductionPhysicalSampleWgslBindings {
    headerUints: number;
    ownerFloats: number;
    ownerUints: number;
    featureFloats: number;
    featureUints: number;
}

export interface CloudProductionPhysicalSampleWgslOptions {
    group: number;
    bindings?: Partial<CloudProductionPhysicalSampleWgslBindings>;
}

const unsigned = (value: number) => `${value >>> 0}u`;

export const createCloudProductionPhysicalSampleWgsl = (
    options: CloudProductionPhysicalSampleWgslOptions,
): string => {
    if (!Number.isInteger(options.group) || options.group < 0) {
        throw new RangeError("Cloud production bind group must be non-negative.");
    }
    const binding = {
        headerUints: options.bindings?.headerUints ??
            CLOUD_PRODUCTION_GPU_BINDINGS.headerUints,
        ownerFloats: options.bindings?.ownerFloats ??
            CLOUD_PRODUCTION_GPU_BINDINGS.ownerFloats,
        ownerUints: options.bindings?.ownerUints ??
            CLOUD_PRODUCTION_GPU_BINDINGS.ownerUints,
        featureFloats: options.bindings?.featureFloats ??
            CLOUD_PRODUCTION_GPU_BINDINGS.featureFloats,
        featureUints: options.bindings?.featureUints ??
            CLOUD_PRODUCTION_GPU_BINDINGS.featureUints,
    };
    if (new Set(Object.values(binding)).size !== Object.values(binding).length ||
        Object.values(binding).some((value) =>
            !Number.isInteger(value) || value < 0)) {
        throw new RangeError(
            "Cloud production physical-sample bindings must be unique non-negative integers.",
        );
    }
    return /* wgsl */ `
${CLOUD_PHYSICAL_SAMPLE_WGSL}
${CLOUD_PRODUCTION_GPU_WGSL}

@group(${options.group}) @binding(${binding.headerUints})
var<storage, read> cloud_production_header: CloudProductionHeaderV1;
@group(${options.group}) @binding(${binding.ownerFloats})
var<storage, read> cloud_production_owner_floats:
    array<CloudOwnerFloatRecordV2>;
@group(${options.group}) @binding(${binding.ownerUints})
var<storage, read> cloud_production_owner_uints:
    array<CloudOwnerUintRecordV2>;
@group(${options.group}) @binding(${binding.featureFloats})
var<storage, read> cloud_production_feature_floats:
    array<CloudFeatureFloatRecordV2>;
@group(${options.group}) @binding(${binding.featureUints})
var<storage, read> cloud_production_feature_uints:
    array<CloudFeatureUintRecordV2>;

struct CloudProductionGeometrySampleV1 {
    support: f32,
    density: f32,
    gradient: vec3<f32>,
    local_altitude_fraction_01: f32,
    signed_distance_km: f32,
    closest_surface_km: vec3<f32>,
    inverse_curvature_km: f32,
    seam_01: f32,
};

fn cloud_production_safe_normalize(value: vec3<f32>) -> vec3<f32> {
    let magnitude = length(value);
    if (magnitude > 1e-8) {
        return value / magnitude;
    }
    return vec3<f32>(0.0, 1.0, 0.0);
}

fn cloud_production_owner_material_class(material_model_code: u32) -> u32 {
    if (material_model_code == 1u || material_model_code == 2u) {
        return ${CLOUD_MATERIAL_CLASS_CODES["ice-cloud"]}u;
    }
    if (material_model_code == 3u || material_model_code == 5u ||
        material_model_code == 8u) {
        return ${CLOUD_MATERIAL_CLASS_CODES["mixed-phase-cloud"]}u;
    }
    return ${CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"]}u;
}

fn cloud_production_feature_material_class(material_hash: u32) -> u32 {
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES["ice-cloud"])}) {
        return ${CLOUD_MATERIAL_CLASS_CODES["ice-cloud"]}u;
    }
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES["mixed-phase-cloud"])}) {
        return ${CLOUD_MATERIAL_CLASS_CODES["mixed-phase-cloud"]}u;
    }
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES.rain)}) {
        return ${CLOUD_MATERIAL_CLASS_CODES.rain}u;
    }
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES.snow)}) {
        return ${CLOUD_MATERIAL_CLASS_CODES.snow}u;
    }
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES.hail)}) {
        return ${CLOUD_MATERIAL_CLASS_CODES.hail}u;
    }
    if (material_hash == ${unsigned(CLOUD_FEATURE_MATERIAL_HASHES["aerosol-condensation"])}) {
        return ${CLOUD_MATERIAL_CLASS_CODES["aerosol-condensation"]}u;
    }
    return ${CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"]}u;
}

fn cloud_production_empty_sample_v1() -> CloudPhysicalSampleV1 {
    var result: CloudPhysicalSampleV1;
    result.support = 0.0;
    result.density = 0.0;
    result.gradient = vec3<f32>(0.0, 1.0, 0.0);
    result.velocity_km_s = vec3<f32>(0.0);
    result.age_seconds = 0.0;
    result.liquid_water_g_m3 = 0.0;
    result.ice_water_g_m3 = 0.0;
    result.liquid_radius_microns = 10.0;
    result.ice_radius_microns = 35.0;
    result.precipitation_source = 0.0;
    result.turbulence = 0.0;
    result.temperature_kelvin = 273.15;
    result.owner_id = 0u;
    result.feature_id = 0u;
    result.material_class = ${CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"]}u;
    result.signed_distance_km = 1e20;
    result.closest_surface_km = vec3<f32>(0.0);
    result.inverse_curvature_km = 0.0;
    result.seam_01 = 0.0;
    return result;
}

fn cloud_production_physical_sample_v1(
    owner_index: u32,
    feature_index: u32,
    geometry: CloudProductionGeometrySampleV1,
) -> CloudPhysicalSampleV1 {
    if (owner_index >= cloud_production_header.owner_count) {
        return cloud_production_empty_sample_v1();
    }
    let owner_f = cloud_production_owner_floats[owner_index].lanes;
    let owner_u = cloud_production_owner_uints[owner_index].lanes;
    let owner_id = owner_u[0].z;
    var density_multiplier = 1.0;
    var liquid_multiplier = 1.0;
    var ice_multiplier = 1.0;
    var precipitation_multiplier = 1.0;
    var velocity_offset = vec3<f32>(0.0);
    var age_offset_seconds = 0.0;
    var feature_id = 0u;
    var material_class = cloud_production_owner_material_class(owner_u[1].x);

    if (feature_index != ${unsigned(CLOUD_NO_FEATURE_INDEX_V1)} &&
        feature_index < cloud_production_header.feature_count) {
        let feature_f = cloud_production_feature_floats[feature_index].lanes;
        let feature_u = cloud_production_feature_uints[feature_index].lanes;
        let feature_enabled = feature_u[0].z != 0u;
        let feature_owned = feature_u[0].y == owner_id;
        if (feature_enabled && feature_owned) {
            feature_id = feature_u[0].x;
            density_multiplier = max(0.0, feature_f[2].x);
            liquid_multiplier = max(0.0, feature_f[2].y);
            ice_multiplier = max(0.0, feature_f[2].z);
            precipitation_multiplier = max(0.0, feature_f[2].w);
            velocity_offset = feature_f[3].xyz;
            age_offset_seconds = feature_f[3].w;
            material_class = cloud_production_feature_material_class(
                feature_u[1].y,
            );
        }
    }

    let support = clamp(geometry.support, 0.0, 1.0);
    let density = clamp(geometry.density, 0.0, 1.0) * support *
        density_multiplier;
    let depth_metres = max(1.0, owner_f[1].w * 1000.0);
    let liquid_water = density * owner_f[3].y / depth_metres *
        liquid_multiplier;
    let ice_water = density * owner_f[3].z / depth_metres * ice_multiplier;
    let altitude_fraction = clamp(
        geometry.local_altitude_fraction_01,
        0.0,
        1.0,
    );

    var result: CloudPhysicalSampleV1;
    result.support = support;
    result.density = density;
    result.gradient = cloud_production_safe_normalize(geometry.gradient);
    result.velocity_km_s = vec3<f32>(
        owner_f[2].z,
        owner_f[2].w,
        owner_f[3].x,
    ) + velocity_offset;
    result.age_seconds = max(0.0, owner_f[5].y + age_offset_seconds);
    result.liquid_water_g_m3 = liquid_water;
    result.ice_water_g_m3 = ice_water;
    result.liquid_radius_microns = max(0.1, owner_f[3].w);
    result.ice_radius_microns = max(0.1, owner_f[4].x);
    result.precipitation_source = density * max(0.0, owner_f[5].w) *
        precipitation_multiplier;
    result.turbulence = clamp(owner_f[5].x, 0.0, 1.0);
    result.temperature_kelvin = mix(
        owner_f[4].y,
        owner_f[4].z,
        altitude_fraction,
    );
    result.owner_id = owner_id;
    result.feature_id = feature_id;
    result.material_class = material_class;
    result.signed_distance_km = geometry.signed_distance_km;
    result.closest_surface_km = geometry.closest_surface_km;
    result.inverse_curvature_km = geometry.inverse_curvature_km;
    result.seam_01 = clamp(geometry.seam_01, 0.0, 1.0);
    return result;
}
`;
};

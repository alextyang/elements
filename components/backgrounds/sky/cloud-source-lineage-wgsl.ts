import {
    CLOUD_SOURCE_LINEAGE_BUFFER_BYTES,
    CLOUD_SOURCE_LINEAGE_HEADER_VEC4S,
    CLOUD_SOURCE_LINEAGE_MAX_RECORDS,
    CLOUD_SOURCE_LINEAGE_VEC4_STRIDE,
} from "./cloud-source-lineage-abi";

/** WebGPU's guaranteed `maxUniformBufferBindingSize` baseline. */
export const CLOUD_SOURCE_LINEAGE_BASELINE_UNIFORM_LIMIT_BYTES = 65_536;

/**
 * Fixed-layout, binding-free WGSL twin of cloud-source-lineage-abi.ts.
 *
 * The complete 9,472-byte payload fits below WebGPU's guaranteed 64 KiB
 * uniform-buffer limit. Keeping it uniform avoids consuming a ninth storage
 * buffer in the production fragment stage, whose existing eight bindings
 * already occupy WebGPU's baseline storage-buffer budget. The caller still
 * owns bind-group allocation; use `createCloudSourceLineageUniformDeclaration`
 * so a consumer cannot accidentally restore a storage-buffer declaration.
 */

export const CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL = /* wgsl */ `
struct CloudSourceLineageRecord {
    identity: vec4<f32>,
    ownership: vec4<f32>,
    classification: vec4<f32>,
    center_and_age: vec4<f32>,
    axis_and_extent: vec4<f32>,
    timing_and_transition: vec4<f32>,
    advection: vec4<f32>,
    emission: vec4<f32>,
    thermodynamics: vec4<f32>,
    composition: vec4<f32>,
    aerosol_extinction: vec4<f32>,
    aerosol_absorption: vec4<f32>,
    aerosol_scattering: vec4<f32>,
    lineage: vec4<f32>,
    owner_weights: vec4<f32>,
    support: vec4<f32>,
};

struct CloudSourceLineageUniform {
    header: array<vec4<f32>, ${CLOUD_SOURCE_LINEAGE_HEADER_VEC4S}>,
    records: array<CloudSourceLineageRecord, ${CLOUD_SOURCE_LINEAGE_MAX_RECORDS}>,
};

struct CloudSourceLineageSample {
    // support, source support, lineage support, event code
    source_lineage: vec4<f32>,
    // RGB extinction and aerosol asymmetry
    aerosol_extinction: vec4<f32>,
    // RGB absorption and authored Angstrom exponent
    aerosol_absorption: vec4<f32>,
    // RGB scattering and conservative source allocation
    aerosol_scattering: vec4<f32>,
    // water, ice, aerosol and aerosol-kind code
    composition: vec4<f32>,
    // east, up, north m/s and horizontal speed
    velocity: vec4<f32>,
    // record index, source index, parent owner, child owner
    ownership: vec4<f32>,
    // parent weight, child weight, union mode, transition progress
    density_control: vec4<f32>,
};
`;

/**
 * Declare the fixed payload at a caller-selected bind-group slot. This helper
 * is deliberately separate from `CLOUD_SOURCE_LINEAGE_WGSL`, preserving one
 * shared binding-free decoder for camera, shadow, and light-volume modules.
 */
export const createCloudSourceLineageUniformDeclaration = (
    group: number,
    binding: number,
    variableName = "cloud_source_lineage",
) => `
@group(${Math.max(0, Math.floor(group))}) @binding(${Math.max(0, Math.floor(binding))})
var<uniform> ${variableName}: CloudSourceLineageUniform;
`;

export const CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL = /* wgsl */ `
const CLOUD_SL_SCHEMA: f32 = 1.0;
const CLOUD_SL_MAX_RECORDS: u32 = ${CLOUD_SOURCE_LINEAGE_MAX_RECORDS}u;
const CLOUD_SL_RECORD_VEC4_STRIDE: f32 = ${CLOUD_SOURCE_LINEAGE_VEC4_STRIDE}.0;
const CLOUD_SL_EVENT_SPECIAL_ORIGIN: f32 = 1.0;
const CLOUD_SL_GEOMETRY_LINE: f32 = 2.0;
const CLOUD_SL_UNION_GENITUS: f32 = 1.0;
const CLOUD_SL_UNION_MUTATUS: f32 = 2.0;

fn cloud_sl_header_valid(header_0: vec4<f32>) -> bool {
    return abs(header_0.x - CLOUD_SL_SCHEMA) <= 0.25 &&
        abs(header_0.z - CLOUD_SL_RECORD_VEC4_STRIDE) <= 0.25 &&
        header_0.w >= 1.0 && header_0.w <= f32(CLOUD_SL_MAX_RECORDS) &&
        header_0.y >= 0.0 && header_0.y <= header_0.w;
}

fn cloud_sl_record_count(header_0: vec4<f32>, hard_limit: u32) -> u32 {
    if (!cloud_sl_header_valid(header_0)) {
        return 0u;
    }
    return min(
        CLOUD_SL_MAX_RECORDS,
        min(hard_limit, min(
            u32(max(0.0, round(header_0.w))),
            u32(max(0.0, round(header_0.y)))
        ))
    );
}

fn cloud_sl_seconds_from_snapshot(
    current_cloud_time_seconds: f32,
    header_2: vec4<f32>,
) -> f32 {
    return max(0.0, current_cloud_time_seconds - header_2.x);
}

fn cloud_sl_wendland_c2(radius: f32) -> f32 {
    if (radius >= 1.0) {
        return 0.0;
    }
    let clamped_radius = max(0.0, radius);
    let remaining = 1.0 - clamped_radius;
    let remaining_2 = remaining * remaining;
    return remaining_2 * remaining_2 * (1.0 + 4.0 * clamped_radius);
}

fn cloud_sl_zero_sample() -> CloudSourceLineageSample {
    var sample: CloudSourceLineageSample;
    sample.source_lineage = vec4<f32>(0.0);
    sample.aerosol_extinction = vec4<f32>(0.0);
    sample.aerosol_absorption = vec4<f32>(0.0);
    sample.aerosol_scattering = vec4<f32>(0.0);
    sample.composition = vec4<f32>(0.0);
    sample.velocity = vec4<f32>(0.0);
    sample.ownership = vec4<f32>(-1.0);
    sample.density_control = vec4<f32>(0.0);
    return sample;
}

// World position is east/altitude/north in kilometres. Time is seconds after
// the CPU snapshot; no camera, projection, exposure, or screen coordinate is
// observable here.
fn cloud_sl_sample_record(
    record: CloudSourceLineageRecord,
    world_position_east_altitude_north_km: vec3<f32>,
    seconds_from_snapshot: f32,
) -> CloudSourceLineageSample {
    var sample = cloud_sl_zero_sample();
    if (record.identity.x < 0.5 ||
        abs(record.identity.y - CLOUD_SL_SCHEMA) > 0.25) {
        return sample;
    }

    let event_code = round(record.identity.z);
    let geometry_code = round(record.identity.w);
    let is_source = event_code == CLOUD_SL_EVENT_SPECIAL_ORIGIN;
    let relative_time = max(0.0, seconds_from_snapshot);
    let resolved_age = max(0.0, record.center_and_age.w + relative_time);
    let center_time = select(relative_time, resolved_age, is_source);
    let advected_center = vec2<f32>(
        record.center_and_age.x + record.advection.x * center_time / 1000.0,
        record.center_and_age.z + record.advection.z * center_time / 1000.0,
    );
    let delta = world_position_east_altitude_north_km - vec3<f32>(
        advected_center.x,
        record.center_and_age.y,
        advected_center.y,
    );
    let along = delta.x * record.axis_and_extent.x +
        delta.z * record.axis_and_extent.y;
    let cross = -delta.x * record.axis_and_extent.y +
        delta.z * record.axis_and_extent.x;
    let major = max(0.02, record.axis_and_extent.z);
    let minor = max(0.02, record.axis_and_extent.w);
    let vertical = max(0.02, record.support.x);

    var normalized_radius: f32;
    if (geometry_code == CLOUD_SL_GEOMETRY_LINE) {
        let axial_outside = max(0.0, abs(along) - major) / minor;
        normalized_radius = length(vec3<f32>(
            axial_outside,
            cross / minor,
            delta.y / vertical,
        ));
    } else {
        normalized_radius = length(vec3<f32>(
            along / major,
            cross / minor,
            delta.y / vertical,
        ));
    }

    let support_weight = cloud_sl_wendland_c2(normalized_radius);
    let lifetime = max(1.0, record.timing_and_transition.y);
    let remaining = clamp(1.0 - resolved_age / lifetime, 0.0, 1.0);
    let lifecycle_weight = select(1.0, clamp(remaining / 0.15, 0.0, 1.0),
        is_source);
    let allocation = select(1.0, clamp(record.owner_weights.w, 0.0, 1.0),
        is_source);
    let weighted_support = support_weight * lifecycle_weight * allocation;

    sample.source_lineage = vec4<f32>(
        weighted_support,
        select(0.0, weighted_support, is_source),
        select(support_weight, 0.0, is_source),
        event_code,
    );
    sample.aerosol_extinction = vec4<f32>(
        max(record.aerosol_extinction.xyz, vec3<f32>(0.0)) * weighted_support,
        clamp(record.aerosol_extinction.w, -0.2, 0.98),
    );
    sample.aerosol_absorption = vec4<f32>(
        max(record.aerosol_absorption.xyz, vec3<f32>(0.0)) * weighted_support,
        record.aerosol_absorption.w,
    );
    sample.aerosol_scattering = vec4<f32>(
        max(record.aerosol_scattering.xyz, vec3<f32>(0.0)) * weighted_support,
        allocation,
    );
    sample.composition = record.composition;
    sample.velocity = record.advection;
    sample.ownership = record.ownership;
    sample.density_control = vec4<f32>(
        record.owner_weights.xyz,
        record.timing_and_transition.w,
    );
    return sample;
}

fn cloud_sl_record_affects_owner(
    record: CloudSourceLineageRecord,
    owner_index: u32,
) -> bool {
    let owner = f32(owner_index);
    return abs(record.ownership.z - owner) < 0.25 ||
        abs(record.ownership.w - owner) < 0.25;
}

// The normal renderer union is preserved outside the compact causal support.
// Inside it, genitus is a non-additive attached union and mutatus is a
// conservative parent-to-child partition. Neither path duplicates condensate.
fn cloud_sl_resolve_owner_density(
    existing_union_density: f32,
    parent_density: f32,
    child_density: f32,
    sample: CloudSourceLineageSample,
) -> f32 {
    let support_weight = clamp(sample.source_lineage.z, 0.0, 1.0);
    let mode = round(sample.density_control.z);
    if (mode == CLOUD_SL_UNION_GENITUS) {
        let attached_union = max(
            max(0.0, parent_density) * sample.density_control.x,
            max(0.0, child_density) * sample.density_control.y,
        );
        return mix(existing_union_density, attached_union, support_weight);
    }
    if (mode == CLOUD_SL_UNION_MUTATUS) {
        let partitioned_density =
            max(0.0, parent_density) * sample.density_control.x +
            max(0.0, child_density) * sample.density_control.y;
        return mix(existing_union_density, partitioned_density, support_weight);
    }
    return existing_union_density;
}

// Conservative sphere scheduling for the ordered event march. The exact
// compact evaluator remains authoritative, so curvature or a long line source
// can only add empty work here and can never be clipped by the scheduler.
fn cloud_sl_conservative_support_interval(
    record: CloudSourceLineageRecord,
    ray_origin_renderer_km: vec3<f32>,
    ray_direction_renderer: vec3<f32>,
    seconds_from_snapshot: f32,
    planet_radius_km: f32,
    far_limit_km: f32,
) -> vec2<f32> {
    let invalid_interval = vec2<f32>(far_limit_km, -far_limit_km);
    if (record.identity.x < 0.5 ||
        abs(record.identity.y - CLOUD_SL_SCHEMA) > 0.25) {
        return invalid_interval;
    }
    let is_source = round(record.identity.z) ==
        CLOUD_SL_EVENT_SPECIAL_ORIGIN;
    let relative_time = max(0.0, seconds_from_snapshot);
    let resolved_age = max(0.0, record.center_and_age.w + relative_time);
    if (is_source &&
        resolved_age >= max(1.0, record.timing_and_transition.y)) {
        return invalid_interval;
    }
    let center_time = select(relative_time, resolved_age, is_source);
    let center = vec3<f32>(
        record.center_and_age.x + record.advection.x * center_time / 1000.0,
        planet_radius_km + record.center_and_age.y,
        record.center_and_age.z + record.advection.z * center_time / 1000.0,
    );
    let major = max(0.02, record.axis_and_extent.z);
    let minor = max(0.02, record.axis_and_extent.w);
    let vertical = max(0.02, record.support.x);
    let line_radius = length(vec3<f32>(major, minor, vertical));
    let ellipsoid_radius = max(major, max(minor, vertical));
    let radius = select(
        ellipsoid_radius,
        line_radius,
        round(record.identity.w) == CLOUD_SL_GEOMETRY_LINE,
    ) + max(0.0, record.support.y);
    let offset = ray_origin_renderer_km - center;
    let a = dot(ray_direction_renderer, ray_direction_renderer);
    let half_b = dot(offset, ray_direction_renderer);
    let c = dot(offset, offset) - radius * radius;
    let discriminant = half_b * half_b - a * c;
    if (a <= 1e-12 || discriminant < 0.0) {
        return invalid_interval;
    }
    let root = sqrt(max(0.0, discriminant));
    let interval = vec2<f32>(
        max(0.0, (-half_b - root) / a),
        min(far_limit_km, (-half_b + root) / a),
    );
    return select(
        invalid_interval,
        interval,
        vec2<bool>(interval.y > interval.x),
    );
}
`;

export const CLOUD_SOURCE_LINEAGE_WGSL =
    `${CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL}\n${CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL}`;

// Compile-time TypeScript assertions mirrored by the focused contract tests.
// Keeping these next to the generated WGSL prevents the fixed shader layout
// from silently drifting away from the existing CPU byte ABI.
const CLOUD_SOURCE_LINEAGE_WGSL_LAYOUT_BYTES =
    (CLOUD_SOURCE_LINEAGE_HEADER_VEC4S +
        CLOUD_SOURCE_LINEAGE_MAX_RECORDS * CLOUD_SOURCE_LINEAGE_VEC4_STRIDE) * 16;
if (CLOUD_SOURCE_LINEAGE_WGSL_LAYOUT_BYTES !== CLOUD_SOURCE_LINEAGE_BUFFER_BYTES) {
    throw new Error("Cloud source-lineage CPU and WGSL layouts disagree");
}
if (CLOUD_SOURCE_LINEAGE_WGSL_LAYOUT_BYTES >
    CLOUD_SOURCE_LINEAGE_BASELINE_UNIFORM_LIMIT_BYTES) {
    throw new Error("Cloud source-lineage uniform exceeds baseline WebGPU limits");
}

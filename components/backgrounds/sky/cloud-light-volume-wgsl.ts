import {
    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS,
    CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG,
    CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
    CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
    CLOUD_LIGHT_VOLUME_SCHEMA,
    type CloudLightVolumeGridConfig,
} from "./cloud-light-volume.ts";

export const CLOUD_LIGHT_VOLUME_COMPUTE_BINDINGS = Object.freeze({
    uniforms: 0,
    bricks: 1,
    sources: 2,
    mediumExtinctionOutput: 3,
    mediumScatteringOutput: 4,
    directTransmittanceOutput: 5,
    mediumExtinction: 6,
    mediumScattering: 7,
    directTransmittance0: 8,
    directTransmittance1: 9,
    fluenceRead: 10,
    fluenceWrite: 11,
    boundaryIrradiance: 12,
    residualStatus: 13,
} as const);

export interface CloudLightVolumeComputeWgslOptions {
    config?: CloudLightVolumeGridConfig;
    /** Binding group reserved for the light-volume compute graph. */
    bindingGroup?: number;
    /** Defines cloud_lv_query_world_medium(vec3<f32>, u32). */
    worldMediumFunctionWgsl?: string;
    /**
     * Defines cloud_lv_query_source_world_medium(vec3<f32>, u32, f32,
     * vec3<f32>). A source-only implementation can keep expensive camera and
     * morphology graphs statically unreachable from source materialization.
     */
    sourceWorldMediumFunctionWgsl?: string;
    /** Defines cloud_lv_source_irradiance_at(vec3<f32>, u32). */
    sourceIrradianceFunctionWgsl?: string;
    /** Defines cloud_lv_project_face_irradiance(u32, u32). */
    boundaryProjectionFunctionWgsl?: string;
}

const EMPTY_WORLD_MEDIUM_QUERY = /* wgsl */ `
fn cloud_lv_owner_has_support_changing_modifier(owner_index: u32) -> bool {
    _ = owner_index;
    return false;
}
fn cloud_lv_owner_base_may_sample(
    world_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    _ = world_position_km;
    _ = owner_index;
    return false;
}
fn cloud_lv_owner_may_sample(
    world_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    return cloud_lv_owner_base_may_sample(world_position_km, owner_index);
}
fn cloud_lv_query_world_medium(
    world_position_km: vec3<f32>, owner_index: u32,
) -> CloudLvWorldMedium {
    _ = world_position_km;
    _ = owner_index;
    return CloudLvWorldMedium(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
}
`;

const DEFAULT_SOURCE_WORLD_MEDIUM_QUERY = /* wgsl */ `
fn cloud_lv_query_source_world_medium(
    world: vec3<f32>, owner_index: u32,
    ray_step_length_km: f32, ray_direction_world: vec3<f32>,
) -> CloudLvWorldMedium {
    _ = ray_step_length_km;
    _ = ray_direction_world;
    if (!cloud_lv_owner_may_sample(world, owner_index)) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    return cloud_lv_query_world_medium(world, owner_index);
}
`;

const DEFAULT_SOURCE_IRRADIANCE = /* wgsl */ `
fn cloud_lv_source_irradiance_at(
    world_position_km: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    _ = world_position_km;
    return max(vec3<f32>(0.0), cloud_lv_sources[min(1u, source_index)]
        .irradiance_rgb.xyz);
}
`;

const DEFAULT_BOUNDARY_PROJECTION = /* wgsl */ `
fn cloud_lv_project_face_irradiance(
    brick_index: u32, face_index: u32,
) -> vec3<f32> {
    return max(vec3<f32>(0.0), cloud_lv_face_record(
        cloud_lv_bricks[brick_index], face_index).xyz);
}
`;

/**
 * Compute entries are deliberately bounded to one resident brick. Exact-query
 * material uses a cheap level-one eight-child support classifier, followed by
 * exact level-zero queries for every uncertain fine cell. Source material uses
 * pair-shaped dispatches but stores both exact y samples independently. Exact
 * queries and multigrid work are bounded to one local-z slab; the renderer advances
 * generation-wide support, exact material, source-medium, direct scan, and
 * four-level multigrid passes over multiple submissions so a refresh cannot
 * monopolize a presentation frame or expose a partially solved sibling halo.
 */
export const createCloudLightVolumeComputeWgsl = (
    options: CloudLightVolumeComputeWgslOptions = {},
) => {
    const config = options.config ?? CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG;
    const [width, height, depth] = config.dimensions;
    const directGuardX = Math.min(CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
        Math.max(0, Math.floor((width - 2) / 2)));
    const directGuardZ = Math.min(CLOUD_LIGHT_VOLUME_DIRECT_GUARD_CELLS,
        Math.max(0, Math.floor((depth - 2) / 2)));
    const maxBricks = config.maxBricks;
    const bindings = CLOUD_LIGHT_VOLUME_COMPUTE_BINDINGS;
    const group = options.bindingGroup ?? 0;
    return /* wgsl */ `
const CLOUD_LV_SCHEMA: u32 = ${CLOUD_LIGHT_VOLUME_SCHEMA}u;
const CLOUD_LV_WIDTH: u32 = ${width}u;
const CLOUD_LV_HEIGHT: u32 = ${height}u;
const CLOUD_LV_DEPTH: u32 = ${depth}u;
const CLOUD_LV_DIRECT_GUARD_X: u32 = ${directGuardX}u;
const CLOUD_LV_DIRECT_GUARD_Z: u32 = ${directGuardZ}u;
const CLOUD_LV_MAX_BRICKS: u32 = ${maxBricks}u;
const CLOUD_LV_MULTIGRID_LEVELS: u32 = 4u;
const CLOUD_LV_PACKED_FIELDS: u32 = 3u;
const CLOUD_LV_BOUNDARY_INTERNAL: u32 = 0u;
const CLOUD_LV_BOUNDARY_EXTERIOR: u32 = 1u;
const CLOUD_LV_BOUNDARY_TRUNCATED: u32 = 2u;
const CLOUD_LV_SCHEMA_MASK: u32 = 255u;
const CLOUD_LV_FILTERED_MEDIUM_BIT: u32 = 256u;
const CLOUD_LV_PAIRED_DIRECT_Y_BIT: u32 = 512u;
const CLOUD_LV_RESIDENT_SOURCE_MEDIUM_BIT: u32 = 1024u;
const CLOUD_LV_P1_ELIGIBLE_BIT: u32 =
    ${CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG}u;
const CLOUD_LV_KNOWN_METADATA_MASK: u32 = CLOUD_LV_SCHEMA_MASK |
    CLOUD_LV_FILTERED_MEDIUM_BIT | CLOUD_LV_PAIRED_DIRECT_Y_BIT |
    CLOUD_LV_RESIDENT_SOURCE_MEDIUM_BIT | CLOUD_LV_P1_ELIGIBLE_BIT;

struct CloudLvUniforms {
    dimensions_max_bricks: vec4<u32>,
    counts_work_slab: vec4<u32>,
    solver: vec4<f32>,
    level_bank_io: vec4<u32>,
};
struct CloudLvTransform {
    origin_active: vec4<f32>,
    axis_x_cell: vec4<f32>, axis_y_cell: vec4<f32>, axis_z_cell: vec4<f32>,
};
struct CloudLvBrick {
    diffusion: CloudLvTransform, direct_0: CloudLvTransform,
    direct_1: CloudLvTransform, owner_atlas_tau_schema: vec4<f32>,
    face_pos_x: vec4<f32>, face_neg_x: vec4<f32>,
    face_pos_y: vec4<f32>, face_neg_y: vec4<f32>,
    face_pos_z: vec4<f32>, face_neg_z: vec4<f32>,
};
struct CloudLvSource {
    direction_active: vec4<f32>, irradiance_rgb: vec4<f32>,
};
struct CloudLvWorldMedium {
    extinction_rgb_per_km: vec3<f32>, scattering_rgb_per_km: vec3<f32>,
    asymmetry_rgb: vec3<f32>, occupancy: f32,
};
struct CloudLvEquationTerms { numerator: vec3<f32>, denominator: vec3<f32> };
struct CloudLvHalo {
    is_active: u32, fluence: vec3<f32>, diffusion: vec3<f32>,
};
struct CloudLvResidualStatus {
    maximum_normalized_residual_bits: atomic<u32>,
    non_finite_count: atomic<u32>,
    energy_violation_count: atomic<u32>,
    occupied_count: atomic<u32>,
    maximum_fluence_r_bits: atomic<u32>,
    maximum_fluence_g_bits: atomic<u32>,
    maximum_fluence_b_bits: atomic<u32>,
    maximum_numerator_r_bits: atomic<u32>,
    maximum_numerator_g_bits: atomic<u32>,
    maximum_numerator_b_bits: atomic<u32>,
    maximum_denominator_r_bits: atomic<u32>,
    maximum_denominator_g_bits: atomic<u32>,
    maximum_denominator_b_bits: atomic<u32>,
    maximum_boundary_r_bits: atomic<u32>,
    maximum_boundary_g_bits: atomic<u32>,
    maximum_boundary_b_bits: atomic<u32>,
    maximum_candidate_r_bits: atomic<u32>,
    maximum_candidate_g_bits: atomic<u32>,
    maximum_candidate_b_bits: atomic<u32>,
    near_storage_rail_count: atomic<u32>,
};

@group(${group}) @binding(${bindings.uniforms}) var<uniform>
    cloud_lv_uniforms: CloudLvUniforms;
@group(${group}) @binding(${bindings.bricks}) var<storage, read>
    cloud_lv_bricks: array<CloudLvBrick>;
@group(${group}) @binding(${bindings.sources}) var<storage, read>
    cloud_lv_sources: array<CloudLvSource>;
@group(${group}) @binding(${bindings.mediumExtinctionOutput})
    var cloud_lv_medium_extinction_output: texture_storage_3d<rgba16float, write>;
@group(${group}) @binding(${bindings.mediumScatteringOutput})
    var cloud_lv_medium_scattering_output: texture_storage_3d<rgba16float, write>;
@group(${group}) @binding(${bindings.directTransmittanceOutput})
    var cloud_lv_direct_output: texture_storage_3d<rgba16float, write>;
@group(${group}) @binding(${bindings.mediumExtinction})
    var cloud_lv_medium_extinction: texture_3d<f32>;
@group(${group}) @binding(${bindings.mediumScattering})
    var cloud_lv_medium_scattering: texture_3d<f32>;
@group(${group}) @binding(${bindings.directTransmittance0})
    var cloud_lv_direct_0: texture_3d<f32>;
@group(${group}) @binding(${bindings.directTransmittance1})
    var cloud_lv_direct_1: texture_3d<f32>;
@group(${group}) @binding(${bindings.fluenceRead})
    var cloud_lv_fluence_read: texture_3d<f32>;
@group(${group}) @binding(${bindings.fluenceWrite})
    var cloud_lv_fluence_write: texture_storage_3d<rgba16float, write>;
@group(${group}) @binding(${bindings.boundaryIrradiance})
    var<storage, read_write> cloud_lv_boundary_irradiance: array<vec4<f32>>;
@group(${group}) @binding(${bindings.residualStatus})
    var<storage, read_write> cloud_lv_residual_status: CloudLvResidualStatus;

fn cloud_lv_active_brick_count() -> u32 {
    return min(CLOUD_LV_MAX_BRICKS, cloud_lv_uniforms.counts_work_slab.x);
}
fn cloud_lv_work_brick_index() -> u32 {
    return min(CLOUD_LV_MAX_BRICKS - 1u, cloud_lv_uniforms.counts_work_slab.y);
}
fn cloud_lv_level() -> u32 {
    return min(CLOUD_LV_MULTIGRID_LEVELS - 1u,
        cloud_lv_uniforms.level_bank_io.x);
}
fn cloud_lv_level_scale(level: u32) -> f32 { return f32(1u << level); }
fn cloud_lv_level_dimensions(level: u32) -> vec3<u32> {
    return max(vec3<u32>(1u),
        vec3<u32>(CLOUD_LV_WIDTH, CLOUD_LV_HEIGHT, CLOUD_LV_DEPTH) >>
            vec3<u32>(level));
}
fn cloud_lv_level_atlas_depth(level: u32) -> u32 {
    return cloud_lv_level_dimensions(level).z * CLOUD_LV_MAX_BRICKS;
}
fn cloud_lv_slab_local_z(invocation_z: u32) -> u32 {
    return cloud_lv_uniforms.counts_work_slab.z + invocation_z;
}
fn cloud_lv_slab_contains(local_z: u32, level: u32) -> bool {
    let start = cloud_lv_uniforms.counts_work_slab.z;
    let count = cloud_lv_uniforms.counts_work_slab.w;
    return local_z >= start && local_z < min(
        cloud_lv_level_dimensions(level).z, start + count);
}
fn cloud_lv_work_coordinate(
    local: vec3<u32>, brick_index: u32, level: u32,
) -> vec3<i32> {
    return vec3<i32>(i32(local.x), i32(local.y),
        i32(local.z + brick_index * cloud_lv_level_dimensions(level).z));
}
fn cloud_lv_fluence_coordinate(
    local: vec3<u32>, brick_index: u32, level: u32, packed: bool,
) -> vec3<i32> {
    var z = local.z + brick_index * cloud_lv_level_dimensions(level).z;
    if (packed) {
        z += cloud_lv_uniforms.level_bank_io.y * CLOUD_LV_PACKED_FIELDS *
            cloud_lv_level_atlas_depth(level);
    }
    return vec3<i32>(i32(local.x), i32(local.y), i32(z));
}
fn cloud_lv_world_position_level(
    transform: CloudLvTransform, local_center: vec3<f32>, level: u32,
) -> vec3<f32> {
    let scale = cloud_lv_level_scale(level);
    return transform.origin_active.xyz +
        transform.axis_x_cell.xyz * (local_center.x * transform.axis_x_cell.w * scale) +
        transform.axis_y_cell.xyz * (local_center.y * transform.axis_y_cell.w * scale) +
        transform.axis_z_cell.xyz * (local_center.z * transform.axis_z_cell.w * scale);
}
fn cloud_lv_world_position(
    transform: CloudLvTransform, local_center: vec3<f32>,
) -> vec3<f32> { return cloud_lv_world_position_level(transform, local_center, 0u); }
fn cloud_lv_local_center_level(
    transform: CloudLvTransform, world_position_km: vec3<f32>, level: u32,
) -> vec3<f32> {
    let delta = world_position_km - transform.origin_active.xyz;
    let fine = vec3<f32>(
        dot(delta, transform.axis_x_cell.xyz) / max(1e-8, transform.axis_x_cell.w),
        dot(delta, transform.axis_y_cell.xyz) / max(1e-8, transform.axis_y_cell.w),
        dot(delta, transform.axis_z_cell.xyz) / max(1e-8, transform.axis_z_cell.w));
    return fine / cloud_lv_level_scale(level) - vec3<f32>(0.5);
}
fn cloud_lv_local_center(
    transform: CloudLvTransform, world_position_km: vec3<f32>,
) -> vec3<f32> { return cloud_lv_local_center_level(transform, world_position_km, 0u); }
fn cloud_lv_direct_transform(
    brick: CloudLvBrick, source_index: u32,
) -> CloudLvTransform {
    if (source_index == 0u) { return brick.direct_0; }
    return brick.direct_1;
}
fn cloud_lv_owner_index(brick_index: u32) -> u32 {
    return u32(max(0.0, round(
        cloud_lv_bricks[brick_index].owner_atlas_tau_schema.x)));
}
fn cloud_lv_sampling_word(brick: CloudLvBrick) -> u32 {
    let raw = brick.owner_atlas_tau_schema.w;
    if (!(raw >= 0.0 && raw <= f32(CLOUD_LV_KNOWN_METADATA_MASK) &&
        raw == floor(raw))) {
        return 0xffffffffu;
    }
    return u32(raw);
}
fn cloud_lv_sampling_word_is_valid(word: u32) -> bool {
    let schema_matches = (word & CLOUD_LV_SCHEMA_MASK) == CLOUD_LV_SCHEMA;
    let has_only_known_bits = (word & ~CLOUD_LV_KNOWN_METADATA_MASK) == 0u;
    let filtered = (word & CLOUD_LV_FILTERED_MEDIUM_BIT) != 0u;
    let paired = (word & CLOUD_LV_PAIRED_DIRECT_Y_BIT) != 0u;
    return schema_matches && has_only_known_bits && (!paired || filtered);
}
fn cloud_lv_filtered_medium_safe(brick: CloudLvBrick) -> bool {
    let word = cloud_lv_sampling_word(brick);
    return cloud_lv_sampling_word_is_valid(word) &&
        (word & CLOUD_LV_FILTERED_MEDIUM_BIT) != 0u;
}
fn cloud_lv_paired_direct_y_safe(brick: CloudLvBrick) -> bool {
    let word = cloud_lv_sampling_word(brick);
    return cloud_lv_sampling_word_is_valid(word) &&
        (word & CLOUD_LV_FILTERED_MEDIUM_BIT) != 0u &&
        (word & CLOUD_LV_PAIRED_DIRECT_Y_BIT) != 0u;
}
fn cloud_lv_resident_source_medium_safe(brick: CloudLvBrick) -> bool {
    let word = cloud_lv_sampling_word(brick);
    return cloud_lv_sampling_word_is_valid(word) &&
        (word & CLOUD_LV_RESIDENT_SOURCE_MEDIUM_BIT) != 0u;
}
fn cloud_lv_p1_eligible(brick: CloudLvBrick) -> bool {
    let word = cloud_lv_sampling_word(brick);
    return cloud_lv_sampling_word_is_valid(word) &&
        (word & CLOUD_LV_P1_ELIGIBLE_BIT) != 0u;
}
fn cloud_lv_representative_brick_index(brick_index: u32) -> u32 {
    let owner = cloud_lv_owner_index(brick_index);
    for (var previous = 0u; previous < CLOUD_LV_MAX_BRICKS; previous += 1u) {
        if (previous >= brick_index || previous >= cloud_lv_active_brick_count()) {
            break;
        }
        if (cloud_lv_owner_index(previous) == owner) { return previous; }
    }
    return brick_index;
}
fn cloud_lv_face_record(brick: CloudLvBrick, face_index: u32) -> vec4<f32> {
    if (face_index == 0u) { return brick.face_pos_x; }
    if (face_index == 1u) { return brick.face_neg_x; }
    if (face_index == 2u) { return brick.face_pos_y; }
    if (face_index == 3u) { return brick.face_neg_y; }
    if (face_index == 4u) { return brick.face_pos_z; }
    return brick.face_neg_z;
}
fn cloud_lv_transport_diffusion(
    extinction: vec3<f32>, scattering: vec3<f32>, asymmetry: f32,
) -> vec3<f32> {
    let sigma_t = max(vec3<f32>(0.0), extinction);
    let sigma_s = clamp(scattering, vec3<f32>(0.0), sigma_t);
    let sigma_a = max(vec3<f32>(0.0), sigma_t - sigma_s);
    let sigma_tr = sigma_a + sigma_s * (1.0 - clamp(asymmetry, -0.99, 0.99));
    return 1.0 / max(vec3<f32>(3e-6), 3.0 * sigma_tr);
}
fn cloud_lv_marshak_coefficient(
    diffusion: vec3<f32>, cell_size: f32,
) -> vec3<f32> {
    let h = max(1e-8, cell_size);
    return (2.0 * diffusion / (h * h)) /
        (vec3<f32>(1.0) + 4.0 * diffusion / h);
}

${options.worldMediumFunctionWgsl ?? EMPTY_WORLD_MEDIUM_QUERY}
${options.sourceWorldMediumFunctionWgsl ?? DEFAULT_SOURCE_WORLD_MEDIUM_QUERY}
${options.sourceIrradianceFunctionWgsl ?? DEFAULT_SOURCE_IRRADIANCE}
${options.boundaryProjectionFunctionWgsl ?? DEFAULT_BOUNDARY_PROJECTION}

@compute @workgroup_size(6, 1, 1)
fn cloud_lv_project_boundary_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let brick_index = cloud_lv_work_brick_index();
    let face_index = invocation.x;
    if (face_index >= 6u || brick_index >= cloud_lv_active_brick_count()) { return; }
    if (!cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) {
        cloud_lv_boundary_irradiance[brick_index * 6u + face_index] =
            vec4<f32>(0.0);
        return;
    }
    let boundary_kind = cloud_lv_face_record(
        cloud_lv_bricks[brick_index], face_index).w;
    cloud_lv_boundary_irradiance[brick_index * 6u + face_index] = vec4<f32>(
        cloud_lv_project_face_irradiance(brick_index, face_index), boundary_kind);
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_materialize_medium_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    if (level != 1u) { return; }
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let local = vec3<u32>(invocation.xy, local_z);
    let atlas = cloud_lv_work_coordinate(local, brick_index, level);
    if (brick_index >= cloud_lv_active_brick_count()) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    let brick = cloud_lv_bricks[brick_index];
    if (!cloud_lv_p1_eligible(brick)) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    // Production uses level one as a conservative support classifier. Every
    // parent tests its eight exact fine child centers with the stripped atlas
    // majorant query. A zero alpha certifies the complete discrete block empty;
    // any point-wise uncertainty sends that child through the exact query below.
    if (!cloud_lv_filtered_medium_safe(brick)) {
        let owner_index = cloud_lv_owner_index(brick_index);
        // Keep unmodified/subtractive-only owners on the original one-record-
        // classification path. This branch is only a load optimization; it
        // never allows a support-changing owner to certify a whole block.
        let owner_has_support_modifier =
            cloud_lv_owner_has_support_changing_modifier(owner_index);
        var block_may_sample = false;
        for (var child_z = 0u; child_z < 2u; child_z += 1u) {
            for (var child_y = 0u; child_y < 2u; child_y += 1u) {
                for (var child_x = 0u; child_x < 2u; child_x += 1u) {
                    let fine_local = local * 2u +
                        vec3<u32>(child_x, child_y, child_z);
                    let child_world = cloud_lv_world_position(
                        brick.diffusion,
                        vec3<f32>(fine_local) + vec3<f32>(0.5));
                    var child_may_sample = false;
                    if (owner_has_support_modifier) {
                        child_may_sample = cloud_lv_owner_may_sample(
                            child_world, owner_index);
                    } else {
                        child_may_sample = cloud_lv_owner_base_may_sample(
                            child_world, owner_index);
                    }
                    block_may_sample = block_may_sample || child_may_sample;
                }
            }
        }
        textureStore(cloud_lv_medium_extinction_output, atlas,
            vec4<f32>(0.0, 0.0, 0.0, select(0.0, 1.0, block_may_sample)));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    let world = cloud_lv_world_position_level(
        brick.diffusion, vec3<f32>(local) + vec3<f32>(0.5), level);
    let query = cloud_lv_query_world_medium(
        world, u32(max(0.0, round(brick.owner_atlas_tau_schema.x))));
    let extinction = max(vec3<f32>(0.0), query.extinction_rgb_per_km);
    let scattering = clamp(query.scattering_rgb_per_km,
        vec3<f32>(0.0), extinction);
    let photopic_weights = vec3<f32>(0.2126, 0.7152, 0.0722);
    let scattering_energy = dot(scattering, photopic_weights);
    let mean_asymmetry = select(0.0, dot(scattering * clamp(
        query.asymmetry_rgb, vec3<f32>(-0.99), vec3<f32>(0.99)),
        photopic_weights) / max(1e-8, scattering_energy),
        scattering_energy > 1e-8);
    let occupancy_weight = select(0.0, clamp(query.occupancy, 0.0, 1.0),
        max(max(extinction.r, extinction.g), extinction.b) > cloud_lv_uniforms.solver.y);
    textureStore(cloud_lv_medium_extinction_output, atlas,
        vec4<f32>(extinction, occupancy_weight));
    textureStore(cloud_lv_medium_scattering_output, atlas,
        vec4<f32>(scattering, mean_asymmetry));
}

// Exact fine materialization is the fail-closed path. It preserves all eight
// children of every level-one cell whenever the CPU cannot prove that the
// complete block is smooth and support-resident. No neighboring center is
// allowed to stand in for a fibre, turret, precipitation shaft, or boundary.
@compute @workgroup_size(4, 4, 4)
fn cloud_lv_materialize_medium_fine_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    if (level != 0u) { return; }
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let local = vec3<u32>(invocation.xy, local_z);
    let atlas = cloud_lv_work_coordinate(local, brick_index, level);
    if (brick_index >= cloud_lv_active_brick_count()) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    let brick = cloud_lv_bricks[brick_index];
    if (!cloud_lv_p1_eligible(brick)) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    if (cloud_lv_filtered_medium_safe(brick)) { return; }
    let support_atlas = cloud_lv_work_coordinate(
        local / vec3<u32>(2u), brick_index, 1u);
    let block_may_sample = textureLoad(
        cloud_lv_medium_extinction, support_atlas, 0).a > 0.5;
    if (!block_may_sample) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    let world = cloud_lv_world_position(
        brick.diffusion, vec3<f32>(local) + vec3<f32>(0.5));
    let query = cloud_lv_query_world_medium(world, cloud_lv_owner_index(brick_index));
    let extinction = max(vec3<f32>(0.0), query.extinction_rgb_per_km);
    let scattering = clamp(query.scattering_rgb_per_km,
        vec3<f32>(0.0), extinction);
    let photopic_weights = vec3<f32>(0.2126, 0.7152, 0.0722);
    let scattering_energy = dot(scattering, photopic_weights);
    let mean_asymmetry = select(0.0, dot(scattering * clamp(
        query.asymmetry_rgb, vec3<f32>(-0.99), vec3<f32>(0.99)),
        photopic_weights) / max(1e-8, scattering_energy),
        scattering_energy > 1e-8);
    let occupancy_weight = select(0.0, clamp(query.occupancy, 0.0, 1.0),
        max(max(extinction.r, extinction.g), extinction.b) > cloud_lv_uniforms.solver.y);
    textureStore(cloud_lv_medium_extinction_output, atlas,
        vec4<f32>(extinction, occupancy_weight));
    textureStore(cloud_lv_medium_scattering_output, atlas,
        vec4<f32>(scattering, mean_asymmetry));
}

fn cloud_lv_minmod(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
    return select(vec3<f32>(0.0), sign(a) * min(abs(a), abs(b)), a * b >
        vec3<f32>(0.0));
}

fn cloud_lv_monotone_child(
    center: vec3<f32>, negative_x: vec3<f32>, positive_x: vec3<f32>,
    negative_y: vec3<f32>, positive_y: vec3<f32>,
    negative_z: vec3<f32>, positive_z: vec3<f32>, child_sign: vec3<f32>,
) -> vec3<f32> {
    let slope_x = cloud_lv_minmod(
        center - negative_x, positive_x - center);
    let slope_y = cloud_lv_minmod(
        center - negative_y, positive_y - center);
    let slope_z = cloud_lv_minmod(
        center - negative_z, positive_z - center);
    let lower = min(center, min(min(negative_x, positive_x),
        min(min(negative_y, positive_y), min(negative_z, positive_z))));
    let upper = max(center, max(max(negative_x, positive_x),
        max(max(negative_y, positive_y), max(negative_z, positive_z))));
    let maximum_delta = 0.25 *
        (abs(slope_x) + abs(slope_y) + abs(slope_z));
    let bounded_scale = select(
        vec3<f32>(1.0),
        min(vec3<f32>(1.0), min(
            (center - lower) / max(vec3<f32>(1e-8), maximum_delta),
            (upper - center) / max(vec3<f32>(1e-8), maximum_delta))),
        maximum_delta > vec3<f32>(1e-8));
    return center + 0.25 * bounded_scale *
        (child_sign.x * slope_x + child_sign.y * slope_y +
            child_sign.z * slope_z);
}

// Optional conservative monotone parent-cell reconstruction. Production fails
// closed to the exact fine path; this kernel is reachable only when a future
// classifier proves the complete owner support resident and optically smooth.
// Its eight-child mean is exactly the parent value and each child stays inside
// neighboring level-one extrema.
@compute @workgroup_size(4, 4, 4)
fn cloud_lv_prolongate_medium_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let destination_level = cloud_lv_level();
    if (destination_level != 0u) { return; }
    let dimensions = cloud_lv_level_dimensions(destination_level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, destination_level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let local = vec3<u32>(invocation.xy, local_z);
    let atlas = cloud_lv_work_coordinate(local, brick_index, destination_level);
    if (brick_index >= cloud_lv_active_brick_count()) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    if (!cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) {
        textureStore(cloud_lv_medium_extinction_output, atlas, vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output, atlas, vec4<f32>(0.0));
        return;
    }
    if (!cloud_lv_filtered_medium_safe(cloud_lv_bricks[brick_index])) {
        // The exact fine pass already owns mip zero for this brick.
        return;
    }
    let source_level = 1u;
    let source_dimensions_i = vec3<i32>(
        cloud_lv_level_dimensions(source_level));
    let parent = vec3<i32>(local / vec3<u32>(2u));
    let sample_coordinate = array<vec3<i32>, 7>(
        parent,
        clamp(parent + vec3<i32>(-1, 0, 0), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
        clamp(parent + vec3<i32>(1, 0, 0), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
        clamp(parent + vec3<i32>(0, -1, 0), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
        clamp(parent + vec3<i32>(0, 1, 0), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
        clamp(parent + vec3<i32>(0, 0, -1), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
        clamp(parent + vec3<i32>(0, 0, 1), vec3<i32>(0),
            source_dimensions_i - vec3<i32>(1)),
    );
    var extinction_samples: array<vec4<f32>, 7>;
    var scattering_samples: array<vec4<f32>, 7>;
    for (var sample_index = 0u; sample_index < 7u; sample_index += 1u) {
        let sample_atlas = cloud_lv_work_coordinate(
            vec3<u32>(sample_coordinate[sample_index]),
            brick_index, source_level);
        extinction_samples[sample_index] = textureLoad(
            cloud_lv_medium_extinction, sample_atlas, 0);
        scattering_samples[sample_index] = textureLoad(
            cloud_lv_medium_scattering, sample_atlas, 0);
    }
    let child_sign = vec3<f32>(
        select(-1.0, 1.0, (local.x & 1u) != 0u),
        select(-1.0, 1.0, (local.y & 1u) != 0u),
        select(-1.0, 1.0, (local.z & 1u) != 0u));
    var absorption_samples: array<vec3<f32>, 7>;
    for (var sample_index = 0u; sample_index < 7u; sample_index += 1u) {
        absorption_samples[sample_index] = max(
            vec3<f32>(0.0), extinction_samples[sample_index].rgb -
                scattering_samples[sample_index].rgb);
    }
    let absorption = max(vec3<f32>(0.0), cloud_lv_monotone_child(
        absorption_samples[0], absorption_samples[1], absorption_samples[2],
        absorption_samples[3], absorption_samples[4], absorption_samples[5],
        absorption_samples[6], child_sign));
    // Occupancy is a topology anchor, not a filtered opacity. This replication
    // is permitted only behind the whole-support proof above.
    let occupancy = clamp(extinction_samples[0].a, 0.0, 1.0);
    // Reconstruct nonnegative forward/back scattering components rather than
    // independently reconstructing s and g. Their sum is sigma_s and their
    // difference is the first phase moment, so both parent means survive and
    // |g| <= 1 follows by construction without a destructive clamp.
    let photopic_weights = vec3<f32>(0.2126, 0.7152, 0.0722);
    var forward_samples: array<vec3<f32>, 7>;
    var backward_samples: array<vec3<f32>, 7>;
    for (var sample_index = 0u; sample_index < 7u; sample_index += 1u) {
        let sample_scattering = max(
            vec3<f32>(0.0), scattering_samples[sample_index].rgb);
        let sample_g = clamp(scattering_samples[sample_index].a, -0.99, 0.99);
        forward_samples[sample_index] = sample_scattering *
            (0.5 * (1.0 + sample_g));
        backward_samples[sample_index] = sample_scattering *
            (0.5 * (1.0 - sample_g));
    }
    let forward = max(vec3<f32>(0.0), cloud_lv_monotone_child(
        forward_samples[0], forward_samples[1], forward_samples[2],
        forward_samples[3], forward_samples[4], forward_samples[5],
        forward_samples[6], child_sign));
    let backward = max(vec3<f32>(0.0), cloud_lv_monotone_child(
        backward_samples[0], backward_samples[1], backward_samples[2],
        backward_samples[3], backward_samples[4], backward_samples[5],
        backward_samples[6], child_sign));
    let scattering = forward + backward;
    let phase_moment = forward - backward;
    let extinction = scattering + absorption;
    let scattering_energy = dot(scattering, photopic_weights);
    let asymmetry = select(
        0.0,
        dot(phase_moment, photopic_weights) / max(1e-8, scattering_energy),
        scattering_energy > 1e-8);
    textureStore(cloud_lv_medium_extinction_output, atlas,
        vec4<f32>(extinction, clamp(occupancy, 0.0, 1.0)));
    textureStore(cloud_lv_medium_scattering_output, atlas,
        vec4<f32>(scattering, asymmetry));
}

// Conservative full-weighting restriction. Cell material is volume averaged;
// face transport below always uses the harmonic diffusion coefficient, which
// is the finite-volume/Galerkin-consistent coarse interface operator.
@compute @workgroup_size(4, 4, 4)
fn cloud_lv_restrict_medium_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    if (level == 0u) { return; }
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    let brick_index = cloud_lv_work_brick_index();
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) {
        textureStore(cloud_lv_medium_extinction_output,
            cloud_lv_work_coordinate(local, brick_index, level), vec4<f32>(0.0));
        textureStore(cloud_lv_medium_scattering_output,
            cloud_lv_work_coordinate(local, brick_index, level), vec4<f32>(0.0));
        return;
    }
    let source_level = level - 1u;
    var extinction = vec3<f32>(0.0);
    var scattering = vec3<f32>(0.0);
    var asymmetry_weighted = 0.0;
    var scattering_weight = 0.0;
    var occupancy = 0.0;
    for (var z = 0u; z < 2u; z += 1u) {
        for (var y = 0u; y < 2u; y += 1u) {
            for (var x = 0u; x < 2u; x += 1u) {
                let child = local * 2u + vec3<u32>(x, y, z);
                let child_atlas = cloud_lv_work_coordinate(
                    child, brick_index, source_level);
                let e = textureLoad(cloud_lv_medium_extinction, child_atlas, 0);
                let s = textureLoad(cloud_lv_medium_scattering, child_atlas, 0);
                extinction += max(vec3<f32>(0.0), e.rgb);
                scattering += max(vec3<f32>(0.0), s.rgb);
                let weight = max(1e-8, dot(max(vec3<f32>(0.0), s.rgb),
                    vec3<f32>(0.2126, 0.7152, 0.0722)));
                asymmetry_weighted += s.a * weight;
                scattering_weight += weight;
                occupancy = max(occupancy, e.a);
            }
        }
    }
    extinction *= 0.125;
    scattering = min(extinction, scattering * 0.125);
    let asymmetry = asymmetry_weighted / max(1e-8, scattering_weight);
    let atlas = cloud_lv_work_coordinate(local, brick_index, level);
    textureStore(cloud_lv_medium_extinction_output, atlas,
        vec4<f32>(extinction, occupancy));
    textureStore(cloud_lv_medium_scattering_output, atlas,
        vec4<f32>(scattering, clamp(asymmetry, -0.99, 0.99)));
}

// Source-aligned Beer grids are a rotated representation of the same medium
// already materialized for diffusion. When an owner's complete conservative
// support is resident, reconstruct that immutable fine field across all of
// its (possibly overlapping) bricks instead of evaluating procedural
// morphology for a second time. The two-cell tile overlap supplies a stable
// blend region; a support-tight whole-owner brick simply takes the same path
// with one contributor. Points outside the complete resident union are vacuum.
fn cloud_lv_sample_resident_owner_medium(
    world_position_km: vec3<f32>, owner_index: u32,
) -> vec4<f32> {
    let dimensions = vec3<i32>(
        i32(CLOUD_LV_WIDTH), i32(CLOUD_LV_HEIGHT), i32(CLOUD_LV_DEPTH));
    var weighted_medium = vec4<f32>(0.0);
    var weight_sum = 0.0;
    for (var index = 0u; index < CLOUD_LV_MAX_BRICKS; index += 1u) {
        if (index >= cloud_lv_active_brick_count()) { break; }
        let candidate = cloud_lv_bricks[index];
        if (cloud_lv_owner_index(index) != owner_index) { continue; }
        let center = cloud_lv_local_center(
            candidate.diffusion, world_position_km);
        if (any(center < vec3<f32>(-0.5)) || any(center > vec3<f32>(
            f32(CLOUD_LV_WIDTH) - 0.5,
            f32(CLOUD_LV_HEIGHT) - 0.5,
            f32(CLOUD_LV_DEPTH) - 0.5))) { continue; }
        let bounded = clamp(center, vec3<f32>(0.0), vec3<f32>(
            f32(CLOUD_LV_WIDTH - 1u), f32(CLOUD_LV_HEIGHT - 1u),
            f32(CLOUD_LV_DEPTH - 1u)));
        let base = vec3<i32>(floor(bounded));
        let fraction = fract(bounded);
        var medium = vec4<f32>(0.0);
        for (var z = 0; z < 2; z += 1) {
            for (var y = 0; y < 2; y += 1) {
                for (var x = 0; x < 2; x += 1) {
                    let local = min(dimensions - vec3<i32>(1),
                        base + vec3<i32>(x, y, z));
                    let atlas = vec3<i32>(local.x, local.y,
                        local.z + i32(index * CLOUD_LV_DEPTH));
                    let corner_weight =
                        select(1.0 - fraction.x, fraction.x, x == 1) *
                        select(1.0 - fraction.y, fraction.y, y == 1) *
                        select(1.0 - fraction.z, fraction.z, z == 1);
                    medium += textureLoad(
                        cloud_lv_medium_extinction, atlas, 0) * corner_weight;
                }
            }
        }
        let edge_distance = min(center + vec3<f32>(0.5), vec3<f32>(
            f32(CLOUD_LV_WIDTH) - 0.5,
            f32(CLOUD_LV_HEIGHT) - 0.5,
            f32(CLOUD_LV_DEPTH) - 0.5) - center);
        let weight = max(0.0625,
            min(edge_distance.x, min(edge_distance.y, edge_distance.z)));
        weighted_medium += vec4<f32>(
            max(vec3<f32>(0.0), medium.rgb), clamp(medium.a, 0.0, 1.0)) *
            weight;
        weight_sum += weight;
    }
    if (weight_sum <= 0.0) { return vec4<f32>(0.0); }
    let result = weighted_medium / weight_sum;
    return vec4<f32>(max(vec3<f32>(0.0), result.rgb),
        clamp(result.a, 0.0, 1.0));
}

fn cloud_lv_materialize_source_compute_impl(
    invocation: vec3<u32>, source_index: u32,
) {
    let level = cloud_lv_level();
    if (level != 0u) { return; }
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= CLOUD_LV_WIDTH ||
        invocation.y >= CLOUD_LV_HEIGHT ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let brick_active = brick_index < cloud_lv_active_brick_count();
    // Both entry points pass a literal source index. Spell the two storage
    // reads explicitly as well, avoiding a dynamically indexed runtime array
    // in Metal even if the shared helper is not inlined before lowering.
    let source_active = select(
        cloud_lv_sources[0].direction_active.w,
        cloud_lv_sources[1].direction_active.w,
        source_index == 1u) > 0.5;
    let fine_local = vec3<u32>(invocation.xy, local_z);
    // The host dispatches this entry point only for the first stable brick of
    // each owner; later sibling slots are populated by the direct copy pass.
    // Do not repeat the representative search in every invocation. On Metal,
    // even its single dynamic storage-buffer iteration at brick one could
    // trigger a pathological source-materialization command despite an empty
    // slab. The host-side proof is generation-local and uses the same packed
    // owner words, so removing the redundant GPU scan is output-identical.
    if (!(brick_active && source_active)) {
        textureStore(cloud_lv_fluence_write,
            cloud_lv_work_coordinate(fine_local, brick_index, level),
            vec4<f32>(0.0));
        return;
    }
    let brick = cloud_lv_bricks[brick_index];
    let paired_y = cloud_lv_paired_direct_y_safe(brick);
    let transform = cloud_lv_direct_transform(brick, source_index);
    if (paired_y && invocation.y >= CLOUD_LV_HEIGHT / 2u) { return; }
    // These are real world-space cells outside the exact finite-owner OBB, not
    // a screen-space fade. Keeping them explicitly empty makes Beer approach
    // T=1 through ordinary grid interpolation before the atlas boundary.
    let guard_column = fine_local.x < CLOUD_LV_DIRECT_GUARD_X ||
        fine_local.x >= CLOUD_LV_WIDTH - CLOUD_LV_DIRECT_GUARD_X ||
        fine_local.z < CLOUD_LV_DIRECT_GUARD_Z ||
        fine_local.z >= CLOUD_LV_DEPTH - CLOUD_LV_DIRECT_GUARD_Z;
    if (guard_column) {
        textureStore(cloud_lv_fluence_write,
            cloud_lv_work_coordinate(fine_local, brick_index, level),
            vec4<f32>(0.0));
        return;
    }
    // Production evaluates every non-guard lateral column and all 32
    // source-axis centers. Pair midpoints remain available only behind the
    // conservative opt-in flag and are otherwise unreachable.
    if (paired_y) {
        let pair_local = vec3<u32>(invocation.xy, local_z);
        let exact_center = vec3<f32>(
            f32(pair_local.x) + 0.5,
            (f32(pair_local.y) + 0.5) * 2.0,
            f32(pair_local.z) + 0.5);
        let world = cloud_lv_world_position(transform, exact_center);
        let owner_index = cloud_lv_owner_index(brick_index);
        if (cloud_lv_resident_source_medium_safe(brick)) {
            textureStore(cloud_lv_fluence_write,
                cloud_lv_work_coordinate(pair_local, brick_index, level),
                cloud_lv_sample_resident_owner_medium(world, owner_index));
            return;
        }
        // cloud_lv_query_world_medium(...) remains the default exact hook;
        // source-specialized modules replace only this statically named seam.
        let query = cloud_lv_query_source_world_medium(
            world, owner_index, transform.axis_y_cell.w * 2.0,
            transform.axis_y_cell.xyz);
        textureStore(cloud_lv_fluence_write,
            cloud_lv_work_coordinate(pair_local, brick_index, level), vec4<f32>(
                max(vec3<f32>(0.0), query.extinction_rgb_per_km),
                clamp(query.occupancy, 0.0, 1.0)));
        return;
    }
    // Production assigns every exact source-grid center to its own invocation.
    // This preserves all 32 y samples while exposing enough independent work
    // to hide the procedural morphology query's texture and register latency.
    // A one-cell shaft/fibre cannot be averaged away or doubled in Beer depth.
    // Only points inside a support-changing modifier's finite envelope, or
    // certified non-empty by the base majorant, pay the complete medium query.
    let owner_index = cloud_lv_owner_index(brick_index);
    let atlas = cloud_lv_work_coordinate(fine_local, brick_index, level);
    let exact_center = vec3<f32>(fine_local) + vec3<f32>(0.5);
    let world = cloud_lv_world_position(transform, exact_center);
    if (cloud_lv_resident_source_medium_safe(brick)) {
        textureStore(cloud_lv_fluence_write, atlas,
            cloud_lv_sample_resident_owner_medium(world, owner_index));
        return;
    }
    // cloud_lv_query_world_medium(...) remains the default exact hook;
    // source-specialized modules replace only this statically named seam.
    let query = cloud_lv_query_source_world_medium(
        world, owner_index, transform.axis_y_cell.w,
        transform.axis_y_cell.xyz);
    textureStore(cloud_lv_fluence_write, atlas, vec4<f32>(
        max(vec3<f32>(0.0), query.extinction_rgb_per_km),
        clamp(query.occupancy, 0.0, 1.0)));
}
@compute @workgroup_size(4, 4, 1)
fn cloud_lv_materialize_source_0_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) { cloud_lv_materialize_source_compute_impl(invocation, 0u); }
@compute @workgroup_size(4, 4, 1)
fn cloud_lv_materialize_source_1_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) { cloud_lv_materialize_source_compute_impl(invocation, 1u); }

// Each invocation owns one source-aligned (x,z) column. The expensive exact
// midpoint queries above preserve every lateral column; this serial portion
// remains only the bounded 32-cell RGB Beer prefix.
fn cloud_lv_direct_source_compute_impl(
    invocation: vec3<u32>, source_index: u32,
) {
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= CLOUD_LV_WIDTH ||
        !cloud_lv_slab_contains(local_z, 0u)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let brick_active = brick_index < cloud_lv_active_brick_count();
    let source_active = cloud_lv_sources[source_index].direction_active.w > 0.5;
    let representative_index = cloud_lv_representative_brick_index(brick_index);
    let brick = cloud_lv_bricks[representative_index];
    let transform = cloud_lv_direct_transform(brick, source_index);
    let paired_y = cloud_lv_paired_direct_y_safe(brick);
    var transmittance = vec3<f32>(1.0);
    for (var y = i32(CLOUD_LV_HEIGHT) - 1; y >= 0; y -= 1) {
        let local = vec3<u32>(invocation.x, u32(y), local_z);
        let atlas = cloud_lv_work_coordinate(local, brick_index, 0u);
        if (!(brick_active && source_active)) {
            textureStore(cloud_lv_direct_output, atlas,
                vec4<f32>(1.0, 1.0, 1.0, 0.0));
            continue;
        }
        let source_medium_y = select(local.y, local.y / 2u, paired_y);
        let source_medium_local = vec3<u32>(
            local.x, source_medium_y, local.z);
        let representative_atlas = cloud_lv_work_coordinate(
            source_medium_local, representative_index, 0u);
        let cached_medium = textureLoad(
            cloud_lv_fluence_read, representative_atlas, 0);
        let extinction = max(vec3<f32>(0.0), cached_medium.rgb);
        let half_step = exp(-min(vec3<f32>(24.0),
            extinction * transform.axis_y_cell.w * 0.5));
        // Store the downstream face, not only the midpoint. Sampling takes a
        // geometric half-step between adjacent faces, which recovers the
        // original cell-center convention while retaining exact full-column
        // Beer for receivers beyond the caster's downstream boundary.
        transmittance *= half_step * half_step;
        textureStore(cloud_lv_direct_output, atlas,
            vec4<f32>(transmittance, cached_medium.a));
    }
}
@compute @workgroup_size(8, 1, 8)
fn cloud_lv_direct_source_0_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) { cloud_lv_direct_source_compute_impl(invocation, 0u); }
@compute @workgroup_size(8, 1, 8)
fn cloud_lv_direct_source_1_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) { cloud_lv_direct_source_compute_impl(invocation, 1u); }

fn cloud_lv_direct_trilinear(
    world_position_km: vec3<f32>, brick_index: u32, source_index: u32,
) -> vec3<f32> {
    let transform = cloud_lv_direct_transform(
        cloud_lv_bricks[brick_index], source_index);
    let center_input = cloud_lv_local_center(transform, world_position_km);
    if (center_input.x < -0.501 ||
        center_input.x > f32(CLOUD_LV_WIDTH) - 0.499 ||
        center_input.z < -0.501 ||
        center_input.z > f32(CLOUD_LV_DEPTH) - 0.499) {
        return vec3<f32>(1.0);
    }
    // +Y points toward the source. Sourceward receivers see no attenuation;
    // downstream receivers retain the exact y=0 exit-face transmission.
    let face_y_input = center_input.y + 0.5;
    if (face_y_input >= f32(CLOUD_LV_HEIGHT)) { return vec3<f32>(1.0); }
    let face_y = max(0.0, face_y_input);
    let lower_y = min(i32(CLOUD_LV_HEIGHT) - 1, i32(floor(face_y)));
    let upper_y = lower_y + 1;
    let y_fraction = face_y - f32(lower_y);
    let center_xz = clamp(center_input.xz, vec2<f32>(0.0), vec2<f32>(
        f32(CLOUD_LV_WIDTH - 1u), f32(CLOUD_LV_DEPTH - 1u)));
    let base_xz = vec2<i32>(floor(center_xz));
    let fraction_xz = fract(center_xz);
    var result = vec3<f32>(0.0);
    for (var z = 0; z < 2; z += 1) {
        for (var x = 0; x < 2; x += 1) {
            let local_xz = min(vec2<i32>(i32(CLOUD_LV_WIDTH - 1u),
                i32(CLOUD_LV_DEPTH - 1u)), base_xz + vec2<i32>(x, z));
            let lower_atlas = vec3<i32>(local_xz.x, lower_y,
                local_xz.y + i32(brick_index * CLOUD_LV_DEPTH));
            var lower = vec3<f32>(1.0);
            var upper = vec3<f32>(1.0);
            if (source_index == 0u) {
                lower = textureLoad(cloud_lv_direct_0, lower_atlas, 0).rgb;
                if (upper_y < i32(CLOUD_LV_HEIGHT)) {
                    upper = textureLoad(cloud_lv_direct_0,
                        vec3<i32>(lower_atlas.x, upper_y, lower_atlas.z), 0).rgb;
                }
            } else {
                lower = textureLoad(cloud_lv_direct_1, lower_atlas, 0).rgb;
                if (upper_y < i32(CLOUD_LV_HEIGHT)) {
                    upper = textureLoad(cloud_lv_direct_1,
                        vec3<i32>(lower_atlas.x, upper_y, lower_atlas.z), 0).rgb;
                }
            }
            let column = exp(mix(log(max(vec3<f32>(1e-30), lower)),
                log(max(vec3<f32>(1e-30), upper)), y_fraction));
            let weight = select(1.0 - fraction_xz.x, fraction_xz.x, x == 1) *
                select(1.0 - fraction_xz.y, fraction_xz.y, z == 1);
            result += column * weight;
        }
    }
    // The physical owner ends two stored clear-air cells before this outer
    // face. This final Beer-space guard is only a defensive continuation from
    // the already-clear outer column; it no longer hides a condensate edge.
    let clear_x = clamp(2.0 * min(
        center_input.x + 0.5,
        f32(CLOUD_LV_WIDTH) - 0.5 - center_input.x), 0.0, 1.0);
    let clear_z = clamp(2.0 * min(
        center_input.z + 0.5,
        f32(CLOUD_LV_DEPTH) - 0.5 - center_input.z), 0.0, 1.0);
    let guard_density = clear_x * clear_z;
    let bounded = clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
    if (guard_density >= 1.0) { return bounded; }
    return clamp(exp(log(max(vec3<f32>(1e-30), bounded)) * guard_density),
        vec3<f32>(0.0), vec3<f32>(1.0));
}

// The reduced-beam RHS sees the complete resident cloud scene, not only the
// owner whose diffuse equation is being solved. Direct transforms span each
// full finite owner OBB; duplicate sibling tiles therefore contribute exactly
// one Beer factor through their first stable owner record.
fn cloud_lv_all_owner_direct_transmittance(
    world_position_km: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    var result = vec3<f32>(1.0);
    for (var index = 0u; index < CLOUD_LV_MAX_BRICKS; index += 1u) {
        if (index >= cloud_lv_active_brick_count()) { break; }
        let owner = u32(max(0.0, round(
            cloud_lv_bricks[index].owner_atlas_tau_schema.x)));
        var first_owner_record = true;
        for (var previous = 0u; previous < CLOUD_LV_MAX_BRICKS;
            previous += 1u) {
            if (previous >= index) { break; }
            let previous_owner = u32(max(0.0, round(
                cloud_lv_bricks[previous].owner_atlas_tau_schema.x)));
            if (previous_owner == owner) {
                first_owner_record = false;
                break;
            }
        }
        if (!first_owner_record) { continue; }
        result *= cloud_lv_direct_trilinear(
            world_position_km, index, source_index);
    }
    return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_lv_read_packed() -> bool {
    return cloud_lv_uniforms.level_bank_io.z != 0u;
}
fn cloud_lv_write_packed() -> bool {
    return cloud_lv_uniforms.level_bank_io.w != 0u;
}
fn cloud_lv_load_fluence(
    local: vec3<u32>, brick_index: u32, level: u32,
) -> vec3<f32> {
    return textureLoad(cloud_lv_fluence_read, cloud_lv_fluence_coordinate(
        local, brick_index, level, cloud_lv_read_packed()), 0).rgb;
}

fn cloud_lv_halo_sample(
    world: vec3<f32>, current_brick: u32, level: u32,
) -> CloudLvHalo {
    // Halo topology is defined by the authoritative fine finite-volume graph.
    // A coarse correction samples the aggregate containing that same fine
    // neighbor; it must not reinterpret a partially occupied coarse mip as a
    // new homogeneous cloud connection.
    let fine_dimensions = cloud_lv_level_dimensions(0u);
    let aggregate_scale = 1u << level;
    let current_owner = cloud_lv_owner_index(current_brick);
    var weighted_fluence = vec3<f32>(0.0);
    var weighted_diffusion = vec3<f32>(0.0);
    var weight_sum = 0.0;
    for (var sibling = 0u; sibling < CLOUD_LV_MAX_BRICKS; sibling += 1u) {
        if (sibling >= cloud_lv_active_brick_count()) { break; }
        if (sibling == current_brick) { continue; }
        // Overlapping but physically distinct systems exchange radiance only
        // through their incident environment. Coupling to the first unrelated
        // stable slot makes the solve order-dependent and creates owner seams.
        if (cloud_lv_owner_index(sibling) != current_owner) { continue; }
        let center = cloud_lv_local_center_level(
            cloud_lv_bricks[sibling].diffusion, world, 0u);
        if (any(center < vec3<f32>(-0.5)) || any(center >
            vec3<f32>(fine_dimensions) - vec3<f32>(0.5))) { continue; }
        let fine_local = vec3<u32>(clamp(vec3<i32>(round(center)), vec3<i32>(0),
            vec3<i32>(fine_dimensions) - vec3<i32>(1)));
        let atlas = cloud_lv_work_coordinate(fine_local, sibling, 0u);
        let extinction_record = textureLoad(cloud_lv_medium_extinction, atlas, 0);
        if (extinction_record.a <= 0.0) { continue; }
        let scattering_record = textureLoad(cloud_lv_medium_scattering, atlas, 0);
        let aggregate_local = fine_local / vec3<u32>(aggregate_scale);
        let distance_cells = min(
            center + vec3<f32>(0.5),
            vec3<f32>(fine_dimensions) - vec3<f32>(0.5) - center);
        let weight = max(0.0, min(distance_cells.x,
            min(distance_cells.y, distance_cells.z)));
        if (weight <= 0.0) { continue; }
        weighted_fluence += cloud_lv_load_fluence(
            aggregate_local, sibling, level) * weight;
        weighted_diffusion += cloud_lv_transport_diffusion(
            extinction_record.rgb, scattering_record.rgb,
            scattering_record.a) * weight;
        weight_sum += weight;
    }
    if (weight_sum > 0.0) {
        return CloudLvHalo(1u, weighted_fluence / weight_sum,
            weighted_diffusion / weight_sum);
    }
    return CloudLvHalo(0u, vec3<f32>(0.0), vec3<f32>(0.0));
}

// INTERNAL is a topological promise that a selected reciprocal sibling owns
// this finite-volume face. It is never a black Marshak/environment boundary.
// This qualification runs before publication so a missing runtime halo makes
// the whole resident candidate fail back to analytic transport.
fn cloud_lv_internal_halos_complete(
    local: vec3<u32>, brick_index: u32, level: u32,
) -> bool {
    let offsets = array<vec3<i32>, 6>(
        vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0),
        vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0),
        vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
    let dimensions = cloud_lv_level_dimensions(level);
    let brick = cloud_lv_bricks[brick_index];
    for (var face = 0u; face < 6u; face += 1u) {
        let neighbor_i = vec3<i32>(local) + offsets[face];
        if (all(neighbor_i >= vec3<i32>(0)) &&
            all(neighbor_i < vec3<i32>(dimensions))) { continue; }
        let boundary_kind = u32(round(cloud_lv_face_record(brick, face).w));
        if (boundary_kind != CLOUD_LV_BOUNDARY_INTERNAL) { continue; }
        let neighbor_world = cloud_lv_world_position_level(
            brick.diffusion, vec3<f32>(neighbor_i) + vec3<f32>(0.5), level);
        if (cloud_lv_halo_sample(
            neighbor_world, brick_index, level).is_active == 0u) {
            return false;
        }
    }
    return true;
}

fn cloud_lv_fine_equation_terms(
    local: vec3<u32>, brick_index: u32, correction: bool,
) -> CloudLvEquationTerms {
    let level = 0u;
    let atlas = cloud_lv_work_coordinate(local, brick_index, 0u);
    let extinction_record = textureLoad(cloud_lv_medium_extinction, atlas, 0);
    let scattering_record = textureLoad(cloud_lv_medium_scattering, atlas, 0);
    let extinction = max(vec3<f32>(0.0), extinction_record.rgb);
    let scattering = clamp(scattering_record.rgb, vec3<f32>(0.0), extinction);
    let absorption = max(vec3<f32>(0.0), extinction - scattering);
    let diffusion = cloud_lv_transport_diffusion(
        extinction, scattering, scattering_record.a);
    let brick = cloud_lv_bricks[brick_index];
    let world = cloud_lv_world_position_level(
        brick.diffusion, vec3<f32>(local) + vec3<f32>(0.5), level);
    var numerator = vec3<f32>(0.0);
    if (correction) {
        numerator = textureLoad(cloud_lv_direct_0, atlas, 0).rgb;
    } else {
        var incident_direct = vec3<f32>(0.0);
        for (var source_index = 0u; source_index < 2u; source_index += 1u) {
            if (cloud_lv_sources[source_index].direction_active.w <= 0.5) { continue; }
            incident_direct += cloud_lv_source_irradiance_at(world, source_index) *
                cloud_lv_all_owner_direct_transmittance(world, source_index);
        }
        numerator = scattering * incident_direct;
    }
    var denominator = absorption;
    let offsets = array<vec3<i32>, 6>(
        vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0),
        vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0),
        vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
    let dimensions = cloud_lv_level_dimensions(level);
    let cell_sizes = vec3<f32>(brick.diffusion.axis_x_cell.w,
        brick.diffusion.axis_y_cell.w, brick.diffusion.axis_z_cell.w) *
        cloud_lv_level_scale(level);
    for (var face = 0u; face < 6u; face += 1u) {
        let neighbor_i = vec3<i32>(local) + offsets[face];
        let inside = all(neighbor_i >= vec3<i32>(0)) &&
            all(neighbor_i < vec3<i32>(dimensions));
        let h = cell_sizes[min(2u, face / 2u)];
        if (inside) {
            let neighbor = vec3<u32>(neighbor_i);
            let neighbor_atlas = cloud_lv_work_coordinate(
                neighbor, brick_index, level);
            let neighbor_extinction = textureLoad(
                cloud_lv_medium_extinction, neighbor_atlas, 0);
            if (neighbor_extinction.a > 0.0) {
                let neighbor_scattering = textureLoad(
                    cloud_lv_medium_scattering, neighbor_atlas, 0);
                let neighbor_diffusion = cloud_lv_transport_diffusion(
                    neighbor_extinction.rgb, neighbor_scattering.rgb,
                    neighbor_scattering.a);
                let harmonic = 2.0 * diffusion * neighbor_diffusion /
                    max(vec3<f32>(1e-8), diffusion + neighbor_diffusion);
                let coefficient = harmonic / (h * h);
                numerator += coefficient * cloud_lv_load_fluence(
                    neighbor, brick_index, level);
                denominator += coefficient;
            } else {
                let coefficient = cloud_lv_marshak_coefficient(diffusion, h);
                if (!correction) {
                    numerator += coefficient * 4.0 * max(vec3<f32>(0.0),
                        cloud_lv_boundary_irradiance[
                            brick_index * 6u + face].xyz);
                }
                denominator += coefficient;
            }
            continue;
        }
        let boundary = cloud_lv_boundary_irradiance[brick_index * 6u + face];
        let boundary_kind = u32(round(boundary.w));
        let neighbor_world = cloud_lv_world_position_level(
            brick.diffusion, vec3<f32>(neighbor_i) + vec3<f32>(0.5), level);
        let halo = cloud_lv_halo_sample(neighbor_world, brick_index, level);
        if (halo.is_active != 0u) {
            let harmonic = 2.0 * diffusion * halo.diffusion /
                max(vec3<f32>(1e-8), diffusion + halo.diffusion);
            let coefficient = harmonic / (h * h);
            numerator += coefficient * halo.fluence;
            denominator += coefficient;
            continue;
        }
        // A temporarily/mistakenly absent sibling must not become a zero-light
        // Marshak boundary. The residual qualifier rejects this candidate;
        // omitting the unresolved flux here prevents an artificial energy sink
        // while the nonresident analytic closure remains authoritative.
        if (boundary_kind == CLOUD_LV_BOUNDARY_INTERNAL) { continue; }
        // Exterior is physical Marshak; truncated is its explicit legacy
        // Dirichlet value. Correction equations use homogeneous boundaries.
        let coefficient = cloud_lv_marshak_coefficient(diffusion, h);
        if (!correction) {
            numerator += coefficient * 4.0 * max(vec3<f32>(0.0), boundary.xyz);
        }
        denominator += coefficient;
    }
    return CloudLvEquationTerms(numerator, denominator);
}

// Matrix-free cell-aggregation Galerkin operator A_H = R A_h P. P copies one
// coarse correction into the occupied fine cells of its aggregate and R is
// the corresponding volume average. Evaluating the authoritative fine graph
// preserves RGB diffusion, absorption, every fine void/Marshak face, and the
// mapped sibling halo topology. In particular, a single occupied child can no
// longer turn a dilute coarse voxel into a highly diffusive bridge.
fn cloud_lv_aggregate_equation_terms(
    local: vec3<u32>, brick_index: u32, level: u32,
) -> CloudLvEquationTerms {
    let aggregate_scale = 1u << level;
    let aggregate_volume = f32(
        aggregate_scale * aggregate_scale * aggregate_scale);
    let brick = cloud_lv_bricks[brick_index];
    let fine_dimensions = cloud_lv_level_dimensions(0u);
    let coarse_rhs = textureLoad(cloud_lv_direct_0,
        cloud_lv_work_coordinate(local, brick_index, level), 0).rgb;
    var transport_numerator = vec3<f32>(0.0);
    var denominator = vec3<f32>(0.0);
    let offsets = array<vec3<i32>, 6>(
        vec3<i32>(1, 0, 0), vec3<i32>(-1, 0, 0),
        vec3<i32>(0, 1, 0), vec3<i32>(0, -1, 0),
        vec3<i32>(0, 0, 1), vec3<i32>(0, 0, -1));
    let fine_cell_sizes = vec3<f32>(brick.diffusion.axis_x_cell.w,
        brick.diffusion.axis_y_cell.w, brick.diffusion.axis_z_cell.w);
    let fine_start = local * aggregate_scale;
    for (var z = 0u; z < aggregate_scale; z += 1u) {
        for (var y = 0u; y < aggregate_scale; y += 1u) {
            for (var x = 0u; x < aggregate_scale; x += 1u) {
                let fine_local = fine_start + vec3<u32>(x, y, z);
                let fine_atlas = cloud_lv_work_coordinate(
                    fine_local, brick_index, 0u);
                let extinction_record = textureLoad(
                    cloud_lv_medium_extinction, fine_atlas, 0);
                if (extinction_record.a <= 0.0) { continue; }
                let scattering_record = textureLoad(
                    cloud_lv_medium_scattering, fine_atlas, 0);
                let extinction = max(vec3<f32>(0.0), extinction_record.rgb);
                let scattering = clamp(scattering_record.rgb,
                    vec3<f32>(0.0), extinction);
                let diffusion = cloud_lv_transport_diffusion(
                    extinction, scattering, scattering_record.a);
                denominator += max(vec3<f32>(0.0), extinction - scattering);
                for (var face = 0u; face < 6u; face += 1u) {
                    let neighbor_i = vec3<i32>(fine_local) + offsets[face];
                    let h = fine_cell_sizes[min(2u, face / 2u)];
                    let inside = all(neighbor_i >= vec3<i32>(0)) &&
                        all(neighbor_i < vec3<i32>(fine_dimensions));
                    if (inside) {
                        let neighbor = vec3<u32>(neighbor_i);
                        let neighbor_atlas = cloud_lv_work_coordinate(
                            neighbor, brick_index, 0u);
                        let neighbor_extinction = textureLoad(
                            cloud_lv_medium_extinction, neighbor_atlas, 0);
                        if (neighbor_extinction.a > 0.0) {
                            let neighbor_aggregate = neighbor /
                                vec3<u32>(aggregate_scale);
                            // Fine edges internal to a piecewise-constant
                            // aggregate cancel exactly in P^T A P.
                            if (all(neighbor_aggregate == local)) { continue; }
                            let neighbor_scattering = textureLoad(
                                cloud_lv_medium_scattering, neighbor_atlas, 0);
                            let neighbor_diffusion = cloud_lv_transport_diffusion(
                                neighbor_extinction.rgb,
                                neighbor_scattering.rgb,
                                neighbor_scattering.a);
                            let harmonic = 2.0 * diffusion * neighbor_diffusion /
                                max(vec3<f32>(1e-8),
                                    diffusion + neighbor_diffusion);
                            let coefficient = harmonic / (h * h);
                            transport_numerator += coefficient *
                                cloud_lv_load_fluence(neighbor_aggregate,
                                    brick_index, level);
                            denominator += coefficient;
                        } else {
                            denominator += cloud_lv_marshak_coefficient(
                                diffusion, h);
                        }
                        continue;
                    }
                    let neighbor_world = cloud_lv_world_position_level(
                        brick.diffusion,
                        vec3<f32>(neighbor_i) + vec3<f32>(0.5), 0u);
                    let halo = cloud_lv_halo_sample(
                        neighbor_world, brick_index, level);
                    if (halo.is_active != 0u) {
                        let harmonic = 2.0 * diffusion * halo.diffusion /
                            max(vec3<f32>(1e-8), diffusion + halo.diffusion);
                        let coefficient = harmonic / (h * h);
                        transport_numerator += coefficient * halo.fluence;
                        denominator += coefficient;
                    } else {
                        denominator += cloud_lv_marshak_coefficient(
                            diffusion, h);
                    }
                }
            }
        }
    }
    let inverse_volume = 1.0 / max(1.0, aggregate_volume);
    return CloudLvEquationTerms(
        coarse_rhs + transport_numerator * inverse_volume,
        denominator * inverse_volume);
}

fn cloud_lv_equation_terms(
    local: vec3<u32>, brick_index: u32, level: u32, correction: bool,
) -> CloudLvEquationTerms {
    if (level == 0u) {
        return cloud_lv_fine_equation_terms(
            local, brick_index, correction);
    }
    return cloud_lv_aggregate_equation_terms(local, brick_index, level);
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_clear_fluence_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    textureStore(cloud_lv_fluence_write, cloud_lv_fluence_coordinate(
        local, cloud_lv_work_brick_index(), level, cloud_lv_write_packed()),
        vec4<f32>(0.0));
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_smooth_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let local = vec3<u32>(invocation.xy, local_z);
    let output = cloud_lv_fluence_coordinate(
        local, brick_index, level, cloud_lv_write_packed());
    let atlas = cloud_lv_work_coordinate(local, brick_index, level);
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index]) ||
        textureLoad(cloud_lv_medium_extinction, atlas, i32(level)).a <= 0.0) {
        textureStore(cloud_lv_fluence_write, output, vec4<f32>(0.0));
        return;
    }
    let correction = level > 0u;
    let terms = cloud_lv_equation_terms(local, brick_index, level, correction);
    let previous = cloud_lv_load_fluence(local, brick_index, level);
    var candidate = terms.numerator / max(vec3<f32>(1e-8), terms.denominator);
    if (correction) {
        candidate = clamp(candidate, vec3<f32>(-cloud_lv_uniforms.solver.z),
            vec3<f32>(cloud_lv_uniforms.solver.z));
    } else {
        candidate = clamp(candidate, vec3<f32>(0.0),
            vec3<f32>(cloud_lv_uniforms.solver.z));
    }
    let next = mix(previous, candidate,
        clamp(cloud_lv_uniforms.solver.x, 0.0001, 1.0));
    textureStore(cloud_lv_fluence_write, output, vec4<f32>(next, 0.0));
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_restrict_residual_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    if (level == 0u) { return; }
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    let brick_index = cloud_lv_work_brick_index();
    let source_level = level - 1u;
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) {
        textureStore(cloud_lv_direct_output,
            cloud_lv_work_coordinate(local, brick_index, level), vec4<f32>(0.0));
        return;
    }
    var restricted = vec3<f32>(0.0);
    for (var z = 0u; z < 2u; z += 1u) {
        for (var y = 0u; y < 2u; y += 1u) {
            for (var x = 0u; x < 2u; x += 1u) {
                let child = local * 2u + vec3<u32>(x, y, z);
                let child_atlas = cloud_lv_work_coordinate(
                    child, brick_index, source_level);
                if (textureLoad(cloud_lv_medium_extinction,
                    child_atlas, i32(source_level)).a <= 0.0) {
                    continue;
                }
                let terms = cloud_lv_equation_terms(
                    child, brick_index, source_level, source_level > 0u);
                restricted += terms.numerator - terms.denominator *
                    cloud_lv_load_fluence(child, brick_index, source_level);
            }
        }
    }
    textureStore(cloud_lv_direct_output,
        cloud_lv_work_coordinate(local, brick_index, level),
        vec4<f32>(restricted * 0.125, 0.0));
}

fn cloud_lv_packed_load_at_mip(
    local: vec3<u32>, brick_index: u32, level: u32,
) -> vec3<f32> {
    return textureLoad(cloud_lv_fluence_read, cloud_lv_fluence_coordinate(
        local, brick_index, level, true), i32(level)).rgb;
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_prolongate_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    if (level + 1u >= CLOUD_LV_MULTIGRID_LEVELS) { return; }
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    let brick_index = cloud_lv_work_brick_index();
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) { return; }
    // Matched aggregation prolongation. The coarse operator is R A P for
    // this piecewise-constant P; trilinear interpolation would require a
    // different 27-point Galerkin stencil and was the source of unbounded
    // sparse-boundary corrections in the previous rediscretized hierarchy.
    let coarse = local / vec3<u32>(2u);
    let correction = cloud_lv_packed_load_at_mip(
        coarse, brick_index, level + 1u);
    var updated = cloud_lv_packed_load_at_mip(local, brick_index, level) + correction;
    if (level == 0u) {
        updated = clamp(updated, vec3<f32>(0.0),
            vec3<f32>(cloud_lv_uniforms.solver.z));
    } else {
        updated = clamp(updated, vec3<f32>(-cloud_lv_uniforms.solver.z),
            vec3<f32>(cloud_lv_uniforms.solver.z));
    }
    textureStore(cloud_lv_fluence_write,
        cloud_lv_work_coordinate(local, brick_index, level),
        vec4<f32>(updated, 0.0));
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_copy_fluence_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = cloud_lv_level();
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    let brick_index = cloud_lv_work_brick_index();
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) {
        textureStore(cloud_lv_fluence_write,
            cloud_lv_fluence_coordinate(
                local, brick_index, level, cloud_lv_write_packed()),
            vec4<f32>(0.0));
        return;
    }
    let value = textureLoad(cloud_lv_fluence_read,
        cloud_lv_fluence_coordinate(
            local, brick_index, level, cloud_lv_read_packed()), 0);
    textureStore(cloud_lv_fluence_write,
        cloud_lv_fluence_coordinate(
            local, brick_index, level, cloud_lv_write_packed()), value);
}

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_measure_residual_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= CLOUD_LV_WIDTH || invocation.y >= CLOUD_LV_HEIGHT ||
        !cloud_lv_slab_contains(local_z, 0u)) { return; }
    let local = vec3<u32>(invocation.xy, local_z);
    let brick_index = cloud_lv_work_brick_index();
    if (brick_index >= cloud_lv_active_brick_count() ||
        !cloud_lv_p1_eligible(cloud_lv_bricks[brick_index])) { return; }
    let atlas = cloud_lv_work_coordinate(local, brick_index, 0u);
    let fluence = cloud_lv_load_fluence(local, brick_index, 0u);
    let direct_sun = textureLoad(cloud_lv_direct_0, atlas, 0).rgb;
    let direct_moon = textureLoad(cloud_lv_direct_1, atlas, 0).rgb;
    let packed_finite = all(fluence == fluence) &&
        all(direct_sun == direct_sun) && all(direct_moon == direct_moon) &&
        max(max(abs(fluence.r), abs(fluence.g)), abs(fluence.b)) <= 65504.0 &&
        max(max(abs(direct_sun.r), abs(direct_sun.g)), abs(direct_sun.b)) <=
            65504.0 &&
        max(max(abs(direct_moon.r), abs(direct_moon.g)), abs(direct_moon.b)) <=
            65504.0;
    if (!packed_finite) {
        atomicAdd(&cloud_lv_residual_status.non_finite_count, 1u);
        return;
    }
    let direct_in_range = all(direct_sun >= vec3<f32>(0.0)) &&
        all(direct_sun <= vec3<f32>(1.0)) &&
        all(direct_moon >= vec3<f32>(0.0)) &&
        all(direct_moon <= vec3<f32>(1.0));
    let occupied = textureLoad(cloud_lv_medium_extinction, atlas, 0).a > 0.0;
    let empty_fluence_zero = occupied ||
        max(max(abs(fluence.r), abs(fluence.g)), abs(fluence.b)) <= 1e-4;
    if (!(direct_in_range && empty_fluence_zero)) {
        atomicAdd(&cloud_lv_residual_status.energy_violation_count, 1u);
    }
    if (!occupied) { return; }
    if (!cloud_lv_internal_halos_complete(local, brick_index, 0u)) {
        atomicAdd(&cloud_lv_residual_status.energy_violation_count, 1u);
        return;
    }
    let terms = cloud_lv_equation_terms(local, brick_index, 0u, false);
    let candidate = terms.numerator /
        max(vec3<f32>(1e-8), terms.denominator);
    var maximum_boundary = vec3<f32>(0.0);
    for (var face = 0u; face < 6u; face += 1u) {
        maximum_boundary = max(maximum_boundary, max(vec3<f32>(0.0),
            cloud_lv_boundary_irradiance[brick_index * 6u + face].xyz));
    }
    let residual = terms.numerator - terms.denominator * fluence;
    let scale = max(vec3<f32>(1e-5), max(abs(terms.numerator),
        abs(terms.denominator * fluence)));
    let normalized = abs(residual) / scale;
    let maximum = max(normalized.r, max(normalized.g, normalized.b));
    let finite = all(fluence == fluence) && all(normalized == normalized) &&
        all(terms.numerator == terms.numerator) &&
        all(terms.denominator == terms.denominator) &&
        all(candidate == candidate) &&
        all(maximum_boundary == maximum_boundary) &&
        max(max(abs(fluence.r), abs(fluence.g)), abs(fluence.b)) <= 65504.0 &&
        max(max(abs(terms.numerator.r), abs(terms.numerator.g)),
            abs(terms.numerator.b)) <= 3.402823466e+38 &&
        max(max(abs(terms.denominator.r), abs(terms.denominator.g)),
            abs(terms.denominator.b)) <= 3.402823466e+38 &&
        max(max(abs(maximum_boundary.r), abs(maximum_boundary.g)),
            abs(maximum_boundary.b)) <= 3.402823466e+38;
    if (!finite) {
        atomicAdd(&cloud_lv_residual_status.non_finite_count, 1u);
        return;
    }
    if (any(fluence < vec3<f32>(0.0)) ||
        any(fluence >= vec3<f32>(cloud_lv_uniforms.solver.z))) {
        atomicAdd(&cloud_lv_residual_status.energy_violation_count, 1u);
    }
    if (any(candidate >= vec3<f32>(cloud_lv_uniforms.solver.z * 0.98)) ||
        any(fluence >= vec3<f32>(cloud_lv_uniforms.solver.z * 0.98))) {
        atomicAdd(&cloud_lv_residual_status.near_storage_rail_count, 1u);
    }
    atomicMax(&cloud_lv_residual_status.maximum_normalized_residual_bits,
        bitcast<u32>(max(0.0, maximum)));
    atomicMax(&cloud_lv_residual_status.maximum_fluence_r_bits,
        bitcast<u32>(max(0.0, fluence.r)));
    atomicMax(&cloud_lv_residual_status.maximum_fluence_g_bits,
        bitcast<u32>(max(0.0, fluence.g)));
    atomicMax(&cloud_lv_residual_status.maximum_fluence_b_bits,
        bitcast<u32>(max(0.0, fluence.b)));
    atomicMax(&cloud_lv_residual_status.maximum_numerator_r_bits,
        bitcast<u32>(max(0.0, terms.numerator.r)));
    atomicMax(&cloud_lv_residual_status.maximum_numerator_g_bits,
        bitcast<u32>(max(0.0, terms.numerator.g)));
    atomicMax(&cloud_lv_residual_status.maximum_numerator_b_bits,
        bitcast<u32>(max(0.0, terms.numerator.b)));
    atomicMax(&cloud_lv_residual_status.maximum_denominator_r_bits,
        bitcast<u32>(max(0.0, terms.denominator.r)));
    atomicMax(&cloud_lv_residual_status.maximum_denominator_g_bits,
        bitcast<u32>(max(0.0, terms.denominator.g)));
    atomicMax(&cloud_lv_residual_status.maximum_denominator_b_bits,
        bitcast<u32>(max(0.0, terms.denominator.b)));
    atomicMax(&cloud_lv_residual_status.maximum_boundary_r_bits,
        bitcast<u32>(max(0.0, maximum_boundary.r)));
    atomicMax(&cloud_lv_residual_status.maximum_boundary_g_bits,
        bitcast<u32>(max(0.0, maximum_boundary.g)));
    atomicMax(&cloud_lv_residual_status.maximum_boundary_b_bits,
        bitcast<u32>(max(0.0, maximum_boundary.b)));
    atomicMax(&cloud_lv_residual_status.maximum_candidate_r_bits,
        bitcast<u32>(max(0.0, candidate.r)));
    atomicMax(&cloud_lv_residual_status.maximum_candidate_g_bits,
        bitcast<u32>(max(0.0, candidate.g)));
    atomicMax(&cloud_lv_residual_status.maximum_candidate_b_bits,
        bitcast<u32>(max(0.0, candidate.b)));
    atomicAdd(&cloud_lv_residual_status.occupied_count, 1u);
}
`;
};

export interface CloudLightVolumeSamplingWgslOptions {
    config?: CloudLightVolumeGridConfig;
    bindingGroup?: number;
    viewUniformBinding?: number;
    packedVolumeBinding?: number;
    lightningVolumeBinding?: number;
}

/** Group 1 view ABI: one fixed uniform plus one packed sampled 3D texture. */
export const createCloudLightVolumeSamplingWgsl = (
    options: CloudLightVolumeSamplingWgslOptions = {},
) => {
    const config = options.config ?? CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG;
    const [width, height, depth] = config.dimensions;
    const group = options.bindingGroup ?? 1;
    const uniformBinding = options.viewUniformBinding ?? 0;
    const packedBinding = options.packedVolumeBinding ?? 1;
    const lightningBinding = options.lightningVolumeBinding ?? 2;
    return /* wgsl */ `
const CLOUD_LV_SAMPLE_WIDTH: u32 = ${width}u;
const CLOUD_LV_SAMPLE_HEIGHT: u32 = ${height}u;
const CLOUD_LV_SAMPLE_DEPTH: u32 = ${depth}u;
const CLOUD_LV_SAMPLE_MAX_BRICKS: u32 = ${config.maxBricks}u;
const CLOUD_LV_SAMPLE_ATLAS_DEPTH: u32 = ${depth * config.maxBricks}u;
const CLOUD_LV_SAMPLE_INV_FOUR_PI: f32 = 0.07957747154594767;
const CLOUD_LV_SAMPLE_SCHEMA: u32 = ${CLOUD_LIGHT_VOLUME_SCHEMA}u;
const CLOUD_LV_SAMPLE_SCHEMA_MASK: u32 = 255u;
const CLOUD_LV_SAMPLE_FILTERED_MEDIUM_BIT: u32 = 256u;
const CLOUD_LV_SAMPLE_PAIRED_DIRECT_Y_BIT: u32 = 512u;
const CLOUD_LV_SAMPLE_RESIDENT_SOURCE_MEDIUM_BIT: u32 = 1024u;
const CLOUD_LV_SAMPLE_P1_ELIGIBLE_BIT: u32 =
    ${CLOUD_LIGHT_VOLUME_BRICK_P1_ELIGIBLE_FLAG}u;
const CLOUD_LV_SAMPLE_KNOWN_METADATA_MASK: u32 =
    CLOUD_LV_SAMPLE_SCHEMA_MASK | CLOUD_LV_SAMPLE_FILTERED_MEDIUM_BIT |
    CLOUD_LV_SAMPLE_PAIRED_DIRECT_Y_BIT |
    CLOUD_LV_SAMPLE_RESIDENT_SOURCE_MEDIUM_BIT |
    CLOUD_LV_SAMPLE_P1_ELIGIBLE_BIT;

struct CloudLvSampleTransform {
    origin_active: vec4<f32>,
    axis_x_cell: vec4<f32>,
    axis_y_cell: vec4<f32>,
    axis_z_cell: vec4<f32>,
};
struct CloudLvSampleBrick {
    diffusion: CloudLvSampleTransform,
    direct_0: CloudLvSampleTransform,
    direct_1: CloudLvSampleTransform,
    owner_atlas_tau_schema: vec4<f32>,
    face_pos_x: vec4<f32>, face_neg_x: vec4<f32>,
    face_pos_y: vec4<f32>, face_neg_y: vec4<f32>,
    face_pos_z: vec4<f32>, face_neg_z: vec4<f32>,
};
struct CloudLvViewUniform {
    ready_mask_count_schema_bank: vec4<u32>,
    resident_layers_owner_masks_depth: vec4<u32>,
    bricks: array<CloudLvSampleBrick, CLOUD_LV_SAMPLE_MAX_BRICKS>,
};

@group(${group}) @binding(${uniformBinding}) var<uniform>
    cloud_lv_view: CloudLvViewUniform;
@group(${group}) @binding(${packedBinding}) var
    cloud_lv_packed_view: texture_3d<f32>;
@group(${group}) @binding(${lightningBinding}) var
    cloud_lv_lightning_view: texture_3d<f32>;

fn cloud_lv_sample_brick_ready(index: u32) -> bool {
    return index < CLOUD_LV_SAMPLE_MAX_BRICKS &&
        (cloud_lv_view.ready_mask_count_schema_bank.x & (1u << index)) != 0u &&
        cloud_lv_view.bricks[index].diffusion.origin_active.w > 0.5;
}

fn cloud_lv_layer_ready(layer_index: u32) -> bool {
    return layer_index < 3u &&
        (cloud_lv_view.resident_layers_owner_masks_depth.x &
            (1u << layer_index)) != 0u;
}

// The published owner mask is the transport partition, not a quality hint.
// An owner in this mask is represented by its resident direct field and must
// therefore be excluded from the exact missing-owner Beer integral.
fn cloud_lv_owner_resident(owner_index: u32) -> bool {
    if (owner_index < 32u) {
        return (cloud_lv_view.resident_layers_owner_masks_depth.y &
            (1u << owner_index)) != 0u;
    }
    if (owner_index < 36u) {
        return (cloud_lv_view.resident_layers_owner_masks_depth.z &
            (1u << (owner_index - 32u))) != 0u;
    }
    return false;
}

fn cloud_lv_sample_owner_index(brick: CloudLvSampleBrick) -> u32 {
    return u32(max(0.0, round(brick.owner_atlas_tau_schema.x)));
}

fn cloud_lv_sample_layer_index(brick: CloudLvSampleBrick) -> u32 {
    return min(2u, u32(max(0.0, round(brick.owner_atlas_tau_schema.y))));
}

fn cloud_lv_sample_sampling_word(brick: CloudLvSampleBrick) -> u32 {
    let raw = brick.owner_atlas_tau_schema.w;
    if (!(raw >= 0.0 &&
        raw <= f32(CLOUD_LV_SAMPLE_KNOWN_METADATA_MASK) &&
        raw == floor(raw))) {
        return 0xffffffffu;
    }
    return u32(raw);
}

fn cloud_lv_sample_sampling_word_is_valid(word: u32) -> bool {
    let schema_matches =
        (word & CLOUD_LV_SAMPLE_SCHEMA_MASK) == CLOUD_LV_SAMPLE_SCHEMA;
    let has_only_known_bits =
        (word & ~CLOUD_LV_SAMPLE_KNOWN_METADATA_MASK) == 0u;
    let filtered = (word & CLOUD_LV_SAMPLE_FILTERED_MEDIUM_BIT) != 0u;
    let paired = (word & CLOUD_LV_SAMPLE_PAIRED_DIRECT_Y_BIT) != 0u;
    return schema_matches && has_only_known_bits && (!paired || filtered);
}

// This flag proves that every conservative support tile for the owner was
// selected. A truncated tile may still publish its exact full-owner Beer
// field, but its one-value-per-face diffuse closure is not a camera-visible
// radiance solution and must not expose the rectangular residency domain.
fn cloud_lv_sample_complete_owner_diffuse_safe(
    brick: CloudLvSampleBrick,
) -> bool {
    let word = cloud_lv_sample_sampling_word(brick);
    return cloud_lv_sample_sampling_word_is_valid(word) &&
        (word & CLOUD_LV_SAMPLE_RESIDENT_SOURCE_MEDIUM_BIT) != 0u &&
        (word & CLOUD_LV_SAMPLE_P1_ELIGIBLE_BIT) != 0u;
}

fn cloud_lv_sample_local_center(
    transform: CloudLvSampleTransform, world_position_km: vec3<f32>,
) -> vec3<f32> {
    let delta = world_position_km - transform.origin_active.xyz;
    return vec3<f32>(
        dot(delta, transform.axis_x_cell.xyz) / max(1e-8, transform.axis_x_cell.w),
        dot(delta, transform.axis_y_cell.xyz) / max(1e-8, transform.axis_y_cell.w),
        dot(delta, transform.axis_z_cell.xyz) / max(1e-8, transform.axis_z_cell.w)
    ) - vec3<f32>(0.5);
}

fn cloud_lv_sample_center_inside(center: vec3<f32>) -> bool {
    return all(center >= vec3<f32>(-0.5)) && all(center <= vec3<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH) - 0.5, f32(CLOUD_LV_SAMPLE_HEIGHT) - 0.5,
        f32(CLOUD_LV_SAMPLE_DEPTH) - 0.5));
}

fn cloud_lv_sample_edge_weight(center: vec3<f32>) -> f32 {
    let distance_cells = min(center + vec3<f32>(0.5), vec3<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH) - 0.5, f32(CLOUD_LV_SAMPLE_HEIGHT) - 0.5,
        f32(CLOUD_LV_SAMPLE_DEPTH) - 0.5) - center);
    return max(0.0,
        min(distance_cells.x, min(distance_cells.y, distance_cells.z)));
}

// The owner-space tiles carry a two-cell overlap. Fade the production closure
// across that physical guard region so a selected tile can never appear as a
// rectangular lighting mask against the bounded legacy closure. Same-owner
// siblings form a continuous union because the maximum confidence reaches one
// through their shared overlap.
fn cloud_lv_sample_brick_confidence(center: vec3<f32>) -> f32 {
    let distance_cells = min(center + vec3<f32>(0.5), vec3<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH) - 0.5, f32(CLOUD_LV_SAMPLE_HEIGHT) - 0.5,
        f32(CLOUD_LV_SAMPLE_DEPTH) - 0.5) - center);
    return smoothstep(0.0, 2.0,
        min(distance_cells.x, min(distance_cells.y, distance_cells.z)));
}

fn cloud_lv_owner_sample_confidence(
    world_position_km: vec3<f32>, owner_index: u32,
) -> f32 {
    var confidence = 0.0;
    for (var index = 0u; index < CLOUD_LV_SAMPLE_MAX_BRICKS; index += 1u) {
        if (!cloud_lv_sample_brick_ready(index)) { continue; }
        let brick = cloud_lv_view.bricks[index];
        if (cloud_lv_sample_owner_index(brick) != owner_index) { continue; }
        // P1 and analytic higher-order transport are different closures. Never
        // mix them among owners of one visible layer: an owner-complete solve is
        // camera-visible only when every owner in that layer is complete.
        if (!cloud_lv_layer_ready(cloud_lv_sample_layer_index(brick))) { continue; }
        if (!cloud_lv_sample_complete_owner_diffuse_safe(brick)) { continue; }
        let center = cloud_lv_sample_local_center(brick.diffusion,
            world_position_km);
        if (!cloud_lv_sample_center_inside(center)) { continue; }
        confidence = max(confidence, cloud_lv_sample_brick_confidence(center));
    }
    return confidence;
}

fn cloud_lv_sample_packed_trilinear(
    center_input: vec3<f32>, brick_index: u32, field_index: u32,
) -> vec3<f32> {
    let center = clamp(center_input, vec3<f32>(0.0), vec3<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH - 1u), f32(CLOUD_LV_SAMPLE_HEIGHT - 1u),
        f32(CLOUD_LV_SAMPLE_DEPTH - 1u)));
    let base = vec3<i32>(floor(center));
    let fraction = fract(center);
    var result = vec3<f32>(0.0);
    for (var z = 0; z < 2; z += 1) {
        for (var y = 0; y < 2; y += 1) {
            for (var x = 0; x < 2; x += 1) {
                let local = min(vec3<i32>(i32(CLOUD_LV_SAMPLE_WIDTH - 1u),
                    i32(CLOUD_LV_SAMPLE_HEIGHT - 1u), i32(CLOUD_LV_SAMPLE_DEPTH - 1u)),
                    base + vec3<i32>(x, y, z));
                let atlas = vec3<i32>(local.x, local.y, local.z +
                    i32(cloud_lv_view.ready_mask_count_schema_bank.w +
                    brick_index * CLOUD_LV_SAMPLE_DEPTH +
                    field_index * CLOUD_LV_SAMPLE_ATLAS_DEPTH));
                let weight = select(1.0 - fraction.x, fraction.x, x == 1) *
                    select(1.0 - fraction.y, fraction.y, y == 1) *
                    select(1.0 - fraction.z, fraction.z, z == 1);
                result += textureLoad(cloud_lv_packed_view, atlas, 0).rgb * weight;
            }
        }
    }
    return max(vec3<f32>(0.0), result);
}

// Lightning transfer is deliberately materialized only at multigrid level 2
// (12x8x12 per brick). Its broad in-cloud diffusion footprint has no visible
// energy above that spatial bandwidth, and avoiding a 48x32x48 line-source
// solve is what keeps event onset bounded on Metal.
fn cloud_lv_sample_owner_lightning_transfer(
    world_position_km: vec3<f32>, owner_index: u32,
) -> vec3<f32> {
    let level = 2u;
    let scale = f32(1u << level);
    let level_width = max(1u, CLOUD_LV_SAMPLE_WIDTH >> level);
    let level_height = max(1u, CLOUD_LV_SAMPLE_HEIGHT >> level);
    let level_depth = max(1u, CLOUD_LV_SAMPLE_DEPTH >> level);
    let level_atlas_depth = level_depth * CLOUD_LV_SAMPLE_MAX_BRICKS;
    var weighted = vec3<f32>(0.0);
    var weight_sum = 0.0;
    for (var brick_index = 0u; brick_index < CLOUD_LV_SAMPLE_MAX_BRICKS;
        brick_index += 1u) {
        if (!cloud_lv_sample_brick_ready(brick_index)) { continue; }
        let brick = cloud_lv_view.bricks[brick_index];
        if (cloud_lv_sample_owner_index(brick) != owner_index) { continue; }
        let fine_center = cloud_lv_sample_local_center(
            brick.diffusion, world_position_km);
        let center = fine_center / scale;
        if (any(center < vec3<f32>(-0.5)) || any(center > vec3<f32>(
            f32(level_width) - 0.5, f32(level_height) - 0.5,
            f32(level_depth) - 0.5))) { continue; }
        let bounded = clamp(center, vec3<f32>(0.0), vec3<f32>(
            f32(level_width - 1u), f32(level_height - 1u),
            f32(level_depth - 1u)));
        let base = vec3<i32>(floor(bounded));
        let fraction = fract(bounded);
        var sample_value = vec3<f32>(0.0);
        for (var z = 0; z < 2; z += 1) {
            for (var y = 0; y < 2; y += 1) {
                for (var x = 0; x < 2; x += 1) {
                    let local = min(vec3<i32>(i32(level_width - 1u),
                        i32(level_height - 1u), i32(level_depth - 1u)),
                        base + vec3<i32>(x, y, z));
                    let active_bank =
                        cloud_lv_view.ready_mask_count_schema_bank.w /
                        (3u * CLOUD_LV_SAMPLE_ATLAS_DEPTH);
                    let atlas_z = local.z + i32(active_bank *
                        level_atlas_depth + brick_index * level_depth);
                    let corner = textureLoad(cloud_lv_lightning_view,
                        vec3<i32>(local.x, local.y, atlas_z), i32(level)).rgb;
                    let corner_weight =
                        select(1.0 - fraction.x, fraction.x, x == 1) *
                        select(1.0 - fraction.y, fraction.y, y == 1) *
                        select(1.0 - fraction.z, fraction.z, z == 1);
                    sample_value += corner * corner_weight;
                }
            }
        }
        let edge_weight = cloud_lv_sample_edge_weight(fine_center);
        weighted += max(vec3<f32>(0.0), sample_value) * edge_weight;
        weight_sum += edge_weight;
    }
    if (weight_sum <= 0.0) { return vec3<f32>(0.0); }
    return weighted / weight_sum;
}

fn cloud_lv_sample_direct_face_transmittance(
    center_input: vec3<f32>, brick_index: u32, field_index: u32,
) -> vec3<f32> {
    if (center_input.x < -0.501 ||
        center_input.x > f32(CLOUD_LV_SAMPLE_WIDTH) - 0.499 ||
        center_input.z < -0.501 ||
        center_input.z > f32(CLOUD_LV_SAMPLE_DEPTH) - 0.499) {
        return vec3<f32>(1.0);
    }
    let face_y_input = center_input.y + 0.5;
    if (face_y_input >= f32(CLOUD_LV_SAMPLE_HEIGHT)) {
        return vec3<f32>(1.0);
    }
    let face_y = max(0.0, face_y_input);
    let lower_y = min(i32(CLOUD_LV_SAMPLE_HEIGHT) - 1, i32(floor(face_y)));
    let upper_y = lower_y + 1;
    let y_fraction = face_y - f32(lower_y);
    let center_xz = clamp(center_input.xz, vec2<f32>(0.0), vec2<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH - 1u),
        f32(CLOUD_LV_SAMPLE_DEPTH - 1u)));
    let base_xz = vec2<i32>(floor(center_xz));
    let fraction_xz = fract(center_xz);
    let field_offset = i32(cloud_lv_view.ready_mask_count_schema_bank.w +
        brick_index * CLOUD_LV_SAMPLE_DEPTH +
        field_index * CLOUD_LV_SAMPLE_ATLAS_DEPTH);
    var result = vec3<f32>(0.0);
    for (var z = 0; z < 2; z += 1) {
        for (var x = 0; x < 2; x += 1) {
            let local_xz = min(vec2<i32>(i32(CLOUD_LV_SAMPLE_WIDTH - 1u),
                i32(CLOUD_LV_SAMPLE_DEPTH - 1u)),
                base_xz + vec2<i32>(x, z));
            let lower_atlas = vec3<i32>(
                local_xz.x, lower_y, local_xz.y + field_offset);
            let lower = textureLoad(
                cloud_lv_packed_view, lower_atlas, 0).rgb;
            var upper = vec3<f32>(1.0);
            if (upper_y < i32(CLOUD_LV_SAMPLE_HEIGHT)) {
                upper = textureLoad(cloud_lv_packed_view,
                    vec3<i32>(lower_atlas.x, upper_y, lower_atlas.z), 0).rgb;
            }
            let column = exp(mix(log(max(vec3<f32>(1e-30), lower)),
                log(max(vec3<f32>(1e-30), upper)), y_fraction));
            let weight = select(1.0 - fraction_xz.x, fraction_xz.x, x == 1) *
                select(1.0 - fraction_xz.y, fraction_xz.y, z == 1);
            result += column * weight;
        }
    }
    // Two real empty columns surround the finite owner. The remaining virtual
    // face interpolation is therefore an identity for valid published fields,
    // retained only as fail-closed continuity at the packed atlas boundary.
    let clear_x = clamp(2.0 * min(
        center_input.x + 0.5,
        f32(CLOUD_LV_SAMPLE_WIDTH) - 0.5 - center_input.x), 0.0, 1.0);
    let clear_z = clamp(2.0 * min(
        center_input.z + 0.5,
        f32(CLOUD_LV_SAMPLE_DEPTH) - 0.5 - center_input.z), 0.0, 1.0);
    let guard_density = clear_x * clear_z;
    let bounded = clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
    if (guard_density >= 1.0) { return bounded; }
    return clamp(exp(log(max(vec3<f32>(1e-30), bounded)) * guard_density),
        vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_lv_owner_has_sample(world_position_km: vec3<f32>, owner_index: u32) -> bool {
    return cloud_lv_owner_sample_confidence(world_position_km, owner_index) > 0.0;
}

fn cloud_lv_sample_owner_direct_transmittance(
    world_position_km: vec3<f32>, owner_index: u32, source_index: u32,
) -> vec3<f32> {
    for (var index = 0u; index < CLOUD_LV_SAMPLE_MAX_BRICKS; index += 1u) {
        if (!cloud_lv_sample_brick_ready(index)) { continue; }
        let brick = cloud_lv_view.bricks[index];
        if (cloud_lv_sample_owner_index(brick) != owner_index) { continue; }
        var transform = brick.direct_0;
        if (source_index != 0u) { transform = brick.direct_1; }
        let direct_center = cloud_lv_sample_local_center(transform, world_position_km);
        // Publication copies one byte-identical full-owner field into every
        // sibling slot. Reading the first stable slot avoids averaging copies
        // whose readiness may straddle an atomic publication boundary.
        return cloud_lv_sample_direct_face_transmittance(
            direct_center, index, 1u + min(1u, source_index));
    }
    return vec3<f32>(1.0);
}

// The low-frequency lighting cache excludes the current layer in its entirety.
// Multiply every distinct resident owner exactly once to reconstruct the
// resident part of that layer's source-aligned Beer transport. Exact transport
// supplies only owners absent from the published mask; sibling tiles share one
// complete owner direct field even when their local P1 domains are partial.
fn cloud_lv_sample_layer_direct_transmittance(
    world_position_km: vec3<f32>, layer_index: u32, source_index: u32,
) -> vec3<f32> {
    var result = vec3<f32>(1.0);
    for (var index = 0u; index < CLOUD_LV_SAMPLE_MAX_BRICKS; index += 1u) {
        if (!cloud_lv_sample_brick_ready(index)) { continue; }
        let brick = cloud_lv_view.bricks[index];
        if (cloud_lv_sample_layer_index(brick) != layer_index) { continue; }
        let owner = cloud_lv_sample_owner_index(brick);
        var first_owner_record = true;
        for (var previous = 0u; previous < CLOUD_LV_SAMPLE_MAX_BRICKS;
            previous += 1u) {
            if (previous >= index) { break; }
            if (cloud_lv_sample_brick_ready(previous) &&
                cloud_lv_sample_layer_index(cloud_lv_view.bricks[previous]) ==
                    layer_index &&
                cloud_lv_sample_owner_index(cloud_lv_view.bricks[previous]) ==
                    owner) {
                first_owner_record = false;
                break;
            }
        }
        if (!first_owner_record) { continue; }
        if (!cloud_lv_owner_resident(owner)) { continue; }
        result *= cloud_lv_sample_owner_direct_transmittance(
            world_position_km, owner, source_index);
    }
    return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_lv_sample_brick_scattering_radiance(
    center: vec3<f32>, brick_index: u32, outgoing_direction: vec3<f32>,
    diffusion_rgb: vec3<f32>,
) -> vec3<f32> {
    let brick = cloud_lv_view.bricks[brick_index];
    let phi = cloud_lv_sample_packed_trilinear(center, brick_index, 0u);
    let maximum_center = vec3<f32>(
        f32(CLOUD_LV_SAMPLE_WIDTH - 1u),
        f32(CLOUD_LV_SAMPLE_HEIGHT - 1u),
        f32(CLOUD_LV_SAMPLE_DEPTH - 1u));
    let lower_x = max(0.0, center.x - 1.0);
    let upper_x = min(maximum_center.x, center.x + 1.0);
    let lower_y = max(0.0, center.y - 1.0);
    let upper_y = min(maximum_center.y, center.y + 1.0);
    let lower_z = max(0.0, center.z - 1.0);
    let upper_z = min(maximum_center.z, center.z + 1.0);
    // Use a true one-sided derivative at an exterior edge instead of taking a
    // centred difference against a clamped duplicate sample. The old half
    // gradient suppressed the P1 current over a complete cell and turned
    // illuminated boundaries into broad, flat shelves.
    let dx = (cloud_lv_sample_packed_trilinear(
        vec3<f32>(upper_x, center.yz), brick_index, 0u) -
        cloud_lv_sample_packed_trilinear(
        vec3<f32>(lower_x, center.yz), brick_index, 0u)) /
        max(1e-8, (upper_x - lower_x) * brick.diffusion.axis_x_cell.w);
    let dy = (cloud_lv_sample_packed_trilinear(
        vec3<f32>(center.x, upper_y, center.z), brick_index, 0u) -
        cloud_lv_sample_packed_trilinear(
        vec3<f32>(center.x, lower_y, center.z), brick_index, 0u)) /
        max(1e-8, (upper_y - lower_y) * brick.diffusion.axis_y_cell.w);
    let dz = (cloud_lv_sample_packed_trilinear(
        vec3<f32>(center.xy, upper_z), brick_index, 0u) -
        cloud_lv_sample_packed_trilinear(
        vec3<f32>(center.xy, lower_z), brick_index, 0u)) /
        max(1e-8, (upper_z - lower_z) * brick.diffusion.axis_z_cell.w);
    let direction = normalize(outgoing_direction + vec3<f32>(1e-12));
    var radiance = vec3<f32>(0.0);
    for (var channel = 0u; channel < 3u; channel += 1u) {
        let gradient_world = brick.diffusion.axis_x_cell.xyz * dx[channel] +
            brick.diffusion.axis_y_cell.xyz * dy[channel] +
            brick.diffusion.axis_z_cell.xyz * dz[channel];
        var current = -max(0.0, diffusion_rgb[channel]) * gradient_world;
        let maximum_current = phi[channel] / 3.0;
        if (length(current) > maximum_current && length(current) > 1e-12) {
            current *= maximum_current / length(current);
        }
        // P1 reconstructs radiance from its zeroth (fluence) and first
        // (current) angular moments as (Phi + 3 w.J) / 4pi.  Anisotropy is
        // already present in J through the transport diffusion coefficient
        // 1/[3(sigma_a + sigma_s(1-g))]. Multiplying the first moment by g a
        // second time suppresses directional contrast and no longer
        // reconstructs the moment solved by the diffusion equation.
        radiance[channel] = max(0.0, phi[channel] + 3.0 *
            dot(current, direction)) * CLOUD_LV_SAMPLE_INV_FOUR_PI;
    }
    return radiance;
}

// P1-reconstructed incident radiance. The caller supplies the exact local
// transport diffusion coefficient (which already contains asymmetry through
// reduced scattering) and applies local single-scattering albedo exactly once
// at its extinction event.
fn cloud_lv_sample_owner_scattering_radiance(
    world_position_km: vec3<f32>, outgoing_direction: vec3<f32>, owner_index: u32,
    diffusion_rgb: vec3<f32>,
) -> vec3<f32> {
    var weighted = vec3<f32>(0.0);
    var weight_sum = 0.0;
    for (var index = 0u; index < CLOUD_LV_SAMPLE_MAX_BRICKS; index += 1u) {
        if (!cloud_lv_sample_brick_ready(index)) { continue; }
        let brick = cloud_lv_view.bricks[index];
        if (cloud_lv_sample_owner_index(brick) != owner_index) { continue; }
        if (!cloud_lv_layer_ready(cloud_lv_sample_layer_index(brick))) { continue; }
        if (!cloud_lv_sample_complete_owner_diffuse_safe(brick)) { continue; }
        let center = cloud_lv_sample_local_center(brick.diffusion, world_position_km);
        if (!cloud_lv_sample_center_inside(center)) { continue; }
        let weight = cloud_lv_sample_edge_weight(center);
        weighted += cloud_lv_sample_brick_scattering_radiance(center, index,
            outgoing_direction, diffusion_rgb) * weight;
        weight_sum += weight;
    }
    if (weight_sum <= 0.0) { return vec3<f32>(0.0); }
    return weighted / weight_sum;
}
`;
};

export const CLOUD_LIGHT_VOLUME_COMPUTE_WGSL =
    createCloudLightVolumeComputeWgsl();
export const CLOUD_LIGHT_VOLUME_SAMPLING_WGSL =
    createCloudLightVolumeSamplingWgsl();

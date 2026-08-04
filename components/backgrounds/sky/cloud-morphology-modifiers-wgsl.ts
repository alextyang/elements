/**
 * Append-only shader contract for orthogonal cloud morphology modifiers.
 *
 * The production cloud lighting and view-transport shaders must include this
 * declaration verbatim and evaluate the same owner range. No sampler is used:
 * rgba32float records are addressed exactly with textureLoad.
 */
export const CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH = 1.04;
export const CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_MAX_FIBRES = 8;
export const CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MINIMUM = 0.30;
export const CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MAXIMUM = 0.58;
export const CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MINIMUM = 0.34;
export const CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MAXIMUM = 0.58;

export const CLOUD_MORPHOLOGY_MODIFIERS_WGSL = /* wgsl */ `
const CLOUD_MORPHOLOGY_TEXTURE_WIDTH: u32 = 256u;
const CLOUD_MORPHOLOGY_MAX_OWNERS: u32 = 36u;
const CLOUD_MORPHOLOGY_HEADER_TEXELS: u32 = 73u;
const CLOUD_MORPHOLOGY_RECORD_TEXELS: u32 = 8u;
const CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS: u32 = 5u;

const CLOUD_MORPHOLOGY_BLEND_SMOOTH_UNION: u32 = 1u;
const CLOUD_MORPHOLOGY_BLEND_SUBTRACT: u32 = 2u;
const CLOUD_MORPHOLOGY_BLEND_WARP: u32 = 3u;
const CLOUD_MORPHOLOGY_BLEND_PLACEMENT: u32 = 4u;
const CLOUD_MORPHOLOGY_BLEND_OPTICAL: u32 = 5u;
const CLOUD_MORPHOLOGY_BLEND_REUSE: u32 = 6u;

const CLOUD_MORPHOLOGY_OP_WARP_CURL: u32 = 1u;
const CLOUD_MORPHOLOGY_OP_ADD_SPINE_RIBS: u32 = 2u;
const CLOUD_MORPHOLOGY_OP_WARP_WAVE: u32 = 3u;
const CLOUD_MORPHOLOGY_OP_PLACE_WORLD_BANDS: u32 = 4u;
const CLOUD_MORPHOLOGY_OP_SUBTRACT_LACUNAE: u32 = 5u;
const CLOUD_MORPHOLOGY_OP_CLONE_LAYER: u32 = 6u;
const CLOUD_MORPHOLOGY_OP_REMAP_EXTINCTION: u32 = 7u;
const CLOUD_MORPHOLOGY_OP_SEPARATE_ELEMENTS: u32 = 8u;
const CLOUD_MORPHOLOGY_OP_ADD_UDDER_LOBES: u32 = 9u;
const CLOUD_MORPHOLOGY_OP_ADD_KH_BILLOW: u32 = 10u;
const CLOUD_MORPHOLOGY_OP_DISPLACE_UNDERSIDE: u32 = 11u;
const CLOUD_MORPHOLOGY_OP_SUBTRACT_CAVUM: u32 = 12u;
const CLOUD_MORPHOLOGY_OP_ADD_GUST_FRONT: u32 = 13u;
const CLOUD_MORPHOLOGY_OP_ADD_VORTEX_FUNNEL: u32 = 14u;
const CLOUD_MORPHOLOGY_OP_ADD_WALL_LOWERING: u32 = 15u;
const CLOUD_MORPHOLOGY_OP_ADD_TAIL_CONNECTOR: u32 = 16u;
const CLOUD_MORPHOLOGY_OP_REUSE_BASE_MACRO: u32 = 17u;
const CLOUD_MORPHOLOGY_OP_ADD_CAP_SHELL: u32 = 18u;
const CLOUD_MORPHOLOGY_OP_ADD_VEIL_SHEET: u32 = 19u;
const CLOUD_MORPHOLOGY_OP_ADD_FRAGMENTS: u32 = 20u;
const CLOUD_MORPHOLOGY_OP_ADD_INFLOW_BAND: u32 = 21u;
const CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET: u32 = 22u;

@group(0) @binding(30)
var cloud_morphology_modifiers: texture_2d<f32>;

struct CloudMorphologyModifierRecord {
    metadata: vec4<f32>,
    identity: vec4<f32>,
    center_support: vec4<f32>,
    axis_u: vec4<f32>,
    axis_v: vec4<f32>,
    axis_w: vec4<f32>,
    shape0: vec4<f32>,
    shape1: vec4<f32>,
};

fn cloud_morphology_texel(address: u32) -> vec4<f32> {
    let coordinate = vec2<i32>(
        i32(address % CLOUD_MORPHOLOGY_TEXTURE_WIDTH),
        i32(address / CLOUD_MORPHOLOGY_TEXTURE_WIDTH));
    return textureLoad(cloud_morphology_modifiers, coordinate, 0);
}

fn cloud_morphology_record_count() -> u32 {
    return u32(cloud_morphology_texel(0u).x + 0.5);
}

fn cloud_morphology_owner_range(parent_owner_index: u32) -> vec2<u32> {
    if (parent_owner_index >= CLOUD_MORPHOLOGY_MAX_OWNERS) {
        return vec2<u32>(0u);
    }
    let packed = cloud_morphology_texel(1u + parent_owner_index);
    return vec2<u32>(u32(packed.x + 0.5), u32(packed.y + 0.5));
}

fn cloud_morphology_fibratus_owner_range(
    parent_owner_index: u32,
) -> vec2<u32> {
    if (parent_owner_index >= CLOUD_MORPHOLOGY_MAX_OWNERS) {
        return vec2<u32>(0u);
    }
    let packed = cloud_morphology_texel(
        1u + CLOUD_MORPHOLOGY_MAX_OWNERS + parent_owner_index);
    return vec2<u32>(u32(packed.x + 0.5), u32(packed.y + 0.5));
}

struct CloudCirrusFibratusDescriptor {
    // fibre index, daughter flag, longitudinal start, longitudinal end
    metadata: vec4<f32>,
    // source cross/vertical, terminal cross/vertical (kilometres)
    trajectory: vec4<f32>,
    // source cross/vertical radii, h2, h3
    radii_hash23: vec4<f32>,
    // h4, h5, h6, h7
    hashes4567: vec4<f32>,
    // h8, terminal width ratio, terminal density ratio, primary lane
    taper_lane: vec4<f32>,
};

fn cloud_morphology_load_fibratus_descriptor(
    descriptor_index: u32,
) -> CloudCirrusFibratusDescriptor {
    let address = CLOUD_MORPHOLOGY_HEADER_TEXELS +
        cloud_morphology_record_count() * CLOUD_MORPHOLOGY_RECORD_TEXELS +
        descriptor_index * CLOUD_CIRRUS_FIBRATUS_DESCRIPTOR_TEXELS;
    var descriptor: CloudCirrusFibratusDescriptor;
    descriptor.metadata = cloud_morphology_texel(address);
    descriptor.trajectory = cloud_morphology_texel(address + 1u);
    descriptor.radii_hash23 = cloud_morphology_texel(address + 2u);
    descriptor.hashes4567 = cloud_morphology_texel(address + 3u);
    descriptor.taper_lane = cloud_morphology_texel(address + 4u);
    return descriptor;
}

struct CloudLogicalTopology {
    exemplar_ordinal: u32,
    connectivity: u32,
    lineage_depth: f32,
    macro_element_count: f32,
    branch_or_crest_count: f32,
    shear_coupling: f32,
    sedimentation_coupling: f32,
    cellular_closure: f32,
};

fn cloud_morphology_owner_topology(
    parent_owner_index: u32,
) -> CloudLogicalTopology {
    var packed = 0u;
    if (parent_owner_index < CLOUD_MORPHOLOGY_MAX_OWNERS) {
        packed = bitcast<u32>(
            cloud_morphology_texel(1u + parent_owner_index).w);
    }
    var topology: CloudLogicalTopology;
    topology.exemplar_ordinal = packed & 3u;
    topology.connectivity = (packed >> 2u) & 7u;
    topology.lineage_depth = f32((packed >> 5u) & 15u);
    topology.macro_element_count = f32((packed >> 9u) & 63u);
    topology.branch_or_crest_count = f32((packed >> 15u) & 15u);
    topology.shear_coupling = f32((packed >> 19u) & 15u) / 15.0;
    topology.sedimentation_coupling = f32((packed >> 23u) & 15u) / 15.0;
    topology.cellular_closure = f32((packed >> 27u) & 31u) / 15.5 - 1.0;
    return topology;
}

fn cloud_morphology_load_record(record_index: u32) -> CloudMorphologyModifierRecord {
    let safe_index = min(record_index, max(1u, cloud_morphology_record_count()) - 1u);
    let address = CLOUD_MORPHOLOGY_HEADER_TEXELS +
        safe_index * CLOUD_MORPHOLOGY_RECORD_TEXELS;
    var record: CloudMorphologyModifierRecord;
    record.metadata = cloud_morphology_texel(address);
    record.identity = cloud_morphology_texel(address + 1u);
    record.center_support = cloud_morphology_texel(address + 2u);
    record.axis_u = cloud_morphology_texel(address + 3u);
    record.axis_v = cloud_morphology_texel(address + 4u);
    record.axis_w = cloud_morphology_texel(address + 5u);
    record.shape0 = cloud_morphology_texel(address + 6u);
    record.shape1 = cloud_morphology_texel(address + 7u);
    return record;
}

fn cloud_morphology_operator_code(record: CloudMorphologyModifierRecord) -> u32 {
    return u32(record.metadata.x + 0.5);
}

fn cloud_morphology_blend_code(record: CloudMorphologyModifierRecord) -> u32 {
    return u32(record.metadata.y + 0.5);
}

fn cloud_morphology_parent_owner(record: CloudMorphologyModifierRecord) -> u32 {
    return u32(record.identity.x + 0.5);
}

fn cloud_morphology_seed(record: CloudMorphologyModifierRecord) -> u32 {
    return bitcast<u32>(record.identity.y);
}

fn cloud_morphology_local_position(
    record: CloudMorphologyModifierRecord,
    world_position_km: vec3<f32>,
) -> vec3<f32> {
    let offset = world_position_km - record.center_support.xyz;
    return vec3<f32>(
        dot(offset, record.axis_u.xyz) / max(1e-5, record.axis_u.w),
        dot(offset, record.axis_v.xyz) / max(1e-5, record.axis_v.w),
        dot(offset, record.axis_w.xyz) / max(1e-5, record.axis_w.w));
}

fn cloud_morphology_world_position(
    record: CloudMorphologyModifierRecord,
    local_position: vec3<f32>,
) -> vec3<f32> {
    return record.center_support.xyz +
        record.axis_u.xyz * local_position.x * record.axis_u.w +
        record.axis_v.xyz * local_position.y * record.axis_v.w +
        record.axis_w.xyz * local_position.z * record.axis_w.w;
}

struct CloudMorphologyEvaluation {
    // Sample the parent density at base_position_km, then apply base_coverage.
    base_position_km: vec3<f32>,
    base_coverage: f32,
    // A placement operator may request one additional parent-density sample.
    placement_position_km: vec3<f32>,
    placement_weight: f32,
    // True condensate topology, composed before optical transport.
    additive_density: f32,
    subtractive_density: f32,
    // A canonical macro atlas lookup owned by the same parent.
    reuse_macro_code: u32,
    reuse_weight: f32,
    // Negative target optical depth means no remap was requested.
    target_optical_depth: f32,
    opaque_area: vec2<f32>,
    direct_disc_transmission: vec2<f32>,
    optical_weight: f32,
    // Upper-atmosphere scattering material; never baked RGB.
    material_profile_code: u32,
    material_weight: f32,
    // Owner-stable logical construction shared with the macro atlas and
    // family foundation; modifiers use it instead of inventing a generic
    // population frequency or an unrelated connectivity pattern.
    logical_topology: CloudLogicalTopology,
};

fn cloud_morphology_initial_evaluation(
    world_position_km: vec3<f32>,
) -> CloudMorphologyEvaluation {
    var result: CloudMorphologyEvaluation;
    result.base_position_km = world_position_km;
    result.base_coverage = 1.0;
    result.placement_position_km = world_position_km;
    result.placement_weight = 0.0;
    result.additive_density = 0.0;
    result.subtractive_density = 0.0;
    result.reuse_macro_code = 0u;
    result.reuse_weight = 0.0;
    result.target_optical_depth = -1.0;
    result.opaque_area = vec2<f32>(0.0, 1.0);
    result.direct_disc_transmission = vec2<f32>(0.0, 1.0);
    result.optical_weight = 0.0;
    result.material_profile_code = 0u;
    result.material_weight = 0.0;
    result.logical_topology = cloud_morphology_owner_topology(
        CLOUD_MORPHOLOGY_MAX_OWNERS);
    return result;
}

fn cloud_morphology_hash_cell(
    x: i32,
    y: i32,
    z: i32,
    seed: u32,
) -> f32 {
    var value = seed;
    value ^= bitcast<u32>(x) * 0x9e3779b1u;
    value ^= bitcast<u32>(y) * 0x85ebca77u;
    value ^= bitcast<u32>(z) * 0xc2b2ae3du;
    value ^= value >> 16u;
    value *= 0x7feb352du;
    value ^= value >> 15u;
    value *= 0x846ca68bu;
    value ^= value >> 16u;
    return f32(value) / 4294967296.0;
}

fn cloud_morphology_rotate2(value: vec2<f32>, angle: f32) -> vec2<f32> {
    let cosine = cos(angle);
    let sine = sin(angle);
    return vec2<f32>(cosine * value.x - sine * value.y,
        sine * value.x + cosine * value.y);
}

fn cloud_morphology_finite_envelope(local_position: vec3<f32>) -> f32 {
    let largest = max(abs(local_position.x),
        max(abs(local_position.y), abs(local_position.z)));
    return 1.0 - smoothstep(0.82,
        ${CLOUD_MORPHOLOGY_FINITE_ENVELOPE_REACH}, largest);
}

fn cloud_morphology_soft_inside(distance: f32, feather: f32) -> f32 {
    return 1.0 - smoothstep(-feather, feather, distance);
}

fn cloud_morphology_ellipsoid(
    local_position: vec3<f32>,
    radius: vec3<f32>,
) -> f32 {
    return cloud_morphology_soft_inside(
        length(local_position / max(vec3<f32>(1e-4), radius)) - 1.0, 0.08);
}

// Jittered skew-lattice nearest feature. The skew and per-cell offsets remove
// Cartesian alignments while keeping nine bounded neighbor checks.
fn cloud_morphology_cellular(
    local_position: vec3<f32>,
    seed: u32,
    frequency: f32,
) -> f32 {
    let skew = vec2<f32>(
        local_position.x + local_position.z * 0.347,
        local_position.z - local_position.x * 0.219);
    let cell = vec2<i32>(floor((skew + vec2<f32>(1.5)) * frequency));
    var nearest = 10.0;
    for (var dz = -1; dz <= 1; dz++) {
        for (var dx = -1; dx <= 1; dx++) {
            let candidate = cell + vec2<i32>(dx, dz);
            let jitter = vec2<f32>(
                cloud_morphology_hash_cell(candidate.x, 0, candidate.y, seed),
                cloud_morphology_hash_cell(candidate.x, 1, candidate.y, seed)) - 0.5;
            let point = (vec2<f32>(candidate) + 0.5 + jitter * 0.72) /
                frequency - 1.5;
            nearest = min(nearest, length(skew - point) * frequency);
        }
    }
    return nearest;
}

// The 48^3 atlas is the finite low-frequency support for Cirrus fibratus, not
// its final display-scale cross-section. Its swept-C2 source fibres are only
// one to two native samples across, so trilinear reconstruction plus generic
// exterior displacement otherwise turns the family into a stack of broad
// crystalline ribbons. Reconstruct a bounded set of owner-stable analytic
// fibres in physical kilometres inside that support instead.
//
// This is deliberately not generic scalar noise:
//  - canonical z remains the shared synoptic/downwind coordinate;
//  - unequal source height, shear heading and sedimentation give each fibre a
//    nonparallel C2 trajectory without a fibratus-invalid hook or terminal
//    tuft;
//  - daughters inherit one primary lane, begin later, and diverge smoothly;
//  - radius and condensate both taper at the terminal;
//  - the elliptical kernel is analytically widened for a requested world-space
//    reconstruction footprint and reduced by the corresponding area ratio.
//
// View/exact-light callers request the intrinsic world filter. The directional
// coupling producer requests its voxel footprint, producing the filtered form
// of the same density rather than a different shadow caster. No camera, pixel,
// derivative, time, texture, or screen-space state is read here.
fn cloud_morphology_build_fibratus_descriptor(
    fibre_index: u32,
    parent_owner_index: u32,
    topology: CloudLogicalTopology,
    owner_half_extent_km: vec3<f32>,
    deterministic_seeds: vec4<f32>,
) -> CloudCirrusFibratusDescriptor {
    let minor_radius_km = max(0.04, owner_half_extent_km.x);
    let depth_km = max(0.02, owner_half_extent_km.y * 2.0);
    let major_radius_km = max(0.04, owner_half_extent_km.z);
    let owner_seed =
        bitcast<u32>(deterministic_seeds.x) ^
        (bitcast<u32>(deterministic_seeds.z) * 0x9e3779b1u) ^
        (parent_owner_index * 0x85ebca77u) ^
        (topology.exemplar_ordinal * 0xc2b2ae3du);
    let primary_count = u32(clamp(round(
        topology.branch_or_crest_count * 0.55 + 2.0), 3.0, 5.0));
    let is_daughter = fibre_index >= primary_count;
    let lane_index = select(
        fibre_index,
        (fibre_index - primary_count) % primary_count,
        is_daughter);
    let lane_fraction = (f32(lane_index) + 1.0) /
        (f32(primary_count) + 1.0);
    let h0 = cloud_morphology_hash_cell(
        i32(fibre_index), 0, i32(topology.exemplar_ordinal), owner_seed);
    let h1 = cloud_morphology_hash_cell(
        i32(fibre_index), 1, i32(topology.exemplar_ordinal), owner_seed);
    let h2 = cloud_morphology_hash_cell(
        i32(fibre_index), 2, i32(topology.exemplar_ordinal), owner_seed);
    let h3 = fract(h0 * 0.754877666 + h1 * 0.569840291 + 0.137);
    let h4 = fract(h1 * 0.618033989 + h2 * 0.414213562 + 0.271);
    let h5 = fract(h2 * 0.732050808 + h0 * 0.438447187 + 0.419);
    let h6 = fract(h0 * 0.324717957 + h2 * 0.682327804 + 0.587);
    let h7 = fract(h1 * 0.819172513 + h0 * 0.219978738 + 0.731);
    let h8 = fract(h2 * 0.671043606 + h1 * 0.463647609 + 0.887);
    var start = mix(0.045, 0.16, h0);
    var end = mix(0.76, 0.96, h1);
    if (is_daughter) {
        start = mix(0.20, 0.40, h0);
        end = min(0.94, start + mix(0.27, 0.48, h1));
    }
    let span = max(0.16, end - start);
    let along_span_km = 2.0 * major_radius_km * span;
    let lane_position = (lane_fraction - 0.5) *
        minor_radius_km * 1.20;
    let daughter_offset = select(
        0.0,
        mix(-0.10, 0.10, h4) * minor_radius_km,
        is_daughter);
    let source_x_km = lane_position +
        (h0 - 0.5) * minor_radius_km * 0.11 + daughter_offset;
    let source_y_km = mix(-0.06, 0.32, h1) * depth_km +
        select(0.0, mix(-0.055, 0.055, h5) * depth_km, is_daughter);
    let synoptic_cross_slope =
        (topology.shear_coupling - 0.5) * 0.055 +
        (deterministic_seeds.y - 0.5) * 0.025;
    let differential_cross_slope =
        (h2 - 0.5) * mix(0.09, 0.16, topology.shear_coupling);
    let terminal_x_km = clamp(
        source_x_km + along_span_km *
            (synoptic_cross_slope + differential_cross_slope),
        -minor_radius_km * 0.78,
        minor_radius_km * 0.78);
    let sedimentation_drop_km = depth_km * mix(
        0.12, 0.48,
        saturate(topology.sedimentation_coupling * 0.46 + h3 * 0.54));
    let terminal_y_km = max(
        -depth_km * 0.48,
        source_y_km - sedimentation_drop_km);
    var source_cross_radius_km = clamp(
        minor_radius_km * 2.0 * mix(0.009, 0.018, h5),
        0.016, 0.075);
    var source_vertical_radius_km = clamp(
        depth_km * mix(0.020, 0.045, h6),
        0.014, 0.055);
    if (is_daughter) {
        let daughter_scale = mix(0.66, 0.82, h7);
        source_cross_radius_km *= daughter_scale;
        source_vertical_radius_km *= daughter_scale;
    }
    var descriptor: CloudCirrusFibratusDescriptor;
    descriptor.metadata = vec4<f32>(
        f32(fibre_index), select(0.0, 1.0, is_daughter), start, end);
    descriptor.trajectory = vec4<f32>(
        source_x_km, source_y_km, terminal_x_km, terminal_y_km);
    descriptor.radii_hash23 = vec4<f32>(
        source_cross_radius_km, source_vertical_radius_km, h2, h3);
    descriptor.hashes4567 = vec4<f32>(h4, h5, h6, h7);
    let terminal_width_ratio = mix(
        ${CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MINIMUM},
        ${CLOUD_CIRRUS_FIBRATUS_TERMINAL_WIDTH_RATIO_MAXIMUM}, h7);
    let terminal_density_ratio = mix(
        ${CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MINIMUM},
        ${CLOUD_CIRRUS_FIBRATUS_TERMINAL_DENSITY_RATIO_MAXIMUM}, h3);
    descriptor.taper_lane = vec4<f32>(
        h8,
        terminal_width_ratio,
        terminal_density_ratio,
        f32(lane_index));
    return descriptor;
}

fn cloud_morphology_fibratus_descriptor_for(
    fibre_index: u32,
    parent_owner_index: u32,
    topology: CloudLogicalTopology,
    owner_half_extent_km: vec3<f32>,
    deterministic_seeds: vec4<f32>,
) -> CloudCirrusFibratusDescriptor {
    let range = cloud_morphology_fibratus_owner_range(parent_owner_index);
    if (fibre_index < range.y) {
        return cloud_morphology_load_fibratus_descriptor(range.x + fibre_index);
    }
    return cloud_morphology_build_fibratus_descriptor(
        fibre_index,
        parent_owner_index,
        topology,
        owner_half_extent_km,
        deterministic_seeds);
}

fn cloud_morphology_cirrus_fibratus_subvoxel_density(
    parent_owner_index: u32,
    canonical: vec3<f32>,
    macro_density: f32,
    sdf_voxels: f32,
    owner_half_extent_km: vec3<f32>,
    deterministic_seeds: vec4<f32>,
    formation_mechanism: i32,
    species: i32,
    requested_filter_radius_km: f32,
    ray_step_length_km: f32,
    ray_direction_owner_local: vec3<f32>,
) -> f32 {
    // Cloud species code 1 is Ci fibratus; formation mechanism 3 is the
    // sedimenting ice-streamer field. Cirrostratus fibratus and hooked
    // Ci uncinus intentionally keep their own macro/material paths.
    if (species != 1 || formation_mechanism != 3 ||
        macro_density <= 0.0001) {
        return macro_density;
    }
    let topology = cloud_morphology_owner_topology(parent_owner_index);
    if (topology.connectivity != 1u) { return macro_density; }

    // The original signed support is authoritative. In particular, do not let
    // the generic three-to-four-voxel ICE_FIBRE exterior reach become a pale
    // slab around these reconstructed strands.
    if (sdf_voxels >= 0.0) { return 0.0; }
    let support = 1.0 - smoothstep(-0.085, 0.0, sdf_voxels);
    let macro_envelope = smoothstep(0.002, 0.14, macro_density);
    // The residual is independent of analytic fibre anatomy. If the atlas
    // envelope cannot admit a concentrated fibre, returning it here is exact:
    // the original final max had the same residual on both branches.
    let residual_ice = macro_density * support * mix(
        0.032, 0.068, topology.sedimentation_coupling);
    if (macro_envelope <= 0.0) { return saturate(residual_ice); }

    let minor_radius_km = max(0.04, owner_half_extent_km.x);
    let depth_km = max(0.02, owner_half_extent_km.y * 2.0);
    let major_radius_km = max(0.04, owner_half_extent_km.z);
    let physical_position_km = (canonical - vec3<f32>(0.5)) *
        owner_half_extent_km * 2.0;
    let analytic_fibre_count = u32(clamp(round(
        topology.macro_element_count * 0.45 + 3.0), 6.0,
        f32(${CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_MAX_FIBRES})));
    let packed_fibre_range = cloud_morphology_fibratus_owner_range(
        parent_owner_index);
    let fibre_count = select(
        analytic_fibre_count,
        packed_fibre_range.y,
        packed_fibre_range.y > 0u);
    var fibre_union = 0.0;

    for (var fibre_index = 0u;
        fibre_index < ${CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_MAX_FIBRES}u;
        fibre_index += 1u) {
        if (fibre_index >= fibre_count) { break; }
        let descriptor = cloud_morphology_fibratus_descriptor_for(
            fibre_index,
            parent_owner_index,
            topology,
            owner_half_extent_km,
            deterministic_seeds);
        let is_daughter = descriptor.metadata.y > 0.5;
        let start = descriptor.metadata.z;
        let end = descriptor.metadata.w;
        let source_x_km = descriptor.trajectory.x;
        let source_y_km = descriptor.trajectory.y;
        let terminal_x_km = descriptor.trajectory.z;
        let terminal_y_km = descriptor.trajectory.w;
        let source_cross_radius_km = descriptor.radii_hash23.x;
        let source_vertical_radius_km = descriptor.radii_hash23.y;
        let h2 = descriptor.radii_hash23.z;
        let h3 = descriptor.radii_hash23.w;
        let h4 = descriptor.hashes4567.x;
        let h5 = descriptor.hashes4567.y;
        let h6 = descriptor.hashes4567.z;
        let h7 = descriptor.hashes4567.w;
        let h8 = descriptor.taper_lane.x;
        let terminal_width_ratio = descriptor.taper_lane.y;
        let terminal_density_ratio = descriptor.taper_lane.z;
        let span = max(0.16, end - start);
        let amount = (canonical.z - start) / span;
        // These are the exact zero intervals of the longitudinal smoothsteps
        // below. The former wider guard still paid for provably empty fibres.
        if (amount <= -0.025 || amount >= 1.025) { continue; }
        let t = clamp(amount, 0.0, 1.0);
        // Quintic smoothstep has zero first and second derivative at both
        // endpoints, so a finite sweep remains C2 when extended by its source
        // and terminal values.
        let c2_amount = t * t * t *
            (t * (t * 6.0 - 15.0) + 10.0);
        let along_span_km = 2.0 * major_radius_km * span;

        // The filter is constant along one member. The maximum possible width
        // pulse (1.21), minimum vertical divisor (0.86), and slightly inflated
        // 1.421 kernel edge below form a conservative local-section cull.
        let intrinsic_filter_km = max(
            0.003,
            min(source_cross_radius_km, source_vertical_radius_km) * 0.16);
        let filter_radius_km = max(
            intrinsic_filter_km, requested_filter_radius_km);
        let conservative_outer_radius = 1.421;
        let bow = 4.0 * t * (1.0 - t);
        let centre_x_km = mix(
            source_x_km, terminal_x_km, c2_amount) +
            mix(-0.085, 0.085, h4) * minor_radius_km * bow;
        let centre_y_km = mix(
            source_y_km, terminal_y_km, c2_amount) +
            mix(-0.040, 0.055, h5) * depth_km * bow;

        let c2_derivative = 30.0 * t * t * (t - 1.0) * (t - 1.0);
        let bow_derivative = 4.0 * (1.0 - 2.0 * t);
        let tangent_cross_per_downwind = (
            (terminal_x_km - source_x_km) * c2_derivative +
            mix(-0.085, 0.085, h4) * minor_radius_km * bow_derivative) /
            max(1e-6, along_span_km);
        let tangent_vertical_per_downwind = (
            (terminal_y_km - source_y_km) * c2_derivative +
            mix(-0.040, 0.055, h5) * depth_km * bow_derivative) /
            max(1e-6, along_span_km);
        let half_step_km = max(0.0, ray_step_length_km) * 0.5;
        let swept_cross_km = half_step_km * (
            ray_direction_owner_local.x - tangent_cross_per_downwind *
                ray_direction_owner_local.z);
        let swept_vertical_km = half_step_km * (
            ray_direction_owner_local.y - tangent_vertical_per_downwind *
                ray_direction_owner_local.z);
        let delta_cross_km = physical_position_km.x - centre_x_km;
        let delta_vertical_km = physical_position_km.y - centre_y_km;
        // At this canonical z only the local C2 cross-section can contribute.
        // The coordinate projections of x^T covariance^-1 x <= R^2 are
        // exactly R^2 * covariance.xx/yy.  The maximum physical radii below
        // therefore reject conservatively without the former whole-fibre
        // AABB or its arbitrary tangent-slope expansion.
        let maximum_covariance_cross =
            source_cross_radius_km * source_cross_radius_km * 1.21 * 1.21 +
            filter_radius_km * filter_radius_km +
            swept_cross_km * swept_cross_km;
        let maximum_covariance_vertical =
            source_vertical_radius_km * source_vertical_radius_km /
                (0.86 * 0.86) +
            filter_radius_km * filter_radius_km +
            swept_vertical_km * swept_vertical_km;
        if (delta_cross_km * delta_cross_km >
                conservative_outer_radius * conservative_outer_radius *
                    maximum_covariance_cross ||
            delta_vertical_km * delta_vertical_km >
                conservative_outer_radius * conservative_outer_radius *
                    maximum_covariance_vertical) { continue; }

        let taper_amount = pow(t, mix(0.76, 1.28, h6));
        let width_pulse = max(
            0.78,
            1.0 + (h8 - 0.5) * 0.30 * bow +
                (h4 - 0.5) * 0.12 * t);
        let cross_radius_km = source_cross_radius_km *
            mix(1.0, terminal_width_ratio, taper_amount) * width_pulse;
        let vertical_radius_km = source_vertical_radius_km *
            mix(1.0, terminal_width_ratio, taper_amount) /
            max(0.86, width_pulse);

        // Integrate a compact pixel cone and one finite ray stratum against
        // the local fibre tangent. The stratum is a rank-one sweep, not an
        // isotropic blur: retaining its covariance prevents a diagonal ray
        // from creating a fat circular stamp while eliminating point-hit/miss
        // dashes. The determinant ratio preserves integrated condensate.
        let covariance_cross = cross_radius_km * cross_radius_km +
            filter_radius_km * filter_radius_km +
            swept_cross_km * swept_cross_km;
        let covariance_vertical = vertical_radius_km * vertical_radius_km +
            filter_radius_km * filter_radius_km +
            swept_vertical_km * swept_vertical_km;
        let covariance_cross_vertical =
            swept_cross_km * swept_vertical_km;
        let covariance_determinant = max(1e-12,
            covariance_cross * covariance_vertical -
            covariance_cross_vertical * covariance_cross_vertical);
        let area_preservation = saturate(
            cross_radius_km * vertical_radius_km /
            max(1e-6, sqrt(covariance_determinant)));
        let elliptical_distance_squared = max(0.0, (
            covariance_vertical * delta_cross_km * delta_cross_km -
            2.0 * covariance_cross_vertical * delta_cross_km *
                delta_vertical_km +
            covariance_cross * delta_vertical_km * delta_vertical_km) /
            covariance_determinant);
        // Squared distance proves the common miss before the expensive root.
        // The inflated threshold leaves a strict f32 safety band around the
        // actual 1.42 smoothstep support, so this cannot discard a nonzero
        // cross-section.
        if (elliptical_distance_squared >
            conservative_outer_radius * conservative_outer_radius) {
            continue;
        }
        let elliptical_distance = sqrt(elliptical_distance_squared);
        let cross_section = (1.0 - smoothstep(
            0.48, 1.42, elliptical_distance)) * area_preservation;
        if (cross_section <= 0.0) { continue; }
        let longitudinal = smoothstep(-0.025, 0.065, amount) *
            (1.0 - smoothstep(0.87, 1.025, amount));
        let density_taper = mix(
            1.0, terminal_density_ratio,
            pow(t, mix(0.82, 1.34, h2)));

        // Sparse sublimation gaps are finite events, not periodic noise. Most
        // primary fibres stay connected; short daughters break more readily.
        let gap_centre = mix(0.42, 0.72, h6);
        let gap_half_width = mix(0.018, 0.052, h7);
        let gap_window = smoothstep(
            gap_centre - gap_half_width, gap_centre, t) *
            (1.0 - smoothstep(
                gap_centre, gap_centre + gap_half_width, t));
        let has_gap = is_daughter || h8 < 0.26;
        let gap_strength = select(
            0.0, mix(0.52, 0.90, h8), has_gap);
        let continuity = 1.0 - gap_window * gap_strength;
        let fibre_density = saturate(
            cross_section * longitudinal * density_taper * continuity);
        fibre_union = 1.0 -
            (1.0 - fibre_union) * (1.0 - fibre_density);
    }

    let concentrated_fibres = support * macro_envelope * saturate(
        fibre_union * mix(0.74, 1.08, sqrt(saturate(macro_density))));
    // A very low-density sublimating ice residue prevents mathematical holes
    // from popping while remaining far below the broad-ribbon optical depth.
    return saturate(max(residual_ice, concentrated_fibres));
}

fn cloud_morphology_curl_warp(
    position: vec3<f32>,
    shape0: vec4<f32>,
    seed_phase: f32,
) -> vec3<f32> {
    var result = position;
    let phase = position.z * shape0.z * 3.14159265359 + seed_phase;
    let radial = max(0.0, 1.0 - length(position.xy));
    result.x -= sin(phase) * shape0.x * 0.22 * radial * shape0.w;
    result.y -= cos(phase + shape0.y) * abs(shape0.y) * 0.16 *
        radial * shape0.w;
    return result;
}

fn cloud_morphology_wave_warp(
    position: vec3<f32>,
    shape0: vec4<f32>,
    shape1: vec4<f32>,
    seed_phase: f32,
) -> vec3<f32> {
    var result = position;
    let drift = 1.0 + shape0.w * position.z;
    let phase = position.x * 6.28318530718 * drift + shape0.z + seed_phase;
    let wave = sin(phase) + sin(phase * 1.73 + position.z * 2.1) * shape0.y;
    result.y -= wave * shape0.x * (1.0 + shape1.x * sign(wave));
    return result;
}

fn cloud_morphology_underside_warp(
    position: vec3<f32>,
    shape0: vec4<f32>,
    seed_phase: f32,
) -> vec3<f32> {
    var result = position;
    let wave_a = sin(position.x * 5.3 + position.z * 2.1 + seed_phase);
    let wave_b = sin(position.x * 11.7 - position.z * 7.9 + seed_phase * 1.37);
    let cusp = sign(wave_a) * pow(abs(wave_a), mix(1.0, 0.42, shape0.w));
    let displacement = (cusp + wave_b * (1.0 - shape0.y) * 0.38) * shape0.z;
    result.y -= displacement * (1.0 - smoothstep(-0.75, 0.25, position.y));
    return result;
}

fn cloud_morphology_apply_record(
    evaluation: CloudMorphologyEvaluation,
    record: CloudMorphologyModifierRecord,
    world_position_km: vec3<f32>,
) -> CloudMorphologyEvaluation {
    var result = evaluation;
    let p = cloud_morphology_local_position(record, world_position_km);
    let envelope = cloud_morphology_finite_envelope(p) * record.identity.z;
    if (envelope <= 0.0) { return result; }
    let a = record.shape0;
    let b = record.shape1;
    let seed = cloud_morphology_seed(record);
    let seed_phase = cloud_morphology_hash_cell(0, 0, 0, seed) * 6.28318530718;
    let operation = cloud_morphology_operator_code(record);
    var density = 0.0;

    switch operation {
        case CLOUD_MORPHOLOGY_OP_WARP_CURL: {
            let base_local = cloud_morphology_local_position(
                record, result.base_position_km);
            let placement_local = cloud_morphology_local_position(
                record, result.placement_position_km);
            result.base_position_km = cloud_morphology_world_position(record,
                cloud_morphology_curl_warp(base_local, a, seed_phase));
            result.placement_position_km = cloud_morphology_world_position(record,
                cloud_morphology_curl_warp(placement_local, a, seed_phase));
        }
        case CLOUD_MORPHOLOGY_OP_ADD_SPINE_RIBS: {
            let spine = cloud_morphology_soft_inside(
                length(p.xy) - max(0.025, a.x), 0.025);
            let rib_cell = i32(floor((p.z + 1.0) * 8.0));
            let rib_phase = fract((p.z + 1.0) * 8.0) - 0.5;
            let missing = select(1.0, 0.0,
                cloud_morphology_hash_cell(rib_cell, 2, 0, seed) < a.w);
            let asymmetry = mix(1.0 - b.x, 1.0 + b.x,
                cloud_morphology_hash_cell(rib_cell, 3, 0, seed));
            let rib = cloud_morphology_soft_inside(abs(rib_phase) - 0.09, 0.035) *
                cloud_morphology_soft_inside(abs(p.y) - 0.08, 0.04) *
                cloud_morphology_soft_inside(abs(p.x) - a.y * asymmetry, 0.06) * missing;
            density = max(spine, rib * a.z);
        }
        case CLOUD_MORPHOLOGY_OP_WARP_WAVE: {
            let base_local = cloud_morphology_local_position(
                record, result.base_position_km);
            let placement_local = cloud_morphology_local_position(
                record, result.placement_position_km);
            result.base_position_km = cloud_morphology_world_position(record,
                cloud_morphology_wave_warp(base_local, a, b, seed_phase));
            result.placement_position_km = cloud_morphology_world_position(record,
                cloud_morphology_wave_warp(placement_local, a, b, seed_phase));
        }
        case CLOUD_MORPHOLOGY_OP_PLACE_WORLD_BANDS: {
            let crosswind = p.x + p.z * a.x;
            let coordinate = crosswind * (3.5 + a.z * 3.0) + seed_phase / 3.14159265359;
            let interval = abs(fract(coordinate) - 0.5);
            let width = mix(0.16, 0.34, a.y);
            let bands = 1.0 - smoothstep(width, width + 0.08, interval);
            let end_erosion = 1.0 - smoothstep(1.0 - a.w, 1.0, abs(p.z));
            result.base_coverage *= mix(1.0, bands * end_erosion, envelope);
        }
        case CLOUD_MORPHOLOGY_OP_SUBTRACT_LACUNAE: {
            let topology_frequency = clamp(
                sqrt(max(4.0, result.logical_topology.macro_element_count)) * 0.72,
                2.4, 5.4);
            let cell = cloud_morphology_cellular(p, seed, topology_frequency);
            let radius = mix(0.26, 0.43, a.y);
            let hole = (1.0 - smoothstep(radius, radius + 0.1 + a.w, cell)) *
                cloud_morphology_soft_inside(abs(p.y) - a.x, 0.08);
            result.subtractive_density = max(result.subtractive_density, hole * envelope);
            return result;
        }
        case CLOUD_MORPHOLOGY_OP_CLONE_LAYER: {
            let rotated = cloud_morphology_rotate2(vec2<f32>(p.x - a.y, p.z), -a.z);
            let placed = vec3<f32>(rotated.x, p.y - a.x, rotated.y);
            result.placement_position_km = cloud_morphology_world_position(record, placed);
            result.placement_weight = max(result.placement_weight,
                envelope * (1.0 - b.x * 0.5));
        }
        case CLOUD_MORPHOLOGY_OP_REMAP_EXTINCTION: {
            result.target_optical_depth = a.x;
            result.opaque_area = vec2<f32>(a.y, select(1.0, a.z, a.z > 0.0));
            result.direct_disc_transmission = vec2<f32>(
                a.w, select(1.0, b.x, b.x > 0.0));
            result.optical_weight = max(result.optical_weight, envelope);
        }
        case CLOUD_MORPHOLOGY_OP_SEPARATE_ELEMENTS: {
            let topology_frequency = clamp(
                sqrt(max(4.0, result.logical_topology.macro_element_count)) * 0.78,
                2.6, 6.0);
            let cell = cloud_morphology_cellular(p, seed, topology_frequency);
            let radius = mix(0.3, 0.49, a.y);
            let elements = 1.0 - smoothstep(radius, radius + 0.08 + a.z, cell);
            // A connected atlas exemplar may contain optical gaps, but an
            // orthogonal variety must not silently sever its causal base.
            let connected = select(0.0, 1.0,
                result.logical_topology.connectivity == 0u ||
                result.logical_topology.connectivity == 3u ||
                result.logical_topology.connectivity == 5u);
            let causal_bridge = connected *
                cloud_morphology_soft_inside(abs(p.y + 0.58) - 0.10, 0.08) *
                (0.38 + 0.22 * (1.0 - abs(p.z)));
            result.base_coverage *= mix(1.0, elements,
                envelope * (0.68 + a.x * 0.32));
            result.base_coverage = max(result.base_coverage,
                causal_bridge * envelope);
        }
        case CLOUD_MORPHOLOGY_OP_ADD_UDDER_LOBES: {
            let cell = cloud_morphology_cellular(p, seed, 3.3);
            let neck = cloud_morphology_soft_inside(abs(p.y) - a.x * 0.24, 0.08);
            let descent = p.y + 0.22 + cell * 0.22 * a.y;
            let lobe = cloud_morphology_ellipsoid(
                vec3<f32>(cell * 0.78, descent, p.z * 0.12),
                vec3<f32>(0.56, max(0.16, a.z), 0.7));
            density = max(neck * (1.0 - smoothstep(0.5, 0.9, cell)),
                lobe * (1.0 - b.x * smoothstep(0.35, 1.0, -p.y)));
        }
        case CLOUD_MORPHOLOGY_OP_ADD_KH_BILLOW: {
            let cell = fract((p.x + 1.0) * 3.5 + seed_phase / 3.14159265359) - 0.5;
            let angle = cell * 4.86946861306 * a.y;
            let radius = 0.24 + 0.06 * sin(seed_phase);
            let ring = abs(length(vec2<f32>(cell, p.y - 0.12)) - radius);
            let curl = cloud_morphology_soft_inside(ring - 0.075, 0.035) *
                cloud_morphology_soft_inside(abs(p.z) - 0.62, 0.08) *
                (0.68 + 0.32 * cos(angle));
            density = curl * (1.0 - b.x * smoothstep(0.55, 1.0, p.x));
        }
        case CLOUD_MORPHOLOGY_OP_DISPLACE_UNDERSIDE: {
            let base_local = cloud_morphology_local_position(
                record, result.base_position_km);
            let placement_local = cloud_morphology_local_position(
                record, result.placement_position_km);
            result.base_position_km = cloud_morphology_world_position(record,
                cloud_morphology_underside_warp(base_local, a, seed_phase));
            result.placement_position_km = cloud_morphology_world_position(record,
                cloud_morphology_underside_warp(placement_local, a, seed_phase));
        }
        case CLOUD_MORPHOLOGY_OP_SUBTRACT_CAVUM: {
            let rotated = cloud_morphology_rotate2(p.xz, seed_phase * 0.17);
            let radial = length(vec2<f32>(rotated.x / (1.0 + a.x),
                rotated.y * (1.0 + a.x)));
            let front = radial + a.w * rotated.x;
            let hole = (1.0 - smoothstep(0.42, 0.42 + max(0.04, a.z), front)) *
                cloud_morphology_soft_inside(abs(p.y) - a.y, 0.06);
            result.subtractive_density = max(result.subtractive_density, hole * envelope);
            return result;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_GUST_FRONT: {
            let curved_y = p.y - a.w * p.x * p.x;
            let wedge = cloud_morphology_soft_inside(max(abs(p.x) - 0.94,
                max(curved_y + 0.12, abs(p.z + a.y) - 0.34)), 0.08);
            let roll = cloud_morphology_soft_inside(
                length(vec2<f32>(curved_y + 0.18, p.z + 0.42)) - 0.2, 0.06);
            density = mix(wedge, max(wedge * 0.7, roll), a.x) *
                (0.82 + 0.18 * sin(p.x * 19.0 + seed_phase) * a.z);
        }
        case CLOUD_MORPHOLOGY_OP_ADD_VORTEX_FUNNEL: {
            let down = clamp(-p.y, 0.0, 1.0);
            let center_x = sin(down * 3.14159265359 + seed_phase) * a.z * down +
                sin(down * 17.0 + seed_phase) * b.x;
            let radius = max(0.035, a.x * mix(1.0, a.y, down));
            density = cloud_morphology_soft_inside(length(p.xz - vec2<f32>(center_x, 0.0)) -
                radius, 0.035) *
                cloud_morphology_soft_inside(abs(p.y + 0.5) - 0.52, 0.05) * a.w;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_WALL_LOWERING: {
            let tilted_y = p.y - p.x * tan(a.y);
            let bias_x = p.x - (a.z - 0.5) * 0.5;
            density = cloud_morphology_ellipsoid(
                vec3<f32>(bias_x, tilted_y + 0.3, p.z),
                vec3<f32>(0.72, max(0.18, a.x * 1.6), 0.64));
            density *= 0.88 + 0.12 * sin((p.x + p.z) * 15.0 + seed_phase) * b.x;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_TAIL_CONNECTOR: {
            let along = clamp((p.x + 1.0) * 0.5, 0.0, 1.0);
            let center_y = sin(along * 3.14159265359) * a.w * 0.25 +
                a.z * along * 0.08;
            let width = mix(0.34, 0.12, along * a.y);
            density = cloud_morphology_soft_inside(
                length(vec2<f32>(p.y - center_y, p.z)) - width, 0.06) *
                cloud_morphology_soft_inside(abs(p.x) - 0.96, 0.05);
        }
        case CLOUD_MORPHOLOGY_OP_REUSE_BASE_MACRO: {
            result.reuse_macro_code = u32(round(a.x));
            result.reuse_weight = max(result.reuse_weight, envelope);
            return result;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_CAP_SHELL: {
            let radius = length(p.xz);
            let dome = p.y - a.y + radius * radius * mix(0.35, 0.85, a.z);
            density = cloud_morphology_soft_inside(
                abs(dome) - max(0.018, a.x), 0.025) *
                (1.0 - smoothstep(0.72, 0.98, radius));
            density *= 1.0 - a.w * cloud_morphology_soft_inside(radius - 0.2, 0.05);
        }
        case CLOUD_MORPHOLOGY_OP_ADD_VEIL_SHEET: {
            let tilted = p.y - tan(b.x) * p.x;
            let sheet = cloud_morphology_soft_inside(
                abs(tilted) - max(0.012, a.x), 0.025);
            let edge = 1.0 - smoothstep(1.0 - a.y, 1.0,
                max(abs(p.x), abs(p.z)));
            density = sheet * edge;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_FRAGMENTS: {
            let topology_frequency = clamp(
                sqrt(max(4.0, result.logical_topology.macro_element_count)) * 0.82,
                2.8, 6.4);
            let cell = cloud_morphology_cellular(p, seed, topology_frequency);
            let shear_axis = mix(p.x - p.z, p.x + p.z,
                result.logical_topology.shear_coupling);
            let irregular = cell + sin(shear_axis * 17.0 + seed_phase) * a.y * 0.13;
            let fragments = 1.0 - smoothstep(0.3 + a.z * 0.12,
                0.4 + a.z * 0.18, irregular);
            density = fragments * cloud_morphology_soft_inside(abs(p.y +
                (cloud_morphology_hash_cell(i32(floor(p.x * 4.0)), 4,
                    i32(floor(p.z * 4.0)), seed) - 0.5) * a.w) - 0.42, 0.08);
        }
        case CLOUD_MORPHOLOGY_OP_ADD_INFLOW_BAND: {
            let rotated = cloud_morphology_rotate2(p.xz, a.x);
            let terminal = 1.0 - smoothstep(1.0 - a.z - 0.08, 1.0 - a.z, rotated.x);
            let broad = select(1.0, 1.6,
                cloud_morphology_hash_cell(2, 5, 7, seed) < a.w);
            density = cloud_morphology_soft_inside(
                abs(rotated.y + sin(rotated.x * 3.14159265359) * 0.08) -
                    0.16 * broad, 0.06) *
                cloud_morphology_soft_inside(abs(p.y) - 0.28, 0.06) * terminal;
            result.placement_weight = max(result.placement_weight, density * envelope);
            return result;
        }
        case CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET: {
            let wavelength_km = max(0.02, a.z / 1000.0);
            let normalized_wave = wavelength_km / max(0.01, record.axis_u.w * 2.0);
            let wave_number = 6.28318530718 / max(0.025, normalized_wave);
            let primary = sin(p.x * wave_number + seed_phase);
            let anisotropy = sqrt(max(1.0, b.x));
            let secondary = sin((p.x * 0.71 + p.z * 0.91 / anisotropy) *
                wave_number * 1.83 + seed_phase * 1.31) * a.w;
            let kh_ripple = sin((p.x * 0.2 - p.z) * wave_number * 4.1 +
                seed_phase * 0.73) * b.y * 0.12;
            let turbulent_ripple = sin((p.x * 7.3 + p.z * 5.7) * wave_number +
                seed_phase * 2.17) * b.z * 0.08;
            let amplitude = a.y / max(1.0, record.axis_v.w * 1000.0);
            let sheet_center = (primary + secondary + kh_ripple + turbulent_ripple) * amplitude;
            let half_thickness = max(1e-4, a.x /
                max(1.0, record.axis_v.w * 2000.0));
            density = cloud_morphology_soft_inside(
                abs(p.y - sheet_center) - half_thickness, half_thickness * 0.8);
            density *= 0.78 + 0.22 * sin(p.z * wave_number * 0.37 + seed_phase) * b.y;
            result.material_profile_code = u32(round(b.w));
            result.material_weight = max(result.material_weight, density * envelope);
        }
        default: { return result; }
    }

    result.additive_density = max(result.additive_density,
        clamp(density, 0.0, 1.0) * envelope);
    return result;
}

fn cloud_morphology_evaluate_owner(
    parent_owner_index: u32,
    world_position_km: vec3<f32>,
) -> CloudMorphologyEvaluation {
    var result = cloud_morphology_initial_evaluation(world_position_km);
    result.logical_topology = cloud_morphology_owner_topology(parent_owner_index);
    let range = cloud_morphology_owner_range(parent_owner_index);
    for (var local_index = 0u; local_index < 8u; local_index++) {
        if (local_index >= range.y) { break; }
        let record = cloud_morphology_load_record(range.x + local_index);
        result = cloud_morphology_apply_record(result, record, world_position_km);
    }
    return result;
}

fn cloud_morphology_signed_density(
    evaluation: CloudMorphologyEvaluation,
) -> f32 {
    return evaluation.additive_density - evaluation.subtractive_density;
}

fn cloud_morphology_compose_density(
    evaluation: CloudMorphologyEvaluation,
    base_density: f32,
    placement_density: f32,
    reuse_density: f32,
) -> f32 {
    let base = clamp(base_density * evaluation.base_coverage, 0.0, 1.0);
    let placed = clamp(placement_density * evaluation.placement_weight, 0.0, 1.0);
    let added = clamp(evaluation.additive_density, 0.0, 1.0);
    let reused = clamp(reuse_density * evaluation.reuse_weight, 0.0, 1.0);
    let density_union = 1.0 -
        (1.0 - base) * (1.0 - placed) * (1.0 - added) * (1.0 - reused);
    return clamp(density_union *
        (1.0 - clamp(evaluation.subtractive_density, 0.0, 1.0)), 0.0, 1.0);
}

// Records are already sorted on the CPU as:
// placement -> warp -> subtract -> smooth-union -> reuse -> optical.
// Every density caller must iterate exactly owner_range.y records in that
// stored order. Lighting and view transport must call the identical operator
// evaluator; evaluating modifiers only in final color is physically invalid.
`;
